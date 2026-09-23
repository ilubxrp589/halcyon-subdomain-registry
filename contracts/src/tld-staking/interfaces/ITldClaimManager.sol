// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IWeb2Json} from "@flarenetwork/flare-periphery-contracts/coston2/IWeb2Json.sol";

interface ITldClaimManager {
    // --- Phase 1: Operator minting ---

    /// @notice Mints a single TLD NFT. Only callable by the operator.
    /// @param tldLabel The TLD label (e.g. "cryptofans").
    /// @return tokenId The ID of the newly minted TLD token.
    function operatorMint(string calldata tldLabel) external returns (uint256 tokenId);

    /// @notice Mints multiple TLD NFTs in a batch. Skips invalid/duplicate entries.
    /// @param tldLabels Array of TLD labels to mint.
    /// @return tokenIds Array of token IDs (0 for skipped entries).
    function operatorMintBatch(string[] calldata tldLabels) external returns (uint256[] memory tokenIds);

    // --- Phase 2: FDC-verified staking ---

    /// @notice Requests FDC attestation to verify Handshake TLD ownership.
    /// @param tldLabel The TLD label to stake.
    /// @param abiEncodedRequest Pre-prepared request bytes from the Verifier API.
    function requestStake(string calldata tldLabel, bytes calldata abiEncodedRequest) external payable;

    /// @notice Completes a pending stake by verifying the FDC proof and minting the TLD NFT.
    /// @param tldLabel The TLD label matching the pending claim.
    /// @param proof The FDC Web2Json proof.
    function completeStake(string calldata tldLabel, IWeb2Json.Proof calldata proof) external;

    /// @notice Refunds the staking fee for an expired pending claim.
    /// @param namehash The namehash of the TLD whose claim has expired.
    function refundExpiredStake(bytes32 namehash) external;
}
