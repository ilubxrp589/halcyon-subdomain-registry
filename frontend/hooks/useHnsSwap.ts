"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  getSwapRate,
  getSwapQuote,
  executeSwap,
  getSwapHistory,
  type SwapRate,
  type SwapQuote,
  type SwapRecord,
} from "@/services/hnsWalletApi";

const RATE_POLL_INTERVAL = 30000; // 30 seconds

export interface UseHnsSwapReturn {
  rate: SwapRate | null;
  quote: SwapQuote | null;
  swapHistory: SwapRecord[];
  rateLoading: boolean;
  quoteLoading: boolean;
  executing: boolean;
  error: string | null;
  fetchQuote: (direction: "buy_hns" | "sell_hns", amount: number) => Promise<void>;
  execute: (quoteId: string, flrTxHash?: string) => Promise<{
    success: boolean;
    hnsTxHash?: string;
    flrTxHash?: string;
    error?: string;
  }>;
  refreshRate: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  clearQuote: () => void;
}

export function useHnsSwap(): UseHnsSwapReturn {
  const { getAuthCredentials } = useAuth();
  const [rate, setRate] = useState<SwapRate | null>(null);
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [swapHistory, setSwapHistory] = useState<SwapRecord[]>([]);
  const [rateLoading, setRateLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshRate = useCallback(async () => {
    try {
      const data = await getSwapRate();
      if (data.success) {
        setRate(data);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get swap rate");
    } finally {
      setRateLoading(false);
    }
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const creds = await getAuthCredentials();
      if (!creds) return;
      const data = await getSwapHistory(creds);
      if (data.success) {
        setSwapHistory(data.swaps);
      }
    } catch {
      // Non-critical
    }
  }, [getAuthCredentials]);

  const fetchQuote = useCallback(
    async (direction: "buy_hns" | "sell_hns", amount: number) => {
      setQuoteLoading(true);
      setError(null);
      try {
        const creds = await getAuthCredentials();
        if (!creds) throw new Error("Not authenticated");
        const data = await getSwapQuote(creds, direction, amount);
        if (data.success) {
          setQuote(data);
        } else {
          setError("Failed to get quote");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to get quote");
      } finally {
        setQuoteLoading(false);
      }
    },
    [getAuthCredentials]
  );

  const execute = useCallback(
    async (quoteId: string, flrTxHash?: string) => {
      setExecuting(true);
      setError(null);
      try {
        const creds = await getAuthCredentials();
        if (!creds) throw new Error("Not authenticated");
        const result = await executeSwap(creds, quoteId, flrTxHash);
        if (result.success) {
          setQuote(null);
          refreshHistory();
        } else {
          setError(result.error || "Swap failed");
        }
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Swap failed";
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setExecuting(false);
      }
    },
    [getAuthCredentials, refreshHistory]
  );

  const clearQuote = useCallback(() => setQuote(null), []);

  // Poll rate + load history on mount
  useEffect(() => {
    refreshRate();
    refreshHistory();
    intervalRef.current = setInterval(refreshRate, RATE_POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refreshRate, refreshHistory]);

  return {
    rate,
    quote,
    swapHistory,
    rateLoading,
    quoteLoading,
    executing,
    error,
    fetchQuote,
    execute,
    refreshRate,
    refreshHistory,
    clearQuote,
  };
}
