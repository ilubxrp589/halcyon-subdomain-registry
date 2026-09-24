/**
 * ComfyUI Process Manager
 *
 * Manages ComfyUI process lifecycle to prevent memory accumulation crashes.
 * Implements automatic restarts after N generations with staggered scheduling
 * to maintain availability (at least 2 GPUs always online).
 *
 * Key features:
 * - Generation counting per GPU
 * - Automatic restart after configurable threshold (default: 15)
 * - Staggered restarts to maintain availability
 * - Health monitoring and graceful shutdown
 * - Manual restart API for admin control
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import gpuFanControl from './gpuFanControl.js';

const execAsync = promisify(exec);

// =============================================================
//                     CONFIGURATION
// =============================================================

const CONFIG = {
  // Restart threshold - restart after this many generations (set to 10 to reduce restart frequency)
  restartThreshold: parseInt(process.env.COMFYUI_RESTART_THRESHOLD) || 10,

  // Minimum GPUs that must stay online during restart
  minOnlineGPUs: 2,

  // ComfyUI directory
  comfyuiDir: process.env.COMFYUI_DIR || '/home/localai/ComfyUI',

  // Log directory
  logDir: process.env.COMFYUI_LOG_DIR || '/home/localai/Desktop/FULL HSR start/logs',

  // Startup timeout (ms) - how long to wait for ComfyUI to become ready
  startupTimeout: 120000,

  // Health check interval (ms)
  healthCheckInterval: 30000,

  // Cooldown between restarts (ms) - prevent restart storms
  restartCooldown: 60000,
};

// GPU Server definitions - All remote GPUs (no local GPUs on 192.0.2.39)
// 4x RTX 3080 (.67 and .220) + 4x RTX 3060 (.249 and .97)
const GPU_SERVERS = [
  {
    id: 'gpu0-remote',
    port: 8188,
    cudaDevice: '0',
    name: '3080 @ .67',
    isDisplayGPU: false,
    isRemote: true,
    url: 'http://192.0.2.67:8188'
  },
  {
    id: 'gpu1-remote',
    port: 8189,
    cudaDevice: '1',
    name: '3080-GPU1 @ .67',
    isDisplayGPU: false,
    isRemote: true,
    url: 'http://192.0.2.67:8189'
  },
  {
    id: 'gpu2-remote',
    port: 8188,
    cudaDevice: '0',
    name: '3080 @ .220',
    isDisplayGPU: false,
    isRemote: true,
    url: 'http://192.0.2.220:8188'
  },
  {
    id: 'gpu3-remote',
    port: 8189,
    cudaDevice: '1',
    name: '3080-GPU1 @ .220',
    isDisplayGPU: false,
    isRemote: true,
    url: 'http://192.0.2.220:8189'
  },
  {
    id: 'gpu4-remote',
    port: 8188,
    cudaDevice: '0',
    name: '3060 @ .249',
    isDisplayGPU: false,
    isRemote: true,
    url: 'http://192.0.2.249:8188'
  },
  {
    id: 'gpu5-remote',
    port: 8189,
    cudaDevice: '1',
    name: '3060-GPU1 @ .249',
    isDisplayGPU: false,
    isRemote: true,
    url: 'http://192.0.2.249:8189'
  },
  {
    id: 'gpu6-remote',
    port: 8188,
    cudaDevice: '0',
    name: '3060 @ .97',
    isDisplayGPU: false,
    isRemote: true,
    url: 'http://192.0.2.97:8188'
  },
  {
    id: 'gpu7-remote',
    port: 8189,
    cudaDevice: '1',
    name: '3060-GPU1 @ .97',
    isDisplayGPU: false,
    isRemote: true,
    url: 'http://192.0.2.97:8189'
  },
];

// =============================================================
//                     STATE MANAGEMENT
// =============================================================

class ComfyUIManager {
  constructor() {
    // Generation counts per GPU
    this.generationCounts = new Map();

    // Restart state per GPU
    this.restartState = new Map();

    // Last restart time per GPU (for cooldown)
    this.lastRestartTime = new Map();

    // Queue for pending restarts
    this.restartQueue = [];

    // Lock to prevent concurrent restart operations
    this.restartLock = false;

    // Initialize state for each GPU
    GPU_SERVERS.forEach(gpu => {
      this.generationCounts.set(gpu.id, 0);
      this.restartState.set(gpu.id, 'running'); // running, restarting, stopped
      this.lastRestartTime.set(gpu.id, 0);
    });

    console.log(`[ComfyUIManager] Initialized with restart threshold: ${CONFIG.restartThreshold} generations`);
  }

  // =============================================================
  //                     GENERATION TRACKING
  // =============================================================

  /**
   * Record a completed generation for a GPU
   * @param {string} gpuId - GPU identifier (gpu0, gpu1, gpu2)
   * @returns {Object} - Status including whether restart is needed
   */
  recordGeneration(gpuId) {
    const count = (this.generationCounts.get(gpuId) || 0) + 1;
    this.generationCounts.set(gpuId, count);

    const needsRestart = count >= CONFIG.restartThreshold;
    const gpu = GPU_SERVERS.find(g => g.id === gpuId);

    console.log(`[ComfyUIManager] ${gpu?.name || gpuId}: Generation ${count}/${CONFIG.restartThreshold}`);

    if (needsRestart) {
      console.log(`[ComfyUIManager] ${gpu?.name || gpuId}: Restart threshold reached, queuing restart`);
      this.queueRestart(gpuId);
    }

    return {
      gpuId,
      generationCount: count,
      threshold: CONFIG.restartThreshold,
      needsRestart,
      restartQueued: needsRestart,
    };
  }

  /**
   * Get generation counts for all GPUs
   */
  getGenerationCounts() {
    const counts = {};
    this.generationCounts.forEach((count, gpuId) => {
      const gpu = GPU_SERVERS.find(g => g.id === gpuId);
      counts[gpuId] = {
        count,
        threshold: CONFIG.restartThreshold,
        remaining: CONFIG.restartThreshold - count,
        name: gpu?.name || gpuId,
        state: this.restartState.get(gpuId),
      };
    });
    return counts;
  }

  // =============================================================
  //                     RESTART MANAGEMENT
  // =============================================================

  /**
   * Queue a GPU for restart
   */
  queueRestart(gpuId) {
    // Check cooldown
    const lastRestart = this.lastRestartTime.get(gpuId) || 0;
    const timeSinceRestart = Date.now() - lastRestart;

    if (timeSinceRestart < CONFIG.restartCooldown) {
      console.log(`[ComfyUIManager] ${gpuId}: Cooldown active, skipping restart queue`);
      return false;
    }

    // Check if already queued
    if (this.restartQueue.includes(gpuId)) {
      console.log(`[ComfyUIManager] ${gpuId}: Already in restart queue`);
      return false;
    }

    // Check if already restarting
    if (this.restartState.get(gpuId) === 'restarting') {
      console.log(`[ComfyUIManager] ${gpuId}: Already restarting`);
      return false;
    }

    this.restartQueue.push(gpuId);
    console.log(`[ComfyUIManager] ${gpuId}: Added to restart queue (queue size: ${this.restartQueue.length})`);

    // Process queue
    this.processRestartQueue();

    return true;
  }

  /**
   * Process the restart queue (one at a time to maintain availability)
   */
  async processRestartQueue() {
    // Don't process if locked or empty queue
    if (this.restartLock || this.restartQueue.length === 0) {
      return;
    }

    // Check how many GPUs are currently online
    const onlineCount = await this.countOnlineGPUs();

    if (onlineCount <= CONFIG.minOnlineGPUs) {
      console.log(`[ComfyUIManager] Only ${onlineCount} GPUs online, waiting before restart`);
      // Retry in 30 seconds
      setTimeout(() => this.processRestartQueue(), 30000);
      return;
    }

    // Lock and process
    this.restartLock = true;
    const gpuId = this.restartQueue.shift();

    try {
      await this.restartGPU(gpuId);
    } catch (error) {
      console.error(`[ComfyUIManager] Failed to restart ${gpuId}:`, error.message);
    } finally {
      this.restartLock = false;

      // Process next in queue after a delay
      if (this.restartQueue.length > 0) {
        setTimeout(() => this.processRestartQueue(), 5000);
      }
    }
  }

  /**
   * Restart a specific GPU's ComfyUI instance
   */
  async restartGPU(gpuId) {
    const gpu = GPU_SERVERS.find(g => g.id === gpuId);
    if (!gpu) {
      throw new Error(`Unknown GPU: ${gpuId}`);
    }

    console.log(`[ComfyUIManager] ========================================`);
    console.log(`[ComfyUIManager] Restarting ${gpu.name} (port ${gpu.port})`);
    console.log(`[ComfyUIManager] ========================================`);

    this.restartState.set(gpuId, 'restarting');

    try {
      if (gpu.isRemote) {
        // Remote GPU - cannot restart locally, just wait for it to come back
        console.log(`[ComfyUIManager] ${gpu.name} is remote - skipping local restart`);
      } else {
        // Step 1: Kill existing process
        console.log(`[ComfyUIManager] Step 1: Stopping ComfyUI on port ${gpu.port}...`);
        await this.killComfyUIOnPort(gpu.port);

        // Brief pause to let resources free
        await this.sleep(3000);

        // Step 2: Start new process
        console.log(`[ComfyUIManager] Step 2: Starting ComfyUI on GPU ${gpu.cudaDevice}...`);
        await this.startComfyUI(gpu);
      }

      // Step 3: Wait for ready
      console.log(`[ComfyUIManager] Step 3: Waiting for ComfyUI to become ready...`);
      const ready = await this.waitForReady(gpu.url, CONFIG.startupTimeout);

      if (!ready) {
        throw new Error('ComfyUI failed to become ready within timeout');
      }

      // Reset generation count
      this.generationCounts.set(gpuId, 0);
      this.lastRestartTime.set(gpuId, Date.now());
      this.restartState.set(gpuId, 'running');

      // Re-apply fan speed after restart (fans may have reset to auto)
      await gpuFanControl.forceWorkingSpeed();

      console.log(`[ComfyUIManager] ${gpu.name}: Restart complete, counter reset, fans at 100%`);
      console.log(`[ComfyUIManager] ========================================`);

      return true;
    } catch (error) {
      this.restartState.set(gpuId, 'stopped');
      throw error;
    }
  }

  /**
   * Kill ComfyUI process on a specific port
   */
  async killComfyUIOnPort(port) {
    try {
      // Find and kill process by port
      // Use PM2 stop for local GPUs to keep process management consistent
      const gpu = GPU_SERVERS.find(g => g.port === port && !g.isRemote);
      const pm2Name = gpu ? this.getPm2Name(gpu) : null;
      if (pm2Name) {
        console.log(`[ComfyUIManager] Stopping ${pm2Name} via PM2`);
        await execAsync(`pm2 stop ${pm2Name} 2>/dev/null || true`);
        await this.sleep(1000);
      }

      // Also kill any orphan processes on this port as cleanup
      const { stdout } = await execAsync(`lsof -ti:${port} -sTCP:LISTEN 2>/dev/null || true`);
      const pids = stdout.trim().split('\n').filter(Boolean);

      if (pids.length > 0) {
        for (const pid of pids) {
          console.log(`[ComfyUIManager] Killing orphan PID ${pid} on port ${port}`);
          await execAsync(`kill -9 ${pid} 2>/dev/null || true`);
        }
        await this.sleep(2000);
      }

      // Pattern kill as final cleanup
      await execAsync(`pkill -f "python.*main.py.*--port ${port}" 2>/dev/null || true`);

      return true;
    } catch (error) {
      console.error(`[ComfyUIManager] Error killing process:`, error.message);
      return false;
    }
  }

  /**
   * Map GPU ID to PM2 process name
   */
  getPm2Name(gpu) {
    const pm2Names = { gpu0: 'comfyui-gpu0', gpu1: 'comfyui-gpu1', gpu2: 'comfyui-gpu2' };
    return pm2Names[gpu.id] || null;
  }

  /**
   * Start ComfyUI on a specific GPU
   */
  async startComfyUI(gpu) {
    // Use PM2 for local GPUs to avoid orphan processes
    const pm2Name = this.getPm2Name(gpu);
    if (pm2Name) {
      try {
        await execAsync(`pm2 restart ${pm2Name} --update-env 2>&1 || pm2 start /home/localai/Desktop/HSR/backend/ecosystem.config.cjs --only ${pm2Name} 2>&1`, { shell: '/bin/bash' });
        console.log(`[ComfyUIManager] Started ${pm2Name} via PM2 on port ${gpu.port}`);
        return true;
      } catch (error) {
        console.error(`[ComfyUIManager] Failed to start ${pm2Name} via PM2:`, error.message);
        throw error;
      }
    }

    // Fallback for remote/unknown GPUs - direct start
    const logFile = `${CONFIG.logDir}/comfyui-${gpu.id}.log`;
    const command = `cd ${CONFIG.comfyuiDir} && source venv/bin/activate && CUDA_VISIBLE_DEVICES=${gpu.cudaDevice} nohup python main.py --port ${gpu.port} > ${logFile} 2>&1 &`;

    try {
      await execAsync(command, { shell: '/bin/bash' });
      console.log(`[ComfyUIManager] Started ComfyUI on port ${gpu.port} (GPU ${gpu.cudaDevice})`);
      return true;
    } catch (error) {
      console.error(`[ComfyUIManager] Failed to start ComfyUI:`, error.message);
      throw error;
    }
  }

  /**
   * Wait for ComfyUI to become ready (health check responds)
   */
  async waitForReady(url, timeoutMs) {
    const startTime = Date.now();
    const checkInterval = 2000;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`${url}/system_stats`, {
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (response.ok) {
          console.log(`[ComfyUIManager] ComfyUI at ${url} is ready`);
          return true;
        }
      } catch {
        // Not ready yet
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      if (elapsed % 10 === 0) {
        console.log(`[ComfyUIManager] Waiting for ${url}... (${elapsed}s)`);
      }

      await this.sleep(checkInterval);
    }

    return false;
  }

  // =============================================================
  //                     HEALTH & STATUS
  // =============================================================

  /**
   * Count how many GPUs are currently online and healthy
   */
  async countOnlineGPUs() {
    let count = 0;

    for (const gpu of GPU_SERVERS) {
      if (this.restartState.get(gpu.id) === 'restarting') {
        continue;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(`${gpu.url}/system_stats`, {
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (response.ok) {
          count++;
        }
      } catch {
        // Not available
      }
    }

    return count;
  }

  /**
   * Get full status of all GPUs
   */
  async getStatus() {
    const servers = await Promise.all(
      GPU_SERVERS.map(async (gpu) => {
        let healthy = false;
        let stats = null;

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);

          const response = await fetch(`${gpu.url}/system_stats`, {
            signal: controller.signal
          });
          clearTimeout(timeout);

          if (response.ok) {
            healthy = true;
            stats = await response.json();
          }
        } catch {
          // Not available
        }

        return {
          id: gpu.id,
          name: gpu.name,
          port: gpu.port,
          url: gpu.url,
          isDisplayGPU: gpu.isDisplayGPU,
          healthy,
          state: this.restartState.get(gpu.id),
          generationCount: this.generationCounts.get(gpu.id),
          threshold: CONFIG.restartThreshold,
          generationsUntilRestart: CONFIG.restartThreshold - (this.generationCounts.get(gpu.id) || 0),
          lastRestartTime: this.lastRestartTime.get(gpu.id),
          stats,
        };
      })
    );

    const onlineCount = servers.filter(s => s.healthy).length;

    return {
      config: {
        restartThreshold: CONFIG.restartThreshold,
        minOnlineGPUs: CONFIG.minOnlineGPUs,
        restartCooldown: CONFIG.restartCooldown,
      },
      servers,
      onlineCount,
      totalCount: GPU_SERVERS.length,
      restartQueue: [...this.restartQueue],
      restartLocked: this.restartLock,
    };
  }

  // =============================================================
  //                     MANUAL CONTROLS
  // =============================================================

  /**
   * Force restart a specific GPU (bypasses cooldown)
   */
  async forceRestart(gpuId) {
    const gpu = GPU_SERVERS.find(g => g.id === gpuId);
    if (!gpu) {
      throw new Error(`Unknown GPU: ${gpuId}`);
    }

    // Check minimum online
    const onlineCount = await this.countOnlineGPUs();
    if (onlineCount <= CONFIG.minOnlineGPUs) {
      throw new Error(`Cannot restart: only ${onlineCount} GPUs online (minimum: ${CONFIG.minOnlineGPUs})`);
    }

    // Force restart
    return this.restartGPU(gpuId);
  }

  /**
   * Reset generation counter for a GPU without restarting
   */
  resetCounter(gpuId) {
    const gpu = GPU_SERVERS.find(g => g.id === gpuId);
    if (!gpu) {
      throw new Error(`Unknown GPU: ${gpuId}`);
    }

    const oldCount = this.generationCounts.get(gpuId);
    this.generationCounts.set(gpuId, 0);
    console.log(`[ComfyUIManager] ${gpu.name}: Counter reset (was ${oldCount})`);

    return { gpuId, oldCount, newCount: 0 };
  }

  /**
   * Reset all counters without restarting
   */
  resetAllCounters() {
    const results = [];
    GPU_SERVERS.forEach(gpu => {
      const oldCount = this.generationCounts.get(gpu.id);
      this.generationCounts.set(gpu.id, 0);
      results.push({ gpuId: gpu.id, name: gpu.name, oldCount, newCount: 0 });
    });
    console.log(`[ComfyUIManager] All counters reset`);
    return results;
  }

  /**
   * Restart all GPUs (staggered)
   */
  async restartAll() {
    console.log(`[ComfyUIManager] Queueing restart for all GPUs`);

    // Queue non-display GPUs first (they can restart faster)
    const nonDisplay = GPU_SERVERS.filter(g => !g.isDisplayGPU);
    const display = GPU_SERVERS.filter(g => g.isDisplayGPU);

    [...nonDisplay, ...display].forEach(gpu => {
      this.queueRestart(gpu.id);
    });

    return {
      message: 'All GPUs queued for restart',
      queueSize: this.restartQueue.length,
    };
  }

  // =============================================================
  //                     UTILITIES
  // =============================================================

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Map port to GPU ID
   */
  getGPUIdByPort(port) {
    const gpu = GPU_SERVERS.find(g => g.port === port);
    return gpu?.id || null;
  }

  /**
   * Map URL to GPU ID
   */
  getGPUIdByUrl(url) {
    const gpu = GPU_SERVERS.find(g => g.url === url || url.includes(`:${g.port}`));
    return gpu?.id || null;
  }
}

// Export singleton instance
const comfyuiManager = new ComfyUIManager();

export default comfyuiManager;

export {
  ComfyUIManager,
  comfyuiManager,
  GPU_SERVERS,
  CONFIG as MANAGER_CONFIG,
};
