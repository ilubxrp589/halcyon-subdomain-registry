const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log("=".repeat(60));
  console.log("Halcyon Subdomain Registry - Contract Deployment");
  console.log("=".repeat(60));
  console.log(`Network: ${network}`);
  console.log(`Deployer: ${deployer.address}`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${hre.ethers.formatEther(balance)} FLR`);
  console.log("");

  // Configuration
  const platformRecipient = process.env.PLATFORM_RECIPIENT || deployer.address;
  const royaltyRecipient = process.env.ROYALTY_RECIPIENT || deployer.address;
  const initialFLRPrice = process.env.INITIAL_FLR_PRICE || "50000000000000000"; // 0.05 USD

  console.log("Configuration:");
  console.log(`  Platform Recipient: ${platformRecipient}`);
  console.log(`  Royalty Recipient: ${royaltyRecipient}`);
  console.log(`  Initial FLR Price: ${hre.ethers.formatEther(initialFLRPrice)} USD`);
  console.log("");

  // Deploy PriceOracle
  console.log("Deploying PriceOracle...");
  const PriceOracle = await hre.ethers.getContractFactory("PriceOracle");
  const priceOracle = await PriceOracle.deploy(initialFLRPrice);
  await priceOracle.waitForDeployment();
  const priceOracleAddress = await priceOracle.getAddress();
  console.log(`  PriceOracle: ${priceOracleAddress}`);

  // Deploy SubdomainNFT
  console.log("Deploying SubdomainNFT...");
  const SubdomainNFT = await hre.ethers.getContractFactory("SubdomainNFT");
  const nft = await SubdomainNFT.deploy(
    "Halcyon Subdomains",
    "HSUB",
    royaltyRecipient
  );
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log(`  SubdomainNFT: ${nftAddress}`);

  // Deploy DNSOracle (with placeholder escrow - will update later)
  console.log("Deploying DNSOracle...");
  const DNSOracle = await hre.ethers.getContractFactory("DNSOracle");
  const dnsOracle = await DNSOracle.deploy(hre.ethers.ZeroAddress);
  await dnsOracle.waitForDeployment();
  const dnsOracleAddress = await dnsOracle.getAddress();
  console.log(`  DNSOracle: ${dnsOracleAddress}`);

  // Deploy SubdomainEscrow
  console.log("Deploying SubdomainEscrow...");
  const SubdomainEscrow = await hre.ethers.getContractFactory("SubdomainEscrow");
  const escrow = await SubdomainEscrow.deploy(
    nftAddress,
    priceOracleAddress,
    dnsOracleAddress,
    platformRecipient
  );
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log(`  SubdomainEscrow: ${escrowAddress}`);

  // Configure contracts
  console.log("");
  console.log("Configuring contracts...");

  // Update DNS Oracle with escrow address
  console.log("  Setting escrow contract in DNSOracle...");
  await dnsOracle.setEscrowContract(escrowAddress);

  // Grant MINTER_ROLE to escrow on NFT
  console.log("  Granting MINTER_ROLE to escrow...");
  const MINTER_ROLE = await nft.MINTER_ROLE();
  await nft.grantRole(MINTER_ROLE, escrowAddress);

  // Grant OPERATOR_ROLE to escrow on NFT (for DNS status updates)
  console.log("  Granting OPERATOR_ROLE to escrow...");
  const OPERATOR_ROLE = await nft.OPERATOR_ROLE();
  await nft.grantRole(OPERATOR_ROLE, escrowAddress);

  // Grant ORACLE_ROLE to deployer for DNS confirmations (backend wallet)
  console.log("  ORACLE_ROLE already granted to deployer");

  // Set treasury address for domain reclaim
  const treasuryAddress = process.env.TREASURY_ADDRESS || deployer.address;
  console.log(`  Setting treasury address: ${treasuryAddress}...`);
  await nft.setTreasuryAddress(treasuryAddress);

  // Grant OPERATOR_ROLE to operator wallet if configured (for expiry cron)
  const operatorAddress = process.env.OPERATOR_ADDRESS || deployer.address;
  if (operatorAddress !== deployer.address) {
    console.log(`  Granting OPERATOR_ROLE to operator wallet: ${operatorAddress}...`);
    await nft.grantRole(OPERATOR_ROLE, operatorAddress);
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("Deployment Complete!");
  console.log("=".repeat(60));

  // Save deployment info
  const deployment = {
    network,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      PriceOracle: priceOracleAddress,
      SubdomainNFT: nftAddress,
      DNSOracle: dnsOracleAddress,
      SubdomainEscrow: escrowAddress,
    },
    configuration: {
      platformRecipient,
      royaltyRecipient,
      initialFLRPrice,
      treasuryAddress,
      operatorAddress,
    },
  };

  // Save to file
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentFile = path.join(deploymentsDir, `${network}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
  console.log(`\nDeployment saved to: ${deploymentFile}`);

  // Print summary
  console.log("\nContract Addresses:");
  console.log(`  PriceOracle:      ${priceOracleAddress}`);
  console.log(`  SubdomainNFT:     ${nftAddress}`);
  console.log(`  DNSOracle:        ${dnsOracleAddress}`);
  console.log(`  SubdomainEscrow:  ${escrowAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
