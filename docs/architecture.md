# HSR Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      HSR ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  FRONTEND (Next.js / React)                                  │
│  ├── Wallet Connect (MetaMask, etc.)                        │
│  ├── Domain search & browsing                               │
│  ├── Registration flow                                      │
│  ├── User dashboard (manage records, view NFTs)             │
│  └── AI art gallery / preview                               │
│                                                              │
│  API LAYER (Node.js / Express)                              │
│  ├── /api/v1/tlds         — List available TLDs             │
│  ├── /api/v1/search       — Search, check availability      │
│  ├── /api/v1/register     — Complete registration (escrow)  │
│  ├── /api/v1/dns          — Manage DNS records              │
│  ├── /api/v1/resolve      — Name resolution endpoint        │
│  ├── /api/v1/nft          — NFT metadata, generation, IPFS  │
│  ├── /api/v1/marketplace  — Listings, sales, offers         │
│  ├── /api/v1/admin        — Admin panel endpoints           │
│  ├── /api/v2/staking      — TLD staking via FDC             │
│  ├── /api/v2/commit       — Commit-reveal SLD registration  │
│  ├── /api/v2/renew        — Domain renewal quotes           │
│  ├── /api/v2/my-domains   — User's V2 domain portfolio      │
│  └── /api/v2/metadata     — ERC-721 tokenURI endpoints      │
│                                                              │
│  DATA LAYER                                                  │
│  ├── PostgreSQL (domain records, users, transactions)       │
│  ├── Redis (caching, rate limiting, FTSO prices)            │
│  └── IPFS/Pinata (NFT images, metadata JSON)               │
│                                                              │
│  BLOCKCHAIN LAYER (Flare Network)                           │
│  ├── V1 Legacy (Hardhat):                                   │
│  │   ├── SubdomainNFT (ERC-721) — NFT ownership             │
│  │   ├── SubdomainEscrow — Registration & payment logic     │
│  │   ├── HSRResolver — On-chain name resolution             │
│  │   ├── PriceOracle — FTSO price feed integration          │
│  │   └── SubdomainMarketplace — Secondary sales             │
│  └── V2 TLD Staking (Foundry, 13 contracts):               │
│      ├── HsrTld (ERC-721 UUPS) — TLD ownership NFTs        │
│      ├── HsrSld (ERC-721 UUPS) — SLD ownership NFTs        │
│      ├── TldClaimManager — FDC attestation staking          │
│      ├── SldRegistrationManager — Commit-reveal reg         │
│      ├── PaymentManagerV2 — Per-TLD fees + FTSO pricing     │
│      ├── FtsoOracle — FTSO v2 price wrapper                 │
│      ├── SldCommitIntent — Front-running protection         │
│      └── DefaultResolver — V2 on-chain resolution           │
│                                                              │
│  DNS LAYER                                                   │
│  ├── volume-resolver (BIND 9.20 + dnsdist + root_proxy)    │
│  ├── hsd (Handshake full node) → TLD + recursive resolution│
│  ├── DoH endpoint (dns.halcyon-names.io via Caddy)          │
│  └── Cloudflare (CDN, DDoS protection)                      │
│                                                              │
│  AI ART LAYER                                                │
│  ├── ComfyUI (2x RTX 3060 12GB + 2x RTX 3080 10GB across 4 workstations)                  │
│  ├── Stable Diffusion models (SDXL, Flux, etc.)            │
│  └── Per-TLD themed prompt templates                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Registration Flow

```
1. User selects subdomain (e.g., "wallet.cryptofans")
2. Frontend checks availability via API
3. API queries PostgreSQL — is it taken?
4. If available → show price (FTSO oracle → FLR amount)
5. User connects wallet, approves transaction
6. V1 path: SubdomainEscrow receives FLR, mints ERC-721 NFT
   V2 path: Commit-reveal via SldCommitIntent + SldRegistrationManager
7. Backend event listener catches event (contractListener.js or stakingListener.js)
8. Backend does:
   a. Update DNS zone in volume-resolver (BindZoneService + BIND reload)
   b. Queue AI art generation via ComfyUI (4 GPUs across 2 machines)
   c. Upload generated image to IPFS via Pinata
   d. Update NFT tokenURI with IPFS metadata CID
9. User sees subdomain live + NFT in dashboard
```

## Revenue Flow

```
Primary Sale (e.g., 100 FLR):
├── Artist share:  70% (70 FLR)  — if artist-created art
├── HSR platform:  25% (25 FLR)
└── HNS reserve:    5% (5 FLR)   — for TLD renewal costs

Secondary Sale (marketplace resale):
├── Artist royalty: 2.5%
├── HSR royalty:    2.5%
└── Seller:        95%
```

## Scaling Plan

Current: Single server (localai, 10.0.0.39) with local PostgreSQL, volume-resolver (Docker), hsd, Caddy (DoH/HTTPS). GPU rendering distributed across m3060 (2x RTX 3060) and mosana1 (2x RTX 3080).
Planned: AWS ECS Fargate (API), RDS PostgreSQL (Multi-AZ), ElastiCache Redis, separate render station for AI art

## Networks

- **Testnet:** Coston2 (current development)
- **Mainnet:** Flare (launch target)
- **Future:** XRP Ledger payment support (research phase)
