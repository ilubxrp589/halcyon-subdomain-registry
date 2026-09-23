// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IHSRRegistry.sol";
import "./libraries/HSRNamehash.sol";

/**
 * @title HSRRegistry
 * @author Halcyon Registry
 * @notice ENS-compatible registry for HSR subdomain resolution
 * @dev Maps domain namehashes to resolvers and tracks ownership
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────┐
 * │                    HSR Registry                          │
 * │  - Maps namehash → resolver address                     │
 * │  - Tracks ownership synced with NFT contract            │
 * │  - Integrates with SubdomainNFT for ownership           │
 * └─────────────────────────────────────────────────────────┘
 *                           │
 *                           ▼
 * ┌─────────────────────────────────────────────────────────┐
 * │                   HSR Resolver                           │
 * │  - Stores wallet addresses per namehash                 │
 * │  - addr(node) → address                                 │
 * │  - Multi-chain support (EIP-2304)                       │
 * └─────────────────────────────────────────────────────────┘
 */
contract HSRRegistry is IHSRRegistry, AccessControl {
    using HSRNamehash for string;

    // =============================================================
    //                           ROLES
    // =============================================================

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // =============================================================
    //                           STORAGE
    // =============================================================

    /// @notice Domain record structure
    struct Record {
        address owner;
        address resolver;
        uint256 tokenId;
    }

    /// @notice Domain records: namehash => Record
    mapping(bytes32 => Record) private _records;

    /// @notice Reverse lookup: tokenId => namehash
    mapping(uint256 => bytes32) private _tokenToNode;

    /// @notice Default resolver address for new registrations
    address public defaultResolver;

    /// @notice Reference to the SubdomainNFT contract
    address public nftContract;

    // =============================================================
    //                           ERRORS
    // =============================================================

    error NotAuthorized();
    error DomainNotFound();
    error DomainAlreadyExists();
    error InvalidResolver();
    error InvalidAddress();

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

    /**
     * @notice Initialize the HSR Registry
     * @param _defaultResolver Address of the default resolver contract
     */
    constructor(address _defaultResolver) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);

        defaultResolver = _defaultResolver;
    }

    // =============================================================
    //                         MODIFIERS
    // =============================================================

    /**
     * @notice Ensure caller is authorized to modify the domain
     */
    modifier onlyAuthorized(bytes32 node) {
        if (!_isAuthorized(node, msg.sender)) revert NotAuthorized();
        _;
    }

    // =============================================================
    //                      CORE FUNCTIONS
    // =============================================================

    /**
     * @inheritdoc IHSRRegistry
     */
    function resolver(bytes32 node) external view override returns (address) {
        return _records[node].resolver;
    }

    /**
     * @inheritdoc IHSRRegistry
     */
    function owner(bytes32 node) external view override returns (address) {
        return _records[node].owner;
    }

    /**
     * @inheritdoc IHSRRegistry
     */
    function tokenId(bytes32 node) external view override returns (uint256) {
        return _records[node].tokenId;
    }

    /**
     * @inheritdoc IHSRRegistry
     */
    function recordExists(bytes32 node) external view override returns (bool) {
        return _records[node].owner != address(0);
    }

    // =============================================================
    //                   REGISTRATION FUNCTIONS
    // =============================================================

    /**
     * @inheritdoc IHSRRegistry
     */
    function registerSubdomain(
        bytes32 node,
        uint256 _tokenId,
        address _owner,
        address _resolver
    ) external override onlyRole(MINTER_ROLE) {
        if (_records[node].owner != address(0)) revert DomainAlreadyExists();
        if (_owner == address(0)) revert InvalidAddress();

        // Use default resolver if none specified
        address resolverAddr = _resolver != address(0) ? _resolver : defaultResolver;

        _records[node] = Record({
            owner: _owner,
            resolver: resolverAddr,
            tokenId: _tokenId
        });

        _tokenToNode[_tokenId] = node;

        emit NewSubdomain(node, _tokenId, _owner, resolverAddr);
    }

    /**
     * @notice Register subdomain by FQDN string (convenience function)
     * @param fqdn The fully qualified domain name (e.g., "alice.cryptofans")
     * @param _tokenId The NFT token ID
     * @param _owner The initial owner
     * @param _resolver The resolver contract address (0 for default)
     */
    function registerSubdomainByFQDN(
        string calldata fqdn,
        uint256 _tokenId,
        address _owner,
        address _resolver
    ) external onlyRole(MINTER_ROLE) {
        bytes32 node = fqdn.namehashNormalized();

        if (_records[node].owner != address(0)) revert DomainAlreadyExists();
        if (_owner == address(0)) revert InvalidAddress();

        address resolverAddr = _resolver != address(0) ? _resolver : defaultResolver;

        _records[node] = Record({
            owner: _owner,
            resolver: resolverAddr,
            tokenId: _tokenId
        });

        _tokenToNode[_tokenId] = node;

        emit NewSubdomain(node, _tokenId, _owner, resolverAddr);
    }

    /**
     * @inheritdoc IHSRRegistry
     */
    function setResolver(bytes32 node, address _resolver) external override onlyAuthorized(node) {
        if (_resolver == address(0)) revert InvalidResolver();
        if (_records[node].owner == address(0)) revert DomainNotFound();

        _records[node].resolver = _resolver;
        emit ResolverChanged(node, _resolver);
    }

    /**
     * @inheritdoc IHSRRegistry
     */
    function transferOwnership(bytes32 node, address _newOwner) external override onlyRole(OPERATOR_ROLE) {
        if (_records[node].owner == address(0)) revert DomainNotFound();
        if (_newOwner == address(0)) revert InvalidAddress();

        _records[node].owner = _newOwner;
        emit OwnershipTransferred(node, _newOwner);
    }

    /**
     * @notice Update ownership by token ID (for NFT transfer hooks)
     * @param _tokenId The NFT token ID
     * @param _newOwner The new owner address
     */
    function transferOwnershipByTokenId(
        uint256 _tokenId,
        address _newOwner
    ) external onlyRole(OPERATOR_ROLE) {
        bytes32 node = _tokenToNode[_tokenId];
        if (node == bytes32(0)) revert DomainNotFound();
        if (_newOwner == address(0)) revert InvalidAddress();

        _records[node].owner = _newOwner;
        emit OwnershipTransferred(node, _newOwner);
    }

    /**
     * @inheritdoc IHSRRegistry
     */
    function unregister(bytes32 node) external override onlyRole(OPERATOR_ROLE) {
        Record memory record = _records[node];
        if (record.owner == address(0)) revert DomainNotFound();

        delete _tokenToNode[record.tokenId];
        delete _records[node];
    }

    /**
     * @notice Unregister by token ID (for NFT burn hooks)
     * @param _tokenId The NFT token ID
     */
    function unregisterByTokenId(uint256 _tokenId) external onlyRole(OPERATOR_ROLE) {
        bytes32 node = _tokenToNode[_tokenId];
        if (node == bytes32(0)) revert DomainNotFound();

        delete _records[node];
        delete _tokenToNode[_tokenId];
    }

    // =============================================================
    //                     LOOKUP FUNCTIONS
    // =============================================================

    /**
     * @inheritdoc IHSRRegistry
     */
    function nodeByTokenId(uint256 _tokenId) external view override returns (bytes32) {
        return _tokenToNode[_tokenId];
    }

    /**
     * @inheritdoc IHSRRegistry
     */
    function getRecord(bytes32 node) external view override returns (
        address _owner,
        address _resolver,
        uint256 _tokenId
    ) {
        Record memory record = _records[node];
        return (record.owner, record.resolver, record.tokenId);
    }

    /**
     * @notice Get record by FQDN string
     * @param fqdn The fully qualified domain name
     * @return _owner The owner address
     * @return _resolver The resolver address
     * @return _tokenId The NFT token ID
     */
    function getRecordByFQDN(string calldata fqdn) external view returns (
        address _owner,
        address _resolver,
        uint256 _tokenId
    ) {
        bytes32 node = fqdn.namehashNormalized();
        Record memory record = _records[node];
        return (record.owner, record.resolver, record.tokenId);
    }

    /**
     * @notice Compute namehash for an FQDN (helper function)
     * @param fqdn The fully qualified domain name
     * @return The computed namehash
     */
    function computeNamehash(string calldata fqdn) external pure returns (bytes32) {
        return fqdn.namehashNormalized();
    }

    /**
     * @notice Compute namehash for subdomain.tld format
     * @param subdomain The subdomain
     * @param tld The top-level domain
     * @return The computed namehash
     */
    function computeNamehashSubdomain(
        string calldata subdomain,
        string calldata tld
    ) external pure returns (bytes32) {
        return HSRNamehash.namehashSubdomain(
            HSRNamehash.normalize(subdomain),
            HSRNamehash.normalize(tld)
        );
    }

    // =============================================================
    //                      ADMIN FUNCTIONS
    // =============================================================

    /**
     * @notice Set the default resolver for new registrations
     * @param _resolver The new default resolver address
     */
    function setDefaultResolver(address _resolver) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_resolver == address(0)) revert InvalidResolver();
        defaultResolver = _resolver;
    }

    /**
     * @notice Set the NFT contract reference
     * @param _nftContract The SubdomainNFT contract address
     */
    function setNFTContract(address _nftContract) external onlyRole(DEFAULT_ADMIN_ROLE) {
        nftContract = _nftContract;
    }

    /**
     * @notice Batch register subdomains (for migration)
     * @param nodes Array of namehashes
     * @param tokenIds Array of token IDs
     * @param owners Array of owner addresses
     */
    function batchRegister(
        bytes32[] calldata nodes,
        uint256[] calldata tokenIds,
        address[] calldata owners
    ) external onlyRole(OPERATOR_ROLE) {
        require(
            nodes.length == tokenIds.length && nodes.length == owners.length,
            "Array length mismatch"
        );
        require(nodes.length <= 100, "Batch too large");

        for (uint256 i = 0; i < nodes.length; i++) {
            if (_records[nodes[i]].owner == address(0) && owners[i] != address(0)) {
                _records[nodes[i]] = Record({
                    owner: owners[i],
                    resolver: defaultResolver,
                    tokenId: tokenIds[i]
                });
                _tokenToNode[tokenIds[i]] = nodes[i];
                emit NewSubdomain(nodes[i], tokenIds[i], owners[i], defaultResolver);
            }
        }
    }

    // =============================================================
    //                    INTERNAL FUNCTIONS
    // =============================================================

    /**
     * @notice Check if an address is authorized to modify domain
     * @param node The namehash of the domain
     * @param caller The address to check
     * @return True if authorized
     */
    function _isAuthorized(bytes32 node, address caller) internal view returns (bool) {
        // Operators can modify any domain
        if (hasRole(OPERATOR_ROLE, caller)) return true;

        // Owner can modify their domain
        return _records[node].owner == caller;
    }

    // =============================================================
    //                      EIP-165 SUPPORT
    // =============================================================

    /**
     * @notice Check if the contract supports an interface
     * @param interfaceId The interface identifier
     * @return True if supported
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl)
        returns (bool)
    {
        return
            interfaceId == type(IHSRRegistry).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
