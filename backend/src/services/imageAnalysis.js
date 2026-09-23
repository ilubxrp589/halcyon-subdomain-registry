/**
 * Image Analysis Service using LLaVA
 *
 * Uses the local LLaVA vision model (llava:7b) to analyze generated images
 * for quality, style adherence, theme accuracy, and prompt accuracy.
 *
 * Features:
 * - Style matching validation (1-10 score)
 * - Theme element detection
 * - Prompt accuracy checking
 * - Quality assessment (artifacts, blur, composition)
 * - Concurrency control to prevent overwhelming Ollama
 */

import { loggers } from '../utils/logger.js';

const log = loggers.imageAnalysis || loggers.general || console;

// =============================================================
//                     CONFIGURATION
// =============================================================

const CONFIG = {
  // Ollama endpoint for LLaVA
  ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',

  // Model to use for vision analysis
  model: process.env.LLAVA_MODEL || 'llava:7b',

  // Maximum concurrent analysis requests
  maxConcurrent: parseInt(process.env.LLAVA_MAX_CONCURRENT) || 2,

  // Timeout for each analysis (ms)
  timeout: parseInt(process.env.LLAVA_TIMEOUT) || 60000,

  // Whether the service is enabled
  enabled: process.env.LLAVA_ENABLED !== 'false',
};

// =============================================================
//                     CONCURRENCY CONTROL
// =============================================================

class ConcurrencyLimiter {
  constructor(maxConcurrent) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }

    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release() {
    this.running--;
    if (this.queue.length > 0 && this.running < this.maxConcurrent) {
      this.running++;
      const next = this.queue.shift();
      next();
    }
  }
}

const limiter = new ConcurrencyLimiter(CONFIG.maxConcurrent);

// =============================================================
//                     CORE ANALYSIS FUNCTIONS
// =============================================================

/**
 * Send a prompt with an image to LLaVA
 * @param {string} imageBase64 - Base64 encoded image (without data: prefix)
 * @param {string} prompt - The analysis prompt
 * @returns {Promise<string>} - LLaVA's response
 */
async function queryLLaVA(imageBase64, prompt) {
  if (!CONFIG.enabled) {
    throw new Error('LLaVA image analysis is disabled');
  }

  await limiter.acquire();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.timeout);

    // Remove data:image/xxx;base64, prefix if present
    let cleanBase64 = imageBase64;
    if (imageBase64.includes('base64,')) {
      cleanBase64 = imageBase64.split('base64,')[1];
    }

    const response = await fetch(`${CONFIG.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: CONFIG.model,
        prompt: prompt,
        images: [cleanBase64],
        stream: false,
        options: {
          temperature: 0.1, // Low temperature for consistent analysis
          num_predict: 500, // Limit response length
        },
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLaVA request failed: ${error}`);
    }

    const data = await response.json();
    return data.response || '';
  } finally {
    limiter.release();
  }
}

/**
 * Parse a score from LLaVA's text response
 * @param {string} text - Response text containing a score
 * @returns {number|null} - Extracted score (1-10) or null
 */
function parseScore(text) {
  // Look for patterns like "Score: 8", "8/10", "Rating: 7"
  const patterns = [
    /(?:score|rating|grade)[:\s]*(\d+)(?:\/10)?/i,
    /(\d+)(?:\s*\/\s*10)/,
    /(\d+)\s*(?:out of\s*10)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const score = parseInt(match[1]);
      if (score >= 1 && score <= 10) {
        return score;
      }
    }
  }

  // Last resort: find any single digit that could be a score
  const digits = text.match(/\b([1-9]|10)\b/g);
  if (digits && digits.length > 0) {
    return parseInt(digits[0]);
  }

  return null;
}

/**
 * Parse elements from a comma or newline separated list
 * @param {string} text - Text containing element list
 * @returns {string[]} - Array of found elements
 */
function parseElementList(text) {
  // Look for list items after "found:" or "present:" or similar
  const listMatch = text.match(/(?:found|present|visible|detected|identified)[:\s]*([^\n]+(?:\n[-•*]\s*[^\n]+)*)/i);

  if (listMatch) {
    const listText = listMatch[1];
    // Split by commas, bullet points, or newlines
    const elements = listText
      .split(/[,\n]/)
      .map(item => item.replace(/^[-•*\s]+/, '').trim())
      .filter(item => item.length > 0 && item.length < 100);

    return elements;
  }

  return [];
}

