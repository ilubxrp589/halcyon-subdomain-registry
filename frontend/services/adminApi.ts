import axios from "axios";

// Connect directly to backend
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const api = axios.create({
  baseURL: API_URL,
});

// ============================================================
// TYPES
// ============================================================

export interface AuthCredentials {
  wallet: string;
  signature: string;
  nonce: string;
}

// For read-only operations with signature-based auth (no nonce consumed)
export interface ReadAuthCredentials {
  wallet: string;
  signature: string;
  timestamp: number;
}

// @deprecated - Use ReadAuthCredentials instead
export interface WalletOnly {
  wallet: string;
}

export interface ServiceStatus {
  status: "running" | "stopped" | "error";
  [key: string]: unknown;
}

export interface SystemStatus {
  timestamp: string;
  services: {
    watcher: ServiceStatus;
    priceSync: ServiceStatus;
    contractListener: ServiceStatus;
  };
  hns: {
    connected: boolean;
    synced: boolean;
    height: number;
  };
  ftsoPrice: {
    price: number;
    source: string;
  } | null;
  database: Record<string, number | { error: string }>;
}

export interface Domain {
  id: number;
  token_id: string;
  subdomain: string;
  fqdn: string;
  owner_wallet: string;
  status: string;
  tier: string;
  dns_active: boolean;
  created_at: string;
  tld_name: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TLD {
  id: number;
  name: string;
  is_active: boolean;
  registration_open: boolean;
  description: string | null;
  icon_url: string | null;
  // Pricing
  base_price_usd: number;
  price_multiplier_ultra: number;
  price_multiplier_premium: number;
  price_multiplier_standard_plus: number;
  renewal_price_multiplier: number;
  // Display
  display_order: number;
  featured: boolean;
  domain_count: number;
  created_at: string;
  updated_at: string;
}

export interface TLDCreateOptions {
  description?: string;
  icon_url?: string;
  base_price_usd?: number;
  price_multiplier_ultra?: number;
  price_multiplier_premium?: number;
  price_multiplier_standard_plus?: number;
  renewal_price_multiplier?: number;
  display_order?: number;
  featured?: boolean;
  registration_open?: boolean;
}

export interface TLDUpdateOptions extends TLDCreateOptions {
  is_active?: boolean;
}

export interface AuditLogEntry {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string;
  actor_wallet: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface ReservedWord {
  id: number;
  word: string;
  reason: string;
  added_by: string;
  created_at: string;
}

export interface PriceComparison {
  ftso: { price: number; source: string } | null;
  onChain: { price: number; lastUpdate: string };
  difference: number;
  threshold: number;
  needsSync: boolean;
}

export interface PriceSyncHistory {
  id: number;
  old_price: string;
  new_price: string;
  tx_hash: string;
  synced_at: string;
}

// ============================================================
// ADMIN VERIFICATION
// ============================================================

export async function verifyAdmin(credentials: AuthCredentials): Promise<{ isAdmin: boolean; wallet: string }> {
  const { data } = await api.post("/admin/verify", credentials);
  return data;
}

// Session-based verification using timestamp auth (one signature for everything)
export async function verifyAdminSession(credentials: ReadAuthCredentials): Promise<{ isAdmin: boolean; wallet: string }> {
  const { data } = await api.post("/admin/verify-session", credentials);
  return data;
}

// ============================================================
// SYSTEM STATUS
// ============================================================

export async function getSystemStatus(credentials: ReadAuthCredentials): Promise<SystemStatus> {
  const { data } = await api.post("/admin/status", credentials);
  return data;
}

// ============================================================
// SERVICE CONTROLS
// ============================================================

export async function startListener(credentials: AuthCredentials): Promise<{ success: boolean }> {
  const { data } = await api.post("/listener/start", credentials);
  return data;
}

export async function stopListener(credentials: AuthCredentials): Promise<{ success: boolean }> {
  const { data } = await api.post("/listener/stop", credentials);
  return data;
}

export async function getListenerStats(credentials: ReadAuthCredentials): Promise<unknown> {
  const { data } = await api.post("/listener/stats", credentials);
  return data;
}

export async function startWatcher(credentials: AuthCredentials): Promise<{ success: boolean }> {
  const { data } = await api.post("/watcher/start", credentials);
  return data;
}

export async function stopWatcher(credentials: AuthCredentials): Promise<{ success: boolean }> {
  const { data } = await api.post("/watcher/stop", credentials);
  return data;
}

export async function startPriceSync(credentials: AuthCredentials): Promise<{ success: boolean }> {
  const { data } = await api.post("/price-sync/start", credentials);
  return data;
}

export async function stopPriceSync(credentials: AuthCredentials): Promise<{ success: boolean }> {
  const { data } = await api.post("/price-sync/stop", credentials);
  return data;
}

export async function forcePriceSync(credentials: AuthCredentials): Promise<{ synced: boolean; txHash?: string }> {
  const { data } = await api.post("/price-sync/force", credentials);
  return data;
}

export async function catchupEvents(fromBlock: number, credentials: AuthCredentials): Promise<{ success: boolean; eventsProcessed: number }> {
  const { data } = await api.post("/listener/catchup", { fromBlock, ...credentials });
  return data;
}

// ============================================================
// DOMAIN MANAGEMENT
// ============================================================

export interface ListDomainsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  tld?: string;
}

export async function listDomains(params: ListDomainsParams, credentials: ReadAuthCredentials): Promise<PaginatedResponse<Domain>> {
  const { data } = await api.post("/admin/domains", {
    ...credentials,
    page: params.page,
    limit: params.limit,
    search: params.search,
    status: params.status,
    tld: params.tld,
  });
  return data;
}

export async function updateDomainStatus(domainId: number, status: string, credentials: AuthCredentials): Promise<{ success: boolean }> {
  const { data } = await api.put(`/admin/domains/${domainId}/status`, { status, ...credentials });
  return data;
}

// ============================================================
// TLD MANAGEMENT
// ============================================================

export async function listTLDs(credentials: ReadAuthCredentials): Promise<TLD[]> {
  const { data } = await api.post("/admin/tlds/list", credentials);
  return data;
}

export async function getTLD(tldId: number | string, credentials: ReadAuthCredentials): Promise<TLD> {
  const { data } = await api.post(`/admin/tlds/${tldId}`, credentials);
  return data;
}

export async function createTLD(name: string, credentials: AuthCredentials, options?: TLDCreateOptions): Promise<TLD> {
  const { data } = await api.post("/admin/tlds", { name, ...options, ...credentials });
  return data;
}

export async function updateTLD(tldId: number, updates: TLDUpdateOptions, credentials: AuthCredentials): Promise<{ success: boolean; tld: TLD }> {
  const { data } = await api.put(`/admin/tlds/${tldId}`, { ...updates, ...credentials });
  return data;
}

export interface SyncTLDsResult {
  success: boolean;
  scanned: number;
  added: { id: number; name: string; state: string; height: number }[];
  existing: string[];
  failed: { name: string; error: string }[];
  message: string;
}

export async function syncTLDsFromWallet(credentials: AuthCredentials): Promise<SyncTLDsResult> {
  const { data } = await api.post("/admin/tlds/sync", credentials);
  return data;
}

// ============================================================
// AUDIT LOG
// ============================================================

export interface AuditLogParams {
  page?: number;
  limit?: number;
  action?: string;
  entityType?: string;
  startDate?: string;
  endDate?: string;
}

export async function getAuditLog(params: AuditLogParams, credentials: ReadAuthCredentials): Promise<PaginatedResponse<AuditLogEntry>> {
  const { data } = await api.post("/admin/audit", {
    ...credentials,
    page: params.page,
    limit: params.limit,
    action: params.action,
    entityType: params.entityType,
    startDate: params.startDate,
    endDate: params.endDate,
  });
  return data;
}

export async function exportAuditLog(params: AuditLogParams, credentials: ReadAuthCredentials): Promise<Blob> {
  const { data } = await api.post("/admin/audit/export", {
    ...credentials,
    action: params.action,
    entityType: params.entityType,
    startDate: params.startDate,
    endDate: params.endDate,
  }, {
    responseType: "blob",
  });
  return data;
}

// ============================================================
// RESERVED WORDS
// ============================================================

export async function getReservedWords(credentials: ReadAuthCredentials): Promise<ReservedWord[]> {
  const { data } = await api.post("/admin/reserved/list", credentials);
  return data;
}

export async function addReservedWord(word: string, reason: string, credentials: AuthCredentials): Promise<ReservedWord> {
  const { data } = await api.post("/admin/reserved", { word, reason, ...credentials });
  return data;
}

export async function removeReservedWord(word: string, credentials: AuthCredentials): Promise<{ success: boolean }> {
  const { data } = await api.delete(`/admin/reserved/${word}`, { data: credentials });
  return data;
}

// ============================================================
// DATABASE STATS
// ============================================================

export async function getDatabaseStats(credentials: ReadAuthCredentials): Promise<Record<string, number | { error: string }>> {
  const { data } = await api.post("/admin/db/stats", credentials);
  return data;
}

export async function getPendingPurchases(credentials: ReadAuthCredentials): Promise<unknown[]> {
  const { data } = await api.post("/admin/db/pending", credentials);
  return data;
}

// ============================================================
// PRICING
// ============================================================

export async function getPriceComparison(credentials: ReadAuthCredentials): Promise<PriceComparison> {
  const { data } = await api.post("/admin/pricing/compare", credentials);
  return data;
}

export async function getPriceHistory(limit: number, credentials: ReadAuthCredentials): Promise<PriceSyncHistory[]> {
  const { data } = await api.post("/admin/pricing/history", { ...credentials, limit });
  return data;
}

// ============================================================
// HNS NODE
// ============================================================

export async function startHNSNode(credentials: AuthCredentials): Promise<{
  success: boolean;
  message?: string;
  connected?: boolean;
  error?: string;
}> {
  const { data } = await api.post("/admin/hns/start", credentials);
  return data;
}

export async function stopHNSNode(credentials: AuthCredentials): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const { data } = await api.post("/admin/hns/stop", credentials);
  return data;
}

