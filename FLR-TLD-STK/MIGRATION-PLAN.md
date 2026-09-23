# Migration Plan: Hardhat (V1) → Foundry (V2) Contract Architecture

## Overview

HSR has two independent smart contract systems deployed on Coston2. This document maps the relationship between them and defines the transition strategy.

| System | Tool | Deployed | Contracts | Status |
|--------|------|----------|-----------|--------|
| **V1 (Legacy)** | Hardhat | Jan 27, 2026 | 7 | Active, handling existing registrations |
| **V2 (TLD Staking)** | Foundry | Feb 17, 2026 | 13+ | Active, event listeners running |

Both systems are live and operate in parallel with separate database tables, separate event listeners, and separate NFT contracts.

---

## 1. Contract Mapping: V1 → V2

| V1 (Hardhat) | Address | V2 (Foundry) | Address | Relationship |
|--------------|---------|--------------|---------|--------------|
| SubdomainNFT | `0x900C...0f38` | HsrSld (UUPS) | `0xA94F...5110` | **Replaced.** V2 adds expiry, renewal price lock, artwork tracking, grace period. |
| SubdomainEscrow | `0xec53...5B4b` | SldCommitIntent + PaymentManager | `0x1EB1...91d` / `0xc502...F112` | **Split.** Commit-reveal replaces 24h escrow hold. PaymentManager handles 95/5 split. |
| PriceOracle | `0x55b9...e5B0` | FtsoOracle | `0x08d3...200c` | **Upgraded.** Static price → dynamic FTSO v2 feed with staleness checks. |
| DNSOracle | `0x218e...b2Ff` | *(removed)* | — | **Deprecated.** DNS insertion now handled by backend event listener + volume-resolver. |
| HSRResolver | `0x7C0e...2Fb1` | DefaultResolver | `0xbE84...aFF5` | **Parallel.** HSRResolver serves V1 domains, DefaultResolver serves V2. Can coexist. |
| SubdomainMarketplace | `0xa53e...5B92` | *(unchanged)* | — | **Shared.** No V2 marketplace yet. Existing marketplace works with both NFT contracts. |
| CommunityTreasury | `0x73739...a503` | *(unchanged)* | — | **Shared.** V2 PaymentManager routes platform fees here. |
| — | — | HsrTld (UUPS) | `0xAEb6...9cdE` | **New.** TLD NFTs — each Handshake TLD is a token. |
| — | — | TldClaimManager (UUPS) | `0xCfF9...00c4` | **New.** Operator mint (Phase 1) + FDC staking (Phase 2). |
| — | — | SldRegistrationManager (UUPS) | `0x9e68...5D69` | **New.** Central registration hub wiring all V2 components. |
| — | — | DefaultRegistrationStrategy | `0xa42B...97fE` | **New.** Per-TLD configurable pricing (length-based, premium, reserved). |
| — | — | LabelValidator | `0x5D13...1213` | **New.** On-chain label validation (alphanumeric only). |
| — | — | GlobalRegistrationRules | `0x9bdb...e92` | **New.** System-wide minimum pricing and constraints. |
| — | — | SldMetadataService | `0x0f9A...aFF5` | **New.** On-chain tokenURI generation for SLD NFTs. |
| — | — | TldMetadataService | `0xa9C3...8430` | **New.** On-chain tokenURI generation for TLD NFTs. |

---

## 2. Key Architecture Differences

| Aspect | V1 (Hardhat) | V2 (Foundry) |
|--------|-------------|-------------|
| Upgradeability | None (immutable) | UUPS proxy (HsrTld, HsrSld, SldRegistrationManager, TldClaimManager) |
| Registration flow | Escrow → DNS verify → Mint | Commit-reveal → Payment → Mint |
| Front-running protection | 24h escrow timeout | Commit-reveal (8 blocks min, 24h max) |
| TLD modeling | Not modeled — flat namespace | HsrTld NFTs with per-TLD strategies, pricing, enable/disable |
| Renewals | Not supported | Tracked per SLD (expiry + price lock at registration time) |
| Grace period | None | 30 days post-expiry |
| Price oracle | Static on-chain value | FTSO v2 dynamic feed (1.8s block-latency updates) |
| Payment split | Platform receives all | 95% TLD owner / 5% platform (pull pattern) |
| FDC staking | N/A | Trustless Handshake TLD ownership verification via Web2Json attestation |

---

## 3. Coexistence Strategy

Both systems run in parallel on Coston2. They do not interfere because:

**Separate NFT contracts** — V1 mints on SubdomainNFT (`0x900C...`), V2 mints on HsrSld (`0xA94F...`). Different token IDs, different ownership registries.

**Separate database tables** — V1 uses `domains`, `records`, `users`. V2 uses `tlds_v2`, `slds_v2`, `sld_artwork_v2`, `tld_pricing_v2`, `pending_claims`, `registration_events_v2`.

