const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log("=".repeat(60));
  console.log("HSR Resolver Contracts - Deployment");
  console.log("=".repeat(60));
  console.log(`Network: ${network}`);
  console.log(`Deployer: ${deployer.address}`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${hre.ethers.formatEther(balance)} FLR`);
  console.log("");

  // Load existing deployment to get SubdomainNFT address
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const existingDeploymentFile = path.join(deploymentsDir, `${network}.json`);

  if (!fs.existsSync(existingDeploymentFile)) {
    console.error(`No existing deployment found for ${network}`);
    console.error(`Please run the main deploy.js script first`);
    process.exit(1);
  }

  const existingDeployment = JSON.parse(fs.readFileSync(existingDeploymentFile, "utf8"));
  const nftAddress = existingDeployment.contracts.SubdomainNFT;

  console.log("Existing Deployment:");
  console.log(`  SubdomainNFT: ${nftAddress}`);
  console.log("");

  // Step 1: Deploy HSRRegistry (with zero address resolver initially)
  console.log("Step 1: Deploying HSRRegistry...");
  const HSRRegistry = await hre.ethers.getContractFactory("HSRRegistry");
  const registry = await HSRRegistry.deploy(hre.ethers.ZeroAddress);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`  HSRRegistry: ${registryAddress}`);

  // Step 2: Deploy HSRResolver
  console.log("Step 2: Deploying HSRResolver...");
  const HSRResolver = await hre.ethers.getContractFactory("HSRResolver");
  const resolver = await HSRResolver.deploy(registryAddress);
  await resolver.waitForDeployment();
  const resolverAddress = await resolver.getAddress();
  console.log(`  HSRResolver: ${resolverAddress}`);

  // Step 3: Configure contracts
  console.log("");
  console.log("Step 3: Configuring contracts...");

  // Set default resolver in registry
  console.log("  Setting default resolver in HSRRegistry...");
  await registry.setDefaultResolver(resolverAddress);

  // Set NFT contract reference in registry
  console.log("  Setting NFT contract reference in HSRRegistry...");
  await registry.setNFTContract(nftAddress);

  // Grant MINTER_ROLE and OPERATOR_ROLE to SubdomainNFT on Registry
  // (so NFT contract can register subdomains)
  console.log("  Granting MINTER_ROLE to SubdomainNFT on Registry...");
  const MINTER_ROLE = await registry.MINTER_ROLE();
  await registry.grantRole(MINTER_ROLE, nftAddress);

  console.log("  Granting OPERATOR_ROLE to SubdomainNFT on Registry...");
  const OPERATOR_ROLE = await registry.OPERATOR_ROLE();
  await registry.grantRole(OPERATOR_ROLE, nftAddress);

  // Grant OPERATOR_ROLE on Resolver to deployer (for admin operations)
  console.log("  Granting OPERATOR_ROLE on Resolver to deployer...");
  const RESOLVER_OPERATOR_ROLE = await resolver.OPERATOR_ROLE();
  await resolver.grantRole(RESOLVER_OPERATOR_ROLE, deployer.address);

  // Step 4: Set HSR Registry on SubdomainNFT
  console.log("");
  console.log("Step 4: Integrating with SubdomainNFT...");
  const SubdomainNFT = await hre.ethers.getContractFactory("SubdomainNFT");
  const nft = SubdomainNFT.attach(nftAddress);

  console.log("  Setting HSRRegistry on SubdomainNFT...");
  await nft.setHSRRegistry(registryAddress);

  console.log("");
  console.log("=".repeat(60));
  console.log("Deployment Complete!");
  console.log("=".repeat(60));

  // Update deployment file
  existingDeployment.contracts.HSRRegistry = registryAddress;
  existingDeployment.contracts.HSRResolver = resolverAddress;
  existingDeployment.resolver = {
    registry: registryAddress,
    resolver: resolverAddress,
    deployedAt: new Date().toISOString(),
    configuration: {
      defaultResolver: resolverAddress,
      nftContract: nftAddress,
    },
  };

  fs.writeFileSync(existingDeploymentFile, JSON.stringify(existingDeployment, null, 2));
  console.log(`\nDeployment updated: ${existingDeploymentFile}`);

  // Print summary
  console.log("\nHSR Resolver Contract Addresses:");
  console.log(`  HSRRegistry:  ${registryAddress}`);
  console.log(`  HSRResolver:  ${resolverAddress}`);
  console.log("");
  console.log("Integration Status:");
  console.log(`  SubdomainNFT (${nftAddress}) -> HSRRegistry connected`);
  console.log("");
  console.log("Next Steps:");
  console.log("  1. Update backend .env with new contract addresses");
  console.log("  2. Run database migrations for resolver tables");
  console.log("  3. Test resolution with: GET /api/v1/resolve/:fqdn");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
