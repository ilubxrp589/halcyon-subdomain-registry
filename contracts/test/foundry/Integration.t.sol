// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {TestBaseOrchestration} from "./helpers/TestBaseOrchestration.sol";

/// @title Integration Test
/// @notice Full lifecycle: claim TLD → configure → commit → register → pay → withdraw → renew → expire → re-register
contract IntegrationTest is TestBaseOrchestration {
    bytes32 internal constant SECRET = keccak256("integrationtestsecret");

    function test_fullLifecycle() public {
        // ===== Phase 1: Claim TLD =====
        vm.prank(operator);
        uint256 tldTokenId = claimManager.operatorMint("cryptofans");
        bytes32 tldNamehash = _computeTldNamehash("cryptofans");
        assertGt(tldTokenId, 0);
        assertEq(hsrTld.ownerOf(tldTokenId), operator);

        // ===== Phase 2: Configure TLD =====
        _configureTldForRegistration(tldNamehash, operator);
        assertTrue(hsrTld.isRegistrationEnabled(tldNamehash));
        assertEq(hsrTld.getRegistrationStrategy(tldNamehash), address(strategy));

        // ===== Phase 3: Commit =====
        bytes32 commitHash = _computeCommitHash("wallet", tldNamehash, alice, SECRET);
        vm.prank(alice);
        commitIntent.commit(commitHash);

        // Advance blocks past MIN_COMMIT_AGE
        vm.roll(block.number + commitIntent.MIN_COMMIT_AGE() + 1);
        assertTrue(commitIntent.canReveal(commitHash));

        // ===== Phase 4: Register SLD =====
        // Default 6-char price = $1/yr = 100 cents/yr
        uint256 priceUsdCents = 100;
        uint256 requiredFlr = ftsoOracle.usdCentsToFlr(priceUsdCents);
        vm.deal(alice, 200 ether);

        vm.prank(alice);
        registrationManager.registerWithCommit{value: requiredFlr}("wallet", tldNamehash, 1, SECRET);

        // Verify SLD minted
        bytes32 sldNamehash = _computeSldNamehash(tldNamehash, "wallet");
        uint256 sldTokenId = hsrSld.sldNamehashToTokenId(sldNamehash);
        assertGt(sldTokenId, 0);
        assertEq(hsrSld.ownerOf(sldTokenId), alice);
        assertFalse(hsrSld.isExpired(sldNamehash));

        // Verify price lock = per-year price
        (,,,,uint256 storedPricePerYear,,) = hsrSld.getSldData(sldTokenId);
        assertEq(storedPricePerYear, 100); // $1/yr

        // ===== Phase 5: Verify Payment Split =====
        uint256 platformAmount = (requiredFlr * 500) / 10000; // 5%
        uint256 ownerAmount = requiredFlr - platformAmount;     // 95%

        assertEq(paymentManager.pendingWithdrawals(operator), ownerAmount);
        assertEq(paymentManager.pendingWithdrawals(platform), platformAmount);

        // ===== Phase 6: Withdraw =====
        uint256 operatorBalBefore = operator.balance;
        vm.prank(operator);
        paymentManager.withdraw();
        assertEq(operator.balance, operatorBalBefore + ownerAmount);
        assertEq(paymentManager.pendingWithdrawals(operator), 0);

        uint256 platformBalBefore = platform.balance;
        vm.prank(platform);
        paymentManager.withdraw();
        assertEq(platform.balance, platformBalBefore + platformAmount);

        // ===== Phase 7: Renew using price lock =====
        // Stored price is 100 cents/yr, renewing for 2 years = 200 cents
        uint256 renewalFlr = ftsoOracle.usdCentsToFlr(200);

        vm.prank(alice);
        registrationManager.renew{value: renewalFlr}(sldNamehash, 2);

        // Expiry extended from original 1yr + 2yr = 3yr total from registration time
        assertEq(hsrSld.getExpiryTime(sldNamehash), block.timestamp + 3 * 365 days);

        // ===== Phase 8: Expire & Re-register =====
        // Warp past expiry + grace period
        vm.warp(block.timestamp + 3 * 365 days + 30 days + 1);
        // Refresh FTSO price after warp
        mockFtsoV2.setPrice(DEFAULT_FLR_PRICE, uint64(block.timestamp));

        assertTrue(hsrSld.isAvailable(sldNamehash));

        // Bob registers the same name
        bytes32 bobCommit = _computeCommitHash("wallet", tldNamehash, bob, SECRET);
        vm.prank(bob);
        commitIntent.commit(bobCommit);
        vm.roll(block.number + commitIntent.MIN_COMMIT_AGE() + 1);

        uint256 newRequiredFlr = ftsoOracle.usdCentsToFlr(100);
        vm.deal(bob, 100 ether);

        vm.prank(bob);
        registrationManager.registerWithCommit{value: newRequiredFlr}("wallet", tldNamehash, 1, SECRET);

        // Bob now owns it
        uint256 newTokenId = hsrSld.sldNamehashToTokenId(sldNamehash);
        assertEq(hsrSld.ownerOf(newTokenId), bob);
        assertFalse(hsrSld.isExpired(sldNamehash));

        // Old token was burned — new token ID is different
        assertGt(newTokenId, sldTokenId);
    }
}
