# HSR — Flare Data Connector (FDC) Integration

## What FDC Does for HSR

FDC enables **trustless verification** of Handshake TLD ownership from within Flare smart contracts. Instead of trusting the HSR operator to confirm "yes, this user owns coolname/ on Handshake," FDC has ~100 independent data providers query the Handshake blockchain API, reach consensus, and store a Merkle root on-chain that the contract can verify.

This is the key differentiator vs HNS.ID, which relies on trusted Namebase wallets to bridge ownership.

## FDC Overview

FDC is a Flare-native protocol (not third-party). It works in voting rounds:

```
1. Request Phase (submit attestation request)
   ↓
2. Collection Phase (~90 seconds — data providers query external source)
   ↓
3. Voting Phase (providers submit hashes, then reveal)
   ↓
4. Finalization (Merkle root stored on-chain)
   ↓
5. Proof Retrieval (get Merkle proof from DA Layer API)
   ↓
6. On-chain Verification (contract verifies proof against stored root)
```

Total time from request to verifiable proof: ~90-180 seconds.

## Web2Json Attestation Type

**FIP.14** (approved Dec 6, 2025) introduced Web2Json — allows FDC to query any approved Web2 JSON API endpoint.

This is what HSR uses. No custom attestation type needed.

### Web2Json Request Structure

**IMPORTANT:** Web2Json requests must be prepared **off-chain** via the Verifier API, NOT built on-chain. The Verifier returns an `abiEncodedRequest` with a Message Integrity Code (MIC) that the contract submits to FdcHub.

```
sourceId: "PublicWeb2" (NOT "HSD" — PublicWeb2 is the standard for both Coston and Coston2)

Request preparation flow:
1. Off-chain: POST to Verifier API → get abiEncodedRequest with MIC
2. On-chain: fdcHub.requestAttestation(abiEncodedRequest)
```

```solidity
// Import from official Flare package
import {IWeb2Json} from "@flarenetwork/flare-periphery-contracts/coston2/IWeb2Json.sol";

// The Web2Json request body (prepared OFF-CHAIN via Verifier API)
// See: POST https://fdc-verifiers-testnet.flare.network/verifier/web2/Web2Json/prepareRequest
//
// Request JSON body must include:
// {
//   "attestationType": "0x5765623246736f6e...",  // Web2Json encoded
//   "sourceId": "0x5075626c696357656232...",      // PublicWeb2 encoded
//   "requestBody": {
//     "url": "https://hsd.halcyon.domains/api/name/{tld}",
//     "httpMethod": "GET",
//     "headers": "",
//     "queryParams": "",
//     "body": "",
//     "postProcessJq": ".data.records[] | select(.type == \"TXT\") | .txt[] | select(startswith(\"flr:\"))",
//     "abiSignature": "(string flrAddress, bool expired, string state)"
//   }
// }
//
// The Verifier returns: { abiEncodedRequest: "0x..." }
// This includes the MIC (Message Integrity Code) — submit this to FdcHub

// The response body after attestation (decoded from proof)
// IWeb2Json.Proof contains:
//   proof.data.responseBody.abi_encoded_data → ABI decode with matching struct
```

**Key fields:**
- `postProcessJq` (camelCase, NOT `postprocessJq`) — JQ filter to extract data
- `abiSignature` — defines the output struct shape for `abi_encoded_data`
- The Verifier API validates the request and adds the MIC before returning `abiEncodedRequest`

### HSR-Specific Configuration

```
API Endpoint: https://<hsd-node>/api/name/<tld-name>
HTTP Method:  GET
Headers:      None (public API)

Example URL:  https://hsd.halcyon.domains/api/name/coolname

Raw API Response:
{
  "name": "coolname",
  "nameHash": "abc123def456...",
  "state": "CLOSED",
  "owner": {
    "hash": "0xabc123...",
    "index": 0
  },
  "data": {
    "records": [
      {
        "type": "TXT",
        "txt": ["flr:0x1234567890abcdef1234567890abcdef12345678"]
      }
    ]
  },
  "renewal": 250000,
  "expired": false,
  "weak": false
}

JQ Filter:
  .data.records[] | select(.type == "TXT") | .txt[] | select(startswith("flr:"))

Expected Output:
  "flr:0x1234567890abcdef1234567890abcdef12345678"

Alternative JQ (return structured data):
  {
    owner_hash: .owner.hash,
    flr_address: (.data.records[] | select(.type == "TXT") | .txt[] | select(startswith("flr:"))),
    expired: .expired,
    state: .state
  }
```

