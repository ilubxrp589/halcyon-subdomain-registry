/**
 * NFT Metadata & Image Generation Service
 * Generates OpenSea-compatible metadata and dynamic images for subdomain NFTs
 * Supports both canvas-based generation (legacy) and AI-generated images via Stable Diffusion
 */

import { createCanvas, registerFont } from 'canvas';
import { query } from '../db/index.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTier as sdGetTier, calculateSeed, getThemesForTier, getThemesWithDescriptions, ART_THEMES } from './stableDiffusion.js';
import sdxlMultiGPUService from './sdxlMultiGPU.js';
import nftStorageService from './nftStorage.js';

// Regeneration credits pricing (in FLR)
const REGEN_CREDITS_PRICE_FLR = 0.5; // 0.5 FLR for 10 regenerations
const REGEN_CREDITS_PER_PURCHASE = 10;
const FREE_REGENERATIONS = 10;

// Preview credits constants
const FREE_PREVIEWS_PER_THEME = 10;
const PREVIEW_CREDITS_PER_PURCHASE = 10;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// =============================================================
//                     CONFIGURATION
// =============================================================

const CONFIG = {
  // Image dimensions
  width: 1200,
  height: 1200,

  // Network (from env or default)
  network: process.env.FLARE_CHAIN_ID === '14' ? 'MAINNET' : 'COSTON2',
  chainId: process.env.FLARE_CHAIN_ID || '114',

  // Colors by tier
  tiers: {
    ultra_premium: {
      name: 'Ultra Premium',
      gradient: ['#FFD700', '#FFA500', '#FF6B00'],
      accent: '#FFD700',
      glow: 'rgba(255, 215, 0, 0.3)',
    },
    premium: {
      name: 'Premium',
      gradient: ['#9333EA', '#7C3AED', '#6D28D9'],
      accent: '#A855F7',
      glow: 'rgba(147, 51, 234, 0.3)',
    },
    standard_plus: {
      name: 'Standard+',
      gradient: ['#0EA5E9', '#0284C7', '#0369A1'],
      accent: '#38BDF8',
      glow: 'rgba(14, 165, 233, 0.3)',
    },
    standard: {
      name: 'Standard',
      gradient: ['#10B981', '#059669', '#047857'],
      accent: '#34D399',
      glow: 'rgba(16, 185, 129, 0.3)',
    },
  },

  // Base URL for metadata
  baseUrl: process.env.METADATA_BASE_URL || 'http://localhost:8000',
};

// =============================================================
//                     HELPER FUNCTIONS
// =============================================================

/**
 * Get tier based on subdomain length
 */
function getTier(subdomain) {
  const length = subdomain.length;
  if (length === 1) return 'ultra_premium';
  if (length === 2) return 'premium';
  if (length === 3) return 'standard_plus';
  return 'standard';
}

/**
 * Format date for display
 */
function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Truncate text to fit width
 */
function truncateText(ctx, text, maxWidth) {
  let truncated = text;
  while (ctx.measureText(truncated).width > maxWidth && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
  }
  if (truncated !== text) {
    truncated = truncated.slice(0, -2) + '...';
  }
  return truncated;
}

// =============================================================
//                     IMAGE GENERATION
// =============================================================

/**
 * Generate NFT image for a subdomain
 * @param {Object} domainData - Domain data from database
 * @param {Object} options - Generation options
 * @returns {Buffer} PNG image buffer
 */
export async function generateImage(domainData, options = {}) {
  const {
    subdomain,
    tld_name: tld,
    tier: tierOverride,
  } = domainData;

  const tier = tierOverride || getTier(subdomain);
  const theme = options.theme || 'cosmic';
  const customPrompt = options.customPrompt || null;

  console.log(`[NFT] Generating AI image for ${subdomain}.${tld} (theme: ${theme}) via sdxlMultiGPU`);

  try {
    const result = await sdxlMultiGPUService.generateSingle({
      domain: `${subdomain}.${tld}`,
      themeId: theme,
      customPrompt,
      seed: options.seed,
      randomSeed: options.randomSeed || false,
    });

    if (result.success && result.imageBuffer) {
      console.log(`[NFT] AI image generated successfully (${result.imageBuffer.length} bytes)`);
      return result.imageBuffer;
    } else {
      console.error('[NFT] AI generation failed:', result.error);
      throw new Error(result.error || 'Image generation failed');
    }
  } catch (error) {
    console.error('[NFT] generateImage error:', error.message);
    throw error;
  }
}

/**
 * Generate a placeholder image for unknown domains
 */
export async function generatePlaceholder(fqdn) {
  const canvas = createCanvas(CONFIG.width, CONFIG.height);
  const ctx = canvas.getContext('2d');

  // Dark background
  ctx.fillStyle = '#0F0F1A';
  ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);

  // Question mark
  ctx.font = 'bold 300px sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', CONFIG.width / 2, CONFIG.height / 2 - 50);

  // Domain text
  ctx.font = 'bold 48px sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillText(fqdn || 'Unknown Domain', CONFIG.width / 2, CONFIG.height / 2 + 150);

  // Status
  ctx.font = '24px sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fillText('NOT REGISTERED', CONFIG.width / 2, CONFIG.height / 2 + 200);

  return canvas.toBuffer('image/png');
}

// =============================================================
//                     METADATA GENERATION
// =============================================================

/**
 * Generate OpenSea-compatible metadata for a subdomain
 */
