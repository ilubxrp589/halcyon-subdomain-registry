// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {TestBaseOrchestration} from "./helpers/TestBaseOrchestration.sol";
import {SldRegistrationManager} from "../../src/tld-staking/orchestration/SldRegistrationManager.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract SldRegistrationManagerTest is TestBaseOrchestration {
    bytes32 internal tldNamehash;
    bytes32 internal constant SECRET = keccak256("registrationsecret");

    // TLD owner private key for signature tests
    uint256 internal tldOwnerKey;
    address internal tldOwnerAddr;

    function setUp() public override {
        super.setUp();

        // Create a TLD owned by operator
        (, tldNamehash) = _claimTld("cryptofans");

        // Configure TLD for registration
        _configureTldForRegistration(tldNamehash, operator);

        // Create a TLD owner with known private key for signature tests
        tldOwnerKey = 0xBEEF;
        tldOwnerAddr = vm.addr(tldOwnerKey);
    }

    // --- Helper ---

    function _getRequiredFlr(uint256 priceUsdCents) internal view returns (uint256) {
        return ftsoOracle.usdCentsToFlr(priceUsdCents);
    }

    // --- registerWithCommit ---

    function test_registerWithCommit_success() public {
        // Default 6-char price = $1 = 100 cents
        uint256 priceUsdCents = 100;
        uint256 requiredFlr = _getRequiredFlr(priceUsdCents);

        vm.deal(alice, requiredFlr * 2);

        // Commit
        bytes32 commitHash = _computeCommitHash("wallet", tldNamehash, alice, SECRET);
        vm.prank(alice);
        commitIntent.commit(commitHash);

        // Advance blocks
        vm.roll(block.number + commitIntent.MIN_COMMIT_AGE() + 1);

        // Register
        vm.prank(alice);
        registrationManager.registerWithCommit{value: requiredFlr}("wallet", tldNamehash, 1, SECRET);

        // Verify SLD was minted
        bytes32 sldNamehash = _computeSldNamehash(tldNamehash, "wallet");
        uint256 tokenId = hsrSld.sldNamehashToTokenId(sldNamehash);
        assertGt(tokenId, 0);
        assertEq(hsrSld.ownerOf(tokenId), alice);
    }

    function test_registerWithCommit_priceLockStored() public {
        uint256 priceUsdCents = 100; // 6-char default
        uint256 requiredFlr = _getRequiredFlr(priceUsdCents);

        vm.deal(alice, requiredFlr * 2);

        uint256 tokenId = _registerSld("wallet", tldNamehash, alice, 1, SECRET, requiredFlr);

        // Verify the per-year price lock is stored
        (,,,,uint256 storedPrice,,) = hsrSld.getSldData(tokenId);
        assertEq(storedPrice, 100); // per-year price
    }

    function test_registerWithCommit_multiYear() public {
        // 6-char at $1/yr * 3 years = $3 = 300 cents
        uint256 priceUsdCents = 300;
        uint256 requiredFlr = _getRequiredFlr(priceUsdCents);

        vm.deal(alice, requiredFlr * 2);

        uint256 tokenId = _registerSld("wallet", tldNamehash, alice, 3, SECRET, requiredFlr);

        (,,, uint256 expiryTime, uint256 storedPrice,,) = hsrSld.getSldData(tokenId);
        assertEq(expiryTime, block.timestamp + 3 * 365 days);
        assertEq(storedPrice, 100); // per-year price lock, not total
    }

    function test_registerWithCommit_refundsExcess() public {
        uint256 priceUsdCents = 100;
        uint256 requiredFlr = _getRequiredFlr(priceUsdCents);
        uint256 excess = 1 ether;

        vm.deal(alice, requiredFlr + excess);

        bytes32 commitHash = _computeCommitHash("wallet", tldNamehash, alice, SECRET);
        vm.prank(alice);
        commitIntent.commit(commitHash);
        vm.roll(block.number + commitIntent.MIN_COMMIT_AGE() + 1);

        uint256 balBefore = alice.balance;
        vm.prank(alice);
        registrationManager.registerWithCommit{value: requiredFlr + excess}("wallet", tldNamehash, 1, SECRET);

        // Alice should get the excess back
        assertEq(alice.balance, balBefore - requiredFlr);
    }

    function test_registerWithCommit_revertsInsufficientPayment() public {
        uint256 priceUsdCents = 100;
        uint256 requiredFlr = _getRequiredFlr(priceUsdCents);

        vm.deal(alice, requiredFlr);

        bytes32 commitHash = _computeCommitHash("wallet", tldNamehash, alice, SECRET);
        vm.prank(alice);
        commitIntent.commit(commitHash);
        vm.roll(block.number + commitIntent.MIN_COMMIT_AGE() + 1);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                SldRegistrationManager.InsufficientPayment.selector,
                requiredFlr,
                requiredFlr / 2
            )
        );
        registrationManager.registerWithCommit{value: requiredFlr / 2}("wallet", tldNamehash, 1, SECRET);
    }

    function test_registerWithCommit_revertsRegistrationNotEnabled() public {
        // Disable registration
        vm.prank(operator);
        hsrTld.setRegistrationEnabled(tldNamehash, false);

        uint256 requiredFlr = _getRequiredFlr(100);
        vm.deal(alice, requiredFlr);

        bytes32 commitHash = _computeCommitHash("wallet", tldNamehash, alice, SECRET);
        vm.prank(alice);
        commitIntent.commit(commitHash);
        vm.roll(block.number + commitIntent.MIN_COMMIT_AGE() + 1);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(SldRegistrationManager.RegistrationNotEnabled.selector, tldNamehash)
        );
        registrationManager.registerWithCommit{value: requiredFlr}("wallet", tldNamehash, 1, SECRET);
    }

    function test_registerWithCommit_paymentSplitCorrectly() public {
        uint256 priceUsdCents = 100;
        uint256 requiredFlr = _getRequiredFlr(priceUsdCents);
        vm.deal(alice, requiredFlr);

        _registerSld("wallet", tldNamehash, alice, 1, SECRET, requiredFlr);

        // Check payment was split
        uint256 platformAmount = (requiredFlr * 500) / 10000;
        uint256 ownerAmount = requiredFlr - platformAmount;

        assertEq(paymentManager.pendingWithdrawals(operator), ownerAmount);
        assertEq(paymentManager.pendingWithdrawals(platform), platformAmount);
    }

    // --- renew ---

    function test_renew_usesPriceLock() public {
        uint256 priceUsdCents = 100;
        uint256 requiredFlr = _getRequiredFlr(priceUsdCents);
        vm.deal(alice, 200 ether);

        _registerSld("wallet", tldNamehash, alice, 1, SECRET, requiredFlr);

        bytes32 sldNamehash = _computeSldNamehash(tldNamehash, "wallet");
        uint256 originalExpiry = hsrSld.getExpiryTime(sldNamehash);

        // Renew for 2 years — uses stored price lock of 100 cents/year = 200 cents
        uint256 renewalFlr = _getRequiredFlr(200);

        vm.prank(alice);
        registrationManager.renew{value: renewalFlr}(sldNamehash, 2);

        uint256 newExpiry = hsrSld.getExpiryTime(sldNamehash);
        assertEq(newExpiry, originalExpiry + 2 * 365 days);
    }

    function test_renew_revertsInsufficientPayment() public {
        uint256 priceUsdCents = 100;
        uint256 requiredFlr = _getRequiredFlr(priceUsdCents);
        vm.deal(alice, 100 ether);

        _registerSld("wallet", tldNamehash, alice, 1, SECRET, requiredFlr);

        bytes32 sldNamehash = _computeSldNamehash(tldNamehash, "wallet");

        // Try renewing with not enough FLR
        vm.prank(alice);
        vm.expectRevert(); // InsufficientPayment
        registrationManager.renew{value: 1 wei}(sldNamehash, 1);
    }

    function test_renew_revertsNotFound() public {
        bytes32 sldNamehash = _computeSldNamehash(tldNamehash, "nonexistent");

        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SldRegistrationManager.SldNotFound.selector, sldNamehash));
        registrationManager.renew{value: 1 ether}(sldNamehash, 1);
    }

    function test_renew_anyoneCanPay() public {
        uint256 requiredFlr = _getRequiredFlr(100);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);

        _registerSld("wallet", tldNamehash, alice, 1, SECRET, requiredFlr);

        bytes32 sldNamehash = _computeSldNamehash(tldNamehash, "wallet");
        uint256 renewalFlr = _getRequiredFlr(100);

        // Bob renews Alice's SLD
        vm.prank(bob);
        registrationManager.renew{value: renewalFlr}(sldNamehash, 1);

        // Verify extension happened
        assertGt(hsrSld.getExpiryTime(sldNamehash), block.timestamp + 365 days);
    }

    // --- registerWithSignature ---

    function test_registerWithSignature_success() public {
        // Create a TLD owned by tldOwnerAddr (known private key)
        vm.prank(operator);
        claimManager.operatorMint("sigtest");
        bytes32 sigTldNamehash = _computeTldNamehash("sigtest");

        // Transfer TLD to tldOwnerAddr
        uint256 tldTokenId = hsrTld.namehashToTokenId(sigTldNamehash);
        vm.prank(operator);
        hsrTld.transferFrom(operator, tldOwnerAddr, tldTokenId);

        // Configure for registration
        _configureTldForRegistration(sigTldNamehash, tldOwnerAddr);

        // Build message hash
        uint256 nonce = 1;
        bytes32 messageHash = keccak256(
            abi.encodePacked("wallet", sigTldNamehash, alice, uint256(1), nonce, block.chainid, address(registrationManager))
        );
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(messageHash);

        // Sign with TLD owner key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(tldOwnerKey, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        uint256 priceUsdCents = 100; // 6-char default
        uint256 requiredFlr = _getRequiredFlr(priceUsdCents);
        vm.deal(alice, requiredFlr * 2);

        vm.prank(alice);
        registrationManager.registerWithSignature{value: requiredFlr}(
            "wallet", sigTldNamehash, 1, nonce, signature
        );

        bytes32 sldNamehash = _computeSldNamehash(sigTldNamehash, "wallet");
        assertEq(hsrSld.ownerOf(hsrSld.sldNamehashToTokenId(sldNamehash)), alice);
    }

    function test_registerWithSignature_revertsInvalidSigner() public {
        uint256 wrongKey = 0xDEAD;
        uint256 nonce = 1;

        bytes32 messageHash = keccak256(
            abi.encodePacked("wallet", tldNamehash, alice, uint256(1), nonce, block.chainid, address(registrationManager))
        );
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        uint256 requiredFlr = _getRequiredFlr(100);
        vm.deal(alice, requiredFlr);

        vm.prank(alice);
        vm.expectRevert(SldRegistrationManager.InvalidSignature.selector);
        registrationManager.registerWithSignature{value: requiredFlr}(
            "wallet", tldNamehash, 1, nonce, signature
        );
    }

    function test_registerWithSignature_revertsReusedNonce() public {
        // Create a TLD owned by tldOwnerAddr (known private key)
        vm.prank(operator);
        claimManager.operatorMint("noncetest");
        bytes32 nonceTldNamehash = _computeTldNamehash("noncetest");

        uint256 tldTokenId = hsrTld.namehashToTokenId(nonceTldNamehash);
        vm.prank(operator);
        hsrTld.transferFrom(operator, tldOwnerAddr, tldTokenId);
        _configureTldForRegistration(nonceTldNamehash, tldOwnerAddr);

        uint256 nonce = 42;
        // "firstx" is 6-char = $1/yr = 100 cents
        uint256 requiredFlr = _getRequiredFlr(100);

        // First registration with this nonce
        bytes32 messageHash = keccak256(
            abi.encodePacked("firstx", nonceTldNamehash, alice, uint256(1), nonce, block.chainid, address(registrationManager))
        );
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(tldOwnerKey, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.deal(alice, requiredFlr * 10);
        vm.prank(alice);
        registrationManager.registerWithSignature{value: requiredFlr}(
            "firstx", nonceTldNamehash, 1, nonce, signature
        );

        // Second registration with same nonce — should revert
        bytes32 messageHash2 = keccak256(
            abi.encodePacked("second", nonceTldNamehash, alice, uint256(1), nonce, block.chainid, address(registrationManager))
        );
        bytes32 ethSignedHash2 = MessageHashUtils.toEthSignedMessageHash(messageHash2);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(tldOwnerKey, ethSignedHash2);
        bytes memory signature2 = abi.encodePacked(r2, s2, v2);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SldRegistrationManager.NonceAlreadyUsed.selector, nonce));
        registrationManager.registerWithSignature{value: requiredFlr}(
            "second", nonceTldNamehash, 1, nonce, signature2
        );
    }

    // --- isAvailable ---

    function test_isAvailable_true() public view {
        assertTrue(registrationManager.isAvailable("wallet", tldNamehash));
    }

    function test_isAvailable_false_afterRegistration() public {
        uint256 requiredFlr = _getRequiredFlr(100);
        vm.deal(alice, requiredFlr);

        _registerSld("wallet", tldNamehash, alice, 1, SECRET, requiredFlr);

        assertFalse(registrationManager.isAvailable("wallet", tldNamehash));
    }
}
