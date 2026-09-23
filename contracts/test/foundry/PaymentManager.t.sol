// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {TestBaseOrchestration} from "./helpers/TestBaseOrchestration.sol";
import {PaymentManager} from "../../src/tld-staking/orchestration/PaymentManager.sol";

contract PaymentManagerTest is TestBaseOrchestration {
    bytes32 internal tldNamehash;

    function setUp() public override {
        super.setUp();
        (, tldNamehash) = _claimTld("cryptofans");
    }

    // --- processPayment ---

    function test_processPayment_splits95_5() public {
        uint256 payAmount = 1 ether;

        vm.deal(address(registrationManager), payAmount);
        vm.prank(address(registrationManager));
        paymentManager.processPayment{value: payAmount}(tldNamehash, operator, 500);

        // 5% platform = 0.05 ether
        uint256 expectedPlatform = (payAmount * 500) / 10000;
        uint256 expectedOwner = payAmount - expectedPlatform;

        assertEq(paymentManager.pendingWithdrawals(platform), expectedPlatform);
        assertEq(paymentManager.pendingWithdrawals(operator), expectedOwner);
    }

    function test_processPayment_revertsNonRegistrationManager() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(PaymentManager.OnlyRegistrationManager.selector);
        paymentManager.processPayment{value: 1 ether}(tldNamehash, operator, 500);
    }

    function test_processPayment_accumulatesMultiple() public {
        uint256 payAmount = 1 ether;

        vm.deal(address(registrationManager), 10 ether);

        vm.startPrank(address(registrationManager));
        paymentManager.processPayment{value: payAmount}(tldNamehash, operator, 500);
        paymentManager.processPayment{value: payAmount}(tldNamehash, operator, 500);
        vm.stopPrank();

        uint256 expectedPlatform = ((payAmount * 500) / 10000) * 2;
        uint256 expectedOwner = (payAmount - (payAmount * 500) / 10000) * 2;

        assertEq(paymentManager.pendingWithdrawals(platform), expectedPlatform);
        assertEq(paymentManager.pendingWithdrawals(operator), expectedOwner);
    }

    // --- withdraw ---

    function test_withdraw_success() public {
        uint256 payAmount = 10 ether;
        vm.deal(address(registrationManager), payAmount);
        vm.prank(address(registrationManager));
        paymentManager.processPayment{value: payAmount}(tldNamehash, operator, 500);

        uint256 expectedOwner = payAmount - (payAmount * 500) / 10000;
        uint256 balBefore = operator.balance;

        vm.prank(operator);
        paymentManager.withdraw();

        assertEq(operator.balance, balBefore + expectedOwner);
        assertEq(paymentManager.pendingWithdrawals(operator), 0);
    }

    function test_withdraw_platform() public {
        uint256 payAmount = 10 ether;
        vm.deal(address(registrationManager), payAmount);
        vm.prank(address(registrationManager));
        paymentManager.processPayment{value: payAmount}(tldNamehash, operator, 500);

        uint256 expectedPlatform = (payAmount * 500) / 10000;
        uint256 balBefore = platform.balance;

        vm.prank(platform);
        paymentManager.withdraw();

        assertEq(platform.balance, balBefore + expectedPlatform);
    }

    function test_withdraw_revertsNothingToWithdraw() public {
        vm.prank(alice);
        vm.expectRevert(PaymentManager.NothingToWithdraw.selector);
        paymentManager.withdraw();
    }

    function test_withdraw_emitsEvent() public {
        uint256 payAmount = 1 ether;
        vm.deal(address(registrationManager), payAmount);
        vm.prank(address(registrationManager));
        paymentManager.processPayment{value: payAmount}(tldNamehash, operator, 500);

        uint256 expectedOwner = payAmount - (payAmount * 500) / 10000;

        vm.prank(operator);
        vm.expectEmit(true, true, true, true);
        emit PaymentManager.Withdrawn(operator, expectedOwner);
        paymentManager.withdraw();
    }

    // --- Admin ---

    function test_setPlatformFeeBps() public {
        vm.prank(owner);
        paymentManager.setPlatformFeeBps(1000); // 10%
        assertEq(paymentManager.platformFeeBps(), 1000);
    }

    function test_setPlatformFeeBps_revertsOverMax() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PaymentManager.InvalidFeeBps.selector, uint256(10001)));
        paymentManager.setPlatformFeeBps(10001);
    }

    function test_setPlatformFeeBps_revertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        paymentManager.setPlatformFeeBps(1000);
    }

    function test_setPlatformFeeRecipient() public {
        vm.prank(owner);
        paymentManager.setPlatformFeeRecipient(bob);
        assertEq(paymentManager.platformFeeRecipient(), bob);
    }

    function test_setPlatformFeeRecipient_revertsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(PaymentManager.ZeroAddress.selector);
        paymentManager.setPlatformFeeRecipient(address(0));
    }

    function test_setRegistrationManager_admin() public {
        address newRM = makeAddr("newRM");
        vm.prank(owner);
        paymentManager.setRegistrationManager(newRM);
        assertEq(paymentManager.registrationManager(), newRM);
    }
}
