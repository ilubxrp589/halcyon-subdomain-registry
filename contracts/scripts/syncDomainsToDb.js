const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Sync Purchased Domains to Database
 *
 * The batch purchase created NFTs on-chain but the DNS Oracle callback failed,
 * so the domains weren't registered in the database. This script syncs them.
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
  console.log("Sync Purchased Domains to HSR Database");
  console.log("=".repeat(60));

  // Use fetch to call the HSR backend API to insert domains
  const HSR_API = "http://localhost:8000/api/v1";

  for (const domain of DOMAINS) {
    const fqdn = `${domain.subdomain}.${domain.tld}`;
    console.log(`\nSyncing: ${fqdn}`);
    console.log(`  Token ID: ${domain.tokenId}`);
    console.log(`  Owner: ${domain.owner}`);

    try {
      // Call admin endpoint to insert domain
      const response = await fetch(`${HSR_API}/admin/sync-domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subdomain: domain.subdomain,
          tld: domain.tld,
          tokenId: domain.tokenId,
          owner: domain.owner,
          priceFLR: "0.01",
          priceUSD: "0.0001",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`  ✅ Synced: ${data.message || 'success'}`);
      } else {
        const error = await response.text();
        console.log(`  ⚠️  API returned ${response.status}: ${error}`);
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Sync complete. Refresh the Bifrost Clone GUI.");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
