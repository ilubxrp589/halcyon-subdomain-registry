# HSR — Backend Services

## Service Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     HSR Backend Stack                        │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │  HSR API     │  │  Event      │  │  Artwork Worker  │   │
│  │  Server      │  │  Listener   │  │  (GPU stations)  │   │
│  │  (Express)   │  │  (ethers.js)│  │                  │   │
│  └──────┬───────┘  └──────┬──────┘  └────────┬─────────┘   │
│         │                 │                   │             │
│         ▼                 ▼                   ▼             │
│  ┌─────────────────────────────────────────────────┐       │
│  │              PostgreSQL Database                 │       │
│  │  - Domain registry cache                        │       │
│  │  - Artwork queue and status                     │       │
│  │  - User data                                    │       │
│  │  - Analytics                                    │       │
│  └─────────────────────────────────────────────────┘       │
│         │                 │                   │             │
│         ▼                 ▼                   ▼             │
│  ┌──────────┐     ┌──────────┐      ┌──────────────┐      │
│  │  Redis   │     │  IPFS    │      │  HSD Node    │      │
│  │  Queue   │     │  Node    │      │  (Handshake) │      │
│  └──────────┘     └──────────┘      └──────────────┘      │
│                                                             │
│  ┌─────────────────────────────────────────────────┐       │
│  │            FDC Keeper Bot (Phase 2)              │       │
│  │  - Monitors pending FDC attestation requests     │       │
│  │  - Retrieves proofs from DA Layer               │       │
│  │  - Submits proofs to TldClaimManager            │       │
│  └─────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## 1. HSR API Server

Main backend API serving the frontend and external integrations.

### Tech Stack
```
Runtime:    Node.js 20+
Framework:  Express.js or Fastify
ORM:        Prisma or Drizzle
Database:   PostgreSQL 16
Cache:      Redis
Chain:      ethers.js v6 (Flare RPC)
```

### API Endpoints

```
GET  /api/search?q=alice&tld=coolname
  → Check availability, return price, show similar suggestions

GET  /api/tlds
  → List all active TLDs with registration counts, pricing info

GET  /api/tld/:tldLabel
  → TLD details: owner, pricing config, total SLDs, enabled status

GET  /api/sld/:fullName (e.g., alice.coolname)
  → SLD details: owner, expiry, resolver records, artwork status

GET  /api/metadata/:tokenId
  → NFT metadata JSON (for ERC-721 tokenURI)

GET  /api/artwork/:tokenId
  → Artwork status and IPFS URL

GET  /api/resolve/:fullName
  → Resolve domain to address/records (lightweight resolver API)

GET  /api/reverse/:address
  → Reverse lookup: address → primary domain name

GET  /api/price/:tldLabel/:label/:years
  → Price quote in USD and FLR

POST /api/commit
  → Generate commit hash for registration (returns hash + secret)

GET  /api/placeholder/:fullName
  → Generate deterministic placeholder image (SVG)

GET  /api/stats
  → Platform stats: total TLDs, total SLDs, volume, etc.
```

### Database Schema