export async function getHNSWalletInfo(credentials: ReadAuthCredentials): Promise<{
  address: string;
  balance: string;
  unconfirmed: string;
  txCount: number;
  ownedTLDs: { name: string }[];
}> {
  const { data } = await api.post("/admin/hns/wallet", credentials);
  return data;
}

export async function getFLRWalletInfo(credentials: ReadAuthCredentials): Promise<{
  address: string;
  balance: string;
  network: string;
  chainId: number;
}> {
  const { data } = await api.post("/admin/flr/wallet", credentials);
  return data;
}

export interface SystemAddresses {
  wallets: {
    backend: { address: string; balance: string } | null;
    platform: { address: string; balance: string } | null;
  };
  contracts: {
    nft: string | null;
    escrow: string | null;
    dnsOracle: string | null;
    priceOracle: string | null;
  };
}

export async function getSystemAddresses(credentials: ReadAuthCredentials): Promise<SystemAddresses> {
  const { data } = await api.post("/admin/addresses", credentials);
  return data;
}

// ============================================================
// HNS TLD MANAGEMENT
// ============================================================

export interface HNSDNSRecord {
  type: string;
  ns?: string;
  address?: string;
  txt?: string[];
}

export interface HNSTLDDetail {
  name: string;
  state: string;
  height: number;
  renewal: number;
  transfer: number;
  expiryHeight: number | null;
  expired: boolean;
  flrAddress: string | null;
  records: HNSDNSRecord[];
}

