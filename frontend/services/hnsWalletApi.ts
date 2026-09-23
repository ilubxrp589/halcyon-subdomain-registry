import axios from "axios";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v2/hns-wallet";

// If using the Next.js proxy (/api/proxy), route through v2/hns-wallet prefix
// If using direct backend URL, ensure it ends with /api/v2/hns-wallet
const baseURL = API_URL.endsWith("/api/proxy")
  ? `${API_URL}/v2/hns-wallet`
  : API_URL.replace(/\/api\/v[12]$/, "/api/v2/hns-wallet");

const hnsApi = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

// ---- Types ----

export interface HnsWalletInfo {
  success: boolean;
  walletId: string;
  address: string;
  balance: { confirmed: number; unconfirmed: number };
  txCount: number;
  nameCount?: number;
  isNew: boolean;
  error?: string;
}

export interface OwnedName {
  name: string;
  state: string;
  height: number;
  renewal: number;
  transfer: number;
}

export interface AuctionEntry {
  name: string;
  state: string;
  height: number;
  renewal: number;
}

export interface HistoryTx {
  hash: string;
  height: number;
  time: number;
  confirmations: number;
  inputs: number;
  outputs: number;
}

export interface SwapRate {
  success: boolean;
  hnsUsd: number;
  flrUsd: number;
  hnsPerFlr: number;
  flrPerHns: number;
  feePct: number;
}

export interface SwapQuote {
  success: boolean;
  quoteId: string;
  direction: "buy_hns" | "sell_hns";
  hnsAmount: number;
  flrAmount: number;
  hnsUsdRate: number;
  flrUsdRate: number;
  feePct: number;
  expiresAt: number;
}

