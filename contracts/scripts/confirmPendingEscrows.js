const hre = require("hardhat");

/**
 * Confirm all pending DNS registrations
 * This calls confirmDNSRegistration for each pending escrow
 */
async function main() {
  const [signer] = await hre.ethers.getSigners();

  console.log("=".repeat(60));
  console.log("Confirm Pending Escrows");
  console.log("=".repeat(60));
  console.log(`Signer: ${signer.address}`);

  // Contract addresses from .env (backend is using these)
  const DNS_ORACLE_ADDRESS = "0x218EB07c6ef92250DcfE0689a5309B10b96bA3Ff";
  const ESCROW_ADDRESS = "0x3a62659F0C46E02edD42F1834801705f309144DA";

  // Get contracts
  const DNSOracle = await hre.ethers.getContractFactory("DNSOracle");
  const dnsOracle = DNSOracle.attach(DNS_ORACLE_ADDRESS);

  const SubdomainEscrow = await hre.ethers.getContractFactory("SubdomainEscrow");
  const escrow = SubdomainEscrow.attach(ESCROW_ADDRESS);

  // Pending escrow IDs (from database query)
  const pendingEscrowIds = [15, 16, 17, 18, 19, 20, 21, 22, 23, 24];

  console.log(`\nProcessing ${pendingEscrowIds.length} pending escrows...\n`);

  // Get current block for HNS proof
  const block = await hre.ethers.provider.getBlock("latest");
  const hnsBlockHash = block.hash;
  const hnsBlockHeight = block.number;

  for (const escrowId of pendingEscrowIds) {
    try {
      // Get escrow data
      const escrowData = await escrow.getEscrow(escrowId);
      const fqdn = `${escrowData.subdomain}.${escrowData.tld}`;

      console.log(`Processing escrow ${escrowId}: ${fqdn}`);
      console.log(`  Status: ${["Pending", "Completed", "Refunded", "Expired"][escrowData.status]}`);

      if (escrowData.status !== 0n) {
        console.log(`  ⏭ Skipping - already processed\n`);
        continue;
      }

      // Get request ID from DNS Oracle
      const requestId = await dnsOracle.escrowToRequest(escrowId);
      console.log(`  Request ID: ${requestId}`);

      if (requestId === 0n) {
        console.log(`  ⚠ No DNS request found - skipping\n`);
        continue;
      }

      // Confirm the DNS registration
      console.log(`  Confirming DNS registration...`);
      const tx = await dnsOracle.confirmDNSRegistration(
        requestId,
        hnsBlockHash,
        hnsBlockHeight,
        { gasLimit: 500000 }
      );
      console.log(`  TX: ${tx.hash}`);

      const receipt = await tx.wait(2);
      console.log(`  ✓ Confirmed in block ${receipt.blockNumber}\n`);

      // Small delay between transactions
      await new Promise((r) => setTimeout(r, 1000));
    } catch (error) {
      console.log(`  ✗ Error: ${error.message}\n`);
    }
  }

  console.log("=".repeat(60));
  console.log("Done!");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
