// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ILabelValidator} from "../interfaces/ILabelValidator.sol";

/// @title LabelValidator
/// @notice Pure validation for subdomain and TLD labels.
/// @dev Accepts only lowercase ASCII alphanumeric characters (a-z, 0-9).
///      No hyphens, underscores, dots, unicode, or null bytes.
contract LabelValidator is ILabelValidator {
    /// @inheritdoc ILabelValidator
    function isValidLabel(string calldata label) external pure override returns (bool) {
        bytes memory b = bytes(label);
        uint256 len = b.length;

        if (len == 0) return false;

        for (uint256 i; i < len;) {
            uint8 c = uint8(b[i]);
            // Only allow 0-9 (0x30-0x39) and a-z (0x61-0x7a)
            if (!((c >= 0x30 && c <= 0x39) || (c >= 0x61 && c <= 0x7a))) {
                return false;
            }
            unchecked { ++i; }
        }

        return true;
    }
}
