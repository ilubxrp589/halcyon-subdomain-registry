"use client";

import { useState, useEffect, useMemo } from "react";
import { useWeb3ModalAccount } from "@web3modal/ethers/react";
import { fetchFtsoProviders, type FtsoProvider } from "@/services/flareProviders";

export function useFtsoProviders() {
  const { chainId } = useWeb3ModalAccount();
  const [providers, setProviders] = useState<FtsoProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchFtsoProviders(chainId ?? 114)
      .then((result) => {
        if (!cancelled) setProviders(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load providers");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [chainId]);

  const filtered = useMemo(() => {
    if (!search) return providers;
    const q = search.toLowerCase();
    return providers.filter(
      (p) => p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q)
    );
  }, [providers, search]);

  return { providers: filtered, allProviders: providers, loading, error, search, setSearch };
}
