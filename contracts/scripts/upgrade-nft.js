const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("=".repeat(60));
  console.log("Upgrading SubdomainNFT Contract");
  console.log("=".repeat(60));
  console.log(`Deployer: ${deployer.address}`);

  // Existing contract addresses (Coston2)
  const existingContracts = {
    oldNft: "0xb8143EE12EC3e3821fA8d546E561435Ae1190763",
    escrow: "0x207D72743F9FFD74e9885EafFd937EB106B5f595",
    priceOracle: "0xb46cf50EaBEa751FA6208d7136cC9BfA5dccf80f",
    dnsOracle: "0x218EB07c6ef92250DcfE0689a5309B10b96bA3Ff",
  };

  const platformRecipient = "0xCafB8B7BccfF0379a8df7EF4F613914D4cebd34B";

  console.log("\nExisting contracts:");
  console.log(`  Old NFT:      ${existingContracts.oldNft}`);
  console.log(`  Escrow:       ${existingContracts.escrow}`);
  console.log(`  PriceOracle:  ${existingContracts.priceOracle}`);
  console.log(`  DNSOracle:    ${existingContracts.dnsOracle}`);
  console.log("");

  // Deploy new NFT contract with updateTokenURI function
  console.log("Deploying new SubdomainNFT...");
  const SubdomainNFT = await hre.ethers.getContractFactory("SubdomainNFT");
  const newNft = await SubdomainNFT.deploy(
    "Halcyon Subdomains",
    "HSUB",
    platformRecipient
  );
  await newNft.waitForDeployment();
  const newNftAddress = await newNft.getAddress();
  console.log(`  New NFT: ${newNftAddress}`);

  // Deploy new escrow pointing to new NFT
  console.log("\nDeploying new SubdomainEscrow...");
  const SubdomainEscrow = await hre.ethers.getContractFactory("SubdomainEscrow");
  const newEscrow = await SubdomainEscrow.deploy(
    newNftAddress,
    existingContracts.priceOracle,
    existingContracts.dnsOracle,
    platformRecipient
  );
  await newEscrow.waitForDeployment();
  const newEscrowAddress = await newEscrow.getAddress();
  console.log(`  New Escrow: ${newEscrowAddress}`);

  // Update DNS Oracle to use new escrow
  console.log("\nUpdating DNSOracle with new escrow...");
  const DNSOracle = await hre.ethers.getContractAt("DNSOracle", existingContracts.dnsOracle);
  const setEscrowTx = await DNSOracle.setEscrowContract(newEscrowAddress);
  await setEscrowTx.wait();
  console.log("  DNSOracle updated");

  // Grant roles on new NFT
  console.log("\nGranting roles on new NFT...");
  const MINTER_ROLE = await newNft.MINTER_ROLE();
  const OPERATOR_ROLE = await newNft.OPERATOR_ROLE();

  // Grant MINTER_ROLE to escrow
  await (await newNft.grantRole(MINTER_ROLE, newEscrowAddress)).wait();
  console.log("  MINTER_ROLE granted to escrow");

  // Grant OPERATOR_ROLE to escrow
  await (await newNft.grantRole(OPERATOR_ROLE, newEscrowAddress)).wait();
  console.log("  OPERATOR_ROLE granted to escrow");

  // Grant OPERATOR_ROLE to deployer (for updating URIs)
  await (await newNft.grantRole(OPERATOR_ROLE, deployer.address)).wait();
  console.log("  OPERATOR_ROLE granted to deployer");

  // Set treasury address for domain reclaim
  const treasuryAddress = process.env.TREASURY_ADDRESS || platformRecipient;
  console.log(`\n  Setting treasury address: ${treasuryAddress}...`);
  await (await newNft.setTreasuryAddress(treasuryAddress)).wait();
  console.log("  Treasury address set");

  // Grant OPERATOR_ROLE to operator wallet if configured
  const operatorAddress = process.env.OPERATOR_ADDRESS;
  if (operatorAddress && operatorAddress !== deployer.address) {
    await (await newNft.grantRole(OPERATOR_ROLE, operatorAddress)).wait();
    console.log(`  OPERATOR_ROLE granted to operator: ${operatorAddress}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Upgrade Complete!");
  console.log("=".repeat(60));
  console.log(`\nNEW CONTRACT ADDRESSES:`);
  console.log(`  NFT:    ${newNftAddress}`);
  console.log(`  Escrow: ${newEscrowAddress}`);
  console.log("\nUpdate your .env files:");
  console.log(`  CONTRACT_NFT=${newNftAddress}`);
  console.log(`  CONTRACT_ESCROW=${newEscrowAddress}`);
  console.log(`  NEXT_PUBLIC_CONTRACT_NFT=${newNftAddress}`);
  console.log(`  NEXT_PUBLIC_CONTRACT_ESCROW=${newEscrowAddress}`);
  console.log("\nNote: Old NFTs on previous contract will remain there.");
  console.log("New purchases will use the updated contracts with correct metadata URLs.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
