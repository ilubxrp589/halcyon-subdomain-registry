// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IHSRRegistry.sol";
import "./libraries/HSRNamehash.sol";

/**
 * @title SubdomainNFT
 * @author Halcyon Registry
 * @notice ERC-721 NFT representing ownership of Handshake subdomains
 * @dev Implements ERC-2981 for marketplace royalties (2.5%)
 *
 * Features added from vibeforge1111 skills:
 * - ERC721Enumerable for getDomainsOwned()
 * - Renewal system with payment
 * - Metadata freeze mechanism for trust
 */
contract SubdomainNFT is
    ERC721,
    ERC721URIStorage,
    ERC721Enumerable,
    ERC721Burnable,
    AccessControl,
    ERC2981,
    ReentrancyGuard
{
    using HSRNamehash for string;

    // =============================================================
    //                           ROLES
    // =============================================================

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // =============================================================
    //                           STORAGE
    // =============================================================

    uint256 private _tokenIdCounter;

    /// @notice Reference to the HSR Registry contract for address resolution
    IHSRRegistry public hsrRegistry;

    struct SubdomainMetadata {
        string tld;
        string subdomain;
        uint256 registeredAt;
        uint256 expiresAt;
        bool dnsActive;
        uint256 pricePaidFLR;
        uint256 pricePaidUSD;
    }

    // tokenId => metadata
    mapping(uint256 => SubdomainMetadata) public subdomains;

    // keccak256(subdomain.tld) => tokenId
    mapping(bytes32 => uint256) public domainToTokenId;

    // Platform royalty recipient
    address public royaltyRecipient;

    // Default royalty: 2.5% (250 basis points)
    uint96 public constant DEFAULT_ROYALTY_BPS = 250;

    // Registration period (1 year)
    uint256 public constant REGISTRATION_PERIOD = 365 days;

    // Grace period after expiration (configurable, default 60 days)
    uint256 public gracePeriod = 60 days;

    // Treasury address for reclaimed domains
    address public treasuryAddress;

    // Renewal price multiplier (50% = 5000 basis points)
    uint256 public renewalMultiplierBps = 5000;

    // Community treasury for FTSO delegation rewards
    address public communityTreasury;
    uint256 public communityFeeBps = 600; // 6%

    // Metadata freeze state
    bool public metadataFrozen;

    // Base URI for metadata (can be frozen)
    string public baseTokenURI;

    // =============================================================
    //                           EVENTS
    // =============================================================

    event SubdomainMinted(
        uint256 indexed tokenId,
        address indexed owner,
        string tld,
        string subdomain,
        string fullDomain,
        uint256 priceFLR,
        uint256 priceUSD
    );

    event DNSUpdateRequired(
        uint256 indexed tokenId,
        address indexed newOwner,
        string fullDomain
    );

    event DNSStatusUpdated(uint256 indexed tokenId, bool active);

    event SubdomainRenewed(uint256 indexed tokenId, uint256 newExpiration);

    event SubdomainReleased(
        uint256 indexed tokenId,
        address indexed previousOwner,
        string tld,
        string subdomain,
        string fullDomain
    );

    event DomainReclaimed(uint256 indexed tokenId, address indexed previousOwner, address indexed treasury);

    event CommunityFeeDistributed(uint256 indexed tokenId, uint256 amount, address treasury);

    event MetadataFrozen(string baseURI);

    event BaseURIUpdated(string newBaseURI);

    event RenewalPaid(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 newExpiration,
        uint256 amountPaid
    );

    event HSRRegistryUpdated(address indexed registry);

    event SubdomainRegisteredInRegistry(
        uint256 indexed tokenId,
        bytes32 indexed node,
        address resolver
    );

    // =============================================================
    //                           ERRORS
    // =============================================================

    error MetadataIsFrozen();
    error DomainExpired();
    error NotTokenOwner();
    error InsufficientPayment(uint256 sent, uint256 required);
    error TransferFailed();

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

    constructor(
        string memory name,
        string memory symbol,
        address _royaltyRecipient
    ) ERC721(name, symbol) {
        require(_royaltyRecipient != address(0), "Invalid royalty recipient");

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);

        royaltyRecipient = _royaltyRecipient;
        _setDefaultRoyalty(_royaltyRecipient, DEFAULT_ROYALTY_BPS);
    }

    // =============================================================
    //                        MINTING LOGIC
    // =============================================================

    /**
     * @notice Mint a new subdomain NFT
     * @param to Recipient address
     * @param tld Top-level domain (e.g., "cryptofans")
     * @param subdomain Subdomain name (e.g., "alice")
     * @param expiresAt Expiration timestamp (0 = never)
     * @param priceFLR Price paid in FLR
     * @param priceUSD Price paid in USD
     * @param metadataURI Token metadata URI
     * @return tokenId The minted token ID
     */
    function mint(
        address to,
        string memory tld,
        string memory subdomain,
        uint256 expiresAt,
        uint256 priceFLR,
        uint256 priceUSD,
        string memory metadataURI
    ) external onlyRole(MINTER_ROLE) returns (uint256) {
        require(to != address(0), "Invalid recipient");
        require(bytes(tld).length > 0, "Empty TLD");
        require(bytes(subdomain).length > 0, "Empty subdomain");

        // Check uniqueness
        string memory fullDomain = string(abi.encodePacked(subdomain, ".", tld));
        bytes32 domainHash = keccak256(abi.encodePacked(fullDomain));
        require(domainToTokenId[domainHash] == 0, "Subdomain already exists");

        uint256 tokenId = ++_tokenIdCounter;

        // Store metadata
        subdomains[tokenId] = SubdomainMetadata({
            tld: tld,
            subdomain: subdomain,
            registeredAt: block.timestamp,
            expiresAt: expiresAt,
            dnsActive: false,
            pricePaidFLR: priceFLR,
            pricePaidUSD: priceUSD
        });

        domainToTokenId[domainHash] = tokenId;

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, metadataURI);

        emit SubdomainMinted(tokenId, to, tld, subdomain, fullDomain, priceFLR, priceUSD);

        // Register in HSR Registry for address resolution (if registry is set)
        _registerInHSRRegistry(fullDomain, tokenId, to);

        return tokenId;
    }

    /**
     * @notice Batch mint multiple subdomain NFTs
     * @param to Recipient address
     * @param tld Top-level domain (same for all)
     * @param subdomainList Array of subdomain names
     * @param expiresAt Expiration timestamp (0 = never)
     * @param pricesFLR Array of prices in FLR for each domain
     * @param pricesUSD Array of prices in USD for each domain
     * @param metadataURIs Array of metadata URIs
     * @return tokenIds Array of minted token IDs
     */
    function batchMint(
        address to,
        string memory tld,
        string[] calldata subdomainList,
        uint256 expiresAt,
        uint256[] calldata pricesFLR,
        uint256[] calldata pricesUSD,
        string[] calldata metadataURIs
    ) external onlyRole(MINTER_ROLE) returns (uint256[] memory) {
        require(to != address(0), "Invalid recipient");
        require(bytes(tld).length > 0, "Empty TLD");
        require(subdomainList.length > 0, "Empty subdomain list");
        require(subdomainList.length <= 20, "Batch too large");
        require(
            subdomainList.length == pricesFLR.length &&
            subdomainList.length == pricesUSD.length &&
            subdomainList.length == metadataURIs.length,
            "Array length mismatch"
        );

        uint256[] memory tokenIds = new uint256[](subdomainList.length);

        for (uint256 i = 0; i < subdomainList.length; i++) {
            tokenIds[i] = _mintSingleInBatch(
                to,
                tld,
                subdomainList[i],
                expiresAt,
                pricesFLR[i],
                pricesUSD[i],
                metadataURIs[i]
            );
        }

        return tokenIds;
    }

    /**
     * @dev Internal helper for batch minting to avoid stack too deep
     */
    function _mintSingleInBatch(
        address to,
        string memory tld,
        string calldata subdomain,
        uint256 expiresAt,
        uint256 priceFLR,
        uint256 priceUSD,
        string calldata metadataURI
    ) internal returns (uint256) {
        require(bytes(subdomain).length > 0, "Empty subdomain");

        string memory fullDomain = string(abi.encodePacked(subdomain, ".", tld));
        bytes32 domainHash = keccak256(abi.encodePacked(fullDomain));
        require(domainToTokenId[domainHash] == 0, "Subdomain already exists");

        uint256 tokenId = ++_tokenIdCounter;

        subdomains[tokenId] = SubdomainMetadata({
            tld: tld,
            subdomain: subdomain,
            registeredAt: block.timestamp,
            expiresAt: expiresAt,
            dnsActive: false,
            pricePaidFLR: priceFLR,
            pricePaidUSD: priceUSD
        });

        domainToTokenId[domainHash] = tokenId;

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, metadataURI);

        emit SubdomainMinted(tokenId, to, tld, subdomain, fullDomain, priceFLR, priceUSD);

        _registerInHSRRegistry(fullDomain, tokenId, to);

        return tokenId;
    }

    /**
     * @notice Internal function to register subdomain in HSR Registry
     * @dev Separated to avoid stack too deep error
     */
    function _registerInHSRRegistry(
        string memory fullDomain,
        uint256 tokenId,
        address owner
    ) internal {
        if (address(hsrRegistry) != address(0)) {
            bytes32 node = fullDomain.namehashNormalized();
            hsrRegistry.registerSubdomain(node, tokenId, owner, address(0));
            emit SubdomainRegisteredInRegistry(tokenId, node, hsrRegistry.defaultResolver());
        }
    }

    // =============================================================
    //                      OPERATOR FUNCTIONS
    // =============================================================

    /**
     * @notice Update DNS active status
     */
    function updateDNSStatus(uint256 tokenId, bool active) external onlyRole(OPERATOR_ROLE) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        subdomains[tokenId].dnsActive = active;
        emit DNSStatusUpdated(tokenId, active);
    }

    /**
     * @notice Renew subdomain expiration
     */
    function renewSubdomain(uint256 tokenId, uint256 newExpiration) external onlyRole(OPERATOR_ROLE) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        require(newExpiration > subdomains[tokenId].expiresAt, "Must extend expiration");
        subdomains[tokenId].expiresAt = newExpiration;
        emit SubdomainRenewed(tokenId, newExpiration);
    }

    /**
     * @notice Update token metadata URI
     * @dev Allows operator to fix/update metadata URIs for existing tokens
     */
    function updateTokenURI(uint256 tokenId, string memory newURI) external onlyRole(OPERATOR_ROLE) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        require(bytes(newURI).length > 0, "Empty URI");
        _setTokenURI(tokenId, newURI);
    }

    /**
     * @notice Batch update token metadata URIs
     * @dev Gas-efficient batch update for multiple tokens
     */
    function batchUpdateTokenURI(uint256[] calldata tokenIds, string[] calldata newURIs) external onlyRole(OPERATOR_ROLE) {
        require(tokenIds.length == newURIs.length, "Array length mismatch");
        require(tokenIds.length <= 50, "Batch too large");

        for (uint256 i = 0; i < tokenIds.length; i++) {
            require(_ownerOf(tokenIds[i]) != address(0), "Token does not exist");
            require(bytes(newURIs[i]).length > 0, "Empty URI");
            _setTokenURI(tokenIds[i], newURIs[i]);
        }
    }

    /**
     * @notice Reclaim an expired domain past its grace period, transferring it to treasury
     * @dev Preserves DNS records, metadata, and mappings — only ownership changes
     * @param tokenId The token ID to reclaim
     */
    function reclaimExpired(uint256 tokenId) external onlyRole(OPERATOR_ROLE) {
        address currentOwner = _ownerOf(tokenId);
        require(currentOwner != address(0), "Token does not exist");
        require(treasuryAddress != address(0), "Treasury not set");

        SubdomainMetadata storage meta = subdomains[tokenId];
        require(meta.expiresAt != 0, "Domain never expires");
        require(block.timestamp > meta.expiresAt + gracePeriod, "Still in grace period");

        // Transfer to treasury (keeps DNS, metadata, mappings intact)
        _transfer(currentOwner, treasuryAddress, tokenId);

        emit DomainReclaimed(tokenId, currentOwner, treasuryAddress);
    }

    // =============================================================
    //                      RELEASE (BURN) FUNCTION
    // =============================================================

    /**
     * @notice Release a subdomain, burning the NFT and making it available for re-registration
     * @dev Can only be called by the token owner or approved address
     * @param tokenId The token ID to release
     */
    function release(uint256 tokenId) external {
        // Verify caller is owner or approved
        require(
            _isAuthorized(_ownerOf(tokenId), msg.sender, tokenId),
            "Not owner or approved"
        );

        address previousOwner = _ownerOf(tokenId);
        SubdomainMetadata memory meta = subdomains[tokenId];
        string memory fullDomain = string(abi.encodePacked(meta.subdomain, ".", meta.tld));
        bytes32 domainHash = keccak256(abi.encodePacked(fullDomain));

        // Clear the domain mapping BEFORE burning (makes subdomain available again)
        delete domainToTokenId[domainHash];

        // Clear metadata
        delete subdomains[tokenId];

        // Burn the token
        _burn(tokenId);

        emit SubdomainReleased(tokenId, previousOwner, meta.tld, meta.subdomain, fullDomain);
    }

    /**
     * @notice Burn a token (operator only - for escrow refunds)
     * @dev Can only be called by OPERATOR_ROLE (escrow contract)
     * @param tokenId The token ID to burn
     */
    function burn(uint256 tokenId) public override onlyRole(OPERATOR_ROLE) {
        address tokenOwner = _ownerOf(tokenId);
        require(tokenOwner != address(0), "Token does not exist");

        SubdomainMetadata memory meta = subdomains[tokenId];
        string memory fullDomain = string(abi.encodePacked(meta.subdomain, ".", meta.tld));
        bytes32 domainHash = keccak256(abi.encodePacked(fullDomain));

        // Clear mappings
        delete domainToTokenId[domainHash];
        delete subdomains[tokenId];

        // Burn using internal _update (bypasses authorization check)
        _update(address(0), tokenId, address(0));
    }

    // =============================================================
    //                      VIEW FUNCTIONS
    // =============================================================

    function getFullDomain(uint256 tokenId) external view returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        SubdomainMetadata memory meta = subdomains[tokenId];
        return string(abi.encodePacked(meta.subdomain, ".", meta.tld));
    }

    function subdomainExists(string memory subdomain, string memory tld)
        external view returns (bool exists, uint256 tokenId)
    {
        string memory fullDomain = string(abi.encodePacked(subdomain, ".", tld));
        bytes32 domainHash = keccak256(abi.encodePacked(fullDomain));
        tokenId = domainToTokenId[domainHash];
        exists = tokenId != 0;
    }

    function isExpired(uint256 tokenId) external view returns (bool) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        SubdomainMetadata memory meta = subdomains[tokenId];
        if (meta.expiresAt == 0) return false;
        return block.timestamp >= meta.expiresAt;
    }

    function totalMinted() external view returns (uint256) {
        return _tokenIdCounter;
    }

    /**
     * @notice Get all domains owned by an address
     * @param owner The owner address
     * @return Array of token IDs
     */
    function getDomainsOwned(address owner) external view returns (uint256[] memory) {
        uint256 balance = balanceOf(owner);
        uint256[] memory tokens = new uint256[](balance);

        for (uint256 i = 0; i < balance; ) {
            tokens[i] = tokenOfOwnerByIndex(owner, i);
            unchecked { ++i; }
        }

        return tokens;
    }

    /**
     * @notice Get domain status
     * @param tokenId The token ID
     * @return status 0=Active, 1=ExpiringSoon, 2=GracePeriod, 3=Expired
     */
    function getDomainStatus(uint256 tokenId) public view returns (uint8 status) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");

        SubdomainMetadata storage meta = subdomains[tokenId];
        if (meta.expiresAt == 0) return 0; // Never expires = Active

        uint256 expiration = meta.expiresAt;

        if (block.timestamp > expiration + gracePeriod) {
            return 3; // Expired
        } else if (block.timestamp > expiration) {
            return 2; // Grace Period
        } else if (block.timestamp > expiration - 30 days) {
            return 1; // Expiring Soon
        } else {
            return 0; // Active
        }
    }

    // =============================================================
    //                      RENEWAL FUNCTIONS
    // =============================================================

    /**
     * @notice Renew a domain for another year
     * @param tokenId The token ID to renew
     */
    function renewDomain(uint256 tokenId) external payable nonReentrant {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();

        SubdomainMetadata storage meta = subdomains[tokenId];

        // Check if domain is within renewal window (not expired beyond grace period)
        if (meta.expiresAt != 0 && block.timestamp > meta.expiresAt + gracePeriod) {
            revert DomainExpired();
        }

        // Calculate renewal price (50% of original)
        uint256 renewalPrice = (meta.pricePaidFLR * renewalMultiplierBps) / 10000;
        if (msg.value < renewalPrice) revert InsufficientPayment(msg.value, renewalPrice);

        // Extend expiration
        if (meta.expiresAt == 0 || block.timestamp > meta.expiresAt) {
            // If no expiration or expired, start from now
            meta.expiresAt = block.timestamp + REGISTRATION_PERIOD;
        } else {
            // If active, add to existing expiration
            meta.expiresAt += REGISTRATION_PERIOD;
        }

        // Send community share to treasury
        if (communityTreasury != address(0) && communityFeeBps > 0) {
            uint256 communityShare = (renewalPrice * communityFeeBps) / 10000;
            (bool cSuccess, ) = communityTreasury.call{value: communityShare}("");
            if (!cSuccess) revert TransferFailed();
            emit CommunityFeeDistributed(tokenId, communityShare, communityTreasury);
        }

        emit RenewalPaid(tokenId, msg.sender, meta.expiresAt, renewalPrice);
        emit SubdomainRenewed(tokenId, meta.expiresAt);

        // Refund excess
        if (msg.value > renewalPrice) {
            (bool success, ) = msg.sender.call{value: msg.value - renewalPrice}("");
            if (!success) revert TransferFailed();
        }
    }

    /**
     * @notice Get renewal price for a domain
     * @param tokenId The token ID
     * @return Renewal price in FLR
     */
    function getRenewalPrice(uint256 tokenId) external view returns (uint256) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        SubdomainMetadata storage meta = subdomains[tokenId];
        return (meta.pricePaidFLR * renewalMultiplierBps) / 10000;
    }

    // =============================================================
    //                      ADMIN FUNCTIONS
    // =============================================================

    /**
     * @notice Set the grace period duration
     * @param _gracePeriod New grace period (min 7 days, max 180 days)
     */
    function setGracePeriod(uint256 _gracePeriod) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_gracePeriod >= 7 days, "Min 7 days");
        require(_gracePeriod <= 180 days, "Max 180 days");
        gracePeriod = _gracePeriod;
    }

    /**
     * @notice Set the treasury address for reclaimed domains
     * @param _treasury New treasury address
     */
    function setTreasuryAddress(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "Invalid treasury");
        treasuryAddress = _treasury;
    }

    function setRoyaltyRecipient(address newRecipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newRecipient != address(0), "Invalid recipient");
        royaltyRecipient = newRecipient;
        _setDefaultRoyalty(newRecipient, DEFAULT_ROYALTY_BPS);
    }

    /**
     * @notice Set renewal multiplier (basis points)
     * @param _multiplierBps New multiplier (5000 = 50%)
     */
    function setRenewalMultiplier(uint256 _multiplierBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_multiplierBps <= 10000, "Max 100%");
        renewalMultiplierBps = _multiplierBps;
    }

    function setCommunityTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        communityTreasury = _treasury;
    }

    function setCommunityFeeBps(uint256 _bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_bps <= 1000, "Max 10%");
        communityFeeBps = _bps;
    }

    /**
     * @notice Set the HSR Registry for address resolution
     * @param _registry Address of the HSR Registry contract
     */
    function setHSRRegistry(address _registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        hsrRegistry = IHSRRegistry(_registry);
        emit HSRRegistryUpdated(_registry);
    }

    /**
     * @notice Set base URI for metadata
     * @param _baseURI New base URI
     */
    function setBaseURI(string calldata _baseURI) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (metadataFrozen) revert MetadataIsFrozen();
        baseTokenURI = _baseURI;
        emit BaseURIUpdated(_baseURI);
    }

    /**
     * @notice Freeze metadata permanently - builds collector trust
     * @dev Cannot be undone!
     */
    function freezeMetadata() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!metadataFrozen, "Already frozen");
        metadataFrozen = true;
        emit MetadataFrozen(baseTokenURI);
    }

    /**
     * @notice Withdraw accumulated renewal fees
     * @param to Recipient address
     */
    function withdrawFees(address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "Invalid recipient");
        uint256 balance = address(this).balance;
        (bool success, ) = to.call{value: balance}("");
        if (!success) revert TransferFailed();
    }

    // =============================================================
    //                    INTERFACE OVERRIDES
    // =============================================================

    function tokenURI(uint256 tokenId)
        public view override(ERC721, ERC721URIStorage) returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, ERC721URIStorage, ERC721Enumerable, AccessControl, ERC2981) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override(ERC721, ERC721Enumerable) returns (address) {
        address from = _ownerOf(tokenId);

        // Emit DNS update for actual transfers (not mints/burns)
        if (from != address(0) && to != address(0)) {
            SubdomainMetadata memory meta = subdomains[tokenId];
            string memory fullDomain = string(abi.encodePacked(meta.subdomain, ".", meta.tld));
            emit DNSUpdateRequired(tokenId, to, fullDomain);

            // Update ownership in HSR Registry for address resolution
            if (address(hsrRegistry) != address(0)) {
                hsrRegistry.transferOwnershipByTokenId(tokenId, to);
            }
        }

        // Handle burns - unregister from HSR Registry
        if (to == address(0) && address(hsrRegistry) != address(0)) {
            hsrRegistry.unregisterByTokenId(tokenId);
        }

        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(
        address account,
        uint128 value
    ) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    // Allow contract to receive FLR for renewals
    receive() external payable {}
}
