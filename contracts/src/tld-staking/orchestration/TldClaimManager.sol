// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IHsrTld} from "../interfaces/IHsrTld.sol";
import {ILabelValidator} from "../interfaces/ILabelValidator.sol";
import {ITldClaimManager} from "../interfaces/ITldClaimManager.sol";
import {IFtsoOracle} from "../interfaces/IFtsoOracle.sol";
import {ContractRegistry} from "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";
import {IFdcHub} from "@flarenetwork/flare-periphery-contracts/coston2/IFdcHub.sol";
import {IFdcRequestFeeConfigurations} from "@flarenetwork/flare-periphery-contracts/coston2/IFdcRequestFeeConfigurations.sol";
import {IFdcVerification} from "@flarenetwork/flare-periphery-contracts/coston2/IFdcVerification.sol";
import {IWeb2Json} from "@flarenetwork/flare-periphery-contracts/coston2/IWeb2Json.sol";

/// @title TldClaimManager
/// @notice Phase 1: Operator-only TLD minting for pre-owned Handshake TLDs.
///         Phase 2: FDC-verified external staking for third-party TLD owners.
/// @dev UUPS upgradeable. Phase 2 storage appended after Phase 1 (proxy-safe).
contract TldClaimManager is OwnableUpgradeable, UUPSUpgradeable, ITldClaimManager {
    // =========================================================================
    // Phase 1 Storage (DO NOT reorder — UUPS proxy safety)
    // =========================================================================
    IHsrTld public hsrTld;
    ILabelValidator public labelValidator;
    address public operator;
    mapping(bytes32 => bool) public claimedTlds;

    // =========================================================================
    // Phase 2 Storage (appended after Phase 1)
    // =========================================================================
    IFtsoOracle public ftsoOracle;
    uint256 public stakingFeeUsd; // in cents, e.g. 10000 = $100

    struct PendingClaim {
        address claimer;
        string tldLabel;
        bytes32 namehash;
        uint256 stakingFeePaid;
        uint256 requestTimestamp;
        bool completed;
    }
    mapping(bytes32 => PendingClaim) public pendingClaims;

    uint256 public constant CLAIM_EXPIRY = 14 days;

    // =========================================================================
    // Phase 1 Errors & Events
    // =========================================================================
    error OnlyOperator();
    error InvalidLabel(string label);
    error TldAlreadyClaimed(bytes32 namehash);
    error ZeroAddress();

    event TldClaimed(bytes32 indexed namehash, string label, uint256 tokenId, address indexed operator);
    event OperatorUpdated(address oldOperator, address newOperator);

    // =========================================================================
    // Phase 2 Errors & Events
    // =========================================================================
    error InsufficientStakingFee(uint256 required, uint256 sent);
    error ClaimAlreadyPending(bytes32 namehash);
    error NoPendingClaim(bytes32 namehash);
    error ClaimAlreadyCompleted(bytes32 namehash);
    error ClaimNotExpired(bytes32 namehash);
    error InvalidProof();
    error TldExpiredOnHandshake();
    error TldNotClosed();
    error AddressMismatch(address expected, address actual);
    error InvalidFlrRecord();
    error TransferFailed();

    event StakeRequested(bytes32 indexed namehash, string tldLabel, address indexed claimer, uint256 feePaid);
    event StakeCompleted(bytes32 indexed namehash, string tldLabel, address indexed claimer, uint256 tokenId);
    event StakeRefunded(bytes32 indexed namehash, address indexed claimer, uint256 amount);

    // =========================================================================
    // Modifiers
    // =========================================================================
    modifier onlyOperator() {
        if (msg.sender != operator) revert OnlyOperator();
        _;
    }

    // =========================================================================
    // Initializer
    // =========================================================================
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _hsrTld,
        address _labelValidator,
        address _operator,
        address _owner
    ) external initializer {
        if (_hsrTld == address(0) || _labelValidator == address(0) || _operator == address(0)) {
            revert ZeroAddress();
        }
        __Ownable_init(_owner);
        __UUPSUpgradeable_init();
        hsrTld = IHsrTld(_hsrTld);
        labelValidator = ILabelValidator(_labelValidator);
        operator = _operator;
    }

    // =========================================================================
    // Phase 1: Operator minting
    // =========================================================================

    /// @inheritdoc ITldClaimManager
    function operatorMint(string calldata tldLabel) external override onlyOperator returns (uint256 tokenId) {
        if (!labelValidator.isValidLabel(tldLabel)) revert InvalidLabel(tldLabel);

        bytes32 namehash = _computeTldNamehash(tldLabel);
        if (claimedTlds[namehash]) revert TldAlreadyClaimed(namehash);

        claimedTlds[namehash] = true;
        tokenId = hsrTld.mint(operator, tldLabel, namehash);

        emit TldClaimed(namehash, tldLabel, tokenId, operator);
    }

    /// @inheritdoc ITldClaimManager
    function operatorMintBatch(string[] calldata tldLabels)
        external
        override
        onlyOperator
        returns (uint256[] memory tokenIds)
    {
        tokenIds = new uint256[](tldLabels.length);
        for (uint256 i; i < tldLabels.length; i++) {
            if (!labelValidator.isValidLabel(tldLabels[i])) continue;

            bytes32 namehash = _computeTldNamehash(tldLabels[i]);
            if (claimedTlds[namehash]) continue;

            claimedTlds[namehash] = true;
            tokenIds[i] = hsrTld.mint(operator, tldLabels[i], namehash);

            emit TldClaimed(namehash, tldLabels[i], tokenIds[i], operator);
        }
    }

    // =========================================================================
    // Phase 2: FDC-verified staking
    // =========================================================================

    /// @notice Requests FDC attestation to verify Handshake TLD ownership.
    /// @param tldLabel The TLD label (e.g. "coolname").
    /// @param abiEncodedRequest Pre-prepared request bytes from the Verifier API (includes MIC).
    function requestStake(string calldata tldLabel, bytes calldata abiEncodedRequest) external payable {
        if (!labelValidator.isValidLabel(tldLabel)) revert InvalidLabel(tldLabel);

        bytes32 namehash = _computeTldNamehash(tldLabel);
        if (claimedTlds[namehash]) revert TldAlreadyClaimed(namehash);
        if (pendingClaims[namehash].claimer != address(0)) revert ClaimAlreadyPending(namehash);

        uint256 requiredFee = ftsoOracle.usdCentsToFlr(stakingFeeUsd);

        // Get FDC attestation fee
        IFdcHub fdcHub = ContractRegistry.getFdcHub();
        IFdcRequestFeeConfigurations feeConfig = fdcHub.fdcRequestFeeConfigurations();
        uint256 fdcFee = feeConfig.getRequestFee(abiEncodedRequest);

        uint256 totalRequired = requiredFee + fdcFee;
        if (msg.value < totalRequired) revert InsufficientStakingFee(totalRequired, msg.value);

        // Forward attestation request to FDC Hub
        fdcHub.requestAttestation{value: fdcFee}(abiEncodedRequest);

        // Store pending claim
        pendingClaims[namehash] = PendingClaim({
            claimer: msg.sender,
            tldLabel: tldLabel,
            namehash: namehash,
            stakingFeePaid: requiredFee,
            requestTimestamp: block.timestamp,
            completed: false
        });

        emit StakeRequested(namehash, tldLabel, msg.sender, requiredFee);

        // Refund excess FLR (total sent minus staking fee and FDC fee)
        uint256 excess = msg.value - requiredFee - fdcFee;
        if (excess > 0) {
            (bool success,) = msg.sender.call{value: excess}("");
            if (!success) revert TransferFailed();
        }
    }

    /// @notice Completes a pending stake by verifying the FDC proof and minting the TLD NFT.
    /// @param tldLabel The TLD label matching the pending claim.
    /// @param proof The FDC Web2Json proof containing Merkle proof and attestation data.
    function completeStake(string calldata tldLabel, IWeb2Json.Proof calldata proof) external {
        bytes32 namehash = _computeTldNamehash(tldLabel);
        PendingClaim storage claim = pendingClaims[namehash];

        if (claim.claimer == address(0)) revert NoPendingClaim(namehash);
        if (claim.completed) revert ClaimAlreadyCompleted(namehash);

        // Verify FDC proof
        IFdcVerification fdcVerification = ContractRegistry.getFdcVerification();
        if (!fdcVerification.verifyWeb2Json(proof)) revert InvalidProof();

        // Decode attestation response.
        // FDC's abiEncodedData uses tuple encoding (32-byte offset prefix)
        // because the abiSignature specifies type "tuple". We strip the prefix
        // so abi.decode sees raw (string, bool, string).
        bytes memory rawData = proof.data.responseBody.abiEncodedData;
        require(rawData.length > 32, "Invalid response data");
        bytes memory innerData = new bytes(rawData.length - 32);
        for (uint256 i; i < innerData.length; i++) {
            innerData[i] = rawData[i + 32];
        }
        (string memory flrAddress, bool expired, string memory state) = abi.decode(
            innerData,
            (string, bool, string)
        );

        // Validate Handshake TLD state
        if (expired) revert TldExpiredOnHandshake();
        if (keccak256(bytes(state)) != keccak256(bytes("CLOSED"))) revert TldNotClosed();

        // Parse and verify the FLR address matches the claimer
        address parsedAddr = _parseFlrAddress(flrAddress);
        if (parsedAddr != claim.claimer) revert AddressMismatch(claim.claimer, parsedAddr);

        // Mark completed and mint TLD NFT
        claim.completed = true;
        claimedTlds[namehash] = true;
        uint256 tokenId = hsrTld.mint(claim.claimer, tldLabel, namehash);

        emit StakeCompleted(namehash, tldLabel, claim.claimer, tokenId);
    }

    /// @notice Refunds the staking fee for an expired pending claim.
    /// @param namehash The namehash of the TLD whose claim has expired.
    function refundExpiredStake(bytes32 namehash) external {
        PendingClaim storage claim = pendingClaims[namehash];
        if (claim.claimer == address(0)) revert NoPendingClaim(namehash);
        if (claim.completed) revert ClaimAlreadyCompleted(namehash);
        if (block.timestamp < claim.requestTimestamp + CLAIM_EXPIRY) revert ClaimNotExpired(namehash);

        uint256 amount = claim.stakingFeePaid;
        address claimer = claim.claimer;

        // Clear claim before transfer (checks-effects-interactions)
        delete pendingClaims[namehash];

        (bool success,) = claimer.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit StakeRefunded(namehash, claimer, amount);
    }

    // =========================================================================
    // Admin setters
    // =========================================================================

    function setOperator(address _operator) external onlyOwner {
        if (_operator == address(0)) revert ZeroAddress();
        address old = operator;
        operator = _operator;
        emit OperatorUpdated(old, _operator);
    }

    function setFtsoOracle(address _ftsoOracle) external onlyOwner {
        if (_ftsoOracle == address(0)) revert ZeroAddress();
        ftsoOracle = IFtsoOracle(_ftsoOracle);
    }

    function setStakingFee(uint256 _feeUsdCents) external onlyOwner {
        stakingFeeUsd = _feeUsdCents;
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    function _computeTldNamehash(string calldata label) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(bytes32(0), keccak256(bytes(label))));
    }

    /// @notice Parses a "flr:0x..." string to extract a Flare address.
    function _parseFlrAddress(string memory record) internal pure returns (address) {
        bytes memory b = bytes(record);
        // "flr:0x" prefix (6 bytes) + 40 hex chars = 46 bytes minimum
        if (b.length < 46) revert InvalidFlrRecord();

        // Verify "flr:0x" prefix
        if (
            b[0] != "f" || b[1] != "l" || b[2] != "r" || b[3] != ":" || b[4] != "0" || b[5] != "x"
        ) {
            revert InvalidFlrRecord();
        }

        // Parse 40 hex characters into an address
        uint160 addr;
        for (uint256 i; i < 40; i++) {
            addr = addr * 16 + uint160(_hexCharToUint8(b[6 + i]));
        }
        return address(addr);
    }

    function _hexCharToUint8(bytes1 c) internal pure returns (uint8) {
        if (c >= "0" && c <= "9") return uint8(c) - 48;
        if (c >= "a" && c <= "f") return uint8(c) - 87;
        if (c >= "A" && c <= "F") return uint8(c) - 55;
        revert InvalidFlrRecord();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
