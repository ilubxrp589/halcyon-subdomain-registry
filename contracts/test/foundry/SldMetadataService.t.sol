// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {TestBase} from "./helpers/TestBase.sol";
import {SldMetadataService} from "../../src/tld-staking/services/SldMetadataService.sol";

contract SldMetadataServiceTest is TestBase {
    bytes32 internal tldNamehash;

    function setUp() public override {
        super.setUp();
        (, tldNamehash) = _mintTld("cryptofans", alice);
    }

    // --- tokenURI ---

    function test_tokenURI_singleDigit() public view {
        string memory uri = sldMetadata.tokenURI(1);
        assertEq(uri, "https://api.halcyon-names.io/metadata/sld/1");
    }

    function test_tokenURI_multiDigit() public view {
        string memory uri = sldMetadata.tokenURI(12345);
        assertEq(uri, "https://api.halcyon-names.io/metadata/sld/12345");
    }

    function test_tokenURI_zero() public view {
        string memory uri = sldMetadata.tokenURI(0);
        assertEq(uri, "https://api.halcyon-names.io/metadata/sld/0");
    }

    // --- End-to-end via HsrSld.tokenURI ---

    function test_endToEnd_viaHsrSld() public {
        (uint256 tokenId,) = _mintSld("wallet", tldNamehash, alice, 1, 500);
        string memory uri = hsrSld.tokenURI(tokenId);
        assertEq(uri, "https://api.halcyon-names.io/metadata/sld/1");
    }

    // --- setBaseApiUrl ---

    function test_setBaseApiUrl() public {
        vm.prank(owner);
        sldMetadata.setBaseApiUrl("https://new.api/sld/");

        string memory uri = sldMetadata.tokenURI(42);
        assertEq(uri, "https://new.api/sld/42");
    }

    function test_setBaseApiUrl_revertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        sldMetadata.setBaseApiUrl("https://evil.api/");
    }

    function test_setBaseApiUrl_revertsEmptyUrl() public {
        vm.prank(owner);
        vm.expectRevert(SldMetadataService.EmptyBaseApiUrl.selector);
        sldMetadata.setBaseApiUrl("");
    }

    // --- Constructor ---

    function test_constructor_revertsEmptyUrl() public {
        vm.expectRevert(SldMetadataService.EmptyBaseApiUrl.selector);
        new SldMetadataService("", owner);
    }
}
