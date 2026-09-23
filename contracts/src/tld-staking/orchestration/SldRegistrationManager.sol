// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {IHsrTld} from "../interfaces/IHsrTld.sol";
import {IHsrSld} from "../interfaces/IHsrSld.sol";
import {IFtsoOracle} from "../interfaces/IFtsoOracle.sol";
import {IGlobalRegistrationRules} from "../interfaces/IGlobalRegistrationRules.sol";
import {ISldCommitIntent} from "../interfaces/ISldCommitIntent.sol";
import {IPaymentManager} from "../interfaces/IPaymentManager.sol";
import {IRegistrationStrategy} from "../interfaces/IRegistrationStrategy.sol";

/// @title SldRegistrationManager
/// @notice Central orchestration hub for SLD (subdomain) registration and renewal.
///         Wires together all Tier 1-3 contracts: TLD NFTs, SLD NFTs, pricing, payment, commit-reveal.
/// @dev UUPS upgradeable. All registration and renewal flows go through this contract.
contract SldRegistrationManager is OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    IHsrTld public hsrTld;
    IHsrSld public hsrSld;
    IFtsoOracle public ftsoOracle;
    IGlobalRegistrationRules public globalRules;
    ISldCommitIntent public commitIntent;
    IPaymentManager public paymentManager;

    mapping(uint256 => bool) public usedNonces;

    error RegistrationNotEnabled(bytes32 tldNamehash);
    error NoStrategySet(bytes32 tldNamehash);
    error InsufficientPayment(uint256 required, uint256 sent);
    error RegistrationRulesViolation();
    error InvalidSignature();
    error NonceAlreadyUsed(uint256 nonce);
    error SldNotFound(bytes32 sldNamehash);
    error RefundFailed();
    error ZeroAddress();

    event Registered(
        bytes32 indexed sldNamehash,
        bytes32 indexed tldNamehash,
        string label,
        address indexed buyer,
        uint256 tokenId,
        uint256 priceUsdCents,
        uint256 priceLockPerYear,
        uint256 durationYears
    );
    event Renewed(
        bytes32 indexed sldNamehash,
        address indexed payer,
        uint256 additionalYears,
        uint256 renewalPriceUsdCents
    );
    event ArtworkRequested(uint256 indexed tokenId, bytes32 indexed tldNamehash, string label);
    event PaymentManagerUpdated(address oldManager, address newManager);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _hsrTld,
        address _hsrSld,
        address _ftsoOracle,
        address _globalRules,
        address _commitIntent,
        address _paymentManager,
        address _owner
    ) external initializer {
        if (_hsrTld == address(0) || _hsrSld == address(0) || _ftsoOracle == address(0)
            || _globalRules == address(0) || _commitIntent == address(0) || _paymentManager == address(0))
        {
            revert ZeroAddress();
        }
        __Ownable_init(_owner);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        hsrTld = IHsrTld(_hsrTld);
        hsrSld = IHsrSld(_hsrSld);
        ftsoOracle = IFtsoOracle(_ftsoOracle);
        globalRules = IGlobalRegistrationRules(_globalRules);
        commitIntent = ISldCommitIntent(_commitIntent);
        paymentManager = IPaymentManager(_paymentManager);
    }

    /// @notice Update the payment manager (for V1 → V2 migration).
    function setPaymentManager(address _paymentManager) external onlyOwner {
        if (_paymentManager == address(0)) revert ZeroAddress();
        address old = address(paymentManager);
        paymentManager = IPaymentManager(_paymentManager);
        emit PaymentManagerUpdated(old, _paymentManager);
    }

    /// @notice Register an SLD via commit-reveal (anti-frontrunning).
    /// @param label The subdomain label.
    /// @param tldNamehash The namehash of the parent TLD.
    /// @param durationYears Number of years (1-10).
    /// @param secret The secret used in the original commit.
    function registerWithCommit(
        string calldata label,
        bytes32 tldNamehash,
        uint256 durationYears,
        bytes32 secret
    ) external payable nonReentrant {
        // 1. Consume commit
        bytes32 commitHash = keccak256(abi.encodePacked(label, tldNamehash, msg.sender, secret));
        commitIntent.consumeCommit(commitHash);

        // 2-7. Shared registration logic
        _register(label, tldNamehash, durationYears, msg.sender);
    }

    /// @notice Register an SLD with TLD owner signature (single-tx, no commit needed).
    /// @param label The subdomain label.
    /// @param tldNamehash The namehash of the parent TLD.
    /// @param durationYears Number of years (1-10).
    /// @param nonce Unique nonce to prevent replay.
    /// @param signature TLD owner's signature over the registration parameters.
    function registerWithSignature(
        string calldata label,
        bytes32 tldNamehash,
        uint256 durationYears,
        uint256 nonce,
        bytes calldata signature
    ) external payable nonReentrant {
        // 1. Verify nonce
        if (usedNonces[nonce]) revert NonceAlreadyUsed(nonce);
        usedNonces[nonce] = true;

        // 2. Verify signature from TLD owner
        bytes32 messageHash = keccak256(
            abi.encodePacked(label, tldNamehash, msg.sender, durationYears, nonce, block.chainid, address(this))
        );
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(signature);

        address tldOwner = hsrTld.ownerOfNamehash(tldNamehash);
        if (signer != tldOwner) revert InvalidSignature();

        // 3-7. Shared registration logic
        _register(label, tldNamehash, durationYears, msg.sender);
    }

    /// @notice Renew an existing SLD using its stored price lock.
    /// @param sldNamehash The namehash of the SLD to renew.
    /// @param additionalYears Number of years to add.
    function renew(bytes32 sldNamehash, uint256 additionalYears) external payable nonReentrant {
        // 1. Look up token and stored price lock
        uint256 tokenId = hsrSld.sldNamehashToTokenId(sldNamehash);
        if (tokenId == 0) revert SldNotFound(sldNamehash);

        (bytes32 parentNamehash,,,,uint256 storedPricePerYear,,) = hsrSld.getSldData(tokenId);

        // 2. Calculate renewal cost using stored per-year price
        uint256 renewalPriceUsdCents = storedPricePerYear * additionalYears;

        // 3. Convert to FLR
        uint256 requiredFlr = ftsoOracle.usdCentsToFlr(renewalPriceUsdCents);
        if (msg.value < requiredFlr) revert InsufficientPayment(requiredFlr, msg.value);

        // 4. Process payment
        address tldOwner = hsrTld.ownerOfNamehash(parentNamehash);
        paymentManager.processPayment{value: requiredFlr}(parentNamehash, tldOwner, renewalPriceUsdCents);

        // 5. Extend the SLD
        hsrSld.renew(sldNamehash, additionalYears);

        // 6. Refund excess
        _refundExcess(requiredFlr);

        emit Renewed(sldNamehash, msg.sender, additionalYears, renewalPriceUsdCents);
    }

    /// @notice Check if a label is available under a TLD.
    function isAvailable(string calldata label, bytes32 tldNamehash) external view returns (bool) {
        bytes32 sldNamehash = keccak256(abi.encodePacked(tldNamehash, keccak256(bytes(label))));
        return hsrSld.isAvailable(sldNamehash);
    }

    // --- Internal ---

    function _register(
        string calldata label,
        bytes32 tldNamehash,
        uint256 durationYears,
        address buyer
    ) internal {
        // 2. Check registration enabled
        if (!hsrTld.isRegistrationEnabled(tldNamehash)) revert RegistrationNotEnabled(tldNamehash);

        // 3. Get strategy
        address strategyAddr = hsrTld.getRegistrationStrategy(tldNamehash);
        if (strategyAddr == address(0)) revert NoStrategySet(tldNamehash);
        IRegistrationStrategy strategy = IRegistrationStrategy(strategyAddr);

        // 4. Get per-year price (stored as price lock)
        uint256 pricePerYear = strategy.getPriceInUsdCents(buyer, tldNamehash, label, 1, false);

        // 5. Get total price for actual duration
        uint256 totalPriceUsdCents = strategy.getPriceInUsdCents(buyer, tldNamehash, label, durationYears, false);

        // 6. Validate against global rules
        if (!globalRules.validateRegistration(label, totalPriceUsdCents, durationYears)) {
            revert RegistrationRulesViolation();
        }

        // 7. Convert to FLR and check payment
        uint256 requiredFlr = ftsoOracle.usdCentsToFlr(totalPriceUsdCents);
        if (msg.value < requiredFlr) revert InsufficientPayment(requiredFlr, msg.value);

        // 8. Process payment
        address tldOwner = hsrTld.ownerOfNamehash(tldNamehash);
        paymentManager.processPayment{value: requiredFlr}(tldNamehash, tldOwner, totalPriceUsdCents);

        // 9. Mint SLD with per-year price lock
        uint256 tokenId = hsrSld.mint(buyer, label, tldNamehash, durationYears, pricePerYear);

        // 10. Emit events
        emit ArtworkRequested(tokenId, tldNamehash, label);
        emit Registered(
            keccak256(abi.encodePacked(tldNamehash, keccak256(bytes(label)))),
            tldNamehash,
            label,
            buyer,
            tokenId,
            totalPriceUsdCents,
            pricePerYear,
            durationYears
        );

        // 11. Refund excess
        _refundExcess(requiredFlr);
    }

    function _refundExcess(uint256 requiredFlr) internal {
        uint256 excess = msg.value - requiredFlr;
        if (excess > 0) {
            (bool success,) = msg.sender.call{value: excess}("");
            if (!success) revert RefundFailed();
        }
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
