/**
 * Stable Diffusion Utilities
 * Tier, theme/style, and seed utility functions.
 * Image generation is handled by sdxlMultiGPU.js.
 */

import crypto from 'crypto';

// Tier mapping with inference steps (higher = better quality)
const TIERS = {
  ultra_premium: { name: 'Ultra Premium', length: 1, steps: 40 },
  premium: { name: 'Premium', length: 2, steps: 32 },
  standard_plus: { name: 'Standard+', length: 3, steps: 25 },
  standard: { name: 'Standard', length: 4, steps: 20 },
};

// =============================================================
//                     STYLE SYSTEM (20 Styles)
// Users MUST provide a custom prompt describing their subject.
// Styles enhance HOW it looks, not WHAT it is.
// =============================================================

// All styles available to all tiers (20 styles total)
const ALL_STYLES = [
  // General Styles (10)
  'cyberpunk', 'nature', 'corporate', 'retro', 'minimalist',
  'fantasy', 'industrial', 'cosmic', 'abstract', 'elegant',
  // Business-Focused Styles (10)
  'tech', 'food', 'medical', 'finance', 'realestate',
  'ecommerce', 'gaming', 'education', 'travel', 'fitness',
];

// Legacy: kept for backwards compatibility
const ART_THEMES = {
  ultra_premium: ALL_STYLES,
  premium: ALL_STYLES,
  standard_plus: ALL_STYLES,
  standard: ALL_STYLES,
};

// Backwards compatibility alias
const ALL_THEMES = ALL_STYLES;

// Style descriptions for UI display
const STYLE_DESCRIPTIONS = {
  // General Styles
  cyberpunk: 'Neon lights, futuristic tech & dark city vibes',
  nature: 'Organic elements, lush greenery & earth tones',
  corporate: 'Clean professional, minimalist business aesthetic',
  retro: '80s synthwave, neon pink/blue & nostalgic vibes',
  minimalist: 'Clean lines, negative space & modern design',
  fantasy: 'Magical elements, ethereal glow & mystical atmosphere',
  industrial: 'Metallic textures, gears & steampunk aesthetic',
  cosmic: 'Space elements, stars, galaxies & nebula colors',
  abstract: 'Bold geometric shapes, modern art & vibrant colors',
  elegant: 'Sophisticated gold accents & luxury premium feel',
  // Business-Focused Styles
  tech: 'Digital interface, code elements & circuit patterns',
  food: 'Appetizing colors, warm lighting & culinary art',
  medical: 'Clean clinical white, healing energy & trust',
  finance: 'Wealth aesthetic, charts/graphs & prosperity',
  realestate: 'Architectural elements & property showcase',
  ecommerce: 'Shopping elements, product display & vibrant commerce',
  gaming: 'Game UI elements, action dynamic & RGB lighting',
  education: 'Books, knowledge & learning environment',
  travel: 'Wanderlust aesthetic, landmarks & adventure vibes',
  fitness: 'Athletic energy, motion blur & strength',
};

// Backwards compatibility alias
const THEME_DESCRIPTIONS = STYLE_DESCRIPTIONS;

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
 * Get available styles for a tier (all tiers get all styles)
 */
function getStylesForTier(tier) {
  return ALL_STYLES;
}

// Backwards compatibility alias
function getThemesForTier(tier) {
  return getStylesForTier(tier);
}

/**
 * Get styles with descriptions (all tiers get all styles)
 */
function getStylesWithDescriptions(tier) {
  return ALL_STYLES.map(style => ({
    id: style,
    name: STYLE_DESCRIPTIONS[style] ? style.charAt(0).toUpperCase() + style.slice(1).replace(/([A-Z])/g, ' $1') : style,
    description: STYLE_DESCRIPTIONS[style] || '',
  }));
}

// Backwards compatibility alias
function getThemesWithDescriptions(tier) {
  return getStylesWithDescriptions(tier);
}

/**
 * Get inference steps for a tier (higher tiers = more steps = better quality)
 */
function getStepsForTier(tier) {
  return TIERS[tier]?.steps || TIERS.standard.steps;
}

/**
 * Validate if a style is valid (all styles available to all tiers)
 */
function isValidStyle(tier, style) {
  return ALL_STYLES.includes(style);
}

// Backwards compatibility alias
function isValidTheme(tier, theme) {
  return isValidStyle(tier, theme);
}

/**
 * Generate a random seed
 */
function generateRandomSeed() {
  return Math.floor(Math.random() * 4294967295); // uint32 max
}

/**
 * Calculate deterministic seed from subdomain and TLD
 */
function calculateSeed(subdomain, tld) {
  const combined = `${subdomain.toLowerCase()}.${tld.toLowerCase()}`;
  const hash = crypto.createHash('sha256').update(combined).digest();
  // Use first 4 bytes for seed (uint32)
  return hash.readUInt32BE(0);
}

// =============================================================
//                     EXPORTS (utility functions only)
// Generation is now handled by sdxlMultiGPU.js
// =============================================================

export default {};

export {
  getTier,
  calculateSeed,
  generateRandomSeed,
  getStylesForTier,
  getStylesWithDescriptions,
  getThemesForTier,
  getThemesWithDescriptions,
  getStepsForTier,
  isValidStyle,
  isValidTheme,
  TIERS,
  ALL_STYLES,
  ALL_THEMES,
  ART_THEMES,
  STYLE_DESCRIPTIONS,
  THEME_DESCRIPTIONS,
};
