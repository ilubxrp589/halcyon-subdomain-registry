const API_V2 = `${process.env.NEXT_PUBLIC_API_URL || "/api/proxy"}/v2/indexer`;

export interface IndexedDomain {
  id: number;
  name: string;
  ip: string;
  status: string;
  http_status: number | null;
  https: boolean;
  title: string | null;
  description: string | null;
  classification: string;
  class_reason: string | null;
  content_type: string | null;
  response_time_ms: number | null;
  redirect: string | null;
  first_seen: string;
  last_checked: string;
  last_alive: string | null;
  screenshot_path: string | null;
  cluster_size: number | null;
  hosting_provider: string | null;
}

export interface IndexedDomainDetail extends IndexedDomain {
  keywords: string | null;
  body_text: string | null;
  ip_cluster_id: number | null;
}

export interface IndexerStats {
  domains: {
    total: string;
    real: string;
    parking: string;
    empty: string;
    error: string;
    alive: string;
    https: string;
    with_title: string;
    last_scan: string;
    unique_ips: string;
  };
  ip_clusters: {
    total: string;
    domains_in_clusters: string;
  };
}

export interface IndexerPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface DomainsResponse {
  data: IndexedDomain[];
  pagination: IndexerPagination;
}

export interface SearchResponse {
  query: string;
  data: (IndexedDomain & { rank: number })[];
  pagination: IndexerPagination;
}

export interface IpCluster {
  id: number;
  ip: string;
  domain_count: number;
  hosting_provider: string | null;
  sample_title: string | null;
  sample_class: string | null;
  sample_screenshot: string | null;
}

export type IndexerSort = "name" | "newest" | "checked" | "response_time";
export type Classification = "real" | "parking" | "empty" | "error";

export async function getIndexerStats(): Promise<IndexerStats> {
  const res = await fetch(`${API_V2}/stats`);
  if (!res.ok) throw new Error(`Indexer stats failed: ${res.status}`);
  return res.json();
}

export async function getIndexedDomains(
  opts: {
    page?: number;
    limit?: number;
    classification?: Classification;
    status?: string;
    ip?: string;
    https?: boolean;
    has_title?: boolean;
    letter?: string;
    show_clusters?: boolean;
    sort?: IndexerSort;
  } = {}
): Promise<DomainsResponse> {
  const params = new URLSearchParams();
  if (opts.page) params.set("page", String(opts.page));
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.classification) params.set("classification", opts.classification);
  if (opts.status) params.set("status", opts.status);
  if (opts.ip) params.set("ip", opts.ip);
  if (opts.https) params.set("https", "true");
  if (opts.has_title) params.set("has_title", "true");
  if (opts.letter) params.set("letter", opts.letter);
  if (opts.show_clusters) params.set("show_clusters", "true");
  if (opts.sort) params.set("sort", opts.sort);

  const res = await fetch(`${API_V2}/domains?${params}`);
  if (!res.ok) throw new Error(`Indexer domains failed: ${res.status}`);
  return res.json();
}

export async function getIndexedDomain(name: string): Promise<IndexedDomainDetail> {
  const res = await fetch(`${API_V2}/domain/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`Indexer domain failed: ${res.status}`);
  return res.json();
}

export async function searchIndexedDomains(
  query: string,
  opts: {
    page?: number;
    limit?: number;
    classification?: Classification;
    status?: string;
    https?: boolean;
    has_title?: boolean;
    show_clusters?: boolean;
  } = {}
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query });
  if (opts.page) params.set("page", String(opts.page));
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.classification) params.set("classification", opts.classification);
  if (opts.status) params.set("status", opts.status);
  if (opts.https) params.set("https", "true");
  if (opts.has_title) params.set("has_title", "true");
  if (opts.show_clusters) params.set("show_clusters", "true");

  const res = await fetch(`${API_V2}/search?${params}`);
  if (!res.ok) throw new Error(`Indexer search failed: ${res.status}`);
  return res.json();
}

export async function getIndexerClusters(): Promise<{ clusters: IpCluster[] }> {
  const res = await fetch(`${API_V2}/clusters`);
  if (!res.ok) throw new Error(`Indexer clusters failed: ${res.status}`);
  return res.json();
}
