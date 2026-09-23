// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IHSRRegistry
 * @author Halcyon Registry
 * @notice Interface for the HSR domain registry
 * @dev Maps domain namehashes to their resolvers (ENS-compatible pattern)
 */
interface IHSRRegistry {
    // =============================================================
    //                           EVENTS
    // =============================================================

    /**
     * @notice Emitted when a new subdomain is registered
     * @param node The namehash of the domain
     * @param tokenId The NFT token ID
     * @param owner The domain owner
     * @param resolver The resolver address
     */
    event NewSubdomain(
        bytes32 indexed node,
        uint256 indexed tokenId,
        address indexed owner,
        address resolver
    );

    /**
     * @notice Emitted when a domain's resolver is changed
     * @param node The namehash of the domain
     * @param resolver The new resolver address
     */
    event ResolverChanged(bytes32 indexed node, address resolver);

    /**
     * @notice Emitted when domain ownership is transferred
     * @param node The namehash of the domain
     * @param newOwner The new owner address
     */
    event OwnershipTransferred(bytes32 indexed node, address indexed newOwner);

    // =============================================================
    //                      CORE FUNCTIONS
    // =============================================================

    /**
     * @notice Get the resolver for a domain
     * @param node The namehash of the domain
     * @return The resolver address (address(0) if not set)
     */
    function resolver(bytes32 node) external view returns (address);

    /**
     * @notice Get the default resolver address
     * @return The default resolver address
     */
    function defaultResolver() external view returns (address);

    /**
     * @notice Get the owner of a domain
     * @param node The namehash of the domain
     * @return The owner address (address(0) if not registered)
     */
    function owner(bytes32 node) external view returns (address);

    /**
     * @notice Get the NFT token ID for a domain
     * @param node The namehash of the domain
     * @return The token ID (0 if not registered)
     */
    function tokenId(bytes32 node) external view returns (uint256);

    /**
     * @notice Check if a domain is registered
     * @param node The namehash of the domain
     * @return True if registered
     */
    function recordExists(bytes32 node) external view returns (bool);

    // =============================================================
    //                    REGISTRATION FUNCTIONS
    // =============================================================

    /**
     * @notice Register a new subdomain in the registry
     * @dev Called by minter role when NFT is minted
     * @param node The namehash of the domain
     * @param _tokenId The NFT token ID
     * @param _owner The initial owner
     * @param _resolver The resolver contract address
     */
    function registerSubdomain(
        bytes32 node,
        uint256 _tokenId,
        address _owner,
        address _resolver
    ) external;

    /**
     * @notice Set the resolver for a domain
     * @dev Only callable by domain owner or operator
     * @param node The namehash of the domain
     * @param _resolver The new resolver address
     */
    function setResolver(bytes32 node, address _resolver) external;

    /**
     * @notice Update ownership record when NFT is transferred
     * @dev Called automatically via SubdomainNFT integration
     * @param node The namehash of the domain
     * @param _newOwner The new owner address
     */
    function transferOwnership(bytes32 node, address _newOwner) external;

    /**
     * @notice Remove a domain from the registry
     * @dev Called when NFT is burned
     * @param node The namehash of the domain
     */
    function unregister(bytes32 node) external;

    /**
     * @notice Update ownership by token ID (for NFT transfer hooks)
     * @param _tokenId The NFT token ID
     * @param _newOwner The new owner address
     */
    function transferOwnershipByTokenId(uint256 _tokenId, address _newOwner) external;

    /**
     * @notice Unregister by token ID (for NFT burn hooks)
     * @param _tokenId The NFT token ID
     */
    function unregisterByTokenId(uint256 _tokenId) external;

    // =============================================================
    //                    LOOKUP FUNCTIONS
    // =============================================================

    /**
     * @notice Get the namehash for a domain by token ID
     * @param _tokenId The NFT token ID
     * @return The namehash
     */
    function nodeByTokenId(uint256 _tokenId) external view returns (bytes32);

    /**
     * @notice Get complete record for a domain
     * @param node The namehash
     * @return _owner The owner address
     * @return _resolver The resolver address
     * @return _tokenId The NFT token ID
     */
    function getRecord(bytes32 node) external view returns (
        address _owner,
        address _resolver,
        uint256 _tokenId
    );
}
