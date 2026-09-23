# HSR — Smart Contract Specifications

## Framework & Tooling

- **Solidity:** ^0.8.25
- **Framework:** Foundry (forge, forge script, forge test)
- **Proxy Pattern:** UUPS or TransparentUpgradeableProxy (OpenZeppelin)
- **Dependencies:** OpenZeppelin Contracts (ERC-721, Upgradeable, AccessControl)
- **Reference Code:** https://github.com/namebasehq/handshake-contracts (MIT license)

## Contract List

### Core Contracts

#### 1. HsrTld.sol (ERC-721, Upgradeable)
```
Purpose: TLD NFT representing Handshake TLD ownership rights on Flare

Storage:
  mapping(bytes32 => uint256) namehashToTokenId
  mapping(uint256 => bytes32) tokenIdToNamehash
  mapping(uint256 => string) tokenIdToLabel     // "coolname"
  mapping(bytes32 => address) registrationStrategy  // pricing contract per TLD
  mapping(bytes32 => bool) registrationEnabled   // can SLDs be registered
  mapping(bytes32 => address) resolverAddress     // resolver per TLD
  uint256 nextTokenId

Key Functions:
  mint(address to, string label, bytes32 namehash) → onlyClaimManager
  setRegistrationStrategy(bytes32 namehash, address strategy) → onlyTokenOwner
  setRegistrationEnabled(bytes32 namehash, bool enabled) → onlyTokenOwner
  setResolver(bytes32 namehash, address resolver) → onlyTokenOwner
  getNamehash(string label) → bytes32  // keccak256 of label
  ownerOfNamehash(bytes32 namehash) → address

Modifiers:
  onlyClaimManager — only TldClaimManager can mint
  onlyTokenOwner(bytes32 namehash) — owner or approved

Events:
  TldMinted(uint256 tokenId, string label, bytes32 namehash, address owner)
  RegistrationStrategySet(bytes32 namehash, address strategy)
  RegistrationToggled(bytes32 namehash, bool enabled)
```

#### 2. HsrSld.sol (ERC-721, Upgradeable)
```
Purpose: SLD NFT representing subdomain ownership

Storage:
  struct SldData {
    bytes32 parentNamehash;    // parent TLD
    string label;              // "alice"
    uint256 registrationTime;
    uint256 expiryTime;
    uint256 registrationPrice; // locked for renewal price guarantee
    address resolver;
    string artworkIpfsHash;    // AI artwork CID
    bool artworkGenerated;
  }

  mapping(bytes32 => uint256) sldNamehashToTokenId
  mapping(uint256 => SldData) tokenIdToSldData
  mapping(uint256 => bytes32) tokenIdToNamehash
  uint256 nextTokenId

Key Functions:
  mint(address to, string label, bytes32 parentNamehash, uint256 registrationYears, uint256 price) → onlyRegistrationManager
  renew(bytes32 sldNamehash, uint256 additionalYears) → anyone can renew
  setArtwork(uint256 tokenId, string ipfsHash) → onlyArtworkService
  setResolver(bytes32 sldNamehash, address resolver) → onlyTokenOwner
  isExpired(bytes32 sldNamehash) → bool
  isInGracePeriod(bytes32 sldNamehash) → bool  // 30 days after expiry
  getExpiry(bytes32 sldNamehash) → uint256

Constants:
  GRACE_PERIOD = 30 days
  MAX_REGISTRATION_YEARS = 10

Events:
  SldMinted(uint256 tokenId, string label, bytes32 parentNamehash, bytes32 sldNamehash, address owner, uint256 expiryTime)
  SldRenewed(bytes32 sldNamehash, uint256 newExpiryTime, address renewedBy)
  ArtworkSet(uint256 tokenId, string ipfsHash)
```

