// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {TestFtsoV2Interface} from "@flarenetwork/flare-periphery-contracts/coston2/TestFtsoV2Interface.sol";
import {IFlareContractRegistry} from "@flarenetwork/flare-periphery-contracts/coston2/IFlareContractRegistry.sol";

/// @title MockTestFtsoV2
/// @notice Mock FTSO v2 for testing. Only implements getFeedByIdInWei.
contract MockTestFtsoV2 {
    uint256 public mockPriceWei;
    uint64 public mockTimestamp;

    function setPrice(uint256 _price, uint64 _timestamp) external {
        mockPriceWei = _price;
        mockTimestamp = _timestamp;
    }

    function getFeedByIdInWei(bytes21) external view returns (uint256 _value, uint64 _timestamp) {
        return (mockPriceWei, mockTimestamp);
    }

    // Stubs for other interface methods (not used by FtsoOracle)
    function getFtsoProtocolId() external pure returns (uint256) { return 100; }
    function getSupportedFeedIds() external pure returns (bytes21[] memory) { return new bytes21[](0); }
    function getFeedIdChanges() external pure returns (TestFtsoV2Interface.FeedIdChange[] memory) {
        return new TestFtsoV2Interface.FeedIdChange[](0);
    }
    function calculateFeeById(bytes21) external pure returns (uint256) { return 0; }
    function calculateFeeByIds(bytes21[] memory) external pure returns (uint256) { return 0; }
    function getFeedById(bytes21) external pure returns (uint256, int8, uint64) { return (0, 0, 0); }
    function getFeedsById(bytes21[] memory) external pure returns (uint256[] memory, int8[] memory, uint64) {
        return (new uint256[](0), new int8[](0), 0);
    }
    function getFeedsByIdInWei(bytes21[] memory) external pure returns (uint256[] memory, uint64) {
        return (new uint256[](0), 0);
    }
    function verifyFeedData(TestFtsoV2Interface.FeedDataWithProof calldata) external pure returns (bool) {
        return false;
    }
}

/// @title MockFlareContractRegistry
/// @notice Mock registry that returns addresses by name hash.
///         Supports multiple contract names (FtsoV2, FdcHub, FdcVerification, etc.).
contract MockFlareContractRegistry is IFlareContractRegistry {
    mapping(bytes32 => address) public contractAddresses;

    function register(string memory _name, address _address) external {
        contractAddresses[keccak256(abi.encode(_name))] = _address;
    }

    function getContractAddressByName(string calldata _name) external view override returns (address) {
        return contractAddresses[keccak256(abi.encode(_name))];
    }

    function getContractAddressByHash(bytes32 _hash) external view override returns (address) {
        return contractAddresses[_hash];
    }

    function getContractAddressesByName(string[] calldata _names) external view override returns (address[] memory result) {
        result = new address[](_names.length);
        for (uint256 i; i < _names.length; i++) {
            result[i] = contractAddresses[keccak256(abi.encode(_names[i]))];
        }
    }

    function getContractAddressesByHash(bytes32[] calldata _nameHashes) external view override returns (address[] memory result) {
        result = new address[](_nameHashes.length);
        for (uint256 i; i < _nameHashes.length; i++) {
            result[i] = contractAddresses[_nameHashes[i]];
        }
    }

    function getAllContracts() external pure override returns (string[] memory _names, address[] memory _addresses) {
        _names = new string[](0);
        _addresses = new address[](0);
    }
}
