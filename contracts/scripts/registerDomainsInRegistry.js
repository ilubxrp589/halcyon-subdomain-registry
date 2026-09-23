const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Register Domains in HSRRegistry
 *
 * The HSRRegistry is separate from the NFT contract and needs domains
 * to be explicitly registered before the resolver can be used.
 *
 * This script registers all 10 purchased domains in the HSRRegistry
 * using the deployer wallet (which has MINTER_ROLE).
 */

const DOMAINS = [
  { subdomain: "alpha", tld: "cryptofans", tokenId: 5, owner: "0x04b2289f67992A27C0472Abc3B100b0642e96dfe" },
  { subdomain: "bravo", tld: "cryptofans", tokenId: 6, owner: "0x7a9948153Af6FB04A9e5DE67a7C24c2F3BBa8904" },
  { subdomain: "charlie", tld: "cryptofans", tokenId: 7, owner: "0xFCb716489EAa2CAF5CC779d091538dC96002Cb67" },
  { subdomain: "delta", tld: "cryptofans", tokenId: 8, owner: "0x2556a52Bb981a871C3208C0b6AEc5Ec524b7cEcC" },
  { subdomain: "echo", tld: "cryptofans", tokenId: 9, owner: "0xB4eF52c3370E6c5eED4eEc792300B7c00A147b93" },
  { subdomain: "foxtrot", tld: "cryptofans", tokenId: 10, owner: "0x9c90970A49FffB11b201a00e8D25a1a050a11B79" },
  { subdomain: "golf", tld: "cryptofans", tokenId: 11, owner: "0x5489C4CaF9b1cb20eecF61A55B11ab69bc8Eca61" },
  { subdomain: "hotel", tld: "cryptofans", tokenId: 12, owner: "0xb5759dD383b4dAc9336A55A4A437d718C8CBB2bE" },
  { subdomain: "india", tld: "cryptofans", tokenId: 13, owner: "0x77769713749D5645cdc52F542B5094D841FD4dB8" },
  { subdomain: "juliet", tld: "cryptofans", tokenId: 14, owner: "0xe8414E9C7c9455133B795870695Bf8c118DC2Cc4" },
];

async function main() {
  console.log("=".repeat(60));
  console.log("HSR - Register Domains in HSRRegistry");
  console.log("=".repeat(60));

  // Load deployment
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const deployment = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "coston2.json"), "utf8"));

  const registryAddress = deployment.contracts.HSRRegistry;
  const resolverAddress = deployment.contracts.HSRResolver;

  console.log(`\nHSRRegistry: ${registryAddress}`);
  console.log(`HSRResolver: ${resolverAddress}`);

  // Get signer (deployer has MINTER_ROLE)
  const [signer] = await hre.ethers.getSigners();
  console.log(`Signer: ${signer.address}\n`);

  // Get registry contract
  const registry = await hre.ethers.getContractAt("HSRRegistry", registryAddress, signer);

  // Verify we have MINTER_ROLE
  const MINTER_ROLE = await registry.MINTER_ROLE();
  const hasMinterRole = await registry.hasRole(MINTER_ROLE, signer.address);
  console.log(`Has MINTER_ROLE: ${hasMinterRole}`);

  if (!hasMinterRole) {
    console.error("ERROR: Signer does not have MINTER_ROLE");
    process.exit(1);
  }

  const results = [];

  // Register each domain
  for (const domain of DOMAINS) {
    const fqdn = `${domain.subdomain}.${domain.tld}`;
    console.log("\n" + "─".repeat(60));
    console.log(`Registering: ${fqdn}`);
    console.log(`  Token ID: ${domain.tokenId}`);
    console.log(`  Owner: ${domain.owner}`);

    try {
      // Check if already registered
      const namehash = await registry.computeNamehash(fqdn);
      const exists = await registry.recordExists(namehash);

      if (exists) {
        console.log("  ⚠️  Already registered in HSRRegistry");
        const record = await registry.getRecord(namehash);
        console.log(`  Current owner: ${record._owner}`);
        results.push({ fqdn, status: "already_registered" });
        continue;
      }

      // Register the domain
      // Use address(0) for resolver to use defaultResolver
      const tx = await registry.registerSubdomainByFQDN(
        fqdn,
        domain.tokenId,
        domain.owner,
        "0x0000000000000000000000000000000000000000" // Use default resolver
      );

      console.log(`  TX: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  ✅ Registered in block ${receipt.blockNumber}`);

      // Verify
      const newExists = await registry.recordExists(namehash);
      const newRecord = await registry.getRecord(namehash);
      console.log(`  Verified - Owner: ${newRecord._owner}, Resolver: ${newRecord._resolver}`);

      results.push({
        fqdn,
        tokenId: domain.tokenId,
        owner: domain.owner,
        namehash,
        txHash: tx.hash,
        status: "success"
      });

    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      results.push({ fqdn, status: "failed", error: error.message });
    }

    // Small delay
    await new Promise(r => setTimeout(r, 500));
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("REGISTRATION SUMMARY");
  console.log("=".repeat(60));

  const successful = results.filter(r => r.status === "success" || r.status === "already_registered");
  const failed = results.filter(r => r.status === "failed");

  console.log(`\n✅ Registered: ${successful.length}`);
  successful.forEach(r => {
    console.log(`   ${r.fqdn}`);
  });

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}`);
    failed.forEach(r => {
      console.log(`   ${r.fqdn}: ${r.error}`);
    });
  }

  console.log("\n" + "─".repeat(60));
  console.log("Next step: Run setResolvedAddresses.js to set wallet addresses");
  console.log("─".repeat(60));

  // Save results
  const resultsFile = path.join(__dirname, "..", "registry-results.json");
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${resultsFile}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
