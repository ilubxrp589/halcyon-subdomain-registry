const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const CryptoJS = require("crypto-js");

/**
 * Animal-themed Batch Purchase on .aiworktools TLD
 */

const HSR_API = "http://localhost:8000/api/v1";

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

function deriveWallet(mnemonic, index, provider) {
  const hdNode = hre.ethers.HDNodeWallet.fromMnemonic(
    hre.ethers.Mnemonic.fromPhrase(mnemonic),
    `m/44'/60'/0'/0/${index}`
  );
  return hdNode.connect(provider);
}

// Animal names with NEW style system + custom prompts (REQUIRED)
const ANIMAL_CONFIG = [
  { name: "lion", style: "corporate", prompt: "majestic lion king of the savanna" },
  { name: "wolf", style: "cosmic", prompt: "lone wolf howling at the moon" },
  { name: "eagle", style: "nature", prompt: "soaring eagle above mountain peaks" },
  { name: "tiger", style: "abstract", prompt: "fierce tiger with intense gaze" },
  { name: "bear", style: "industrial", prompt: "powerful bear in the wild" },
  { name: "phoenix", style: "fantasy", prompt: "mythical phoenix rising from flames" },
  { name: "dragon", style: "cyberpunk", prompt: "legendary dragon breathing fire" },
  { name: "owl", style: "minimalist", prompt: "wise owl perched on ancient branch" },
  { name: "panther", style: "elegant", prompt: "sleek black panther in shadows" },
  { name: "fox", style: "retro", prompt: "clever red fox in autumn forest" },
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const WALLET_STORE = "/home/localai/Desktop/BIFROST CLONE/wallets/store.json";
  const PASSWORD = "REDACTED";
  const DELAY_BETWEEN_WALLETS = 30000;

  console.log("=".repeat(60));
  console.log("HSR Animal Batch Purchase on .aiworktools");
  console.log("=".repeat(60));
  console.log(`\nDelay between wallets: ${DELAY_BETWEEN_WALLETS / 1000} seconds`);

  console.log("\nDecrypting wallet mnemonic...");
  const mnemonic = decryptMnemonic(WALLET_STORE, PASSWORD);
  console.log("✅ Mnemonic decrypted\n");

  const provider = new hre.ethers.JsonRpcProvider("https://coston2-api.flare.network/ext/C/rpc");

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const deployment = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "coston2.json"), "utf8"));

  const escrowAddress = deployment.previousDeployment?.SubdomainEscrow || deployment.contracts.SubdomainEscrow;
  const nftAddress = deployment.previousDeployment?.SubdomainNFT || deployment.contracts.SubdomainNFT;

  console.log("Contract Addresses:");
  console.log(`  Escrow: ${escrowAddress}`);
  console.log(`  NFT: ${nftAddress}`);

  const tld = "aiworktools";
  const results = [];

  const escrowForPrice = await hre.ethers.getContractAt("SubdomainEscrow", escrowAddress);
  const samplePrice = await escrowForPrice.getCurrentPriceFLR("lion");
  console.log(`\nCurrent FLR price from contract: ${hre.ethers.formatEther(samplePrice)} FLR`);

  for (let i = 0; i < 10; i++) {
    const { name: subdomain, style, prompt: customPrompt } = ANIMAL_CONFIG[i];
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
      console.log(`\n📸 Generating AI artwork for ${fqdn} (style: ${style})...`);
      const prepareStart = Date.now();

      const prepareResponse = await fetch(`${HSR_API}/nft/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain, tld, style, customPrompt }),
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

      console.log(`\n💰 Purchasing ${fqdn}...`);

      const escrow = await hre.ethers.getContractAt("SubdomainEscrow", escrowAddress, wallet);
      const actualPrice = await escrow.getCurrentPriceFLR(subdomain);
      const priceWithBuffer = actualPrice + (actualPrice / 100n);
      console.log(`   Price: ${hre.ethers.formatEther(actualPrice)} FLR`);

      const metadataURI = prepareData.metadataURI || `ipfs://${prepareData.metadataCID}`;

      const purchaseTx = await escrow.purchaseSubdomain(tld, subdomain, metadataURI, { value: priceWithBuffer });
      const purchaseReceipt = await purchaseTx.wait();

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
          style,
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
          style,
          metadataURI,
          txHash: purchaseTx.hash,
          success: true
        });
      }

    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      results.push({ wallet: i, subdomain, success: false, error: error.message });
    }

    if (i < 9) {
      console.log(`\n⏳ Waiting ${DELAY_BETWEEN_WALLETS / 1000} seconds before next wallet...`);
      await sleep(DELAY_BETWEEN_WALLETS);
    }
  }

  console.log("\n" + "═".repeat(60));
  console.log("ANIMAL BATCH PURCHASE SUMMARY - aiworktools");
  console.log("═".repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Successful: ${successful.length}`);
  successful.forEach(r => {
    console.log(`   ${r.fqdn} (${r.style}) → ${r.address} (Token #${r.tokenId || 'pending'})`);
  });

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}`);
    failed.forEach(r => {
      console.log(`   Wallet ${r.wallet}: ${r.error}`);
    });
  }

  const resultsFile = path.join(__dirname, "..", "test-purchase-animals-aiworktools-results.json");
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${resultsFile}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
