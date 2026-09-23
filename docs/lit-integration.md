# Lit Protocol Integration

## Overview

Lit Protocol adds decentralized key management, token-gating, encryption, seedless onboarding, and programmable signing to HSR. It **complements** the existing WalletConnect v2 + nonce-signature auth — it does not replace it.

## Architecture Decisions

### Additive, Not Replacement
- Existing wallet-signature auth (WalletConnect v2 + MetaMask) stays in place
- Lit is a parallel auth path for advanced features
- Users who already have wallets continue using the current flow unchanged

### Dual-Path Auth Middleware
The backend `auth.js` middleware gains a second verification path:

```
Request arrives
  ├── Has x-lit-session-sig header? → Verify via Lit SDK → Set req.litSession
  ├── Has x-api-key header? → Verify via apiKey middleware → Set req.apiKey
  └── Default → Verify wallet nonce-signature → Set req.authenticatedWallet
```

All three paths produce the same downstream result: an authenticated wallet address attached to the request. DNS management, NFT operations, and record updates work identically regardless of auth method.

### Singleton Clients
- **Backend:** `backend/src/services/litProtocol.js` — single LitNodeClient instance, lazy-initialized on first use
- **Frontend:** `frontend/hooks/useLitProtocol.ts` — React hook wrapping LitNodeClient with connection management
- Both use `LIT_NETWORK` env var (`cayenne` for testnet, `manzano`/`habanero` for production)

## Gate-0: Flare Compatibility Verification

**This must pass before any implementation begins.**

Flare Network (Chain ID 14 mainnet, 114 Coston2 testnet) is NOT explicitly listed in Lit Protocol's supported chains. Verification steps:

### What to Test
1. **ERC-721 state reads on Coston2** — Can Lit's access control conditions query `ownerOf()` on the SubdomainNFT contract (`0x1a6830B495Cd0f6dd8996c7d561EFa7868253398`) via Coston2 RPC?
2. **PKP signing against Coston2** — Can a PKP sign transactions targeting Coston2 RPC (`https://coston2-api.flare.network/ext/C/rpc`)?
3. **Custom chain configuration** — If Flare isn't natively supported, can it be added via `@lit-protocol/constants` custom chain config (chain ID, RPC, block explorer)?

### How to Test
```typescript
import { LitNodeClient } from '@lit-protocol/lit-node-client';
import { LIT_NETWORK } from '@lit-protocol/constants';

const client = new LitNodeClient({ litNetwork: LIT_NETWORK.Cayenne });
await client.connect();

// Test 1: Access control condition with Coston2 chain
const accessControlConditions = [{
  contractAddress: '0x1a6830B495Cd0f6dd8996c7d561EFa7868253398',
  standardContractType: 'ERC721',
  chain: 'coston2', // or custom chain config
  method: 'balanceOf',
  parameters: [':userAddress'],
  returnValueTest: { comparator: '>', value: '0' }
}];

// If 'coston2' isn't recognized, try custom EVM chain:
const customChain = {
  name: 'Coston2',
  symbol: 'C2FLR',
  decimals: 18,
  chainId: 114,
  rpcUrls: ['https://coston2-api.flare.network/ext/C/rpc'],
  blockExplorerUrls: ['https://coston2-explorer.flare.network']
};
```

### If Gate-0 Fails
- Defer entire Lit Protocol integration
- File issue/feature request with Lit Protocol team for Flare support
- Re-evaluate when Lit adds Flare or provides custom chain API
- Consider alternative: use Lit on a supported chain (Ethereum/Polygon) for encryption only, with Flare remaining the settlement layer

## Phase 1: Foundation

### Packages to Install

**Backend:**
```bash
npm install @lit-protocol/lit-node-client @lit-protocol/constants @lit-protocol/auth-helpers
```

**Frontend:**
```bash
npm install @lit-protocol/lit-node-client @lit-protocol/constants @lit-protocol/auth-helpers
```

### New Files

| File | Purpose |
|------|---------|
| `backend/src/services/litProtocol.js` | Singleton LitNodeClient, session management, access control helpers |
| `frontend/hooks/useLitProtocol.ts` | React hook for Lit client connection and session management |
| `docs/lit-integration.md` | This file |

### Environment Variables

```
LIT_NETWORK=cayenne          # cayenne (testnet), manzano, habanero (production)
LIT_DEBUG=false              # Enable Lit SDK debug logging
```

Add to `backend/src/config/index.js` and frontend env.

## Phase 2: Token-Gated Access

### Use Case: Encrypted DNS Records
NFT holders can encrypt sensitive DNS configuration (e.g., private TXT records, API gateway routes) so only the subdomain owner can decrypt.

```
Encrypt: User encrypts DNS data → Lit encrypts with ERC-721 condition → Store ciphertext in PostgreSQL
Decrypt: User requests DNS data → Verify NFT ownership via Lit → Decrypt and return
```

### Access Control Conditions