// =============================================================
//                     PUBLIC API
// =============================================================

class ImageAnalysisService {
  constructor() {
    this.stats = {
      totalAnalyses: 0,
      successfulAnalyses: 0,
      failedAnalyses: 0,
      averageResponseTime: 0,
    };
  }

  /**
   * Check if the LLaVA service is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      const response = await fetch(`${CONFIG.ollamaUrl}/api/tags`, {
        method: 'GET',
        timeout: 5000,
      });

      if (!response.ok) return false;

      const data = await response.json();
      const models = data.models || [];
      return models.some(m => m.name?.includes('llava'));
    } catch {
      return false;
    }
  }

  /**
   * Analyze if an image matches an expected art style
   * @param {string} imageBase64 - Base64 encoded image
   * @param {string} expectedStyle - The style name/description
   * @returns {Promise<{score: number, reasoning: string}>}
   */
  async analyzeStyle(imageBase64, expectedStyle) {
    const startTime = Date.now();
    this.stats.totalAnalyses++;

    const prompt = `You are an expert art critic analyzing an AI-generated image.

The image is supposed to be in the "${expectedStyle}" style.

Analyze the image and rate how well it matches the "${expectedStyle}" style on a scale of 1-10:
- 1-3: Does not match the style at all
- 4-5: Some elements present but weak execution
- 6-7: Good match with minor issues
- 8-9: Strong match to the style
- 10: Perfect execution of the style

Provide your response in this format:
SCORE: [1-10]
REASONING: [Brief explanation of why you gave this score, mentioning specific visual elements]`;

    try {
      const response = await queryLLaVA(imageBase64, prompt);
      const score = parseScore(response);

      this.stats.successfulAnalyses++;
      this.updateAverageTime(Date.now() - startTime);

      return {
        score: score || 5, // Default to middle if parsing fails
        reasoning: response,
        expectedStyle,
        analysisTime: Date.now() - startTime,
      };
    } catch (error) {
      this.stats.failedAnalyses++;
      log.error({ error: error.message, expectedStyle }, 'Style analysis failed');

      return {
        score: null,
        reasoning: `Analysis failed: ${error.message}`,
        expectedStyle,
        error: error.message,
      };
    }
  }

  /**
   * Analyze if an image matches a theme definition
   * @param {string} imageBase64 - Base64 encoded image
   * @param {object} themeDefinition - { id, name, modifiers, category }
   * @returns {Promise<{score: number, elements: string[], reasoning: string}>}
   */
  async analyzeTheme(imageBase64, themeDefinition) {
    const startTime = Date.now();
    this.stats.totalAnalyses++;

    const { name, modifiers, category } = themeDefinition;

    const prompt = `You are analyzing an AI-generated image to check if it matches a specific theme.

THEME: "${name}"
CATEGORY: ${category}
EXPECTED ELEMENTS: ${modifiers}

Analyze the image and determine:
1. How well does the image match the theme? (Score 1-10)
2. Which expected elements are visible in the image?
3. Which expected elements are missing or poorly represented?

Provide your response in this format:
SCORE: [1-10]
ELEMENTS FOUND: [comma-separated list of theme elements visible]
ELEMENTS MISSING: [comma-separated list of expected elements not visible]
REASONING: [Brief explanation]`;

    try {
      const response = await queryLLaVA(imageBase64, prompt);
      const score = parseScore(response);
      const elementsFound = parseElementList(response);

      // Parse missing elements
      const missingMatch = response.match(/(?:missing|not visible|absent)[:\s]*([^\n]+)/i);
      const elementsMissing = missingMatch
        ? missingMatch[1].split(',').map(s => s.trim()).filter(s => s.length > 0 && s.length < 100)
        : [];

      this.stats.successfulAnalyses++;
      this.updateAverageTime(Date.now() - startTime);

      return {
        score: score || 5,
        elements: elementsFound,
        elementsMissing,
        reasoning: response,
        theme: themeDefinition,
        analysisTime: Date.now() - startTime,
      };
    } catch (error) {
      this.stats.failedAnalyses++;
      log.error({ error: error.message, theme: name }, 'Theme analysis failed');

      return {
        score: null,
        elements: [],
        elementsMissing: [],
        reasoning: `Analysis failed: ${error.message}`,
        theme: themeDefinition,
        error: error.message,
      };
    }
  }

