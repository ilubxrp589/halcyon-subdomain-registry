// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IPriceOracle.sol";

/**
 * @title PriceOracle
 * @author Halcyon Registry
 * @notice Simple price oracle for FLR/USD conversion
 * @dev Can be upgraded to use Flare FTSO for production
 */
contract PriceOracle is IPriceOracle, Ownable {
    // FLR price in USD (18 decimals, e.g., 0.05 USD = 5e16)
    uint256 public flrPriceUSD;

    // Last update timestamp
    uint256 public lastUpdated;

    // Maximum staleness allowed (1 hour)
    uint256 public constant MAX_STALENESS = 1 hours;

    event PriceUpdated(uint256 newPrice, uint256 timestamp);

    constructor(uint256 _initialPrice) Ownable(msg.sender) {
        require(_initialPrice > 0, "Invalid price");
        flrPriceUSD = _initialPrice;
        lastUpdated = block.timestamp;
    }

    /**
     * @notice Update FLR price
     * @param _newPrice New FLR/USD price (18 decimals)
     */
    function updatePrice(uint256 _newPrice) external onlyOwner {
        require(_newPrice > 0, "Invalid price");
        flrPriceUSD = _newPrice;
        lastUpdated = block.timestamp;
        emit PriceUpdated(_newPrice, block.timestamp);
    }

    /**
     * @inheritdoc IPriceOracle
     */
    function getFLRPrice() external view override returns (uint256 price, uint256 timestamp) {
        return (flrPriceUSD, lastUpdated);
    }

    /**
     * @inheritdoc IPriceOracle
     */
    function convertUSDtoFLR(uint256 usdAmount) external view override returns (uint256 flrAmount) {
        require(flrPriceUSD > 0, "Price not set");
        // usdAmount / flrPriceUSD = flrAmount
        // e.g., $5 / $0.05 = 100 FLR
        flrAmount = (usdAmount * 1e18) / flrPriceUSD;
    }

    /**
     * @inheritdoc IPriceOracle
     */
    function convertFLRtoUSD(uint256 flrAmount) external view override returns (uint256 usdAmount) {
        require(flrPriceUSD > 0, "Price not set");
        // flrAmount * flrPriceUSD = usdAmount
        usdAmount = (flrAmount * flrPriceUSD) / 1e18;
    }

    /**
     * @notice Check if price is stale
     */
    function isPriceStale() external view returns (bool) {
        return block.timestamp > lastUpdated + MAX_STALENESS;
    }
}
