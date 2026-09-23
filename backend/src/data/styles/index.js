/**
 * Style Loading Service
 *
 * Loads and manages artistic styles for image generation.
 * Styles control HOW an image looks (artistic technique, color treatment, rendering style)
 * while themes control WHAT is in the image (subject matter, setting).
 *
 * Each style includes:
 * - prompt: Text to enhance the generation prompt
 * - negative: Negative prompt to avoid unwanted elements
 * - settings: Generation parameters (cfg, steps, sampler, scheduler, denoise)
 * - lora: Optional LoRA configuration
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cache for loaded styles
let stylesCache = null;

// Style categories
const STYLE_CATEGORIES = ['artistic', 'digital', 'film', 'movements', 'rendering', 'mood'];

// Styles that produce monochrome output — color terms in theme modifiers
// get stripped to prevent color bleeding into B&W generations
const MONOCHROME_STYLES = new Set(['pencil_sketch', 'charcoal', 'ink_drawing']);

// Styles where theme modifiers are condensed to just high-weight identity segments.
// This prevents verbose realistic descriptions from overpowering the art style.
const CONDENSED_MODIFIER_STYLES = new Set(['ink_drawing']);

/**
 * Condense theme modifiers to only the essential identity segments.
 * Keeps segments with weights >= 1.2 (identity anchors and visual signatures)
 * and drops atmospheric, lighting, and generic composition descriptions.
 * This gives the art style prompt + LoRA room to control the rendering.
 */
function condenseModifiers(promptText) {
  const segments = promptText.split(',');
  const kept = segments.filter(seg => {
    // Keep segments that have a weight >= 1.2
    const weightMatch = seg.match(/:(\d+\.?\d*)\)/);
    if (weightMatch) {
      return parseFloat(weightMatch[1]) >= 1.2;
    }
    // Drop unweighted segments (generic composition, atmosphere)
    return false;
  });

  return kept
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .join(', ');
}

/**
 * Strip color-related segments from theme modifier text.
 * Splits on commas, removes segments containing color keywords,
 * and reassembles. This prevents theme color palettes and colored
 * lighting from overpowering monochrome style instructions.
 */
function stripColorFromModifiers(promptText) {
  const colorTerms = [
    // Explicit color palette/scheme references
    'color palette', 'color scheme', 'color harmony', 'color grading',
    'warm tones', 'cool tones', 'earth tones',
    // Named colors that appear in theme atmosphere descriptions
    'golden', 'amber', 'burgundy', 'crimson', 'scarlet', 'ruby',
    'emerald', 'sapphire', 'turquoise', 'teal', 'cyan', 'magenta',
    'lavender', 'violet', 'indigo', 'coral', 'navy', 'cerulean',
    'cobalt', 'azure', 'neon', 'copper', 'bronze', 'ivory', 'jade',
    'ochre', 'sepia', 'vermillion', 'ultramarine', 'mauve', 'fuchsia',
    'chartreuse', 'aquamarine', 'rose gold', 'burnt sienna', 'umber',
    'maroon', 'peach', 'salmon',
    // Color quality descriptors
    'vibrant', 'vivid', 'saturated', 'pastel', 'iridescent',
    'holographic', 'rainbow', 'prismatic', 'chromatic', 'multicolored',
  ];

  const segments = promptText.split(',');
  const filtered = segments.filter(seg => {
    const lower = seg.toLowerCase();
    return !colorTerms.some(term => lower.includes(term));
  });

  return filtered
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .join(', ');
}

/**
 * Load a single style file
 */
function loadStyleFile(filename) {
  const filePath = join(__dirname, filename);
  const data = JSON.parse(readFileSync(filePath, 'utf-8'));
  return data.styles;
}

/**
 * Load all styles from JSON files
 * Uses caching to avoid repeated file reads
 */
export function loadAllStyles() {
  if (stylesCache) {
    return stylesCache;
  }

  try {
    const artistic = loadStyleFile('artistic.json');
    const digital = loadStyleFile('digital.json');
    const film = loadStyleFile('film.json');
    const movements = loadStyleFile('movements.json');
    const rendering = loadStyleFile('rendering.json');
    const mood = loadStyleFile('mood.json');

    stylesCache = {
      artistic,
      digital,
      film,
      movements,
      rendering,
      mood,
    };

    // Log counts for monitoring
    const counts = {
      artistic: Object.keys(artistic).length,
      digital: Object.keys(digital).length,
      film: Object.keys(film).length,
      movements: Object.keys(movements).length,
      rendering: Object.keys(rendering).length,
      mood: Object.keys(mood).length,
    };

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`[Styles] Loaded ${total} styles:`, counts);

    return stylesCache;
  } catch (error) {
    console.error('[Styles] Failed to load styles:', error.message);
    throw error;
  }
}

