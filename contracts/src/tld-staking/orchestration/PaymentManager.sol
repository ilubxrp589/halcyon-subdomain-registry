// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPaymentManager} from "../interfaces/IPaymentManager.sol";

/// @title PaymentManager
/// @notice Splits registration payments between TLD owner (95%) and platform (5%).
///         Uses pull-pattern withdrawals for safety.
contract PaymentManager is Ownable, ReentrancyGuard, IPaymentManager {
    address public platformFeeRecipient;
    uint256 public platformFeeBps;
    address public registrationManager;

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
    event PlatformFeeBpsUpdated(uint256 oldBps, uint256 newBps);
    event PlatformFeeRecipientUpdated(address oldRecipient, address newRecipient);
    event RegistrationManagerUpdated(address oldManager, address newManager);

    modifier onlyRegistrationManager() {
        if (msg.sender != registrationManager) revert OnlyRegistrationManager();
        _;
    }

    constructor(
        address _platformRecipient,
        uint256 _feeBps,
        address _owner
    ) Ownable(_owner) {
        if (_platformRecipient == address(0)) revert ZeroAddress();
        if (_feeBps > 10000) revert InvalidFeeBps(_feeBps);
        platformFeeRecipient = _platformRecipient;
        platformFeeBps = _feeBps;
    }

    /// @notice Sets the registration manager. Solves circular deploy dependency.
    function setRegistrationManager(address _registrationManager) external onlyOwner {
        if (_registrationManager == address(0)) revert ZeroAddress();
        address old = registrationManager;
        registrationManager = _registrationManager;
        emit RegistrationManagerUpdated(old, _registrationManager);
    }

    /// @inheritdoc IPaymentManager
    function processPayment(
        bytes32 tldNamehash,
        address tldOwner,
        uint256 priceUsdCents
    ) external payable override onlyRegistrationManager {
        uint256 platformAmount = (msg.value * platformFeeBps) / 10000;
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

    function setPlatformFeeBps(uint256 _newBps) external onlyOwner {
        if (_newBps > 10000) revert InvalidFeeBps(_newBps);
        uint256 old = platformFeeBps;
        platformFeeBps = _newBps;
        emit PlatformFeeBpsUpdated(old, _newBps);
    }

    function setPlatformFeeRecipient(address _newRecipient) external onlyOwner {
        if (_newRecipient == address(0)) revert ZeroAddress();
        address old = platformFeeRecipient;
        platformFeeRecipient = _newRecipient;
        emit PlatformFeeRecipientUpdated(old, _newRecipient);
    }
}
