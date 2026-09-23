/**
 * Theme Index - Loads and organizes all theme categories
 *
 * Categories:
 * - business: 46 themes (professional/service industry)
 * - exotic: 33 themes (surreal/fantastical)
 * - jobs: 47 themes (unusual professions)
 * - fantasy: 39 themes (magical realms)
 * - fractal: 46 themes (psychedelic/consciousness)
 * - nature: 49 themes (natural world/wildlife)
 * - space: 48 themes (cosmic/sci-fi)
 * - anime: 58 themes (22 chars + 12 landscapes + 12 scifi + 12 creatures)
 * Total: ~366 themes
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// All category names
const CATEGORIES = ['business', 'exotic', 'jobs', 'fantasy', 'fractal', 'nature', 'space', 'anime'];

// Load a theme file
function loadThemeFile(filename) {
  const filePath = join(__dirname, filename);
  const data = JSON.parse(readFileSync(filePath, 'utf-8'));
  return data.themes;
}

// Cache for loaded themes
let themesCache = null;

/**
 * Load all themes from category files
 * @returns {Object} Themes organized by category
 */
export function loadAllThemes() {
  if (themesCache) return themesCache;

  try {
    const business = loadThemeFile('business.json');
    const exotic = loadThemeFile('exotic.json');
    const jobs = loadThemeFile('jobs.json');
    const fantasy = loadThemeFile('fantasy.json');
    const fractal = loadThemeFile('fractal.json');
    const nature = loadThemeFile('nature.json');
    const space = loadThemeFile('space.json');
    const anime = loadThemeFile('anime.json');

    themesCache = {
      business,
      exotic,
      jobs,
      fantasy,
      fractal,
      nature,
      space,
      anime
    };

    // Log theme counts
    const counts = {};
    for (const [cat, themes] of Object.entries(themesCache)) {
      counts[cat] = Object.keys(themes).length;
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`[Themes] Loaded ${total} themes:`, counts);

    return themesCache;
  } catch (error) {
    console.error('[Themes] Failed to load themes:', error.message);
    throw error;
  }
}

/**
 * Get themes formatted for frontend API
 * @returns {Object} Themes by category with id, name, category, modifiers
 */
export function getThemesForAPI() {
  const themes = loadAllThemes();

  const formatCategory = (categoryThemes, categoryName) => {
    return Object.entries(categoryThemes).map(([id, theme]) => ({
      id,
      name: theme.name,
      category: categoryName,
      modifiers: theme.modifiers,
      ...(theme.modifiers_animagine && { modifiers_animagine: theme.modifiers_animagine }),
      ...(theme.subcategory && { subcategory: theme.subcategory }),
      ...(theme.negative && { negative: theme.negative }),
      ...(theme.negative_animagine && { negative_animagine: theme.negative_animagine }),
      ...(theme.settings && { settings: theme.settings })
    }));
  };

  const result = {};
  for (const category of CATEGORIES) {
    if (themes[category]) {
      result[category] = formatCategory(themes[category], category);
    }
  }
  return result;
}

/**
 * Get a specific theme by ID
 * @param {string} themeId - Theme ID to find
 * @returns {Object|null} Theme object or null if not found
 */
export function getThemeById(themeId) {
  const themes = loadAllThemes();

  for (const category of CATEGORIES) {
    if (themes[category]?.[themeId]) {
      return {
        ...themes[category][themeId],
        id: themeId,
        category
      };
    }
  }

  return null;
}

/**
 * Get model-aware prompt modifiers for a theme.
 * Returns the appropriate modifiers and negative prompt based on the active model.
 *
 * @param {string} themeId - Theme ID
 * @param {string} modelType - Active model type (e.g., 'sdxl-animagine', 'sdxl-playground', etc.)
 * @returns {Object|null} { modifiers, negative, settings } or null if theme not found
 */
export function getThemeModifiers(themeId, modelType) {
  const theme = getThemeById(themeId);
  if (!theme) return null;

  const isAnimagine = modelType && modelType.includes('animagine');

  return {
    modifiers: (isAnimagine && theme.modifiers_animagine) ? theme.modifiers_animagine : theme.modifiers,
    negative: (isAnimagine && theme.negative_animagine) ? theme.negative_animagine : (theme.negative || null),
    settings: theme.settings || null,
    id: theme.id,
    name: theme.name,
    category: theme.category,
  };
}

/**
 * Get theme statistics
 * @returns {Object} Theme counts by category
 */
export function getThemeStats() {
  const themes = loadAllThemes();

  const stats = {};
  let total = 0;

  for (const [category, categoryThemes] of Object.entries(themes)) {
    const count = Object.keys(categoryThemes).length;
    stats[category] = count;
    total += count;
  }

  stats.total = total;
  return stats;
}

/**
 * Clear the themes cache (for reloading)
 */
export function clearThemesCache() {
  themesCache = null;
}

// Alias for backwards compatibility with routes.js
export const getAllThemes = getThemesForAPI;

export default {
  loadAllThemes,
  getThemesForAPI,
  getAllThemes,
  getThemeById,
  getThemeModifiers,
  getThemeStats,
  clearThemesCache
};
