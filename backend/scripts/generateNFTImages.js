import 'dotenv/config';

/**
 * Generate AI NFT Images for Batch-Purchased Domains
 *
 * Calls the /nft/prepare endpoint for each domain to generate
 * proper AI artwork and upload to IPFS.
 */

const HSR_API = "http://localhost:8000/api/v1";

const DOMAINS = [
  { subdomain: "alpha", tld: "cryptofans" },
  { subdomain: "bravo", tld: "cryptofans" },
  { subdomain: "charlie", tld: "cryptofans" },
  { subdomain: "delta", tld: "cryptofans" },
  { subdomain: "echo", tld: "cryptofans" },
  { subdomain: "foxtrot", tld: "cryptofans" },
  { subdomain: "golf", tld: "cryptofans" },
  { subdomain: "hotel", tld: "cryptofans" },
  { subdomain: "india", tld: "cryptofans" },
  { subdomain: "juliet", tld: "cryptofans" },
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("=".repeat(60));
  console.log("Generate AI NFT Images for Batch-Purchased Domains");
  console.log("=".repeat(60));
  console.log("\nThis will generate AI artwork for each domain.");
  console.log("Each image takes ~10-30 seconds to generate.\n");

  let success = 0;
  let failed = 0;

  for (let i = 0; i < DOMAINS.length; i++) {
    const domain = DOMAINS[i];
    const fqdn = `${domain.subdomain}.${domain.tld}`;

    console.log(`\n[${i + 1}/${DOMAINS.length}] Generating: ${fqdn}`);
    console.log("  Calling /nft/prepare endpoint...");

    try {
      const startTime = Date.now();

      const response = await fetch(`${HSR_API}/nft/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subdomain: domain.subdomain,
          tld: domain.tld,
          theme: "default",
        }),
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (response.ok) {
        const data = await response.json();
        console.log(`  ✅ Generated in ${elapsed}s`);
        console.log(`     Image CID: ${data.imageCID || 'N/A'}`);
        console.log(`     Metadata URI: ${data.metadataURI || 'N/A'}`);
        success++;
      } else {
        const error = await response.text();
        console.log(`  ❌ Failed (${response.status}): ${error}`);
        failed++;
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      failed++;
    }

    // Small delay between requests to avoid rate limiting
    if (i < DOMAINS.length - 1) {
      console.log("  Waiting 2s before next...");
      await sleep(2000);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`SUMMARY: ${success} generated, ${failed} failed`);
  console.log("=".repeat(60));
  console.log("\nRefresh the Bifrost Clone GUI to see the new NFT artwork.");
}

main().catch(console.error);
