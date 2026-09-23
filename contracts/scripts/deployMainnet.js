const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

/**
 * HSR Mainnet Deployment Script
 *
 * IMPORTANT: This script deploys to Flare MAINNET with real value!
 *
 * Pre-deployment checklist:
 * 1. Contracts audited
 * 2. Testnet thoroughly tested
 * 3. Multi-sig wallet ready for admin transfer
 * 4. Sufficient FLR for deployment (~50-100 FLR recommended)
 * 5. Verify PRIVATE_KEY in .env is the correct deployer
 *
 * Usage:
 *   npx hardhat run scripts/deployMainnet.js --network flare
 */

// Safety check - require explicit mainnet flag
const MAINNET_CONFIRMED = process.env.MAINNET_DEPLOY === "true";

// Configuration
const CONFIG = {
  // Platform fee recipient (should be multi-sig on mainnet)
  platformRecipient: process.env.PLATFORM_RECIPIENT || null,
  royaltyRecipient: process.env.ROYALTY_RECIPIENT || null,

  // Flare FTSO addresses (mainnet)
  ftsoV2: "0x3d893C53D9e8056135C26C8c638B76C8b60Df726", // Mainnet FtsoV2
  ftsoRegistry: "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019", // Mainnet

  // NFT configuration
  nftName: "Halcyon Subdomains",
  nftSymbol: "HSUB",

  // Marketplace configuration
  platformFeeBps: 250, // 2.5%
};