**Separate event listeners** — `contractListener.js` watches V1 events (EscrowCreated, EscrowCompleted). `stakingListener.js` watches V2 events (16 events across 5 contracts).

**Shared infrastructure** — Both use the same PostgreSQL, volume-resolver (BIND DNS), IPFS/Pinata, and ComfyUI art pipeline.

**Shared backend API** — V1 routes at `/api/v1/*`, V2 routes at `/api/v2/*`. Both served from the same Express server.

---

## 4. Data Migration Path

### Option A: No migration (recommended for launch)
Keep both systems. V1 registrations remain valid and resolvable. New registrations go through V2. This is the simplest and safest path.

- V1 subdomains continue resolving via HSRResolver + volume-resolver
- V2 subdomains resolve via DefaultResolver + volume-resolver
- Users with V1 domains can use them indefinitely (no expiry in V1)

### Option B: Gradual migration (post-launch)
If consolidation is desired later:

1. **Export V1 registrations**: Query `domains` + `records` tables for all active V1 subdomains
2. **Mint V2 equivalents**: For each V1 subdomain, mint an HsrSld NFT to the same owner
3. **Set generous expiry**: V1 had no expiry — give migrated domains 5+ years
4. **Lock pricing**: Set `registration_price_usd_cents` to the original V1 price tier
5. **Transfer art**: Copy artwork CIDs from V1 `nft_metadata` to V2 `sld_artwork_v2`
6. **Pause V1**: Call `pause()` on SubdomainEscrow to stop new V1 registrations
7. **Keep V1 NFTs**: SubdomainNFT remains active (users keep their tokens), but new minting stops

### Option C: Full replacement (not recommended yet)
Burn V1 NFTs and re-mint on V2. Too disruptive — requires all holders to approve.

---

## 5. Deployment Sequence (Already Complete)

All V2 contracts were deployed Feb 17, 2026 in a single deployment script:

```
1. LabelValidator (immutable)
2. FtsoOracle (immutable)
3. GlobalRegistrationRules(labelValidator, 100)
4. HsrTld impl + UUPS proxy → initialize(claimManager, operator, labelValidator)
5. HsrSld impl + UUPS proxy → initialize(registrationManager, artworkService)
6. TldClaimManager impl + UUPS proxy → initialize(hsrTld, operator, labelValidator)
7. SldCommitIntent
8. DefaultRegistrationStrategy(hsrTld)
9. PaymentManager(ftsoOracle, platformRecipient, 500 bps)
10. SldRegistrationManager impl + UUPS proxy → initialize(all addresses)
11. DefaultResolver(hsrSld)
12. SldMetadataService + TldMetadataService
13. Wire roles (claimManager → HsrTld, registrationManager → HsrSld)
```

Phase 2 upgrade (TldClaimManager FDC staking) deployed Feb 18, 2026:
- Clean impl: `0x91696Cf7d44fDdd601e5150874c7dF42fCA76DEe`

---

## 6. Frontend Switching Strategy

### Current state
- V1 frontend pages use V1 API (`/api/v1/*`) + SubdomainNFT contract
- V2 frontend pages use V2 API (`/api/v2/*`) + HsrSld/HsrTld contracts

### Transition plan
1. **New features V2-only**: TLD staking page, renewal UI, TLD owner dashboard — all built against V2
2. **Search uses V2**: The `/api/v2/search` endpoint queries `tlds_v2` + `slds_v2`
3. **Registration flow → V2**: New registrations go through commit-reveal + SldRegistrationManager
4. **Dashboard shows both**: User dashboard can query both V1 and V2 tables to show all domains
5. **Marketplace neutral**: SubdomainMarketplace works with any ERC-721 — supports both SubdomainNFT and HsrSld

### Chain ID detection
Both V1 and V2 target Coston2 (Chain ID 114). No chain switching needed. The frontend distinguishes systems by contract address, not network.

---

## 7. Rollback Plan

If V2 encounters critical issues:

1. **Pause V2 registrations**: Call `pause()` on SldRegistrationManager (UUPS — can be upgraded to add pause if needed)
2. **Stop V2 event listener**: `pm2 stop halcyon-staking-listener`
3. **Revert frontend**: Point registration flow back to V1 SubdomainEscrow
4. **V2 NFTs remain valid**: Already-minted HsrSld tokens are on-chain and immutable
5. **DNS still works**: volume-resolver serves both V1 and V2 zone records

V1 contracts are not upgradeable and cannot be paused (no pause function), but SubdomainEscrow can be effectively stopped by removing the backend's event listener for it.

---

## 8. Blockers

| Blocker | Impact | Status |
|---------|--------|--------|
| Namebase closed | Cannot export ~300 TLD list for `operatorMintBatch()` | Waiting |
| FDC endpoint governance | Required for mainnet FDC staking (not Coston2) | Not submitted (ts-024) |

Without the TLD list, only manually-minted TLDs (like `cryptofans`) can accept SLD registrations in V2.

---

*Last updated: 2026-02-17*
