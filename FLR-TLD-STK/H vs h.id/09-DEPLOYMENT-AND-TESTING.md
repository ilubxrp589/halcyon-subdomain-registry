# HSR — Deployment & Testing

## Foundry Project Setup

```bash
# Initialize project
forge init hsr-contracts
cd hsr-contracts

# Install dependencies
forge install OpenZeppelin/openzeppelin-contracts
forge install OpenZeppelin/openzeppelin-contracts-upgradeable
forge install foundry-rs/forge-std
forge install flarenetwork/flare-periphery-contracts

# remappings.txt
@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/
@openzeppelin/contracts-upgradeable/=lib/openzeppelin-contracts-upgradeable/contracts/
forge-std/=lib/forge-std/src/
@flarenetwork/=lib/flare-periphery-contracts/
```

### Project Structure

```
hsr-contracts/
├── src/
│   ├── core/
│   │   ├── HsrTld.sol
│   │   ├── HsrSld.sol
│   │   ├── TldClaimManager.sol
│   │   └── SldRegistrationManager.sol
│   ├── pricing/
│   │   ├── DefaultRegistrationStrategy.sol
│   │   ├── GlobalRegistrationRules.sol
│   │   └── LabelValidator.sol
│   ├── payment/
│   │   ├── PaymentManager.sol
│   │   └── FtsoOracle.sol
│   ├── resolver/
│   │   ├── DefaultResolver.sol
│   │   └── ReverseRegistrar.sol
│   ├── metadata/
│   │   ├── SldMetadataService.sol
│   │   └── TldMetadataService.sol
│   ├── commit/
│   │   └── SldCommitIntent.sol
│   └── interfaces/
│       ├── IHsrTld.sol
│       ├── IHsrSld.sol
│       ├── IRegistrationStrategy.sol
│       ├── IFtsoV2.sol
│       ├── IFdcHub.sol
│       ├── IFdcVerification.sol
│       └── IFlareContractRegistry.sol
├── test/
│   ├── HsrTld.t.sol
│   ├── HsrSld.t.sol
│   ├── TldClaimManager.t.sol
│   ├── SldRegistrationManager.t.sol
│   ├── DefaultRegistrationStrategy.t.sol
│   ├── PaymentManager.t.sol
│   ├── FtsoOracle.t.sol
│   ├── DefaultResolver.t.sol
│   ├── LabelValidator.t.sol
│   ├── SldCommitIntent.t.sol
│   └── integration/
│       ├── FullRegistrationFlow.t.sol
│       └── FdcStaking.t.sol
├── script/
│   ├── Deploy.s.sol
│   ├── DeployCoston2.s.sol
│   ├── OperatorMintBatch.s.sol
│   └── ConfigurePricing.s.sol
├── foundry.toml
└── remappings.txt
```

### foundry.toml

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.25"
evm_version = "cancun"  # Required for @flarenetwork/flare-periphery-contracts
optimizer = true
optimizer_runs = 200
via_ir = false

[profile.default.fuzz]
runs = 256

[rpc_endpoints]
flare = "${FLARE_RPC}"
coston2 = "${COSTON2_RPC}"

[etherscan]
flare = { key = "${FLARESCAN_API_KEY}", url = "https://flare-explorer.flare.network/api" }
coston2 = { key = "${FLARESCAN_API_KEY}", url = "https://coston2-explorer.flare.network/api" }
```

## Unit Tests

### TLD Contract Tests

```solidity
// test/HsrTld.t.sol
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import "../src/core/HsrTld.sol";

