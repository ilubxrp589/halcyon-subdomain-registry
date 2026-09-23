// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IDefaultResolver
/// @notice ENS-compatible resolver interface for the TLD staking system.
interface IDefaultResolver {
    // --- Events ---
    event AddrChanged(bytes32 indexed node, uint256 coinType, bytes addr);
    event TextChanged(bytes32 indexed node, string indexed indexedKey, string key, string value);
    event ContenthashChanged(bytes32 indexed node, bytes hash);
    event NameChanged(bytes32 indexed node, string name);

    // --- Multi-chain address resolution ---

    /// @notice Sets an address for a specific coin type (ENSIP-11).
    function setAddr(bytes32 node, uint256 coinType, bytes calldata addr) external;

    /// @notice Returns the address for a specific coin type.
    function addr(bytes32 node, uint256 coinType) external view returns (bytes memory);

    /// @notice Returns the primary address (FLR coinType) as an Ethereum address.
    function addr(bytes32 node) external view returns (address);

    /// @notice Convenience setter — sets both FLR and ETH coinType addresses.
    function setAddr(bytes32 node, address wallet) external;

    // --- Text records ---

    /// @notice Sets a text record.
    function setText(bytes32 node, string calldata key, string calldata value) external;

    /// @notice Returns a text record.
    function text(bytes32 node, string calldata key) external view returns (string memory);

    // --- Contenthash ---

    /// @notice Sets the contenthash (EIP-1577).
    function setContenthash(bytes32 node, bytes calldata hash) external;

    /// @notice Returns the contenthash.
    function contenthash(bytes32 node) external view returns (bytes memory);

    // --- Reverse records ---

    /// @notice Sets the reverse name record.
    function setName(bytes32 node, string calldata name) external;

    /// @notice Returns the reverse name record.
    function name(bytes32 node) external view returns (string memory);
}
