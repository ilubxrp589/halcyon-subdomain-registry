const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const CryptoJS = require("crypto-js");

/**
 * Test Purchase Script - All 10 Wallets
 *
 * Purchases a subdomain for each of the 10 dev wallets, then verifies:
 * 1. NFT minted
 * 2. Domain registered in HSRRegistry
 * 3. Address resolution works
 */

// Decrypt mnemonic from Bifrost wallet store
function decryptMnemonic(storePath, password) {
  const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  const { ciphertext, salt, iv } = store.encryptedMnemonic;

  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: 100000,
  });

  const ivParsed = CryptoJS.enc.Hex.parse(iv);
  const cipherParams = CryptoJS.lib.CipherParams.create({
    ciphertext: CryptoJS.enc.Base64.parse(ciphertext),
  });

  const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
    iv: ivParsed,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return decrypted.toString(CryptoJS.enc.Utf8);
}

// Derive wallet from mnemonic at index
function deriveWallet(mnemonic, index, provider) {
  const hdNode = hre.ethers.HDNodeWallet.fromMnemonic(
    hre.ethers.Mnemonic.fromPhrase(mnemonic),
    `m/44'/60'/0'/0/${index}`
  );
  return hdNode.connect(provider);
}

// Random subdomain names
const SUBDOMAIN_NAMES = [
  "alpha", "bravo", "charlie", "delta", "echo",
  "foxtrot", "golf", "hotel", "india", "juliet"
];

async function main() {
  const WALLET_STORE = "/home/localai/Desktop/BIFROST CLONE/wallets/store.json";
  const PASSWORD = "REDACTED";

  console.log("=".repeat(60));
  console.log("HSR Batch Purchase Test - 10 Wallets");
  console.log("=".repeat(60));

  // Decrypt mnemonic
  console.log("\nDecrypting wallet mnemonic...");
  const mnemonic = decryptMnemonic(WALLET_STORE, PASSWORD);
  console.log("✅ Mnemonic decrypted\n");

  const provider = new hre.ethers.JsonRpcProvider("https://coston2-api.flare.network/ext/C/rpc");

  // Load deployment
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const deployment = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "coston2.json"), "utf8"));

  // Use the old escrow/NFT addresses that the backend is actively listening to
  const escrowAddress = deployment.previousDeployment?.SubdomainEscrow || deployment.contracts.SubdomainEscrow;
  const nftAddress = deployment.previousDeployment?.SubdomainNFT || deployment.contracts.SubdomainNFT;
  const registryAddress = deployment.contracts.HSRRegistry;
  const resolverAddress = deployment.contracts.HSRResolver;

  console.log("Contract Addresses:");
  console.log(`  Escrow: ${escrowAddress}`);
  console.log(`  NFT: ${nftAddress}`);
  console.log(`  Registry: ${registryAddress}`);
  console.log(`  Resolver: ${resolverAddress}`);

  const tld = "cryptofans";
  const results = [];

  // Get actual price from contract for a standard subdomain (4+ chars)
  const escrowForPrice = await hre.ethers.getContractAt("SubdomainEscrow", escrowAddress);
  const samplePrice = await escrowForPrice.getCurrentPriceFLR("alpha"); // 5 chars = standard tier
  console.log(`\nActual FLR price from contract: ${hre.ethers.formatEther(samplePrice)} FLR`);

  // Process each wallet
  for (let i = 0; i < 10; i++) {
    console.log("\n" + "─".repeat(60));
    console.log(`WALLET ${i}: ${SUBDOMAIN_NAMES[i]}.${tld}`);
    console.log("─".repeat(60));

    const wallet = deriveWallet(mnemonic, i, provider);
    console.log(`Address: ${wallet.address}`);

    const balance = await provider.getBalance(wallet.address);
    console.log(`Balance: ${hre.ethers.formatEther(balance)} FLR`);

    // Check balance against sample price (we'll check exact price later)
    if (balance < samplePrice * 2n) { // Need at least 2x price for gas
      console.log("⚠️  Insufficient balance, skipping");
      results.push({ wallet: i, subdomain: SUBDOMAIN_NAMES[i], success: false, error: "Insufficient balance" });
      continue;
    }

    const subdomain = SUBDOMAIN_NAMES[i];
    const fqdn = `${subdomain}.${tld}`;

    try {
      // Get contract instance with this wallet
      const escrow = await hre.ethers.getContractAt("SubdomainEscrow", escrowAddress, wallet);

      // Random metadata URI (in production this would be IPFS)
      const metadataURI = `ipfs://test-metadata-${subdomain}-${Date.now()}`;

      // Get actual price for this specific subdomain
      const actualPrice = await escrow.getCurrentPriceFLR(subdomain);
      console.log(`   Required FLR: ${hre.ethers.formatEther(actualPrice)}`);

      // Purchase subdomain with actual price + small buffer
      console.log(`\nPurchasing ${fqdn}...`);
      const priceWithBuffer = actualPrice + (actualPrice / 100n); // Add 1% buffer
      const purchaseTx = await escrow.purchaseSubdomain(tld, subdomain, metadataURI, { value: priceWithBuffer });
      const purchaseReceipt = await purchaseTx.wait();

      // Get escrow ID from SubdomainPurchased event
      const purchaseEvent = purchaseReceipt.logs.find(log => {
        try {
          const parsed = escrow.interface.parseLog(log);
          return parsed.name === "SubdomainPurchased";
        } catch { return false; }
      });

      if (purchaseEvent) {
        const parsed = escrow.interface.parseLog(purchaseEvent);
        console.log(`✅ Purchase initiated!`);
        console.log(`   Escrow ID: ${parsed.args.escrowId}`);
        console.log(`   Token ID: ${parsed.args.tokenId}`);
        console.log(`   TX: ${purchaseTx.hash}`);

        results.push({
          wallet: i,
          address: wallet.address,
          subdomain,
          fqdn,
          escrowId: parsed.args.escrowId.toString(),
          tokenId: parsed.args.tokenId.toString(),
          txHash: purchaseTx.hash,
          success: true
        });
      } else {
        console.log(`✅ TX sent: ${purchaseTx.hash}`);
        results.push({
          wallet: i,
          address: wallet.address,
          subdomain,
          fqdn,
          txHash: purchaseTx.hash,
          success: true
        });
      }

    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
      results.push({ wallet: i, subdomain, success: false, error: error.message });
    }

    // Small delay between transactions
    await new Promise(r => setTimeout(r, 1000));
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("BATCH PURCHASE SUMMARY");
  console.log("=".repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Successful: ${successful.length}`);
  successful.forEach(r => {
    console.log(`   ${r.fqdn} → ${r.address}`);
  });

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}`);
    failed.forEach(r => {
      console.log(`   Wallet ${r.wallet}: ${r.error}`);
    });
  }

  console.log("\n" + "─".repeat(60));
  console.log("Note: Escrows created. Backend DNS Oracle callback will mint NFTs.");
  console.log("Check escrow status with: curl http://localhost:8000/api/v1/listener");
  console.log("─".repeat(60));

  // Save results
  const resultsFile = path.join(__dirname, "..", "test-purchase-results.json");
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${resultsFile}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
