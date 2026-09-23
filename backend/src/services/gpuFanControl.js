/**
 * GPU Fan Control Service
 *
 * Controls GPU fan speeds based on image generation workload.
 * - Spins fans to 100% when work queue has jobs
 * - Reduces fans to idle speed when queue is empty
 *
 * All GPUs are now remote (no local GPUs on 10.0.0.39)
 * Remote machines (.67, .220, .249) use LACT for fan control via the dashboard
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// X display env for nvidia-settings (local .39 - LightDM)
const NV_ENV = 'DISPLAY=:0 XAUTHORITY=/var/run/lightdm/root/:0';

// =============================================================
//                     CONFIGURATION
// =============================================================

const CONFIG = {
  // Fan speed when generating (0-100)
  workingSpeed: parseInt(process.env.GPU_FAN_WORKING_SPEED) || 100,

  // Fan speed when idle (0-100)
  idleSpeed: parseInt(process.env.GPU_FAN_IDLE_SPEED) || 40,

  // Local GPUs (.39)
  local: {
    gpuCount: parseInt(process.env.GPU_COUNT) || 2,
    fanCount: parseInt(process.env.GPU_FAN_COUNT) || 4,
  },

  // Remote GPUs (.67)
  remote: {
    enabled: process.env.REMOTE_FAN_CONTROL !== 'false',
    host: process.env.REMOTE_GPU_HOST || '10.0.0.67',
    user: process.env.REMOTE_GPU_USER || 'mosana1',
    gpuCount: parseInt(process.env.REMOTE_GPU_COUNT) || 2,
    fanCount: parseInt(process.env.REMOTE_GPU_FAN_COUNT) || 4,
    // .67 uses GDM with sudo
    nvEnv: 'sudo DISPLAY=:0 XAUTHORITY=/run/user/120/gdm/Xauthority',
  },

  // Delay before reducing fan speed after last job (ms)
  // 120s prevents fan oscillation between batches during matrix generation
  cooldownDelay: parseInt(process.env.GPU_FAN_COOLDOWN_DELAY) || 120000,

  // Whether fan control is enabled
  enabled: process.env.GPU_FAN_CONTROL !== 'false',
};

// =============================================================
//                     REMOTE SSH HELPER
// =============================================================

async function runRemoteCmd(cmd) {
  const sshCmd = `ssh -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=5 ${CONFIG.remote.user}@${CONFIG.remote.host} ${JSON.stringify(cmd)}`;
  return execAsync(sshCmd, { timeout: 15000 });
}

// =============================================================
//                     FAN CONTROL SERVICE
// =============================================================

class GPUFanControlService {
  constructor() {
    this.activeJobs = 0;
    this.cooldownTimer = null;
    this.currentSpeed = null;
    this.manualControlEnabled = false;
    this.remoteManualControlEnabled = false;
    this.lastError = null;

    // Queue pollers
    this.localQueuePoller = null;
    this.localLastBusy = 0;
    this.localFansHot = false;
    this.remoteQueuePoller = null;
    this.remoteLastBusy = 0;
    this.remoteFansHot = false;

    // Per-machine fan state tracking for granular control
    this.machineState = {
      '3080':      { lastBusy: 0, fansHot: false, cooldownTimer: null },
      '3080x2':    { lastBusy: 0, fansHot: false, cooldownTimer: null },
      '3060x2':    { lastBusy: 0, fansHot: false, cooldownTimer: null },
      '3060x2-97': { lastBusy: 0, fansHot: false, cooldownTimer: null },
    };
  }

  /**
   * Start polling ComfyUI queues to auto-manage fan speed for both local and remote GPUs
   */
  startQueuePollers() {
    this.startLocalQueuePoller();
    this.startRemoteQueuePoller();
  }

  startLocalQueuePoller() {
    // No local GPUs on 10.0.0.39 - all GPUs are remote now
    // Fan control is handled by LACT on remote machines via the dashboard
    console.log('[GPUFanControl] Local queue poller disabled - no local GPUs');
    return;

    /* DISABLED - no local GPUs
    if (this.localQueuePoller) return;

    const POLL_INTERVAL = 5000;
    const localUrls = [
      'http://127.0.0.1:8188/queue',
      'http://127.0.0.1:8189/queue',
    ];

    console.log('[GPUFanControl] Starting local queue poller for .39 GPUs');

    this.localQueuePoller = setInterval(async () => {
      try {
        let totalJobs = 0;

        for (const url of localUrls) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);

            if (res.ok) {
              const data = await res.json();
              totalJobs += (data.queue_running?.length || 0) + (data.queue_pending?.length || 0);
            }
          } catch {
            // GPU unreachable, skip
          }
        }

        if (totalJobs > 0) {
          this.localLastBusy = Date.now();
          if (!this.localFansHot) {
            this.localFansHot = true;
            console.log(`[GPUFanControl] Local .39 has ${totalJobs} job(s), spinning fans to ${CONFIG.workingSpeed}%`);
            await this.setLocalFanSpeed(CONFIG.workingSpeed);
          }
        } else if (this.localFansHot && Date.now() - this.localLastBusy >= CONFIG.cooldownDelay) {
          this.localFansHot = false;
          console.log(`[GPUFanControl] Local .39 idle for ${CONFIG.cooldownDelay / 1000}s, reducing fans to ${CONFIG.idleSpeed}%`);
          await this.setLocalFanSpeed(CONFIG.idleSpeed);
        }
      } catch (error) {
        // Don't spam logs on transient failures
      }
    }, POLL_INTERVAL);
    END DISABLED */
  }

  startRemoteQueuePoller() {
    if (this.remoteQueuePoller) return;

    const POLL_INTERVAL = 3000; // Check every 3 seconds for responsiveness

    // GPU endpoints grouped by machine for per-machine fan control
    const machineGpuUrls = {
      '3080': [
        'http://10.0.0.67:8188/queue',   // GPU0
        'http://10.0.0.67:8189/queue',   // GPU1
      ],
      '3080x2': [
        'http://10.0.0.220:8188/queue',  // GPU2
        'http://10.0.0.220:8189/queue',  // GPU3
      ],
      '3060x2': [
        'http://10.0.0.249:8188/queue',  // GPU4
        'http://10.0.0.249:8189/queue',  // GPU5
      ],
      '3060x2-97': [
        'http://10.0.0.97:8188/queue',   // GPU6
        'http://10.0.0.97:8189/queue',   // GPU7
      ],
    };

    console.log(`[GPUFanControl] Starting per-machine queue poller for all 8 GPUs`);

    this.remoteQueuePoller = setInterval(async () => {
      try {
        // Check each machine independently
        for (const [machine, urls] of Object.entries(machineGpuUrls)) {
          let machineJobs = 0;

          // Check all GPUs on this machine
          const results = await Promise.allSettled(
            urls.map(async (url) => {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 2000);
              try {
                const res = await fetch(url, { signal: controller.signal });
                clearTimeout(timeout);
                if (res.ok) {
                  const data = await res.json();
                  return (data.queue_running?.length || 0) + (data.queue_pending?.length || 0);
                }
              } catch {
                // GPU unreachable
              } finally {
                clearTimeout(timeout);
              }
              return 0;
            })
          );

          machineJobs = results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0), 0);

          const state = this.machineState[machine];
          if (machineJobs > 0) {
            // Machine has active jobs
            state.lastBusy = Date.now();
            if (state.cooldownTimer) {
              clearTimeout(state.cooldownTimer);
              state.cooldownTimer = null;
            }
            if (!state.fansHot) {
              state.fansHot = true;
              console.log(`[GPUFanControl] ${machine}: ${machineJobs} job(s), spinning fans to 100%`);
              await this.setMachineFanSpeed(machine, 100);
            }
          } else if (state.fansHot && !state.cooldownTimer) {
            // Machine just became idle, start cooldown timer
            console.log(`[GPUFanControl] ${machine}: idle, starting ${CONFIG.cooldownDelay / 1000}s cooldown`);
            state.cooldownTimer = setTimeout(async () => {
              state.cooldownTimer = null;
              if (state.fansHot) {
                state.fansHot = false;
                console.log(`[GPUFanControl] ${machine}: cooldown complete, returning to auto`);
                await this.setMachineFanSpeed(machine, 'auto');
              }
            }, CONFIG.cooldownDelay);
          }
        }
      } catch (error) {
        // Don't spam logs on transient failures
      }
    }, POLL_INTERVAL);
  }

  stopQueuePollers() {
    if (this.localQueuePoller) {
      clearInterval(this.localQueuePoller);
      this.localQueuePoller = null;
      console.log('[GPUFanControl] Local queue poller stopped');
    }
    if (this.remoteQueuePoller) {
      clearInterval(this.remoteQueuePoller);
      this.remoteQueuePoller = null;
      console.log('[GPUFanControl] Remote queue poller stopped');
    }
    // Clear per-machine cooldown timers
    for (const [machine, state] of Object.entries(this.machineState)) {
      if (state.cooldownTimer) {
        clearTimeout(state.cooldownTimer);
        state.cooldownTimer = null;
      }
    }
  }

  // --- Local fan control (.39) ---

  async enableManualControl() {
    if (!CONFIG.enabled) {
      console.log('[GPUFanControl] Fan control disabled by config');
      return false;
    }

    try {
      for (let gpu = 0; gpu < CONFIG.local.gpuCount; gpu++) {
        await execAsync(`${NV_ENV} nvidia-settings -a "[gpu:${gpu}]/GPUFanControlState=1"`);
      }
      this.manualControlEnabled = true;
      console.log(`[GPUFanControl] Local manual fan control enabled for ${CONFIG.local.gpuCount} GPUs`);
      return true;
    } catch (error) {
      this.lastError = error.message;
      console.error('[GPUFanControl] Failed to enable local manual control:', error.message);
      return false;
    }
  }

  async disableManualControl() {
    if (!CONFIG.enabled) return false;

    try {
      for (let gpu = 0; gpu < CONFIG.local.gpuCount; gpu++) {
        await execAsync(`${NV_ENV} nvidia-settings -a "[gpu:${gpu}]/GPUFanControlState=0"`);
      }
      this.manualControlEnabled = false;
      console.log('[GPUFanControl] Local manual fan control disabled');
      return true;
    } catch (error) {
      this.lastError = error.message;
      console.error('[GPUFanControl] Failed to disable local manual control:', error.message);
      return false;
    }
  }

  async setLocalFanSpeed(speed) {
    try {
      if (!this.manualControlEnabled) {
        await this.enableManualControl();
      }
      for (let fan = 0; fan < CONFIG.local.fanCount; fan++) {
        await execAsync(`${NV_ENV} nvidia-settings -a "[fan:${fan}]/GPUTargetFanSpeed=${speed}"`);
      }
      console.log(`[GPUFanControl] Local (.39) fan speed set to ${speed}%`);
      return true;
    } catch (error) {
      this.lastError = error.message;
      console.error('[GPUFanControl] Failed to set local fan speed:', error.message);
      return false;
    }
  }

  // --- Remote fan control (.67) ---

  async enableRemoteManualControl() {
    if (!CONFIG.remote.enabled) return false;

    try {
      const cmds = [];
      for (let gpu = 0; gpu < CONFIG.remote.gpuCount; gpu++) {
        cmds.push(`${CONFIG.remote.nvEnv} nvidia-settings -a '[gpu:${gpu}]/GPUFanControlState=1'`);
      }
      await runRemoteCmd(cmds.join(' && '));
      this.remoteManualControlEnabled = true;
      console.log(`[GPUFanControl] Remote (.67) manual fan control enabled for ${CONFIG.remote.gpuCount} GPUs`);
      return true;
    } catch (error) {
      this.lastError = error.message;
      console.error('[GPUFanControl] Failed to enable remote manual control:', error.message);
      return false;
    }
  }

  async disableRemoteManualControl() {
    if (!CONFIG.remote.enabled) return false;

    try {
      const cmds = [];
      for (let gpu = 0; gpu < CONFIG.remote.gpuCount; gpu++) {
        cmds.push(`${CONFIG.remote.nvEnv} nvidia-settings -a '[gpu:${gpu}]/GPUFanControlState=0'`);
      }
      await runRemoteCmd(cmds.join(' && '));
      this.remoteManualControlEnabled = false;
      console.log('[GPUFanControl] Remote (.67) manual fan control disabled');
      return true;
    } catch (error) {
      this.lastError = error.message;
      console.error('[GPUFanControl] Failed to disable remote manual control:', error.message);
      return false;
    }
  }

  async setRemoteFanSpeed(speed) {
    if (!CONFIG.remote.enabled) return false;

    try {
      if (!this.remoteManualControlEnabled) {
        await this.enableRemoteManualControl();
      }
      const cmds = [];
      for (let fan = 0; fan < CONFIG.remote.fanCount; fan++) {
        cmds.push(`${CONFIG.remote.nvEnv} nvidia-settings -a '[fan:${fan}]/GPUTargetFanSpeed=${speed}'`);
      }
      await runRemoteCmd(cmds.join(' && '));
      console.log(`[GPUFanControl] Remote (.67) fan speed set to ${speed}%`);
      return true;
    } catch (error) {
      this.lastError = error.message;
      console.error('[GPUFanControl] Failed to set remote fan speed:', error.message);
      return false;
    }
  }

  // --- Combined operations ---

  // Dashboard API URL for all GPU fan control
  static DASHBOARD_API = 'http://10.0.0.67:8085/api/fan';
  static ALL_MACHINES = ['3080', '3080x2', '3060x2', '3060x2-97'];

  /**
   * Set fan speed for a single machine via the dashboard API
   * @param {string} machine - Machine name (3080, 3080x2, 3060x2, 3060x2-97)
   * @param {number|string} speed - Fan speed (0-100) or 'auto'
   */
  async setMachineFanSpeed(machine, speed) {
    try {
      const response = await fetch(GPUFanControlService.DASHBOARD_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machine, speed }),
      });
      const data = await response.json();
      if (data.ok) {
        console.log(`[GPUFanControl] ${machine}: ${speed === 'auto' ? 'AUTO' : speed + '%'}`);
      }
      return data.ok;
    } catch (error) {
      console.error(`[GPUFanControl] Failed to set ${machine}:`, error.message);
      return false;
    }
  }

  async setFanSpeedViaDashboard(speed) {
    const results = [];
    for (const machine of GPUFanControlService.ALL_MACHINES) {
      try {
        const response = await fetch(GPUFanControlService.DASHBOARD_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ machine, speed }),
        });
        const data = await response.json();
        results.push({ machine, ok: data.ok, output: data.output });
        if (data.ok) {
          console.log(`[GPUFanControl] ${machine}: ${speed === 'auto' ? 'AUTO' : speed + '%'}`);
        }
      } catch (error) {
        console.error(`[GPUFanControl] Failed to set ${machine}:`, error.message);
        results.push({ machine, ok: false, error: error.message });
      }
    }
    return results.some(r => r.ok);
  }

  async setFanSpeed(speed, force = false) {
    if (!CONFIG.enabled) return false;

    speed = Math.max(0, Math.min(100, speed));

    if (!force && this.currentSpeed === speed) {
      return true;
    }

    // Use dashboard API to control ALL machines at once
    const success = await this.setFanSpeedViaDashboard(speed);

    this.currentSpeed = speed;
    console.log(`[GPUFanControl] All fans set to ${speed}% via dashboard API`);
    return success;
  }

  async setWorkingSpeed() {
    // Blast all fans to 100% when working
    console.log('[GPUFanControl] Setting all fans to 100% for workload');
    return this.setFanSpeedViaDashboard(100);
  }

  async setIdleSpeed() {
    // Return to auto mode when idle
    console.log('[GPUFanControl] Returning fans to auto mode');
    return this.setFanSpeedViaDashboard('auto');
  }

  // Map server URLs to machine names for per-GPU fan control
  static URL_TO_MACHINE = {
    '10.0.0.67': '3080',
    '10.0.0.220': '3080x2',
    '10.0.0.249': '3060x2',
    '10.0.0.97': '3060x2-97',
  };

  /**
   * Get machine name from a server URL
   * @param {string} serverUrl - Server URL like "http://10.0.0.67:8188"
   * @returns {string|null} Machine name or null
   */
  getMachineFromUrl(serverUrl) {
    if (!serverUrl) return null;
    for (const [ip, machine] of Object.entries(GPUFanControlService.URL_TO_MACHINE)) {
      if (serverUrl.includes(ip)) {
        return machine;
      }
    }
    return null;
  }

  /**
   * Called when a job starts on a specific server
   * @param {string} [serverUrl] - Optional server URL to spin up only that machine's fans
   */
  async onJobStart(serverUrl = null) {
    const machine = this.getMachineFromUrl(serverUrl);

    if (machine) {
      // Per-machine fan control
      const state = this.machineState[machine];
      if (state.cooldownTimer) {
        clearTimeout(state.cooldownTimer);
        state.cooldownTimer = null;
      }
      state.lastBusy = Date.now();

      if (!state.fansHot) {
        state.fansHot = true;
        console.log(`[GPUFanControl] Job started on ${machine}, spinning fans to 100%`);
        await this.setMachineFanSpeed(machine, 100);
      } else {
        console.log(`[GPUFanControl] Job started on ${machine} (fans already hot)`);
      }
    } else {
      // Fallback to legacy all-fans behavior
      if (this.cooldownTimer) {
        clearTimeout(this.cooldownTimer);
        this.cooldownTimer = null;
      }
      this.activeJobs++;
      console.log(`[GPUFanControl] Job started (active: ${this.activeJobs})`);
      await this.setWorkingSpeed();
    }
  }

  /**
   * Called when a job completes on a specific server
   * @param {string} [serverUrl] - Optional server URL to manage only that machine's fans
   */
  async onJobComplete(serverUrl = null) {
    const machine = this.getMachineFromUrl(serverUrl);

    if (machine) {
      // Per-machine fan control - start cooldown for this machine
      const state = this.machineState[machine];
      if (!state.cooldownTimer && state.fansHot) {
        console.log(`[GPUFanControl] Job completed on ${machine}, starting ${CONFIG.cooldownDelay / 1000}s cooldown`);
        state.cooldownTimer = setTimeout(async () => {
          state.cooldownTimer = null;
          if (state.fansHot) {
            state.fansHot = false;
            console.log(`[GPUFanControl] ${machine}: cooldown complete, returning to auto`);
            await this.setMachineFanSpeed(machine, 'auto');
          }
        }, CONFIG.cooldownDelay);
      }
    } else {
      // Fallback to legacy all-fans behavior
      this.activeJobs = Math.max(0, this.activeJobs - 1);
      console.log(`[GPUFanControl] Job completed (active: ${this.activeJobs})`);
      if (this.activeJobs === 0) {
        this.startCooldownTimer();
      }
    }
  }

  startCooldownTimer() {
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
    }

    console.log(`[GPUFanControl] Starting cooldown timer (${CONFIG.cooldownDelay / 1000}s)`);

    this.cooldownTimer = setTimeout(async () => {
      if (this.activeJobs === 0) {
        console.log('[GPUFanControl] Cooldown complete, reducing fan speed');
        await this.setIdleSpeed();
      }
      this.cooldownTimer = null;
    }, CONFIG.cooldownDelay);
  }

  async getCurrentFanSpeeds() {
    try {
      const { stdout } = await execAsync('nvidia-smi --query-gpu=index,fan.speed --format=csv,noheader,nounits');
      const lines = stdout.trim().split('\n');
      return lines.map(line => {
        const [index, speed] = line.split(',').map(s => s.trim());
        return { gpu: parseInt(index), speed: parseInt(speed), machine: 'local' };
      });
    } catch (error) {
      this.lastError = error.message;
      return [];
    }
  }

  async getStatus() {
    const fanSpeeds = await this.getCurrentFanSpeeds();

    return {
      enabled: CONFIG.enabled,
      manualControlEnabled: this.manualControlEnabled,
      remoteManualControlEnabled: this.remoteManualControlEnabled,
      activeJobs: this.activeJobs,
      targetSpeed: this.currentSpeed,
      cooldownPending: this.cooldownTimer !== null,
      config: {
        workingSpeed: CONFIG.workingSpeed,
        idleSpeed: CONFIG.idleSpeed,
        cooldownDelay: CONFIG.cooldownDelay,
        local: CONFIG.local,
        remote: { enabled: CONFIG.remote.enabled, host: CONFIG.remote.host, gpuCount: CONFIG.remote.gpuCount, fanCount: CONFIG.remote.fanCount },
      },
      currentFanSpeeds: fanSpeeds,
      lastError: this.lastError,
    };
  }

  async forceWorkingSpeed() {
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
    return this.setWorkingSpeed();
  }

  async forceIdleSpeed() {
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
    return this.setIdleSpeed();
  }

  async shutdown() {
    this.stopQueuePollers();
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
    await Promise.allSettled([
      this.disableManualControl(),
      this.disableRemoteManualControl(),
    ]);
  }
}

// Export singleton instance
export const gpuFanControl = new GPUFanControlService();

// Auto-start queue pollers for both local and remote GPUs
gpuFanControl.startQueuePollers();

export default gpuFanControl;