export async function generateMetadata(domainData, imageUrl) {
  const {
    subdomain,
    tld_name: tld,
    fqdn,
    tier: tierOverride,
    registration_date,
    expiry_date,
    token_id,
    owner_wallet,
    registration_price_flr,
    registration_price_usd,
    dns_active,
  } = domainData;

  const tier = tierOverride || getTier(subdomain);
  const tierConfig = CONFIG.tiers[tier] || CONFIG.tiers.standard;

  return {
    name: fqdn,
    description: `${fqdn} - A Handshake subdomain NFT on Flare Network. This NFT represents ownership of the ${subdomain}.${tld} subdomain and includes DNS management capabilities.`,
    image: imageUrl,
    external_url: `https://${fqdn}`,

    // OpenSea-specific
    background_color: '0F0F1A',

    attributes: [
      {
        trait_type: 'TLD',
        value: tld,
      },
      {
        trait_type: 'Subdomain',
        value: subdomain,
      },
      {
        trait_type: 'Tier',
        value: tierConfig.name,
      },
      {
        trait_type: 'Length',
        value: subdomain.length,
        display_type: 'number',
      },
      {
        trait_type: 'DNS Active',
        value: dns_active ? 'Yes' : 'No',
      },
      ...(registration_date ? [{
        trait_type: 'Registered',
        value: Math.floor(new Date(registration_date).getTime() / 1000),
        display_type: 'date',
      }] : []),
      ...(expiry_date ? [{
        trait_type: 'Expires',
        value: Math.floor(new Date(expiry_date).getTime() / 1000),
        display_type: 'date',
      }] : []),
      ...(registration_price_usd ? [{
        trait_type: 'Purchase Price (USD)',
        value: parseFloat(registration_price_usd),
        display_type: 'number',
      }] : []),
    ],

    // Additional properties
    properties: {
      token_id,
      owner: owner_wallet,
      network: 'Flare Coston2',
      protocol: 'Handshake',
    },
  };
}

/**
 * Fetch domain data from database
 */
export async function getDomainData(fqdn) {
  try {
    // Try V1 domains table first
    const result = await query(`
      SELECT d.*, t.name as tld_name
      FROM domains d
      JOIN tlds t ON d.tld_id = t.id
      WHERE d.fqdn = $1
    `, [fqdn.toLowerCase()]);

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Fallback to V2 slds_v2 table
    const v2Result = await query(`
      SELECT s.id, s.token_id, s.label AS subdomain, s.full_name AS fqdn,
             s.owner_address AS owner_wallet, s.registration_time, s.expiry_time,
             t.label AS tld_name,
             a.ipfs_cid AS nft_image_cid, a.status AS nft_status
      FROM slds_v2 s
      JOIN tlds_v2 t ON t.id = s.tld_id
      LEFT JOIN sld_artwork_v2 a ON a.sld_id = s.id
      WHERE s.full_name = $1
      ORDER BY a.created_at DESC
      LIMIT 1
    `, [fqdn.toLowerCase()]);

    if (v2Result.rows.length > 0) {
      const row = v2Result.rows[0];
      return {
        ...row,
        nft_status: row.nft_status === 'completed' ? 'customized' : row.nft_status,
      };
    }

    return null;
  } catch (error) {
    console.error('Error fetching domain data:', error);
    return null;
  }
}

// =============================================================
//                     AI IMAGE GENERATION (SD)
// =============================================================

/**
 * Generate NFT image using Stable Diffusion
 * @param {Object} domainData - Domain data
 * @returns {Promise<{success: boolean, imageBuffer?: Buffer, seed?: number, tier?: string, error?: string}>}
 */
export async function generateAIImage(domainData) {
  const { subdomain, tld_name: tld } = domainData;

  const result = await sdxlMultiGPUService.generateSingle({
    domain: `${subdomain}.${tld}`,
    themeId: 'cosmic',
  });

  return result;
}

/**
 * Generate and upload NFT image and metadata to IPFS
 * @param {Object} domainData - Domain data from database or mock
 * @returns {Promise<{success: boolean, imageCID?: string, metadataCID?: string, metadataURI?: string, seed?: number, theme?: string, error?: string}>}
 */
export async function generateAndUploadNFT(domainData) {
  const {
    subdomain,
    tld_name: tld,
    fqdn,
    tier: tierOverride,
    theme: themeOverride,
    seed: seedOverride,
    customPrompt,
    registration_date,
    token_id,
    owner_wallet,
  } = domainData;

  // Step 1: Generate AI image
  console.log(`Generating AI image for ${fqdn} (theme: ${themeOverride || 'default'}, seed: ${seedOverride || 'deterministic'}, customPrompt: ${customPrompt ? 'yes' : 'no'})...`);
  const imageResult = await sdxlMultiGPUService.generateSingle({
    domain: fqdn,
    themeId: themeOverride,
    customPrompt,
    seed: seedOverride,
  });

  if (!imageResult.success) {
    return {
      success: false,
      error: `Image generation failed: ${imageResult.error}`,
    };
  }

  const { imageBuffer, seed, tier, theme } = imageResult;

  // Step 2: Create metadata (without image URL for now)
  const metadata = {
    name: fqdn,
    description: `${fqdn} - A Handshake subdomain NFT on Flare Network. This NFT represents ownership of the ${subdomain}.${tld} subdomain and includes DNS management capabilities. Generated with AI art unique to this domain.${theme ? ` Theme: ${theme}.` : ''}`,
    external_url: `https://${fqdn}`,
    background_color: '0F0F1A',
    attributes: [
      { trait_type: 'TLD', value: tld },
      { trait_type: 'Subdomain', value: subdomain },
      { trait_type: 'Tier', value: CONFIG.tiers[tier]?.name || 'Standard' },
      { trait_type: 'Length', value: subdomain.length, display_type: 'number' },
      { trait_type: 'Generation Seed', value: seed, display_type: 'number' },
      { trait_type: 'Art Type', value: 'AI Generated' },
      ...(theme ? [{ trait_type: 'Art Theme', value: theme.charAt(0).toUpperCase() + theme.slice(1) }] : []),
      ...(registration_date ? [{
        trait_type: 'Registered',
        value: Math.floor(new Date(registration_date).getTime() / 1000),
        display_type: 'date',
      }] : []),
    ],
    properties: {
      token_id,
      owner: owner_wallet,
      network: CONFIG.network === 'MAINNET' ? 'Flare' : 'Flare Coston2',
      protocol: 'Handshake',
      generation_seed: seed,
      art_theme: theme || null,
    },
  };

  // Step 3: Upload to IPFS
  console.log(`Uploading NFT to IPFS for ${fqdn}...`);
  const uploadResult = await nftStorageService.uploadNFT(
    imageBuffer,
    metadata,
    `${subdomain}-${tld}.png`
  );

  if (!uploadResult.success) {
    return {
      success: false,
      error: uploadResult.error,
      seed,
      tier,
      theme,
    };
  }

  return {
    success: true,
    imageCID: uploadResult.imageCID,
    imageURL: uploadResult.imageURL,
    imageIPFS: uploadResult.imageIPFS,
    metadataCID: uploadResult.metadataCID,
    metadataURL: uploadResult.metadataURL,
    metadataURI: uploadResult.metadataURI,
    seed,
    tier,
    theme,
  };
}

