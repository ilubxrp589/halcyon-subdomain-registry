# HSR TODO Tracker

## How This Works

Claude Code actively updates this file during work sessions. When a task is started, mark it `[IN PROGRESS]`. When done, mark it `[DONE]` with date. When blocked, mark it `[BLOCKED]` with reason. Save to memory after updates.

Status legend:
- `[ ]` — Not started
- `[IN PROGRESS]` — Currently being worked on
- `[DONE - YYYY-MM-DD]` — Completed
- `[BLOCKED]` — Stuck, see notes

---

## Phase 1: MVP (Core Registration)

### Backend API
- [DONE] Subdomain availability check endpoint (`/search` with availability status)
- [DONE] Registration initiation endpoint (`/register/complete` with escrow flow)
- [DONE] Payment verification — v1 `contractListener.js` (EscrowCreated/Completed/Cancelled)
- [DONE - 2026-02-17] Payment verification — v2 `stakingListener.js` (16 events across 5 staking contracts)
- [DONE] DNS record creation on registration (auto-integrated in escrow completion flow)
- [DONE] User record management — full CRUD (`/resolve/:fqdn/set`, `/dns/:subdomain/:tld` endpoints)
- [DONE] TLD listing endpoint (`/tlds` with pricing)
- [DONE] Search/browse subdomains endpoint (`/search` + `/search/bulk` + `/search/suggest`)
- [DONE] Price calculation endpoint (`/pricing` + `/pricing/bulk` + `/pricing/bulk-multi` with FTSO)
- [DONE] FTSO price feed integration (`ftso.js` service + `priceSync.js` 5-min updates)
- [DONE] Wallet service (`walletService.js` — nonce-based signature verification)
- [DONE - 2026-02-17] Update DNS zone service from legacy PowerDNS (`pdns.js`) to volume-resolver (BIND) API

### Smart Contracts — Legacy System (Hardhat)
- [DONE - 2026-01-27] SubdomainNFT (ERC-721) deployed to Coston2 — `0x900C2f2f9a89Cb62Af702611FF77c9F6Ef8dfd38`
- [DONE - 2026-01-27] SubdomainEscrow — registration & payment logic — `0xec53e23EFe752FcCaD57a2EF5ef535bABD605B4b`
- [DONE - 2026-01-27] PriceOracle — FTSO price feed — `0x55b92A8C367d408F028914BFCd48D1D4d16960b0`
- [DONE - 2026-01-27] DNSOracle — `0x218EB07c6ef92250DcfE0689a5309B10b96bA3Ff`
- [DONE - 2026-01-27] SubdomainMarketplace — secondary sales — `0xa53e3f6feD1c16557c72aDcB357cbbD4acAF5B92`
- [DONE - 2026-01-27] CommunityTreasury — `0xc87Bd36cdeBaa9C632e641F0865192b0DD67bAeD`
- [DONE - 2026-02-10] HSRResolver — on-chain name resolution — `0x7C0eA7094Be2caCB238D042b386B11ec24892Fb1`
- [DONE] 5 Hardhat test files (CommunityTreasury, Integration, SubdomainEscrow, SubdomainMarketplace, SubdomainNFT)

