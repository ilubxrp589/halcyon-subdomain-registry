// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IFtsoOracle {
    /// @notice Returns the current FLR/USD price with 18-decimal precision and its timestamp.
    /// @return priceWei The FLR/USD price in wei (18 decimals).
    /// @return timestamp The timestamp of the price update.
    function getFlrUsdPriceInWei() external view returns (uint256 priceWei, uint64 timestamp);

    /// @notice Converts a USD cent amount to FLR wei using the current FTSO price.
    /// @param usdCents The amount in USD cents (e.g. 500 = $5.00).
    /// @return flrWei The equivalent amount in FLR wei.
    function usdCentsToFlr(uint256 usdCents) external view returns (uint256 flrWei);
}
