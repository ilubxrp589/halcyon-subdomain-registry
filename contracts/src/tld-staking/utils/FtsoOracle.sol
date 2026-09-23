// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IFtsoOracle} from "../interfaces/IFtsoOracle.sol";
import {ContractRegistry} from "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";
import {TestFtsoV2Interface} from "@flarenetwork/flare-periphery-contracts/coston2/TestFtsoV2Interface.sol";

/// @title FtsoOracle
/// @notice Wraps Flare FTSO v2 to provide FLR/USD pricing for HSR.
/// @dev Uses TestFtsoV2Interface on Coston2 (all reads free).
///      For mainnet, swap to FtsoV2Interface via ContractRegistry.getFtsoV2().
contract FtsoOracle is IFtsoOracle {
    /// @notice FLR/USD feed ID: category 0x01 (crypto) + "FLR/USD" UTF-8 + zero padding.
    bytes21 public constant FLR_USD_FEED_ID = 0x01464c522f55534400000000000000000000000000;

    /// @notice Maximum age (in seconds) for a price to be considered fresh.
    uint256 public constant MAX_PRICE_AGE = 300;

    error StaleFtsoPrice(uint64 priceTimestamp, uint256 currentTimestamp);
    error ZeroFtsoPrice();

    /// @inheritdoc IFtsoOracle
    function getFlrUsdPriceInWei() public view override returns (uint256 priceWei, uint64 timestamp) {
        TestFtsoV2Interface ftsoV2 = ContractRegistry.getTestFtsoV2();
        (priceWei, timestamp) = ftsoV2.getFeedByIdInWei(FLR_USD_FEED_ID);

        if (priceWei == 0) revert ZeroFtsoPrice();
        if (block.timestamp - timestamp > MAX_PRICE_AGE) {
            revert StaleFtsoPrice(timestamp, uint64(block.timestamp));
        }
    }

    /// @inheritdoc IFtsoOracle
    function usdCentsToFlr(uint256 usdCents) external view override returns (uint256 flrWei) {
        (uint256 priceWei,) = getFlrUsdPriceInWei();
        // priceWei = FLR/USD price with 18 decimals (i.e. how many USD-wei per 1 FLR)
        // We want: flrWei = (usdCents / 100) * 1e18 / (priceWei / 1e18)
        //        = usdCents * 1e18 * 1e18 / (priceWei * 100)
        flrWei = (usdCents * 1e36) / (priceWei * 100);
    }
}
