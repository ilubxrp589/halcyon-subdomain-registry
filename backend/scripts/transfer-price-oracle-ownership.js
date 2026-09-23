/**
 * Transfer PriceOracle ownership to backend wallet
 *
 * Run with: OWNER_PRIVATE_KEY=0x... node scripts/transfer-price-oracle-ownership.js
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const PRICE_ORACLE_ADDRESS = process.env.CONTRACT_PRICE_ORACLE;
const NEW_OWNER = '0x89201a4C30ddB1D9AC1c3592B51634a1623c88a7'; // Backend wallet
const RPC_URL = process.env.FLARE_RPC_URL;

const OWNABLE_ABI = [
  'function owner() view returns (address)',
  'function transferOwnership(address newOwner)',
];

async function main() {
  // Check for owner private key
  const ownerKey = process.env.OWNER_PRIVATE_KEY;
  if (!ownerKey) {
    console.log('\n❌ OWNER_PRIVATE_KEY not set\n');
    console.log('Run with:');
    console.log('  OWNER_PRIVATE_KEY=0x... node scripts/transfer-price-oracle-ownership.js\n');
    console.log('The owner private key should be for wallet: 0xCafB8B7BccfF0379a8df7EF4F613914D4cebd34B');
    process.exit(1);
  }

  console.log('\n🔄 Transferring PriceOracle Ownership\n');
  console.log(`Contract: ${PRICE_ORACLE_ADDRESS}`);
  console.log(`New Owner: ${NEW_OWNER}`);

  // Connect
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(ownerKey, provider);
  const contract = new ethers.Contract(PRICE_ORACLE_ADDRESS, OWNABLE_ABI, wallet);

  // Verify current owner
  const currentOwner = await contract.owner();
  console.log(`Current Owner: ${currentOwner}`);

  if (currentOwner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.log(`\n❌ Your wallet (${wallet.address}) is not the current owner`);
    process.exit(1);
  }

  if (currentOwner.toLowerCase() === NEW_OWNER.toLowerCase()) {
    console.log('\n✓ Backend wallet is already the owner!');
    process.exit(0);
  }

  // Transfer ownership
  console.log('\nSending transaction...');
  const tx = await contract.transferOwnership(NEW_OWNER);
  console.log(`TX Hash: ${tx.hash}`);

  console.log('Waiting for confirmation...');
  const receipt = await tx.wait();
  console.log(`Confirmed in block ${receipt.blockNumber}`);

  // Verify
  const newOwner = await contract.owner();
  console.log(`\n✓ Ownership transferred!`);
  console.log(`New Owner: ${newOwner}`);
  console.log('\nRestart the backend to enable price sync.');
}

main().catch(console.error);
