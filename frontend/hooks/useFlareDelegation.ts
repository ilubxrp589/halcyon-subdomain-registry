"use client";

import { useState, useEffect, useCallback } from "react";
import { useWeb3ModalAccount, useWeb3ModalProvider } from "@web3modal/ethers/react";
import { BrowserProvider } from "ethers";
import {
  getDelegationInfo,
  delegateToProvider,
  undelegateAll as undelegateAllFn,
  bipsToPercent,
  percentToBips,
  type DelegationInfo,
  type TransactionResult,
} from "@/services/flareWallet";

export interface DelegationState {
  delegations: DelegationInfo | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  delegate: (providerAddress: string, percent: number) => Promise<TransactionResult>;
  undelegateAll: () => Promise<TransactionResult>;
  processing: boolean;
}

export function useFlareDelegation(): DelegationState {
  const { address, isConnected, chainId } = useWeb3ModalAccount();
  const { walletProvider } = useWeb3ModalProvider();

  const [delegations, setDelegations] = useState<DelegationInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const fetchDelegations = useCallback(async () => {
    if (!address || !walletProvider || !isConnected) {
      setDelegations(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const provider = new BrowserProvider(walletProvider);
      const info = await getDelegationInfo(provider, chainId ?? 114, address);
      setDelegations(info);
    } catch (err) {
      console.error("Failed to fetch delegation info:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch delegations");
    } finally {
      setLoading(false);
    }
  }, [address, walletProvider, isConnected, chainId]);

  useEffect(() => {
    fetchDelegations();
  }, [fetchDelegations]);

  const delegate = useCallback(async (providerAddress: string, percent: number): Promise<TransactionResult> => {
    if (!walletProvider) return { hash: "", success: false, error: "Wallet not connected" };
    setProcessing(true);
    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const bips = percentToBips(percent);
      const result = await delegateToProvider(signer, chainId ?? 114, providerAddress, bips);
      if (result.success) await fetchDelegations();
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Delegation failed";
      return { hash: "", success: false, error: msg };
    } finally {
      setProcessing(false);
    }
  }, [walletProvider, chainId, fetchDelegations]);

  const undelegateAll = useCallback(async (): Promise<TransactionResult> => {
    if (!walletProvider) return { hash: "", success: false, error: "Wallet not connected" };
    setProcessing(true);
    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const result = await undelegateAllFn(signer, chainId ?? 114);
      if (result.success) await fetchDelegations();
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Undelegation failed";
      return { hash: "", success: false, error: msg };
    } finally {
      setProcessing(false);
    }
  }, [walletProvider, chainId, fetchDelegations]);

  return {
    delegations,
    loading,
    error,
    refresh: fetchDelegations,
    delegate,
    undelegateAll,
    processing,
  };
}

export { bipsToPercent };