## FDC Contract Integration

### Key Flare Contracts

```solidity
// Use official Flare periphery contracts — do NOT write custom interfaces
import {ContractRegistry} from "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";
import {IFdcHub} from "@flarenetwork/flare-periphery-contracts/coston2/IFdcHub.sol";
import {IFdcVerification} from "@flarenetwork/flare-periphery-contracts/coston2/IFdcVerification.sol";
import {IRelay} from "@flarenetwork/flare-periphery-contracts/coston2/IRelay.sol";
import {IWeb2Json} from "@flarenetwork/flare-periphery-contracts/coston2/IWeb2Json.sol";

// Get contract addresses via ContractRegistry (official helper)
IFdcHub fdcHub = ContractRegistry.getFdcHub();
IFdcVerification fdcVerification = ContractRegistry.getFdcVerification();
IRelay relay = ContractRegistry.getRelay();
```

### Submitting an Attestation Request

**CRITICAL CHANGE:** The attestation request CANNOT be built on-chain. It must be prepared off-chain via the Verifier API, which adds a Message Integrity Code (MIC). The contract only forwards the pre-prepared bytes.

```
Off-chain flow (frontend or keeper bot):

1. POST https://fdc-verifiers-testnet.flare.network/verifier/web2/Web2Json/prepareRequest
   Body: {
     "attestationType": "0x5765623246736f6e000000000000000000000000000000000000000000000000",
     "sourceId": "0x5075626c696357656232000000000000000000000000000000000000000000",
     "requestBody": {
       "url": "https://hsd.halcyon.domains/api/name/{tldLabel}",
       "httpMethod": "GET",
       "headers": "",
       "queryParams": "",
       "body": "",
       "postProcessJq": "{flrAddress: (.data.records[] | select(.type == \"TXT\") | .txt[] | select(startswith(\"flr:\"))), expired: .expired, state: .state}",
       "abiSignature": "(string flrAddress, bool expired, string state)"
     }
   }

2. Verifier returns: { "abiEncodedRequest": "0x..." }
   (This includes the MIC — do NOT modify these bytes)

3. Pass abiEncodedRequest to the contract
```

```solidity
// On-chain: contract just forwards the pre-prepared request
function requestStake(
    string calldata tldLabel,
    bytes calldata abiEncodedRequest  // Pre-prepared by Verifier API off-chain
) external payable {
    bytes32 namehash = keccak256(
        abi.encodePacked(bytes32(0), keccak256(bytes(tldLabel)))
    );

    require(!claimedTlds[namehash], "Already claimed");
    require(pendingClaims[namehash].claimer == address(0), "Claim pending");

    // Verify staking fee
    uint256 requiredFee = ftsoOracle.usdCentsToFlr(stakingFeeUsd);
    require(msg.value >= requiredFee, "Insufficient staking fee");

    // Submit pre-prepared request to FdcHub
    // FdcHub.requestAttestation() is payable — fee covers data provider costs
    uint256 attestationFee = 0; // Coston2: free; Mainnet: may require fee
    fdcHub.requestAttestation{value: attestationFee}(abiEncodedRequest);

    // Calculate round ID for later proof retrieval
    // roundId = floor((block.timestamp - firstVotingRoundStartTs) / votingEpochDurationSeconds)
    // Get firstVotingRoundStartTs and votingEpochDurationSeconds from FlareSystemsManager

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

### Retrieving Proof (Off-chain — Keeper Bot or Frontend)

```javascript
// After ~90-180 seconds, the attestation round finalizes
// Retrieve the Merkle proof from the DA Layer API

const DA_LAYER_URL = "https://ctn2-data-availability.flare.network"; // Coston2
// Mainnet: "https://flr-data-availability.flare.network"

