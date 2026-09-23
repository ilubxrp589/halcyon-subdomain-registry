// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// Custom composite interface for WNat interactions.
// The official @flarenetwork/flare-periphery-contracts IWNat only covers deposit/withdraw.
// WNat on Flare also implements IVPToken (delegation) and IERC20 (balanceOf, transfer).
// This interface combines the methods CommunityTreasury.sol needs from all three.
//
// Official interfaces available at:
//   @flarenetwork/flare-periphery-contracts/coston2/IWNat.sol     (deposit/withdraw)
//   @flarenetwork/flare-periphery-contracts/coston2/IVPToken.sol  (delegate/undelegateAll)
//   IERC20 from OpenZeppelin                                       (balanceOf/transfer)

interface IWNat {
    // From IWNat
    function deposit() external payable;
    function withdraw(uint256 _amount) external;

    // From IVPToken
    function delegate(address _to, uint256 _bips) external;
    function undelegateAll() external;
    function delegatesOf(address _owner) external view returns (address[] memory, uint256[] memory, uint256, uint256);

    // From IERC20
    function balanceOf(address _owner) external view returns (uint256);
    function transfer(address _to, uint256 _value) external returns (bool);
}
