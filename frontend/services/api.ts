import axios from "axios";

// Connect directly to backend
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 300000, // 5 minutes for AI generation (SDXL with dpmpp_2m_sde takes longer)
});

export interface TLD {
  id: number;
  name: string;
  is_active: boolean;
  domain_count: number;
}

export interface SearchResult {
  available: boolean;
  subdomain: string;
  tld: string;
  fqdn: string;
  tier?: string;
  price?: {
    usd: number;
    flr: number;
  };
  owner?: string;
  tokenId?: number;
  error?: string;
}

export interface PricingTier {
  criteria: string;
  priceUSD: number;
  priceFLR: number;
  renewalUSD: number;
}

export interface Pricing {
  flrPriceUSD: number;
  tiers: {
    ultra_premium: PricingTier;
    premium: PricingTier;
    standard_plus: PricingTier;
    standard: PricingTier;
  };
  lastUpdated: string;
}

export interface Stats {
  tldCount: number;
  totalDomains: number;
  recentRegistrations: Array<{
    fqdn: string;
    created_at: string;
  }>;
}

export interface Domain {
  id: number;
  token_id: number;
  subdomain: string;
  fqdn: string;
  owner_wallet: string;
  registration_price_flr: string;
  registration_price_usd: string;
  registration_date: string;
  expiration_date: string;
  status: string;
  tier: string;
  dns_active: boolean;
  nft_status?: 'placeholder' | 'customized';
}

// Health check
export async function getHealth() {
  const { data } = await api.get("/health");
  return data;
}

// TLDs
export async function getTLDs(): Promise<TLD[]> {
  const { data } = await api.get("/tlds");
  return data.tlds;
}

// Search
export async function searchSubdomain(subdomain: string, tld: string): Promise<SearchResult> {
  const { data } = await api.get("/search", { params: { subdomain, tld } });
  return data;
}

export async function bulkSearch(subdomains: string[], tld: string): Promise<SearchResult[]> {
  const { data } = await api.post("/search/bulk", { subdomains, tld });
  return data.results;
}

// Pricing
export async function getPricing(): Promise<Pricing> {
  const { data } = await api.get("/pricing");
  return data;
}

// Bulk Pricing
export interface BulkPricingItem {
  subdomain: string;
  tld: string;
  tier: string;
  priceUSD: number;
  priceFLR: number;
}

export interface BulkPricingResult {
  items: BulkPricingItem[];
  subtotal: {
    usd: number;
    flr: number;
  };
  total: {
    usd: number;
    flr: number;
  };
  bonusCredits: number;
  count: number;
  tld?: string; // Optional - only set for single-TLD requests
  flrPriceUSD: number;
  isTestnet: boolean;
}

// Single TLD bulk pricing (legacy)
export async function getBulkPricing(tld: string, subdomains: string[]): Promise<BulkPricingResult> {
  const { data } = await api.post("/pricing/bulk", { tld, subdomains });
  return data;
}

// Multi-TLD bulk pricing
export async function getBulkPricingMultiTLD(items: Array<{ subdomain: string; tld: string }>): Promise<BulkPricingResult> {
  const { data } = await api.post("/pricing/bulk-multi", { items });
  return data;
}

// Feature Flags
export interface FeatureFlags {
  bulkRegistration: boolean;
}

export async function getFeatureFlags(): Promise<FeatureFlags> {
  try {
    const { data } = await api.get("/features");
    return data;
  } catch {
    // Return defaults if endpoint fails
    return { bulkRegistration: true };
  }
}

// Stats
export async function getStats(): Promise<Stats> {
  const { data } = await api.get("/stats");
  return data;
}

// Domains
export async function getDomain(fqdn: string): Promise<Domain> {
  const { data } = await api.get(`/domains/${fqdn}`);
  return data.domain;
}

export async function getOwnedDomains(
  wallet: string,
  credentials: AuthCredentials
): Promise<Domain[]> {
  const { data } = await api.post(`/domains/owner/${wallet}`, credentials);
  return data.domains;
}

// HNS
export async function getHNSStatus() {
  const { data } = await api.get("/hns/status");
  return data;
}

// =============================================================
//                    AUTHENTICATED ENDPOINTS
// =============================================================

export interface AuthCredentials {
  wallet: string;
  signature: string;
  nonce: string;
}

export interface DNSRecords {
  ipv4?: string;
  ipv6?: string;
  cname?: string;
  txt?: string;
  ttl?: number;
}

export interface DNSRecord {
  name: string;
  type: string;
  ttl: number;
  records: Array<{ content: string; disabled: boolean }>;
}

export interface DnsEntry {
  host: string;
  type: string;
  value: string;
  ttl: number;
}

// Get authentication nonce
export async function getAuthNonce(wallet: string): Promise<{
  nonce: string;
  message: string;
  expiresAt: string;
}> {
  const { data } = await api.get("/auth/nonce", { params: { wallet } });
  return data;
}

// Verify authentication (for testing)
export async function verifyAuth(credentials: AuthCredentials): Promise<{
  success: boolean;
  wallet: string;
  message: string;
}> {
  const { data } = await api.post("/auth/verify", credentials);
  return data;
}

// Complete domain registration (authenticated)
export async function completeRegistration(
  params: {
    wallet: string;
    escrowId: string;
    tokenId: string;
    subdomain: string;
    tld: string;
    priceFLR?: number;
    priceUSD?: number;
  }
): Promise<{ success: boolean; fqdn: string; tokenId: string }> {
  const { data } = await api.post("/register/complete", params);
  return data;
}

// Get DNS records for a domain
export async function getDNSRecords(
  subdomain: string,
  tld: string
): Promise<{ records: DNSRecord[] }> {
  const { data } = await api.get(`/dns/${subdomain}/${tld}`);
  return data;
}

// Update DNS records (authenticated)
export async function updateDNSRecords(
  credentials: AuthCredentials,
  subdomain: string,
  tld: string,
  records: DNSRecords,
  host?: string
): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post(`/dns/${subdomain}/${tld}`, {
    ...credentials,
    records,
    ...(host ? { host } : {}),
  });
  return data;
}

// Delete DNS records (authenticated)
export async function deleteDNSRecords(
  credentials: AuthCredentials,
  subdomain: string,
  tld: string,
  host?: string,
  recordType?: string,
  recordValue?: string
): Promise<{ success: boolean; message: string }> {
  const { data } = await api.delete(`/dns/${subdomain}/${tld}`, {
    data: {
      ...credentials,
      ...(host ? { host } : {}),
      ...(recordType ? { recordType, recordValue } : {}),
    },
  });
  return data;
}

