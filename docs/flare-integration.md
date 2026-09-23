# Flare Network Integration

## Overview

HSR uses Flare Network as its settlement and NFT layer. All payments are in FLR, all subdomains are ERC-721 NFTs on Flare, and price feeds come from Flare's native FTSO oracle.

## Smart Contracts

### HSRRegistry (ERC-721)
- Mints subdomain NFTs
- Maps tokenId ↔ SLD (subdomain)
- Standard ERC-721 with EIP-2981 royalties
- Key functions: `mint()`, `burn()`, `ownerOf()`, `tokenURI()`, `sldToToken()`

### HSRArtClaim (Core Logic)
- Handles registration sessions and payment splitting
- Manages claim lifecycle: Initiated → Locked → Completed
- Splits payment between artist, platform, and HNS reserve
- Key functions: `initiateClaim()`, `completeClaim()`, `cancelClaim()`, `verifyPayment()`, `splitPayment()`

### HSRResolver (Name Resolution)
- On-chain resolution of subdomain → Flare address
- Supports forward resolution (name → address) and reverse resolution (address → name)
- Called by the Resolver SDK and directly by wallets/dApps
- Key functions: `resolve()`, `setRecord()`, `setName()` (reverse)

### HSRPriceOracle
- Backend fetches FTSO v2 price data and pushes to the on-chain PriceOracle contract
- On Coston2: use `ContractRegistry.getTestFtsoV2()` — all reads free, no fee required
- On mainnet: use `ContractRegistry.getFtsoV2()` — may require fee via `IFeeCalculator`
- Block-latency feeds update every ~1.8s (per block), anchor feeds every ~90s
- Prefer `getFeedByIdInWei()` for 18-decimal precision (simpler math than `getFeedById()`)
- Caches prices in Redis (5 min TTL) to reduce on-chain calls
- Key function: `getPrice(symbol)`, `convertUsdToToken(usdAmount, symbol)`

### HSRRoyalties (EIP-2981)
- Configures royalty info per token
- Returns royalty recipient and amount for marketplace integrations
- Key function: `royaltyInfo(tokenId, salePrice)`

## Contract Addresses (Coston2)

### V1 Legacy System (Hardhat)
```
Resolver:     0x7C0eA7094Be2caCB238D042b386B11ec24892Fb1
NFT:          0x900C2f2f9a89Cb62Af702611FF77c9F6Ef8dfd38
Escrow:       0xec53e23EFe752FcCaD57a2EF5ef535bABD605B4b
Marketplace:  0xa53e3f6feD1c16557c72aDcB357cbbD4acAF5B92
Oracle:       0x55b92A8C367d408F028914BFCd48D1D4d16960b0
DNSOracle:    0x218EB07c6ef92250DcfE0689a5309B10b96bA3Ff
Treasury:     0xc87Bd36cdeBaa9C632e641F0865192b0DD67bAeD
```

### V2 TLD Staking System (Foundry, Feb 2026)
```
HsrTld:                       0xAEb64890BEBE39E5Fd845D95a81c818E9e039cdE
HsrSld:                       0xA94F9BB2877e969b63e78c148fdc66A61E415110
TldClaimManager:              0xCfF939e85c53622fB6dCcD8FFc8d7408CB3E00c4
SldRegistrationManager:       0x9e680e851492F6135320FDaf64030F1F0Eb35D69
PaymentManagerV2:             0x1137C7218b9e4c895F9A8C2ecaE5E1F4d96a7C2f
FtsoOracle:                   0x08d391c50AE8aa94B031195491Ffa9Df7953200c
SldCommitIntent:              0x1EB1BDF49deF1A32a56Abcce348342bb52c8A91d
DefaultRegistrationStrategy:  0xa42B21dA24734C6f5e24876D0FCcDB1299bC97fE
LabelValidator:               0x5D13FA219deA785754043D63Cae2059b8AE1D213
GlobalRegistrationRules:      0x9bdb1B85e81Ae4239EfdBe7c5e2071a0b6982e92
DefaultResolver:              0xbE845B15524C31dAAe30b3C1004388BAEBE5Bc2F
SldMetadataService:           0x0f9AEC25344239E1356A7966F8E05F281C5daFF5
TldMetadataService:           0xa9C36F500BB6e0B5bC43aFe7160844387F9f8430
```

## V2 TLD Staking Contracts (Foundry)

### HsrTld (ERC-721, UUPS Proxy)
- Represents TLD ownership as NFTs on Flare
- TLD owners stake by proving Handshake ownership via FDC attestation
- Supports metadata service for on-chain tokenURI
- Key functions: `mint()`, `ownerOf()`, `tokenURI()`

### HsrSld (ERC-721, UUPS Proxy)
- Represents subdomain ownership as NFTs
- Time-limited registrations with expiry
- Key functions: `register()`, `renew()`, `ownerOf()`, `expiryOf()`

### TldClaimManager (UUPS Proxy)
- Orchestrates TLD staking via FDC attestation
- Phase 2 implementation (clean, no test functions)
- Verifies Handshake TLD ownership through FDC Web2Json attestation
- Key functions: `requestStake()`, `completeStake()`, `claimStatus()`

