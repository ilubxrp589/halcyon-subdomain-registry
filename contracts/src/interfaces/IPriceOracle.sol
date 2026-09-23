// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IPriceOracle
 * @notice Interface for FLR/USD price oracle
 */
interface IPriceOracle {
    /**
     * @notice Get current FLR price in USD
     * @return price FLR price in USD (18 decimals)
     * @return timestamp Last update timestamp
     */
    function getFLRPrice() external view returns (uint256 price, uint256 timestamp);

    /**
     * @notice Convert USD amount to FLR
     * @param usdAmount Amount in USD (18 decimals)
     * @return flrAmount Equivalent FLR amount (18 decimals)
     */
    function convertUSDtoFLR(uint256 usdAmount) external view returns (uint256 flrAmount);

    /**
     * @notice Convert FLR amount to USD
     * @param flrAmount Amount in FLR (18 decimals)
     * @return usdAmount Equivalent USD amount (18 decimals)
     */
    function convertFLRtoUSD(uint256 flrAmount) external view returns (uint256 usdAmount);
}
