# HSR — TLD Staking Flow

## Two Paths to TLD Ownership on HSR

### Path A: Operator Direct Mint (Phase 1)

For the operator's own ~300 Handshake TLDs. No verification needed.

```
Operator → calls operatorMint("coolname") → TLD NFT minted to operator
```

This is a single transaction, no FDC involvement. The operator is trusted for their own domains.

### Path B: External User FDC-Verified Staking (Phase 2)

For any Handshake TLD owner who wants to sell subdomains on Flare.

```
User owns "theirdomain/" on Handshake
  ↓
Step 1: User sets TXT record on Handshake DNS
        Record: "flr:0xTheirFlareAddress"
  ↓
Step 2: Frontend calls Verifier API OFF-CHAIN to prepare attestation request
        POST https://fdc-verifiers-testnet.flare.network/verifier/web2/Web2Json/prepareRequest
        Returns: abiEncodedRequest (includes MIC)
  ↓
Step 3: User calls requestStake("theirdomain", abiEncodedRequest) on Flare
        Pays staking fee (~$100 in FLR)
        Contract forwards abiEncodedRequest to FdcHub.requestAttestation()
  ↓
Step 4: FDC voting round (~90-180 seconds)
        ~100 data providers query HSD API
        Verify TXT record matches claimer's Flare address
  ↓
Step 5: Wait for round finalization
        Poll: Relay.isFinalized(200, roundId) — protocol ID 200 = FDC
  ↓
Step 6: Keeper bot (or frontend) retrieves Merkle proof from DA Layer
        POST {DA_LAYER_URL}/api/v1/fdc/proof-by-request-round-raw
  ↓
Step 7: completeStake("theirdomain", proof) called on Flare
        Contract calls fdcVerification.verifyWeb2Json(proof)
        Decodes proof.data.responseBody.abi_encoded_data
        Verifies FLR address matches claimer, mints TLD NFT
  ↓
Step 8: User configures pricing via DefaultRegistrationStrategy
        Sets length-based prices, premium names, reserved names
  ↓
Step 9: User enables registration
        Subdomains now available for purchase
```

## Path A: Operator Mint (Detailed)

### Prerequisites
- Operator wallet is set as `operatorAddress` in TldClaimManager
- Operator actually owns the TLDs on Handshake (honor system for own domains)

### Contract Call

```solidity
function operatorMint(string calldata tldLabel) external {
    require(msg.sender == operatorAddress, "Not operator");
    
    bytes32 namehash = keccak256(
        abi.encodePacked(bytes32(0), keccak256(bytes(tldLabel)))
    );
    require(!claimedTlds[namehash], "Already claimed");
    
    // Validate label
    require(labelValidator.isValidLabel(tldLabel), "Invalid label");
    
    // Mint
    claimedTlds[namehash] = true;
    uint256 tokenId = hsrTld.mint(msg.sender, tldLabel, namehash);
    
    emit OperatorMinted(tldLabel, tokenId);
}
```

### Batch Operator Mint

For minting all ~300 TLDs efficiently:

```solidity
function operatorMintBatch(string[] calldata tldLabels) external {
    require(msg.sender == operatorAddress, "Not operator");
    
    for (uint256 i = 0; i < tldLabels.length; i++) {
        bytes32 namehash = keccak256(
            abi.encodePacked(bytes32(0), keccak256(bytes(tldLabels[i])))
        );
        
        if (claimedTlds[namehash]) continue; // skip duplicates
        if (!labelValidator.isValidLabel(tldLabels[i])) continue; // skip invalid
        
        claimedTlds[namehash] = true;
        uint256 tokenId = hsrTld.mint(msg.sender, tldLabels[i], namehash);
        emit OperatorMinted(tldLabels[i], tokenId);
    }
}
```

### Post-Mint Setup Script

After minting, operator needs to configure each TLD:

```javascript
// Foundry script or JS deployment script
async function setupTld(tldLabel, pricingConfig) {
    const namehash = ethers.keccak256(
        ethers.solidityPacked(
            ["bytes32", "bytes32"],
            [ethers.ZeroHash, ethers.keccak256(ethers.toUtf8Bytes(tldLabel))]
        )
    );
    
    // 1. Set registration strategy
    await hsrTld.setRegistrationStrategy(namehash, strategyAddress);
    
    // 2. Configure pricing
    await strategy.setLengthPrices(namehash, pricingConfig.lengthPrices);
    
    // 3. Set premium names if any
    if (pricingConfig.premiumNames.length > 0) {
        await strategy.setPremiumNames(
            namehash, 
            pricingConfig.premiumNames, 
            pricingConfig.premiumPrices
        );
    }
    
    // 4. Set reserved names if any
    if (pricingConfig.reservedNames.length > 0) {
        await strategy.setReservedNames(
            namehash,
            pricingConfig.reservedNames,
            pricingConfig.reservedWallets
        );
    }
    
    // 5. Enable registration
    await hsrTld.setRegistrationEnabled(namehash, true);
}

// Default pricing tiers (USD cents per year)
const defaultPricing = {
    lengthPrices: [
        50000,  // 1 char: $500
        25000,  // 2 chars: $250
        10000,  // 3 chars: $100
        500,    // 4 chars: $5
        200,    // 5 chars: $2
        100,    // 6 chars: $1
        100,    // 7 chars: $1
        100,    // 8 chars: $1
        100,    // 9 chars: $1
        100     // 10+ chars: $1
    ],
    premiumNames: [],
    premiumPrices: [],
    reservedNames: [],
    reservedWallets: []
};
```

## Path B: FDC Staking (Detailed)

### Step 1: Setting TXT Record on Handshake

User must configure their Handshake TLD's DNS records before staking.

Using Bob Wallet (Handshake wallet):
```
1. Open Bob Wallet
2. Go to "My Domains" → select TLD
3. Click "Manage DNS"
4. Add TXT record:
   Type: TXT
   Value: flr:0xYourFlareAddress
5. Submit update transaction
6. Wait for Handshake block confirmation (~10 minutes)
```

Using HSD CLI:
```bash
hsw-rpc sendupdate coolname '{
  "records": [
    {"type": "TXT", "txt": ["flr:0xYourFlareAddress"]}
  ]
}'
```

### Step 2: Prepare Request Off-Chain + Submit On-Chain

**Off-chain (frontend):**
```javascript
// 1. Prepare attestation request via Verifier API
const verifierUrl = "https://fdc-verifiers-testnet.flare.network/verifier/web2/Web2Json/prepareRequest";
const response = await fetch(verifierUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        attestationType: "0x5765623246736f6e000000000000000000000000000000000000000000000000",
        sourceId: "0x5075626c696357656232000000000000000000000000000000000000000000",
        requestBody: {
            url: `https://hsd.halcyon.domains/api/name/${tldLabel}`,
            httpMethod: "GET",
            headers: "",
            queryParams: "",
            body: "",
            postProcessJq: `{flrAddress: (.data.records[] | select(.type == "TXT") | .txt[] | select(startswith("flr:"))), expired: .expired, state: .state}`,
            abiSignature: "(string flrAddress, bool expired, string state)"
        }
    })
});
const { abiEncodedRequest } = await response.json();