  /**
   * Check which elements from a prompt are visible in the image
   * @param {string} imageBase64 - Base64 encoded image
   * @param {string} prompt - The generation prompt
   * @returns {Promise<{found: string[], missing: string[], score: number}>}
   */
  async analyzePromptAccuracy(imageBase64, prompt) {
    const startTime = Date.now();
    this.stats.totalAnalyses++;

    const analysisPrompt = `You are checking if an AI-generated image matches its generation prompt.

ORIGINAL PROMPT: "${prompt}"

Look at the image and identify:
1. Which elements from the prompt are clearly visible
2. Which elements from the prompt are missing or unclear
3. Overall accuracy percentage (0-100%)

Provide your response in this format:
FOUND: [comma-separated list of prompt elements visible in the image]
MISSING: [comma-separated list of prompt elements NOT visible]
ACCURACY: [percentage]%
NOTES: [Any additional observations]`;

    try {
      const response = await queryLLaVA(imageBase64, analysisPrompt);

      // Parse found elements
      const foundMatch = response.match(/FOUND[:\s]*([^\n]+)/i);
      const found = foundMatch
        ? foundMatch[1].split(',').map(s => s.trim()).filter(s => s.length > 0 && s.length < 100)
        : [];

      // Parse missing elements
      const missingMatch = response.match(/MISSING[:\s]*([^\n]+)/i);
      const missing = missingMatch
        ? missingMatch[1].split(',').map(s => s.trim()).filter(s => s.length > 0 && s.length < 100)
        : [];

      // Parse accuracy percentage
      const accuracyMatch = response.match(/(?:ACCURACY|accuracy)[:\s]*(\d+)/i);
      const accuracy = accuracyMatch ? parseInt(accuracyMatch[1]) : null;

      // Calculate score from accuracy (1-10 scale)
      const score = accuracy !== null ? Math.round(accuracy / 10) :
        (found.length > 0 ? Math.round((found.length / (found.length + missing.length)) * 10) : 5);

      this.stats.successfulAnalyses++;
      this.updateAverageTime(Date.now() - startTime);

      return {
        found,
        missing,
        score: Math.min(10, Math.max(1, score)),
        accuracy,
        reasoning: response,
        originalPrompt: prompt,
        analysisTime: Date.now() - startTime,
      };
    } catch (error) {
      this.stats.failedAnalyses++;
      log.error({ error: error.message }, 'Prompt accuracy analysis failed');

      return {
        found: [],
        missing: [],
        score: null,
        accuracy: null,
        reasoning: `Analysis failed: ${error.message}`,
        originalPrompt: prompt,
        error: error.message,
      };
    }
  }

