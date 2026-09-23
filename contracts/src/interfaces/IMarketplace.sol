// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IMarketplace
 * @notice Interface for SubdomainMarketplace
 */
interface IMarketplace {
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
        uint256 price;
        uint256 endTime;
        ListingType listingType;
        ListingStatus status;
        address highestBidder;
        uint256 highestBid;
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

    // Listing functions
    function listFixedPrice(uint256 tokenId, uint256 price) external returns (uint256 listingId);
    function listAuction(uint256 tokenId, uint256 startingPrice, uint256 duration) external returns (uint256 listingId);
    function updatePrice(uint256 listingId, uint256 newPrice) external;
    function cancelListing(uint256 listingId) external;

    // Buying functions
    function buyNow(uint256 listingId) external payable;
    function placeBid(uint256 listingId) external payable;
    function settleAuction(uint256 listingId) external;

    // Offer functions
    function makeOffer(uint256 tokenId, uint256 expiresIn) external payable returns (uint256 offerId);
    function acceptOffer(uint256 offerId) external;
    function cancelOffer(uint256 offerId) external;

    // View functions
    function getListing(uint256 listingId) external view returns (Listing memory);
    function getOffer(uint256 offerId) external view returns (Offer memory);
    function isTokenListed(uint256 tokenId) external view returns (bool);

    // Events
    event Listed(uint256 indexed listingId, uint256 indexed tokenId, address indexed seller, uint256 price, ListingType listingType, uint256 endTime);
    event Sale(uint256 indexed listingId, uint256 indexed tokenId, address indexed seller, address buyer, uint256 price, uint256 royaltyAmount, uint256 platformFee);
    event ListingCancelled(uint256 indexed listingId, uint256 indexed tokenId);
    event BidPlaced(uint256 indexed listingId, uint256 indexed tokenId, address indexed bidder, uint256 amount);
    event OfferMade(uint256 indexed offerId, uint256 indexed tokenId, address indexed offerer, uint256 amount, uint256 expiresAt);
    event OfferAccepted(uint256 indexed offerId, uint256 indexed tokenId, address seller, address buyer, uint256 amount);
}
