/**
 * Upgrade TldClaimManager proxy to Phase 2 implementation
 * (adds requestStake, completeStake, refundExpiredStake, ftsoOracle, stakingFeeUsd)
 *
 * Usage:
 *   npx hardhat run scripts/upgrade-tldclaimmanager-phase2.js --network coston2
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log("=".repeat(60));
  console.log("TldClaimManager — Phase 2 Upgrade");
  console.log("=".repeat(60));
  console.log(`Network:  ${network}`);
  console.log(`Deployer: ${deployer.address}`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Balance:  ${hre.ethers.formatEther(balance)} C2FLR`);

  // Load deployment addresses
  const deploymentPath = path.join(__dirname, "..", "deployments", "coston2-tld-staking.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const proxyAddress = deployment.contracts.TldClaimManager;
  const oldImplAddress = deployment.contracts.TldClaimManager_impl;
  const ftsoOracleAddress = deployment.contracts.FtsoOracle;

  console.log(`\nProxy:    ${proxyAddress}`);
  console.log(`Old Impl: ${oldImplAddress}`);
  console.log(`FtsoOracle: ${ftsoOracleAddress}`);

  // Step 1: Deploy new implementation
  console.log("\n--- Step 1: Deploy new TldClaimManager implementation ---");
  const ImplFactory = await hre.ethers.getContractFactory("TldClaimManager");
  const newImpl = await ImplFactory.deploy();
  await newImpl.waitForDeployment();
  const newImplAddress = await newImpl.getAddress();
  console.log(`New Impl: ${newImplAddress}`);

  // Step 2: Upgrade proxy
  console.log("\n--- Step 2: Upgrade proxy to new implementation ---");
  const proxy = ImplFactory.attach(proxyAddress);

  // Verify current state before upgrade
  const operatorBefore = await proxy.operator();
  const ownerBefore = await proxy.owner();
  console.log(`Operator (before): ${operatorBefore}`);
  console.log(`Owner (before):    ${ownerBefore}`);

  const upgradeTx = await proxy.upgradeToAndCall(newImplAddress, "0x");
  const upgradeReceipt = await upgradeTx.wait(1);
  console.log(`Upgrade TX: ${upgradeTx.hash} (block ${upgradeReceipt.blockNumber})`);

  // Verify state preserved
  const operatorAfter = await proxy.operator();
  const ownerAfter = await proxy.owner();
  console.log(`Operator (after): ${operatorAfter}`);
  console.log(`Owner (after):    ${ownerAfter}`);

  if (operatorBefore !== operatorAfter || ownerBefore !== ownerAfter) {
    throw new Error("State corruption detected! Operator/Owner changed after upgrade.");
  }
  console.log("State preserved OK");

  // Step 3: Verify Phase 2 functions are now accessible
  console.log("\n--- Step 3: Verify Phase 2 functions ---");
  const stakingFee = await proxy.stakingFeeUsd();
  const ftsoAddr = await proxy.ftsoOracle();
  console.log(`stakingFeeUsd: ${stakingFee} (should be 0)`);
  console.log(`ftsoOracle:    ${ftsoAddr} (should be 0x0)`);

  // Step 4: Configure Phase 2
  console.log("\n--- Step 4: Configure Phase 2 ---");

  // Set FTSO oracle
  const setOracleTx = await proxy.setFtsoOracle(ftsoOracleAddress);
  await setOracleTx.wait(1);
  console.log(`Set ftsoOracle: ${ftsoOracleAddress}`);

  // Set staking fee: $10 = 1000 cents (reasonable testnet value)
  const stakingFeeUsdCents = 1000;
  const setFeeTx = await proxy.setStakingFee(stakingFeeUsdCents);
  await setFeeTx.wait(1);
  console.log(`Set stakingFeeUsd: ${stakingFeeUsdCents} cents ($${stakingFeeUsdCents / 100})`);

  // Verify configuration
  const finalFee = await proxy.stakingFeeUsd();
  const finalOracle = await proxy.ftsoOracle();
  console.log(`\nFinal stakingFeeUsd: ${finalFee}`);
  console.log(`Final ftsoOracle:    ${finalOracle}`);

  // Step 5: Update deployment file
  console.log("\n--- Step 5: Update deployment file ---");
  deployment.contracts.TldClaimManager_impl = newImplAddress;
  deployment.contracts.TldClaimManager_old_impl = oldImplAddress;
  deployment.phase2Upgrade = {
    timestamp: new Date().toISOString(),
    upgradeBlock: upgradeReceipt.blockNumber,
    upgradeTx: upgradeTx.hash,
    stakingFeeUsdCents,
    ftsoOracle: ftsoOracleAddress,
  };
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log(`Updated ${deploymentPath}`);

  console.log("\n" + "=".repeat(60));
  console.log("Phase 2 Upgrade Complete!");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
