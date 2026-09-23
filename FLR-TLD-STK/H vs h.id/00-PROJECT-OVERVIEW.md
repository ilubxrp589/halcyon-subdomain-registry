# HSR — Halcyon Subdomain Registry: Project Overview

## What HSR Is

HSR is an NFT-based platform that bridges Handshake TLDs to Flare Network, enabling subdomain (SLD) sales with AI-generated artwork for each subdomain. It is deployed on Flare (EVM-compatible L1) and uses Flare-native protocols (FTSO, FDC) instead of third-party oracles.

## Reference Implementation

HNS.ID by Namebase is a production platform doing the same thing on Optimism L2.
- **Repo:** https://github.com/namebasehq/handshake-contracts
- **License:** MIT (can study patterns directly)
- **Framework:** Solidity + Foundry
- HSR should follow the same contract architecture patterns but adapt for Flare-native features

## Core Differences from HNS.ID

| Component | HNS.ID (Optimism) | HSR (Flare) |
|-----------|-------------------|-------------|
| Price Oracle | Chainlink ETH/USD | FTSO (native, no dependency) |
| Cross-chain Bridge | Trusted Namebase wallets | FDC Web2Json attestation → trustless |
| Payment Token | ETH | FLR |
| Unique Feature | None | AI artwork per subdomain |
| TLD Ownership Model | Open marketplace ($100 HNS stake) | Operator-owned ~300 TLDs initially, open marketplace later |
| Revenue Split | 95% TLD owner / 5% Dev Fund | Same model recommended |

## Technology Stack

- **Smart Contracts:** Solidity 0.8.25+, Foundry (forge), EVM version: **cancun** (required for flare-periphery-contracts)
- **Flare Contracts Package:** `@flarenetwork/flare-periphery-contracts` — official Flare interface package (do NOT write custom interfaces for Flare contracts)
- **Target Network:** Flare Mainnet (Chain ID: 14), Testnet: Coston2 (Chain ID: 114)
- **NFT Standard:** ERC-721 for both TLDs and SLDs
- **Price Oracle:** FTSO v2 (FLR/USD feed) — block-latency feeds (~1.8s) for real-time display, anchor feeds (~90s) for accuracy backstop
- **Cross-chain Verification:** Flare Data Connector (FDC) with Web2Json attestation type (sourceId: `PublicWeb2`)
- **AI Artwork:** Stable Diffusion pipeline, async post-mint generation
- **Artwork Storage:** IPFS (pinned)
- **Metadata:** On-chain + IPFS hybrid
- **Backend:** Node.js (HSD integration, render queue, API)
- **Frontend:** TBD

## Contract Architecture Overview

```
                    ┌──────────────────────┐
                    │   FDC (Web2Json)     │ ← Queries HSD REST API
                    │   Attestation        │    for TLD ownership
                    └──────────┬───────────┘
                               │ proof
                               ▼
┌──────────────────────────────────────────────────────────┐
│                    TldClaimManager                        │
│                  (Upgradeable Proxy)                      │
│                                                          │
│  - Accepts staking requests                              │
│  - Submits FDC attestation requests                      │
│  - Verifies Merkle proofs                                │
│  - Mints TLD NFTs on proof verification                  │
│  - Collects staking fees in FLR                          │
└──────────────────┬───────────────────────────────────────┘
                   │ mints
                   ▼
┌──────────────────────────┐     ┌──────────────────────────┐
│     HsrTld (ERC-721)     │────▶│ RegistrationStrategy     │
│                          │     │                          │
│  - TLD NFT ownership     │     │ - Length-based pricing   │
│  - Pricing config ref    │     │ - Premium names          │
│  - Revenue rights        │     │ - Reserved names         │
│  - Enable/disable toggle │     │ - Multi-year discounts   │
└──────────┬───────────────┘     └──────────────────────────┘
           │ parent of                      │ pricing
           ▼                                ▼
┌──────────────────────────┐     ┌──────────────────────────┐
│     HsrSld (ERC-721)     │◀───│ SldRegistrationManager   │
│                          │     │ (Upgradeable Proxy)      │
│  - SLD NFT ownership     │     │                          │
│  - Expiry timestamp      │     │ - Register (commit-reveal│
│  - Parent TLD ref        │     │   or signed)             │
│  - Resolver ref          │     │ - Renewal logic          │
│  - AI artwork metadata   │     │ - Price lock snapshots   │
│  - Registration price    │     │ - Payment routing        │
└──────────┬───────────────┘     └──────────────────────────┘
           │                                │
           ▼                                ▼
┌──────────────────────────┐     ┌──────────────────────────┐
│    Resolver System       │     │    PaymentManager        │
│                          │     │                          │
│  - AddressResolver       │     │ - 95/5 split logic       │
│  - TextResolver          │     │ - FLR distribution       │
│  - DNSResolver           │     │ - FTSO USD→FLR conversion│
│  - ContentHashResolver   │     └──────────────────────────┘
│  - NameResolver          │
└──────────────────────────┘     ┌──────────────────────────┐
                                 │    FtsoOracle            │
┌──────────────────────────┐     │                          │
│  GlobalRegistrationRules │     │ - FTSO v2 FLR/USD feed   │
│                          │     │ - USD → FLR conversion   │
│  - Min price ($1/year)   │     └──────────────────────────┘
│  - Label validation      │
│  - System constraints    │     ┌──────────────────────────┐
└──────────────────────────┘     │  SldCommitIntent         │
                                 │                          │
┌──────────────────────────┐     │ - Anti-front-running     │
│    LabelValidator        │     │ - Commit-reveal scheme   │
│                          │     └──────────────────────────┘
│  - a-z, 0-9 only        │
│  - No unicode            │     ┌──────────────────────────┐
│  - No underscores        │     │  ArtworkMetadataService  │
│  - No null bytes         │     │                          │
│  - Lowercase only        │     │ - AI artwork IPFS refs   │
└──────────────────────────┘     │ - tokenURI generation    │
                                 │ - Render queue interface │
                                 └──────────────────────────┘
```