// 1. Check if the FDC round has finalized
// Protocol ID 200 = FDC
const relay = new ethers.Contract(relayAddress, relayAbi, provider);
const isFinalized = await relay.isFinalized(200, roundId);
if (!isFinalized) {
    // Round not yet finalized — retry later
    return;
}

// 2. Query DA Layer for the proof
// CORRECT endpoint: proof-by-request-round-raw (NOT get-proof-round-id-bytes)
const response = await fetch(
    `${DA_LAYER_URL}/api/v1/fdc/proof-by-request-round-raw`,
    {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            votingRoundId: roundId,
            requestBytes: abiEncodedRequestHex  // Same bytes submitted to FdcHub
        })
    }
);

const result = await response.json();
// result contains:
// - proof: bytes32[] (Merkle path)
// - response_hex: string (the verified response data, needs ABI decoding)

// 3. Build the IWeb2Json.Proof struct and submit to contract
const tx = await tldClaimManager.completeStake(tldLabel, proofStruct);
```

### Verifying Proof On-chain

```solidity
function completeStake(
    string calldata tldLabel,
    IWeb2Json.Proof calldata proof  // Typed proof struct from official package
) external {
    bytes32 namehash = keccak256(
        abi.encodePacked(bytes32(0), keccak256(bytes(tldLabel)))
    );
    PendingClaim storage claim = pendingClaims[namehash];

    require(claim.claimer != address(0), "No pending claim");
    require(!claim.completed, "Already completed");
    require(!claimedTlds[namehash], "TLD already claimed");

    // 1. Verify the proof against FDC Merkle root
    // Uses official fdcVerification.verifyWeb2Json() which checks the Merkle proof
    // against the finalized root stored on-chain by the Relay contract
    bool valid = fdcVerification.verifyWeb2Json(proof);
    require(valid, "Invalid FDC proof");

    // 2. Decode the attestation response
    // proof.data.responseBody.abi_encoded_data contains the JQ-filtered data
    // Decode using the matching struct from abiSignature: "(string flrAddress, bool expired, string state)"
    (string memory flrAddress, bool expired, string memory state) = abi.decode(
        proof.data.responseBody.abi_encoded_data,
        (string, bool, string)
    );

    // 3. Validate HNS TLD state
    require(!expired, "TLD expired on Handshake");
    require(
        keccak256(bytes(state)) == keccak256(bytes("CLOSED")),
        "TLD not in CLOSED state"
    );

    // 4. Extract and verify the Flare address from TXT record
    // Expected format: "flr:0x1234...abcd"
    address claimedAddress = parseFlrAddress(flrAddress);
    require(claimedAddress == claim.claimer, "TXT record doesn't match claimer");

    // 5. Mint TLD NFT
    claim.completed = true;
    claimedTlds[namehash] = true;
    uint256 tokenId = hsrTld.mint(claim.claimer, tldLabel, namehash);

    emit StakeCompleted(tldLabel, claim.claimer, tokenId);
}

// Helper: parse "flr:0x1234...abcd" → address
function parseFlrAddress(string memory record) internal pure returns (address) {
    // Skip "flr:" prefix (4 bytes)
    bytes memory recordBytes = bytes(record);
    require(recordBytes.length >= 46, "Invalid record length"); // "flr:" + "0x" + 40 hex chars

    bytes memory addrHex = new bytes(42); // "0x" + 40 hex chars
    for (uint i = 0; i < 42; i++) {
        addrHex[i] = recordBytes[i + 4];
    }

    return parseAddress(string(addrHex));
}
```

## HSD Node API Requirements

HSR must run (or have access to) an HSD (Handshake full node) with REST API enabled.

### Running HSD Node

```bash
# Install HSD
npm install -g hsd

# Run with API enabled
hsd --http-host=0.0.0.0 \
    --api-key=your-api-key \
    --index-tx=true \
    --index-address=true

# API available at http://localhost:12037
```

### Key API Endpoints

```
GET /api/name/:name
  Returns full name resource data including:
  - owner info
  - DNS records (TXT, NS, A, etc.)
  - auction state
  - expiration info

Response fields HSR cares about:
  .state          → must be "CLOSED" (auction completed, name is owned)
  .owner.hash     → Handshake UTXO owner
  .data.records   → DNS records array
  .expired        → boolean
  .renewal        → block height of last renewal
