const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

describe("CommunityTreasury", function () {
  let treasury, nft, escrow, priceOracle, dnsOracle;
  let owner, admin, claimer, snapshotter, user1, user2, platformRecipient, oracleWallet;

  const TLD = "cryptofans";
  const FLR_PRICE_USD = ethers.parseEther("0.05");

  // Helper to build merkle tree from claims
  function buildMerkleTree(claims) {
    const leaves = claims.map(c =>
      ethers.solidityPackedKeccak256(["address", "uint256"], [c.address, c.amount])
    );
    const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    return { tree, leaves };
  }

  beforeEach(async function () {
    [owner, admin, claimer, snapshotter, user1, user2, platformRecipient, oracleWallet] =
      await ethers.getSigners();

    // Deploy CommunityTreasury (no Flare registry in test)
    const CommunityTreasury = await ethers.getContractFactory("CommunityTreasury");
    treasury = await CommunityTreasury.deploy(admin.address, ethers.ZeroAddress);
    await treasury.waitForDeployment();

    // Grant roles
    await treasury.connect(admin).grantRole(await treasury.CLAIMER_ROLE(), claimer.address);
    await treasury.connect(admin).grantRole(await treasury.SNAPSHOT_ROLE(), snapshotter.address);

    // Deploy NFT
    const SubdomainNFT = await ethers.getContractFactory("SubdomainNFT");
    nft = await SubdomainNFT.deploy("Halcyon Subdomains", "HSUB", platformRecipient.address);
    await nft.waitForDeployment();

    // Deploy PriceOracle
    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    priceOracle = await PriceOracle.deploy(FLR_PRICE_USD);
    await priceOracle.waitForDeployment();

    // Deploy DNSOracle
    const DNSOracle = await ethers.getContractFactory("DNSOracle");
    dnsOracle = await DNSOracle.deploy(ethers.ZeroAddress);
    await dnsOracle.waitForDeployment();

    // Deploy Escrow
    const SubdomainEscrow = await ethers.getContractFactory("SubdomainEscrow");
    escrow = await SubdomainEscrow.deploy(
      await nft.getAddress(),
      await priceOracle.getAddress(),
      await dnsOracle.getAddress(),
      platformRecipient.address
    );
    await escrow.waitForDeployment();

    // Configure DNS Oracle
    await dnsOracle.setEscrowContract(await escrow.getAddress());

    // Grant roles
    const MINTER_ROLE = await nft.MINTER_ROLE();
    const OPERATOR_ROLE = await nft.OPERATOR_ROLE();
    const ORACLE_ROLE = await dnsOracle.ORACLE_ROLE();

    await nft.grantRole(MINTER_ROLE, await escrow.getAddress());
    await nft.grantRole(OPERATOR_ROLE, await escrow.getAddress());
    await dnsOracle.grantRole(ORACLE_ROLE, oracleWallet.address);

    // Set community treasury on escrow and NFT
    await escrow.setCommunityTreasury(await treasury.getAddress());
    await nft.setCommunityTreasury(await treasury.getAddress());

    // Disable commit delay for legacy takeSnapshot in tests
    await treasury.connect(admin).setSnapshotParams(0, 0);
  });

  describe("Treasury Basics", function () {
    it("should accept FLR payments", async function () {
      await owner.sendTransaction({
        to: await treasury.getAddress(),
        value: ethers.parseEther("100"),
      });
      expect(await treasury.totalReceived()).to.equal(ethers.parseEther("100"));
    });

    it("should track total received", async function () {
      await owner.sendTransaction({ to: await treasury.getAddress(), value: ethers.parseEther("50") });
      await user1.sendTransaction({ to: await treasury.getAddress(), value: ethers.parseEther("30") });
      expect(await treasury.totalReceived()).to.equal(ethers.parseEther("80"));
    });
  });

  describe("Escrow 6% Split", function () {
    it("should send 6% to treasury on registration completion", async function () {
      // Register a domain through escrow
      const flrAmount = await escrow.getCurrentPriceFLR("alice");

      await escrow.connect(user1).purchaseSubdomain(
        TLD, "alice", "ipfs://test",
        { value: flrAmount }
      );

      const escrowData = await escrow.getEscrow(1);
      const amountPaid = escrowData.amountPaid;

      const treasuryBalBefore = await ethers.provider.getBalance(await treasury.getAddress());
      const platformBalBefore = await ethers.provider.getBalance(platformRecipient.address);

      // Complete DNS via oracle
      const requestId = await dnsOracle.escrowToRequest(1);
      const hnsBlockHash = ethers.keccak256(ethers.toUtf8Bytes("test-block"));
      await dnsOracle.connect(oracleWallet).confirmDNSRegistration(requestId, hnsBlockHash, 12345);

      const treasuryBalAfter = await ethers.provider.getBalance(await treasury.getAddress());
      const platformBalAfter = await ethers.provider.getBalance(platformRecipient.address);

      const communityShare = (amountPaid * 600n) / 10000n; // 6%
      const platformShare = amountPaid - communityShare;     // 94%

      expect(treasuryBalAfter - treasuryBalBefore).to.equal(communityShare);
      expect(platformBalAfter - platformBalBefore).to.equal(platformShare);
    });
  });

  describe("NFT 6% Renewal Split", function () {
    it("should send 6% to treasury on renewal", async function () {
      // Mint a domain first
      const MINTER_ROLE = await nft.MINTER_ROLE();
      await nft.grantRole(MINTER_ROLE, owner.address);
      const priceFLR = ethers.parseEther("200");
      const expiresAt = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
      await nft.mint(
        user1.address, TLD, "alice", expiresAt, priceFLR, ethers.parseEther("10"), "ipfs://test"
      );

      const tokenId = 1;
      const renewalPrice = await nft.getRenewalPrice(tokenId);

      const treasuryBalBefore = await ethers.provider.getBalance(await treasury.getAddress());

      await nft.connect(user1).renewDomain(tokenId, { value: renewalPrice });

      const treasuryBalAfter = await ethers.provider.getBalance(await treasury.getAddress());
      const communityShare = (renewalPrice * 600n) / 10000n;

      expect(treasuryBalAfter - treasuryBalBefore).to.equal(communityShare);
    });
  });

  describe("Snapshot System", function () {
    it("should allow SNAPSHOT_ROLE to take snapshots", async function () {
      await treasury.connect(snapshotter).takeSnapshot();
      const epoch = await treasury.getEpoch(0);
      expect(epoch.snapshot1Block).to.be.gt(0);
    });

    it("should allow 2 snapshots per epoch", async function () {
      await treasury.connect(snapshotter).takeSnapshot();
      await treasury.connect(snapshotter).takeSnapshot();
      const epoch = await treasury.getEpoch(0);
      expect(epoch.snapshot1Block).to.be.gt(0);
      expect(epoch.snapshot2Block).to.be.gt(0);
    });

    it("should revert on 3rd snapshot", async function () {
      await treasury.connect(snapshotter).takeSnapshot();
      await treasury.connect(snapshotter).takeSnapshot();
      await expect(treasury.connect(snapshotter).takeSnapshot())
        .to.be.revertedWith("Both snapshots already taken");
    });

    it("should reject non-SNAPSHOT_ROLE callers", async function () {
      await expect(treasury.connect(user1).takeSnapshot())
        .to.be.reverted;
    });
  });

  describe("Merkle Distribution", function () {
    let claims, merkleRoot, tree;

    beforeEach(async function () {
      // Fund treasury
      await owner.sendTransaction({
        to: await treasury.getAddress(),
        value: ethers.parseEther("100"),
      });

      // Take 2 snapshots
      await treasury.connect(snapshotter).takeSnapshot();
      await treasury.connect(snapshotter).takeSnapshot();

      // Build merkle tree
      claims = [
        { address: user1.address, amount: ethers.parseEther("60") },
        { address: user2.address, amount: ethers.parseEther("40") },
      ];

      const result = buildMerkleTree(claims);
      tree = result.tree;
      merkleRoot = tree.getHexRoot();
    });

    it("should finalize epoch with merkle root", async function () {
      await treasury.connect(admin).finalizeEpoch(0, merkleRoot, ethers.parseEther("100"));

      const epoch = await treasury.getEpoch(0);
      expect(epoch.finalized).to.be.true;
      expect(epoch.merkleRoot).to.equal(merkleRoot);
      expect(epoch.totalReward).to.equal(ethers.parseEther("100"));
    });

    it("should allow valid claim with proof", async function () {
      await treasury.connect(admin).finalizeEpoch(0, merkleRoot, ethers.parseEther("100"));

      const leaf = ethers.solidityPackedKeccak256(
        ["address", "uint256"],
        [user1.address, ethers.parseEther("60")]
      );
      const proof = tree.getHexProof(leaf);

      const balBefore = await ethers.provider.getBalance(user1.address);
      const tx = await treasury.connect(user1).claimReward(0, ethers.parseEther("60"), proof);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const balAfter = await ethers.provider.getBalance(user1.address);

      expect(balAfter - balBefore + gasCost).to.equal(ethers.parseEther("60"));
    });

    it("should reject invalid proof", async function () {
      await treasury.connect(admin).finalizeEpoch(0, merkleRoot, ethers.parseEther("100"));

      const fakeProof = [ethers.keccak256(ethers.toUtf8Bytes("fake"))];

      await expect(
        treasury.connect(user1).claimReward(0, ethers.parseEther("60"), fakeProof)
      ).to.be.revertedWith("Invalid proof");
    });

    it("should prevent double claiming", async function () {
      await treasury.connect(admin).finalizeEpoch(0, merkleRoot, ethers.parseEther("100"));

      const leaf = ethers.solidityPackedKeccak256(
        ["address", "uint256"],
        [user1.address, ethers.parseEther("60")]
      );
      const proof = tree.getHexProof(leaf);

      await treasury.connect(user1).claimReward(0, ethers.parseEther("60"), proof);
      await expect(
        treasury.connect(user1).claimReward(0, ethers.parseEther("60"), proof)
      ).to.be.revertedWith("Already claimed");
    });

    it("should reject claim for non-finalized epoch", async function () {
      await expect(
        treasury.connect(user1).claimReward(0, ethers.parseEther("60"), [])
      ).to.be.revertedWith("Epoch not finalized");
    });

    it("pendingRewards should return correct status", async function () {
      await treasury.connect(admin).finalizeEpoch(0, merkleRoot, ethers.parseEther("100"));

      const leaf = ethers.solidityPackedKeccak256(
        ["address", "uint256"],
        [user1.address, ethers.parseEther("60")]
      );
      const proof = tree.getHexProof(leaf);

      const [valid, claimed] = await treasury.pendingRewards(
        0, user1.address, ethers.parseEther("60"), proof
      );
      expect(valid).to.be.true;
      expect(claimed).to.be.false;
    });
  });

  describe("Delegation Config", function () {
    it("should allow admin to set delegation", async function () {
      await treasury.connect(admin).setDelegation(
        user1.address, 5000, user2.address, 5000
      );

      const d = await treasury.getDelegation();
      expect(d._provider1).to.equal(user1.address);
      expect(d._bips1).to.equal(5000);
      expect(d._provider2).to.equal(user2.address);
      expect(d._bips2).to.equal(5000);
    });

    it("should reject total bips > 10000", async function () {
      await expect(
        treasury.connect(admin).setDelegation(user1.address, 6000, user2.address, 5000)
      ).to.be.revertedWith("Total bips exceeds 100%");
    });

    it("should reject non-admin callers", async function () {
      await expect(
        treasury.connect(user1).setDelegation(user1.address, 5000, user2.address, 5000)
      ).to.be.reverted;
    });
  });

  describe("Commit-Reveal Snapshots", function () {
    beforeEach(async function () {
      // Enable commit delay (10 blocks)
      await treasury.connect(admin).setSnapshotParams(10, 0);
    });

    it("should commit a future snapshot block", async function () {
      const tx = await treasury.connect(snapshotter).commitSnapshot();
      const receipt = await tx.wait();

      const epoch = await treasury.getEpoch(0);
      // commit1.targetBlock should be current block + 10
      expect(receipt).to.emit(treasury, "SnapshotCommitted");
    });

    it("should reject executeSnapshot before target block", async function () {
      await treasury.connect(snapshotter).commitSnapshot();

      // Try to execute immediately — should fail
      await expect(treasury.executeSnapshot())
        .to.be.revertedWith("Target block not reached");
    });

    it("should allow anyone to executeSnapshot after target block", async function () {
      await treasury.connect(snapshotter).commitSnapshot();

      // Mine enough blocks to pass the target
      for (let i = 0; i < 11; i++) {
        await ethers.provider.send("evm_mine");
      }

      // user1 (not keeper) can execute — permissionless
      await treasury.connect(user1).executeSnapshot();

      const epoch = await treasury.getEpoch(0);
      expect(epoch.snapshot1Block).to.be.gt(0);
    });

    it("should enforce minimum gap between snapshots", async function () {
      // Set 1 day min gap
      await treasury.connect(admin).setSnapshotParams(10, 86400);

      // Commit + execute snapshot 1
      await treasury.connect(snapshotter).commitSnapshot();
      for (let i = 0; i < 11; i++) await ethers.provider.send("evm_mine");
      await treasury.executeSnapshot();

      // Try to commit snapshot 2 immediately — should fail
      await expect(treasury.connect(snapshotter).commitSnapshot())
        .to.be.revertedWith("Too soon after snapshot 1");
    });

    it("should allow snapshot 2 after gap passes", async function () {
      await treasury.connect(admin).setSnapshotParams(10, 60); // 60 second gap

      // Snapshot 1
      await treasury.connect(snapshotter).commitSnapshot();
      for (let i = 0; i < 11; i++) await ethers.provider.send("evm_mine");
      await treasury.executeSnapshot();

      // Advance time past gap
      await time.increase(61);

      // Snapshot 2
      await treasury.connect(snapshotter).commitSnapshot();
      for (let i = 0; i < 11; i++) await ethers.provider.send("evm_mine");
      await treasury.executeSnapshot();

      const epoch = await treasury.getEpoch(0);
      expect(epoch.snapshot1Block).to.be.gt(0);
      expect(epoch.snapshot2Block).to.be.gt(0);
    });

    it("should reject takeSnapshot when commitDelay > 0", async function () {
      await expect(treasury.connect(snapshotter).takeSnapshot())
        .to.be.revertedWith("Use commitSnapshot + executeSnapshot");
    });
  });

  describe("Fee Cap Enforcement", function () {
    it("should enforce max 10% on escrow community fee", async function () {
      await expect(escrow.setCommunityFeeBps(1001))
        .to.be.revertedWith("Max 10%");
    });

    it("should enforce max 10% on NFT community fee", async function () {
      await expect(nft.setCommunityFeeBps(1001))
        .to.be.revertedWith("Max 10%");
    });

    it("should allow setting fee to 0", async function () {
      await escrow.setCommunityFeeBps(0);
      expect(await escrow.communityFeeBps()).to.equal(0);
    });
  });

  describe("Emergency Functions", function () {
    it("should allow admin emergency withdraw", async function () {
      await owner.sendTransaction({
        to: await treasury.getAddress(),
        value: ethers.parseEther("10"),
      });

      const balBefore = await ethers.provider.getBalance(admin.address);
      const tx = await treasury.connect(admin).emergencyWithdraw(admin.address, ethers.parseEther("10"));
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const balAfter = await ethers.provider.getBalance(admin.address);

      expect(balAfter - balBefore + gasCost).to.equal(ethers.parseEther("10"));
    });

    it("should reject non-admin emergency withdraw", async function () {
      await expect(
        treasury.connect(user1).emergencyWithdraw(user1.address, ethers.parseEther("1"))
      ).to.be.reverted;
    });
  });
});
