/**
 * Upgrade NFT contract to add release() function
 * This script:
 * 1. Deploys new SubdomainNFT with release() function
 * 2. Deploys new SubdomainEscrow pointing to new NFT
 * 3. Updates DNS Oracle to use new escrow
 * 4. Grants roles on new NFT to new escrow
 */

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "C2FLR");

  // Current contract addresses
  const OLD_NFT = "0x3da78e0C432A9D64C4330816dEa225C6d6c16e83";
  const OLD_ESCROW = "0x8Ffe76719827a2a7e523AdB901cd2853c39bb922";
  const DNS_ORACLE = "0x218EB07c6ef92250DcfE0689a5309B10b96bA3Ff";
  const PRICE_ORACLE = "0xb46cf50EaBEa751FA6208d7136cC9BfA5dccf80f";
  const PLATFORM_WALLET = deployer.address;

  console.log("\n=== Deploying New NFT Contract ===");
  const SubdomainNFT = await hre.ethers.getContractFactory("SubdomainNFT");
  const newNFT = await SubdomainNFT.deploy(
    "Halcyon Subdomain",
    "HSUB",
    PLATFORM_WALLET
  );
  await newNFT.waitForDeployment();
  const newNFTAddress = await newNFT.getAddress();
  console.log("New NFT deployed to:", newNFTAddress);

  console.log("\n=== Deploying New Escrow Contract ===");
  const SubdomainEscrow = await hre.ethers.getContractFactory("SubdomainEscrow");
  const newEscrow = await SubdomainEscrow.deploy(
    newNFTAddress,
    PRICE_ORACLE,
    DNS_ORACLE,
    PLATFORM_WALLET
  );
  await newEscrow.waitForDeployment();
  const newEscrowAddress = await newEscrow.getAddress();
  console.log("New Escrow deployed to:", newEscrowAddress);

  console.log("\n=== Granting Roles on New NFT ===");
  const MINTER_ROLE = await newNFT.MINTER_ROLE();
  const OPERATOR_ROLE = await newNFT.OPERATOR_ROLE();

  // Grant roles to new escrow
  await newNFT.grantRole(MINTER_ROLE, newEscrowAddress);
  console.log("  ✓ MINTER_ROLE granted to new escrow");
  await newNFT.grantRole(OPERATOR_ROLE, newEscrowAddress);
  console.log("  ✓ OPERATOR_ROLE granted to new escrow");

  // Grant operator to backend wallet for DNS status updates
  await newNFT.grantRole(OPERATOR_ROLE, deployer.address);
  console.log("  ✓ OPERATOR_ROLE granted to backend wallet");

  console.log("\n=== Updating DNS Oracle ===");
  const dnsOracle = await hre.ethers.getContractAt("DNSOracle", DNS_ORACLE);
  await dnsOracle.setEscrowContract(newEscrowAddress);
  console.log("  ✓ DNS Oracle updated to use new escrow");

  console.log("\n=== Pausing Old Escrow ===");
  const oldEscrow = await hre.ethers.getContractAt("SubdomainEscrow", OLD_ESCROW);
  try {
    await oldEscrow.pause();
    console.log("  ✓ Old escrow paused");
  } catch (e) {
    console.log("  ⚠ Old escrow already paused or error:", e.message);
  }

  console.log("\n========================================");
  console.log("DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("\nUpdate .env files with:");
  console.log(`CONTRACT_NFT=${newNFTAddress}`);
  console.log(`CONTRACT_ESCROW=${newEscrowAddress}`);
  console.log("\nOther addresses unchanged:");
  console.log(`CONTRACT_DNS_ORACLE=${DNS_ORACLE}`);
  console.log(`CONTRACT_PRICE_ORACLE=${PRICE_ORACLE}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
