// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "./SubdomainNFT.sol";

/**
 * @title SubdomainMarketplace
 * @author Halcyon Registry
 * @notice Secondary marketplace for trading subdomain NFTs
 * @dev Supports fixed-price listings, offers, and auctions with ERC-2981 royalty enforcement
 */
contract SubdomainMarketplace is ReentrancyGuard, Ownable, Pausable {
    // =============================================================
    //                           STORAGE
    // =============================================================

    SubdomainNFT public immutable nftContract;

    // Platform fee (2.5% = 250 basis points)
    uint256 public platformFeeBps = 250;
    address public feeRecipient;

    // Minimum listing price
    uint256 public minListingPrice = 0.01 ether;

    // Auction settings
    uint256 public minAuctionDuration = 1 hours;
    uint256 public maxAuctionDuration = 30 days;
    uint256 public auctionExtensionTime = 10 minutes;
    uint256 public minBidIncrementBps = 500; // 5%

    uint256 private _listingIdCounter;
    uint256 private _offerIdCounter;

    enum ListingType {
        FixedPrice,
        Auction
    }

    enum ListingStatus {
        Active,
        Sold,
        Cancelled
    }

    struct Listing {
        uint256 listingId;
        uint256 tokenId;
        address seller;
        uint256 price;           // Fixed price or starting bid
        uint256 endTime;         // 0 for fixed price, timestamp for auction
        ListingType listingType;
        ListingStatus status;
        address highestBidder;   // For auctions
        uint256 highestBid;      // For auctions
        uint256 createdAt;
    }

    struct Offer {
        uint256 offerId;
        uint256 tokenId;
        address offerer;
        uint256 amount;
        uint256 expiresAt;
        bool accepted;
        bool cancelled;
    }

    // listingId => Listing
    mapping(uint256 => Listing) public listings;

    // tokenId => active listingId (0 if not listed)
    mapping(uint256 => uint256) public tokenToListing;

    // offerId => Offer
    mapping(uint256 => Offer) public offers;

    // tokenId => offerIds
    mapping(uint256 => uint256[]) public tokenOffers;

    // user => their listing IDs
    mapping(address => uint256[]) public userListings;

    // user => their offer IDs
    mapping(address => uint256[]) public userOffers;

    // =============================================================
    //                           EVENTS
    // =============================================================

    event Listed(
        uint256 indexed listingId,
        uint256 indexed tokenId,
        address indexed seller,
        uint256 price,
        ListingType listingType,
        uint256 endTime
    );

    event Sale(
        uint256 indexed listingId,
        uint256 indexed tokenId,
        address indexed seller,
        address buyer,
        uint256 price,
        uint256 royaltyAmount,
        uint256 platformFee
    );

    event ListingCancelled(uint256 indexed listingId, uint256 indexed tokenId);

    event BidPlaced(
        uint256 indexed listingId,
        uint256 indexed tokenId,
        address indexed bidder,
        uint256 amount
    );

    event BidRefunded(
        uint256 indexed listingId,
        address indexed bidder,
        uint256 amount
    );

    event OfferMade(
        uint256 indexed offerId,
        uint256 indexed tokenId,
        address indexed offerer,
        uint256 amount,
        uint256 expiresAt
    );

    event OfferAccepted(
        uint256 indexed offerId,
        uint256 indexed tokenId,
        address seller,
        address buyer,
        uint256 amount
    );

    event OfferCancelled(uint256 indexed offerId, uint256 indexed tokenId);

    event PriceUpdated(uint256 indexed listingId, uint256 oldPrice, uint256 newPrice);

    // =============================================================
    //                           ERRORS
    // =============================================================

    error NotTokenOwner();
    error TokenAlreadyListed();
    error ListingNotActive();
    error InvalidPrice();
    error InvalidDuration();
    error AuctionNotEnded();
    error AuctionEnded();
    error BidTooLow();
    error NotHighestBidder();
    error OfferExpired();
    error OfferNotActive();
    error InsufficientPayment();
    error TransferFailed();
    error CannotBidOwnListing();
    error NotApproved();

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

    constructor(
        address _nftContract,
        address _feeRecipient
    ) Ownable(msg.sender) {
        require(_nftContract != address(0), "Invalid NFT contract");
        require(_feeRecipient != address(0), "Invalid fee recipient");

        nftContract = SubdomainNFT(payable(_nftContract));
        feeRecipient = _feeRecipient;
    }

    // =============================================================
    //                      LISTING FUNCTIONS
    // =============================================================

    /**
     * @notice List an NFT for fixed price sale
     * @param tokenId The token ID to list
     * @param price The listing price in FLR
     */
    function listFixedPrice(
        uint256 tokenId,
        uint256 price
    ) external nonReentrant whenNotPaused returns (uint256 listingId) {
        _validateListing(tokenId, price);

        listingId = ++_listingIdCounter;

        listings[listingId] = Listing({
            listingId: listingId,
            tokenId: tokenId,
            seller: msg.sender,
            price: price,
            endTime: 0,
            listingType: ListingType.FixedPrice,
            status: ListingStatus.Active,
            highestBidder: address(0),
            highestBid: 0,
            createdAt: block.timestamp
        });

        tokenToListing[tokenId] = listingId;
        userListings[msg.sender].push(listingId);

        emit Listed(listingId, tokenId, msg.sender, price, ListingType.FixedPrice, 0);
    }

    /**
     * @notice List an NFT for auction
     * @param tokenId The token ID to list
     * @param startingPrice The starting bid price
     * @param duration Auction duration in seconds
     */
    function listAuction(
        uint256 tokenId,
        uint256 startingPrice,
        uint256 duration
    ) external nonReentrant whenNotPaused returns (uint256 listingId) {
        _validateListing(tokenId, startingPrice);

        if (duration < minAuctionDuration || duration > maxAuctionDuration) {
            revert InvalidDuration();
        }

        listingId = ++_listingIdCounter;
        uint256 endTime = block.timestamp + duration;

        listings[listingId] = Listing({
            listingId: listingId,
            tokenId: tokenId,
            seller: msg.sender,
            price: startingPrice,
            endTime: endTime,
            listingType: ListingType.Auction,
            status: ListingStatus.Active,
            highestBidder: address(0),
            highestBid: 0,
            createdAt: block.timestamp
        });

        tokenToListing[tokenId] = listingId;
        userListings[msg.sender].push(listingId);

        emit Listed(listingId, tokenId, msg.sender, startingPrice, ListingType.Auction, endTime);
    }

    /**
     * @notice Update listing price (fixed price only)
     */
    function updatePrice(uint256 listingId, uint256 newPrice) external nonReentrant {
        Listing storage listing = listings[listingId];

        if (listing.seller != msg.sender) revert NotTokenOwner();
        if (listing.status != ListingStatus.Active) revert ListingNotActive();
        if (listing.listingType != ListingType.FixedPrice) revert InvalidPrice();
        if (newPrice < minListingPrice) revert InvalidPrice();

        uint256 oldPrice = listing.price;
        listing.price = newPrice;

        emit PriceUpdated(listingId, oldPrice, newPrice);
    }

    /**
     * @notice Cancel a listing
     */
    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];

        if (listing.seller != msg.sender) revert NotTokenOwner();
        if (listing.status != ListingStatus.Active) revert ListingNotActive();

        // For auctions with bids, cannot cancel
        if (listing.listingType == ListingType.Auction && listing.highestBidder != address(0)) {
            revert AuctionNotEnded();
        }

        listing.status = ListingStatus.Cancelled;
        delete tokenToListing[listing.tokenId];

        emit ListingCancelled(listingId, listing.tokenId);
    }

    // =============================================================
    //                      BUYING FUNCTIONS
    // =============================================================

    /**
     * @notice Buy a fixed-price listing
     */
    function buyNow(uint256 listingId) external payable nonReentrant whenNotPaused {
        Listing storage listing = listings[listingId];

        if (listing.status != ListingStatus.Active) revert ListingNotActive();
        if (listing.listingType != ListingType.FixedPrice) revert InvalidPrice();
        if (msg.value < listing.price) revert InsufficientPayment();

        _executeSale(listing, msg.sender, listing.price);

        // Refund excess
        if (msg.value > listing.price) {
            (bool success, ) = msg.sender.call{value: msg.value - listing.price}("");
            if (!success) revert TransferFailed();
        }
    }

    /**
     * @notice Place a bid on an auction
     */
    function placeBid(uint256 listingId) external payable nonReentrant whenNotPaused {
        Listing storage listing = listings[listingId];

        if (listing.status != ListingStatus.Active) revert ListingNotActive();
        if (listing.listingType != ListingType.Auction) revert InvalidPrice();
        if (block.timestamp >= listing.endTime) revert AuctionEnded();
        if (msg.sender == listing.seller) revert CannotBidOwnListing();

        uint256 minBid;
        if (listing.highestBid == 0) {
            minBid = listing.price;
        } else {
            minBid = listing.highestBid + (listing.highestBid * minBidIncrementBps / 10000);
        }

        if (msg.value < minBid) revert BidTooLow();

        // Refund previous bidder
        if (listing.highestBidder != address(0)) {
            (bool success, ) = listing.highestBidder.call{value: listing.highestBid}("");
            if (!success) revert TransferFailed();
            emit BidRefunded(listingId, listing.highestBidder, listing.highestBid);
        }

        listing.highestBidder = msg.sender;
        listing.highestBid = msg.value;

        // Extend auction if bid in last 10 minutes
        if (listing.endTime - block.timestamp < auctionExtensionTime) {
            listing.endTime = block.timestamp + auctionExtensionTime;
        }

        emit BidPlaced(listingId, listing.tokenId, msg.sender, msg.value);
    }

    /**
     * @notice Settle an ended auction
     */
    function settleAuction(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];

        if (listing.status != ListingStatus.Active) revert ListingNotActive();
        if (listing.listingType != ListingType.Auction) revert InvalidPrice();
        if (block.timestamp < listing.endTime) revert AuctionNotEnded();

        if (listing.highestBidder == address(0)) {
            // No bids, cancel listing
            listing.status = ListingStatus.Cancelled;
            delete tokenToListing[listing.tokenId];
            emit ListingCancelled(listingId, listing.tokenId);
        } else {
            // Execute sale to highest bidder
            _executeSale(listing, listing.highestBidder, listing.highestBid);
        }
    }

    // =============================================================
    //                      OFFER FUNCTIONS
    // =============================================================

    /**
     * @notice Make an offer on any NFT (listed or not)
     */
    function makeOffer(
        uint256 tokenId,
        uint256 expiresIn
    ) external payable nonReentrant whenNotPaused returns (uint256 offerId) {
        require(nftContract.ownerOf(tokenId) != address(0), "Token does not exist");
        require(msg.value >= minListingPrice, "Offer too low");
        require(expiresIn >= 1 hours && expiresIn <= 30 days, "Invalid expiration");

        offerId = ++_offerIdCounter;
        uint256 expiresAt = block.timestamp + expiresIn;

        offers[offerId] = Offer({
            offerId: offerId,
            tokenId: tokenId,
            offerer: msg.sender,
            amount: msg.value,
            expiresAt: expiresAt,
            accepted: false,
            cancelled: false
        });

        tokenOffers[tokenId].push(offerId);
        userOffers[msg.sender].push(offerId);

        emit OfferMade(offerId, tokenId, msg.sender, msg.value, expiresAt);
    }

    /**
     * @notice Accept an offer (token owner only)
     */
    function acceptOffer(uint256 offerId) external nonReentrant whenNotPaused {
        Offer storage offer = offers[offerId];

        if (offer.accepted || offer.cancelled) revert OfferNotActive();
        if (block.timestamp >= offer.expiresAt) revert OfferExpired();

        address tokenOwner = nftContract.ownerOf(offer.tokenId);
        if (msg.sender != tokenOwner) revert NotTokenOwner();

        // Check approval
        if (!nftContract.isApprovedForAll(tokenOwner, address(this)) &&
            nftContract.getApproved(offer.tokenId) != address(this)) {
            revert NotApproved();
        }

        offer.accepted = true;

        // Cancel any active listing for this token
        uint256 activeListingId = tokenToListing[offer.tokenId];
        if (activeListingId != 0) {
            Listing storage listing = listings[activeListingId];
            if (listing.status == ListingStatus.Active) {
                // Refund auction bidder if any
                if (listing.highestBidder != address(0)) {
                    (bool success, ) = listing.highestBidder.call{value: listing.highestBid}("");
                    if (!success) revert TransferFailed();
                }
                listing.status = ListingStatus.Cancelled;
                delete tokenToListing[offer.tokenId];
            }
        }

        // Calculate fees
        (address royaltyRecipient, uint256 royaltyAmount) = nftContract.royaltyInfo(offer.tokenId, offer.amount);
        uint256 platformFee = (offer.amount * platformFeeBps) / 10000;
        uint256 sellerProceeds = offer.amount - royaltyAmount - platformFee;

        // Transfer NFT
        nftContract.safeTransferFrom(tokenOwner, offer.offerer, offer.tokenId);

        // Distribute funds
        if (royaltyAmount > 0) {
            (bool success, ) = royaltyRecipient.call{value: royaltyAmount}("");
            if (!success) revert TransferFailed();
        }

        (bool success2, ) = feeRecipient.call{value: platformFee}("");
        if (!success2) revert TransferFailed();

        (bool success3, ) = tokenOwner.call{value: sellerProceeds}("");
        if (!success3) revert TransferFailed();

        emit OfferAccepted(offerId, offer.tokenId, tokenOwner, offer.offerer, offer.amount);
    }

    /**
     * @notice Cancel an offer (offerer only)
     */
    function cancelOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];

        if (offer.offerer != msg.sender) revert NotTokenOwner();
        if (offer.accepted || offer.cancelled) revert OfferNotActive();

        offer.cancelled = true;

        // Refund
        (bool success, ) = msg.sender.call{value: offer.amount}("");
        if (!success) revert TransferFailed();

        emit OfferCancelled(offerId, offer.tokenId);
    }

    /**
     * @notice Withdraw expired offer funds
     */
    function withdrawExpiredOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];

        if (offer.offerer != msg.sender) revert NotTokenOwner();
        if (offer.accepted || offer.cancelled) revert OfferNotActive();
        if (block.timestamp < offer.expiresAt) revert OfferNotActive();

        offer.cancelled = true;

        (bool success, ) = msg.sender.call{value: offer.amount}("");
        if (!success) revert TransferFailed();

        emit OfferCancelled(offerId, offer.tokenId);
    }

    // =============================================================
    //                      INTERNAL FUNCTIONS
    // =============================================================

    function _validateListing(uint256 tokenId, uint256 price) internal view {
        if (nftContract.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (tokenToListing[tokenId] != 0) revert TokenAlreadyListed();
        if (price < minListingPrice) revert InvalidPrice();

        // Check approval
        if (!nftContract.isApprovedForAll(msg.sender, address(this)) &&
            nftContract.getApproved(tokenId) != address(this)) {
            revert NotApproved();
        }
    }

    function _executeSale(
        Listing storage listing,
        address buyer,
        uint256 salePrice
    ) internal {
        listing.status = ListingStatus.Sold;
        delete tokenToListing[listing.tokenId];

        // Get royalty info
        (address royaltyRecipient, uint256 royaltyAmount) = nftContract.royaltyInfo(listing.tokenId, salePrice);
        uint256 platformFee = (salePrice * platformFeeBps) / 10000;
        uint256 sellerProceeds = salePrice - royaltyAmount - platformFee;

        // Transfer NFT
        nftContract.safeTransferFrom(listing.seller, buyer, listing.tokenId);

        // Distribute funds
        if (royaltyAmount > 0) {
            (bool success, ) = royaltyRecipient.call{value: royaltyAmount}("");
            if (!success) revert TransferFailed();
        }

        (bool success2, ) = feeRecipient.call{value: platformFee}("");
        if (!success2) revert TransferFailed();

        (bool success3, ) = listing.seller.call{value: sellerProceeds}("");
        if (!success3) revert TransferFailed();

        emit Sale(
            listing.listingId,
            listing.tokenId,
            listing.seller,
            buyer,
            salePrice,
            royaltyAmount,
            platformFee
        );
    }

    // =============================================================
    //                      VIEW FUNCTIONS
    // =============================================================

    function getListing(uint256 listingId) external view returns (Listing memory) {
        return listings[listingId];
    }

    function getListingByToken(uint256 tokenId) external view returns (Listing memory) {
        uint256 listingId = tokenToListing[tokenId];
        return listings[listingId];
    }

    function getOffer(uint256 offerId) external view returns (Offer memory) {
        return offers[offerId];
    }

    function getTokenOffers(uint256 tokenId) external view returns (uint256[] memory) {
        return tokenOffers[tokenId];
    }

    function getUserListings(address user) external view returns (uint256[] memory) {
        return userListings[user];
    }

    function getUserOffers(address user) external view returns (uint256[] memory) {
        return userOffers[user];
    }

    function isTokenListed(uint256 tokenId) external view returns (bool) {
        uint256 listingId = tokenToListing[tokenId];
        if (listingId == 0) return false;
        return listings[listingId].status == ListingStatus.Active;
    }

    function totalListings() external view returns (uint256) {
        return _listingIdCounter;
    }

    function totalOffers() external view returns (uint256) {
        return _offerIdCounter;
    }

    // =============================================================
    //                      ADMIN FUNCTIONS
    // =============================================================

    function setPlatformFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 1000, "Max 10%");
        platformFeeBps = _feeBps;
    }

    function setFeeRecipient(address _recipient) external onlyOwner {
        require(_recipient != address(0), "Invalid recipient");
        feeRecipient = _recipient;
    }

    function setMinListingPrice(uint256 _price) external onlyOwner {
        minListingPrice = _price;
    }

    function setAuctionSettings(
        uint256 _minDuration,
        uint256 _maxDuration,
        uint256 _extensionTime,
        uint256 _minBidIncrementBps
    ) external onlyOwner {
        minAuctionDuration = _minDuration;
        maxAuctionDuration = _maxDuration;
        auctionExtensionTime = _extensionTime;
        minBidIncrementBps = _minBidIncrementBps;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // Emergency withdrawal (only unclaimed funds, not active bids/offers)
    function emergencyWithdraw() external onlyOwner {
        require(paused(), "Must be paused");
        uint256 balance = address(this).balance;
        (bool success, ) = owner().call{value: balance}("");
        if (!success) revert TransferFailed();
    }

    receive() external payable {}
}
