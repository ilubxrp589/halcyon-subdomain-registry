# HSR — SLD (Subdomain) Registration

## Registration Flow Overview

```
Buyer wants "alice.coolname"
  ↓
Step 1: Search → check availability via contract
  ↓
Step 2: Get price → query DefaultRegistrationStrategy
  ↓
Step 3: Commit → anti-front-running (commit-reveal scheme)
  ↓
Step 4: Wait 8+ blocks (~15 seconds on Flare)
  ↓
Step 5: Reveal/Register → pay FLR, SLD NFT minted
  ↓
Step 6: AI artwork queued → generated async, added to metadata
  ↓
Step 7: Resolver configured → default or custom
```

## Availability Check

```solidity
function isAvailable(string memory label, bytes32 tldNamehash) public view returns (bool) {
    // 1. TLD must exist and be active
    require(hsrTld.ownerOfNamehash(tldNamehash) != address(0), "TLD not registered");
    require(hsrTld.isRegistrationEnabled(tldNamehash), "Registration disabled");
    
    // 2. Compute SLD namehash
    bytes32 sldNamehash = keccak256(
        abi.encodePacked(tldNamehash, keccak256(bytes(label)))
    );
    
    // 3. Check if already registered and not expired
    uint256 tokenId = hsrSld.sldNamehashToTokenId(sldNamehash);
    if (tokenId == 0) return true; // never registered
    
    // 4. Check expiry + grace period
    if (hsrSld.isExpired(sldNamehash) && !hsrSld.isInGracePeriod(sldNamehash)) {
        return true; // expired and past grace period → available
    }
    
    return false;
}
```

## Pricing

### Length-Based Pricing

Default pricing set by TLD owner via `DefaultRegistrationStrategy`:

```
Character Length | Default Price (USD/year)
1               | $500
2               | $250
3               | $100
4               | $5
5               | $2
6+              | $1

These are per-year prices. Multi-year registration applies discounts.
```

### Premium Names

TLD owner can set specific labels at custom prices:

```solidity
// Example: "crypto.coolname" → $1000/year
strategy.setPremiumNames(
    namehash,
    ["crypto", "defi", "nft", "web3"],
    [100000, 50000, 50000, 25000]  // USD cents
);
```

### Reserved Names

TLD owner can reserve labels for specific wallets (free or at custom price):

```solidity
// Reserve "admin.coolname" for operator wallet
strategy.setReservedNames(
    namehash,
    ["admin", "support", "help"],
    [operatorWallet, operatorWallet, operatorWallet]
);
```

### Multi-Year Discounts

```solidity
// Discount in basis points per registration length
strategy.setMultiYearDiscounts(
    namehash,
    [0, 500, 1000, 1500, 2000, 2000, 2000, 2000, 2000, 2000]
    // 1yr: 0%, 2yr: 5%, 3yr: 10%, 4yr: 15%, 5-10yr: 20%
);
```

### Price Calculation Example

```
Register "alice.coolname" for 3 years:
  Base price: $1/year (5 chars)
  3 years: $3.00
  10% multi-year discount: -$0.30
  Final: $2.70 USD
  Convert to FLR via FTSO at current rate
```

## Commit-Reveal Registration

Prevents front-running (miner/validator sees your desired name and registers it first).

### Step 1: Commit

```solidity
// Frontend generates random secret
const secret = ethers.randomBytes(32);

// Compute commit hash
const commitHash = ethers.keccak256(
    ethers.solidityPacked(
        ["string", "bytes32", "address", "bytes32"],
        [label, tldNamehash, userAddress, secret]
    )
);

// Submit commit (no value needed)
await sldCommitIntent.commit(commitHash);

// Store secret locally (needed for reveal)
localStorage.setItem(`commit_${label}_${tldNamehash}`, ethers.hexlify(secret));
```

### Step 2: Wait

```
Wait at least 8 blocks (~15 seconds on Flare).
Frontend shows countdown or progress indicator.
Commit is valid for ~24 hours (configurable).
```

### Step 3: Reveal and Register

