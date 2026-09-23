// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {TestBase} from "./helpers/TestBase.sol";
import {GlobalRegistrationRules} from "../../src/tld-staking/utils/GlobalRegistrationRules.sol";

contract GlobalRegistrationRulesTest is TestBase {
    // --- Valid registrations ---

    function test_validateRegistration_valid() public view {
        // "alice", $5/year for 1 year = 500 cents, min is 100/year
        assertTrue(globalRules.validateRegistration("alice", 500, 1));
    }

    function test_validateRegistration_multiYear() public view {
        // "bob", $2/year for 3 years = 600 cents, min is 300
        assertTrue(globalRules.validateRegistration("bob", 600, 3));
    }

    function test_validateRegistration_exactMinimum() public view {
        // Exact minimum: 100 cents/year * 1 year = 100
        assertTrue(globalRules.validateRegistration("test", 100, 1));
    }

    function test_validateRegistration_tenYears() public view {
        assertTrue(globalRules.validateRegistration("test", 1000, 10));
    }

    // --- Invalid labels ---

    function test_validateRegistration_invalidLabel() public view {
        assertFalse(globalRules.validateRegistration("INVALID", 500, 1));
    }

    function test_validateRegistration_emptyLabel() public view {
        assertFalse(globalRules.validateRegistration("", 500, 1));
    }

    function test_validateRegistration_hyphenLabel() public view {
        assertFalse(globalRules.validateRegistration("test-name", 500, 1));
    }

    // --- Invalid price ---

    function test_validateRegistration_priceBelowMinimum() public view {
        // Min is 100/year, sending 99 for 1 year
        assertFalse(globalRules.validateRegistration("test", 99, 1));
    }

    function test_validateRegistration_priceBelowMinimumMultiYear() public view {
        // Min is 100/year * 3 years = 300, sending 299
        assertFalse(globalRules.validateRegistration("test", 299, 3));
    }

    // --- Invalid years ---

    function test_validateRegistration_zeroYears() public view {
        assertFalse(globalRules.validateRegistration("test", 500, 0));
    }

    function test_validateRegistration_elevenYears() public view {
        assertFalse(globalRules.validateRegistration("test", 5000, 11));
    }

    // --- Owner functions ---

    function test_setMinimumPriceUsdCents() public {
        vm.prank(owner);
        globalRules.setMinimumPriceUsdCents(200);
        assertEq(globalRules.minimumPriceUsdCents(), 200);

        // Old minimum (100) no longer valid
        assertFalse(globalRules.validateRegistration("test", 100, 1));
        // New minimum works
        assertTrue(globalRules.validateRegistration("test", 200, 1));
    }

    function test_setMinimumPriceUsdCents_revertsZero() public {
        vm.prank(owner);
        vm.expectRevert(GlobalRegistrationRules.InvalidMinimumPrice.selector);
        globalRules.setMinimumPriceUsdCents(0);
    }

    function test_setMinimumPriceUsdCents_nonOwnerReverts() public {
        vm.prank(alice);
        vm.expectRevert();
        globalRules.setMinimumPriceUsdCents(200);
    }

    function test_setLabelValidator() public {
        address newValidator = makeAddr("newValidator");
        vm.prank(owner);
        globalRules.setLabelValidator(newValidator);
        assertEq(address(globalRules.labelValidator()), newValidator);
    }

    function test_setLabelValidator_revertsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(GlobalRegistrationRules.InvalidLabelValidator.selector);
        globalRules.setLabelValidator(address(0));
    }

    function test_setLabelValidator_nonOwnerReverts() public {
        vm.prank(alice);
        vm.expectRevert();
        globalRules.setLabelValidator(makeAddr("new"));
    }

    function test_constructor_revertsZeroValidator() public {
        vm.expectRevert(GlobalRegistrationRules.InvalidLabelValidator.selector);
        new GlobalRegistrationRules(address(0), owner);
    }
}
