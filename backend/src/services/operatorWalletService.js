import { ethers } from 'ethers';
import config from '../config/index.js';

// WFLR contract addresses by chain
const WFLR_ADDRESSES = {
  114: '0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273', // Coston2
  14: '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d',  // Flare Mainnet
};

const WFLR_ABI = [
  'function deposit() payable',
  'function withdraw(uint256 amount)',
  'function balanceOf(address) view returns (uint256)',
  'function delegate(address to, uint256 bips)',
  'function undelegateAll()',
  'function delegatesOf(address) view returns (address[], uint256[])',
  'function votePowerOf(address) view returns (uint256)',
];

const REGISTRY_ADDRESS = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';
const REGISTRY_ABI = [
  'function getContractAddressByName(string name) view returns (address)',
];

const REWARD_MANAGER_ABI = [
  'function getStateOfRewards(address beneficiary, uint256 rewardEpoch) view returns (address[] dataProviders, uint256[] rewardAmounts, bool[] claimed, bool claimable)',
  'function getCurrentRewardEpoch() view returns (uint256)',
  'function claimReward(address payable recipient, uint256[] rewardEpochs) returns (uint256)',
];

const DERIVATION_PATH = "m/44'/60'/0'/0";

function getProvider() {
  return new ethers.JsonRpcProvider(config.flare.rpcUrl);
}

function getChainId() {
  return config.flare.chainId || 114;
}

function getWFLRAddress() {
  return WFLR_ADDRESSES[getChainId()] || WFLR_ADDRESSES[114];
}

/**
 * Derive HD wallets from a mnemonic phrase.
 * Returns wallet info (address, index) without exposing private keys.
 */
function deriveWallets(mnemonic, count = 5) {
  const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, DERIVATION_PATH);
  const wallets = [];
  for (let i = 0; i < count; i++) {
    const wallet = hdNode.deriveChild(i);
    wallets.push({
      index: i,
      address: wallet.address,
    });
  }
  return wallets;
}

/**
 * Get a connected Wallet (signer) for a specific derivation index.
 */
function getWalletAtIndex(mnemonic, index) {
  const provider = getProvider();
  const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, DERIVATION_PATH);
  const derived = hdNode.deriveChild(index);
  return new ethers.Wallet(derived.privateKey, provider);
}

/**
 * Get balances (FLR + WFLR) for a list of addresses.
 */
async function getBalances(addresses) {
  const provider = getProvider();
  const wflrAddress = getWFLRAddress();
  const wflr = new ethers.Contract(wflrAddress, WFLR_ABI, provider);

  const results = await Promise.all(
    addresses.map(async (addr) => {
      const [flr, wflrBal] = await Promise.all([
        provider.getBalance(addr),
        wflr.balanceOf(addr),
      ]);
      return {
        address: addr,
        flr: ethers.formatEther(flr),
        wflr: ethers.formatEther(wflrBal),
      };
    })
  );
  return results;
}

/**
 * Batch wrap FLR → WFLR for multiple wallet indices.
 * @param {string} mnemonic
 * @param {{ index: number, amount: string }[]} operations - amount in FLR (ether units)
 */
async function batchWrap(mnemonic, operations) {
  const results = [];
  for (const op of operations) {
    try {
      const wallet = getWalletAtIndex(mnemonic, op.index);
      const wflr = new ethers.Contract(getWFLRAddress(), WFLR_ABI, wallet);
      const amountWei = ethers.parseEther(op.amount);
      const tx = await wflr.deposit({ value: amountWei, gasLimit: 200000n });
      const receipt = await tx.wait(1);
      results.push({
        index: op.index,
        address: wallet.address,
        amount: op.amount,
        hash: receipt.hash,
        success: true,
      });
    } catch (err) {
      results.push({
        index: op.index,
        amount: op.amount,
        error: err.message,
        success: false,
      });
    }
  }
  return results;
}

/**
 * Batch delegate WFLR to an FTSO provider for multiple wallet indices.
 * @param {string} mnemonic
 * @param {{ index: number, provider: string, bips: number }[]} operations
 */
async function batchDelegate(mnemonic, operations) {
  const results = [];
  for (const op of operations) {
    try {
      const wallet = getWalletAtIndex(mnemonic, op.index);
      const wflr = new ethers.Contract(getWFLRAddress(), WFLR_ABI, wallet);
      const tx = await wflr.delegate(op.provider, op.bips, { gasLimit: 300000n });
      const receipt = await tx.wait(1);
      results.push({
        index: op.index,
        address: wallet.address,
        provider: op.provider,
        bips: op.bips,
        hash: receipt.hash,
        success: true,
      });
    } catch (err) {
      results.push({
        index: op.index,
        provider: op.provider,
        error: err.message,
        success: false,
      });
    }
  }
  return results;
}

/**
 * Batch claim FTSO rewards for multiple wallet indices.
 * @param {string} mnemonic
 * @param {number[]} indices - wallet indices to claim for
 */
async function batchClaim(mnemonic, indices) {
  const provider = getProvider();
  const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);

  let rewardManagerAddr;
  try {
    rewardManagerAddr = await registry.getContractAddressByName('FtsoRewardManager');
  } catch {
    // Fallback for Coston2
    rewardManagerAddr = await registry.getContractAddressByName('RewardManager');
  }

  const results = [];
  for (const idx of indices) {
    try {
      const wallet = getWalletAtIndex(mnemonic, idx);
      const rewardManager = new ethers.Contract(rewardManagerAddr, REWARD_MANAGER_ABI, wallet);
      const currentEpoch = await rewardManager.getCurrentRewardEpoch();

      // Check last few epochs for claimable rewards
      const epochs = [];
      for (let e = Number(currentEpoch) - 1; e >= Math.max(0, Number(currentEpoch) - 10); e--) {
        try {
          const state = await rewardManager.getStateOfRewards(wallet.address, e);
          if (state.claimable && state.rewardAmounts.some(a => a > 0n)) {
            epochs.push(e);
          }
        } catch {
          break;
        }
      }

      if (epochs.length === 0) {
        results.push({ index: idx, address: wallet.address, claimed: '0', success: true, message: 'No claimable rewards' });
        continue;
      }

      const tx = await rewardManager.claimReward(wallet.address, epochs, { gasLimit: 500000n });
      const receipt = await tx.wait(1);
      results.push({
        index: idx,
        address: wallet.address,
        epochs: epochs.length,
        hash: receipt.hash,
        success: true,
      });
    } catch (err) {
      results.push({
        index: idx,
        error: err.message,
        success: false,
      });
    }
  }
  return results;
}

const operatorWalletService = {
  deriveWallets,
  getBalances,
  batchWrap,
  batchDelegate,
  batchClaim,
  getWalletAtIndex,
};

export default operatorWalletService;
