# HSR Wallet Integration Guide

Integrate Halcyon Subdomain Registry (HSR) address resolution into your wallet to allow users to send FLR to human-readable names like `alice.cryptofans` instead of hex addresses.

## Overview

HSR provides ENS-compatible address resolution for Handshake TLD subdomains on Flare Network.

**Example:**
- User enters: `alice.cryptofans`
- Wallet resolves to: `0x1234567890123456789012345678901234567890`
- Transaction sent to resolved address

## Contract Addresses

### Coston2 Testnet (Chain ID: 114)

| Contract | Address |
|----------|---------|
| HSRRegistry | `0x900C2f2f9a89Cb62Af702611FF77c9F6Ef8dfd38` |
| HSRResolver | `0x7C0eA7094Be2caCB238D042b386B11ec24892Fb1` |

### Flare Mainnet (Chain ID: 14)

| Contract | Address |
|----------|---------|
| HSRRegistry | *Coming Soon* |
| HSRResolver | *Coming Soon* |

## Quick Start

### Option 1: Direct Resolver Call (Recommended)

The simplest integration - call `resolveAddress()` with the domain name:

```javascript
import { ethers } from "ethers";

const HSR_RESOLVER = "0x7C0eA7094Be2caCB238D042b386B11ec24892Fb1";
const RESOLVER_ABI = [
  "function resolveAddress(string calldata fqdn) external view returns (address)"
];

async function resolveHSR(fqdn) {
  const provider = new ethers.JsonRpcProvider("https://coston2-api.flare.network/ext/C/rpc");
  const resolver = new ethers.Contract(HSR_RESOLVER, RESOLVER_ABI, provider);

  const address = await resolver.resolveAddress(fqdn.toLowerCase());

  if (address === ethers.ZeroAddress) {
    throw new Error("Domain not found");
  }

  return address;
}

// Usage
const recipient = await resolveHSR("alice.cryptofans");
console.log(recipient); // 0x1234...
```

### Option 2: API Resolution

For wallets that prefer HTTP APIs:

