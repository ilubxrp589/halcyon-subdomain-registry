const API_V2 = `${process.env.NEXT_PUBLIC_API_URL || "/api/proxy"}/v2`;

export interface BrowseTld {
  label: string;
  displayName: string | null;
  tokenId: number;
  owner: string;
  isOfficial: boolean;
  sldCount: number;
  startingPriceUsdCents: number;
  startingPriceFlr: number | null;
  stakedAt: string | null;
  createdAt: string;
}

export interface BrowseResponse {
  tlds: BrowseTld[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface MultiSearchResult {
  tld: string;
  label: string;
  fullName: string;
  available: boolean;
  priceUsdCents: number | null;
  priceFlr: number | null;
  isOfficial: boolean;
  currentOwner: string | null;
}

export interface MultiSearchResponse {
  query: string;
  results: MultiSearchResult[];
  count: number;
  flrPriceUsd: number;
}

export interface TldPublicDetail {
  label: string;
  displayName: string | null;
  description: string | null;
  logoUrl: string | null;
  tokenId: number;
  namehash: string;
  owner: string;
  isOfficial: boolean;
  registrationEnabled: boolean;
  sldCount: number;
  stakedAt: string | null;
  createdAt: string;
  pricing: {
    lengthPricesUsdCents: number[];
    multiYearDiscounts: number[] | null;
  } | null;
  recentRegistrations: Array<{
    label: string;
    fullName: string;
    registeredAt: string;
  }>;
}

export interface PlatformStats {
  totalTlds: number;
  officialTlds: number;
  communityTlds: number;
  totalSlds: number;
  totalVolumeFlr: number;
  totalVolumeUsd: number;
  activeTldOwners: number;
}

export type BrowseFilter = "all" | "official" | "community";
export type BrowseSort = "popular" | "newest" | "cheapest" | "most-slds";

export async function browseTlds(
  filter: BrowseFilter = "all",
  sort: BrowseSort = "popular",
  search?: string,
  page = 1,
  limit = 24
): Promise<BrowseResponse> {
  const params = new URLSearchParams({
    filter,
    sort,
    page: String(page),
    limit: String(limit),
  });
  if (search) params.set("search", search);

  const res = await fetch(`${API_V2}/tlds/browse?${params}`);
  if (!res.ok) throw new Error(`Browse failed: ${res.status}`);
  return res.json();
}

export async function searchMultiTld(
  query: string,
  filter: BrowseFilter = "all",
  limit = 20
): Promise<MultiSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    filter,
    limit: String(limit),
  });

  const res = await fetch(`${API_V2}/search/multi?${params}`);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

export async function getTldPublic(label: string): Promise<TldPublicDetail> {
  const res = await fetch(`${API_V2}/tld/${encodeURIComponent(label)}/public`);
  if (!res.ok) throw new Error(`TLD detail failed: ${res.status}`);
  return res.json();
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const res = await fetch(`${API_V2}/stats/platform`);
  if (!res.ok) throw new Error(`Stats failed: ${res.status}`);
  return res.json();
}
