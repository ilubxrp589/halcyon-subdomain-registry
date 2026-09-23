# Resolver SDK — @halcyon/resolver-sdk

## Overview

TypeScript SDK for third-party developers to resolve Handshake subdomains to Flare addresses. This is HSR's first public-facing package and the credibility play for the ecosystem.

**npm package:** `@halcyon/resolver-sdk`
**Peer dependency:** `ethers@^6.0.0`

## Core Functionality

### Forward Resolution (name → address)
```typescript
import { HSRResolver } from "@halcyon/resolver-sdk";
const resolver = new HSRResolver();
const address = await resolver.resolve("wallet.cryptofans");
// => "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18"
```

### Reverse Resolution (address → name)
```typescript
const name = await resolver.reverse("0x742d35...");
// => "wallet.cryptofans"
```

### Resolution with Metadata
```typescript
const result = await resolver.resolveWithMeta("wallet.cryptofans");
// => { address, label, parent, tokenId, owner, tier }
```

## Configuration

```typescript
const resolver = new HSRResolver({
  rpcUrl: "https://coston2-api.flare.network/ext/C/rpc",
  contracts: {
    resolver: "0x7C0eA7094Be2caCB238D042b386B11ec24892Fb1",
    nft: "0x1a6830B495Cd0f6dd8996c7d561EFa7868253398",
    oracle: "0xfCf8c862933b23fbFE99a30EfFB8FF867a8e55A1",
  },
  cacheTTL: 30000,   // ms, default 60000
  retries: 3,        // default 3
  signer: undefined, // ethers Signer for write operations
});
```

## Write Operations (Requires Signer)

```typescript
import { ethers } from "ethers";
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

const resolver = new HSRResolver({ signer });

// Set forward record
await resolver.setRecord("wallet.cryptofans", "0xNewAddr...");

// Set reverse record (primary name for this address)
await resolver.setReverse("wallet.cryptofans");
```

## Error Types

- `UnauthorizedError` — caller doesn't own the subdomain NFT
- `NetworkError` — RPC connection failed
- `NotFoundError` — subdomain doesn't exist
- `ResolverError` — generic resolver error with code

## API Client (Off-chain)

The SDK also includes an API client for off-chain queries (search, availability, pricing) that don't require blockchain interaction:

```typescript
const api = resolver.api; // or new HSRApiClient({ baseUrl })
const available = await api.checkAvailability("wallet", "cryptofans");
const searchResults = await api.search("wallet");
const price = await api.getPrice("wallet", "cryptofans");
```

## Development Notes

- **Always test on Coston2 first** — never deploy SDK changes against mainnet without approval
- The SDK wraps the on-chain HSRResolver contract — read the actual ABI before modifying
- Contract function signatures may differ from examples — verify against deployed bytecode
- Reverse resolution only works if the owner has explicitly set their primary name
- Cache invalidation: consider emitting events when records change
