const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("=".repeat(60));
  console.log("Upgrading SubdomainEscrow Contract");
  console.log("=".repeat(60));
  console.log(`Deployer: ${deployer.address}`);

  // Existing contract addresses (Coston2)
  const existingContracts = {
    nft: "0xb8143EE12EC3e3821fA8d546E561435Ae1190763",
    priceOracle: "0xb46cf50EaBEa751FA6208d7136cC9BfA5dccf80f",
    dnsOracle: "0x218EB07c6ef92250DcfE0689a5309B10b96bA3Ff",
    oldEscrow: "0x4C4dC8a3ed374c280d43996BDa7Cf6aA43c11267",
  };

  const platformRecipient = "0xCafB8B7BccfF0379a8df7EF4F613914D4cebd34B";

  console.log("\nExisting contracts:");
  console.log(`  NFT:         ${existingContracts.nft}`);
  console.log(`  PriceOracle: ${existingContracts.priceOracle}`);
  console.log(`  DNSOracle:   ${existingContracts.dnsOracle}`);
  console.log(`  Old Escrow:  ${existingContracts.oldEscrow}`);
  console.log("");

  // Deploy new escrow
  console.log("Deploying new SubdomainEscrow...");
  const SubdomainEscrow = await hre.ethers.getContractFactory("SubdomainEscrow");
  const newEscrow = await SubdomainEscrow.deploy(
    existingContracts.nft,
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

  // Grant MINTER_ROLE to new escrow
  console.log("\nGranting MINTER_ROLE to new escrow...");
  const NFT = await hre.ethers.getContractAt("SubdomainNFT", existingContracts.nft);
  const MINTER_ROLE = await NFT.MINTER_ROLE();
  const grantMinterTx = await NFT.grantRole(MINTER_ROLE, newEscrowAddress);
  await grantMinterTx.wait();
  console.log("  MINTER_ROLE granted");

  // Grant OPERATOR_ROLE to new escrow
  console.log("\nGranting OPERATOR_ROLE to new escrow...");
  const OPERATOR_ROLE = await NFT.OPERATOR_ROLE();
  const grantOperatorTx = await NFT.grantRole(OPERATOR_ROLE, newEscrowAddress);
  await grantOperatorTx.wait();
  console.log("  OPERATOR_ROLE granted");

  // Revoke roles from old escrow
  console.log("\nRevoking roles from old escrow...");
  try {
    await NFT.revokeRole(MINTER_ROLE, existingContracts.oldEscrow);
    await NFT.revokeRole(OPERATOR_ROLE, existingContracts.oldEscrow);
    console.log("  Roles revoked from old escrow");
  } catch (e) {
    console.log("  Could not revoke roles (may already be revoked)");
  }

  console.log("\n" + "=".repeat(60));
  console.log("Upgrade Complete!");
  console.log("=".repeat(60));
  console.log(`\nNEW ESCROW ADDRESS: ${newEscrowAddress}`);
  console.log("\nUpdate your .env files:");
  console.log(`  NEXT_PUBLIC_CONTRACT_ESCROW=${newEscrowAddress}`);
  console.log(`  ESCROW_CONTRACT=${newEscrowAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
