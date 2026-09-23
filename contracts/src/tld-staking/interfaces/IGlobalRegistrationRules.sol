// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IGlobalRegistrationRules {
    /// @notice Validates a registration request against system-wide rules.
    /// @param label The subdomain label being registered.
    /// @param priceUsdCents The total price in USD cents for the registration.
    /// @param durationYears The number of years being registered (1-10).
    /// @return True if the registration passes all global rules.
    function validateRegistration(
        string calldata label,
        uint256 priceUsdCents,
        uint256 durationYears
    ) external view returns (bool);

    /// @notice Returns the minimum price per year in USD cents.
    function minimumPriceUsdCents() external view returns (uint256);
}