// Get all DNS records for a domain, including sub-subdomains
export async function getAllDomainRecords(
  subdomain: string,
  tld: string
): Promise<{ entries: DnsEntry[] }> {
  const { data } = await api.get(`/dns/${subdomain}/${tld}/all`);
  return data;
}

// DNS setup status for a specific domain (used after registration)
export interface DnsStatus {
  fqdn: string;
  status: 'not_found' | 'configuring' | 'propagating' | 'ready';
  dnsConfigured: boolean;
  dnsActive?: boolean;
  resolving: boolean;
  registeredAt?: string;
  recordCount?: number;
}

export async function getDnsStatus(subdomain: string, tld: string): Promise<DnsStatus> {
  const { data } = await api.get(`/dns/status/${subdomain}/${tld}`);
  return data;
}

// Watcher status (public)
export async function getWatcherStatus(): Promise<{
  isRunning: boolean;
  phase: string | null;
  startTime: string | null;
  tlds: Record<string, {
    propagated: boolean;
    resolvers: Record<string, { propagated: boolean; ip?: string }>;
  }>;
}> {
  const { data } = await api.get("/watcher");
  return data;
}

// =============================================================
//                    NFT PREPARATION (AI GENERATION)
// =============================================================

export interface NFTPrepareResult {
  success: boolean;
  cached?: boolean;
  fqdn?: string;
  subdomain?: string;
  tld?: string;
  metadataURI?: string;
  imageCID?: string;
  metadataCID?: string;
  imageURL?: string;
  metadataURL?: string;
  seed?: number;
  tier?: string;
  error?: string;
}

/**
 * Prepare NFT for purchase - generates AI image and uploads to IPFS
 * This should be called before the blockchain purchase transaction
 * Returns the IPFS metadata URI to use in the smart contract call
 * @param subdomain - Subdomain name
 * @param tld - TLD name
 * @param style - Visual style (e.g., 'cyberpunk', 'nature', 'corporate')
 * @param seed - Optional seed for deterministic generation
 * @param customPrompt - REQUIRED: Describe your subject (e.g., "bigfoot catching a fish by a mountain lake")
 */
export async function prepareNFT(
  subdomain: string,
  tld: string,
  style?: string,
  seed?: number,
  customPrompt?: string
): Promise<NFTPrepareResult> {
  // customPrompt is now required by the backend
  const { data } = await api.post("/nft/prepare", { subdomain, tld, style, seed, customPrompt });
  return data;
}

/**
 * Get prepared NFT data for a domain (if already prepared)
 */
export async function getPreparedNFT(fqdn: string): Promise<NFTPrepareResult> {
  const { data } = await api.get(`/nft/prepared/${fqdn}`);
  return data;
}

// =============================================================
//                    NFT PREVIEW & CUSTOMIZATION
// =============================================================

export interface PreviewResult {
  success: boolean;
  imageBase64?: string;
  seed?: number;
  tier?: string;
  theme?: string;
  error?: string;
}

export interface RegenerateResult extends PreviewResult {
  newSeed?: number;
  freeRemaining?: number;
  paidCredits?: number;
}

export interface CreditInfo {
  success: boolean;
  freeRemaining: number;
  paidCredits: number;
  totalRegenerations: number;
  error?: string;
}

export interface RegenPricing {
  success: boolean;
  priceFLR: number;
  creditsPerPurchase: number;
  freeCredits: number;
}

// Style is the new term (replaces Theme)
export interface Style {
  id: string;
  name: string;
  description: string;
}

// Backwards compatibility - Theme is now an alias for Style
export type Theme = Style

export interface StylesResult {
  success: boolean;
  tier?: string;
  styles: Style[];
  themes?: Style[]; // Backwards compatibility
  note?: string;
  error?: string;
}

// Backwards compatibility
export interface ThemesResult extends StylesResult {
  themes: Style[];
}

export interface AllStylesResult {
  success: boolean;
  styles: {
    ultra_premium: string[];
    premium: string[];
    standard_plus: string[];
    standard: string[];
  };
  themes?: {
    ultra_premium: string[];
    premium: string[];
    standard_plus: string[];
    standard: string[];
  };
  note?: string;
}

// Backwards compatibility
export type AllThemesResult = AllStylesResult

// =============================================================
//                     ART STYLES (Visual Rendering)
// =============================================================

/**
 * Art Style settings for image generation
 */
export interface ArtStyleSettings {
  cfg: number;
  steps: number;
  sampler: string;
  scheduler: string;
  denoise: number;
}

/**
 * Art Style - controls HOW an image looks (artistic technique)
 * Different from themes which control WHAT is in the image
 */
export interface ArtStyle {
  id: string;
  name: string;
  category: string;
  prompt: string;
  negative: string;
  settings: ArtStyleSettings;
  lora: { name: string; weight: number } | null;
}

/**
 * Art Style categories
 */
export const ART_STYLE_CATEGORIES = [
  'artistic',   // Traditional mediums: watercolor, oil, pencil, etc.
  'digital',    // Digital art: pixel, vector, 3D, etc.
  'film',       // Film & photo: cinematic, noir, analog, etc.
  'movements',  // Art movements: impressionist, pop art, etc.
  'rendering',  // Rendering styles: photorealistic, anime, comic, etc.
  'mood',       // Mood & atmosphere: dark, bright, dreamy, etc.
] as const;

export type ArtStyleCategory = typeof ART_STYLE_CATEGORIES[number];

/**
 * Response from /nft/art-styles endpoint
 */
export interface ArtStylesResult {
  success: boolean;
  styles: {
    artistic: ArtStyle[];
    digital: ArtStyle[];
    film: ArtStyle[];
    movements: ArtStyle[];
    rendering: ArtStyle[];
    mood: ArtStyle[];
  };
  categories: string[];
  totalCount: number;
  note?: string;
  error?: string;
}

/**
 * Response from /nft/art-style/:id endpoint
 */
export interface ArtStyleResult {
  success: boolean;
  style?: ArtStyle;
  error?: string;
}

/**
 * Generate NFT preview (local only, no IPFS upload)
 * @deprecated Use previewNFTAuthenticated instead for credit tracking
 * @param subdomain - Subdomain name
 * @param tld - TLD name
 * @param theme - Optional art theme
 * @param seed - Optional seed for deterministic generation
 * @param customPrompt - Optional custom prompt to add to AI generation (max 200 chars)
 */
export async function previewNFT(
  subdomain: string,
  tld: string,
  theme?: string,
  seed?: number,
  customPrompt?: string
): Promise<PreviewResult> {
  const { data } = await api.post("/nft/preview-generate", {
    subdomain,
    tld,
    theme,
    seed,
    customPrompt,
  });
  return data;
}

