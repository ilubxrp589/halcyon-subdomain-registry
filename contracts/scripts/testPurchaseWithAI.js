const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const CryptoJS = require("crypto-js");

/**
 * Test Purchase Script with AI Image Generation
 *
 * For each wallet:
 * 1. Generate AI NFT artwork via /nft/prepare endpoint
 * 2. Purchase subdomain with the prepared metadata URI
 * 3. Wait 30 seconds before next wallet (to avoid GPU overload)
 */

const HSR_API = "http://localhost:8000/api/v1";

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

// Subdomain names and styles for each wallet (NEW 20-style system)
const SUBDOMAIN_CONFIG = [
  { name: "alpha", style: "cyberpunk", prompt: "futuristic digital identity symbol" },
  { name: "bravo", style: "corporate", prompt: "professional military leadership emblem" },
  { name: "charlie", style: "retro", prompt: "classic vintage communication symbol" },
  { name: "delta", style: "cosmic", prompt: "dynamic change and transformation symbol" },
  { name: "echo", style: "abstract", prompt: "sound waves rippling through space" },
  { name: "foxtrot", style: "elegant", prompt: "graceful dance movement symbol" },
  { name: "golf", style: "nature", prompt: "serene green landscape with precision" },
  { name: "hotel", style: "minimalist", prompt: "welcoming hospitality symbol" },
  { name: "india", style: "fantasy", prompt: "mystical ancient cultural symbol" },
  { name: "juliet", style: "elegant", prompt: "romantic timeless love symbol" },
];