```sql
-- TLD registry cache (mirrors on-chain data)
CREATE TABLE tlds (
    id SERIAL PRIMARY KEY,
    token_id INTEGER NOT NULL,
    label VARCHAR(255) NOT NULL UNIQUE,
    namehash CHAR(66) NOT NULL UNIQUE,
    owner_address CHAR(42) NOT NULL,
    registration_enabled BOOLEAN DEFAULT FALSE,
    strategy_address CHAR(42),
    resolver_address CHAR(42),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- SLD registry cache
CREATE TABLE slds (
    id SERIAL PRIMARY KEY,
    token_id INTEGER NOT NULL,
    label VARCHAR(255) NOT NULL,
    tld_id INTEGER REFERENCES tlds(id),
    namehash CHAR(66) NOT NULL UNIQUE,
    full_name VARCHAR(512) NOT NULL,
    owner_address CHAR(42) NOT NULL,
    registration_time TIMESTAMP NOT NULL,
    expiry_time TIMESTAMP NOT NULL,
    registration_price_usd_cents INTEGER NOT NULL,
    resolver_address CHAR(42),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_slds_full_name ON slds(full_name);
CREATE INDEX idx_slds_owner ON slds(owner_address);
CREATE INDEX idx_slds_expiry ON slds(expiry_time);

-- Artwork tracking
CREATE TABLE sld_artwork (
    id SERIAL PRIMARY KEY,
    sld_id INTEGER REFERENCES slds(id),
    token_id INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, complete, failed
    prompt TEXT,
    seed BIGINT,
    ipfs_cid VARCHAR(100),
    gpu_worker VARCHAR(50),
    generation_time_ms INTEGER,
    attempts INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE INDEX idx_artwork_status ON sld_artwork(status);
CREATE INDEX idx_artwork_token ON sld_artwork(token_id);

-- Pricing configs (cached from chain)
CREATE TABLE tld_pricing (
    tld_id INTEGER REFERENCES tlds(id),
    length_prices INTEGER[10], -- USD cents per character length
    multi_year_discounts INTEGER[10], -- basis points
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (tld_id)
);

-- Premium names
CREATE TABLE premium_names (
    id SERIAL PRIMARY KEY,
    tld_id INTEGER REFERENCES tlds(id),
    label VARCHAR(255) NOT NULL,
    price_usd_cents INTEGER NOT NULL,
    UNIQUE(tld_id, label)
);

-- Reserved names
CREATE TABLE reserved_names (
    id SERIAL PRIMARY KEY,
    tld_id INTEGER REFERENCES tlds(id),
    label VARCHAR(255) NOT NULL,
    reserved_for CHAR(42) NOT NULL,
    UNIQUE(tld_id, label)
);

-- Analytics
CREATE TABLE registration_events (
    id SERIAL PRIMARY KEY,
    sld_id INTEGER REFERENCES slds(id),
    event_type VARCHAR(20) NOT NULL, -- register, renew, transfer, expire
    tx_hash CHAR(66),
    flr_amount NUMERIC(30, 18),
    usd_amount NUMERIC(10, 2),
    timestamp TIMESTAMP DEFAULT NOW()
);
```

## 2. Event Listener

Monitors Flare blockchain for HSR contract events and syncs to database.

```javascript
// event-listener.js
const { ethers } = require('ethers');

const FLARE_RPC = 'https://flare-api.flare.network/ext/C/rpc';
const provider = new ethers.JsonRpcProvider(FLARE_RPC);

// Contract instances
const hsrTld = new ethers.Contract(TLD_ADDRESS, TLD_ABI, provider);
const hsrSld = new ethers.Contract(SLD_ADDRESS, SLD_ABI, provider);
const claimManager = new ethers.Contract(CLAIM_ADDRESS, CLAIM_ABI, provider);
const registrationManager = new ethers.Contract(REG_ADDRESS, REG_ABI, provider);

// Listen for TLD events
claimManager.on('OperatorMinted', async (tldLabel, tokenId, event) => {
    console.log(`TLD minted: ${tldLabel} (token ${tokenId})`);
    await db.query(
        `INSERT INTO tlds (token_id, label, namehash, owner_address) 
         VALUES ($1, $2, $3, $4)`,
        [tokenId, tldLabel, computeNamehash(tldLabel), event.log.address]
    );
});

claimManager.on('StakeCompleted', async (tldLabel, claimer, tokenId, event) => {
    console.log(`TLD staked: ${tldLabel} by ${claimer}`);
    await db.query(
        `INSERT INTO tlds (token_id, label, namehash, owner_address)
         VALUES ($1, $2, $3, $4)`,
        [tokenId, tldLabel, computeNamehash(tldLabel), claimer]
    );
});

// Listen for SLD events
registrationManager.on('Registered', async (label, tldNamehash, sldNamehash, owner, years, price, event) => {
    console.log(`SLD registered: ${label} under TLD ${tldNamehash}`);
    
    // Insert SLD record
    const tld = await db.query('SELECT * FROM tlds WHERE namehash = $1', [tldNamehash]);
    const fullName = `${label}.${tld.rows[0].label}`;
    const tokenId = await hsrSld.sldNamehashToTokenId(sldNamehash);
    const sldData = await hsrSld.getSldData(tokenId);
    
    const sldRow = await db.query(
        `INSERT INTO slds (token_id, label, tld_id, namehash, full_name, owner_address, 
         registration_time, expiry_time, registration_price_usd_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [tokenId, label, tld.rows[0].id, sldNamehash, fullName, owner,
         new Date(Number(sldData.registrationTime) * 1000),
         new Date(Number(sldData.expiryTime) * 1000),
         price]
    );
    
    // Queue artwork generation
    await artworkQueue.add({
        sldId: sldRow.rows[0].id,
        tokenId: Number(tokenId),
        label,
        tldLabel: tld.rows[0].label
    });
});

registrationManager.on('Renewed', async (sldNamehash, additionalYears, newExpiry, renewedBy) => {
    await db.query(
        `UPDATE slds SET expiry_time = $1, updated_at = NOW() WHERE namehash = $2`,
        [new Date(Number(newExpiry) * 1000), sldNamehash]
    );
});

