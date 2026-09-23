# TLD Portfolio & Pricing

## Portfolio Overview

HSR controls ~300 Handshake TLDs. The top 50 are categorized and prioritized for launch.

### V2 TLD Staking (Feb 2026)

With the V2 staking system, **any Handshake TLD owner** can stake their TLD on Flare via FDC attestation:

1. Owner sets `flr:0xWalletAddress` TXT record on their Handshake TLD
2. Frontend verifies ownership via hsd API
3. FDC attestation proves TLD ownership trustlessly
4. TLD NFT (HsrTld ERC-721) minted to owner on Flare
5. Owner enables SLD registration and sets pricing

This means HSR's TLD catalog is no longer limited to platform-owned TLDs — community TLD owners can participate. Platform-owned TLDs are marked `is_official: true` in the database.

## Launch Phases

### Phase 1 — MVP Launch (5 TLDs)
1. cryptofans
2. halcyon-domains
3. web3mv
4. everquest
5. crypto-ai

### Phase 2 — Flare Ecosystem + Gaming (10 more)
flaremv, flaredefi, sparkmv, cryptomv, wh40k, wh30k, learnweb3, learncrypto, learnai, defitools

### Phase 3 — Full Top 50 Rollout
Remaining tiers based on demand.

## Tier Classification

**Tier 1 — Flagship (10):**
halcyon-domains, cryptofans, web3mv, crypto-ai, everquest, wh40k, flaremv, sparkmv, cryptomv, flaredefi

**Tier 2 — High Value (15):**
learnweb3, learncrypto, learnai, defitools, cryptotools, nftmv, metaversemv, blockchainfans, defimv, aitools, cryptoland, tokenomics, yieldfarmer, liquiditypool, stakingpool

**Tier 3 — Strong Niche (15):**
japananime, tokyodrift, 240sx, japanhistory, georgiasports, atlantahiphop, naturalart, cleanblock, ourvets, waltenfiles, dreamcams, glogang, gunbuilds, mangafans, animeart

**Tier 4 — Specialized (10):**
Additional gaming, regional, and specialty TLDs based on demand.

## Excluded Categories
- NSFW/Adult content (~40 domains) — brand safety
- Political/controversial names — divisive
- Country code combos (xxx-### format) — confusing
- Misspellings — not professional

## Pricing Model

### Character-Length Based Pricing

| Length | Price Tier | Rationale |
|--------|-----------|-----------|
| 1-2 chars | Premium++ | Extremely rare, highest value |
| 3-4 chars | Premium | Short, memorable, high demand |
| 5-7 chars | Standard | Sweet spot for most registrations |
| 8-12 chars | Value | Common names and phrases |
| 13+ chars | Budget | Long names, lower demand |

### Category Multipliers

| Category | Base Price | Premium Multiplier |
|----------|-----------|-------------------|
| Crypto/DeFi | 15 FLR | 2-3x for short names |
| Gaming | 10 FLR | 3-5x for guild names |
| Metaverse (MV) | 12 FLR | 2x for location names |
| Education | 8 FLR | 1.5x for subjects |
| Specialty | 10 FLR | Variable by niche |

### V2 Dynamic Pricing (Per-TLD)

With V2, TLD owners can configure custom pricing via `tld_pricing_v2`:
- **Length-based tiers**: Configurable USD price per label length (JSONB)
- **Multi-year discounts**: Percentage discounts for multi-year registrations (JSONB)
- **Premium names**: Individual names with custom pricing (`premium_names_v2`)
- **Reserved names**: Names blocked from registration (`reserved_names_v2`)
- **Platform fee**: 5% (500 bps) via PaymentManagerV2

### Revenue Streams
1. Initial registration fees (V1 escrow or V2 PaymentManagerV2)
2. Annual renewal fees
3. TLD staking fees (one-time, for community TLD owners)
4. Premium name auctions
5. Platform fee on V2 registrations (5%)
6. Secondary sale royalties (2.5% EIP-2981)

### Price Oracle
- USD-denominated base prices
- Converted to FLR dynamically via FTSO oracle
- Cached in Redis (5 min TTL)
- Fallback: CoinGecko API

## TLD Theme → Art Style Mapping

Each TLD has a defined art style for AI generation. See @docs/ai-art-pipeline.md for the full theme table. New TLDs must have a theme defined before being enabled for registration.
