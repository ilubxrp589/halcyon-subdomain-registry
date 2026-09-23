import axios from "axios";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL || "/api/proxy"}/v2/auction-house`;

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

// ---- Types ----

export interface Auction {
  name: string;
  state: string;
  openHeight: number;
  bidCount: number;
  highestLockup: number;
  highestLockupHns: number;
  revealCount: number;
  highestReveal: number;
  highestRevealHns: number;
  winnerAddress: string | null;
  biddingEndsHeight: number | null;
  revealEndsHeight: number | null;
  currentHeight: number;
  firstSeenAt: string;
  updatedAt: string;
}

export interface BidEntry {
  id: number;
  name: string;
  txHash: string;
  blockHeight: number;
  covenantType: string;
  lockupValue: number | null;
  lockupHns: number | null;
  revealValue: number | null;
  revealHns: number | null;
  address: string;
  createdAt: string;
}

export interface MarketplaceListing {
  id: number;
  name: string;
  sellerAddress: string;
  priceHns: number;
  description: string | null;
  status: string;
  buyerAddress: string | null;
  transferTxHash: string | null;
  listedAt: string;
  soldAt: string | null;
}

export interface AuctionStats {
  activeCount: number;
  opens24h: number;
  totalBids: number;
  closedCount: number;
  listingCount: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface AuctionDetail {
  name: string;
  auction: Auction | null;
  liveState: {
    state: string;
    height: number;
    renewal: number;
    transfer: number;
    revoked: number;
    claimed: number;
    weak: boolean;
    stats: Record<string, unknown>;
  } | null;
  records: unknown[];
  listing: MarketplaceListing | null;
  bids: BidEntry[];
}

export interface AuthCredentials {
  wallet: string;
  signature: string;
  nonce: string;
}

// ---- Active Auctions Params ----

export type AuctionSort = "ending-soon" | "most-bids" | "highest-value" | "newest";
export type AuctionState = "OPENING" | "BIDDING" | "REVEAL" | "";

export interface ActiveAuctionsParams {
  state?: AuctionState;
  sort?: AuctionSort;
  page?: number;
  limit?: number;
  q?: string;
  contested?: string;
  minLength?: number;
  maxLength?: number;
  minBid?: number;
  maxBid?: number;
}

export interface MarketplaceParams {
  sort?: "newest" | "price-low" | "price-high";
  page?: number;
  limit?: number;
  q?: string;
  minLength?: number;
  maxLength?: number;
  minPrice?: number;
  maxPrice?: number;
}

export interface NameAvailability {
  name: string;
  status: "available" | "auction" | "registered";
  auction: Auction | null;
  listing: MarketplaceListing | null;
  owner: string | null;
  info: { state: string; height: number; renewal?: number; value?: number; highest?: number } | null;
}

export interface HistoryEntry {
  eventType: string;
  name: string;
  detail: string;
  amountHns: number;
  txHash: string | null;
  blockHeight: number | null;
  listingId: number | null;
  createdAt: string;
}

// ---- Public Endpoints ----

export async function getActiveAuctions(
  params: ActiveAuctionsParams = {}
): Promise<{ auctions: Auction[]; pagination: Pagination }> {
  const { data } = await api.get("/active", { params });
  return data;
}

export async function getTrending(
  limit = 20
): Promise<Auction[]> {
  const { data } = await api.get("/trending", { params: { limit } });
  return data.auctions;
}

export async function getRecentOpens(
  limit = 20
): Promise<Auction[]> {
  const { data } = await api.get("/recent-opens", { params: { limit } });
  return data.auctions;
}

export async function getRecentSales(
  limit = 20
): Promise<Auction[]> {
  const { data } = await api.get("/recent-sales", { params: { limit } });
  return data.auctions;
}

export async function getNameDetail(
  name: string
): Promise<AuctionDetail> {
  const { data } = await api.get(`/name/${encodeURIComponent(name)}`);
  return data;
}

export async function getNameBids(
  name: string,
  limit = 50
): Promise<BidEntry[]> {
  const { data } = await api.get(`/name/${encodeURIComponent(name)}/bids`, {
    params: { limit },
  });
  return data.bids;
}

export async function getAuctionStats(): Promise<AuctionStats> {
  const { data } = await api.get("/stats");
  return data;
}

export async function getMarketplaceListings(
  params: MarketplaceParams = {}
): Promise<{ listings: MarketplaceListing[]; pagination: Pagination }> {
  const { data } = await api.get("/marketplace", { params });
  return data;
}

export async function getRecentMarketplaceSales(
  limit = 10
): Promise<MarketplaceListing[]> {
  const { data } = await api.get("/marketplace/sales", { params: { limit } });
  return data.sales;
}

// ---- Analytics Types ----

export interface AnalyticsOverview {
  activity: { date: string; opens: number; bids: number; closes: number }[];
  states: { state: string; count: number }[];
  topContested: { name: string; state: string; bidCount: number; highestLockupHns: number; revealCount: number }[];
  bidValueDistribution: { range: string; count: number }[];
  kpis: { avgBids: number; totalLockupHns: number; uniqueBidders: number; avgLockupHns: number };
}

export interface AnalyticsParticipants {
  leaderboard: { address: string; bidCount: number; namesBidOn: number; totalLockupHns: number }[];
  nameLengthVsBids: { length: number; auctionCount: number; avgBids: number; avgLockupHns: number }[];
  revealRate: { totalBids: number; totalReveals: number; rate: number };
}

export interface AnalyticsMarketplace {
  priceTrends: { date: string; avgPrice: number; listingCount: number; avgSalePrice: number; saleCount: number }[];
  funnel: { totalAuctions: number; withBids: number; withBidsRate: number; withReveals: number; withRevealsRate: number; completed: number; completedRate: number };
}

// ---- Analytics Endpoints ----

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  const { data } = await api.get("/analytics/overview");
  return data;
}

export async function getAnalyticsParticipants(): Promise<AnalyticsParticipants> {
  const { data } = await api.get("/analytics/participants");
  return data;
}

export async function getAnalyticsMarketplace(): Promise<AnalyticsMarketplace> {
  const { data } = await api.get("/analytics/marketplace");
  return data;
}

// ---- Availability & History ----

export async function checkNameAvailability(
  name: string
): Promise<NameAvailability> {
  const { data } = await api.get(`/check/${encodeURIComponent(name)}`);
  return data;
}

export async function getActivityHistory(
  params: { address: string; page?: number; limit?: number; type?: string }
): Promise<{ history: HistoryEntry[]; pagination: Pagination }> {
  const { data } = await api.get("/history", { params });
  return data;
}

// ---- Authenticated Endpoints ----

export async function listForSale(
  creds: AuthCredentials,
  opts: { name: string; priceHns: number; description?: string }
): Promise<{ success: boolean; listingId?: number; error?: string }> {
  const { data } = await api.post("/marketplace/list", {
    ...creds,
    ...opts,
  });
  return data;
}

export async function buyListing(
  creds: AuthCredentials,
  opts: { listingId: number }
): Promise<{
  success: boolean;
  paymentTxHash?: string;
  transferTxHash?: string;
  note?: string;
  error?: string;
}> {
  const { data } = await api.post("/marketplace/buy", {
    ...creds,
    ...opts,
  });
  return data;
}

export async function delistName(
  creds: AuthCredentials,
  opts: { listingId: number }
): Promise<{ success: boolean; error?: string }> {
  const { data } = await api.post("/marketplace/delist", {
    ...creds,
    ...opts,
  });
  return data;
}

export async function updateListingPrice(
  creds: AuthCredentials,
  opts: { listingId: number; newPriceHns: number }
): Promise<{ success: boolean; oldPrice?: number; newPrice?: number; error?: string }> {
  const { data } = await api.post("/marketplace/update-price", {
    ...creds,
    ...opts,
  });
  return data;
}

// ---- Expiring Domains (ah-008) ----

export type ExpiryStatus = "expired" | "grace" | "expiring" | "all";
export type ExpirySort = "days-left" | "days-left-desc" | "name-asc" | "name-desc" | "value" | "length";

export interface ExpiringDomain {
  name: string;
  renewal: number;
  expiryHeight: number;
  blocksLeft: number;
  daysLeft: number;
  graceEndsHeight: number;
  graceDaysLeft: number;
  status: ExpiryStatus;
  state: string;
  owner: string | null;
  value: number;
  nameLength: number;
  highestBid: number;
  reAuction: {
    state: string;
    bidCount: number;
    highestLockup: number;
  } | null;
}

export interface ExpiringStats {
  total: number;
  expired: number;
  grace: number;
  expiring: number;
  withReAuction: number;
}

export interface ExpiringDomainsParams {
  page?: number;
  limit?: number;
  q?: string;
  sort?: ExpirySort;
  status?: ExpiryStatus;
  maxDays?: number;
  minLength?: number;
  maxLength?: number;
}

export async function getExpiringDomains(
  params: ExpiringDomainsParams = {}
): Promise<{ names: ExpiringDomain[]; stats: ExpiringStats; pagination: Pagination }> {
  const { data } = await api.get("/expiring", { params });
  return data;
}

// ---- Offer System (ah-009) ----

export interface Offer {
  id: number;
  name: string;
  listingId: number | null;
  offererAddress: string;
  offerHns: number;
  expiresAt: string;
  status: string;
  createdAt: string;
}

export async function createOffer(
  creds: AuthCredentials,
  opts: { name: string; listingId?: number; offerHns: number; expiresInHours?: number }
): Promise<{ success: boolean; offerId?: number; expiresAt?: string; error?: string }> {
  const { data } = await api.post("/marketplace/offer", { ...creds, ...opts });
  return data;
}

export async function getOffers(name: string): Promise<{ offers: Offer[] }> {
  const { data } = await api.get(`/marketplace/offers/${encodeURIComponent(name)}`);
  return data;
}

export async function cancelOffer(
  creds: AuthCredentials,
  opts: { offerId: number }
): Promise<{ success: boolean; error?: string }> {
  const { data } = await api.post("/marketplace/offer/cancel", { ...creds, ...opts });
  return data;
}

export async function acceptOffer(
  creds: AuthCredentials,
  opts: { offerId: number }
): Promise<{ success: boolean; note?: string; error?: string }> {
  const { data } = await api.post("/marketplace/offer/accept", { ...creds, ...opts });
  return data;
}

// ---- Domain Transfers (ah-011) ----

export async function getDepositAddress(
  creds: AuthCredentials
): Promise<{ success: boolean; address?: string; error?: string }> {
  const { data } = await api.post("/transfer/deposit-address", { ...creds });
  return data;
}

export async function transferNameOut(
  creds: AuthCredentials,
  opts: { name: string; toAddress: string }
): Promise<{ success: boolean; txHash?: string; note?: string; error?: string }> {
  const { data } = await api.post("/transfer/send", { ...creds, ...opts });
  return data;
}

// ---- Bulk Listing (ah-012) ----

export interface BulkListEntry {
  name: string;
  priceHns: number;
  description?: string;
}

export interface BulkListResult {
  success: boolean;
  total: number;
  listed: number;
  failed: number;
  results: { name: string; success: boolean; listingId?: number; error?: string }[];
  validationErrors?: { index: number; name: string; error: string }[];
}

export async function bulkListNames(
  creds: AuthCredentials,
  entries: BulkListEntry[]
): Promise<BulkListResult> {
  const { data } = await api.post("/marketplace/bulk-list", { ...creds, entries });
  return data;
}

// ---- Notifications (ah-013) ----

export interface Notification {
  id: number;
  name: string;
  eventType: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export async function getNotifications(
  creds: AuthCredentials,
  opts?: { unreadOnly?: boolean; limit?: number }
): Promise<{ notifications: Notification[]; unreadCount: number }> {
  const { data } = await api.post("/notifications/list", { ...creds, ...opts });
  return data;
}

export async function markNotificationsRead(
  creds: AuthCredentials,
  opts: { notificationId?: number; all?: boolean }
): Promise<{ success: boolean }> {
  const { data } = await api.post("/notifications/read", { ...creds, ...opts });
  return data;
}

export async function checkWatchlistNotifications(
  creds: AuthCredentials
): Promise<{ success: boolean; newNotifications: number }> {
  const { data } = await api.post("/notifications/check-watchlist", { ...creds });
  return data;
}