```typescript
// Basic: user owns any SubdomainNFT
const ownsAnyNFT = [{
  contractAddress: CONTRACT_NFT,
  standardContractType: 'ERC721',
  chain: 'coston2',
  method: 'balanceOf',
  parameters: [':userAddress'],
  returnValueTest: { comparator: '>', value: '0' }
}];

// Specific: user owns THIS subdomain's NFT
const ownsSpecificNFT = [{
  contractAddress: CONTRACT_NFT,
  standardContractType: 'ERC721',
  chain: 'coston2',
  method: 'ownerOf',
  parameters: [':tokenId'],
  returnValueTest: { comparator: '=', value: ':userAddress' }
}];

// Tiered: user owns NFT with specific attribute (e.g., premium tier)
// Requires custom contract method or Lit Action
```

### Dual-Path Auth in `useAuth.ts`

The existing `useAuth.ts` hook gains an optional Lit session path:

```typescript
// Existing: wallet signature auth (unchanged)
const { authenticate, isAuthenticated } = useAuth();

// New: Lit session auth (parallel path)
const { litSession, authenticateWithLit } = useLitProtocol();

// Both produce a valid session the backend accepts
```

## Phase 3: PKP Seedless Onboarding

### Use Case: Non-Crypto Users
Users without MetaMask or crypto experience can register subdomains using Google login or email. A PKP (Programmable Key Pair) is created behind the scenes, acting as their Flare wallet.

### Auth Flow

```
1. User clicks "Sign in with Google" (or enters email)
2. OAuth/OTP verification via Lit auth-client
3. Lit mints PKP bound to that social identity (first time)
   — or fetches existing PKP (returning user)
4. PKP signs Flare transactions transparently
5. User registers subdomain, receives NFT — never sees a seed phrase
```

### PKP Wallet Adapter

The PKP wallet adapter must expose the same interface as ethers.js v6 `BrowserProvider.getSigner()` so existing code works unchanged:

```typescript
interface HSRSigner {
  getAddress(): Promise<string>;
  signMessage(message: string): Promise<string>;
  sendTransaction(tx: TransactionRequest): Promise<TransactionResponse>;
}

// MetaMask path:
const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();

// PKP path:
const signer = new PKPWalletAdapter(pkpPublicKey, litNodeClient);

// Both implement HSRSigner — downstream code doesn't care which
```

### Account Migration
Users who start with a PKP (Google login) can later migrate to a self-custodied wallet:
1. Connect external wallet (MetaMask/WalletConnect)
2. Transfer NFTs from PKP address to external wallet
3. Update DNS record ownership
4. Optional: keep PKP as backup signer

## Phase 4: Automation & Cross-Chain

### Lit Actions for Auto-Renewal
Serverless JavaScript functions running inside Lit nodes. A platform-owned PKP can automatically renew subdomains when users opt in:

```
1. User opts into auto-renewal in dashboard
2. User pre-approves FLR spending (ERC-20 approve or native FLR escrow)
3. Lit Action runs on schedule (triggered by cron or block listener)
4. Checks if subdomain is approaching expiry
5. PKP signs renewal transaction on Flare
6. Subdomain extended, event logged
```

### Cross-Chain PKP Signing
PKPs use ECDSA secp256k1 — compatible with both Flare and XRP Ledger. A single PKP can:
- Sign Flare transactions (subdomain management)
- Sign XRP Ledger transactions (future payment support)
- Sign on any EVM chain (future multi-chain expansion)

## Security Considerations

- **PKP key shares** are distributed across Lit nodes — no single point of compromise
- **Session signatures** expire — configure reasonable TTLs (default: 10 minutes)
- **Access control conditions** are evaluated on-chain — tamper-proof
- **Lit Actions** run in TEE (Trusted Execution Environment) — code integrity guaranteed
- **Social auth binding** means a compromised Google account = compromised PKP. Document this risk for users and recommend 2FA.
- **Never store Lit session signatures** in localStorage for extended periods — treat like JWTs

## Relevant Existing Code

| File | Relevance |
|------|-----------|
| `frontend/hooks/useAuth.ts` | Existing wallet auth — Lit sessions added alongside |
| `frontend/hooks/useAdminAuth.ts` | Admin auth — may need Lit path for admin PKPs |
| `frontend/lib/web3modal.tsx` | WalletConnect config — PKP adapter added here |
| `frontend/components/WalletButton.tsx` | Connect UI — expanded with Google/Email options |
| `backend/src/middleware/auth.js` | Auth middleware — dual-path Lit verification added |
| `backend/src/middleware/apiKey.js` | API key auth — remains separate, not affected |
| `backend/src/services/walletService.js` | Wallet management — PKP wallets registered here |
| `backend/src/config/index.js` | Config — LIT_NETWORK env var added |

## References

- [Lit Protocol Docs](https://developer.litprotocol.com/)
- [Lit SDK v7 Access Control](https://developer.litprotocol.com/sdk/access-control/intro)
- [PKP Authentication](https://developer.litprotocol.com/sdk/wallets/auth-methods)
- [Lit Actions](https://developer.litprotocol.com/sdk/serverless-signing/overview)
- [Custom EVM Chains](https://developer.litprotocol.com/resources/supported-chains)
