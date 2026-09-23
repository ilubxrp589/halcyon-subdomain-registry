// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IHsrTld {
    /// @notice Mints a new TLD NFT. Only callable by the claim manager.
    /// @param to The address to receive the TLD NFT.
    /// @param label The TLD label (e.g. "cryptofans").
    /// @param namehash The ENS-style namehash of the TLD.
    /// @return tokenId The ID of the newly minted token.
    function mint(address to, string calldata label, bytes32 namehash) external returns (uint256 tokenId);

    /// @notice Returns the owner of a TLD by its namehash.
    function ownerOfNamehash(bytes32 namehash) external view returns (address);

    /// @notice Sets the registration strategy contract for a TLD. Only callable by TLD owner.
    function setRegistrationStrategy(bytes32 namehash, address strategy) external;

    /// @notice Enables or disables SLD registration for a TLD. Only callable by TLD owner.
    function setRegistrationEnabled(bytes32 namehash, bool enabled) external;

    /// @notice Returns whether SLD registration is enabled for a TLD.
    function isRegistrationEnabled(bytes32 namehash) external view returns (bool);

    /// @notice Returns the registration strategy address for a TLD.
    function getRegistrationStrategy(bytes32 namehash) external view returns (address);

    /// @notice Returns the metadata service address.
    function metadataService() external view returns (address);
}
