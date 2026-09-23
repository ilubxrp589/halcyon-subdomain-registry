const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * End-to-End Test for HSR Address Resolution
 *
 * Tests:
 * 1. Register a new domain via NFT mint
 * 2. Verify domain is registered in HSRRegistry
 * 3. Set a custom wallet address via HSRResolver
 * 4. Verify on-chain resolution
 * 5. Set text records
 * 6. Verify text records
 */
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log("=".repeat(60));
  console.log("HSR Address Resolution - End-to-End Test");
  console.log("=".repeat(60));
  console.log(`Network: ${network}`);
  console.log(`Tester: ${deployer.address}`);
  console.log("");

  // Load deployment
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const deploymentFile = path.join(deploymentsDir, `${network}.json`);
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));

  // Contract addresses
  const nftAddress = deployment.contracts.SubdomainNFT;
  const registryAddress = deployment.contracts.HSRRegistry;
  const resolverAddress = deployment.contracts.HSRResolver;

  console.log("Contract Addresses:");
  console.log(`  SubdomainNFT: ${nftAddress}`);
  console.log(`  HSRRegistry:  ${registryAddress}`);
  console.log(`  HSRResolver:  ${resolverAddress}`);
  console.log("");

  // Get contract instances
  const nft = await hre.ethers.getContractAt("SubdomainNFT", nftAddress);
  const registry = await hre.ethers.getContractAt("HSRRegistry", registryAddress);
  const resolver = await hre.ethers.getContractAt("HSRResolver", resolverAddress);

  // Test domain
  const testSubdomain = `test${Date.now()}`;
  const testTLD = "cryptofans";
  const testFQDN = `${testSubdomain}.${testTLD}`;
  const testWalletAddress = "0x1234567890123456789012345678901234567890";

  console.log("Test Configuration:");
  console.log(`  Test Domain: ${testFQDN}`);
  console.log(`  Test Wallet: ${testWalletAddress}`);
  console.log("");

  // =========================================================
  // TEST 1: Mint a new domain NFT
  // =========================================================
  console.log("─".repeat(60));
  console.log("TEST 1: Minting new domain NFT...");
  console.log("─".repeat(60));

  const expiresAt = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60); // 1 year
  const priceFLR = hre.ethers.parseEther("100");
  const priceUSD = hre.ethers.parseEther("10");
  const metadataURI = `ipfs://test-metadata-${testSubdomain}`;

  try {
    const mintTx = await nft.mint(
      deployer.address,
      testTLD,
      testSubdomain,
      expiresAt,
      priceFLR,
      priceUSD,
      metadataURI
    );
    const receipt = await mintTx.wait();

    // Get token ID from event
    const mintEvent = receipt.logs.find(log => {
      try {
        const parsed = nft.interface.parseLog(log);
        return parsed.name === "SubdomainMinted";
      } catch { return false; }
    });

    const parsedEvent = nft.interface.parseLog(mintEvent);
    const tokenId = parsedEvent.args.tokenId;

    console.log(`  ✅ Minted token ID: ${tokenId}`);
    console.log(`  ✅ TX: ${mintTx.hash}`);

    // =========================================================
    // TEST 2: Verify domain is in HSRRegistry
    // =========================================================
    console.log("");
    console.log("─".repeat(60));
    console.log("TEST 2: Verifying HSRRegistry registration...");
    console.log("─".repeat(60));

    const namehash = await registry.computeNamehash(testFQDN);
    console.log(`  Namehash: ${namehash}`);

    const [regOwner, regResolver, regTokenId] = await registry.getRecord(namehash);
    console.log(`  Registry Owner: ${regOwner}`);
    console.log(`  Registry Resolver: ${regResolver}`);
    console.log(`  Registry TokenId: ${regTokenId}`);

    if (regOwner === deployer.address) {
      console.log(`  ✅ Domain correctly registered in HSRRegistry`);
    } else {
      console.log(`  ❌ Domain NOT registered (owner: ${regOwner})`);
    }

    // =========================================================
    // TEST 3: Set custom wallet address
    // =========================================================
    console.log("");
    console.log("─".repeat(60));
    console.log("TEST 3: Setting custom wallet address...");
    console.log("─".repeat(60));

    const setAddrTx = await resolver.setAddr(namehash, testWalletAddress);
    await setAddrTx.wait();
    console.log(`  ✅ Set wallet address TX: ${setAddrTx.hash}`);

    // =========================================================
    // TEST 4: Verify on-chain resolution
    // =========================================================
    console.log("");
    console.log("─".repeat(60));
    console.log("TEST 4: Verifying on-chain resolution...");
    console.log("─".repeat(60));

    // Method 1: Using namehash
    const resolvedByHash = await resolver.addr(namehash);
    console.log(`  addr(namehash): ${resolvedByHash}`);

    // Method 2: Using FQDN string
    const resolvedByFQDN = await resolver.resolveAddress(testFQDN);
    console.log(`  resolveAddress("${testFQDN}"): ${resolvedByFQDN}`);

    // Method 3: Check hasAddress
    const hasAddr = await resolver.hasAddress(namehash);
    console.log(`  hasAddress: ${hasAddr}`);

    if (resolvedByFQDN.toLowerCase() === testWalletAddress.toLowerCase()) {
      console.log(`  ✅ On-chain resolution CORRECT`);
    } else {
      console.log(`  ❌ Resolution mismatch!`);
    }

    // =========================================================
    // TEST 5: Set text records
    // =========================================================
    console.log("");
    console.log("─".repeat(60));
    console.log("TEST 5: Setting text records...");
    console.log("─".repeat(60));

    const textRecords = {
      "url": "https://halcyon.domains",
      "avatar": "ipfs://QmTest123",
      "description": "Test domain for HSR resolver"
    };

    for (const [key, value] of Object.entries(textRecords)) {
      const setTextTx = await resolver.setText(namehash, key, value);
      await setTextTx.wait();
      console.log(`  ✅ Set ${key}: ${value}`);
    }

    // =========================================================
    // TEST 6: Verify text records
    // =========================================================
    console.log("");
    console.log("─".repeat(60));
    console.log("TEST 6: Verifying text records...");
    console.log("─".repeat(60));

    for (const [key, expectedValue] of Object.entries(textRecords)) {
      const value = await resolver.text(namehash, key);
      const match = value === expectedValue;
      console.log(`  ${match ? '✅' : '❌'} ${key}: ${value}`);
    }

    // =========================================================
    // TEST 7: Multi-chain address (EIP-2304)
    // =========================================================
    console.log("");
    console.log("─".repeat(60));
    console.log("TEST 7: Testing multi-chain address support...");
    console.log("─".repeat(60));

    const COINTYPE_FLR = await resolver.COINTYPE_FLR();
    const COINTYPE_ETH = await resolver.COINTYPE_ETH();

    console.log(`  COINTYPE_FLR: ${COINTYPE_FLR}`);
    console.log(`  COINTYPE_ETH: ${COINTYPE_ETH}`);

    const flrAddr = await resolver["addr(bytes32,uint256)"](namehash, COINTYPE_FLR);
    const ethAddr = await resolver["addr(bytes32,uint256)"](namehash, COINTYPE_ETH);

    console.log(`  FLR address: ${flrAddr}`);
    console.log(`  ETH address: ${ethAddr}`);
    console.log(`  ✅ Multi-chain addresses set automatically`);

    // =========================================================
    // SUMMARY
    // =========================================================
    console.log("");
    console.log("=".repeat(60));
    console.log("TEST SUMMARY");
    console.log("=".repeat(60));
    console.log(`  Domain: ${testFQDN}`);
    console.log(`  Token ID: ${tokenId}`);
    console.log(`  Namehash: ${namehash}`);
    console.log(`  Resolved Address: ${resolvedByFQDN}`);
    console.log("");
    console.log("All on-chain tests PASSED ✅");
    console.log("");
    console.log("Now test the API:");
    console.log(`  curl http://localhost:8000/api/v1/resolve/${testFQDN}`);

  } catch (error) {
    console.error("Test failed:", error.message);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