/**
 * Generate NFT preview (tracks credits by wallet on backend)
 * @param subdomain - Subdomain name
 * @param tld - TLD name
 * @param style - Visual style (e.g., 'cyberpunk', 'nature', 'minimalist')
 * @param seed - Optional seed for deterministic generation
 * @param customPrompt - REQUIRED: Describe your subject (e.g., "bigfoot catching a fish")
 * @param wallet - Wallet address for credit tracking
 */
export async function previewNFTAuthenticated(
  subdomain: string,
  tld: string,
  style: string,
  seed: number | undefined,
  customPrompt: string | undefined,
  wallet: string
): Promise<PreviewResult & { remaining: number; style?: string }> {
  // customPrompt is now required by the backend
  const { data } = await api.post("/nft/preview-generate", {
    subdomain,
    tld,
    wallet,
    style,
    seed,
    customPrompt,
  });
  return data;
}

/**
 * Regenerate NFT with new random seed (uses credit)
 * @param credentials - Auth credentials
 * @param subdomain - Subdomain name
 * @param tld - TLD name
 * @param style - Visual style (e.g., 'cyberpunk', 'nature', 'minimalist')
 * @param customPrompt - REQUIRED: Describe your subject (e.g., "bigfoot catching a fish")
 */
export async function regenerateNFT(
  credentials: AuthCredentials,
  subdomain: string,
  tld: string,
  style?: string,
  customPrompt?: string
): Promise<RegenerateResult> {
  // customPrompt is now required by the backend
  const { data } = await api.post("/nft/regenerate", {
    ...credentials,
    subdomain,
    tld,
    style,
    customPrompt,
  });
  return data;
}

/**
 * Get available styles for a tier
 * Note: customPrompt is now REQUIRED when generating NFTs
 */
export async function getStyles(tier: string): Promise<StylesResult> {
  const { data } = await api.get(`/nft/styles/${tier}`);
  return data;
}

// Backwards compatibility alias
export async function getThemes(tier: string): Promise<ThemesResult> {
  const { data } = await api.get(`/nft/themes/${tier}`);
  // Map styles to themes for backwards compatibility
  return {
    ...data,
    themes: data.styles || data.themes,
  };
}

/**
 * Get all styles organized by tier
 */
export async function getAllStyles(): Promise<AllStylesResult> {
  const { data } = await api.get("/nft/styles");
  return data;
}

// Backwards compatibility alias
export async function getAllThemes(): Promise<AllThemesResult> {
  const { data } = await api.get("/nft/themes");
  return {
    ...data,
    themes: data.styles || data.themes,
  };
}

/**
 * Get regeneration credits for a wallet
 */
export async function getRegenCredits(wallet: string): Promise<CreditInfo> {
  const { data } = await api.get(`/nft/regen-credits/${wallet}`);
  return data;
}

/**
 * Get regeneration pricing info
 */
export async function getRegenPricing(): Promise<RegenPricing> {
  const { data } = await api.get("/nft/regen-pricing");
  return data;
}

/**
 * Purchase regeneration credits
 * @param credentials - Auth credentials
 * @param txHash - Transaction hash of the payment
 */
export async function buyRegenCredits(
  credentials: AuthCredentials,
  txHash: string
): Promise<{ success: boolean; newCredits: number; message?: string; error?: string }> {
  const { data } = await api.post("/nft/buy-credits", {
    ...credentials,
    txHash,
  });
  return data;
}

// =============================================================
//                    PREVIEW CREDITS
// =============================================================

export interface PreviewCreditInfo {
  success: boolean;
  usedCount: number;
  remaining: number;
  freeTotal: number;
  error?: string;
}

/**
 * Get preview credits for a wallet (10 free total per wallet)
 * @param wallet - Wallet address
 */
export async function getPreviewCredits(wallet: string): Promise<PreviewCreditInfo> {
  const { data } = await api.get(`/nft/preview-credits/${wallet}`);
  return data;
}

/**
 * Purchase preview credits
 * @param wallet - Wallet address
 * @param txHash - Transaction hash of the payment
 */
export async function buyPreviewCredits(
  wallet: string,
  txHash: string
): Promise<{ success: boolean; remaining: number; message?: string; error?: string }> {
  const { data } = await api.post("/nft/buy-preview-credits", {
    wallet,
    txHash,
  });
  return data;
}

// =============================================================
//           UNIFIED CREDITS (Simplified Registration)
// =============================================================

export interface CreditTransaction {
  type: string;
  amount: number;
  reference: string | null;
  txHash: string | null;
  createdAt: string;
}

export interface UnifiedCreditsInfo {
  success: boolean;
  total: number;      // available credits
  earned: number;     // total earned from purchases
  spent: number;      // total spent on generations/finalizations
  history: CreditTransaction[];
  error?: string;
}

/**
 * Get unified credits balance for a wallet
 * Combines free credits + bonus credits from domain purchases
 * @param wallet - Wallet address
 */
export async function getUnifiedCredits(wallet: string): Promise<UnifiedCreditsInfo> {
  const { data } = await api.get(`/nft/credits/${wallet}`);
  return data;
}

export interface GenerateForDomainResult {
  success: boolean;
  generationId?: string;
  domain?: string;
  images?: FluxGenerationImage[];
  successCount?: number;
  totalCount?: number;
  totalTime?: number;
  remaining?: number;
  source?: string;
  error?: string;
  status?: string;
}

/**
 * Generate image for an owned domain (from dashboard)
 * @param credentials - Auth credentials (wallet must own the domain)
 * @param fqdn - Fully qualified domain name
 * @param theme - Single theme ID
 * @param options - Optional style settings and custom prompt
 *
 * Generates 1 image per call, costs 1 credit
 */
export async function generateForDomain(
  credentials: AuthCredentials,
  fqdn: string,
  theme: string,
  options?: {
    customPrompt?: string;
    style?: 'playground' | 'animagine';
    styleId?: string;
  }
): Promise<GenerateForDomainResult> {
  try {
    const { data } = await api.post("/nft/generate-for-domain", {
      ...credentials,
      fqdn,
      theme,
      customPrompt: options?.customPrompt,
      style: options?.style,
      styleId: options?.styleId,
    });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      return error.response.data as GenerateForDomainResult;
    }
    return { success: false, error: error instanceof Error ? error.message : "Generation failed" };
  }
}

export interface FinalizeNFTResult {
  success: boolean;
  metadataUri?: string;
  metadataUrl?: string;
  imageCid?: string;
  imageUrl?: string;
  remaining?: number;
  message?: string;
  error?: string;
}

/**
 * Finalize NFT with selected generated image (from dashboard)
 * Updates the domain's NFT with the AI-generated artwork
 * @param credentials - Auth credentials (wallet must own the domain)
 * @param fqdn - Fully qualified domain name
 * @param generationId - The flux generation ID
 * @param selectedIndex - Index of selected image (0-2)
 */
