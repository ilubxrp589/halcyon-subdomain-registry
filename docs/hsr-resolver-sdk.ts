/**
 * HSR Resolver SDK
 * Minimal TypeScript SDK for integrating HSR address resolution into wallets
 *
 * Usage:
 *   import { HSRResolver } from "./hsr-resolver-sdk";
 *   const resolver = new HSRResolver();
 *   const address = await resolver.resolve("alice.cryptofans");
 */

import { ethers, Contract, JsonRpcProvider } from "ethers";

// Contract addresses
const CONTRACTS = {
  coston2: {
    chainId: 114,
    rpc: "https://coston2-api.flare.network/ext/C/rpc",
    resolver: "0x7C0eA7094Be2caCB238D042b386B11ec24892Fb1",
    registry: "0x6fF3B2dC6D0F03053D330714427eC7A6555f93fa",
  },
  flare: {
    chainId: 14,
    rpc: "https://flare-api.flare.network/ext/C/rpc",
    resolver: "", // Coming soon
    registry: "", // Coming soon
  },
} as const;

// Minimal ABIs
const RESOLVER_ABI = [
  "function resolveAddress(string calldata fqdn) external view returns (address)",
  "function addr(bytes32 node) external view returns (address)",
  "function addr(bytes32 node, uint256 coinType) external view returns (bytes)",
  "function text(bytes32 node, string calldata key) external view returns (string)",
  "function hasAddress(bytes32 node) external view returns (bool)",
];

const REGISTRY_ABI = [
  "function getRecordByFQDN(string calldata fqdn) external view returns (address owner, address resolver, uint256 tokenId)",
  "function computeNamehash(string calldata fqdn) external pure returns (bytes32)",
];

// Coin types (EIP-2304)
export const COIN_TYPES = {
  FLR: 2147483662n, // 0x80000000 | 14
  ETH: 60n,
  BTC: 0n,
} as const;

export interface ResolveResult {
  address: string;
  owner: string;
  tokenId: bigint;
  source: "resolver" | "owner";
}

export interface DomainInfo {
  fqdn: string;
  owner: string;
  resolver: string;
  tokenId: bigint;
  hasAddress: boolean;
}

export class HSRResolver {
  private provider: JsonRpcProvider;
  private resolver: Contract;
  private registry: Contract;
  private network: "coston2" | "flare";

  constructor(network: "coston2" | "flare" = "coston2") {
    this.network = network;
    const config = CONTRACTS[network];

    if (!config.resolver) {
      throw new Error(`HSR not yet deployed on ${network}`);
    }

    this.provider = new JsonRpcProvider(config.rpc);
    this.resolver = new Contract(config.resolver, RESOLVER_ABI, this.provider);
    this.registry = new Contract(config.registry, REGISTRY_ABI, this.provider);
  }

  /**
   * Resolve a domain to a wallet address
   * @param fqdn - Fully qualified domain name (e.g., "alice.cryptofans")
   * @returns The resolved wallet address
   * @throws Error if domain not found
   */
  async resolve(fqdn: string): Promise<string> {
    const normalized = fqdn.toLowerCase().trim();
    const address = await this.resolver.resolveAddress(normalized);

    if (address === ethers.ZeroAddress) {
      throw new Error(`Domain not found: ${fqdn}`);
    }

    return address;
  }

  /**
   * Resolve with full details
   */
  async resolveWithDetails(fqdn: string): Promise<ResolveResult> {
    const normalized = fqdn.toLowerCase().trim();

    const [address, record] = await Promise.all([
      this.resolver.resolveAddress(normalized),
      this.registry.getRecordByFQDN(normalized),
    ]);

    const [owner, , tokenId] = record;

    if (owner === ethers.ZeroAddress) {
      throw new Error(`Domain not found: ${fqdn}`);
    }

    return {
      address: address === ethers.ZeroAddress ? owner : address,
      owner,
      tokenId,
      source: address === ethers.ZeroAddress ? "owner" : "resolver",
    };
  }

  /**
   * Get domain info without resolving address
   */
  async getDomainInfo(fqdn: string): Promise<DomainInfo | null> {
    const normalized = fqdn.toLowerCase().trim();

    try {
      const [owner, resolver, tokenId] = await this.registry.getRecordByFQDN(normalized);

      if (owner === ethers.ZeroAddress) {
        return null;
      }

      const namehash = await this.registry.computeNamehash(normalized);
      const hasAddress = await this.resolver.hasAddress(namehash);

      return {
        fqdn: normalized,
        owner,
        resolver,
        tokenId,
        hasAddress,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if a domain exists
   */
  async exists(fqdn: string): Promise<boolean> {
    const info = await this.getDomainInfo(fqdn);
    return info !== null;
  }

  /**
   * Get address for a specific chain (EIP-2304)
   */
  async resolveForChain(fqdn: string, coinType: bigint): Promise<string> {
    const normalized = fqdn.toLowerCase().trim();
    const namehash = await this.registry.computeNamehash(normalized);
    const addressBytes = await this.resolver["addr(bytes32,uint256)"](namehash, coinType);

    if (!addressBytes || addressBytes === "0x") {
      throw new Error(`No address set for coin type ${coinType}`);
    }

    // For EVM chains, convert bytes to address
    if (coinType === COIN_TYPES.FLR || coinType === COIN_TYPES.ETH) {
      return ethers.getAddress("0x" + addressBytes.slice(-40));
    }

    return addressBytes;
  }

  /**
   * Get a text record
   */
  async getText(fqdn: string, key: string): Promise<string> {
    const namehash = await this.registry.computeNamehash(fqdn.toLowerCase());
    return this.resolver.text(namehash, key);
  }

  /**
   * Batch resolve multiple domains
   */
  async batchResolve(fqdns: string[]): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>();

    const promises = fqdns.map(async (fqdn) => {
      try {
        const address = await this.resolve(fqdn);
        results.set(fqdn, address);
      } catch {
        results.set(fqdn, null);
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Compute namehash for a domain (client-side)
   */
  static computeNamehash(fqdn: string): string {
    const labels = fqdn.toLowerCase().split(".").reverse();
    let node = "0x" + "00".repeat(32);

    for (const label of labels) {
      const labelHash = ethers.keccak256(ethers.toUtf8Bytes(label));
      node = ethers.keccak256(ethers.concat([node, labelHash]));
    }

    return node;
  }

  /**
   * Check if a string looks like an HSR domain
   */
  static isHSRDomain(input: string): boolean {
    if (!input || input.startsWith("0x")) return false;
    const parts = input.split(".");
    return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
  }
}

// Export singleton for convenience
export const hsrResolver = new HSRResolver("coston2");

// Default export
export default HSRResolver;
