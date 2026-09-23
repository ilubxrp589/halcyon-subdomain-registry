"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getV2Tlds,
  getV2MyClaims,
  type V2TldInfo,
  type V2StakingClaim,
  type AuthCredentials,
} from "@/services/api";

interface UseMyTldsResult {
  tlds: V2TldInfo[];
  claims: V2StakingClaim[];
  pendingClaims: V2StakingClaim[];
  completedTldCount: number;
  totalSlds: number;
  activeTldCount: number;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useMyTlds(
  wallet: string | undefined,
  getAuthCredentials: () => Promise<AuthCredentials>
): UseMyTldsResult {
  const [tlds, setTlds] = useState<V2TldInfo[]>([]);
  const [claims, setClaims] = useState<V2StakingClaim[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use ref to avoid re-triggering effects when getAuthCredentials changes reference
  const getAuthRef = useRef(getAuthCredentials);
  useEffect(() => { getAuthRef.current = getAuthCredentials; }, [getAuthCredentials]);

  const fetchData = useCallback(async () => {
    if (!wallet) {
      setTlds([]);
      setClaims([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const credentials = await getAuthRef.current();
      const [allTlds, myClaims] = await Promise.all([
        getV2Tlds(),
        getV2MyClaims(credentials),
      ]);

      // Filter TLDs owned by this wallet
      const myTlds = allTlds.filter(
        (t) => t.owner?.toLowerCase() === wallet.toLowerCase()
      );

      setTlds(myTlds);
      setClaims(myClaims);
    } catch (err) {
      console.error("Failed to fetch TLD data:", err);
      setError(err instanceof Error ? err.message : "Failed to load TLD data");
    } finally {
      setIsLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const pendingClaims = claims.filter(
    (c) => c.status !== "completed" && c.status !== "failed"
  );
  const completedTldCount = tlds.length;
  const totalSlds = tlds.reduce((sum, t) => sum + t.sldCount, 0);
  const activeTldCount = tlds.filter((t) => t.registrationEnabled).length;

  return {
    tlds,
    claims,
    pendingClaims,
    completedTldCount,
    totalSlds,
    activeTldCount,
    isLoading,
    error,
    refresh: fetchData,
  };
}
