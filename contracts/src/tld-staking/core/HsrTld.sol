// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IHsrTld} from "../interfaces/IHsrTld.sol";
import {IMetadataService} from "../interfaces/IMetadataService.sol";

/// @title HsrTld
/// @notice ERC-721 NFT representing Handshake TLD ownership on Flare.
/// @dev UUPS upgradeable. Only the claim manager can mint new TLDs.
///      Namehash convention: keccak256(abi.encodePacked(bytes32(0), keccak256(bytes(label))))
contract HsrTld is ERC721Upgradeable, OwnableUpgradeable, UUPSUpgradeable, IHsrTld {
    // --- Storage ---
    mapping(bytes32 => uint256) public namehashToTokenId;
    mapping(uint256 => bytes32) public tokenIdToNamehash;
    mapping(uint256 => string) public tokenIdToLabel;
    mapping(bytes32 => address) private _registrationStrategy;
    mapping(bytes32 => bool) private _registrationEnabled;
    uint256 public nextTokenId;
    address public claimManager;
    address public metadataService;

    // --- Errors ---
    error OnlyClaimManager();
    error NamehashAlreadyClaimed(bytes32 namehash);
    error NamehashNotFound(bytes32 namehash);
    error NotTldOwner(bytes32 namehash, address caller);
    error ZeroAddress();

    // --- Events ---
    event TldMinted(uint256 indexed tokenId, bytes32 indexed namehash, string label, address indexed to);
    event ClaimManagerUpdated(address oldManager, address newManager);
    event MetadataServiceUpdated(address oldService, address newService);
    event RegistrationStrategyUpdated(bytes32 indexed namehash, address strategy);
    event RegistrationEnabledUpdated(bytes32 indexed namehash, bool enabled);

    // --- Modifiers ---
    modifier onlyClaimManager() {
        if (msg.sender != claimManager) revert OnlyClaimManager();
        _;
    }

    modifier onlyTldOwner(bytes32 namehash) {
        uint256 tokenId = namehashToTokenId[namehash];
        if (tokenId == 0) revert NamehashNotFound(namehash);
        if (ownerOf(tokenId) != msg.sender) revert NotTldOwner(namehash, msg.sender);
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(string memory name, string memory symbol, address owner) external initializer {
        __ERC721_init(name, symbol);
        __Ownable_init(owner);
        __UUPSUpgradeable_init();
        nextTokenId = 1;
    }

    // --- Core ---

    /// @inheritdoc IHsrTld
    function mint(
        address to,
        string calldata label,
        bytes32 namehash
    ) external override onlyClaimManager returns (uint256 tokenId) {
        if (to == address(0)) revert ZeroAddress();
        if (namehashToTokenId[namehash] != 0) revert NamehashAlreadyClaimed(namehash);

        tokenId = nextTokenId;
        unchecked { ++nextTokenId; }

        namehashToTokenId[namehash] = tokenId;
        tokenIdToNamehash[tokenId] = namehash;
        tokenIdToLabel[tokenId] = label;

        _mint(to, tokenId);

        emit TldMinted(tokenId, namehash, label, to);
    }

    /// @inheritdoc IHsrTld
    function ownerOfNamehash(bytes32 namehash) external view override returns (address) {
        uint256 tokenId = namehashToTokenId[namehash];
        if (tokenId == 0) revert NamehashNotFound(namehash);
        return ownerOf(tokenId);
    }

    // --- TLD Configuration ---

    /// @inheritdoc IHsrTld
    function setRegistrationStrategy(bytes32 namehash, address strategy) external override onlyTldOwner(namehash) {
        _registrationStrategy[namehash] = strategy;
        emit RegistrationStrategyUpdated(namehash, strategy);
    }

    /// @inheritdoc IHsrTld
    function setRegistrationEnabled(bytes32 namehash, bool enabled) external override onlyTldOwner(namehash) {
        _registrationEnabled[namehash] = enabled;
        emit RegistrationEnabledUpdated(namehash, enabled);
    }

    /// @inheritdoc IHsrTld
    function isRegistrationEnabled(bytes32 namehash) external view override returns (bool) {
        return _registrationEnabled[namehash];
    }

    /// @inheritdoc IHsrTld
    function getRegistrationStrategy(bytes32 namehash) external view override returns (address) {
        return _registrationStrategy[namehash];
    }

    // --- Token URI ---

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        if (metadataService != address(0)) {
            return IMetadataService(metadataService).tokenURI(tokenId);
        }
        return super.tokenURI(tokenId);
    }

    // --- Admin ---

    function setClaimManager(address _claimManager) external onlyOwner {
        if (_claimManager == address(0)) revert ZeroAddress();
        address old = claimManager;
        claimManager = _claimManager;
        emit ClaimManagerUpdated(old, _claimManager);
    }

    function setMetadataService(address _metadataService) external onlyOwner {
        address old = metadataService;
        metadataService = _metadataService;
        emit MetadataServiceUpdated(old, _metadataService);
    }

    // --- UUPS ---

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
