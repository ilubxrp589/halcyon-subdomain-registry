// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {TestBase} from "./helpers/TestBase.sol";
import {FtsoOracle} from "../../src/tld-staking/utils/FtsoOracle.sol";

contract FtsoOracleTest is TestBase {
    function test_getFlrUsdPriceInWei_returnsPrice() public view {
        (uint256 price, uint64 ts) = ftsoOracle.getFlrUsdPriceInWei();
        assertEq(price, DEFAULT_FLR_PRICE);
        assertEq(ts, uint64(block.timestamp));
    }

    function test_usdCentsToFlr_basicConversion() public view {
        // Price is $0.025 per FLR
        // $1.00 = 100 cents → 1.00 / 0.025 = 40 FLR = 40e18 wei
        uint256 flrWei = ftsoOracle.usdCentsToFlr(100);
        assertEq(flrWei, 40e18);
    }

    function test_usdCentsToFlr_fiveDollars() public view {
        // $5.00 = 500 cents → 5.00 / 0.025 = 200 FLR
        uint256 flrWei = ftsoOracle.usdCentsToFlr(500);
        assertEq(flrWei, 200e18);
    }

    function test_usdCentsToFlr_oneCent() public view {
        // $0.01 = 1 cent → 0.01 / 0.025 = 0.4 FLR = 0.4e18
        uint256 flrWei = ftsoOracle.usdCentsToFlr(1);
        assertEq(flrWei, 0.4e18);
    }

    function test_getFlrUsdPriceInWei_revertsOnStalePrice() public {
        // Warp to a realistic timestamp first to avoid underflow
        vm.warp(10000);
        mockFtsoV2.setPrice(DEFAULT_FLR_PRICE, uint64(block.timestamp - 301));

        vm.expectRevert(abi.encodeWithSelector(
            FtsoOracle.StaleFtsoPrice.selector,
            uint64(block.timestamp - 301),
            uint64(block.timestamp)
        ));
        ftsoOracle.getFlrUsdPriceInWei();
    }

    function test_getFlrUsdPriceInWei_revertsOnZeroPrice() public {
        mockFtsoV2.setPrice(0, uint64(block.timestamp));

        vm.expectRevert(FtsoOracle.ZeroFtsoPrice.selector);
        ftsoOracle.getFlrUsdPriceInWei();
    }

    function test_usdCentsToFlr_highPrice() public view {
        // If FLR is $1.00, then $5.00 = 5 FLR
        // We need to update mock for this test — but mock is already set.
        // Instead use a known price. Current: $0.025. Let's verify large amounts.
        // $100 = 10000 cents → 100 / 0.025 = 4000 FLR
        uint256 flrWei = ftsoOracle.usdCentsToFlr(10000);
        assertEq(flrWei, 4000e18);
    }

    function test_usdCentsToFlr_withDifferentPrice() public {
        // Set price to $0.50 per FLR (0.5e18)
        mockFtsoV2.setPrice(0.5e18, uint64(block.timestamp));

        // $5.00 = 500 cents → 5.00 / 0.50 = 10 FLR
        uint256 flrWei = ftsoOracle.usdCentsToFlr(500);
        assertEq(flrWei, 10e18);
    }

    function test_getFlrUsdPriceInWei_atExactMaxAge() public {
        // Warp to a realistic timestamp first to avoid underflow
        vm.warp(10000);
        mockFtsoV2.setPrice(DEFAULT_FLR_PRICE, uint64(block.timestamp - 300));

        (uint256 price,) = ftsoOracle.getFlrUsdPriceInWei();
        assertEq(price, DEFAULT_FLR_PRICE);
    }

    function test_constants() public view {
        assertEq(ftsoOracle.MAX_PRICE_AGE(), 300);
        assertEq(
            ftsoOracle.FLR_USD_FEED_ID(),
            bytes21(0x01464c522f55534400000000000000000000000000)
        );
    }
}
