/**
 * Flare rewards: FTSO epoch rewards, FlareDrop (distribution), staking rewards.
 * Ported from Bifrost Clone RewardInteraction.ts + additional Flare v2 contracts.
 */

import { Contract, formatEther, type Provider, type Signer, type ContractTransactionResponse } from "ethers";
import FLARE_REGISTRY_ABI from "@/contracts/abis/FlareContractRegistry.json";
import FTSO_REWARD_MANAGER_ABI from "@/contracts/abis/FtsoRewardManager.json";
import { getFlareNetwork, GAS_LIMITS } from "@/lib/flareContracts";
import type { TransactionResult } from "./flareWallet";

// ─── Contract resolution via FlareContractRegistry ──────────

async function getContractAddress(provider: Provider, chainId: number, name: string): Promise<string> {
  const network = getFlareNetwork(chainId);
  const registry = new Contract(network.contracts.flareContractRegistry, FLARE_REGISTRY_ABI, provider);
  return registry.getFunction("getContractAddressByName")(name) as Promise<string>;
}

// ─── FTSO Rewards ───────────────────────────────────────────

export interface FtsoRewardInfo {
  currentEpoch: number;
  unclaimedEpochs: number[];
  totalRewardsWei: bigint;
  totalRewards: string;
}

/** Get FTSO reward manager contract (read-only) */
async function getRewardManager(provider: Provider, chainId: number): Promise<Contract> {
  const address = await getContractAddress(provider, chainId, "FtsoRewardManager");
  return new Contract(address, FTSO_REWARD_MANAGER_ABI, provider);
}

/** Get current reward epoch */
export async function getCurrentRewardEpoch(provider: Provider, chainId: number): Promise<number> {
  const rm = await getRewardManager(provider, chainId);
  const epoch = await rm.getFunction("getCurrentRewardEpoch")();
  return Number(epoch);
}

/** Check unclaimed FTSO rewards for an address (checks last 10 epochs) */
export async function getUnclaimedFtsoRewards(
  provider: Provider,
  chainId: number,
  address: string
): Promise<FtsoRewardInfo> {
  const rm = await getRewardManager(provider, chainId);
  const currentEpoch = await getCurrentRewardEpoch(provider, chainId);

  const unclaimedEpochs: number[] = [];
  let totalRewardsWei = 0n;

  const startEpoch = Math.max(0, currentEpoch - 10);
  for (let epoch = startEpoch; epoch < currentEpoch; epoch++) {
    try {
      const [, rewards, claimed] = await rm.getFunction("getStateOfRewardsFromDataProviders")(address, epoch);
      for (let i = 0; i < (rewards as bigint[]).length; i++) {
        const reward = (rewards as bigint[])[i];
        const isClaimed = (claimed as boolean[])[i];
        if (!isClaimed && reward !== undefined && reward > 0n) {
          if (!unclaimedEpochs.includes(epoch)) {
            unclaimedEpochs.push(epoch);
          }
          totalRewardsWei += reward;
        }
      }
    } catch {
      // Skip expired/invalid epochs
    }
  }

  return {
    currentEpoch,
    unclaimedEpochs,
    totalRewardsWei,
    totalRewards: formatEther(totalRewardsWei),
  };
}

/** Claim FTSO rewards for specific epochs */
export async function claimFtsoRewards(
  signer: Signer,
  chainId: number,
  address: string,
  epochs: number[]
): Promise<TransactionResult> {
  try {
    const rmAddress = await getContractAddress(signer.provider!, chainId, "FtsoRewardManager");
    const rm = new Contract(rmAddress, FTSO_REWARD_MANAGER_ABI, signer);
    const tx: ContractTransactionResponse = await rm.getFunction("claimReward")(
      address, // reward owner
      address, // recipient
      epochs,
      { gasLimit: GAS_LIMITS.claimRewards }
    );
    const receipt = await tx.wait(1);
    return {
      hash: tx.hash,
      success: receipt !== null && receipt.status === 1,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Claim failed";
    const reason = (err as { reason?: string })?.reason;
    return { hash: "", success: false, error: reason || msg };
  }
}

// ─── FlareDrop (DistributionToDelegators) ───────────────────

// Minimal ABI for DistributionToDelegators
const DISTRIBUTION_ABI = [
  {
    inputs: [{ type: "address", name: "_rewardOwner" }],
    name: "getClaimableAmount",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { type: "address", name: "_rewardOwner" },
      { type: "address", name: "_recipient" },
    ],
    name: "claim",
    outputs: [{ type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
];

export interface FlareDropInfo {
  claimableWei: bigint;
  claimable: string;
}

/** Get claimable FlareDrop amount */
export async function getClaimableFlareDrop(
  provider: Provider,
  chainId: number,
  address: string
): Promise<FlareDropInfo> {
  try {
    const distAddr = await getContractAddress(provider, chainId, "DistributionToDelegators");
    const dist = new Contract(distAddr, DISTRIBUTION_ABI, provider);
    const amount = (await dist.getFunction("getClaimableAmount")(address)) as bigint;
    return { claimableWei: amount, claimable: formatEther(amount) };
  } catch {
    return { claimableWei: 0n, claimable: "0.0" };
  }
}

/** Claim FlareDrop */
export async function claimFlareDrop(
  signer: Signer,
  chainId: number,
  address: string
): Promise<TransactionResult> {
  try {
    const distAddr = await getContractAddress(signer.provider!, chainId, "DistributionToDelegators");
    const dist = new Contract(distAddr, DISTRIBUTION_ABI, signer);
    const tx: ContractTransactionResponse = await dist.getFunction("claim")(address, address, {
      gasLimit: GAS_LIMITS.claimRewards,
    });
    const receipt = await tx.wait(1);
    return {
      hash: tx.hash,
      success: receipt !== null && receipt.status === 1,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "FlareDrop claim failed";
    const reason = (err as { reason?: string })?.reason;
    return { hash: "", success: false, error: reason || msg };
  }
}

// ─── Combined Rewards Summary ───────────────────────────────

export interface RewardsSummary {
  ftso: FtsoRewardInfo;
  flareDrop: FlareDropInfo;
  totalClaimableWei: bigint;
  totalClaimable: string;
}

/** Fetch all reward types in parallel */
export async function getAllRewards(
  provider: Provider,
  chainId: number,
  address: string
): Promise<RewardsSummary> {
  const [ftso, flareDrop] = await Promise.all([
    getUnclaimedFtsoRewards(provider, chainId, address).catch(() => ({
      currentEpoch: 0,
      unclaimedEpochs: [] as number[],
      totalRewardsWei: 0n,
      totalRewards: "0.0",
    })),
    getClaimableFlareDrop(provider, chainId, address),
  ]);

  const totalClaimableWei = ftso.totalRewardsWei + flareDrop.claimableWei;

  return {
    ftso,
    flareDrop,
    totalClaimableWei,
    totalClaimable: formatEther(totalClaimableWei),
  };
}