export interface SetFlrResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface BatchSetFlrResult {
  success: boolean;
  total: number;
  successCount: number;
  results: { tld: string; success: boolean; txHash?: string; error?: string }[];
}

export async function getHNSTLDs(credentials: ReadAuthCredentials): Promise<{ success: boolean; tlds: HNSTLDDetail[] }> {
  const { data } = await api.post("/admin/hns/tlds", credentials);
  return data;
}

export async function setTLDFlrRecord(
  tld: string,
  flareAddress: string,
  credentials: AuthCredentials
): Promise<SetFlrResult> {
  const { data } = await api.post(`/admin/hns/tlds/${tld}/set-flr`, { flareAddress, ...credentials });
  return data;
}

export async function batchSetTLDFlrRecords(
  tlds: string[],
  flareAddress: string,
  credentials: AuthCredentials
): Promise<BatchSetFlrResult> {
  const { data } = await api.post("/admin/hns/tlds/set-flr-batch", { tlds, flareAddress, ...credentials });
  return data;
}

// ============================================================
// PREVIEW CREDITS
// ============================================================

export async function resetAllPreviewCredits(credentials: AuthCredentials): Promise<{
  success: boolean;
  message: string;
  resetCount: number;
}> {
  const { data } = await api.post("/nft/preview-credits/reset-all", credentials);
  return data;
}