```

### Production HSD API

For FDC to work, the HSD API must be:
1. **Publicly accessible** via HTTPS
2. **Deterministic** — same query returns same result at same block height
3. **Reliable** — high uptime, data providers need to reach it
4. **Listed as approved Web2Json source** (requires governance approval)

Recommendation: Run dedicated HSD node at `https://hsd.halcyon.domains/api/`

### Determinism Concern

HSD API responses change as the Handshake blockchain advances. FDC handles this by:
- All data providers query at approximately the same time within the collection window
- Consensus mechanism tolerates minor timing differences
- The JQ filter extracts only ownership-relevant data that doesn't change block-to-block (owner doesn't change unless transferred)

## Endpoint Approval Process

Before HSR can use FDC Web2Json on mainnet, the HSD API endpoint must be approved:

### Step 1: Submit Pull Request
```
Repository: github.com/flare-foundation/flare-smart-contracts-v2
File:       Add endpoint specification to approved Web2Json sources

Specification must include:
- Endpoint URL pattern
- Expected request format
- Expected response schema
- JQ filter(s) to be used
- Justification for ecosystem value
```

### Step 2: Foundation Technical Review
```
Foundation evaluates:
- Legal compliance (no restricted data)
- Technical feasibility (deterministic responses)
- Relevance to Flare ecosystem
- Security implications
```

### Step 3: Management Group Vote
```
- Binary approve/reject
- Quorum requirements per governance rules
- If approved, endpoint added to provider configuration
```

### Timeline Estimate
- PR submission to approval: 4-8 weeks
- Can develop and test on Coston2 WITHOUT approval (testnet is permissionless)

## Phase 1 vs Phase 2

### Phase 1: No FDC Needed
```
Operator mints their own ~300 TLDs directly via operatorMint()
- No cross-chain verification required
- Operator is trusted for their own domains
- Faster time to market
- Focus on SLD registration and AI artwork

TldClaimManager.operatorMint("coolname") → mints TLD NFT to operator
```

### Phase 2: FDC-Verified External Staking
```
External users can stake their own Handshake TLDs:
1. User sets TXT record on Handshake: "flr:0xTheirAddress"
2. User calls requestStake("theirdomain") with staking fee
3. FDC verifies ownership via HSD API
4. TLD NFT minted to user

This is the trustless, decentralized path.
Requires approved HSD endpoint on FDC mainnet.
```

## Error Handling

```
Common failure scenarios:

1. FDC round fails (no consensus)
   → User can re-submit attestation request
   → Refund staking fee or hold for retry

2. HSD API unreachable during collection
   → Data providers return error/empty
   → Round may fail consensus
   → Retry after HSD is back online

3. TXT record not set or wrong format
   → Attestation succeeds but completeStake() reverts
   → User must fix TXT record and re-request

4. TLD expired on Handshake
   → Attestation response shows expired=true
   → Contract rejects claim

5. TLD already claimed on HSR
   → claimedTlds[namehash] is true
   → Contract reverts with "TLD already claimed"

6. Proof submitted too late (14-day expiry)
   → FDC proofs expire after ~14 days
   → User must re-request attestation
```

## Testing on Coston2

```
Coston2 testnet allows testing FDC without endpoint approval.
Use the Coston2 DA Layer API and verifier endpoints.

Coston2 FDC Contracts:
  FdcHub:           Use FlareContractRegistry
  FdcVerification:  Use FlareContractRegistry
  Relay:            Use FlareContractRegistry

Coston2 DA Layer:   https://ctn2-data-availability.flare.network
Coston2 Verifier:   https://fdc-verifiers-testnet.flare.network

Get testnet C2FLR from faucet:
  https://faucet.flare.network/coston2
```

## Key References

- FIP.14 (Web2Json): https://proposals.flare.network/FIP/FIP_14.html
- FDC Documentation: https://dev.flare.network/fdc/overview
- FDC Solidity Reference: https://dev.flare.network/fdc/solidity-reference
- Flare Contract Registry: https://dev.flare.network/network/solidity-reference
- HSD API Documentation: https://hsd-dev.org/api-docs/