// Listen for NFT transfers (ownership changes)
hsrTld.on('Transfer', async (from, to, tokenId) => {
    if (from !== ethers.ZeroAddress) { // skip mints
        await db.query(
            `UPDATE tlds SET owner_address = $1, updated_at = NOW() WHERE token_id = $2`,
            [to, tokenId]
        );
    }
});

hsrSld.on('Transfer', async (from, to, tokenId) => {
    if (from !== ethers.ZeroAddress) {
        await db.query(
            `UPDATE slds SET owner_address = $1, updated_at = NOW() WHERE token_id = $2`,
            [to, tokenId]
        );
    }
});

// Handle reconnection
provider.on('error', (error) => {
    console.error('Provider error:', error);
    // Implement reconnection logic
});
```

## 3. HSD Node Service

Runs a Handshake full node for TLD verification.

```bash
# docker-compose.yml (partial)
hsd-node:
  image: handshake/hsd:latest
  ports:
    - "12037:12037"  # REST API
    - "12038:12038"  # Wallet API
    - "44806:44806"  # P2P
  volumes:
    - hsd-data:/root/.hsd
  command: >
    hsd
    --http-host=0.0.0.0
    --api-key=${HSD_API_KEY}
    --index-tx=true
    --index-address=true
    --no-wallet
  environment:
    HSD_API_KEY: ${HSD_API_KEY}
```

### HSD API Wrapper

```javascript
// hsd-client.js
const HSD_URL = process.env.HSD_URL || 'http://localhost:12037';
const HSD_API_KEY = process.env.HSD_API_KEY;

async function getNameInfo(tldLabel) {
    const response = await fetch(`${HSD_URL}/api/name/${tldLabel}`, {
        headers: {
            'Authorization': `Basic ${Buffer.from(`x:${HSD_API_KEY}`).toString('base64')}`
        }
    });
    
    if (!response.ok) throw new Error(`HSD API error: ${response.status}`);
    return response.json();
}

async function verifyTldOwnership(tldLabel, expectedFlareAddress) {
    const nameInfo = await getNameInfo(tldLabel);
    
    // Check state
    if (nameInfo.state !== 'CLOSED') {
        return { valid: false, reason: 'TLD not in CLOSED state' };
    }
    
    if (nameInfo.expired) {
        return { valid: false, reason: 'TLD expired on Handshake' };
    }
    
    // Check TXT records for flr: prefix
    const records = nameInfo.data?.records || [];
    const txtRecords = records.filter(r => r.type === 'TXT');
    
    for (const record of txtRecords) {
        for (const txt of record.txt || []) {
            if (txt.toLowerCase() === `flr:${expectedFlareAddress.toLowerCase()}`) {
                return { valid: true, ownerHash: nameInfo.owner?.hash };
            }
        }
    }
    
    return { valid: false, reason: 'No matching flr: TXT record found' };
}

module.exports = { getNameInfo, verifyTldOwnership };
```

## 4. FDC Keeper Bot (Phase 2)

Monitors pending FDC attestation requests and submits proofs after rounds finalize.

```javascript
// keeper-bot.js
const { ethers } = require('ethers');

const DA_LAYER_URL = process.env.DA_LAYER_URL;
const WALLET_KEY = process.env.KEEPER_PRIVATE_KEY;

const provider = new ethers.JsonRpcProvider(FLARE_RPC);
const wallet = new ethers.Wallet(WALLET_KEY, provider);
const claimManager = new ethers.Contract(CLAIM_ADDRESS, CLAIM_ABI, wallet);

async function checkPendingClaims() {
    // Query pending claims from database or events
    const pendingClaims = await db.query(
        `SELECT * FROM pending_claims WHERE status = 'pending' 
         AND created_at < NOW() - INTERVAL '3 minutes'`  // wait for FDC round
    );
    
    for (const claim of pendingClaims.rows) {
        try {
            // 1. Check if FDC round has finalized
            const roundFinalized = await checkRoundFinalized(claim.fdc_round_id);
            if (!roundFinalized) continue;
            
            // 2. Retrieve proof from DA Layer
            const proof = await getProofFromDALayer(
                claim.fdc_round_id,
                claim.attestation_request_bytes
            );
            
            if (!proof) {
                console.log(`No proof yet for ${claim.tld_label}`);
                continue;
            }
            
            // 3. Submit proof to contract
            const tx = await claimManager.completeStake(
                claim.tld_label,
                proof
            );
            await tx.wait();
            
            // 4. Update database
            await db.query(
                `UPDATE pending_claims SET status = 'completed', tx_hash = $1 WHERE id = $2`,
                [tx.hash, claim.id]
            );
            
            console.log(`Claim completed: ${claim.tld_label}, tx: ${tx.hash}`);
            
        } catch (error) {
            console.error(`Error processing claim ${claim.tld_label}:`, error);
            await db.query(
                `UPDATE pending_claims SET attempts = attempts + 1, 
                 last_error = $1 WHERE id = $2`,
                [error.message, claim.id]
            );
        }
    }
}

