/**
 * Flare Network contract configuration.
 * Ported from Bifrost Clone config.ts + HSR web3modal.tsx constants.
 */

export type NetworkName = "mainnet" | "coston2";

export interface FlareNetworkConfig {
  name: NetworkName;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  currencySymbol: string;
  wrappedSymbol: string;
  contracts: {
    wflr: string;
    flareContractRegistry: string;
  };
}

export const FLARE_NETWORKS: Record<NetworkName, FlareNetworkConfig> = {
  coston2: {
    name: "coston2",
    chainId: 114,
    rpcUrl: "https://coston2-api.flare.network/ext/C/rpc",
    explorerUrl: "https://coston2-explorer.flare.network",
    currencySymbol: "C2FLR",
    wrappedSymbol: "WC2FLR",
    contracts: {
      wflr: "0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273",
      flareContractRegistry: "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019",
    },
  },
  mainnet: {
    name: "mainnet",
    chainId: 14,
    rpcUrl: "https://flare-api.flare.network/ext/C/rpc",
    explorerUrl: "https://flare-explorer.flare.network",
    currencySymbol: "FLR",
    wrappedSymbol: "WFLR",
    contracts: {
      wflr: "0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d",
      flareContractRegistry: "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019",
    },
  },
};

/** Gas limits for Flare operations (in gas units) */
export const GAS_LIMITS = {
  wrap: 200_000n,
  unwrap: 200_000n,
  delegate: 300_000n,
  undelegateAll: 200_000n,
  claimRewards: 300_000n,
} as const;

/** Get the active network config based on connected chain ID */
export function getFlareNetwork(chainId: number | undefined): FlareNetworkConfig {
  if (chainId === 14) return FLARE_NETWORKS.mainnet;
  return FLARE_NETWORKS.coston2;
}

/** Build an explorer TX link */
export function getExplorerTxUrl(chainId: number | undefined, txHash: string): string {
  const network = getFlareNetwork(chainId);
  return `${network.explorerUrl}/tx/${txHash}`;
}

/** Build an explorer address link */
export function getExplorerAddressUrl(chainId: number | undefined, address: string): string {
  const network = getFlareNetwork(chainId);
  return `${network.explorerUrl}/address/${address}`;
}
