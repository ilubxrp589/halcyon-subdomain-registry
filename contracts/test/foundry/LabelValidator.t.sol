// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {LabelValidator} from "../../src/tld-staking/utils/LabelValidator.sol";

contract LabelValidatorTest is Test {
    LabelValidator public validator;

    function setUp() public {
        validator = new LabelValidator();
    }

    // --- Valid labels ---

    function test_validLabel_singleChar() public view {
        assertTrue(validator.isValidLabel("a"));
    }

    function test_validLabel_singleDigit() public view {
        assertTrue(validator.isValidLabel("0"));
    }

    function test_validLabel_simple() public view {
        assertTrue(validator.isValidLabel("alice"));
    }

    function test_validLabel_alphanumeric() public view {
        assertTrue(validator.isValidLabel("test123"));
    }

    function test_validLabel_mixed() public view {
        assertTrue(validator.isValidLabel("abc123xyz"));
    }

    function test_validLabel_allDigits() public view {
        assertTrue(validator.isValidLabel("12345"));
    }

    function test_validLabel_long() public view {
        assertTrue(validator.isValidLabel("averylongsubdomainlabel"));
    }

    // --- Invalid labels ---

    function test_invalidLabel_empty() public view {
        assertFalse(validator.isValidLabel(""));
    }

    function test_invalidLabel_uppercase() public view {
        assertFalse(validator.isValidLabel("Alice"));
    }

    function test_invalidLabel_allUppercase() public view {
        assertFalse(validator.isValidLabel("ALICE"));
    }

    function test_invalidLabel_hyphen() public view {
        assertFalse(validator.isValidLabel("test-name"));
    }

    function test_invalidLabel_underscore() public view {
        assertFalse(validator.isValidLabel("test_name"));
    }

    function test_invalidLabel_dot() public view {
        assertFalse(validator.isValidLabel("test.name"));
    }

    function test_invalidLabel_space() public view {
        assertFalse(validator.isValidLabel("test name"));
    }

    function test_invalidLabel_specialChars() public view {
        assertFalse(validator.isValidLabel("test@name"));
    }

    function test_invalidLabel_nullByte() public view {
        bytes memory b = new bytes(4);
        b[0] = "t";
        b[1] = "e";
        b[2] = 0x00;
        b[3] = "t";
        assertFalse(validator.isValidLabel(string(b)));
    }

    function test_invalidLabel_unicode() public view {
        // UTF-8 encoded non-ASCII
        assertFalse(validator.isValidLabel(unicode"café"));
    }

    function test_invalidLabel_leadingHyphen() public view {
        assertFalse(validator.isValidLabel("-test"));
    }

    function test_invalidLabel_trailingHyphen() public view {
        assertFalse(validator.isValidLabel("test-"));
    }
}
