"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getV2MyDomains,
  type V2Domain,
  type Domain,
  type AuthCredentials,
} from "@/services/api";

/**
 * Adapt a V2Domain (from the V2 backend) into the V1 Domain shape
 * so all existing dashboard components work unchanged.
 */
function adaptV2ToDomain(v2: V2Domain, ownerWallet: string): Domain {
  let status = "active";
  if (v2.isExpired) status = "expired";
  else if (v2.isInGracePeriod) status = "grace_period";

  let nftStatus: "placeholder" | "customized" | undefined;
  if (v2.artwork.status === "completed" && v2.artwork.ipfsCid) {
    nftStatus = "customized";
  } else {
    nftStatus = "placeholder";
  }

  return {
    id: v2.tokenId,
    token_id: v2.tokenId,
    subdomain: v2.label,
    fqdn: v2.fullName,
    owner_wallet: ownerWallet,
    registration_price_flr: "0",
    registration_price_usd: (v2.registrationPriceUsdCents / 100).toFixed(2),
    registration_date: v2.registrationTime,
    expiration_date: v2.expiryTime,
    status,
    tier: "standard",
    dns_active: true,
    nft_status: nftStatus,
  };
}

interface UseMyDomainsResult {
  domains: Domain[];
  v2Domains: V2Domain[];
  isLoading: boolean;
  error: string | null;
  refresh: (force?: boolean) => void;
}

export function useMyDomains(
  wallet: string | undefined,
  getAuthCredentials: () => Promise<AuthCredentials>,
  refreshCredentials: () => Promise<AuthCredentials>
): UseMyDomainsResult {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [v2Domains, setV2Domains] = useState<V2Domain[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable refs to prevent re-render loops (same pattern as useMyTlds)
  const getAuthRef = useRef(getAuthCredentials);
  useEffect(() => { getAuthRef.current = getAuthCredentials; }, [getAuthCredentials]);

  const refreshAuthRef = useRef(refreshCredentials);
  useEffect(() => { refreshAuthRef.current = refreshCredentials; }, [refreshCredentials]);

  const fetchData = useCallback(async () => {
    if (!wallet) {
      setDomains([]);
      setV2Domains([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const credentials = await getAuthRef.current();
      const response = await getV2MyDomains(credentials);
      setV2Domains(response.domains);
      setDomains(response.domains.map((d) => adaptV2ToDomain(d, wallet)));
    } catch (err) {
      // 401 retry with refreshed credentials
      const isAxios401 =
        err &&
        typeof err === "object" &&
        "response" in err &&
        (err as { response?: { status?: number } }).response?.status === 401;

      if (isAxios401) {
        try {
          const freshCredentials = await refreshAuthRef.current();
          const response = await getV2MyDomains(freshCredentials);
          setV2Domains(response.domains);
          setDomains(response.domains.map((d) => adaptV2ToDomain(d, wallet)));
          return;
        } catch (retryErr) {
          setError(retryErr instanceof Error ? retryErr.message : "Failed to load domains");
          return;
        }
      }

      console.error("Failed to fetch V2 domains:", err);
      setError(err instanceof Error ? err.message : "Failed to load domains");
    } finally {
      setIsLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    domains,
    v2Domains,
    isLoading,
    error,
    refresh: fetchData,
  };
}
