// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {TestBaseOrchestration} from "./helpers/TestBaseOrchestration.sol";
import {DefaultRegistrationStrategy} from "../../src/tld-staking/orchestration/DefaultRegistrationStrategy.sol";

contract DefaultRegistrationStrategyTest is TestBaseOrchestration {
    bytes32 internal tldNamehash;

    function setUp() public override {
        super.setUp();
        (, tldNamehash) = _claimTld("cryptofans");
    }

    // --- Default Length Pricing ---

    function test_defaultPrice_1char() public view {
        // 1-char: $500 = 50000 cents
        uint256 price = strategy.getPriceInUsdCents(alice, tldNamehash, "a", 1, false);
        assertEq(price, 50000);
    }

    function test_defaultPrice_2char() public view {
        // 2-char: $250 = 25000 cents
        uint256 price = strategy.getPriceInUsdCents(alice, tldNamehash, "ab", 1, false);
        assertEq(price, 25000);
    }

    function test_defaultPrice_3char() public view {
        // 3-char: $100 = 10000 cents
        uint256 price = strategy.getPriceInUsdCents(alice, tldNamehash, "abc", 1, false);
        assertEq(price, 10000);
    }

    function test_defaultPrice_4char() public view {
        // 4-char: $5 = 500 cents
        uint256 price = strategy.getPriceInUsdCents(alice, tldNamehash, "abcd", 1, false);
        assertEq(price, 500);
    }

    function test_defaultPrice_5char() public view {
        // 5-char: $2 = 200 cents
        uint256 price = strategy.getPriceInUsdCents(alice, tldNamehash, "abcde", 1, false);
        assertEq(price, 200);
    }

    function test_defaultPrice_6charAndAbove() public view {
        // 6+ char: $1 = 100 cents
        uint256 price6 = strategy.getPriceInUsdCents(alice, tldNamehash, "abcdef", 1, false);
        uint256 price10 = strategy.getPriceInUsdCents(alice, tldNamehash, "abcdefghij", 1, false);
        uint256 price15 = strategy.getPriceInUsdCents(alice, tldNamehash, "abcdefghijklmno", 1, false);
        assertEq(price6, 100);
        assertEq(price10, 100);
        assertEq(price15, 100);
    }

    function test_defaultPrice_multiYear() public view {
        // 5-char at $2/yr * 3 years = $6
        uint256 price = strategy.getPriceInUsdCents(alice, tldNamehash, "abcde", 3, false);
        assertEq(price, 600);
    }

    // --- Renewal returns 0 ---

    function test_renewalReturnsZero() public view {
        uint256 price = strategy.getPriceInUsdCents(alice, tldNamehash, "wallet", 1, true);
        assertEq(price, 0);
    }

    // --- Custom Length Pricing ---

    function test_customLengthPrices() public {
        uint256[10] memory prices = [
            uint256(100000), 50000, 20000, 1000, 500, 300, 200, 200, 200, 200
        ];

        vm.prank(operator); // operator owns the TLD
        strategy.setLengthPrices(tldNamehash, prices);

        assertTrue(strategy.isConfigured(tldNamehash));

        uint256 price1 = strategy.getPriceInUsdCents(alice, tldNamehash, "a", 1, false);
        assertEq(price1, 100000); // $1000

        uint256 price5 = strategy.getPriceInUsdCents(alice, tldNamehash, "abcde", 1, false);
        assertEq(price5, 500); // $5
    }

    function test_setLengthPrices_revertsNonOwner() public {
        uint256[10] memory prices;
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(DefaultRegistrationStrategy.NotTldOwner.selector, tldNamehash, alice));
        strategy.setLengthPrices(tldNamehash, prices);
    }

    // --- Premium Names ---

    function test_premiumName() public {
        string[] memory labels = new string[](2);
        labels[0] = "eth";
        labels[1] = "btc";
        uint256[] memory prices = new uint256[](2);
        prices[0] = 100000; // $1000
        prices[1] = 50000;  // $500

        vm.prank(operator);
        strategy.setPremiumNames(tldNamehash, labels, prices);

        uint256 ethPrice = strategy.getPriceInUsdCents(alice, tldNamehash, "eth", 1, false);
        assertEq(ethPrice, 100000);

        uint256 btcPrice = strategy.getPriceInUsdCents(alice, tldNamehash, "btc", 2, false);
        assertEq(btcPrice, 100000); // 50000 * 2

        // Non-premium name still uses length pricing
        uint256 regPrice = strategy.getPriceInUsdCents(alice, tldNamehash, "abc", 1, false);
        assertEq(regPrice, 10000); // 3-char default
    }

    function test_setPremiumNames_revertsArrayMismatch() public {
        string[] memory labels = new string[](2);
        labels[0] = "eth";
        labels[1] = "btc";
        uint256[] memory prices = new uint256[](1);
        prices[0] = 100000;

        vm.prank(operator);
        vm.expectRevert(DefaultRegistrationStrategy.ArrayLengthMismatch.selector);
        strategy.setPremiumNames(tldNamehash, labels, prices);
    }

    // --- Reserved Names ---

    function test_reservedName_freeForDesignatedWallet() public {
        string[] memory labels = new string[](1);
        labels[0] = "admin";
        address[] memory wallets = new address[](1);
        wallets[0] = alice;

        vm.prank(operator);
        strategy.setReservedNames(tldNamehash, labels, wallets);

        // Free for alice
        uint256 price = strategy.getPriceInUsdCents(alice, tldNamehash, "admin", 1, false);
        assertEq(price, 0);
    }

    function test_reservedName_revertsForOther() public {
        string[] memory labels = new string[](1);
        labels[0] = "admin";
        address[] memory wallets = new address[](1);
        wallets[0] = alice;

        vm.prank(operator);
        strategy.setReservedNames(tldNamehash, labels, wallets);

        // Reverts for bob
        vm.expectRevert(
            abi.encodeWithSelector(DefaultRegistrationStrategy.ReservedForOther.selector, "admin", tldNamehash)
        );
        strategy.getPriceInUsdCents(bob, tldNamehash, "admin", 1, false);
    }

    // --- Multi-Year Discounts ---

    function test_multiYearDiscount() public {
        // Set 20% discount for 3-year registrations (index 2)
        uint256[10] memory discounts;
        discounts[2] = 2000; // 20% for 3-year

        vm.prank(operator);
        strategy.setMultiYearDiscounts(tldNamehash, discounts);

        // 5-char label at $2/yr * 3 years = $6 base, minus 20% = $4.80 = 480 cents
        uint256 price = strategy.getPriceInUsdCents(alice, tldNamehash, "abcde", 3, false);
        assertEq(price, 480);
    }

    function test_noDiscount_singleYear() public {
        uint256[10] memory discounts;
        discounts[0] = 1000; // index 0 is for 1-year, but discount only applies for multi-year

        vm.prank(operator);
        strategy.setMultiYearDiscounts(tldNamehash, discounts);

        // Single year — no discount applied (durationYears == 1 skip)
        uint256 price = strategy.getPriceInUsdCents(alice, tldNamehash, "abcde", 1, false);
        assertEq(price, 200); // $2 base, no discount
    }

    // --- View Helpers ---

    function test_getLengthPrices_returnsDefault() public view {
        uint256[10] memory prices = strategy.getLengthPrices(tldNamehash);
        assertEq(prices[0], 50000); // $500 for 1-char
        assertEq(prices[9], 100);   // $1 for 10+ char
    }

    function test_getPremiumPrice() public {
        string[] memory labels = new string[](1);
        labels[0] = "eth";
        uint256[] memory prices = new uint256[](1);
        prices[0] = 100000;

        vm.prank(operator);
        strategy.setPremiumNames(tldNamehash, labels, prices);

        assertEq(strategy.getPremiumPrice(tldNamehash, "eth"), 100000);
        assertEq(strategy.getPremiumPrice(tldNamehash, "notset"), 0);
    }

    function test_getReservedAddress() public {
        string[] memory labels = new string[](1);
        labels[0] = "admin";
        address[] memory wallets = new address[](1);
        wallets[0] = alice;

        vm.prank(operator);
        strategy.setReservedNames(tldNamehash, labels, wallets);

        assertEq(strategy.getReservedAddress(tldNamehash, "admin"), alice);
        assertEq(strategy.getReservedAddress(tldNamehash, "notset"), address(0));
    }
}