export async function finalizeNFT(
  credentials: AuthCredentials,
  fqdn: string,
  generationId: string,
  selectedIndex: number
): Promise<FinalizeNFTResult> {
  try {
    const { data } = await api.post("/nft/finalize", {
      ...credentials,
      fqdn,
      generationId,
      selectedIndex,
    });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      return error.response.data as FinalizeNFTResult;
    }
    return { success: false, error: error instanceof Error ? error.message : "Finalization failed" };
  }
}

// =============================================================
//                    WATERMARK STYLES
// =============================================================

export interface WatermarkStyle {
  id: string;
  name: string;
  previewUrl: string;
}

export interface WatermarkStylesResponse {
  success: boolean;
  styles: WatermarkStyle[];
  count: number;
  default: string;
  error?: string;
}

export interface PreviewWatermarkResult {
  success: boolean;
  imageBase64: string;
  watermarkStyle: string;
  error?: string;
}

export interface FinalizeWithWatermarkResult {
  success: boolean;
  imageCID?: string;
  metadataCID?: string;
  metadataURI?: string;
  imageUrl?: string;
  metadataUrl?: string;
  watermarkStyle?: string;
  remaining?: number;
  error?: string;
}

/**
 * Get available watermark styles (34 YAY styles)
 * Returns list of styles with preview URLs
 */
export async function getWatermarkStyles(): Promise<WatermarkStylesResponse> {
  try {
    const { data } = await api.get("/watermark-styles");
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      return error.response.data as WatermarkStylesResponse;
    }
    return { success: false, styles: [], count: 0, default: 'cinematic', error: error instanceof Error ? error.message : "Failed to load watermark styles" };
  }
}

/**
 * Preview watermark on image (for cycling through styles)
 * @param imageBase64 - Original un-watermarked image
 * @param domain - Domain name for watermark text
 * @param watermarkStyle - Watermark style ID
 */
export async function previewWatermark(
  imageBase64: string,
  domain: string,
  watermarkStyle: string
): Promise<PreviewWatermarkResult> {
  try {
    const { data } = await api.post("/nft/preview-watermark", {
      imageBase64,
      domain,
      watermarkStyle,
    });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      return error.response.data as PreviewWatermarkResult;
    }
    return { success: false, imageBase64: '', watermarkStyle: '', error: error instanceof Error ? error.message : "Failed to preview watermark" };
  }
}

/**
 * Finalize NFT with selected watermark and upload to IPFS
 * @param credentials - Auth credentials
 * @param imageBase64 - Original un-watermarked image
 * @param domain - Domain name for watermark text
 * @param watermarkStyle - Selected watermark style ID
 * @param metadata - NFT metadata
 */
export async function finalizeWithWatermark(
  credentials: AuthCredentials,
  imageBase64: string,
  domain: string,
  watermarkStyle: string,
  metadata: {
    name?: string;
    description?: string;
    theme?: string;
    [key: string]: unknown;
  }
): Promise<FinalizeWithWatermarkResult> {
  try {
    const { data } = await api.post("/nft/finalize-with-watermark", {
      ...credentials,
      imageBase64,
      domain,
      watermarkStyle,
      metadata,
    });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      return error.response.data as FinalizeWithWatermarkResult;
    }
    return { success: false, error: error instanceof Error ? error.message : "Finalization with watermark failed" };
  }
}

// =============================================================
//                    FLR ADDRESS RESOLUTION
// Enables sending FLR to username.cryptofans instead of 0x...
// =============================================================

export interface ResolveResult {
  fqdn: string;
  address: string | null;
  source: 'on-chain' | 'database' | 'owner';
  verified: boolean;
  resolver: string | null;
  tokenId: number | null;
  lastUpdated: string | null;
}

export interface BatchResolveResult {
  fqdn: string;
  address: string | null;
  found: boolean;
}

export interface TextRecords {
  [key: string]: string;
}

/**
 * Resolve a domain name to a wallet address
 * @param fqdn - Fully qualified domain name (e.g., "alice.cryptofans")
 */
export async function resolveAddress(fqdn: string): Promise<ResolveResult> {
  const { data } = await api.get(`/resolve/${fqdn}`);
  return data;
}

/**
 * Resolve multiple domain names to wallet addresses
 * @param fqdns - Array of fully qualified domain names
 */
export async function batchResolveAddresses(fqdns: string[]): Promise<BatchResolveResult[]> {
  const { data } = await api.post("/resolve/batch", { fqdns });
  return data.results;
}

/**
 * Set the wallet address for a domain (requires ownership)
 * @param credentials - Authentication credentials
 * @param fqdn - Fully qualified domain name
 * @param address - Wallet address to set
 */
export async function setResolvedAddress(
  credentials: AuthCredentials,
  fqdn: string,
  address: string
): Promise<{ success: boolean; fqdn: string; address: string; message: string }> {
  const { data } = await api.post(`/resolve/${fqdn}/set`, {
    ...credentials,
    address,
  });
  return data;
}

/**
 * Get text records for a domain
 * @param fqdn - Fully qualified domain name
 * @param key - Optional specific key to retrieve
 */
export async function getTextRecords(fqdn: string, key?: string): Promise<{ fqdn: string; records: TextRecords }> {
  const params = key ? { key } : {};
  const { data } = await api.get(`/resolve/${fqdn}/text`, { params });
  return data;
}

/**
 * Set a text record for a domain (requires ownership)
 * @param credentials - Authentication credentials
 * @param fqdn - Fully qualified domain name
 * @param key - Text record key (e.g., "avatar", "url", "description")
 * @param value - Text record value (null to delete)
 */
export async function setTextRecord(
  credentials: AuthCredentials,
  fqdn: string,
  key: string,
  value: string | null
): Promise<{ success: boolean; fqdn: string; key: string; value: string | null }> {
  const { data } = await api.post(`/resolve/${fqdn}/text`, {
    ...credentials,
    key,
    value,
  });
  return data;
}

// =============================================================
//                    FLUX MULTI-GPU GENERATION
// 3x RTX 3060 parallel generation for theme selection
// =============================================================

export interface FluxTheme {
  id: string;
  name: string;
  category: 'business' | 'exotic' | 'jobs' | 'fantasy' | 'fractal' | 'nature' | 'space' | 'anime';
  modifiers: string;
}

export interface FluxThemesResult {
  success: boolean;
  themes: {
    business: FluxTheme[];
    exotic: FluxTheme[];
    jobs: FluxTheme[];
    fantasy: FluxTheme[];
    fractal: FluxTheme[];
    nature: FluxTheme[];
    space: FluxTheme[];
    anime: FluxTheme[];
  };
  totalCount: number;
  error?: string;
}

