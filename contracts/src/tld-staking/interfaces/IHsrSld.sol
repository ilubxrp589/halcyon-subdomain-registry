// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IHsrSld {
    /// @notice Mints a new SLD NFT. Only callable by the registration manager.
    /// @param to The address to receive the SLD NFT.
    /// @param label The subdomain label (e.g. "wallet").
    /// @param parentNamehash The namehash of the parent TLD.
    /// @param durationYears Number of years to register (1-10).
    /// @param priceUsdCents The registration price in USD cents (locked for renewals).
    /// @return tokenId The ID of the newly minted token.
    function mint(
        address to,
        string calldata label,
        bytes32 parentNamehash,
        uint256 durationYears,
        uint256 priceUsdCents
    ) external returns (uint256 tokenId);

    /// @notice Extends an existing SLD registration. Only callable by the registration manager.
    /// @param sldNamehash The namehash of the SLD.
    /// @param additionalYears Number of years to add.
    function renew(bytes32 sldNamehash, uint256 additionalYears) external;

    /// @notice Returns whether an SLD has expired (past expiryTime).
    function isExpired(bytes32 sldNamehash) external view returns (bool);

    /// @notice Returns whether an SLD is expired but within the grace period.
    function isInGracePeriod(bytes32 sldNamehash) external view returns (bool);

    /// @notice Returns the expiry timestamp for an SLD.
    function getExpiryTime(bytes32 sldNamehash) external view returns (uint256);

    /// @notice Sets the artwork IPFS hash for an SLD token. Only callable by artwork service.
    function setArtwork(uint256 tokenId, string calldata ipfsHash) external;

    /// @notice Returns the token ID for an SLD namehash.
    function sldNamehashToTokenId(bytes32 sldNamehash) external view returns (uint256);

    /// @notice Returns whether an SLD is available for new registration.
    function isAvailable(bytes32 sldNamehash) external view returns (bool);

    /// @notice Returns the metadata service address.
    function metadataService() external view returns (address);

    /// @notice Returns all SLD data fields for a token.
    function getSldData(uint256 tokenId) external view returns (
        bytes32 parentNamehash,
        string memory label,
        uint256 registrationTime,
        uint256 expiryTime,
        uint256 registrationPriceUsdCents,
        string memory artworkIpfsHash,
        bool artworkGenerated
    );
}