#### 3. TldClaimManager.sol (Upgradeable Proxy)
```
Purpose: Manages TLD claims — both operator-direct and FDC-verified

Storage:
  address hsrTldContract
  address fdcHub
  address fdcVerification
  address operatorAddress
  uint256 stakingFeeUsd          // in cents, e.g. 10000 = $100
  address ftsoOracle

  mapping(bytes32 => bool) claimedTlds        // namehash => already claimed
  mapping(bytes32 => PendingClaim) pendingClaims

  struct PendingClaim {
    address claimer;
    string tldLabel;
    bytes32 namehash;
    uint256 stakingFeePaid;
    uint256 fdcRoundId;
    uint256 requestTimestamp;
    bool completed;
  }

Key Functions:
  // Phase 1: Operator direct mint (no FDC needed)
  operatorMint(string label) → onlyOperator
    - Operator mints their own TLDs directly
    - No verification needed (operator is trusted for their own domains)

  // Phase 2: External user staking via FDC
  requestStake(string tldLabel) → payable
    - User pays staking fee in FLR
    - Submits FDC Web2Json attestation request to verify HSD ownership
    - Stores pending claim with fdcRoundId
    - User must have already set TXT record: "flr:<their_flare_address>"

  completeStake(string tldLabel, bytes32[] merkleProof, bytes attestationResponse) → anyone
    - Called after FDC round finalizes (~90-180s)
    - Verifies Merkle proof via FdcVerification contract
    - Decodes attestation response to confirm:
      a) TLD exists and is not expired on Handshake
      b) TXT record contains "flr:<claimer_address>"
    - Mints TLD NFT to claimer

  setStakingFee(uint256 newFeeUsd) → onlyOperator

Events:
  StakeRequested(string tldLabel, address claimer, uint256 fdcRoundId)
  StakeCompleted(string tldLabel, address claimer, uint256 tokenId)
  OperatorMinted(string tldLabel, uint256 tokenId)
```

#### 4. SldRegistrationManager.sol (Upgradeable Proxy)
```
Purpose: Manages all SLD registration and renewal

Storage:
  address hsrSldContract
  address hsrTldContract
  address paymentManager
  address commitIntent
  address globalRules
  address artworkQueueContract

Key Functions:
  // Commit-reveal registration (anti-front-running)
  commitRegistration(bytes32 commitHash)
    - commitHash = keccak256(label, parentNamehash, msg.sender, secret)
    - Store commit with block number

  registerWithCommit(string label, bytes32 parentNamehash, uint256 registrationYears, bytes32 secret) → payable
    - Verify commit exists and is old enough (8+ blocks)
    - Verify commit matches parameters
    - Check label validation
    - Calculate price via RegistrationStrategy
    - Process payment via PaymentManager
    - Mint SLD NFT
    - Emit artwork generation request

  // Signed registration (gasless for user, 1 tx)
  registerWithSignature(string label, bytes32 parentNamehash, uint256 registrationYears, bytes signature) → payable
    - TLD owner pre-signs approval
    - Single transaction registration
    - Still validates and processes payment

  renew(bytes32 sldNamehash, uint256 additionalYears) → payable
    - Anyone can renew any domain
    - Price locked at original registration price (CRITICAL consumer protection)
    - Cannot renew beyond MAX_REGISTRATION_YEARS from now
    - Can renew during grace period

  // Artwork callback
  setArtworkComplete(uint256 tokenId, string ipfsHash) → onlyArtworkService

Events:
  Registered(string label, bytes32 parentNamehash, bytes32 sldNamehash, address owner, uint256 years, uint256 price)
  Renewed(bytes32 sldNamehash, uint256 additionalYears, uint256 newExpiry, address renewedBy)
  ArtworkRequested(uint256 tokenId, string label, bytes32 parentNamehash)
```

#### 5. PaymentManager.sol
```
Purpose: Handles fee distribution

Storage:
  address ftsoOracle
  address platformFeeRecipient   // HSR dev fund
  uint256 platformFeeBps         // 500 = 5%
  mapping(address => uint256) pendingWithdrawals  // pull pattern

Key Functions:
  processPayment(bytes32 tldNamehash, address tldOwner, uint256 priceUsd) → payable
    - Convert USD to FLR via FTSO
    - Verify msg.value >= required FLR amount
    - Split: 95% to tldOwner, 5% to platform
    - Use pull pattern (store balances, owners withdraw)
    - Refund excess

  withdraw() → anyone with balance
    - Withdraw accumulated revenue

  getFlrPrice(uint256 usdCents) → uint256 flrWei
    - Query FTSO for FLR/USD rate
    - Calculate FLR amount

Events:
  PaymentProcessed(bytes32 tldNamehash, address tldOwner, uint256 usdAmount, uint256 flrAmount)
  PlatformFeeCollected(uint256 flrAmount)
  Withdrawn(address recipient, uint256 amount)
```