// ============================================================
// IMAGE MODEL MANAGEMENT
// ============================================================

export interface ImageModel {
  id: string;
  name: string;
  type: "sdxl" | "flux";
  vram: string;
  steps: number;
  available?: boolean;
}

export interface ImageModelConfig {
  activeModel: string;
  activeConfig: {
    name: string;
    type: string;
    vram: string;
    steps: number;
    [key: string]: unknown;
  };
  availableModels: ImageModel[];
}

export async function getImageModel(credentials: ReadAuthCredentials): Promise<ImageModelConfig> {
  const { data } = await api.post("/admin/image-model/status", credentials);
  return data;
}

export async function setImageModel(model: string, credentials: AuthCredentials): Promise<{
  success: boolean;
  message: string;
  activeModel: string;
}> {
  const { data } = await api.post("/admin/image-model", { model, ...credentials });
  return data;
}

// ============================================================
// GPU HEALTH MANAGEMENT
// ============================================================

export interface GPUStatus {
  url: string;
  online: boolean;
  lastCheck: number | null;
  restartCount: number;
  consecutiveFailures: number;
  vramFree?: number;
}

export interface GPUHealthResponse {
  success: boolean;
  gpus: Record<string, GPUStatus>;
  summary: {
    online: number;
    offline: number;
    total: number;
    allHealthy: boolean;
  };
}

export async function getGPUHealth(credentials: ReadAuthCredentials): Promise<GPUHealthResponse> {
  const { data } = await api.post("/admin/gpu-health", credentials);
  return data;
}

export async function restartGPU(gpu: string, credentials: AuthCredentials): Promise<{
  success: boolean;
  message: string;
  status: Record<string, GPUStatus>;
}> {
  const { data } = await api.post("/admin/gpu-restart", { gpu, ...credentials });
  return data;
}

export async function restartAllGPUs(credentials: AuthCredentials): Promise<{
  success: boolean;
  message: string;
  restarted: { gpu: string; success: boolean }[];
  status: Record<string, GPUStatus>;
}> {
  const { data } = await api.post("/admin/gpu-restart-all", credentials);
  return data;
}

// ============================================================
// FEATURE FLAGS
// ============================================================

export interface FeatureFlag {
  enabled: boolean;
  updatedAt: string | null;
}

export interface FeatureFlags {
  bulk_registration_enabled: FeatureFlag;
}

export async function getFeatureFlags(credentials: ReadAuthCredentials): Promise<FeatureFlags> {
  const { data } = await api.post("/admin/features", credentials);
  return data;
}

export async function toggleBulkRegistration(
  enabled: boolean,
  credentials: AuthCredentials
): Promise<{
  success: boolean;
  bulkRegistrationEnabled: boolean;
  message: string;
}> {
  const { data } = await api.post("/admin/bulk-registration/toggle", { enabled, ...credentials });
  return data;
}

// ============================================================
// GPU MONITORING
// ============================================================

