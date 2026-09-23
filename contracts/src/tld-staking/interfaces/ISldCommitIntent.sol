// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface ISldCommitIntent {
    /// @notice Stores a commit hash for the commit-reveal anti-frontrunning scheme.
    /// @param commitHash The keccak256(abi.encodePacked(label, parentNamehash, sender, secret)).
    function commit(bytes32 commitHash) external;

    /// @notice Returns whether a commit can be revealed (within the valid timing window).
    /// @param commitHash The commit hash to check.
    /// @return True if the commit is old enough and not yet expired.
    function canReveal(bytes32 commitHash) external view returns (bool);

    /// @notice Consumes (deletes) a commit after successful reveal. Only callable by registration manager.
    /// @param commitHash The commit hash to consume.
    function consumeCommit(bytes32 commitHash) external;

    /// @notice Returns the block number at which a commit was made.
    /// @param commitHash The commit hash to look up.
    /// @return The block number, or 0 if not found.
    function getCommitBlock(bytes32 commitHash) external view returns (uint256);
}
