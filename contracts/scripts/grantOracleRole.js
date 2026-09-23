const hre = require("hardhat");

/**
 * Grant ORACLE_ROLE to the backend wallet on the OLD DNS Oracle contract
 *
 * The backend needs ORACLE_ROLE to call confirmDNSRegistration
 */
async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("=".repeat(60));
  console.log("Grant ORACLE_ROLE to Backend Wallet");
  console.log("=".repeat(60));
  console.log(`Signer: ${deployer.address}`);

  // OLD DNS Oracle (what backend is using from .env)
  const DNS_ORACLE_ADDRESS = "0x218EB07c6ef92250DcfE0689a5309B10b96bA3Ff";
  // Backend wallet that needs the role
  const BACKEND_WALLET = "0x89201a4C30ddB1D9AC1c3592B51634a1623c88a7";

  console.log(`DNS Oracle: ${DNS_ORACLE_ADDRESS}`);
  console.log(`Backend Wallet: ${BACKEND_WALLET}`);
  console.log("");

  // Get the DNSOracle contract
  const DNSOracle = await hre.ethers.getContractFactory("DNSOracle");
  const dnsOracle = DNSOracle.attach(DNS_ORACLE_ADDRESS);

  // Get ORACLE_ROLE
  const ORACLE_ROLE = await dnsOracle.ORACLE_ROLE();
  console.log(`ORACLE_ROLE: ${ORACLE_ROLE}`);

  // Check if already has role
  const hasRole = await dnsOracle.hasRole(ORACLE_ROLE, BACKEND_WALLET);
  if (hasRole) {
    console.log("\n✓ Backend wallet already has ORACLE_ROLE");
    return;
  }

  console.log("\nGranting ORACLE_ROLE to backend wallet...");
  const tx = await dnsOracle.grantRole(ORACLE_ROLE, BACKEND_WALLET);
  console.log(`Transaction: ${tx.hash}`);

  await tx.wait(2);
  console.log("✓ Role granted successfully!");

  // Verify
  const nowHasRole = await dnsOracle.hasRole(ORACLE_ROLE, BACKEND_WALLET);
  console.log(`\nVerification: Backend wallet has ORACLE_ROLE: ${nowHasRole}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
