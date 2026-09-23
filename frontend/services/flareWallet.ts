/**
 * Flare wallet operations: wrap, unwrap, delegate, balance queries.
 * Ported from Bifrost Clone ContractInteraction.ts, adapted for browser signer.
 */

import { Contract, formatEther, parseEther, type Signer, type Provider, type ContractTransactionResponse } from "ethers";
import WFLR_ABI from "@/contracts/abis/WFLR.json";
import { getFlareNetwork, GAS_LIMITS } from "@/lib/flareContracts";

export interface TransactionResult {
  hash: string;
  success: boolean;
  error?: string;
}

export interface DelegationInfo {
  providers: string[];
  bips: number[];
  count: number;
  delegationMode: number;
}

// ─── Read-only queries (use provider) ───────────────────────────

function getWFLRReadOnly(provider: Provider, chainId: number): Contract {
  const network = getFlareNetwork(chainId);
  return new Contract(network.contracts.wflr, WFLR_ABI, provider);
}

/** Get WFLR balance for an address */
export async function getWFLRBalance(provider: Provider, chainId: number, address: string): Promise<bigint> {
  const contract = getWFLRReadOnly(provider, chainId);
  return contract.getFunction("balanceOf")(address) as Promise<bigint>;
}

/** Get vote power for an address */
export async function getVotePower(provider: Provider, chainId: number, address: string): Promise<bigint> {
  const contract = getWFLRReadOnly(provider, chainId);
  return contract.getFunction("votePowerOf")(address) as Promise<bigint>;
}

/** Get delegation info for an address */
export async function getDelegationInfo(provider: Provider, chainId: number, address: string): Promise<DelegationInfo> {
  const contract = getWFLRReadOnly(provider, chainId);
  const result = await contract.getFunction("delegatesOf")(address);
  return {
    providers: result[0] as string[],
    bips: (result[1] as bigint[]).map((b) => Number(b)),
    count: Number(result[2]),
    delegationMode: Number(result[3]),
  };
}

// ─── Write operations (use signer) ─────────────────────────────

function getWFLRWithSigner(signer: Signer, chainId: number): Contract {
  const network = getFlareNetwork(chainId);
  return new Contract(network.contracts.wflr, WFLR_ABI, signer);
}

/** Wrap FLR -> WFLR (calls deposit() with value) */
export async function wrapFLR(signer: Signer, chainId: number, amount: string): Promise<TransactionResult> {
  try {
    const contract = getWFLRWithSigner(signer, chainId);
    const value = parseEther(amount);
    const tx: ContractTransactionResponse = await contract.getFunction("deposit")({
      value,
      gasLimit: GAS_LIMITS.wrap,
    });
    const receipt = await tx.wait(1);
    return {
      hash: tx.hash,
      success: receipt !== null && receipt.status === 1,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Wrap failed";
    // Try to extract revert reason
    const reason = (err as { reason?: string })?.reason;
    return { hash: "", success: false, error: reason || msg };
  }
}

/** Unwrap WFLR -> FLR (calls withdraw()) */
export async function unwrapWFLR(signer: Signer, chainId: number, amount: string): Promise<TransactionResult> {
  try {
    const contract = getWFLRWithSigner(signer, chainId);
    const value = parseEther(amount);
    const tx: ContractTransactionResponse = await contract.getFunction("withdraw")(value, {
      gasLimit: GAS_LIMITS.unwrap,
    });
    const receipt = await tx.wait(1);
    return {
      hash: tx.hash,
      success: receipt !== null && receipt.status === 1,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unwrap failed";
    const reason = (err as { reason?: string })?.reason;
    return { hash: "", success: false, error: reason || msg };
  }
}

/** Delegate WFLR voting power to an FTSO provider */
export async function delegateToProvider(
  signer: Signer,
  chainId: number,
  providerAddress: string,
  bips: number
): Promise<TransactionResult> {
  try {
    const contract = getWFLRWithSigner(signer, chainId);
    const tx: ContractTransactionResponse = await contract.getFunction("delegate")(providerAddress, bips, {
      gasLimit: GAS_LIMITS.delegate,
    });
    const receipt = await tx.wait(1);
    return {
      hash: tx.hash,
      success: receipt !== null && receipt.status === 1,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Delegate failed";
    const reason = (err as { reason?: string })?.reason;
    return { hash: "", success: false, error: reason || msg };
  }
}

/** Undelegate all voting power */
export async function undelegateAll(signer: Signer, chainId: number): Promise<TransactionResult> {
  try {
    const contract = getWFLRWithSigner(signer, chainId);
    const tx: ContractTransactionResponse = await contract.getFunction("undelegateAll")({
      gasLimit: GAS_LIMITS.undelegateAll,
    });
    const receipt = await tx.wait(1);
    return {
      hash: tx.hash,
      success: receipt !== null && receipt.status === 1,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Undelegate failed";
    const reason = (err as { reason?: string })?.reason;
    return { hash: "", success: false, error: reason || msg };
  }
}

// ─── Helpers ────────────────────────────────────────────────────

/** Format wei to human-readable string with specified decimals */
export function formatFlare(wei: bigint, decimals = 4): string {
  const full = formatEther(wei);
  const dot = full.indexOf(".");
  if (dot === -1) return full;
  return full.slice(0, dot + decimals + 1);
}

/** Convert percentage (0-100) to basis points (0-10000) */
export function percentToBips(percent: number): number {
  return Math.round(percent * 100);
}

/** Convert basis points (0-10000) to percentage (0-100) */
export function bipsToPercent(bips: number): number {
  return bips / 100;
}
