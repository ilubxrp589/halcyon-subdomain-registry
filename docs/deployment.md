# Deployment Guide

## Environments

| Environment | Network | Purpose |
|-------------|---------|---------|
| Local | localhost | Development, unit tests |
| Testnet | Coston2 (Chain ID 114) | Integration testing, QA |
| Mainnet | Flare (Chain ID 14) | Production |

---

## Local → Coston2 (Testnet Deployment)

### Pre-Deployment Checklist
- [ ] All tests pass locally
- [ ] Contract compiles without warnings
- [ ] ABI files are up to date
- [ ] Environment variables set for Coston2
- [ ] Deployer wallet has testnet FLR (faucet: https://faucet.flare.network)

### Contract Deployment Steps
```bash
# 1. Compile contracts
npx hardhat compile

# 2. Run tests
npx hardhat test

# 3. Deploy to Coston2
npx hardhat run scripts/deploy.js --network coston2

# 4. Record ALL deployed addresses
# Update: .env, docs/flare-integration.md, .claude/rules/stack.md

# 5. Verify on explorer
npx hardhat verify --network coston2 CONTRACT_ADDRESS CONSTRUCTOR_ARGS
```

### Post-Deployment Verification
- [ ] All contracts deployed and verified on explorer
- [ ] Contract addresses updated everywhere (env, docs, rules)
- [ ] Event listeners reconnected to new contract addresses
- [ ] Test a full registration flow end-to-end
- [ ] Test DNS resolution works
- [ ] Test NFT minting and metadata
- [ ] Test wallet resolution (forward + reverse)
- [ ] Save memory snapshot with new addresses

---

## V2 TLD Staking Deployment (Foundry)

The V2 system uses Foundry for compilation and deployment. It includes UUPS proxy contracts that can be upgraded.

### V2 Contract Deployment Steps
```bash
# 1. Compile with Foundry
forge build

# 2. Run Foundry tests
forge test -vvv

# 3. Deploy V2 system to Coston2
npx hardhat run scripts/deploy-tld-staking.js --network coston2

# 4. Record ALL addresses (stored in deployments/coston2-tld-staking.json)
# Update: .env, docs/flare-integration.md, frontend .env.local

# 5. Verify on explorer
npx hardhat verify --network coston2 CONTRACT_ADDRESS CONSTRUCTOR_ARGS
```

### V2 Proxy Upgrade Steps (UUPS)
```bash
# Upgrade TldClaimManager (example)
npx hardhat run scripts/upgrade-tldclaimmanager-phase2.js --network coston2

# Upgrade SldRegistrationManager
npx hardhat run scripts/upgrade-sld-reg-manager.js --network coston2

# Deploy PaymentManagerV2 (new contract, swap in SldRegistrationManager)
npx hardhat run scripts/deploy-payment-manager-v2.js --network coston2
```

### V2 Post-Deployment Verification
- [ ] All 13+ contracts deployed and recorded in `deployments/coston2-tld-staking.json`
- [ ] UUPS proxy implementations verified
- [ ] stakingListener connected to new contract addresses
- [ ] FDC Keeper Bot running and attesting
- [ ] Test TLD staking flow end-to-end (FDC attestation → mint)
- [ ] Test SLD registration via commit-reveal
- [ ] Test renewal pricing via FtsoOracle
- [ ] Frontend `/stake` and `/register-v2` pages working

---

## Coston2 → Flare Mainnet

### ⚠️ CRITICAL — This is Real Money

**DO NOT deploy to mainnet without explicit user approval.**

### Pre-Mainnet Checklist

#### Smart Contracts
- [ ] All contracts audited (self-audit minimum, professional audit preferred)
- [ ] No known vulnerabilities
- [ ] Upgrade/pause mechanism in place (can pause if something goes wrong)
- [ ] Admin functions are protected (onlyOwner or similar)
- [ ] Gas costs estimated and acceptable for mainnet
- [ ] Constructor arguments documented and verified

#### Backend
- [ ] All API endpoints tested against Coston2 deployment
- [ ] Error handling covers all edge cases
- [ ] Rate limiting active
- [ ] Logging captures all critical operations
- [ ] Database backed up before mainnet switch

#### DNS
- [ ] volume-resolver container tested with realistic load
- [ ] DoH endpoint (dns.halcyon-names.io) responding correctly
- [ ] hsd running with `no-sig0: true` and accessible from container
- [ ] Own authoritative zones resolving (testzone, cryptofans, etc.)
- [ ] Handshake third-party TLDs resolving (nb, woodburn, etc.)
- [ ] NS records configured for TLDs

#### Frontend
- [ ] Chain ID detection — auto-switch to Flare mainnet
- [ ] User-facing error messages are clear
- [ ] Transaction confirmation UI works
- [ ] Price display is accurate (FTSO mainnet feeds)

#### Infrastructure
- [ ] Monitoring in place (uptime, error rates, tx failures)
- [ ] Alerting configured (gets your attention if something breaks)
- [ ] Backup strategy documented
- [ ] Rollback plan documented

### Mainnet Deployment Steps
```bash
# 1. FINAL test pass on Coston2
npx hardhat test

# 2. Deploy to Flare mainnet
npx hardhat run scripts/deploy.js --network flare

# 3. Record ALL addresses — this is permanent
# Update: .env.production, all docs

# 4. Verify on Flare explorer
npx hardhat verify --network flare CONTRACT_ADDRESS CONSTRUCTOR_ARGS

# 5. Update backend to point at mainnet contracts
# 6. Update frontend chain ID to 14
# 7. Test with small real transaction
```

### Post-Mainnet Launch
- [ ] Monitor first 10 registrations closely
- [ ] Watch for failed transactions
- [ ] Verify royalty splits are correct
- [ ] Confirm DNS records go live for real registrations
- [ ] Save memory snapshot: "MAINNET LIVE" with all addresses and status

---

## Rollback Plan

If something goes wrong on mainnet:

1. **Pause contracts** — call pause() if implemented
2. **Stop event listeners** — prevent database state from getting more out of sync
3. **Investigate** — check transaction logs, contract state, database
4. **Fix** — deploy patched contract or fix backend
5. **Resume** — unpause, restart listeners, verify with test transaction

---

## Environment Variable Templates

### Coston2 (.env.testnet)
```
FLARE_RPC_URL=https://coston2-api.flare.network/ext/C/rpc
CHAIN_ID=114
CONTRACT_RESOLVER=0x...
CONTRACT_NFT=0x...
CONTRACT_ORACLE=0x...
```

### Flare Mainnet (.env.production)
```
FLARE_RPC_URL=https://flare-api.flare.network/ext/C/rpc
CHAIN_ID=14
CONTRACT_RESOLVER=0x...
CONTRACT_NFT=0x...
CONTRACT_ORACLE=0x...
```
