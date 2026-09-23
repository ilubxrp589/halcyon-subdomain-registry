// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {TestBaseOrchestration} from "./helpers/TestBaseOrchestration.sol";
import {TldClaimManager} from "../../src/tld-staking/orchestration/TldClaimManager.sol";
import {IWeb2Json} from "@flarenetwork/flare-periphery-contracts/coston2/IWeb2Json.sol";

/// @title FDC Staking Integration Test
/// @notice End-to-end lifecycle: FDC stake → TLD minted → configure → register SLD → payment split to staker.
///         Also covers: expired stake refund, re-stake after refund, and staker revenue from SLD registrations.
contract FdcStakingTest is TestBaseOrchestration {
    bytes32 internal constant SECRET = keccak256("fdcstakingsecret");
    bytes internal constant MOCK_ATTESTATION_REQUEST = hex"deadbeef";

    // =========================================================================
    // Happy Path: Full FDC Staking → SLD Revenue Lifecycle
    // =========================================================================

    /// @notice Full lifecycle: alice stakes TLD via FDC → configures it → bob registers SLD → alice earns 95%.
    function test_fdcStake_fullLifecycle() public {
        uint256 stakingFee = _stakingFeeInFlr();
        vm.deal(alice, stakingFee + 10 ether);
        vm.deal(bob, 100 ether);

        // ===== Step 1: Alice requests FDC stake for "cooldomain" =====
        vm.prank(alice);
        claimManager.requestStake{value: stakingFee}("cooldomain", MOCK_ATTESTATION_REQUEST);

        // Verify pending claim stored
        bytes32 tldNamehash = _computeTldNamehash("cooldomain");
        (address claimer,,, uint256 feePaid, uint256 reqTs, bool completed) =
            claimManager.pendingClaims(tldNamehash);
        assertEq(claimer, alice);
        assertEq(feePaid, stakingFee);
        assertEq(reqTs, block.timestamp);
        assertFalse(completed);

        // Verify FdcHub received the attestation request
        assertEq(mockFdcHub.lastAttestationRequest(), MOCK_ATTESTATION_REQUEST);

        // ===== Step 2: FDC round completes — verify proof and mint TLD =====
        mockFdcVerification.setShouldVerify(true);
        IWeb2Json.Proof memory proof = _buildMockProof(alice, false, "CLOSED");

        claimManager.completeStake("cooldomain", proof);

        // Verify TLD NFT minted to alice
        uint256 tldTokenId = hsrTld.namehashToTokenId(tldNamehash);
        assertGt(tldTokenId, 0);
        assertEq(hsrTld.ownerOf(tldTokenId), alice);
        assertTrue(claimManager.claimedTlds(tldNamehash));

        // ===== Step 3: Alice configures TLD for SLD registration =====
        _configureTldForRegistration(tldNamehash, alice);
        assertTrue(hsrTld.isRegistrationEnabled(tldNamehash));
        assertEq(hsrTld.getRegistrationStrategy(tldNamehash), address(strategy));

        // ===== Step 4: Bob registers SLD "wallet.cooldomain" =====
        uint256 priceUsdCents = 100; // $1/yr (6-char default)
        uint256 requiredFlr = ftsoOracle.usdCentsToFlr(priceUsdCents);

        uint256 sldTokenId = _registerSld("wallet", tldNamehash, bob, 1, SECRET, requiredFlr);
        assertGt(sldTokenId, 0);
        assertEq(hsrSld.ownerOf(sldTokenId), bob);

        // ===== Step 5: Verify payment split — alice (TLD owner) gets 95% =====
        uint256 platformAmount = (requiredFlr * PLATFORM_FEE_BPS) / 10000; // 5%
        uint256 ownerAmount = requiredFlr - platformAmount; // 95%

        assertEq(paymentManager.pendingWithdrawals(alice), ownerAmount);
        assertEq(paymentManager.pendingWithdrawals(platform), platformAmount);

        // ===== Step 6: Alice withdraws her earnings =====
        uint256 aliceBalBefore = alice.balance;
        vm.prank(alice);
        paymentManager.withdraw();
        assertEq(alice.balance, aliceBalBefore + ownerAmount);
        assertEq(paymentManager.pendingWithdrawals(alice), 0);
    }

    // =========================================================================
    // Expired Stake → Refund → Re-Stake Lifecycle
    // =========================================================================

    /// @notice Alice stakes, claim expires, refund succeeds, then she re-stakes successfully.
    function test_fdcStake_expiredRefundThenRestake() public {
        uint256 stakingFee = _stakingFeeInFlr();
        vm.deal(alice, stakingFee * 3);

        bytes32 tldNamehash = _computeTldNamehash("expiredtld");

        // ===== Step 1: Alice requests stake =====
        vm.prank(alice);
        claimManager.requestStake{value: stakingFee}("expiredtld", MOCK_ATTESTATION_REQUEST);

        uint256 aliceBalAfterStake = alice.balance;

        // ===== Step 2: Claim expires (14 days) =====
        vm.warp(block.timestamp + 14 days + 1);
        mockFtsoV2.setPrice(DEFAULT_FLR_PRICE, uint64(block.timestamp));

        // ===== Step 3: Refund the expired stake =====
        claimManager.refundExpiredStake(tldNamehash);
        assertEq(alice.balance, aliceBalAfterStake + stakingFee);

        // Pending claim deleted
        (address claimer,,,,,) = claimManager.pendingClaims(tldNamehash);
        assertEq(claimer, address(0));

        // TLD is NOT claimed
        assertFalse(claimManager.claimedTlds(tldNamehash));

        // ===== Step 4: Alice re-stakes the same TLD =====
        vm.prank(alice);
        claimManager.requestStake{value: stakingFee}("expiredtld", MOCK_ATTESTATION_REQUEST);

        // ===== Step 5: This time the proof comes through — complete the stake =====
        mockFdcVerification.setShouldVerify(true);
        IWeb2Json.Proof memory proof = _buildMockProof(alice, false, "CLOSED");
        claimManager.completeStake("expiredtld", proof);

        // Alice owns the TLD
        uint256 tokenId = hsrTld.namehashToTokenId(tldNamehash);
        assertEq(hsrTld.ownerOf(tokenId), alice);
    }

    // =========================================================================
    // Multi-Staker: Two Users Stake Different TLDs
    // =========================================================================

    /// @notice Alice and bob each stake different TLDs and both earn revenue from SLD registrations.
    function test_fdcStake_multiStakerRevenue() public {
        uint256 stakingFee = _stakingFeeInFlr();
        vm.deal(alice, stakingFee + 10 ether);
        vm.deal(bob, stakingFee + 100 ether);
        address charlie = makeAddr("charlie");
        vm.deal(charlie, 100 ether);

        // ===== Alice stakes "alphatld" =====
        vm.prank(alice);
        claimManager.requestStake{value: stakingFee}("alphatld", MOCK_ATTESTATION_REQUEST);

        // ===== Bob stakes "betatld" =====
        vm.prank(bob);
        claimManager.requestStake{value: stakingFee}("betatld", MOCK_ATTESTATION_REQUEST);

        // ===== Complete both stakes =====
        mockFdcVerification.setShouldVerify(true);

        IWeb2Json.Proof memory aliceProof = _buildMockProof(alice, false, "CLOSED");
        claimManager.completeStake("alphatld", aliceProof);

        IWeb2Json.Proof memory bobProof = _buildMockProof(bob, false, "CLOSED");
        claimManager.completeStake("betatld", bobProof);

        // ===== Configure both TLDs =====
        bytes32 alphaNh = _computeTldNamehash("alphatld");
        bytes32 betaNh = _computeTldNamehash("betatld");
        _configureTldForRegistration(alphaNh, alice);
        _configureTldForRegistration(betaNh, bob);

        // ===== Charlie registers on both TLDs =====
        // Use 6+ char labels — default strategy prices 6-char at $1/yr (100 cents)
        uint256 price = ftsoOracle.usdCentsToFlr(100);
        bytes32 secret2 = keccak256("multistakersecret2");

        _registerSld("gaming", alphaNh, charlie, 1, SECRET, price);
        _registerSld("gaming", betaNh, charlie, 1, secret2, price);

        // ===== Verify each TLD owner earned 95% from their own TLD =====
        uint256 platformCut = (price * PLATFORM_FEE_BPS) / 10000;
        uint256 ownerCut = price - platformCut;

        assertEq(paymentManager.pendingWithdrawals(alice), ownerCut);
        assertEq(paymentManager.pendingWithdrawals(bob), ownerCut);
        assertEq(paymentManager.pendingWithdrawals(platform), platformCut * 2); // 2 registrations
    }

    // =========================================================================
    // FDC Stake → SLD Registration → Renewal → Expiry
    // =========================================================================

    /// @notice Full lifecycle including SLD renewal and expiry after FDC-staked TLD.
    function test_fdcStake_sldRenewalAndExpiry() public {
        uint256 stakingFee = _stakingFeeInFlr();
        vm.deal(alice, stakingFee + 10 ether);
        vm.deal(bob, 200 ether);

        // ===== Stake and mint TLD =====
        vm.prank(alice);
        claimManager.requestStake{value: stakingFee}("renewtld", MOCK_ATTESTATION_REQUEST);
        mockFdcVerification.setShouldVerify(true);
        IWeb2Json.Proof memory proof = _buildMockProof(alice, false, "CLOSED");
        claimManager.completeStake("renewtld", proof);

        bytes32 tldNh = _computeTldNamehash("renewtld");
        _configureTldForRegistration(tldNh, alice);

        // ===== Bob registers "stream.renewtld" for 1 year =====
        // 6-char label = $1/yr (100 cents) via default strategy
        uint256 priceFlr = ftsoOracle.usdCentsToFlr(100);
        _registerSld("stream", tldNh, bob, 1, SECRET, priceFlr);
        bytes32 sldNh = _computeSldNamehash(tldNh, "stream");

        uint256 registrationTime = block.timestamp;
        assertEq(hsrSld.getExpiryTime(sldNh), registrationTime + 365 days);

        // ===== Bob renews for 2 more years =====
        uint256 renewalFlr = ftsoOracle.usdCentsToFlr(200); // $1/yr * 2 years
        vm.prank(bob);
        registrationManager.renew{value: renewalFlr}(sldNh, 2);

        assertEq(hsrSld.getExpiryTime(sldNh), registrationTime + 3 * 365 days);

        // ===== Alice earned 95% of both registration and renewal =====
        uint256 totalPaid = priceFlr + renewalFlr;
        uint256 aliceTotal = totalPaid - (totalPaid * PLATFORM_FEE_BPS) / 10000;
        assertEq(paymentManager.pendingWithdrawals(alice), aliceTotal);

        // ===== Warp past expiry + grace period =====
        vm.warp(registrationTime + 3 * 365 days + 30 days + 1);
        // Refresh FTSO price after warp
        mockFtsoV2.setPrice(DEFAULT_FLR_PRICE, uint64(block.timestamp));

        assertTrue(hsrSld.isAvailable(sldNh));
    }

    // =========================================================================
    // Failure: Operator-minted TLD blocks FDC stake
    // =========================================================================

    /// @notice Cannot FDC-stake a TLD that was already operator-minted.
    function test_fdcStake_blockedByOperatorMint() public {
        // Operator mints "cryptofans" first
        vm.prank(operator);
        claimManager.operatorMint("cryptofans");

        // Alice tries to FDC-stake "cryptofans"
        uint256 fee = _stakingFeeInFlr();
        vm.deal(alice, fee);

        bytes32 namehash = _computeTldNamehash("cryptofans");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TldClaimManager.TldAlreadyClaimed.selector, namehash));
        claimManager.requestStake{value: fee}("cryptofans", MOCK_ATTESTATION_REQUEST);
    }

    // =========================================================================
    // Failure: Completed FDC stake blocks second stake
    // =========================================================================

    /// @notice Once a TLD is FDC-staked, nobody else can stake the same TLD.
    function test_fdcStake_completedBlocksSecondStake() public {
        uint256 fee = _stakingFeeInFlr();
        vm.deal(alice, fee);
        vm.deal(bob, fee);

        // Alice stakes and completes
        vm.prank(alice);
        claimManager.requestStake{value: fee}("uniquetld", MOCK_ATTESTATION_REQUEST);
        mockFdcVerification.setShouldVerify(true);
        IWeb2Json.Proof memory proof = _buildMockProof(alice, false, "CLOSED");
        claimManager.completeStake("uniquetld", proof);

        // Bob tries to stake the same TLD
        bytes32 namehash = _computeTldNamehash("uniquetld");
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TldClaimManager.TldAlreadyClaimed.selector, namehash));
        claimManager.requestStake{value: fee}("uniquetld", MOCK_ATTESTATION_REQUEST);
    }

    // =========================================================================
    // Failure: Invalid proof during completeStake
    // =========================================================================

    /// @notice Stake request succeeds, but completeStake fails with bad proof — claim stays pending.
    function test_fdcStake_invalidProofLeavesClaimPending() public {
        uint256 fee = _stakingFeeInFlr();
        vm.deal(alice, fee);

        vm.prank(alice);
        claimManager.requestStake{value: fee}("badproof", MOCK_ATTESTATION_REQUEST);

        // Leave mockFdcVerification.shouldVerify as false (default)
        IWeb2Json.Proof memory proof = _buildMockProof(alice, false, "CLOSED");

        vm.expectRevert(TldClaimManager.InvalidProof.selector);
        claimManager.completeStake("badproof", proof);

        // Claim is still pending — not completed, not deleted
        bytes32 namehash = _computeTldNamehash("badproof");
        (address claimer,,,, , bool completed) = claimManager.pendingClaims(namehash);
        assertEq(claimer, alice);
        assertFalse(completed);
        assertFalse(claimManager.claimedTlds(namehash));
    }

    // =========================================================================
    // Failure: Address mismatch — proof has wrong claimer
    // =========================================================================

    /// @notice Proof contains bob's address but alice is the claimer — revert.
    function test_fdcStake_addressMismatchReverts() public {
        uint256 fee = _stakingFeeInFlr();
        vm.deal(alice, fee);

        vm.prank(alice);
        claimManager.requestStake{value: fee}("mismatch", MOCK_ATTESTATION_REQUEST);

        mockFdcVerification.setShouldVerify(true);
        // Proof has bob's address, but alice is the claimer
        IWeb2Json.Proof memory proof = _buildMockProof(bob, false, "CLOSED");

        vm.expectRevert(abi.encodeWithSelector(TldClaimManager.AddressMismatch.selector, alice, bob));
        claimManager.completeStake("mismatch", proof);
    }

    // =========================================================================
    // Excess Fee Refund During Lifecycle
    // =========================================================================

    /// @notice Excess FLR sent with requestStake is refunded, then stake completes normally.
    function test_fdcStake_excessFeeRefundedThenComplete() public {
        uint256 fee = _stakingFeeInFlr();
        uint256 excess = 5 ether;
        vm.deal(alice, fee + excess + 10 ether);

        uint256 balBefore = alice.balance;

        vm.prank(alice);
        claimManager.requestStake{value: fee + excess}("excessfee", MOCK_ATTESTATION_REQUEST);

        // Alice should have been refunded the excess immediately
        assertEq(alice.balance, balBefore - fee);

        // Complete the stake — TLD minted to alice
        mockFdcVerification.setShouldVerify(true);
        IWeb2Json.Proof memory proof = _buildMockProof(alice, false, "CLOSED");
        claimManager.completeStake("excessfee", proof);

        bytes32 nh = _computeTldNamehash("excessfee");
        assertEq(hsrTld.ownerOf(hsrTld.namehashToTokenId(nh)), alice);
    }
}
