# NFT Minting Pipeline

## Overview

Every subdomain registration mints an ERC-721 NFT on Flare Network. The NFT includes AI-generated artwork and metadata stored on IPFS.

## Minting Flow

```
Registration Payment Confirmed
        │
        ▼
Generate AI Artwork (ComfyUI)
        │
        ▼
Upload Image to IPFS (Pinata)
        │ → Returns image CID
        ▼
Build Metadata JSON
        │
        ▼
Upload Metadata to IPFS (Pinata)
        │ → Returns metadata CID
        ▼
Call HSRRegistry.mint()
        │ → Sets tokenURI to ipfs://{metadata_CID}
        ▼
Update PostgreSQL with tokenId, CIDs
        │
        ▼
NFT visible in user dashboard
```

## Metadata Standard (ERC-721 / OpenSea Compatible)

```json
{
  "name": "wallet.cryptofans",
  "description": "Handshake subdomain registered on Halcyon Subdomain Registry, powered by Flare Network.",
  "image": "ipfs://Qm...",
  "external_url": "https://halcyon.domains/subdomain/wallet.cryptofans",
  "attributes": [
    { "trait_type": "TLD", "value": "cryptofans" },
    { "trait_type": "Label", "value": "wallet" },
    { "trait_type": "Length", "value": 6, "display_type": "number" },
    { "trait_type": "Category", "value": "Crypto/Community" },
    { "trait_type": "Art Style", "value": "Neon Cyber" },
    { "trait_type": "Art Source", "value": "AI Generated" },
    { "trait_type": "Registration Date", "value": 1706745600, "display_type": "date" }
  ]
}
```

## Art Tier System

| Tier | Source | Speed | Value |
|------|--------|-------|-------|
| AI Generated | Automatic from ComfyUI | Instant-30s | Standard |
| Artist Original | Human artist upload | After approval | Premium |
| Artist Competing | Multiple artists, buyer picks | Market-driven | Highest |

## Custom Media Uploads (Planned Feature)

Subdomain owners can optionally replace or supplement AI art with:
- **GIFs:** Max 10MB, validated format
- **Videos:** Max 50MB, .mp4/.webm, 10-30 second limit
- **Custom Images:** Validated, moderated
- Storage: IPFS via Pinata
- Requires content moderation (NSFW detection)
- Add-on pricing, reverts if not renewed

## IPFS Storage

- **Service:** Pinata
- **Image format:** PNG (lossless for NFT quality)
- **Metadata format:** JSON
- **Pinning:** Persistent — Pinata keeps files pinned as long as account is active
- **Backup:** S3 redundancy for all uploaded assets

## Important Notes

- Image generation must complete before mint transaction
- If ComfyUI is unavailable, queue the job and mint with placeholder, update later
- tokenURI is immutable once set — plan metadata carefully
- All CIDs should be logged in PostgreSQL for reference
- Seeded generation: same subdomain + TLD + timestamp = reproducible image
