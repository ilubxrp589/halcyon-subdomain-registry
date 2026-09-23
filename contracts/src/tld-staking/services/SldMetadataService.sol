// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IMetadataService} from "../interfaces/IMetadataService.sol";

/// @title SldMetadataService
/// @notice Returns API-based metadata URIs for SLD NFTs.
/// @dev The backend serves the actual JSON at the base URL. Does NOT verify
///      tokenId exists — the caller (HsrSld.tokenURI) already calls _requireOwned.
contract SldMetadataService is IMetadataService, Ownable {
    string public baseApiUrl;

    error EmptyBaseApiUrl();

    event BaseApiUrlUpdated(string oldUrl, string newUrl);

    constructor(string memory _baseApiUrl, address _owner) Ownable(_owner) {
        if (bytes(_baseApiUrl).length == 0) revert EmptyBaseApiUrl();
        baseApiUrl = _baseApiUrl;
    }

    /// @inheritdoc IMetadataService
    function tokenURI(uint256 tokenId) external view override returns (string memory) {
        return string.concat(baseApiUrl, Strings.toString(tokenId));
    }

    /// @notice Updates the base API URL. Only callable by owner.
    function setBaseApiUrl(string calldata _baseApiUrl) external onlyOwner {
        if (bytes(_baseApiUrl).length == 0) revert EmptyBaseApiUrl();
        string memory old = baseApiUrl;
        baseApiUrl = _baseApiUrl;
        emit BaseApiUrlUpdated(old, _baseApiUrl);
    }
}
