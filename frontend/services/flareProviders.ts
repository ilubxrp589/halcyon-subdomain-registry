/**
 * FTSO provider list fetching from Flare explorer API.
 */

export interface FtsoProvider {
  address: string;
  name: string;
  /** Current vote power in wei */
  votePower: string;
  /** Fee in basis points (0-10000) */
  fee: number;
  /** URL/website if available */
  url?: string;
}

const EXPLORER_API: Record<number, string> = {
  14: "https://flare-explorer.flare.network/api",
  114: "https://coston2-explorer.flare.network/api",
};

// Cache providers for 5 minutes
let cachedProviders: FtsoProvider[] = [];
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Fetch FTSO data providers from the Flare explorer API.
 * Falls back to a well-known testnet list if the API is unavailable.
 */
export async function fetchFtsoProviders(chainId: number): Promise<FtsoProvider[]> {
  const now = Date.now();
  if (cachedProviders.length > 0 && now - cacheTimestamp < CACHE_TTL) {
    return cachedProviders;
  }

  const baseUrl = EXPLORER_API[chainId] || EXPLORER_API[114];

  try {
    // Try the Flare explorer API for data providers
    const res = await fetch(
      `${baseUrl}?module=stats&action=ftso_data_providers`,
      { signal: AbortSignal.timeout(10_000) }
    );

    if (res.ok) {
      const data = await res.json();
      if (data.result && Array.isArray(data.result)) {
        cachedProviders = data.result.map((p: Record<string, string | number>) => ({
          address: String(p.address || ""),
          name: String(p.name || truncateAddr(String(p.address || ""))),
          votePower: String(p.votePower || "0"),
          fee: Number(p.fee || 0),
          url: p.url ? String(p.url) : undefined,
        }));
        cacheTimestamp = now;
        return cachedProviders;
      }
    }
  } catch {
    // Fall through to fallback
  }

  // Fallback: well-known Coston2 test providers
  if (chainId === 114) {
    cachedProviders = COSTON2_KNOWN_PROVIDERS;
    cacheTimestamp = now;
    return cachedProviders;
  }

  return [];
}

function truncateAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// Known testnet providers for Coston2 (always available for delegation testing)
const COSTON2_KNOWN_PROVIDERS: FtsoProvider[] = [
  {
    address: "0x69141E890F3a79cd2CFf552c0B71508bE23712cB",
    name: "Flare Foundation",
    votePower: "0",
    fee: 0,
  },
  {
    address: "0x9A46864A3b0a7805B266C445289C3fAD1E48f18e",
    name: "A-FTSO",
    votePower: "0",
    fee: 500,
  },
  {
    address: "0x3a6e101103ec3d9267D9D0b0f5f6C4f3d235e4C6",
    name: "FTSO EU",
    votePower: "0",
    fee: 200,
  },
];