// Delay helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const WALLET_STORE = "/home/localai/Desktop/BIFROST CLONE/wallets/store.json";
  const PASSWORD = "REDACTED";
  const DELAY_BETWEEN_WALLETS = 30000; // 30 seconds

  console.log("=".repeat(60));
  console.log("HSR Batch Purchase with AI Image Generation");
  console.log("=".repeat(60));
  console.log(`\nDelay between wallets: ${DELAY_BETWEEN_WALLETS / 1000} seconds`);

  // Decrypt mnemonic
  console.log("\nDecrypting wallet mnemonic...");
  const mnemonic = decryptMnemonic(WALLET_STORE, PASSWORD);
  console.log("✅ Mnemonic decrypted\n");

  const provider = new hre.ethers.JsonRpcProvider("https://coston2-api.flare.network/ext/C/rpc");

  // Load deployment
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const deployment = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "coston2.json"), "utf8"));

  // Use the old escrow that the backend is listening to
  const escrowAddress = deployment.previousDeployment?.SubdomainEscrow || deployment.contracts.SubdomainEscrow;
  const nftAddress = deployment.previousDeployment?.SubdomainNFT || deployment.contracts.SubdomainNFT;

  console.log("Contract Addresses:");
  console.log(`  Escrow: ${escrowAddress}`);
  console.log(`  NFT: ${nftAddress}`);

  const tld = "cryptofans";
  const results = [];

  // Get escrow contract for price check
  const escrowForPrice = await hre.ethers.getContractAt("SubdomainEscrow", escrowAddress);
  const samplePrice = await escrowForPrice.getCurrentPriceFLR("alpha");
  console.log(`\nCurrent FLR price from contract: ${hre.ethers.formatEther(samplePrice)} FLR`);

  // Process each wallet
  for (let i = 0; i < 10; i++) {
    const { name: subdomain, style, prompt: customPrompt } = SUBDOMAIN_CONFIG[i];
    const fqdn = `${subdomain}.${tld}`;

    console.log("\n" + "═".repeat(60));
    console.log(`WALLET ${i}: ${fqdn} (Style: ${style})`);
    console.log("═".repeat(60));

    const wallet = deriveWallet(mnemonic, i, provider);
    console.log(`Address: ${wallet.address}`);

    const balance = await provider.getBalance(wallet.address);
    console.log(`Balance: ${hre.ethers.formatEther(balance)} FLR`);

    if (balance < samplePrice * 2n) {
      console.log("⚠️  Insufficient balance, skipping");
      results.push({ wallet: i, subdomain, success: false, error: "Insufficient balance" });
      continue;
    }

    try {
      // ============================================
      // STEP 1: Generate AI NFT artwork with style + prompt
      // ============================================
      console.log(`\n📸 Generating AI artwork for ${fqdn} (style: ${style})...`);
      const prepareStart = Date.now();

      const prepareResponse = await fetch(`${HSR_API}/nft/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subdomain,
          tld,
          style,
          customPrompt, // REQUIRED in new system
        }),
      });

      const prepareElapsed = ((Date.now() - prepareStart) / 1000).toFixed(1);

      if (!prepareResponse.ok) {
        const error = await prepareResponse.text();
        throw new Error(`NFT prepare failed: ${error}`);
      }

      const prepareData = await prepareResponse.json();
      console.log(`   ✅ AI artwork generated in ${prepareElapsed}s`);
      console.log(`   Image CID: ${prepareData.imageCID || 'N/A'}`);
      console.log(`   Metadata URI: ${prepareData.metadataURI}`);

      // ============================================
      // STEP 2: Purchase subdomain with metadata URI
      // ============================================
      console.log(`\n💰 Purchasing ${fqdn}...`);

      const escrow = await hre.ethers.getContractAt("SubdomainEscrow", escrowAddress, wallet);

      // Get actual price for this subdomain
      const actualPrice = await escrow.getCurrentPriceFLR(subdomain);
      const priceWithBuffer = actualPrice + (actualPrice / 100n); // Add 1% buffer
      console.log(`   Price: ${hre.ethers.formatEther(actualPrice)} FLR`);

      // Use the metadata URI from preparation
      const metadataURI = prepareData.metadataURI || `ipfs://${prepareData.metadataCID}`;

      const purchaseTx = await escrow.purchaseSubdomain(tld, subdomain, metadataURI, { value: priceWithBuffer });
      const purchaseReceipt = await purchaseTx.wait();

      // Get escrow ID from event
      const purchaseEvent = purchaseReceipt.logs.find(log => {
        try {
          const parsed = escrow.interface.parseLog(log);
          return parsed.name === "SubdomainPurchased";
        } catch { return false; }
      });

      if (purchaseEvent) {
        const parsed = escrow.interface.parseLog(purchaseEvent);
        console.log(`   ✅ Purchase successful!`);
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
          metadataURI,
          imageCID: prepareData.imageCID,
          txHash: purchaseTx.hash,
          success: true
        });
      } else {
        console.log(`   ✅ TX sent: ${purchaseTx.hash}`);
        results.push({
          wallet: i,
          address: wallet.address,
          subdomain,
          fqdn,
          metadataURI,
          txHash: purchaseTx.hash,
          success: true
        });
      }

    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      results.push({ wallet: i, subdomain, success: false, error: error.message });
    }

    // Wait before next wallet (except for the last one)
    if (i < 9) {
      console.log(`\n⏳ Waiting ${DELAY_BETWEEN_WALLETS / 1000} seconds before next wallet...`);
      await sleep(DELAY_BETWEEN_WALLETS);
    }
  }

  // Summary
  console.log("\n" + "═".repeat(60));
  console.log("BATCH PURCHASE SUMMARY");
  console.log("═".repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Successful: ${successful.length}`);
  successful.forEach(r => {
    console.log(`   ${r.fqdn} → ${r.address} (Token #${r.tokenId || 'pending'})`);
  });

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}`);
    failed.forEach(r => {
      console.log(`   Wallet ${r.wallet}: ${r.error}`);
    });
  }

  console.log("\n" + "─".repeat(60));
  console.log("Note: Backend DNS Oracle will complete escrows and mint NFTs.");
  console.log("─".repeat(60));

  // Save results
  const resultsFile = path.join(__dirname, "..", "test-purchase-ai-results.json");
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${resultsFile}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
