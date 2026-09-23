// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./SubdomainNFT.sol";
import "./interfaces/IPriceOracle.sol";
import "./interfaces/IDNSOracle.sol";

/**
 * @title SubdomainEscrow
 * @author Halcyon Registry
 * @notice Escrow for subdomain purchases with DNS verification
 * @dev Holds FLR until DNS is confirmed, then releases to platform
 */
contract SubdomainEscrow is ReentrancyGuard, Ownable, Pausable {
    // =============================================================
    //                           STORAGE
    // =============================================================

    SubdomainNFT public immutable nftContract;
    IPriceOracle public priceOracle;
    IDNSOracle public dnsOracle;

    // Pricing tiers in USD (18 decimals)
    uint256 public priceUltraPremiumUSD = 500 * 1e18;  // 1 char
    uint256 public pricePremiumUSD = 200 * 1e18;       // 2 chars / common words
    uint256 public priceStandardPlusUSD = 50 * 1e18;   // 3 chars
    uint256 public priceStandardUSD = 10 * 1e18;       // 4+ chars

    // Escrow timeout (24 hours)
    uint256 public constant ESCROW_TIMEOUT = 24 hours;

    // Platform recipient
    address public platformRecipient;

    uint256 private _escrowIdCounter;

    enum EscrowStatus {
        Pending,
        Completed,
        Refunded,
        Expired
    }

    struct Escrow {
        address buyer;
        string tld;
        string subdomain;
        uint256 amountPaid;
        uint256 priceUSD;
        uint256 tokenId;
        uint256 createdAt;
        EscrowStatus status;
        string metadataURI;
    }

    mapping(uint256 => Escrow) public escrows;
    mapping(uint256 => uint256) public tokenToEscrow;

    // Reserved/blocked subdomains
    mapping(bytes32 => bool) public reservedNames;

    // Bulk registration enabled
    bool public bulkRegistrationEnabled = true;

    // Community treasury for FTSO delegation rewards
    address public communityTreasury;
    uint256 public communityFeeBps = 600; // 6%

    // Volume discount thresholds (basis points: 1000 = 10%)
    uint256 public constant DISCOUNT_TIER1_THRESHOLD = 5;   // 5+ domains
    uint256 public constant DISCOUNT_TIER1_BPS = 1000;      // 10% off
    uint256 public constant DISCOUNT_TIER2_THRESHOLD = 10;  // 10+ domains
    uint256 public constant DISCOUNT_TIER2_BPS = 2000;      // 20% off

    // =============================================================
    //                           EVENTS
    // =============================================================

    event SubdomainPurchased(
        uint256 indexed escrowId,
        address indexed buyer,
        string tld,
        string subdomain,
        uint256 amountPaidFLR,
        uint256 priceUSD,
        uint256 tokenId
    );

    event BatchPurchased(
        uint256[] escrowIds,
        address indexed buyer,
        string tld,
        uint256 totalAmountPaid,
        uint256 discountApplied,
        uint256[] tokenIds
    );

    event EscrowCompleted(uint256 indexed escrowId, address indexed buyer, uint256 amountReleased);
    event EscrowRefunded(uint256 indexed escrowId, address indexed buyer, uint256 amountRefunded);
    event PriceOracleUpdated(address indexed newOracle);
    event DNSOracleUpdated(address indexed newOracle);
    event BulkRegistrationToggled(bool enabled);
    event CommunityFeeDistributed(uint256 indexed escrowId, uint256 amount, address treasury);

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

    constructor(
        address payable _nftContract,
        address _priceOracle,
        address _dnsOracle,
        address _platformRecipient
    ) Ownable(msg.sender) {
        require(_nftContract != address(0), "Invalid NFT contract");
        require(_priceOracle != address(0), "Invalid price oracle");
        require(_platformRecipient != address(0), "Invalid recipient");

        nftContract = SubdomainNFT(_nftContract);
        priceOracle = IPriceOracle(_priceOracle);
        platformRecipient = _platformRecipient;

        if (_dnsOracle != address(0)) {
            dnsOracle = IDNSOracle(_dnsOracle);
        }

        // Reserve common subdomains
        _reserveName("www");
        _reserveName("ftp");
        _reserveName("mail");
        _reserveName("smtp");
        _reserveName("pop");
        _reserveName("imap");
        _reserveName("admin");
        _reserveName("root");
        _reserveName("api");
        _reserveName("ns1");
        _reserveName("ns2");
    }

    // =============================================================
    //                      PRICING LOGIC
    // =============================================================

    /**
     * @notice Get price tier for a subdomain
     */
    function getPriceTier(string memory subdomain) public view returns (uint256 priceUSD, string memory tier) {
        uint256 len = bytes(subdomain).length;

        if (len == 1) {
            return (priceUltraPremiumUSD, "ultra_premium");
        } else if (len == 2) {
            return (pricePremiumUSD, "premium");
        } else if (len == 3) {
            return (priceStandardPlusUSD, "standard_plus");
        } else {
            return (priceStandardUSD, "standard");
        }
    }

    /**
     * @notice Get current FLR price for a subdomain
     */
    function getCurrentPriceFLR(string memory subdomain) external view returns (uint256) {
        (uint256 priceUSD,) = getPriceTier(subdomain);
        return priceOracle.convertUSDtoFLR(priceUSD);
    }

    // =============================================================
    //                      PURCHASE LOGIC
    // =============================================================

    /**
     * @notice Purchase a subdomain with FLR
     */
    function purchaseSubdomain(
        string memory tld,
        string memory subdomain,
        string memory metadataURI
    ) external payable nonReentrant whenNotPaused returns (uint256 escrowId, uint256 tokenId) {
        require(bytes(tld).length > 0, "Empty TLD");
        require(bytes(subdomain).length > 0, "Empty subdomain");
        require(bytes(subdomain).length <= 63, "Subdomain too long");
        require(bytes(metadataURI).length > 0, "Empty metadata URI");

        // Validate subdomain format
        require(_isValidSubdomain(subdomain), "Invalid subdomain format");

        // Check not reserved
        bytes32 nameHash = keccak256(abi.encodePacked(_toLower(subdomain)));
        require(!reservedNames[nameHash], "Subdomain reserved");

        // Check not already registered
        (bool exists,) = nftContract.subdomainExists(subdomain, tld);
        require(!exists, "Subdomain already registered");

        // Get price
        (uint256 priceUSD,) = getPriceTier(subdomain);
        uint256 requiredFLR = priceOracle.convertUSDtoFLR(priceUSD);
        require(msg.value >= requiredFLR, "Insufficient payment");

        // Create escrow
        escrowId = ++_escrowIdCounter;

        // Mint NFT (optimistic)
        tokenId = nftContract.mint(
            msg.sender,
            tld,
            subdomain,
            0, // No expiration initially
            requiredFLR,  // Use actual price, not msg.value
            priceUSD,
            metadataURI
        );

        // Store escrow with actual held amount (after potential refund)
        escrows[escrowId] = Escrow({
            buyer: msg.sender,
            tld: tld,
            subdomain: subdomain,
            amountPaid: requiredFLR,  // Store actual escrowed amount, not msg.value
            priceUSD: priceUSD,
            tokenId: tokenId,
            createdAt: block.timestamp,
            status: EscrowStatus.Pending,
            metadataURI: metadataURI
        });

        tokenToEscrow[tokenId] = escrowId;

        emit SubdomainPurchased(escrowId, msg.sender, tld, subdomain, requiredFLR, priceUSD, tokenId);

        // Request DNS registration
        if (address(dnsOracle) != address(0)) {
            dnsOracle.requestDNSRegistration(escrowId, tokenId, tld, subdomain, msg.sender);
        }

        // Refund excess
        if (msg.value > requiredFLR) {
            uint256 excess = msg.value - requiredFLR;
            (bool success,) = msg.sender.call{value: excess}("");
            require(success, "Excess refund failed");
        }

        return (escrowId, tokenId);
    }

    /**
     * @notice Purchase multiple subdomains in a single transaction with volume discount
     * @param tld Top-level domain (same for all)
     * @param subdomainList Array of subdomain names
     * @param metadataURIs Array of metadata URIs
     * @return escrowIds Array of escrow IDs
     * @return tokenIds Array of minted token IDs
     */
    function batchPurchaseSubdomain(
        string memory tld,
        string[] calldata subdomainList,
        string[] calldata metadataURIs
    ) external payable nonReentrant whenNotPaused returns (uint256[] memory escrowIds, uint256[] memory tokenIds) {
        require(bulkRegistrationEnabled, "Bulk registration disabled");
        require(bytes(tld).length > 0, "Empty TLD");
        require(subdomainList.length > 0, "Empty subdomain list");
        require(subdomainList.length <= 20, "Max 20 domains per batch");
        require(subdomainList.length == metadataURIs.length, "Array length mismatch");

        // Validate all subdomains and calculate prices
        (uint256[] memory pricesUSD, uint256 totalPriceUSD) = _validateBatchSubdomains(tld, subdomainList);

        // Apply volume discount and calculate required payment
        uint256 discountBps = getVolumeDiscount(subdomainList.length);
        uint256 requiredFLR = _calculateDiscountedTotal(totalPriceUSD, discountBps);
        require(msg.value >= requiredFLR, "Insufficient payment");

        // Calculate discounted prices per domain
        uint256[] memory pricesFLR = _applyDiscountToPrices(pricesUSD, discountBps);

        // Batch mint NFTs
        tokenIds = nftContract.batchMint(msg.sender, tld, subdomainList, 0, pricesFLR, pricesUSD, metadataURIs);

        // Create escrows
        escrowIds = _createBatchEscrows(tld, subdomainList, metadataURIs, pricesFLR, pricesUSD, tokenIds);

        emit BatchPurchased(escrowIds, msg.sender, tld, requiredFLR, discountBps, tokenIds);

        // Refund excess
        if (msg.value > requiredFLR) {
            (bool success,) = msg.sender.call{value: msg.value - requiredFLR}("");
            require(success, "Excess refund failed");
        }

        return (escrowIds, tokenIds);
    }

    /**
     * @dev Validate subdomains and calculate prices - helper to avoid stack too deep
     */
    function _validateBatchSubdomains(
        string memory tld,
        string[] calldata subdomainList
    ) internal view returns (uint256[] memory pricesUSD, uint256 totalPriceUSD) {
        pricesUSD = new uint256[](subdomainList.length);

        for (uint256 i = 0; i < subdomainList.length; i++) {
            require(bytes(subdomainList[i]).length > 0 && bytes(subdomainList[i]).length <= 63, "Invalid subdomain length");
            require(_isValidSubdomain(subdomainList[i]), "Invalid subdomain format");
            require(!reservedNames[keccak256(abi.encodePacked(_toLower(subdomainList[i])))], "Subdomain reserved");

            (bool exists,) = nftContract.subdomainExists(subdomainList[i], tld);
            require(!exists, "Subdomain already registered");

            (uint256 priceUSD,) = getPriceTier(subdomainList[i]);
            pricesUSD[i] = priceUSD;
            totalPriceUSD += priceUSD;
        }
    }

    /**
     * @dev Calculate discounted total - helper to avoid stack too deep
     */
    function _calculateDiscountedTotal(uint256 totalPriceUSD, uint256 discountBps) internal view returns (uint256) {
        uint256 discountedPriceUSD = totalPriceUSD - (totalPriceUSD * discountBps / 10000);
        return priceOracle.convertUSDtoFLR(discountedPriceUSD);
    }

    /**
     * @dev Apply discount to individual prices - helper to avoid stack too deep
     */
    function _applyDiscountToPrices(
        uint256[] memory pricesUSD,
        uint256 discountBps
    ) internal view returns (uint256[] memory pricesFLR) {
        pricesFLR = new uint256[](pricesUSD.length);
        for (uint256 i = 0; i < pricesUSD.length; i++) {
            pricesUSD[i] = pricesUSD[i] - (pricesUSD[i] * discountBps / 10000);
            pricesFLR[i] = priceOracle.convertUSDtoFLR(pricesUSD[i]);
        }
    }

    /**
     * @dev Create escrows for batch purchase - helper to avoid stack too deep
     */
    function _createBatchEscrows(
        string memory tld,
        string[] calldata subdomainList,
        string[] calldata metadataURIs,
        uint256[] memory pricesFLR,
        uint256[] memory pricesUSD,
        uint256[] memory tokenIds
    ) internal returns (uint256[] memory escrowIds) {
        escrowIds = new uint256[](subdomainList.length);

        for (uint256 i = 0; i < subdomainList.length; i++) {
            uint256 escrowId = ++_escrowIdCounter;
            escrowIds[i] = escrowId;

            escrows[escrowId] = Escrow({
                buyer: msg.sender,
                tld: tld,
                subdomain: subdomainList[i],
                amountPaid: pricesFLR[i],
                priceUSD: pricesUSD[i],
                tokenId: tokenIds[i],
                createdAt: block.timestamp,
                status: EscrowStatus.Pending,
                metadataURI: metadataURIs[i]
            });

            tokenToEscrow[tokenIds[i]] = escrowId;

            if (address(dnsOracle) != address(0)) {
                dnsOracle.requestDNSRegistration(escrowId, tokenIds[i], tld, subdomainList[i], msg.sender);
            }
        }
    }

    /**
     * @notice Get volume discount based on quantity
     * @param quantity Number of domains
     * @return discountBps Discount in basis points
     */
    function getVolumeDiscount(uint256 quantity) public pure returns (uint256) {
        if (quantity >= DISCOUNT_TIER2_THRESHOLD) {
            return DISCOUNT_TIER2_BPS; // 20% off for 10+
        } else if (quantity >= DISCOUNT_TIER1_THRESHOLD) {
            return DISCOUNT_TIER1_BPS; // 10% off for 5+
        }
        return 0;
    }

    /**
     * @notice Get batch price quote with discount
     * @param subdomainList Array of subdomain names
     * @return totalUSD Total price in USD (18 decimals)
     * @return totalFLR Total price in FLR
     * @return discountBps Discount applied in basis points
     */
    function getBatchPrice(string[] calldata subdomainList) external view returns (
        uint256 totalUSD,
        uint256 totalFLR,
        uint256 discountBps
    ) {
        for (uint256 i = 0; i < subdomainList.length; i++) {
            (uint256 priceUSD,) = getPriceTier(subdomainList[i]);
            totalUSD += priceUSD;
        }

        discountBps = getVolumeDiscount(subdomainList.length);
        uint256 discountedUSD = totalUSD - (totalUSD * discountBps / 10000);
        totalFLR = priceOracle.convertUSDtoFLR(discountedUSD);
        totalUSD = discountedUSD;
    }

    // =============================================================
    //                      ORACLE CALLBACKS
    // =============================================================

    /**
     * @notice Complete DNS registration (called by DNS oracle)
     */
    function completeDNSRegistration(uint256 escrowId) external nonReentrant {
        require(msg.sender == address(dnsOracle), "Only DNS oracle");

        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == EscrowStatus.Pending, "Invalid status");
        require(block.timestamp <= escrow.createdAt + ESCROW_TIMEOUT, "Escrow expired");

        escrow.status = EscrowStatus.Completed;

        // Activate DNS on NFT
        nftContract.updateDNSStatus(escrow.tokenId, true);

        // Release funds: split between community treasury and platform
        uint256 amount = escrow.amountPaid;
        uint256 communityShare = 0;

        if (communityTreasury != address(0) && communityFeeBps > 0) {
            communityShare = (amount * communityFeeBps) / 10000;
            uint256 platformShare = amount - communityShare;

            (bool cSuccess,) = communityTreasury.call{value: communityShare}("");
            require(cSuccess, "Community payment failed");

            (bool pSuccess,) = platformRecipient.call{value: platformShare}("");
            require(pSuccess, "Platform payment failed");

            emit CommunityFeeDistributed(escrowId, communityShare, communityTreasury);
        } else {
            (bool success,) = platformRecipient.call{value: amount}("");
            require(success, "Platform payment failed");
        }

        emit EscrowCompleted(escrowId, escrow.buyer, amount);
    }

    /**
     * @notice Fail DNS registration (called by DNS oracle)
     */
    function failDNSRegistration(uint256 escrowId) external nonReentrant {
        require(msg.sender == address(dnsOracle), "Only DNS oracle");

        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == EscrowStatus.Pending, "Invalid status");

        escrow.status = EscrowStatus.Refunded;

        // Burn NFT
        nftContract.burn(escrow.tokenId);

        // Refund buyer
        uint256 amount = escrow.amountPaid;
        (bool success,) = escrow.buyer.call{value: amount}("");
        require(success, "Refund failed");

        emit EscrowRefunded(escrowId, escrow.buyer, amount);
    }

    /**
     * @notice Claim refund after timeout
     */
    function claimTimeoutRefund(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == EscrowStatus.Pending, "Invalid status");
        require(block.timestamp > escrow.createdAt + ESCROW_TIMEOUT, "Not expired");

        escrow.status = EscrowStatus.Expired;

        // Burn NFT
        nftContract.burn(escrow.tokenId);

        // Refund buyer
        uint256 amount = escrow.amountPaid;
        (bool success,) = escrow.buyer.call{value: amount}("");
        require(success, "Refund failed");

        emit EscrowRefunded(escrowId, escrow.buyer, amount);
    }

    // =============================================================
    //                      VALIDATION
    // =============================================================

    function _isValidSubdomain(string memory subdomain) internal pure returns (bool) {
        bytes memory b = bytes(subdomain);
        if (b.length == 0 || b.length > 63) return false;

        // Cannot start or end with hyphen
        if (b[0] == 0x2D || b[b.length - 1] == 0x2D) return false;

        for (uint256 i = 0; i < b.length; i++) {
            bytes1 char = b[i];
            // a-z, 0-9, hyphen
            bool isLower = (char >= 0x61 && char <= 0x7A);
            bool isDigit = (char >= 0x30 && char <= 0x39);
            bool isHyphen = (char == 0x2D);

            if (!isLower && !isDigit && !isHyphen) return false;
        }

        return true;
    }

    function _toLower(string memory str) internal pure returns (string memory) {
        bytes memory b = bytes(str);
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] >= 0x41 && b[i] <= 0x5A) {
                b[i] = bytes1(uint8(b[i]) + 32);
            }
        }
        return string(b);
    }

    function _reserveName(string memory name) internal {
        bytes32 nameHash = keccak256(abi.encodePacked(name));
        reservedNames[nameHash] = true;
    }

    // =============================================================
    //                      VIEW FUNCTIONS
    // =============================================================

    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        return escrows[escrowId];
    }

    function isEscrowExpired(uint256 escrowId) external view returns (bool) {
        Escrow memory escrow = escrows[escrowId];
        return escrow.status == EscrowStatus.Pending &&
               block.timestamp > escrow.createdAt + ESCROW_TIMEOUT;
    }

    function totalEscrows() external view returns (uint256) {
        return _escrowIdCounter;
    }

    // =============================================================
    //                      ADMIN FUNCTIONS
    // =============================================================

    function setPriceOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Invalid oracle");
        priceOracle = IPriceOracle(newOracle);
        emit PriceOracleUpdated(newOracle);
    }

    function setDNSOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Invalid oracle");
        dnsOracle = IDNSOracle(newOracle);
        emit DNSOracleUpdated(newOracle);
    }

    function setPlatformRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "Invalid recipient");
        platformRecipient = newRecipient;
    }

    function setCommunityTreasury(address _treasury) external onlyOwner {
        communityTreasury = _treasury;
    }

    function setCommunityFeeBps(uint256 _bps) external onlyOwner {
        require(_bps <= 1000, "Max 10%");
        communityFeeBps = _bps;
    }

    function setPrices(
        uint256 _ultraPremium,
        uint256 _premium,
        uint256 _standardPlus,
        uint256 _standard
    ) external onlyOwner {
        priceUltraPremiumUSD = _ultraPremium;
        pricePremiumUSD = _premium;
        priceStandardPlusUSD = _standardPlus;
        priceStandardUSD = _standard;
    }

    function reserveSubdomain(string memory name) external onlyOwner {
        _reserveName(name);
    }

    function setBulkRegistrationEnabled(bool enabled) external onlyOwner {
        bulkRegistrationEnabled = enabled;
        emit BulkRegistrationToggled(enabled);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function emergencyWithdraw() external onlyOwner {
        require(paused(), "Must be paused");
        uint256 balance = address(this).balance;
        (bool success,) = owner().call{value: balance}("");
        require(success, "Withdrawal failed");
    }

    receive() external payable {}
}