async function confirm(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`\n${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "yes");
    });
  });
}

async function main() {
  const network = hre.network.name;

  // Safety checks
  console.log("\n" + "=".repeat(60));
  console.log("  HSR MAINNET DEPLOYMENT");
  console.log("=".repeat(60));

  if (network !== "flare") {
    console.log("\nThis script is for Flare mainnet only.");
    console.log(`Current network: ${network}`);
    console.log("\nUsage: npx hardhat run scripts/deployMainnet.js --network flare");
    process.exit(1);
  }

  if (!MAINNET_CONFIRMED) {
    console.log("\n⚠️  MAINNET DEPLOYMENT SAFETY CHECK");
    console.log("─".repeat(60));
    console.log("This script will deploy contracts to Flare MAINNET.");
    console.log("Real FLR will be spent for gas fees.");
    console.log("\nTo proceed, set environment variable:");
    console.log("  MAINNET_DEPLOY=true");
    console.log("\nExample:");
    console.log("  MAINNET_DEPLOY=true npx hardhat run scripts/deployMainnet.js --network flare");
    process.exit(1);
  }

  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  const balanceFLR = hre.ethers.formatEther(balance);

  console.log("\n📋 Deployment Configuration");
  console.log("─".repeat(60));
  console.log(`Network:          Flare Mainnet (Chain ID: 14)`);
  console.log(`Deployer:         ${deployer.address}`);
  console.log(`Balance:          ${balanceFLR} FLR`);
  console.log(`Platform Fee:     ${CONFIG.platformRecipient || deployer.address}`);
  console.log(`Royalty Fee:      ${CONFIG.royaltyRecipient || deployer.address}`);

  // Check balance
  if (parseFloat(balanceFLR) < 50) {
    console.log("\n⚠️  WARNING: Low balance!");
    console.log("Recommended: At least 50 FLR for deployment.");
  }

  // Check recipients
  if (!CONFIG.platformRecipient) {
    console.log("\n⚠️  WARNING: Using deployer as platform recipient.");
    console.log("For production, set PLATFORM_RECIPIENT to a multi-sig.");
  }

  // Final confirmation
  console.log("\n" + "=".repeat(60));
  const confirmed = await confirm("Proceed with MAINNET deployment?");

  if (!confirmed) {
    console.log("\nDeployment cancelled.");
    process.exit(0);
  }

  console.log("\n🚀 Starting deployment...\n");

  const platformRecipient = CONFIG.platformRecipient || deployer.address;
  const royaltyRecipient = CONFIG.royaltyRecipient || deployer.address;

  // Step 1: Deploy PriceOracle
  console.log("Step 1/7: Deploying PriceOracle...");
  const PriceOracle = await hre.ethers.getContractFactory("PriceOracle");
  const priceOracle = await PriceOracle.deploy(CONFIG.ftsoV2, CONFIG.ftsoRegistry);
  await priceOracle.waitForDeployment();
  const priceOracleAddress = await priceOracle.getAddress();
  console.log(`  ✓ PriceOracle: ${priceOracleAddress}`);

  // Verify price oracle works
  try {
    const price = await priceOracle.getFLRPriceUSD();
    console.log(`  ✓ FLR Price: $${hre.ethers.formatEther(price)}`);
  } catch (e) {
    console.log(`  ⚠️  Price fetch failed: ${e.message}`);
  }

  // Step 2: Deploy HSRRegistry
  console.log("\nStep 2/7: Deploying HSRRegistry...");
  const HSRRegistry = await hre.ethers.getContractFactory("HSRRegistry");
  const registry = await HSRRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`  ✓ HSRRegistry: ${registryAddress}`);

  // Step 3: Deploy HSRResolver
  console.log("\nStep 3/7: Deploying HSRResolver...");
  const HSRResolver = await hre.ethers.getContractFactory("HSRResolver");
  const resolver = await HSRResolver.deploy(registryAddress);
  await resolver.waitForDeployment();
  const resolverAddress = await resolver.getAddress();
  console.log(`  ✓ HSRResolver: ${resolverAddress}`);

  // Step 4: Configure Registry
  console.log("\nStep 4/7: Configuring HSRRegistry...");
  await registry.setDefaultResolver(resolverAddress);
  console.log(`  ✓ Default resolver set`);

  // Step 5: Deploy SubdomainNFT
  console.log("\nStep 5/7: Deploying SubdomainNFT...");
  const SubdomainNFT = await hre.ethers.getContractFactory("SubdomainNFT");
  const nft = await SubdomainNFT.deploy(
    CONFIG.nftName,
    CONFIG.nftSymbol,
    royaltyRecipient
  );
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log(`  ✓ SubdomainNFT: ${nftAddress}`);

  // Step 6: Deploy DNSOracle
  console.log("\nStep 6/7: Deploying DNSOracle...");
  const DNSOracle = await hre.ethers.getContractFactory("DNSOracle");
  const dnsOracle = await DNSOracle.deploy(hre.ethers.ZeroAddress);
  await dnsOracle.waitForDeployment();
  const dnsOracleAddress = await dnsOracle.getAddress();
  console.log(`  ✓ DNSOracle: ${dnsOracleAddress}`);

  // Step 7: Deploy SubdomainEscrow
  console.log("\nStep 7/7: Deploying SubdomainEscrow...");
  const SubdomainEscrow = await hre.ethers.getContractFactory("SubdomainEscrow");
  const escrow = await SubdomainEscrow.deploy(
    nftAddress,
    priceOracleAddress,
    dnsOracleAddress,
    platformRecipient
  );
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log(`  ✓ SubdomainEscrow: ${escrowAddress}`);

  // Step 8: Deploy Marketplace
  console.log("\nStep 8/7: Deploying SubdomainMarketplace...");
  const SubdomainMarketplace = await hre.ethers.getContractFactory("SubdomainMarketplace");
  const marketplace = await SubdomainMarketplace.deploy(nftAddress, platformRecipient);
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log(`  ✓ SubdomainMarketplace: ${marketplaceAddress}`);

  // Configure contracts
  console.log("\n📝 Configuring contract permissions...");

  // DNS Oracle -> Escrow
  await dnsOracle.setEscrowContract(escrowAddress);
  console.log("  ✓ DNSOracle -> Escrow linked");

  // NFT roles
  const MINTER_ROLE = await nft.MINTER_ROLE();
  const OPERATOR_ROLE = await nft.OPERATOR_ROLE();

  await nft.grantRole(MINTER_ROLE, escrowAddress);
  console.log("  ✓ Escrow has MINTER_ROLE on NFT");

  await nft.grantRole(OPERATOR_ROLE, escrowAddress);
  console.log("  ✓ Escrow has OPERATOR_ROLE on NFT");

  // HSR Registry integration
  await nft.setHSRRegistry(registryAddress);
  console.log("  ✓ NFT -> Registry linked");

  await registry.setNFTContract(nftAddress);
  console.log("  ✓ Registry -> NFT linked");

  const REG_MINTER_ROLE = await registry.MINTER_ROLE();
  const REG_OPERATOR_ROLE = await registry.OPERATOR_ROLE();

  await registry.grantRole(REG_MINTER_ROLE, nftAddress);
  console.log("  ✓ NFT has MINTER_ROLE on Registry");

  await registry.grantRole(REG_OPERATOR_ROLE, nftAddress);
  console.log("  ✓ NFT has OPERATOR_ROLE on Registry");

  // Save deployment
  const deployment = {
    network: "flare",
    chainId: "14",
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      PriceOracle: priceOracleAddress,
      HSRRegistry: registryAddress,
      HSRResolver: resolverAddress,
      SubdomainNFT: nftAddress,
      DNSOracle: dnsOracleAddress,
      SubdomainEscrow: escrowAddress,
      SubdomainMarketplace: marketplaceAddress,
    },
    configuration: {
      platformRecipient,
      royaltyRecipient,
      platformFeeBps: CONFIG.platformFeeBps,
      ftsoV2: CONFIG.ftsoV2,
      ftsoRegistry: CONFIG.ftsoRegistry,
    },
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentFile = path.join(deploymentsDir, "flare.json");
  fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("  DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));
  console.log("\n📄 Contract Addresses:");
  console.log(`  PriceOracle:          ${priceOracleAddress}`);
  console.log(`  HSRRegistry:          ${registryAddress}`);
  console.log(`  HSRResolver:          ${resolverAddress}`);
  console.log(`  SubdomainNFT:         ${nftAddress}`);
  console.log(`  DNSOracle:            ${dnsOracleAddress}`);
  console.log(`  SubdomainEscrow:      ${escrowAddress}`);
  console.log(`  SubdomainMarketplace: ${marketplaceAddress}`);

  console.log("\n📁 Deployment saved to:", deploymentFile);

  console.log("\n🔧 Next Steps:");
  console.log("  1. Verify contracts on Flare Explorer");
  console.log("  2. Update backend .env with new addresses");
  console.log("  3. Update frontend environment variables");
  console.log("  4. Update wallet integration docs with mainnet addresses");
  console.log("  5. Consider transferring admin roles to multi-sig");

  console.log("\n📋 Environment Variables for Backend:");
  console.log(`  HSR_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`  HSR_RESOLVER_ADDRESS=${resolverAddress}`);
  console.log(`  CONTRACT_NFT=${nftAddress}`);
  console.log(`  CONTRACT_ESCROW=${escrowAddress}`);
  console.log(`  CONTRACT_MARKETPLACE=${marketplaceAddress}`);

  // Verify contracts (optional)
  console.log("\n🔍 To verify contracts on Flare Explorer:");
  console.log(`  npx hardhat verify --network flare ${registryAddress}`);
  console.log(`  npx hardhat verify --network flare ${resolverAddress} ${registryAddress}`);
  console.log(`  npx hardhat verify --network flare ${nftAddress} "${CONFIG.nftName}" "${CONFIG.nftSymbol}" ${royaltyRecipient}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  });
