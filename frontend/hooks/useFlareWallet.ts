"use client";

import { useState, useCallback } from "react";
import { useWeb3ModalAccount, useWeb3ModalProvider } from "@web3modal/ethers/react";
import { BrowserProvider } from "ethers";
import { wrapFLR, unwrapWFLR, type TransactionResult } from "@/services/flareWallet";

export interface FlareWalletActions {
  /** Execute a wrap (FLR -> WFLR) */
  wrap: (amount: string) => Promise<TransactionResult>;
  /** Execute an unwrap (WFLR -> FLR) */
  unwrap: (amount: string) => Promise<TransactionResult>;
  /** Whether a transaction is currently being processed */
  processing: boolean;
  /** Last transaction result */
  lastResult: TransactionResult | null;
  /** Clear last result */
  clearResult: () => void;
}

export function useFlareWallet(): FlareWalletActions {
  const { chainId } = useWeb3ModalAccount();
  const { walletProvider } = useWeb3ModalProvider();
  const [processing, setProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<TransactionResult | null>(null);

  const getSigner = useCallback(async () => {
    if (!walletProvider) throw new Error("Wallet not connected");
    const provider = new BrowserProvider(walletProvider);
    return provider.getSigner();
  }, [walletProvider]);

  const wrap = useCallback(async (amount: string): Promise<TransactionResult> => {
    setProcessing(true);
    setLastResult(null);
    try {
      const signer = await getSigner();
      const result = await wrapFLR(signer, chainId ?? 114, amount);
      setLastResult(result);
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Wrap failed";
      const result: TransactionResult = { hash: "", success: false, error: msg };
      setLastResult(result);
      return result;
    } finally {
      setProcessing(false);
    }
  }, [getSigner, chainId]);

  const unwrap = useCallback(async (amount: string): Promise<TransactionResult> => {
    setProcessing(true);
    setLastResult(null);
    try {
      const signer = await getSigner();
      const result = await unwrapWFLR(signer, chainId ?? 114, amount);
      setLastResult(result);
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unwrap failed";
      const result: TransactionResult = { hash: "", success: false, error: msg };
      setLastResult(result);
      return result;
    } finally {
      setProcessing(false);
    }
  }, [getSigner, chainId]);

  const clearResult = useCallback(() => setLastResult(null), []);

  return { wrap, unwrap, processing, lastResult, clearResult };
}
