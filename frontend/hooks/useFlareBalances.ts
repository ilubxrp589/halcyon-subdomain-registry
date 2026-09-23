"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWeb3ModalAccount, useWeb3ModalProvider } from "@web3modal/ethers/react";
import { BrowserProvider } from "ethers";
import { getWFLRBalance, getVotePower, formatFlare } from "@/services/flareWallet";

export interface FlareBalances {
  /** Native FLR balance in wei */
  flrWei: bigint;
  /** WFLR balance in wei */
  wflrWei: bigint;
  /** Vote power in wei */
  votePowerWei: bigint;
  /** Formatted FLR balance */
  flr: string;
  /** Formatted WFLR balance */
  wflr: string;
  /** Formatted vote power */
  votePower: string;
  /** Loading state */
  loading: boolean;
  /** Last error */
  error: string | null;
  /** Manual refresh */
  refresh: () => Promise<void>;
}

const POLL_INTERVAL = 15_000; // 15 seconds

export function useFlareBalances(): FlareBalances {
  const { address, isConnected, chainId } = useWeb3ModalAccount();
  const { walletProvider } = useWeb3ModalProvider();

  const [flrWei, setFlrWei] = useState<bigint>(0n);
  const [wflrWei, setWflrWei] = useState<bigint>(0n);
  const [votePowerWei, setVotePowerWei] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track latest values to avoid stale closures
  const addressRef = useRef(address);
  const chainIdRef = useRef(chainId);
  addressRef.current = address;
  chainIdRef.current = chainId;

  const fetchBalances = useCallback(async () => {
    if (!address || !walletProvider || !isConnected) {
      setFlrWei(0n);
      setWflrWei(0n);
      setVotePowerWei(0n);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const provider = new BrowserProvider(walletProvider);
      const cid = chainId ?? 114;

      const [flrBal, wflrBal, vp] = await Promise.all([
        provider.getBalance(address),
        getWFLRBalance(provider, cid, address),
        getVotePower(provider, cid, address),
      ]);

      // Only update if address hasn't changed during fetch
      if (addressRef.current === address) {
        setFlrWei(flrBal);
        setWflrWei(wflrBal);
        setVotePowerWei(vp);
      }
    } catch (err) {
      console.error("Failed to fetch Flare balances:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch balances");
    } finally {
      setLoading(false);
    }
  }, [address, walletProvider, isConnected, chainId]);

  // Initial fetch + polling
  useEffect(() => {
    fetchBalances();
    const interval = setInterval(fetchBalances, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchBalances]);

  return {
    flrWei,
    wflrWei,
    votePowerWei,
    flr: formatFlare(flrWei),
    wflr: formatFlare(wflrWei),
    votePower: formatFlare(votePowerWei),
    loading,
    error,
    refresh: fetchBalances,
  };
}
