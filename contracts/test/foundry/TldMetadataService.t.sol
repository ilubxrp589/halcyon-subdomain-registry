// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {TestBase} from "./helpers/TestBase.sol";
import {TldMetadataService} from "../../src/tld-staking/services/TldMetadataService.sol";

contract TldMetadataServiceTest is TestBase {
    // --- tokenURI ---

    function test_tokenURI_singleDigit() public view {
        string memory uri = tldMetadata.tokenURI(1);
        assertEq(uri, "https://api.halcyon-names.io/metadata/tld/1");
    }

    function test_tokenURI_multiDigit() public view {
        string memory uri = tldMetadata.tokenURI(99999);
        assertEq(uri, "https://api.halcyon-names.io/metadata/tld/99999");
    }

    function test_tokenURI_zero() public view {
        string memory uri = tldMetadata.tokenURI(0);
        assertEq(uri, "https://api.halcyon-names.io/metadata/tld/0");
    }

    // --- End-to-end via HsrTld.tokenURI ---

    function test_endToEnd_viaHsrTld() public {
        bytes32 nh = _computeTldNamehash("cryptofans");
        vm.prank(operator);
        uint256 tokenId = hsrTld.mint(alice, "cryptofans", nh);

        string memory uri = hsrTld.tokenURI(tokenId);
        assertEq(uri, "https://api.halcyon-names.io/metadata/tld/1");
    }

    // --- setBaseApiUrl ---

    function test_setBaseApiUrl() public {
        vm.prank(owner);
        tldMetadata.setBaseApiUrl("https://new.api/tld/");

        string memory uri = tldMetadata.tokenURI(7);
        assertEq(uri, "https://new.api/tld/7");
    }

    function test_setBaseApiUrl_revertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        tldMetadata.setBaseApiUrl("https://evil.api/");
    }

    function test_setBaseApiUrl_revertsEmptyUrl() public {
        vm.prank(owner);
        vm.expectRevert(TldMetadataService.EmptyBaseApiUrl.selector);
        tldMetadata.setBaseApiUrl("");
    }

    // --- Constructor ---

    function test_constructor_revertsEmptyUrl() public {
        vm.expectRevert(TldMetadataService.EmptyBaseApiUrl.selector);
        new TldMetadataService("", owner);
    }
}
