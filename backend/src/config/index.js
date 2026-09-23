import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __cfg_filename = fileURLToPath(import.meta.url);
const __cfg_dirname = path.dirname(__cfg_filename);
dotenv.config({ path: path.resolve(__cfg_dirname, "../../.env") });

export const config = {
  // Server
  port: process.env.PORT || 8000,
  env: process.env.NODE_ENV || 'development',

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://halcyon:REDACTED@localhost:5432/halcyon',

  // HNS Node
  hns: {
    host: process.env.HNS_HOST || 'localhost',
    port: parseInt(process.env.HNS_PORT || '12037'),
    apiKey: process.env.HNS_API_KEY || '',
    walletPort: parseInt(process.env.HNS_WALLET_PORT || '12039'),
  },

  // Flare Network
  flare: {
    rpcUrl: process.env.FLARE_RPC_URL || 'https://coston2-api.flare.network/ext/C/rpc',
    chainId: parseInt(process.env.FLARE_CHAIN_ID || '114'),
    privateKey: process.env.BACKEND_PRIVATE_KEY || '',
  },

  // Contracts
  contracts: {
    nft: process.env.CONTRACT_NFT || '',
    escrow: process.env.CONTRACT_ESCROW || '',
    dnsOracle: process.env.CONTRACT_DNS_ORACLE || '',
    priceOracle: process.env.CONTRACT_PRICE_ORACLE || '',
    marketplace: process.env.CONTRACT_MARKETPLACE || '',
  },

  // v2 Staking Contracts
  contractsV2: {
    hsrTld: process.env.CONTRACT_V2_HSR_TLD || '',
    hsrSld: process.env.CONTRACT_V2_HSR_SLD || '',
    sldRegistrationManager: process.env.CONTRACT_V2_SLD_REG_MANAGER || '',
    paymentManager: process.env.CONTRACT_V2_PAYMENT_MANAGER || '',
    defaultRegistrationStrategy: process.env.CONTRACT_V2_DEFAULT_STRATEGY || '',
    tldClaimManager: process.env.CONTRACT_V2_TLD_CLAIM_MANAGER || '',
  },

  // FDC Keeper Bot
  fdcKeeper: {
    enabled: process.env.FDC_KEEPER_ENABLED === 'true',
    privateKey: process.env.KEEPER_PRIVATE_KEY || '',
    daLayerUrl: process.env.DA_LAYER_URL || 'https://ctn2-data-availability.flare.network',
    pollIntervalMs: parseInt(process.env.FDC_KEEPER_POLL_MS || '30000'),
  },

  // Backend Wallet
  backendPrivateKey: process.env.BACKEND_PRIVATE_KEY || '',

  // Platform
  platformWallet: process.env.PLATFORM_WALLET || '',

  // Treasury (receives credit purchases)
  treasuryAddress: process.env.TREASURY_ADDRESS || process.env.PLATFORM_WALLET || '',

  // Grace Period & Expired Domain Auction Settings
  gracePeriod: {
    days: parseInt(process.env.GRACE_PERIOD_DAYS || '60'),
    treasuryAddress: process.env.TREASURY_ADDRESS || '',
    auctionDurationDays: 14,
    priceDropPercent: 1,
    priceFloorPercent: 30,
  },

  // Operator wallet (for reclaimExpired calls + is_official checks)
  operatorPrivateKey: process.env.OPERATOR_PRIVATE_KEY || '',
  operatorAddress: process.env.OPERATOR_ADDRESS || '',

  // Treasury wallet (for listAuction calls)
  treasuryPrivateKey: process.env.TREASURY_PRIVATE_KEY || '',

  // Royalties wallet (marketplace sale royalties)
  royaltiesPrivateKey: process.env.ROYALTIES_PRIVATE_KEY || '',
  royaltiesAddress: process.env.ROYALTIES_ADDRESS || '',

  // HNS Marketplace Escrow
  hnsEscrow: {
    secret: process.env.HNS_ESCROW_SECRET || 'REDACTED',
    walletId: 'hsr-platform-escrow',
  },

  // Credit Purchase Settings
  creditPurchasePrice: process.env.CREDIT_PURCHASE_PRICE || '5000000000000000000', // 5 FLR in wei
  creditsPerPurchase: parseInt(process.env.CREDITS_PER_PURCHASE || '5', 10),

  // Default A record for auto-DNS on V2 SLD registration
  defaultARecordIP: process.env.DEFAULT_A_RECORD_IP || '',

  // Redirect Server
  redirectServerIP: process.env.REDIRECT_SERVER_IP || '',
  redirectPort: parseInt(process.env.REDIRECT_PORT || '8080'),

  // Pinata (IPFS - Primary)
  pinata: {
    jwt: process.env.PINATA_JWT || '',
  },

  // NFT.storage (IPFS - Backup)
  nftStorage: {
    apiKey: process.env.NFT_STORAGE_API_KEY || '',
  },

  // Stable Diffusion
  stableDiffusion: {
    modelId: process.env.SD_MODEL_ID || 'runwayml/stable-diffusion-v1-5',
    pythonCmd: process.env.PYTHON_CMD || 'python3',
  },

  // Email (Resend)
  email: {
    apiKey: process.env.RESEND_API_KEY || '',
    fromAddress: process.env.EMAIL_FROM || 'Halcyon <noreply@mail.halcyon-names.io>',
    enabled: process.env.EMAIL_ENABLED === 'true',
    unsubscribeUrl: process.env.EMAIL_BASE_URL || 'https://halcyon-names.io/api/v1/email/unsubscribe',
  },

  // Flux Multi-GPU (parallel generation across multiple machines)
  // Add remote GPUs via FLUX_EXTRA_SERVERS env var (comma-separated URLs)
  // Example: FLUX_EXTRA_SERVERS=http://192.168.1.100:8188,http://192.168.1.101:8188
  fluxMultiGPU: {
    enabled: process.env.FLUX_MULTI_GPU_ENABLED !== 'false',
    // All GPUs are remote - no local GPUs on 10.0.0.39
    // 4x RTX 3080 (.67, .220) + 2x RTX 3060 (.249)
    servers: [
      ...(process.env.FLUX_EXTRA_SERVERS
        ? process.env.FLUX_EXTRA_SERVERS.split(',').map((url, i) => ({
            url: url.trim(),
            name: `GPU${i}`,
            isDisplayGPU: false,
            gpuType: url.includes('.249') ? '3060' : '3080',
            priority: 1,
          }))
        : []),
    ],
    themesFile: process.env.FLUX_THEMES_FILE || '/home/localai/Desktop/HSR/scripts/themes_100.json',
    outputDir: process.env.FLUX_OUTPUT_DIR || '/home/localai/Desktop/FluxMultiGPU_Output/HSR',
    // Display GPU protection settings
    displayGPU: {
      // Max VRAM usage (MB) before refusing to queue on display GPU
      // RTX 3060 has 12GB, reserve 2GB for display = 10GB max for generation
      maxVramMB: parseInt(process.env.DISPLAY_GPU_MAX_VRAM_MB || '10000'),
      // Prefer non-display GPUs when available
      preferNonDisplay: process.env.DISPLAY_GPU_PREFER_OTHERS !== 'false',
    },
  },
};

export default config;