export interface VRAMDevice {
  name: string;
  type: string;
  index: number;
  vram_total: number;
  vram_free: number;
}

export interface ComfyUIServer {
  id: string;
  name: string;
  port: number;
  url: string;
  isDisplayGPU: boolean;
  healthy: boolean;
  state: string;
  generationCount: number;
  threshold: number;
  generationsUntilRestart: number;
  lastRestartTime: number | null;
}

export interface HardwareGPU {
  index: number;
  name: string;
  temperature: number;
  utilization: number;
  memory_used: number;
  memory_total: number;
  power_draw: number;
  power_limit: number;
  clock_graphics: number;
  clock_memory: number;
  fan_rpm: number;
  fan_speed_pct: number;
}

export interface HardwareMachine {
  gpus: HardwareGPU[];
}

export interface HardwareStats {
  error?: string;
  [machine: string]: HardwareMachine | string | undefined;
}

export interface NftJobItem {
  id?: string;
  fqdn?: string;
  wallet?: string;
  status: string;
  gpu_assigned?: string;
  gpu?: string;
  image_count?: number;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  [key: string]: unknown;
}

export interface LiveGPUStatus {
  status: string;
  gpu: string;
  [key: string]: unknown;
}

export interface JobQueue {
  error?: string | null;
  nft?: NftJobItem[];
  live?: LiveGPUStatus[];
}

export interface GPUMonitorData {
  comfyui: {
    config: { restartThreshold: number; minOnlineGPUs: number };
    servers: ComfyUIServer[];
    onlineCount: number;
    totalCount: number;
    restartQueue: string[];
    restartLocked: boolean;
  } | null;
  fans: {
    enabled: boolean;
    manualControlEnabled: boolean;
    activeJobs: number;
    targetSpeed: number;
    cooldownPending: boolean;
    config: { workingSpeed: number; idleSpeed: number; gpuCount: number; fanCount: number };
    currentFanSpeeds: { gpu: number; speed: number }[];
    lastError: string | null;
  } | null;
  generationCounts: Record<string, { count: number; threshold: number; remaining: number; name: string }> | null;
  vram: Record<string, { devices: VRAMDevice[]; ram: { total: number; free: number } | null }>;
  activeModel: { type: string; config: { name: string; checkpoint: string; vram?: string } } | null;
  availableModels: { id: string; name: string; checkpoint: string; available: boolean }[] | null;
  hardware: HardwareStats | null;
  jobQueue: JobQueue | null;
}

export async function getGPUMonitor(credentials: ReadAuthCredentials): Promise<GPUMonitorData> {
  const { data } = await api.post("/admin/gpu/monitor", credentials);
  return data;
}

// ============================================================
// WALLET MANAGEMENT
// ============================================================

export interface WalletInfo {
  id: string;
  name: string;
  network: "FLR" | "HNS";
  address: string;
  balance: number;
  balanceUSD: number;
  role: string;
  error?: string;
}

export interface WalletOverview {
  wallets: WalletInfo[];
  flrPriceUSD: number;
  timestamp: string;
}

export interface WalletTransaction {
  id: number;
  hash: string | null;
  action: string;
  from: string | null;
  to: string | null;
  value: number | null;
  gasUsed: number | null;
  gasCostFLR: number | null;
  timestamp: string;
  status: string;
  method?: string;
}

export interface GasSummary {
  totalGasSpentFLR: number;
  totalGasCostUSD: number;
  period: string;
  byDay: { date: string; gasFLR: number }[];
  byMethod: Record<string, { count: number; totalGasFLR: number }>;
}

export interface ContractInteraction {
  id: number;
  action: string;
  txHash: string | null;
  blockNumber: number | null;
  gasUsed: number | null;
  timestamp: string;
  details: Record<string, unknown>;
}

export interface NonceStatus {
  address: string;
  currentNonce: number;
  pendingNonce: number;
  hasPendingTx: boolean;
  stuck: boolean;
}

export interface BalanceAlert {
  walletId: string;
  name: string;
  balance: number;
  threshold: number;
  severity: "warning" | "critical";
}

