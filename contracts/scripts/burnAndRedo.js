const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Burn NFTs 15-24 for redo with proper themes
 */

const TOKEN_IDS_TO_BURN = [15, 16, 17, 18, 19, 20, 21, 22, 23, 24];

async function main() {
  console.log("=".repeat(60));
  console.log("Burn NFTs for Theme Redo");
  console.log("=".repeat(60));

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const deployment = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "coston2.json"), "utf8"));

  const nftAddress = deployment.previousDeployment?.SubdomainNFT || deployment.contracts.SubdomainNFT;
  console.log(`\nNFT Contract: ${nftAddress}`);

  const [signer] = await hre.ethers.getSigners();
  console.log(`Signer: ${signer.address}`);

  const nft = await hre.ethers.getContractAt("SubdomainNFT", nftAddress, signer);

  let burned = 0;
  let skipped = 0;

  for (const tokenId of TOKEN_IDS_TO_BURN) {
    process.stdout.write(`  Token #${tokenId}: `);
    try {
      await nft.ownerOf(tokenId);
      const tx = await nft.burn(tokenId);
      await tx.wait();
      console.log("✅ Burned");
      burned++;
    } catch (error) {
      if (error.message.includes("nonexistent") || error.message.includes("invalid")) {
        console.log("⚠️ Already burned");
        skipped++;
      } else {
        console.log(`❌ ${error.message.slice(0, 50)}`);
      }
    }
  }

  console.log(`\nSUMMARY: ${burned} burned, ${skipped} skipped`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
