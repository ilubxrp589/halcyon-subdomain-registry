// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {TestBase} from "./TestBase.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IWeb2Json} from "@flarenetwork/flare-periphery-contracts/coston2/IWeb2Json.sol";

import {TldClaimManager} from "../../../src/tld-staking/orchestration/TldClaimManager.sol";
import {SldCommitIntent} from "../../../src/tld-staking/orchestration/SldCommitIntent.sol";
import {DefaultRegistrationStrategy} from "../../../src/tld-staking/orchestration/DefaultRegistrationStrategy.sol";
import {PaymentManager} from "../../../src/tld-staking/orchestration/PaymentManager.sol";
import {SldRegistrationManager} from "../../../src/tld-staking/orchestration/SldRegistrationManager.sol";

/// @title TestBaseOrchestration
/// @notice Extends TestBase with all Tier 3 orchestration contracts deployed and wired.
abstract contract TestBaseOrchestration is TestBase {
    // --- Tier 3 Contracts ---
    TldClaimManager public claimManager;
    SldCommitIntent public commitIntent;
    DefaultRegistrationStrategy public strategy;
    PaymentManager public paymentManager;
    SldRegistrationManager public registrationManager;

    // --- Additional test accounts ---
    address public platform = makeAddr("platform");

    // --- Constants ---
    uint256 constant PLATFORM_FEE_BPS = 500; // 5%
    uint256 constant DEFAULT_STAKING_FEE_USD = 10000; // $100 in cents

    function setUp() public virtual override {
        super.setUp();

        // 1. Deploy TldClaimManager behind UUPS proxy
        TldClaimManager claimImpl = new TldClaimManager();
        bytes memory claimInitData = abi.encodeCall(
            TldClaimManager.initialize,
            (address(hsrTld), address(labelValidator), operator, owner)
        );
        ERC1967Proxy claimProxy = new ERC1967Proxy(address(claimImpl), claimInitData);
        claimManager = TldClaimManager(address(claimProxy));

        // 2. Deploy SldCommitIntent (Ownable, not upgradeable)
        commitIntent = new SldCommitIntent(owner);

        // 3. Deploy DefaultRegistrationStrategy
        strategy = new DefaultRegistrationStrategy(address(hsrTld));

        // 4. Deploy PaymentManager
        paymentManager = new PaymentManager(platform, PLATFORM_FEE_BPS, owner);

        // 5. Deploy SldRegistrationManager behind UUPS proxy
        SldRegistrationManager rmImpl = new SldRegistrationManager();
        bytes memory rmInitData = abi.encodeCall(
            SldRegistrationManager.initialize,
            (
                address(hsrTld),
                address(hsrSld),
                address(ftsoOracle),
                address(globalRules),
                address(commitIntent),
                address(paymentManager),
                owner
            )
        );
        ERC1967Proxy rmProxy = new ERC1967Proxy(address(rmImpl), rmInitData);
        registrationManager = SldRegistrationManager(address(rmProxy));

        // 6. Re-wire everything
        vm.startPrank(owner);
        // HsrTld now uses the real claim manager
        hsrTld.setClaimManager(address(claimManager));
        // HsrSld now uses the real registration manager
        hsrSld.setRegistrationManager(address(registrationManager));
        // Wire circular dependencies
        commitIntent.setRegistrationManager(address(registrationManager));
        paymentManager.setRegistrationManager(address(registrationManager));
        // Phase 2: wire FDC staking dependencies
        claimManager.setFtsoOracle(address(ftsoOracle));
        claimManager.setStakingFee(DEFAULT_STAKING_FEE_USD);
        vm.stopPrank();
    }

    // --- Orchestration Helpers ---

    /// @notice Claims a TLD via the claim manager as operator. Returns tokenId and namehash.
    function _claimTld(string memory label) internal returns (uint256 tokenId, bytes32 namehash) {
        namehash = _computeTldNamehash(label);
        vm.prank(operator);
        tokenId = claimManager.operatorMint(label);
    }

    /// @notice Configures a TLD for registration: sets strategy + enables registration.
    function _configureTldForRegistration(bytes32 namehash, address tldOwner) internal {
        vm.startPrank(tldOwner);
        hsrTld.setRegistrationStrategy(namehash, address(strategy));
        hsrTld.setRegistrationEnabled(namehash, true);
        vm.stopPrank();
    }

    /// @notice Computes commit hash for the commit-reveal flow.
    function _computeCommitHash(
        string memory label,
        bytes32 tldNamehash,
        address sender,
        bytes32 secret
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(label, tldNamehash, sender, secret));
    }

    /// @notice Full commit-reveal registration flow. Returns tokenId.
    function _registerSld(
        string memory label,
        bytes32 tldNamehash,
        address buyer,
        uint256 durationYears,
        bytes32 secret,
        uint256 valueFLR
    ) internal returns (uint256 tokenId) {
        // Commit
        bytes32 commitHash = _computeCommitHash(label, tldNamehash, buyer, secret);
        vm.prank(buyer);
        commitIntent.commit(commitHash);

        // Advance past MIN_COMMIT_AGE
        vm.roll(block.number + commitIntent.MIN_COMMIT_AGE() + 1);

        // Register
        vm.prank(buyer);
        registrationManager.registerWithCommit{value: valueFLR}(label, tldNamehash, durationYears, secret);

        // Get tokenId from namehash
        bytes32 sldNamehash = _computeSldNamehash(tldNamehash, label);
        tokenId = hsrSld.sldNamehashToTokenId(sldNamehash);
    }

    // --- Phase 2 Helpers ---

    /// @notice Builds a mock IWeb2Json.Proof for FDC staking tests.
    function _buildMockProof(
        address claimer,
        bool expired,
        string memory state
    ) internal pure returns (IWeb2Json.Proof memory proof) {
        string memory flrAddress = string(
            abi.encodePacked("flr:", _addressToHexString(claimer))
        );

        bytes memory abiEncodedData = abi.encode(flrAddress, expired, state);

        proof.merkleProof = new bytes32[](0);
        proof.data.responseBody.abiEncodedData = abiEncodedData;
    }

    /// @notice Converts an address to its lowercase hex string with 0x prefix.
    function _addressToHexString(address addr) internal pure returns (string memory) {
        bytes memory hexChars = "0123456789abcdef";
        bytes memory result = new bytes(42);
        result[0] = "0";
        result[1] = "x";
        uint160 value = uint160(addr);
        for (uint256 i = 41; i > 1; i--) {
            result[i] = hexChars[value & 0xf];
            value >>= 4;
        }
        return string(result);
    }

    /// @notice Computes the required FLR for the default staking fee at current mock price.
    function _stakingFeeInFlr() internal view returns (uint256) {
        return ftsoOracle.usdCentsToFlr(DEFAULT_STAKING_FEE_USD);
    }
}
