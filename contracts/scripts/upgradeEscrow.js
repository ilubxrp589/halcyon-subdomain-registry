const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log("=".repeat(60));
  console.log("Halcyon - Escrow Contract Upgrade");
  console.log("=".repeat(60));
  console.log(`Network: ${network}`);
  console.log(`Deployer: ${deployer.address}`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${hre.ethers.formatEther(balance)} FLR`);
  console.log("");

  // Load existing deployment
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const deploymentFile = path.join(deploymentsDir, `${network}.json`);

  if (!fs.existsSync(deploymentFile)) {
    throw new Error(`No deployment found for network: ${network}`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));

  console.log("Existing contracts:");
  console.log(`  SubdomainNFT:   ${deployment.contracts.SubdomainNFT}`);
  console.log(`  PriceOracle:    ${deployment.contracts.PriceOracle}`);
  console.log(`  DNSOracle:      ${deployment.contracts.DNSOracle}`);
  console.log(`  Old Escrow:     ${deployment.contracts.SubdomainEscrow}`);
  console.log("");

  // Configuration
  const platformRecipient = deployment.configuration.platformRecipient;

  // Deploy new SubdomainEscrow
  console.log("Deploying new SubdomainEscrow with batch functions...");
  const SubdomainEscrow = await hre.ethers.getContractFactory("SubdomainEscrow");
  const escrow = await SubdomainEscrow.deploy(
    deployment.contracts.SubdomainNFT,
    deployment.contracts.PriceOracle,
    deployment.contracts.DNSOracle,
    platformRecipient
  );
  await escrow.waitForDeployment();
  const newEscrowAddress = await escrow.getAddress();
  console.log(`  New SubdomainEscrow: ${newEscrowAddress}`);

  // Configure NFT to grant roles to new escrow
  console.log("");
  console.log("Configuring NFT contract...");
  const nft = await hre.ethers.getContractAt("SubdomainNFT", deployment.contracts.SubdomainNFT);

  const MINTER_ROLE = await nft.MINTER_ROLE();
  const OPERATOR_ROLE = await nft.OPERATOR_ROLE();

  console.log("  Granting MINTER_ROLE to new escrow...");
  let tx = await nft.grantRole(MINTER_ROLE, newEscrowAddress);
  await tx.wait();

  console.log("  Granting OPERATOR_ROLE to new escrow...");
  tx = await nft.grantRole(OPERATOR_ROLE, newEscrowAddress);
  await tx.wait();

  // Update DNS Oracle to point to new escrow
  console.log("");
  console.log("Updating DNSOracle...");
  const dnsOracle = await hre.ethers.getContractAt("DNSOracle", deployment.contracts.DNSOracle);

  console.log("  Setting new escrow contract in DNSOracle...");
  tx = await dnsOracle.setEscrowContract(newEscrowAddress);
  await tx.wait();

  // Verify batch function works
  console.log("");
  console.log("Verifying batch function...");
  try {
    const result = await escrow.getBatchPrice(["test", "hello"]);
    console.log(`  getBatchPrice works! Total FLR: ${hre.ethers.formatEther(result[1])}`);
  } catch (e) {
    console.log(`  Warning: getBatchPrice test failed: ${e.message}`);
  }

  // Update deployment file
  deployment.previousDeployment = deployment.previousDeployment || {};
  deployment.previousDeployment.SubdomainEscrow = deployment.contracts.SubdomainEscrow;
  deployment.contracts.SubdomainEscrow = newEscrowAddress;
  deployment.escrowUpgrade = {
    previousAddress: deployment.previousDeployment.SubdomainEscrow,
    newAddress: newEscrowAddress,
    upgradedAt: new Date().toISOString(),
    hasBatchFunctions: true,
  };

  fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));

  console.log("");
  console.log("=".repeat(60));
  console.log("Upgrade Complete!");
  console.log("=".repeat(60));
  console.log(`\nNew Escrow Address: ${newEscrowAddress}`);
  console.log(`\nUpdate your .env files:`);
  console.log(`  NEXT_PUBLIC_CONTRACT_ESCROW=${newEscrowAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