export interface FluxServerStatus {
  name: string;
  url: string;
  healthy: boolean;
  error?: string;
}

export interface FluxServersStatusResult {
  success: boolean;
  servers: FluxServerStatus[];
  availableCount: number;
  totalCount: number;
  allHealthy: boolean;
  error?: string;
}

export interface FluxGenerationImage {
  index: number;
  success: boolean;
  imageBase64?: string;
  seed?: number;
  theme: {
    id: string;
    name: string;
    category: 'business' | 'exotic' | 'jobs' | 'fantasy' | 'fractal' | 'nature' | 'space' | 'anime';
  };
  server?: string;
  generationTime?: number;
  error?: string;
  imageCID?: string;
  generationId?: string;  // Track which generation this image belongs to
}

export interface FluxGenerationResult {
  success: boolean;
  generationId: string;
  domain: string;
  images: FluxGenerationImage[];
  successCount: number;
  totalCount: number;
  totalTime: number;
  remaining?: number;
  style?: string; // Model style: 'playground' or 'animagine'
  artStyle?: {    // Art style if applied
    id: string;
    name: string;
    category: string;
  };
  error?: string;
}

export interface FluxSelectionResult {
  success: boolean;
  generationId: string;
  selectedIndex: number;
  selectedTheme?: {
    id: string;
    name: string;
    category: string;
  };
  domain?: string;
  message?: string;
  error?: string;
}

/**
 * Get creative prompt suggestions based on subdomain name, TLD, and optional description
 * Uses LLM (Ollama) for smart suggestions with TLD context, falls back to static suggestions
 */
export interface PromptSuggestionsResult {
  subdomain: string;
  tld?: string;
  description?: string;
  suggestions: string[];
  source: 'llm' | 'static';
  tip: string;
}

export async function getPromptSuggestions(subdomain: string, description?: string, tld?: string): Promise<PromptSuggestionsResult> {
  const params = new URLSearchParams();
  if (description) params.set('description', description);
  if (tld) params.set('tld', tld);
  params.set('refresh', 'true'); // Always get fresh suggestions on Generate click
  const queryString = `?${params.toString()}`;
  const { data } = await api.get(`/nft/suggest-prompt/${encodeURIComponent(subdomain)}${queryString}`);
  return data;
}

/**
 * Get all Flux themes (411 total across 8 categories)
 * Categories: business(50), exotic(50), jobs(50), fantasy(50), fractal(50), nature(50), space(50), anime(61)
 */
export async function getFluxThemes(): Promise<FluxThemesResult> {
  const { data } = await api.get("/nft/flux-themes");
  return data;
}

/**
 * Get all available art styles (60 total across 6 categories)
 * Art styles control HOW an image looks (artistic technique, rendering style)
 * Categories: artistic, digital, film, movements, rendering, mood
 */
export async function getArtStyles(): Promise<ArtStylesResult> {
  const { data } = await api.get("/nft/art-styles");
  return data;
}

/**
 * Get a single art style by ID
 * @param styleId - The art style ID (e.g., 'watercolor', 'anime', 'cinematic')
 */
export async function getArtStyle(styleId: string): Promise<ArtStyleResult> {
  const { data } = await api.get(`/nft/art-style/${styleId}`);
  return data;
}

/**
 * Get art styles for a specific category
 * @param category - Category name: artistic, digital, film, movements, rendering, mood
 */
export async function getArtStylesByCategory(category: ArtStyleCategory): Promise<{
  success: boolean;
  category: string;
  styles: ArtStyle[];
  count: number;
  error?: string;
}> {
  const { data } = await api.get(`/nft/art-styles/${category}`);
  return data;
}

/**
 * Get status of all 5 ComfyUI GPU servers
 */
export async function getFluxServersStatus(): Promise<FluxServersStatusResult> {
  const { data } = await api.get("/nft/flux-servers-status");
  return data;
}

/**
 * Image style options
 */
export type ImageStyle = 'playground' | 'animagine';

export interface FluxStylesResult {
  success: boolean;
  styles: ImageStyleOption[];
  defaultStyle: ImageStyle;
  error?: string;
}

/**
 * Get available image styles from the server
 */
export async function getFluxStyles(): Promise<FluxStylesResult> {
  const { data } = await api.get("/nft/flux-styles");
  return data;
}

export interface ImageStyleOption {
  id: ImageStyle;
  name: string;
  description: string;
}

export const IMAGE_STYLES: ImageStyleOption[] = [
  { id: 'playground', name: 'Photorealistic', description: 'High-quality photorealistic images' },
  { id: 'animagine', name: 'Anime', description: 'Stylized anime aesthetic' },
];

/**
 * Generate a single image
 * @param subdomain - Subdomain name
 * @param tld - TLD name
 * @param theme - Single theme ID
 * @param customPrompt - Optional custom prompt
 * @param wallet - Wallet address for credit tracking
 * @param style - Image style: 'playground' (photorealistic) or 'animagine' (anime)
 * @param styleId - Optional art style ID (e.g., 'watercolor', 'cinematic') - controls visual rendering
 *
 * Generates 1 image per call, costs 1 credit
 */
export async function generateFluxParallel(
  subdomain: string,
  tld: string,
  theme: string,
  customPrompt: string | undefined,
  wallet: string,
  style: ImageStyle = 'playground',
  styleId?: string
): Promise<FluxGenerationResult> {
  const { data } = await api.post("/nft/flux-generate-parallel", {
    subdomain,
    tld,
    themes: [theme], // Backend still expects array, send single-element array
    customPrompt,
    wallet,
    style,
    styleId,
  });
  return data;
}

/**
 * Get status/result of a flux generation
 * @param generationId - The generation ID from generateFluxParallel
 */
export async function getFluxGenerationStatus(generationId: string): Promise<FluxGenerationResult> {
  const { data } = await api.get(`/nft/flux-generation/${generationId}`);
  return data;
}

/**
 * Select an image from a flux generation for NFT minting
 * @param generationId - The generation ID
 * @param selectedIndex - Index of selected image (0, 1, or 2)
 * @param wallet - Wallet address
 */
export async function selectFluxImage(
  generationId: string,
  selectedIndex: number,
  wallet: string
): Promise<FluxSelectionResult> {
  const { data } = await api.post("/nft/flux-select", {
    generationId,
    selectedIndex,
    wallet,
  });
  return data;
}

/**
 * Prepare NFT from already-generated Flux image (no regeneration)
 * This uses the selected Flux image and uploads it to IPFS without
 * regenerating - avoiding VRAM issues and the "Stable Diffusion" flow.
 * @param generationId - The Flux generation ID
 * @param selectedIndex - Index of selected image (0, 1, or 2)
 * @param subdomain - Subdomain name
 * @param tld - TLD name
 * @param wallet - Wallet address
 */