```solidity
function registerWithCommit(
    string calldata label,
    bytes32 tldNamehash,
    uint256 registrationYears,
    bytes32 secret
) external payable {
    // 1. Verify commit
    bytes32 commitHash = keccak256(
        abi.encodePacked(label, tldNamehash, msg.sender, secret)
    );
    commitIntent.consumeCommit(commitHash); // reverts if invalid or too early
    
    // 2. Validate label
    require(labelValidator.isValidLabel(label), "Invalid label");
    require(registrationYears >= 1 && registrationYears <= 10, "Invalid years");
    
    // 3. Check availability
    bytes32 sldNamehash = keccak256(
        abi.encodePacked(tldNamehash, keccak256(bytes(label)))
    );
    require(isAvailable(label, tldNamehash), "Not available");
    
    // 4. Get price
    address strategyAddr = hsrTld.getRegistrationStrategy(tldNamehash);
    IRegistrationStrategy strategy = IRegistrationStrategy(strategyAddr);
    uint256 priceUsdCents = strategy.getPriceInUsdCents(
        msg.sender, tldNamehash, label, registrationYears, false
    );
    
    // 5. Enforce minimum
    require(
        priceUsdCents >= globalRules.minimumPriceUsdCents() * registrationYears,
        "Below minimum price"
    );
    
    // 6. Process payment
    uint256 requiredFlr = ftsoOracle.usdCentsToFlr(priceUsdCents);
    require(msg.value >= requiredFlr, "Insufficient payment");
    
    address tldOwner = hsrTld.ownerOfNamehash(tldNamehash);
    paymentManager.processPayment{value: requiredFlr}(
        tldNamehash, tldOwner, priceUsdCents
    );
    
    // 7. Mint SLD NFT
    uint256 tokenId = hsrSld.mint(
        msg.sender,
        label,
        tldNamehash,
        registrationYears,
        priceUsdCents  // stored for renewal price lock
    );
    
    // 8. Emit artwork generation request
    emit ArtworkRequested(tokenId, label, tldNamehash);
    
    // 9. Refund excess
    uint256 excess = msg.value - requiredFlr;
    if (excess > 0) {
        (bool sent, ) = msg.sender.call{value: excess}("");
        require(sent, "Refund failed");
    }
    
    emit Registered(label, tldNamehash, sldNamehash, msg.sender, registrationYears, priceUsdCents);
}
```

## Renewal

```solidity
function renew(
    bytes32 sldNamehash,
    uint256 additionalYears
) external payable {
    uint256 tokenId = hsrSld.sldNamehashToTokenId(sldNamehash);
    require(tokenId != 0, "SLD not registered");
    
    SldData memory data = hsrSld.getSldData(tokenId);
    
    // Can renew if not expired, or within grace period
    require(
        !hsrSld.isExpired(sldNamehash) || hsrSld.isInGracePeriod(sldNamehash),
        "Expired past grace period"
    );
    
    // Calculate new expiry
    uint256 currentExpiry = data.expiryTime;
    if (currentExpiry < block.timestamp) {
        currentExpiry = block.timestamp; // if in grace period, start from now
    }
    uint256 newExpiry = currentExpiry + (additionalYears * 365 days);
    
    // Cannot exceed max registration period from now
    require(
        newExpiry <= block.timestamp + (10 * 365 days),
        "Exceeds max registration period"
    );
    
    // CRITICAL: Use stored registration price (price lock)
    uint256 renewalPriceUsdCents = data.registrationPrice * additionalYears;
    
    // Convert and verify payment
    uint256 requiredFlr = ftsoOracle.usdCentsToFlr(renewalPriceUsdCents);
    require(msg.value >= requiredFlr, "Insufficient payment");
    
    // Process payment
    address tldOwner = hsrTld.ownerOfNamehash(data.parentNamehash);
    paymentManager.processPayment{value: requiredFlr}(
        data.parentNamehash, tldOwner, renewalPriceUsdCents
    );
    
    // Update expiry
    hsrSld.setExpiry(sldNamehash, newExpiry);
    
    // Refund excess
    uint256 excess = msg.value - requiredFlr;
    if (excess > 0) {
        (bool sent, ) = msg.sender.call{value: excess}("");
        require(sent, "Refund failed");
    }
    
    emit Renewed(sldNamehash, additionalYears, newExpiry, msg.sender);
}
```

