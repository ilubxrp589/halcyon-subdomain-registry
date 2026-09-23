// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {TestBaseOrchestration} from "./helpers/TestBaseOrchestration.sol";
import {TldClaimManager} from "../../src/tld-staking/orchestration/TldClaimManager.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IWeb2Json} from "@flarenetwork/flare-periphery-contracts/coston2/IWeb2Json.sol";

contract TldClaimManagerTest is TestBaseOrchestration {
    // =========================================================================
    // Phase 1 Tests (unchanged)
    // =========================================================================

    function test_operatorMint_success() public {
        vm.prank(operator);
        uint256 tokenId = claimManager.operatorMint("cryptofans");

        assertGt(tokenId, 0);
        bytes32 namehash = _computeTldNamehash("cryptofans");
        assertEq(hsrTld.ownerOf(tokenId), operator);
        assertTrue(claimManager.claimedTlds(namehash));
    }

    function test_operatorMint_emitsEvent() public {
        bytes32 namehash = _computeTldNamehash("cryptofans");

        vm.prank(operator);
        vm.expectEmit(true, true, true, true);
        emit TldClaimManager.TldClaimed(namehash, "cryptofans", 1, operator);
        claimManager.operatorMint("cryptofans");
    }

    function test_operatorMint_revertsNonOperator() public {
        vm.prank(alice);
        vm.expectRevert(TldClaimManager.OnlyOperator.selector);
        claimManager.operatorMint("cryptofans");
    }

    function test_operatorMint_revertsInvalidLabel() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(TldClaimManager.InvalidLabel.selector, "INVALID"));
        claimManager.operatorMint("INVALID");
    }

    function test_operatorMint_revertsDuplicate() public {
        vm.startPrank(operator);
        claimManager.operatorMint("cryptofans");

        bytes32 namehash = _computeTldNamehash("cryptofans");
        vm.expectRevert(abi.encodeWithSelector(TldClaimManager.TldAlreadyClaimed.selector, namehash));
        claimManager.operatorMint("cryptofans");
        vm.stopPrank();
    }

    function test_operatorMintBatch_success() public {
        string[] memory labels = new string[](3);
        labels[0] = "cryptofans";
        labels[1] = "web3mv";
        labels[2] = "everquest";

        vm.prank(operator);
        uint256[] memory tokenIds = claimManager.operatorMintBatch(labels);

        assertEq(tokenIds.length, 3);
        for (uint256 i; i < 3; i++) {
            assertGt(tokenIds[i], 0);
        }
    }

    function test_operatorMintBatch_skipsDuplicates() public {
        vm.startPrank(operator);
        claimManager.operatorMint("cryptofans");

        string[] memory labels = new string[](3);
        labels[0] = "cryptofans"; // duplicate — should be skipped
        labels[1] = "web3mv";
        labels[2] = "everquest";

        uint256[] memory tokenIds = claimManager.operatorMintBatch(labels);
        vm.stopPrank();

        assertEq(tokenIds[0], 0); // skipped
        assertGt(tokenIds[1], 0);
        assertGt(tokenIds[2], 0);
    }

    function test_operatorMintBatch_skipsInvalid() public {
        string[] memory labels = new string[](3);
        labels[0] = "INVALID"; // invalid — should be skipped
        labels[1] = "web3mv";
        labels[2] = "";        // invalid — should be skipped

        vm.prank(operator);
        uint256[] memory tokenIds = claimManager.operatorMintBatch(labels);

        assertEq(tokenIds[0], 0); // skipped
        assertGt(tokenIds[1], 0);
        assertEq(tokenIds[2], 0); // skipped
    }

    function test_operatorMintBatch_revertsNonOperator() public {
        string[] memory labels = new string[](1);
        labels[0] = "cryptofans";

        vm.prank(alice);
        vm.expectRevert(TldClaimManager.OnlyOperator.selector);
        claimManager.operatorMintBatch(labels);
    }

    function test_setOperator() public {
        vm.prank(owner);
        claimManager.setOperator(alice);
        assertEq(claimManager.operator(), alice);
    }

    function test_setOperator_revertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        claimManager.setOperator(bob);
    }

    function test_setOperator_revertsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(TldClaimManager.ZeroAddress.selector);
        claimManager.setOperator(address(0));
    }

    function test_upgrade_onlyOwner() public {
        TldClaimManager newImpl = new TldClaimManager();
        vm.prank(alice);
        vm.expectRevert();
        claimManager.upgradeToAndCall(address(newImpl), "");
    }

    function test_upgrade_success() public {
        // Mint before upgrade
        vm.prank(operator);
        claimManager.operatorMint("cryptofans");

        // Upgrade
        TldClaimManager newImpl = new TldClaimManager();
        vm.prank(owner);
        claimManager.upgradeToAndCall(address(newImpl), "");

        // State preserved
        bytes32 namehash = _computeTldNamehash("cryptofans");
        assertTrue(claimManager.claimedTlds(namehash));
    }

    // =========================================================================
    // Phase 2 Tests: requestStake
    // =========================================================================

    function test_requestStake_success() public {
        uint256 fee = _stakingFeeInFlr();
        vm.deal(alice, fee + 1 ether);

        bytes memory mockRequest = hex"deadbeef";

        vm.prank(alice);
        claimManager.requestStake{value: fee}("coolname", mockRequest);

        bytes32 namehash = _computeTldNamehash("coolname");
        (address claimer,,, uint256 stakingFeePaid, uint256 requestTimestamp, bool completed) =
            claimManager.pendingClaims(namehash);

        assertEq(claimer, alice);
        assertEq(stakingFeePaid, fee);
        assertEq(requestTimestamp, block.timestamp);
        assertFalse(completed);

        // Verify FdcHub received the request
        assertEq(mockFdcHub.lastAttestationRequest(), mockRequest);
    }

    function test_requestStake_emitsEvent() public {
        uint256 fee = _stakingFeeInFlr();
        vm.deal(alice, fee);

        bytes32 namehash = _computeTldNamehash("coolname");

        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit TldClaimManager.StakeRequested(namehash, "coolname", alice, fee);
        claimManager.requestStake{value: fee}("coolname", hex"deadbeef");
    }

    function test_requestStake_refundsExcess() public {
        uint256 fee = _stakingFeeInFlr();
        uint256 excess = 1 ether;
        vm.deal(alice, fee + excess);

        uint256 balanceBefore = alice.balance;

        vm.prank(alice);
        claimManager.requestStake{value: fee + excess}("coolname", hex"deadbeef");

        // Alice should get the excess back
        assertEq(alice.balance, balanceBefore - fee);
    }

    function test_requestStake_revertsInsufficientFee() public {
        uint256 fee = _stakingFeeInFlr();
        uint256 tooLittle = fee - 1;
        vm.deal(alice, fee);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TldClaimManager.InsufficientStakingFee.selector, fee, tooLittle));
        claimManager.requestStake{value: tooLittle}("coolname", hex"deadbeef");
    }

    function test_requestStake_revertsDuplicateLabel() public {
        // First, operator-mint "cryptofans"
        vm.prank(operator);
        claimManager.operatorMint("cryptofans");

        uint256 fee = _stakingFeeInFlr();
        vm.deal(alice, fee);

        bytes32 namehash = _computeTldNamehash("cryptofans");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TldClaimManager.TldAlreadyClaimed.selector, namehash));
        claimManager.requestStake{value: fee}("cryptofans", hex"deadbeef");
    }

    function test_requestStake_revertsAlreadyPending() public {
        uint256 fee = _stakingFeeInFlr();
        vm.deal(alice, fee * 2);

        vm.prank(alice);
        claimManager.requestStake{value: fee}("coolname", hex"deadbeef");

        bytes32 namehash = _computeTldNamehash("coolname");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TldClaimManager.ClaimAlreadyPending.selector, namehash));
        claimManager.requestStake{value: fee}("coolname", hex"deadbeef");
    }

    function test_requestStake_revertsInvalidLabel() public {
        uint256 fee = _stakingFeeInFlr();
        vm.deal(alice, fee);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TldClaimManager.InvalidLabel.selector, "INVALID"));
        claimManager.requestStake{value: fee}("INVALID", hex"deadbeef");
    }

    // =========================================================================
    // Phase 2 Tests: completeStake
    // =========================================================================

    function test_completeStake_success() public {
        // Request stake
        uint256 fee = _stakingFeeInFlr();
        vm.deal(alice, fee);
        vm.prank(alice);
        claimManager.requestStake{value: fee}("coolname", hex"deadbeef");

        // Enable verification mock
        mockFdcVerification.setShouldVerify(true);

        // Build proof with alice's address, not expired, state = "CLOSED"
        IWeb2Json.Proof memory proof = _buildMockProof(alice, false, "CLOSED");

        // Complete stake (anyone can call)
        claimManager.completeStake("coolname", proof);

        // Verify NFT minted to alice
        bytes32 namehash = _computeTldNamehash("coolname");
        assertTrue(claimManager.claimedTlds(namehash));
        (,,,, , bool completed) = claimManager.pendingClaims(namehash);
        assertTrue(completed);

        // Verify alice owns the TLD NFT
        uint256 tokenId = hsrTld.namehashToTokenId(namehash);
        assertEq(hsrTld.ownerOf(tokenId), alice);
    }

    function test_completeStake_emitsEvent() public {
        uint256 fee = _stakingFeeInFlr();
        vm.deal(alice, fee);
        vm.prank(alice);
        claimManager.requestStake{value: fee}("coolname", hex"deadbeef");

        mockFdcVerification.setShouldVerify(true);
        IWeb2Json.Proof memory proof = _buildMockProof(alice, false, "CLOSED");

        bytes32 namehash = _computeTldNamehash("coolname");

        vm.expectEmit(true, true, true, true);
        emit TldClaimManager.StakeCompleted(namehash, "coolname", alice, 1);
        claimManager.completeStake("coolname", proof);
    }

    function test_completeStake_revertsInvalidProof() public {
        uint256 fee = _stakingFeeInFlr();
        vm.deal(alice, fee);
        vm.prank(alice);
        claimManager.requestStake{value: fee}("coolname", hex"deadbeef");

        // Leave shouldVerify as false (default)
        IWeb2Json.Proof memory proof = _buildMockProof(alice, false, "CLOSED");

        vm.expectRevert(TldClaimManager.InvalidProof.selector);
        claimManager.completeStake("coolname", proof);
    }

    function test_completeStake_revertsExpiredTld() public {
        uint256 fee = _stakingFeeInFlr();
        vm.deal(alice, fee);
        vm.prank(alice);
        claimManager.requestStake{value: fee}("coolname", hex"deadbeef");

        mockFdcVerification.setShouldVerify(true);

        // Build proof with expired = true
        IWeb2Json.Proof memory proof = _buildMockProof(alice, true, "CLOSED");

        vm.expectRevert(TldClaimManager.TldExpiredOnHandshake.selector);
        claimManager.completeStake("coolname", proof);
    }

    function test_completeStake_revertsTldNotClosed() public {
        uint256 fee = _stakingFeeInFlr();
        vm.deal(alice, fee);
        vm.prank(alice);
        claimManager.requestStake{value: fee}("coolname", hex"deadbeef");

        mockFdcVerification.setShouldVerify(true);

        // Build proof with state != "CLOSED"
        IWeb2Json.Proof memory proof = _buildMockProof(alice, false, "OPENING");

        vm.expectRevert(TldClaimManager.TldNotClosed.selector);
        claimManager.completeStake("coolname", proof);
    }

    function test_completeStake_revertsWrongAddress() public {
        uint256 fee = _stakingFeeInFlr();
        vm.deal(alice, fee);
        vm.prank(alice);
        claimManager.requestStake{value: fee}("coolname", hex"deadbeef");

        mockFdcVerification.setShouldVerify(true);

        // Build proof with bob's address instead of alice
        IWeb2Json.Proof memory proof = _buildMockProof(bob, false, "CLOSED");

        vm.expectRevert(abi.encodeWithSelector(TldClaimManager.AddressMismatch.selector, alice, bob));
        claimManager.completeStake("coolname", proof);
    }

    function test_completeStake_revertsNoPendingClaim() public {
        mockFdcVerification.setShouldVerify(true);
        IWeb2Json.Proof memory proof = _buildMockProof(alice, false, "CLOSED");

        bytes32 namehash = _computeTldNamehash("nopending");
        vm.expectRevert(abi.encodeWithSelector(TldClaimManager.NoPendingClaim.selector, namehash));
        claimManager.completeStake("nopending", proof);
    }

    function test_completeStake_revertsAlreadyCompleted() public {
        uint256 fee = _stakingFeeInFlr();
        vm.deal(alice, fee);
        vm.prank(alice);
        claimManager.requestStake{value: fee}("coolname", hex"deadbeef");

        mockFdcVerification.setShouldVerify(true);
        IWeb2Json.Proof memory proof = _buildMockProof(alice, false, "CLOSED");

        // Complete once
        claimManager.completeStake("coolname", proof);

        // Try again — should revert
        bytes32 namehash = _computeTldNamehash("coolname");
        vm.expectRevert(abi.encodeWithSelector(TldClaimManager.ClaimAlreadyCompleted.selector, namehash));
        claimManager.completeStake("coolname", proof);
    }

    // =========================================================================
    // Phase 2 Tests: refundExpiredStake
    // =========================================================================

    function test_refundExpiredStake_success() public {
        uint256 fee = _stakingFeeInFlr();
        vm.deal(alice, fee);
        vm.prank(alice);
        claimManager.requestStake{value: fee}("coolname", hex"deadbeef");

        bytes32 namehash = _computeTldNamehash("coolname");

        // Warp past expiry
        vm.warp(block.timestamp + 14 days + 1);

        uint256 aliceBalanceBefore = alice.balance;
        claimManager.refundExpiredStake(namehash);

        // Alice gets her fee back
        assertEq(alice.balance, aliceBalanceBefore + fee);

        // Pending claim should be deleted
        (address claimer,,,,,) = claimManager.pendingClaims(namehash);
        assertEq(claimer, address(0));
    }

    function test_refundExpiredStake_emitsEvent() public {
        uint256 fee = _stakingFeeInFlr();
        vm.deal(alice, fee);
        vm.prank(alice);
        claimManager.requestStake{value: fee}("coolname", hex"deadbeef");

        bytes32 namehash = _computeTldNamehash("coolname");
        vm.warp(block.timestamp + 14 days + 1);

        vm.expectEmit(true, true, true, true);
        emit TldClaimManager.StakeRefunded(namehash, alice, fee);
        claimManager.refundExpiredStake(namehash);
    }

    function test_refundExpiredStake_revertsNotExpired() public {
        uint256 fee = _stakingFeeInFlr();
        vm.deal(alice, fee);
        vm.prank(alice);
        claimManager.requestStake{value: fee}("coolname", hex"deadbeef");

        bytes32 namehash = _computeTldNamehash("coolname");

        // Only 13 days passed — not yet expired
        vm.warp(block.timestamp + 13 days);

        vm.expectRevert(abi.encodeWithSelector(TldClaimManager.ClaimNotExpired.selector, namehash));
        claimManager.refundExpiredStake(namehash);
    }

    function test_refundExpiredStake_revertsNoPendingClaim() public {
        bytes32 namehash = _computeTldNamehash("nonexistent");
        vm.expectRevert(abi.encodeWithSelector(TldClaimManager.NoPendingClaim.selector, namehash));
        claimManager.refundExpiredStake(namehash);
    }

    function test_refundExpiredStake_revertsAlreadyCompleted() public {
        uint256 fee = _stakingFeeInFlr();
        vm.deal(alice, fee);
        vm.prank(alice);
        claimManager.requestStake{value: fee}("coolname", hex"deadbeef");

        // Complete the stake first
        mockFdcVerification.setShouldVerify(true);
        IWeb2Json.Proof memory proof = _buildMockProof(alice, false, "CLOSED");
        claimManager.completeStake("coolname", proof);

        // Try to refund — should revert even after expiry
        bytes32 namehash = _computeTldNamehash("coolname");
        vm.warp(block.timestamp + 14 days + 1);

        vm.expectRevert(abi.encodeWithSelector(TldClaimManager.ClaimAlreadyCompleted.selector, namehash));
        claimManager.refundExpiredStake(namehash);
    }

    // =========================================================================
    // Phase 2 Tests: Admin setters
    // =========================================================================

    function test_setFtsoOracle_success() public {
        address newOracle = makeAddr("newOracle");
        vm.prank(owner);
        claimManager.setFtsoOracle(newOracle);
        assertEq(address(claimManager.ftsoOracle()), newOracle);
    }

    function test_setFtsoOracle_revertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        claimManager.setFtsoOracle(makeAddr("newOracle"));
    }

    function test_setFtsoOracle_revertsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(TldClaimManager.ZeroAddress.selector);
        claimManager.setFtsoOracle(address(0));
    }

    function test_setStakingFee_success() public {
        vm.prank(owner);
        claimManager.setStakingFee(20000); // $200
        assertEq(claimManager.stakingFeeUsd(), 20000);
    }

    function test_setStakingFee_revertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        claimManager.setStakingFee(20000);
    }
}
