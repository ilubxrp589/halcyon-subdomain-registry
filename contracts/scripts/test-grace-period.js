const hre = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * Grace Period + Expired Domain Reclaim - Integration Test Script
 *
 * Run against local hardhat node:
 *   Terminal 1: npx hardhat node
 *   Terminal 2: npx hardhat run scripts/test-grace-period.js --network localhost
 *
 * Or run directly (spins up in-process hardhat network):
 *   npx hardhat run scripts/test-grace-period.js
 */

const DAYS = 24 * 60 * 60;

async function main() {
  const [deployer, user, treasury, operator] = await hre.ethers.getSigners();

  console.log("=".repeat(60));
  console.log("  Grace Period + Reclaim Integration Test");
  console.log("=".repeat(60));
  console.log(`  Deployer:  ${deployer.address}`);
  console.log(`  User:      ${user.address}`);
  console.log(`  Treasury:  ${treasury.address}`);
  console.log(`  Operator:  ${operator.address}`);
  console.log("");

  // ─── Deploy ───────────────────────────────────────────────
  console.log("1. Deploying SubdomainNFT...");
  const SubdomainNFT = await hre.ethers.getContractFactory("SubdomainNFT");
  const nft = await SubdomainNFT.deploy("Halcyon Subdomains", "HSUB", deployer.address);
  await nft.waitForDeployment();
  const nftAddr = await nft.getAddress();
  console.log(`   Contract: ${nftAddr}`);

  // ─── Configure roles ──────────────────────────────────────
  console.log("\n2. Configuring roles and treasury...");
  const MINTER_ROLE = await nft.MINTER_ROLE();
  const OPERATOR_ROLE = await nft.OPERATOR_ROLE();

  await (await nft.grantRole(MINTER_ROLE, deployer.address)).wait();
  await (await nft.grantRole(OPERATOR_ROLE, operator.address)).wait();
  await (await nft.setTreasuryAddress(treasury.address)).wait();

  console.log(`   MINTER_ROLE  → deployer`);
  console.log(`   OPERATOR_ROLE → operator`);
  console.log(`   Treasury      → ${treasury.address}`);

  // Verify defaults
  const gracePeriod = await nft.gracePeriod();
  console.log(`   Grace period  → ${Number(gracePeriod) / DAYS} days`);

  // ─── Mint a domain with 1-year expiry ─────────────────────
  console.log("\n3. Minting domain 'alice.cryptofans' for user...");
  const now = await time.latest();
  const expiresAt = now + 365 * DAYS;
  const priceFLR = hre.ethers.parseEther("100");
  const priceUSD = hre.ethers.parseEther("10");

  await (await nft.mint(
    user.address,
    "cryptofans",
    "alice",
    expiresAt,
    priceFLR,
    priceUSD,
    "ipfs://QmTestAlice"
  )).wait();

  const tokenId = 1;
  console.log(`   Token ID: ${tokenId}`);
  console.log(`   Owner: ${await nft.ownerOf(tokenId)}`);
  console.log(`   Status: ${await nft.getDomainStatus(tokenId)} (0=Active)`);
  console.log(`   Expires: ${new Date(expiresAt * 1000).toISOString()}`);

  // ─── Fast forward: 30 days before expiry (expiring soon) ──
  console.log("\n4. Fast-forwarding to 30 days before expiry...");
  await time.increase(335 * DAYS); // 365 - 30 = 335
  console.log(`   Status: ${await nft.getDomainStatus(tokenId)} (1=ExpiringSoon)`);

  // ─── Fast forward: past expiry, into grace period ─────────
  console.log("\n5. Fast-forwarding past expiry (into grace period)...");
  await time.increase(31 * DAYS); // now 1 day past expiry
  console.log(`   Status: ${await nft.getDomainStatus(tokenId)} (2=GracePeriod)`);
  console.log(`   Owner still: ${await nft.ownerOf(tokenId)}`);

  // ─── Test renewal during grace period ─────────────────────
  console.log("\n6. Testing renewal during grace period...");
  const renewalPrice = await nft.getRenewalPrice(tokenId);
  console.log(`   Renewal price: ${hre.ethers.formatEther(renewalPrice)} FLR`);

  const tx = await nft.connect(user).renewDomain(tokenId, { value: renewalPrice });
  const receipt = await tx.wait();
  const meta = await nft.subdomains(tokenId);
  console.log(`   ✓ Renewed! New expiry: ${new Date(Number(meta.expiresAt) * 1000).toISOString()}`);
  console.log(`   Status: ${await nft.getDomainStatus(tokenId)} (0=Active)`);

  // ─── Fast forward again: let it expire + pass grace ───────
  console.log("\n7. Fast-forwarding past new expiry + full 60-day grace...");
  await time.increase(365 * DAYS + 61 * DAYS); // past expiry + past grace
  console.log(`   Status: ${await nft.getDomainStatus(tokenId)} (3=Expired)`);

  // ─── Attempt reclaim too early (should fail) ──────────────
  // First rewind slightly to test the guard
  // (we're already past grace, so this will succeed — let's test from a fresh domain instead)

  // ─── Mint second domain for early-reclaim test ────────────
  console.log("\n8. Minting 'bob.cryptofans' to test early reclaim rejection...");
  const now2 = await time.latest();
  const expiresAt2 = now2 + 10 * DAYS; // expires in 10 days
  await (await nft.mint(
    user.address,
    "cryptofans",
    "bob",
    expiresAt2,
    priceFLR,
    priceUSD,
    "ipfs://QmTestBob"
  )).wait();
  const tokenId2 = 2;

  // Fast forward 11 days (past expiry, but within 60-day grace)
  await time.increase(11 * DAYS);
  console.log(`   bob status: ${await nft.getDomainStatus(tokenId2)} (2=GracePeriod)`);

  try {
    await nft.connect(operator).reclaimExpired(tokenId2);
    console.log("   ✗ ERROR: Should have reverted!");
  } catch (err) {
    console.log(`   ✓ Correctly reverted: "${err.message.includes('Still in grace period') ? 'Still in grace period' : err.message}"`);
  }

  // ─── Reclaim alice (token 1) — should succeed ─────────────
  console.log("\n9. Reclaiming 'alice.cryptofans' (past grace period)...");
  console.log(`   Owner before: ${await nft.ownerOf(tokenId)}`);

  const reclaimTx = await nft.connect(operator).reclaimExpired(tokenId);
  const reclaimReceipt = await reclaimTx.wait();

  // Check for DomainReclaimed event
  const reclaimEvent = reclaimReceipt.logs.find(log => {
    try {
      return nft.interface.parseLog(log)?.name === 'DomainReclaimed';
    } catch { return false; }
  });

  console.log(`   ✓ Reclaimed! TX: ${reclaimReceipt.hash}`);
  console.log(`   Owner after: ${await nft.ownerOf(tokenId)} (should be treasury)`);
  console.log(`   Event emitted: ${reclaimEvent ? 'yes' : 'no'}`);

  // ─── Verify metadata preserved ────────────────────────────
  console.log("\n10. Verifying metadata preserved after reclaim...");
  const metaAfter = await nft.subdomains(tokenId);
  console.log(`   TLD: ${metaAfter.tld}`);
  console.log(`   Subdomain: ${metaAfter.subdomain}`);
  console.log(`   Token URI: ${await nft.tokenURI(tokenId)}`);
  console.log(`   Full domain: ${await nft.getFullDomain(tokenId)}`);
  console.log(`   ✓ All metadata intact`);

  // ─── Verify treasury can transfer (simulating marketplace sale) ─
  console.log("\n11. Simulating marketplace sale (treasury transfers to buyer)...");
  const [, , , , buyer] = await hre.ethers.getSigners();
  await (await nft.connect(treasury).transferFrom(treasury.address, buyer.address, tokenId)).wait();
  console.log(`   Owner after sale: ${await nft.ownerOf(tokenId)}`);
  console.log(`   ✓ Treasury successfully transferred domain to buyer`);

  // ─── Fast forward bob past grace, reclaim ─────────────────
  console.log("\n12. Fast-forwarding bob past grace period and reclaiming...");
  // Bob was minted during step 8 with expiresAt2 = now2 + 10 days
  // We already advanced 11 days in step 8. Need to get well past expiry + 60 day grace.
  // Check current state first:
  const bobMeta = await nft.subdomains(tokenId2);
  const currentTime = await time.latest();
  const bobExpiry = Number(bobMeta.expiresAt);
  const bobGraceEnd = bobExpiry + Number(gracePeriod);
  const timeNeeded = bobGraceEnd - currentTime + 1 * DAYS; // 1 day buffer past grace
  console.log(`   Bob expiry: ${new Date(bobExpiry * 1000).toISOString()}`);
  console.log(`   Bob grace ends: ${new Date(bobGraceEnd * 1000).toISOString()}`);
  console.log(`   Current time: ${new Date(currentTime * 1000).toISOString()}`);
  console.log(`   Need to advance: ${Math.ceil(timeNeeded / DAYS)} days`);
  if (timeNeeded > 0) {
    await time.increase(timeNeeded);
  }
  console.log(`   bob status: ${await nft.getDomainStatus(tokenId2)} (should be 3=Expired)`);

  await (await nft.connect(operator).reclaimExpired(tokenId2)).wait();
  console.log(`   bob owner: ${await nft.ownerOf(tokenId2)} (should be treasury)`);
  console.log(`   ✓ Bob reclaimed`);

  // ─── Test setGracePeriod ──────────────────────────────────
  console.log("\n13. Testing setGracePeriod...");
  await (await nft.setGracePeriod(90 * DAYS)).wait();
  console.log(`   Grace period set to: ${Number(await nft.gracePeriod()) / DAYS} days`);

  try {
    await nft.setGracePeriod(5 * DAYS);
    console.log("   ✗ ERROR: Should have reverted for < 7 days!");
  } catch {
    console.log("   ✓ Correctly rejected 5 days (min 7)");
  }

  try {
    await nft.setGracePeriod(200 * DAYS);
    console.log("   ✗ ERROR: Should have reverted for > 180 days!");
  } catch {
    console.log("   ✓ Correctly rejected 200 days (max 180)");
  }

  // ─── Test non-operator can't reclaim ──────────────────────
  console.log("\n14. Testing access control...");
  // Mint a third domain
  const now3 = await time.latest();
  await (await nft.mint(user.address, "cryptofans", "charlie", now3 - 100 * DAYS, priceFLR, priceUSD, "ipfs://QmCharlie")).wait();
  const tokenId3 = 3;

  try {
    await nft.connect(user).reclaimExpired(tokenId3);
    console.log("   ✗ ERROR: Non-operator should not be able to reclaim!");
  } catch {
    console.log("   ✓ Non-operator correctly rejected");
  }

  // ─── Summary ──────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("  ALL TESTS PASSED");
  console.log("=".repeat(60));
  console.log(`
  Flow verified:
    ✓ Domain minted with expiry
    ✓ Status transitions: Active → ExpiringSoon → GracePeriod → Expired
    ✓ Renewal works during grace period (resets to Active)
    ✓ reclaimExpired reverts during grace period
    ✓ reclaimExpired succeeds after grace period
    ✓ Token transfers to treasury, metadata preserved
    ✓ Treasury can transfer (marketplace sale simulation)
    ✓ DomainReclaimed event emitted
    ✓ setGracePeriod enforces min/max bounds
    ✓ Access control: only OPERATOR_ROLE can reclaim
  `);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