contract HsrTldTest is Test {
    HsrTld tld;
    address operator = address(1);
    address claimManager = address(2);
    address user1 = address(3);
    
    function setUp() public {
        tld = new HsrTld();
        tld.initialize(claimManager);
    }
    
    function testMintTld() public {
        vm.prank(claimManager);
        uint256 tokenId = tld.mint(operator, "coolname", computeNamehash("coolname"));
        
        assertEq(tld.ownerOf(tokenId), operator);
        assertEq(tld.ownerOfNamehash(computeNamehash("coolname")), operator);
    }
    
    function testCannotMintDuplicateTld() public {
        vm.startPrank(claimManager);
        tld.mint(operator, "coolname", computeNamehash("coolname"));
        
        vm.expectRevert("Already minted");
        tld.mint(user1, "coolname", computeNamehash("coolname"));
        vm.stopPrank();
    }
    
    function testOnlyClaimManagerCanMint() public {
        vm.prank(user1);
        vm.expectRevert("Not claim manager");
        tld.mint(user1, "coolname", computeNamehash("coolname"));
    }
    
    function testSetRegistrationStrategy() public {
        vm.prank(claimManager);
        tld.mint(operator, "coolname", computeNamehash("coolname"));
        
        address strategy = address(100);
        vm.prank(operator);
        tld.setRegistrationStrategy(computeNamehash("coolname"), strategy);
        
        assertEq(tld.getRegistrationStrategy(computeNamehash("coolname")), strategy);
    }
    
    function testToggleRegistration() public {
        bytes32 nh = computeNamehash("coolname");
        vm.prank(claimManager);
        tld.mint(operator, "coolname", nh);
        
        assertFalse(tld.isRegistrationEnabled(nh));
        
        vm.prank(operator);
        tld.setRegistrationEnabled(nh, true);
        assertTrue(tld.isRegistrationEnabled(nh));
    }
    
    function computeNamehash(string memory label) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(bytes32(0), keccak256(bytes(label))));
    }
}
```

### Label Validator Tests

```solidity
// test/LabelValidator.t.sol
contract LabelValidatorTest is Test {
    LabelValidator validator;
    
    function setUp() public {
        validator = new LabelValidator();
    }
    
    function testValidLabels() public {
        assertTrue(validator.isValidLabel("alice"));
        assertTrue(validator.isValidLabel("a"));
        assertTrue(validator.isValidLabel("bob123"));
        assertTrue(validator.isValidLabel("x9z"));
        assertTrue(validator.isValidLabel("0"));
        assertTrue(validator.isValidLabel("abcdefghijklmnopqrstuvwxyz0123456789"));
    }
    
    function testInvalidLabels() public {
        assertFalse(validator.isValidLabel(""));           // empty
        assertFalse(validator.isValidLabel("Alice"));      // uppercase
        assertFalse(validator.isValidLabel("hello world"));// space
        assertFalse(validator.isValidLabel("hello_world"));// underscore
        assertFalse(validator.isValidLabel("hello.world"));// dot
        assertFalse(validator.isValidLabel("hello-world"));// hyphen (if disallowed)
        // Unicode tested separately due to Solidity string handling
    }
}
```

### Pricing Strategy Tests

```solidity
// test/DefaultRegistrationStrategy.t.sol
contract DefaultRegistrationStrategyTest is Test {
    DefaultRegistrationStrategy strategy;
    HsrTld tld;
    bytes32 namehash;
    address operator = address(1);
    
    function setUp() public {
        // ... setup contracts
        namehash = computeNamehash("coolname");
        
        // Set default pricing
        uint256[10] memory prices = [
            uint256(50000), 25000, 10000, 500, 200, 100, 100, 100, 100, 100
        ];
        vm.prank(operator);
        strategy.setLengthPrices(namehash, prices);
    }
    
    function testLengthBasedPricing() public {
        // 1 char = $500
        assertEq(strategy.getPriceInUsdCents(user, namehash, "a", 1, false), 50000);
        // 3 chars = $100
        assertEq(strategy.getPriceInUsdCents(user, namehash, "abc", 1, false), 10000);
        // 5 chars = $2
        assertEq(strategy.getPriceInUsdCents(user, namehash, "alice", 1, false), 200);
        // 10 chars = $1
        assertEq(strategy.getPriceInUsdCents(user, namehash, "abcdefghij", 1, false), 100);
        // 15 chars = $1 (10+ bracket)
        assertEq(strategy.getPriceInUsdCents(user, namehash, "abcdefghijklmno", 1, false), 100);
    }
    
    function testMultiYearPricing() public {
        // 5 chars, 3 years, 10% discount
        // Base: $2 * 3 = $6, minus 10% = $5.40 = 540 cents
        uint256 price = strategy.getPriceInUsdCents(user, namehash, "alice", 3, false);
        assertEq(price, 540);
    }
    
    function testPremiumNames() public {
        string[] memory labels = new string[](1);
        labels[0] = "crypto";
        uint256[] memory prices = new uint256[](1);
        prices[0] = 100000; // $1000
        
        vm.prank(operator);
        strategy.setPremiumNames(namehash, labels, prices);
        
        assertEq(strategy.getPriceInUsdCents(user, namehash, "crypto", 1, false), 100000);
    }
    
    function testMinimumPriceEnforced() public {
        // Even if strategy returns 0, minimum $1/year applies
        // (enforced by GlobalRegistrationRules, not strategy itself)
    }
}
```

### Integration Test: Full Registration Flow

```solidity
// test/integration/FullRegistrationFlow.t.sol
contract FullRegistrationFlowTest is Test {
    // All contracts deployed
    HsrTld tld;
    HsrSld sld;
    TldClaimManager claimManager;
    SldRegistrationManager regManager;
    PaymentManager paymentManager;
    DefaultRegistrationStrategy strategy;
    FtsoOracle ftsoOracle;
    SldCommitIntent commitIntent;
    DefaultResolver resolver;
    
    address operator = address(1);
    address buyer = address(2);
    
    function setUp() public {
        // Deploy all contracts, link them together
        // Mock FTSO to return fixed price (e.g., $0.025 per FLR)
        // ... extensive setup
    }
    
    function testFullFlow() public {
        // 1. Operator mints TLD
        vm.prank(operator);
        claimManager.operatorMint("coolname");
        
        bytes32 tldNamehash = computeNamehash("coolname");
        assertEq(tld.ownerOfNamehash(tldNamehash), operator);
        
        // 2. Operator configures pricing
        vm.startPrank(operator);
        tld.setRegistrationStrategy(tldNamehash, address(strategy));
        // ... set prices
        tld.setRegistrationEnabled(tldNamehash, true);
        vm.stopPrank();
        
        // 3. Buyer commits registration
        bytes32 secret = keccak256("my-secret");
        bytes32 commitHash = keccak256(
            abi.encodePacked("alice", tldNamehash, buyer, secret)
        );
        
        vm.prank(buyer);
        commitIntent.commit(commitHash);
        
        // 4. Wait 8 blocks
        vm.roll(block.number + 8);
        
        // 5. Buyer registers with payment
        uint256 requiredFlr = ftsoOracle.usdCentsToFlr(200); // $2 for 5-char, 1 year
        
        vm.deal(buyer, requiredFlr + 1 ether); // fund buyer
        vm.prank(buyer);
        regManager.registerWithCommit{value: requiredFlr}(
            "alice", tldNamehash, 1, secret
        );
        
        // 6. Verify SLD minted
        bytes32 sldNamehash = keccak256(
            abi.encodePacked(tldNamehash, keccak256("alice"))
        );
        uint256 tokenId = sld.sldNamehashToTokenId(sldNamehash);
        assertGt(tokenId, 0);
        assertEq(sld.ownerOf(tokenId), buyer);
        
        // 7. Verify payment split
        // 95% to operator, 5% to platform
        uint256 operatorBalance = paymentManager.pendingWithdrawals(operator);
        uint256 platformBalance = paymentManager.pendingWithdrawals(platformFeeRecipient);
        assertEq(operatorBalance, requiredFlr * 95 / 100);
        assertEq(platformBalance, requiredFlr * 5 / 100);
        
        // 8. Verify resolver set
        address resolverAddr = sld.getResolver(sldNamehash);
        assertEq(resolverAddr, address(resolver));
    }
    
    function testRenewalPriceLock() public {
        // Register at $2/year
        // ... (register "alice.coolname")
        
        // Operator changes price to $10/year
        // ... (update pricing strategy)
        
        // Renewal should still cost $2/year (price lock)
        bytes32 sldNamehash = computeSldNamehash("coolname", "alice");
        uint256 renewalPrice = strategy.getPriceInUsdCents(
            buyer, tldNamehash, "alice", 1, true // isRenewal = true
        );
        assertEq(renewalPrice, 200); // $2, not $10
    }
}
```

## Deployment Scripts

### Deploy to Coston2 Testnet

```solidity
// script/DeployCoston2.s.sol
pragma solidity ^0.8.25;

