import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

/**
 * Sync batch-purchased domains to database
 * These were minted on-chain but the DNS Oracle callback failed
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
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log("=".repeat(60));
  console.log("Sync Batch-Purchased Domains to Database");
  console.log("=".repeat(60));

  try {
    // Get TLD ID for cryptofans
    const tldResult = await pool.query("SELECT id FROM tlds WHERE name = 'cryptofans'");
    if (tldResult.rows.length === 0) {
      throw new Error("TLD 'cryptofans' not found");
    }
    const tldId = tldResult.rows[0].id;
    console.log(`\nTLD ID for cryptofans: ${tldId}`);

    let inserted = 0;
    let skipped = 0;

    for (const domain of DOMAINS) {
      const fqdn = `${domain.subdomain}.${domain.tld}`;

      // Check if already exists
      const existing = await pool.query(
        "SELECT id FROM domains WHERE fqdn = $1",
        [fqdn]
      );

      if (existing.rows.length > 0) {
        console.log(`  ⚠️  ${fqdn} already exists, skipping`);
        skipped++;
        continue;
      }

      // Insert domain
      await pool.query(`
        INSERT INTO domains (
          token_id, subdomain, tld_id, fqdn, owner_wallet, original_buyer,
          registration_price_flr, registration_price_usd,
          registration_date, status, tier, dns_active
        ) VALUES ($1, $2, $3, $4, $5, $5, $6, $7, NOW(), 'active', 'standard', false)
      `, [
        domain.tokenId,
        domain.subdomain,
        tldId,
        fqdn,
        domain.owner,
        "0.01",  // Test price
        "0.0001"
      ]);

      console.log(`  ✅ Inserted: ${fqdn} (Token #${domain.tokenId})`);
      inserted++;
    }

    console.log("\n" + "=".repeat(60));
    console.log(`SUMMARY: ${inserted} inserted, ${skipped} skipped`);
    console.log("=".repeat(60));

  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await pool.end();
  }
}

main();
