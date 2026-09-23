# HSR Backend API Documentation

**Version:** 2.0.0
**Base URLs:**
- V1: `http://localhost:8000/api/v1` — Legacy registration, marketplace, NFT, DNS
- V2: `http://localhost:8000/api/v2` — TLD staking, commit-reveal registration, renewal, metadata
**Protocol:** REST + JSON

## Table of Contents

### V1 API (`/api/v1`)
1. [Authentication](#authentication)
2. [Health & Status](#health--status)
3. [TLDs](#tlds)
4. [Domain Search & Availability](#domain-search--availability)
5. [Pricing](#pricing)
6. [Domain Management](#domain-management)
7. [FLR Address Resolution](#flr-address-resolution)
8. [DNS Management](#dns-management)
9. [Registration](#registration)
10. [NFT Metadata & Images](#nft-metadata--images)
11. [NFT Generation & Customization](#nft-generation--customization)
12. [Flux Multi-GPU Generation](#flux-multi-gpu-generation)
13. [Marketplace](#marketplace)
14. [Favorites](#favorites)
15. [Sharing](#sharing)
16. [Admin Endpoints](#admin-endpoints)
17. [Error Responses](#error-responses)

### V2 API (`/api/v2`)
18. [V2 Search & TLD Browsing](#v2-search--tld-browsing)
19. [V2 TLD Management & Staking](#v2-tld-management--staking)
20. [V2 SLD Registration (Commit-Reveal)](#v2-sld-registration-commit-reveal)
21. [V2 Pricing & FTSO](#v2-pricing--ftso)
22. [V2 Name Resolution](#v2-name-resolution)
23. [V2 Renewal & User Domains](#v2-renewal--user-domains)
24. [V2 NFT Metadata & Artwork](#v2-nft-metadata--artwork)
25. [V2 Platform Stats](#v2-platform-stats)
26. [Notifications](#notifications)
27. [Email Management](#email-management)

---

## Authentication

HSR uses wallet signature authentication based on Ethereum/Flare cryptographic signatures. The authentication flow:

1. **Request a nonce** - Get a unique nonce for your wallet
2. **Sign the message** - Sign the message with your wallet (MetaMask, etc.)
3. **Send authenticated request** - Include `wallet`, `signature`, and `nonce` in request body

### Authentication Types

| Type | Description | Use Case |
|------|-------------|----------|
| **Full Auth** | Requires wallet + signature + nonce | Write operations (DNS updates, minting) |
| **Admin Auth** | Full auth + admin wallet verification | Admin operations |
| **Admin Read** | Wallet + signature + timestamp (5 min validity) | Admin read operations |
| **Public** | No authentication required | Read operations |

### GET /auth/nonce

Get a nonce for wallet signature authentication.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| wallet | string | Yes | Ethereum/Flare wallet address (0x...) |

**Response:**
```json
{
  "nonce": "halcyon-auth-1706000000000-abc123def",
  "message": "Halcyon Subdomain Registry\n\nAction: authenticate\nWallet: 0x...\nNonce: halcyon-auth-...\n\nSign this message to verify your wallet ownership.",
  "expiresAt": "2024-01-23T12:00:00.000Z"
}
```

**Example:**
```bash
curl "http://localhost:8000/api/v1/auth/nonce?wallet=0xYourWalletAddress"
```

### POST /auth/verify

Verify a signed message (for testing authentication).

**Request Body:**
```json
{
  "wallet": "0xYourWalletAddress",
  "signature": "0x...",
  "nonce": "halcyon-auth-..."
}
```

**Response:**
```json
{
  "success": true,
  "wallet": "0xyourwalletaddress",
  "message": "Authentication successful"
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/v1/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "wallet": "0xYourWalletAddress",
    "signature": "0xSignatureFromMetaMask",
    "nonce": "halcyon-auth-1706000000000-abc123"
  }'
```

---

## Health & Status

### GET /health

Check API and service health status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-23T12:00:00.000Z",
  "services": {
    "database": "connected",
    "hns": "synced",
    "hnsHeight": 123456,
    "dns": "healthy"
  }
}
```

**Example:**
```bash
curl http://localhost:8000/api/v1/health
```

### GET /hns/status

Get HNS (Handshake) node status.

**Response:**
```json
{
  "connected": true,
  "synced": true,
  "height": 123456,
  "info": { ... }
}
```

### GET /watcher

Get DNS propagation watcher status.

### GET /listener

Get blockchain contract listener status.

### GET /diagnostics

Get comprehensive system diagnostics (public endpoint for monitoring).

**Response:**
```json
{
  "timestamp": "2024-01-23T12:00:00.000Z",
  "summary": {
    "pass": 15,
    "warn": 2,
    "fail": 0,
    "status": "degraded"
  },
  "checks": {
    "services": [...],
    "database": [...],
    "blockchain": [...],
    "watcher": [...],
    "marketplace": [...],
    "docker": [...]
  }
}
```

### GET /diagnostics/:section

Run diagnostics for a specific section.

**Path Parameters:**
- `section`: One of `services`, `database`, `blockchain`, `watcher`, `marketplace`, `docker`

---

## TLDs

### GET /tlds

List all active TLDs (Top-Level Domains).

**Response:**
```json
{
  "tlds": [
    {
      "id": 1,
      "name": "cryptofans",
      "is_active": true,
      "domain_count": 150
    }
  ]
}
```

**Example:**
```bash
curl http://localhost:8000/api/v1/tlds
```

### GET /tlds/owned

Get TLDs owned by the platform's HNS wallet.

---

## Domain Search & Availability

### GET /search

Check domain availability and get pricing.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| subdomain | string | Yes | Subdomain to check (e.g., "alice") |
| tld | string | Yes | TLD to check (e.g., "cryptofans") |

**Response (Available):**
```json
{
  "available": true,
  "subdomain": "alice",
  "tld": "cryptofans",
  "fqdn": "alice.cryptofans",
  "tier": "standard",
  "price": {
    "usd": 10.00,
    "flr": 500,
    "flrPriceUSD": 0.02,
    "source": "ftso",
    "timestamp": "2024-01-23T12:00:00.000Z"
  }
}
```

**Response (Not Available):**
```json
{
  "available": false,
  "subdomain": "alice",
  "tld": "cryptofans",
  "fqdn": "alice.cryptofans",
  "owner": "0x1234...5678",
  "tokenId": "12345"
}
```

**Example:**
```bash
curl "http://localhost:8000/api/v1/search?subdomain=alice&tld=cryptofans"
```

### POST /search/bulk

Check availability for multiple subdomains (max 10).

**Request Body:**
```json
{
  "subdomains": ["alice", "bob", "charlie"],
  "tld": "cryptofans"
}
```

**Response:**
```json
{
  "results": [
    {"subdomain": "alice", "fqdn": "alice.cryptofans", "available": true, "tier": "standard"},
    {"subdomain": "bob", "fqdn": "bob.cryptofans", "available": false, "tier": "standard"}
  ]
}
```

---

## Pricing

### GET /pricing

Get current pricing tiers with FLR/USD rates.

**Response:**
```json
{
  "flrPriceUSD": 0.02,
  "priceSource": "ftso",
  "priceTimestamp": "2024-01-23T12:00:00.000Z",
  "tiers": {
    "ultra_premium": {
      "criteria": "1 character",
      "priceUSD": 500,
      "priceFLR": 25000,
      "renewalUSD": 100
    },
    "premium": {
      "criteria": "2 characters",
      "priceUSD": 200,
      "priceFLR": 10000,
      "renewalUSD": 50
    },
    "standard_plus": {
      "criteria": "3 characters",
      "priceUSD": 50,
      "priceFLR": 2500,
      "renewalUSD": 15
    },
    "standard": {
      "criteria": "4+ characters",
      "priceUSD": 10,
      "priceFLR": 500,
      "renewalUSD": 5
    }
  },
  "lastUpdated": "2024-01-23T12:00:00.000Z"
}
```

### GET /stats

Get platform statistics.

**Response:**
```json
{
  "tldCount": 5,
  "totalDomains": 1500,
  "recentRegistrations": [
    {"fqdn": "alice.cryptofans", "created_at": "2024-01-23T11:00:00.000Z"}
  ]
}
```

---

## Domain Management

### GET /domains/:fqdn

Get details for a specific domain.

**Response:**
```json
{
  "domain": {
    "id": 1,
    "subdomain": "alice",
    "fqdn": "alice.cryptofans",
    "tld_name": "cryptofans",
    "token_id": "12345",
    "owner_wallet": "0x...",
    "status": "active",
    "tier": "standard",
    "dns_active": true,
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

### GET /domains/owner/:wallet

List all domains owned by a wallet (public).

**Response:**
```json
{
  "domains": [
    {
      "fqdn": "alice.cryptofans",
      "subdomain": "alice",
      "tld_name": "cryptofans",
      "token_id": 12345,
      "status": "active"
    }
  ]
}
```

### POST /domains/owner/:wallet

List domains owned by wallet (authenticated - can only query your own wallet).

**Request Body:**
```json
{
  "wallet": "0xYourWallet",
  "signature": "0x...",
  "nonce": "halcyon-auth-..."
}
```

---

## FLR Address Resolution

HSR implements ENS-compatible address resolution for Flare addresses.

### GET /resolve/:fqdn

Resolve a domain to a wallet address.

**Example:**
```bash
curl http://localhost:8000/api/v1/resolve/alice.cryptofans
```

**Response:**
```json
{
  "fqdn": "alice.cryptofans",
  "address": "0x1234567890abcdef1234567890abcdef12345678",
  "source": "on-chain",
  "verified": true,
  "resolver": "0x7C0eA7094Be2caCB238D042b386B11ec24892Fb1",
  "tokenId": 12345,
  "lastUpdated": "2024-01-23T12:00:00.000Z"
}
```

### POST /resolve/batch

Resolve multiple domains at once (max 50).

**Request Body:**
```json
{
  "fqdns": ["alice.cryptofans", "bob.cryptofans"]
}
```

**Response:**
```json
{
  "results": [
    {"fqdn": "alice.cryptofans", "address": "0x...", "found": true},
    {"fqdn": "bob.cryptofans", "address": null, "found": false}
  ]
}
```

### POST /resolve/:fqdn/set

Set wallet address for a domain (requires ownership).

**Authentication:** Required (wallet signature)

**Request Body:**
```json
{
  "wallet": "0xYourWallet",
  "signature": "0x...",
  "nonce": "halcyon-auth-...",
  "address": "0xNewResolveAddress"
}
```

### GET /resolve/:fqdn/text

Get text records for a domain.

**Query Parameters:**
- `key` (optional): Specific key to retrieve

### POST /resolve/:fqdn/text

Set text record for a domain.

**Authentication:** Required

**Request Body:**
```json
{
  "wallet": "0xYourWallet",
  "signature": "0x...",
  "nonce": "halcyon-auth-...",
  "key": "avatar",
  "value": "https://example.com/avatar.png"
}
```

---

## DNS Management

### GET /dns/:subdomain/:tld

Get DNS records for a domain.

**Response:**
```json
{
  "records": [
    {"type": "A", "name": "alice", "content": "1.2.3.4", "ttl": 3600}
  ]
}
```

### POST /dns/:subdomain/:tld

Update DNS records (requires ownership).

**Authentication:** Required

**Request Body:**
```json
{
  "wallet": "0xYourWallet",
  "signature": "0x...",
  "nonce": "halcyon-auth-...",
  "records": {
    "ipv4": "1.2.3.4",
    "ipv6": "2001:db8::1",
    "cname": "example.com.",
    "txt": "v=spf1 include:_spf.google.com ~all",
    "ttl": 3600
  }
}
```

### DELETE /dns/:subdomain/:tld

Delete DNS records (requires ownership).

---

## Registration

### POST /register/complete

Complete domain registration after blockchain escrow payment.

**Authentication:** Required

**Request Body:**
```json
{
  "wallet": "0xYourWallet",
  "signature": "0x...",
  "nonce": "halcyon-auth-...",
  "escrowId": "123",
  "tokenId": "456",
  "subdomain": "alice",
  "tld": "cryptofans",
  "priceFLR": 500,
  "priceUSD": 10
}
```

**Response:**
```json
{
  "success": true,
  "fqdn": "alice.cryptofans",
  "tokenId": "456"
}
```

---

## NFT Metadata & Images

### GET /nft/metadata/:fqdn

Get OpenSea-compatible NFT metadata.

**Response:**
```json
{
  "name": "alice.cryptofans",
  "description": "A Handshake subdomain NFT on Flare Network...",
  "image": "ipfs://QmABC...",
  "external_url": "https://alice.cryptofans",
  "background_color": "0F0F1A",
  "attributes": [
    {"trait_type": "TLD", "value": "cryptofans"},
    {"trait_type": "Subdomain", "value": "alice"},
    {"trait_type": "Tier", "value": "Standard"},
    {"trait_type": "Length", "value": 5, "display_type": "number"}
  ]
}
```

### GET /nft/token/:tokenId

Get NFT metadata by token ID.

### GET /nft/image/:fqdn

Get NFT image (PNG).

**Query Parameters:**
- `size`: `small` (400px), `medium` (800px), `large` (1200px)
- `fallback`: `true` to force canvas-based fallback

### GET /nft/suggest-prompt/:subdomain

Get AI-powered prompt suggestions for NFT generation.

**Query Parameters:**
- `description` (optional): Additional context
- `tld` (optional): TLD context
- `refresh`: `true` to bypass cache

**Response:**
```json
{
  "subdomain": "dragon",
  "suggestions": [
    "majestic dragon soaring through storm clouds, rim lighting, volumetric fog...",
    "ancient dragon guarding treasure in a crystal cave, ray-traced reflections..."
  ],
  "source": "llm",
  "tip": "AI-generated prompts based on your domain. Click to use or edit!"
}
```

### POST /nft/prepare

Prepare NFT for purchase (generates AI image and uploads to IPFS).

**Request Body:**
```json
{
  "subdomain": "alice",
  "tld": "cryptofans",
  "style": "cyberpunk",
  "seed": 12345,
  "customPrompt": "A futuristic city with neon lights"
}
```

**Response:**
```json
{
  "success": true,
  "cached": false,
  "fqdn": "alice.cryptofans",
  "metadataURI": "ipfs://QmMetadata...",
  "imageCID": "QmImage...",
  "metadataCID": "QmMetadata...",
  "imageURL": "https://gateway.pinata.cloud/ipfs/QmImage...",
  "metadataURL": "https://gateway.pinata.cloud/ipfs/QmMetadata...",
  "seed": 12345,
  "tier": "standard",
  "style": "cyberpunk"
}
```

---

## NFT Generation & Customization

### GET /nft/styles

Get all available generation styles.

**Response:**
```json
{
  "success": true,
  "styles": {
    "ultra_premium": [...],
    "premium": [...],
    "standard_plus": [...],
    "standard": [...]
  },
  "note": "customPrompt is now required - describe your subject"
}
```

### POST /nft/preview-generate

Generate NFT preview (uses credits, no IPFS upload).

**Request Body:**
```json
{
  "subdomain": "alice",
  "tld": "cryptofans",
  "wallet": "0xYourWallet",
  "style": "cyberpunk",
  "seed": 12345,
  "customPrompt": "A cat wearing a crown"
}
```

**Response:**
```json
{
  "success": true,
  "imageBase64": "data:image/png;base64,...",
  "seed": 12345,
  "tier": "standard",
  "style": "cyberpunk",
  "remaining": 9
}
```

### POST /nft/regenerate

Regenerate NFT with new random seed (requires authentication).

**Authentication:** Required

### GET /nft/preview-credits/:wallet

Check preview credits for a wallet.

**Response:**
```json
{
  "success": true,
  "usedCount": 3,
  "remaining": 7,
  "freeTotal": 10
}
```

### GET /nft/regen-credits/:wallet

Check regeneration credits.

### GET /nft/regen-pricing

Get regeneration credit pricing.

---

## Flux Multi-GPU Generation

The system uses 3x RTX 3060 GPUs for parallel image generation.

### GET /nft/flux-styles

Get available image generation styles.

**Response:**
```json
{
  "success": true,
  "styles": [
    {"id": "playground", "name": "Photorealistic", "description": "..."},
    {"id": "animagine", "name": "Anime", "description": "..."}
  ],
  "defaultStyle": "playground"
}
```

### GET /nft/flux-themes

Get all 411 available themes across 8 categories.

### GET /nft/art-styles

Get all 60 art styles across 6 categories.

### POST /nft/flux-generate-parallel

Generate 3 images in parallel (one per GPU).

**Request Body:**
```json
{
  "subdomain": "alice",
  "tld": "cryptofans",
  "themes": ["cyberpunk-city", "neon-dreams", "retro-future"],
  "customPrompt": "A cyberpunk cat",
  "wallet": "0xYourWallet",
  "style": "playground",
  "styleId": "cinematic"
}
```

**Response:**
```json
{
  "success": true,
  "generationId": "gen-abc123",
  "domain": "alice.cryptofans",
  "images": [
    {
      "index": 0,
      "success": true,
      "imageBase64": "data:image/png;base64,...",
      "theme": {"id": "cyberpunk-city", "name": "Cyberpunk City", "category": "digital"},
      "seed": 12345,
      "server": "GPU0",
      "generationTime": 8.5
    }
  ],
  "successCount": 3,
  "totalCount": 3,
  "totalTime": 9.2,
  "remaining": 8
}
```

### GET /nft/flux-generation/:id

Get status/result of a generation.

### POST /nft/flux-select

Select an image from a generation for minting.

**Request Body:**
```json
{
  "generationId": "gen-abc123",
  "selectedIndex": 0,
  "wallet": "0xYourWallet"
}
```

### POST /nft/flux-prepare

Prepare selected Flux image for NFT minting (uploads to IPFS).

**Request Body:**
```json
{
  "generationId": "gen-abc123",
  "selectedIndex": 0,
  "subdomain": "alice",
  "tld": "cryptofans",
  "wallet": "0xYourWallet"
}
```

### GET /nft/flux-status

Get Flux service status.

### GET /nft/flux-servers-status

Get health status of all 3 GPU servers.

---

## Marketplace

### GET /marketplace/stats

Get marketplace statistics.

**Response:**
```json
{
  "totalVolume": 15000.5,
  "volume24h": 500.25,
  "totalSales": 150,
  "floorPrice": 10.5,
  "avgSalePrice": 100.0,
  "activeListings": 45
}
```

### GET /marketplace/listings

Get paginated marketplace listings.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | int | 1 | Page number |
| limit | int | 20 | Items per page (max 100) |
| sort | string | recent | `recent`, `price-low`, `price-high`, `ending-soon` |
| filter | string | all | `all`, `fixed`, `auction` |
| search | string | | Search by domain name |

**Response:**
```json
{
  "listings": [
    {
      "listingId": "1",
      "tokenId": "12345",
      "seller": "0x...",
      "price": 100.5,
      "listingType": 0,
      "status": 0,
      "endTime": 0,
      "fullDomain": "alice.cryptofans",
      "subdomain": "alice",
      "tld": "cryptofans",
      "imageUrl": "/api/proxy/nft/image/alice.cryptofans?size=small"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3,
    "hasMore": true
  }
}
```

### GET /marketplace/recent

Get recent sales.

**Query Parameters:**
- `limit`: Number of sales (default 10, max 50)

### GET /marketplace/floor/:tld

Get floor price for a specific TLD.

---

## Favorites

### GET /favorites/:walletAddress

Get user favorites.

**Response:**
```json
{
  "success": true,
  "favorites": {
    "themes": ["cyberpunk-city", "neon-dreams"],
    "styles": ["cinematic", "anime"],
    "count": 4
  }
}
```

### POST /favorites

Add a favorite.

**Request Body:**
```json
{
  "walletAddress": "0x...",
  "themeId": "cyberpunk-city"
}
```

### DELETE /favorites

Remove a favorite.

### POST /favorites/sync

Sync favorites from localStorage with server.

---

## Sharing

### POST /share-preview

Create shareable link for a generated image.

**Request Body:**
```json
{
  "imageHash": "QmIPFSHash...",
  "domain": "alice.cryptofans",
  "model": "flux",
  "themes": ["cyberpunk"],
  "walletAddress": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "shareId": "abc12345",
  "shareUrl": "https://example.com/share/abc12345"
}
```

### POST /share-domain

Create shareable link for an existing domain.

### GET /share/:shareId

Get shared image data.

---

## Admin Endpoints

Admin endpoints require admin wallet authentication. Most read operations use timestamp-based signature (valid for 5 minutes), while write operations require full nonce-based authentication.

### POST /admin/verify

Verify admin access.

**Authentication:** Required (admin wallet)

### POST /admin/status

Get comprehensive system status.

**Authentication:** Admin read (timestamp-based)

### Service Controls

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/listener/start` | POST | Admin | Start contract listener |
| `/listener/stop` | POST | Admin | Stop contract listener |
| `/listener/stats` | POST | Admin Read | Get listener statistics |
| `/admin/hns/start` | POST | Admin | Start HNS node |
| `/admin/hns/stop` | POST | Admin | Stop HNS node |
| `/admin/hns/wallet` | POST | Admin Read | Get HNS wallet info |
| `/admin/flr/wallet` | POST | Admin Read | Get FLR wallet info |

### Domain Management

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/admin/domains` | POST | Admin Read | List all domains with pagination |
| `/admin/domains/:id/status` | PUT | Admin | Update domain status |

### TLD Management

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/admin/tlds/list` | POST | Admin Read | List all TLDs (including inactive) |
| `/admin/tlds` | POST | Admin | Create a new TLD |
| `/admin/tlds/sync` | POST | Admin | Sync TLDs from HNS wallet |
| `/admin/tlds/:id` | PUT | Admin | Update TLD (activate/deactivate) |

### Reserved Words

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/admin/reserved/list` | POST | Admin Read | List reserved words |
| `/admin/reserved` | POST | Admin | Add reserved word |
| `/admin/reserved/:word` | DELETE | Admin | Remove reserved word |

### Database & Audit

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/admin/db/stats` | POST | Admin Read | Get database statistics |
| `/admin/db/pending` | POST | Admin Read | Get pending purchases |
| `/admin/audit` | POST | Admin Read | Get audit log |
| `/admin/audit/export` | POST | Admin Read | Export audit log as CSV |

### GPU Management

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/admin/comfyui/status` | POST | Admin Read | Get ComfyUI status |
| `/admin/comfyui/restart/:gpuId` | POST | Admin | Restart specific GPU |
| `/admin/comfyui/restart-all` | POST | Admin | Restart all GPUs |
| `/admin/comfyui/reset-counter/:gpuId` | POST | Admin | Reset generation counter |
| `/admin/gpu-health` | POST | Admin Read | Get GPU health status |
| `/admin/image-model/status` | POST | Admin Read | Get active image model |
| `/admin/image-model` | POST | Admin | Set active image model |

### Pricing

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/admin/pricing/compare` | POST | Admin Read | Get FTSO vs on-chain comparison |
| `/admin/pricing/history` | POST | Admin Read | Get price sync history |

---

## Error Responses

All endpoints return errors in a consistent format:

```json
{
  "error": "Error message description",
  "details": "Additional details (optional)"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Authentication required or invalid |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found |
| 409 | Conflict - Resource already exists |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

### Common Error Responses

**Authentication Required:**
```json
{
  "error": "Authentication required",
  "details": "Missing wallet, signature, or nonce"
}
```

**Invalid Signature:**
```json
{
  "error": "Invalid signature",
  "details": "Signature does not match wallet"
}
```

**Nonce Expired:**
```json
{
  "error": "Nonce expired",
  "details": "Please request a new nonce"
}
```

**Not Domain Owner:**
```json
{
  "error": "Forbidden",
  "details": "You do not own this resource"
}
```

**Admin Access Required:**
```json
{
  "error": "Forbidden",
  "details": "Admin access required"
}
```

---

## Rate Limiting

Currently, there are no rate limits on the API. Preview credits serve as a soft limit for image generation (10 free per wallet).

## Caching

Several endpoints use internal caching:
- Marketplace stats: 60 seconds
- Recent sales: 30 seconds
- Marketplace listings: 30 seconds
- Prompt suggestions: LLM responses cached

---

---

# V2 API (`/api/v2`)

The V2 API supports the Foundry-based TLD staking system and commit-reveal SLD registration. It runs alongside V1 — both are active.

---

## V2 Search & TLD Browsing

### GET /search

Check domain availability across TLDs with pricing and suggestions.

### GET /search/multi

Multi-TLD availability search across all active TLDs.

### GET /tlds/browse

Browse public TLDs with filtering, sorting, and pagination.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| filter | string | all | `all`, `official`, `community` |
| sort | string | popular | `popular`, `newest`, `cheapest` |
| search | string | | Search by TLD name |
| page | int | 1 | Page number |
| limit | int | 20 | Items per page |

---

## V2 TLD Management & Staking

### GET /tlds

List all active TLDs with registration counts and pricing.

### GET /tld/:tldLabel

Get detailed TLD info including pricing tiers, premium names, and reserved names.

### GET /tld/:label/public

Public TLD details for non-owners with recent registrations.

### PUT /tld/:label/profile

Update TLD display name, description, and logo.

**Authentication:** Required (TLD owner only)

### GET /tld/verify/:tldLabel

Verify TLD ownership and staking status via HSD lookup.

**Query Parameters:**
- `address`: Flare wallet address to verify

### GET /tld/tx-status/:tldLabel

Check for pending UPDATE transaction on Handshake chain (for staking flow).

### GET /staking/fee

Current TLD staking fee in USD and FLR (cached 5 min).

**Response:**
```json
{
  "feeUsd": 25.00,
  "feeFLR": 1250,
  "flrRate": 0.02,
  "source": "ftso"
}
```

### GET /staking/status/:tldLabel

Check claim status for a TLD.

**Response:**
```json
{
  "status": "minted",
  "tokenId": 42,
  "owner": "0x...",
  "stakedAt": "2026-02-17T..."
}
```

### POST /staking/my-claims

Get user's pending and completed TLD stakes.

**Authentication:** Required

### POST /tld/:label/revenue

TLD owner revenue dashboard with registration history.

**Authentication:** Required (TLD owner only)

---

## V2 SLD Registration (Commit-Reveal)

V2 uses a commit-reveal pattern for front-running protection.

### POST /commit

Generate commit hash for commit-reveal registration flow.

**Request Body:**
```json
{
  "label": "alice",
  "tldLabel": "cryptofans",
  "owner": "0xYourWallet",
  "years": 1
}
```

**Response:**
```json
{
  "commitHash": "0x...",
  "secret": "0x...",
  "label": "alice",
  "tldLabel": "cryptofans"
}
```

**Flow:**
1. Call `POST /commit` to get commitHash + secret
2. Submit `commit(commitHash)` to SldCommitIntent contract
3. Wait for minimum delay (prevents front-running)
4. Submit `register(label, tld, secret, years)` to SldRegistrationManager

---

## V2 Pricing & FTSO

### GET /price/flr-rate

Get current FLR/USD rate from FTSO oracle (cached 30s).

**Response:**
```json
{
  "flrUsd": 0.02,
  "source": "ftso",
  "timestamp": "2026-02-20T..."
}
```

### GET /price/:tldLabel/:label/:years

Calculate registration price quote in USD and FLR.

**Response:**
```json
{
  "label": "alice",
  "tld": "cryptofans",
  "years": 1,
  "priceUsd": 10.00,
  "priceFLR": 500,
  "tier": "standard",
  "flrRate": 0.02
}
```

---

## V2 Name Resolution

### GET /resolve/:fullName

Forward resolution — domain to owner address, expiry, and resolver info.

### GET /reverse/:address

Reverse resolution — address to primary domain and all owned domains.

---

## V2 Renewal & User Domains

### GET /renew/quote/:fullName/:years

Renewal price quote using locked-in rate.

### POST /my-domains

Get user's V2 domains with expiry and artwork.

**Authentication:** Required

### POST /my-domains/expiring

Get domains expiring within N days.

**Authentication:** Required

**Query Parameters:**
- `days`: Number of days (default 90, max 365)

---

## V2 NFT Metadata & Artwork

### GET /metadata/sld/:tokenId

ERC-721 `tokenURI()` metadata JSON for subdomain NFTs. OpenSea-compatible.

### GET /metadata/tld/:tokenId

ERC-721 `tokenURI()` metadata JSON for TLD NFTs.

### GET /artwork/:tokenId

Get artwork status and IPFS URL for a token.

### GET /placeholder/:fullName

Generate deterministic SVG placeholder image (fallback for tokens without artwork yet).

---

## V2 Platform Stats

### GET /stats

Platform statistics (TLDs, SLDs, registrations, volume).

### GET /stats/platform

Public platform stats for homepage display.

### POST /tld-stats/refresh

Refresh the materialized view for TLD statistics (admin).

---

## Notifications

**Base path:** `/api/v1/notifications`

### GET /notifications/:wallet

Fetch unread/undismissed notifications for a wallet.

### GET /notifications/:wallet/count

Unread notification count (for badge display).

### PATCH /notifications/:id/read

Mark a notification as read.

### PATCH /notifications/:id/dismiss

Dismiss a notification.

### PATCH /notifications/:wallet/read-all

Mark all notifications as read for a wallet.

---

## Email Management

**Base path:** `/api/v1/email`

### POST /email/register

Register email for notifications with verification.

**Authentication:** Required

### GET /email/verify

Verify email using token from verification email.

### POST /email/status

Get email status for authenticated wallet.

**Authentication:** Required

### PUT /email/preferences

Update email preferences (registration, marketplace, renewal, marketing flags).

**Authentication:** Required

### GET /email/unsubscribe

Unsubscribe from all emails using token.

### DELETE /email

Delete email registration.

**Authentication:** Required

---

## SDK Integration

For TypeScript/JavaScript integration, see the [HSR Resolver SDK](./hsr-resolver-sdk.ts).

## Security

For security considerations and audit information, see [SECURITY_AUDIT.md](./SECURITY_AUDIT.md).

## Wallet Integration

For wallet integration details, see [WALLET_INTEGRATION.md](./WALLET_INTEGRATION.md).