import "forge-std/Script.sol";
import "../src/core/HsrTld.sol";
import "../src/core/HsrSld.sol";
import "../src/core/TldClaimManager.sol";
// ... other imports

contract DeployCoston2 is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("OPERATOR_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        
        vm.startBroadcast(deployerKey);
        
        // 1. Deploy utility contracts
        LabelValidator labelValidator = new LabelValidator();
        FtsoOracle ftsoOracle = new FtsoOracle();
        
        // 2. Deploy core contracts (proxied)
        HsrTld tldImpl = new HsrTld();
        // Deploy proxy pointing to impl
        // ... proxy setup
        
        HsrSld sldImpl = new HsrSld();
        // ... proxy setup
        
        // 3. Deploy claim manager
        TldClaimManager claimManagerImpl = new TldClaimManager();
        // ... proxy setup, initialize with tld address
        
        // 4. Deploy registration manager
        SldRegistrationManager regManagerImpl = new SldRegistrationManager();
        // ... proxy setup
        
        // 5. Deploy supporting contracts
        PaymentManager paymentManager = new PaymentManager(
            address(ftsoOracle),
            deployer,  // platform fee recipient
            500        // 5% platform fee
        );
        
        DefaultRegistrationStrategy strategy = new DefaultRegistrationStrategy(
            address(tldProxy)
        );
        
        SldCommitIntent commitIntent = new SldCommitIntent();
        
        GlobalRegistrationRules globalRules = new GlobalRegistrationRules(
            address(labelValidator),
            100  // minimum $1/year
        );
        
        DefaultResolver resolver = new DefaultResolver(address(sldProxy));
        
        // 6. Wire contracts together
        // Set roles, link contracts
        // ... initialization calls
        
        vm.stopBroadcast();
        
        // Log deployed addresses
        console.log("=== Deployed Addresses (Coston2) ===");
        console.log("HsrTld:", address(tldProxy));
        console.log("HsrSld:", address(sldProxy));
        console.log("TldClaimManager:", address(claimManagerProxy));
        console.log("SldRegistrationManager:", address(regManagerProxy));
        console.log("PaymentManager:", address(paymentManager));
        console.log("FtsoOracle:", address(ftsoOracle));
        console.log("DefaultRegistrationStrategy:", address(strategy));
        console.log("LabelValidator:", address(labelValidator));
        console.log("SldCommitIntent:", address(commitIntent));
        console.log("DefaultResolver:", address(resolver));
    }
}
```

### Deploy Command

```bash
# Coston2 testnet
forge script script/DeployCoston2.s.sol:DeployCoston2 \
    --rpc-url $COSTON2_RPC \
    --broadcast \
    --verify \
    -vvvv