### Pricing & Validation Contracts

#### 6. DefaultRegistrationStrategy.sol
```
Purpose: Configurable pricing engine per TLD

Storage (per TLD namehash):
  mapping(bytes32 => uint256[10]) lengthPrices     // price by character count (1-10+)
  mapping(bytes32 => mapping(string => uint256)) premiumNames  // specific label prices
  mapping(bytes32 => mapping(string => address)) reservedNames // reserved for wallet
  mapping(bytes32 => uint256[10]) multiYearDiscounts // discount % per year count
  mapping(bytes32 => bool) isEnabled

Key Functions:
  setLengthPrices(bytes32 namehash, uint256[10] prices) → onlyTldOwner
    - prices[0] = 1-char price in USD cents
    - prices[9] = 10+ char price in USD cents
    - Example: [50000, 25000, 10000, 500, 200, 100, 100, 100, 100, 100]
    -           $500   $250   $100   $5   $2   $1   $1   $1   $1   $1

  setPremiumNames(bytes32 namehash, string[] labels, uint256[] prices) → onlyTldOwner
  setReservedNames(bytes32 namehash, string[] labels, address[] wallets) → onlyTldOwner
  setMultiYearDiscounts(bytes32 namehash, uint256[10] discountsBps) → onlyTldOwner
    - discountsBps[0] = 0 (1 year, no discount)
    - discountsBps[1] = 500 (2 years, 5% off)
    - discountsBps[4] = 2000 (5 years, 20% off)

  getPriceInUsdCents(address buyer, bytes32 tldNamehash, string label, uint256 years, bool isRenewal) → uint256
    - If isRenewal: return stored registration price (price lock)
    - Check reserved names
    - Check premium names
    - Fall back to length-based pricing
    - Apply multi-year discount
    - Enforce minimum price ($1/year = 100 cents)

  setEnabled(bytes32 namehash, bool enabled) → onlyTldOwner
```

#### 7. GlobalRegistrationRules.sol
```
Purpose: System-wide rules

Storage:
  uint256 minimumPriceUsdCents = 100   // $1/year
  address labelValidator

Key Functions:
  validateRegistration(string label, uint256 priceUsdCents, uint256 years) → bool
    - Price >= minimumPriceUsdCents * years
    - Label passes validation
    - Years >= 1 && years <= 10
```

#### 8. LabelValidator.sol
```
Purpose: Validate subdomain labels

Key Functions:
  isValidLabel(string label) → bool
    - Length >= 1
    - All characters a-z or 0-9 (ASCII lowercase alphanumeric)
    - No null bytes (0x00)
    - No underscores, hyphens (debatable — HNS.ID allows hyphens in middle)
    - No unicode / punycode
    - Returns false for empty strings
```

#### 9. SldCommitIntent.sol
```
Purpose: Anti-front-running via commit-reveal

Storage:
  mapping(bytes32 => uint256) commitTimestamps  // commitHash => block number
  uint256 MIN_COMMIT_AGE = 8  // blocks

Key Functions:
  commit(bytes32 commitHash)
    - Store block.number for this commitHash
    - commitHash = keccak256(abi.encodePacked(label, parentNamehash, msg.sender, secret))

  canReveal(bytes32 commitHash) → bool
    - block.number >= commitTimestamps[commitHash] + MIN_COMMIT_AGE

  consumeCommit(bytes32 commitHash) → onlyRegistrationManager
    - Verify commit exists and is old enough
    - Delete commit (one-time use)
```

#### 10. FtsoOracle.sol
```
Purpose: FTSO v2 price feed wrapper

Key Functions:
  getFlrUsdPrice() → (uint256 price, uint256 decimals, uint256 timestamp)
    - Query FTSO v2 for FLR/USD feed
    - Feed ID for FLR/USD: 0x01464c522f55534400000000000000000000000000

  usdCentsToFlrWei(uint256 usdCents) → uint256
    - Convert USD cents to FLR wei using current FTSO price
    - Include slippage buffer (e.g., 2% extra to account for price movement)
```

