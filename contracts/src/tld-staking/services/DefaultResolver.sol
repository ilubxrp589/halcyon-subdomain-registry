// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Multicall} from "@openzeppelin/contracts/utils/Multicall.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IHsrSld} from "../interfaces/IHsrSld.sol";
import {IDefaultResolver} from "../interfaces/IDefaultResolver.sol";

/// @title DefaultResolver
/// @notice ENS-compatible resolver for the TLD staking SLD system.
/// @dev Auth is based on HsrSld NFT ownership. Uses OZ Multicall for batched
///      record updates (delegatecall preserves msg.sender for onlySldOwner).
///      Not upgradeable — deploy new + re-point if logic changes.
contract DefaultResolver is IDefaultResolver, Ownable, Multicall {
    // --- Constants ---
    uint256 public constant COINTYPE_ETH = 60;
    uint256 public constant COINTYPE_FLR = 0x8000000E;

    // --- Storage ---
    IHsrSld public hsrSld;

    /// @dev node => coinType => address bytes (multi-chain)
    mapping(bytes32 => mapping(uint256 => bytes)) private _addresses;

    /// @dev node => key => value
    mapping(bytes32 => mapping(string => string)) private _texts;

    /// @dev node => contenthash bytes
    mapping(bytes32 => bytes) private _contentHashes;

    /// @dev node => reverse name
    mapping(bytes32 => string) private _names;

    // --- Errors ---
    error SldNotFound(bytes32 node);
    error NotSldOwner(bytes32 node, address caller);
    error ZeroAddress();

    // --- Modifiers ---

    modifier onlySldOwner(bytes32 node) {
        uint256 tokenId = hsrSld.sldNamehashToTokenId(node);
        if (tokenId == 0) revert SldNotFound(node);
        if (IERC721(address(hsrSld)).ownerOf(tokenId) != msg.sender) revert NotSldOwner(node, msg.sender);
        _;
    }

    // --- Constructor ---

    constructor(address _hsrSld, address _owner) Ownable(_owner) {
        if (_hsrSld == address(0)) revert ZeroAddress();
        hsrSld = IHsrSld(_hsrSld);
    }

    // --- Multi-chain address resolution ---

    /// @inheritdoc IDefaultResolver
    function setAddr(bytes32 node, uint256 coinType, bytes calldata addr) external override onlySldOwner(node) {
        _addresses[node][coinType] = addr;
        emit AddrChanged(node, coinType, addr);
    }

    /// @inheritdoc IDefaultResolver
    function addr(bytes32 node, uint256 coinType) external view override returns (bytes memory) {
        return _addresses[node][coinType];
    }

    /// @inheritdoc IDefaultResolver
    function addr(bytes32 node) external view override returns (address) {
        bytes memory addrBytes = _addresses[node][COINTYPE_FLR];
        if (addrBytes.length == 0) return address(0);
        return _bytesToAddress(addrBytes);
    }

    /// @inheritdoc IDefaultResolver
    function setAddr(bytes32 node, address wallet) external override onlySldOwner(node) {
        bytes memory packed = abi.encodePacked(wallet);
        _addresses[node][COINTYPE_FLR] = packed;
        _addresses[node][COINTYPE_ETH] = packed;
        emit AddrChanged(node, COINTYPE_FLR, packed);
        emit AddrChanged(node, COINTYPE_ETH, packed);
    }

    // --- Text records ---

    /// @inheritdoc IDefaultResolver
    function setText(bytes32 node, string calldata key, string calldata value) external override onlySldOwner(node) {
        _texts[node][key] = value;
        emit TextChanged(node, key, key, value);
    }

    /// @inheritdoc IDefaultResolver
    function text(bytes32 node, string calldata key) external view override returns (string memory) {
        return _texts[node][key];
    }

    // --- Contenthash ---

    /// @inheritdoc IDefaultResolver
    function setContenthash(bytes32 node, bytes calldata hash) external override onlySldOwner(node) {
        _contentHashes[node] = hash;
        emit ContenthashChanged(node, hash);
    }

    /// @inheritdoc IDefaultResolver
    function contenthash(bytes32 node) external view override returns (bytes memory) {
        return _contentHashes[node];
    }

    // --- Reverse records ---

    /// @inheritdoc IDefaultResolver
    function setName(bytes32 node, string calldata name) external override onlySldOwner(node) {
        _names[node] = name;
        emit NameChanged(node, name);
    }

    /// @inheritdoc IDefaultResolver
    function name(bytes32 node) external view override returns (string memory) {
        return _names[node];
    }

    // --- Admin ---

    /// @notice Update the HsrSld contract reference. Admin escape hatch.
    function setHsrSld(address _hsrSld) external onlyOwner {
        if (_hsrSld == address(0)) revert ZeroAddress();
        hsrSld = IHsrSld(_hsrSld);
    }

    // --- Internal ---

    /// @dev Decodes a 20-byte packed address from bytes.
    function _bytesToAddress(bytes memory b) internal pure returns (address addr) {
        require(b.length >= 20, "Invalid address length");
        assembly {
            addr := shr(96, mload(add(b, 32)))
        }
    }
}