### Smart Contracts — V2 TLD Staking System (Foundry)
- [DONE - 2026-02-17] HsrTld (ERC-721 TLD NFTs, UUPS proxy) — `0xAEb64890BEBE39E5Fd845D95a81c818E9e039cdE`
- [DONE - 2026-02-17] HsrSld (ERC-721 SLD NFTs, UUPS proxy) — `0xA94F9BB2877e969b63e78c148fdc66A61E415110`
- [DONE - 2026-02-17] SldRegistrationManager — `0x9e680e851492F6135320FDaf64030F1F0Eb35D69`
- [DONE - 2026-02-17] PaymentManager — `0xc502b38C93A3B34D5E0BcFD83384678632D0F112`
- [DONE - 2026-02-17] DefaultRegistrationStrategy — `0xa42B21dA24734C6f5e24876D0FCcDB1299bC97fE`
- [DONE - 2026-02-17] TldClaimManager — `0xCfF939e85c53622fB6dCcD8FFc8d7408CB3E00c4`
- [DONE - 2026-02-17] SldCommitIntent — `0x1EB1BDF49deF1A32a56Abcce348342bb52c8A91d`
- [DONE - 2026-02-17] FtsoOracle — `0x08d391c50AE8aa94B031195491Ffa9Df7953200c`
- [DONE - 2026-02-17] LabelValidator — `0x5D13FA219deA785754043D63Cae2059b8AE1D213`
- [DONE - 2026-02-17] GlobalRegistrationRules — `0x9bdb1B85e81Ae4239EfdBe7c5e2071a0b6982e92`
- [DONE - 2026-02-17] DefaultResolver — `0xbE845B15524C31dAAe30b3C1004388BAEBE5Bc2F`
- [DONE - 2026-02-17] SldMetadataService — `0x0f9AEC25344239E1356A7966F8E05F281C5daFF5`
- [DONE - 2026-02-17] TldMetadataService — `0xa9C36F500BB6e0B5bC43aFe7160844387F9f8430`
- [DONE] 16 Foundry test files with full coverage

### DNS
- [DONE - 2026-02-13] DNS infrastructure: volume-resolver (BIND 9.20 + dnsdist 1.9 + root_proxy + hsd)
- [DONE - 2026-02-13] DoH endpoint: `https://dns.halcyon-names.io/dns-query` (RFC 8484)
- [DONE - 2026-02-13] JSON DNS API: `https://dns.halcyon-names.io/resolve` (Google-style)
- [DONE] Auto-insert DNS records on registration (integrated in escrow completion flow)
- [DONE] User record management — CRUD endpoints for A, AAAA, CNAME, TXT, MX records
- [DONE - 2026-02-13] Own authoritative zones configured (testzone, cryptomusic, cryptofans, etc.)
- [ ] Secondary DNS on VPS (replication)

### Frontend
- [DONE] Wallet connect — Web3Modal with MetaMask + WalletConnect (Coston2 + Flare mainnet)
- [DONE] Domain search & availability check — GlassmorphicSearchPanel with tier/price display
- [DONE] Registration flow UI — 4-step wizard (Domain Select → Create Artwork → Review → Mint)
- [DONE] Payment confirmation — Step 3 Review with price breakdown + Step 4 escrow tx
- [DONE] User dashboard — 5 tabs (Overview, Domains, Bulk, Settings, Rewards)
- [DONE] DNS record management UI in dashboard
- [DONE] Wallet auth — nonce-based challenge-response, 4-hour sessions
- [DONE] Admin panel — GPU management, process control, analytics, audit logs
- [DONE] Documentation pages + wiki system
- [ ] Renewal management UI (trigger renewals, view expiry dates)
- [ ] NFT artwork gallery view in dashboard
- [ ] Marketplace buy/sell/bid flows (UI exists but business logic incomplete)

### Database
- [DONE] 52 tables in migrate.js covering all domains: core, blockchain/NFT, pricing, DNS, user management, AI/GPU, FTSO, audit
- [DONE - 2026-02-17] V2 staking tables (tlds_v2, slds_v2, tld_pricing_v2, premium_names_v2, reserved_names_v2, sld_artwork_v2, registration_events_v2)

---

## Phase 2: NFT & AI Art

### NFT Pipeline
- [DONE] Mint NFT on registration completion (`nft.js` service — 46KB, full metadata generation)
- [DONE] Metadata JSON generation — OpenSea compatible with traits (TLD, label, length, category, art style)
- [DONE] IPFS upload via Pinata (`nftStorage.js` — images + metadata, batch support, health checks)
- [DONE] tokenURI set on-chain (integrated in minting flow)
- [DONE] NFT customization modal in frontend (theme/style selection, 8+ themes, 50+ styles)
- [ ] NFT visual gallery in user dashboard (currently shows metadata, not artwork grid)