## File Map for This Implementation Guide

| File | Purpose |
|------|---------|
| `00-PROJECT-OVERVIEW.md` | This file — architecture and context |
| `01-SMART-CONTRACTS.md` | All contract specs, interfaces, storage layouts |
| `02-FDC-INTEGRATION.md` | Flare Data Connector integration for trustless TLD bridging |
| `03-FTSO-ORACLE.md` | FTSO v2 price feed integration details |
| `04-TLD-STAKING-FLOW.md` | Complete TLD staking user flow and contract logic |
| `05-SLD-REGISTRATION.md` | Subdomain registration, pricing, renewal, lifecycle |
| `06-AI-ARTWORK-PIPELINE.md` | AI artwork generation, metadata, IPFS integration |
| `07-RESOLVER-SYSTEM.md` | Domain resolution architecture |
| `08-BACKEND-SERVICES.md` | HSD node, render queue, API, keeper services |
| `09-DEPLOYMENT-AND-TESTING.md` | Foundry deployment, testnet strategy, security |

## Key Flare Contract Addresses (Coston2 Testnet)

```
FlareContractRegistry: 0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019
FdcHub:                Use ContractRegistry.getFdcHub()
FdcVerification:       Use ContractRegistry.getFdcVerification()
FlareSystemsManager:   Use ContractRegistry.getFlareSystemsManager()
FtsoV2:                Use ContractRegistry.getFtsoV2()

Coston2 RPC:           https://coston2-api.flare.network/ext/C/rpc
Coston2 Chain ID:      114
Coston2 Explorer:      https://coston2-explorer.flare.network
Coston2 DA Layer:      https://ctn2-data-availability.flare.network
Coston2 Verifier:      https://fdc-verifiers-testnet.flare.network/

Flare Mainnet RPC:     https://flare-api.flare.network/ext/C/rpc
Flare Chain ID:        14
```

## Operator Context

- Owner has ~300 Handshake TLDs
- Phase 1 is operator-owned TLDs only (simpler, no staking needed)
- Phase 2 opens TLD staking to external users via FDC verification
- GPU render cluster (RTX 3060s/3080s) available for AI artwork
- Existing HNS resolver infrastructure

## Implementation Status (2026-02-17)

### Done
- All 13 contracts deployed on Coston2 (HsrTld, HsrSld, TldClaimManager, SldRegistrationManager, PaymentManager, etc.)
- TldClaimManager upgraded to Phase 2 (clean impl `0x91696Cf7d44fDdd601e5150874c7dF42fCA76DEe`)
- Phase 2 configured: ftsoOracle = `0x08d391c50AE8aa94B031195491Ffa9Df7953200c`, stakingFeeUsd = 1000 cents ($10)
- Event listener: 16 events across 5 contracts, FDC round ID extraction working
- FDC Keeper Bot: running, polling every 30s, keeper wallet `0x89201a4C30ddB1D9AC1c3592B51634a1623c88a7` (7,723 FLR)
- Admin API routes: keeper status, pending claims list, manual retry
- V2 database tables (8 tables): tlds_v2, slds_v2, pending_claims, etc.
- 14 Foundry test files with full coverage

### Blocked
- **Operator batch mint of ~300 TLDs**: WAITING ON NAMEBASE TO REOPEN. Need Namebase to export/access the TLD list. This is the foundation — SLD registration can't happen until TLDs are minted as NFTs.

### Remaining (can do without Namebase)
- User-facing staking API routes (requestStake, claim-status, my-claims)
- HNS ownership verification (server-side flr:0x... TXT record check)
- SLD renewal endpoints + cost calculator with multi-year discounts
- Frontend staking UI integration
