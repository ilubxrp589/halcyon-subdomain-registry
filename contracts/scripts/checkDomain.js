const hre = require("hardhat");

async function main() {
  const registry = await hre.ethers.getContractAt("HSRRegistry", "0x6fF3B2dC6D0F03053D330714427eC7A6555f93fa");
  const fqdn = process.env.FQDN || "test1737410349687.cryptofans";

  console.log("Checking FQDN:", fqdn);

  try {
    const namehash = await registry.computeNamehash(fqdn);
    console.log("Namehash:", namehash);

    const [owner, resolver, tokenId] = await registry.getRecord(namehash);
    console.log("Owner:", owner);
    console.log("Resolver:", resolver);
    console.log("TokenId:", tokenId.toString());

    if (owner === hre.ethers.ZeroAddress) {
      console.log("\nDomain NOT registered on-chain");
    } else {
      console.log("\nDomain IS registered on-chain");

      // Also check resolver for address
      const resolverContract = await hre.ethers.getContractAt("HSRResolver", "0x7C0eA7094Be2caCB238D042b386B11ec24892Fb1");
      const resolvedAddr = await resolverContract.resolveAddress(fqdn);
      console.log("Resolved address:", resolvedAddr);
    }
  } catch (e) {
    console.log("Error:", e.message);
  }
}

main().catch(console.error);