### AI Art Generation
- [DONE] ComfyUI API integration (`comfyuiManager.js` — 18.8KB, 4-GPU support)
- [DONE] Theme system (8+ theme categories per TLD)
- [DONE] Style system (Flux/Animagine + Artistic, Digital, Film, Movements, Rendering, Mood)
- [DONE] Image post-processing (resize, optimize)
- [DONE] Queue system — distributes across 4 GPU instances (2x RTX 3060 + 2x RTX 3080)
- [DONE] Seeded generation (deterministic per subdomain)
- [ ] Fallback handling (graceful degradation if render station is down)

---

## Phase 3: Enhanced Features

### Custom Media
- [ ] File upload endpoint (GIF, video, images)
- [ ] Content moderation (NSFW detection)
- [ ] IPFS storage for custom media
- [ ] Add-on pricing for custom media
- [ ] Media reversion on non-renewal

### Resolver SDK
- [DONE - 2026-02-10] Forward resolution working (HSRResolver contract on Coston2)
- [DONE - 2026-02-10] Reverse resolution working (HSRResolver contract on Coston2)
- [ ] Package published to npm (`@halcyon/resolver-sdk`)
- [ ] SDK wrapper: forward resolution
- [ ] SDK wrapper: reverse resolution
- [ ] API client (off-chain queries)
- [ ] Documentation & README
- [ ] Example React component

### Marketplace
- [DONE] SubdomainMarketplace contract deployed — `0xa53e3f6feD1c16557c72aDcB357cbbD4acAF5B92`
- [DONE] Marketplace tables in DB (listings, offers, activity)
- [DONE] Marketplace page + listing cards in frontend
- [ ] Secondary sales flow — end-to-end buy/sell/bid
- [ ] Royalty enforcement verification (EIP-2981)
- [ ] Transfer subdomain (NFT transfer updates DNS records)

---

## Phase 4: Scaling & Multi-Chain

### Infrastructure
- [ ] AWS ECS deployment
- [ ] RDS PostgreSQL (Multi-AZ)
- [ ] Redis caching layer
- [ ] Monitoring & alerting

### Multi-Chain
- [ ] XRP Ledger payment support (research)
- [ ] Multi-chain price oracle
- [ ] Cross-chain claim handler

---

## Lit Protocol Integration (Cross-Phase)

> **Gate-0 Blocker:** Flare/Coston2 is NOT explicitly listed on Lit's supported chains. Compatibility must be verified before any implementation begins. If Gate-0 fails, this entire section is deferred until Lit adds Flare support.

### Phase 1 — Foundation (Gate-0)
- [ ] Verify Lit SDK reads ERC-721 state on Coston2 (access control conditions)
- [ ] Verify PKP signing against Coston2 RPC
- [ ] Install Lit SDK packages (frontend + backend)
- [ ] Create backend Lit client service (`backend/src/services/litProtocol.js`)
- [ ] Create frontend Lit client hook (`frontend/hooks/useLitProtocol.ts`)
- [ ] Add `LIT_NETWORK` env var to config
- [DONE - 2026-02-10] Create `docs/lit-integration.md`

### Phase 2 — Token-Gated Access
- [ ] Define ERC-721 access control conditions for SubdomainNFT on Coston2
- [ ] Lit encryption wrapper for DNS config data
- [ ] Dual-path auth: Lit sessions alongside existing wallet-signature auth
- [ ] Update DNS management endpoints to accept Lit auth
- [ ] Frontend `LitGatedDNS` component
- [ ] Tiered access control by NFT attributes
- [ ] Reusable `LitGate` React component
- [ ] Update `useAuth.ts` with Lit session support

