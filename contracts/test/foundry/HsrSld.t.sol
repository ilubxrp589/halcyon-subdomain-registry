// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {TestBase} from "./helpers/TestBase.sol";
import {HsrSld} from "../../src/tld-staking/core/HsrSld.sol";

contract HsrSldTest is TestBase {
    bytes32 internal tldNamehash;
    uint256 internal tldTokenId;

    function setUp() public override {
        super.setUp();
        // Mint a TLD for subdomain tests
        (tldTokenId, tldNamehash) = _mintTld("cryptofans", alice);
    }

    // --- Minting ---

    function test_mint_success() public {
        (uint256 tokenId, bytes32 sldNamehash) = _mintSld("wallet", tldNamehash, alice, 1, 500);

        assertEq(tokenId, 1);
        assertEq(hsrSld.ownerOf(tokenId), alice);
        assertEq(hsrSld.sldNamehashToTokenId(sldNamehash), tokenId);
        assertEq(hsrSld.tokenIdToNamehash(tokenId), sldNamehash);

        (
            bytes32 parentNamehash,
            string memory label,
            uint256 registrationTime,
            uint256 expiryTime,
            uint256 registrationPriceUsdCents,
            ,
            bool artworkGenerated
        ) = hsrSld.tokenIdToSldData(tokenId);

        assertEq(parentNamehash, tldNamehash);
        assertEq(label, "wallet");
        assertEq(registrationTime, block.timestamp);
        assertEq(expiryTime, block.timestamp + 365 days);
        assertEq(registrationPriceUsdCents, 500); // Price lock
        assertFalse(artworkGenerated);
    }

    function test_mint_multiYear() public {
        (uint256 tokenId,) = _mintSld("wallet", tldNamehash, alice, 3, 1500);

        (,,, uint256 expiryTime,,,) = hsrSld.tokenIdToSldData(tokenId);
        assertEq(expiryTime, block.timestamp + 3 * 365 days);
    }

    function test_mint_revertsNonRegistrationManager() public {
        vm.prank(alice);
        vm.expectRevert(HsrSld.OnlyRegistrationManager.selector);
        hsrSld.mint(alice, "wallet", tldNamehash, 1, 500);
    }

    function test_mint_revertsZeroYears() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(HsrSld.InvalidYears.selector, uint256(0)));
        hsrSld.mint(alice, "wallet", tldNamehash, 0, 500);
    }

    function test_mint_revertsOverMaxYears() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(HsrSld.InvalidYears.selector, uint256(11)));
        hsrSld.mint(alice, "wallet", tldNamehash, 11, 500);
    }

    function test_mint_revertsZeroAddress() public {
        vm.prank(operator);
        vm.expectRevert(HsrSld.ZeroAddress.selector);
        hsrSld.mint(address(0), "wallet", tldNamehash, 1, 500);
    }

    function test_mint_reverts_alreadyRegistered() public {
        _mintSld("wallet", tldNamehash, alice, 1, 500);

        vm.prank(operator);
        bytes32 sldNamehash = _computeSldNamehash(tldNamehash, "wallet");
        vm.expectRevert(abi.encodeWithSelector(HsrSld.SldNotAvailable.selector, sldNamehash));
        hsrSld.mint(bob, "wallet", tldNamehash, 1, 500);
    }

    // --- Expiry & Grace Period ---

    function test_isExpired_false_whenActive() public {
        (, bytes32 sldNamehash) = _mintSld("wallet", tldNamehash, alice, 1, 500);
        assertFalse(hsrSld.isExpired(sldNamehash));
    }

    function test_isExpired_true_afterExpiry() public {
        (, bytes32 sldNamehash) = _mintSld("wallet", tldNamehash, alice, 1, 500);

        // Warp past expiry
        vm.warp(block.timestamp + 365 days + 1);
        assertTrue(hsrSld.isExpired(sldNamehash));
    }

    function test_isInGracePeriod() public {
        (, bytes32 sldNamehash) = _mintSld("wallet", tldNamehash, alice, 1, 500);

        // Warp to just past expiry — in grace
        vm.warp(block.timestamp + 365 days + 1);
        assertTrue(hsrSld.isInGracePeriod(sldNamehash));
    }

    function test_isInGracePeriod_false_afterGrace() public {
        (, bytes32 sldNamehash) = _mintSld("wallet", tldNamehash, alice, 1, 500);

        // Warp past grace period
        vm.warp(block.timestamp + 365 days + 30 days + 1);
        assertFalse(hsrSld.isInGracePeriod(sldNamehash));
    }

    function test_isAvailable_afterGracePeriod() public {
        (, bytes32 sldNamehash) = _mintSld("wallet", tldNamehash, alice, 1, 500);

        // Still active
        assertFalse(hsrSld.isAvailable(sldNamehash));

        // Past expiry but in grace
        vm.warp(block.timestamp + 365 days + 1);
        assertFalse(hsrSld.isAvailable(sldNamehash));

        // Past grace
        vm.warp(block.timestamp + 30 days);
        assertTrue(hsrSld.isAvailable(sldNamehash));
    }

    // --- Renewal ---

    function test_renew_extends_expiry() public {
        (, bytes32 sldNamehash) = _mintSld("wallet", tldNamehash, alice, 1, 500);

        uint256 expectedExpiry = block.timestamp + 365 days + 2 * 365 days;

        vm.prank(operator);
        hsrSld.renew(sldNamehash, 2);
        assertEq(hsrSld.getExpiryTime(sldNamehash), expectedExpiry);
    }

    function test_renew_revertsNonRegistrationManager() public {
        (, bytes32 sldNamehash) = _mintSld("wallet", tldNamehash, alice, 1, 500);

        vm.prank(bob);
        vm.expectRevert(HsrSld.OnlyRegistrationManager.selector);
        hsrSld.renew(sldNamehash, 1);
    }

    function test_renew_duringGracePeriod() public {
        (, bytes32 sldNamehash) = _mintSld("wallet", tldNamehash, alice, 1, 500);

        // Get the actual expiry set by mint
        uint256 originalExpiry = hsrSld.getExpiryTime(sldNamehash);

        // Warp to 10 days after expiry (in grace period)
        vm.warp(originalExpiry + 10 days);
        // Refresh FTSO mock price after warp
        mockFtsoV2.setPrice(DEFAULT_FLR_PRICE, uint64(block.timestamp));
        assertTrue(hsrSld.isInGracePeriod(sldNamehash));

        // Renew during grace — extends from block.timestamp (since expired)
        uint256 expectedNewExpiry = block.timestamp + 365 days;
        vm.prank(operator);
        hsrSld.renew(sldNamehash, 1);
        assertEq(hsrSld.getExpiryTime(sldNamehash), expectedNewExpiry);
    }

    function test_renew_revertsPastGracePeriod() public {
        (, bytes32 sldNamehash) = _mintSld("wallet", tldNamehash, alice, 1, 500);

        // Warp past grace
        vm.warp(block.timestamp + 365 days + 30 days + 1);
        mockFtsoV2.setPrice(DEFAULT_FLR_PRICE, uint64(block.timestamp));

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(HsrSld.RenewalPastGracePeriod.selector, sldNamehash));
        hsrSld.renew(sldNamehash, 1);
    }

    function test_renew_revertsZeroYears() public {
        (, bytes32 sldNamehash) = _mintSld("wallet", tldNamehash, alice, 1, 500);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(HsrSld.InvalidYears.selector, uint256(0)));
        hsrSld.renew(sldNamehash, 0);
    }

    function test_renew_revertsExceedsMax() public {
        // Register for 5 years
        (, bytes32 sldNamehash) = _mintSld("wallet", tldNamehash, alice, 5, 2500);

        // Try to renew for 6 more (total 11 from now would exceed 10y max)
        vm.prank(operator);
        vm.expectRevert();
        hsrSld.renew(sldNamehash, 6);
    }

    function test_renew_revertsNotFound() public {
        bytes32 unknown = _computeSldNamehash(tldNamehash, "nonexistent");
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(HsrSld.SldNotFound.selector, unknown));
        hsrSld.renew(unknown, 1);
    }

    // --- Re-registration after grace ---

    function test_reRegisterAfterGrace() public {
        (, bytes32 sldNamehash) = _mintSld("wallet", tldNamehash, alice, 1, 500);

        // Warp past grace
        vm.warp(block.timestamp + 365 days + 30 days + 1);
        assertTrue(hsrSld.isAvailable(sldNamehash));

        // Bob can now register the same SLD
        vm.prank(operator);
        uint256 newTokenId = hsrSld.mint(bob, "wallet", tldNamehash, 2, 800);

        assertEq(hsrSld.ownerOf(newTokenId), bob);
        assertEq(hsrSld.sldNamehashToTokenId(sldNamehash), newTokenId);

        // Price lock should be new price
        (,,,, uint256 price,,) = hsrSld.tokenIdToSldData(newTokenId);
        assertEq(price, 800);
    }

    // --- Artwork ---

    function test_setArtwork() public {
        (uint256 tokenId,) = _mintSld("wallet", tldNamehash, alice, 1, 500);

        vm.prank(artworkService);
        hsrSld.setArtwork(tokenId, "QmTestHash123");

        (,,,,, string memory ipfsHash, bool generated) = hsrSld.tokenIdToSldData(tokenId);
        assertEq(ipfsHash, "QmTestHash123");
        assertTrue(generated);
    }

    function test_setArtwork_revertsNonArtworkService() public {
        (uint256 tokenId,) = _mintSld("wallet", tldNamehash, alice, 1, 500);

        vm.prank(alice);
        vm.expectRevert(HsrSld.OnlyArtworkService.selector);
        hsrSld.setArtwork(tokenId, "QmTestHash123");
    }

    // --- Admin ---

    function test_setRegistrationManager() public {
        address newManager = makeAddr("newManager");
        vm.prank(owner);
        hsrSld.setRegistrationManager(newManager);
        assertEq(hsrSld.registrationManager(), newManager);
    }

    function test_setRegistrationManager_revertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        hsrSld.setRegistrationManager(makeAddr("new"));
    }

    function test_setArtworkService_admin() public {
        address newService = makeAddr("newService");
        vm.prank(owner);
        hsrSld.setArtworkService(newService);
        assertEq(hsrSld.artworkService(), newService);
    }

    // --- Constants ---

    function test_constants() public view {
        assertEq(hsrSld.GRACE_PERIOD(), 30 days);
        assertEq(hsrSld.MAX_REGISTRATION_YEARS(), 10);
    }

    // --- getSldData ---

    function test_getSldData() public {
        (uint256 tokenId,) = _mintSld("wallet", tldNamehash, alice, 2, 1000);

        (
            bytes32 parentNamehash,
            string memory label,
            uint256 registrationTime,
            uint256 expiryTime,
            uint256 registrationPriceUsdCents,
            string memory artworkIpfsHash,
            bool artworkGenerated
        ) = hsrSld.getSldData(tokenId);

        assertEq(parentNamehash, tldNamehash);
        assertEq(label, "wallet");
        assertEq(registrationTime, block.timestamp);
        assertEq(expiryTime, block.timestamp + 2 * 365 days);
        assertEq(registrationPriceUsdCents, 1000);
        assertEq(artworkIpfsHash, "");
        assertFalse(artworkGenerated);
    }

    // --- tokenURI ---

    function test_tokenURI_delegatesToMetadataService() public {
        (uint256 tokenId,) = _mintSld("wallet", tldNamehash, alice, 1, 500);

        string memory uri = hsrSld.tokenURI(tokenId);
        assertEq(uri, "https://api.halcyon-names.io/metadata/sld/1");
    }

    function test_tokenURI_revertsForNonexistentToken() public {
        vm.expectRevert();
        hsrSld.tokenURI(999);
    }

    function test_setMetadataService() public {
        address newService = makeAddr("newMetadata");
        vm.prank(owner);
        hsrSld.setMetadataService(newService);
        assertEq(hsrSld.metadataService(), newService);
    }

    function test_tokenURI_fallsBackWithNoMetadataService() public {
        // Clear metadata service
        vm.prank(owner);
        hsrSld.setMetadataService(address(0));

        (uint256 tokenId,) = _mintSld("wallet", tldNamehash, alice, 1, 500);

        // Should return default empty string (ERC721 default with no baseURI)
        string memory uri = hsrSld.tokenURI(tokenId);
        assertEq(uri, "");
    }

    // --- Namehash computation ---

    function test_sldNamehashConvention() public pure {
        bytes32 parentNh = keccak256(abi.encodePacked(bytes32(0), keccak256(bytes("cryptofans"))));
        bytes32 sldNh = keccak256(abi.encodePacked(parentNh, keccak256(bytes("wallet"))));

        // Verify matches ENS hierarchical namehash
        bytes32 expected = keccak256(abi.encodePacked(parentNh, keccak256(bytes("wallet"))));
        assertEq(sldNh, expected);
    }
}