## SLD Lifecycle

```
REGISTERED → ACTIVE → EXPIRING → GRACE_PERIOD → EXPIRED → AVAILABLE
                ↑                                              ↓
                └──────────── Re-register (new buyer) ─────────┘

Timeline:
  Registration ─────────────────────────────── Expiry ──── +30 days ────
  [          ACTIVE (resolves, tradable)        ] [GRACE  ] [ EXPIRED  ]
                                                   │         │
                                              Can renew   Name released
                                              Owner keeps  Anyone can
                                              their NFT    register
                                              temporarily

Grace Period Rules:
  - 30 days after expiry timestamp
  - SLD still resolves during grace period
  - Only current owner (or anyone on their behalf) can renew
  - After grace period, name becomes available for new registration
  - Old NFT is burned or invalidated
```

## Label Validation Rules

```
Valid labels:
  ✓ "alice"       (lowercase alpha)
  ✓ "bob123"      (alphanumeric)
  ✓ "a"           (single character)
  ✓ "x9z"         (mixed)

Invalid labels:
  ✗ ""            (empty)
  ✗ "Alice"       (uppercase — must normalize to lowercase before submit)
  ✗ "hello_world" (underscore)
  ✗ "hello world" (space)
  ✗ "café"        (unicode)
  ✗ "hello.world" (dots — would create sub-subdomains)
  ✗ null bytes

Frontend should:
  - Auto-lowercase input
  - Strip invalid characters
  - Show real-time validation feedback
  - Prevent submission of invalid labels
```

## Signed Registration (Alternative to Commit-Reveal)

For cases where the TLD owner wants to enable single-transaction registration (e.g., for approved buyers or whitelisted addresses):

```solidity
function registerWithSignature(
    string calldata label,
    bytes32 tldNamehash,
    uint256 registrationYears,
    uint256 nonce,
    bytes calldata signature
) external payable {
    // 1. Verify signature from TLD owner
    bytes32 messageHash = keccak256(
        abi.encodePacked(label, tldNamehash, msg.sender, registrationYears, nonce)
    );
    bytes32 ethSignedHash = ECDSA.toEthSignedMessageHash(messageHash);
    address signer = ECDSA.recover(ethSignedHash, signature);
    
    require(signer == hsrTld.ownerOfNamehash(tldNamehash), "Invalid signature");
    require(!usedNonces[nonce], "Nonce used");
    usedNonces[nonce] = true;
    
    // 2. Continue with normal registration flow (price, payment, mint)
    // ... same as registerWithCommit steps 2-9
}
```

## Events Summary

```solidity
event Registered(
    string label,
    bytes32 indexed tldNamehash,
    bytes32 indexed sldNamehash,
    address indexed owner,
    uint256 years,
    uint256 priceUsdCents
);

event Renewed(
    bytes32 indexed sldNamehash,
    uint256 additionalYears,
    uint256 newExpiry,
    address renewedBy
);

event ArtworkRequested(
    uint256 indexed tokenId,
    string label,
    bytes32 indexed tldNamehash
);

event ArtworkSet(
    uint256 indexed tokenId,
    string ipfsHash
);
```

## Frontend UX Flow

```
1. SEARCH
   - User types desired name + selects TLD from dropdown
   - Real-time availability check
   - Show price in USD and FLR
   - Show AI artwork preview (if pre-generated) or "artwork will be generated"

2. CONFIGURE
   - Select registration period (1-10 years)
   - Show total price with multi-year discount
   - Show FLR amount with slippage

3. COMMIT (if using commit-reveal)
   - "Securing your name..." progress
   - Wait 8+ blocks
   - Auto-proceed to registration

4. REGISTER
   - Confirm transaction in wallet
   - Pay FLR
   - Show success with NFT details

5. POST-REGISTRATION
   - "AI artwork being generated..."
   - Configure resolver (set wallet address, social profiles, etc.)
   - View on NFT marketplace
```
