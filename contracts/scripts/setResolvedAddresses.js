const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const CryptoJS = require("crypto-js");

/**
 * Set Resolved Addresses Script
 *
 * Sets the wallet resolved address for each of the 10 purchased domains.
 * Each domain's resolved address will be set to the owner's wallet address,
 * so sending FLR to "alpha.cryptofans" sends it to wallet 0, etc.
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

// Namehash computation for ENS-style domains
function namehash(name) {
  if (!name || name === '') {
    return '0x' + '00'.repeat(32);
  }

  const labels = name.split('.').reverse();
  let node = '0x' + '00'.repeat(32);

  for (const label of labels) {
    const labelHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(label));
    node = hre.ethers.keccak256(hre.ethers.concat([node, labelHash]));
  }

  return node;
}

const SUBDOMAIN_DATA = [
  { index: 0, subdomain: "alpha", tld: "cryptofans" },
  { index: 1, subdomain: "bravo", tld: "cryptofans" },
  { index: 2, subdomain: "charlie", tld: "cryptofans" },
  { index: 3, subdomain: "delta", tld: "cryptofans" },
  { index: 4, subdomain: "echo", tld: "cryptofans" },
  { index: 5, subdomain: "foxtrot", tld: "cryptofans" },
  { index: 6, subdomain: "golf", tld: "cryptofans" },
  { index: 7, subdomain: "hotel", tld: "cryptofans" },
  { index: 8, subdomain: "india", tld: "cryptofans" },
  { index: 9, subdomain: "juliet", tld: "cryptofans" },
];

async function main() {
  const WALLET_STORE = "/home/localai/Desktop/BIFROST CLONE/wallets/store.json";
  const PASSWORD = "REDACTED";

  console.log("=".repeat(60));
  console.log("HSR - Set Resolved Addresses for All Domains");
  console.log("=".repeat(60));

  // Decrypt mnemonic
  console.log("\nDecrypting wallet mnemonic...");
  const mnemonic = decryptMnemonic(WALLET_STORE, PASSWORD);
  console.log("✅ Mnemonic decrypted\n");

  const provider = new hre.ethers.JsonRpcProvider("https://coston2-api.flare.network/ext/C/rpc");

  // Load deployment
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const deployment = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "coston2.json"), "utf8"));

  const resolverAddress = deployment.contracts.HSRResolver;
  console.log(`HSRResolver: ${resolverAddress}\n`);

  const results = [];

  // Process each domain
  for (const data of SUBDOMAIN_DATA) {
    console.log("─".repeat(60));
    const fqdn = `${data.subdomain}.${data.tld}`;
    console.log(`Setting resolved address for: ${fqdn}`);

    const wallet = deriveWallet(mnemonic, data.index, provider);
    console.log(`  Owner: ${wallet.address}`);

    // Compute namehash
    const node = namehash(fqdn);
    console.log(`  Namehash: ${node.slice(0, 22)}...`);

    try {
      // Get resolver contract with this wallet as signer
      const resolver = await hre.ethers.getContractAt("HSRResolver", resolverAddress, wallet);

      // Check if already set
      const currentAddr = await resolver.addr(node);
      if (currentAddr !== "0x0000000000000000000000000000000000000000") {
        console.log(`  ⚠️  Already set to: ${currentAddr}`);
        if (currentAddr.toLowerCase() === wallet.address.toLowerCase()) {
          console.log("  ✅ Already correctly configured");
          results.push({ fqdn, address: wallet.address, status: "already_set" });
          continue;
        }
      }

      // Set the resolved address to the owner's wallet
      console.log(`  Setting resolved address...`);
      const tx = await resolver.setAddr(node, wallet.address);
      console.log(`  TX: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);

      // Verify
      const newAddr = await resolver.addr(node);
      console.log(`  Verified: ${newAddr}`);

      results.push({ fqdn, address: wallet.address, txHash: tx.hash, status: "success" });

    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      results.push({ fqdn, address: wallet.address, status: "failed", error: error.message });
    }

    // Small delay
    await new Promise(r => setTimeout(r, 500));
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));

  const successful = results.filter(r => r.status === "success" || r.status === "already_set");
  const failed = results.filter(r => r.status === "failed");

  console.log(`\n✅ Configured: ${successful.length}`);
  successful.forEach(r => {
    console.log(`   ${r.fqdn} → ${r.address}`);
  });

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}`);
    failed.forEach(r => {
      console.log(`   ${r.fqdn}: ${r.error}`);
    });
  }

  console.log("\n" + "─".repeat(60));
  console.log("Test resolution with:");
  console.log("  curl http://localhost:8000/api/v1/resolve/alpha.cryptofans");
  console.log("─".repeat(60));

  // Save results
  const resultsFile = path.join(__dirname, "..", "resolved-addresses-results.json");
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${resultsFile}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
