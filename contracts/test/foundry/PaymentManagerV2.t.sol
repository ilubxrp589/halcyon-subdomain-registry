// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {PaymentManagerV2} from "../../src/tld-staking/orchestration/PaymentManagerV2.sol";

contract PaymentManagerV2Test is Test {
    PaymentManagerV2 public pm;

    address public owner = makeAddr("owner");
    address public platform = makeAddr("platform");
    address public regManager = makeAddr("registrationManager");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public operator = makeAddr("operator");

    uint256 constant DEFAULT_FEE_BPS = 2000; // 20% community default
    uint256 constant OPERATOR_FEE_BPS = 500; // 5% operator fee

    bytes32 internal communityTld = keccak256(abi.encodePacked(bytes32(0), keccak256("community")));
    bytes32 internal operatorTld = keccak256(abi.encodePacked(bytes32(0), keccak256("cryptofans")));

    function setUp() public {
        // Deploy implementation
        PaymentManagerV2 impl = new PaymentManagerV2();

        // Deploy behind UUPS proxy
        bytes memory initData = abi.encodeCall(
            PaymentManagerV2.initialize,
            (platform, DEFAULT_FEE_BPS, owner)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        pm = PaymentManagerV2(payable(address(proxy)));

        // Wire registration manager
        vm.prank(owner);
        pm.setRegistrationManager(regManager);
    }

    // =========================================================================
    // initialize
    // =========================================================================

    function test_initialize_setsStateCorrectly() public view {
        assertEq(pm.platformFeeRecipient(), platform);
        assertEq(pm.defaultPlatformFeeBps(), DEFAULT_FEE_BPS);
        assertEq(pm.owner(), owner);
        assertEq(pm.registrationManager(), regManager);
    }

    function test_initialize_cannotReinitialize() public {
        vm.expectRevert();
        pm.initialize(platform, DEFAULT_FEE_BPS, owner);
    }

    function test_initialize_revertsZeroRecipient() public {
        PaymentManagerV2 impl = new PaymentManagerV2();
        bytes memory initData = abi.encodeCall(
            PaymentManagerV2.initialize,
            (address(0), DEFAULT_FEE_BPS, owner)
        );
        vm.expectRevert(PaymentManagerV2.ZeroAddress.selector);
        new ERC1967Proxy(address(impl), initData);
    }

    function test_initialize_revertsInvalidFee() public {
        PaymentManagerV2 impl = new PaymentManagerV2();
        bytes memory initData = abi.encodeCall(
            PaymentManagerV2.initialize,
            (platform, 10001, owner)
        );
        vm.expectRevert(abi.encodeWithSelector(PaymentManagerV2.InvalidFeeBps.selector, uint256(10001)));
        new ERC1967Proxy(address(impl), initData);
    }

    // =========================================================================
    // setRegistrationManager
    // =========================================================================

    function test_setRegistrationManager_success() public {
        address newRM = makeAddr("newRM");
        vm.prank(owner);
        pm.setRegistrationManager(newRM);
        assertEq(pm.registrationManager(), newRM);
    }

    function test_setRegistrationManager_emitsEvent() public {
        address newRM = makeAddr("newRM");
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit PaymentManagerV2.RegistrationManagerUpdated(regManager, newRM);
        pm.setRegistrationManager(newRM);
    }

    function test_setRegistrationManager_revertsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(PaymentManagerV2.ZeroAddress.selector);
        pm.setRegistrationManager(address(0));
    }

    function test_setRegistrationManager_revertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        pm.setRegistrationManager(makeAddr("newRM"));
    }

    // =========================================================================
    // setTldFee / clearTldFee / getEffectiveFeeBps
    // =========================================================================

    function test_setTldFee_success() public {
        vm.prank(owner);
        pm.setTldFee(operatorTld, OPERATOR_FEE_BPS);

        assertEq(pm.tldFeeBps(operatorTld), OPERATOR_FEE_BPS);
        assertTrue(pm.tldFeeSet(operatorTld));
        assertEq(pm.getEffectiveFeeBps(operatorTld), OPERATOR_FEE_BPS);
    }

    function test_setTldFee_emitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit PaymentManagerV2.TldFeeBpsUpdated(operatorTld, OPERATOR_FEE_BPS);
        pm.setTldFee(operatorTld, OPERATOR_FEE_BPS);
    }

    function test_setTldFee_canSetToZero() public {
        vm.prank(owner);
        pm.setTldFee(operatorTld, 0);

        assertTrue(pm.tldFeeSet(operatorTld));
        assertEq(pm.getEffectiveFeeBps(operatorTld), 0);
    }

    function test_setTldFee_revertsOverMax() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PaymentManagerV2.InvalidFeeBps.selector, uint256(10001)));
        pm.setTldFee(operatorTld, 10001);
    }

    function test_setTldFee_revertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        pm.setTldFee(operatorTld, OPERATOR_FEE_BPS);
    }

    function test_clearTldFee_revertsToDefault() public {
        // Set override first
        vm.startPrank(owner);
        pm.setTldFee(operatorTld, OPERATOR_FEE_BPS);
        assertEq(pm.getEffectiveFeeBps(operatorTld), OPERATOR_FEE_BPS);

        // Clear it
        pm.clearTldFee(operatorTld);
        vm.stopPrank();

        assertFalse(pm.tldFeeSet(operatorTld));
        assertEq(pm.getEffectiveFeeBps(operatorTld), DEFAULT_FEE_BPS);
    }

    function test_clearTldFee_emitsEventWithDefault() public {
        vm.startPrank(owner);
        pm.setTldFee(operatorTld, OPERATOR_FEE_BPS);

        vm.expectEmit(true, true, true, true);
        emit PaymentManagerV2.TldFeeBpsUpdated(operatorTld, DEFAULT_FEE_BPS);
        pm.clearTldFee(operatorTld);
        vm.stopPrank();
    }

    function test_getEffectiveFeeBps_returnsDefaultWhenNotSet() public view {
        assertEq(pm.getEffectiveFeeBps(communityTld), DEFAULT_FEE_BPS);
    }

    function test_getEffectiveFeeBps_returnsOverrideWhenSet() public {
        vm.prank(owner);
        pm.setTldFee(operatorTld, OPERATOR_FEE_BPS);
        assertEq(pm.getEffectiveFeeBps(operatorTld), OPERATOR_FEE_BPS);
    }

    // =========================================================================
    // batchSetTldFees
    // =========================================================================

    function test_batchSetTldFees_setsMultiple() public {
        bytes32[] memory tlds = new bytes32[](3);
        tlds[0] = keccak256(abi.encodePacked(bytes32(0), keccak256("cryptofans")));
        tlds[1] = keccak256(abi.encodePacked(bytes32(0), keccak256("nflapps")));
        tlds[2] = keccak256(abi.encodePacked(bytes32(0), keccak256("sexyness")));

        vm.prank(owner);
        pm.batchSetTldFees(tlds, OPERATOR_FEE_BPS);

        for (uint256 i = 0; i < tlds.length; i++) {
            assertTrue(pm.tldFeeSet(tlds[i]));
            assertEq(pm.tldFeeBps(tlds[i]), OPERATOR_FEE_BPS);
            assertEq(pm.getEffectiveFeeBps(tlds[i]), OPERATOR_FEE_BPS);
        }
    }

    function test_batchSetTldFees_emitsEventsForEach() public {
        bytes32[] memory tlds = new bytes32[](2);
        tlds[0] = operatorTld;
        tlds[1] = communityTld;

        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit PaymentManagerV2.TldFeeBpsUpdated(tlds[0], OPERATOR_FEE_BPS);
        vm.expectEmit(true, true, true, true);
        emit PaymentManagerV2.TldFeeBpsUpdated(tlds[1], OPERATOR_FEE_BPS);
        pm.batchSetTldFees(tlds, OPERATOR_FEE_BPS);
    }

    function test_batchSetTldFees_revertsOverMax() public {
        bytes32[] memory tlds = new bytes32[](1);
        tlds[0] = operatorTld;

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PaymentManagerV2.InvalidFeeBps.selector, uint256(10001)));
        pm.batchSetTldFees(tlds, 10001);
    }

    function test_batchSetTldFees_revertsNonOwner() public {
        bytes32[] memory tlds = new bytes32[](1);
        tlds[0] = operatorTld;

        vm.prank(alice);
        vm.expectRevert();
        pm.batchSetTldFees(tlds, OPERATOR_FEE_BPS);
    }

    function test_batchSetTldFees_emptyArray() public {
        bytes32[] memory tlds = new bytes32[](0);

        vm.prank(owner);
        pm.batchSetTldFees(tlds, OPERATOR_FEE_BPS);
        // No revert, no-op
    }

    // =========================================================================
    // processPayment — default fee (20% community)
    // =========================================================================

    function test_processPayment_defaultFee20Percent() public {
        uint256 payAmount = 1 ether;

        vm.deal(regManager, payAmount);
        vm.prank(regManager);
        pm.processPayment{value: payAmount}(communityTld, alice, 500);

        uint256 expectedPlatform = (payAmount * DEFAULT_FEE_BPS) / 10000; // 20% = 0.2 ether
        uint256 expectedOwner = payAmount - expectedPlatform; // 0.8 ether

        assertEq(pm.pendingWithdrawals(platform), expectedPlatform);
        assertEq(pm.pendingWithdrawals(alice), expectedOwner);
    }

    function test_processPayment_emitsEvent() public {
        uint256 payAmount = 1 ether;
        uint256 expectedPlatform = (payAmount * DEFAULT_FEE_BPS) / 10000;
        uint256 expectedOwner = payAmount - expectedPlatform;

        vm.deal(regManager, payAmount);
        vm.prank(regManager);

        vm.expectEmit(true, true, true, true);
        emit PaymentManagerV2.PaymentProcessed(communityTld, alice, expectedOwner, expectedPlatform, 500);
        pm.processPayment{value: payAmount}(communityTld, alice, 500);
    }

    // =========================================================================
    // processPayment — per-TLD fee (5% operator)
    // =========================================================================

    function test_processPayment_perTldFee5Percent() public {
        // Set operator TLD to 5%
        vm.prank(owner);
        pm.setTldFee(operatorTld, OPERATOR_FEE_BPS);

        uint256 payAmount = 10 ether;
        vm.deal(regManager, payAmount);
        vm.prank(regManager);
        pm.processPayment{value: payAmount}(operatorTld, operator, 200);

        uint256 expectedPlatform = (payAmount * OPERATOR_FEE_BPS) / 10000; // 5% = 0.5 ether
        uint256 expectedOwner = payAmount - expectedPlatform; // 9.5 ether

        assertEq(pm.pendingWithdrawals(platform), expectedPlatform);
        assertEq(pm.pendingWithdrawals(operator), expectedOwner);
    }

    function test_processPayment_perTldFeeZero() public {
        // Set a TLD to 0% fee (100% goes to owner)
        vm.prank(owner);
        pm.setTldFee(operatorTld, 0);

        uint256 payAmount = 5 ether;
        vm.deal(regManager, payAmount);
        vm.prank(regManager);
        pm.processPayment{value: payAmount}(operatorTld, operator, 100);

        assertEq(pm.pendingWithdrawals(platform), 0);
        assertEq(pm.pendingWithdrawals(operator), payAmount);
    }

    function test_processPayment_accumulates() public {
        uint256 payAmount = 1 ether;
        vm.deal(regManager, 10 ether);

        vm.startPrank(regManager);
        pm.processPayment{value: payAmount}(communityTld, alice, 500);
        pm.processPayment{value: payAmount}(communityTld, alice, 500);
        pm.processPayment{value: payAmount}(communityTld, alice, 500);
        vm.stopPrank();

        uint256 singlePlatform = (payAmount * DEFAULT_FEE_BPS) / 10000;
        uint256 singleOwner = payAmount - singlePlatform;

        assertEq(pm.pendingWithdrawals(platform), singlePlatform * 3);
        assertEq(pm.pendingWithdrawals(alice), singleOwner * 3);
    }

    function test_processPayment_mixedFeeTiers() public {
        // Set operator TLD to 5%
        vm.prank(owner);
        pm.setTldFee(operatorTld, OPERATOR_FEE_BPS);

        uint256 payAmount = 1 ether;
        vm.deal(regManager, 10 ether);

        // Payment under operator TLD (5%)
        vm.prank(regManager);
        pm.processPayment{value: payAmount}(operatorTld, operator, 200);

        // Payment under community TLD (20%)
        vm.prank(regManager);
        pm.processPayment{value: payAmount}(communityTld, alice, 200);

        uint256 operatorPlatformFee = (payAmount * OPERATOR_FEE_BPS) / 10000; // 0.05 ether
        uint256 communityPlatformFee = (payAmount * DEFAULT_FEE_BPS) / 10000; // 0.2 ether

        assertEq(pm.pendingWithdrawals(platform), operatorPlatformFee + communityPlatformFee);
        assertEq(pm.pendingWithdrawals(operator), payAmount - operatorPlatformFee);
        assertEq(pm.pendingWithdrawals(alice), payAmount - communityPlatformFee);
    }

    function test_processPayment_revertsNonRegistrationManager() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(PaymentManagerV2.OnlyRegistrationManager.selector);
        pm.processPayment{value: 1 ether}(communityTld, alice, 500);
    }

    function test_processPayment_zeroValue() public {
        vm.prank(regManager);
        pm.processPayment{value: 0}(communityTld, alice, 0);

        assertEq(pm.pendingWithdrawals(platform), 0);
        assertEq(pm.pendingWithdrawals(alice), 0);
    }

    // =========================================================================
    // withdraw
    // =========================================================================

    function test_withdraw_tldOwner() public {
        uint256 payAmount = 10 ether;
        vm.deal(regManager, payAmount);
        vm.prank(regManager);
        pm.processPayment{value: payAmount}(communityTld, alice, 500);

        uint256 expectedOwner = payAmount - (payAmount * DEFAULT_FEE_BPS) / 10000;
        uint256 balBefore = alice.balance;

        vm.prank(alice);
        pm.withdraw();

        assertEq(alice.balance, balBefore + expectedOwner);
        assertEq(pm.pendingWithdrawals(alice), 0);
    }

    function test_withdraw_platformRecipient() public {
        uint256 payAmount = 10 ether;
        vm.deal(regManager, payAmount);
        vm.prank(regManager);
        pm.processPayment{value: payAmount}(communityTld, alice, 500);

        uint256 expectedPlatform = (payAmount * DEFAULT_FEE_BPS) / 10000;
        uint256 balBefore = platform.balance;

        vm.prank(platform);
        pm.withdraw();

        assertEq(platform.balance, balBefore + expectedPlatform);
        assertEq(pm.pendingWithdrawals(platform), 0);
    }

    function test_withdraw_emitsEvent() public {
        uint256 payAmount = 1 ether;
        vm.deal(regManager, payAmount);
        vm.prank(regManager);
        pm.processPayment{value: payAmount}(communityTld, alice, 500);

        uint256 expectedOwner = payAmount - (payAmount * DEFAULT_FEE_BPS) / 10000;

        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit PaymentManagerV2.Withdrawn(alice, expectedOwner);
        pm.withdraw();
    }

    function test_withdraw_revertsNothingToWithdraw() public {
        vm.prank(alice);
        vm.expectRevert(PaymentManagerV2.NothingToWithdraw.selector);
        pm.withdraw();
    }

    function test_withdraw_cannotDoubleWithdraw() public {
        uint256 payAmount = 1 ether;
        vm.deal(regManager, payAmount);
        vm.prank(regManager);
        pm.processPayment{value: payAmount}(communityTld, alice, 500);

        vm.prank(alice);
        pm.withdraw();

        vm.prank(alice);
        vm.expectRevert(PaymentManagerV2.NothingToWithdraw.selector);
        pm.withdraw();
    }

    // =========================================================================
    // setDefaultPlatformFeeBps
    // =========================================================================

    function test_setDefaultPlatformFeeBps_success() public {
        vm.prank(owner);
        pm.setDefaultPlatformFeeBps(1000); // 10%
        assertEq(pm.defaultPlatformFeeBps(), 1000);
    }

    function test_setDefaultPlatformFeeBps_emitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit PaymentManagerV2.DefaultPlatformFeeBpsUpdated(DEFAULT_FEE_BPS, 1000);
        pm.setDefaultPlatformFeeBps(1000);
    }

    function test_setDefaultPlatformFeeBps_revertsOverMax() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PaymentManagerV2.InvalidFeeBps.selector, uint256(10001)));
        pm.setDefaultPlatformFeeBps(10001);
    }

    function test_setDefaultPlatformFeeBps_revertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        pm.setDefaultPlatformFeeBps(1000);
    }

    function test_setDefaultPlatformFeeBps_affectsUnsetTlds() public {
        // Change default to 30%
        vm.prank(owner);
        pm.setDefaultPlatformFeeBps(3000);

        // Community TLD (no override) should use new default
        assertEq(pm.getEffectiveFeeBps(communityTld), 3000);
    }

    function test_setDefaultPlatformFeeBps_doesNotAffectOverrides() public {
        // Set operator TLD to 5%
        vm.prank(owner);
        pm.setTldFee(operatorTld, OPERATOR_FEE_BPS);

        // Change default to 30%
        vm.prank(owner);
        pm.setDefaultPlatformFeeBps(3000);

        // Operator TLD should still use its override
        assertEq(pm.getEffectiveFeeBps(operatorTld), OPERATOR_FEE_BPS);
        // Community TLD uses new default
        assertEq(pm.getEffectiveFeeBps(communityTld), 3000);
    }

    // =========================================================================
    // setPlatformFeeRecipient
    // =========================================================================

    function test_setPlatformFeeRecipient_success() public {
        vm.prank(owner);
        pm.setPlatformFeeRecipient(bob);
        assertEq(pm.platformFeeRecipient(), bob);
    }

    function test_setPlatformFeeRecipient_emitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit PaymentManagerV2.PlatformFeeRecipientUpdated(platform, bob);
        pm.setPlatformFeeRecipient(bob);
    }

    function test_setPlatformFeeRecipient_revertsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(PaymentManagerV2.ZeroAddress.selector);
        pm.setPlatformFeeRecipient(address(0));
    }

    function test_setPlatformFeeRecipient_revertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        pm.setPlatformFeeRecipient(bob);
    }

    function test_setPlatformFeeRecipient_newRecipientGetsNewPayments() public {
        // Process a payment — goes to platform
        uint256 payAmount = 1 ether;
        vm.deal(regManager, 10 ether);
        vm.prank(regManager);
        pm.processPayment{value: payAmount}(communityTld, alice, 500);

        uint256 platformBal1 = pm.pendingWithdrawals(platform);
        assertTrue(platformBal1 > 0);

        // Change recipient to bob
        vm.prank(owner);
        pm.setPlatformFeeRecipient(bob);

        // Process another payment — goes to bob
        vm.prank(regManager);
        pm.processPayment{value: payAmount}(communityTld, alice, 500);

        // Old platform still has first payment pending
        assertEq(pm.pendingWithdrawals(platform), platformBal1);
        // New recipient got second payment's platform fee
        assertEq(pm.pendingWithdrawals(bob), platformBal1);
    }

    // =========================================================================
    // UUPS upgrade
    // =========================================================================

    function test_upgrade_onlyOwner() public {
        PaymentManagerV2 newImpl = new PaymentManagerV2();

        vm.prank(alice);
        vm.expectRevert();
        pm.upgradeToAndCall(address(newImpl), "");
    }

    function test_upgrade_ownerCanUpgrade() public {
        PaymentManagerV2 newImpl = new PaymentManagerV2();

        vm.prank(owner);
        pm.upgradeToAndCall(address(newImpl), "");

        // State should be preserved
        assertEq(pm.platformFeeRecipient(), platform);
        assertEq(pm.defaultPlatformFeeBps(), DEFAULT_FEE_BPS);
        assertEq(pm.registrationManager(), regManager);
    }

    // =========================================================================
    // E2E scenario: operator vs community fee split
    // =========================================================================

    function test_e2e_operatorVsCommunityFeeSplit() public {
        // Setup: operator TLD at 5%, community stays at 20% default
        vm.prank(owner);
        pm.setTldFee(operatorTld, OPERATOR_FEE_BPS);

        vm.deal(regManager, 100 ether);

        // Operator TLD registration: 10 FLR
        vm.prank(regManager);
        pm.processPayment{value: 10 ether}(operatorTld, operator, 200);

        // Community TLD registration: 10 FLR
        vm.prank(regManager);
        pm.processPayment{value: 10 ether}(communityTld, bob, 200);

        // Operator keeps 95%: 9.5 FLR
        assertEq(pm.pendingWithdrawals(operator), 9.5 ether);
        // Bob (community TLD owner) keeps 80%: 8 FLR
        assertEq(pm.pendingWithdrawals(bob), 8 ether);
        // Platform gets 0.5 + 2.0 = 2.5 FLR
        assertEq(pm.pendingWithdrawals(platform), 2.5 ether);

        // Everyone withdraws
        uint256 opBal = operator.balance;
        vm.prank(operator);
        pm.withdraw();
        assertEq(operator.balance, opBal + 9.5 ether);

        uint256 bobBal = bob.balance;
        vm.prank(bob);
        pm.withdraw();
        assertEq(bob.balance, bobBal + 8 ether);

        uint256 platBal = platform.balance;
        vm.prank(platform);
        pm.withdraw();
        assertEq(platform.balance, platBal + 2.5 ether);

        // Contract balance should be 0
        assertEq(address(pm).balance, 0);
    }
}
