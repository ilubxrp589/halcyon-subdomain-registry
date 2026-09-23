const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log("=".repeat(60));
  console.log("CommunityTreasury - Deploy & Seed Claimable Reward");
  console.log("=".repeat(60));
  console.log(`Network: ${network}`);
  console.log(`Deployer/Admin: ${deployer.address}`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${hre.ethers.formatEther(balance)} C2FLR`);
  console.log("");

  // Flare Contract Registry on Coston2
  const FLARE_REGISTRY = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";

  // ── Step 1: Use already-deployed CommunityTreasury ──
  const treasuryAddress = "0x73739F478294eC542d971EEA873A6fD3972ba503";
  console.log(`1. Using existing CommunityTreasury: ${treasuryAddress}`);
  const CommunityTreasury = await hre.ethers.getContractFactory("CommunityTreasury");
  const treasury = CommunityTreasury.attach(treasuryAddress);

  const deploymentsFile = path.join(__dirname, "..", "deployments", "coston2.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));

  // NOTE: Escrow/NFT on Coston2 need redeploying to get setCommunityTreasury.
  // For now, skip setting treasury on old contracts — just seed a claimable reward.
  console.log("\n2. Skipping Escrow/NFT update (requires contract redeploy).");

  // ── Step 3: Fund treasury with some C2FLR to simulate accumulated fees ──
  const seedAmount = hre.ethers.parseEther("5"); // 5 C2FLR
  console.log(`\n3. Funding treasury with ${hre.ethers.formatEther(seedAmount)} C2FLR...`);
  const tx3 = await deployer.sendTransaction({ to: treasuryAddress, value: seedAmount });
  await tx3.wait();
  console.log(`   Funded: ${tx3.hash}`);

  // ── Step 4: Take 2 snapshots ──
  console.log("\n4. Taking snapshots...");
  const snap1Tx = await treasury.takeSnapshot();
  await snap1Tx.wait();
  console.log(`   Snapshot 1 taken: ${snap1Tx.hash}`);

  const snap2Tx = await treasury.takeSnapshot();
  await snap2Tx.wait();
  console.log(`   Snapshot 2 taken: ${snap2Tx.hash}`);

  // ── Step 5: Build Merkle tree with target wallet as claimant ──
  const claimAmount = seedAmount; // 10 C2FLR
  const adminAddress = "0xc24bD0a7bf2867B78BB6a1111c08867838ce4f96";

  console.log(`\n5. Building Merkle tree...`);
  console.log(`   Claimant: ${adminAddress}`);
  console.log(`   Amount: ${hre.ethers.formatEther(claimAmount)} C2FLR`);

  const leaf = hre.ethers.solidityPackedKeccak256(
    ["address", "uint256"],
    [adminAddress, claimAmount]
  );

  const tree = new MerkleTree([leaf], keccak256, { sortPairs: true });
  const merkleRoot = tree.getHexRoot();
  const proof = tree.getHexProof(leaf);

  console.log(`   Merkle root: ${merkleRoot}`);
  console.log(`   Proof: ${JSON.stringify(proof)}`);

  // ── Step 6: Finalize epoch 0 ──
  console.log("\n6. Finalizing epoch 0...");
  const finalizeTx = await treasury.finalizeEpoch(0, merkleRoot, claimAmount);
  await finalizeTx.wait();
  console.log(`   Finalized: ${finalizeTx.hash}`);

  // ── Step 7: Verify claim is valid ──
  console.log("\n7. Verifying claim...");
  const [valid, alreadyClaimed] = await treasury.pendingRewards(0, adminAddress, claimAmount, proof);
  console.log(`   Valid: ${valid}, Already Claimed: ${alreadyClaimed}`);

  // ── Save deployment info ──
  deployments.contracts.CommunityTreasury = treasuryAddress;
  deployments.communityTreasury = {
    address: treasuryAddress,
    deployedAt: new Date().toISOString(),
    seedReward: {
      epochId: 0,
      claimant: adminAddress,
      amount: hre.ethers.formatEther(claimAmount),
      merkleRoot,
      proof,
    },
  };
  fs.writeFileSync(deploymentsFile, JSON.stringify(deployments, null, 2));
  console.log(`\nDeployment info saved to: ${deploymentsFile}`);

  console.log("\n" + "=".repeat(60));
  console.log("Done! Admin wallet can now claim 10 C2FLR from epoch 0.");
  console.log(`Treasury: ${treasuryAddress}`);
  console.log("=".repeat(60));
  console.log("\nTo claim, call:");
  console.log(`  treasury.claimReward(0, ${claimAmount}, ${JSON.stringify(proof)})`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
