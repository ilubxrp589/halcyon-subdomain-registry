const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Cleanup HSRRegistry entries for burned NFTs
 */

const DOMAINS = [
  "alpha.cryptofans",
  "bravo.cryptofans",
  "charlie.cryptofans",
  "delta.cryptofans",
  "echo.cryptofans",
  "foxtrot.cryptofans",
  "golf.cryptofans",
  "hotel.cryptofans",
  "india.cryptofans",
  "juliet.cryptofans",
];

// Namehash computation
function namehash(name) {
  if (!name || name === '') {
    return '0x' + '00'.repeat(32);
  }
  const labels = name.split('.').reverse();
  let node = '0x' + '00'.repeat(32);
  for (const label of labels) {
    const labelHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(label));
    node = hre.ethers.keccak256(hre.ethers.concat([node, labelHash]));
  }
  return node;
}

async function main() {
  console.log("=".repeat(60));
  console.log("Cleanup HSRRegistry Entries");
  console.log("=".repeat(60));

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const deployment = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "coston2.json"), "utf8"));

  const registryAddress = deployment.contracts.HSRRegistry;
  console.log(`\nHSRRegistry: ${registryAddress}`);

  const [signer] = await hre.ethers.getSigners();
  console.log(`Signer: ${signer.address}`);

  const registry = await hre.ethers.getContractAt("HSRRegistry", registryAddress, signer);

  let unregistered = 0;
  let skipped = 0;

  for (const fqdn of DOMAINS) {
    console.log(`\n  ${fqdn}:`);
    const node = namehash(fqdn);

    try {
      const exists = await registry.recordExists(node);
      if (!exists) {
        console.log(`    ⚠️  Not registered, skipping`);
        skipped++;
        continue;
      }

      const tx = await registry.unregister(node);
      console.log(`    TX: ${tx.hash}`);
      await tx.wait();
      console.log(`    ✅ Unregistered`);
      unregistered++;

    } catch (error) {
      console.log(`    ❌ Error: ${error.message}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`SUMMARY: ${unregistered} unregistered, ${skipped} skipped`);
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
