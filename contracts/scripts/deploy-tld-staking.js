const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log("=".repeat(60));
  console.log("HSR TLD Staking System — Deployment");
  console.log("=".repeat(60));
  console.log(`Network:  ${network}`);
  console.log(`Deployer: ${deployer.address}`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Balance:  ${hre.ethers.formatEther(balance)} C2FLR`);
  console.log("");

  if (network !== "hardhat" && network !== "localhost") {
    const minBalance = hre.ethers.parseEther("2.0");
    if (balance < minBalance) {
      throw new Error(`Insufficient balance. Need at least 2 C2FLR, have ${hre.ethers.formatEther(balance)}`);
    }
  }

  const addresses = {};
  let totalGas = 0n;

  async function deploy(name, contractName, args = []) {
    process.stdout.write(`  Deploying ${name}...`);
    const Factory = await hre.ethers.getContractFactory(contractName);
    const contract = await Factory.deploy(...args);
    await contract.waitForDeployment();
    const addr = await contract.getAddress();
    const receipt = await contract.deploymentTransaction().wait();
    totalGas += receipt.gasUsed;
    addresses[name] = addr;
    console.log(` ${addr} (gas: ${receipt.gasUsed})`);
    return contract;
  }

  async function deployProxy(name, contractName, initArgs) {
    process.stdout.write(`  Deploying ${name} (impl)...`);
    const ImplFactory = await hre.ethers.getContractFactory(contractName);
    const impl = await ImplFactory.deploy();
    await impl.waitForDeployment();
    const implAddr = await impl.getAddress();
    const implReceipt = await impl.deploymentTransaction().wait();
    totalGas += implReceipt.gasUsed;
    console.log(` ${implAddr} (gas: ${implReceipt.gasUsed})`);

    const initData = ImplFactory.interface.encodeFunctionData("initialize", initArgs);

    process.stdout.write(`  Deploying ${name} (proxy)...`);
    const proxyArtifact = require("@openzeppelin/contracts/build/contracts/ERC1967Proxy.json");
    const ProxyFactory = new hre.ethers.ContractFactory(proxyArtifact.abi, proxyArtifact.bytecode, deployer);
    const proxy = await ProxyFactory.deploy(implAddr, initData);
    await proxy.waitForDeployment();
    const proxyAddr = await proxy.getAddress();
    const proxyReceipt = await proxy.deploymentTransaction().wait();
    totalGas += proxyReceipt.gasUsed;
    console.log(` ${proxyAddr} (gas: ${proxyReceipt.gasUsed})`);

    addresses[name] = proxyAddr;
    addresses[`${name}_impl`] = implAddr;

    // Return a contract instance attached to the proxy address
    return ImplFactory.attach(proxyAddr);
  }

  // ─── Phase 1: Tier 1 — Utilities ───────────────────────────
  console.log("Phase 1: Utilities");
  const labelValidator = await deploy("LabelValidator", "LabelValidator");
  const ftsoOracle = await deploy("FtsoOracle", "FtsoOracle");
  const globalRules = await deploy(
    "GlobalRegistrationRules",
    "GlobalRegistrationRules",
    [addresses.LabelValidator, deployer.address]
  );
  console.log("");

  // ─── Phase 2: Tier 2 — NFTs (UUPS Proxies) ────────────────
  console.log("Phase 2: NFT Contracts (UUPS)");
  const hsrTld = await deployProxy(
    "HsrTld",
    "HsrTld",
    ["HSR TLD", "HSRTLD", deployer.address]
  );
  const hsrSld = await deployProxy(
    "HsrSld",
    "HsrSld",
    ["HSR SLD", "HSRSLD", deployer.address]
  );
  console.log("");

  // ─── Phase 3: Tier 3 — Orchestration ───────────────────────
  console.log("Phase 3: Orchestration");
  const tldClaimManager = await deployProxy(
    "TldClaimManager",
    "TldClaimManager",
    [addresses.HsrTld, addresses.LabelValidator, deployer.address, deployer.address]
  );
  const commitIntent = await deploy(
    "SldCommitIntent",
    "SldCommitIntent",
    [deployer.address]
  );
  const paymentManager = await deploy(
    "PaymentManager",
    "PaymentManager",
    [deployer.address, 500, deployer.address]
  );
  const defaultStrategy = await deploy(
    "DefaultRegistrationStrategy",
    "DefaultRegistrationStrategy",
    [addresses.HsrTld]
  );
  const sldRegManager = await deployProxy(
    "SldRegistrationManager",
    "SldRegistrationManager",
    [
      addresses.HsrTld,
      addresses.HsrSld,
      addresses.FtsoOracle,
      addresses.GlobalRegistrationRules,
      addresses.SldCommitIntent,
      addresses.PaymentManager,
      deployer.address,
    ]
  );
  console.log("");

  // ─── Phase 4: Tier 4 — Services ────────────────────────────
  console.log("Phase 4: Services");
  const sldMetadata = await deploy(
    "SldMetadataService",
    "SldMetadataService",
    ["https://api.halcyon-names.io/metadata/sld/", deployer.address]
  );
  const tldMetadata = await deploy(
    "TldMetadataService",
    "TldMetadataService",
    ["https://api.halcyon-names.io/metadata/tld/", deployer.address]
  );
  const defaultResolver = await deploy(
    "DefaultResolver",
    "DefaultResolver",
    [addresses.HsrSld, deployer.address]
  );
  console.log("");

  // ─── Phase 5: Wire circular dependencies ───────────────────
  console.log("Phase 5: Wiring dependencies");

  async function wire(label, txPromise) {
    process.stdout.write(`  ${label}...`);
    const tx = await txPromise;
    const receipt = await tx.wait();
    totalGas += receipt.gasUsed;
    console.log(` done (gas: ${receipt.gasUsed})`);
  }

  await wire("HsrTld.setClaimManager", hsrTld.setClaimManager(addresses.TldClaimManager));
  await wire("HsrTld.setMetadataService", hsrTld.setMetadataService(addresses.TldMetadataService));
  await wire("HsrSld.setRegistrationManager", hsrSld.setRegistrationManager(addresses.SldRegistrationManager));
  await wire("HsrSld.setArtworkService", hsrSld.setArtworkService(deployer.address));
  await wire("HsrSld.setMetadataService", hsrSld.setMetadataService(addresses.SldMetadataService));
  await wire("SldCommitIntent.setRegistrationManager", commitIntent.setRegistrationManager(addresses.SldRegistrationManager));
  await wire("PaymentManager.setRegistrationManager", paymentManager.setRegistrationManager(addresses.SldRegistrationManager));
  console.log("");

  // ─── Phase 6: Save + Summary ───────────────────────────────
  const deployment = {
    network,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    totalGasUsed: totalGas.toString(),
    contracts: {
      LabelValidator: addresses.LabelValidator,
      FtsoOracle: addresses.FtsoOracle,
      GlobalRegistrationRules: addresses.GlobalRegistrationRules,
      HsrTld: addresses.HsrTld,
      HsrTld_impl: addresses.HsrTld_impl,
      HsrSld: addresses.HsrSld,
      HsrSld_impl: addresses.HsrSld_impl,
      TldClaimManager: addresses.TldClaimManager,
      TldClaimManager_impl: addresses.TldClaimManager_impl,
      SldCommitIntent: addresses.SldCommitIntent,
      PaymentManager: addresses.PaymentManager,
      DefaultRegistrationStrategy: addresses.DefaultRegistrationStrategy,
      SldRegistrationManager: addresses.SldRegistrationManager,
      SldRegistrationManager_impl: addresses.SldRegistrationManager_impl,
      SldMetadataService: addresses.SldMetadataService,
      TldMetadataService: addresses.TldMetadataService,
      DefaultResolver: addresses.DefaultResolver,
    },
    configuration: {
      platformFeeRecipient: deployer.address,
      platformFeeBps: 500,
      operator: deployer.address,
      artworkService: deployer.address,
      sldMetadataBaseUrl: "https://api.halcyon-names.io/metadata/sld/",
      tldMetadataBaseUrl: "https://api.halcyon-names.io/metadata/tld/",
    },
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  const deploymentFile = path.join(deploymentsDir, `${network}-tld-staking.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));

  console.log("=".repeat(60));
  console.log("Deployment Complete!");
  console.log("=".repeat(60));
  console.log("");
  console.log("Contract Addresses:");
  console.log("─".repeat(60));
  console.log(`  LabelValidator:             ${addresses.LabelValidator}`);
  console.log(`  FtsoOracle:                 ${addresses.FtsoOracle}`);
  console.log(`  GlobalRegistrationRules:    ${addresses.GlobalRegistrationRules}`);
  console.log(`  HsrTld (proxy):             ${addresses.HsrTld}`);
  console.log(`  HsrTld (impl):              ${addresses.HsrTld_impl}`);
  console.log(`  HsrSld (proxy):             ${addresses.HsrSld}`);
  console.log(`  HsrSld (impl):              ${addresses.HsrSld_impl}`);
  console.log(`  TldClaimManager (proxy):    ${addresses.TldClaimManager}`);
  console.log(`  TldClaimManager (impl):     ${addresses.TldClaimManager_impl}`);
  console.log(`  SldCommitIntent:            ${addresses.SldCommitIntent}`);
  console.log(`  PaymentManager:             ${addresses.PaymentManager}`);
  console.log(`  DefaultRegistrationStrategy:${addresses.DefaultRegistrationStrategy}`);
  console.log(`  SldRegistrationManager (p): ${addresses.SldRegistrationManager}`);
  console.log(`  SldRegistrationManager (i): ${addresses.SldRegistrationManager_impl}`);
  console.log(`  SldMetadataService:         ${addresses.SldMetadataService}`);
  console.log(`  TldMetadataService:         ${addresses.TldMetadataService}`);
  console.log(`  DefaultResolver:            ${addresses.DefaultResolver}`);
  console.log("─".repeat(60));
  console.log(`  Total gas used: ${totalGas}`);
  console.log(`  Saved to: ${deploymentFile}`);

  const finalBalance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`  Remaining balance: ${hre.ethers.formatEther(finalBalance)} C2FLR`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nDeployment failed:", error.message || error);
    process.exit(1);
  });