export interface SwapRecord {
  id: number;
  direction: string;
  hnsAmount: number;
  flrAmount: string;
  hnsUsdRate: number;
  flrUsdRate: number;
  feePct: number;
  status: string;
  flrTxHash: string | null;
  hnsTxHash: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface AuthCreds {
  wallet: string;
  signature: string;
  nonce: string;
}

// ---- Helpers ----

function withAuth(creds: AuthCreds, extra: Record<string, unknown> = {}) {
  return { ...creds, ...extra };
}

// ---- Wallet Endpoints ----

export async function getWalletInfo(creds: AuthCreds): Promise<HnsWalletInfo> {
  const { data } = await hnsApi.post("/info", withAuth(creds));
  return data;
}

export async function getOwnedNames(
  creds: AuthCreds
): Promise<{ success: boolean; names: OwnedName[] }> {
  const { data } = await hnsApi.post("/names", withAuth(creds));
  return data;
}

export async function getAuctions(
  creds: AuthCreds
): Promise<{ success: boolean; auctions: AuctionEntry[] }> {
  const { data } = await hnsApi.post("/auctions", withAuth(creds));
  return data;
}

export async function getHistory(
  creds: AuthCreds,
  limit = 50
): Promise<{ success: boolean; history: HistoryTx[] }> {
  const { data } = await hnsApi.post("/history", withAuth(creds, { limit }));
  return data;
}

export async function getReceiveAddress(
  creds: AuthCreds
): Promise<{ success: boolean; address: string }> {
  const { data } = await hnsApi.post("/address", withAuth(creds));
  return data;
}

export async function exportWallet(
  creds: AuthCreds
): Promise<{
  success: boolean;
  walletId?: string;
  mnemonic?: string | null;
  masterKey?: string | null;
  error?: string;
}> {
  const { data } = await hnsApi.post("/export", withAuth(creds));
  return data;
}

// ---- Auction Endpoints ----

export async function openAuction(
  creds: AuthCreds,
  name: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const { data } = await hnsApi.post(
    "/auction/open",
    withAuth(creds, { name })
  );
  return data;
}

export async function placeBid(
  creds: AuthCreds,
  name: string,
  bid: number,
  lockup: number
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const { data } = await hnsApi.post(
    "/auction/bid",
    withAuth(creds, { name, bid, lockup })
  );
  return data;
}

export async function revealBid(
  creds: AuthCreds,
  name: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const { data } = await hnsApi.post(
    "/auction/reveal",
    withAuth(creds, { name })
  );
  return data;
}

export async function redeemBid(
  creds: AuthCreds,
  name: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const { data } = await hnsApi.post(
    "/auction/redeem",
    withAuth(creds, { name })
  );
  return data;
}

export async function finalizeAuction(
  creds: AuthCreds,
  name: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const { data } = await hnsApi.post(
    "/auction/finalize",
    withAuth(creds, { name })
  );
  return data;
}

// ---- Name Management ----

export async function updateDnsRecords(
  creds: AuthCreds,
  name: string,
  records: unknown[]
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const { data } = await hnsApi.post(
    "/dns/update",
    withAuth(creds, { name, records })
  );
  return data;
}

export async function setFlareAddress(
  creds: AuthCreds,
  name: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const { data } = await hnsApi.post(
    "/dns/set-flare",
    withAuth(creds, { name })
  );
  return data;
}

export async function transferName(
  creds: AuthCreds,
  name: string,
  toAddress: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const { data } = await hnsApi.post(
    "/transfer",
    withAuth(creds, { name, toAddress })
  );
  return data;
}

export async function renewName(
  creds: AuthCreds,
  name: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const { data } = await hnsApi.post("/renew", withAuth(creds, { name }));
  return data;
}

export async function sendHns(
  creds: AuthCreds,
  address: string,
  amount: number
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const { data } = await hnsApi.post(
    "/send",
    withAuth(creds, { address, amount })
  );
  return data;
}

// ---- Batch Operations (hsd-004) ----

export interface BatchResult {
  name: string;
  success: boolean;
  txHash?: string;
  error?: string;
}

export async function batchRenew(
  creds: AuthCreds,
  names: string[]
): Promise<{ success: boolean; results: BatchResult[] }> {
  const { data } = await hnsApi.post("/batch/renew", withAuth(creds, { names }));
  return data;
}

export async function batchFinalize(
  creds: AuthCreds,
  names: string[]
): Promise<{ success: boolean; results: BatchResult[] }> {
  const { data } = await hnsApi.post("/batch/finalize", withAuth(creds, { names }));
  return data;
}

export async function batchReveal(
  creds: AuthCreds,
  names: string[]
): Promise<{ success: boolean; results: BatchResult[] }> {
  const { data } = await hnsApi.post("/batch/reveal", withAuth(creds, { names }));
  return data;
}

// ---- Name State (hsd-006) ----

export interface NameState {
  name: string;
  state: string;
  phase: string;
  height: number;
  renewal: number;
  transfer: number;
  blocksRemaining: number;
  timeRemainingMs: number;
  timeRemainingHuman: string;
  nextAction: string;
  actionUrgency: string;
  renewalHeight: number;
  expiryHeight: number;
}

export async function getNameState(
  creds: AuthCreds,
  name: string
): Promise<{ success: boolean } & Partial<NameState>> {
  const { data } = await hnsApi.post("/name-state", withAuth(creds, { name }));
  return data;
}

export async function getNamesDetailed(
  creds: AuthCreds
): Promise<{ success: boolean; names: NameState[] }> {
  const { data } = await hnsApi.post("/names-detailed", withAuth(creds));
  return data;
}

// ---- Node Info (hsd-016) ----

export interface NodeInfo {
  success: boolean;
  chain: { height: number; progress: number; tip: string };
  network: string;
  peers: { total: number; list: { addr: string; version: string; height: number }[] };
  mempool: { size: number; bytes: number };
  version: string;
  uptime: number;
}

export async function getNodeInfo(
  creds: AuthCreds
): Promise<NodeInfo> {
  const { data } = await hnsApi.post("/node-info", withAuth(creds));
  return data;
}

// ---- Renewal Monitoring (hsd-019) ----

export interface ExpiringName {
  name: string;
  expiryHeight: number;
  blocksLeft: number;
  daysLeft: number;
  urgency: string;
}

export async function getExpiringNames(
  creds: AuthCreds
): Promise<{ success: boolean; expiring: ExpiringName[] }> {
  const { data } = await hnsApi.post("/expiring", withAuth(creds));
  return data;
}

// ---- Lookup (public, no auth) ----

export interface LookupResult {
  success: boolean;
  name: string;
  available: boolean;
  state: string;
  phase: string;
  owner?: string;
  blocksRemaining?: number;
  timeRemainingMs?: number;
  timeRemainingHuman?: string;
  nextAction?: string;
  actionUrgency?: string;
  records?: unknown[];
  stats?: { height: number; network: string };
  error?: string;
}

export async function lookupName(name: string): Promise<LookupResult> {
  const { data } = await hnsApi.get(`/lookup/${encodeURIComponent(name)}`);
  return data;
}

// ---- Watchlist ----

export interface WatchlistEntry {
  id: number;
  name: string;
  note: string | null;
  createdAt: string;
  state?: string;
  phase?: string;
  available?: boolean;
  timeRemainingHuman?: string;
  nextAction?: string;
}

export async function addToWatchlist(
  creds: AuthCreds,
  name: string,
  note?: string
): Promise<{ success: boolean; error?: string }> {
  const { data } = await hnsApi.post("/watchlist/add", withAuth(creds, { name, note }));
  return data;
}

export async function removeFromWatchlist(
  creds: AuthCreds,
  name: string
): Promise<{ success: boolean; error?: string }> {
  const { data } = await hnsApi.post("/watchlist/remove", withAuth(creds, { name }));
  return data;
}

export async function getWatchlist(
  creds: AuthCreds
): Promise<{ success: boolean; entries: WatchlistEntry[] }> {
  const { data } = await hnsApi.post("/watchlist/list", withAuth(creds));
  return data;
}

// ---- Swap Endpoints ----

export async function getSwapRate(): Promise<SwapRate> {
  const { data } = await hnsApi.get("/swap/rate");
  return data;
}

export async function getSwapQuote(
  creds: AuthCreds,
  direction: "buy_hns" | "sell_hns",
  amount: number
): Promise<SwapQuote> {
  const { data } = await hnsApi.post(
    "/swap/quote",
    withAuth(creds, { direction, amount })
  );
  return data;
}

export async function executeSwap(
  creds: AuthCreds,
  quoteId: string,
  flrTxHash?: string
): Promise<{
  success: boolean;
  hnsTxHash?: string;
  flrTxHash?: string;
  hnsAmount?: number;
  flrAmount?: number;
  error?: string;
}> {
  const { data } = await hnsApi.post(
    "/swap/execute",
    withAuth(creds, { quoteId, flrTxHash })
  );
  return data;
}

export async function getSwapHistory(
  creds: AuthCreds,
  limit = 20
): Promise<{ success: boolean; swaps: SwapRecord[] }> {
  const { data } = await hnsApi.post(
    "/swap/history",
    withAuth(creds, { limit })
  );
  return data;
}
