/**
 * GPU Dashboard Service
 * Proxies hardware-level nvidia-smi data from the GPU dashboard at 192.0.2.67:8085
 * with 5s cache TTL to avoid hammering on every 15s admin poll.
 */

class GpuDashboardService {
  constructor() {
    this.statsCache = null;
    this.statsCacheTime = 0;
    this.jobsCache = null;
    this.jobsCacheTime = 0;
    this.cacheTTL = 5000; // 5s
    this.baseUrl = 'http://192.0.2.67:8085';
    this.timeout = 3000; // 3s
  }

  async fetchWithTimeout(url) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(this.timeout),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      return null;
    }
  }

  normalizeStats(data) {
    const normalized = {};
    for (const [machine, info] of Object.entries(data)) {
      if (!info || typeof info !== 'object' || !info.gpus) {
        normalized[machine] = info;
        continue;
      }
      normalized[machine] = {
        gpus: info.gpus.map(gpu => ({
          index: gpu.index ?? 0,
          name: gpu.name || `GPU ${gpu.index}`,
          temperature: parseFloat(gpu.temp) || 0,
          utilization: parseFloat(gpu.util) || 0,
          memory_used: parseFloat(gpu.vram_used) || 0,
          memory_total: parseFloat(gpu.vram_total) || 0,
          power_draw: parseFloat(gpu.power) || 0,
          power_limit: parseFloat(gpu.power_limit) || 0,
          clock_graphics: parseFloat(gpu.clock_gpu) || 0,
          clock_memory: parseFloat(gpu.clock_mem) || 0,
          fan_rpm: typeof gpu.fan_rpm === 'number' ? gpu.fan_rpm : null,
          fan_speed_pct: parseFloat(gpu.fan_pct) || 0,
        })),
      };
    }
    return normalized;
  }

  async getStats() {
    const now = Date.now();
    if (this.statsCache && (now - this.statsCacheTime) < this.cacheTTL) {
      return this.statsCache;
    }

    const data = await this.fetchWithTimeout(`${this.baseUrl}/api/stats`);
    if (data) {
      const normalized = this.normalizeStats(data);
      this.statsCache = normalized;
      this.statsCacheTime = now;
      return normalized;
    }

    // Return stale cache if available, otherwise error
    if (this.statsCache) return this.statsCache;
    return { error: 'GPU dashboard unavailable' };
  }

  async getJobs() {
    const now = Date.now();
    if (this.jobsCache && (now - this.jobsCacheTime) < this.cacheTTL) {
      return this.jobsCache;
    }

    const data = await this.fetchWithTimeout(`${this.baseUrl}/api/jobs`);
    if (data) {
      this.jobsCache = data;
      this.jobsCacheTime = now;
      return data;
    }

    if (this.jobsCache) return this.jobsCache;
    return { error: 'GPU dashboard unavailable' };
  }
}

export const gpuDashboard = new GpuDashboardService();
