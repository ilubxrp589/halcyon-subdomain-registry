// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IMetadataService
/// @notice Interface for metadata service contracts that generate tokenURI strings.
interface IMetadataService {
    /// @notice Returns the metadata URI for a given token ID.
    /// @param tokenId The token ID to generate metadata for.
    /// @return The metadata URI string.
    function tokenURI(uint256 tokenId) external view returns (string memory);
}