async function checkRoundFinalized(roundId) {
    // Protocol ID 200 = FDC
    const relay = new ethers.Contract(RELAY_ADDRESS, RELAY_ABI, provider);
    return await relay.isFinalized(200, roundId);
}

async function getProofFromDALayer(roundId, requestBytes) {
    const response = await fetch(
        `${DA_LAYER_URL}/api/v1/fdc/proof-by-request-round-raw`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                votingRoundId: roundId,
                requestBytes: requestBytes
            })
        }
    );

    if (!response.ok) return null;
    const data = await response.json();
    return data.proof;
}

// Run every 30 seconds
setInterval(checkPendingClaims, 30000);
```

## 5. Infrastructure

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build: ./api
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://hsr:password@postgres:5432/hsr
      - REDIS_URL=redis://redis:6379
      - FLARE_RPC=https://flare-api.flare.network/ext/C/rpc
      - HSD_URL=http://hsd-node:12037
    depends_on:
      - postgres
      - redis
      - hsd-node

  event-listener:
    build: ./event-listener
    environment:
      - DATABASE_URL=postgresql://hsr:password@postgres:5432/hsr
      - REDIS_URL=redis://redis:6379
      - FLARE_RPC=https://flare-api.flare.network/ext/C/rpc
    depends_on:
      - postgres
      - redis

  keeper-bot:
    build: ./keeper-bot
    environment:
      - DATABASE_URL=postgresql://hsr:password@postgres:5432/hsr
      - FLARE_RPC=https://flare-api.flare.network/ext/C/rpc
      - DA_LAYER_URL=https://flr-data-availability.flare.network
      - KEEPER_PRIVATE_KEY=${KEEPER_PRIVATE_KEY}
    depends_on:
      - postgres

  postgres:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: hsr
      POSTGRES_USER: hsr
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  hsd-node:
    image: handshake/hsd:latest
    ports:
      - "12037:12037"
      - "44806:44806"
    volumes:
      - hsd-data:/root/.hsd
    command: >
      hsd --http-host=0.0.0.0
          --api-key=${HSD_API_KEY}
          --index-tx=true
          --no-wallet

  ipfs:
    image: ipfs/kubo:latest
    ports:
      - "5001:5001"
      - "8080:8080"
    volumes:
      - ipfs-data:/data/ipfs

volumes:
  pgdata:
  hsd-data:
  ipfs-data:
```

### Environment Variables

```bash
# .env
DATABASE_URL=postgresql://hsr:password@localhost:5432/hsr
REDIS_URL=redis://localhost:6379

# Flare
FLARE_RPC=https://flare-api.flare.network/ext/C/rpc
COSTON2_RPC=https://coston2-api.flare.network/ext/C/rpc
OPERATOR_PRIVATE_KEY=0x...
KEEPER_PRIVATE_KEY=0x...

# Contract addresses (set after deployment)
TLD_CONTRACT=0x...
SLD_CONTRACT=0x...
CLAIM_MANAGER_CONTRACT=0x...
REGISTRATION_MANAGER_CONTRACT=0x...
PAYMENT_MANAGER_CONTRACT=0x...

# HSD
HSD_URL=http://localhost:12037
HSD_API_KEY=your-api-key

# IPFS
IPFS_API_URL=http://localhost:5001
IPFS_GATEWAY_URL=https://ipfs.halcyon.domains

# FDC (Phase 2)
DA_LAYER_URL=https://flr-data-availability.flare.network
FDC_VERIFIER_URL=https://fdc-verifiers.flare.network

# Stable Diffusion
SD_API_URL=http://gpu-worker:7860
```

## Monitoring & Logging

```
Recommended stack:
  - PM2 for Node.js process management
  - Winston or Pino for structured logging
  - Prometheus + Grafana for metrics (optional)
  - Simple health check endpoints for each service

Health checks:
  GET /health         → API server status
  GET /health/chain   → Flare RPC connectivity
  GET /health/db      → Database connectivity
  GET /health/redis   → Redis connectivity
  GET /health/hsd     → HSD node sync status
  GET /health/queue   → Artwork queue depth
```
