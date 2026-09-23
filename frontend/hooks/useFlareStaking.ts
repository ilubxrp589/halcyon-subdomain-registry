"use client";

import { useState, useEffect, useCallback } from "react";
import { useWeb3ModalAccount } from "@web3modal/ethers/react";
import { getFlareNetwork } from "@/lib/flareContracts";

export interface ValidatorInfo {
  nodeId: string;
  totalStake: string;
  isActive: boolean;
  fee: number;
  delegators?: number;
}

export interface StakingState {
  validators: ValidatorInfo[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const EXPLORER_API: Record<number, string> = {
  14: "https://flare-explorer.flare.network",
  114: "https://coston2-explorer.flare.network",
};

export function useFlareStaking(): StakingState {
  const { chainId } = useWeb3ModalAccount();
  const [validators, setValidators] = useState<ValidatorInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchValidators = useCallback(async () => {
    setLoading(true);
    setError(null);
    const baseUrl = EXPLORER_API[chainId ?? 114] || EXPLORER_API[114];

    try {
      const res = await fetch(`${baseUrl}/api/v2/validators`, {
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.items && Array.isArray(data.items)) {
          setValidators(
            data.items.map((item: Record<string, unknown>) => ({
              nodeId: (item.address as { hash: string })?.hash || String(item.address),
              totalStake: String(item.stake_amount || "0"),
              isActive: item.state === "active",
              fee: 0,
              delegators: Number(item.delegators_count || 0),
            }))
          );
          return;
        }
      }

      // Fallback for testnet
      setValidators(TESTNET_VALIDATORS);
    } catch {
      setValidators(TESTNET_VALIDATORS);
    } finally {
      setLoading(false);
    }
  }, [chainId]);

  useEffect(() => {
    fetchValidators();
  }, [fetchValidators]);

  return { validators, loading, error, refresh: fetchValidators };
}

const TESTNET_VALIDATORS: ValidatorInfo[] = [
  { nodeId: "NodeID-P-coston2-1", totalStake: "1000000", isActive: true, fee: 0, delegators: 15 },
  { nodeId: "NodeID-P-coston2-2", totalStake: "750000", isActive: true, fee: 10, delegators: 8 },
  { nodeId: "NodeID-P-coston2-3", totalStake: "500000", isActive: true, fee: 5, delegators: 12 },
];
