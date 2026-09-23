// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {TestBase} from "./helpers/TestBase.sol";
import {DefaultResolver} from "../../src/tld-staking/services/DefaultResolver.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract DefaultResolverTest is TestBase {
    DefaultResolver public resolver;

    bytes32 internal tldNamehash;
    bytes32 internal sldNamehash;
    uint256 internal sldTokenId;

    function setUp() public override {
        super.setUp();

        // Deploy resolver
        resolver = new DefaultResolver(address(hsrSld), owner);

        // Mint a TLD and SLD for testing
        (, tldNamehash) = _mintTld("cryptofans", alice);
        (sldTokenId, sldNamehash) = _mintSld("wallet", tldNamehash, alice, 1, 500);
    }

    // ===================== setAddr(node, address) convenience =====================

    function test_setAddr_convenience() public {
        vm.prank(alice);
        resolver.setAddr(sldNamehash, alice);

        address resolved = resolver.addr(sldNamehash);
        assertEq(resolved, alice);
    }

    function test_setAddr_convenience_setsBothCoinTypes() public {
        vm.prank(alice);
        resolver.setAddr(sldNamehash, alice);

        bytes memory flrAddr = resolver.addr(sldNamehash, resolver.COINTYPE_FLR());
        bytes memory ethAddr = resolver.addr(sldNamehash, resolver.COINTYPE_ETH());

        assertEq(flrAddr, abi.encodePacked(alice));
        assertEq(ethAddr, abi.encodePacked(alice));
    }

    function test_setAddr_convenience_revertsNonOwner() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(DefaultResolver.NotSldOwner.selector, sldNamehash, bob));
        resolver.setAddr(sldNamehash, bob);
    }

    // ===================== setAddr(node, coinType, bytes) multi-chain =====================

    function test_setAddr_multichain() public {
        bytes memory btcAddr = hex"0014751e76e8199196d454941c45d1b3a323f1433bd6";
        uint256 coinTypeBtc = 0;

        vm.prank(alice);
        resolver.setAddr(sldNamehash, coinTypeBtc, btcAddr);

        bytes memory result = resolver.addr(sldNamehash, coinTypeBtc);
        assertEq(result, btcAddr);
    }

    function test_setAddr_multichain_revertsNonOwner() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(DefaultResolver.NotSldOwner.selector, sldNamehash, bob));
        resolver.setAddr(sldNamehash, 0, hex"00");
    }

    // ===================== addr(node) returns FLR address =====================

    function test_addr_returnsZeroWhenNotSet() public view {
        address resolved = resolver.addr(sldNamehash);
        assertEq(resolved, address(0));
    }

    // ===================== setText / text =====================

    function test_setText_and_text() public {
        vm.prank(alice);
        resolver.setText(sldNamehash, "avatar", "https://example.com/avatar.png");

        string memory val = resolver.text(sldNamehash, "avatar");
        assertEq(val, "https://example.com/avatar.png");
    }

    function test_setText_overwrite() public {
        vm.startPrank(alice);
        resolver.setText(sldNamehash, "url", "https://old.com");
        resolver.setText(sldNamehash, "url", "https://new.com");
        vm.stopPrank();

        assertEq(resolver.text(sldNamehash, "url"), "https://new.com");
    }

    function test_setText_revertsNonOwner() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(DefaultResolver.NotSldOwner.selector, sldNamehash, bob));
        resolver.setText(sldNamehash, "key", "value");
    }

    function test_text_returnsEmptyWhenNotSet() public view {
        string memory val = resolver.text(sldNamehash, "nonexistent");
        assertEq(val, "");
    }

    // ===================== setContenthash / contenthash =====================

    function test_setContenthash_and_contenthash() public {
        bytes memory ipfsHash = hex"e3010170122029f2d17be6139079dc48696d1f582a8530eb9805b561eda517e22a892c7e3f1f";

        vm.prank(alice);
        resolver.setContenthash(sldNamehash, ipfsHash);

        bytes memory result = resolver.contenthash(sldNamehash);
        assertEq(result, ipfsHash);
    }

    function test_setContenthash_revertsNonOwner() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(DefaultResolver.NotSldOwner.selector, sldNamehash, bob));
        resolver.setContenthash(sldNamehash, hex"00");
    }

    function test_contenthash_returnsEmptyWhenNotSet() public view {
        bytes memory result = resolver.contenthash(sldNamehash);
        assertEq(result.length, 0);
    }

    // ===================== setName / name (reverse records) =====================

    function test_setName_and_name() public {
        vm.prank(alice);
        resolver.setName(sldNamehash, "wallet.cryptofans");

        string memory result = resolver.name(sldNamehash);
        assertEq(result, "wallet.cryptofans");
    }

    function test_setName_revertsNonOwner() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(DefaultResolver.NotSldOwner.selector, sldNamehash, bob));
        resolver.setName(sldNamehash, "evil.cryptofans");
    }

    function test_name_returnsEmptyWhenNotSet() public view {
        string memory result = resolver.name(sldNamehash);
        assertEq(result, "");
    }

    // ===================== SldNotFound =====================

    function test_setAddr_revertsSldNotFound() public {
        bytes32 unknown = _computeSldNamehash(tldNamehash, "nonexistent");

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(DefaultResolver.SldNotFound.selector, unknown));
        resolver.setAddr(unknown, alice);
    }

    function test_setText_revertsSldNotFound() public {
        bytes32 unknown = _computeSldNamehash(tldNamehash, "nonexistent");

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(DefaultResolver.SldNotFound.selector, unknown));
        resolver.setText(unknown, "key", "value");
    }

    // ===================== Multicall =====================

    function test_multicall_batchSetRecords() public {
        bytes[] memory calls = new bytes[](3);
        calls[0] = abi.encodeWithSelector(bytes4(keccak256("setAddr(bytes32,address)")), sldNamehash, alice);
        calls[1] = abi.encodeCall(resolver.setText, (sldNamehash, "avatar", "https://example.com/pic.png"));
        calls[2] = abi.encodeCall(resolver.setName, (sldNamehash, "wallet.cryptofans"));

        vm.prank(alice);
        resolver.multicall(calls);

        assertEq(resolver.addr(sldNamehash), alice);
        assertEq(resolver.text(sldNamehash, "avatar"), "https://example.com/pic.png");
        assertEq(resolver.name(sldNamehash), "wallet.cryptofans");
    }

    function test_multicall_revertsIfNotOwner() public {
        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeWithSelector(bytes4(keccak256("setAddr(bytes32,address)")), sldNamehash, bob);

        vm.prank(bob);
        vm.expectRevert();
        resolver.multicall(calls);
    }

    // ===================== Records persist after expiry =====================

    function test_recordsPersistAfterExpiry() public {
        // Set records
        vm.prank(alice);
        resolver.setAddr(sldNamehash, alice);

        // Warp past expiry
        vm.warp(block.timestamp + 365 days + 1);
        mockFtsoV2.setPrice(DEFAULT_FLR_PRICE, uint64(block.timestamp));

        // Records still readable
        assertEq(resolver.addr(sldNamehash), alice);
    }

    // ===================== New owner after re-registration =====================

    function test_newOwnerCanOverwriteAfterReRegistration() public {
        // Alice sets records
        vm.prank(alice);
        resolver.setAddr(sldNamehash, alice);

        // Warp past grace
        vm.warp(block.timestamp + 365 days + 30 days + 1);

        // Bob re-registers the same SLD
        vm.prank(operator);
        uint256 newTokenId = hsrSld.mint(bob, "wallet", tldNamehash, 1, 800);

        // Old record still there but Bob can overwrite
        assertEq(resolver.addr(sldNamehash), alice);

        vm.prank(bob);
        resolver.setAddr(sldNamehash, bob);
        assertEq(resolver.addr(sldNamehash), bob);
    }

    // ===================== Admin: setHsrSld =====================

    function test_setHsrSld() public {
        address newSld = makeAddr("newHsrSld");
        vm.prank(owner);
        resolver.setHsrSld(newSld);
        assertEq(address(resolver.hsrSld()), newSld);
    }

    function test_setHsrSld_revertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        resolver.setHsrSld(makeAddr("new"));
    }

    function test_setHsrSld_revertsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(DefaultResolver.ZeroAddress.selector);
        resolver.setHsrSld(address(0));
    }

    // ===================== Constructor =====================

    function test_constructor_revertsZeroAddress() public {
        vm.expectRevert(DefaultResolver.ZeroAddress.selector);
        new DefaultResolver(address(0), owner);
    }

    // ===================== CoinType constants =====================

    function test_coinTypeConstants() public view {
        assertEq(resolver.COINTYPE_ETH(), 60);
        assertEq(resolver.COINTYPE_FLR(), 0x8000000E);
    }
}
