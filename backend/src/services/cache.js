/**
 * Simple In-Memory Cache Service for Marketplace
 * Provides TTL-based caching to reduce database load
 */

class CacheService {
  constructor() {
    this.cache = new Map();
    this.timers = new Map();

    // Default TTLs in seconds
    this.TTL = {
      STATS: 60,        // /marketplace/stats - 60 seconds
      LISTINGS: 30,     // /marketplace/listings - 30 seconds
      RECENT: 30,       // /marketplace/recent - 30 seconds
    };
  }

  /**
   * Get a cached value
   * @param {string} key - Cache key
   * @returns {any|null} - Cached value or null if not found/expired
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired (shouldn't happen due to timers, but just in case)
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Set a cached value with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttlSeconds - Time to live in seconds
   */
  set(key, value, ttlSeconds) {
    // Clear existing timer if any
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    // Store the value
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlSeconds * 1000),
      createdAt: Date.now(),
    });

    // Set expiration timer
    const timer = setTimeout(() => {
      this.delete(key);
    }, ttlSeconds * 1000);

    this.timers.set(key, timer);
  }

  /**
   * Delete a cached value
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
  }

  /**
   * Clear all cached values matching a pattern
   * @param {string} pattern - Pattern to match (supports * wildcard)
   */
  clearPattern(pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const keysToDelete = [];

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.delete(key));
    return keysToDelete.length;
  }

  /**
   * Clear all marketplace caches
   */
  clearMarketplace() {
    const cleared = this.clearPattern('marketplace:*');
    console.log(`[Cache] Cleared ${cleared} marketplace cache entries`);
    return cleared;
  }

  /**
   * Clear listings cache
   */
  clearListings() {
    const cleared = this.clearPattern('marketplace:listings:*');
    console.log(`[Cache] Cleared ${cleared} listings cache entries`);
    return cleared;
  }

  /**
   * Clear stats cache
   */
  clearStats() {
    this.delete('marketplace:stats');
    console.log('[Cache] Cleared stats cache');
  }

  /**
   * Clear recent sales cache
   */
  clearRecent() {
    const cleared = this.clearPattern('marketplace:recent:*');
    console.log(`[Cache] Cleared ${cleared} recent cache entries`);
    return cleared;
  }

  /**
   * Get cache stats for debugging
   */
  getStats() {
    const entries = [];
    for (const [key, entry] of this.cache.entries()) {
      entries.push({
        key,
        expiresIn: Math.max(0, Math.round((entry.expiresAt - Date.now()) / 1000)),
        age: Math.round((Date.now() - entry.createdAt) / 1000),
      });
    }
    return {
      size: this.cache.size,
      entries,
    };
  }

  /**
   * Clear all cache
   */
  clearAll() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.cache.clear();
    this.timers.clear();
    console.log('[Cache] Cleared all cache');
  }
}

// Singleton instance
export const cacheService = new CacheService();
export default cacheService;
