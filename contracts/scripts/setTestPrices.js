const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Set Test Prices Script
 *
 * Sets very low USD prices on the SubdomainEscrow contract for testing.
 * This allows purchasing subdomains with 0.01 FLR instead of ~1000 FLR.
 */

async function main() {
  console.log("=".repeat(60));
  console.log("HSR - Set Test Prices on SubdomainEscrow");
  console.log("=".repeat(60));

  // Load deployment
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const deployment = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "coston2.json"), "utf8"));

  // Use the old escrow address that the backend is actively listening to
  const escrowAddress = deployment.previousDeployment?.SubdomainEscrow || deployment.contracts.SubdomainEscrow;
  console.log(`\nSubdomainEscrow: ${escrowAddress}`);

  // Get signer (deployer is the owner)
  const [signer] = await hre.ethers.getSigners();
  console.log(`Signer: ${signer.address}`);

  // Get contract instance
  const escrow = await hre.ethers.getContractAt("SubdomainEscrow", escrowAddress, signer);

  // Check current prices
  console.log("\nCurrent USD prices (in wei):");
  const currentUltraPremium = await escrow.priceUltraPremiumUSD();
  const currentPremium = await escrow.pricePremiumUSD();
  const currentStandardPlus = await escrow.priceStandardPlusUSD();
  const currentStandard = await escrow.priceStandardUSD();

  console.log(`  Ultra Premium (1 char): $${hre.ethers.formatEther(currentUltraPremium)}`);
  console.log(`  Premium (2 chars): $${hre.ethers.formatEther(currentPremium)}`);
  console.log(`  Standard Plus (3 chars): $${hre.ethers.formatEther(currentStandardPlus)}`);
  console.log(`  Standard (4+ chars): $${hre.ethers.formatEther(currentStandard)}`);

  // Set test prices: $0.01 USD
  // With C2FLR at ~$0.01, this means:
  // $0.01 / $0.01 = 1 C2FLR
  const testPriceUSD = hre.ethers.parseEther("0.01"); // $0.01

  console.log("\n" + "-".repeat(60));
  console.log("Setting new test prices...");
  console.log(`  All tiers: $${hre.ethers.formatEther(testPriceUSD)}`);
  console.log("-".repeat(60));

  const tx = await escrow.setPrices(
    testPriceUSD,  // ultraPremium
    testPriceUSD,  // premium
    testPriceUSD,  // standardPlus
    testPriceUSD   // standard
  );

  console.log(`\nTX sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`TX confirmed in block: ${receipt.blockNumber}`);

  // Verify new prices
  console.log("\nNew USD prices:");
  const newUltraPremium = await escrow.priceUltraPremiumUSD();
  const newPremium = await escrow.pricePremiumUSD();
  const newStandardPlus = await escrow.priceStandardPlusUSD();
  const newStandard = await escrow.priceStandardUSD();

  console.log(`  Ultra Premium (1 char): $${hre.ethers.formatEther(newUltraPremium)}`);
  console.log(`  Premium (2 chars): $${hre.ethers.formatEther(newPremium)}`);
  console.log(`  Standard Plus (3 chars): $${hre.ethers.formatEther(newStandardPlus)}`);
  console.log(`  Standard (4+ chars): $${hre.ethers.formatEther(newStandard)}`);

  // Check what the FLR price would be now for a standard subdomain
  const priceOracle = await hre.ethers.getContractAt("IPriceOracle", await escrow.priceOracle());
  const flrPrice = await priceOracle.convertUSDtoFLR(newStandard);
  console.log(`\nFLR price for standard subdomain: ${hre.ethers.formatEther(flrPrice)} FLR`);

  console.log("\n" + "=".repeat(60));
  console.log("✅ Test prices set successfully!");
  console.log("   You can now purchase subdomains with ~1 C2FLR");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