export async function prepareFluxNFT(
  generationId: string,
  selectedIndex: number,
  subdomain: string,
  tld: string,
  wallet: string
): Promise<NFTPrepareResult & { generationId?: string; selectedIndex?: number; theme?: string }> {
  const { data } = await api.post("/nft/flux-prepare", {
    generationId,
    selectedIndex,
    subdomain,
    tld,
    wallet,
  });
  return data;
}

// =============================================================
//                    FAVORITES API
// =============================================================

export interface FavoritesResponse {
  success: boolean;
  favorites: {
    themes: string[];
    styles: string[];
    count: number;
  };
  error?: string;
}

/**
 * Get user favorites by wallet address
 */
export async function getFavorites(walletAddress: string): Promise<FavoritesResponse> {
  const { data } = await api.get(`/favorites/${walletAddress}`);
  return data;
}

/**
 * Add a favorite theme or style
 */
export async function addFavorite(
  walletAddress: string,
  themeId?: string,
  styleId?: string
): Promise<{ success: boolean }> {
  const { data } = await api.post("/favorites", {
    walletAddress,
    themeId,
    styleId,
  });
  return data;
}

/**
 * Remove a favorite theme or style
 */
export async function removeFavorite(
  walletAddress: string,
  themeId?: string,
  styleId?: string
): Promise<{ success: boolean }> {
  const { data } = await api.delete("/favorites", {
    data: { walletAddress, themeId, styleId },
  });
  return data;
}

// =============================================================
//                    SHARE PREVIEW API
// =============================================================

export interface SharePreviewData {
  imageHash: string;
  domain: string;
  model: string;
  themes: string[];
  walletAddress: string;
}

export interface SharePreviewResponse {
  success: boolean;
  shareId: string;
  shareUrl: string;
}

export interface SharedImageResponse {
  success: boolean;
  share?: {
    imageUrl: string;
    domain: string;
    model: string;
    themes: string[];
    createdAt: string;
    views: number;
  };
  error?: string;
}

/**
 * Create a shareable link for a generated image
 */
export async function createSharePreview(data: SharePreviewData): Promise<SharePreviewResponse> {
  const response = await api.post("/share-preview", data);
  return response.data;
}

/**
 * Create a shareable link for an existing domain (owned or listed)
 */
export async function shareDomain(domain: string): Promise<SharePreviewResponse> {
  const response = await api.post("/share-domain", { domain });
  return response.data;
}

/**
 * Get shared image data by share ID
 */
export async function getSharedImage(shareId: string): Promise<SharedImageResponse> {
  const { data } = await api.get(`/share/${shareId}`);
  return data;
}

// =============================================================
//                    THEMES API (Enhanced)
// =============================================================

export interface ThemeWithThumbnail extends FluxTheme {
  thumbnail?: string;
  thumbnailPlaceholder?: string;
}

export interface ThemesWithThumbnailsResponse {
  success: boolean;
  themes: ThemeWithThumbnail[];
  count: number;
}

/**
 * Get all themes with thumbnail paths
 */
export async function getThemesWithThumbnails(): Promise<ThemesWithThumbnailsResponse> {
  const { data } = await api.get("/themes");
  return data;
}

export interface SyncFavoritesResponse {
  success: boolean;
  favorites: {
    themes: string[];
    added: number;
    total: number;
  };
  error?: string;
}

/**
 * Sync localStorage favorites with server (merges both)
 */
export async function syncFavorites(
  walletAddress: string,
  themes: string[]
): Promise<SyncFavoritesResponse> {
  const { data } = await api.post("/favorites/sync", {
    walletAddress,
    themes,
  });
  return data;
}

// =============================================================
//                    SHOWCASE IMAGES API
// =============================================================

export interface ShowcaseImage {
  id: string;
  url: string;
  theme?: string;
  domain?: string;
  styleName?: string;
  themeName?: string;
  model?: string;
}

export interface ShowcaseImagesResponse {
  success: boolean;
  images: ShowcaseImage[];
  source: 'matrix_test' | 'curated' | 'generated' | 'fallback';
  count: number;
  seed?: number;
  totalAvailable?: number;
  error?: string;
}

/**
 * Get curated showcase images for the register page marquee gallery
 * Returns images from curated showcase directory, recent generations, or fallback placeholders
 */
export async function getShowcaseImages(batchSize = 24, seed?: number): Promise<ShowcaseImagesResponse> {
  try {
    const params: Record<string, string> = { batch_size: String(batchSize) };
    if (seed !== undefined) params.seed = String(seed);
    const { data } = await api.get("/showcase/images", { params });

    // Convert backend API paths to frontend proxy paths
    // Backend returns: /api/v1/showcase/placeholder/0
    // Frontend needs: /api/proxy/showcase/placeholder/0
    const imagesWithProxyUrls = data.images?.map((img: ShowcaseImage) => ({
      ...img,
      url: img.url.startsWith('/api/v1/')
        ? img.url.replace('/api/v1/', '/api/proxy/')
        : img.url,
    })) || [];

    return {
      ...data,
      images: imagesWithProxyUrls,
    };
  } catch (error) {
    // Return fallback on error
    return {
      success: false,
      images: [],
      source: 'fallback',
      count: 0,
      error: error instanceof Error ? error.message : 'Failed to load showcase images',
    };
  }
}

// =============================================================
//                    URL FORWARDING
// =============================================================

export interface UrlForward {
  target_url: string;
  redirect_type: 301 | 302;
  path_forwarding: boolean;
  enabled: boolean;
}

export interface UrlForwardResponse {
  configured: boolean;
  forward?: UrlForward;
}

/**
 * Get URL forward config for a domain
 */
export async function getUrlForward(subdomain: string, tld: string): Promise<UrlForwardResponse> {
  const { data } = await api.get(`/dns/${subdomain}/${tld}/forward`);
  return data;
}

/**
 * Set URL forward for a domain (requires auth)
 */
export async function setUrlForward(
  credentials: AuthCredentials,
  subdomain: string,
  tld: string,
  forward: UrlForward
): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post(`/dns/${subdomain}/${tld}/forward`, {
    ...credentials,
    ...forward,
  });
  return data;
}

/**
 * Delete URL forward for a domain (requires auth)
 */
export async function deleteUrlForward(
  credentials: AuthCredentials,
  subdomain: string,
  tld: string
): Promise<{ success: boolean; message: string }> {
  const { data } = await api.delete(`/dns/${subdomain}/${tld}/forward`, {
    data: credentials,
  });
  return data;
}

// =============================================================
//                    IPFS CONTENTHASH
// =============================================================

