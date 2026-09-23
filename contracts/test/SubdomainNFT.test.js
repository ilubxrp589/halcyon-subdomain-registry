const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SubdomainNFT", function () {
  let nft;
  let owner, minter, user1, user2, royaltyRecipient;

  const TLD = "cryptofans";
  const SUBDOMAIN = "alice";
  const METADATA_URI = "ipfs://QmTest123";
  const PRICE_FLR = ethers.parseEther("100");
  const PRICE_USD = ethers.parseEther("10"); // $10

  beforeEach(async function () {
    [owner, minter, user1, user2, royaltyRecipient] = await ethers.getSigners();

    const SubdomainNFT = await ethers.getContractFactory("SubdomainNFT");
    nft = await SubdomainNFT.deploy(
      "Halcyon Subdomains",
      "HSUB",
      royaltyRecipient.address
    );
    await nft.waitForDeployment();

    // Grant MINTER_ROLE to minter
    const MINTER_ROLE = await nft.MINTER_ROLE();
    await nft.grantRole(MINTER_ROLE, minter.address);
  });

  describe("Deployment", function () {
    it("should set correct name and symbol", async function () {
      expect(await nft.name()).to.equal("Halcyon Subdomains");
      expect(await nft.symbol()).to.equal("HSUB");
    });

    it("should set royalty recipient", async function () {
      expect(await nft.royaltyRecipient()).to.equal(royaltyRecipient.address);
    });

    it("should grant admin and minter roles to deployer", async function () {
      const DEFAULT_ADMIN_ROLE = await nft.DEFAULT_ADMIN_ROLE();
      const MINTER_ROLE = await nft.MINTER_ROLE();

      expect(await nft.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
      expect(await nft.hasRole(MINTER_ROLE, owner.address)).to.be.true;
    });

    it("should set default royalty to 2.5%", async function () {
      expect(await nft.DEFAULT_ROYALTY_BPS()).to.equal(250);
    });
  });

  describe("Minting", function () {
    it("should mint a subdomain NFT", async function () {
      await expect(
        nft.connect(minter).mint(
          user1.address,
          TLD,
          SUBDOMAIN,
          0, // No expiration
          PRICE_FLR,
          PRICE_USD,
          METADATA_URI
        )
      ).to.emit(nft, "SubdomainMinted");

      expect(await nft.ownerOf(1)).to.equal(user1.address);
      expect(await nft.totalMinted()).to.equal(1);
    });

    it("should store correct metadata", async function () {
      await nft.connect(minter).mint(
        user1.address,
        TLD,
        SUBDOMAIN,
        0,
        PRICE_FLR,
        PRICE_USD,
        METADATA_URI
      );

      const meta = await nft.subdomains(1);
      expect(meta.tld).to.equal(TLD);
      expect(meta.subdomain).to.equal(SUBDOMAIN);
      expect(meta.pricePaidFLR).to.equal(PRICE_FLR);
      expect(meta.pricePaidUSD).to.equal(PRICE_USD);
    });

    it("should revert if subdomain already exists", async function () {
      await nft.connect(minter).mint(
        user1.address,
        TLD,
        SUBDOMAIN,
        0,
        PRICE_FLR,
        PRICE_USD,
        METADATA_URI
      );

      await expect(
        nft.connect(minter).mint(
          user2.address,
          TLD,
          SUBDOMAIN,
          0,
          PRICE_FLR,
          PRICE_USD,
          METADATA_URI
        )
      ).to.be.revertedWith("Subdomain already exists");
    });

    it("should revert if called by non-minter", async function () {
      await expect(
        nft.connect(user1).mint(
          user1.address,
          TLD,
          SUBDOMAIN,
          0,
          PRICE_FLR,
          PRICE_USD,
          METADATA_URI
        )
      ).to.be.reverted;
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await nft.connect(minter).mint(
        user1.address,
        TLD,
        SUBDOMAIN,
        0,
        PRICE_FLR,
        PRICE_USD,
        METADATA_URI
      );
    });

    it("should return full domain", async function () {
      expect(await nft.getFullDomain(1)).to.equal(`${SUBDOMAIN}.${TLD}`);
    });

    it("should check if subdomain exists", async function () {
      const [exists, tokenId] = await nft.subdomainExists(SUBDOMAIN, TLD);
      expect(exists).to.be.true;
      expect(tokenId).to.equal(1);

      const [notExists] = await nft.subdomainExists("bob", TLD);
      expect(notExists).to.be.false;
    });

    it("should return token URI", async function () {
      expect(await nft.tokenURI(1)).to.equal(METADATA_URI);
    });
  });

  describe("Enumerable Functions", function () {
    beforeEach(async function () {
      // Mint 3 domains to user1
      await nft.connect(minter).mint(user1.address, TLD, "alice", 0, PRICE_FLR, PRICE_USD, METADATA_URI);
      await nft.connect(minter).mint(user1.address, TLD, "bob", 0, PRICE_FLR, PRICE_USD, METADATA_URI);
      await nft.connect(minter).mint(user1.address, TLD, "charlie", 0, PRICE_FLR, PRICE_USD, METADATA_URI);
      // Mint 1 to user2
      await nft.connect(minter).mint(user2.address, TLD, "dave", 0, PRICE_FLR, PRICE_USD, METADATA_URI);
    });

    it("should return correct balance", async function () {
      expect(await nft.balanceOf(user1.address)).to.equal(3);
      expect(await nft.balanceOf(user2.address)).to.equal(1);
    });

    it("should return domains owned by address", async function () {
      const tokens = await nft.getDomainsOwned(user1.address);
      expect(tokens.length).to.equal(3);
      expect(tokens[0]).to.equal(1);
      expect(tokens[1]).to.equal(2);
      expect(tokens[2]).to.equal(3);
    });

    it("should return token by index", async function () {
      expect(await nft.tokenOfOwnerByIndex(user1.address, 0)).to.equal(1);
      expect(await nft.tokenOfOwnerByIndex(user1.address, 1)).to.equal(2);
    });

    it("should return total supply", async function () {
      expect(await nft.totalSupply()).to.equal(4);
    });
  });

  describe("Domain Status", function () {
    it("should return Active (0) for non-expiring domain", async function () {
      await nft.connect(minter).mint(user1.address, TLD, SUBDOMAIN, 0, PRICE_FLR, PRICE_USD, METADATA_URI);
      expect(await nft.getDomainStatus(1)).to.equal(0);
    });

    it("should return Active (0) for domain with distant expiration", async function () {
      const farFuture = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year
      await nft.connect(minter).mint(user1.address, TLD, SUBDOMAIN, farFuture, PRICE_FLR, PRICE_USD, METADATA_URI);
      expect(await nft.getDomainStatus(1)).to.equal(0);
    });

    it("should return ExpiringSoon (1) within 30 days of expiration", async function () {
      const soon = Math.floor(Date.now() / 1000) + 15 * 24 * 60 * 60; // 15 days
      await nft.connect(minter).mint(user1.address, TLD, SUBDOMAIN, soon, PRICE_FLR, PRICE_USD, METADATA_URI);
      expect(await nft.getDomainStatus(1)).to.equal(1);
    });

    it("should return GracePeriod (2) after expiration", async function () {
      const past = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
      await nft.connect(minter).mint(user1.address, TLD, SUBDOMAIN, past, PRICE_FLR, PRICE_USD, METADATA_URI);
      expect(await nft.getDomainStatus(1)).to.equal(2);
    });

    it("should return Expired (3) after grace period (60 days)", async function () {
      const longPast = Math.floor(Date.now() / 1000) - 61 * 24 * 60 * 60; // 61 days ago
      await nft.connect(minter).mint(user1.address, TLD, SUBDOMAIN, longPast, PRICE_FLR, PRICE_USD, METADATA_URI);
      expect(await nft.getDomainStatus(1)).to.equal(3);
    });

    it("should return GracePeriod (2) at 30 days past expiry (within 60-day grace)", async function () {
      const past = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60; // 30 days ago
      await nft.connect(minter).mint(user1.address, TLD, SUBDOMAIN, past, PRICE_FLR, PRICE_USD, METADATA_URI);
      expect(await nft.getDomainStatus(1)).to.equal(2);
    });
  });

  describe("Renewal", function () {
    beforeEach(async function () {
      await nft.connect(minter).mint(
        user1.address,
        TLD,
        SUBDOMAIN,
        0, // No expiration initially
        PRICE_FLR,
        PRICE_USD,
        METADATA_URI
      );
    });

    it("should calculate renewal price as 50% of original", async function () {
      const renewalPrice = await nft.getRenewalPrice(1);
      expect(renewalPrice).to.equal(PRICE_FLR / 2n);
    });

    it("should allow owner to renew", async function () {
      const renewalPrice = await nft.getRenewalPrice(1);

      await expect(
        nft.connect(user1).renewDomain(1, { value: renewalPrice })
      ).to.emit(nft, "RenewalPaid");

      const meta = await nft.subdomains(1);
      expect(meta.expiresAt).to.be.gt(0);
    });

    it("should revert if not owner", async function () {
      const renewalPrice = await nft.getRenewalPrice(1);

      await expect(
        nft.connect(user2).renewDomain(1, { value: renewalPrice })
      ).to.be.revertedWithCustomError(nft, "NotTokenOwner");
    });

    it("should revert if insufficient payment", async function () {
      const renewalPrice = await nft.getRenewalPrice(1);

      await expect(
        nft.connect(user1).renewDomain(1, { value: renewalPrice - 1n })
      ).to.be.revertedWithCustomError(nft, "InsufficientPayment");
    });

    it("should refund excess payment", async function () {
      const renewalPrice = await nft.getRenewalPrice(1);
      const excess = ethers.parseEther("10");
      const balanceBefore = await ethers.provider.getBalance(user1.address);

      const tx = await nft.connect(user1).renewDomain(1, { value: renewalPrice + excess });
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(user1.address);
      // Balance should be: before - renewalPrice - gasCost (excess refunded)
      expect(balanceAfter).to.be.closeTo(balanceBefore - renewalPrice - gasCost, ethers.parseEther("0.001"));
    });

    it("should extend expiration when renewing active domain", async function () {
      const renewalPrice = await nft.getRenewalPrice(1);

      // First renewal sets expiration
      await nft.connect(user1).renewDomain(1, { value: renewalPrice });
      const meta1 = await nft.subdomains(1);
      const firstExpiration = meta1.expiresAt;

      // Second renewal should extend
      await nft.connect(user1).renewDomain(1, { value: renewalPrice });
      const meta2 = await nft.subdomains(1);

      const oneYear = 365n * 24n * 60n * 60n;
      expect(meta2.expiresAt).to.equal(firstExpiration + oneYear);
    });
  });

  describe("Release (Burn)", function () {
    beforeEach(async function () {
      await nft.connect(minter).mint(
        user1.address,
        TLD,
        SUBDOMAIN,
        0,
        PRICE_FLR,
        PRICE_USD,
        METADATA_URI
      );
    });

    it("should allow owner to release domain", async function () {
      await expect(nft.connect(user1).release(1))
        .to.emit(nft, "SubdomainReleased")
        .withArgs(1, user1.address, TLD, SUBDOMAIN, `${SUBDOMAIN}.${TLD}`);

      await expect(nft.ownerOf(1)).to.be.reverted;
    });

    it("should make subdomain available for re-registration", async function () {
      await nft.connect(user1).release(1);

      // Should be able to mint same subdomain again
      await expect(
        nft.connect(minter).mint(
          user2.address,
          TLD,
          SUBDOMAIN,
          0,
          PRICE_FLR,
          PRICE_USD,
          METADATA_URI
        )
      ).to.not.be.reverted;

      expect(await nft.ownerOf(2)).to.equal(user2.address);
    });

    it("should revert if not owner", async function () {
      await expect(nft.connect(user2).release(1)).to.be.revertedWith(
        "Not owner or approved"
      );
    });
  });

  describe("Metadata Freeze", function () {
    it("should allow admin to freeze metadata", async function () {
      await nft.setBaseURI("https://api.halcyon.io/metadata/");

      await expect(nft.freezeMetadata())
        .to.emit(nft, "MetadataFrozen");

      expect(await nft.metadataFrozen()).to.be.true;
    });

    it("should prevent base URI changes after freeze", async function () {
      await nft.freezeMetadata();

      await expect(
        nft.setBaseURI("https://malicious.com/")
      ).to.be.revertedWithCustomError(nft, "MetadataIsFrozen");
    });

    it("should revert if already frozen", async function () {
      await nft.freezeMetadata();
      await expect(nft.freezeMetadata()).to.be.revertedWith("Already frozen");
    });
  });

  describe("Royalties (ERC-2981)", function () {
    beforeEach(async function () {
      await nft.connect(minter).mint(
        user1.address,
        TLD,
        SUBDOMAIN,
        0,
        PRICE_FLR,
        PRICE_USD,
        METADATA_URI
      );
    });

    it("should return correct royalty info", async function () {
      const salePrice = ethers.parseEther("1000");
      const [recipient, amount] = await nft.royaltyInfo(1, salePrice);

      expect(recipient).to.equal(royaltyRecipient.address);
      // 2.5% royalty
      expect(amount).to.equal(salePrice * 250n / 10000n);
    });
  });

  describe("DNS Status", function () {
    beforeEach(async function () {
      await nft.connect(minter).mint(
        user1.address,
        TLD,
        SUBDOMAIN,
        0,
        PRICE_FLR,
        PRICE_USD,
        METADATA_URI
      );
    });

    it("should start with DNS inactive", async function () {
      const meta = await nft.subdomains(1);
      expect(meta.dnsActive).to.be.false;
    });

    it("should allow operator to update DNS status", async function () {
      const OPERATOR_ROLE = await nft.OPERATOR_ROLE();
      await nft.grantRole(OPERATOR_ROLE, minter.address);

      await expect(nft.connect(minter).updateDNSStatus(1, true))
        .to.emit(nft, "DNSStatusUpdated")
        .withArgs(1, true);

      const meta = await nft.subdomains(1);
      expect(meta.dnsActive).to.be.true;
    });
  });

  describe("Grace Period Configuration", function () {
    it("should default to 60 days", async function () {
      expect(await nft.gracePeriod()).to.equal(60 * 24 * 60 * 60);
    });

    it("should allow admin to set grace period", async function () {
      await nft.setGracePeriod(90 * 24 * 60 * 60); // 90 days
      expect(await nft.gracePeriod()).to.equal(90 * 24 * 60 * 60);
    });

    it("should reject grace period below 7 days", async function () {
      await expect(
        nft.setGracePeriod(6 * 24 * 60 * 60)
      ).to.be.revertedWith("Min 7 days");
    });

    it("should reject grace period above 180 days", async function () {
      await expect(
        nft.setGracePeriod(181 * 24 * 60 * 60)
      ).to.be.revertedWith("Max 180 days");
    });

    it("should reject non-admin caller", async function () {
      await expect(
        nft.connect(user1).setGracePeriod(90 * 24 * 60 * 60)
      ).to.be.reverted;
    });
  });

  describe("Treasury Address", function () {
    it("should default to zero address", async function () {
      expect(await nft.treasuryAddress()).to.equal(ethers.ZeroAddress);
    });

    it("should allow admin to set treasury", async function () {
      await nft.setTreasuryAddress(user2.address);
      expect(await nft.treasuryAddress()).to.equal(user2.address);
    });

    it("should reject zero address", async function () {
      await expect(
        nft.setTreasuryAddress(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid treasury");
    });

    it("should reject non-admin caller", async function () {
      await expect(
        nft.connect(user1).setTreasuryAddress(user2.address)
      ).to.be.reverted;
    });
  });

  describe("Reclaim Expired", function () {
    let treasury;

    beforeEach(async function () {
      [, , , , , treasury] = await ethers.getSigners();

      // Set treasury
      await nft.setTreasuryAddress(treasury.address);

      // Grant OPERATOR_ROLE to owner for testing
      const OPERATOR_ROLE = await nft.OPERATOR_ROLE();
      await nft.grantRole(OPERATOR_ROLE, owner.address);
    });

    it("should reclaim expired domain past grace period", async function () {
      // Mint with expiry 61 days ago
      const pastExpiry = Math.floor(Date.now() / 1000) - 61 * 24 * 60 * 60;
      await nft.connect(minter).mint(user1.address, TLD, SUBDOMAIN, pastExpiry, PRICE_FLR, PRICE_USD, METADATA_URI);

      await expect(nft.reclaimExpired(1))
        .to.emit(nft, "DomainReclaimed")
        .withArgs(1, user1.address, treasury.address);

      // Token should now be owned by treasury
      expect(await nft.ownerOf(1)).to.equal(treasury.address);
    });

    it("should preserve metadata after reclaim", async function () {
      const pastExpiry = Math.floor(Date.now() / 1000) - 61 * 24 * 60 * 60;
      await nft.connect(minter).mint(user1.address, TLD, SUBDOMAIN, pastExpiry, PRICE_FLR, PRICE_USD, METADATA_URI);

      await nft.reclaimExpired(1);

      const meta = await nft.subdomains(1);
      expect(meta.tld).to.equal(TLD);
      expect(meta.subdomain).to.equal(SUBDOMAIN);
      expect(await nft.tokenURI(1)).to.equal(METADATA_URI);
    });

    it("should revert if still in grace period", async function () {
      const recentExpiry = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60; // 30 days ago
      await nft.connect(minter).mint(user1.address, TLD, SUBDOMAIN, recentExpiry, PRICE_FLR, PRICE_USD, METADATA_URI);

      await expect(nft.reclaimExpired(1)).to.be.revertedWith("Still in grace period");
    });

    it("should revert if domain never expires", async function () {
      await nft.connect(minter).mint(user1.address, TLD, SUBDOMAIN, 0, PRICE_FLR, PRICE_USD, METADATA_URI);

      await expect(nft.reclaimExpired(1)).to.be.revertedWith("Domain never expires");
    });

    it("should revert if treasury not set", async function () {
      await nft.setTreasuryAddress(ethers.ZeroAddress).catch(() => {});
      // Deploy fresh contract without treasury
      const SubdomainNFT = await ethers.getContractFactory("SubdomainNFT");
      const nft2 = await SubdomainNFT.deploy("Test", "TST", royaltyRecipient.address);
      await nft2.waitForDeployment();
      const OPERATOR_ROLE = await nft2.OPERATOR_ROLE();
      await nft2.grantRole(OPERATOR_ROLE, owner.address);
      const MINTER_ROLE = await nft2.MINTER_ROLE();
      await nft2.grantRole(MINTER_ROLE, minter.address);

      const pastExpiry = Math.floor(Date.now() / 1000) - 61 * 24 * 60 * 60;
      await nft2.connect(minter).mint(user1.address, TLD, SUBDOMAIN, pastExpiry, PRICE_FLR, PRICE_USD, METADATA_URI);

      await expect(nft2.reclaimExpired(1)).to.be.revertedWith("Treasury not set");
    });

    it("should revert if called by non-operator", async function () {
      const pastExpiry = Math.floor(Date.now() / 1000) - 61 * 24 * 60 * 60;
      await nft.connect(minter).mint(user1.address, TLD, SUBDOMAIN, pastExpiry, PRICE_FLR, PRICE_USD, METADATA_URI);

      await expect(nft.connect(user1).reclaimExpired(1)).to.be.reverted;
    });
  });

  describe("Fee Withdrawal", function () {
    it("should allow admin to withdraw accumulated fees", async function () {
      // Mint and renew to accumulate fees
      await nft.connect(minter).mint(user1.address, TLD, SUBDOMAIN, 0, PRICE_FLR, PRICE_USD, METADATA_URI);
      const renewalPrice = await nft.getRenewalPrice(1);
      await nft.connect(user1).renewDomain(1, { value: renewalPrice });

      const contractBalance = await ethers.provider.getBalance(await nft.getAddress());
      expect(contractBalance).to.equal(renewalPrice);

      const recipientBalanceBefore = await ethers.provider.getBalance(royaltyRecipient.address);
      await nft.withdrawFees(royaltyRecipient.address);
      const recipientBalanceAfter = await ethers.provider.getBalance(royaltyRecipient.address);

      expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(renewalPrice);
    });
  });
});
