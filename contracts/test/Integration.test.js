const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Integration Tests", function () {
  let nft, escrow, priceOracle, dnsOracle;
  let owner, platformRecipient, user1, user2, oracleWallet;

  const TLD = "cryptofans";
  const FLR_PRICE_USD = ethers.parseEther("0.05");

  beforeEach(async function () {
    [owner, platformRecipient, user1, user2, oracleWallet] = await ethers.getSigners();

    // Deploy all contracts
    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    priceOracle = await PriceOracle.deploy(FLR_PRICE_USD);
    await priceOracle.waitForDeployment();

    const SubdomainNFT = await ethers.getContractFactory("SubdomainNFT");
    nft = await SubdomainNFT.deploy("Halcyon Subdomains", "HSUB", platformRecipient.address);
    await nft.waitForDeployment();

    const DNSOracle = await ethers.getContractFactory("DNSOracle");
    dnsOracle = await DNSOracle.deploy(ethers.ZeroAddress);
    await dnsOracle.waitForDeployment();

    const SubdomainEscrow = await ethers.getContractFactory("SubdomainEscrow");
    escrow = await SubdomainEscrow.deploy(
      await nft.getAddress(),
      await priceOracle.getAddress(),
      await dnsOracle.getAddress(),
      platformRecipient.address
    );
    await escrow.waitForDeployment();

    // Configure
    await dnsOracle.setEscrowContract(await escrow.getAddress());
    await nft.grantRole(await nft.MINTER_ROLE(), await escrow.getAddress());
    await nft.grantRole(await nft.OPERATOR_ROLE(), await escrow.getAddress());
    await dnsOracle.grantRole(await dnsOracle.ORACLE_ROLE(), oracleWallet.address);
  });

  describe("Full Purchase to Ownership Flow", function () {
    it("should complete entire purchase flow successfully", async function () {
      // 1. Get price for subdomain
      const flrPrice = await escrow.getCurrentPriceFLR("myname");
      expect(flrPrice).to.equal(ethers.parseEther("200")); // $10 / $0.05

      // 2. Purchase subdomain
      const tx = await escrow.connect(user1).purchaseSubdomain(
        TLD,
        "myname",
        "ipfs://QmMetadata",
        { value: flrPrice }
      );
      const receipt = await tx.wait();

      // 3. Verify escrow created
      const escrowData = await escrow.getEscrow(1);
      expect(escrowData.buyer).to.equal(user1.address);
      expect(escrowData.status).to.equal(0); // Pending

      // 4. Verify NFT minted (optimistic)
      expect(await nft.ownerOf(1)).to.equal(user1.address);

      // 5. DNS oracle confirms (get requestId first)
      const requestId = await dnsOracle.escrowToRequest(1);
      const hnsBlockHash = ethers.keccak256(ethers.toUtf8Bytes("test-block"));
      await dnsOracle.connect(oracleWallet).confirmDNSRegistration(requestId, hnsBlockHash, 12345);

      // 6. Verify escrow completed
      const completedEscrow = await escrow.getEscrow(1);
      expect(completedEscrow.status).to.equal(1); // Completed

      // 7. Verify DNS is active
      const meta = await nft.subdomains(1);
      expect(meta.dnsActive).to.be.true;

      // 8. Verify owner can view domains
      const tokens = await nft.getDomainsOwned(user1.address);
      expect(tokens.length).to.equal(1);
      expect(tokens[0]).to.equal(1n);

      // 9. Verify full domain string
      const fullDomain = await nft.getFullDomain(1);
      expect(fullDomain).to.equal("myname.cryptofans");
    });
  });

  describe("Purchase with Renewal Flow", function () {
    it("should allow purchase then renewal", async function () {
      // Purchase
      const flrPrice = await escrow.getCurrentPriceFLR("myname");
      await escrow.connect(user1).purchaseSubdomain(
        TLD,
        "myname",
        "ipfs://QmMetadata",
        { value: flrPrice }
      );

      // Complete DNS
      const requestId = await dnsOracle.escrowToRequest(1);
      await dnsOracle.connect(oracleWallet).confirmDNSRegistration(requestId, ethers.ZeroHash, 1);

      // Check initial state (no expiration set by escrow)
      let meta = await nft.subdomains(1);
      expect(meta.expiresAt).to.equal(0);

      // Renew (sets expiration)
      const renewalPrice = await nft.getRenewalPrice(1);
      expect(renewalPrice).to.equal(flrPrice / 2n); // 50%

      await nft.connect(user1).renewDomain(1, { value: renewalPrice });

      // Check expiration is now set
      meta = await nft.subdomains(1);
      expect(meta.expiresAt).to.be.gt(0);

      // Status should be Active
      expect(await nft.getDomainStatus(1)).to.equal(0);
    });
  });

  describe("Failed Purchase Refund Flow", function () {
    it("should refund on DNS failure", async function () {
      const flrPrice = await escrow.getCurrentPriceFLR("myname");
      const userBalanceBefore = await ethers.provider.getBalance(user1.address);

      // Purchase
      const tx = await escrow.connect(user1).purchaseSubdomain(
        TLD,
        "myname",
        "ipfs://QmMetadata",
        { value: flrPrice }
      );
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      // DNS fails
      const requestId = await dnsOracle.escrowToRequest(1);
      await dnsOracle.connect(oracleWallet).failDNSRegistration(requestId, "DNS allocation failed");

      // Check user got refund
      const userBalanceAfter = await ethers.provider.getBalance(user1.address);
      expect(userBalanceBefore - userBalanceAfter).to.be.closeTo(gasCost, ethers.parseEther("0.01"));

      // NFT should be burned
      await expect(nft.ownerOf(1)).to.be.reverted;

      // Subdomain should be available again
      const [exists] = await nft.subdomainExists("myname", TLD);
      expect(exists).to.be.false;
    });
  });

  describe("Multi-User Scenario", function () {
    it("should handle multiple users purchasing different subdomains", async function () {
      const subdomains = ["alice", "bob", "charlie", "dave"];
      const users = [user1, user1, user2, user2];

      for (let i = 0; i < subdomains.length; i++) {
        const flrPrice = await escrow.getCurrentPriceFLR(subdomains[i]);
        await escrow.connect(users[i]).purchaseSubdomain(
          TLD,
          subdomains[i],
          `ipfs://Qm${subdomains[i]}`,
          { value: flrPrice }
        );
      }

      // Confirm all DNS
      for (let i = 1; i <= 4; i++) {
        const requestId = await dnsOracle.escrowToRequest(i);
        await dnsOracle.connect(oracleWallet).confirmDNSRegistration(requestId, ethers.ZeroHash, i);
      }

      // Check ownership
      const user1Tokens = await nft.getDomainsOwned(user1.address);
      const user2Tokens = await nft.getDomainsOwned(user2.address);

      expect(user1Tokens.length).to.equal(2);
      expect(user2Tokens.length).to.equal(2);

      // Check total supply
      expect(await nft.totalSupply()).to.equal(4);
    });
  });

  describe("Transfer and DNS Update Flow", function () {
    it("should emit DNS update event on transfer", async function () {
      // Purchase and confirm
      const flrPrice = await escrow.getCurrentPriceFLR("myname");
      await escrow.connect(user1).purchaseSubdomain(TLD, "myname", "ipfs://Qm", { value: flrPrice });
      const requestId = await dnsOracle.escrowToRequest(1);
      await dnsOracle.connect(oracleWallet).confirmDNSRegistration(requestId, ethers.ZeroHash, 1);

      // Transfer should emit DNSUpdateRequired
      await expect(
        nft.connect(user1).transferFrom(user1.address, user2.address, 1)
      ).to.emit(nft, "DNSUpdateRequired").withArgs(1, user2.address, "myname.cryptofans");

      // Verify new owner
      expect(await nft.ownerOf(1)).to.equal(user2.address);
    });
  });

  describe("Release and Re-register Flow", function () {
    it("should allow release and re-registration by different user", async function () {
      // User1 purchases
      const flrPrice = await escrow.getCurrentPriceFLR("myname");
      await escrow.connect(user1).purchaseSubdomain(TLD, "myname", "ipfs://Qm1", { value: flrPrice });
      let requestId = await dnsOracle.escrowToRequest(1);
      await dnsOracle.connect(oracleWallet).confirmDNSRegistration(requestId, ethers.ZeroHash, 1);

      // User1 releases
      await nft.connect(user1).release(1);

      // User2 can now purchase same subdomain
      await escrow.connect(user2).purchaseSubdomain(TLD, "myname", "ipfs://Qm2", { value: flrPrice });
      requestId = await dnsOracle.escrowToRequest(2);
      await dnsOracle.connect(oracleWallet).confirmDNSRegistration(requestId, ethers.ZeroHash, 2);

      // Verify new owner
      expect(await nft.ownerOf(2)).to.equal(user2.address);

      // Old token should not exist
      await expect(nft.ownerOf(1)).to.be.reverted;
    });
  });

  describe("Price Tier Integration", function () {
    it("should charge different prices based on subdomain length", async function () {
      const testCases = [
        { subdomain: "a", expectedUSD: 500 },      // 1 char - ultra premium
        { subdomain: "ab", expectedUSD: 200 },     // 2 char - premium
        { subdomain: "abc", expectedUSD: 50 },     // 3 char - standard plus
        { subdomain: "abcd", expectedUSD: 10 },    // 4 char - standard
        { subdomain: "alice", expectedUSD: 10 },   // 5 char - standard
      ];

      for (const tc of testCases) {
        const flrPrice = await escrow.getCurrentPriceFLR(tc.subdomain);
        // USD price / FLR price = FLR amount
        // e.g., $500 / $0.05 = 10000 FLR
        const expectedFLR = ethers.parseEther(String(tc.expectedUSD / 0.05));
        expect(flrPrice).to.equal(expectedFLR);
      }
    });
  });

  describe("Royalty Integration", function () {
    it("should return correct royalty info for secondary sales", async function () {
      // Purchase
      const flrPrice = await escrow.getCurrentPriceFLR("myname");
      await escrow.connect(user1).purchaseSubdomain(TLD, "myname", "ipfs://Qm", { value: flrPrice });
      const requestId = await dnsOracle.escrowToRequest(1);
      await dnsOracle.connect(oracleWallet).confirmDNSRegistration(requestId, ethers.ZeroHash, 1);

      // Check royalty info (2.5%)
      const salePrice = ethers.parseEther("1000");
      const [recipient, amount] = await nft.royaltyInfo(1, salePrice);

      expect(recipient).to.equal(platformRecipient.address);
      expect(amount).to.equal(salePrice * 250n / 10000n); // 2.5%
    });
  });

  describe("Edge Cases", function () {
    it("should handle max length subdomain (63 chars)", async function () {
      const maxSubdomain = "a".repeat(63);
      const flrPrice = await escrow.getCurrentPriceFLR(maxSubdomain);

      await expect(
        escrow.connect(user1).purchaseSubdomain(TLD, maxSubdomain, "ipfs://Qm", { value: flrPrice })
      ).to.not.be.reverted;
    });

    it("should reject subdomain over 63 chars", async function () {
      const tooLong = "a".repeat(64);
      const flrPrice = ethers.parseEther("1000");

      await expect(
        escrow.connect(user1).purchaseSubdomain(TLD, tooLong, "ipfs://Qm", { value: flrPrice })
      ).to.be.revertedWith("Subdomain too long");
    });

    it("should handle subdomain with numbers and hyphens", async function () {
      const subdomain = "test-123-abc";
      const flrPrice = await escrow.getCurrentPriceFLR(subdomain);

      await expect(
        escrow.connect(user1).purchaseSubdomain(TLD, subdomain, "ipfs://Qm", { value: flrPrice })
      ).to.not.be.reverted;

      const requestId = await dnsOracle.escrowToRequest(1);
      await dnsOracle.connect(oracleWallet).confirmDNSRegistration(requestId, ethers.ZeroHash, 1);
      expect(await nft.getFullDomain(1)).to.equal(`${subdomain}.${TLD}`);
    });
  });
});
