const hre = require("hardhat");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const claimant = "0xc24bD0a7bf2867B78BB6a1111c08867838ce4f96";
  const FLARE_REGISTRY = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Deployer balance: ${hre.ethers.formatEther(balance)} C2FLR`);

  // Redeploy treasury with updated contract (commit-reveal support)
  console.log("\n0. Redeploying CommunityTreasury (v2 with commit-reveal)...");
  const CommunityTreasury = await hre.ethers.getContractFactory("CommunityTreasury");
  const treasury = await CommunityTreasury.deploy(deployer.address, FLARE_REGISTRY);
  await treasury.waitForDeployment();
  const treasuryAddress = await treasury.getAddress();
  console.log(`   New treasury: ${treasuryAddress}`);

  // Set commit delay to 0 for this test (so we can use legacy takeSnapshot)
  await (await treasury.setSnapshotParams(0, 0)).wait();

  const currentEpoch = await treasury.currentEpochId();
  console.log(`   Current epoch: ${currentEpoch}`);

  // Fund treasury with 1 C2FLR
  const seedAmount = hre.ethers.parseEther("1");
  console.log(`\n1. Funding treasury with 1 C2FLR...`);
  const tx1 = await deployer.sendTransaction({ to: treasuryAddress, value: seedAmount });
  await tx1.wait();
  console.log(`   Done: ${tx1.hash}`);

  // Take 2 snapshots (delay=0, using legacy takeSnapshot)
  console.log(`\n2. Taking snapshots...`);
  await (await treasury.takeSnapshot()).wait();
  await (await treasury.takeSnapshot()).wait();
  console.log(`   Both snapshots taken`);

  // Restore commit delay for production use
  await (await treasury.setSnapshotParams(100, 86400)).wait();
  console.log(`   Restored commit delay=100, minGap=1day`);

  // Build Merkle tree
  console.log(`\n3. Building Merkle tree for epoch ${currentEpoch}...`);
  const leaf = hre.ethers.solidityPackedKeccak256(
    ["address", "uint256"], [claimant, seedAmount]
  );
  const tree = new MerkleTree([leaf], keccak256, { sortPairs: true });
  const merkleRoot = tree.getHexRoot();
  const proof = tree.getHexProof(leaf);

  console.log(`   Claimant: ${claimant}`);
  console.log(`   Amount: 1 C2FLR`);
  console.log(`   Root: ${merkleRoot}`);

  // Finalize
  console.log(`\n4. Finalizing epoch ${currentEpoch}...`);
  const ftx = await treasury.finalizeEpoch(currentEpoch, merkleRoot, seedAmount);
  await ftx.wait();
  console.log(`   Finalized: ${ftx.hash}`);

  // Verify
  const [valid, claimed] = await treasury.pendingRewards(currentEpoch, claimant, seedAmount, proof);
  console.log(`\n5. Verified: valid=${valid}, claimed=${claimed}`);

  // Update deployments file
  const fs = require("fs");
  const path = require("path");
  const deploymentsFile = path.join(__dirname, "..", "deployments", "coston2.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));
  deployments.contracts.CommunityTreasury = treasuryAddress;
  fs.writeFileSync(deploymentsFile, JSON.stringify(deployments, null, 2));

  console.log(`\nDone! Epoch ${currentEpoch}: 1 C2FLR claimable for ${claimant}`);
  console.log(`Treasury: ${treasuryAddress}`);
  console.log(`\nUpdate frontend .env.local NEXT_PUBLIC_COMMUNITY_TREASURY_ADDRESS=${treasuryAddress}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