export interface SendResult {
  success: boolean;
  txHash: string | null;
  from: string;
  to: string;
  amount: number;
  gasUsed?: number;
}

export async function getWalletOverview(credentials: ReadAuthCredentials): Promise<WalletOverview> {
  const { data } = await api.post("/admin/wallets/overview", credentials);
  return data;
}

export async function getWalletTransactions(credentials: ReadAuthCredentials, page = 1, limit = 20): Promise<PaginatedResponse<WalletTransaction>> {
  const { data } = await api.post("/admin/wallets/transactions", { ...credentials, page, limit });
  return data;
}

export async function getGasSummary(credentials: ReadAuthCredentials, period = "7d"): Promise<GasSummary> {
  const { data } = await api.post("/admin/wallets/gas-summary", { ...credentials, period });
  return data;
}

export async function getContractLog(credentials: ReadAuthCredentials, page = 1, limit = 20, action?: string): Promise<PaginatedResponse<ContractInteraction>> {
  const { data } = await api.post("/admin/wallets/contract-log", { ...credentials, page, limit, action: action || null });
  return data;
}

export async function getNonceStatus(credentials: ReadAuthCredentials): Promise<NonceStatus> {
  const { data } = await api.post("/admin/wallets/nonce-status", credentials);
  return data;
}

export async function getBalanceAlerts(credentials: ReadAuthCredentials): Promise<BalanceAlert[]> {
  const { data } = await api.post("/admin/wallets/alerts", credentials);
  return data;
}

export async function sendFLR(toAddress: string, amount: number, credentials: AuthCredentials, fromWallet = "backend"): Promise<SendResult> {
  const { data } = await api.post("/admin/wallets/send-flr", { toAddress, amount, fromWallet, ...credentials });
  return data;
}

export async function sendHNS(toAddress: string, amount: number, credentials: AuthCredentials): Promise<SendResult> {
  const { data } = await api.post("/admin/wallets/send-hns", { toAddress, amount, ...credentials });
  return data;
}

// ============================================================
// ANALYTICS
// ============================================================

export interface AnalyticsRegistrations {
  daily: { date: string; count: number }[];
  byTld: { tld: string; count: number }[];
  totals: { total: number; period_count: number; today: number };
  range: string;
}

export interface AnalyticsRevenue {
  daily: { date: string; flr_total: string; usd_total: string; count: number }[];
  totals: { total_flr: string; total_usd: string; period_flr: string; period_usd: string };
  byTier: { tier: string; count: number; flr_total: string; usd_total: string }[];
  flrPrice: number | null;
  range: string;
}

export interface AnalyticsMarketplace {
  byType: { event_type: string; count: number; total_amount: string }[];
  dailyVolume: { date: string; transactions: number; volume: string }[];
  listings: { active_listings: number; avg_price: string; floor_price: string };
  topSales: { fqdn: string; amount: string; actor_wallet: string; counterparty_wallet: string; created_at: string }[];
  range: string;
}

export interface AnalyticsUsers {
  wallets: { total_owners: number; new_owners: number; today_owners: number };
  topHolders: { owner_wallet: string; domain_count: number; total_spent_flr: string }[];
  retention: { single_reg: number; returning: number; power_users: number };
  dailyUsers: { date: string; unique_wallets: number; registrations: number }[];
  range: string;
}

export async function getAnalyticsRegistrations(credentials: ReadAuthCredentials, range = "30d"): Promise<AnalyticsRegistrations> {
  const { data } = await api.post("/admin/analytics/registrations", { ...credentials, range });
  return data;
}

export async function getAnalyticsRevenue(credentials: ReadAuthCredentials, range = "30d"): Promise<AnalyticsRevenue> {
  const { data } = await api.post("/admin/analytics/revenue", { ...credentials, range });
  return data;
}

export async function getAnalyticsMarketplace(credentials: ReadAuthCredentials, range = "30d"): Promise<AnalyticsMarketplace> {
  const { data } = await api.post("/admin/analytics/marketplace", { ...credentials, range });
  return data;
}

