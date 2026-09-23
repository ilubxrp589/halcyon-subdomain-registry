// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IWeb2Json} from "@flarenetwork/flare-periphery-contracts/coston2/IWeb2Json.sol";
import {IWeb2JsonVerification} from "@flarenetwork/flare-periphery-contracts/coston2/IWeb2JsonVerification.sol";

/// @title MockFdcHub
/// @notice Mock FDC Hub for testing. Stores the last attestation request and emits events.
contract MockFdcHub {
    bytes public lastAttestationRequest;

    event AttestationRequest(bytes data, uint256 fee);

    function requestAttestation(bytes calldata _data) external payable {
        lastAttestationRequest = _data;
        emit AttestationRequest(_data, msg.value);
    }
}

/// @title MockFdcVerification
/// @notice Mock FDC Verification for testing. Returns a controllable bool for verifyWeb2Json.
contract MockFdcVerification is IWeb2JsonVerification {
    bool public shouldVerify;

    function setShouldVerify(bool _shouldVerify) external {
        shouldVerify = _shouldVerify;
    }

    function verifyWeb2Json(IWeb2Json.Proof calldata) external view override returns (bool _proved) {
        return shouldVerify;
    }
}
