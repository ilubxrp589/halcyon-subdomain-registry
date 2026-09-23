const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log("=".repeat(60));
  console.log("SldRegistrationManager — Upgrade + PaymentManager Swap");
  console.log("=".repeat(60));
  console.log(`Network:  ${network}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log("");

  // Load deployment
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const deploymentFile = path.join(deploymentsDir, `${network}-tld-staking.json`);
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));

  const proxyAddr = deployment.contracts.SldRegistrationManager;
  const oldImplAddr = deployment.contracts.SldRegistrationManager_impl;
  const oldPaymentManager = deployment.contracts.PaymentManager;
  const newPaymentManager = deployment.contracts.PaymentManagerV2;

  if (!newPaymentManager) {
    throw new Error("PaymentManagerV2 not found in deployment file. Deploy it first.");
  }

  console.log(`Proxy:              ${proxyAddr}`);
  console.log(`Current impl:       ${oldImplAddr}`);
  console.log(`Old PaymentManager: ${oldPaymentManager}`);
  console.log(`New PaymentManagerV2: ${newPaymentManager}`);
  console.log("");

  let totalGas = 0n;

  // 1. Deploy new implementation with setPaymentManager()
  console.log("Step 1: Deploy new SldRegistrationManager implementation...");
  const Factory = await hre.ethers.getContractFactory("SldRegistrationManager");
  const newImpl = await Factory.deploy();
  await newImpl.waitForDeployment();
  const newImplAddr = await newImpl.getAddress();
  const implReceipt = await newImpl.deploymentTransaction().wait();
  totalGas += implReceipt.gasUsed;
  console.log(`  New impl: ${newImplAddr} (gas: ${implReceipt.gasUsed})`);

  // 2. Upgrade proxy to new implementation
  console.log("Step 2: Upgrade proxy to new implementation...");
  const proxy = Factory.attach(proxyAddr);
  const upgradeTx = await proxy.upgradeToAndCall(newImplAddr, "0x");
  const upgradeReceipt = await upgradeTx.wait();
  totalGas += upgradeReceipt.gasUsed;
  console.log(`  Upgrade done (gas: ${upgradeReceipt.gasUsed})`);

  // 3. Call setPaymentManager to switch to V2
  console.log("Step 3: Set PaymentManagerV2...");
  const setTx = await proxy.setPaymentManager(newPaymentManager);
  const setReceipt = await setTx.wait();
  totalGas += setReceipt.gasUsed;
  console.log(`  setPaymentManager(${newPaymentManager}) done (gas: ${setReceipt.gasUsed})`);

  // 4. Verify state
  console.log("");
  console.log("Verifying state...");
  const currentPM = await proxy.paymentManager();
  console.log(`  paymentManager: ${currentPM}`);
  console.log(`  Matches V2?     ${currentPM.toLowerCase() === newPaymentManager.toLowerCase()}`);
  console.log(`  owner:          ${await proxy.owner()}`);

  // 5. Update deployment record
  deployment.contracts.SldRegistrationManager_impl = newImplAddr;
  deployment.contracts.SldRegistrationManager_old_impl = oldImplAddr;
  deployment.paymentManagerSwap = {
    timestamp: new Date().toISOString(),
    oldPaymentManager,
    newPaymentManager,
    newSldRegistrationManagerImpl: newImplAddr,
    totalGasUsed: totalGas.toString(),
    note: "SldRegistrationManager upgraded with setPaymentManager(). Now using PaymentManagerV2.",
  };
  fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));

  console.log("");
  console.log("=".repeat(60));
  console.log("Upgrade Complete!");
  console.log("=".repeat(60));
  console.log(`  New impl:     ${newImplAddr}`);
  console.log(`  PaymentMgr:   ${newPaymentManager} (V2)`);
  console.log(`  Total gas:    ${totalGas}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nUpgrade failed:", error.message || error);
    process.exit(1);
  });
