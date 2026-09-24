# HSR System Architecture

This document provides visual architecture diagrams for the Halcyon Subdomain Registry (HSR) system.

## Table of Contents

1. [System Overview](#system-overview)
2. [Component Architecture](#component-architecture)
3. [Registration Flow](#registration-flow)
4. [Smart Contract Architecture](#smart-contract-architecture)
5. [Marketplace Flow](#marketplace-flow)
6. [DNS Resolution Flow](#dns-resolution-flow)
7. [Image Generation Pipeline](#image-generation-pipeline)
8. [Deployment Topology](#deployment-topology)

---

## System Overview

High-level view of the HSR ecosystem showing all major components and their interactions.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  USERS                                                                   │
│  Web Browser ──────► Frontend (Next.js)                                  │
│  Crypto Wallet ────► Web3Modal ──────────► Flare Network (direct tx)     │
└────────────────────────────┬─────────────────────────────────────────────┘
                             │ API calls
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  BACKEND (Node.js / Express)                                             │
│                                                                          │
│  REST API ─► Auth Middleware ─► Service Layer ─► PostgreSQL              │
│                                      │                                   │
│              ┌───────────┬───────────┼───────────┬───────────┐          │
│              ▼           ▼           ▼           ▼           ▼          │
│         Blockchain     DNS       Storage       GPUs      Events         │
└─────────────┬───────────┬───────────┬───────────┬───────────────────────┘
              │           │           │           │
              ▼           ▼           ▼           ▼
┌─────────────────┐ ┌──────────────┐ ┌─────────┐ ┌────────────────────────┐
│ FLARE (Coston2) │ │ DNS          │ │ STORAGE │ │ GPU CLUSTER            │
│                 │ │              │ │         │ │                        │
│ V1 Legacy (7)   │ │ volume-      │ │ IPFS /  │ │ m3060 (192.0.2.97)     │
│  NFT · Escrow   │ │ resolver     │ │ Pinata  │ │  RTX 3060 :8188       │
│  Marketplace    │ │ BIND 9.20    │ │         │ │  RTX 3060 :8189       │
│  Resolver       │ │ + dnsdist    │ │ Image   │ │                        │
│  Oracle · DNS   │ │              │ │ Cache   │ │ mosana1 (192.0.2.67)    │
│  Treasury       │ │ hsd          │ │         │ │  RTX 3080 :8188       │
│                 │ │ (Handshake   │ │         │ │  RTX 3080 :8189       │
│ V2 Staking (13) │ │  full node)  │ │         │ │                        │
│  HsrTld · HsrSld│ │              │ │         │ │ ComfyUI ×4 instances   │
│  ClaimManager   │ │ DoH endpoint │ │         │ │                        │
│  RegManager     │ │ dns.halcyon- │ │         │ │                        │
│  PaymentV2      │ │ names.io     │ │         │ │                        │
│  FtsoOracle     │ │              │ │         │ │                        │
│                 │ └──────────────┘ └─────────┘ └────────────────────────┘
│ FDC (Flare Data │
│  Connector)     │
│  TLD ownership  │
│  attestation    │
└─────────────────┘
```

---

## Component Architecture

Detailed view of the backend service architecture.

```mermaid
flowchart LR
    subgraph API["API Layer"]
        Routes[routes.js]
        Admin[adminRoutes.js]
    end

    subgraph Middleware["Middleware"]
        AuthMW[auth.js]
        Valid[validation.js]
        Audit[auditMiddleware.js]
        Logger[requestLogger.js]
    end

    subgraph Services["Service Layer"]
        HNS_Svc[hns.js<br/>Handshake]
        BIND_Svc[pdns.js<br/>BindZoneService]
        NFT_Svc[nft.js<br/>NFT Metadata]
        FTSO[ftso.js<br/>Price Oracle]
        Listener[contractListener.js<br/>V1 Events]
        StakingL[stakingListener.js<br/>V2 Events ×16]
        FDC[fdcKeeper.js<br/>FDC Attestations]
        Watcher[watcher.js<br/>DNS Propagation]
        PriceSync[priceSync.js<br/>On-chain Sync]
        FluxGPU[fluxMultiGPU.js<br/>Image Gen]
        ComfyMgr[comfyuiManager.js<br/>GPU Manager]
        ImgCache[imageCache.js<br/>Caching]
        Storage[nftStorage.js<br/>IPFS Upload]
        Ollama[ollama.js<br/>LLM Prompts]
    end

    subgraph Data["Data Layer"]
        Pool[(pg Pool)]
        Query[query()]
    end

    Routes --> AuthMW --> Valid --> Services
    Admin --> AuthMW --> Audit --> Services
    Services --> Query --> Pool

    HNS_Svc -.-> HNS_Node[HNS Node :12037/:5349]
    BIND_Svc -.-> BIND_Server[volume-resolver<br/>BIND :5300]
    FluxGPU -.-> ComfyUI_0[ComfyUI :8188]
    FluxGPU -.-> ComfyUI_1[ComfyUI :8189]
    FluxGPU -.-> ComfyUI_2[ComfyUI :8190]
    Storage -.-> Pinata[Pinata API]
    FTSO -.-> Flare[Flare RPC]
    Listener -.-> Flare
```

---

## Registration Flow

Complete domain registration process from search to NFT mint.

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant E as Escrow Contract
    participant N as NFT Contract
    participant H as HNS Node
    participant P as volume-resolver<br/>BIND
    participant I as IPFS

    Note over U,I: Phase 1: Search & Prepare
    U->>F: Search "alice.cryptofans"
    F->>B: GET /search?subdomain=alice&tld=cryptofans
    B->>B: Check availability in DB
    B-->>F: {available: true, price: 500 FLR}

    U->>F: Customize NFT (select theme)
    F->>B: POST /nft/flux-generate-parallel
    B->>B: Generate 3 images on 3 GPUs
    B-->>F: {images: [img1, img2, img3]}

    U->>F: Select image #2
    F->>B: POST /nft/flux-prepare
    B->>I: Upload image to IPFS
    B->>I: Upload metadata to IPFS
    I-->>B: {imageCID, metadataCID}
    B-->>F: {metadataURI: "ipfs://..."}

    Note over U,I: Phase 2: Payment & Escrow
    U->>F: Click "Purchase"
    F->>E: createEscrow(subdomain, tld, metadataURI)
    E->>E: Hold payment in escrow
    E-->>F: EscrowCreated(escrowId: 123)
    F->>B: POST /register/complete
    B->>B: Record pending purchase

    Note over U,I: Phase 3: DNS Setup & Verification
    B->>H: Register subdomain on HNS
    H-->>B: DNS record created
    B->>P: Create DNS zone
    P-->>B: Zone active
    B->>E: verifyDNS(escrowId)
    E->>E: Mark DNS verified

    Note over U,I: Phase 4: NFT Minting
    E->>N: mint(owner, subdomain, tld, metadataURI)
    N->>N: Create NFT token #456
    N-->>E: Transfer complete
    E->>E: Release funds to platform
    E-->>F: PurchaseCompleted(tokenId: 456)

    F-->>U: 🎉 You own alice.cryptofans!
```

---

## Smart Contract Architecture

Relationships between HSR smart contracts.

```mermaid
flowchart TB
    subgraph Core["Core Contracts"]
        NFT[SubdomainNFT<br/>ERC-721]
        Registry[HSRRegistry<br/>Domain Registry]
        Resolver[HSRResolver<br/>ENS-compatible]
    end

    subgraph Commerce["Commerce Contracts"]
        Escrow[SubdomainEscrow<br/>Payment Handling]
        Market[SubdomainMarketplace<br/>Trading]
    end

    subgraph Oracles["Oracle Contracts"]
        Price[PriceOracle<br/>FLR/USD via FTSO]
        DNS[DNSOracle<br/>DNS Verification]
    end

    subgraph External["External"]
        FTSO[Flare FTSO]
        Backend[HSR Backend]
    end

    Escrow -->|"mint()"| NFT
    Escrow -->|"getPrice()"| Price
    Escrow -->|"verifyDNS()"| DNS

    Market -->|"transferFrom()"| NFT
    Market -->|"royaltyInfo()"| NFT

    NFT -->|"register()"| Registry
    NFT -->|"setAddr()"| Resolver

    Registry -->|"owns()"| NFT
    Resolver -->|"tokenId()"| NFT

    Price -.->|"getFtsoPrice()"| FTSO
    DNS -.->|"callback"| Backend
    Backend -.->|"verifyDNS()"| DNS
```

### Contract Addresses (Coston2 Testnet)

#### V1 Legacy System (Hardhat)

| Contract | Address |
|----------|---------|
| SubdomainNFT | `0x900C2f2f9a89Cb62Af702611FF77c9F6Ef8dfd38` |
| SubdomainEscrow | `0xec53e23EFe752FcCaD57a2EF5ef535bABD605B4b` |
| SubdomainMarketplace | `0xa53e3f6feD1c16557c72aDcB357cbbD4acAF5B92` |
| HSRResolver | `0x7C0eA7094Be2caCB238D042b386B11ec24892Fb1` |
| PriceOracle | `0x55b92A8C367d408F028914BFCd48D1D4d16960b0` |
| DNSOracle | `0x218EB07c6ef92250DcfE0689a5309B10b96bA3Ff` |
| CommunityTreasury | `0xc87Bd36cdeBaa9C632e641F0865192b0DD67bAeD` |

#### V2 TLD Staking System (Foundry, Feb 2026)

| Contract | Address |
|----------|---------|
| HsrTld (ERC-721 UUPS) | `0xAEb64890BEBE39E5Fd845D95a81c818E9e039cdE` |
| HsrSld (ERC-721 UUPS) | `0xA94F9BB2877e969b63e78c148fdc66A61E415110` |
| TldClaimManager (UUPS) | `0xCfF939e85c53622fB6dCcD8FFc8d7408CB3E00c4` |
| SldRegistrationManager (UUPS) | `0x9e680e851492F6135320FDaf64030F1F0Eb35D69` |
| PaymentManagerV2 | `0x1137C7218b9e4c895F9A8C2ecaE5E1F4d96a7C2f` |
| FtsoOracle | `0x08d391c50AE8aa94B031195491Ffa9Df7953200c` |
| SldCommitIntent | `0x1EB1BDF49deF1A32a56Abcce348342bb52c8A91d` |
| DefaultRegistrationStrategy | `0xa42B21dA24734C6f5e24876D0FCcDB1299bC97fE` |
| LabelValidator | `0x5D13FA219deA785754043D63Cae2059b8AE1D213` |
| GlobalRegistrationRules | `0x9bdb1B85e81Ae4239EfdBe7c5e2071a0b6982e92` |
| DefaultResolver | `0xbE845B15524C31dAAe30b3C1004388BAEBE5Bc2F` |
| SldMetadataService | `0x0f9AEC25344239E1356A7966F8E05F281C5daFF5` |
| TldMetadataService | `0xa9C36F500BB6e0B5bC43aFe7160844387F9f8430` |

---

## Marketplace Flow

Domain listing, bidding, and sale process.

```mermaid
sequenceDiagram
    autonumber
    participant S as Seller
    participant B as Buyer
    participant F as Frontend
    participant M as Marketplace Contract
    participant N as NFT Contract
    participant BE as Backend

    Note over S,BE: Fixed Price Listing
    S->>F: List "dragon.cryptofans" for 1000 FLR
    S->>N: approve(marketplace, tokenId)
    N-->>S: Approved
    S->>M: createListing(tokenId, price, FIXED)
    M-->>F: ListingCreated(listingId: 1)
    F->>BE: Sync listing to DB

    Note over S,BE: Purchase
    B->>F: View listing
    F->>BE: GET /marketplace/listings
    B->>M: buy(listingId) + 1000 FLR
    M->>M: Calculate fees (2.5% royalty, 2.5% platform)
    M->>N: transferFrom(seller, buyer, tokenId)
    M->>S: Transfer 950 FLR (95%)
    M->>N: Transfer 25 FLR royalty to original minter
    M-->>F: ListingSold(listingId, buyer, price)
    F->>BE: Update listing status

    Note over S,BE: Auction Flow
    S->>M: createListing(tokenId, minBid, AUCTION, endTime)
    B->>M: bid(listingId) + 500 FLR
    M->>M: Record bid, refund previous bidder

    Note right of M: Last 15 min: extend auction
    B->>M: bid(listingId) + 600 FLR
    M->>M: Extend endTime by 15 min

    Note right of M: Auction ends
    M->>M: finalizeAuction(listingId)
    M->>N: transferFrom(seller, highestBidder, tokenId)
```

---

## DNS Resolution Flow

How HSR domains resolve to wallet addresses.

```mermaid
flowchart LR
    subgraph Client["Client Application"]
        App[dApp / Wallet]
    end

    subgraph Resolution["Resolution Path"]
        SDK[HSR SDK]
        API[HSR API]
        Contract[HSRResolver]
        DB[(Database)]
    end

    App -->|"resolve('alice.cryptofans')"| SDK
    SDK -->|"1. Try API cache"| API
    API -->|"Check DB"| DB
    DB -->|"Cache hit"| API
    API -->|"0x1234..."| SDK

    SDK -->|"2. Fallback to chain"| Contract
    Contract -->|"addr(namehash)"| SDK

    SDK -->|"0x1234..."| App
```

### Resolution Priority

```mermaid
flowchart TD
    Start[resolve FQDN] --> Cache{API Cache?}
    Cache -->|Hit| Return[Return Address]
    Cache -->|Miss| Chain{On-chain Resolver?}
    Chain -->|Found| Update[Update Cache]
    Update --> Return
    Chain -->|Not Set| Owner{Use Owner Wallet?}
    Owner -->|Yes| Return
    Owner -->|No| NotFound[Return null]
```

---

## Image Generation Pipeline

Multi-GPU image generation flow for NFT artwork.

```mermaid
flowchart TB
    subgraph Request["User Request"]
        User[User selects 3 themes]
        Prompt[Custom prompt: "cosmic dragon"]
    end

    subgraph Backend["Backend Orchestration"]
        FluxSvc[fluxMultiGPU.js]
        Queue[Generation Queue]
    end

    subgraph GPUs["GPU Cluster (3x RTX 3060)"]
        subgraph GPU0["GPU 0 - Port 8188"]
            ComfyUI0[ComfyUI]
            Theme0[Theme: Cyberpunk]
        end
        subgraph GPU1["GPU 1 - Port 8189"]
            ComfyUI1[ComfyUI]
            Theme1[Theme: Fantasy]
        end
        subgraph GPU2["GPU 2 - Port 8190"]
            ComfyUI2[ComfyUI]
            Theme2[Theme: Abstract]
        end
    end

    subgraph Output["Output"]
        Images[3 Generated Images]
        Select[User Selects Best]
        IPFS[Upload to IPFS]
    end

    User --> FluxSvc
    Prompt --> FluxSvc
    FluxSvc --> Queue
    Queue -->|Parallel| GPU0 & GPU1 & GPU2
    GPU0 --> Images
    GPU1 --> Images
    GPU2 --> Images
    Images --> Select --> IPFS
```

### Generation Specs

| Parameter | Value |
|-----------|-------|
| Model | Flux 1 Schnell |
| Resolution | 1024x1024 |
| Steps | 4 (Schnell optimized) |
| Generation Time | ~8-12 seconds per image |
| Parallel Capacity | 3 images simultaneously |

---

## Deployment Topology

Production deployment architecture.

```mermaid
flowchart TB
    subgraph Internet["Internet"]
        Users[Users]
        CDN[Cloudflare CDN]
    end

    subgraph Server["Production Server"]
        subgraph PM2["PM2 Process Manager"]
            FE[mvp-frontend<br/>:3005]
            BE[halcyon-backend<br/>:8000]
            HSD[halcyon-hsd<br/>:5349/:12037]
        end

        subgraph Caddy["Caddy Reverse Proxy"]
            CaddyFE[Frontend HTTPS<br/>:3000 → :3005]
            CaddyDoH[DoH Endpoint<br/>:443 → dnsdist]
        end

        subgraph GPU_PM2["Remote GPU Services (PM2)"]
            C0[m3060 gpu0<br/>:8188 RTX 3060]
            C1[m3060 gpu1<br/>:8189 RTX 3060]
            C2[mosana1 gpu0<br/>:8188 RTX 3080]
            C3[mosana1 gpu1<br/>:8189 RTX 3080]
        end

        subgraph Docker["Docker Container"]
            VR[volume-resolver<br/>BIND + dnsdist]
        end

        subgraph Data["Data Services"]
            PG[(PostgreSQL<br/>:5432)]
            Redis[(Redis Cache<br/>:6379)]
        end

        subgraph Hardware["Hardware"]
            CPU[Intel i7 + UHD 630]
            SSD[NVMe SSD]
        end
    end

    subgraph External["External Services"]
        Flare[Flare RPC<br/>Coston2/Mainnet]
        Pinata[Pinata IPFS]
        FTSO[Flare FTSO]
    end

    Users --> CDN --> CaddyFE --> FE
    FE --> BE
    BE --> PG
    BE --> Redis
    BE --> HSD
    BE --> VR
    BE --> C0 & C1 & C2 & C3
    BE --> Flare
    BE --> Pinata
    BE --> FTSO
    HSD --> VR
```

### PM2 Process List

```
┌──────────────────────┬─────────┬─────────┬──────────┬─────────────────────┐
│ name                 │ mode    │ status  │ port     │ notes               │
├──────────────────────┼─────────┼─────────┼──────────┼─────────────────────┤
│ halcyon-backend      │ fork    │ online  │ 8000     │ Node.js/Express     │
│ mvp-frontend         │ fork    │ online  │ 3005     │ Next.js (Caddy→3000)│
│ halcyon-hsd          │ fork    │ online  │ 5349     │ DNS + 12037 RPC     │
│ comfyui-gpu0         │ fork    │ online  │ 8188     │ m3060 RTX 3060      │
│ comfyui-gpu1         │ fork    │ online  │ 8189     │ m3060 RTX 3060      │
│ comfyui-gpu2         │ fork    │ online  │ 8188     │ mosana1 RTX 3080    │
│ comfyui-gpu3         │ fork    │ online  │ 8189     │ mosana1 RTX 3080    │
└──────────────────────┴─────────┴─────────┴──────────┴─────────────────────┘
```

### Port Reference

| Service | Port | Protocol | Notes |
|---------|------|----------|-------|
| Frontend (Caddy) | 3000 | HTTPS | `tls internal`, proxy to 3005 |
| Frontend (Next.js) | 3005 | HTTP | Internal only |
| Backend API | 8000 | HTTP | Express v1 + v2 routes |
| hsd (DNS) | 5349 | DNS | Handshake resolution |
| hsd (RPC) | 12037 | HTTP | Name lookups |
| PostgreSQL | 5432 | TCP | |
| Redis | 6379 | TCP | |
| ComfyUI (m3060 GPU0) | 8188 | HTTP | 192.0.2.97, RTX 3060 |
| ComfyUI (m3060 GPU1) | 8189 | HTTP | 192.0.2.97, RTX 3060 |
| ComfyUI (mosana1 GPU0) | 8188 | HTTP | 192.0.2.67, RTX 3080 |
| ComfyUI (mosana1 GPU1) | 8189 | HTTP | 192.0.2.67, RTX 3080 |
| volume-resolver (BIND) | 5300 | DNS | Docker container |
| volume-resolver (DoH) | 800 | HTTP | dnsdist, Docker container |
| Caddy (DoH) | 443 | HTTPS | dns.halcyon-names.io |
| DNS-JSON API | 8054 | HTTP | Python API service |

---

## Data Flow Summary

```mermaid
flowchart LR
    subgraph Input
        User[User Action]
    end

    subgraph Processing
        FE[Frontend]
        BE[Backend]
        BC[Blockchain]
    end

    subgraph Storage
        DB[(PostgreSQL)]
        IPFS[(IPFS)]
        Chain[(On-chain)]
    end

    User --> FE
    FE -->|API Calls| BE
    FE -->|Transactions| BC
    BE -->|State| DB
    BE -->|Media| IPFS
    BC -->|Events| BE
    BC -->|State| Chain
```

---

## Security Boundaries

```mermaid
flowchart TB
    subgraph Public["Public Zone"]
        Internet[Internet Users]
        CDN[CDN/WAF]
    end

    subgraph DMZ["DMZ"]
        FE[Frontend :3000]
        API[Backend :8000]
    end

    subgraph Private["Private Zone"]
        DB[(PostgreSQL)]
        HNS[HNS Node]
        GPU[GPU Cluster]
    end

    subgraph Blockchain["Blockchain (Trustless)"]
        Contracts[Smart Contracts]
    end

    Internet --> CDN --> FE & API
    API --> DB & HNS & GPU
    API <--> Contracts
    FE <--> Contracts
```

### Security Controls

| Layer | Controls |
|-------|----------|
| CDN | DDoS protection, WAF, SSL termination |
| API | Rate limiting, CORS, Helmet.js, Input validation |
| Auth | Wallet signature verification, Nonce replay protection |
| Database | Connection pooling, Parameterized queries |
| Blockchain | On-chain access control, Escrow pattern |