export async function getAnalyticsUsers(credentials: ReadAuthCredentials, range = "30d"): Promise<AnalyticsUsers> {
  const { data } = await api.post("/admin/analytics/users", { ...credentials, range });
  return data;
}

// ============================================================
// PM2 PROCESS MANAGEMENT
// ============================================================

export interface PM2Process {
  name: string;
  pm_id: number;
  status: "online" | "stopped" | "errored" | "unknown";
  cpu: number;
  memory: number;
  uptime: number | null;
  restarts: number;
}

export async function getPM2List(credentials: ReadAuthCredentials): Promise<{ processes: PM2Process[] }> {
  const { data } = await api.post("/admin/pm2/list", credentials);
  return data;
}

export async function pm2Restart(name: string, credentials: AuthCredentials): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post(`/admin/pm2/restart/${name}`, credentials);
  return data;
}

export async function pm2Stop(name: string, credentials: AuthCredentials): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post(`/admin/pm2/stop/${name}`, credentials);
  return data;
}

export async function pm2Start(name: string, credentials: AuthCredentials): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post(`/admin/pm2/start/${name}`, credentials);
  return data;
}

export async function getPM2Logs(name: string, credentials: ReadAuthCredentials): Promise<{ stdout: string; stderr: string }> {
  const { data } = await api.post(`/admin/pm2/logs/${name}`, credentials);
  return data;
}

// ============================================================
// REMOTE PROCESS MONITORING
// ============================================================

export interface RemoteProcess {
  pid: string;
  cpu: number;
  mem: number;
  cmd: string;
  name: string;
  type: 'comfyui' | 'dashboard' | 'python' | 'other';
}

export interface RemoteService {
  name: string;
  unit: string;
  status: 'running' | 'stopped' | 'failed';
  subState: string;
}

export interface RemoteMachine {
  label: string;
  status: 'online' | 'offline';
  error?: string;
  processes: RemoteProcess[];
  services: RemoteService[];
}

export interface RemoteProcessesResponse {
  machines: Record<string, RemoteMachine>;
}

export async function getRemoteProcesses(credentials: ReadAuthCredentials): Promise<RemoteProcessesResponse> {
  const { data } = await api.post("/admin/remote-processes", credentials);
  return data;
}

export async function restartRemoteProcess(
  ip: string,
  pid: string,
  type: string,
  credentials: AuthCredentials
): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post("/admin/remote-process/restart", { ...credentials, ip, pid, type });
  return data;
}

export async function controlRemoteService(
  ip: string,
  service: string,
  action: 'start' | 'stop' | 'restart',
  credentials: AuthCredentials
): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post("/admin/remote-service/control", { ...credentials, ip, service, action });
  return data;
}

// ============================================================
// INFRASTRUCTURE MONITORING
// ============================================================

export interface CaddyStatus {
  active: string;
  version: string;
}

export interface DnsCheckResult {
  working: boolean;
  latencyMs: number | null;
  error?: string;
}

export interface ServerStats {
  memory: { total: number; used: number; free: number };
  disk: { size: string; used: string; avail: string; usePct: string };
  load: { load1: number; load5: number; load15: number };
  uptime: string;
}

export interface SSLCert {
  domain: string;
  expiry: string | null;
  daysRemaining: number | null;
  error?: string;
}

export async function getCaddyStatus(credentials: ReadAuthCredentials): Promise<CaddyStatus> {
  const { data } = await api.post("/admin/infra/caddy-status", credentials);
  return data;
}

export async function getDnsCheck(credentials: ReadAuthCredentials): Promise<DnsCheckResult> {
  const { data } = await api.post("/admin/infra/dns-check", credentials);
  return data;
}

export async function getServerStats(credentials: ReadAuthCredentials): Promise<ServerStats> {
  const { data } = await api.post("/admin/infra/server-stats", credentials);
  return data;
}

