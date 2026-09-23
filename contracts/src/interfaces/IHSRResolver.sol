// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IHSRResolver
 * @author Halcyon Registry
 * @notice Interface for HSR address resolution (ENS-compatible)
 * @dev Implements EIP-137 resolver pattern with multi-chain support (EIP-2304)
 *
 * Key standards implemented:
 * - EIP-137: Basic name resolution
 * - EIP-2304: Multi-chain address resolution
 * - ENSIP-11: EVM chain address encoding (0x80000000 | chainId)
 *
 * Note: Implementations should also implement IERC165 for interface detection.
 */
interface IHSRResolver {
    // =============================================================
    //                           EVENTS
    // =============================================================

    /**
     * @notice Emitted when an address is set for a domain
     * @param node The namehash of the domain
     * @param wallet The wallet address set
     */
    event AddressChanged(bytes32 indexed node, address wallet);

    /**
     * @notice Emitted when a multi-chain address is set
     * @param node The namehash of the domain
     * @param coinType The coin type (EIP-2304)
     * @param newAddress The address bytes
     */
    event AddressChangedMultichain(
        bytes32 indexed node,
        uint256 coinType,
        bytes newAddress
    );

    /**
     * @notice Emitted when a text record is set
     * @param node The namehash of the domain
     * @param key The text record key
     * @param value The text record value
     */
    event TextChanged(bytes32 indexed node, string key, string value);

    /**
     * @notice Emitted when a contenthash is set
     * @param node The namehash of the domain
     * @param hash The contenthash bytes (IPFS CID encoded)
     */
    event ContenthashChanged(bytes32 indexed node, bytes hash);

    // =============================================================
    //                      CORE RESOLUTION
    // =============================================================

    /**
     * @notice Get the Flare wallet address for a domain (primary resolution)
     * @param node The namehash of the domain
     * @return The wallet address (address(0) if not set)
     */
    function addr(bytes32 node) external view returns (address);

    /**
     * @notice Set the Flare wallet address for a domain
     * @dev Only callable by domain owner
     * @param node The namehash of the domain
     * @param wallet The wallet address to set
     */
    function setAddr(bytes32 node, address wallet) external;

    // =============================================================
    //                    MULTI-CHAIN SUPPORT
    // =============================================================

    /**
     * @notice Get address for a specific chain (EIP-2304)
     * @param node The namehash of the domain
     * @param coinType The coin type per SLIP-44 or ENSIP-11
     * @return The address as bytes (chain-specific format)
     *
     * Common coin types:
     * - 60: Ethereum (ETH)
     * - 0x80000000 | 14: Flare (FLR) - ENSIP-11 format
     * - 0x80000000 | 114: Coston2 (C2FLR)
     * - 0x80000000 | 19: Songbird (SGB)
     */
    function addr(bytes32 node, uint256 coinType) external view returns (bytes memory);

    /**
     * @notice Set address for a specific chain
     * @param node The namehash of the domain
     * @param coinType The coin type
     * @param addressBytes The address in chain-specific format
     */
    function setAddr(bytes32 node, uint256 coinType, bytes calldata addressBytes) external;

    // =============================================================
    //                      TEXT RECORDS
    // =============================================================

    /**
     * @notice Get a text record for a domain
     * @param node The namehash of the domain
     * @param key The text record key (e.g., "url", "avatar", "description")
     * @return The text record value
     */
    function text(bytes32 node, string calldata key) external view returns (string memory);

    /**
     * @notice Set a text record for a domain
     * @param node The namehash of the domain
     * @param key The text record key
     * @param value The text record value
     */
    function setText(bytes32 node, string calldata key, string calldata value) external;

    // =============================================================
    //                    CONVENIENCE FUNCTIONS
    // =============================================================

    /**
     * @notice Resolve an FQDN string directly to a Flare address
     * @param fqdn The fully qualified domain name (e.g., "alice.cryptofans")
     * @return The wallet address (address(0) if not set)
     */
    function resolveAddress(string calldata fqdn) external view returns (address);

    /**
     * @notice Check if an address is set for a domain
     * @param node The namehash of the domain
     * @return True if an address is set
     */
    function hasAddress(bytes32 node) external view returns (bool);

    // =============================================================
    //                       CONTENTHASH
    // =============================================================

    /**
     * @notice Get the contenthash for a domain (EIP-1577)
     * @param node The namehash of the domain
     * @return The contenthash bytes (empty if not set)
     */
    function contenthash(bytes32 node) external view returns (bytes memory);

    /**
     * @notice Set the contenthash for a domain (IPFS CID)
     * @param node The namehash of the domain
     * @param hash The contenthash bytes
     */
    function setContenthash(bytes32 node, bytes calldata hash) external;

    // Note: supportsInterface is inherited from IERC165
    // Supported interfaces include:
    // - 0x3b3b57de: addr(bytes32) - ENS address resolution
    // - 0xf1cb7e06: addr(bytes32,uint256) - Multi-chain resolution
    // - 0x59d1d43c: text(bytes32,string) - Text records
    // - 0x01ffc9a7: EIP-165 supportsInterface
}