# Flare mainnet (after testing)
forge script script/Deploy.s.sol:Deploy \
    --rpc-url $FLARE_RPC \
    --broadcast \
    --verify \
    -vvvv
```

### Operator Batch Mint Script

```solidity
// script/OperatorMintBatch.s.sol
contract OperatorMintBatch is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("OPERATOR_PRIVATE_KEY");
        
        TldClaimManager claimManager = TldClaimManager(vm.envAddress("CLAIM_MANAGER"));
        
        // Load TLD list from file
        string memory tldList = vm.readFile("tld-list.txt");
        // Parse and mint each TLD
        // ... batch mint logic
        
        vm.startBroadcast(deployerKey);
        
        string[] memory tlds = parseTldList(tldList);
        claimManager.operatorMintBatch(tlds);
        
        vm.stopBroadcast();
    }
}
```

## Testing Strategy

### Phase 1: Unit Tests (Local)

```bash
# Run all tests
forge test -vvv

# Run specific test
forge test --match-test testFullFlow -vvv

# Run with gas reporting
forge test --gas-report

# Run fuzz tests
forge test --match-test testFuzz -vvv
```

### Phase 2: Coston2 Integration Tests

```bash
# 1. Deploy to Coston2
forge script script/DeployCoston2.s.sol --rpc-url $COSTON2_RPC --broadcast

