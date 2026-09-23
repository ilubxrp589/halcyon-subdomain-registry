"use client";

import { useState, useEffect, useCallback } from "react";
import { useWeb3ModalAccount, useWeb3ModalProvider } from "@web3modal/ethers/react";
import { BrowserProvider } from "ethers";
import {
  getAllRewards,
  claimFtsoRewards,
  claimFlareDrop,
  type RewardsSummary,
} from "@/services/flareRewards";
import type { TransactionResult } from "@/services/flareWallet";

export interface FlareRewardsState {
  rewards: RewardsSummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  claimFtso: () => Promise<TransactionResult>;
  claimDrop: () => Promise<TransactionResult>;
  processing: boolean;
}

export function useFlareRewards(): FlareRewardsState {
  const { address, isConnected, chainId } = useWeb3ModalAccount();
  const { walletProvider } = useWeb3ModalProvider();
  const [rewards, setRewards] = useState<RewardsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const fetchRewards = useCallback(async () => {
    if (!address || !walletProvider || !isConnected) {
      setRewards(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const provider = new BrowserProvider(walletProvider);
      const result = await getAllRewards(provider, chainId ?? 114, address);
      setRewards(result);
    } catch (err) {
      console.error("Failed to fetch rewards:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch rewards");
    } finally {
      setLoading(false);
    }
  }, [address, walletProvider, isConnected, chainId]);

  useEffect(() => {
    fetchRewards();
  }, [fetchRewards]);

  const claimFtso = useCallback(async (): Promise<TransactionResult> => {
    if (!walletProvider || !address || !rewards?.ftso.unclaimedEpochs.length) {
      return { hash: "", success: false, error: "No FTSO rewards to claim" };
    }
    setProcessing(true);
    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const result = await claimFtsoRewards(signer, chainId ?? 114, address, rewards.ftso.unclaimedEpochs);
      if (result.success) await fetchRewards();
      return result;
    } catch (err: unknown) {
      return { hash: "", success: false, error: err instanceof Error ? err.message : "Claim failed" };
    } finally {
      setProcessing(false);
    }
  }, [walletProvider, address, rewards, chainId, fetchRewards]);

  const claimDrop = useCallback(async (): Promise<TransactionResult> => {
    if (!walletProvider || !address) {
      return { hash: "", success: false, error: "Wallet not connected" };
    }
    setProcessing(true);
    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const result = await claimFlareDrop(signer, chainId ?? 114, address);
      if (result.success) await fetchRewards();
      return result;
    } catch (err: unknown) {
      return { hash: "", success: false, error: err instanceof Error ? err.message : "Claim failed" };
    } finally {
      setProcessing(false);
    }
  }, [walletProvider, address, chainId, fetchRewards]);

  return { rewards, loading, error, refresh: fetchRewards, claimFtso, claimDrop, processing };
}
