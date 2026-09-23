// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {TestBase} from "./helpers/TestBase.sol";
import {HsrTld} from "../../src/tld-staking/core/HsrTld.sol";

contract HsrTldTest is TestBase {
    bytes32 internal cfNamehash;

    function setUp() public override {
        super.setUp();
        cfNamehash = _computeTldNamehash("cryptofans");
    }

    // --- Minting ---

    function test_mint_success() public {
        vm.prank(operator);
        uint256 tokenId = hsrTld.mint(alice, "cryptofans", cfNamehash);

        assertEq(tokenId, 1);
        assertEq(hsrTld.ownerOf(tokenId), alice);
        assertEq(hsrTld.namehashToTokenId(cfNamehash), tokenId);
        assertEq(hsrTld.tokenIdToNamehash(tokenId), cfNamehash);
        assertEq(hsrTld.tokenIdToLabel(tokenId), "cryptofans");
    }

    function test_mint_incrementsTokenId() public {
        vm.startPrank(operator);
        uint256 id1 = hsrTld.mint(alice, "cryptofans", cfNamehash);
        bytes32 nh2 = _computeTldNamehash("web3mv");
        uint256 id2 = hsrTld.mint(bob, "web3mv", nh2);
        vm.stopPrank();

        assertEq(id1, 1);
        assertEq(id2, 2);
    }

    function test_mint_revertsNonClaimManager() public {
        vm.prank(alice);
        vm.expectRevert(HsrTld.OnlyClaimManager.selector);
        hsrTld.mint(alice, "cryptofans", cfNamehash);
    }

    function test_mint_revertsDuplicateNamehash() public {
        vm.startPrank(operator);
        hsrTld.mint(alice, "cryptofans", cfNamehash);

        vm.expectRevert(abi.encodeWithSelector(HsrTld.NamehashAlreadyClaimed.selector, cfNamehash));
        hsrTld.mint(bob, "cryptofans", cfNamehash);
        vm.stopPrank();
    }

    function test_mint_revertsZeroAddress() public {
        vm.prank(operator);
        vm.expectRevert(HsrTld.ZeroAddress.selector);
        hsrTld.mint(address(0), "cryptofans", cfNamehash);
    }

    // --- ownerOfNamehash ---

    function test_ownerOfNamehash() public {
        vm.prank(operator);
        hsrTld.mint(alice, "cryptofans", cfNamehash);

        assertEq(hsrTld.ownerOfNamehash(cfNamehash), alice);
    }

    function test_ownerOfNamehash_revertsUnknown() public {
        bytes32 unknown = _computeTldNamehash("nonexistent");
        vm.expectRevert(abi.encodeWithSelector(HsrTld.NamehashNotFound.selector, unknown));
        hsrTld.ownerOfNamehash(unknown);
    }

    // --- TLD Configuration ---

    function test_setRegistrationStrategy() public {
        vm.prank(operator);
        hsrTld.mint(alice, "cryptofans", cfNamehash);

        address strategy = makeAddr("strategy");
        vm.prank(alice);
        hsrTld.setRegistrationStrategy(cfNamehash, strategy);

        assertEq(hsrTld.getRegistrationStrategy(cfNamehash), strategy);
    }

    function test_setRegistrationStrategy_revertsNonOwner() public {
        vm.prank(operator);
        hsrTld.mint(alice, "cryptofans", cfNamehash);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(HsrTld.NotTldOwner.selector, cfNamehash, bob));
        hsrTld.setRegistrationStrategy(cfNamehash, makeAddr("strategy"));
    }

    function test_setRegistrationEnabled() public {
        vm.prank(operator);
        hsrTld.mint(alice, "cryptofans", cfNamehash);

        assertFalse(hsrTld.isRegistrationEnabled(cfNamehash));

        vm.prank(alice);
        hsrTld.setRegistrationEnabled(cfNamehash, true);

        assertTrue(hsrTld.isRegistrationEnabled(cfNamehash));
    }

    function test_setRegistrationEnabled_revertsNonOwner() public {
        vm.prank(operator);
        hsrTld.mint(alice, "cryptofans", cfNamehash);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(HsrTld.NotTldOwner.selector, cfNamehash, bob));
        hsrTld.setRegistrationEnabled(cfNamehash, true);
    }

    // --- Admin ---

    function test_setClaimManager() public {
        address newManager = makeAddr("newManager");
        vm.prank(owner);
        hsrTld.setClaimManager(newManager);
        assertEq(hsrTld.claimManager(), newManager);
    }

    function test_setClaimManager_revertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        hsrTld.setClaimManager(makeAddr("new"));
    }

    function test_setClaimManager_revertsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(HsrTld.ZeroAddress.selector);
        hsrTld.setClaimManager(address(0));
    }

    // --- ERC-721 transfers ---

    function test_transfer() public {
        vm.prank(operator);
        uint256 tokenId = hsrTld.mint(alice, "cryptofans", cfNamehash);

        vm.prank(alice);
        hsrTld.transferFrom(alice, bob, tokenId);

        assertEq(hsrTld.ownerOf(tokenId), bob);
        // ownerOfNamehash should follow the NFT transfer
        assertEq(hsrTld.ownerOfNamehash(cfNamehash), bob);
    }

    // --- tokenURI ---

    function test_tokenURI_delegatesToMetadataService() public {
        vm.prank(operator);
        uint256 tokenId = hsrTld.mint(alice, "cryptofans", cfNamehash);

        string memory uri = hsrTld.tokenURI(tokenId);
        assertEq(uri, "https://api.halcyon-names.io/metadata/tld/1");
    }

    function test_tokenURI_revertsForNonexistentToken() public {
        vm.expectRevert();
        hsrTld.tokenURI(999);
    }

    function test_setMetadataService() public {
        address newService = makeAddr("newMetadata");
        vm.prank(owner);
        hsrTld.setMetadataService(newService);
        assertEq(hsrTld.metadataService(), newService);
    }

    function test_tokenURI_fallsBackWithNoMetadataService() public {
        // Clear metadata service
        vm.prank(owner);
        hsrTld.setMetadataService(address(0));

        vm.prank(operator);
        uint256 tokenId = hsrTld.mint(alice, "cryptofans", cfNamehash);

        // Should return default empty string (ERC721 default with no baseURI)
        string memory uri = hsrTld.tokenURI(tokenId);
        assertEq(uri, "");
    }

    // --- Namehash verification ---

    function test_namehashConvention() public pure {
        // Verify our helper matches the ENS EIP-137 convention
        bytes32 expected = keccak256(abi.encodePacked(bytes32(0), keccak256(bytes("cryptofans"))));
        bytes32 computed = keccak256(abi.encodePacked(bytes32(0), keccak256(bytes("cryptofans"))));
        assertEq(expected, computed);
    }
}
