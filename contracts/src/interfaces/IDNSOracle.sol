// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IDNSOracle
 * @notice Interface for Handshake DNS oracle
 */
interface IDNSOracle {
    /**
     * @notice Request DNS registration for a subdomain
     * @param escrowId The escrow ID from the escrow contract
     * @param tokenId The NFT token ID
     * @param tld The top-level domain
     * @param subdomain The subdomain name
     * @param owner The address that will own the subdomain
     */
    function requestDNSRegistration(
        uint256 escrowId,
        uint256 tokenId,
        string calldata tld,
        string calldata subdomain,
        address owner
    ) external;

    /**
     * @notice Check if a subdomain is verified
     * @param tld The top-level domain
     * @param subdomain The subdomain name
     * @return Whether the subdomain DNS is verified
     */
    function isVerified(string calldata tld, string calldata subdomain) external view returns (bool);
}
