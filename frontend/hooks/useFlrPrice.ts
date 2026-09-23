"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL || "/api/proxy"}/v2`;

const REFRESH_INTERVAL = 30_000; // 30 seconds
const STALE_THRESHOLD = 5 * 60_000; // 5 minutes

interface FlrPriceState {
  /** USD per 1 FLR */
  rate: number | null;
  /** How many FLR per 1 USD */
  flrPerUsd: number | null;
  /** When the price was last fetched */
  lastUpdated: Date | null;
  /** True if the price is older than 5 minutes */
  isStale: boolean;
  /** True while fetching */
  isLoading: boolean;
  /** Convert USD cents to FLR amount */
  usdCentsToFlr: (usdCents: number) => number | null;
  /** Convert USD cents to FLR with 2% slippage buffer */
  usdCentsToFlrWithBuffer: (usdCents: number) => number | null;
  /** Force refresh the price */
  refresh: () => Promise<void>;
}

export function useFlrPrice(): FlrPriceState {
  const [rate, setRate] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const hasLoadedRef = useRef(false);

  const fetchPrice = useCallback(async () => {
    // Only show loading spinner on first fetch, not background refreshes
    if (!hasLoadedRef.current) setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/price/flr-rate`);
      if (!res.ok) throw new Error("Price feed unavailable");
      const data = await res.json();
      if (data.flrPriceUsd && data.flrPriceUsd > 0) {
        setRate(data.flrPriceUsd);
        setLastUpdated(new Date());
      }
    } catch {
      // Keep existing price if fetch fails
    } finally {
      hasLoadedRef.current = true;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrice();
    intervalRef.current = setInterval(fetchPrice, REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchPrice]);

  const isStale = lastUpdated
    ? Date.now() - lastUpdated.getTime() > STALE_THRESHOLD
    : true;

  const flrPerUsd = rate && rate > 0 ? 1 / rate : null;

  const usdCentsToFlr = useCallback(
    (usdCents: number) => {
      if (!rate || rate <= 0) return null;
      return (usdCents / 100) / rate;
    },
    [rate]
  );

  const usdCentsToFlrWithBuffer = useCallback(
    (usdCents: number) => {
      if (!rate || rate <= 0) return null;
      return ((usdCents / 100) / rate) * 1.02; // 2% buffer
    },
    [rate]
  );

  return {
    rate,
    flrPerUsd,
    lastUpdated,
    isStale,
    isLoading,
    usdCentsToFlr,
    usdCentsToFlrWithBuffer,
    refresh: fetchPrice,
  };
}