export interface ContenthashResponse {
  configured: boolean;
  cid?: string;
  dnslink?: boolean;
  gateway_url?: string;
}

/**
 * Get contenthash config for a domain
 */
export async function getContenthash(subdomain: string, tld: string): Promise<ContenthashResponse> {
  const { data } = await api.get(`/dns/${subdomain}/${tld}/contenthash`);
  return data;
}

/**
 * Set contenthash for a domain (requires auth)
 */
export async function setContenthash(
  credentials: AuthCredentials,
  subdomain: string,
  tld: string,
  cid: string
): Promise<{ success: boolean; message: string; cid: string }> {
  const { data } = await api.post(`/dns/${subdomain}/${tld}/contenthash`, {
    ...credentials,
    cid,
  });
  return data;
}

/**
 * Delete contenthash for a domain (requires auth)
 */
export async function deleteContenthash(
  credentials: AuthCredentials,
  subdomain: string,
  tld: string
): Promise<{ success: boolean; message: string }> {
  const { data } = await api.delete(`/dns/${subdomain}/${tld}/contenthash`, {
    data: credentials,
  });
  return data;
}

// =============================================================
//                    SEARCH SUGGESTIONS
// =============================================================

export interface SearchSuggestion {
  subdomain: string;
  fqdn: string;
  available: boolean;
  tier: string;
  priceUSD?: number;
}

export interface SuggestionsResult {
  suggestions: SearchSuggestion[];
  corrections: string[];
}

export async function getSuggestions(
  q: string,
  filters?: { tld?: string; minLen?: number; maxLen?: number; minPrice?: number; maxPrice?: number }
): Promise<SuggestionsResult> {
  const params: Record<string, string> = { q };
  if (filters?.tld) params.tld = filters.tld;
  if (filters?.minLen) params.minLen = String(filters.minLen);
  if (filters?.maxLen) params.maxLen = String(filters.maxLen);
  if (filters?.minPrice) params.minPrice = String(filters.minPrice);
  if (filters?.maxPrice) params.maxPrice = String(filters.maxPrice);
  const { data } = await api.get("/search/suggest", { params });
  return data;
}

// =============================================================
//                    AVAILABILITY ALERTS
// =============================================================

export async function watchDomain(
  credentials: AuthCredentials,
  fqdn: string
): Promise<{ success: boolean; fqdn: string }> {
  const { data } = await api.post("/alerts/watch", { ...credentials, fqdn });
  return data;
}

export async function unwatchDomain(
  credentials: AuthCredentials,
  fqdn: string
): Promise<{ success: boolean }> {
  const { data } = await api.delete(`/alerts/watch/${encodeURIComponent(fqdn)}`, {
    data: credentials,
  });
  return data;
}

export async function getWatchedDomains(
  wallet: string
): Promise<{ watches: Array<{ fqdn: string; status: string; created_at: string; notified_at: string | null }> }> {
  const { data } = await api.get(`/alerts/${wallet}`);
  return data;
}

export async function checkAlerts(
  wallet: string
): Promise<{ available: string[] }> {
  const { data } = await api.get(`/alerts/check/${wallet}`);
  return data;
}

// =============================================================
//                    MARKETPLACE LISTING LOOKUP
// =============================================================

export interface MarketplaceListing {
  listingId: number;
  tokenId: string;
  seller: string;
  price: number;
  endTime: number;
  listingType: number;
  status: number;
  highestBidder: string;
  highestBid: number;
  createdAt: number;
  fullDomain?: string;
  subdomain?: string;
  tld?: string;
  imageUrl?: string | null;
}

/**
 * Check if a domain is listed on the marketplace
 * @param fqdn - Fully qualified domain name (e.g., "alice.cryptofans")
 * @returns The listing if found, or null
 */
export async function getMarketplaceListing(fqdn: string): Promise<MarketplaceListing | null> {
  try {
    const { data } = await api.get("/marketplace/listings", {
      params: { search: fqdn, limit: 1 },
    });
    const listings: MarketplaceListing[] = data.listings || [];
    // Exact match only — the search endpoint may return partial matches
    return listings.find((l) => l.fullDomain === fqdn) ?? null;
  } catch {
    return null;
  }
}

// =============================================================
//                    PROFILE PAGES
// =============================================================

export interface ProfileData {
  fqdn: string;
  subdomain: string;
  owner_wallet: string;
  token_id: number;
  nft_image_cid: string | null;
  contenthash: string | null;
  tier: string;
  bio: string | null;
  layout: string;
  primary_color: string;
  bg_color: string;
  show_avatar: boolean;
  show_nft: boolean;
  textRecords: Record<string, string>;
  domain_mode: string;
}

export interface ProfileSettings {
  bio?: string;
  layout?: string;
  primary_color?: string;
  bg_color?: string;
  show_avatar?: boolean;
  show_nft?: boolean;
  domain_mode?: string;
}

/**
 * Get public profile data for a domain
 */
export async function getProfile(fqdn: string): Promise<{ profile: ProfileData }> {
  const { data } = await api.get(`/profile/${encodeURIComponent(fqdn)}`);
  return data;
}

/**
 * Update profile settings for a domain (requires auth)
 */
export async function updateProfileSettings(
  credentials: AuthCredentials,
  fqdn: string,
  settings: ProfileSettings
): Promise<{ success: boolean; message: string }> {
  const { data } = await api.put(`/profile/${encodeURIComponent(fqdn)}/settings`, {
    ...credentials,
    ...settings,
  });
  return data;
}

// ============================================================
// Notifications
// ============================================================

export interface Notification {
  id: number;
  domain_id: number;
  fqdn: string;
  reminder_days: number;
  reminder_type: string;
  is_read: boolean;
  created_at: string;
  expiration_date: string | null;
  token_id: number | null;
}

export async function getNotifications(wallet: string): Promise<Notification[]> {
  const { data } = await api.get(`/notifications/${wallet.toLowerCase()}`);
  return data.notifications;
}

export async function getNotificationCount(wallet: string): Promise<number> {
  const { data } = await api.get(`/notifications/${wallet.toLowerCase()}/count`);
  return data.count;
}

export async function markNotificationRead(id: number): Promise<void> {
  await api.patch(`/notifications/${id}/read`);
}

export async function dismissNotification(id: number): Promise<void> {
  await api.patch(`/notifications/${id}/dismiss`);
}

export async function markAllNotificationsRead(wallet: string): Promise<void> {
  await api.patch(`/notifications/${wallet.toLowerCase()}/read-all`);
}

// =============================================================
//                    DOMAIN TRANSFER & BULK OPERATIONS
// =============================================================

/**
 * Transfer domain ownership (after on-chain transfer)
 */
