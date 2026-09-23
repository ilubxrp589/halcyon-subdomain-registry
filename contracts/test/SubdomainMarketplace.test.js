const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SubdomainMarketplace", function () {
  let nft, marketplace, priceOracle, dnsOracle, escrow;
  let owner, feeRecipient, seller, buyer, bidder1, bidder2, oracleWallet;

  const TLD = "cryptofans";
  const METADATA_URI = "ipfs://QmTest123";
  const FLR_PRICE_USD = ethers.parseEther("0.05");

  // Helper to mint and setup a subdomain for seller
  async function mintSubdomain(subdomain, to) {
    const flrPrice = await escrow.getCurrentPriceFLR(subdomain);
    await escrow.connect(to).purchaseSubdomain(TLD, subdomain, METADATA_URI, { value: flrPrice });
    const tokenId = await nft.totalMinted();
    const requestId = await dnsOracle.escrowToRequest(tokenId);
    await dnsOracle.connect(oracleWallet).confirmDNSRegistration(requestId, ethers.ZeroHash, 1);
    return tokenId;
  }

  beforeEach(async function () {
    [owner, feeRecipient, seller, buyer, bidder1, bidder2, oracleWallet] = await ethers.getSigners();

    // Deploy infrastructure
    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    priceOracle = await PriceOracle.deploy(FLR_PRICE_USD);
    await priceOracle.waitForDeployment();

    const SubdomainNFT = await ethers.getContractFactory("SubdomainNFT");
    nft = await SubdomainNFT.deploy("Halcyon Subdomains", "HSUB", feeRecipient.address);
    await nft.waitForDeployment();

    const DNSOracle = await ethers.getContractFactory("DNSOracle");
    dnsOracle = await DNSOracle.deploy(ethers.ZeroAddress);
    await dnsOracle.waitForDeployment();

    const SubdomainEscrow = await ethers.getContractFactory("SubdomainEscrow");
    escrow = await SubdomainEscrow.deploy(
      await nft.getAddress(),
      await priceOracle.getAddress(),
      await dnsOracle.getAddress(),
      feeRecipient.address
    );
    await escrow.waitForDeployment();

    // Configure escrow
    await dnsOracle.setEscrowContract(await escrow.getAddress());
    await nft.grantRole(await nft.MINTER_ROLE(), await escrow.getAddress());
    await nft.grantRole(await nft.OPERATOR_ROLE(), await escrow.getAddress());
    await dnsOracle.grantRole(await dnsOracle.ORACLE_ROLE(), oracleWallet.address);

    // Deploy Marketplace
    const SubdomainMarketplace = await ethers.getContractFactory("SubdomainMarketplace");
    marketplace = await SubdomainMarketplace.deploy(
      await nft.getAddress(),
      feeRecipient.address
    );
    await marketplace.waitForDeployment();
  });

  describe("Deployment", function () {
    it("should set correct NFT contract", async function () {
      expect(await marketplace.nftContract()).to.equal(await nft.getAddress());
    });

    it("should set correct fee recipient", async function () {
      expect(await marketplace.feeRecipient()).to.equal(feeRecipient.address);
    });

    it("should set default platform fee to 2.5%", async function () {
      expect(await marketplace.platformFeeBps()).to.equal(250);
    });
  });

  describe("Fixed Price Listings", function () {
    let tokenId;

    beforeEach(async function () {
      tokenId = await mintSubdomain("alice", seller);
      // Approve marketplace
      await nft.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);
    });

    it("should create a fixed price listing", async function () {
      const price = ethers.parseEther("100");

      await expect(marketplace.connect(seller).listFixedPrice(tokenId, price))
        .to.emit(marketplace, "Listed")
        .withArgs(1, tokenId, seller.address, price, 0, 0); // ListingType.FixedPrice = 0

      const listing = await marketplace.getListing(1);
      expect(listing.seller).to.equal(seller.address);
      expect(listing.price).to.equal(price);
      expect(listing.listingType).to.equal(0); // FixedPrice
      expect(listing.status).to.equal(0); // Active
    });

    it("should allow buyer to purchase", async function () {
      const price = ethers.parseEther("100");
      await marketplace.connect(seller).listFixedPrice(tokenId, price);

      const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
      const feeRecipientBalanceBefore = await ethers.provider.getBalance(feeRecipient.address);

      await expect(marketplace.connect(buyer).buyNow(1, { value: price }))
        .to.emit(marketplace, "Sale");

      // Verify NFT transferred
      expect(await nft.ownerOf(tokenId)).to.equal(buyer.address);

      // Verify fees distributed (2.5% royalty + 2.5% platform = 5% total fees)
      const royalty = price * 250n / 10000n; // 2.5%
      const platformFee = price * 250n / 10000n; // 2.5%
      const sellerProceeds = price - royalty - platformFee;

      const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(sellerProceeds);
    });

    it("should revert if not approved", async function () {
      // Revoke approval
      await nft.connect(seller).setApprovalForAll(await marketplace.getAddress(), false);

      const price = ethers.parseEther("100");
      await expect(
        marketplace.connect(seller).listFixedPrice(tokenId, price)
      ).to.be.revertedWithCustomError(marketplace, "NotApproved");
    });

    it("should revert if price too low", async function () {
      const lowPrice = ethers.parseEther("0.001");
      await expect(
        marketplace.connect(seller).listFixedPrice(tokenId, lowPrice)
      ).to.be.revertedWithCustomError(marketplace, "InvalidPrice");
    });

    it("should allow seller to update price", async function () {
      const price = ethers.parseEther("100");
      await marketplace.connect(seller).listFixedPrice(tokenId, price);

      const newPrice = ethers.parseEther("150");
      await expect(marketplace.connect(seller).updatePrice(1, newPrice))
        .to.emit(marketplace, "PriceUpdated")
        .withArgs(1, price, newPrice);

      const listing = await marketplace.getListing(1);
      expect(listing.price).to.equal(newPrice);
    });

    it("should allow seller to cancel listing", async function () {
      const price = ethers.parseEther("100");
      await marketplace.connect(seller).listFixedPrice(tokenId, price);

      await expect(marketplace.connect(seller).cancelListing(1))
        .to.emit(marketplace, "ListingCancelled")
        .withArgs(1, tokenId);

      expect(await marketplace.isTokenListed(tokenId)).to.be.false;
    });

    it("should refund excess payment", async function () {
      const price = ethers.parseEther("100");
      await marketplace.connect(seller).listFixedPrice(tokenId, price);

      const excess = ethers.parseEther("50");
      const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);

      const tx = await marketplace.connect(buyer).buyNow(1, { value: price + excess });
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
      // Buyer should have paid price + gas, not price + excess + gas
      expect(buyerBalanceBefore - buyerBalanceAfter).to.be.closeTo(price + gasCost, ethers.parseEther("0.01"));
    });
  });

  describe("Auctions", function () {
    let tokenId;

    beforeEach(async function () {
      tokenId = await mintSubdomain("premium", seller);
      await nft.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);
    });

    it("should create an auction listing", async function () {
      const startingPrice = ethers.parseEther("50");
      const duration = 24 * 60 * 60; // 24 hours

      await expect(marketplace.connect(seller).listAuction(tokenId, startingPrice, duration))
        .to.emit(marketplace, "Listed");

      const listing = await marketplace.getListing(1);
      expect(listing.listingType).to.equal(1); // Auction
      expect(listing.endTime).to.be.gt(0);
    });

    it("should allow bidding", async function () {
      const startingPrice = ethers.parseEther("50");
      const duration = 24 * 60 * 60;
      await marketplace.connect(seller).listAuction(tokenId, startingPrice, duration);

      const bidAmount = ethers.parseEther("60");
      await expect(marketplace.connect(bidder1).placeBid(1, { value: bidAmount }))
        .to.emit(marketplace, "BidPlaced")
        .withArgs(1, tokenId, bidder1.address, bidAmount);

      const listing = await marketplace.getListing(1);
      expect(listing.highestBidder).to.equal(bidder1.address);
      expect(listing.highestBid).to.equal(bidAmount);
    });

    it("should refund previous bidder when outbid", async function () {
      const startingPrice = ethers.parseEther("50");
      const duration = 24 * 60 * 60;
      await marketplace.connect(seller).listAuction(tokenId, startingPrice, duration);

      // First bid
      const bid1 = ethers.parseEther("60");
      await marketplace.connect(bidder1).placeBid(1, { value: bid1 });

      // Second bid (5% higher minimum)
      const bid2 = ethers.parseEther("70");
      const bidder1BalanceBefore = await ethers.provider.getBalance(bidder1.address);

      await expect(marketplace.connect(bidder2).placeBid(1, { value: bid2 }))
        .to.emit(marketplace, "BidRefunded")
        .withArgs(1, bidder1.address, bid1);

      const bidder1BalanceAfter = await ethers.provider.getBalance(bidder1.address);
      expect(bidder1BalanceAfter - bidder1BalanceBefore).to.equal(bid1);
    });

    it("should require minimum bid increment", async function () {
      const startingPrice = ethers.parseEther("100");
      const duration = 24 * 60 * 60;
      await marketplace.connect(seller).listAuction(tokenId, startingPrice, duration);

      // First bid
      await marketplace.connect(bidder1).placeBid(1, { value: startingPrice });

      // Second bid below 5% increment should fail
      const lowBid = startingPrice + ethers.parseEther("1"); // Only 1% higher
      await expect(
        marketplace.connect(bidder2).placeBid(1, { value: lowBid })
      ).to.be.revertedWithCustomError(marketplace, "BidTooLow");
    });

    it("should extend auction if bid in last 10 minutes", async function () {
      const startingPrice = ethers.parseEther("50");
      const duration = 24 * 60 * 60;
      await marketplace.connect(seller).listAuction(tokenId, startingPrice, duration);

      // Fast forward to 5 minutes before end
      await time.increase(duration - 5 * 60);

      const listingBefore = await marketplace.getListing(1);
      const endTimeBefore = listingBefore.endTime;

      // Place bid
      await marketplace.connect(bidder1).placeBid(1, { value: startingPrice });

      const listingAfter = await marketplace.getListing(1);
      expect(listingAfter.endTime).to.be.gt(endTimeBefore);
    });

    it("should settle auction with winner", async function () {
      const startingPrice = ethers.parseEther("50");
      const duration = 24 * 60 * 60;
      await marketplace.connect(seller).listAuction(tokenId, startingPrice, duration);

      // Place bid
      const bidAmount = ethers.parseEther("100");
      await marketplace.connect(bidder1).placeBid(1, { value: bidAmount });

      // Fast forward past auction end
      await time.increase(duration + 1);

      // Settle
      await expect(marketplace.settleAuction(1)).to.emit(marketplace, "Sale");

      expect(await nft.ownerOf(tokenId)).to.equal(bidder1.address);
    });

    it("should cancel auction with no bids", async function () {
      const startingPrice = ethers.parseEther("50");
      const duration = 24 * 60 * 60;
      await marketplace.connect(seller).listAuction(tokenId, startingPrice, duration);

      // Fast forward past auction end
      await time.increase(duration + 1);

      // Settle with no bids
      await expect(marketplace.settleAuction(1))
        .to.emit(marketplace, "ListingCancelled");

      expect(await nft.ownerOf(tokenId)).to.equal(seller.address);
    });

    it("should prevent seller from bidding on own auction", async function () {
      const startingPrice = ethers.parseEther("50");
      const duration = 24 * 60 * 60;
      await marketplace.connect(seller).listAuction(tokenId, startingPrice, duration);

      await expect(
        marketplace.connect(seller).placeBid(1, { value: startingPrice })
      ).to.be.revertedWithCustomError(marketplace, "CannotBidOwnListing");
    });

    it("should prevent cancelling auction with bids", async function () {
      const startingPrice = ethers.parseEther("50");
      const duration = 24 * 60 * 60;
      await marketplace.connect(seller).listAuction(tokenId, startingPrice, duration);

      await marketplace.connect(bidder1).placeBid(1, { value: startingPrice });

      await expect(
        marketplace.connect(seller).cancelListing(1)
      ).to.be.revertedWithCustomError(marketplace, "AuctionNotEnded");
    });
  });

  describe("Offers", function () {
    let tokenId;

    beforeEach(async function () {
      tokenId = await mintSubdomain("offer-test", seller);
    });

    it("should allow making an offer", async function () {
      const offerAmount = ethers.parseEther("75");
      const expiresIn = 7 * 24 * 60 * 60; // 7 days

      await expect(
        marketplace.connect(buyer).makeOffer(tokenId, expiresIn, { value: offerAmount })
      ).to.emit(marketplace, "OfferMade");

      const offer = await marketplace.getOffer(1);
      expect(offer.offerer).to.equal(buyer.address);
      expect(offer.amount).to.equal(offerAmount);
    });

    it("should allow owner to accept offer", async function () {
      // Approve marketplace
      await nft.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);

      const offerAmount = ethers.parseEther("75");
      const expiresIn = 7 * 24 * 60 * 60;
      await marketplace.connect(buyer).makeOffer(tokenId, expiresIn, { value: offerAmount });

      await expect(marketplace.connect(seller).acceptOffer(1))
        .to.emit(marketplace, "OfferAccepted");

      expect(await nft.ownerOf(tokenId)).to.equal(buyer.address);
    });

    it("should allow offerer to cancel offer", async function () {
      const offerAmount = ethers.parseEther("75");
      const expiresIn = 7 * 24 * 60 * 60;
      await marketplace.connect(buyer).makeOffer(tokenId, expiresIn, { value: offerAmount });

      const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);

      const tx = await marketplace.connect(buyer).cancelOffer(1);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
      expect(buyerBalanceAfter - buyerBalanceBefore + gasCost).to.equal(offerAmount);
    });

    it("should allow withdrawing expired offer", async function () {
      const offerAmount = ethers.parseEther("75");
      const expiresIn = 1 * 60 * 60; // 1 hour
      await marketplace.connect(buyer).makeOffer(tokenId, expiresIn, { value: offerAmount });

      // Fast forward past expiration
      await time.increase(expiresIn + 1);

      const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);

      const tx = await marketplace.connect(buyer).withdrawExpiredOffer(1);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
      expect(buyerBalanceAfter - buyerBalanceBefore + gasCost).to.equal(offerAmount);
    });

    it("should reject expired offer acceptance", async function () {
      await nft.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);

      const offerAmount = ethers.parseEther("75");
      const expiresIn = 1 * 60 * 60;
      await marketplace.connect(buyer).makeOffer(tokenId, expiresIn, { value: offerAmount });

      await time.increase(expiresIn + 1);

      await expect(
        marketplace.connect(seller).acceptOffer(1)
      ).to.be.revertedWithCustomError(marketplace, "OfferExpired");
    });

    it("should cancel active listing when offer accepted", async function () {
      await nft.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);

      // Create listing
      const listingPrice = ethers.parseEther("100");
      await marketplace.connect(seller).listFixedPrice(tokenId, listingPrice);

      // Make offer
      const offerAmount = ethers.parseEther("90");
      const expiresIn = 7 * 24 * 60 * 60;
      await marketplace.connect(buyer).makeOffer(tokenId, expiresIn, { value: offerAmount });

      // Accept offer
      await marketplace.connect(seller).acceptOffer(1);

      // Listing should be cancelled
      expect(await marketplace.isTokenListed(tokenId)).to.be.false;
    });
  });

  describe("View Functions", function () {
    it("should track user listings", async function () {
      const tokenId1 = await mintSubdomain("domain1", seller);
      const tokenId2 = await mintSubdomain("domain2", seller);
      await nft.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);

      await marketplace.connect(seller).listFixedPrice(tokenId1, ethers.parseEther("100"));
      await marketplace.connect(seller).listFixedPrice(tokenId2, ethers.parseEther("200"));

      const userListings = await marketplace.getUserListings(seller.address);
      expect(userListings.length).to.equal(2);
    });

    it("should track token offers", async function () {
      const tokenId = await mintSubdomain("offers-test", seller);

      await marketplace.connect(buyer).makeOffer(tokenId, 86400, { value: ethers.parseEther("50") });
      await marketplace.connect(bidder1).makeOffer(tokenId, 86400, { value: ethers.parseEther("60") });

      const tokenOffers = await marketplace.getTokenOffers(tokenId);
      expect(tokenOffers.length).to.equal(2);
    });
  });

  describe("Admin Functions", function () {
    it("should allow owner to set platform fee", async function () {
      await marketplace.setPlatformFee(500); // 5%
      expect(await marketplace.platformFeeBps()).to.equal(500);
    });

    it("should reject fee over 10%", async function () {
      await expect(marketplace.setPlatformFee(1100)).to.be.revertedWith("Max 10%");
    });

    it("should allow pausing", async function () {
      await marketplace.pause();

      const tokenId = await mintSubdomain("pause-test", seller);
      await nft.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);

      await expect(
        marketplace.connect(seller).listFixedPrice(tokenId, ethers.parseEther("100"))
      ).to.be.reverted;
    });
  });
});
