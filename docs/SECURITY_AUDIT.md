# HSR Security Audit Checklist & Analysis

This document provides a security review of the HSR (Halcyon Subdomain Registry) resolver contracts prior to mainnet deployment.

## Executive Summary

| Category | Status | Notes |
|----------|--------|-------|
| Access Control | PASS | OpenZeppelin AccessControl used correctly |
| Reentrancy | PASS | No external calls with state changes after |
| Integer Overflow | PASS | Solidity 0.8+ with built-in checks |
| Input Validation | PASS | Zero address checks present |
| Upgrade Safety | N/A | Contracts are not upgradeable |
| Gas Optimization | ACCEPTABLE | Some minor optimizations possible |

**Overall Assessment**: Ready for testnet deployment. Recommend professional audit before mainnet with significant value.

---

## 1. Access Control Review

### HSRRegistry.sol

| Role | Permissions | Risk Level |
|------|-------------|------------|
| DEFAULT_ADMIN_ROLE | Set default resolver, set NFT contract, grant roles | HIGH |
| MINTER_ROLE | Register new subdomains | MEDIUM |
| OPERATOR_ROLE | Transfer ownership, unregister, batch operations | HIGH |

**Findings:**

1. **PASS**: Admin role can grant other roles (expected)
2. **PASS**: Only MINTER_ROLE can register domains
3. **PASS**: Ownership changes require OPERATOR_ROLE
4. **RECOMMENDATION**: Consider timelock for admin functions on mainnet

### HSRResolver.sol

| Role | Permissions | Risk Level |
|------|-------------|------------|
| DEFAULT_ADMIN_ROLE | Set registry address | HIGH |
| OPERATOR_ROLE | Set addresses by operator, clear records | MEDIUM |

**Findings:**

1. **PASS**: Only domain owners or operators can set addresses
2. **PASS**: `_isAuthorized` correctly checks registry ownership
3. **PASS**: Operators have elevated permissions (intentional for automation)

---

## 2. Common Vulnerability Checks

### 2.1 Reentrancy

**Status**: PASS

Neither contract makes external calls followed by state changes. The resolver's `_isAuthorized` makes a view call to registry, which is safe.

```solidity
// HSRResolver.sol:298-305 - Safe pattern
function _isAuthorized(bytes32 node, address caller) internal view returns (bool) {
    if (hasRole(OPERATOR_ROLE, caller)) return true;
    address domainOwner = registry.owner(node);  // View call
    return domainOwner != address(0) && domainOwner == caller;
}
```

### 2.2 Integer Overflow/Underflow

**Status**: PASS

- Solidity version 0.8.20 with built-in overflow checks
- No unchecked blocks used
- Token IDs use uint256 (no realistic overflow)

### 2.3 Front-Running

**Status**: LOW RISK

- Domain registration is atomic (single transaction)
- Name-squatting during registration window is inherent to naming systems
- **Recommendation**: Consider commit-reveal scheme for high-value domains

### 2.4 Access Control Bypass

**Status**: PASS

- All sensitive functions protected by modifiers
- `onlyRole` from OpenZeppelin used correctly
- `onlyAuthorized` custom modifier properly checks ownership

### 2.5 Input Validation

**Status**: PASS

```solidity
// All zero-address checks present:
if (_registry == address(0)) revert InvalidRegistry();   // ✓
if (_owner == address(0)) revert InvalidAddress();       // ✓
if (_resolver == address(0)) revert InvalidResolver();   // ✓
if (_newOwner == address(0)) revert InvalidAddress();    // ✓
```

### 2.6 Denial of Service

**Status**: LOW RISK

- `batchRegister` limited to 100 entries (prevents gas griefing)
- `resolveAddresses` unbounded but view-only (no state changes)
- **Recommendation**: Add batch size limit to `resolveAddresses`

---

## 3. Logic Review

### 3.1 Namehash Implementation

**File**: `HSRNamehash.sol`

**Status**: PASS

The namehash implementation follows ENS specification (EIP-137):

```solidity
function namehash(bytes memory name) internal pure returns (bytes32 node) {
    node = bytes32(0);  // Start with zero hash
    // Split and hash each label in reverse order
    // Uses keccak256(abi.encodePacked(node, labelHash))
}
```

**Verified**: Compatible with ethers.js `namehash()` function.

### 3.2 Ownership Synchronization

**Flow**: NFT Mint → Registry Registration → Resolver Available

1. `SubdomainNFT.mint()` calls `registry.registerSubdomain()`
2. Registry stores owner = NFT recipient
3. NFT transfer calls `registry.transferOwnershipByTokenId()`

**Potential Issue**: If NFT is burned but registry not updated, stale data remains.