// 2. Submit to contract with the pre-prepared request
const tx = await tldClaimManager.requestStake(tldLabel, abiEncodedRequest, { value: stakingFee });
```

**On-chain (contract):**
```solidity
// Contract accepts pre-prepared request bytes — does NOT build the request on-chain
function requestStake(
    string calldata tldLabel,
    bytes calldata abiEncodedRequest  // Pre-prepared by Verifier API (includes MIC)
) external payable {
    bytes32 namehash = keccak256(
        abi.encodePacked(bytes32(0), keccak256(bytes(tldLabel)))
    );

    // Validations
    require(!claimedTlds[namehash], "Already claimed");
    require(pendingClaims[namehash].claimer == address(0), "Claim pending");
    require(labelValidator.isValidLabel(tldLabel), "Invalid label");

    // Verify staking fee
    uint256 requiredFee = ftsoOracle.usdCentsToFlr(stakingFeeUsd);
    require(msg.value >= requiredFee, "Insufficient staking fee");

    // Forward pre-prepared request to FdcHub
    fdcHub.requestAttestation{value: 0}(abiEncodedRequest);

    // Store pending claim
    pendingClaims[namehash] = PendingClaim({
        claimer: msg.sender,
        tldLabel: tldLabel,
        namehash: namehash,
        stakingFeePaid: msg.value,
        requestTimestamp: block.timestamp,
        completed: false
    });

    // Refund excess staking fee
    uint256 excess = msg.value - requiredFee;
    if (excess > 0) {
        (bool sent, ) = msg.sender.call{value: excess}("");
        require(sent, "Refund failed");
    }

    emit StakeRequested(tldLabel, msg.sender, block.timestamp);
}
```

### Steps 3-4: FDC Round and Proof Retrieval

Handled off-chain — see `02-FDC-INTEGRATION.md` for details.

### Step 5: Complete Stake

See `02-FDC-INTEGRATION.md` `completeStake()` implementation.

## TLD Lifecycle After Staking

```
STAKED → CONFIGURING → ACTIVE → (optional) DISABLED → ACTIVE → ...
                                     ↓
                               HANDSHAKE_EXPIRED (if not renewed on HNS)

States:
  STAKED:     TLD NFT minted, no pricing set, registration disabled
  CONFIGURING: Owner setting up pricing strategy
  ACTIVE:     registrationEnabled = true, SLDs can be purchased
  DISABLED:   Owner temporarily disabled registration
  HANDSHAKE_EXPIRED: TLD expired on Handshake (needs re-verification)
```

## Handshake Expiry Handling

Handshake TLDs must be renewed every ~2 years (based on block height).

### Option 1: Periodic Re-verification (Recommended)
```
- Run periodic FDC checks on staked TLDs
- If TLD expired on Handshake, disable registration
- Prevent new SLD sales for expired TLDs
- Existing SLDs remain valid until their own expiry
- TLD owner can re-verify after renewing on Handshake
```

### Option 2: Honor System
```
- Trust that staked TLD owners maintain their Handshake names
- Simpler but less trustless
- Acceptable for Phase 1 (operator-only)
```

### Option 3: Community Challenge
```
- Anyone can challenge a TLD's Handshake status
- Challenger submits FDC attestation request
- If TLD is expired, challenger gets reward from staking fee
- TLD registration disabled
- Most decentralized approach
```

## Staking Fee Economics

```
Recommended staking fee: $100 USD (matches HNS.ID)
Paid in FLR, converted via FTSO at time of staking

Fee purpose:
  - Prevents spam staking of unused TLDs
  - Covers FDC attestation costs (data provider incentives)
  - Creates revenue for HSR platform
  - Signals commitment from TLD owner

Fee is non-refundable once staking completes.
If staking fails (FDC verification fails), fee should be refundable.
```

## Transfer and Marketplace

```
TLD NFTs are standard ERC-721 → tradable on any NFT marketplace

When TLD NFT transfers:
  - New owner inherits all SLD revenue rights (95% split)
  - Existing SLD registrations remain valid
  - Pricing strategy persists (new owner can change)
  - Registration enabled/disabled state persists

Transfer does NOT affect:
  - Handshake TLD ownership (remains with original HNS owner)
  - Need for HNS TXT record (original owner must maintain or transfer HNS too)
  
Important: If HNS ownership transfers without updating TXT record,
the new Flare NFT owner cannot re-verify. This is a known limitation —
document clearly that HNS ownership and Flare NFT should transfer together.
```
