// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IRegistrationStrategy {
    /// @notice Returns the price in USD cents for registering or renewing a label.
    /// @param buyer The address of the buyer.
    /// @param tldNamehash The namehash of the parent TLD.
    /// @param label The subdomain label being registered.
    /// @param durationYears Number of years being registered.
    /// @param isRenewal Whether this is a renewal (uses price lock) or new registration.
    /// @return priceUsdCents The total price in USD cents.
    function getPriceInUsdCents(
        address buyer,
        bytes32 tldNamehash,
        string calldata label,
        uint256 durationYears,
        bool isRenewal
    ) external view returns (uint256 priceUsdCents);
}
