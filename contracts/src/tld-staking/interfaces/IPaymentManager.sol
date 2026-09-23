// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IPaymentManager {
    /// @notice Processes a payment by splitting it between TLD owner and platform.
    ///         Only callable by the registration manager.
    /// @param tldNamehash The namehash of the TLD receiving payment.
    /// @param tldOwner The address of the TLD owner.
    /// @param priceUsdCents The price in USD cents (for event logging only; msg.value is the actual FLR).
    function processPayment(bytes32 tldNamehash, address tldOwner, uint256 priceUsdCents) external payable;

    /// @notice Withdraws accumulated pending balance for the caller.
    function withdraw() external;

    /// @notice Returns the pending withdrawal balance for an address.
    function pendingWithdrawals(address account) external view returns (uint256);
}
