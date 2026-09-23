const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log("=".repeat(60));
  console.log("Halcyon Subdomain Marketplace - Contract Deployment");
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
    throw new Error(`No deployment found for ${network}. Deploy base contracts first.`);
  }

  const existingDeployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const nftAddress = existingDeployment.contracts.SubdomainNFT;

  console.log("Using existing contracts:");
  console.log(`  SubdomainNFT: ${nftAddress}`);
  console.log("");

  // Configuration
  const feeRecipient = process.env.FEE_RECIPIENT || deployer.address;
  console.log(`Fee Recipient: ${feeRecipient}`);
  console.log("");

  // Deploy Marketplace
  console.log("Deploying SubdomainMarketplace...");
  const SubdomainMarketplace = await hre.ethers.getContractFactory("SubdomainMarketplace");
  const marketplace = await SubdomainMarketplace.deploy(nftAddress, feeRecipient);
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log(`  SubdomainMarketplace: ${marketplaceAddress}`);

  console.log("");
  console.log("=".repeat(60));
  console.log("Marketplace Deployment Complete!");
  console.log("=".repeat(60));

  // Update deployment file
  existingDeployment.contracts.SubdomainMarketplace = marketplaceAddress;
  existingDeployment.marketplace = {
    address: marketplaceAddress,
    feeRecipient: feeRecipient,
    platformFeeBps: 250,
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(deploymentFile, JSON.stringify(existingDeployment, null, 2));
  console.log(`\nDeployment updated: ${deploymentFile}`);

  console.log("\nMarketplace Address:");
  console.log(`  ${marketplaceAddress}`);

  console.log("\nAdd to frontend .env.local:");
  console.log(`  NEXT_PUBLIC_CONTRACT_MARKETPLACE=${marketplaceAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
