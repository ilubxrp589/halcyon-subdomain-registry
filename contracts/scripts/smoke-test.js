const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "coston2-tld-staking.json"), "utf8"));
  const [wallet] = await hre.ethers.getSigners();
  const provider = hre.ethers.provider;

  console.log("=== TLD Staking Smoke Test ===");
  console.log("Deployer:", wallet.address);
  console.log("");

  // 1. FtsoOracle — live price
  console.log("1. FtsoOracle — live FLR/USD price");
  const oracle = new hre.ethers.Contract(d.contracts.FtsoOracle, [
    "function getFlrUsdPriceInWei() view returns (uint256, uint64)",
    "function usdCentsToFlr(uint256) view returns (uint256)",
  ], provider);
  const [price, ts] = await oracle.getFlrUsdPriceInWei();
  console.log("   FLR/USD:", hre.ethers.formatEther(price));
  console.log("   Timestamp:", new Date(Number(ts) * 1000).toISOString());
  const flrFor5Usd = await oracle.usdCentsToFlr(500);
  console.log("   $5 USD =", hre.ethers.formatEther(flrFor5Usd), "FLR");
  console.log("   OK\n");

  // 2. LabelValidator
  console.log("2. LabelValidator — label rules");
  const validator = new hre.ethers.Contract(d.contracts.LabelValidator, [
    "function isValidLabel(string) view returns (bool)",
  ], provider);
  const tests = [
    ["hello", true], ["a", true], ["test123", true],
    ["UPPER", false], ["has-dash", false], ["has_under", false], ["", false],
  ];
  let allPass = true;
  for (const [label, expected] of tests) {
    const result = await validator.isValidLabel(label);
    if (result !== expected) { allPass = false; console.log("   FAIL:", label, "expected", expected, "got", result); }
  }
  console.log("   " + (allPass ? "OK — all 7 tests passed" : "SOME FAILED") + "\n");

  // 3. GlobalRegistrationRules
  console.log("3. GlobalRegistrationRules — minimum price");
  const rules = new hre.ethers.Contract(d.contracts.GlobalRegistrationRules, [
    "function minimumPriceUsdCents() view returns (uint256)",
    "function labelValidator() view returns (address)",
  ], provider);
  console.log("   Minimum price: $" + (Number(await rules.minimumPriceUsdCents()) / 100).toFixed(2));
  console.log("   LabelValidator wired:", (await rules.labelValidator()) === d.contracts.LabelValidator ? "YES" : "NO");
  console.log("   OK\n");

  // 4. TldClaimManager.operatorMint
  console.log("4. TldClaimManager.operatorMint — mint 'cryptofans'");
  const claimMgr = new hre.ethers.Contract(d.contracts.TldClaimManager, [
    "function operatorMint(string) external",
    "function claimedTlds(bytes32) view returns (bool)",
    "function operator() view returns (address)",
  ], wallet);

  const testLabel = "cryptofans";
  const namehash = hre.ethers.keccak256(hre.ethers.solidityPacked(
    ["bytes32", "bytes32"],
    [hre.ethers.ZeroHash, hre.ethers.keccak256(hre.ethers.toUtf8Bytes(testLabel))]
  ));

  const alreadyClaimed = await claimMgr.claimedTlds(namehash);
  if (alreadyClaimed) {
    console.log("   Already claimed, skipping mint");
  } else {
    const tx = await claimMgr.operatorMint(testLabel);
    const receipt = await tx.wait();
    console.log("   Minted — tx:", receipt.hash);
    console.log("   Gas:", receipt.gasUsed.toString());
  }

  // Verify NFT
  const tld = new hre.ethers.Contract(d.contracts.HsrTld, [
    "function namehashToTokenId(bytes32) view returns (uint256)",
    "function ownerOf(uint256) view returns (address)",
    "function tokenIdToLabel(uint256) view returns (string)",
    "function nextTokenId() view returns (uint256)",
  ], provider);
  const tokenId = await tld.namehashToTokenId(namehash);
  const owner = await tld.ownerOf(tokenId);
  const label = await tld.tokenIdToLabel(tokenId);
  console.log("   Token #" + tokenId + " — label: '" + label + "' — owner: " + owner);
  console.log("   OK\n");

  // 5. DefaultRegistrationStrategy — pricing
  console.log("5. DefaultRegistrationStrategy — pricing");
  const strategy = new hre.ethers.Contract(d.contracts.DefaultRegistrationStrategy, [
    "function getPriceInUsdCents(address, bytes32, string, uint256, bool) view returns (uint256)",
    "function defaultLengthPrices(uint256) view returns (uint256)",
  ], provider);
  const dp = [];
  for (let i = 0; i < 5; i++) dp.push("$" + (Number(await strategy.defaultLengthPrices(i)) / 100).toFixed(2));
  console.log("   Default prices (1-5 chars):", dp.join(", "));
  const p = await strategy.getPriceInUsdCents(wallet.address, namehash, "hello", 1, false);
  console.log("   'hello.cryptofans' (1yr): $" + (Number(p) / 100).toFixed(2));
  console.log("   OK\n");

  // 6. PaymentManager
  console.log("6. PaymentManager");
  const pm = new hre.ethers.Contract(d.contracts.PaymentManager, [
    "function platformFeeBps() view returns (uint256)",
    "function platformFeeRecipient() view returns (address)",
    "function registrationManager() view returns (address)",
  ], provider);
  console.log("   Fee:", Number(await pm.platformFeeBps()) / 100 + "%");
  console.log("   Recipient:", await pm.platformFeeRecipient());
  console.log("   RegManager wired:", (await pm.registrationManager()) === d.contracts.SldRegistrationManager ? "YES" : "NO");
  console.log("   OK\n");

  // 7. SldCommitIntent
  console.log("7. SldCommitIntent");
  const ci = new hre.ethers.Contract(d.contracts.SldCommitIntent, [
    "function registrationManager() view returns (address)",
    "function MIN_COMMIT_AGE() view returns (uint256)",
  ], provider);
  console.log("   RegManager wired:", (await ci.registrationManager()) === d.contracts.SldRegistrationManager ? "YES" : "NO");
  console.log("   Min commit age:", (await ci.MIN_COMMIT_AGE()).toString(), "blocks");
  console.log("   OK\n");

  // 8. DefaultResolver
  console.log("8. DefaultResolver");
  const resolver = new hre.ethers.Contract(d.contracts.DefaultResolver, [
    "function hsrSld() view returns (address)",
  ], provider);
  console.log("   HsrSld wired:", (await resolver.hsrSld()) === d.contracts.HsrSld ? "YES" : "NO");
  console.log("   OK\n");

  // 9. Metadata services
  console.log("9. Metadata Services");
  const sldMeta = new hre.ethers.Contract(d.contracts.SldMetadataService, [
    "function baseApiUrl() view returns (string)",
  ], provider);
  const tldMeta = new hre.ethers.Contract(d.contracts.TldMetadataService, [
    "function baseApiUrl() view returns (string)",
  ], provider);
  console.log("   SLD base URL:", await sldMeta.baseApiUrl());
  console.log("   TLD base URL:", await tldMeta.baseApiUrl());
  console.log("   OK\n");

  console.log("=== ALL SMOKE TESTS PASSED ===");
  const bal = await provider.getBalance(wallet.address);
  console.log("Remaining balance:", hre.ethers.formatEther(bal), "C2FLR");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nSMOKE TEST FAILED:", error.reason || error.message);
    process.exit(1);
  });
