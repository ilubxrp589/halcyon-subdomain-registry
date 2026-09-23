"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  getWalletInfo,
  getNamesDetailed,
  getAuctions,
  getHistory,
  getReceiveAddress,
  getExpiringNames,
  type HnsWalletInfo,
  type NameState,
  type AuctionEntry,
  type HistoryTx,
  type ExpiringName,
} from "@/services/hnsWalletApi";

const POLL_INTERVAL = 30000; // 30 seconds

export interface UseHnsWalletReturn {
  wallet: HnsWalletInfo | null;
  names: NameState[];
  auctions: AuctionEntry[];
  history: HistoryTx[];
  receiveAddress: string | null;
  expiringNames: ExpiringName[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useHnsWallet(): UseHnsWalletReturn {
  const { getAuthCredentials } = useAuth();
  const [wallet, setWallet] = useState<HnsWalletInfo | null>(null);
  const [names, setNames] = useState<NameState[]>([]);
  const [auctions, setAuctions] = useState<AuctionEntry[]>([]);
  const [history, setHistory] = useState<HistoryTx[]>([]);
  const [receiveAddress, setReceiveAddress] = useState<string | null>(null);
  const [expiringNames, setExpiringNames] = useState<ExpiringName[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);

      const creds = await getAuthCredentials();
      if (!creds) {
        setError("Not authenticated");
        if (isInitial) setLoading(false);
        return;
      }

      const [walletRes, namesRes, auctionsRes, historyRes, addrRes, expiringRes] =
        await Promise.all([
          getWalletInfo(creds).catch(() => null),
          getNamesDetailed(creds).catch(() => ({ success: false, names: [] as NameState[] })),
          getAuctions(creds).catch(() => ({ success: false, auctions: [] })),
          getHistory(creds).catch(() => ({ success: false, history: [] })),
          getReceiveAddress(creds).catch(() => ({
            success: false,
            address: "",
          })),
          getExpiringNames(creds).catch(() => ({ success: false, expiring: [] as ExpiringName[] })),
        ]);

      if (walletRes?.success) {
        setWallet(walletRes);
        setError(null);
      } else {
        setError(walletRes?.error || "Failed to load wallet");
      }

      setNames(namesRes.success ? namesRes.names : []);
      setAuctions(auctionsRes.success ? auctionsRes.auctions : []);
      setHistory(historyRes.success ? historyRes.history : []);
      setReceiveAddress(addrRes.success ? addrRes.address : null);
      setExpiringNames(expiringRes.success ? expiringRes.expiring : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wallet");
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [getAuthCredentials]);

  // Initial fetch + polling
  useEffect(() => {
    fetchAll(true);
    intervalRef.current = setInterval(() => fetchAll(false), POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchAll]);

  return {
    wallet,
    names,
    auctions,
    history,
    receiveAddress,
    expiringNames,
    loading,
    error,
    refresh: () => fetchAll(false),
  };
}