/**
 * Prepare NFT for a domain (generate image and upload to IPFS)
 * This is called before purchase to get the IPFS metadata URI
 * @param {string} subdomain - Subdomain name
 * @param {string} tld - TLD name
 * @param {Object} [options] - Optional generation options
 * @param {string} [options.theme] - Art theme
 * @param {number} [options.seed] - Seed for deterministic generation
 * @returns {Promise<{success: boolean, metadataURI?: string, imageCID?: string, metadataCID?: string, seed?: number, theme?: string, error?: string}>}
 */
export async function prepareNFT(subdomain, tld, options = {}) {
  const { theme, seed, customPrompt } = options;
  const fqdn = `${subdomain}.${tld}`;
  const tier = sdGetTier(subdomain);

  // Create mock domain data for generation
  const domainData = {
    subdomain,
    tld_name: tld,
    fqdn,
    tier,
    theme,
    seed,
    customPrompt,
    registration_date: new Date().toISOString(),
    token_id: null, // Not minted yet
    owner_wallet: null, // Not owned yet
  };

  const result = await generateAndUploadNFT(domainData);

  if (result.success) {
    // Store the preparation data in database for later use
    try {
      await query(`
        INSERT INTO nft_preparations (fqdn, subdomain, tld, image_cid, metadata_cid, generation_seed, tier, theme, custom_prompt, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (fqdn) DO UPDATE SET
          image_cid = EXCLUDED.image_cid,
          metadata_cid = EXCLUDED.metadata_cid,
          generation_seed = EXCLUDED.generation_seed,
          tier = EXCLUDED.tier,
          theme = EXCLUDED.theme,
          custom_prompt = EXCLUDED.custom_prompt,
          created_at = NOW()
      `, [fqdn, subdomain, tld, result.imageCID, result.metadataCID, result.seed, result.tier, result.theme, customPrompt || null]);
    } catch (dbError) {
      console.error('Failed to store NFT preparation:', dbError);
      // Continue anyway - the IPFS data is already uploaded
    }
  }

  return result;
}

/**
 * Get prepared NFT data for a domain
 * @param {string} fqdn - Fully qualified domain name
 * @returns {Promise<Object|null>} Prepared NFT data or null
 */