# 2. Operator mint test TLDs
forge script script/OperatorMintBatch.s.sol --rpc-url $COSTON2_RPC --broadcast

# 3. Test SLD registration manually
cast send $REG_MANAGER "registerWithCommit(string,bytes32,uint256,bytes32)" \
    "alice" $TLD_NAMEHASH 1 $SECRET \
    --value 1ether \
    --rpc-url $COSTON2_RPC \
    --private-key $USER_KEY

# 4. Verify on Coston2 explorer
# https://coston2-explorer.flare.network/address/<contract>
```

### Phase 3: FDC Testing on Coston2

```
1. Set up HSD node with test TLD
2. Configure TXT record with Flare address
3. Submit FDC attestation request via TldClaimManager
4. Wait for round finalization
5. Retrieve proof from DA Layer
6. Submit proof to complete stake
7. Verify TLD NFT minted correctly
```

### Phase 4: Pre-Mainnet Checklist

```
□ All unit tests pass
□ All integration tests pass on Coston2
□ Gas optimization complete
□ Security review / audit
□ FTSO oracle price conversion verified with real prices
□ Payment split math verified (no rounding errors that leak value)
□ Upgrade mechanism tested (proxy upgrade on Coston2)
□ Frontend connected and tested end-to-end
□ Event listener syncing correctly
□ Artwork pipeline generating and pinning to IPFS
□ Backup and recovery plan documented
□ FDC endpoint approval PR submitted (for Phase 2)
```

## Security Considerations

```
1. Reentrancy
   - Use ReentrancyGuard on all payable functions
   - Use pull pattern for payments (not direct sends)
   - Follow checks-effects-interactions pattern

2. Access Control
   - OpenZeppelin AccessControl or Ownable2Step
   - Separate proxy admin from contract owner
   - Multi-sig for mainnet operator wallet

3. Price Oracle Manipulation
   - FTSO has built-in manipulation resistance (median of providers)
   - Still add staleness check (reject prices older than 5 minutes)
   - Consider price deviation limits

4. Front-Running
   - Commit-reveal scheme prevents name sniping
   - MIN_COMMIT_AGE of 8 blocks (~15 seconds)
   - Commit valid for 24 hours

5. Overflow/Underflow
   - Solidity 0.8+ has built-in checks
   - Still be careful with USD↔FLR conversions at extreme prices

6. Upgrade Safety
   - Use OpenZeppelin UUPS or TransparentProxy
   - Test upgrade paths on Coston2 first
   - Storage layout compatibility between versions

7. Denial of Service
   - Gas limits on loops (batch operations)
   - No unbounded arrays in storage
   - Rate limiting on staking requests
```

## Gas Optimization

```
Key areas:
  - Use bytes32 for namehashes (cheaper than string keys)
  - Pack struct storage (Solidity auto-packs but verify)
  - Use events instead of storage where historical data suffices
  - Batch operations (operatorMintBatch)
  - Consider ERC-721A for batch minting efficiency
  - Minimize storage writes in hot paths (registration)
  - Use calldata instead of memory for function parameters
  - Cache storage reads in local variables
```

## Contract Verification

```bash
# Verify on Flare Explorer
forge verify-contract \
    --chain-id 14 \
    --compiler-version v0.8.25 \
    --optimizer-runs 200 \
    $CONTRACT_ADDRESS \
    src/core/HsrTld.sol:HsrTld \
    --etherscan-api-key $FLARESCAN_API_KEY

# For proxied contracts, verify both implementation and proxy
```

## Mainnet Deployment Sequence

```
1. Deploy utility contracts (LabelValidator, FtsoOracle, GlobalRules)
2. Deploy implementation contracts (HsrTld, HsrSld, TldClaimManager, etc.)
3. Deploy proxies pointing to implementations
4. Initialize all proxy contracts
5. Wire contracts together (set roles, link addresses)
6. Verify all contracts on explorer
7. Test with single TLD mint
8. Batch mint operator's TLDs
9. Configure pricing for all TLDs
10. Enable registration on selected TLDs
11. Monitor first registrations closely
12. Gradually enable all TLDs
```
