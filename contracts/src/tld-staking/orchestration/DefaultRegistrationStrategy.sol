// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IRegistrationStrategy} from "../interfaces/IRegistrationStrategy.sol";
import {IHsrTld} from "../interfaces/IHsrTld.sol";

/// @title DefaultRegistrationStrategy
/// @notice Per-TLD configurable pricing engine with length-based pricing,
///         premium names, reserved names, and multi-year discounts.
contract DefaultRegistrationStrategy is IRegistrationStrategy {
    IHsrTld public immutable hsrTld;

    /// @notice Length-based prices per TLD in USD cents. Index 0=1-char ... 9=10+ chars.
    mapping(bytes32 => uint256[10]) private _lengthPrices;

    /// @notice Premium name prices per TLD. Key: keccak256(bytes(label)).
    mapping(bytes32 => mapping(bytes32 => uint256)) private _premiumNames;

    /// @notice Reserved names per TLD. Key: keccak256(bytes(label)) → whitelisted address.
    mapping(bytes32 => mapping(bytes32 => address)) private _reservedNames;

    /// @notice Multi-year discount basis points per TLD. Index = additional years (0=1yr, 1=2yr, etc.).
    mapping(bytes32 => uint256[10]) private _multiYearDiscounts;

    /// @notice Whether a TLD has been configured with custom prices.
    mapping(bytes32 => bool) public isConfigured;

    /// @notice Default prices for unconfigured TLDs (USD cents).
    /// [0]=1-char $500, [1]=2-char $250, [2]=3-char $100, [3]=4-char $5,
    /// [4]=5-char $2, [5-9]=6+ char $1
    uint256[10] public defaultLengthPrices = [
        uint256(50000), 25000, 10000, 500, 200, 100, 100, 100, 100, 100
    ];

    error NotTldOwner(bytes32 namehash, address caller);
    error ReservedForOther(string label, bytes32 tldNamehash);
    error ArrayLengthMismatch();

    event LengthPricesSet(bytes32 indexed tldNamehash);
    event PremiumNameSet(bytes32 indexed tldNamehash, string label, uint256 priceUsdCents);
    event ReservedNameSet(bytes32 indexed tldNamehash, string label, address wallet);
    event MultiYearDiscountsSet(bytes32 indexed tldNamehash);

    modifier onlyTldOwner(bytes32 namehash) {
        if (hsrTld.ownerOfNamehash(namehash) != msg.sender) revert NotTldOwner(namehash, msg.sender);
        _;
    }

    constructor(address _hsrTld) {
        hsrTld = IHsrTld(_hsrTld);
    }

    /// @inheritdoc IRegistrationStrategy
    function getPriceInUsdCents(
        address buyer,
        bytes32 tldNamehash,
        string calldata label,
        uint256 durationYears,
        bool isRenewal
    ) external view override returns (uint256 priceUsdCents) {
        // Renewals use the stored price lock — return 0 so the RegistrationManager handles it
        if (isRenewal) return 0;

        bytes32 labelHash = keccak256(bytes(label));

        // 1. Check reserved names
        address reservedFor = _reservedNames[tldNamehash][labelHash];
        if (reservedFor != address(0)) {
            if (reservedFor != buyer) revert ReservedForOther(label, tldNamehash);
            return 0; // Reserved names are free for the designated wallet
        }

        // 2. Check premium names
        uint256 premiumPrice = _premiumNames[tldNamehash][labelHash];
        uint256 annualPrice;
        if (premiumPrice > 0) {
            annualPrice = premiumPrice;
        } else {
            // 3. Length-based pricing
            uint256 len = bytes(label).length;
            uint256 index = len > 0 ? len - 1 : 0;
            if (index > 9) index = 9;

            if (isConfigured[tldNamehash]) {
                annualPrice = _lengthPrices[tldNamehash][index];
            } else {
                annualPrice = defaultLengthPrices[index];
            }
        }

        // 4. Calculate total
        priceUsdCents = annualPrice * durationYears;

        // 5. Apply multi-year discount if applicable
        if (durationYears > 1) {
            uint256 discountIndex = durationYears - 1;
            if (discountIndex > 9) discountIndex = 9;
            uint256 discountBps = _multiYearDiscounts[tldNamehash][discountIndex];
            if (discountBps > 0) {
                priceUsdCents = priceUsdCents * (10000 - discountBps) / 10000;
            }
        }
    }

    // --- Configuration (TLD owner only) ---

    function setLengthPrices(bytes32 tldNamehash, uint256[10] calldata prices) external onlyTldOwner(tldNamehash) {
        _lengthPrices[tldNamehash] = prices;
        isConfigured[tldNamehash] = true;
        emit LengthPricesSet(tldNamehash);
    }

    function setPremiumNames(
        bytes32 tldNamehash,
        string[] calldata labels,
        uint256[] calldata prices
    ) external onlyTldOwner(tldNamehash) {
        if (labels.length != prices.length) revert ArrayLengthMismatch();
        for (uint256 i; i < labels.length; i++) {
            _premiumNames[tldNamehash][keccak256(bytes(labels[i]))] = prices[i];
            emit PremiumNameSet(tldNamehash, labels[i], prices[i]);
        }
    }

    function setReservedNames(
        bytes32 tldNamehash,
        string[] calldata labels,
        address[] calldata wallets
    ) external onlyTldOwner(tldNamehash) {
        if (labels.length != wallets.length) revert ArrayLengthMismatch();
        for (uint256 i; i < labels.length; i++) {
            _reservedNames[tldNamehash][keccak256(bytes(labels[i]))] = wallets[i];
            emit ReservedNameSet(tldNamehash, labels[i], wallets[i]);
        }
    }

    function setMultiYearDiscounts(bytes32 tldNamehash, uint256[10] calldata discounts)
        external
        onlyTldOwner(tldNamehash)
    {
        _multiYearDiscounts[tldNamehash] = discounts;
        emit MultiYearDiscountsSet(tldNamehash);
    }

    // --- View helpers ---

    function getLengthPrices(bytes32 tldNamehash) external view returns (uint256[10] memory) {
        if (isConfigured[tldNamehash]) {
            return _lengthPrices[tldNamehash];
        }
        return defaultLengthPrices;
    }

    function getPremiumPrice(bytes32 tldNamehash, string calldata label) external view returns (uint256) {
        return _premiumNames[tldNamehash][keccak256(bytes(label))];
    }

    function getReservedAddress(bytes32 tldNamehash, string calldata label) external view returns (address) {
        return _reservedNames[tldNamehash][keccak256(bytes(label))];
    }

    function getMultiYearDiscounts(bytes32 tldNamehash) external view returns (uint256[10] memory) {
        return _multiYearDiscounts[tldNamehash];
    }
}