export async function getPreparedNFT(fqdn) {
  try {
    const result = await query(
      'SELECT * FROM nft_preparations WHERE fqdn = $1 ORDER BY created_at DESC LIMIT 1',
      [fqdn.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const prep = result.rows[0];
    return {
      fqdn: prep.fqdn,
      subdomain: prep.subdomain,
      tld: prep.tld,
      imageCID: prep.image_cid,
      metadataCID: prep.metadata_cid,
      metadataURI: `ipfs://${prep.metadata_cid}`,
      imageURL: nftStorageService.getGatewayUrl(prep.image_cid),
      metadataURL: nftStorageService.getGatewayUrl(prep.metadata_cid),
      seed: prep.generation_seed,
      tier: prep.tier,
      theme: prep.theme,
      customPrompt: prep.custom_prompt,
      createdAt: prep.created_at,
    };
  } catch (error) {
    console.error('Error getting prepared NFT:', error);
    return null;
  }
}

/**
 * Update domain with NFT CIDs after successful mint
 * @param {string} fqdn - Fully qualified domain name
 * @param {string} imageCID - IPFS CID of the image
 * @param {string} metadataCID - IPFS CID of the metadata
 * @param {number} seed - Generation seed used
 */
export async function updateDomainNFTData(fqdn, imageCID, metadataCID, seed) {
  try {
    await query(`
      UPDATE domains SET
        nft_image_cid = $2,
        nft_metadata_cid = $3,
        nft_generation_seed = $4,
        metadata_uri = $5,
        updated_at = NOW()
      WHERE fqdn = $1
    `, [fqdn.toLowerCase(), imageCID, metadataCID, seed, `ipfs://${metadataCID}`]);
  } catch (error) {
    console.error('Error updating domain NFT data:', error);
    throw error;
  }
}

// =============================================================
//                     PREVIEW GENERATION (LOCAL ONLY)
// =============================================================

/**
 * Generate a preview image (no IPFS upload)
 * Returns base64 encoded image for display in frontend
 * @param {string} subdomain - Subdomain name
 * @param {string} tld - TLD name
 * @param {Object} options - Generation options
 * @param {string} [options.theme] - Art theme
 * @param {number} [options.seed] - Seed to use (for regeneration with same seed)
 * @param {boolean} [options.randomSeed] - Generate with random seed
 * @returns {Promise<{success: boolean, imageBase64?: string, seed?: number, tier?: string, theme?: string, error?: string}>}
 */
export async function generatePreview(subdomain, tld, options = {}) {
  const { theme, seed, randomSeed = false, customPrompt } = options;
  const tier = sdGetTier(subdomain);

  try {
    const result = await sdxlMultiGPUService.generateSingle({
      domain: `${subdomain}.${tld}`,
      themeId: theme,
      customPrompt,
      seed,
      randomSeed,
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        tier,
      };
    }

    // Convert buffer to base64
    const imageBase64 = `data:image/png;base64,${result.imageBuffer.toString('base64')}`;

    return {
      success: true,
      imageBase64,
      seed: result.seed,
      tier: result.tier,
      theme: result.theme,
    };
  } catch (error) {
    console.error('Preview generation error:', error);
    return {
      success: false,
      error: error.message,
      tier,
    };
  }
}

/**
 * Get available themes for a tier
 * @param {string} tier - Tier name
 * @returns {string[]} - List of theme names
 */
export function getThemes(tier) {
  return getThemesForTier(tier);
}

/**
 * Get themes with descriptions for a tier
 * @param {string} tier - Tier name
 * @returns {Array<{id: string, name: string, description: string}>} - List of themes with descriptions
 */
export function getThemesDetailed(tier) {
  return getThemesWithDescriptions(tier);
}

/**
 * Get all themes organized by tier
 * @returns {Object} - Themes by tier
 */
export function getAllThemes() {
  return ART_THEMES;
}

// =============================================================
//                     REGENERATION CREDITS
// =============================================================

/**
 * Get regeneration credits for a wallet
 * @param {string} walletAddress - Wallet address
 * @returns {Promise<{freeRemaining: number, paidCredits: number, totalRegenerations: number}>}
 */
export async function getRegenCredits(walletAddress) {
  try {
    const result = await query(
      'SELECT free_remaining, paid_credits, total_regenerations FROM regeneration_credits WHERE wallet_address = $1',
      [walletAddress.toLowerCase()]
    );

    if (result.rows.length === 0) {
      // New wallet - return defaults
      return {
        freeRemaining: FREE_REGENERATIONS,
        paidCredits: 0,
        totalRegenerations: 0,
      };
    }

    const row = result.rows[0];
    return {
      freeRemaining: row.free_remaining,
      paidCredits: row.paid_credits,
      totalRegenerations: row.total_regenerations,
    };
  } catch (error) {
    console.error('Error getting regen credits:', error);
    return {
      freeRemaining: FREE_REGENERATIONS,
      paidCredits: 0,
      totalRegenerations: 0,
    };
  }
}

/**
 * Use a regeneration credit
 * @param {string} walletAddress - Wallet address
 * @returns {Promise<{success: boolean, freeRemaining: number, paidCredits: number, error?: string}>}
 */
export async function useRegenCredit(walletAddress) {
  const wallet = walletAddress.toLowerCase();

  try {
    // Ensure wallet exists in credits table
    await query(`
      INSERT INTO regeneration_credits (wallet_address, free_remaining, paid_credits, total_regenerations)
      VALUES ($1, $2, 0, 0)
      ON CONFLICT (wallet_address) DO NOTHING
    `, [wallet, FREE_REGENERATIONS]);

    // Get current credits
    const current = await query(
      'SELECT free_remaining, paid_credits FROM regeneration_credits WHERE wallet_address = $1',
      [wallet]
    );

    if (current.rows.length === 0) {
      return { success: false, freeRemaining: 0, paidCredits: 0, error: 'Failed to get credits' };
    }

    const { free_remaining, paid_credits } = current.rows[0];

    // Check if user has credits
    if (free_remaining <= 0 && paid_credits <= 0) {
      return {
        success: false,
        freeRemaining: 0,
        paidCredits: 0,
        error: 'No regeneration credits remaining',
      };
    }

    // Use free credit first, then paid
    if (free_remaining > 0) {
      await query(`
        UPDATE regeneration_credits
        SET free_remaining = free_remaining - 1,
            total_regenerations = total_regenerations + 1,
            updated_at = NOW()
        WHERE wallet_address = $1
      `, [wallet]);

      return {
        success: true,
        freeRemaining: free_remaining - 1,
        paidCredits: paid_credits,
      };
    } else {
      await query(`
        UPDATE regeneration_credits
        SET paid_credits = paid_credits - 1,
            total_regenerations = total_regenerations + 1,
            updated_at = NOW()
        WHERE wallet_address = $1
      `, [wallet]);

      return {
        success: true,
        freeRemaining: 0,
        paidCredits: paid_credits - 1,
      };
    }
  } catch (error) {
    console.error('Error using regen credit:', error);
    return {
      success: false,
      freeRemaining: 0,
      paidCredits: 0,
      error: error.message,
    };
  }
}

/**
 * Add paid regeneration credits after successful purchase
 * @param {string} walletAddress - Wallet address
 * @param {number} amount - Number of credits to add (default: 10)
 * @returns {Promise<{success: boolean, newCredits: number, error?: string}>}
 */
export async function addPaidCredits(walletAddress, amount = REGEN_CREDITS_PER_PURCHASE) {
  const wallet = walletAddress.toLowerCase();

  try {
    // Upsert credits
    const result = await query(`
      INSERT INTO regeneration_credits (wallet_address, free_remaining, paid_credits, total_regenerations)
      VALUES ($1, $2, $3, 0)
      ON CONFLICT (wallet_address) DO UPDATE SET
        paid_credits = regeneration_credits.paid_credits + $3,
        updated_at = NOW()
      RETURNING paid_credits
    `, [wallet, FREE_REGENERATIONS, amount]);

    return {
      success: true,
      newCredits: result.rows[0].paid_credits,
    };
  } catch (error) {
    console.error('Error adding paid credits:', error);
    return {
      success: false,
      newCredits: 0,
      error: error.message,
    };
  }
}

/**
 * Get regeneration credits pricing info
 * @returns {{priceFLR: number, creditsPerPurchase: number, freeCredits: number}}
 */
export function getRegenPricing() {
  return {
    priceFLR: REGEN_CREDITS_PRICE_FLR,
    creditsPerPurchase: REGEN_CREDITS_PER_PURCHASE,
    freeCredits: FREE_REGENERATIONS,
  };
}

// =============================================================
//                     PREVIEW CREDITS
// =============================================================

/**
 * Get preview credits for a wallet (10 free total per wallet + bonus credits)
 * @param {string} walletAddress - Wallet address
 * @returns {Promise<{usedCount: number, remaining: number, freeTotal: number, bonusCredits: number}>}
 */
export async function getPreviewCredits(walletAddress) {
  try {
    const result = await query(
      'SELECT used_count, COALESCE(bonus_credits, 0) as bonus_credits FROM preview_credits WHERE wallet_address = $1',
      [walletAddress.toLowerCase()]
    );
    const usedCount = result.rows[0]?.used_count || 0;
    const bonusCredits = result.rows[0]?.bonus_credits || 0;
    // Remaining = free credits - used + bonus credits
    const freeRemaining = Math.max(0, FREE_PREVIEWS_PER_THEME - usedCount);
    return {
      usedCount,
      remaining: freeRemaining + bonusCredits,
      freeTotal: FREE_PREVIEWS_PER_THEME,
      bonusCredits,
    };
  } catch (error) {
    console.error('Error getting preview credits:', error);
    return {
      usedCount: 0,
      remaining: FREE_PREVIEWS_PER_THEME,
      freeTotal: FREE_PREVIEWS_PER_THEME,
      bonusCredits: 0,
    };
  }
}

/**
 * Use one preview credit
 * Uses free credits first, then bonus credits
 * @param {string} walletAddress - Wallet address
 * @returns {Promise<{success: boolean, usedCount: number, remaining: number}>}
 */
export async function usePreviewCredit(walletAddress) {
  const wallet = walletAddress.toLowerCase();

  try {
    // Get current credits
    const currentResult = await query(
      'SELECT used_count, COALESCE(bonus_credits, 0) as bonus_credits FROM preview_credits WHERE wallet_address = $1',
      [wallet]
    );

    let usedCount = currentResult.rows[0]?.used_count || 0;
    let bonusCredits = currentResult.rows[0]?.bonus_credits || 0;

    // Check if user has credits available
    const freeRemaining = Math.max(0, FREE_PREVIEWS_PER_THEME - usedCount);
    const totalRemaining = freeRemaining + bonusCredits;

    if (totalRemaining <= 0) {
      return { success: false, usedCount, remaining: 0, error: 'No preview credits remaining' };
    }

    // Determine which credit to use: free credits first, then bonus
    if (freeRemaining > 0) {
      // Use a free credit (increment used_count)
      await query(`
        INSERT INTO preview_credits (wallet_address, used_count, bonus_credits, updated_at)
        VALUES ($1, 1, 0, NOW())
        ON CONFLICT (wallet_address)
        DO UPDATE SET used_count = preview_credits.used_count + 1, updated_at = NOW()
      `, [wallet]);
      usedCount += 1;
    } else {
      // Use a bonus credit (decrement bonus_credits)
      await query(`
        UPDATE preview_credits
        SET bonus_credits = bonus_credits - 1, updated_at = NOW()
        WHERE wallet_address = $1 AND bonus_credits > 0
      `, [wallet]);
      bonusCredits -= 1;
    }

    const newFreeRemaining = Math.max(0, FREE_PREVIEWS_PER_THEME - usedCount);
    const remaining = newFreeRemaining + bonusCredits;

    return { success: true, usedCount, remaining, bonusCredits };
  } catch (error) {
    console.error('Error using preview credit:', error);
    return { success: false, usedCount: 0, remaining: 0 };
  }
}

/**
 * Reset credits after purchase (gives 10 more free)
 * @param {string} walletAddress - Wallet address
 * @returns {Promise<{success: boolean, remaining: number}>}
 */
export async function purchasePreviewCredits(walletAddress) {
  const wallet = walletAddress.toLowerCase();

  try {
    await query(`
      INSERT INTO preview_credits (wallet_address, used_count, updated_at)
      VALUES ($1, 0, NOW())
      ON CONFLICT (wallet_address)
      DO UPDATE SET used_count = 0, updated_at = NOW()
    `, [wallet]);

    return { success: true, remaining: FREE_PREVIEWS_PER_THEME };
  } catch (error) {
    console.error('Error purchasing preview credits:', error);
    return { success: false, remaining: 0 };
  }
}

/**
 * Reset ALL preview credits (admin function)
 * @returns {Promise<{success: boolean, resetCount: number}>}
 */
export async function resetAllPreviewCredits() {
  try {
    const result = await query('DELETE FROM preview_credits');
    return { success: true, resetCount: result.rowCount || 0 };
  } catch (error) {
    console.error('Error resetting all preview credits:', error);
    return { success: false, resetCount: 0 };
  }
}

/**
 * Get preview credits pricing info
 * @returns {{freeTotal: number, creditsPerPurchase: number}}
 */
export function getPreviewPricing() {
  return {
    freeTotal: FREE_PREVIEWS_PER_THEME,
    creditsPerPurchase: PREVIEW_CREDITS_PER_PURCHASE,
  };
}

// =============================================================
//                     DEFAULT NFT GENERATION
// Used for bulk registrations - users can customize later
// =============================================================

/**
 * Generate a default NFT image with Halcyon gradient and domain name text
 * This is fast (no AI) and used for bulk registrations
 * @param {string} subdomain - Subdomain name
 * @param {string} tld - TLD name
 * @returns {Promise<{success: boolean, imageBuffer?: Buffer, metadataURI?: string, imageCID?: string, metadataCID?: string, error?: string}>}
 */
export async function generateDefaultNFT(subdomain, tld) {
  const fqdn = `${subdomain}.${tld}`;
  const tier = getTier(subdomain);

  try {
    // Create canvas with Halcyon gradient background
    const canvas = createCanvas(CONFIG.width, CONFIG.height);
    const ctx = canvas.getContext('2d');

    // Halcyon gradient background (teal to green with purple accent)
    const bgGradient = ctx.createLinearGradient(0, 0, CONFIG.width, CONFIG.height);
    bgGradient.addColorStop(0, '#0F2027');     // Dark teal
    bgGradient.addColorStop(0.3, '#203A43');   // Mid teal
    bgGradient.addColorStop(0.6, '#2C5364');   // Light teal
    bgGradient.addColorStop(1, '#1a1a2e');     // Dark purple
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);

    // Add subtle grid pattern overlay
    ctx.strokeStyle = 'rgba(45, 212, 191, 0.08)'; // Teal with low opacity
    ctx.lineWidth = 1;
    const gridSize = 50;
    for (let x = 0; x < CONFIG.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CONFIG.height);
      ctx.stroke();
    }
    for (let y = 0; y < CONFIG.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CONFIG.width, y);
      ctx.stroke();
    }

    // Add glowing circle accent
    const centerX = CONFIG.width / 2;
    const centerY = CONFIG.height / 2 - 50;
    const glowGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 400);
    glowGradient.addColorStop(0, 'rgba(45, 212, 191, 0.3)');   // Teal glow
    glowGradient.addColorStop(0.5, 'rgba(34, 197, 94, 0.15)'); // Green
    glowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowGradient;
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);

    // Domain name text - calculate font size based on length
    const maxWidth = CONFIG.width - 120;
    let fontSize = subdomain.length <= 4 ? 120 : subdomain.length <= 8 ? 90 : subdomain.length <= 12 ? 70 : 55;
    ctx.font = `bold ${fontSize}px sans-serif`;

    // Adjust font size if still too wide
    while (ctx.measureText(fqdn).width > maxWidth && fontSize > 30) {
      fontSize -= 5;
      ctx.font = `bold ${fontSize}px sans-serif`;
    }

    // Draw domain name with gradient fill
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Text shadow for depth
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 5;

    // Create text gradient
    const textGradient = ctx.createLinearGradient(
      centerX - 300, centerY,
      centerX + 300, centerY
    );
    textGradient.addColorStop(0, '#2dd4bf');   // Teal
    textGradient.addColorStop(0.5, '#22c55e'); // Green
    textGradient.addColorStop(1, '#a855f7');   // Purple

    ctx.fillStyle = textGradient;
    ctx.fillText(fqdn, centerX, centerY);

    // Reset shadow for tier badge
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Tier badge at bottom
    const tierConfig = CONFIG.tiers[tier] || CONFIG.tiers.standard;
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = tierConfig.accent;
    ctx.fillText(tierConfig.name.toUpperCase(), centerX, CONFIG.height - 100);

    // "Customize Later" subtitle
    ctx.font = '18px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText('AI artwork can be generated from your dashboard', centerX, CONFIG.height - 60);

    // Convert canvas to buffer
    const imageBuffer = canvas.toBuffer('image/png');

    // Create metadata
    const metadata = {
      name: fqdn,
      description: `${fqdn} - A Handshake subdomain NFT on Flare Network. This default artwork can be customized with AI-generated imagery from your dashboard.`,
      external_url: `https://${fqdn}`,
      background_color: '0F2027',
      attributes: [
        { trait_type: 'TLD', value: tld },
        { trait_type: 'Subdomain', value: subdomain },
        { trait_type: 'Tier', value: tierConfig.name },
        { trait_type: 'Length', value: subdomain.length, display_type: 'number' },
        { trait_type: 'Art Type', value: 'Default (Customizable)' },
      ],
      properties: {
        network: CONFIG.network === 'MAINNET' ? 'Flare' : 'Flare Coston2',
        protocol: 'Handshake',
        customizable: true,
      },
    };

    // Upload to IPFS
    console.log(`[NFT] Uploading default NFT for ${fqdn} to IPFS...`);
    const uploadResult = await nftStorageService.uploadNFT(
      imageBuffer,
      metadata,
      `${subdomain}-${tld}-default.png`
    );

    if (!uploadResult.success) {
      return {
        success: false,
        error: uploadResult.error,
      };
    }

    return {
      success: true,
      imageBuffer,
      imageCID: uploadResult.imageCID,
      imageURL: uploadResult.imageURL,
      metadataCID: uploadResult.metadataCID,
      metadataURL: uploadResult.metadataURL,
      metadataURI: uploadResult.metadataURI,
      tier,
    };
  } catch (error) {
    console.error('[NFT] generateDefaultNFT error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Add bonus preview credits to a wallet (for bulk purchases)
 * @param {string} walletAddress - Wallet address
 * @param {number} credits - Number of credits to add
 * @returns {Promise<{success: boolean, newTotal: number, error?: string}>}
 */
export async function addBonusCredits(walletAddress, credits) {
  const wallet = walletAddress.toLowerCase();

  try {
    // First ensure the wallet exists in preview_credits table
    // Then subtract the used_count to effectively give more credits
    // Since remaining = FREE_PREVIEWS_PER_THEME - used_count, we need to decrease used_count
    // Or we can track bonus credits separately - let's add them by reducing used_count
    // But used_count shouldn't go negative, so let's create a bonus system

    // Actually, let's just reset used_count and give them extra
    // The cleanest approach: set used_count to a negative number representing bonus
    // Or track bonus_credits separately

    // For simplicity, let's reduce used_count by the bonus amount
    // This effectively gives them more "free" credits
    const result = await query(`
      INSERT INTO preview_credits (wallet_address, used_count, bonus_credits, updated_at)
      VALUES ($1, 0, $2, NOW())
      ON CONFLICT (wallet_address) DO UPDATE SET
        bonus_credits = COALESCE(preview_credits.bonus_credits, 0) + $2,
        updated_at = NOW()
      RETURNING used_count, COALESCE(bonus_credits, 0) as bonus_credits
    `, [wallet, credits]);

    const row = result.rows[0];
    const usedCount = row?.used_count || 0;
    const bonusCredits = row?.bonus_credits || credits;
    const newTotal = Math.max(0, FREE_PREVIEWS_PER_THEME - usedCount) + bonusCredits;

    // Log the bonus credit addition for audit
    try {
      await query(`
        INSERT INTO credit_audit_log (wallet_address, credit_type, amount, reason, created_at)
        VALUES ($1, 'preview_bonus', $2, 'bulk_registration', NOW())
      `, [wallet, credits]);
    } catch (logError) {
      // Audit log is optional, don't fail the operation
      console.warn('Failed to log bonus credit addition:', logError.message);
    }

    return {
      success: true,
      newTotal,
      bonusCredits,
    };
  } catch (error) {
    console.error('Error adding bonus credits:', error);
    return {
      success: false,
      newTotal: 0,
      error: error.message,
    };
  }
}

// =============================================================
//         SIMPLIFIED REGISTRATION: BUY FIRST, MINT LATER
// =============================================================

/**
 * Calculate credits earned for a domain purchase
 * Credit table:
 * - 1 domain = 10 credits
 * - 2 domains = 25 credits
 * - 3 domains = 35 credits
 * - 4 domains = 45 credits
 * - 5 domains = 55 credits
 * - 5+ domains = 55 + (count - 5) * 10 credits per additional
 *
 * @param {number} domainCount - Number of domains purchased
 * @returns {number} Credits earned
 */
export function calculatePurchaseCredits(domainCount) {
  if (domainCount <= 0) return 0;

  const creditTable = {
    1: 10,
    2: 25,
    3: 35,
    4: 45,
    5: 55,
  };

  if (domainCount <= 5) {
    return creditTable[domainCount];
  }

  // For 6+ domains: base 55 credits + 10 per additional domain
  return 55 + (domainCount - 5) * 10;
}

/**
 * Log a credit transaction for audit trail
 * @param {string} walletAddress - Wallet address
 * @param {number} amount - Amount (positive = earned, negative = spent)
 * @param {string} transactionType - Type: 'purchase_bonus', 'generation', 'finalization'
 * @param {string} [referenceId] - Optional reference (fqdn or generation_id)
 * @param {string} [txHash] - Optional blockchain tx hash
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function logCreditTransaction(walletAddress, amount, transactionType, referenceId = null, txHash = null) {
  try {
    await query(`
      INSERT INTO credit_transactions (wallet_address, amount, transaction_type, reference_id, tx_hash, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [walletAddress.toLowerCase(), amount, transactionType, referenceId, txHash]);

    return { success: true };
  } catch (error) {
    console.error('Error logging credit transaction:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get unified credits balance for a wallet
 * @param {string} walletAddress - Wallet address
 * @returns {Promise<{total: number, earned: number, spent: number, history: Array}>}
 */
export async function getUnifiedCredits(walletAddress) {
  const wallet = walletAddress.toLowerCase();

  try {
    // Get preview credits (total available = free + bonus - used)
    const creditsResult = await query(
      'SELECT used_count, COALESCE(bonus_credits, 0) as bonus_credits FROM preview_credits WHERE wallet_address = $1',
      [wallet]
    );

    const usedCount = creditsResult.rows[0]?.used_count || 0;
    const bonusCredits = creditsResult.rows[0]?.bonus_credits || 0;
    const freeRemaining = Math.max(0, FREE_PREVIEWS_PER_THEME - usedCount);
    const total = freeRemaining + bonusCredits;

    // Get transaction history
    const historyResult = await query(`
      SELECT amount, transaction_type, reference_id, tx_hash, created_at
      FROM credit_transactions
      WHERE wallet_address = $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [wallet]);

    // Calculate earned and spent from history
    let earned = FREE_PREVIEWS_PER_THEME; // Start with free credits
    let spent = 0;

    for (const row of historyResult.rows) {
      if (row.amount > 0) {
        earned += row.amount;
      } else {
        spent += Math.abs(row.amount);
      }
    }

    return {
      total,
      earned,
      spent,
      history: historyResult.rows.map(row => ({
        type: row.transaction_type,
        amount: row.amount,
        reference: row.reference_id,
        txHash: row.tx_hash,
        createdAt: row.created_at,
      })),
    };
  } catch (error) {
    console.error('Error getting unified credits:', error);
    return {
      total: FREE_PREVIEWS_PER_THEME,
      earned: FREE_PREVIEWS_PER_THEME,
      spent: 0,
      history: [],
    };
  }
}

/**
 * Finalize NFT from a selected Flux-generated image
 * Updates the domain's NFT with the AI-generated artwork
 *
 * @param {string} fqdn - Fully qualified domain name
 * @param {string} generationId - Flux generation ID
 * @param {number} selectedIndex - Index of selected image (0-2)
 * @param {string} walletAddress - Owner wallet address (for verification)
 * @returns {Promise<{success: boolean, metadataUri?: string, imageCid?: string, metadataCid?: string, error?: string}>}
 */
export async function finalizeNFTFromGeneration(fqdn, generationId, selectedIndex, walletAddress) {
  const wallet = walletAddress.toLowerCase();
  const normalizedFqdn = fqdn.toLowerCase();

  try {
    // 1. Verify wallet owns the domain (check V2 first, then V1)
    let domain;
    const v2Result = await query(
      'SELECT id, token_id, owner_address AS owner_wallet, label AS subdomain FROM slds_v2 WHERE full_name = $1',
      [normalizedFqdn]
    );
    if (v2Result.rows.length > 0) {
      domain = v2Result.rows[0];
    } else {
      const domainResult = await query(
        'SELECT id, token_id, owner_wallet, subdomain, nft_status FROM domains WHERE fqdn = $1',
        [normalizedFqdn]
      );
      if (domainResult.rows.length > 0) {
        domain = domainResult.rows[0];
      }
    }

    if (!domain) {
      return { success: false, error: 'Domain not found' };
    }

    if (domain.owner_wallet.toLowerCase() !== wallet) {
      return { success: false, error: 'You do not own this domain' };
    }

    // 2. Get the selected image from flux_generation_images
    const imageResult = await query(`
      SELECT image_base64, theme_id, theme_name, theme_category, seed
      FROM flux_generation_images
      WHERE generation_id = $1 AND image_index = $2 AND status = 'completed'
    `, [generationId, selectedIndex]);

    if (imageResult.rows.length === 0) {
      return { success: false, error: 'Selected image not found' };
    }

    const selectedImage = imageResult.rows[0];

    if (!selectedImage.image_base64) {
      return { success: false, error: 'Image data not available' };
    }

    // 3. Convert base64 to buffer
    const imageBuffer = Buffer.from(selectedImage.image_base64, 'base64');

    // 4. Get TLD name for metadata (try V2 first, then V1)
    let tldName;
    const v2TldResult = await query(`
      SELECT t.label AS tld_name FROM slds_v2 s
      JOIN tlds_v2 t ON t.id = s.tld_id
      WHERE s.full_name = $1
    `, [normalizedFqdn]);
    if (v2TldResult.rows.length > 0) {
      tldName = v2TldResult.rows[0].tld_name;
    } else {
      const tldResult = await query(`
        SELECT t.name as tld_name FROM domains d
        JOIN tlds t ON d.tld_id = t.id
        WHERE d.fqdn = $1
      `, [normalizedFqdn]);
      tldName = tldResult.rows[0]?.tld_name;
    }
    if (!tldName) tldName = normalizedFqdn.split('.').pop();
    const tier = getTier(domain.subdomain);

    // 5. Create metadata with AI-generated details
    const metadata = {
      name: normalizedFqdn,
      description: `${normalizedFqdn} - A Handshake subdomain NFT on Flare Network. This NFT features custom AI-generated artwork. Theme: ${selectedImage.theme_name}.`,
      external_url: `https://${normalizedFqdn}`,
      background_color: '0F0F1A',
      attributes: [
        { trait_type: 'TLD', value: tldName },
        { trait_type: 'Subdomain', value: domain.subdomain },
        { trait_type: 'Tier', value: CONFIG.tiers[tier]?.name || 'Standard' },
        { trait_type: 'Length', value: domain.subdomain.length, display_type: 'number' },
        { trait_type: 'Generation Seed', value: selectedImage.seed, display_type: 'number' },
        { trait_type: 'Art Type', value: 'AI Generated (Customized)' },
        { trait_type: 'Art Theme', value: selectedImage.theme_name },
        { trait_type: 'Theme Category', value: selectedImage.theme_category },
      ],
      properties: {
        token_id: domain.token_id,
        network: CONFIG.network === 'MAINNET' ? 'Flare' : 'Flare Coston2',
        protocol: 'Handshake',
        generation_seed: selectedImage.seed,
        art_theme: selectedImage.theme_id,
        customized: true,
        customized_at: new Date().toISOString(),
      },
    };

    // 6. Upload to IPFS
    console.log(`[NFT] Uploading finalized NFT for ${normalizedFqdn} to IPFS...`);
    const uploadResult = await nftStorageService.uploadNFT(
      imageBuffer,
      metadata,
      `${domain.subdomain}-${tldName}-custom.png`
    );

    if (!uploadResult.success) {
      return { success: false, error: uploadResult.error };
    }

    // 7. Update domains table
    await query(`
      UPDATE domains SET
        nft_image_cid = $2,
        nft_metadata_cid = $3,
        nft_generation_seed = $4,
        metadata_uri = $5,
        nft_status = 'customized',
        updated_at = NOW()
      WHERE fqdn = $1
    `, [normalizedFqdn, uploadResult.imageCID, uploadResult.metadataCID, selectedImage.seed, uploadResult.metadataURI]);

    // 8. Log to nft_metadata_changes for audit
    try {
      const oldMetadata = await query('SELECT nft_metadata_cid FROM domains WHERE fqdn = $1', [normalizedFqdn]);
      const oldCid = oldMetadata.rows[0]?.nft_metadata_cid || 'none';

      await query(`
        INSERT INTO nft_metadata_changes (fqdn, old_cid, new_cid, change_type, change_details, created_at)
        VALUES ($1, $2, $3, 'customization', $4, NOW())
      `, [normalizedFqdn, oldCid, uploadResult.metadataCID, JSON.stringify({
        generationId,
        selectedIndex,
        theme: selectedImage.theme_name,
        wallet,
      })]);
    } catch (auditError) {
      console.warn('Failed to log NFT metadata change:', auditError.message);
    }

    // 9. Record the selection
    try {
      await query(`
        INSERT INTO flux_nft_selections (generation_id, selected_index, nft_prepared, metadata_cid, image_cid, selected_at)
        VALUES ($1, $2, true, $3, $4, NOW())
        ON CONFLICT (generation_id) DO UPDATE SET
          selected_index = EXCLUDED.selected_index,
          nft_prepared = true,
          metadata_cid = EXCLUDED.metadata_cid,
          image_cid = EXCLUDED.image_cid,
          selected_at = NOW()
      `, [generationId, selectedIndex, uploadResult.metadataCID, uploadResult.imageCID]);
    } catch (selectionError) {
      console.warn('Failed to record NFT selection:', selectionError.message);
    }

    return {
      success: true,
      metadataUri: uploadResult.metadataURI,
      metadataUrl: uploadResult.metadataURL,
      imageCid: uploadResult.imageCID,
      imageUrl: uploadResult.imageURL,
      metadataCid: uploadResult.metadataCID,
    };
  } catch (error) {
    console.error('Error finalizing NFT from generation:', error);
    return { success: false, error: error.message };
  }
}

export default {
  generateImage,
  generatePlaceholder,
  generateMetadata,
  getDomainData,
  generateAIImage,
  generateAndUploadNFT,
  prepareNFT,
  getPreparedNFT,
  updateDomainNFTData,
  generatePreview,
  getThemes,
  getThemesDetailed,
  getAllThemes,
  getRegenCredits,
  useRegenCredit,
  addPaidCredits,
  getRegenPricing,
  getPreviewCredits,
  usePreviewCredit,
  purchasePreviewCredits,
  resetAllPreviewCredits,
  getPreviewPricing,
  generateDefaultNFT,
  addBonusCredits,
  calculatePurchaseCredits,
  logCreditTransaction,
  getUnifiedCredits,
  finalizeNFTFromGeneration,
  CONFIG,
};
