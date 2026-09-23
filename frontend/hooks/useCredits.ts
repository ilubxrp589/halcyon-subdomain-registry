"use client";

import { useState, useEffect, useCallback } from "react";
import { getUnifiedCredits, UnifiedCreditsInfo, CreditTransaction } from "@/services/api";

/**
 * Hook for managing unified credits (for domain NFT customization)
 * Credits are earned from domain purchases and spent on:
 * - Image generation (1 credit per generation of 3 images)
 * - NFT finalization (1 credit per finalization)
 */
export function useCredits(walletAddress: string | undefined) {
  const [credits, setCredits] = useState<UnifiedCreditsInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch credits from the API
   */
  const refresh = useCallback(async () => {
    if (!walletAddress) {
      setCredits(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await getUnifiedCredits(walletAddress);
      if (data.success) {
        setCredits(data);
      } else {
        setError(data.error || "Failed to fetch credits");
      }
    } catch (err) {
      console.error("Failed to fetch credits:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch credits");
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  // Fetch credits when wallet changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Check if user has enough credits for an action
   */
  const hasCredits = useCallback((amount: number = 1): boolean => {
    return (credits?.total ?? 0) >= amount;
  }, [credits]);

  /**
   * Optimistically deduct credits (for better UX)
   * Call refresh() after the actual API call completes
   */
  const optimisticDeduct = useCallback((amount: number = 1) => {
    setCredits(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        total: Math.max(0, prev.total - amount),
        spent: prev.spent + amount,
      };
    });
  }, []);

  return {
    credits,
    total: credits?.total ?? 0,
    earned: credits?.earned ?? 0,
    spent: credits?.spent ?? 0,
    history: credits?.history ?? [],
    isLoading,
    error,
    refresh,
    hasCredits,
    optimisticDeduct,
  };
}

export type { UnifiedCreditsInfo, CreditTransaction };
export default useCredits;
