// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IPaymentManager} from "../interfaces/IPaymentManager.sol";

/// @title PaymentManagerV2
/// @notice Splits registration payments between TLD owner and platform with per-TLD fee tiers.
///         Default fee is 20% (community TLDs). Operator TLDs can be set to 5%.
///         Uses pull-pattern withdrawals for safety. UUPS-upgradeable.
contract PaymentManagerV2 is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable,
    IPaymentManager
{
    address public platformFeeRecipient;
    uint256 public defaultPlatformFeeBps;
    address public registrationManager;

    /// @notice Per-TLD fee override (in basis points). 0 means use default.
    mapping(bytes32 => uint256) public tldFeeBps;
    /// @notice Whether a per-TLD fee has been explicitly set (needed since 0 bps is valid).
    mapping(bytes32 => bool) public tldFeeSet;

    mapping(address => uint256) public override pendingWithdrawals;

    error OnlyRegistrationManager();
    error ZeroAddress();
    error InvalidFeeBps(uint256 bps);
    error NothingToWithdraw();
    error TransferFailed();

    event PaymentProcessed(
        bytes32 indexed tldNamehash,
        address indexed tldOwner,
        uint256 tldOwnerAmount,
        uint256 platformAmount,
        uint256 priceUsdCents
    );
    event Withdrawn(address indexed account, uint256 amount);
    event DefaultPlatformFeeBpsUpdated(uint256 oldBps, uint256 newBps);
    event TldFeeBpsUpdated(bytes32 indexed tldNamehash, uint256 feeBps);
    event PlatformFeeRecipientUpdated(address oldRecipient, address newRecipient);
    event RegistrationManagerUpdated(address oldManager, address newManager);

    modifier onlyRegistrationManager() {
        if (msg.sender != registrationManager) revert OnlyRegistrationManager();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _platformRecipient,
        uint256 _defaultFeeBps,
        address _owner
    ) external initializer {
        if (_platformRecipient == address(0)) revert ZeroAddress();
        if (_defaultFeeBps > 10000) revert InvalidFeeBps(_defaultFeeBps);

        __Ownable_init(_owner);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        platformFeeRecipient = _platformRecipient;
        defaultPlatformFeeBps = _defaultFeeBps;
    }

    /// @notice Sets the registration manager. Solves circular deploy dependency.
    function setRegistrationManager(address _registrationManager) external onlyOwner {
        if (_registrationManager == address(0)) revert ZeroAddress();
        address old = registrationManager;
        registrationManager = _registrationManager;
        emit RegistrationManagerUpdated(old, _registrationManager);
    }

    /// @notice Set a per-TLD fee override. Use this for operator TLDs (5%) vs default community (20%).
    function setTldFee(bytes32 tldNamehash, uint256 feeBps) external onlyOwner {
        if (feeBps > 10000) revert InvalidFeeBps(feeBps);
        tldFeeBps[tldNamehash] = feeBps;
        tldFeeSet[tldNamehash] = true;
        emit TldFeeBpsUpdated(tldNamehash, feeBps);
    }

    /// @notice Remove per-TLD fee override, reverting to the default.
    function clearTldFee(bytes32 tldNamehash) external onlyOwner {
        delete tldFeeBps[tldNamehash];
        delete tldFeeSet[tldNamehash];
        emit TldFeeBpsUpdated(tldNamehash, defaultPlatformFeeBps);
    }

    /// @notice Batch set per-TLD fees (for operator batch setup).
    function batchSetTldFees(bytes32[] calldata tldNamehashes, uint256 feeBps) external onlyOwner {
        if (feeBps > 10000) revert InvalidFeeBps(feeBps);
        for (uint256 i = 0; i < tldNamehashes.length; i++) {
            tldFeeBps[tldNamehashes[i]] = feeBps;
            tldFeeSet[tldNamehashes[i]] = true;
            emit TldFeeBpsUpdated(tldNamehashes[i], feeBps);
        }
    }

    /// @notice Returns the effective fee for a TLD (per-TLD override or default).
    function getEffectiveFeeBps(bytes32 tldNamehash) external view returns (uint256) {
        return tldFeeSet[tldNamehash] ? tldFeeBps[tldNamehash] : defaultPlatformFeeBps;
    }

    /// @inheritdoc IPaymentManager
    function processPayment(
        bytes32 tldNamehash,
        address tldOwner,
        uint256 priceUsdCents
    ) external payable override onlyRegistrationManager {
        uint256 fee = tldFeeSet[tldNamehash] ? tldFeeBps[tldNamehash] : defaultPlatformFeeBps;
        uint256 platformAmount = (msg.value * fee) / 10000;
        uint256 ownerAmount = msg.value - platformAmount;

        pendingWithdrawals[tldOwner] += ownerAmount;
        pendingWithdrawals[platformFeeRecipient] += platformAmount;

        emit PaymentProcessed(tldNamehash, tldOwner, ownerAmount, platformAmount, priceUsdCents);
    }

    /// @inheritdoc IPaymentManager
    function withdraw() external override nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        pendingWithdrawals[msg.sender] = 0;

        (bool success,) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit Withdrawn(msg.sender, amount);
    }

    function setDefaultPlatformFeeBps(uint256 _newBps) external onlyOwner {
        if (_newBps > 10000) revert InvalidFeeBps(_newBps);
        uint256 old = defaultPlatformFeeBps;
        defaultPlatformFeeBps = _newBps;
        emit DefaultPlatformFeeBpsUpdated(old, _newBps);
    }

    function setPlatformFeeRecipient(address _newRecipient) external onlyOwner {
        if (_newRecipient == address(0)) revert ZeroAddress();
        address old = platformFeeRecipient;
        platformFeeRecipient = _newRecipient;
        emit PlatformFeeRecipientUpdated(old, _newRecipient);
    }

    /// @dev Required by UUPS pattern.
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
