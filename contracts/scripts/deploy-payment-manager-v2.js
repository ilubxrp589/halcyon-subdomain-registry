const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log("=".repeat(60));
  console.log("PaymentManagerV2 — Deployment (UUPS Proxy)");
  console.log("=".repeat(60));
  console.log(`Network:  ${network}`);
  console.log(`Deployer: ${deployer.address}`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Balance:  ${hre.ethers.formatEther(balance)} C2FLR`);
  console.log("");

  // Load existing deployment
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const deploymentFile = path.join(deploymentsDir, `${network}-tld-staking.json`);
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));

  const currentRegManager = deployment.contracts.SldRegistrationManager;
  console.log(`Existing SldRegistrationManager: ${currentRegManager}`);
  console.log(`Default fee: 2000 bps (20% community)`);
  console.log(`Operator TLDs will be set to 500 bps (5%) later`);
  console.log("");

  let totalGas = 0n;

  // 1. Deploy PaymentManagerV2 implementation
  console.log("Step 1: Deploy PaymentManagerV2 implementation...");
  const ImplFactory = await hre.ethers.getContractFactory("PaymentManagerV2");
  const impl = await ImplFactory.deploy();
  await impl.waitForDeployment();
  const implAddr = await impl.getAddress();
  const implReceipt = await impl.deploymentTransaction().wait();
  totalGas += implReceipt.gasUsed;
  console.log(`  Implementation: ${implAddr} (gas: ${implReceipt.gasUsed})`);

  // 2. Deploy ERC1967Proxy
  console.log("Step 2: Deploy UUPS Proxy...");
  const initData = ImplFactory.interface.encodeFunctionData("initialize", [
    deployer.address, // platformFeeRecipient
    2000,             // defaultPlatformFeeBps (20% community default)
    deployer.address, // owner
  ]);

  const proxyArtifact = require("@openzeppelin/contracts/build/contracts/ERC1967Proxy.json");
  const ProxyFactory = new hre.ethers.ContractFactory(
    proxyArtifact.abi,
    proxyArtifact.bytecode,
    deployer
  );
  const proxy = await ProxyFactory.deploy(implAddr, initData);
  await proxy.waitForDeployment();
  const proxyAddr = await proxy.getAddress();
  const proxyReceipt = await proxy.deploymentTransaction().wait();
  totalGas += proxyReceipt.gasUsed;
  console.log(`  Proxy:          ${proxyAddr} (gas: ${proxyReceipt.gasUsed})`);

  // 3. Set registration manager on PaymentManagerV2
  console.log("Step 3: Set registration manager...");
  const pmV2 = ImplFactory.attach(proxyAddr);
  const setRmTx = await pmV2.setRegistrationManager(currentRegManager);
  const setRmReceipt = await setRmTx.wait();
  totalGas += setRmReceipt.gasUsed;
  console.log(`  setRegistrationManager(${currentRegManager}) done (gas: ${setRmReceipt.gasUsed})`);

  // 4. Verify state
  console.log("");
  console.log("Verifying state...");
  console.log(`  owner:                  ${await pmV2.owner()}`);
  console.log(`  platformFeeRecipient:   ${await pmV2.platformFeeRecipient()}`);
  console.log(`  defaultPlatformFeeBps:  ${await pmV2.defaultPlatformFeeBps()}`);
  console.log(`  registrationManager:    ${await pmV2.registrationManager()}`);

  // 5. Update deployment record
  deployment.contracts.PaymentManagerV2 = proxyAddr;
  deployment.contracts.PaymentManagerV2_impl = implAddr;
  deployment.paymentManagerV2Upgrade = {
    timestamp: new Date().toISOString(),
    defaultFeeBps: 2000,
    totalGasUsed: totalGas.toString(),
    note: "PaymentManagerV2 deployed with per-TLD fee support. SldRegistrationManager NOT yet updated to use V2.",
  };
  fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));

  console.log("");
  console.log("=".repeat(60));
  console.log("PaymentManagerV2 Deployed Successfully!");
  console.log("=".repeat(60));
  console.log(`  Proxy:          ${proxyAddr}`);
  console.log(`  Implementation: ${implAddr}`);
  console.log(`  Total gas:      ${totalGas}`);
  console.log("");
  console.log("NEXT STEPS:");
  console.log("  1. Upgrade SldRegistrationManager to add setPaymentManager()");
  console.log("  2. Call setPaymentManager(PaymentManagerV2) on SldRegistrationManager");
  console.log("  3. Batch set operator TLD fees to 500 bps (5%)");

  const finalBalance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`  Remaining balance: ${hre.ethers.formatEther(finalBalance)} C2FLR`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nDeployment failed:", error.message || error);
    process.exit(1);
  });
