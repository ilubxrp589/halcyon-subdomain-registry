// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IDNSOracle.sol";

/**
 * @title DNSOracle
 * @author Halcyon Registry
 * @notice Oracle for verifying Handshake DNS registrations
 * @dev Backend service calls this to confirm DNS allocation
 */
contract DNSOracle is IDNSOracle, AccessControl, ReentrancyGuard {
    // =============================================================
    //                           ROLES
    // =============================================================

    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    // =============================================================
    //                           STORAGE
    // =============================================================

    // Escrow contract address
    address public escrowContract;

    struct DNSRequest {
        uint256 escrowId;
        uint256 tokenId;
        string tld;
        string subdomain;
        address owner;
        uint256 requestedAt;
        bool completed;
        bool success;
    }

    // requestId => DNSRequest
    mapping(uint256 => DNSRequest) public requests;
    uint256 private _requestIdCounter;

    // keccak256(subdomain.tld) => verified
    mapping(bytes32 => bool) public verifiedDomains;

    // escrowId => requestId
    mapping(uint256 => uint256) public escrowToRequest;

    // =============================================================
    //                           EVENTS
    // =============================================================

    event DNSRegistrationRequested(
        uint256 indexed requestId,
        uint256 indexed escrowId,
        uint256 tokenId,
        string tld,
        string subdomain,
        address owner
    );

    event DNSRegistrationConfirmed(
        uint256 indexed requestId,
        uint256 indexed escrowId,
        bool success,
        bytes32 hnsBlockHash,
        uint256 hnsBlockHeight
    );

    event EscrowContractUpdated(address indexed newEscrow);

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

    constructor(address _escrowContract) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_ROLE, msg.sender);

        if (_escrowContract != address(0)) {
            escrowContract = _escrowContract;
        }
    }

    // =============================================================
    //                      ESCROW INTERFACE
    // =============================================================

    /**
     * @inheritdoc IDNSOracle
     */
    function requestDNSRegistration(
        uint256 escrowId,
        uint256 tokenId,
        string calldata tld,
        string calldata subdomain,
        address owner
    ) external override {
        require(msg.sender == escrowContract, "Only escrow contract");

        uint256 requestId = ++_requestIdCounter;

        requests[requestId] = DNSRequest({
            escrowId: escrowId,
            tokenId: tokenId,
            tld: tld,
            subdomain: subdomain,
            owner: owner,
            requestedAt: block.timestamp,
            completed: false,
            success: false
        });

        escrowToRequest[escrowId] = requestId;

        emit DNSRegistrationRequested(requestId, escrowId, tokenId, tld, subdomain, owner);
    }

    // =============================================================
    //                      ORACLE FUNCTIONS
    // =============================================================

    /**
     * @notice Confirm DNS registration success
     * @param requestId The request ID
     * @param hnsBlockHash HNS block hash for verification proof
     * @param hnsBlockHeight HNS block height
     */
    function confirmDNSRegistration(
        uint256 requestId,
        bytes32 hnsBlockHash,
        uint256 hnsBlockHeight
    ) external onlyRole(ORACLE_ROLE) nonReentrant {
        DNSRequest storage request = requests[requestId];
        require(request.requestedAt > 0, "Request does not exist");
        require(!request.completed, "Already completed");

        request.completed = true;
        request.success = true;

        // Mark domain as verified
        string memory fullDomain = string(abi.encodePacked(request.subdomain, ".", request.tld));
        bytes32 domainHash = keccak256(abi.encodePacked(fullDomain));
        verifiedDomains[domainHash] = true;

        emit DNSRegistrationConfirmed(requestId, request.escrowId, true, hnsBlockHash, hnsBlockHeight);

        // Call escrow to complete
        IEscrowCallback(escrowContract).completeDNSRegistration(request.escrowId);
    }

    /**
     * @notice Fail DNS registration
     * @param requestId The request ID
     * @param reason Failure reason (for logging)
     */
    function failDNSRegistration(
        uint256 requestId,
        string calldata reason
    ) external onlyRole(ORACLE_ROLE) nonReentrant {
        DNSRequest storage request = requests[requestId];
        require(request.requestedAt > 0, "Request does not exist");
        require(!request.completed, "Already completed");

        request.completed = true;
        request.success = false;

        emit DNSRegistrationConfirmed(requestId, request.escrowId, false, bytes32(0), 0);

        // Call escrow to refund
        IEscrowCallback(escrowContract).failDNSRegistration(request.escrowId);
    }

    // =============================================================
    //                      VIEW FUNCTIONS
    // =============================================================

    /**
     * @inheritdoc IDNSOracle
     */
    function isVerified(string calldata tld, string calldata subdomain)
        external view override returns (bool)
    {
        string memory fullDomain = string(abi.encodePacked(subdomain, ".", tld));
        bytes32 domainHash = keccak256(abi.encodePacked(fullDomain));
        return verifiedDomains[domainHash];
    }

    function getRequest(uint256 requestId) external view returns (DNSRequest memory) {
        return requests[requestId];
    }

    function getRequestByEscrow(uint256 escrowId) external view returns (DNSRequest memory) {
        uint256 requestId = escrowToRequest[escrowId];
        return requests[requestId];
    }

    function totalRequests() external view returns (uint256) {
        return _requestIdCounter;
    }

    // =============================================================
    //                      ADMIN FUNCTIONS
    // =============================================================

    function setEscrowContract(address _escrowContract) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_escrowContract != address(0), "Invalid escrow");
        escrowContract = _escrowContract;
        emit EscrowContractUpdated(_escrowContract);
    }
}

// Callback interface for escrow
interface IEscrowCallback {
    function completeDNSRegistration(uint256 escrowId) external;
    function failDNSRegistration(uint256 escrowId) external;
}