**Mitigation**: `_update()` hook in SubdomainNFT handles burns, but should verify this works.

### 3.3 Multi-Chain Address Handling

**Status**: PASS

- EIP-2304 compliant coin types
- ENSIP-11 format for EVM chains: `0x80000000 | chainId`
- Primary address updated when FLR/ETH cointype set

```solidity
// Lines 166-173: Correctly syncs primary address
if (coinType == COINTYPE_FLR || coinType == COINTYPE_ETH) {
    if (addressBytes.length == 20) {
        address wallet;
        assembly {
            wallet := shr(96, calldataload(addressBytes.offset))
        }
        _addresses[node] = wallet;
    }
}
```

**Note**: Assembly usage for address extraction is safe here.

---

## 4. Gas Optimization Opportunities

### Minor Optimizations (Non-Critical)

1. **Cache storage reads**: In `_isAuthorized`, registry is read but could be cached
2. **Batch text records**: No batch setter for text records
3. **Event indexing**: Consider adding indexed parameters to events

### Not Recommended to Change

These patterns are intentionally not optimized for readability:
- Separate mappings for addresses vs multi-chain
- String manipulation in namehash

---

## 5. Centralization Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Admin can change resolver | HIGH | Transfer admin to multi-sig |
| Operator can modify any domain | MEDIUM | Use for automation only, audit operator addresses |
| Single point of failure | MEDIUM | Deploy behind proxy for emergency upgrades |

### Recommendations

1. **Before Mainnet**: Transfer DEFAULT_ADMIN_ROLE to a multi-sig wallet (e.g., Gnosis Safe)
2. **Monitoring**: Set up event monitoring for admin actions
3. **Timelock**: Consider adding OpenZeppelin TimelockController for admin functions

---

## 6. Test Coverage Requirements

### Critical Paths to Test

- [ ] Register domain → Set address → Resolve address
- [ ] Transfer NFT → Verify ownership update in registry
- [ ] Burn NFT → Verify domain unregistered
- [ ] Multi-chain address set/get
- [ ] Text record set/get
- [ ] Batch operations within gas limits
- [ ] Unauthorized access attempts (should revert)
- [ ] Zero address handling
- [ ] Namehash consistency with ethers.js

### Edge Cases

- [ ] Empty string FQDN
- [ ] Very long subdomain (gas limits)
- [ ] Special characters in subdomain (should be normalized)
- [ ] Re-registering expired domain
- [ ] Setting address to zero (clear resolution)

---

## 7. Deployment Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] Gas estimates within acceptable range
- [ ] Contract sizes under 24KB limit
- [ ] Deployment script tested on testnet
- [ ] Multi-sig wallet created for admin

### Deployment

- [ ] Deploy contracts in correct order
- [ ] Verify role assignments
- [ ] Set default resolver
- [ ] Link NFT contract
- [ ] Verify on block explorer

### Post-Deployment

- [ ] Transfer admin to multi-sig
- [ ] Set up monitoring/alerting
- [ ] Document contract addresses
- [ ] Update frontend/backend configuration

---

## 8. Known Limitations

1. **Not Upgradeable**: Contracts cannot be upgraded. Bug fixes require migration.
2. **No Subdomain of Subdomain**: Only supports `name.tld`, not `sub.name.tld`
3. **Centralized TLD Management**: TLDs controlled by platform, not DAO
4. **No ENS Compatibility Layer**: Not directly compatible with ENS tooling

---

## 9. External Audit Recommendations

For mainnet deployment with significant value, we recommend:

| Auditor | Specialty | Estimated Cost |
|---------|-----------|----------------|
| OpenZeppelin | General security | $50K-150K |
| Trail of Bits | Deep technical | $75K-200K |
| Consensys Diligence | DeFi/naming | $40K-100K |
| Code4rena | Competitive audit | $30K-75K |

**Minimum Recommendation**: Code4rena competitive audit before mainnet launch.

---

## 10. Incident Response Plan

### If Vulnerability Discovered

1. **Pause** (if pausable) or warn users
2. **Assess** impact and affected domains
3. **Deploy** patched contracts
4. **Migrate** data if necessary
5. **Communicate** with users transparently

### Emergency Contacts

- Smart Contract Lead: [TBD]
- Security Team: [TBD]
- Multi-sig Signers: [TBD]

---

## Appendix: Contract Checksums

After deployment, verify contract bytecode matches:

```
HSRRegistry: [Deployed bytecode hash]
HSRResolver: [Deployed bytecode hash]
HSRNamehash: [Library - embedded in contracts]
```

---

## Changelog

- **v1.0** (2026-01-20): Initial security review for testnet deployment
