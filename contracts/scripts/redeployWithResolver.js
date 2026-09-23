const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Full system redeployment with HSR Resolver integration
 *
 * This script will:
 * 1. Deploy new SubdomainNFT with resolver integration
 * 2. Deploy new SubdomainEscrow pointing to new NFT
 * 3. Update DNSOracle with new escrow
 * 4. Configure all roles
 * 5. Integrate with existing HSRRegistry/HSRResolver
 *
 * WARNING: This creates new contracts - existing NFTs stay with old contract!
 */
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log("=".repeat(60));
  console.log("HSR Full System Redeployment with Resolver Integration");
  console.log("=".repeat(60));
  console.log(`Network: ${network}`);
  console.log(`Deployer: ${deployer.address}`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${hre.ethers.formatEther(balance)} FLR`);
  console.log("");

  // Load existing deployment
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const existingDeploymentFile = path.join(deploymentsDir, `${network}.json`);
  const existingDeployment = JSON.parse(fs.readFileSync(existingDeploymentFile, "utf8"));

  // Existing contracts we'll reuse
  const priceOracleAddress = existingDeployment.contracts.PriceOracle;
  const registryAddress = existingDeployment.contracts.HSRRegistry;
  const resolverAddress = existingDeployment.contracts.HSRResolver;

  console.log("Existing Contracts (reusing):");
  console.log(`  PriceOracle:  ${priceOracleAddress}`);
  console.log(`  HSRRegistry:  ${registryAddress}`);
  console.log(`  HSRResolver:  ${resolverAddress}`);
  console.log("");

  // Configuration
  const platformRecipient = existingDeployment.configuration.platformRecipient;
  const royaltyRecipient = existingDeployment.configuration.royaltyRecipient;

  console.log("Configuration:");
  console.log(`  Platform Recipient: ${platformRecipient}`);
  console.log(`  Royalty Recipient: ${royaltyRecipient}`);
  console.log("");

  // Step 1: Deploy new SubdomainNFT
  console.log("Step 1: Deploying new SubdomainNFT...");
  const SubdomainNFT = await hre.ethers.getContractFactory("SubdomainNFT");
  const nft = await SubdomainNFT.deploy(
    "Halcyon Subdomains",
    "HSUB",
    royaltyRecipient
  );
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log(`  SubdomainNFT: ${nftAddress}`);

  // Step 2: Deploy new DNSOracle
  console.log("Step 2: Deploying new DNSOracle...");
  const DNSOracle = await hre.ethers.getContractFactory("DNSOracle");
  const dnsOracle = await DNSOracle.deploy(hre.ethers.ZeroAddress);
  await dnsOracle.waitForDeployment();
  const dnsOracleAddress = await dnsOracle.getAddress();
  console.log(`  DNSOracle: ${dnsOracleAddress}`);

  // Step 3: Deploy new SubdomainEscrow
  console.log("Step 3: Deploying new SubdomainEscrow...");
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

  // Step 4: Deploy new Marketplace
  console.log("Step 4: Deploying new SubdomainMarketplace...");
  const SubdomainMarketplace = await hre.ethers.getContractFactory("SubdomainMarketplace");
  const marketplace = await SubdomainMarketplace.deploy(
    nftAddress,
    platformRecipient
  );
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log(`  SubdomainMarketplace: ${marketplaceAddress}`);

  // Step 5: Configure contracts
  console.log("");
  console.log("Step 5: Configuring contracts...");

  // Update DNS Oracle with escrow
  console.log("  Setting escrow in DNSOracle...");
  await dnsOracle.setEscrowContract(escrowAddress);

  // Grant roles on NFT
  console.log("  Granting MINTER_ROLE to escrow on NFT...");
  const MINTER_ROLE = await nft.MINTER_ROLE();
  await nft.grantRole(MINTER_ROLE, escrowAddress);

  console.log("  Granting OPERATOR_ROLE to escrow on NFT...");
  const OPERATOR_ROLE = await nft.OPERATOR_ROLE();
  await nft.grantRole(OPERATOR_ROLE, escrowAddress);

  // Step 6: Integrate with HSR Registry
  console.log("");
  console.log("Step 6: Integrating with HSR Registry...");

  // Set HSR Registry on new NFT
  console.log("  Setting HSRRegistry on SubdomainNFT...");
  await nft.setHSRRegistry(registryAddress);

  // Update registry with new NFT
  const HSRRegistry = await hre.ethers.getContractFactory("HSRRegistry");
  const registry = HSRRegistry.attach(registryAddress);

  console.log("  Setting new NFT contract in Registry...");
  await registry.setNFTContract(nftAddress);

  // Grant MINTER_ROLE to new NFT on Registry
  console.log("  Granting MINTER_ROLE to new NFT on Registry...");
  const REG_MINTER_ROLE = await registry.MINTER_ROLE();
  await registry.grantRole(REG_MINTER_ROLE, nftAddress);

  // Grant OPERATOR_ROLE to new NFT on Registry
  console.log("  Granting OPERATOR_ROLE to new NFT on Registry...");
  const REG_OPERATOR_ROLE = await registry.OPERATOR_ROLE();
  await registry.grantRole(REG_OPERATOR_ROLE, nftAddress);

  console.log("");
  console.log("=".repeat(60));
  console.log("Deployment Complete!");
  console.log("=".repeat(60));

  // Update deployment file
  const newDeployment = {
    network,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      PriceOracle: priceOracleAddress,
      SubdomainNFT: nftAddress,
      DNSOracle: dnsOracleAddress,
      SubdomainEscrow: escrowAddress,
      SubdomainMarketplace: marketplaceAddress,
      HSRRegistry: registryAddress,
      HSRResolver: resolverAddress,
    },
    configuration: {
      platformRecipient,
      royaltyRecipient,
      initialFLRPrice: existingDeployment.configuration.initialFLRPrice,
    },
    marketplace: {
      address: marketplaceAddress,
      feeRecipient: platformRecipient,
      platformFeeBps: 250,
      deployedAt: new Date().toISOString(),
    },
    resolver: {
      registry: registryAddress,
      resolver: resolverAddress,
      nftIntegrated: true,
      deployedAt: new Date().toISOString(),
    },
    previousDeployment: {
      SubdomainNFT: existingDeployment.contracts.SubdomainNFT,
      SubdomainEscrow: existingDeployment.contracts.SubdomainEscrow,
      DNSOracle: existingDeployment.contracts.DNSOracle,
      SubdomainMarketplace: existingDeployment.contracts.SubdomainMarketplace,
    },
  };

  fs.writeFileSync(existingDeploymentFile, JSON.stringify(newDeployment, null, 2));
  console.log(`\nDeployment saved to: ${existingDeploymentFile}`);

  // Print summary
  console.log("\nNew Contract Addresses:");
  console.log(`  SubdomainNFT:         ${nftAddress}`);
  console.log(`  DNSOracle:            ${dnsOracleAddress}`);
  console.log(`  SubdomainEscrow:      ${escrowAddress}`);
  console.log(`  SubdomainMarketplace: ${marketplaceAddress}`);
  console.log("");
  console.log("Reused Contracts:");
  console.log(`  PriceOracle:  ${priceOracleAddress}`);
  console.log(`  HSRRegistry:  ${registryAddress}`);
  console.log(`  HSRResolver:  ${resolverAddress}`);
  console.log("");
  console.log("Integration Status: HSRRegistry <-> SubdomainNFT CONNECTED");
  console.log("");
  console.log("IMPORTANT: Update your backend .env with new contract addresses!");
  console.log(`  NEXT_PUBLIC_CONTRACT_NFT=${nftAddress}`);
  console.log(`  NEXT_PUBLIC_CONTRACT_ESCROW=${escrowAddress}`);
  console.log(`  NEXT_PUBLIC_CONTRACT_MARKETPLACE=${marketplaceAddress}`);
  console.log(`  NEXT_PUBLIC_CONTRACT_RESOLVER=${resolverAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