export async function transferDomain(
  credentials: AuthCredentials,
  fqdn: string,
  toAddress: string,
  txHash: string
): Promise<{ success: boolean; fqdn: string }> {
  const { data } = await api.post("/domains/transfer", {
    ...credentials,
    fqdn,
    toAddress,
    txHash,
  });
  return data;
}

/**
 * Bulk update DNS records for multiple domains
 */
export async function bulkUpdateDNS(
  credentials: AuthCredentials,
  fqdns: string[],
  records: Record<string, string>
): Promise<{ results: { fqdn: string; success: boolean; error?: string }[] }> {
  const { data } = await api.post("/domains/bulk-dns", {
    ...credentials,
    fqdns,
    records,
  });
  return data;
}

/**
 * Bulk transfer domains (after on-chain transfers)
 */
export async function bulkTransferDomains(
  credentials: AuthCredentials,
  fqdns: string[],
  toAddress: string,
  txHash: string
): Promise<{ results: { fqdn: string; success: boolean; error?: string }[] }> {
  const { data } = await api.post("/domains/bulk-transfer", {
    ...credentials,
    fqdns,
    toAddress,
    txHash,
  });
  return data;
}

// =============================================================
//                    DEVELOPER API KEYS
// =============================================================

export interface ApiKey {
  id: number;
  label: string;
  tier: string;
  requests_today: number;
  requests_month: number;
  daily_limit: number;
  last_request_at: string | null;
  created_at: string;
}

export async function getApiKeys(credentials: AuthCredentials): Promise<ApiKey[]> {
  const { data } = await api.post("/api-keys/list", credentials);
  return data.keys;
}

export async function createApiKey(credentials: AuthCredentials, label: string): Promise<{ key: string; label: string }> {
  const { data } = await api.post("/api-keys", { ...credentials, label });
  return data;
}

export async function revokeApiKey(credentials: AuthCredentials, keyId: number): Promise<void> {
  await api.delete(`/api-keys/${keyId}`, { data: credentials });
}

// =============================================================
//                    EMAIL NOTIFICATIONS
// =============================================================

export interface EmailPreferences {
  registration: boolean;
  marketplace: boolean;
  renewal: boolean;
  marketing: boolean;
}

export interface EmailStatus {
  registered: boolean;
  email?: string;
  verified?: boolean;
  preferences?: EmailPreferences;
  registeredAt?: string;
  verifiedAt?: string;
}

export async function getEmailStatus(credentials: AuthCredentials): Promise<EmailStatus> {
  const { data } = await api.post("/email/status", credentials);
  return data;
}

export async function registerEmail(credentials: AuthCredentials, email: string): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post("/email/register", { ...credentials, email });
  return data;
}

export async function updateEmailPreferences(
  credentials: AuthCredentials,
  preferences: Partial<EmailPreferences>
): Promise<{ success: boolean; preferences: EmailPreferences }> {
  const { data } = await api.put("/email/preferences", { ...credentials, ...preferences });
  return data;
}

export async function deleteEmailRegistration(credentials: AuthCredentials): Promise<{ success: boolean }> {
  const { data } = await api.delete("/email", { data: credentials });
  return data;
}

// =============================================================
//                    DOMAIN DEFAULTS
// =============================================================

export interface DomainDefaults {
  ipv4: string;
  ipv6: string;
  cname: string;
  txt: string;
  defaultLayout: string;
  autoApply: boolean;
}

export async function getDomainDefaults(credentials: AuthCredentials): Promise<DomainDefaults> {
  const { data } = await api.post("/defaults", credentials);
  return data;
}

export async function saveDomainDefaults(
  credentials: AuthCredentials,
  defaults: Partial<DomainDefaults>
): Promise<DomainDefaults & { success: boolean }> {
  const { data } = await api.put("/defaults", { ...credentials, ...defaults });
  return data;
}

// =============================================================
//                    V2 API (TLD Staking)
// =============================================================

// When API_URL ends with /v1 (direct backend), swap to /v2.
// When API_URL is a proxy path like /api/proxy, append /v2 so the
// proxy route can detect the v2 prefix and forward accordingly.
const API_V2_URL = API_URL.endsWith('/v1')
  ? API_URL.replace(/\/v1$/, '/v2')
  : `${API_URL}/v2`;

const apiV2 = axios.create({
  baseURL: API_V2_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

export interface V2TldInfo {
  tokenId: number | null;
  label: string;
  namehash: string;
  owner: string;
  registrationEnabled: boolean;
  sldCount: number;
  pricing: {
    lengthPricesUsdCents: number[];
    multiYearDiscountsBps: number[];
  } | null;
  createdAt: string;
}

export interface V2StakingClaim {
  id: number;
  tldLabel: string;
  namehash: string;
  stakingFeePaid: string;
  fdcRoundId: number | null;
  status: string;
  txHash: string | null;
  createdAt: string;
  completedAt: string | null;
  attempts: number;
  lastError: string | null;
  tokenId: number | null;
  registrationEnabled: boolean;
}

/**
 * Get all V2 TLDs (public, no auth required)
 */
export async function getV2Tlds(): Promise<V2TldInfo[]> {
  const { data } = await apiV2.get("/tlds");
  return data.tlds;
}

/**
 * Get staking claims for the authenticated wallet
 */
export async function getV2MyClaims(credentials: AuthCredentials): Promise<V2StakingClaim[]> {
  const { data } = await apiV2.post("/staking/my-claims", credentials);
  return data.claims;
}

// =============================================================
//                    V2 Domain (SLD) Types & API
// =============================================================

export interface V2DomainArtwork {
  status: string;
  ipfsCid: string | null;
  imageUrl: string | null;
  generationTimeMs: number | null;
}

export interface V2Domain {
  tokenId: number;
  label: string;
  tld: string;
  fullName: string;
  namehash: string;
  registrationTime: string;
  expiryTime: string;
  daysUntilExpiry: number;
  isExpired: boolean;
  isInGracePeriod: boolean;
  registrationPriceUsdCents: number;
  resolverAddress: string;
  artwork: V2DomainArtwork;
}

export interface V2MyDomainsResponse {
  wallet: string;
  domains: V2Domain[];
  count: number;
}

/**
 * Get V2 domains owned by the authenticated wallet
 */
export async function getV2MyDomains(credentials: AuthCredentials): Promise<V2MyDomainsResponse> {
  const { data } = await apiV2.post("/my-domains", credentials);
  return data;
}

/**
 * Get V2 domains expiring within N days
 */
export async function getV2ExpiringDomains(
  credentials: AuthCredentials,
  days = 90
): Promise<V2Domain[]> {
  const { data } = await apiV2.post(`/my-domains/expiring?days=${days}`, credentials);
  return data.domains;
}

export default api;
