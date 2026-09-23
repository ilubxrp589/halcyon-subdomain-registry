// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {TestBaseOrchestration} from "./helpers/TestBaseOrchestration.sol";
import {SldCommitIntent} from "../../src/tld-staking/orchestration/SldCommitIntent.sol";

contract SldCommitIntentTest is TestBaseOrchestration {
    bytes32 internal constant SECRET = keccak256("mysecret");
    bytes32 internal tldNamehash;

    function setUp() public override {
        super.setUp();
        (, tldNamehash) = _claimTld("cryptofans");
    }

    function _makeCommitHash(string memory label, address sender) internal view returns (bytes32) {
        return _computeCommitHash(label, tldNamehash, sender, SECRET);
    }

    // --- Commit ---

    function test_commit_success() public {
        bytes32 hash = _makeCommitHash("wallet", alice);

        vm.prank(alice);
        commitIntent.commit(hash);

        assertEq(commitIntent.getCommitBlock(hash), block.number);
    }

    function test_commit_emitsEvent() public {
        bytes32 hash = _makeCommitHash("wallet", alice);

        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit SldCommitIntent.Committed(hash, alice, block.number);
        commitIntent.commit(hash);
    }

    function test_commit_revertsDuplicate() public {
        bytes32 hash = _makeCommitHash("wallet", alice);

        vm.prank(alice);
        commitIntent.commit(hash);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SldCommitIntent.CommitAlreadyExists.selector, hash));
        commitIntent.commit(hash);
    }

    function test_commit_allowsOverwriteAfterExpiry() public {
        bytes32 hash = _makeCommitHash("wallet", alice);

        vm.prank(alice);
        commitIntent.commit(hash);

        // Advance past MAX_COMMIT_AGE
        vm.roll(block.number + commitIntent.MAX_COMMIT_AGE() + 1);

        // Should succeed — expired commit can be overwritten
        vm.prank(alice);
        commitIntent.commit(hash);
        assertEq(commitIntent.getCommitBlock(hash), block.number);
    }

    // --- canReveal ---

    function test_canReveal_falseBeforeMinAge() public {
        bytes32 hash = _makeCommitHash("wallet", alice);

        vm.prank(alice);
        commitIntent.commit(hash);

        // Still too early
        vm.roll(block.number + commitIntent.MIN_COMMIT_AGE() - 1);
        assertFalse(commitIntent.canReveal(hash));
    }

    function test_canReveal_trueAtMinAge() public {
        bytes32 hash = _makeCommitHash("wallet", alice);

        vm.prank(alice);
        commitIntent.commit(hash);

        vm.roll(block.number + commitIntent.MIN_COMMIT_AGE());
        assertTrue(commitIntent.canReveal(hash));
    }

    function test_canReveal_trueAtMaxAge() public {
        bytes32 hash = _makeCommitHash("wallet", alice);

        vm.prank(alice);
        commitIntent.commit(hash);

        vm.roll(block.number + commitIntent.MAX_COMMIT_AGE());
        assertTrue(commitIntent.canReveal(hash));
    }

    function test_canReveal_falseAfterMaxAge() public {
        bytes32 hash = _makeCommitHash("wallet", alice);

        vm.prank(alice);
        commitIntent.commit(hash);

        vm.roll(block.number + commitIntent.MAX_COMMIT_AGE() + 1);
        assertFalse(commitIntent.canReveal(hash));
    }

    function test_canReveal_falseForUnknown() public view {
        bytes32 hash = _makeCommitHash("nonexistent", alice);
        assertFalse(commitIntent.canReveal(hash));
    }

    // --- consumeCommit ---

    function test_consumeCommit_success() public {
        bytes32 hash = _makeCommitHash("wallet", alice);

        vm.prank(alice);
        commitIntent.commit(hash);

        vm.roll(block.number + commitIntent.MIN_COMMIT_AGE() + 1);

        vm.prank(address(registrationManager));
        commitIntent.consumeCommit(hash);

        // Commit should be deleted
        assertEq(commitIntent.getCommitBlock(hash), 0);
    }

    function test_consumeCommit_revertsNonRegistrationManager() public {
        bytes32 hash = _makeCommitHash("wallet", alice);

        vm.prank(alice);
        commitIntent.commit(hash);

        vm.roll(block.number + commitIntent.MIN_COMMIT_AGE() + 1);

        vm.prank(alice);
        vm.expectRevert(SldCommitIntent.OnlyRegistrationManager.selector);
        commitIntent.consumeCommit(hash);
    }

    function test_consumeCommit_revertsTooNew() public {
        bytes32 hash = _makeCommitHash("wallet", alice);

        vm.prank(alice);
        commitIntent.commit(hash);

        // Don't advance enough blocks
        vm.roll(block.number + 3);

        vm.prank(address(registrationManager));
        vm.expectRevert(abi.encodeWithSelector(SldCommitIntent.CommitTooNew.selector, hash));
        commitIntent.consumeCommit(hash);
    }

    function test_consumeCommit_revertsExpired() public {
        bytes32 hash = _makeCommitHash("wallet", alice);

        vm.prank(alice);
        commitIntent.commit(hash);

        vm.roll(block.number + commitIntent.MAX_COMMIT_AGE() + 1);

        vm.prank(address(registrationManager));
        vm.expectRevert(abi.encodeWithSelector(SldCommitIntent.CommitExpiredOrMissing.selector, hash));
        commitIntent.consumeCommit(hash);
    }

    function test_consumeCommit_revertsNotFound() public {
        bytes32 hash = _makeCommitHash("nonexistent", alice);

        vm.prank(address(registrationManager));
        vm.expectRevert(abi.encodeWithSelector(SldCommitIntent.CommitExpiredOrMissing.selector, hash));
        commitIntent.consumeCommit(hash);
    }

    function test_consumeCommit_oneTimeUse() public {
        bytes32 hash = _makeCommitHash("wallet", alice);

        vm.prank(alice);
        commitIntent.commit(hash);

        vm.roll(block.number + commitIntent.MIN_COMMIT_AGE() + 1);

        vm.prank(address(registrationManager));
        commitIntent.consumeCommit(hash);

        // Second consume should fail
        vm.prank(address(registrationManager));
        vm.expectRevert(abi.encodeWithSelector(SldCommitIntent.CommitExpiredOrMissing.selector, hash));
        commitIntent.consumeCommit(hash);
    }

    // --- Admin ---

    function test_setRegistrationManager() public {
        address newRM = makeAddr("newRM");
        vm.prank(owner);
        commitIntent.setRegistrationManager(newRM);
        assertEq(commitIntent.registrationManager(), newRM);
    }

    function test_setRegistrationManager_revertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        commitIntent.setRegistrationManager(makeAddr("new"));
    }

    // --- Constants ---

    function test_constants() public view {
        assertEq(commitIntent.MIN_COMMIT_AGE(), 8);
        assertEq(commitIntent.MAX_COMMIT_AGE(), 17280);
    }
}
