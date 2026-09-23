"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  getMarketplaceListings,
  getRecentMarketplaceSales,
  type MarketplaceListing,
  type MarketplaceParams,
  type Pagination,
} from "@/services/auctionHouseApi";

const POLL_INTERVAL = 30000;

export interface MarketplaceFilters {
  sort?: string;
  page?: number;
  limit?: number;
  q?: string;
}

export interface UseMarketplaceReturn {
  listings: MarketplaceListing[];
  pagination: Pagination | null;
  recentSales: MarketplaceListing[];
  loading: boolean;
  error: string | null;
  filters: MarketplaceFilters;
  setFilters: (filters: Partial<MarketplaceFilters>) => void;
  refresh: () => Promise<void>;
}

export function useMarketplace(
  initialFilters: MarketplaceFilters = {}
): UseMarketplaceReturn {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [recentSales, setRecentSales] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<MarketplaceFilters>({
    sort: "newest",
    page: 1,
    limit: 20,
    ...initialFilters,
  });
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);

      const currentFilters = filtersRef.current;
      const params: MarketplaceParams = {};
      if (currentFilters.sort) params.sort = currentFilters.sort as MarketplaceParams["sort"];
      if (currentFilters.page) params.page = currentFilters.page;
      if (currentFilters.limit) params.limit = currentFilters.limit;
      if (currentFilters.q) params.q = currentFilters.q;

      const [listingResult, salesResult] = await Promise.all([
        getMarketplaceListings(params).catch(() => ({
          listings: [] as MarketplaceListing[],
          pagination: { page: 1, limit: 20, total: 0, pages: 0 },
        })),
        isInitial
          ? getRecentMarketplaceSales(10).catch(() => [] as MarketplaceListing[])
          : Promise.resolve(recentSales),
      ]);

      setListings(listingResult.listings);
      setPagination(listingResult.pagination);
      if (isInitial && Array.isArray(salesResult)) setRecentSales(salesResult);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load marketplace");
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [recentSales]);

  const setFilters = useCallback((newFilters: Partial<MarketplaceFilters>) => {
    setFiltersState((prev) => {
      const updated = { ...prev, ...newFilters };
      if (!("page" in newFilters)) {
        updated.page = 1;
      }
      return updated;
    });
  }, []);

  useEffect(() => {
    fetchData(true);
  }, []);

  useEffect(() => {
    fetchData(false);
  }, [filters]);

  useEffect(() => {
    intervalRef.current = setInterval(() => fetchData(false), POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  return {
    listings,
    pagination,
    recentSales,
    loading,
    error,
    filters,
    setFilters,
    refresh: () => fetchData(false),
  };
}
