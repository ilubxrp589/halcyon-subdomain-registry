// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IGlobalRegistrationRules} from "../interfaces/IGlobalRegistrationRules.sol";
import {ILabelValidator} from "../interfaces/ILabelValidator.sol";

/// @title GlobalRegistrationRules
/// @notice Enforces system-wide registration constraints (minimum price, label validity, year bounds).
contract GlobalRegistrationRules is IGlobalRegistrationRules, Ownable {
    ILabelValidator public labelValidator;
    uint256 public override minimumPriceUsdCents = 100; // $1.00 per year

    error InvalidLabelValidator();
    error InvalidMinimumPrice();

    event MinimumPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event LabelValidatorUpdated(address oldValidator, address newValidator);

    constructor(address _labelValidator, address _owner) Ownable(_owner) {
        if (_labelValidator == address(0)) revert InvalidLabelValidator();
        labelValidator = ILabelValidator(_labelValidator);
    }

    /// @inheritdoc IGlobalRegistrationRules
    function validateRegistration(
        string calldata label,
        uint256 priceUsdCents,
        uint256 durationYears
    ) external view override returns (bool) {
        if (!labelValidator.isValidLabel(label)) return false;
        if (durationYears == 0 || durationYears > 10) return false;
        if (priceUsdCents < minimumPriceUsdCents * durationYears) return false;
        return true;
    }

    /// @notice Updates the minimum price per year in USD cents. Only owner.
    function setMinimumPriceUsdCents(uint256 _newMinimum) external onlyOwner {
        if (_newMinimum == 0) revert InvalidMinimumPrice();
        uint256 old = minimumPriceUsdCents;
        minimumPriceUsdCents = _newMinimum;
        emit MinimumPriceUpdated(old, _newMinimum);
    }

    /// @notice Updates the label validator contract. Only owner.
    function setLabelValidator(address _newValidator) external onlyOwner {
        if (_newValidator == address(0)) revert InvalidLabelValidator();
        address old = address(labelValidator);
        labelValidator = ILabelValidator(_newValidator);
        emit LabelValidatorUpdated(old, _newValidator);
    }
}