/**
 * Clear the styles cache (useful for hot reloading)
 */
export function clearStylesCache() {
  stylesCache = null;
  console.log('[Styles] Cache cleared');
}

/**
 * Format styles for API response
 * Returns styles organized by category with full details
 */
export function getStylesForAPI() {
  const styles = loadAllStyles();

  const formatCategory = (categoryStyles, categoryName) => {
    return Object.entries(categoryStyles).map(([id, style]) => ({
      id,
      name: style.name,
      category: categoryName,
      prompt: style.prompt,
      negative: style.negative,
      settings: style.settings,
      lora: style.lora,
    }));
  };

  return {
    artistic: formatCategory(styles.artistic, 'artistic'),
    digital: formatCategory(styles.digital, 'digital'),
    film: formatCategory(styles.film, 'film'),
    movements: formatCategory(styles.movements, 'movements'),
    rendering: formatCategory(styles.rendering, 'rendering'),
    mood: formatCategory(styles.mood, 'mood'),
  };
}

/**
 * Get a flat array of all styles
 */
export function getAllStylesFlat() {
  const styles = loadAllStyles();
  const result = [];

  for (const category of STYLE_CATEGORIES) {
    for (const [id, style] of Object.entries(styles[category])) {
      result.push({
        id,
        name: style.name,
        category,
        prompt: style.prompt,
        negative: style.negative,
        settings: style.settings,
        lora: style.lora,
      });
    }
  }

  return result;
}

/**
 * Get a single style by ID
 * Searches through all categories
 */
export function getStyleById(styleId) {
  const styles = loadAllStyles();

  for (const category of STYLE_CATEGORIES) {
    if (styles[category]?.[styleId]) {
      return {
        ...styles[category][styleId],
        id: styleId,
        category,
      };
    }
  }

  return null;
}

/**
 * Get all style IDs as a flat array
 */
export function getAllStyleIds() {
  const styles = loadAllStyles();
  const ids = [];

  for (const category of STYLE_CATEGORIES) {
    ids.push(...Object.keys(styles[category]));
  }

  return ids;
}

/**
 * Get styles for a specific category
 */
export function getStylesByCategory(category) {
  const styles = loadAllStyles();

  if (!styles[category]) {
    return null;
  }

  return Object.entries(styles[category]).map(([id, style]) => ({
    id,
    name: style.name,
    category,
    prompt: style.prompt,
    negative: style.negative,
    settings: style.settings,
    lora: style.lora,
  }));
}

/**
 * Get list of all categories
 */
export function getStyleCategories() {
  return [...STYLE_CATEGORIES];
}

/**
 * Apply style to a prompt
 * Replaces {prompt} placeholder in style.prompt with the provided prompt text
 *
 * @param {string} styleId - The style ID to apply
 * @param {string} promptText - The base prompt text (theme modifiers + custom prompt)
 * @returns {object} - { prompt, negative, settings, lora } or null if style not found
 */
export function applyStyleToPrompt(styleId, promptText) {
  const style = getStyleById(styleId);

  if (!style) {
    console.warn(`[Styles] Style not found: ${styleId}`);
    return null;
  }

  // Strip color terms from theme modifiers for monochrome styles
  // This prevents colored lighting/palette descriptions from bleeding
  // into B&W outputs like pencil_sketch, charcoal, ink_drawing
  let processedPrompt = promptText;
  if (MONOCHROME_STYLES.has(styleId)) {
    processedPrompt = stripColorFromModifiers(promptText);
  }

  // Replace {prompt} placeholder with the (possibly color-stripped) prompt text
  const enhancedPrompt = style.prompt.replace('{prompt}', processedPrompt);

  return {
    prompt: enhancedPrompt,
    negative: style.negative,
    settings: style.settings,
    lora: style.lora,
  };
}

/**
 * Get default style settings
 * Returns sensible defaults when no style is selected
 */
export function getDefaultStyleSettings() {
  return {
    cfg: 7.0,
    steps: 28,
    sampler: 'dpmpp_2m',
    scheduler: 'karras',
    denoise: 1.0,
  };
}

// Export categories constant and monochrome utilities
export { STYLE_CATEGORIES, MONOCHROME_STYLES, stripColorFromModifiers, CONDENSED_MODIFIER_STYLES, condenseModifiers };
