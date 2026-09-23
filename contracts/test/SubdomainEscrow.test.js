const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SubdomainEscrow", function () {
  let nft, escrow, priceOracle, dnsOracle;
  let owner, platformRecipient, user1, user2, oracleWallet;

  const TLD = "cryptofans";
  const SUBDOMAIN = "alice";
  const METADATA_URI = "ipfs://QmTest123";

  // Pricing tiers in USD (18 decimals)
  const PRICE_1_CHAR = ethers.parseEther("500");  // Ultra premium
  const PRICE_2_CHAR = ethers.parseEther("200");  // Premium
  const PRICE_3_CHAR = ethers.parseEther("50");   // Standard plus
  const PRICE_4_PLUS = ethers.parseEther("10");   // Standard

  // Mock FLR price: $0.05 per FLR
  const FLR_PRICE_USD = ethers.parseEther("0.05");

  beforeEach(async function () {
    [owner, platformRecipient, user1, user2, oracleWallet] = await ethers.getSigners();

    // Deploy PriceOracle
    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    priceOracle = await PriceOracle.deploy(FLR_PRICE_USD);
    await priceOracle.waitForDeployment();

    // Deploy SubdomainNFT
    const SubdomainNFT = await ethers.getContractFactory("SubdomainNFT");
    nft = await SubdomainNFT.deploy(
      "Halcyon Subdomains",
      "HSUB",
      platformRecipient.address
    );
    await nft.waitForDeployment();

    // Deploy DNSOracle
    const DNSOracle = await ethers.getContractFactory("DNSOracle");
    dnsOracle = await DNSOracle.deploy(ethers.ZeroAddress);
    await dnsOracle.waitForDeployment();

    // Deploy SubdomainEscrow
    const SubdomainEscrow = await ethers.getContractFactory("SubdomainEscrow");
    escrow = await SubdomainEscrow.deploy(
      await nft.getAddress(),
      await priceOracle.getAddress(),
      await dnsOracle.getAddress(),
      platformRecipient.address
    );
    await escrow.waitForDeployment();

    // Configure contracts
    await dnsOracle.setEscrowContract(await escrow.getAddress());

    // Grant roles
    const MINTER_ROLE = await nft.MINTER_ROLE();
    const OPERATOR_ROLE = await nft.OPERATOR_ROLE();
    const ORACLE_ROLE = await dnsOracle.ORACLE_ROLE();

    await nft.grantRole(MINTER_ROLE, await escrow.getAddress());
    await nft.grantRole(OPERATOR_ROLE, await escrow.getAddress());
    await dnsOracle.grantRole(ORACLE_ROLE, oracleWallet.address);
  });

  describe("Deployment", function () {
    it("should set correct NFT contract", async function () {
      expect(await escrow.nftContract()).to.equal(await nft.getAddress());
    });

    it("should set correct price oracle", async function () {
      expect(await escrow.priceOracle()).to.equal(await priceOracle.getAddress());
    });

    it("should set correct platform recipient", async function () {
      expect(await escrow.platformRecipient()).to.equal(platformRecipient.address);
    });

    it("should have reserved common subdomains", async function () {
      const wwwHash = ethers.keccak256(ethers.toUtf8Bytes("www"));
      expect(await escrow.reservedNames(wwwHash)).to.be.true;
    });
  });

  describe("Pricing Tiers", function () {
    it("should return ultra premium price for 1 char", async function () {
      const [price, tier] = await escrow.getPriceTier("a");
      expect(price).to.equal(PRICE_1_CHAR);
      expect(tier).to.equal("ultra_premium");
    });

    it("should return premium price for 2 chars", async function () {
      const [price, tier] = await escrow.getPriceTier("ab");
      expect(price).to.equal(PRICE_2_CHAR);
      expect(tier).to.equal("premium");
    });

    it("should return standard plus price for 3 chars", async function () {
      const [price, tier] = await escrow.getPriceTier("abc");
      expect(price).to.equal(PRICE_3_CHAR);
      expect(tier).to.equal("standard_plus");
    });

    it("should return standard price for 4+ chars", async function () {
      const [price, tier] = await escrow.getPriceTier("alice");
      expect(price).to.equal(PRICE_4_PLUS);
      expect(tier).to.equal("standard");
    });

    it("should calculate correct FLR price", async function () {
      // $10 / $0.05 = 200 FLR
      const flrPrice = await escrow.getCurrentPriceFLR("alice");
      expect(flrPrice).to.equal(ethers.parseEther("200"));
    });
  });

  describe("Purchase Flow", function () {
    it("should create escrow and mint NFT on purchase", async function () {
      const flrPrice = await escrow.getCurrentPriceFLR(SUBDOMAIN);

      await expect(
        escrow.connect(user1).purchaseSubdomain(TLD, SUBDOMAIN, METADATA_URI, {
          value: flrPrice,
        })
      )
        .to.emit(escrow, "SubdomainPurchased")
        .to.emit(nft, "SubdomainMinted");

      // Check NFT was minted
      expect(await nft.ownerOf(1)).to.equal(user1.address);

      // Check escrow was created
      const escrowData = await escrow.getEscrow(1);
      expect(escrowData.buyer).to.equal(user1.address);
      expect(escrowData.subdomain).to.equal(SUBDOMAIN);
      expect(escrowData.status).to.equal(0); // Pending
    });

    it("should refund excess payment", async function () {
      const flrPrice = await escrow.getCurrentPriceFLR(SUBDOMAIN);
      const excess = ethers.parseEther("50");
      const payment = flrPrice + excess;

      const balanceBefore = await ethers.provider.getBalance(user1.address);

      const tx = await escrow.connect(user1).purchaseSubdomain(TLD, SUBDOMAIN, METADATA_URI, {
        value: payment,
      });
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(user1.address);

      // Should only have paid flrPrice + gas, excess refunded
      expect(balanceBefore - balanceAfter).to.be.closeTo(flrPrice + gasCost, ethers.parseEther("0.01"));
    });

    it("should revert if subdomain already registered", async function () {
      const flrPrice = await escrow.getCurrentPriceFLR(SUBDOMAIN);

      await escrow.connect(user1).purchaseSubdomain(TLD, SUBDOMAIN, METADATA_URI, {
        value: flrPrice,
      });

      await expect(
        escrow.connect(user2).purchaseSubdomain(TLD, SUBDOMAIN, METADATA_URI, {
          value: flrPrice,
        })
      ).to.be.revertedWith("Subdomain already registered");
    });

    it("should revert if payment insufficient", async function () {
      const flrPrice = await escrow.getCurrentPriceFLR(SUBDOMAIN);

      await expect(
        escrow.connect(user1).purchaseSubdomain(TLD, SUBDOMAIN, METADATA_URI, {
          value: flrPrice - 1n,
        })
      ).to.be.revertedWith("Insufficient payment");
    });

    it("should revert for reserved subdomain", async function () {
      const flrPrice = await escrow.getCurrentPriceFLR("www");

      await expect(
        escrow.connect(user1).purchaseSubdomain(TLD, "www", METADATA_URI, {
          value: flrPrice,
        })
      ).to.be.revertedWith("Subdomain reserved");
    });

    it("should revert for invalid subdomain format", async function () {
      const flrPrice = ethers.parseEther("1000");

      // Starting with hyphen
      await expect(
        escrow.connect(user1).purchaseSubdomain(TLD, "-invalid", METADATA_URI, {
          value: flrPrice,
        })
      ).to.be.revertedWith("Invalid subdomain format");

      // Ending with hyphen
      await expect(
        escrow.connect(user1).purchaseSubdomain(TLD, "invalid-", METADATA_URI, {
          value: flrPrice,
        })
      ).to.be.revertedWith("Invalid subdomain format");

      // Uppercase (should be lowercase)
      await expect(
        escrow.connect(user1).purchaseSubdomain(TLD, "Invalid", METADATA_URI, {
          value: flrPrice,
        })
      ).to.be.revertedWith("Invalid subdomain format");
    });
  });

  describe("DNS Completion", function () {
    beforeEach(async function () {
      const flrPrice = await escrow.getCurrentPriceFLR(SUBDOMAIN);
      await escrow.connect(user1).purchaseSubdomain(TLD, SUBDOMAIN, METADATA_URI, {
        value: flrPrice,
      });
    });

    it("should complete escrow and release funds to platform", async function () {
      const platformBalanceBefore = await ethers.provider.getBalance(platformRecipient.address);
      const escrowData = await escrow.getEscrow(1);

      // Get requestId from escrowToRequest mapping
      const requestId = await dnsOracle.escrowToRequest(1);
      const hnsBlockHash = ethers.keccak256(ethers.toUtf8Bytes("test-block"));
      const hnsBlockHeight = 12345;

      await expect(dnsOracle.connect(oracleWallet).confirmDNSRegistration(requestId, hnsBlockHash, hnsBlockHeight))
        .to.emit(escrow, "EscrowCompleted");

      const platformBalanceAfter = await ethers.provider.getBalance(platformRecipient.address);
      expect(platformBalanceAfter - platformBalanceBefore).to.equal(escrowData.amountPaid);

      // Check escrow status updated
      const updatedEscrow = await escrow.getEscrow(1);
      expect(updatedEscrow.status).to.equal(1); // Completed

      // Check DNS is active on NFT
      const meta = await nft.subdomains(1);
      expect(meta.dnsActive).to.be.true;
    });
  });

  describe("DNS Failure", function () {
    beforeEach(async function () {
      const flrPrice = await escrow.getCurrentPriceFLR(SUBDOMAIN);
      await escrow.connect(user1).purchaseSubdomain(TLD, SUBDOMAIN, METADATA_URI, {
        value: flrPrice,
      });
    });

    it("should refund buyer on DNS failure", async function () {
      const userBalanceBefore = await ethers.provider.getBalance(user1.address);
      const escrowData = await escrow.getEscrow(1);

      // Get requestId from escrowToRequest mapping
      const requestId = await dnsOracle.escrowToRequest(1);

      await expect(dnsOracle.connect(oracleWallet).failDNSRegistration(requestId, "DNS allocation failed"))
        .to.emit(escrow, "EscrowRefunded");

      const userBalanceAfter = await ethers.provider.getBalance(user1.address);
      expect(userBalanceAfter - userBalanceBefore).to.equal(escrowData.amountPaid);

      // Check escrow status updated
      const updatedEscrow = await escrow.getEscrow(1);
      expect(updatedEscrow.status).to.equal(2); // Refunded

      // Check NFT was burned
      await expect(nft.ownerOf(1)).to.be.reverted;
    });
  });

  describe("Timeout Refund", function () {
    beforeEach(async function () {
      const flrPrice = await escrow.getCurrentPriceFLR(SUBDOMAIN);
      await escrow.connect(user1).purchaseSubdomain(TLD, SUBDOMAIN, METADATA_URI, {
        value: flrPrice,
      });
    });

    it("should not allow timeout refund before 24 hours", async function () {
      await expect(escrow.claimTimeoutRefund(1)).to.be.revertedWith("Not expired");
    });

    it("should allow timeout refund after 24 hours", async function () {
      // Advance time by 24 hours + 1 second
      await time.increase(24 * 60 * 60 + 1);

      const userBalanceBefore = await ethers.provider.getBalance(user1.address);
      const escrowData = await escrow.getEscrow(1);

      await expect(escrow.claimTimeoutRefund(1)).to.emit(escrow, "EscrowRefunded");

      const userBalanceAfter = await ethers.provider.getBalance(user1.address);
      expect(userBalanceAfter - userBalanceBefore).to.equal(escrowData.amountPaid);

      // Check NFT was burned
      await expect(nft.ownerOf(1)).to.be.reverted;
    });

    it("should check isEscrowExpired correctly", async function () {
      expect(await escrow.isEscrowExpired(1)).to.be.false;

      await time.increase(24 * 60 * 60 + 1);

      expect(await escrow.isEscrowExpired(1)).to.be.true;
    });
  });

  describe("Admin Functions", function () {
    it("should allow owner to update prices", async function () {
      await escrow.setPrices(
        ethers.parseEther("1000"), // Ultra premium
        ethers.parseEther("500"),  // Premium
        ethers.parseEther("100"),  // Standard plus
        ethers.parseEther("20")    // Standard
      );

      const [price] = await escrow.getPriceTier("a");
      expect(price).to.equal(ethers.parseEther("1000"));
    });

    it("should allow owner to reserve subdomains", async function () {
      await escrow.reserveSubdomain("special");

      const flrPrice = ethers.parseEther("1000");
      await expect(
        escrow.connect(user1).purchaseSubdomain(TLD, "special", METADATA_URI, {
          value: flrPrice,
        })
      ).to.be.revertedWith("Subdomain reserved");
    });

    it("should allow owner to pause/unpause", async function () {
      await escrow.pause();

      const flrPrice = await escrow.getCurrentPriceFLR(SUBDOMAIN);
      await expect(
        escrow.connect(user1).purchaseSubdomain(TLD, SUBDOMAIN, METADATA_URI, {
          value: flrPrice,
        })
      ).to.be.reverted; // Paused

      await escrow.unpause();

      // Should work after unpause
      await expect(
        escrow.connect(user1).purchaseSubdomain(TLD, SUBDOMAIN, METADATA_URI, {
          value: flrPrice,
        })
      ).to.not.be.reverted;
    });

    it("should allow emergency withdraw when paused", async function () {
      const flrPrice = await escrow.getCurrentPriceFLR(SUBDOMAIN);
      await escrow.connect(user1).purchaseSubdomain(TLD, SUBDOMAIN, METADATA_URI, {
        value: flrPrice,
      });

      // Cannot withdraw when not paused
      await expect(escrow.emergencyWithdraw()).to.be.revertedWith("Must be paused");

      await escrow.pause();

      const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
      const tx = await escrow.emergencyWithdraw();
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);

      expect(ownerBalanceAfter - ownerBalanceBefore + gasCost).to.equal(flrPrice);
    });
  });

  describe("View Functions", function () {
    it("should return total escrows", async function () {
      expect(await escrow.totalEscrows()).to.equal(0);

      const flrPrice = await escrow.getCurrentPriceFLR(SUBDOMAIN);
      await escrow.connect(user1).purchaseSubdomain(TLD, SUBDOMAIN, METADATA_URI, {
        value: flrPrice,
      });

      expect(await escrow.totalEscrows()).to.equal(1);
    });
  });
});