```javascript
async function resolveViaAPI(fqdn) {
  const response = await fetch(`https://api.halcyon.domains/api/v1/resolve/${fqdn}`);
  const data = await response.json();

  if (!data.address) {
    throw new Error("Domain not found");
  }

  return data.address;
}
```

**API Response:**
```json
{
  "fqdn": "alice.cryptofans",
  "address": "0x1234567890123456789012345678901234567890",
  "source": "on-chain",
  "verified": true,
  "resolver": "0x7C0eA7094Be2caCB238D042b386B11ec24892Fb1",
  "tokenId": 42
}
```

## Full Contract ABIs

### HSRResolver ABI

```json
[
  {
    "inputs": [{"name": "fqdn", "type": "string"}],
    "name": "resolveAddress",
    "outputs": [{"name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "node", "type": "bytes32"}],
    "name": "addr",
    "outputs": [{"name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "node", "type": "bytes32"},
      {"name": "coinType", "type": "uint256"}
    ],
    "name": "addr",
    "outputs": [{"name": "", "type": "bytes"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "node", "type": "bytes32"},
      {"name": "key", "type": "string"}
    ],
    "name": "text",
    "outputs": [{"name": "", "type": "string"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "node", "type": "bytes32"}],
    "name": "hasAddress",
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  }
]
```

### HSRRegistry ABI

```json
[
  {
    "inputs": [{"name": "fqdn", "type": "string"}],
    "name": "getRecordByFQDN",
    "outputs": [
      {"name": "owner", "type": "address"},
      {"name": "resolver", "type": "address"},
      {"name": "tokenId", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "fqdn", "type": "string"}],
    "name": "computeNamehash",
    "outputs": [{"name": "", "type": "bytes32"}],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [{"name": "node", "type": "bytes32"}],
    "name": "resolver",
    "outputs": [{"name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "node", "type": "bytes32"}],
    "name": "owner",
    "outputs": [{"name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  }
]
```

## Multi-Chain Address Support (EIP-2304)

HSR supports multi-chain addresses following EIP-2304. Coin types:

| Chain | Coin Type | Constant |
|-------|-----------|----------|
| Flare (FLR) | `2147483662` | `0x80000000 \| 14` |
| Ethereum (ETH) | `60` | Standard |
| Bitcoin (BTC) | `0` | Standard |

```javascript
const COINTYPE_FLR = 2147483662n; // 0x80000000 | 14
const COINTYPE_ETH = 60n;

// Get address for specific chain
const flrAddress = await resolver["addr(bytes32,uint256)"](namehash, COINTYPE_FLR);
const ethAddress = await resolver["addr(bytes32,uint256)"](namehash, COINTYPE_ETH);
```

## Namehash Computation

If you need to compute the namehash yourself (for advanced use cases):

```javascript
import { keccak256, toUtf8Bytes, concat, hexlify } from "ethers";

function namehash(name) {
  if (!name) return "0x" + "00".repeat(32);

  const labels = name.toLowerCase().split(".").reverse();
  let node = "0x" + "00".repeat(32);

  for (const label of labels) {
    const labelHash = keccak256(toUtf8Bytes(label));
    node = keccak256(concat([node, labelHash]));
  }

  return node;
}

// Example
const hash = namehash("alice.cryptofans");
// 0x...
```

## Text Records

HSR supports text records for additional metadata:

```javascript
// Common text record keys
const keys = ["url", "avatar", "description", "email", "twitter", "github"];

// Get text record
const url = await resolver.text(namehash, "url");
const avatar = await resolver.text(namehash, "avatar");
```

## Integration Patterns

### Pattern 1: Send Transaction Flow

```javascript
async function sendToHSRDomain(fqdn, amount) {
  // 1. Check if input looks like a domain
  if (fqdn.includes(".") && !fqdn.startsWith("0x")) {
    // 2. Resolve the domain
    const resolved = await resolveHSR(fqdn);

    // 3. Show confirmation to user
    const confirmed = await showConfirmation(
      `Send ${amount} FLR to ${fqdn}?`,
      `Resolves to: ${resolved}`
    );

    if (!confirmed) return;

    // 4. Send transaction
    return await sendTransaction(resolved, amount);
  }

  // Regular address
  return await sendTransaction(fqdn, amount);
}
```

### Pattern 2: Address Input Validation

```javascript
function isHSRDomain(input) {
  // HSR domains are subdomain.tld format
  const parts = input.split(".");
  return parts.length === 2 &&
         !input.startsWith("0x") &&
         parts[0].length > 0 &&
         parts[1].length > 0;
}

async function validateRecipient(input) {
  if (ethers.isAddress(input)) {
    return { type: "address", value: input };
  }

  if (isHSRDomain(input)) {
    try {
      const resolved = await resolveHSR(input);
      return { type: "hsr", value: resolved, domain: input };
    } catch {
      return { type: "invalid", error: "Domain not found" };
    }
  }

  return { type: "invalid", error: "Invalid address or domain" };
}
```

### Pattern 3: Auto-Complete / Suggestions

```javascript
// For wallets with address book features
async function lookupDomain(partialName, tld = "cryptofans") {
  // This would query your backend for matching domains
  const response = await fetch(
    `https://api.halcyon.domains/api/v1/search?q=${partialName}&tld=${tld}`
  );
  return response.json();
}
```

## Error Handling

```javascript
async function safeResolve(fqdn) {
  try {
    const address = await resolveHSR(fqdn);

    if (address === ethers.ZeroAddress) {
      return { success: false, error: "DOMAIN_NOT_FOUND" };
    }

    return { success: true, address };
  } catch (error) {
    if (error.code === "CALL_EXCEPTION") {
      return { success: false, error: "CONTRACT_ERROR" };
    }
    if (error.code === "NETWORK_ERROR") {
      return { success: false, error: "NETWORK_ERROR" };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}
```

## Supported TLDs

HSR currently supports these authoritative Handshake TLDs:

- `cryptofans`
- `aisoftwaredesign`
- `aiworktools`
- `testzone`
- `cryptomusic`
- `cryptodnd`
- `nflapps`
- `sexyness`

Additional TLDs can be staked by any Handshake TLD owner via the V2 staking system (FDC attestation).

## Testing

### Testnet Domains

Use these test domains on Coston2:

| Domain | Resolves To |
|--------|-------------|
| `jellybelly.cryptofans` | Owner's address |
| `test*.cryptofans` | Test addresses |

### Test Your Integration

```bash
# Test API resolution
curl https://api.halcyon.domains/api/v1/resolve/jellybelly.cryptofans

# Test on Coston2
cast call 0x7C0eA7094Be2caCB238D042b386B11ec24892Fb1 \
  "resolveAddress(string)(address)" "jellybelly.cryptofans" \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc
```

## Security Considerations

1. **Always display the resolved address** to users before sending transactions
2. **Cache resolutions** to reduce RPC calls, but invalidate on transaction
3. **Handle failures gracefully** - don't allow transactions if resolution fails
4. **Verify domain ownership** hasn't changed for high-value transactions

## Support

- Documentation: https://docs.halcyon.domains
- API Status: https://api.halcyon.domains/api/v1/health
- GitHub: https://github.com/halcyon-domains
- Discord: https://discord.gg/halcyon

## Changelog

- **v1.0.0** (2026-01-20): Initial release with Coston2 testnet support
