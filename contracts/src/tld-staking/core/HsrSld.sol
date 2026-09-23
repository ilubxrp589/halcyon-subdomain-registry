// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IHsrSld} from "../interfaces/IHsrSld.sol";
import {IMetadataService} from "../interfaces/IMetadataService.sol";

/// @title HsrSld
/// @notice ERC-721 NFT representing subdomain (SLD) ownership on Flare.
/// @dev UUPS upgradeable. Only the registration manager can mint.
///      SLD namehash: keccak256(abi.encodePacked(parentNamehash, keccak256(bytes(label))))
///      Price lock: registrationPriceUsdCents is stored at mint time and used for renewals.
contract HsrSld is ERC721Upgradeable, OwnableUpgradeable, UUPSUpgradeable, IHsrSld {
    // --- Constants ---
    uint256 public constant GRACE_PERIOD = 30 days;
    uint256 public constant MAX_REGISTRATION_YEARS = 10;

    // --- Types ---
    struct SldData {
        bytes32 parentNamehash;
        string label;
        uint256 registrationTime;
        uint256 expiryTime;
        uint256 registrationPriceUsdCents;
        string artworkIpfsHash;
        bool artworkGenerated;
    }

    // --- Storage ---
    mapping(bytes32 => uint256) public sldNamehashToTokenId;
    mapping(uint256 => SldData) public tokenIdToSldData;
    mapping(uint256 => bytes32) public tokenIdToNamehash;
    uint256 public nextTokenId;
    address public registrationManager;
    address public artworkService;
    address public metadataService;

    // --- Errors ---
    error OnlyRegistrationManager();
    error OnlyArtworkService();
    error ZeroAddress();
    error SldNotAvailable(bytes32 sldNamehash);
    error SldNotFound(bytes32 sldNamehash);
    error InvalidYears(uint256 durationYears);
    error RenewalPastGracePeriod(bytes32 sldNamehash);
    error ExceedsMaxRegistrationYears(uint256 requestedExpiry);

    // --- Events ---
    event SldMinted(
        uint256 indexed tokenId,
        bytes32 indexed sldNamehash,
        bytes32 indexed parentNamehash,
        string label,
        address to,
        uint256 expiryTime,
        uint256 priceUsdCents
    );
    event SldRenewed(bytes32 indexed sldNamehash, uint256 newExpiryTime, uint256 additionalYears);
    event ArtworkSet(uint256 indexed tokenId, string ipfsHash);
    event RegistrationManagerUpdated(address oldManager, address newManager);
    event ArtworkServiceUpdated(address oldService, address newService);
    event MetadataServiceUpdated(address oldService, address newService);

    // --- Modifiers ---
    modifier onlyRegistrationManager() {
        if (msg.sender != registrationManager) revert OnlyRegistrationManager();
        _;
    }

    modifier onlyArtworkService() {
        if (msg.sender != artworkService) revert OnlyArtworkService();
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

    /// @inheritdoc IHsrSld
    function mint(
        address to,
        string calldata label,
        bytes32 parentNamehash,
        uint256 durationYears,
        uint256 priceUsdCents
    ) external override onlyRegistrationManager returns (uint256 tokenId) {
        if (to == address(0)) revert ZeroAddress();
        if (durationYears == 0 || durationYears > MAX_REGISTRATION_YEARS) revert InvalidYears(durationYears);

        bytes32 sldNamehash = keccak256(abi.encodePacked(parentNamehash, keccak256(bytes(label))));

        // Check availability: must be unregistered or expired past grace
        uint256 existingTokenId = sldNamehashToTokenId[sldNamehash];
        if (existingTokenId != 0) {
            SldData storage existing = tokenIdToSldData[existingTokenId];
            if (block.timestamp <= existing.expiryTime + GRACE_PERIOD) {
                revert SldNotAvailable(sldNamehash);
            }
            // Expired past grace — burn old token so new one can be minted
            _burn(existingTokenId);
            delete tokenIdToSldData[existingTokenId];
            delete tokenIdToNamehash[existingTokenId];
        }

        tokenId = nextTokenId;
        unchecked { ++nextTokenId; }

        uint256 expiryTime = block.timestamp + durationYears * 365 days;

        sldNamehashToTokenId[sldNamehash] = tokenId;
        tokenIdToNamehash[tokenId] = sldNamehash;
        tokenIdToSldData[tokenId] = SldData({
            parentNamehash: parentNamehash,
            label: label,
            registrationTime: block.timestamp,
            expiryTime: expiryTime,
            registrationPriceUsdCents: priceUsdCents,
            artworkIpfsHash: "",
            artworkGenerated: false
        });

        _mint(to, tokenId);

        emit SldMinted(tokenId, sldNamehash, parentNamehash, label, to, expiryTime, priceUsdCents);
    }

    /// @inheritdoc IHsrSld
    function renew(bytes32 sldNamehash, uint256 additionalYears) external override onlyRegistrationManager {
        if (additionalYears == 0 || additionalYears > MAX_REGISTRATION_YEARS) {
            revert InvalidYears(additionalYears);
        }

        uint256 tokenId = sldNamehashToTokenId[sldNamehash];
        if (tokenId == 0) revert SldNotFound(sldNamehash);

        SldData storage data = tokenIdToSldData[tokenId];

        // Cannot renew past grace period
        if (block.timestamp > data.expiryTime + GRACE_PERIOD) {
            revert RenewalPastGracePeriod(sldNamehash);
        }

        // Extend from the later of: current expiry or now
        uint256 baseTime = data.expiryTime > block.timestamp ? data.expiryTime : block.timestamp;
        uint256 newExpiry = baseTime + additionalYears * 365 days;

        // Cap at MAX_REGISTRATION_YEARS from now
        uint256 maxExpiry = block.timestamp + MAX_REGISTRATION_YEARS * 365 days;
        if (newExpiry > maxExpiry) revert ExceedsMaxRegistrationYears(newExpiry);

        data.expiryTime = newExpiry;

        emit SldRenewed(sldNamehash, newExpiry, additionalYears);
    }

    /// @inheritdoc IHsrSld
    function setArtwork(uint256 tokenId, string calldata ipfsHash) external override onlyArtworkService {
        if (tokenIdToNamehash[tokenId] == bytes32(0)) revert SldNotFound(bytes32(0));

        SldData storage data = tokenIdToSldData[tokenId];
        data.artworkIpfsHash = ipfsHash;
        data.artworkGenerated = true;

        emit ArtworkSet(tokenId, ipfsHash);
    }

    // --- Token URI ---

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        if (metadataService != address(0)) {
            return IMetadataService(metadataService).tokenURI(tokenId);
        }
        return super.tokenURI(tokenId);
    }

    // --- View Functions ---

    /// @inheritdoc IHsrSld
    function isExpired(bytes32 sldNamehash) external view override returns (bool) {
        uint256 tokenId = sldNamehashToTokenId[sldNamehash];
        if (tokenId == 0) return true;
        return block.timestamp > tokenIdToSldData[tokenId].expiryTime;
    }

    /// @inheritdoc IHsrSld
    function isInGracePeriod(bytes32 sldNamehash) external view override returns (bool) {
        uint256 tokenId = sldNamehashToTokenId[sldNamehash];
        if (tokenId == 0) return false;
        uint256 expiry = tokenIdToSldData[tokenId].expiryTime;
        return block.timestamp > expiry && block.timestamp <= expiry + GRACE_PERIOD;
    }

    /// @notice Returns true if the SLD is available for new registration.
    function isAvailable(bytes32 sldNamehash) external view returns (bool) {
        uint256 tokenId = sldNamehashToTokenId[sldNamehash];
        if (tokenId == 0) return true;
        return block.timestamp > tokenIdToSldData[tokenId].expiryTime + GRACE_PERIOD;
    }

    /// @inheritdoc IHsrSld
    function getExpiryTime(bytes32 sldNamehash) external view override returns (uint256) {
        uint256 tokenId = sldNamehashToTokenId[sldNamehash];
        if (tokenId == 0) revert SldNotFound(sldNamehash);
        return tokenIdToSldData[tokenId].expiryTime;
    }

    /// @notice Returns all SLD data fields for a token.
    function getSldData(uint256 tokenId) external view returns (
        bytes32 parentNamehash,
        string memory label,
        uint256 registrationTime,
        uint256 expiryTime,
        uint256 registrationPriceUsdCents,
        string memory artworkIpfsHash,
        bool artworkGenerated
    ) {
        if (tokenIdToNamehash[tokenId] == bytes32(0)) revert SldNotFound(bytes32(0));
        SldData storage data = tokenIdToSldData[tokenId];
        return (
            data.parentNamehash,
            data.label,
            data.registrationTime,
            data.expiryTime,
            data.registrationPriceUsdCents,
            data.artworkIpfsHash,
            data.artworkGenerated
        );
    }

    // --- Admin ---

    function setRegistrationManager(address _registrationManager) external onlyOwner {
        if (_registrationManager == address(0)) revert ZeroAddress();
        address old = registrationManager;
        registrationManager = _registrationManager;
        emit RegistrationManagerUpdated(old, _registrationManager);
    }

    function setArtworkService(address _artworkService) external onlyOwner {
        if (_artworkService == address(0)) revert ZeroAddress();
        address old = artworkService;
        artworkService = _artworkService;
        emit ArtworkServiceUpdated(old, _artworkService);
    }

    function setMetadataService(address _metadataService) external onlyOwner {
        address old = metadataService;
        metadataService = _metadataService;
        emit MetadataServiceUpdated(old, _metadataService);
    }

    // --- UUPS ---

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