### Metadata Contracts

#### 11. SldMetadataService.sol
```
Purpose: Generate NFT metadata (tokenURI) for SLD NFTs

Key Functions:
  tokenURI(uint256 tokenId) → string
    - Returns JSON metadata URL or on-chain JSON
    - Includes: name, description, image (AI artwork IPFS URL), attributes
    - Attributes: parent TLD, registration date, expiry date, label length

  Example metadata:
  {
    "name": "alice.coolname",
    "description": "Halcyon Subdomain Registry — alice.coolname",
    "image": "ipfs://QmXxxxx",
    "attributes": [
      {"trait_type": "TLD", "value": "coolname"},
      {"trait_type": "Label", "value": "alice"},
      {"trait_type": "Length", "value": 5},
      {"trait_type": "Registration Date", "display_type": "date", "value": 1706745600},
      {"trait_type": "Expiry Date", "display_type": "date", "value": 1738281600}
    ]
  }
```

#### 12. TldMetadataService.sol
```
Purpose: Generate NFT metadata for TLD NFTs

Similar to SldMetadataService but for TLD-level data.
Includes: TLD name, total SLDs registered, registration enabled status.
```

### Resolver Contracts

See `07-RESOLVER-SYSTEM.md` for full resolver specifications.

## Proxy & Upgrade Strategy

```
Contracts that MUST be upgradeable (UUPS proxy):
  - TldClaimManager (upgrade from operator-only → FDC-verified)
  - SldRegistrationManager (add features, fix bugs)
  - HsrTld (if needed, though prefer immutable)
  - HsrSld (if needed, though prefer immutable)

Contracts that can be immutable:
  - PaymentManager
  - LabelValidator
  - SldCommitIntent
  - FtsoOracle (wrapper is simple, can redeploy)
  - GlobalRegistrationRules
  - DefaultRegistrationStrategy
  - Metadata services
  - All resolver contracts

Proxy admin: Separate from contract owner (security best practice)
  - PROXY_OWNER: Can upgrade implementation, cannot call contract functions
  - CONTRACT_OWNER (operator): Can call admin functions, cannot upgrade
```

## Access Control Summary

```
OPERATOR_ROLE:
  - TldClaimManager.operatorMint()
  - TldClaimManager.setStakingFee()
  - GlobalRegistrationRules.setMinimumPrice()
  - PaymentManager.setPlatformFee()

TLD_OWNER (per TLD, checked via NFT ownership):
  - DefaultRegistrationStrategy.setLengthPrices()
  - DefaultRegistrationStrategy.setPremiumNames()
  - DefaultRegistrationStrategy.setReservedNames()
  - DefaultRegistrationStrategy.setEnabled()
  - HsrTld.setRegistrationStrategy()
  - HsrTld.setResolver()

SLD_OWNER (per SLD, checked via NFT ownership):
  - HsrSld.setResolver()
  - Resolver.setAddress()
  - Resolver.setText()
  - etc.

REGISTRATION_MANAGER_ROLE:
  - HsrSld.mint()
  - SldCommitIntent.consumeCommit()

CLAIM_MANAGER_ROLE:
  - HsrTld.mint()

ARTWORK_SERVICE_ROLE:
  - HsrSld.setArtwork()
  - SldMetadataService (update artwork references)
```

## Namehash Computation

```
TLD namehash:  keccak256(abi.encodePacked(bytes32(0), keccak256(label)))
SLD namehash:  keccak256(abi.encodePacked(tldNamehash, keccak256(label)))

Example:
  TLD "coolname":    keccak256(0x000...000 || keccak256("coolname"))
  SLD "alice.coolname": keccak256(tldNamehash || keccak256("alice"))

This follows ENS namehash convention (EIP-137).
Labels must be normalized to lowercase before hashing.
```

## Gas Optimization Notes

- Use `bytes32` for namehashes (cheaper than strings for mappings)
- Store prices in USD cents as uint256 (avoid decimals)
- Use pull pattern for payments (no reentrancy risk, saves gas)
- Batch operations where possible (multi-name pricing setup)
- Consider ERC-721A for batch minting if operator mints many TLDs at once
