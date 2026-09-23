/**
 * Ollama Service - Local LLM for smart prompt suggestions
 * Uses qwen2:1.5b for fast, creative prompt generation
 */

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:latest';
const OLLAMA_TIMEOUT = 20000; // 20 second timeout (llama3.2 is larger)

class OllamaService {
  constructor() {
    this.available = false;
    this.lastCheck = 0;
    this.checkInterval = 60000; // Re-check availability every 60s
    this.checking = false; // Prevent concurrent health checks

    // Concurrency control
    this.activeRequests = 0;
    this.maxConcurrent = 2; // Limit concurrent LLM calls to prevent Ollama OOM

    // Response cache to avoid redundant LLM calls
    this.cache = new Map();
    this.cacheTTL = 60000; // 60 second cache
    this.maxCacheSize = 100;
  }

  /**
   * Check if Ollama is available
   */
  async checkAvailability() {
    const now = Date.now();
    if (now - this.lastCheck < this.checkInterval) {
      return this.available;
    }

    // Prevent concurrent health checks
    if (this.checking) {
      return this.available;
    }
    this.checking = true;

    let timeout;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${OLLAMA_URL}/api/tags`, {
        signal: controller.signal
      });

      if (response.ok) {
        const data = await response.json();
        this.available = data.models?.some(m => m.name.includes('llama3.2')) || false;
        if (!this.available) {
          console.log('[Ollama] Service available but llama3.2 model not found');
        }
      } else {
        this.available = false;
      }
    } catch (error) {
      this.available = false;
    } finally {
      if (timeout) clearTimeout(timeout);
      this.checking = false;
    }

    this.lastCheck = now;
    return this.available;
  }

  /**
   * Generate prompt suggestions using LLM
   * @param {string} subdomain - The domain name (e.g., "moonwolf")
   * @param {string} tld - The TLD (e.g., "cryptofans")
   * @param {string} description - Optional user description
   * @param {boolean} skipCache - Skip cache for fresh suggestions
   * @returns {Promise<string[]>} Array of prompt suggestions
   */
  async generateSuggestions(subdomain, tld = '', description = '', skipCache = false) {
    // Check cache first to avoid redundant LLM calls (unless refresh requested)
    const cacheKey = `${subdomain}:${tld}:${description}`;
    if (!skipCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.time < this.cacheTTL) {
        console.log(`[Ollama] Cache hit for "${subdomain}.${tld}"`);
        return cached.suggestions;
      }
    }

    if (!await this.checkAvailability()) {
      return null; // Will fall back to static suggestions
    }

    // Concurrency control - prevent Ollama OOM under load
    if (this.activeRequests >= this.maxConcurrent) {
      console.log('[Ollama] Max concurrent requests reached, using fallback');
      return null;
    }

    this.activeRequests++;
    let timeout;

    try {
      // Build context based on TLD
      const tldContext = this.getTldContext(tld);

      // Build the prompt
      const prompt = this.buildPrompt(subdomain, tldContext, description);

      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);

      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt,
          stream: false,
          options: {
            temperature: 0.9,
            top_p: 0.9,
            num_predict: 200, // Shorter output for simple prompts
          }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        console.error('[Ollama] Generation failed:', response.status);
        return null;
      }

      const data = await response.json();
      const suggestions = this.parseResponse(data.response);

      if (suggestions.length >= 3) {
        console.log(`[Ollama] Generated ${suggestions.length} suggestions for "${subdomain}.${tld}"`);

        // Cache successful response
        this.cache.set(cacheKey, { suggestions, time: Date.now() });

        // Cleanup old cache entries if over limit
        if (this.cache.size > this.maxCacheSize) {
          const oldest = [...this.cache.entries()]
            .sort((a, b) => a[1].time - b[1].time)[0];
          this.cache.delete(oldest[0]);
        }

        return suggestions;
      }

      return null; // Fall back if parsing failed
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('[Ollama] Request timed out');
      } else {
        console.error('[Ollama] Error:', error.message);
      }
      return null;
    } finally {
      if (timeout) clearTimeout(timeout);
      this.activeRequests--;
    }
  }

  /**
   * Get context hints based on TLD
   */
  getTldContext(tld) {
    const contexts = {
      cryptofans: {
        theme: 'cryptocurrency, blockchain, digital assets, web3',
        style: 'futuristic, digital, cyber',
        hint: 'crypto/blockchain themed'
      },
      aiworktools: {
        theme: 'artificial intelligence, technology, automation, software',
        style: 'tech, modern, sleek',
        hint: 'AI/technology themed'
      },
      aisoftwaredesign: {
        theme: 'software development, code, design systems, architecture',
        style: 'clean, professional, technical',
        hint: 'software/design themed'
      }
    };

    return contexts[tld?.toLowerCase()] || {
      theme: 'creative, artistic',
      style: 'vibrant, unique',
      hint: 'general creative'
    };
  }

  /**
   * Build the LLM prompt - generates simple subject descriptions
   * The theme modifiers handle all the style/quality details
   */
  buildPrompt(subdomain, tldContext, description) {
    const primarySubject = description ? description : subdomain;

    let prompt = `Generate 5 simple image subject ideas based on "${primarySubject}".

Rules:
- Each idea should be 5-15 words max
- Just describe WHAT to show, not how (no style/quality words)
- Be creative - interpret the subject as characters, creatures, scenes, or objects
- No technical photography terms
- English only

Examples of good simple prompts:
- "a wolf howling at the moon on a cliff"
- "robot playing chess in a garden"
- "phoenix rising from flames"
- "samurai standing in cherry blossom rain"
- "treasure chest overflowing with gold coins"

Generate 5 simple ideas for "${primarySubject}", one per line:`;

    return prompt;
  }

  /**
   * Parse LLM response into array of suggestions
   */
  parseResponse(response) {
    if (!response) return [];

    // Split by newlines and clean up
    const lines = response
      .split('\n')
      .map(line => line.trim())
      .filter(line => {
        // Remove empty lines, numbered lines, and meta text
        if (!line) return false;
        if (/^\d+[.):]\s*/.test(line)) {
          // Remove numbering but keep the content
          return true;
        }
        if (line.toLowerCase().includes('here are') ||
            line.toLowerCase().includes('prompts:') ||
            line.toLowerCase().includes('sure,')) {
          return false;
        }
        return line.length > 20; // Must be substantial
      })
      .map(line => {
        // Clean up the line
        let cleaned = line
          .replace(/^\d+[.):]\s*/, '') // Remove numbering
          .replace(/^[-*]\s*/, '') // Remove bullets
          .replace(/^["']|["']$/g, '') // Remove quotes
          .trim();

        // Truncate to 100 chars max (simple prompts)
        if (cleaned.length > 100) {
          cleaned = cleaned.slice(0, 97) + '...';
        }
        return cleaned;
      })
      .filter(line => line.length > 10);

    return lines.slice(0, 5);
  }
}

export default new OllamaService();
