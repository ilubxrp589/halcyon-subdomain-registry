"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  getActiveAuctions,
  getAuctionStats,
  getTrending,
  type Auction,
  type AuctionStats,
  type ActiveAuctionsParams,
  type Pagination,
} from "@/services/auctionHouseApi";

const POLL_INTERVAL = 30000; // 30 seconds

export interface AuctionFilters {
  state?: string;
  sort?: string;
  page?: number;
  limit?: number;
  q?: string;
  contested?: string;
  minLength?: number;
  maxLength?: number;
  minBid?: number;
  maxBid?: number;
}

export interface UseAuctionHouseReturn {
  auctions: Auction[];
  pagination: Pagination | null;
  stats: AuctionStats | null;
  trending: Auction[];
  loading: boolean;
  error: string | null;
  filters: AuctionFilters;
  setFilters: (filters: Partial<AuctionFilters>) => void;
  refresh: () => Promise<void>;
}

export function useAuctionHouse(
  initialFilters: AuctionFilters = {}
): UseAuctionHouseReturn {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [stats, setStats] = useState<AuctionStats | null>(null);
  const [trending, setTrending] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<AuctionFilters>({
    state: "BIDDING",
    sort: "ending-soon",
    page: 1,
    limit: 20,
    ...initialFilters,
  });

  // Use refs for values accessed in polling callback to avoid re-creating the interval
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const trendingRef = useRef(trending);
  trendingRef.current = trending;
  const initialFetchDone = useRef(false);

  // Stable fetchData that reads from refs — no dependencies that cause interval resets
  const fetchData = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);

      const currentFilters = filtersRef.current;
      const params: ActiveAuctionsParams = {};
      if (currentFilters.state) params.state = currentFilters.state as ActiveAuctionsParams["state"];
      if (currentFilters.sort) params.sort = currentFilters.sort as ActiveAuctionsParams["sort"];
      if (currentFilters.page) params.page = currentFilters.page;
      if (currentFilters.limit) params.limit = currentFilters.limit;
      if (currentFilters.q) params.q = currentFilters.q;
      if (currentFilters.contested !== undefined) params.contested = currentFilters.contested;
      if (currentFilters.minLength) params.minLength = currentFilters.minLength;
      if (currentFilters.maxLength) params.maxLength = currentFilters.maxLength;
      if (currentFilters.minBid) params.minBid = currentFilters.minBid;
      if (currentFilters.maxBid) params.maxBid = currentFilters.maxBid;

      const [auctionResult, statsResult, trendingResult] = await Promise.all([
        getActiveAuctions(params).catch(() => ({ auctions: [] as Auction[], pagination: { page: 1, limit: 20, total: 0, pages: 0 } })),
        getAuctionStats().catch(() => null),
        isInitial ? getTrending(20).catch(() => [] as Auction[]) : Promise.resolve(trendingRef.current),
      ]);

      setAuctions(auctionResult.auctions);
      setPagination(auctionResult.pagination);
      if (statsResult) setStats(statsResult);
      if (isInitial && Array.isArray(trendingResult)) setTrending(trendingResult);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load auctions");
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []); // No dependencies — reads from refs

  const setFilters = useCallback((newFilters: Partial<AuctionFilters>) => {
    setFiltersState((prev) => {
      const updated = { ...prev, ...newFilters };
      // Reset to page 1 when changing filters (except page itself)
      if (!("page" in newFilters)) {
        updated.page = 1;
      }
      return updated;
    });
  }, []);

  // Initial fetch
  useEffect(() => {
    if (!initialFetchDone.current) {
      initialFetchDone.current = true;
      fetchData(true);
    }
  }, [fetchData]);

  // Re-fetch when filters change (skip initial render)
  useEffect(() => {
    if (initialFetchDone.current) {
      fetchData(false);
    }
  }, [filters, fetchData]);

  // Stable polling — fetchData never changes so interval never resets
  useEffect(() => {
    const interval = setInterval(() => fetchData(false), POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  return {
    auctions,
    pagination,
    stats,
    trending,
    loading,
    error,
    filters,
    setFilters,
    refresh: () => fetchData(false),
  };
}