export async function getSSLCerts(credentials: ReadAuthCredentials): Promise<{ certs: SSLCert[] }> {
  const { data } = await api.post("/admin/infra/ssl-certs", credentials);
  return data;
}

// ============================================================
// GPU HARDWARE STATS (nvidia-smi)
// ============================================================

export interface GPUHardwareInfo {
  index: number;
  name: string;
  temperature: number;
  fanSpeed: number;
  utilization: number;
  memoryUsed: number;
  memoryTotal: number;
  powerDraw: number;
  powerLimit: number;
  clockGpu: number;
  clockMem: number;
}

export interface GPUMachineStats {
  gpus: GPUHardwareInfo[];
  machine: string;
  label: string;
}

export async function getRemoteGPUs(credentials: ReadAuthCredentials): Promise<GPUMachineStats> {
  const { data } = await api.post("/admin/infra/remote-gpus", credentials);
  return data;
}

export async function getLocalGPUs(credentials: ReadAuthCredentials): Promise<GPUMachineStats> {
  const { data } = await api.post("/admin/infra/local-gpus", credentials);
  return data;
}

export async function setGPUFanSpeed(speed: number | "auto", target: "all" | "local" | "remote", credentials: AuthCredentials): Promise<{ success: boolean; speed: number | string; target: string }> {
  const { data } = await api.post("/admin/gpu/fan-speed", { ...credentials, speed, target });
  return data;
}

// ============================================================
// PARALLEL DEMO
// ============================================================

export interface ParallelDemoGPUStatus {
  status: "pending" | "generating" | "completed" | "failed";
  startTime: number | null;
  endTime: number | null;
  imageUrl: string | null;
  error: string | null;
  duration?: number;
}

export interface ParallelDemoGeneration {
  gpu: string;
  server: string;
  imageUrl?: string;
  error?: string;
  duration?: number;
  success: boolean;
}

export interface ParallelDemoSession {
  id: string;
  prompt: string;
  count: number;
  status: "running" | "completed" | "stopped" | "error";
  startTime: number;
  endTime?: number;
  totalDuration?: number;
  completed: number;
  failed: number;
  gpuStatus: Record<string, ParallelDemoGPUStatus>;
  generations: ParallelDemoGeneration[];
}

export interface GPUDashboardStats {
  machines: Record<string, {
    gpus: Array<{
      index: number;
      name: string;
      temp: number;
      util: number;
      vram_used: number;
      vram_total: number;
      fan: number;
    }>;
  }>;
}

export interface GPUDashboardJobs {
  liveData?: Array<{
    gpu: string;
    status: string;
    prompt?: string;
  }>;
  nft?: Array<{
    id: string;
    status: string;
    gpu_assigned?: string;
  }>;
}

export async function getParallelDemoPrompts(credentials: ReadAuthCredentials): Promise<{ success: boolean; prompts: string[] }> {
  const { data } = await api.post("/admin/parallel-demo/prompts", credentials);
  return data;
}

export async function startParallelDemo(
  count: 4 | 8,
  prompt: string,
  customPrompt: string | undefined,
  credentials: AuthCredentials
): Promise<{ success: boolean; sessionId: string; message: string; prompt: string }> {
  const { data } = await api.post("/admin/parallel-demo/start", {
    count,
    prompt,
    customPrompt,
    ...credentials,
  });
  return data;
}

export async function getParallelDemoStatus(
  sessionId: string,
  credentials: ReadAuthCredentials
): Promise<{ success: boolean; session: ParallelDemoSession }> {
  const { data } = await api.post(`/admin/parallel-demo/status/${sessionId}`, credentials);
  return data;
}

export async function getParallelDemoGPUStats(credentials: ReadAuthCredentials): Promise<{ success: boolean; stats: GPUDashboardStats | null; jobs: GPUDashboardJobs | null }> {
  const { data } = await api.post("/admin/parallel-demo/gpu-stats", credentials);
  return data;
}

export async function stopParallelDemo(
  sessionId: string,
  credentials: AuthCredentials
): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post("/admin/parallel-demo/stop", { sessionId, ...credentials });
  return data;
}
