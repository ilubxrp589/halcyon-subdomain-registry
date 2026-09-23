// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ISldCommitIntent} from "../interfaces/ISldCommitIntent.sol";

/// @title SldCommitIntent
/// @notice Anti-frontrunning commit-reveal scheme for SLD registrations.
/// @dev Uses block.number (not block.timestamp) for timing to prevent miner manipulation.
///      Commit hash = keccak256(abi.encodePacked(label, parentNamehash, msg.sender, secret))
contract SldCommitIntent is Ownable, ISldCommitIntent {
    /// @notice Minimum number of blocks between commit and reveal.
    uint256 public constant MIN_COMMIT_AGE = 8;

    /// @notice Maximum number of blocks before a commit expires (~2 days at 12s blocks).
    uint256 public constant MAX_COMMIT_AGE = 17280;

    mapping(bytes32 => uint256) private _commitBlocks;
    address public registrationManager;

    error OnlyRegistrationManager();
    error CommitAlreadyExists(bytes32 commitHash);
    error CommitTooNew(bytes32 commitHash);
    error CommitExpiredOrMissing(bytes32 commitHash);
    error ZeroAddress();

    event Committed(bytes32 indexed commitHash, address indexed sender, uint256 blockNumber);
    event CommitConsumed(bytes32 indexed commitHash);
    event RegistrationManagerUpdated(address oldManager, address newManager);

    modifier onlyRegistrationManager() {
        if (msg.sender != registrationManager) revert OnlyRegistrationManager();
        _;
    }

    constructor(address _owner) Ownable(_owner) {}

    /// @notice Sets the registration manager. Solves circular deploy dependency.
    function setRegistrationManager(address _registrationManager) external onlyOwner {
        if (_registrationManager == address(0)) revert ZeroAddress();
        address old = registrationManager;
        registrationManager = _registrationManager;
        emit RegistrationManagerUpdated(old, _registrationManager);
    }

    /// @inheritdoc ISldCommitIntent
    function commit(bytes32 commitHash) external override {
        uint256 existing = _commitBlocks[commitHash];
        if (existing != 0) {
            // Allow overwrite only if expired
            uint256 age = block.number - existing;
            if (age <= MAX_COMMIT_AGE) revert CommitAlreadyExists(commitHash);
        }

        _commitBlocks[commitHash] = block.number;
        emit Committed(commitHash, msg.sender, block.number);
    }

    /// @inheritdoc ISldCommitIntent
    function canReveal(bytes32 commitHash) external view override returns (bool) {
        uint256 commitBlock = _commitBlocks[commitHash];
        if (commitBlock == 0) return false;
        uint256 age = block.number - commitBlock;
        return age >= MIN_COMMIT_AGE && age <= MAX_COMMIT_AGE;
    }

    /// @inheritdoc ISldCommitIntent
    function consumeCommit(bytes32 commitHash) external override onlyRegistrationManager {
        uint256 commitBlock = _commitBlocks[commitHash];
        if (commitBlock == 0) revert CommitExpiredOrMissing(commitHash);

        uint256 age = block.number - commitBlock;
        if (age < MIN_COMMIT_AGE) revert CommitTooNew(commitHash);
        if (age > MAX_COMMIT_AGE) revert CommitExpiredOrMissing(commitHash);

        delete _commitBlocks[commitHash];
        emit CommitConsumed(commitHash);
    }

    /// @inheritdoc ISldCommitIntent
    function getCommitBlock(bytes32 commitHash) external view override returns (uint256) {
        return _commitBlocks[commitHash];
    }
}