### SldRegistrationManager (UUPS Proxy)
- Handles SLD registration with commit-reveal pattern
- Integrates with PaymentManagerV2 for pricing
- Uses DefaultRegistrationStrategy for length-based pricing
- Key functions: `commit()`, `register()`, `renew()`

### PaymentManagerV2
- Processes registration and renewal payments
- Per-TLD fee configuration (platform fee 5% = 500 bps)
- Integrates with FtsoOracle for USD→FLR conversion
- Key functions: `calculatePrice()`, `processPayment()`

### FtsoOracle
- Wrapper around Flare FTSO v2 for price feeds
- Used by PaymentManagerV2 for real-time FLR/USD pricing
- Key function: `getPrice(feedId)`

### SldCommitIntent
- Commit-reveal scheme to prevent SLD front-running
- Users commit a hash, wait, then reveal to register
- Key functions: `commit()`, `canReveal()`, `consumeCommit()`

### DefaultResolver
- On-chain DNS resolution for V2 domains
- Maps domain names to wallet addresses
- Key functions: `resolve()`, `setAddr()`, `addr()`

## Flare Data Connector (FDC) Integration

FDC provides trustless attestation for TLD staking. When a TLD owner wants to stake their Handshake TLD on Flare:

1. Owner sets `flr:0xWalletAddress` as a TXT record on their Handshake TLD
2. Frontend calls FDC verifier API to prepare attestation request
3. FDC network verifies the TXT record via Web2Json attestation type
4. TldClaimManager verifies the FDC proof and mints the TLD NFT
5. FDC Keeper Bot (`fdcKeeper.js`) runs autonomously for FLR supply attestations

### FDC Attestation Flow
```
User sets TXT record on HNS → FDC prepares attestation →
FDC network verifies (2-3 min) → Proof submitted to TldClaimManager →
TLD NFT minted to owner
```

### FDC Keeper Bot
- Background service: `backend/src/services/fdcKeeper.js`
- Handles autonomous FLR supply attestation rounds
- Runs in PM2 as part of backend startup

## Event Listeners

### V1 Event Listener (`contractListener.js`)

Listens for legacy escrow contract events:

- `EscrowCreated` — new registration escrow started
- `EscrowCompleted` — payment confirmed, NFT minted
- `EscrowCancelled` — user cancelled or session expired
- `PaymentSplit` — funds distributed to artist/platform/reserve
- `Transfer` (ERC-721) — NFT ownership changes

When `EscrowCompleted` fires:
1. Insert DNS records into PostgreSQL
2. Queue AI art generation
3. Upload to IPFS
4. Update tokenURI on-chain

### V2 Staking Listener (`stakingListener.js`)

Listens for 16 event types across 5 V2 contracts:

**TldClaimManager events:**
- `StakeRequested` — TLD staking initiated with FDC attestation
- `StakeCompleted` — FDC verification passed, TLD NFT minted
- `StakeFailed` — FDC verification failed
- `StakeRevoked` — TLD stake revoked

**SldRegistrationManager events:**
- `SldRegistered` — New subdomain registered
- `SldRenewed` — Subdomain renewed
- `SldTransferred` — Subdomain ownership transferred
- `CommitSubmitted` — Commit-reveal commit phase

**PaymentManagerV2 events:**
- `PaymentProcessed` — Registration/renewal payment received
- `FeeCollected` — Platform fee collected
- `RefundIssued` — Payment refunded

**HsrTld events:**
- `Transfer` — TLD NFT ownership changes

**HsrSld events:**
- `Transfer` — SLD NFT ownership changes
- `MetadataUpdated` — Token metadata changed

When V2 registration events fire, the listener:
1. Updates `slds_v2` table in PostgreSQL
2. Queues artwork generation via `artworkQueueV2.js`
3. Creates DNS zone records via `pdns.js` (BindZoneService)
4. Logs event in `registration_events_v2` table

## FTSO Price Integration

```typescript
// Example: get current FLR/USD price from FTSO
const price = await priceOracle.getPrice('FLR');
const flrAmount = usdPrice / price.priceUsd;
```

- Cache TTL: 300 seconds (5 min)
- FTSO v2 block-latency feeds: ~1.8s updates; anchor feeds: ~90s updates
- Coston2 uses `TestFtsoV2Interface` (free); mainnet uses `FtsoV2Interface` (may need fee)
- Fallback: CoinGecko API if FTSO unavailable
- Supported tokens: FLR, XRP (future), ETH (future)

## Network Configuration

```
Coston2 Testnet:
  RPC: https://coston2-api.flare.network/ext/C/rpc
  Chain ID: 114
  Explorer: https://coston2-explorer.flare.network

Flare Mainnet (future):
  RPC: https://flare-api.flare.network/ext/C/rpc
  Chain ID: 14
  Explorer: https://flare-explorer.flare.network
```

## Important Notes

- All FLR amounts use 18 decimals (like ETH)
- Use `ethers.parseEther()` and `ethers.formatEther()` for conversion
- Never store private keys in code — use environment variables or secrets manager
- All contract interactions must be wrapped in try/catch with logging
- Wait for at least 1 confirmation before updating database state
