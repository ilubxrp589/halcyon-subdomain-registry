const hre = require("hardhat");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  const provider = new ethers.JsonRpcProvider("https://coston2-api.flare.network/ext/C/rpc");

  // Deployer has admin role on treasury
  const deployerKey = process.env.PRIVATE_KEY;
  const deployer = new ethers.Wallet(deployerKey, provider);

  // Backend wallet has funds
  const backendKey = "REDACTED";
  const backend = new ethers.Wallet(backendKey, provider);

  const treasuryAddress = "0xc87Bd36cdeBaa9C632e641F0865192b0DD67bAeD";
  const claimant = "0xc24bD0a7bf2867B78BB6a1111c08867838ce4f96";
  const seedAmount = ethers.parseEther("2");

  console.log(`Backend balance: ${ethers.formatEther(await provider.getBalance(backend.address))} C2FLR`);
  console.log(`Deployer balance: ${ethers.formatEther(await provider.getBalance(deployer.address))} C2FLR`);

  // Step 1: Backend wallet funds the treasury
  console.log(`\n1. Backend wallet funding treasury with 2 C2FLR...`);
  const fundTx = await backend.sendTransaction({ to: treasuryAddress, value: seedAmount });
  await fundTx.wait();
  console.log(`   Done: ${fundTx.hash}`);

  // Step 2: Also send deployer some gas for admin calls
  console.log(`\n2. Sending deployer 0.5 C2FLR for gas...`);
  const gasTx = await backend.sendTransaction({ to: deployer.address, value: ethers.parseEther("0.5") });
  await gasTx.wait();
  console.log(`   Done: ${gasTx.hash}`);

  // Step 3: Use deployer (admin) for treasury admin calls
  const TREASURY_ABI = [
    "function takeSnapshot() external",
    "function setSnapshotParams(uint256 _commitDelay, uint256 _minGap) external",
    "function finalizeEpoch(uint256 epochId, bytes32 merkleRoot, uint256 totalReward) external",
    "function currentEpochId() external view returns (uint256)",
    "function pendingRewards(uint256 epochId, address user, uint256 amount, bytes32[] calldata proof) external view returns (bool valid, bool alreadyClaimed)",
  ];
  const treasury = new ethers.Contract(treasuryAddress, TREASURY_ABI, deployer);

  const epochId = await treasury.currentEpochId();
  console.log(`\n3. Current epoch: ${epochId}`);

  // Temporarily set delay=0 for snapshots
  console.log(`   Setting commit delay to 0...`);
  await (await treasury.setSnapshotParams(0, 0)).wait();

  console.log(`   Taking snapshot 1...`);
  await (await treasury.takeSnapshot()).wait();
  console.log(`   Taking snapshot 2...`);
  await (await treasury.takeSnapshot()).wait();

  // Restore production params
  await (await treasury.setSnapshotParams(100, 86400)).wait();
  console.log(`   Snapshots done, restored commit delay`);

  // Step 4: Build merkle tree
  console.log(`\n4. Building Merkle tree...`);
  const leaf = ethers.solidityPackedKeccak256(
    ["address", "uint256"], [claimant, seedAmount]
  );
  const tree = new MerkleTree([leaf], keccak256, { sortPairs: true });
  const merkleRoot = tree.getHexRoot();
  const proof = tree.getHexProof(leaf);

  // Step 5: Finalize
  console.log(`\n5. Finalizing epoch ${epochId}...`);
  const ftx = await treasury.finalizeEpoch(epochId, merkleRoot, seedAmount);
  await ftx.wait();
  console.log(`   Finalized: ${ftx.hash}`);

  // Verify
  const [valid, claimed] = await treasury.pendingRewards(Number(epochId), claimant, seedAmount, proof);
  console.log(`\n6. Verified: valid=${valid}, claimed=${claimed}`);

  console.log(`\n========================================`);
  console.log(`Epoch ${epochId}: 2 C2FLR claimable for ${claimant}`);
  console.log(`Merkle root: ${merkleRoot}`);
  console.log(`========================================`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
