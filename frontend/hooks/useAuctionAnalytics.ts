"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getAnalyticsOverview,
  getAnalyticsParticipants,
  getAnalyticsMarketplace,
  type AnalyticsOverview,
  type AnalyticsParticipants,
  type AnalyticsMarketplace,
} from "@/services/auctionHouseApi";

export interface AnalyticsErrors {
  overview: string | null;
  participants: string | null;
  marketplace: string | null;
}

export function useAuctionAnalytics() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [participants, setParticipants] = useState<AnalyticsParticipants | null>(null);
  const [marketplace, setMarketplace] = useState<AnalyticsMarketplace | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<AnalyticsErrors>({ overview: null, participants: null, marketplace: null });

  const fetchAll = useCallback(async () => {
    setLoading(true);

    const [oResult, pResult, mResult] = await Promise.allSettled([
      getAnalyticsOverview(),
      getAnalyticsParticipants(),
      getAnalyticsMarketplace(),
    ]);

    const newErrors: AnalyticsErrors = { overview: null, participants: null, marketplace: null };

    if (oResult.status === "fulfilled") {
      setOverview(oResult.value);
    } else {
      newErrors.overview = oResult.reason instanceof Error ? oResult.reason.message : "Failed to load overview";
    }

    if (pResult.status === "fulfilled") {
      setParticipants(pResult.value);
    } else {
      newErrors.participants = pResult.reason instanceof Error ? pResult.reason.message : "Failed to load participants";
    }

    if (mResult.status === "fulfilled") {
      setMarketplace(mResult.value);
    } else {
      newErrors.marketplace = mResult.reason instanceof Error ? mResult.reason.message : "Failed to load marketplace";
    }

    setErrors(newErrors);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Aggregate error — only set if ALL endpoints failed
  const allFailed = errors.overview && errors.participants && errors.marketplace;
  const error = allFailed ? "Failed to load analytics" : null;

  return { overview, participants, marketplace, loading, error, errors, refresh: fetchAll };
}
