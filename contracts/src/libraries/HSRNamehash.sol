// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title HSRNamehash
 * @author Halcyon Registry
 * @notice Library for computing ENS-compatible namehash for HSR domains
 * @dev Implements EIP-137 namehash algorithm for subdomain.tld format
 *
 * Namehash is computed recursively:
 *   namehash("") = 0x0000...0000 (32 zero bytes)
 *   namehash("label.domain") = keccak256(namehash("domain") + keccak256("label"))
 *
 * Example: namehash("alice.cryptofans")
 *   = keccak256(namehash("cryptofans") + keccak256("alice"))
 *   = keccak256(keccak256(namehash("") + keccak256("cryptofans")) + keccak256("alice"))
 */
library HSRNamehash {
    /**
     * @notice Compute the namehash for a fully qualified domain name
     * @param fqdn The fully qualified domain name (e.g., "alice.cryptofans")
     * @return The 32-byte namehash
     */
    function namehash(string memory fqdn) internal pure returns (bytes32) {
        return namehashFromBytes(bytes(fqdn));
    }

    /**
     * @notice Compute the namehash from bytes
     * @param fqdnBytes The FQDN as bytes
     * @return node The computed namehash
     */
    function namehashFromBytes(bytes memory fqdnBytes) internal pure returns (bytes32 node) {
        if (fqdnBytes.length == 0) {
            return bytes32(0);
        }

        // Find labels by splitting on '.'
        uint256 labelCount = 1;
        for (uint256 i = 0; i < fqdnBytes.length; i++) {
            if (fqdnBytes[i] == ".") {
                labelCount++;
            }
        }

        // Extract labels into array (in reverse order for namehash computation)
        bytes[] memory labels = new bytes[](labelCount);
        uint256 labelIndex = labelCount - 1;
        uint256 start = 0;

        for (uint256 i = 0; i < fqdnBytes.length; i++) {
            if (fqdnBytes[i] == ".") {
                labels[labelIndex] = _slice(fqdnBytes, start, i);
                labelIndex--;
                start = i + 1;
            }
        }
        // Last label
        labels[0] = _slice(fqdnBytes, start, fqdnBytes.length);

        // Compute namehash: start from TLD and work up
        node = bytes32(0);
        for (uint256 i = 0; i < labels.length; i++) {
            bytes32 labelHash = keccak256(labels[i]);
            node = keccak256(abi.encodePacked(node, labelHash));
        }

        return node;
    }

    /**
     * @notice Compute namehash for subdomain.tld format (most common HSR case)
     * @param subdomain The subdomain part (e.g., "alice")
     * @param tld The top-level domain (e.g., "cryptofans")
     * @return The computed namehash
     */
    function namehashSubdomain(
        string memory subdomain,
        string memory tld
    ) internal pure returns (bytes32) {
        // namehash(subdomain.tld) = keccak256(namehash(tld) + keccak256(subdomain))
        bytes32 tldHash = keccak256(abi.encodePacked(bytes32(0), keccak256(bytes(tld))));
        return keccak256(abi.encodePacked(tldHash, keccak256(bytes(subdomain))));
    }

    /**
     * @notice Compute namehash for a single label (TLD)
     * @param label The single label (e.g., "cryptofans")
     * @return The computed namehash
     */
    function namehashLabel(string memory label) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(bytes32(0), keccak256(bytes(label))));
    }

    /**
     * @notice Extract a slice from bytes
     * @param data The source bytes
     * @param start Start index (inclusive)
     * @param end End index (exclusive)
     * @return result The sliced bytes
     */
    function _slice(
        bytes memory data,
        uint256 start,
        uint256 end
    ) private pure returns (bytes memory result) {
        require(end >= start, "Invalid slice");
        require(end <= data.length, "Slice out of bounds");

        result = new bytes(end - start);
        for (uint256 i = 0; i < end - start; i++) {
            result[i] = data[start + i];
        }
    }

    /**
     * @notice Normalize a domain name to lowercase for consistent hashing
     * @dev ENS requires lowercase normalization; HSR follows same pattern
     * @param name The domain name to normalize
     * @return The lowercase normalized name
     */
    function normalize(string memory name) internal pure returns (string memory) {
        bytes memory nameBytes = bytes(name);
        bytes memory result = new bytes(nameBytes.length);

        for (uint256 i = 0; i < nameBytes.length; i++) {
            bytes1 char = nameBytes[i];
            // Convert uppercase A-Z to lowercase a-z
            if (char >= 0x41 && char <= 0x5A) {
                result[i] = bytes1(uint8(char) + 32);
            } else {
                result[i] = char;
            }
        }

        return string(result);
    }

    /**
     * @notice Compute namehash with automatic normalization
     * @param fqdn The fully qualified domain name
     * @return The computed namehash (after lowercase normalization)
     */
    function namehashNormalized(string memory fqdn) internal pure returns (bytes32) {
        return namehash(normalize(fqdn));
    }
}
