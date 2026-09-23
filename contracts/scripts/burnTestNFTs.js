const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Burn Test NFTs
 *
 * Burns all the test NFTs (tokens 5-14) created during batch purchase testing.
 * Requires OPERATOR_ROLE on the NFT contract.
 */

const TOKEN_IDS_TO_BURN = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

async function main() {
  console.log("=".repeat(60));
  console.log("Burn Test NFTs");
  console.log("=".repeat(60));

  // Load deployment
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const deployment = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "coston2.json"), "utf8"));

  // Use the OLD NFT contract that the backend is using
  const nftAddress = deployment.previousDeployment?.SubdomainNFT || deployment.contracts.SubdomainNFT;
  console.log(`\nNFT Contract: ${nftAddress}`);

  // Get signer (deployer has OPERATOR_ROLE)
  const [signer] = await hre.ethers.getSigners();
  console.log(`Signer: ${signer.address}`);

  // Get contract
  const nft = await hre.ethers.getContractAt("SubdomainNFT", nftAddress, signer);

  // Check if we have OPERATOR_ROLE
  const OPERATOR_ROLE = await nft.OPERATOR_ROLE();
  const hasRole = await nft.hasRole(OPERATOR_ROLE, signer.address);
  console.log(`Has OPERATOR_ROLE: ${hasRole}`);

  if (!hasRole) {
    console.error("ERROR: Signer does not have OPERATOR_ROLE");
    process.exit(1);
  }

  let burned = 0;
  let skipped = 0;

  console.log(`\nBurning ${TOKEN_IDS_TO_BURN.length} NFTs...`);

  for (const tokenId of TOKEN_IDS_TO_BURN) {
    console.log(`\n  Token #${tokenId}:`);

    try {
      // Check if token exists
      const owner = await nft.ownerOf(tokenId);
      console.log(`    Owner: ${owner}`);

      // Burn it
      const tx = await nft.burn(tokenId);
      console.log(`    TX: ${tx.hash}`);
      await tx.wait();
      console.log(`    ✅ Burned`);
      burned++;

    } catch (error) {
      if (error.message.includes("nonexistent token") || error.message.includes("invalid token")) {
        console.log(`    ⚠️  Token doesn't exist, skipping`);
        skipped++;
      } else {
        console.log(`    ❌ Error: ${error.message}`);
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`SUMMARY: ${burned} burned, ${skipped} skipped`);
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
