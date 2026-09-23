"use client";

import { createWeb3Modal, defaultConfig, useWeb3Modal, useWeb3ModalAccount, useWeb3ModalProvider } from "@web3modal/ethers/react";
import { BrowserProvider, JsonRpcProvider, Network, formatEther } from "ethers";
import { ReactNode, useCallback, useEffect, useState } from "react";

// Re-export hooks from web3modal for convenience
export { useWeb3Modal, useWeb3ModalAccount, useWeb3ModalProvider };

// Hook to get the native currency symbol based on connected chain
export function useCurrencySymbol() {
  const { chainId } = useWeb3ModalAccount();

  // Coston2 testnet uses C2FLR, Flare mainnet uses FLR
  if (chainId === 114) return "C2FLR";
  if (chainId === 14) return "FLR";

  // Default to C2FLR for testnet development
  return "C2FLR";
}

// Hook to get wallet balance with auto-refresh
export function useWalletBalance() {
  const { address, isConnected } = useWeb3ModalAccount();
  const { walletProvider } = useWeb3ModalProvider();
  const [balance, setBalance] = useState<string>("0");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!address || !walletProvider || !isConnected) {
      setBalance("0");
      return;
    }

    const fetchBalance = async () => {
      try {
        setIsLoading(true);
        // Use RPC proxy to avoid CORS errors with direct Flare RPC calls
        const provider = getPublicProvider();
        const balanceWei = await provider.getBalance(address);
        setBalance(formatEther(balanceWei));
      } catch (error) {
        console.error("Failed to fetch balance:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 3600000); // Refresh every hour
    return () => clearInterval(interval);
  }, [address, walletProvider, isConnected]);

  return { balance, isLoading };
}

// Privacy mode hook with localStorage persistence
const PRIVACY_MODE_KEY = "halcyon_privacy_mode";

export function usePrivacyMode() {
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(PRIVACY_MODE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: init state from localStorage
    setIsPrivate(stored === "true");
  }, []);

  const togglePrivacy = useCallback(() => {
    setIsPrivate(prev => {
      const newValue = !prev;
      localStorage.setItem(PRIVACY_MODE_KEY, String(newValue));
      return newValue;
    });
  }, []);

  return { isPrivate, togglePrivacy };
}

// Get a public JSON-RPC provider for reading blockchain data without wallet connection
// Uses our /api/rpc proxy to avoid CORS issues when accessed from non-localhost origins
export function getPublicProvider(useMainnet = false) {
  const chainId = useMainnet ? 14 : 114;
  const network = Network.from(chainId);

  if (typeof window !== "undefined") {
    // Client-side: use our RPC proxy (avoids CORS on coston2-api.flare.network)
    // staticNetwork skips eth_chainId detection — avoids retry spam in console
    return new JsonRpcProvider(
      `${window.location.origin}/api/rpc?chainId=${chainId}`,
      network,
      { staticNetwork: network }
    );
  }
  // Server-side: direct RPC (no CORS restrictions)
  const rpcUrl = useMainnet
    ? "https://flare-api.flare.network/ext/C/rpc"
    : "https://coston2-api.flare.network/ext/C/rpc";
  return new JsonRpcProvider(rpcUrl, network, { staticNetwork: network });
}

// Get project ID from WalletConnect Cloud
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

// Track if modal has been created
let modalCreated = false;

function initModal() {
  if (modalCreated || !projectId || typeof window === "undefined") return;

  // Route web3modal internal RPC calls through our proxy to avoid CORS/429 on direct Flare RPC
  // Must be absolute HTTPS URL for WalletConnect transport compatibility
  const origin = window.location.origin;

  const coston2Testnet = {
    chainId: 114,
    name: "Coston2",
    currency: "C2FLR",
    explorerUrl: "https://coston2-explorer.flare.network",
    rpcUrl: `${origin}/api/rpc?chainId=114`,
  };

  const flareMainnet = {
    chainId: 14,
    name: "Flare",
    currency: "FLR",
    explorerUrl: "https://flare-explorer.flare.network",
    rpcUrl: `${origin}/api/rpc?chainId=14`,
  };

  // Create metadata with actual origin to avoid wallet security warnings
  const metadata = {
    name: "Halcyon Subdomain Registry",
    description: "Own your corner of the decentralized web",
    url: origin,
    icons: [`${origin}/icon.png`],
  };

  const ethersConfig = defaultConfig({
    metadata,
    enableEIP6963: true,
    enableInjected: true,
    enableCoinbase: false,
  });

  const modal = createWeb3Modal({
    ethersConfig,
    chains: [coston2Testnet, flareMainnet],
    defaultChain: coston2Testnet,
    projectId,
    enableAnalytics: false,
    enableOnramp: false,
    allowUnsupportedChain: true,
    themeMode: "dark",
    themeVariables: {
      "--w3m-accent": "#6366F1",
      "--w3m-border-radius-master": "2px",
    },
    featuredWalletIds: [
      "4457c130df49fb3cb1f8b99574b97b35208bd3d0d13b8d25d2b5884ed2cad13a",
    ],
  });

  modalCreated = true;
}

export function Web3ModalProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initModal();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: mark modal as ready after init
    setReady(true);
  }, []);

  // Don't render children until modal is initialized
  if (!ready) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return <>{children}</>;
}