### Phase 3 — PKP Seedless Onboarding
- [ ] PKP auth provider service (backend)
- [ ] Google OAuth PKP minting flow
- [ ] Email OTP PKP minting flow
- [ ] PKP wallet adapter (same interface as BrowserProvider signer)
- [ ] Unified Connect UI: MetaMask | WalletConnect | Google | Email
- [ ] Backend auth middleware accepts PKP session signatures
- [ ] PKP-to-SubdomainNFT ownership chain
- [ ] Account migration path (PKP → external wallet)

### Phase 4 — Automation & Cross-Chain
- [ ] Renewal Lit Action (serverless auto-renewal function)
- [ ] Platform-owned renewal PKP
- [ ] Auto-renewal opt-in UI in dashboard
- [ ] Cross-chain PKP signing (Flare + XRP Ledger)

---

## Remaining Work (Prioritized)

### High Priority — Complete the gaps
- [BLOCKED] Operator batch mint ~300 TLDs via `operatorMintBatch()` — **waiting on Namebase to reopen** (need TLD list export)
- [DONE - 2026-02-17] User-facing staking API routes (`/api/v2/staking/fee`, `/staking/status/:tld`, `/staking/my-claims`)
- [DONE - 2026-02-17] SLD renewal endpoints (`/api/v2/renew/quote/:fullName/:years`) + my-domains (`/my-domains`, `/my-domains/expiring`)
- [DONE - 2026-02-17] Update `pdns.js` service to work with volume-resolver (BIND) instead of PowerDNS
- [ ] HNS ownership verification — server-side `flr:0x...` TXT record check before accepting stakes
- [ ] Frontend renewal management UI
- [ ] Frontend NFT artwork gallery in dashboard
- [ ] End-to-end marketplace buy/sell/bid flow
- [ ] Fallback handling for ComfyUI downtime
- [ ] Secondary DNS replication on VPS

### Medium Priority — Polish
- [ ] Resolver SDK package (`@halcyon/resolver-sdk`) published to npm
- [ ] Backend test suite (unit + integration)
- [ ] HTTPS/TLS production setup
- [ ] Contract audit (formal or comprehensive self-audit)

### Low Priority — Future
- [ ] Bulk registration discounts
- [ ] API for third-party integrations
- [ ] Mobile-responsive optimization
- [ ] Premium name auctions
- [ ] Community artist portal
- [ ] FPGA-accelerated art generation (FK33)

---

## Progress Summary

| Area | Status | Completion |
|------|--------|------------|
| **Backend API (V1)** | Core registration, DNS, NFT, marketplace, admin | ~90% |
| **Backend API (V2)** | Staking, commit-reveal reg, renewal, my-domains, metadata | ~85% |
| **Smart Contracts (Legacy)** | 7 deployed on Coston2 (incl. HSRResolver) | 100% |
| **Smart Contracts (V2 Staking)** | 13+ deployed on Coston2, PaymentManagerV2 upgraded | 100% |
| **Event Listeners** | v1 (contractListener) + v2 (stakingListener, 16 events) | 100% |
| **FDC Integration** | FDC Keeper Bot running, TLD staking attestation working | 100% |
| **DNS Infrastructure** | volume-resolver (BIND 9.20 + DoH + JSON API) + BindZoneService | 95% |
| **Frontend** | Registration (V1+V2), dashboard, admin, wiki, staking, explore | ~80% |
| **NFT/Art Pipeline** | ComfyUI (4 GPUs) + Pinata + minting, V2 artwork queue | ~90% |
| **Database** | 52+ V1 tables + 8 V2 staking tables | ~95% |
| **Marketplace** | Contract + DB + basic UI, needs end-to-end flows | ~40% |
| **Resolver SDK** | On-chain working, npm package not published | ~30% |
| **Notifications/Email** | Full notification + email preference system | ~90% |
| **Lit Protocol** | Gate-0 not yet tested | 0% |
| **Infrastructure/Scaling** | Local only, Caddy HTTPS proxy active | 5% |

**Overall HSR Completion: ~80%**

Last audited: 2026-02-20
