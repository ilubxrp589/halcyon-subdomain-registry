import pool from '../src/db/index.js';
import { keccak256, toUtf8Bytes, concat, zeroPadValue } from 'ethers';

/**
 * HSR Database Seed Script
 *
 * Seeds the database with initial data:
 * - TLDs
 * - Reserved words
 * - Test domains (development only)
 * - Watcher state
 *
 * Usage: node scripts/seed.js
 */

const seedData = async () => {
  console.log('🌱 Seeding HSR database...\n');

  try {
    // 1. Add TLDs
    const tldResult = await pool.query(`
      INSERT INTO tlds (name, is_active) VALUES
        ('cryptofans', true),
        ('aisoftwaredesign', true),
        ('aiworktools', true)
      ON CONFLICT (name) DO NOTHING
      RETURNING name;
    `);
    console.log(`✓ TLDs seeded (${tldResult.rowCount} new)`);

    // 2. Add reserved words
    const reservedResult = await pool.query(`
      INSERT INTO reserved_words (word, reason, added_by) VALUES
        ('admin', 'System reserved', '0x0000000000000000000000000000000000000000'),
        ('administrator', 'System reserved', '0x0000000000000000000000000000000000000000'),
        ('support', 'System reserved', '0x0000000000000000000000000000000000000000'),
        ('help', 'System reserved', '0x0000000000000000000000000000000000000000'),
        ('api', 'System reserved', '0x0000000000000000000000000000000000000000'),
        ('www', 'System reserved', '0x0000000000000000000000000000000000000000'),
        ('mail', 'System reserved', '0x0000000000000000000000000000000000000000'),
        ('email', 'System reserved', '0x0000000000000000000000000000000000000000'),
        ('ftp', 'System reserved', '0x0000000000000000000000000000000000000000'),
        ('ssh', 'System reserved', '0x0000000000000000000000000000000000000000'),
        ('root', 'System reserved', '0x0000000000000000000000000000000000000000'),
        ('ns1', 'DNS reserved', '0x0000000000000000000000000000000000000000'),
        ('ns2', 'DNS reserved', '0x0000000000000000000000000000000000000000'),
        ('dns', 'DNS reserved', '0x0000000000000000000000000000000000000000'),
        ('test', 'Testing reserved', '0x0000000000000000000000000000000000000000'),
        ('demo', 'Testing reserved', '0x0000000000000000000000000000000000000000'),
        ('null', 'Invalid name', '0x0000000000000000000000000000000000000000'),
        ('undefined', 'Invalid name', '0x0000000000000000000000000000000000000000'),
        ('localhost', 'Invalid name', '0x0000000000000000000000000000000000000000'),
        ('halcyon', 'Brand reserved', '0x0000000000000000000000000000000000000000'),
        ('hsr', 'Brand reserved', '0x0000000000000000000000000000000000000000')
      ON CONFLICT (word) DO NOTHING
      RETURNING word;
    `);
    console.log(`✓ Reserved words seeded (${reservedResult.rowCount} new)`);

    // 2b. Seed tlds_v2 (TLD staking registry)
    const labelHash = keccak256(toUtf8Bytes('cryptofans'));
    const tldNamehash = keccak256(concat([zeroPadValue('0x', 32), labelHash]));
    const tldV2Result = await pool.query(`
      INSERT INTO tlds_v2 (token_id, label, namehash, owner_address, registration_enabled)
      VALUES (1, 'cryptofans', $1, '0xCafB8B7BccfF0379a8df7EF4F613914D4cebd34B', false)
      ON CONFLICT (label) DO NOTHING
      RETURNING label;
    `, [tldNamehash]);
    console.log(`✓ tlds_v2 seeded (${tldV2Result.rowCount} new)`);

    // 3. Add test domains (only in development)
    const isDev = process.env.NODE_ENV !== 'production';

    if (isDev) {
      const testWallet = process.env.TEST_WALLET || '0x89201a4C30ddB1D9AC1c3592B51634a1623c88a7';

      // Get TLD ID
      const { rows: [tld] } = await pool.query(
        `SELECT id FROM tlds WHERE name = 'cryptofans'`
      );

      if (tld) {
        const domainResult = await pool.query(`
          INSERT INTO domains (
            token_id, subdomain, tld_id, fqdn, owner_wallet, original_buyer,
            registration_price_flr, registration_price_usd, registration_date,
            expiration_date, status, tier, dns_active
          ) VALUES
            -- Ultra Premium (1 char) — prices in FLR, not wei
            (1001, 'a', $1, 'a.cryptofans', $2, $2, 25000, 500, NOW(), NOW() + INTERVAL '1 year', 'active', 'ultra_premium', true),
            (1002, 'x', $1, 'x.cryptofans', $2, $2, 25000, 500, NOW(), NOW() + INTERVAL '1 year', 'active', 'ultra_premium', true),
            -- Premium (2 chars)
            (1003, 'ai', $1, 'ai.cryptofans', $2, $2, 10000, 200, NOW(), NOW() + INTERVAL '1 year', 'active', 'premium', true),
            (1004, 'go', $1, 'go.cryptofans', $2, $2, 10000, 200, NOW(), NOW() + INTERVAL '1 year', 'active', 'premium', true),
            -- Standard Plus (3 chars)
            (1005, 'eth', $1, 'eth.cryptofans', $2, $2, 4000, 50, NOW(), NOW() + INTERVAL '1 year', 'active', 'standard_plus', true),
            (1006, 'nft', $1, 'nft.cryptofans', $2, $2, 4000, 50, NOW(), NOW() + INTERVAL '1 year', 'active', 'standard_plus', true),
            -- Standard (4+ chars)
            (1007, 'alice', $1, 'alice.cryptofans', $2, $2, 500, 10, NOW(), NOW() + INTERVAL '1 year', 'active', 'standard', true),
            (1008, 'bob', $1, 'bob.cryptofans', $2, $2, 500, 10, NOW(), NOW() + INTERVAL '1 year', 'active', 'standard', true),
            (1009, 'dragon', $1, 'dragon.cryptofans', $2, $2, 500, 10, NOW(), NOW() + INTERVAL '1 year', 'active', 'standard', true),
            (1010, 'cosmic', $1, 'cosmic.cryptofans', $2, $2, 500, 10, NOW(), NOW() + INTERVAL '1 year', 'active', 'standard', true),
            (1011, 'cyber', $1, 'cyber.cryptofans', $2, $2, 500, 10, NOW(), NOW() + INTERVAL '1 year', 'active', 'standard', true),
            (1012, 'flare', $1, 'flare.cryptofans', $2, $2, 500, 10, NOW(), NOW() + INTERVAL '1 year', 'active', 'standard', true)
          ON CONFLICT (fqdn) DO NOTHING
          RETURNING fqdn;
        `, [tld.id, testWallet]);
        console.log(`✓ Test domains seeded (${domainResult.rowCount} new)`);

        // 4. Add test marketplace listings
        const listingResult = await pool.query(`
          INSERT INTO marketplace_listings (
            listing_id, token_id, fqdn, seller_wallet, price, listing_type, status, created_at
          ) VALUES
            (9001, 1009, 'dragon.cryptofans', $1, 1000, 'fixed_price', 'active', NOW() - INTERVAL '2 days'),
            (9002, 1010, 'cosmic.cryptofans', $1, 750, 'fixed_price', 'active', NOW() - INTERVAL '1 day'),
            (9003, 1011, 'cyber.cryptofans', $1, 500, 'auction', 'active', NOW() - INTERVAL '12 hours')
          ON CONFLICT (listing_id) DO NOTHING
          RETURNING listing_id;
        `, [testWallet]);
        console.log(`✓ Test marketplace listings seeded (${listingResult.rowCount} new)`);

        // 5. Add some address mappings for resolution testing
        await pool.query(`
          INSERT INTO address_mappings (domain_id, token_id, fqdn, namehash, wallet_address, coin_type)
          SELECT d.id, d.token_id, d.fqdn,
                 encode(sha256(d.fqdn::bytea), 'hex'),
                 d.owner_wallet,
                 2147483662
          FROM domains d
          WHERE d.fqdn IN ('alice.cryptofans', 'bob.cryptofans', 'dragon.cryptofans')
          ON CONFLICT (namehash, coin_type) DO NOTHING;
        `);
        console.log('✓ Address mappings seeded');
      }
    } else {
      console.log('⏭ Skipping test data (production mode)');
    }

    // 6. Initialize watcher state
    await pool.query(`
      INSERT INTO watcher_state (key, value) VALUES
        ('last_processed_block', '0'),
        ('listener_running', 'false'),
        ('price_sync_running', 'false')
      ON CONFLICT (key) DO UPDATE SET
        updated_at = NOW();
    `);
    console.log('✓ Watcher state initialized');

    // 7. Add initial price sync record
    await pool.query(`
      INSERT INTO price_sync_history (old_price, new_price, synced_at)
      SELECT 0.01, 0.01, NOW()
      WHERE NOT EXISTS (SELECT 1 FROM price_sync_history LIMIT 1);
    `);
    console.log('✓ Price sync history initialized');

    // Summary
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM tlds) as tlds,
        (SELECT COUNT(*) FROM domains) as domains,
        (SELECT COUNT(*) FROM reserved_words) as reserved,
        (SELECT COUNT(*) FROM marketplace_listings WHERE status = 'active') as listings,
        (SELECT COUNT(*) FROM tlds_v2) as tlds_v2
    `);

    console.log('\n📊 Database Summary:');
    console.log(`   TLDs: ${stats.rows[0].tlds}`);
    console.log(`   TLDs v2: ${stats.rows[0].tlds_v2}`);
    console.log(`   Domains: ${stats.rows[0].domains}`);
    console.log(`   Reserved Words: ${stats.rows[0].reserved}`);
    console.log(`   Active Listings: ${stats.rows[0].listings}`);

    console.log('\n✅ Database seeding complete!');
  } catch (error) {
    console.error('\n❌ Seed error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run if called directly
seedData().catch(() => process.exit(1));
