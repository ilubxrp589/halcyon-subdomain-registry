// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface ILabelValidator {
    /// @notice Validates whether a label is acceptable for registration.
    /// @param label The subdomain or TLD label to validate.
    /// @return True if the label is valid (lowercase alphanumeric only, non-empty).
    function isValidLabel(string calldata label) external pure returns (bool);
}