  /**
   * Analyze image quality (artifacts, blur, composition)
   * @param {string} imageBase64 - Base64 encoded image
   * @returns {Promise<{artifacts: number, blur: number, composition: number, overall: number}>}
   */
  async analyzeQuality(imageBase64) {
    const startTime = Date.now();
    this.stats.totalAnalyses++;

    const prompt = `You are a quality assurance analyst checking an AI-generated image.

Evaluate the image on these criteria (score each 1-10):

1. ARTIFACTS: Check for visible AI artifacts, glitches, distortions, extra limbs, melted features
   - 10 = No artifacts visible
   - 1 = Severe artifacts making image unusable

2. SHARPNESS: Check for blur, noise, or lack of detail
   - 10 = Crystal clear, highly detailed
   - 1 = Extremely blurry or noisy

3. COMPOSITION: Check overall visual appeal, balance, framing
   - 10 = Excellent composition
   - 1 = Poor composition, unbalanced

Provide your response in this format:
ARTIFACTS: [1-10]
SHARPNESS: [1-10]
COMPOSITION: [1-10]
OVERALL: [1-10]
ISSUES: [Any specific issues found, or "None"]`;

    try {
      const response = await queryLLaVA(imageBase64, prompt);

      // Parse individual scores
      const artifactsMatch = response.match(/ARTIFACTS[:\s]*(\d+)/i);
      const sharpnessMatch = response.match(/SHARPNESS[:\s]*(\d+)/i);
      const compositionMatch = response.match(/COMPOSITION[:\s]*(\d+)/i);
      const overallMatch = response.match(/OVERALL[:\s]*(\d+)/i);

      const artifacts = artifactsMatch ? Math.min(10, Math.max(1, parseInt(artifactsMatch[1]))) : 5;
      const sharpness = sharpnessMatch ? Math.min(10, Math.max(1, parseInt(sharpnessMatch[1]))) : 5;
      const composition = compositionMatch ? Math.min(10, Math.max(1, parseInt(compositionMatch[1]))) : 5;

      // Calculate overall if not provided
      const overall = overallMatch
        ? Math.min(10, Math.max(1, parseInt(overallMatch[1])))
        : Math.round((artifacts + sharpness + composition) / 3);

      // Parse issues
      const issuesMatch = response.match(/ISSUES[:\s]*([^\n]+)/i);
      const issues = issuesMatch ? issuesMatch[1].trim() : '';

      this.stats.successfulAnalyses++;
      this.updateAverageTime(Date.now() - startTime);

      return {
        artifacts,
        sharpness,
        composition,
        overall,
        issues: issues === 'None' ? null : issues,
        reasoning: response,
        analysisTime: Date.now() - startTime,
      };
    } catch (error) {
      this.stats.failedAnalyses++;
      log.error({ error: error.message }, 'Quality analysis failed');

      return {
        artifacts: null,
        sharpness: null,
        composition: null,
        overall: null,
        issues: `Analysis failed: ${error.message}`,
        error: error.message,
      };
    }
  }

  /**
   * Perform a comprehensive analysis of an image
   * Combines style, theme, prompt accuracy, and quality checks
   * @param {string} imageBase64 - Base64 encoded image
   * @param {object} options - { style, theme, prompt }
   * @returns {Promise<object>} - Complete analysis results
   */
  async analyzeComprehensive(imageBase64, options = {}) {
    const { style, theme, prompt } = options;
    const results = {
      timestamp: new Date().toISOString(),
      analyses: {},
    };

    // Run all applicable analyses in parallel
    const promises = [];

    if (style) {
      promises.push(
        this.analyzeStyle(imageBase64, style)
          .then(r => { results.analyses.style = r; })
      );
    }

    if (theme) {
      promises.push(
        this.analyzeTheme(imageBase64, theme)
          .then(r => { results.analyses.theme = r; })
      );
    }

    if (prompt) {
      promises.push(
        this.analyzePromptAccuracy(imageBase64, prompt)
          .then(r => { results.analyses.prompt = r; })
      );
    }

    // Always run quality check
    promises.push(
      this.analyzeQuality(imageBase64)
        .then(r => { results.analyses.quality = r; })
    );

    await Promise.all(promises);

    // Calculate aggregate score
    const scores = [];
    if (results.analyses.style?.score) scores.push(results.analyses.style.score);
    if (results.analyses.theme?.score) scores.push(results.analyses.theme.score);
    if (results.analyses.prompt?.score) scores.push(results.analyses.prompt.score);
    if (results.analyses.quality?.overall) scores.push(results.analyses.quality.overall);

    results.aggregateScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10
      : null;

    results.passed = results.aggregateScore !== null && results.aggregateScore >= 5;

    return results;
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      ...this.stats,
      config: {
        model: CONFIG.model,
        maxConcurrent: CONFIG.maxConcurrent,
        timeout: CONFIG.timeout,
        enabled: CONFIG.enabled,
      },
      currentLoad: limiter.running,
      queuedRequests: limiter.queue.length,
    };
  }

  /**
   * Update average response time
   */
  updateAverageTime(newTime) {
    const total = this.stats.averageResponseTime * (this.stats.successfulAnalyses - 1);
    this.stats.averageResponseTime = Math.round((total + newTime) / this.stats.successfulAnalyses);
  }
}

// Export singleton instance
export const imageAnalysisService = new ImageAnalysisService();
export default imageAnalysisService;

export {
  ImageAnalysisService,
  CONFIG as IMAGE_ANALYSIS_CONFIG,
};
