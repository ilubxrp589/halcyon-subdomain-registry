/**
 * SDXL Multi-GPU Service
 * Manages parallel image generation across multiple ComfyUI servers
 *
 * All GPUs are remote (no local GPUs on 192.0.2.39):
 *
 * 192.0.2.67 - 2x RTX 3080 10GB
 * 192.0.2.220 - 2x RTX 3080 10GB
 * 192.0.2.249 - 2x RTX 3060 12GB
 * 192.0.2.97 - 2x RTX 3060 12GB
 *
 * Total: 8 GPUs (4x 3080 + 4x 3060)
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { createCanvas, loadImage, registerFont } from 'canvas';
import config from '../config/index.js';
import comfyuiManager from './comfyuiManager.js';
import gpuFanControl from './gpuFanControl.js';
import { loadAllThemes, getThemesForAPI, getThemeById as getThemeByIdFromIndex, getThemeModifiers } from '../data/themes/index.js';
import { MONOCHROME_STYLES, stripColorFromModifiers, CONDENSED_MODIFIER_STYLES, condenseModifiers } from '../data/styles/index.js';

// =============================================================
//                     CONFIGURATION
// =============================================================

// All GPUs are remote - fallback to .67 if config not set
const SERVERS = config.fluxMultiGPU?.servers || [
  { url: 'http://192.0.2.67:8188', name: 'GPU0', isDisplayGPU: false },
  { url: 'http://192.0.2.67:8189', name: 'GPU1', isDisplayGPU: false },
];

// Display GPU protection settings
const DISPLAY_GPU_CONFIG = config.fluxMultiGPU?.displayGPU || {
  maxVramMB: 10000,  // 10GB max, reserve 2GB for display
  preferNonDisplay: true,
};

// Theme files now loaded from /backend/src/data/themes/ directory
const OUTPUT_DIR = config.fluxMultiGPU?.outputDir || '/home/localai/Desktop/FluxMultiGPU_Output/HSR';

const GENERATION_TIMEOUT_MS = 300000; // 5 minutes per image (extra time for model switching)
const POLL_INTERVAL_MS = 500;

// =============================================================
//                     GPU HEALTH WATCHER
// =============================================================

const COMFYUI_DIR = '/home/localai/ComfyUI';
const COMFYUI_PYTHON = '/home/localai/ComfyUI/venv/bin/python';
const HEALTH_CHECK_INTERVAL = 15000; // Check every 15 seconds
const RESTART_COOLDOWN = 60000; // Wait 60s between restart attempts

class GPUHealthWatcher {
  constructor() {
    this.serverStatus = new Map(); // url -> { online, lastCheck, lastRestart, restartCount }
    this.watchers = []; // Callbacks for status changes
    this.checkInterval = null;
    this.initialized = false;
  }

  /**
   * Initialize the health watcher
   */
  async init() {
    if (this.initialized) return;

    // Initialize status for all servers
    for (const server of SERVERS) {
      this.serverStatus.set(server.url, {
        online: false,
        lastCheck: null,
        lastRestart: null,
        restartCount: 0,
        consecutiveFailures: 0,
      });
    }

    // Do initial health check
    await this.checkAllServers();

    // Start periodic health checks
    this.checkInterval = setInterval(() => this.checkAllServers(), HEALTH_CHECK_INTERVAL);
    this.initialized = true;

    console.log('[GPUHealth] Watcher initialized');
  }

  /**
   * Check if a single ComfyUI server is responding
   */
  async checkServer(serverUrl) {
    try {
      const controller = new AbortController();
      // Increased timeout from 5s to 30s - GPUs may be slow to respond during generation
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${serverUrl}/system_stats`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        return { online: true, vram: data.devices?.[0]?.vram_free };
      }
      return { online: false };
    } catch {
      return { online: false };
    }
  }

  /**
   * Check all servers and update status
   */
  async checkAllServers() {
    const results = await Promise.all(
      SERVERS.map(async (server) => {
        const result = await this.checkServer(server.url);
        const status = this.serverStatus.get(server.url);
        const wasOnline = status.online;

        status.online = result.online;
        status.lastCheck = Date.now();
        status.vramFree = result.vram;

        if (result.online) {
          status.consecutiveFailures = 0;
        } else {
          status.consecutiveFailures++;
        }

        // Alert on status change
        if (wasOnline && !result.online) {
          console.log(`[GPUHealth] ⚠️ ${server.name} went OFFLINE (may be busy generating - NOT auto-restarting)`);
          this.notifyWatchers(server, 'offline');

          // DISABLED: Auto-restart was killing GPUs mid-generation
          // The GPU may just be slow to respond while busy - don't restart automatically
          // if (!status.lastRestart || Date.now() - status.lastRestart > RESTART_COOLDOWN) {
          //   this.attemptRestart(server);
          // }
        } else if (!wasOnline && result.online) {
          console.log(`[GPUHealth] ✅ ${server.name} is back ONLINE`);
          this.notifyWatchers(server, 'online');
        }

        return { server, ...result };
      })
    );

    return results;
  }

  /**
   * Attempt to restart a crashed ComfyUI instance via PM2
   */
  async attemptRestart(server) {
    const status = this.serverStatus.get(server.url);
    const port = new URL(server.url).port;
    const gpuIndex = SERVERS.indexOf(server);

    // Map server name to PM2 process name
    const pm2Name = `comfyui-gpu${gpuIndex}`;

    console.log(`[GPUHealth] 🔄 Attempting to restart ${server.name} via PM2 (${pm2Name})...`);
    status.lastRestart = Date.now();
    status.restartCount++;

    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Use PM2 to restart instead of spawning directly
      // This prevents orphan processes and port conflicts
      const cmd = `pm2 restart ${pm2Name} 2>/dev/null || pm2 start ${pm2Name} 2>/dev/null`;

      await execAsync(cmd);

      // Wait for it to come up (PM2 has restart delay configured)
      await new Promise(resolve => setTimeout(resolve, 20000));

      // Check if it's online now
      const result = await this.checkServer(server.url);
      if (result.online) {
        console.log(`[GPUHealth] ✅ ${server.name} restarted successfully via PM2`);
        status.online = true;
        status.consecutiveFailures = 0;
        // Re-apply fan speed after restart (fans may have reset to auto)
        await gpuFanControl.forceWorkingSpeed();
        this.notifyWatchers(server, 'restarted');
        return true;
      } else {
        console.log(`[GPUHealth] ❌ ${server.name} failed to restart via PM2`);
        return false;
      }
    } catch (error) {
      console.error(`[GPUHealth] Restart error for ${server.name}:`, error.message);
      return false;
    }
  }

  /**
   * Get list of currently online servers
   */
  getOnlineServers() {
    return SERVERS.filter(server => {
      const status = this.serverStatus.get(server.url);
      return status?.online === true;
    });
  }

  /**
   * Get detailed status of all servers
   */
  getStatus() {
    const status = {};
    for (const server of SERVERS) {
      const s = this.serverStatus.get(server.url);
      status[server.name] = {
        url: server.url,
        online: s?.online || false,
        lastCheck: s?.lastCheck,
        restartCount: s?.restartCount || 0,
        consecutiveFailures: s?.consecutiveFailures || 0,
        vramFree: s?.vramFree,
      };
    }
    return status;
  }

  /**
   * Register a callback for status changes
   */
  onStatusChange(callback) {
    this.watchers.push(callback);
  }

  /**
   * Notify all watchers of a status change
   */
  notifyWatchers(server, event) {
    for (const callback of this.watchers) {
      try {
        callback(server, event, this.getStatus());
      } catch (e) {
        console.error('[GPUHealth] Watcher callback error:', e);
      }
    }
  }

  /**
   * Force a health check now
   */
  async forceCheck() {
    return this.checkAllServers();
  }

  /**
   * Stop the health watcher
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.initialized = false;
  }
}

// Singleton instance
const gpuHealthWatcher = new GPUHealthWatcher();

// =============================================================
//                     MODEL CONFIGURATION
// =============================================================

// Available models - all models that fit on 12GB VRAM
const MODEL_CONFIG = {
  // Current active model type
  activeModel: process.env.IMAGE_MODEL || 'sdxl-playground-lora',

  // ============ SDXL MODELS (~6GB VRAM) ============

  // Playground v2.5 (SDXL-based, better aesthetics)
  'sdxl-playground': {
    name: 'Playground v2.5',
    type: 'sdxl',
    checkpoint: 'playground-v2.5.safetensors',
    steps: 30,
    cfg: 3.0,
    sampler: 'dpmpp_2m',      // Clean and fast
    scheduler: 'karras',      // Smoother gradients
    width: 1024,
    height: 1024,
    vram: '~6GB',
    negativePrompt: 'blurry, low quality, distorted, deformed, ugly, bad anatomy, watermark, signature, text, logo, noise, grain, artifacts',
  },

  // Playground v2.5 + LCM LoRA (Faster, slightly different style)
  'sdxl-playground-lora': {
    name: 'Playground v2.5 + LCM',
    type: 'sdxl',
    checkpoint: 'playground-v2.5.safetensors',
    lora: 'lcm-lora-sdxl.safetensors',
    loraStrength: 0.89,
    steps: 25,
    cfg: 2.4,
    sampler: 'dpmpp_2m',
    scheduler: 'karras',
    width: 1024,
    height: 1024,
    vram: '~6.5GB',
    negativePrompt: 'blurry, low quality, distorted, deformed, ugly, bad anatomy, watermark, signature, text, logo, noise, grain, artifacts',
  },

  // Animagine XL 3.1 (Anime/stylized aesthetic)
  'sdxl-animagine': {
    name: 'Animagine XL 3.1',
    type: 'sdxl',
    checkpoint: 'animagine-xl-3.1.safetensors',
    steps: 25,
    cfg: 7.0,
    sampler: 'dpmpp_2m',
    scheduler: 'karras',
    width: 1024,
    height: 1024,
    vram: '~6GB',
    negativePrompt: 'realistic, photorealistic, 3d render, photo, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, artist name, sketch, rough, amateur',
  },

};

// Model file paths
const CHECKPOINTS_DIR = '/home/localai/ComfyUI/models/checkpoints';
const DIFFUSION_DIR = '/home/localai/ComfyUI/models/diffusion_models';

/**
 * Check if a model file exists on disk
 */
async function modelFileExists(modelConfig) {
  try {
    if (modelConfig.type === 'sdxl') {
      const filePath = path.join(CHECKPOINTS_DIR, modelConfig.checkpoint);
      await fs.access(filePath);
      return true;
    } else if (modelConfig.type === 'flux') {
      const filePath = path.join(DIFFUSION_DIR, modelConfig.unet);
      await fs.access(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Sync check if model file exists (for sync functions)
 */
function modelFileExistsSync(modelConfig) {
  try {
    if (modelConfig.type === 'sdxl') {
      const filePath = path.join(CHECKPOINTS_DIR, modelConfig.checkpoint);
      return fsSync.existsSync(filePath);
    } else if (modelConfig.type === 'flux') {
      const filePath = path.join(DIFFUSION_DIR, modelConfig.unet);
      return fsSync.existsSync(filePath);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Clear VRAM on all ComfyUI servers
 * Unloads models and frees memory - useful when switching between different checkpoints
 */
async function clearAllVRAM() {
  console.log('[SDXLMultiGPU] Clearing VRAM on all servers...');

  const clearPromises = SERVERS.map(async (server) => {
    try {
      const response = await fetch(`${server.url}/free`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unload_models: true, free_memory: true }),
      });

      if (response.ok) {
        console.log(`[SDXLMultiGPU] ${server.name}: VRAM cleared`);
        return { server: server.name, success: true };
      } else {
        console.log(`[SDXLMultiGPU] ${server.name}: Failed to clear VRAM`);
        return { server: server.name, success: false };
      }
    } catch (error) {
      console.log(`[SDXLMultiGPU] ${server.name}: Error clearing VRAM - ${error.message}`);
      return { server: server.name, success: false, error: error.message };
    }
  });

  return Promise.all(clearPromises);
}

/**
 * Set the active model at runtime
 * Validates that the model file exists before switching
 * Clears VRAM when switching to a different checkpoint to prevent memory buildup
 */
async function setActiveModel(modelType) {
  if (!MODEL_CONFIG[modelType] || modelType === 'activeModel') {
    throw new Error(`Invalid model: ${modelType}. Available: ${Object.keys(MODEL_CONFIG).filter(k => k !== 'activeModel').join(', ')}`);
  }

  // Skip if already active
  if (MODEL_CONFIG.activeModel === modelType) {
    return getActiveModelConfig();
  }

  const modelConfig = MODEL_CONFIG[modelType];
  const previousModel = MODEL_CONFIG.activeModel;
  const previousConfig = MODEL_CONFIG[previousModel];

  // Check if model file exists on disk
  const exists = await modelFileExists(modelConfig);
  if (!exists) {
    const fileName = modelConfig.type === 'sdxl' ? modelConfig.checkpoint : modelConfig.unet;
    throw new Error(`Model file not found: ${fileName}. Please download it first.`);
  }

  // If switching to a different checkpoint, clear VRAM first
  if (previousConfig && modelConfig.checkpoint !== previousConfig.checkpoint) {
    console.log(`[SDXLMultiGPU] Switching checkpoint: ${previousConfig.checkpoint} -> ${modelConfig.checkpoint}`);
    await clearAllVRAM();
  }

  MODEL_CONFIG.activeModel = modelType;
  console.log(`[SDXLMultiGPU] Active model changed to: ${modelType} (${modelConfig.name})`);
  return getActiveModelConfig();
}

/**
 * Get list of available models with their info
 * Includes whether each model file exists on disk
 */
function getAvailableModels() {
  return Object.entries(MODEL_CONFIG)
    .filter(([key]) => key !== 'activeModel')
    .map(([id, config]) => ({
      id,
      name: config.name,
      type: config.type,
      vram: config.vram,
      steps: config.steps,
      available: modelFileExistsSync(config),
    }));
}

// Get current model config
function getActiveModelConfig() {
  const modelType = MODEL_CONFIG.activeModel;
  return { type: modelType, config: MODEL_CONFIG[modelType] || MODEL_CONFIG['sdxl-playground'] };
}

// Check if using SDXL-based model
function isSDXLModel() {
  const modelType = MODEL_CONFIG.activeModel;
  return modelType.startsWith('sdxl');
}

// Font paths for watermark
const FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const FONT_REGULAR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

// =============================================================
//                     THEME MANAGEMENT
// =============================================================

/**
 * Load themes from organized category files
 * Uses the new /backend/src/data/themes/ structure
 */
async function loadThemes() {
  return loadAllThemes();
}

/**
 * Get all themes formatted for frontend
 */
async function getAllThemes() {
  return getThemesForAPI();
}

/**
 * Get theme by ID
 */
async function getThemeById(themeId) {
  return getThemeByIdFromIndex(themeId);
}

// =============================================================
//                     WORKFLOW BUILDERS
// =============================================================

/**
 * Build SDXL workflow
 * Standard SDXL checkpoint workflow - very stable on 12GB cards
 * Supports optional LoRA loading when configured
 */
function buildSDXLWorkflow(prompt, negativePrompt, seed, filenamePrefix) {
  const modelConfig = getActiveModelConfig().config;
  const hasLora = !!modelConfig.lora;

  const workflow = {
    prompt: {
      // Load SDXL Checkpoint (includes model, clip, vae)
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: {
          ckpt_name: modelConfig.checkpoint
        }
      },
      // Positive prompt encoding - connects to LoRA clip if present, else checkpoint clip
      "2": {
        class_type: "CLIPTextEncode",
        inputs: {
          text: prompt,
          clip: hasLora ? ["8", 1] : ["1", 1]
        }
      },
      // Negative prompt encoding
      "3": {
        class_type: "CLIPTextEncode",
        inputs: {
          text: negativePrompt,
          clip: hasLora ? ["8", 1] : ["1", 1]
        }
      },
      // Empty latent image
      "4": {
        class_type: "EmptyLatentImage",
        inputs: {
          width: modelConfig.width,
          height: modelConfig.height,
          batch_size: 1
        }
      },
      // KSampler - connects to LoRA model if present, else checkpoint model
      "5": {
        class_type: "KSampler",
        inputs: {
          model: hasLora ? ["8", 0] : ["1", 0],
          positive: ["2", 0],
          negative: ["3", 0],
          latent_image: ["4", 0],
          seed: seed,
          steps: modelConfig.steps,
          cfg: modelConfig.cfg,
          sampler_name: modelConfig.sampler,
          scheduler: modelConfig.scheduler,
          denoise: 1.0
        }
      },
      // VAE Decode
      "6": {
        class_type: "VAEDecode",
        inputs: {
          samples: ["5", 0],
          vae: ["1", 2]  // VAE always from checkpoint loader
        }
      },
      // Save Image
      "7": {
        class_type: "SaveImage",
        inputs: {
          images: ["6", 0],
          filename_prefix: filenamePrefix
        }
      }
    }
  };

  // Add LoRA loader if configured
  if (hasLora) {
    workflow.prompt["8"] = {
      class_type: "LoraLoader",
      inputs: {
        lora_name: modelConfig.lora,
        model: ["1", 0],  // Model from checkpoint
        clip: ["1", 1],   // CLIP from checkpoint
        strength_model: modelConfig.loraStrength || 0.5,
        strength_clip: modelConfig.loraStrength || 0.5
      }
    };
  }

  return workflow;
}

/**
 * Build Flux GGUF workflow (kept for compatibility)
 * Uses UnetLoaderGGUFDisTorch2MultiGPU for CPU offloading
 */
function buildFluxGGUFWorkflow(prompt, seed, filenamePrefix) {
  const modelConfig = getActiveModelConfig().config;

  return {
    prompt: {
      "1": {
        class_type: "UnetLoaderGGUFDisTorch2MultiGPU",
        inputs: {
          unet_name: modelConfig.unet || "flux1-schnell-Q8_0.gguf",
          compute_device: "cuda:0",
          virtual_vram_gb: 2.0,
          donor_device: "cpu",
          eject_models: true
        }
      },
      "2": {
        class_type: "DualCLIPLoader",
        inputs: {
          clip_name1: "t5xxl_fp8_e4m3fn.safetensors",
          clip_name2: "clip_l.safetensors",
          type: "flux"
        }
      },
      "3": {
        class_type: "VAELoader",
        inputs: { vae_name: "ae.safetensors" }
      },
      "4": {
        class_type: "CLIPTextEncode",
        inputs: { text: prompt, clip: ["2", 0] }
      },
      "5": {
        class_type: "ModelSamplingFlux",
        inputs: {
          model: ["1", 0],
          max_shift: 1.15,
          base_shift: 0.5,
          width: modelConfig.width || 1024,
          height: modelConfig.height || 1024
        }
      },
      "6": {
        class_type: "FluxGuidance",
        inputs: { conditioning: ["4", 0], guidance: modelConfig.guidance || 1.0 }
      },
      "7": {
        class_type: "BasicGuider",
        inputs: { model: ["5", 0], conditioning: ["6", 0] }
      },
      "8": {
        class_type: "KSamplerSelect",
        inputs: { sampler_name: "euler" }
      },
      "9": {
        class_type: "BasicScheduler",
        inputs: {
          model: ["5", 0],
          scheduler: "simple",
          steps: modelConfig.steps || 4,
          denoise: 1.0
        }
      },
      "10": {
        class_type: "RandomNoise",
        inputs: { noise_seed: seed }
      },
      "11": {
        class_type: "EmptySD3LatentImage",
        inputs: { width: modelConfig.width || 1024, height: modelConfig.height || 1024, batch_size: 1 }
      },
      "12": {
        class_type: "SamplerCustomAdvanced",
        inputs: {
          noise: ["10", 0],
          guider: ["7", 0],
          sampler: ["8", 0],
          sigmas: ["9", 0],
          latent_image: ["11", 0]
        }
      },
      "13": {
        class_type: "VAEDecode",
        inputs: { samples: ["12", 0], vae: ["3", 0] }
      },
      "14": {
        class_type: "SaveImage",
        inputs: {
          images: ["13", 0],
          filename_prefix: filenamePrefix
        }
      }
    }
  };
}

/**
 * Build workflow based on active model
 * @param {string} prompt - The prompt text
 * @param {number} seed - Random seed
 * @param {string} filenamePrefix - Filename prefix for output
 * @param {object} styleOverrides - Optional style overrides { negative, settings: { cfg, steps, sampler, scheduler } }
 * @param {object} themeOverrides - Optional theme overrides { negative, settings: { cfg_boost, steps_boost } }
 */
function buildWorkflow(prompt, seed, filenamePrefix, styleOverrides = null, themeOverrides = null) {
  if (isSDXLModel()) {
    const modelConfig = getActiveModelConfig().config;

    // Merge style overrides with model defaults
    let negativePrompt = modelConfig.negativePrompt;
    let workflowConfig = { ...modelConfig };

    if (styleOverrides) {
      // Combine negatives: style negative + model negative
      if (styleOverrides.negative) {
        negativePrompt = `${styleOverrides.negative}, ${negativePrompt}`;
      }

      // Override settings if provided
      if (styleOverrides.settings) {
        const { cfg, steps, sampler, scheduler, denoise } = styleOverrides.settings;
        if (cfg !== undefined) workflowConfig.cfg = cfg;
        if (steps !== undefined) workflowConfig.steps = steps;
        if (sampler !== undefined) workflowConfig.sampler = sampler;
        if (scheduler !== undefined) workflowConfig.scheduler = scheduler;
        // denoise is typically always 1.0, but allow override
      }

      // Apply style LoRA if provided (overrides model LoRA)
      if (styleOverrides.lora && styleOverrides.lora.name) {
        workflowConfig.lora = styleOverrides.lora.name + '.safetensors';
        workflowConfig.loraStrength = styleOverrides.lora.strength || 0.8;
        console.log(`[SDXLMultiGPU] Style LoRA: ${workflowConfig.lora} @ ${workflowConfig.loraStrength}`);
      }
    }

    // Apply theme overrides (additive boosts on top of style settings)
    if (themeOverrides) {
      // Prepend theme negative to chain: theme.negative, style.negative, model.negative
      if (themeOverrides.negative) {
        negativePrompt = `${themeOverrides.negative}, ${negativePrompt}`;
      }

      // Apply additive boosts from theme settings
      if (themeOverrides.settings) {
        if (themeOverrides.settings.cfg_boost) {
          workflowConfig.cfg = Math.max(1, Math.min(15, workflowConfig.cfg + themeOverrides.settings.cfg_boost));
        }
        if (themeOverrides.settings.steps_boost) {
          workflowConfig.steps = Math.max(10, Math.min(60, workflowConfig.steps + themeOverrides.settings.steps_boost));
        }
      }
    }

    return buildSDXLWorkflowWithConfig(prompt, negativePrompt, seed, filenamePrefix, workflowConfig);
  } else {
    return buildFluxGGUFWorkflow(prompt, seed, filenamePrefix);
  }
}

/**
 * Build SDXL workflow with explicit config (for style overrides)
 */
function buildSDXLWorkflowWithConfig(prompt, negativePrompt, seed, filenamePrefix, config) {
  const hasLora = config.lora && config.lora.trim() !== '';

  const workflow = {
    prompt: {
      // Model loader
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: {
          ckpt_name: config.checkpoint
        }
      },
      // Positive prompt encoding
      "2": {
        class_type: "CLIPTextEncode",
        inputs: {
          text: prompt,
          clip: hasLora ? ["8", 1] : ["1", 1]
        }
      },
      // Negative prompt encoding
      "3": {
        class_type: "CLIPTextEncode",
        inputs: {
          text: negativePrompt,
          clip: hasLora ? ["8", 1] : ["1", 1]
        }
      },
      // Empty latent image
      "4": {
        class_type: "EmptyLatentImage",
        inputs: {
          width: config.width,
          height: config.height,
          batch_size: 1
        }
      },
      // KSampler
      "5": {
        class_type: "KSampler",
        inputs: {
          model: hasLora ? ["8", 0] : ["1", 0],
          positive: ["2", 0],
          negative: ["3", 0],
          latent_image: ["4", 0],
          seed: seed,
          steps: config.steps,
          cfg: config.cfg,
          sampler_name: config.sampler,
          scheduler: config.scheduler,
          denoise: 1.0
        }
      },
      // VAE Decode
      "6": {
        class_type: "VAEDecode",
        inputs: {
          samples: ["5", 0],
          vae: ["1", 2]
        }
      },
      // Save Image
      "7": {
        class_type: "SaveImage",
        inputs: {
          images: ["6", 0],
          filename_prefix: filenamePrefix
        }
      }
    }
  };

  // Add LoRA loader if configured
  if (hasLora) {
    workflow.prompt["8"] = {
      class_type: "LoraLoader",
      inputs: {
        lora_name: config.lora,
        model: ["1", 0],
        clip: ["1", 1],
        strength_model: config.loraStrength || 0.5,
        strength_clip: config.loraStrength || 0.5
      }
    };
  }

  return workflow;
}

// =============================================================
//                     SERVER MANAGEMENT
// =============================================================

/**
 * Check if a ComfyUI server is healthy
 */
async function checkServerHealth(serverUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${serverUrl}/system_stats`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (response.ok) {
      const stats = await response.json();
      return { healthy: true, stats };
    }
    return { healthy: false, error: 'Bad response' };
  } catch (error) {
    return { healthy: false, error: error.message };
  }
}

/**
 * Get VRAM usage for a server (in MB)
 */
async function getServerVramUsage(serverUrl) {
  try {
    const health = await checkServerHealth(serverUrl);
    if (!health.healthy || !health.stats?.devices) {
      return null;
    }
    // ComfyUI returns device stats including VRAM
    const device = health.stats.devices?.[0];
    if (device?.vram_total && device?.vram_free) {
      const usedMB = (device.vram_total - device.vram_free) / (1024 * 1024);
      const totalMB = device.vram_total / (1024 * 1024);
      return { usedMB, totalMB, freeMB: totalMB - usedMB };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if display GPU is safe to use (has enough free VRAM)
 */
async function isDisplayGPUSafe(serverUrl) {
  const vram = await getServerVramUsage(serverUrl);
  if (!vram) {
    // Can't check VRAM, be cautious
    console.log('[SDXLMultiGPU] Cannot check display GPU VRAM, skipping for safety');
    return false;
  }

  const maxAllowed = DISPLAY_GPU_CONFIG.maxVramMB;
  const isSafe = vram.usedMB < maxAllowed;

  if (!isSafe) {
    console.log(`[SDXLMultiGPU] Display GPU VRAM too high: ${vram.usedMB.toFixed(0)}MB / ${maxAllowed}MB max`);
  }

  return isSafe;
}

/**
 * Get status of all servers
 */
async function getAllServersStatus() {
  // Ensure health watcher is initialized
  if (!gpuHealthWatcher.initialized) {
    await gpuHealthWatcher.init();
  }

  // Get fresh status
  await gpuHealthWatcher.forceCheck();
  const watcherStatus = gpuHealthWatcher.getStatus();

  const results = SERVERS.map((server) => {
    const status = watcherStatus[server.name];
    return {
      name: server.name,
      url: server.url,
      healthy: status?.online || false,
      vramFree: status?.vramFree,
      restartCount: status?.restartCount || 0,
      consecutiveFailures: status?.consecutiveFailures || 0,
    };
  });

  const availableCount = results.filter(r => r.healthy).length;

  return {
    servers: results,
    availableCount,
    totalCount: SERVERS.length,
    allHealthy: availableCount === SERVERS.length,
  };
}

/**
 * Get list of available (healthy) servers
 * Attempts to restart any offline servers before returning
 * Sorted with non-display GPUs first for safer generation
 */
async function getAvailableServers() {
  // Ensure health watcher is running
  if (!gpuHealthWatcher.initialized) {
    await gpuHealthWatcher.init();
  }

  // Check all servers
  await gpuHealthWatcher.forceCheck();

  // Try to restart any offline servers
  const offlineServers = SERVERS.filter(server => {
    const status = gpuHealthWatcher.serverStatus.get(server.url);
    return !status?.online;
  });

  if (offlineServers.length > 0) {
    console.log(`[SDXLMultiGPU] Found ${offlineServers.length} offline server(s), attempting restart...`);

    // Attempt restart in parallel
    await Promise.all(offlineServers.map(server => gpuHealthWatcher.attemptRestart(server)));

    // Re-check after restart attempts
    await gpuHealthWatcher.forceCheck();
  }

  // Get online servers from health watcher
  const onlineServers = gpuHealthWatcher.getOnlineServers();
  const healthyServers = onlineServers.map(server => ({
    name: server.name,
    url: server.url,
    healthy: true,
  }));

  // Find display GPU info from config
  const serverConfigs = SERVERS.reduce((acc, s) => {
    acc[s.name] = s;
    return acc;
  }, {});

  // Map servers with their display GPU status and priority
  const serversWithInfo = healthyServers.map(s => ({
    url: s.url,
    name: s.name,
    isDisplayGPU: serverConfigs[s.name]?.isDisplayGPU || false,
    gpuType: serverConfigs[s.name]?.gpuType || '3060',
    priority: serverConfigs[s.name]?.priority || 2,  // Default to lower priority
  }));

  // Sort by priority (3080s first), then non-display GPUs
  serversWithInfo.sort((a, b) => {
    // First sort by priority (lower = better, 3080s have priority 1)
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    // Then by display GPU preference
    if (DISPLAY_GPU_CONFIG.preferNonDisplay) {
      if (a.isDisplayGPU !== b.isDisplayGPU) {
        return a.isDisplayGPU ? 1 : -1;  // Display GPU goes last
      }
    }
    return 0;
  });

  console.log(`[SDXLMultiGPU] Available servers (priority sorted): ${serversWithInfo.map(s => `${s.name}(${s.gpuType})`).join(', ')}`);

  return serversWithInfo;
}

// =============================================================
//                     IMAGE GENERATION
// =============================================================

/**
 * Queue a prompt on a ComfyUI server
 */
async function queuePrompt(serverUrl, workflow) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout for queue
  let response;
  try {
    response = await fetch(`${serverUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workflow),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to queue prompt: ${error}`);
  }

  return response.json();
}

/**
 * Get generation history from a server
 */
async function getHistory(serverUrl, promptId) {
  try {
    const response = await fetch(`${serverUrl}/history/${promptId}`, {
      timeout: 5000,
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

/**
 * Get image from ComfyUI server
 */
async function getImage(serverUrl, filename, subfolder = '', folderType = 'output') {
  const params = new URLSearchParams({ filename, subfolder, type: folderType });
  const response = await fetch(`${serverUrl}/view?${params}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Wait for generation to complete
 */
async function waitForCompletion(serverUrl, promptId, timeoutMs = GENERATION_TIMEOUT_MS) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const history = await getHistory(serverUrl, promptId);

    if (history && history[promptId]) {
      const result = history[promptId];

      if (result.status?.completed) {
        // Find the output image
        const outputs = result.outputs;
        for (const nodeId in outputs) {
          const nodeOutput = outputs[nodeId];
          if (nodeOutput.images && nodeOutput.images.length > 0) {
            const imageInfo = nodeOutput.images[0];
            const imageBuffer = await getImage(
              serverUrl,
              imageInfo.filename,
              imageInfo.subfolder || '',
              imageInfo.type || 'output'
            );
            return { success: true, imageBuffer };
          }
        }
        throw new Error('No output image found');
      }

      if (result.status?.status_str === 'error') {
        throw new Error(`Generation failed: ${JSON.stringify(result.status)}`);
      }
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error('Generation timed out');
}

/**
 * Generate a single image on a specific server
 * @param {object} server - Server config { url, name, isDisplayGPU }
 * @param {object} theme - Theme config { id, name, modifiers, category }
 * @param {string} domain - Domain name
 * @param {string} customPrompt - Optional custom prompt
 * @param {object} artStyle - Optional art style { prompt, negative, settings, lora }
 */
async function generateOnServer(server, theme, domain, customPrompt, artStyle = null) {
  const { type: modelType, config: modelConfig } = getActiveModelConfig();
  const activeModel = MODEL_CONFIG.activeModel;

  // Build base prompt from theme and custom prompt
  // Use model-aware modifiers: modifiers_animagine for Animagine, modifiers for everything else
  let basePrompt;
  const userPrompt = customPrompt?.trim();
  const isAnimeModel = activeModel === 'sdxl-animagine';
  const isPlaygroundModel = activeModel.includes('playground');

  // Select model-appropriate modifiers
  let themeModifiers = (isAnimeModel && theme.modifiers_animagine)
    ? theme.modifiers_animagine
    : theme.modifiers;

  // Strip color terms from theme modifiers for monochrome styles (pencil_sketch, charcoal)
  // This prevents colored lighting/palette descriptions from bleeding into B&W outputs
  if (artStyle && MONOCHROME_STYLES.has(artStyle.id)) {
    themeModifiers = stripColorFromModifiers(themeModifiers);
  }

  // Condense theme modifiers for styles that need strong stylistic control (ink_drawing)
  // Only keeps high-weight identity segments (>=1.2), drops atmospheric/detail descriptions
  if (artStyle && CONDENSED_MODIFIER_STYLES.has(artStyle.id)) {
    themeModifiers = condenseModifiers(themeModifiers);
  }

  if (isAnimeModel) {
    // Animagine XL 3.1: quality → subject → theme style (danbooru tags)
    if (userPrompt) {
      basePrompt = `masterpiece, best quality, ${userPrompt}, ${themeModifiers}`;
    } else {
      basePrompt = themeModifiers;
    }
  } else if (isPlaygroundModel) {
    // Playground v2.5: subject → theme style → quality
    if (userPrompt) {
      basePrompt = `${userPrompt}, ${themeModifiers}, highly detailed, 8k`;
    } else {
      basePrompt = `masterpiece, best quality, highly detailed, ${themeModifiers}, sharp focus`;
    }
  } else {
    // Default SDXL: Original behavior
    basePrompt = themeModifiers;
    if (userPrompt) {
      basePrompt = `${userPrompt}, ${basePrompt}`;
    }
    // Only append realism quality tags when no art style is overriding
    // Art styles (watercolor, ink, pencil etc.) have their own quality descriptors
    if (!artStyle) {
      basePrompt += ', masterpiece, 8k quality, highly detailed, cinematic lighting, professional artwork';
    }
  }

  // Apply art style to prompt if provided
  let promptText = basePrompt;
  let styleOverrides = null;

  if (artStyle) {
    // Art style has a prompt template with {prompt} placeholder
    // Replace {prompt} with the base prompt (theme modifiers + custom prompt)
    if (artStyle.prompt && artStyle.prompt.includes('{prompt}')) {
      promptText = artStyle.prompt.replace('{prompt}', basePrompt);
    } else if (artStyle.prompt) {
      // If no placeholder, prepend the style prompt
      promptText = `${artStyle.prompt}, ${basePrompt}`;
    }

    // Prepare style overrides for workflow
    styleOverrides = {
      negative: artStyle.negative || null,
      settings: artStyle.settings || null,
      lora: artStyle.lora || null,
    };

    console.log(`[SDXLMultiGPU] Applying art style: ${artStyle.name}`);
    if (artStyle.settings) {
      console.log(`[SDXLMultiGPU] Style settings: CFG=${artStyle.settings.cfg}, steps=${artStyle.settings.steps}, sampler=${artStyle.settings.sampler}`);
    }
  }

  // Generate random seed for variety (each generation produces different results)
  // Add timestamp and random value to ensure uniqueness
  const randomComponent = `${Date.now()}-${Math.random()}`;
  const seedInput = `${domain}-${theme.id}-${randomComponent}`;
  const hash = crypto.createHash('sha256').update(seedInput).digest();
  const seed = hash.readUInt32BE(0);

  // Create filename
  const domainClean = domain.replace(/\./g, '_');
  const themeClean = theme.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
  const styleClean = artStyle ? `_${artStyle.id}` : '';
  const filenamePrefix = `HSR/${domainClean}_${themeClean}${styleClean}`;

  // Build theme overrides if theme has negative or settings
  // Use model-aware negatives: negative_animagine for Animagine, negative for everything else
  let themeOverrides = null;
  const themeNegative = (isAnimeModel && theme.negative_animagine)
    ? theme.negative_animagine
    : (theme.negative || null);

  if (themeNegative || theme.settings) {
    themeOverrides = {
      negative: themeNegative,
      settings: theme.settings || null,
    };
    if (theme.settings) {
      console.log(`[SDXLMultiGPU] Theme boosts: cfg_boost=${theme.settings.cfg_boost || 0}, steps_boost=${theme.settings.steps_boost || 0}`);
    }
  }

  // Build workflow based on active model (with style and theme overrides)
  const workflow = buildWorkflow(promptText, seed, filenamePrefix, styleOverrides, themeOverrides);

  const startTime = Date.now();

  try {
    const queueResult = await queuePrompt(server.url, workflow);
    const promptId = queueResult.prompt_id;

    console.log(`[SDXLMultiGPU] ${server.name}: Queued ${theme.name} for ${domain} using ${modelType} (prompt: ${promptId})`);

    const result = await waitForCompletion(server.url, promptId);
    const genTime = (Date.now() - startTime) / 1000;

    console.log(`[SDXLMultiGPU] ${server.name}: Completed ${theme.name} in ${genTime.toFixed(1)}s`);

    // Record generation for automatic restart management
    const gpuId = comfyuiManager.getGPUIdByUrl(server.url);
    if (gpuId) {
      const genStatus = comfyuiManager.recordGeneration(gpuId);
      if (genStatus.restartQueued) {
        console.log(`[SDXLMultiGPU] ${server.name}: Restart queued after ${genStatus.generationCount} generations`);
      }
    }

    return {
      success: true,
      imageBuffer: result.imageBuffer,
      seed,
      theme,
      server: server.name,
      generationTime: genTime,
      modelType,
    };
  } catch (error) {
    console.error(`[SDXLMultiGPU] ${server.name}: Failed ${theme.name}:`, error.message);
    return {
      success: false,
      error: error.message,
      theme,
      server: server.name,
      modelType,
    };
  }
}

// =============================================================
//                     WATERMARK
// =============================================================

/**
 * Add Halcyon branding watermark to image
 */
// ========== WATERMARK STYLES ==========
// 34 Approved YAY watermark styles only
const WATERMARK_STYLES = {
  anime: 'anime',              // Manga speech bubbles + speed lines
  aurora: 'aurora',            // Northern lights effect
  bamboo: 'bamboo',            // Asian bamboo forest zen
  blueprint: 'blueprint',      // Engineering blueprint technical
  candy: 'candy',              // Bright candy aesthetic
  carbon: 'carbon',            // Carbon fiber racing
  casino: 'casino',            // Vegas casino cards/chips
  cinematic: 'cinematic',      // Letterbox bars + elegant type
  circuit: 'circuit',          // Tech/circuit board traces + chip styling
  comic: 'comic',              // Comic book pop art
  deco: 'deco',                // Art deco 1920s glamour
  elegant: 'elegant',          // Luxury gold border + vignette
  galaxy: 'galaxy',            // Deep space galaxy swirl
  grunge: 'grunge',            // Distressed rock poster style
  jungle: 'jungle',            // Tropical safari style
  matrix: 'matrix',            // Hacker terminal style
  medieval: 'medieval',        // Knight/castle fantasy style
  military: 'military',        // Digital tactical HUD
  neon_grid: 'neon_grid',      // Tron style neon grid
  noir: 'noir',                // Black & white film noir
  ocean: 'ocean',              // Underwater wave aesthetic
  origami: 'origami',          // Japanese paper fold style
  pcb: 'pcb',                  // PCB circuit board green
  pixel_art: 'pixel_art',      // 8-bit retro game style
  retro: 'retro',              // 80s synthwave chrome + grid
  sketch: 'sketch',            // Hand-drawn pencil style
  sports: 'sports',            // Athletic jersey style
  stained_glass: 'stained_glass', // Church window mosaic
  steampunk: 'steampunk',      // Gears and brass victorian
  synthwave: 'synthwave',      // 80s synthwave purple/pink
  tribal: 'tribal',            // Geometric tribal patterns
  watercolor: 'watercolor',    // Artistic watercolor paint
  western: 'western',          // Wanted poster style
  zen: 'zen',                  // Japanese minimalist
};

// Default watermark style
const DEFAULT_WATERMARK_STYLE = 'cinematic';
let currentWatermarkStyle = DEFAULT_WATERMARK_STYLE;

function setWatermarkStyle(style) {
  if (WATERMARK_STYLES[style]) {
    currentWatermarkStyle = style;
    console.log(`[Watermark] Style set to: ${style}`);
  }
}

async function addDomainWatermark(imageBuffer, domain, theme, style = null) {
  const watermarkStyle = style || currentWatermarkStyle;

  try {
    const img = await loadImage(imageBuffer);
    const w = img.width;
    const h = img.height;

    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');

    // Draw original image
    ctx.drawImage(img, 0, 0);

    // Apply selected watermark style (34 YAY styles only)
    switch (watermarkStyle) {
      case 'anime':
        applyAnimeWatermark(ctx, w, h, domain);
        break;
      case 'aurora':
        applyAuroraWatermark(ctx, w, h, domain);
        break;
      case 'bamboo':
        applyBambooWatermark(ctx, w, h, domain);
        break;
      case 'blueprint':
        applyBlueprintWatermark(ctx, w, h, domain);
        break;
      case 'candy':
        applyCandyWatermark(ctx, w, h, domain);
        break;
      case 'carbon':
        applyCarbonWatermark(ctx, w, h, domain);
        break;
      case 'casino':
        applyCasinoWatermark(ctx, w, h, domain);
        break;
      case 'cinematic':
        applyCinematicWatermark(ctx, w, h, domain);
        break;
      case 'circuit':
        applyCircuitWatermark(ctx, w, h, domain);
        break;
      case 'comic':
        applyComicWatermark(ctx, w, h, domain);
        break;
      case 'deco':
        applyDecoWatermark(ctx, w, h, domain);
        break;
      case 'elegant':
        applyElegantWatermark(ctx, w, h, domain);
        break;
      case 'galaxy':
        applyGalaxyWatermark(ctx, w, h, domain);
        break;
      case 'grunge':
        applyGrungeWatermark(ctx, w, h, domain);
        break;
      case 'jungle':
        applyJungleWatermark(ctx, w, h, domain);
        break;
      case 'matrix':
        applyMatrixWatermark(ctx, w, h, domain);
        break;
      case 'medieval':
        applyMedievalWatermark(ctx, w, h, domain);
        break;
      case 'military':
        applyMilitaryWatermark(ctx, w, h, domain);
        break;
      case 'neon_grid':
        applyNeonGridWatermark(ctx, w, h, domain);
        break;
      case 'noir':
        applyNoirWatermark(ctx, w, h, domain);
        break;
      case 'ocean':
        applyOceanWatermark(ctx, w, h, domain);
        break;
      case 'origami':
        applyOrigamiWatermark(ctx, w, h, domain);
        break;
      case 'pcb':
        applyPCBWatermark(ctx, w, h, domain);
        break;
      case 'pixel_art':
        applyPixelArtWatermark(ctx, w, h, domain);
        break;
      case 'retro':
        applyRetroWatermark(ctx, w, h, domain);
        break;
      case 'sketch':
        applySketchWatermark(ctx, w, h, domain);
        break;
      case 'sports':
        applySportsWatermark(ctx, w, h, domain);
        break;
      case 'stained_glass':
        applyStainedGlassWatermark(ctx, w, h, domain);
        break;
      case 'steampunk':
        applySteampunkWatermark(ctx, w, h, domain);
        break;
      case 'synthwave':
        applySynthwaveWatermark(ctx, w, h, domain);
        break;
      case 'tribal':
        applyTribalWatermark(ctx, w, h, domain);
        break;
      case 'watercolor':
        applyWatercolorWatermark(ctx, w, h, domain);
        break;
      case 'western':
        applyWesternWatermark(ctx, w, h, domain);
        break;
      case 'zen':
        applyZenWatermark(ctx, w, h, domain);
        break;
      default:
        // Default to cinematic style
        applyCinematicWatermark(ctx, w, h, domain);
        break;
    }

    return canvas.toBuffer('image/png');
  } catch (err) {
    console.error('[Watermark] Error:', err.message);
    return imageBuffer;
  }
}

// ========== PREMIUM STYLE (YAY!) ==========
function applyPremiumWatermark(ctx, w, h, domain) {

    // ========== VIGNETTE EFFECT ==========
    const vignetteGrad = ctx.createRadialGradient(w/2, h/2, h*0.3, w/2, h/2, h*0.8);
    vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vignetteGrad.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, w, h);

    // ========== HOLOGRAPHIC EDGE SHIMMER ==========
    // Top edge - rainbow gradient
    const topShimmer = ctx.createLinearGradient(0, 0, w, 0);
    topShimmer.addColorStop(0, 'rgba(255, 0, 128, 0.6)');
    topShimmer.addColorStop(0.25, 'rgba(0, 255, 255, 0.6)');
    topShimmer.addColorStop(0.5, 'rgba(255, 255, 0, 0.6)');
    topShimmer.addColorStop(0.75, 'rgba(0, 255, 128, 0.6)');
    topShimmer.addColorStop(1, 'rgba(128, 0, 255, 0.6)');
    ctx.fillStyle = topShimmer;
    ctx.fillRect(0, 0, w, 3);

    // Bottom edge - rainbow gradient
    ctx.fillRect(0, h - 3, w, 3);

    // Side edges
    const sideShimmer = ctx.createLinearGradient(0, 0, 0, h);
    sideShimmer.addColorStop(0, 'rgba(255, 0, 128, 0.6)');
    sideShimmer.addColorStop(0.5, 'rgba(0, 255, 255, 0.6)');
    sideShimmer.addColorStop(1, 'rgba(128, 0, 255, 0.6)');
    ctx.fillStyle = sideShimmer;
    ctx.fillRect(0, 0, 3, h);
    ctx.fillRect(w - 3, 0, 3, h);

    // ========== GEOMETRIC CORNER DIAMONDS ==========
    const drawDiamond = (x, y, size) => {
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x, y + size);
      ctx.lineTo(x - size, y);
      ctx.closePath();
    };

    // Corner diamonds with glow
    ctx.shadowColor = '#14B8A6';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#14B8A6';

    drawDiamond(30, 30, 12);
    ctx.fill();
    drawDiamond(w - 30, 30, 12);
    ctx.fill();
    drawDiamond(30, h - 30, 12);
    ctx.fill();
    drawDiamond(w - 30, h - 30, 12);
    ctx.fill();

    ctx.shadowBlur = 0;

    // Inner white diamonds
    ctx.fillStyle = '#FFFFFF';
    drawDiamond(30, 30, 5);
    ctx.fill();
    drawDiamond(w - 30, 30, 5);
    ctx.fill();
    drawDiamond(30, h - 30, 5);
    ctx.fill();
    drawDiamond(w - 30, h - 30, 5);
    ctx.fill();

    // ========== TOP BANNER ==========
    const topBannerGrad = ctx.createLinearGradient(0, 0, 0, 85);
    topBannerGrad.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
    topBannerGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.4)');
    topBannerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = topBannerGrad;
    ctx.fillRect(0, 0, w, 85);

    // Decorative line under banner
    const lineGrad = ctx.createLinearGradient(50, 0, w - 50, 0);
    lineGrad.addColorStop(0, 'rgba(20, 184, 166, 0)');
    lineGrad.addColorStop(0.2, 'rgba(20, 184, 166, 0.8)');
    lineGrad.addColorStop(0.5, 'rgba(52, 211, 153, 1)');
    lineGrad.addColorStop(0.8, 'rgba(20, 184, 166, 0.8)');
    lineGrad.addColorStop(1, 'rgba(20, 184, 166, 0)');
    ctx.fillStyle = lineGrad;
    ctx.fillRect(50, 70, w - 100, 2);

    // HALCYON text
    ctx.textAlign = 'center';
    ctx.font = 'bold 38px sans-serif';

    // Platinum/silver gradient text
    const platinumGrad = ctx.createLinearGradient(w/2 - 80, 0, w/2 + 80, 50);
    platinumGrad.addColorStop(0, '#E8E8E8');
    platinumGrad.addColorStop(0.3, '#FFFFFF');
    platinumGrad.addColorStop(0.5, '#B8B8B8');
    platinumGrad.addColorStop(0.7, '#FFFFFF');
    platinumGrad.addColorStop(1, '#E8E8E8');

    ctx.shadowColor = 'rgba(20, 184, 166, 0.8)';
    ctx.shadowBlur = 15;
    ctx.fillStyle = platinumGrad;
    ctx.fillText('HALCYON', w/2, 45);
    ctx.shadowBlur = 0;

    // Subtitle with teal accent
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#2DD4BF';
    ctx.fillText('Subdomain Registry', w/2, 62);

    // ========== BOTTOM BANNER ==========
    const bottomBannerGrad = ctx.createLinearGradient(0, h - 85, 0, h);
    bottomBannerGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    bottomBannerGrad.addColorStop(0.3, 'rgba(0, 0, 0, 0.4)');
    bottomBannerGrad.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
    ctx.fillStyle = bottomBannerGrad;
    ctx.fillRect(0, h - 85, w, 85);

    // Decorative line above domain
    ctx.fillStyle = lineGrad;
    ctx.fillRect(50, h - 72, w - 100, 2);

    // Domain name with shimmer effect
    ctx.font = 'bold 40px sans-serif';

    // Holographic shimmer layers
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#FF00FF';
    ctx.fillText(domain, w/2 - 1, h - 35);
    ctx.fillStyle = '#00FFFF';
    ctx.fillText(domain, w/2 + 1, h - 35);
    ctx.globalAlpha = 1;

    // Main domain text
    ctx.shadowColor = '#14B8A6';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(domain, w/2, h - 36);
    ctx.shadowBlur = 0;

    // NFT Badge
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#0D9488';
    ctx.fillRect(w/2 - 45, h - 22, 90, 16);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('✦ NFT VERIFIED ✦', w/2, h - 10);
}

// ========== CYBERPUNK STYLE ==========
function applyCyberpunkWatermark(ctx, w, h, domain) {
    // Neon outline border
    const borderWidth = 4;
    for (let i = 12; i > 0; i -= 2) {
      ctx.strokeStyle = `rgba(20, 184, 166, ${0.15 * (1 - i/12)})`;
      ctx.lineWidth = borderWidth + i * 2;
      ctx.strokeRect(i, i, w - i*2, h - i*2);
    }
    ctx.strokeStyle = '#14B8A6';
    ctx.lineWidth = borderWidth;
    ctx.strokeRect(2, 2, w - 4, h - 4);

    // HUD Corners
    ctx.fillStyle = '#14B8A6';
    const cs = 50;
    ctx.fillRect(12, 12, cs, 3);
    ctx.fillRect(12, 12, 3, cs);
    ctx.fillRect(w - 12 - cs, 12, cs, 3);
    ctx.fillRect(w - 15, 12, 3, cs);
    ctx.fillRect(12, h - 15, cs, 3);
    ctx.fillRect(12, h - 12 - cs, 3, cs);
    ctx.fillRect(w - 12 - cs, h - 15, cs, 3);
    ctx.fillRect(w - 15, h - 12 - cs, 3, cs);

    // Top dark bar
    const topGrad = ctx.createLinearGradient(0, 0, 0, 80);
    topGrad.addColorStop(0, 'rgba(0,0,0,0.8)');
    topGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, 80);

    // Bottom dark bar
    const bottomGrad = ctx.createLinearGradient(0, h - 80, 0, h);
    bottomGrad.addColorStop(0, 'rgba(0,0,0,0)');
    bottomGrad.addColorStop(1, 'rgba(0,0,0,0.8)');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, h - 80, w, 80);

    // HALCYON
    ctx.textAlign = 'center';
    ctx.font = 'bold 30px sans-serif';
    ctx.shadowColor = '#14B8A6';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('HALCYON', w/2, 40);
    ctx.shadowBlur = 0;
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#14B8A6';
    ctx.fillText('Subdomain Registry', w/2, 55);

    // Domain with chromatic aberration
    ctx.font = 'bold 34px sans-serif';
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#FF0080';
    ctx.fillText(domain, w/2 - 2, h - 35);
    ctx.fillStyle = '#00FFFF';
    ctx.fillText(domain, w/2 + 2, h - 35);
    ctx.globalAlpha = 1;
    ctx.shadowColor = '#14B8A6';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(domain, w/2, h - 36);
    ctx.shadowBlur = 0;

    // Scan lines
    ctx.globalAlpha = 0.03;
    ctx.fillStyle = '#000';
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2);
    ctx.globalAlpha = 1;
}

// ========== MINIMAL STYLE ==========
function applyMinimalWatermark(ctx, w, h, domain) {
    // Subtle bottom gradient only
    const grad = ctx.createLinearGradient(0, h - 70, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, h - 70, w, 70);

    // Thin accent line
    ctx.fillStyle = '#14B8A6';
    ctx.fillRect(0, h - 2, w, 2);

    // Domain name - clean white
    ctx.textAlign = 'center';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10;
    ctx.fillText(domain, w/2, h - 25);
    ctx.shadowBlur = 0;

    // Small HALCYON in corner
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('HALCYON', 15, h - 12);
}

// ========== CINEMATIC STYLE ==========
function applyCinematicWatermark(ctx, w, h, domain) {
    // Letterbox bars (like a movie)
    const barHeight = 80;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, barHeight);
    ctx.fillRect(0, h - barHeight, w, barHeight);

    // Gold accent lines
    ctx.fillStyle = '#D4AF37';
    ctx.fillRect(0, barHeight - 2, w, 2);
    ctx.fillRect(0, h - barHeight, w, 2);

    // HALCYON in top bar - elegant gold
    ctx.textAlign = 'center';
    ctx.font = '600 28px sans-serif';
    const goldGrad = ctx.createLinearGradient(w/2 - 80, 0, w/2 + 80, 0);
    goldGrad.addColorStop(0, '#BF953F');
    goldGrad.addColorStop(0.5, '#FCF6BA');
    goldGrad.addColorStop(1, '#B38728');
    ctx.fillStyle = goldGrad;
    ctx.fillText('HALCYON', w/2, barHeight/2 + 5);

    // Subtitle
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#888888';
    ctx.fillText('Subdomain Registry', w/2, barHeight/2 + 22);

    // Domain in bottom bar
    ctx.font = 'bold 34px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(domain, w/2, h - barHeight/2 + 8);

    // Small decorative elements
    ctx.fillStyle = '#D4AF37';
    ctx.fillRect(w/2 - 60, barHeight/2 + 30, 120, 1);
}

// ========== TARGETING STYLE ==========
function applyTargetingWatermark(ctx, w, h, domain) {
    const green = '#00FF41';
    const darkGreen = '#003B00';

    // Corner brackets (targeting reticle style)
    const bracketSize = 60;
    const bracketThick = 3;
    const offset = 15;

    ctx.strokeStyle = green;
    ctx.lineWidth = bracketThick;
    ctx.shadowColor = green;
    ctx.shadowBlur = 8;

    // Top-left bracket
    ctx.beginPath();
    ctx.moveTo(offset, offset + bracketSize);
    ctx.lineTo(offset, offset);
    ctx.lineTo(offset + bracketSize, offset);
    ctx.stroke();

    // Top-right bracket
    ctx.beginPath();
    ctx.moveTo(w - offset - bracketSize, offset);
    ctx.lineTo(w - offset, offset);
    ctx.lineTo(w - offset, offset + bracketSize);
    ctx.stroke();

    // Bottom-left bracket
    ctx.beginPath();
    ctx.moveTo(offset, h - offset - bracketSize);
    ctx.lineTo(offset, h - offset);
    ctx.lineTo(offset + bracketSize, h - offset);
    ctx.stroke();

    // Bottom-right bracket
    ctx.beginPath();
    ctx.moveTo(w - offset - bracketSize, h - offset);
    ctx.lineTo(w - offset, h - offset);
    ctx.lineTo(w - offset, h - offset - bracketSize);
    ctx.stroke();

    // Center crosshair
    const crossSize = 40;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w/2 - crossSize, h/2);
    ctx.lineTo(w/2 - 10, h/2);
    ctx.moveTo(w/2 + 10, h/2);
    ctx.lineTo(w/2 + crossSize, h/2);
    ctx.moveTo(w/2, h/2 - crossSize);
    ctx.lineTo(w/2, h/2 - 10);
    ctx.moveTo(w/2, h/2 + 10);
    ctx.lineTo(w/2, h/2 + crossSize);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(w/2, h/2, 25, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Data readout - top left
    ctx.font = '10px monospace';
    ctx.fillStyle = green;
    ctx.textAlign = 'left';
    ctx.fillText('Subdomain Registry', offset + 5, offset + bracketSize + 20);
    ctx.fillText('STATUS: LOCKED', offset + 5, offset + bracketSize + 35);

    // Coordinates - top right
    ctx.textAlign = 'right';
    ctx.fillText(`LAT: ${(Math.random() * 90).toFixed(4)}°`, w - offset - 5, offset + bracketSize + 20);
    ctx.fillText(`LNG: ${(Math.random() * 180).toFixed(4)}°`, w - offset - 5, offset + bracketSize + 35);

    // Domain in targeting box at bottom
    ctx.textAlign = 'center';
    const boxW = 280;
    const boxH = 40;
    const boxX = w/2 - boxW/2;
    const boxY = h - 70;

    // Dark box background
    ctx.fillStyle = 'rgba(0, 20, 0, 0.8)';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = green;
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    // Domain text
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = green;
    ctx.fillText(domain, w/2, boxY + 27);

    // Small label
    ctx.font = '8px monospace';
    ctx.fillText('TARGET ACQUIRED', w/2, boxY - 5);
}

// ========== GLITCH STYLE (ENHANCED) ==========
function applyGlitchWatermark(ctx, w, h, domain) {
    // VHS tracking lines at top and bottom
    for (let i = 0; i < 3; i++) {
        const y1 = 10 + i * 8;
        const y2 = h - 20 - i * 8;
        ctx.fillStyle = `rgba(255, 255, 255, ${0.3 - i * 0.08})`;
        ctx.fillRect(0, y1, w, 2);
        ctx.fillRect(0, y2, w, 2);
    }

    // Dramatic RGB split bars across image
    const splits = [
        { y: h * 0.15, height: 4 },
        { y: h * 0.35, height: 6 },
        { y: h * 0.55, height: 3 },
        { y: h * 0.75, height: 5 },
    ];

    for (const split of splits) {
        const offset = 8 + Math.random() * 12;
        // Red channel
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.fillRect(-offset, split.y, w + offset * 2, split.height);
        // Cyan channel
        ctx.fillStyle = 'rgba(0, 255, 255, 0.5)';
        ctx.fillRect(offset, split.y + 2, w, split.height);
    }

    // Scanlines overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    for (let y = 0; y < h; y += 4) {
        ctx.fillRect(0, y, w, 2);
    }

    // Data corruption blocks
    const corruptColors = ['#FF0000', '#00FFFF', '#FF00FF', '#FFFF00'];
    for (let i = 0; i < 12; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const blockW = 30 + Math.random() * 80;
        ctx.fillStyle = corruptColors[i % 4];
        ctx.globalAlpha = 0.3;
        ctx.fillRect(x, y, blockW, 3 + Math.random() * 4);
    }
    ctx.globalAlpha = 1;

    // Top header bar with glitch
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, w, 70);

    // Glitched border
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(0, 68, w/3, 2);
    ctx.fillStyle = '#00FFFF';
    ctx.fillRect(w/3, 68, w/3, 2);
    ctx.fillStyle = '#FF00FF';
    ctx.fillRect(w*2/3, 68, w/3, 2);

    // HALCYON with heavy RGB split
    ctx.textAlign = 'center';
    ctx.font = 'bold 38px monospace';

    ctx.fillStyle = '#FF0000';
    ctx.fillText('HALCYON', w/2 - 4, 42);
    ctx.fillStyle = '#00FF00';
    ctx.fillText('HALCYON', w/2, 44);
    ctx.fillStyle = '#0000FF';
    ctx.fillText('HALCYON', w/2 + 4, 46);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('HALCYON', w/2, 44);

    // Error code
    ctx.font = '10px monospace';
    ctx.fillStyle = '#FF0000';
    ctx.fillText('ERR://DATA_CORRUPT_0x7F', w/2, 60);

    // Bottom domain area
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, h - 75, w, 75);

    // Glitch line
    ctx.fillStyle = '#FF00FF';
    ctx.fillRect(0, h - 75, w, 3);

    // Domain with dramatic RGB split
    ctx.font = 'bold 32px monospace';
    ctx.fillStyle = '#FF0000';
    ctx.fillText(domain, w/2 - 3, h - 35);
    ctx.fillStyle = '#00FFFF';
    ctx.fillText(domain, w/2 + 3, h - 35);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(domain, w/2, h - 35);

    // Noise burst in corner
    for (let i = 0; i < 300; i++) {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.5})`;
        ctx.fillRect(Math.random() * 80, Math.random() * 80, 2, 2);
    }
}

// ========== RETRO/80s STYLE (CLASSIC COLORS) ==========
function applyRetroWatermark(ctx, w, h, domain) {
    // Top bar - dark with teal/orange accents
    ctx.fillStyle = 'rgba(10, 20, 30, 0.95)';
    ctx.fillRect(0, 0, w, 85);

    // Classic 80s stripe pattern (teal, pink, orange)
    ctx.fillStyle = '#00CED1'; // Teal
    ctx.fillRect(0, 78, w, 3);
    ctx.fillStyle = '#FF6B6B'; // Coral pink
    ctx.fillRect(0, 81, w, 2);
    ctx.fillStyle = '#FFA500'; // Orange
    ctx.fillRect(0, 83, w, 2);

    // Bottom bar
    ctx.fillStyle = 'rgba(10, 20, 30, 0.95)';
    ctx.fillRect(0, h - 80, w, 80);

    // Bottom stripes
    ctx.fillStyle = '#FFA500';
    ctx.fillRect(0, h - 80, w, 2);
    ctx.fillStyle = '#FF6B6B';
    ctx.fillRect(0, h - 78, w, 2);
    ctx.fillStyle = '#00CED1';
    ctx.fillRect(0, h - 76, w, 3);

    // Perspective grid at bottom
    const gridY = h - 73;
    ctx.strokeStyle = 'rgba(0, 206, 209, 0.4)';
    ctx.lineWidth = 1;

    // Horizontal lines
    for (let i = 0; i < 5; i++) {
        const y = gridY + i * 15;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }

    // Converging verticals
    for (let i = -10; i <= 10; i++) {
        ctx.beginPath();
        ctx.moveTo(w/2, gridY);
        ctx.lineTo(w/2 + i * 50, h);
        ctx.stroke();
    }

    // Chrome HALCYON - 80s style
    ctx.textAlign = 'center';
    ctx.font = 'bold italic 50px sans-serif';

    // Shadow
    ctx.fillStyle = '#1a1a1a';
    ctx.fillText('HALCYON', w/2 + 3, 55);

    // Chrome gradient (teal to orange to pink)
    const chromeGrad = ctx.createLinearGradient(w/2 - 130, 20, w/2 + 130, 60);
    chromeGrad.addColorStop(0, '#00CED1');
    chromeGrad.addColorStop(0.3, '#FFFFFF');
    chromeGrad.addColorStop(0.5, '#FFA500');
    chromeGrad.addColorStop(0.7, '#FFFFFF');
    chromeGrad.addColorStop(1, '#FF6B6B');
    ctx.fillStyle = chromeGrad;
    ctx.fillText('HALCYON', w/2, 52);

    // Retro deco lines around title
    ctx.strokeStyle = '#00CED1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w/2 - 160, 35);
    ctx.lineTo(w/2 - 140, 35);
    ctx.lineTo(w/2 - 135, 50);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(w/2 + 160, 35);
    ctx.lineTo(w/2 + 140, 35);
    ctx.lineTo(w/2 + 135, 50);
    ctx.stroke();

    // Subtitle
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#FFA500';
    ctx.fillText('Subdomain Registry', w/2, 72);

    // Domain - clean with glow
    ctx.font = 'bold 30px sans-serif';
    ctx.shadowColor = '#00CED1';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#00CED1';
    ctx.fillText(domain, w/2, h - 30);

    ctx.shadowBlur = 5;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(domain, w/2, h - 30);
    ctx.shadowBlur = 0;

    // 80s geometric shapes in corners
    ctx.fillStyle = '#FF6B6B';
    ctx.beginPath();
    ctx.moveTo(15, 15);
    ctx.lineTo(35, 15);
    ctx.lineTo(15, 35);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#00CED1';
    ctx.beginPath();
    ctx.moveTo(w - 15, 15);
    ctx.lineTo(w - 35, 15);
    ctx.lineTo(w - 15, 35);
    ctx.closePath();
    ctx.fill();
}

// ========== ELEGANT/LUXURY STYLE ==========
function applyElegantWatermark(ctx, w, h, domain) {
    // Subtle dark vignette corners
    const vignetteGrad = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)/3, w/2, h/2, Math.max(w,h)/1.2);
    vignetteGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignetteGrad.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, w, h);

    // Thin gold border
    ctx.strokeStyle = '#C9A962';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, w - 40, h - 40);

    // Inner thin line
    ctx.lineWidth = 0.5;
    ctx.strokeRect(25, 25, w - 50, h - 50);

    // Corner ornaments
    const ornamentSize = 20;
    ctx.fillStyle = '#C9A962';

    // Top-left ornament
    ctx.beginPath();
    ctx.moveTo(20, 20);
    ctx.lineTo(20 + ornamentSize, 20);
    ctx.lineTo(20, 20 + ornamentSize);
    ctx.fill();

    // Top-right ornament
    ctx.beginPath();
    ctx.moveTo(w - 20, 20);
    ctx.lineTo(w - 20 - ornamentSize, 20);
    ctx.lineTo(w - 20, 20 + ornamentSize);
    ctx.fill();

    // Bottom-left ornament
    ctx.beginPath();
    ctx.moveTo(20, h - 20);
    ctx.lineTo(20 + ornamentSize, h - 20);
    ctx.lineTo(20, h - 20 - ornamentSize);
    ctx.fill();

    // Bottom-right ornament
    ctx.beginPath();
    ctx.moveTo(w - 20, h - 20);
    ctx.lineTo(w - 20 - ornamentSize, h - 20);
    ctx.lineTo(w - 20, h - 20 - ornamentSize);
    ctx.fill();

    // HALCYON in elegant serif style
    ctx.textAlign = 'center';
    ctx.font = '300 14px serif';
    ctx.fillStyle = '#C9A962';
    ctx.letterSpacing = '8px';
    ctx.fillText('H A L C Y O N', w/2, 45);

    // Thin decorative line
    ctx.fillRect(w/2 - 50, 55, 100, 0.5);

    // Domain - clean and centered at bottom
    ctx.font = '500 28px serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(domain, w/2, h - 40);

    // Small "SUBDOMAIN REGISTRY" under domain
    ctx.font = '300 9px serif';
    ctx.fillStyle = '#888888';
    ctx.fillText('S U B D O M A I N   R E G I S T R Y', w/2, h - 25);
}

// ========== ANIME/MANGA STYLE ==========
function applyAnimeWatermark(ctx, w, h, domain) {
    // Dramatic speed lines in corners
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;

    // Top-left speed lines
    for (let i = 0; i < 15; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * 10);
        ctx.lineTo(i * 10, 0);
        ctx.stroke();
    }

    // Bottom-right speed lines
    for (let i = 0; i < 15; i++) {
        ctx.beginPath();
        ctx.moveTo(w, h - i * 10);
        ctx.lineTo(w - i * 10, h);
        ctx.stroke();
    }

    // Bold manga-style text box at top
    ctx.fillStyle = '#000000';
    ctx.fillRect(w/2 - 120, 10, 240, 50);

    // White border
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.strokeRect(w/2 - 120, 10, 240, 50);

    // HALCYON in bold impact style
    ctx.textAlign = 'center';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('HALCYON', w/2, 45);

    // Japanese-style accent marks
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('★', w/2 - 90, 40);
    ctx.fillText('★', w/2 + 90, 40);

    // Domain box at bottom (speech bubble style)
    const bubbleW = 300;
    const bubbleH = 55;
    const bubbleX = w/2 - bubbleW/2;
    const bubbleY = h - 75;

    // White bubble
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 10);
    ctx.fill();

    // Black border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Speech bubble tail
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(w/2 - 15, bubbleY + bubbleH);
    ctx.lineTo(w/2, bubbleY + bubbleH + 15);
    ctx.lineTo(w/2 + 15, bubbleY + bubbleH);
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(w/2 - 15, bubbleY + bubbleH);
    ctx.lineTo(w/2, bubbleY + bubbleH + 15);
    ctx.lineTo(w/2 + 15, bubbleY + bubbleH);
    ctx.stroke();

    // Domain text
    ctx.font = 'bold 26px sans-serif';
    ctx.fillStyle = '#000000';
    ctx.fillText(domain, w/2, bubbleY + 37);
}

// ========== CIRCUIT/TECH STYLE (ENHANCED) ==========
function applyCircuitWatermark(ctx, w, h, domain) {
    const techBlue = '#00D4FF';
    const techPurple = '#8B5CF6';
    const darkBg = 'rgba(0, 10, 30, 0.85)';

    // Top tech bar
    ctx.fillStyle = darkBg;
    ctx.fillRect(0, 0, w, 80);

    // Bottom tech bar
    ctx.fillRect(0, h - 80, w, 80);

    // Animated-looking circuit traces from all corners
    ctx.strokeStyle = techBlue;
    ctx.lineWidth = 2;
    ctx.shadowColor = techBlue;
    ctx.shadowBlur = 8;

    // Complex top-left circuit
    ctx.beginPath();
    ctx.moveTo(0, 40);
    ctx.lineTo(40, 40);
    ctx.lineTo(40, 20);
    ctx.lineTo(100, 20);
    ctx.lineTo(100, 50);
    ctx.lineTo(160, 50);
    ctx.lineTo(160, 35);
    ctx.lineTo(200, 35);
    ctx.stroke();

    // Top-right circuit
    ctx.beginPath();
    ctx.moveTo(w, 30);
    ctx.lineTo(w - 50, 30);
    ctx.lineTo(w - 50, 55);
    ctx.lineTo(w - 120, 55);
    ctx.lineTo(w - 120, 25);
    ctx.lineTo(w - 180, 25);
    ctx.stroke();

    // Bottom-left circuit
    ctx.beginPath();
    ctx.moveTo(0, h - 35);
    ctx.lineTo(60, h - 35);
    ctx.lineTo(60, h - 55);
    ctx.lineTo(130, h - 55);
    ctx.lineTo(130, h - 40);
    ctx.lineTo(190, h - 40);
    ctx.stroke();

    // Bottom-right circuit
    ctx.beginPath();
    ctx.moveTo(w, h - 45);
    ctx.lineTo(w - 70, h - 45);
    ctx.lineTo(w - 70, h - 25);
    ctx.lineTo(w - 140, h - 25);
    ctx.lineTo(w - 140, h - 60);
    ctx.lineTo(w - 200, h - 60);
    ctx.stroke();

    // Glowing nodes at junctions
    const nodes = [
        [40, 40], [100, 20], [160, 50], [200, 35],
        [w-50, 30], [w-120, 55], [w-180, 25],
        [60, h-35], [130, h-55], [190, h-40],
        [w-70, h-45], [w-140, h-25], [w-200, h-60]
    ];

    ctx.fillStyle = techBlue;
    for (const [x, y] of nodes) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
    }

    // Pulsing core nodes (purple)
    ctx.fillStyle = techPurple;
    ctx.shadowColor = techPurple;
    for (const [x, y] of [[100, 20], [w-120, 55], [130, h-55], [w-140, h-25]]) {
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.shadowBlur = 0;

    // Central processor chip
    const chipW = 220;
    const chipH = 50;
    const chipX = w/2 - chipW/2;
    const chipY = 12;

    ctx.fillStyle = 'rgba(0, 20, 50, 0.95)';
    ctx.fillRect(chipX, chipY, chipW, chipH);

    // Chip border with gradient
    ctx.strokeStyle = techBlue;
    ctx.lineWidth = 2;
    ctx.strokeRect(chipX, chipY, chipW, chipH);

    // Chip pins top and bottom
    ctx.fillStyle = techBlue;
    for (let i = 0; i < 7; i++) {
        ctx.fillRect(chipX + 20 + i * 28, chipY - 10, 12, 10);
        ctx.fillRect(chipX + 20 + i * 28, chipY + chipH, 12, 10);
    }

    // HALCYON in chip
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = techBlue;
    ctx.shadowColor = techBlue;
    ctx.shadowBlur = 10;
    ctx.fillText('HALCYON', w/2, chipY + 33);
    ctx.shadowBlur = 0;

    // Version number
    ctx.font = '9px monospace';
    ctx.fillStyle = techPurple;
    ctx.fillText('v2.0.25', w/2, chipY + 47);

    // Domain display at bottom
    const domainBoxW = 340;
    const domainBoxH = 55;
    const domainBoxX = w/2 - domainBoxW/2;
    const domainBoxY = h - 70;

    ctx.fillStyle = 'rgba(0, 20, 50, 0.95)';
    ctx.fillRect(domainBoxX, domainBoxY, domainBoxW, domainBoxH);
    ctx.strokeStyle = techBlue;
    ctx.lineWidth = 2;
    ctx.strokeRect(domainBoxX, domainBoxY, domainBoxW, domainBoxH);

    // Tech corner brackets
    const bracketSize = 15;
    ctx.fillStyle = techPurple;
    ctx.fillRect(domainBoxX, domainBoxY, bracketSize, 3);
    ctx.fillRect(domainBoxX, domainBoxY, 3, bracketSize);
    ctx.fillRect(domainBoxX + domainBoxW - bracketSize, domainBoxY, bracketSize, 3);
    ctx.fillRect(domainBoxX + domainBoxW - 3, domainBoxY, 3, bracketSize);
    ctx.fillRect(domainBoxX, domainBoxY + domainBoxH - 3, bracketSize, 3);
    ctx.fillRect(domainBoxX, domainBoxY + domainBoxH - bracketSize, 3, bracketSize);
    ctx.fillRect(domainBoxX + domainBoxW - bracketSize, domainBoxY + domainBoxH - 3, bracketSize, 3);
    ctx.fillRect(domainBoxX + domainBoxW - 3, domainBoxY + domainBoxH - bracketSize, 3, bracketSize);

    // Domain
    ctx.font = 'bold 26px monospace';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = techBlue;
    ctx.shadowBlur = 8;
    ctx.fillText(domain, w/2, domainBoxY + 35);
    ctx.shadowBlur = 0;

    // Status indicator
    ctx.font = '10px monospace';
    ctx.fillStyle = '#00FF00';
    ctx.fillText('● REGISTERED', w/2, domainBoxY + 50);
}

// ========== STAMP/BADGE STYLE ==========
function applyStampWatermark(ctx, w, h, domain) {
    // Circular badge/seal in corner
    const badgeX = w - 90;
    const badgeY = 90;
    const badgeR = 65;

    // Outer ring
    ctx.strokeStyle = '#C9A962';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
    ctx.stroke();

    // Inner ring
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeR - 10, 0, Math.PI * 2);
    ctx.stroke();

    // Innermost circle
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeR - 25, 0, Math.PI * 2);
    ctx.stroke();

    // HALCYON curved text at top of badge
    ctx.save();
    ctx.translate(badgeX, badgeY);
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#C9A962';

    const text = 'HALCYON';
    const angleStep = 0.18;
    const startAngle = -Math.PI/2 - (text.length * angleStep) / 2;

    for (let i = 0; i < text.length; i++) {
        const angle = startAngle + i * angleStep;
        ctx.save();
        ctx.rotate(angle + Math.PI/2);
        ctx.translate(0, -badgeR + 22);
        ctx.rotate(-Math.PI/2);
        ctx.fillText(text[i], 0, 0);
        ctx.restore();
    }

    // VERIFIED curved at bottom
    const bottomText = 'VERIFIED';
    const bottomStart = Math.PI/2 - (bottomText.length * angleStep) / 2;

    for (let i = 0; i < bottomText.length; i++) {
        const angle = bottomStart + i * angleStep;
        ctx.save();
        ctx.rotate(angle - Math.PI/2);
        ctx.translate(0, -badgeR + 22);
        ctx.rotate(Math.PI/2);
        ctx.fillText(bottomText[i], 0, 0);
        ctx.restore();
    }

    // Star/checkmark in center
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('★', 0, 8);

    ctx.restore();

    // Domain at bottom in elegant banner style
    const bannerH = 50;
    const bannerY = h - bannerH - 15;

    // Banner background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.moveTo(50, bannerY + bannerH/2);
    ctx.lineTo(80, bannerY);
    ctx.lineTo(w - 80, bannerY);
    ctx.lineTo(w - 50, bannerY + bannerH/2);
    ctx.lineTo(w - 80, bannerY + bannerH);
    ctx.lineTo(80, bannerY + bannerH);
    ctx.closePath();
    ctx.fill();

    // Banner border
    ctx.strokeStyle = '#C9A962';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Domain text
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(domain, w/2, bannerY + bannerH/2 + 8);
}

// ========== NEON STYLE (CYBERPUNK ENHANCED) ==========
function applyNeonWatermark(ctx, w, h, domain) {
    // Dark cyberpunk city background bars
    ctx.fillStyle = 'rgba(5, 0, 15, 0.92)';
    ctx.fillRect(0, 0, w, 95);
    ctx.fillRect(0, h - 95, w, 95);

    // Cyberpunk grid lines in background
    ctx.strokeStyle = 'rgba(255, 0, 255, 0.2)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 95);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, h - 95);
        ctx.lineTo(x, h);
        ctx.stroke();
    }

    // Glowing neon border lines
    ctx.strokeStyle = '#FF00FF';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#FF00FF';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.moveTo(0, 93);
    ctx.lineTo(w, 93);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, h - 93);
    ctx.lineTo(w, h - 93);
    ctx.stroke();

    // Secondary cyan lines
    ctx.strokeStyle = '#00FFFF';
    ctx.shadowColor = '#00FFFF';
    ctx.beginPath();
    ctx.moveTo(0, 90);
    ctx.lineTo(w * 0.3, 90);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.7, 90);
    ctx.lineTo(w, 90);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Corner HUD brackets
    const bracketSize = 25;
    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00FFFF';
    ctx.shadowBlur = 10;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(10, 10 + bracketSize);
    ctx.lineTo(10, 10);
    ctx.lineTo(10 + bracketSize, 10);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(w - 10, 10 + bracketSize);
    ctx.lineTo(w - 10, 10);
    ctx.lineTo(w - 10 - bracketSize, 10);
    ctx.stroke();

    ctx.shadowBlur = 0;

    // HALCYON with intense neon glow
    ctx.textAlign = 'center';
    ctx.font = 'bold 46px sans-serif';

    // Pink outer glow
    ctx.shadowColor = '#FF00FF';
    ctx.shadowBlur = 40;
    ctx.fillStyle = '#FF00FF';
    ctx.fillText('HALCYON', w/2, 58);

    // Cyan inner
    ctx.shadowColor = '#00FFFF';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#00FFFF';
    ctx.fillText('HALCYON', w/2, 58);

    // White hot core
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('HALCYON', w/2, 58);
    ctx.shadowBlur = 0;

    // Cyberpunk subtitle
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#FF00FF';
    ctx.fillText('Subdomain Registry', w/2, 78);

    // Data readout left
    ctx.textAlign = 'left';
    ctx.font = '9px monospace';
    ctx.fillStyle = '#00FFFF';
    ctx.fillText('Subdomain Registry', 15, 82);

    // Data readout right
    ctx.textAlign = 'right';
    ctx.fillText('2077.ACTIVE', w - 15, 82);

    // Domain with intense glow
    ctx.textAlign = 'center';
    ctx.font = 'bold 34px sans-serif';

    ctx.shadowColor = '#00FFFF';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#00FFFF';
    ctx.fillText(domain, w/2, h - 38);

    ctx.shadowBlur = 10;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(domain, w/2, h - 38);
    ctx.shadowBlur = 0;

    // Status bar
    ctx.font = '10px monospace';
    ctx.fillStyle = '#00FF00';
    ctx.shadowColor = '#00FF00';
    ctx.shadowBlur = 8;
    ctx.fillText('◆ VERIFIED ◆ ENCRYPTED ◆ SECURE ◆', w/2, h - 70);
    ctx.shadowBlur = 0;
}

// ========== HACKER/TERMINAL STYLE ==========
function applyMatrixWatermark(ctx, w, h, domain) {
    const hackerGreen = '#00FF41';
    const terminalGreen = '#33FF33';
    const darkGreen = '#001a00';

    // Binary/hex rain (not Matrix katakana)
    const chars = '01001011001010101110100101010110ABCDEF';
    ctx.font = '11px monospace';

    for (let x = 0; x < w; x += 25) {
        const columnHeight = 4 + Math.floor(Math.random() * 8);
        const startY = Math.random() * (h - 180);

        for (let i = 0; i < columnHeight; i++) {
            const char = chars[Math.floor(Math.random() * chars.length)];
            const alpha = 0.5 - (i / columnHeight) * 0.4;
            ctx.fillStyle = `rgba(0, 255, 65, ${alpha})`;
            ctx.fillText(char, x, startY + i * 16);
        }
    }

    // Terminal window at top
    ctx.fillStyle = 'rgba(0, 15, 0, 0.95)';
    ctx.fillRect(0, 0, w, 85);

    // Terminal title bar
    ctx.fillStyle = '#003300';
    ctx.fillRect(0, 0, w, 20);

    // Window buttons
    ctx.fillStyle = '#FF5F56';
    ctx.beginPath();
    ctx.arc(15, 10, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFBD2E';
    ctx.beginPath();
    ctx.arc(32, 10, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#27CA40';
    ctx.beginPath();
    ctx.arc(49, 10, 5, 0, Math.PI * 2);
    ctx.fill();

    // Terminal title
    ctx.font = '11px monospace';
    ctx.fillStyle = '#888888';
    ctx.textAlign = 'center';
    ctx.fillText('Subdomain Registry', w/2, 14);

    // Scan line
    ctx.fillStyle = hackerGreen;
    ctx.fillRect(0, 83, w, 2);

    // HALCYON as ASCII-ish
    ctx.font = 'bold 36px monospace';
    ctx.fillStyle = hackerGreen;
    ctx.shadowColor = hackerGreen;
    ctx.shadowBlur = 12;
    ctx.fillText('Subdomain Registry', w/2, 55);
    ctx.shadowBlur = 0;

    // Command output
    ctx.font = '10px monospace';
    ctx.fillStyle = terminalGreen;
    ctx.fillText('Subdomain Registry', w/2, 75);

    // Bottom terminal
    ctx.fillStyle = 'rgba(0, 15, 0, 0.95)';
    ctx.fillRect(0, h - 80, w, 80);
    ctx.fillStyle = hackerGreen;
    ctx.fillRect(0, h - 80, w, 2);

    // Command prompt with domain
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#888888';
    ctx.fillText('Subdomain Registry', 20, h - 60);

    ctx.fillStyle = terminalGreen;
    ctx.fillText('register --domain ', 140, h - 60);

    // Domain highlighted
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = hackerGreen;
    ctx.shadowBlur = 8;
    ctx.fillText(domain, w/2, h - 28);
    ctx.shadowBlur = 0;

    // Status line
    ctx.font = '10px monospace';
    ctx.fillStyle = hackerGreen;
    ctx.fillText('[■■■■■■■■■■] 100% VERIFIED', w/2, h - 65);

    // Blinking cursor
    ctx.fillStyle = hackerGreen;
    ctx.fillRect(w/2 + 120, h - 38, 10, 20);
}

// ========== FROST/ICE STYLE ==========
function applyFrostWatermark(ctx, w, h, domain) {
    const iceBlue = '#A5F3FC';
    const deepBlue = '#0891B2';
    const white = '#FFFFFF';

    // Frosted edge gradients
    const topFrost = ctx.createLinearGradient(0, 0, 0, 100);
    topFrost.addColorStop(0, 'rgba(165, 243, 252, 0.8)');
    topFrost.addColorStop(0.5, 'rgba(165, 243, 252, 0.4)');
    topFrost.addColorStop(1, 'rgba(165, 243, 252, 0)');
    ctx.fillStyle = topFrost;
    ctx.fillRect(0, 0, w, 100);

    const bottomFrost = ctx.createLinearGradient(0, h - 100, 0, h);
    bottomFrost.addColorStop(0, 'rgba(165, 243, 252, 0)');
    bottomFrost.addColorStop(0.5, 'rgba(165, 243, 252, 0.4)');
    bottomFrost.addColorStop(1, 'rgba(165, 243, 252, 0.8)');
    ctx.fillStyle = bottomFrost;
    ctx.fillRect(0, h - 100, w, 100);

    // Ice crystals / snowflakes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;

    const drawCrystal = (cx, cy, size) => {
        for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(angle) * size, cy + Math.sin(angle) * size);
            ctx.stroke();

            // Small branches
            const branchX = cx + Math.cos(angle) * size * 0.6;
            const branchY = cy + Math.sin(angle) * size * 0.6;
            ctx.beginPath();
            ctx.moveTo(branchX, branchY);
            ctx.lineTo(branchX + Math.cos(angle + 0.5) * size * 0.3, branchY + Math.sin(angle + 0.5) * size * 0.3);
            ctx.moveTo(branchX, branchY);
            ctx.lineTo(branchX + Math.cos(angle - 0.5) * size * 0.3, branchY + Math.sin(angle - 0.5) * size * 0.3);
            ctx.stroke();
        }
    };

    // Scatter crystals
    drawCrystal(50, 40, 25);
    drawCrystal(w - 60, 50, 20);
    drawCrystal(100, h - 45, 18);
    drawCrystal(w - 100, h - 40, 22);
    drawCrystal(w/2 - 180, 35, 15);
    drawCrystal(w/2 + 180, 35, 15);

    // HALCYON with ice effect
    ctx.textAlign = 'center';
    ctx.font = 'bold 42px sans-serif';

    // White glow
    ctx.shadowColor = white;
    ctx.shadowBlur = 20;
    ctx.fillStyle = white;
    ctx.fillText('HALCYON', w/2, 55);

    // Ice blue overlay
    ctx.shadowColor = iceBlue;
    ctx.shadowBlur = 10;
    ctx.fillStyle = iceBlue;
    ctx.fillText('HALCYON', w/2, 55);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.font = '11px sans-serif';
    ctx.fillStyle = deepBlue;
    ctx.fillText('Subdomain Registry', w/2, 75);

    // Domain at bottom with frost effect
    ctx.font = 'bold 30px sans-serif';
    ctx.shadowColor = white;
    ctx.shadowBlur = 15;
    ctx.fillStyle = white;
    ctx.fillText(domain, w/2, h - 30);
    ctx.shadowBlur = 0;
}

// ========== HOLOGRAM STYLE ==========
function applyHologramWatermark(ctx, w, h, domain) {
    // Rainbow prismatic scanlines
    const colors = ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#8B00FF'];

    for (let i = 0; i < 6; i++) {
        ctx.fillStyle = colors[i];
        ctx.globalAlpha = 0.15;
        ctx.fillRect(0, i * 3, w, 2);
        ctx.fillRect(0, h - 20 + i * 3, w, 2);
    }
    ctx.globalAlpha = 1;

    // Holographic shimmer lines across image
    for (let y = 0; y < h; y += 60) {
        const grad = ctx.createLinearGradient(0, y, w, y);
        grad.addColorStop(0, 'rgba(255, 0, 255, 0)');
        grad.addColorStop(0.3, 'rgba(0, 255, 255, 0.2)');
        grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
        grad.addColorStop(0.7, 'rgba(255, 0, 255, 0.2)');
        grad.addColorStop(1, 'rgba(0, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, y, w, 3);
    }

    // Top hologram panel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, w, 80);

    // Rainbow border
    const topBorder = ctx.createLinearGradient(0, 78, w, 78);
    topBorder.addColorStop(0, '#FF0000');
    topBorder.addColorStop(0.17, '#FF7F00');
    topBorder.addColorStop(0.33, '#FFFF00');
    topBorder.addColorStop(0.5, '#00FF00');
    topBorder.addColorStop(0.67, '#0000FF');
    topBorder.addColorStop(0.83, '#8B00FF');
    topBorder.addColorStop(1, '#FF0000');
    ctx.fillStyle = topBorder;
    ctx.fillRect(0, 78, w, 3);

    // HALCYON with holographic effect
    ctx.textAlign = 'center';
    ctx.font = 'bold 40px sans-serif';

    // Multiple color layers for hologram effect
    ctx.fillStyle = 'rgba(255, 0, 255, 0.7)';
    ctx.fillText('HALCYON', w/2 - 2, 48);
    ctx.fillStyle = 'rgba(0, 255, 255, 0.7)';
    ctx.fillText('HALCYON', w/2 + 2, 52);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('HALCYON', w/2, 50);

    // Hologram label
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#00FFFF';
    ctx.fillText('◈ HOLOGRAPHIC VERIFIED ◈', w/2, 70);

    // Bottom panel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, h - 70, w, 70);

    // Rainbow border bottom
    ctx.fillStyle = topBorder;
    ctx.fillRect(0, h - 70, w, 3);

    // Domain with holographic shimmer
    ctx.font = 'bold 28px sans-serif';

    const domainGrad = ctx.createLinearGradient(w/2 - 150, 0, w/2 + 150, 0);
    domainGrad.addColorStop(0, '#FF00FF');
    domainGrad.addColorStop(0.25, '#00FFFF');
    domainGrad.addColorStop(0.5, '#FFFFFF');
    domainGrad.addColorStop(0.75, '#00FFFF');
    domainGrad.addColorStop(1, '#FF00FF');
    ctx.fillStyle = domainGrad;
    ctx.fillText(domain, w/2, h - 30);
}

// ========== ROYAL/REGAL STYLE ==========
function applyRoyalWatermark(ctx, w, h, domain) {
    const gold = '#FFD700';
    const deepPurple = '#4A0080';
    const royalPurple = '#7B2CBF';

    // Top royal banner
    ctx.fillStyle = 'rgba(30, 0, 50, 0.9)';
    ctx.fillRect(0, 0, w, 85);

    // Gold border with ornate edges
    ctx.fillStyle = gold;
    ctx.fillRect(0, 83, w, 3);

    // Crown icon (simplified)
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.moveTo(w/2 - 30, 25);
    ctx.lineTo(w/2 - 20, 10);
    ctx.lineTo(w/2 - 10, 25);
    ctx.lineTo(w/2, 5);
    ctx.lineTo(w/2 + 10, 25);
    ctx.lineTo(w/2 + 20, 10);
    ctx.lineTo(w/2 + 30, 25);
    ctx.lineTo(w/2 + 30, 35);
    ctx.lineTo(w/2 - 30, 35);
    ctx.closePath();
    ctx.fill();

    // Crown jewels
    ctx.fillStyle = '#FF0000';
    ctx.beginPath();
    ctx.arc(w/2, 15, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0000FF';
    ctx.beginPath();
    ctx.arc(w/2 - 15, 22, 3, 0, Math.PI * 2);
    ctx.arc(w/2 + 15, 22, 3, 0, Math.PI * 2);
    ctx.fill();

    // HALCYON in royal gold
    ctx.textAlign = 'center';
    ctx.font = 'bold 32px serif';

    const goldGrad = ctx.createLinearGradient(w/2 - 100, 0, w/2 + 100, 0);
    goldGrad.addColorStop(0, '#BF953F');
    goldGrad.addColorStop(0.25, '#FCF6BA');
    goldGrad.addColorStop(0.5, '#FBF5B7');
    goldGrad.addColorStop(0.75, '#AA771C');
    goldGrad.addColorStop(1, '#BF953F');
    ctx.fillStyle = goldGrad;
    ctx.fillText('HALCYON', w/2, 65);

    // Royal subtitle
    ctx.font = '10px serif';
    ctx.fillStyle = '#C9A962';
    ctx.fillText('Subdomain Registry', w/2, 80);

    // Bottom royal banner
    ctx.fillStyle = 'rgba(30, 0, 50, 0.9)';
    ctx.fillRect(0, h - 75, w, 75);
    ctx.fillStyle = gold;
    ctx.fillRect(0, h - 75, w, 3);

    // Fleur-de-lis decorations
    ctx.font = '20px serif';
    ctx.fillStyle = gold;
    ctx.fillText('⚜', 30, h - 45);
    ctx.fillText('⚜', w - 30, h - 45);

    // Domain in elegant gold
    ctx.font = 'bold 28px serif';
    ctx.fillStyle = goldGrad;
    ctx.fillText(domain, w/2, h - 35);

    // Verified seal
    ctx.font = '10px serif';
    ctx.fillStyle = '#C9A962';
    ctx.fillText('OFFICIALLY REGISTERED', w/2, h - 60);
}

// ========== GRAFFITI/STREET ART STYLE ==========
function applyGraffitiWatermark(ctx, w, h, domain) {
    // Spray paint drips at corners
    const drawDrip = (x, startY, color, length) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(x, startY, 8, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x - 3, startY, 6, length);
        ctx.beginPath();
        ctx.ellipse(x, startY + length, 3, 5, 0, 0, Math.PI * 2);
        ctx.fill();
    };

    // Paint drips
    drawDrip(40, 0, '#FF1493', 60);
    drawDrip(80, 0, '#00FFFF', 45);
    drawDrip(w - 50, 0, '#FFFF00', 55);
    drawDrip(w - 90, 0, '#FF4500', 40);

    // Bottom drips (upside down effect from bottom bar)
    drawDrip(60, h - 70, '#00FF00', 70);
    drawDrip(w - 70, h - 65, '#FF00FF', 65);

    // Graffiti tag box at top
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.save();
    ctx.transform(1, -0.05, 0.05, 1, 0, 0); // Slight skew
    ctx.fillRect(w/2 - 140, 15, 280, 60);
    ctx.restore();

    // HALCYON graffiti style
    ctx.textAlign = 'center';
    ctx.font = 'bold italic 46px sans-serif';

    // Shadow/3D effect
    ctx.fillStyle = '#000000';
    ctx.fillText('HALCYON', w/2 + 4, 58);

    // Outline
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.strokeText('HALCYON', w/2, 54);

    // Fill with gradient
    const graffitiGrad = ctx.createLinearGradient(w/2 - 100, 20, w/2 + 100, 60);
    graffitiGrad.addColorStop(0, '#FF1493');
    graffitiGrad.addColorStop(0.5, '#00FFFF');
    graffitiGrad.addColorStop(1, '#FFFF00');
    ctx.fillStyle = graffitiGrad;
    ctx.fillText('HALCYON', w/2, 54);

    // Spray dots around text
    for (let i = 0; i < 30; i++) {
        const x = w/2 - 150 + Math.random() * 300;
        const y = 10 + Math.random() * 70;
        ctx.fillStyle = `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255}, 0.5)`;
        ctx.beginPath();
        ctx.arc(x, y, 1 + Math.random() * 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Bottom tag
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, h - 70, w, 70);

    // Domain in street style
    ctx.font = 'bold italic 32px sans-serif';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.strokeText(domain, w/2, h - 28);

    const domainGrad = ctx.createLinearGradient(w/2 - 120, 0, w/2 + 120, 0);
    domainGrad.addColorStop(0, '#00FF00');
    domainGrad.addColorStop(0.5, '#FFFF00');
    domainGrad.addColorStop(1, '#FF4500');
    ctx.fillStyle = domainGrad;
    ctx.fillText(domain, w/2, h - 28);

    // Tag signature
    ctx.font = 'italic 14px sans-serif';
    ctx.fillStyle = '#FF1493';
    ctx.fillText('Subdomain Registry', w/2, h - 55);
}

// ========== COSMIC/SPACE STYLE ==========
function applyCosmicWatermark(ctx, w, h, domain) {
    // Starfield
    for (let i = 0; i < 100; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const size = Math.random() * 2;
        const alpha = 0.3 + Math.random() * 0.7;
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }

    // Nebula effect at top
    const nebulaTop = ctx.createRadialGradient(w/2, 0, 0, w/2, 0, w/2);
    nebulaTop.addColorStop(0, 'rgba(138, 43, 226, 0.4)');
    nebulaTop.addColorStop(0.5, 'rgba(75, 0, 130, 0.2)');
    nebulaTop.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = nebulaTop;
    ctx.fillRect(0, 0, w, 150);

    // Nebula at bottom
    const nebulaBottom = ctx.createRadialGradient(w/2, h, 0, w/2, h, w/2);
    nebulaBottom.addColorStop(0, 'rgba(0, 191, 255, 0.4)');
    nebulaBottom.addColorStop(0.5, 'rgba(0, 100, 150, 0.2)');
    nebulaBottom.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = nebulaBottom;
    ctx.fillRect(0, h - 150, w, 150);

    // Top cosmic bar
    ctx.fillStyle = 'rgba(0, 0, 20, 0.85)';
    ctx.fillRect(0, 0, w, 80);

    // Cosmic gradient border
    const cosmicBorder = ctx.createLinearGradient(0, 78, w, 78);
    cosmicBorder.addColorStop(0, '#8B00FF');
    cosmicBorder.addColorStop(0.5, '#00BFFF');
    cosmicBorder.addColorStop(1, '#8B00FF');
    ctx.fillStyle = cosmicBorder;
    ctx.fillRect(0, 78, w, 3);

    // HALCYON with cosmic glow
    ctx.textAlign = 'center';
    ctx.font = 'bold 40px sans-serif';

    // Purple glow
    ctx.shadowColor = '#8B00FF';
    ctx.shadowBlur = 25;
    ctx.fillStyle = '#DDA0DD';
    ctx.fillText('HALCYON', w/2, 52);

    // Bright core
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('HALCYON', w/2, 52);
    ctx.shadowBlur = 0;

    // Star decorations
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#FFD700';
    ctx.fillText('✦', w/2 - 120, 50);
    ctx.fillText('✦', w/2 + 120, 50);

    // Subtitle
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#87CEEB';
    ctx.fillText('Subdomain Registry', w/2, 72);

    // Bottom cosmic bar
    ctx.fillStyle = 'rgba(0, 0, 20, 0.85)';
    ctx.fillRect(0, h - 70, w, 70);
    ctx.fillStyle = cosmicBorder;
    ctx.fillRect(0, h - 70, w, 3);

    // Domain with cosmic effect
    ctx.font = 'bold 28px sans-serif';
    ctx.shadowColor = '#00BFFF';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#E0FFFF';
    ctx.fillText(domain, w/2, h - 30);
    ctx.shadowBlur = 0;

    // Planet icon
    ctx.beginPath();
    ctx.arc(50, h - 40, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#4169E1';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(50, h - 40, 25, 6, -0.3, 0, Math.PI * 2);
    ctx.strokeStyle = '#87CEEB';
    ctx.lineWidth = 2;
    ctx.stroke();
}

// ========== VAPOR/VAPORWAVE STYLE (REFINED) ==========
function applyVaporWatermark(ctx, w, h, domain) {
    // Soft gradient edges
    const leftGrad = ctx.createLinearGradient(0, 0, 120, 0);
    leftGrad.addColorStop(0, 'rgba(255, 113, 206, 0.35)');
    leftGrad.addColorStop(1, 'rgba(255, 113, 206, 0)');
    ctx.fillStyle = leftGrad;
    ctx.fillRect(0, 0, 120, h);

    const rightGrad = ctx.createLinearGradient(w, 0, w - 120, 0);
    rightGrad.addColorStop(0, 'rgba(1, 205, 254, 0.35)');
    rightGrad.addColorStop(1, 'rgba(1, 205, 254, 0)');
    ctx.fillStyle = rightGrad;
    ctx.fillRect(w - 120, 0, 120, h);

    // Top bar - pastel gradient
    const topGrad = ctx.createLinearGradient(0, 0, w, 0);
    topGrad.addColorStop(0, 'rgba(255, 113, 206, 0.92)');
    topGrad.addColorStop(0.5, 'rgba(185, 103, 255, 0.92)');
    topGrad.addColorStop(1, 'rgba(1, 205, 254, 0.92)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, 85);

    // Bottom bar
    const bottomGrad = ctx.createLinearGradient(0, 0, w, 0);
    bottomGrad.addColorStop(0, 'rgba(1, 205, 254, 0.92)');
    bottomGrad.addColorStop(0.5, 'rgba(185, 103, 255, 0.92)');
    bottomGrad.addColorStop(1, 'rgba(255, 113, 206, 0.92)');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, h - 80, w, 80);

    // Scanline effect
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    for (let y = 0; y < 85; y += 3) {
        ctx.fillRect(0, y, w, 1);
    }
    for (let y = h - 80; y < h; y += 3) {
        ctx.fillRect(0, y, w, 1);
    }

    // Greek column silhouettes
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    // Left column
    ctx.fillRect(25, 15, 8, 65);
    ctx.fillRect(20, 15, 18, 8);
    ctx.fillRect(20, 72, 18, 8);
    // Right column
    ctx.fillRect(w - 33, 15, 8, 65);
    ctx.fillRect(w - 38, 15, 18, 8);
    ctx.fillRect(w - 38, 72, 18, 8);

    // Full-width Japanese text - HALCYON
    ctx.textAlign = 'center';
    ctx.font = 'bold 42px serif';

    // Chromatic aberration effect
    ctx.fillStyle = 'rgba(255, 113, 206, 0.6)';
    ctx.fillText('H A L C Y O N', w/2 - 2, 50);
    ctx.fillStyle = 'rgba(1, 205, 254, 0.6)';
    ctx.fillText('H A L C Y O N', w/2 + 2, 52);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('H A L C Y O N', w/2, 51);

    // Japanese subtitle
    ctx.font = '13px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillText('永 遠 の 登 録', w/2, 72);

    // Domain with aesthetic styling
    ctx.font = 'bold 28px serif';

    ctx.fillStyle = 'rgba(255, 113, 206, 0.7)';
    ctx.fillText(domain, w/2 - 2, h - 35);
    ctx.fillStyle = 'rgba(1, 205, 254, 0.7)';
    ctx.fillText(domain, w/2 + 2, h - 33);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(domain, w/2, h - 34);

    // Aesthetic decorations
    ctx.font = '11px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillText('✧ ＡＥＳＴＨＥＴＩＣ ✧', w/2, h - 58);

    // Dolphin + palm silhouettes
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.font = '18px sans-serif';
    ctx.fillText('🐬', 60, h - 35);
    ctx.fillText('🌴', w - 60, h - 35);
}

// ========== CHROME/METALLIC STYLE ==========
function applyChromeWatermark(ctx, w, h, domain) {
    // Metallic top bar
    const metalGrad = ctx.createLinearGradient(0, 0, 0, 85);
    metalGrad.addColorStop(0, '#4a4a4a');
    metalGrad.addColorStop(0.3, '#8a8a8a');
    metalGrad.addColorStop(0.5, '#ffffff');
    metalGrad.addColorStop(0.7, '#8a8a8a');
    metalGrad.addColorStop(1, '#4a4a4a');
    ctx.fillStyle = metalGrad;
    ctx.fillRect(0, 0, w, 85);

    // Chrome reflection line
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(0, 30, w, 2);

    // Bottom bar
    ctx.fillStyle = metalGrad;
    ctx.fillRect(0, h - 75, w, 75);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(0, h - 45, w, 2);

    // Rivets/bolts
    ctx.fillStyle = '#333333';
    for (let x = 20; x < w; x += 60) {
        ctx.beginPath();
        ctx.arc(x, 15, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, h - 15, 6, 0, Math.PI * 2);
        ctx.fill();

        // Rivet highlight
        ctx.fillStyle = '#666666';
        ctx.beginPath();
        ctx.arc(x - 1, 14, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#333333';
    }

    // HALCYON in chrome
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px sans-serif';

    // Chrome text gradient
    const chromeText = ctx.createLinearGradient(w/2 - 100, 35, w/2 + 100, 70);
    chromeText.addColorStop(0, '#666666');
    chromeText.addColorStop(0.25, '#FFFFFF');
    chromeText.addColorStop(0.5, '#AAAAAA');
    chromeText.addColorStop(0.75, '#FFFFFF');
    chromeText.addColorStop(1, '#666666');

    // Shadow
    ctx.fillStyle = '#222222';
    ctx.fillText('HALCYON', w/2 + 2, 60);

    // Chrome fill
    ctx.fillStyle = chromeText;
    ctx.fillText('HALCYON', w/2, 58);

    // Subtitle engraved look
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#555555';
    ctx.fillText('Subdomain Registry', w/2 + 1, 76);
    ctx.fillStyle = '#AAAAAA';
    ctx.fillText('Subdomain Registry', w/2, 75);

    // Domain in chrome
    ctx.font = 'bold 30px sans-serif';
    ctx.fillStyle = '#222222';
    ctx.fillText(domain, w/2 + 2, h - 32);
    ctx.fillStyle = chromeText;
    ctx.fillText(domain, w/2, h - 34);
}

// ========== FIRE/FLAME STYLE ==========
function applyFireWatermark(ctx, w, h, domain) {
    // Fire gradient at bottom
    const fireGrad = ctx.createLinearGradient(0, h - 120, 0, h);
    fireGrad.addColorStop(0, 'rgba(255, 100, 0, 0)');
    fireGrad.addColorStop(0.3, 'rgba(255, 80, 0, 0.3)');
    fireGrad.addColorStop(0.6, 'rgba(255, 50, 0, 0.5)');
    fireGrad.addColorStop(1, 'rgba(200, 0, 0, 0.7)');
    ctx.fillStyle = fireGrad;
    ctx.fillRect(0, h - 120, w, 120);

    // Fire at top
    const topFire = ctx.createLinearGradient(0, 0, 0, 100);
    topFire.addColorStop(0, 'rgba(200, 0, 0, 0.7)');
    topFire.addColorStop(0.4, 'rgba(255, 50, 0, 0.5)');
    topFire.addColorStop(0.7, 'rgba(255, 100, 0, 0.3)');
    topFire.addColorStop(1, 'rgba(255, 150, 0, 0)');
    ctx.fillStyle = topFire;
    ctx.fillRect(0, 0, w, 100);

    // Ember particles
    for (let i = 0; i < 40; i++) {
        const x = Math.random() * w;
        const y = Math.random() * 80 + 10;
        const size = 1 + Math.random() * 3;
        const colors = ['#FF4500', '#FF6600', '#FFAA00', '#FFFF00'];
        ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
        ctx.globalAlpha = 0.5 + Math.random() * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();

        // Bottom embers
        ctx.beginPath();
        ctx.arc(Math.random() * w, h - Math.random() * 70, size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Dark bar for text
    ctx.fillStyle = 'rgba(20, 0, 0, 0.85)';
    ctx.fillRect(w/2 - 160, 15, 320, 60);
    ctx.fillRect(w/2 - 180, h - 70, 360, 55);

    // Fire border
    ctx.strokeStyle = '#FF4500';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#FF4500';
    ctx.shadowBlur = 10;
    ctx.strokeRect(w/2 - 160, 15, 320, 60);
    ctx.strokeRect(w/2 - 180, h - 70, 360, 55);
    ctx.shadowBlur = 0;

    // HALCYON on fire
    ctx.textAlign = 'center';
    ctx.font = 'bold 40px sans-serif';

    const fireText = ctx.createLinearGradient(w/2 - 100, 30, w/2 + 100, 65);
    fireText.addColorStop(0, '#FFFF00');
    fireText.addColorStop(0.3, '#FFAA00');
    fireText.addColorStop(0.6, '#FF6600');
    fireText.addColorStop(1, '#FF0000');

    ctx.shadowColor = '#FF4500';
    ctx.shadowBlur = 15;
    ctx.fillStyle = fireText;
    ctx.fillText('HALCYON', w/2, 55);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#FF6600';
    ctx.fillText('Subdomain Registry', w/2, 70);

    // Domain
    ctx.font = 'bold 28px sans-serif';
    ctx.shadowColor = '#FF4500';
    ctx.shadowBlur = 12;
    ctx.fillStyle = fireText;
    ctx.fillText(domain, w/2, h - 35);
    ctx.shadowBlur = 0;
}

// ========== ELECTRIC/LIGHTNING STYLE ==========
function applyElectricWatermark(ctx, w, h, domain) {
    const electricBlue = '#00BFFF';
    const white = '#FFFFFF';

    // Dark storm background bars
    ctx.fillStyle = 'rgba(10, 15, 30, 0.9)';
    ctx.fillRect(0, 0, w, 90);
    ctx.fillRect(0, h - 85, w, 85);

    // Lightning bolt function
    const drawBolt = (startX, startY, endX, endY, branches) => {
        ctx.strokeStyle = electricBlue;
        ctx.lineWidth = 2;
        ctx.shadowColor = electricBlue;
        ctx.shadowBlur = 15;

        ctx.beginPath();
        ctx.moveTo(startX, startY);

        let x = startX;
        let y = startY;
        const segments = 8;

        for (let i = 0; i < segments; i++) {
            const progress = (i + 1) / segments;
            const targetX = startX + (endX - startX) * progress;
            const targetY = startY + (endY - startY) * progress;
            const offsetX = (Math.random() - 0.5) * 30;

            x = targetX + offsetX;
            y = targetY;
            ctx.lineTo(x, y);

            // Branch
            if (branches && Math.random() > 0.6) {
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + (Math.random() - 0.5) * 40, y + 20);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x, y);
            }
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
    };

    // Draw lightning bolts
    drawBolt(50, 0, 80, 90, true);
    drawBolt(w - 60, 0, w - 90, 85, true);
    drawBolt(100, h - 85, 130, h, true);
    drawBolt(w - 120, h - 85, w - 100, h, true);

    // Electric border
    ctx.strokeStyle = electricBlue;
    ctx.lineWidth = 2;
    ctx.shadowColor = electricBlue;
    ctx.shadowBlur = 10;
    ctx.strokeRect(5, 88, w - 10, 2);
    ctx.strokeRect(5, h - 87, w - 10, 2);
    ctx.shadowBlur = 0;

    // HALCYON with electric effect
    ctx.textAlign = 'center';
    ctx.font = 'bold 42px sans-serif';

    ctx.shadowColor = electricBlue;
    ctx.shadowBlur = 25;
    ctx.fillStyle = electricBlue;
    ctx.fillText('HALCYON', w/2, 55);

    ctx.shadowBlur = 10;
    ctx.fillStyle = white;
    ctx.fillText('HALCYON', w/2, 55);
    ctx.shadowBlur = 0;

    // Voltage indicator
    ctx.font = '10px monospace';
    ctx.fillStyle = electricBlue;
    ctx.fillText('Subdomain Registry', w/2, 78);

    // Domain
    ctx.font = 'bold 30px sans-serif';
    ctx.shadowColor = electricBlue;
    ctx.shadowBlur = 20;
    ctx.fillStyle = electricBlue;
    ctx.fillText(domain, w/2, h - 35);
    ctx.shadowBlur = 8;
    ctx.fillStyle = white;
    ctx.fillText(domain, w/2, h - 35);
    ctx.shadowBlur = 0;

    // Power indicator
    ctx.font = '10px monospace';
    ctx.fillStyle = '#00FF00';
    ctx.fillText('POWER: ████████████ 100%', w/2, h - 60);
}

// ========== DIAMOND/CRYSTALLINE STYLE ==========
function applyDiamondWatermark(ctx, w, h, domain) {
    // Subtle sparkle background
    for (let i = 0; i < 30; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const size = 1 + Math.random() * 2;

        ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + Math.random() * 0.4})`;
        // 4-point star
        ctx.beginPath();
        ctx.moveTo(x, y - size * 2);
        ctx.lineTo(x + size/2, y);
        ctx.lineTo(x, y + size * 2);
        ctx.lineTo(x - size/2, y);
        ctx.closePath();
        ctx.fill();
    }

    // Crystal top bar
    ctx.fillStyle = 'rgba(200, 220, 255, 0.15)';
    ctx.fillRect(0, 0, w, 85);

    // Diamond facet effect
    const diamondGrad = ctx.createLinearGradient(0, 0, w, 85);
    diamondGrad.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
    diamondGrad.addColorStop(0.3, 'rgba(200, 230, 255, 0.2)');
    diamondGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
    diamondGrad.addColorStop(0.7, 'rgba(200, 230, 255, 0.2)');
    diamondGrad.addColorStop(1, 'rgba(255, 255, 255, 0.1)');
    ctx.fillStyle = diamondGrad;
    ctx.fillRect(0, 0, w, 85);

    // Crystal border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 83, w, 2);

    // Bottom bar
    ctx.fillStyle = 'rgba(200, 220, 255, 0.15)';
    ctx.fillRect(0, h - 75, w, 75);
    ctx.fillStyle = diamondGrad;
    ctx.fillRect(0, h - 75, w, 75);
    ctx.strokeRect(0, h - 75, w, 2);

    // Diamond icon
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.moveTo(w/2, 8);
    ctx.lineTo(w/2 + 15, 20);
    ctx.lineTo(w/2, 35);
    ctx.lineTo(w/2 - 15, 20);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(150, 200, 255, 0.8)';
    ctx.stroke();

    // HALCYON in diamond/crystal text
    ctx.textAlign = 'center';
    ctx.font = 'bold 38px sans-serif';

    const crystalText = ctx.createLinearGradient(w/2 - 100, 40, w/2 + 100, 70);
    crystalText.addColorStop(0, '#E0E8FF');
    crystalText.addColorStop(0.3, '#FFFFFF');
    crystalText.addColorStop(0.5, '#C0D8FF');
    crystalText.addColorStop(0.7, '#FFFFFF');
    crystalText.addColorStop(1, '#E0E8FF');

    ctx.shadowColor = 'rgba(150, 200, 255, 0.8)';
    ctx.shadowBlur = 15;
    ctx.fillStyle = crystalText;
    ctx.fillText('HALCYON', w/2, 65);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText('Subdomain Registry', w/2, 80);

    // Domain
    ctx.font = 'bold 28px sans-serif';
    ctx.shadowColor = 'rgba(150, 200, 255, 0.8)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = crystalText;
    ctx.fillText(domain, w/2, h - 32);
    ctx.shadowBlur = 0;

    // Sparkle accents
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('✧', w/2 - 140, h - 35);
    ctx.fillText('✧', w/2 + 140, h - 35);
}

// ========== MILITARY/DIGI CAMO STYLE ==========
function applyMilitaryWatermark(ctx, w, h, domain) {
    // MARPAT woodland colors - close-up view with larger pixels
    const woodland = ['#4B5320', '#3D4125', '#2D3319', '#5C6B3D', '#1C2213', '#6B7B4B', '#8B8B6B'];
    const desert = ['#C4A76C', '#A68B5B', '#8B7355', '#D4C4A8'];
    const black = '#1a1a1a';
    const tan = '#C4A76C';

    // Close-up MARPAT pattern with LARGER pixels (18px instead of 6px)
    const drawMarpatCloseup = (startY, height, colors) => {
        const pixelSize = 18;  // Much larger for close-up view
        // First pass - base color blocks
        for (let x = 0; x < w; x += pixelSize) {
            for (let y = startY; y < startY + height; y += pixelSize) {
                ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
                ctx.fillRect(x, y, pixelSize, pixelSize);
            }
        }
        // Second pass - scattered smaller pixels for detail
        for (let i = 0; i < 150; i++) {
            const x = Math.random() * w;
            const y = startY + Math.random() * height;
            const size = 6 + Math.random() * 12;
            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            ctx.fillRect(x, y, size, size);
        }
    };

    // Top MARPAT bar - woodland
    drawMarpatCloseup(0, 90, woodland);
    // Bottom MARPAT bar - desert tan mix
    drawMarpatCloseup(h - 90, 90, [...woodland.slice(0, 4), ...desert]);

    // Military stencil border - black tape effect
    ctx.fillStyle = black;
    ctx.fillRect(0, 88, w, 4);
    ctx.fillRect(0, h - 92, w, 4);

    // Hazard stripes (diagonal yellow/black)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 86, w, 6);
    ctx.clip();
    for (let x = -20; x < w + 20; x += 20) {
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.moveTo(x, 86);
        ctx.lineTo(x + 10, 86);
        ctx.lineTo(x + 20, 92);
        ctx.lineTo(x + 10, 92);
        ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, h - 94, w, 6);
    ctx.clip();
    for (let x = -20; x < w + 20; x += 20) {
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.moveTo(x, h - 94);
        ctx.lineTo(x + 10, h - 94);
        ctx.lineTo(x + 20, h - 88);
        ctx.lineTo(x + 10, h - 88);
        ctx.fill();
    }
    ctx.restore();

    // HALCYON stencil text - spray paint style
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px sans-serif';
    // Stencil shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillText('HALCYON', w/2 + 3, 55);
    // Main text in tan
    ctx.fillStyle = tan;
    ctx.fillText('HALCYON', w/2, 52);

    // Unit markings in corners
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = black;
    ctx.fillText('UNIT: HLC-' + Math.floor(Math.random() * 9000 + 1000), 12, 78);
    ctx.textAlign = 'right';
    ctx.fillText('CLASS: ALPHA-1', w - 12, 78);

    // Classification stamp
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#8B0000';
    ctx.fillRect(w/2 - 55, 62, 110, 16);
    ctx.fillStyle = '#FFD700';
    ctx.fillText('★ TOP SECRET ★', w/2, 74);

    // Domain stencil
    ctx.font = 'bold 32px sans-serif';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillText(domain, w/2 + 2, h - 35);
    ctx.fillStyle = tan;
    ctx.fillText(domain, w/2, h - 38);

    // Dog tags
    ctx.fillStyle = '#707070';
    ctx.beginPath();
    ctx.roundRect(w/2 - 45, h - 75, 90, 28, 4);
    ctx.fill();
    ctx.fillStyle = '#505050';
    ctx.beginPath();
    ctx.roundRect(w/2 - 42, h - 72, 84, 22, 3);
    ctx.fill();
    ctx.fillStyle = '#909090';
    ctx.font = 'bold 9px monospace';
    ctx.fillText('Subdomain Registry', w/2, h - 58);

    // Corner patches
    ctx.fillStyle = '#4B5320';
    ctx.fillRect(8, 8, 45, 30);
    ctx.strokeStyle = tan;
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, 45, 30);
    ctx.fillStyle = tan;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('USMC', 30, 28);

    ctx.fillStyle = '#4B5320';
    ctx.fillRect(w - 53, 8, 45, 30);
    ctx.strokeRect(w - 53, 8, 45, 30);
    ctx.fillStyle = tan;
    ctx.fillText('REG', w - 30, 28);
}

// ========== ARCADE/PIXEL STYLE ==========
function applyArcadeWatermark(ctx, w, h, domain) {
    const pixelSize = 4;

    // Pixelated rainbow border at top
    const rainbowColors = ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#8B00FF'];
    for (let i = 0; i < rainbowColors.length; i++) {
        ctx.fillStyle = rainbowColors[i];
        ctx.fillRect(0, i * pixelSize, w, pixelSize);
        ctx.fillRect(0, h - (i + 1) * pixelSize, w, pixelSize);
    }

    // Dark arcade cabinet background
    ctx.fillStyle = 'rgba(0, 0, 20, 0.9)';
    ctx.fillRect(0, 24, w, 65);
    ctx.fillRect(0, h - 90, w, 66);

    // Scanlines
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    for (let y = 24; y < 89; y += 3) {
        ctx.fillRect(0, y, w, 1);
    }
    for (let y = h - 90; y < h - 24; y += 3) {
        ctx.fillRect(0, y, w, 1);
    }

    // Pixel art stars
    ctx.fillStyle = '#FFFF00';
    const starPositions = [[30, 45], [w - 40, 50], [80, 70], [w - 90, 40]];
    for (const [sx, sy] of starPositions) {
        ctx.fillRect(sx, sy, pixelSize, pixelSize);
        ctx.fillRect(sx - pixelSize, sy, pixelSize, pixelSize);
        ctx.fillRect(sx + pixelSize, sy, pixelSize, pixelSize);
        ctx.fillRect(sx, sy - pixelSize, pixelSize, pixelSize);
        ctx.fillRect(sx, sy + pixelSize, pixelSize, pixelSize);
    }

    // HALCYON in pixel/arcade font style
    ctx.textAlign = 'center';
    ctx.font = 'bold 38px monospace';

    // Shadow
    ctx.fillStyle = '#000066';
    ctx.fillText('HALCYON', w/2 + 3, 63);

    // Main text with gradient
    const arcadeGrad = ctx.createLinearGradient(w/2 - 100, 35, w/2 + 100, 65);
    arcadeGrad.addColorStop(0, '#FF0000');
    arcadeGrad.addColorStop(0.2, '#FFFF00');
    arcadeGrad.addColorStop(0.4, '#00FF00');
    arcadeGrad.addColorStop(0.6, '#00FFFF');
    arcadeGrad.addColorStop(0.8, '#0000FF');
    arcadeGrad.addColorStop(1, '#FF00FF');
    ctx.fillStyle = arcadeGrad;
    ctx.fillText('HALCYON', w/2, 60);

    // INSERT COIN text
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#FFFF00';
    ctx.fillText('★ INSERT DOMAIN ★', w/2, 80);

    // High score style display
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FF0000';
    ctx.fillText('1UP', 30, 40);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('999999', 30, 52);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#00FFFF';
    ctx.fillText('HI-SCORE', w - 30, 40);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('9999999', w - 30, 52);

    // Domain in arcade style
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px monospace';
    ctx.fillStyle = '#000066';
    ctx.fillText(domain, w/2 + 2, h - 42);
    ctx.fillStyle = '#00FF00';
    ctx.fillText(domain, w/2, h - 44);

    // GAME OVER / REGISTERED
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#FF00FF';
    ctx.fillText('◄ REGISTERED ►', w/2, h - 65);

    // Lives/hearts
    ctx.fillStyle = '#FF0000';
    ctx.font = '14px sans-serif';
    ctx.fillText('❤ ❤ ❤', w/2, h - 28);
}

// ========== WANTED/WESTERN STYLE ==========
function applyWesternWatermark(ctx, w, h, domain) {
    const parchment = '#D4B896';
    const darkBrown = '#3D2314';
    const rust = '#8B4513';

    // Aged parchment background bars
    ctx.fillStyle = parchment;
    ctx.fillRect(0, 0, w, 90);
    ctx.fillRect(0, h - 85, w, 85);

    // Weathered edges
    ctx.fillStyle = 'rgba(139, 69, 19, 0.3)';
    for (let i = 0; i < 50; i++) {
        ctx.fillRect(Math.random() * w, Math.random() * 90, 3 + Math.random() * 8, 2);
        ctx.fillRect(Math.random() * w, h - 85 + Math.random() * 85, 3 + Math.random() * 8, 2);
    }

    // Burnt edges effect
    ctx.fillStyle = darkBrown;
    ctx.fillRect(0, 88, w, 3);
    ctx.fillRect(0, h - 85, w, 3);

    // WANTED style header
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px serif';
    ctx.fillStyle = darkBrown;
    ctx.fillText('★ REGISTERED ★', w/2, 22);

    // HALCYON in Western font style
    ctx.font = 'bold 48px serif';
    ctx.fillStyle = darkBrown;
    ctx.fillText('HALCYON', w/2, 62);

    // Decorative line
    ctx.strokeStyle = darkBrown;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w/2 - 100, 72);
    ctx.lineTo(w/2 - 40, 72);
    ctx.moveTo(w/2 + 40, 72);
    ctx.lineTo(w/2 + 100, 72);
    ctx.stroke();

    // Stars
    ctx.font = '12px serif';
    ctx.fillText('✦', w/2 - 30, 75);
    ctx.fillText('✦', w/2 + 30, 75);

    // REWARD text
    ctx.font = 'bold 10px serif';
    ctx.fillText('Subdomain Registry', w/2, 84);

    // Domain at bottom
    ctx.font = 'bold 32px serif';
    ctx.fillStyle = darkBrown;
    ctx.fillText(domain, w/2, h - 40);

    // Wanted poster decorations
    ctx.font = '10px serif';
    ctx.fillText('DEAD OR ALIVE', w/2, h - 65);

    // Corner decorations
    ctx.strokeStyle = rust;
    ctx.lineWidth = 2;
    // Top corners
    ctx.beginPath();
    ctx.moveTo(10, 25);
    ctx.lineTo(10, 10);
    ctx.lineTo(25, 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w - 10, 25);
    ctx.lineTo(w - 10, 10);
    ctx.lineTo(w - 25, 10);
    ctx.stroke();
}

// ========== NOIR/FILM STYLE ==========
function applyNoirWatermark(ctx, w, h, domain) {
    // Grayscale gradient top
    const topGrad = ctx.createLinearGradient(0, 0, 0, 90);
    topGrad.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
    topGrad.addColorStop(1, 'rgba(40, 40, 40, 0.9)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, 90);

    // Bottom bar
    const bottomGrad = ctx.createLinearGradient(0, h - 85, 0, h);
    bottomGrad.addColorStop(0, 'rgba(40, 40, 40, 0.9)');
    bottomGrad.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, h - 85, w, 85);

    // Film grain
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    for (let i = 0; i < 200; i++) {
        ctx.fillRect(Math.random() * w, Math.random() * 90, 1, 1);
        ctx.fillRect(Math.random() * w, h - 85 + Math.random() * 85, 1, 1);
    }

    // Film strip holes
    ctx.fillStyle = '#000000';
    for (let x = 20; x < w; x += 50) {
        ctx.fillRect(x, 5, 15, 10);
        ctx.fillRect(x, h - 15, 15, 10);
    }

    // Spotlight effect
    const spotlight = ctx.createRadialGradient(w/2, 50, 0, w/2, 50, 150);
    spotlight.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
    spotlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = spotlight;
    ctx.fillRect(0, 0, w, 90);

    // HALCYON in classic noir
    ctx.textAlign = 'center';
    ctx.font = 'bold italic 46px serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = '#FFFFFF';
    ctx.shadowBlur = 5;
    ctx.fillText('HALCYON', w/2, 55);
    ctx.shadowBlur = 0;

    // Tagline
    ctx.font = 'italic 11px serif';
    ctx.fillStyle = '#AAAAAA';
    ctx.fillText('A  S U B D O M A I N  R E G I S T R Y', w/2, 75);

    // Domain
    ctx.font = 'bold 30px serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(domain, w/2, h - 38);

    // Noir tagline
    ctx.font = 'italic 10px serif';
    ctx.fillStyle = '#888888';
    ctx.fillText('"In a world of domains..."', w/2, h - 60);
}

// ========== TRIBAL/GEOMETRIC STYLE ==========
function applyTribalWatermark(ctx, w, h, domain) {
    const earthTone = '#8B4513';
    const cream = '#FFF8DC';
    const black = '#1a1a1a';

    // Earth tone bars
    ctx.fillStyle = earthTone;
    ctx.fillRect(0, 0, w, 85);
    ctx.fillRect(0, h - 80, w, 80);

    // Geometric patterns - triangles
    ctx.fillStyle = black;
    for (let x = 0; x < w; x += 30) {
        // Top row
        ctx.beginPath();
        ctx.moveTo(x, 85);
        ctx.lineTo(x + 15, 70);
        ctx.lineTo(x + 30, 85);
        ctx.fill();

        // Bottom row (inverted)
        ctx.beginPath();
        ctx.moveTo(x, h - 80);
        ctx.lineTo(x + 15, h - 65);
        ctx.lineTo(x + 30, h - 80);
        ctx.fill();
    }

    // Zigzag lines
    ctx.strokeStyle = cream;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < w; x += 20) {
        ctx.lineTo(x, x % 40 === 0 ? 15 : 25);
    }
    ctx.stroke();

    ctx.beginPath();
    for (let x = 0; x < w; x += 20) {
        ctx.lineTo(x, h - (x % 40 === 0 ? 15 : 25));
    }
    ctx.stroke();

    // HALCYON in bold tribal style
    ctx.textAlign = 'center';
    ctx.font = 'bold 42px sans-serif';
    ctx.fillStyle = cream;
    ctx.fillText('HALCYON', w/2, 55);

    // Decorative dots
    ctx.fillStyle = cream;
    for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(w/2 - 80 + i * 40, 72, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // Domain
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = cream;
    ctx.fillText(domain, w/2, h - 35);

    // Tribal arrows
    ctx.strokeStyle = cream;
    ctx.lineWidth = 2;
    // Left arrow
    ctx.beginPath();
    ctx.moveTo(50, h - 40);
    ctx.lineTo(30, h - 40);
    ctx.lineTo(40, h - 50);
    ctx.moveTo(30, h - 40);
    ctx.lineTo(40, h - 30);
    ctx.stroke();
    // Right arrow
    ctx.beginPath();
    ctx.moveTo(w - 50, h - 40);
    ctx.lineTo(w - 30, h - 40);
    ctx.lineTo(w - 40, h - 50);
    ctx.moveTo(w - 30, h - 40);
    ctx.lineTo(w - 40, h - 30);
    ctx.stroke();
}

// ========== STEAMPUNK STYLE (ENHANCED) ==========
function applySteampunkWatermark(ctx, w, h, domain) {
    const brass = '#C9A227';
    const darkBrass = '#8B7355';
    const copper = '#B87333';
    const bronze = '#CD7F32';
    const darkMetal = '#1a1a1a';
    const rust = '#8B4513';

    // Textured dark metal background
    ctx.fillStyle = darkMetal;
    ctx.fillRect(0, 0, w, 95);
    ctx.fillRect(0, h - 90, w, 90);

    // Metal plate texture
    const metalGrad = ctx.createLinearGradient(0, 0, 0, 95);
    metalGrad.addColorStop(0, 'rgba(60, 60, 60, 0.8)');
    metalGrad.addColorStop(0.5, 'rgba(40, 40, 40, 0.9)');
    metalGrad.addColorStop(1, 'rgba(30, 30, 30, 1)');
    ctx.fillStyle = metalGrad;
    ctx.fillRect(0, 0, w, 95);
    ctx.fillRect(0, h - 90, w, 90);

    // Improved gear function with more detail
    const drawGear = (cx, cy, outerR, innerR, teeth, color, highlight) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let i = 0; i < teeth * 2; i++) {
            const angle = (i * Math.PI) / teeth;
            const r = i % 2 === 0 ? outerR : outerR - 6;
            ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.fill();

        // Inner circle
        ctx.fillStyle = darkMetal;
        ctx.beginPath();
        ctx.arc(cx, cy, innerR + 2, 0, Math.PI * 2);
        ctx.fill();

        // Highlight ring
        ctx.strokeStyle = highlight;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
        ctx.stroke();

        // Center hole
        ctx.fillStyle = darkMetal;
        ctx.beginPath();
        ctx.arc(cx, cy, innerR - 3, 0, Math.PI * 2);
        ctx.fill();

        // Spokes
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
            const angle = (i * Math.PI) / 2;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * 3, cy + Math.sin(angle) * 3);
            ctx.lineTo(cx + Math.cos(angle) * (innerR - 4), cy + Math.sin(angle) * (innerR - 4));
            ctx.stroke();
        }
    };

    // Gears at different positions
    drawGear(55, 50, 38, 14, 14, brass, '#FFD700');
    drawGear(95, 35, 22, 8, 10, copper, '#DDA573');
    drawGear(w - 60, 48, 32, 12, 12, bronze, '#E8A24E');
    drawGear(w - 95, 70, 20, 7, 8, brass, '#FFD700');

    // Pipes
    ctx.strokeStyle = copper;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(130, 30);
    ctx.lineTo(180, 30);
    ctx.lineTo(180, 70);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(w - 130, 25);
    ctx.lineTo(w - 160, 25);
    ctx.lineTo(w - 160, 60);
    ctx.stroke();

    // Pipe joints
    ctx.fillStyle = darkBrass;
    ctx.beginPath();
    ctx.arc(180, 30, 6, 0, Math.PI * 2);
    ctx.arc(180, 70, 6, 0, Math.PI * 2);
    ctx.fill();

    // Rivets with highlight
    for (let x = 15; x < w; x += 35) {
        // Shadow
        ctx.fillStyle = '#111111';
        ctx.beginPath();
        ctx.arc(x + 1, 92, 4, 0, Math.PI * 2);
        ctx.fill();
        // Rivet
        ctx.fillStyle = brass;
        ctx.beginPath();
        ctx.arc(x, 91, 4, 0, Math.PI * 2);
        ctx.fill();
        // Highlight
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(x - 1, 90, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Bottom rivets
        ctx.fillStyle = '#111111';
        ctx.beginPath();
        ctx.arc(x + 1, h - 87, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = brass;
        ctx.beginPath();
        ctx.arc(x, h - 88, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(x - 1, h - 89, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // HALCYON engraved brass plate
    const plateW = 240;
    const plateH = 50;
    const plateX = w/2 - plateW/2;
    const plateY = 18;

    // Plate background
    const plateGrad = ctx.createLinearGradient(plateX, plateY, plateX, plateY + plateH);
    plateGrad.addColorStop(0, '#D4AF37');
    plateGrad.addColorStop(0.3, '#FFD700');
    plateGrad.addColorStop(0.5, '#FFF8DC');
    plateGrad.addColorStop(0.7, '#FFD700');
    plateGrad.addColorStop(1, '#B8860B');
    ctx.fillStyle = plateGrad;
    ctx.fillRect(plateX, plateY, plateW, plateH);

    // Plate border
    ctx.strokeStyle = darkBrass;
    ctx.lineWidth = 3;
    ctx.strokeRect(plateX, plateY, plateW, plateH);

    // HALCYON text
    ctx.textAlign = 'center';
    ctx.font = 'bold 36px serif';
    ctx.fillStyle = '#3D2B1F';
    ctx.fillText('HALCYON', w/2, 52);

    // Subtitle
    ctx.font = 'bold 10px serif';
    ctx.fillStyle = darkBrass;
    ctx.fillText('Subdomain Registry', w/2, 82);

    // Bottom gears
    drawGear(70, h - 45, 30, 11, 12, brass, '#FFD700');
    drawGear(w - 80, h - 50, 35, 13, 14, copper, '#DDA573');
    drawGear(w - 45, h - 30, 18, 6, 8, bronze, '#E8A24E');

    // Domain brass plate
    const domPlateW = 320;
    const domPlateH = 45;
    const domPlateX = w/2 - domPlateW/2;
    const domPlateY = h - 75;

    ctx.fillStyle = plateGrad;
    ctx.fillRect(domPlateX, domPlateY, domPlateW, domPlateH);
    ctx.strokeStyle = darkBrass;
    ctx.lineWidth = 3;
    ctx.strokeRect(domPlateX, domPlateY, domPlateW, domPlateH);

    ctx.font = 'bold 26px serif';
    ctx.fillStyle = '#3D2B1F';
    ctx.fillText(domain, w/2, h - 45);
}

// ========== OCEAN/WAVE STYLE (ENHANCED) ==========
function applyOceanWatermark(ctx, w, h, domain) {
    const deepBlue = '#001a33';
    const midBlue = '#003366';
    const seaBlue = '#0077be';
    const aqua = '#00CED1';
    const foam = '#FFFFFF';

    // Ocean gradient top - deeper colors
    const topGrad = ctx.createLinearGradient(0, 0, 0, 95);
    topGrad.addColorStop(0, deepBlue);
    topGrad.addColorStop(0.5, midBlue);
    topGrad.addColorStop(1, seaBlue);
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, 95);

    // Multiple wave layers at bottom of top bar (back to front)
    // Back wave (darker)
    ctx.fillStyle = 'rgba(0, 50, 100, 0.6)';
    ctx.beginPath();
    ctx.moveTo(0, 95);
    for (let x = 0; x <= w; x += 60) {
        ctx.quadraticCurveTo(x + 15, 80, x + 30, 90);
        ctx.quadraticCurveTo(x + 45, 100, x + 60, 90);
    }
    ctx.lineTo(w, 95);
    ctx.lineTo(0, 95);
    ctx.closePath();
    ctx.fill();

    // Front wave with foam
    ctx.fillStyle = aqua;
    ctx.beginPath();
    ctx.moveTo(0, 95);
    for (let x = 0; x <= w; x += 50) {
        ctx.quadraticCurveTo(x + 12, 82, x + 25, 92);
        ctx.quadraticCurveTo(x + 38, 102, x + 50, 92);
    }
    ctx.lineTo(w, 95);
    ctx.lineTo(0, 95);
    ctx.closePath();
    ctx.fill();

    // Foam caps
    ctx.fillStyle = foam;
    for (let x = 10; x < w; x += 50) {
        ctx.beginPath();
        ctx.ellipse(x + 12, 85, 8, 3, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // Bottom bar
    const bottomGrad = ctx.createLinearGradient(0, h - 95, 0, h);
    bottomGrad.addColorStop(0, seaBlue);
    bottomGrad.addColorStop(0.5, midBlue);
    bottomGrad.addColorStop(1, deepBlue);
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, h - 95, w, 95);

    // Waves at top of bottom bar
    ctx.fillStyle = 'rgba(0, 50, 100, 0.6)';
    ctx.beginPath();
    ctx.moveTo(0, h - 95);
    for (let x = 0; x <= w; x += 60) {
        ctx.quadraticCurveTo(x + 15, h - 80, x + 30, h - 90);
        ctx.quadraticCurveTo(x + 45, h - 100, x + 60, h - 90);
    }
    ctx.lineTo(w, h - 95);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = aqua;
    ctx.beginPath();
    ctx.moveTo(0, h - 95);
    for (let x = 0; x <= w; x += 50) {
        ctx.quadraticCurveTo(x + 12, h - 82, x + 25, h - 92);
        ctx.quadraticCurveTo(x + 38, h - 102, x + 50, h - 92);
    }
    ctx.lineTo(w, h - 95);
    ctx.closePath();
    ctx.fill();

    // Foam on bottom waves
    ctx.fillStyle = foam;
    for (let x = 25; x < w; x += 50) {
        ctx.beginPath();
        ctx.ellipse(x, h - 85, 8, 3, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // Bubbles with glow
    for (let i = 0; i < 20; i++) {
        const x = Math.random() * w;
        const y = Math.random() * 60 + 15;
        const size = 2 + Math.random() * 5;
        ctx.fillStyle = `rgba(255, 255, 255, ${0.2 + Math.random() * 0.3})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        // Highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(x - size/3, y - size/3, size/3, 0, Math.PI * 2);
        ctx.fill();
    }

    // HALCYON with water effect
    ctx.textAlign = 'center';
    ctx.font = 'bold 46px sans-serif';

    ctx.shadowColor = deepBlue;
    ctx.shadowBlur = 8;
    ctx.fillStyle = foam;
    ctx.fillText('HALCYON', w/2, 55);
    ctx.shadowBlur = 0;

    // Subtitle with wave
    ctx.font = '12px sans-serif';
    ctx.fillStyle = aqua;
    ctx.fillText('Subdomain Registry', w/2, 75);

    // Domain
    ctx.font = 'bold 32px sans-serif';
    ctx.shadowColor = deepBlue;
    ctx.shadowBlur = 5;
    ctx.fillStyle = foam;
    ctx.fillText(domain, w/2, h - 40);
    ctx.shadowBlur = 0;

    // Sea creatures silhouettes
    ctx.fillStyle = 'rgba(0, 206, 209, 0.4)';
    // Whale tail
    ctx.beginPath();
    ctx.moveTo(50, h - 55);
    ctx.quadraticCurveTo(40, h - 70, 30, h - 55);
    ctx.quadraticCurveTo(50, h - 60, 70, h - 55);
    ctx.fill();

    // Small fish
    ctx.beginPath();
    ctx.ellipse(w - 60, h - 55, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w - 72, h - 55);
    ctx.lineTo(w - 80, h - 48);
    ctx.lineTo(w - 80, h - 62);
    ctx.closePath();
    ctx.fill();
}

// ========== ZEN/JAPANESE MINIMALIST STYLE ==========
function applyZenWatermark(ctx, w, h, domain) {
    const inkBlack = '#1a1a1a';
    const rice = '#FAF9F6';
    const red = '#BC002D';

    // Rice paper background bars
    ctx.fillStyle = rice;
    ctx.fillRect(0, 0, w, 85);
    ctx.fillRect(0, h - 80, w, 80);

    // Subtle texture
    ctx.fillStyle = 'rgba(0, 0, 0, 0.02)';
    for (let i = 0; i < 100; i++) {
        ctx.fillRect(Math.random() * w, Math.random() * 85, 1 + Math.random() * 3, 1);
        ctx.fillRect(Math.random() * w, h - 80 + Math.random() * 80, 1 + Math.random() * 3, 1);
    }

    // Ink border
    ctx.fillStyle = inkBlack;
    ctx.fillRect(0, 83, w, 2);
    ctx.fillRect(0, h - 80, w, 2);

    // Enso circle (zen symbol) - imperfect circle
    ctx.strokeStyle = inkBlack;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(w/2, 45, 28, 0.2, Math.PI * 1.9);
    ctx.stroke();

    // Red seal (hanko)
    ctx.fillStyle = red;
    ctx.fillRect(w - 60, 20, 40, 40);
    ctx.fillStyle = rice;
    ctx.font = 'bold 20px serif';
    ctx.textAlign = 'center';
    ctx.fillText('登', w - 40, 48);

    // HALCYON in brush stroke style
    ctx.fillStyle = inkBlack;
    ctx.font = '32px serif';
    ctx.fillText('H A L C Y O N', w/2, 50);

    // Subtitle
    ctx.font = '11px serif';
    ctx.fillStyle = '#666666';
    ctx.fillText('Subdomain Registry', w/2, 72);

    // Bamboo decoration left
    ctx.strokeStyle = '#2F4F2F';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(30, 10);
    ctx.lineTo(30, 80);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, 30);
    ctx.lineTo(20, 20);
    ctx.moveTo(30, 50);
    ctx.lineTo(40, 40);
    ctx.stroke();

    // Domain - minimalist
    ctx.font = '28px serif';
    ctx.fillStyle = inkBlack;
    ctx.fillText(domain, w/2, h - 38);

    // Small red accent
    ctx.fillStyle = red;
    ctx.beginPath();
    ctx.arc(w/2 - 100, h - 40, 4, 0, Math.PI * 2);
    ctx.fill();

    // Mountain silhouette
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.beginPath();
    ctx.moveTo(0, h - 60);
    ctx.lineTo(60, h - 80);
    ctx.lineTo(100, h - 65);
    ctx.lineTo(150, h - 80);
    ctx.lineTo(200, h - 60);
    ctx.lineTo(0, h - 60);
    ctx.fill();
}

// ========== CARBON FIBER/RACING STYLE ==========
function applyCarbonWatermark(ctx, w, h, domain) {
    const carbonGray = '#1a1a1a';
    const accentRed = '#FF0000';
    const silver = '#C0C0C0';

    // Carbon fiber pattern background
    ctx.fillStyle = carbonGray;
    ctx.fillRect(0, 0, w, 90);
    ctx.fillRect(0, h - 85, w, 85);

    // Carbon weave pattern
    for (let x = 0; x < w; x += 8) {
        for (let y = 0; y < 90; y += 8) {
            ctx.fillStyle = (x + y) % 16 === 0 ? '#222222' : '#1a1a1a';
            ctx.fillRect(x, y, 4, 4);
        }
    }
    for (let x = 0; x < w; x += 8) {
        for (let y = h - 85; y < h; y += 8) {
            ctx.fillStyle = (x + y) % 16 === 0 ? '#222222' : '#1a1a1a';
            ctx.fillRect(x, y, 4, 4);
        }
    }

    // Racing stripes
    ctx.fillStyle = accentRed;
    ctx.fillRect(0, 85, w, 5);
    ctx.fillRect(0, h - 90, w, 5);

    // Metallic accent
    ctx.fillStyle = silver;
    ctx.fillRect(0, 80, w, 2);
    ctx.fillRect(0, h - 82, w, 2);

    // HALCYON in racing style
    ctx.textAlign = 'center';
    ctx.font = 'bold italic 44px sans-serif';

    // Shadow
    ctx.fillStyle = '#000000';
    ctx.fillText('HALCYON', w/2 + 2, 57);

    // Silver gradient
    const silverGrad = ctx.createLinearGradient(w/2 - 100, 20, w/2 + 100, 60);
    silverGrad.addColorStop(0, '#808080');
    silverGrad.addColorStop(0.3, '#FFFFFF');
    silverGrad.addColorStop(0.5, '#C0C0C0');
    silverGrad.addColorStop(0.7, '#FFFFFF');
    silverGrad.addColorStop(1, '#808080');
    ctx.fillStyle = silverGrad;
    ctx.fillText('HALCYON', w/2, 55);

    // Racing number style
    ctx.fillStyle = accentRed;
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('01', 40, 55);

    // Speed lines
    ctx.strokeStyle = silver;
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(w - 100 + i * 15, 30 + i * 5);
        ctx.lineTo(w - 20, 30 + i * 5);
        ctx.stroke();
    }

    // Subtitle
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = silver;
    ctx.fillText('Subdomain Registry', w/2, 75);

    // Domain
    ctx.font = 'bold italic 30px sans-serif';
    ctx.fillStyle = '#000000';
    ctx.fillText(domain, w/2 + 2, h - 38);
    ctx.fillStyle = silverGrad;
    ctx.fillText(domain, w/2, h - 40);

    // Checkered flag corners
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            if ((i + j) % 2 === 0) {
                ctx.fillRect(10 + i * 8, h - 75 + j * 8, 8, 8);
                ctx.fillRect(w - 42 + i * 8, h - 75 + j * 8, 8, 8);
            }
        }
    }
}

// ========== GOTHIC/DARK CATHEDRAL STYLE ==========
function applyGothicWatermark(ctx, w, h, domain) {
    const black = '#0a0a0a';
    const darkPurple = '#1a0a1a';
    const deepPurple = '#2a0a2a';
    const silver = '#C0C0C0';
    const bloodRed = '#8B0000';
    const crimson = '#DC143C';

    // Dark gradient background with vignette
    const topGrad = ctx.createLinearGradient(0, 0, 0, 100);
    topGrad.addColorStop(0, black);
    topGrad.addColorStop(0.5, darkPurple);
    topGrad.addColorStop(1, deepPurple);
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, 100);

    const bottomGrad = ctx.createLinearGradient(0, h - 95, 0, h);
    bottomGrad.addColorStop(0, deepPurple);
    bottomGrad.addColorStop(0.5, darkPurple);
    bottomGrad.addColorStop(1, black);
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, h - 95, w, 95);

    // Gothic cathedral window arches (more ornate)
    ctx.strokeStyle = silver;
    ctx.lineWidth = 2;

    // Left pointed arch with tracery
    ctx.beginPath();
    ctx.moveTo(15, 100);
    ctx.lineTo(15, 45);
    ctx.quadraticCurveTo(15, 8, 65, 8);
    ctx.quadraticCurveTo(115, 8, 115, 45);
    ctx.lineTo(115, 100);
    ctx.stroke();
    // Inner arch detail
    ctx.beginPath();
    ctx.moveTo(25, 100);
    ctx.lineTo(25, 50);
    ctx.quadraticCurveTo(25, 20, 65, 20);
    ctx.quadraticCurveTo(105, 20, 105, 50);
    ctx.lineTo(105, 100);
    ctx.stroke();

    // Right pointed arch with tracery
    ctx.beginPath();
    ctx.moveTo(w - 15, 100);
    ctx.lineTo(w - 15, 45);
    ctx.quadraticCurveTo(w - 15, 8, w - 65, 8);
    ctx.quadraticCurveTo(w - 115, 8, w - 115, 45);
    ctx.lineTo(w - 115, 100);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w - 25, 100);
    ctx.lineTo(w - 25, 50);
    ctx.quadraticCurveTo(w - 25, 20, w - 65, 20);
    ctx.quadraticCurveTo(w - 105, 20, w - 105, 50);
    ctx.lineTo(w - 105, 100);
    ctx.stroke();

    // Rose window circles inside arches
    ctx.strokeStyle = crimson;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(65, 50, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(65, 50, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w - 65, 50, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w - 65, 50, 12, 0, Math.PI * 2);
    ctx.stroke();

    // Ornate filigree border
    ctx.fillStyle = silver;
    ctx.fillRect(0, 97, w, 3);
    ctx.fillRect(0, h - 95, w, 3);

    // Decorative crosses pattern along border
    ctx.fillStyle = bloodRed;
    for (let x = 130; x < w - 130; x += 40) {
        ctx.fillRect(x - 1, 94, 2, 6);
        ctx.fillRect(x - 4, 96, 8, 2);
    }
    for (let x = 130; x < w - 130; x += 40) {
        ctx.fillRect(x - 1, h - 97, 2, 6);
        ctx.fillRect(x - 4, h - 95, 8, 2);
    }

    // Dripping blood effect from top
    ctx.fillStyle = bloodRed;
    for (let i = 0; i < 8; i++) {
        const x = 140 + i * 45 + Math.random() * 20;
        const dripLen = 8 + Math.random() * 15;
        ctx.beginPath();
        ctx.moveTo(x - 2, 97);
        ctx.lineTo(x + 2, 97);
        ctx.lineTo(x + 1, 97 + dripLen);
        ctx.quadraticCurveTo(x, 97 + dripLen + 4, x - 1, 97 + dripLen);
        ctx.fill();
    }

    // HALCYON in dramatic gothic style
    ctx.textAlign = 'center';
    ctx.font = 'bold 46px serif';

    // Blood glow effect
    ctx.shadowColor = crimson;
    ctx.shadowBlur = 20;
    ctx.fillStyle = silver;
    ctx.fillText('HALCYON', w/2, 60);
    ctx.shadowBlur = 10;
    ctx.fillText('HALCYON', w/2, 60);
    ctx.shadowBlur = 0;

    // Subtitle with crosses
    ctx.font = '12px serif';
    ctx.fillStyle = '#888888';
    ctx.fillText('Subdomain Registry', w/2, 82);

    // Skulls in corners
    const drawSkull = (cx, cy, size) => {
        ctx.fillStyle = '#404040';
        // Head
        ctx.beginPath();
        ctx.ellipse(cx, cy - size * 0.2, size * 0.8, size, 0, 0, Math.PI * 2);
        ctx.fill();
        // Eye sockets
        ctx.fillStyle = black;
        ctx.beginPath();
        ctx.ellipse(cx - size * 0.3, cy - size * 0.3, size * 0.2, size * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + size * 0.3, cy - size * 0.3, size * 0.2, size * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
        // Nose
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx - size * 0.15, cy + size * 0.2);
        ctx.lineTo(cx + size * 0.15, cy + size * 0.2);
        ctx.fill();
        // Jaw
        ctx.fillStyle = '#404040';
        ctx.fillRect(cx - size * 0.5, cy + size * 0.3, size, size * 0.4);
    };
    drawSkull(65, h - 55, 12);
    drawSkull(w - 65, h - 55, 12);

    // Domain with blood glow
    ctx.font = 'bold 32px serif';
    ctx.shadowColor = crimson;
    ctx.shadowBlur = 15;
    ctx.fillStyle = silver;
    ctx.fillText(domain, w/2, h - 38);
    ctx.shadowBlur = 8;
    ctx.fillText(domain, w/2, h - 38);
    ctx.shadowBlur = 0;

    // Candle flames on sides
    const drawCandle = (x, y) => {
        ctx.fillStyle = '#333333';
        ctx.fillRect(x - 4, y, 8, 20);
        // Flame
        ctx.fillStyle = '#FF6600';
        ctx.beginPath();
        ctx.moveTo(x, y - 12);
        ctx.quadraticCurveTo(x + 6, y - 6, x + 4, y);
        ctx.quadraticCurveTo(x, y - 2, x - 4, y);
        ctx.quadraticCurveTo(x - 6, y - 6, x, y - 12);
        ctx.fill();
        ctx.fillStyle = '#FFCC00';
        ctx.beginPath();
        ctx.ellipse(x, y - 5, 2, 4, 0, 0, Math.PI * 2);
        ctx.fill();
    };
    drawCandle(30, h - 70);
    drawCandle(w - 30, h - 70);

    // Bats flying
    ctx.fillStyle = '#222222';
    const drawBat = (x, y, size) => {
        ctx.beginPath();
        ctx.ellipse(x, y, size, size/2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x - size, y);
        ctx.quadraticCurveTo(x - size * 2.5, y - size * 1.5, x - size * 3, y + size/2);
        ctx.quadraticCurveTo(x - size * 2, y + size/2, x - size, y);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + size, y);
        ctx.quadraticCurveTo(x + size * 2.5, y - size * 1.5, x + size * 3, y + size/2);
        ctx.quadraticCurveTo(x + size * 2, y + size/2, x + size, y);
        ctx.fill();
    };
    drawBat(180, 30, 6);
    drawBat(w - 190, 25, 5);
    drawBat(w/2 - 80, 18, 4);
    drawBat(w/2 + 90, 22, 5);
}

// ========== TRON/NEON GRID STYLE ==========
function applyNeonGridWatermark(ctx, w, h, domain) {
    const neonBlue = '#00D4FF';
    const neonPink = '#FF00FF';
    const darkBg = '#0a0a1a';

    // Dark background
    ctx.fillStyle = darkBg;
    ctx.fillRect(0, 0, w, 95);
    ctx.fillRect(0, h - 90, w, 90);

    // Neon grid on top bar
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 25) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 95);
        ctx.stroke();
    }
    for (let y = 0; y < 95; y += 25) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }

    // Neon grid on bottom bar
    for (let x = 0; x < w; x += 25) {
        ctx.beginPath();
        ctx.moveTo(x, h - 90);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    for (let y = h - 90; y < h; y += 25) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }

    // Neon border lines
    ctx.strokeStyle = neonBlue;
    ctx.lineWidth = 3;
    ctx.shadowColor = neonBlue;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.moveTo(0, 93);
    ctx.lineTo(w, 93);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, h - 90);
    ctx.lineTo(w, h - 90);
    ctx.stroke();

    // Pink accent lines
    ctx.strokeStyle = neonPink;
    ctx.shadowColor = neonPink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 90);
    ctx.lineTo(w * 0.3, 90);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.7, 90);
    ctx.lineTo(w, 90);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Circuit node decorations
    ctx.fillStyle = neonBlue;
    ctx.shadowColor = neonBlue;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(50, 50, 6, 0, Math.PI * 2);
    ctx.arc(w - 50, 45, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // HALCYON in neon
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px sans-serif';
    ctx.shadowColor = neonBlue;
    ctx.shadowBlur = 20;
    ctx.fillStyle = neonBlue;
    ctx.fillText('HALCYON', w/2, 55);
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('HALCYON', w/2, 55);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.font = '10px monospace';
    ctx.fillStyle = neonPink;
    ctx.shadowColor = neonPink;
    ctx.shadowBlur = 5;
    ctx.fillText('Subdomain Registry', w/2, 78);
    ctx.shadowBlur = 0;

    // Domain
    ctx.font = 'bold 30px sans-serif';
    ctx.shadowColor = neonBlue;
    ctx.shadowBlur = 15;
    ctx.fillStyle = neonBlue;
    ctx.fillText(domain, w/2, h - 38);
    ctx.shadowBlur = 5;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(domain, w/2, h - 38);
    ctx.shadowBlur = 0;
}

// ========== SKETCH/HAND-DRAWN STYLE ==========
function applySketchWatermark(ctx, w, h, domain) {
    const pencil = '#2B2B2B';
    const paper = '#FFFEF0';
    const lightPencil = '#888888';

    // Paper background
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, w, 90);
    ctx.fillRect(0, h - 85, w, 85);

    // Paper texture (subtle lines)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.03)';
    ctx.lineWidth = 1;
    for (let y = 0; y < 90; y += 4) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }

    // Sketchy border (multiple imperfect lines)
    ctx.strokeStyle = pencil;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
        const offset = (Math.random() - 0.5) * 2;
        ctx.beginPath();
        ctx.moveTo(0, 88 + offset);
        ctx.lineTo(w, 88 + offset + (Math.random() - 0.5) * 2);
        ctx.stroke();
    }
    for (let i = 0; i < 3; i++) {
        const offset = (Math.random() - 0.5) * 2;
        ctx.beginPath();
        ctx.moveTo(0, h - 85 + offset);
        ctx.lineTo(w, h - 85 + offset + (Math.random() - 0.5) * 2);
        ctx.stroke();
    }

    // Cross-hatch shading in corners
    ctx.strokeStyle = lightPencil;
    ctx.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 4, 0);
        ctx.lineTo(0, i * 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w - i * 4, 0);
        ctx.lineTo(w, i * 4);
        ctx.stroke();
    }

    // HALCYON in sketchy hand-drawn style
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px serif';
    ctx.fillStyle = pencil;

    // Multiple slightly offset lines for sketch effect
    ctx.globalAlpha = 0.3;
    ctx.fillText('HALCYON', w/2 + 1, 52);
    ctx.fillText('HALCYON', w/2 - 1, 54);
    ctx.globalAlpha = 1;
    ctx.fillText('HALCYON', w/2, 53);

    // Underline sketch
    ctx.strokeStyle = pencil;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w/2 - 100, 62);
    ctx.quadraticCurveTo(w/2, 65, w/2 + 100, 62);
    ctx.stroke();

    // Doodles
    ctx.strokeStyle = lightPencil;
    ctx.lineWidth = 1;
    // Star doodle
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const r = i % 2 === 0 ? 12 : 6;
        ctx.lineTo(60 + Math.cos(angle) * r, 50 + Math.sin(angle) * r);
    }
    ctx.closePath();
    ctx.stroke();

    // Arrow doodle
    ctx.beginPath();
    ctx.moveTo(w - 80, 50);
    ctx.lineTo(w - 40, 50);
    ctx.lineTo(w - 50, 40);
    ctx.moveTo(w - 40, 50);
    ctx.lineTo(w - 50, 60);
    ctx.stroke();

    // Subtitle
    ctx.font = 'italic 11px serif';
    ctx.fillStyle = lightPencil;
    ctx.fillText('Subdomain Registry', w/2, 78);

    // Domain
    ctx.font = 'bold 28px serif';
    ctx.fillStyle = pencil;
    ctx.globalAlpha = 0.3;
    ctx.fillText(domain, w/2 + 1, h - 40);
    ctx.globalAlpha = 1;
    ctx.fillText(domain, w/2, h - 42);
}

// ========== CANDY/SWEET STYLE ==========
function applyCandyWatermark(ctx, w, h, domain) {
    const pink = '#FF69B4';
    const mint = '#98FF98';
    const yellow = '#FFFF66';
    const blue = '#87CEEB';
    const purple = '#DDA0DD';

    // Candy stripe background
    const stripeColors = [pink, mint, yellow, blue, purple];
    const stripeWidth = 25;

    for (let x = -50; x < w + 50; x += stripeWidth) {
        ctx.fillStyle = stripeColors[Math.floor(x / stripeWidth) % stripeColors.length];
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, 90);
        ctx.clip();
        ctx.translate(x, 0);
        ctx.rotate(-0.3);
        ctx.fillRect(-20, -20, stripeWidth - 2, 150);
        ctx.restore();
    }

    for (let x = -50; x < w + 50; x += stripeWidth) {
        ctx.fillStyle = stripeColors[Math.floor(x / stripeWidth + 2) % stripeColors.length];
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, h - 85, w, 85);
        ctx.clip();
        ctx.translate(x, h - 85);
        ctx.rotate(0.3);
        ctx.fillRect(-20, -20, stripeWidth - 2, 150);
        ctx.restore();
    }

    // White overlay for softness
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(0, 0, w, 90);
    ctx.fillRect(0, h - 85, w, 85);

    // Bubble decorations
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    for (let i = 0; i < 10; i++) {
        const x = Math.random() * w;
        const y = Math.random() * 70 + 10;
        const r = 5 + Math.random() * 10;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // HALCYON in bubbly style
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px sans-serif';

    // White outline
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 6;
    ctx.strokeText('HALCYON', w/2, 55);

    // Pink fill
    ctx.fillStyle = pink;
    ctx.fillText('HALCYON', w/2, 55);

    // Sparkles
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '16px sans-serif';
    ctx.fillText('✨', w/2 - 110, 40);
    ctx.fillText('✨', w/2 + 110, 50);
    ctx.fillText('⭐', w/2 - 90, 70);

    // Subtitle
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = purple;
    ctx.fillText('Subdomain Registry', w/2, 78);

    // Domain
    ctx.font = 'bold 30px sans-serif';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 5;
    ctx.strokeText(domain, w/2, h - 38);
    ctx.fillStyle = mint;
    ctx.fillText(domain, w/2, h - 38);

    // Candy decorations
    ctx.font = '18px sans-serif';
    ctx.fillText('🍬', 40, h - 45);
    ctx.fillText('🍭', w - 50, h - 50);
    ctx.fillText('🍩', 80, h - 60);
}

// ========== AURORA/NORTHERN LIGHTS STYLE ==========
function applyAuroraWatermark(ctx, w, h, domain) {
    const darkSky = '#0a0a20';

    // Dark sky background
    ctx.fillStyle = darkSky;
    ctx.fillRect(0, 0, w, 95);
    ctx.fillRect(0, h - 90, w, 90);

    // Aurora gradient waves
    const drawAurora = (startY, height, flip) => {
        const colors = [
            'rgba(0, 255, 128, 0.4)',
            'rgba(0, 200, 255, 0.3)',
            'rgba(128, 0, 255, 0.3)',
            'rgba(0, 255, 200, 0.35)'
        ];

        for (let i = 0; i < 4; i++) {
            ctx.fillStyle = colors[i];
            ctx.beginPath();
            ctx.moveTo(0, flip ? startY + height : startY);

            for (let x = 0; x <= w; x += 20) {
                const waveY = Math.sin(x * 0.02 + i) * 15 + (flip ? startY + height - 30 - i * 12 : startY + 30 + i * 12);
                ctx.lineTo(x, waveY);
            }

            ctx.lineTo(w, flip ? startY : startY + height);
            ctx.lineTo(0, flip ? startY : startY + height);
            ctx.closePath();
            ctx.fill();
        }
    };

    drawAurora(0, 95, false);
    drawAurora(h - 90, 90, true);

    // Stars
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 30; i++) {
        const x = Math.random() * w;
        const y = Math.random() * 95;
        const size = Math.random() * 2;
        ctx.globalAlpha = 0.5 + Math.random() * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Glowing border
    ctx.fillStyle = 'rgba(0, 255, 200, 0.6)';
    ctx.fillRect(0, 93, w, 2);
    ctx.fillRect(0, h - 90, w, 2);

    // HALCYON with aurora glow
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px sans-serif';

    ctx.shadowColor = '#00FF80';
    ctx.shadowBlur = 25;
    ctx.fillStyle = '#00FF80';
    ctx.fillText('HALCYON', w/2, 55);

    ctx.shadowColor = '#00FFFF';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('HALCYON', w/2, 55);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#80FFFF';
    ctx.fillText('Subdomain Registry', w/2, 78);

    // Domain
    ctx.font = 'bold 30px sans-serif';
    ctx.shadowColor = '#00FF80';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(domain, w/2, h - 38);
    ctx.shadowBlur = 0;
}

// ========== ANCIENT/EGYPTIAN STYLE ==========
function applyAncientWatermark(ctx, w, h, domain) {
    const gold = '#D4AF37';
    const brightGold = '#FFD700';
    const darkGold = '#8B7355';
    const sandstone = '#C2A878';
    const darkBrown = '#3D2B1F';
    const papyrus = '#E8D4A8';

    // Papyrus/sandstone background
    const topGrad = ctx.createLinearGradient(0, 0, 0, 95);
    topGrad.addColorStop(0, sandstone);
    topGrad.addColorStop(0.5, papyrus);
    topGrad.addColorStop(1, sandstone);
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, 95);

    const bottomGrad = ctx.createLinearGradient(0, h - 90, 0, h);
    bottomGrad.addColorStop(0, sandstone);
    bottomGrad.addColorStop(0.5, papyrus);
    bottomGrad.addColorStop(1, sandstone);
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, h - 90, w, 90);

    // Aged papyrus texture
    ctx.fillStyle = 'rgba(139, 115, 85, 0.15)';
    for (let i = 0; i < 200; i++) {
        const x = Math.random() * w;
        const y1 = Math.random() * 95;
        const y2 = h - 90 + Math.random() * 90;
        ctx.fillRect(x, y1, 1 + Math.random() * 3, 1);
        ctx.fillRect(x, y2, 1 + Math.random() * 3, 1);
    }

    // Egyptian border - hieroglyphic pattern band
    ctx.fillStyle = darkBrown;
    ctx.fillRect(0, 90, w, 5);
    ctx.fillRect(0, h - 95, w, 5);

    // Gold accent lines (properly aligned)
    ctx.fillStyle = gold;
    ctx.fillRect(0, 88, w, 2);
    ctx.fillRect(0, h - 90, w, 2);

    // Eye of Horus (left side, properly positioned)
    ctx.save();
    ctx.translate(55, 50);
    // Outer eye
    ctx.fillStyle = darkBrown;
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // Inner eye white
    ctx.fillStyle = papyrus;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Pupil
    ctx.fillStyle = darkBrown;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    // Eye markings
    ctx.strokeStyle = darkBrown;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(35, 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.quadraticCurveTo(5, 25, 15, 30);
    ctx.stroke();
    ctx.restore();

    // Ankh symbol (right side, properly aligned)
    ctx.save();
    ctx.translate(w - 55, 45);
    ctx.fillStyle = gold;
    // Loop
    ctx.beginPath();
    ctx.ellipse(0, -12, 12, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = sandstone;
    ctx.beginPath();
    ctx.ellipse(0, -12, 6, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Stem
    ctx.fillStyle = gold;
    ctx.fillRect(-4, 2, 8, 35);
    // Arms
    ctx.fillRect(-18, 8, 36, 6);
    ctx.restore();

    // HALCYON centered with cartouche
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px serif';

    // Gold gradient for text
    const goldGrad = ctx.createLinearGradient(w/2 - 100, 30, w/2 + 100, 60);
    goldGrad.addColorStop(0, darkGold);
    goldGrad.addColorStop(0.2, gold);
    goldGrad.addColorStop(0.5, brightGold);
    goldGrad.addColorStop(0.8, gold);
    goldGrad.addColorStop(1, darkGold);

    // Shadow
    ctx.fillStyle = darkBrown;
    ctx.fillText('HALCYON', w/2 + 2, 52);
    // Main text
    ctx.fillStyle = goldGrad;
    ctx.fillText('HALCYON', w/2, 50);

    // Cartouche border (pharaoh name frame)
    ctx.strokeStyle = gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(w/2 - 115, 22, 230, 42, 21);
    ctx.stroke();
    // Cartouche end knot
    ctx.fillStyle = gold;
    ctx.fillRect(w/2 + 112, 38, 8, 12);

    // Subtitle (centered)
    ctx.font = '11px serif';
    ctx.fillStyle = darkBrown;
    ctx.fillText('Subdomain Registry', w/2, 80);

    // Bottom section - domain centered
    ctx.font = 'bold 30px serif';
    // Shadow
    ctx.fillStyle = darkBrown;
    ctx.fillText(domain, w/2 + 2, h - 38);
    // Main
    ctx.fillStyle = goldGrad;
    ctx.fillText(domain, w/2, h - 40);

    // Pyramid silhouettes (symmetrically positioned)
    ctx.fillStyle = 'rgba(61, 43, 31, 0.25)';
    // Left pyramid
    ctx.beginPath();
    ctx.moveTo(25, h - 55);
    ctx.lineTo(55, h - 85);
    ctx.lineTo(85, h - 55);
    ctx.closePath();
    ctx.fill();
    // Right pyramid (mirrored)
    ctx.beginPath();
    ctx.moveTo(w - 85, h - 55);
    ctx.lineTo(w - 55, h - 85);
    ctx.lineTo(w - 25, h - 55);
    ctx.closePath();
    ctx.fill();

    // Scarab beetle center bottom
    ctx.save();
    ctx.translate(w/2, h - 68);
    ctx.fillStyle = gold;
    // Body
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Head
    ctx.beginPath();
    ctx.arc(0, -10, 6, 0, Math.PI * 2);
    ctx.fill();
    // Wings
    ctx.beginPath();
    ctx.ellipse(-15, 2, 8, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(15, 2, 8, 5, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Hieroglyph accents along borders
    ctx.fillStyle = darkBrown;
    ctx.font = '8px serif';
    for (let x = 100; x < w - 100; x += 35) {
        ctx.fillText('𓂀', x, 85);
        ctx.fillText('𓃀', x + 12, 85);
    }
}

// ========== SPORTS/ATHLETIC STYLE ==========
function applySportsWatermark(ctx, w, h, domain) {
    const teamBlue = '#003087';
    const teamRed = '#C8102E';
    const white = '#FFFFFF';
    const gold = '#FFD700';
    const silver = '#C0C0C0';

    // Dynamic diagonal split - top
    ctx.fillStyle = teamBlue;
    ctx.fillRect(0, 0, w, 95);
    ctx.fillStyle = teamRed;
    ctx.beginPath();
    ctx.moveTo(w * 0.55, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, 95);
    ctx.lineTo(w * 0.35, 95);
    ctx.closePath();
    ctx.fill();

    // Bottom bar - reversed colors
    ctx.fillStyle = teamRed;
    ctx.fillRect(0, h - 90, w, 90);
    ctx.fillStyle = teamBlue;
    ctx.beginPath();
    ctx.moveTo(w * 0.55, h - 90);
    ctx.lineTo(w, h - 90);
    ctx.lineTo(w, h);
    ctx.lineTo(w * 0.35, h);
    ctx.closePath();
    ctx.fill();

    // Multiple diagonal stripes
    ctx.fillStyle = white;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, 95);
    ctx.clip();
    for (let i = -2; i < 3; i++) {
        ctx.save();
        ctx.translate(w * 0.45 + i * 60, 0);
        ctx.rotate(Math.PI / 5);
        ctx.fillRect(-6, -30, 12, 180);
        ctx.restore();
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, h - 90, w, 90);
    ctx.clip();
    for (let i = -2; i < 3; i++) {
        ctx.save();
        ctx.translate(w * 0.45 + i * 60, h);
        ctx.rotate(-Math.PI / 5);
        ctx.fillRect(-6, -150, 12, 180);
        ctx.restore();
    }
    ctx.restore();

    // Jersey number with heavy outline
    ctx.textAlign = 'left';
    ctx.font = 'bold italic 55px sans-serif';
    // Number shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillText('01', 22, 68);
    // Gold outline
    ctx.strokeStyle = gold;
    ctx.lineWidth = 4;
    ctx.strokeText('01', 20, 65);
    // White fill
    ctx.fillStyle = white;
    ctx.fillText('01', 20, 65);

    // HALCYON in bold athletic style
    ctx.textAlign = 'center';
    ctx.font = 'bold italic 46px sans-serif';
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillText('HALCYON', w/2 + 25, 58);
    // Gold outline
    ctx.strokeStyle = gold;
    ctx.lineWidth = 4;
    ctx.strokeText('HALCYON', w/2 + 22, 55);
    // White fill
    ctx.fillStyle = white;
    ctx.fillText('HALCYON', w/2 + 22, 55);

    // Championship banner
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.moveTo(w/2 - 60, 72);
    ctx.lineTo(w/2 + 85, 72);
    ctx.lineTo(w/2 + 80, 78);
    ctx.lineTo(w/2 + 85, 84);
    ctx.lineTo(w/2 - 60, 84);
    ctx.lineTo(w/2 - 55, 78);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = teamBlue;
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('★ CHAMPIONS ★', w/2 + 12, 81);

    // Athletic gold border stripes
    ctx.fillStyle = gold;
    ctx.fillRect(0, 92, w, 4);
    ctx.fillRect(0, h - 94, w, 4);

    // Domain jersey style
    ctx.font = 'bold italic 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillText(domain, w/2 + 2, h - 38);
    ctx.strokeStyle = teamBlue;
    ctx.lineWidth = 4;
    ctx.strokeText(domain, w/2, h - 40);
    ctx.fillStyle = white;
    ctx.fillText(domain, w/2, h - 40);

    // Trophy icon (left side)
    ctx.save();
    ctx.translate(40, h - 60);
    // Cup body
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.moveTo(-15, -20);
    ctx.lineTo(15, -20);
    ctx.lineTo(12, 5);
    ctx.lineTo(-12, 5);
    ctx.closePath();
    ctx.fill();
    // Handles
    ctx.strokeStyle = gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-18, -10, 8, -Math.PI/2, Math.PI/2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(18, -10, 8, Math.PI/2, -Math.PI/2);
    ctx.stroke();
    // Base
    ctx.fillRect(-6, 5, 12, 8);
    ctx.fillRect(-12, 13, 24, 5);
    // Star on trophy
    ctx.fillStyle = teamRed;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★', 0, -5);
    ctx.restore();

    // Medal icon (right side)
    ctx.save();
    ctx.translate(w - 45, h - 60);
    // Ribbon
    ctx.fillStyle = teamRed;
    ctx.beginPath();
    ctx.moveTo(-8, -25);
    ctx.lineTo(8, -25);
    ctx.lineTo(12, -5);
    ctx.lineTo(0, 0);
    ctx.lineTo(-12, -5);
    ctx.closePath();
    ctx.fill();
    // Medal circle
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(0, 8, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#B8860B';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Inner circle
    ctx.beginPath();
    ctx.arc(0, 8, 10, 0, Math.PI * 2);
    ctx.stroke();
    // Number 1
    ctx.fillStyle = teamBlue;
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('1', 0, 13);
    ctx.restore();

    // Sports equipment accents
    // Football shape left corner
    ctx.fillStyle = '#8B4513';
    ctx.beginPath();
    ctx.ellipse(w - 80, 45, 18, 10, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = white;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w - 90, 38);
    ctx.lineTo(w - 70, 52);
    ctx.stroke();

    // Basketball lines
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(w - 80, 45, 10, 0, Math.PI * 2);
    ctx.stroke();
}

// ========== PIXEL ART / 8-BIT STYLE ==========
function applyPixelArtWatermark(ctx, w, h, domain) {
    const pixelSize = 8;
    const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FF8800', '#8800FF'];
    const darkBg = '#1a1a2e';
    const lightBg = '#16213e';

    // Pixelated dark background
    ctx.fillStyle = darkBg;
    ctx.fillRect(0, 0, w, 95);
    ctx.fillRect(0, h - 90, w, 90);

    // Checker pattern background
    for (let x = 0; x < w; x += pixelSize * 2) {
        for (let y = 0; y < 95; y += pixelSize * 2) {
            ctx.fillStyle = lightBg;
            ctx.fillRect(x, y, pixelSize, pixelSize);
            ctx.fillRect(x + pixelSize, y + pixelSize, pixelSize, pixelSize);
        }
        for (let y = h - 90; y < h; y += pixelSize * 2) {
            ctx.fillStyle = lightBg;
            ctx.fillRect(x, y, pixelSize, pixelSize);
            ctx.fillRect(x + pixelSize, y + pixelSize, pixelSize, pixelSize);
        }
    }

    // Rainbow pixel border
    for (let i = 0; i < 8; i++) {
        ctx.fillStyle = colors[i % colors.length];
        for (let x = i * 80; x < (i + 1) * 80 && x < w; x += pixelSize) {
            ctx.fillRect(x, 0, pixelSize, pixelSize);
            ctx.fillRect(x, 87, pixelSize, pixelSize);
            ctx.fillRect(x, h - 90, pixelSize, pixelSize);
            ctx.fillRect(x, h - pixelSize, pixelSize, pixelSize);
        }
    }

    // Pixel art hearts
    const drawPixelHeart = (cx, cy, color) => {
        ctx.fillStyle = color;
        const heart = [
            [0,1,1,0,0,1,1,0],
            [1,1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1,1],
            [0,1,1,1,1,1,1,0],
            [0,0,1,1,1,1,0,0],
            [0,0,0,1,1,0,0,0],
        ];
        heart.forEach((row, y) => {
            row.forEach((pixel, x) => {
                if (pixel) ctx.fillRect(cx + (x - 4) * 4, cy + y * 4, 4, 4);
            });
        });
    };
    drawPixelHeart(30, 25, '#FF0000');
    drawPixelHeart(w - 55, 25, '#FF0000');
    drawPixelHeart(30, h - 75, '#FF00FF');
    drawPixelHeart(w - 55, h - 75, '#00FFFF');

    // HALCYON in pixel font style
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px monospace';
    // Rainbow gradient effect
    const rainbowGrad = ctx.createLinearGradient(w/2 - 120, 0, w/2 + 120, 0);
    colors.forEach((c, i) => rainbowGrad.addColorStop(i / (colors.length - 1), c));
    ctx.fillStyle = '#000000';
    ctx.fillText('HALCYON', w/2 + 3, 58);
    ctx.fillStyle = rainbowGrad;
    ctx.fillText('HALCYON', w/2, 55);

    // "PRESS START" style subtitle
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#FFFF00';
    ctx.fillText('★ PRESS START ★', w/2, 78);

    // Blinking effect simulation with stars
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '14px monospace';
    ctx.fillText('✦', 100, 50);
    ctx.fillText('✦', w - 110, 45);

    // Domain in pixel style
    ctx.font = 'bold 28px monospace';
    ctx.fillStyle = '#000000';
    ctx.fillText(domain, w/2 + 2, h - 38);
    ctx.fillStyle = '#00FF00';
    ctx.fillText(domain, w/2, h - 40);

    // Score display
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE: 999999', 70, 45);
    ctx.textAlign = 'right';
    ctx.fillText('HI-SCORE: 999999', w - 70, 45);

    // Pixel coins
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(85, 65, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFA500';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('$', 85, 69);
}

// ========== GALAXY / SPACE STYLE ==========
function applyGalaxyWatermark(ctx, w, h, domain) {
    const deepSpace = '#050510';
    const nebulaPurple = '#6a0dad';
    const nebulaBlue = '#1e3a8a';
    const nebulaPink = '#ec4899';
    const nebulaTeal = '#14b8a6';
    const starWhite = '#FFFFFF';
    const starYellow = '#fef08a';

    // Deep space gradient background with multiple colors
    const topGrad = ctx.createLinearGradient(0, 0, w, 95);
    topGrad.addColorStop(0, deepSpace);
    topGrad.addColorStop(0.2, '#1a0a2e');
    topGrad.addColorStop(0.5, nebulaPurple);
    topGrad.addColorStop(0.7, nebulaBlue);
    topGrad.addColorStop(1, deepSpace);
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, 95);

    const bottomGrad = ctx.createLinearGradient(0, h - 90, w, h);
    bottomGrad.addColorStop(0, deepSpace);
    bottomGrad.addColorStop(0.3, nebulaBlue);
    bottomGrad.addColorStop(0.5, '#2d1b69');
    bottomGrad.addColorStop(0.8, nebulaPurple);
    bottomGrad.addColorStop(1, deepSpace);
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, h - 90, w, 90);

    // Vibrant nebula clouds - multiple layers
    const nebulaColors = [nebulaPink, nebulaPurple, nebulaTeal, '#f97316', '#8b5cf6'];
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 8; i++) {
        const radGrad = ctx.createRadialGradient(
            60 + i * 85, 35 + (i % 2) * 20, 3,
            60 + i * 85, 35 + (i % 2) * 20, 30 + Math.random() * 40
        );
        radGrad.addColorStop(0, nebulaColors[i % nebulaColors.length]);
        radGrad.addColorStop(0.4, nebulaColors[(i + 1) % nebulaColors.length]);
        radGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = radGrad;
        ctx.fillRect(0, 0, w, 95);
    }
    for (let i = 0; i < 7; i++) {
        const radGrad = ctx.createRadialGradient(
            50 + i * 95, h - 55 + (i % 2) * 15, 3,
            50 + i * 95, h - 55 + (i % 2) * 15, 25 + Math.random() * 35
        );
        radGrad.addColorStop(0, nebulaColors[(i + 2) % nebulaColors.length]);
        radGrad.addColorStop(0.5, nebulaColors[(i + 3) % nebulaColors.length]);
        radGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = radGrad;
        ctx.fillRect(0, h - 90, w, 90);
    }
    ctx.globalAlpha = 1;

    // Dense star field with varying sizes and colors
    const starColors = [starWhite, starYellow, '#a5f3fc', '#fca5a5', '#c4b5fd'];
    for (let i = 0; i < 150; i++) {
        const x = Math.random() * w;
        const y = Math.random() * 95;
        const size = Math.random() * 2.5 + 0.3;
        ctx.fillStyle = starColors[Math.floor(Math.random() * starColors.length)];
        ctx.globalAlpha = 0.5 + Math.random() * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
    for (let i = 0; i < 120; i++) {
        const x = Math.random() * w;
        const y = h - 90 + Math.random() * 90;
        const size = Math.random() * 2.5 + 0.3;
        ctx.fillStyle = starColors[Math.floor(Math.random() * starColors.length)];
        ctx.globalAlpha = 0.5 + Math.random() * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Bright twinkling stars with glow
    const drawTwinkleStar = (x, y, size) => {
        ctx.fillStyle = starWhite;
        ctx.shadowColor = starWhite;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size * 0.3, y - size * 0.3);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x + size * 0.3, y + size * 0.3);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x - size * 0.3, y + size * 0.3);
        ctx.lineTo(x - size, y);
        ctx.lineTo(x - size * 0.3, y - size * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
    };
    drawTwinkleStar(120, 25, 6);
    drawTwinkleStar(w - 130, 40, 5);
    drawTwinkleStar(w/2 - 100, 75, 4);
    drawTwinkleStar(80, h - 65, 5);
    drawTwinkleStar(w - 90, h - 55, 4);

    // Spiral galaxy (larger and more detailed)
    ctx.save();
    ctx.translate(55, 55);
    ctx.globalAlpha = 0.8;
    for (let arm = 0; arm < 2; arm++) {
        for (let i = 0; i < 80; i++) {
            const angle = i * 0.12 + arm * Math.PI;
            const radius = i * 0.4;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius * 0.6;
            const starSize = 0.5 + (1 - i / 80) * 1.5;
            ctx.fillStyle = i < 20 ? '#fef9c3' : (i % 4 === 0 ? nebulaPink : starWhite);
            ctx.beginPath();
            ctx.arc(x, y, starSize, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    // Galaxy center glow
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
    coreGrad.addColorStop(0, '#fef9c3');
    coreGrad.addColorStop(0.5, nebulaPink);
    coreGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // Planet with rings
    ctx.save();
    ctx.translate(w - 70, 50);
    // Planet body
    const planetGrad = ctx.createRadialGradient(-5, -5, 0, 0, 0, 18);
    planetGrad.addColorStop(0, '#60a5fa');
    planetGrad.addColorStop(0.5, '#3b82f6');
    planetGrad.addColorStop(1, '#1e3a8a');
    ctx.fillStyle = planetGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    // Planet ring
    ctx.strokeStyle = 'rgba(200, 200, 220, 0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 8, -0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200, 200, 220, 0.3)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 35, 10, -0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Cosmic rainbow border
    const borderGrad = ctx.createLinearGradient(0, 0, w, 0);
    borderGrad.addColorStop(0, nebulaPink);
    borderGrad.addColorStop(0.25, nebulaPurple);
    borderGrad.addColorStop(0.5, nebulaTeal);
    borderGrad.addColorStop(0.75, '#3b82f6');
    borderGrad.addColorStop(1, nebulaPink);
    ctx.fillStyle = borderGrad;
    ctx.fillRect(0, 91, w, 4);
    ctx.fillRect(0, h - 93, w, 4);

    // HALCYON with cosmic rainbow glow
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px sans-serif';
    ctx.shadowColor = nebulaPink;
    ctx.shadowBlur = 25;
    ctx.fillStyle = starWhite;
    ctx.fillText('HALCYON', w/2, 55);
    ctx.shadowColor = nebulaTeal;
    ctx.shadowBlur = 15;
    ctx.fillText('HALCYON', w/2, 55);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#c4b5fd';
    ctx.fillText('Subdomain Registry', w/2, 80);

    // Domain with dual glow
    ctx.font = 'bold 30px sans-serif';
    ctx.shadowColor = nebulaPink;
    ctx.shadowBlur = 20;
    ctx.fillStyle = starWhite;
    ctx.fillText(domain, w/2, h - 40);
    ctx.shadowColor = nebulaTeal;
    ctx.shadowBlur = 12;
    ctx.fillText(domain, w/2, h - 40);
    ctx.shadowBlur = 0;

    // Multiple shooting stars
    ctx.strokeStyle = starWhite;
    ctx.lineWidth = 2;
    ctx.shadowColor = starWhite;
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.moveTo(180, 20);
    ctx.lineTo(240, 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w - 200, 35);
    ctx.lineTo(w - 150, 25);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(150, h - 75);
    ctx.lineTo(200, h - 82);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Small moon
    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.arc(w - 150, h - 55, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9ca3af';
    ctx.beginPath();
    ctx.arc(w - 147, h - 58, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w - 153, h - 52, 3, 0, Math.PI * 2);
    ctx.fill();
}

// ========== BAMBOO / ZEN FOREST STYLE ==========
function applyBambooWatermark(ctx, w, h, domain) {
    const bambooGreen = '#228B22';
    const darkGreen = '#006400';
    const leafGreen = '#32CD32';
    const cream = '#F5F5DC';
    const brown = '#8B4513';

    // Cream parchment background
    ctx.fillStyle = cream;
    ctx.fillRect(0, 0, w, 95);
    ctx.fillRect(0, h - 90, w, 90);

    // Subtle texture
    ctx.fillStyle = 'rgba(139, 115, 85, 0.1)';
    for (let i = 0; i < 150; i++) {
        ctx.fillRect(Math.random() * w, Math.random() * 95, Math.random() * 20, 1);
        ctx.fillRect(Math.random() * w, h - 90 + Math.random() * 90, Math.random() * 20, 1);
    }

    // Draw bamboo stalks
    const drawBamboo = (x, startY, height, segments) => {
        const segHeight = height / segments;
        for (let i = 0; i < segments; i++) {
            const y = startY + i * segHeight;
            // Segment
            const grad = ctx.createLinearGradient(x - 8, 0, x + 8, 0);
            grad.addColorStop(0, darkGreen);
            grad.addColorStop(0.3, bambooGreen);
            grad.addColorStop(0.7, bambooGreen);
            grad.addColorStop(1, darkGreen);
            ctx.fillStyle = grad;
            ctx.fillRect(x - 8, y, 16, segHeight - 3);
            // Node
            ctx.fillStyle = darkGreen;
            ctx.fillRect(x - 10, y + segHeight - 5, 20, 5);
        }
    };

    // Top bamboo forest
    drawBamboo(30, 0, 95, 4);
    drawBamboo(60, 10, 85, 3);
    drawBamboo(w - 35, 0, 95, 4);
    drawBamboo(w - 65, 5, 90, 3);

    // Bottom bamboo
    drawBamboo(35, h - 90, 90, 3);
    drawBamboo(65, h - 85, 85, 3);
    drawBamboo(w - 40, h - 90, 90, 4);
    drawBamboo(w - 70, h - 88, 88, 3);

    // Bamboo leaves
    const drawLeaf = (x, y, angle, size) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillStyle = leafGreen;
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 3, size, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    };

    // Scatter leaves
    for (let i = 0; i < 12; i++) {
        drawLeaf(40 + Math.random() * 40, 20 + Math.random() * 60, Math.random() * Math.PI, 3 + Math.random() * 2);
        drawLeaf(w - 80 + Math.random() * 40, 15 + Math.random() * 65, Math.random() * Math.PI, 3 + Math.random() * 2);
    }
    for (let i = 0; i < 10; i++) {
        drawLeaf(45 + Math.random() * 35, h - 80 + Math.random() * 50, Math.random() * Math.PI, 2 + Math.random() * 2);
        drawLeaf(w - 75 + Math.random() * 35, h - 75 + Math.random() * 45, Math.random() * Math.PI, 2 + Math.random() * 2);
    }

    // Zen border
    ctx.fillStyle = brown;
    ctx.fillRect(0, 92, w, 3);
    ctx.fillRect(0, h - 93, w, 3);

    // HALCYON in brush stroke style
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px serif';
    ctx.fillStyle = brown;
    ctx.fillText('HALCYON', w/2 + 2, 52);
    ctx.fillStyle = darkGreen;
    ctx.fillText('HALCYON', w/2, 50);

    // Subtitle
    ctx.font = '12px serif';
    ctx.fillStyle = brown;
    ctx.fillText('Subdomain Registry', w/2, 75);

    // Domain
    ctx.font = 'bold 28px serif';
    ctx.fillStyle = brown;
    ctx.fillText(domain, w/2 + 1, h - 40);
    ctx.fillStyle = darkGreen;
    ctx.fillText(domain, w/2, h - 42);

    // Zen circle (enso)
    ctx.strokeStyle = brown;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(w/2, h - 65, 18, 0.2, Math.PI * 1.9);
    ctx.stroke();
}

// ========== NEON SIGNS / VEGAS STYLE ==========
function applyNeonSignsWatermark(ctx, w, h, domain) {
    const darkBg = '#0a0a0a';
    const neonPink = '#FF1493';
    const neonBlue = '#00BFFF';
    const neonYellow = '#FFD700';
    const neonGreen = '#39FF14';
    const neonOrange = '#FF6600';

    // Dark background
    ctx.fillStyle = darkBg;
    ctx.fillRect(0, 0, w, 95);
    ctx.fillRect(0, h - 90, w, 90);

    // Brick wall texture
    ctx.fillStyle = '#1a1a1a';
    for (let y = 0; y < 95; y += 12) {
        for (let x = (y % 24 === 0) ? 0 : -15; x < w; x += 30) {
            ctx.fillRect(x + 1, y + 1, 28, 10);
        }
    }
    for (let y = h - 90; y < h; y += 12) {
        for (let x = ((y - (h - 90)) % 24 === 0) ? 0 : -15; x < w; x += 30) {
            ctx.fillRect(x + 1, y + 1, 28, 10);
        }
    }

    // Neon tube function
    const drawNeonText = (text, x, y, color, fontSize) => {
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        // Outer glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
        // Inner glow
        ctx.shadowBlur = 10;
        ctx.fillText(text, x, y);
        // Core (white)
        ctx.shadowBlur = 5;
        ctx.fillStyle = '#FFFFFF';
        ctx.globalAlpha = 0.8;
        ctx.fillText(text, x, y);
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    };

    // HALCYON in neon
    drawNeonText('HALCYON', w/2, 55, neonPink, 48);

    // Decorative neon elements
    // Arrow left
    ctx.strokeStyle = neonYellow;
    ctx.lineWidth = 3;
    ctx.shadowColor = neonYellow;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.moveTo(25, 50);
    ctx.lineTo(45, 40);
    ctx.lineTo(45, 45);
    ctx.lineTo(70, 45);
    ctx.lineTo(70, 55);
    ctx.lineTo(45, 55);
    ctx.lineTo(45, 60);
    ctx.closePath();
    ctx.stroke();

    // Arrow right
    ctx.beginPath();
    ctx.moveTo(w - 25, 50);
    ctx.lineTo(w - 45, 40);
    ctx.lineTo(w - 45, 45);
    ctx.lineTo(w - 70, 45);
    ctx.lineTo(w - 70, 55);
    ctx.lineTo(w - 45, 55);
    ctx.lineTo(w - 45, 60);
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // "OPEN" sign style
    ctx.strokeStyle = neonGreen;
    ctx.shadowColor = neonGreen;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(w/2 - 40, 65, 80, 22, 5);
    ctx.stroke();
    ctx.shadowBlur = 0;
    drawNeonText('REGISTRY', w/2, 82, neonGreen, 12);

    // Domain in neon blue
    drawNeonText(domain, w/2, h - 40, neonBlue, 30);

    // Neon stars
    ctx.fillStyle = neonOrange;
    ctx.shadowColor = neonOrange;
    ctx.shadowBlur = 10;
    ctx.font = '20px sans-serif';
    ctx.fillText('★', 90, 30);
    ctx.fillText('★', w - 100, 35);
    ctx.shadowBlur = 0;

    // Bottom decorations - neon hearts
    ctx.strokeStyle = neonPink;
    ctx.shadowColor = neonPink;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    const drawNeonHeart = (cx, cy, size) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy + size * 0.3);
        ctx.bezierCurveTo(cx - size, cy - size * 0.5, cx - size, cy + size * 0.5, cx, cy + size);
        ctx.bezierCurveTo(cx + size, cy + size * 0.5, cx + size, cy - size * 0.5, cx, cy + size * 0.3);
        ctx.stroke();
    };
    drawNeonHeart(60, h - 65, 12);
    drawNeonHeart(w - 65, h - 60, 10);
    ctx.shadowBlur = 0;

    // Neon border
    ctx.strokeStyle = neonPink;
    ctx.shadowColor = neonPink;
    ctx.shadowBlur = 8;
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, w - 4, 91);
    ctx.strokeRect(2, h - 88, w - 4, 86);
    ctx.shadowBlur = 0;
}

// ========== BLUEPRINT / TECHNICAL STYLE ==========
function applyBlueprintWatermark(ctx, w, h, domain) {
    const blueprintBlue = '#0066CC';
    const darkBlue = '#003366';
    const lightBlue = '#4488CC';
    const white = '#FFFFFF';
    const gridColor = '#1155AA';

    // Blueprint blue background
    ctx.fillStyle = darkBlue;
    ctx.fillRect(0, 0, w, 95);
    ctx.fillRect(0, h - 90, w, 90);

    // Grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    // Major grid
    for (let x = 0; x < w; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 95);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, h - 90);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    for (let y = 0; y < 95; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
    for (let y = h - 90; y < h; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }

    // Technical border frame
    ctx.strokeStyle = lightBlue;
    ctx.lineWidth = 2;
    ctx.strokeRect(5, 5, w - 10, 85);
    ctx.strokeRect(5, h - 85, w - 10, 80);

    // Corner markers
    ctx.lineWidth = 1;
    const drawCornerMark = (x, y, flip) => {
        const dir = flip ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(x, y + 15 * dir);
        ctx.lineTo(x, y);
        ctx.lineTo(x + 15 * dir, y);
        ctx.stroke();
    };
    drawCornerMark(10, 10, false);
    drawCornerMark(w - 10, 10, true);
    drawCornerMark(10, 85, false);
    drawCornerMark(w - 10, 85, true);

    // Dimension lines
    ctx.strokeStyle = white;
    ctx.lineWidth = 1;
    // Top dimension
    ctx.beginPath();
    ctx.moveTo(120, 15);
    ctx.lineTo(w - 120, 15);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(120, 12);
    ctx.lineTo(120, 18);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w - 120, 12);
    ctx.lineTo(w - 120, 18);
    ctx.stroke();

    // HALCYON in technical font
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px monospace';
    ctx.fillStyle = white;
    ctx.fillText('HALCYON', w/2, 55);

    // Technical annotations
    ctx.font = '9px monospace';
    ctx.fillStyle = lightBlue;
    ctx.textAlign = 'left';
    ctx.fillText('REV: 1.0', 15, 25);
    ctx.fillText('SCALE: 1:1', 15, 38);
    ctx.textAlign = 'right';
    ctx.fillText('DWG: HSR-001', w - 15, 25);
    ctx.fillText('DATE: 2024', w - 15, 38);

    // Subtitle
    ctx.textAlign = 'center';
    ctx.font = '10px monospace';
    ctx.fillStyle = lightBlue;
    ctx.fillText('Subdomain Registry', w/2, 78);

    // Domain
    ctx.font = 'bold 28px monospace';
    ctx.fillStyle = white;
    ctx.fillText(domain, w/2, h - 40);

    // Center mark crosshairs
    ctx.strokeStyle = lightBlue;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w/2 - 15, h - 65);
    ctx.lineTo(w/2 + 15, h - 65);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w/2, h - 80);
    ctx.lineTo(w/2, h - 50);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w/2, h - 65, 8, 0, Math.PI * 2);
    ctx.stroke();

    // Title block bottom right
    ctx.strokeStyle = lightBlue;
    ctx.lineWidth = 1;
    ctx.strokeRect(w - 130, h - 85, 120, 30);
    ctx.font = '8px monospace';
    ctx.fillStyle = lightBlue;
    ctx.textAlign = 'left';
    ctx.fillText('Subdomain Registry', w - 125, h - 72);
    ctx.fillText('SUBDOMAIN SYSTEM', w - 125, h - 62);
}

// ========== GRUNGE / ROCK POSTER STYLE ==========
function applyGrungeWatermark(ctx, w, h, domain) {
    const black = '#0a0a0a';
    const darkGray = '#1a1a1a';
    const rust = '#8B4513';
    const cream = '#F5DEB3';
    const blood = '#8B0000';
    const crimson = '#DC143C';
    const olive = '#556B2F';
    const mustard = '#DAA520';

    // Dark distressed background with color variation
    const topGrad = ctx.createLinearGradient(0, 0, w, 95);
    topGrad.addColorStop(0, black);
    topGrad.addColorStop(0.3, '#1a1510');
    topGrad.addColorStop(0.7, '#0f0a08');
    topGrad.addColorStop(1, black);
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, 95);

    const bottomGrad = ctx.createLinearGradient(0, h - 90, w, h);
    bottomGrad.addColorStop(0, black);
    bottomGrad.addColorStop(0.4, '#150f0a');
    bottomGrad.addColorStop(0.6, '#1a1510');
    bottomGrad.addColorStop(1, black);
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, h - 90, w, 90);

    // Heavy grunge texture - scratches, noise, wear
    for (let i = 0; i < 500; i++) {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.12})`;
        const x = Math.random() * w;
        const y = Math.random() * 95;
        ctx.fillRect(x, y, Math.random() * 40, 1);
        const y2 = h - 90 + Math.random() * 90;
        ctx.fillRect(x, y2, Math.random() * 35, 1);
    }

    // Rust stains
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 6; i++) {
        const radGrad = ctx.createRadialGradient(
            Math.random() * w, Math.random() * 95, 5,
            Math.random() * w, Math.random() * 95, 30 + Math.random() * 40
        );
        radGrad.addColorStop(0, rust);
        radGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = radGrad;
        ctx.fillRect(0, 0, w, 95);
    }
    for (let i = 0; i < 5; i++) {
        const radGrad = ctx.createRadialGradient(
            Math.random() * w, h - 90 + Math.random() * 90, 5,
            Math.random() * w, h - 90 + Math.random() * 90, 25 + Math.random() * 35
        );
        radGrad.addColorStop(0, olive);
        radGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = radGrad;
        ctx.fillRect(0, h - 90, w, 90);
    }
    ctx.globalAlpha = 1;

    // Vertical distress lines and cracks
    for (let i = 0; i < 30; i++) {
        ctx.fillStyle = `rgba(139, 69, 19, ${Math.random() * 0.25})`;
        const x = Math.random() * w;
        ctx.fillRect(x, 0, 1 + Math.random() * 2, 95);
        ctx.fillRect(x + Math.random() * 100, h - 90, 1 + Math.random() * 2, 90);
    }

    // More aggressive splatter effect
    const splatColors = [blood, crimson, rust, '#4a0000'];
    for (let i = 0; i < 15; i++) {
        ctx.fillStyle = splatColors[Math.floor(Math.random() * splatColors.length)];
        const x = Math.random() * w;
        const y = Math.random() * 95;
        const size = 2 + Math.random() * 6;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        // Multiple drips
        for (let d = 0; d < 1 + Math.random() * 3; d++) {
            const dripX = x - 2 + Math.random() * 4;
            const dripLen = 5 + Math.random() * 20;
            ctx.fillRect(dripX, y, 1 + Math.random() * 2, dripLen);
        }
    }
    for (let i = 0; i < 12; i++) {
        ctx.fillStyle = splatColors[Math.floor(Math.random() * splatColors.length)];
        const x = Math.random() * w;
        const y = h - 90 + Math.random() * 90;
        ctx.beginPath();
        ctx.arc(x, y, 1 + Math.random() * 4, 0, Math.PI * 2);
        ctx.fill();
    }

    // Torn/ripped edge effect
    ctx.fillStyle = cream;
    ctx.globalAlpha = 0.15;
    for (let x = 0; x < w; x += 3) {
        const h1 = Math.random() * 12;
        const h2 = Math.random() * 10;
        ctx.fillRect(x, 90 - h1, 3, h1);
        ctx.fillRect(x, h - 90, 3, h2);
    }
    ctx.globalAlpha = 1;

    // Stencil spray paint effect behind text
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = mustard;
    ctx.beginPath();
    ctx.ellipse(w/2, 50, 140, 35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // HALCYON in aggressive distressed style
    ctx.textAlign = 'center';
    ctx.font = 'bold 52px sans-serif';

    // Multiple chaotic offset layers
    ctx.fillStyle = olive;
    ctx.fillText('HALCYON', w/2 + 4, 60);
    ctx.fillStyle = crimson;
    ctx.fillText('HALCYON', w/2 - 3, 52);
    ctx.fillStyle = rust;
    ctx.fillText('HALCYON', w/2 + 1, 57);
    ctx.fillStyle = cream;
    ctx.fillText('HALCYON', w/2, 55);

    // Heavy spray paint drips
    ctx.fillStyle = cream;
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 8; i++) {
        const x = w/2 - 95 + i * 28 + Math.random() * 15;
        const dripLen = 8 + Math.random() * 25;
        ctx.fillRect(x, 55, 2, dripLen);
        if (Math.random() > 0.5) {
            ctx.beginPath();
            ctx.arc(x + 1, 55 + dripLen, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.globalAlpha = 1;

    // Aggressive crossed out style
    ctx.strokeStyle = crimson;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(w/2 - 110, 68);
    ctx.lineTo(w/2 + 110, 72);
    ctx.stroke();
    ctx.strokeStyle = blood;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w/2 - 105, 74);
    ctx.lineTo(w/2 + 105, 70);
    ctx.stroke();

    // Punk subtitle with safety pins
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = mustard;
    ctx.fillText('Subdomain Registry', w/2, 88);

    // Safety pin drawings
    const drawSafetyPin = (x, y, angle) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.strokeStyle = '#808080';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(15, 0);
        ctx.arc(15, 5, 5, -Math.PI/2, Math.PI/2);
        ctx.lineTo(5, 10);
        ctx.stroke();
        ctx.restore();
    };
    drawSafetyPin(100, 25, 0.2);
    drawSafetyPin(w - 120, 30, -0.3);

    // Domain in grunge style
    ctx.font = 'bold 32px sans-serif';
    ctx.fillStyle = olive;
    ctx.fillText(domain, w/2 + 3, h - 36);
    ctx.fillStyle = rust;
    ctx.fillText(domain, w/2 - 2, h - 41);
    ctx.fillStyle = cream;
    ctx.fillText(domain, w/2, h - 38);

    // Detailed skull with crossbones
    ctx.globalAlpha = 0.9;
    const drawSkullCrossbones = (cx, cy, size) => {
        ctx.fillStyle = cream;
        // Head
        ctx.beginPath();
        ctx.ellipse(cx, cy - size * 0.3, size, size * 1.1, 0, 0, Math.PI * 2);
        ctx.fill();
        // Jaw
        ctx.beginPath();
        ctx.moveTo(cx - size * 0.7, cy + size * 0.3);
        ctx.quadraticCurveTo(cx, cy + size * 1.2, cx + size * 0.7, cy + size * 0.3);
        ctx.fill();
        // Eyes
        ctx.fillStyle = black;
        ctx.beginPath();
        ctx.ellipse(cx - size * 0.4, cy - size * 0.4, size * 0.3, size * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + size * 0.4, cy - size * 0.4, size * 0.3, size * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        // Nose
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx - size * 0.15, cy + size * 0.3);
        ctx.lineTo(cx + size * 0.15, cy + size * 0.3);
        ctx.fill();
        // Teeth
        ctx.fillStyle = cream;
        for (let t = -3; t <= 3; t++) {
            ctx.fillRect(cx + t * size * 0.15 - 2, cy + size * 0.5, 4, size * 0.3);
        }
        // Crossbones
        ctx.strokeStyle = cream;
        ctx.lineWidth = size * 0.25;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - size * 1.5, cy + size * 1.5);
        ctx.lineTo(cx + size * 1.5, cy - size * 0.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + size * 1.5, cy + size * 1.5);
        ctx.lineTo(cx - size * 1.5, cy - size * 0.5);
        ctx.stroke();
        ctx.lineCap = 'butt';
    };
    drawSkullCrossbones(55, 50, 14);
    drawSkullCrossbones(w - 60, 48, 12);
    ctx.globalAlpha = 1;

    // Anarchy symbol
    ctx.strokeStyle = crimson;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w/2, h - 65, 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w/2, h - 82);
    ctx.lineTo(w/2 - 12, h - 52);
    ctx.moveTo(w/2, h - 82);
    ctx.lineTo(w/2 + 12, h - 52);
    ctx.moveTo(w/2 - 15, h - 62);
    ctx.lineTo(w/2 + 15, h - 62);
    ctx.stroke();

    // Duct tape patches
    ctx.fillStyle = '#808080';
    ctx.globalAlpha = 0.4;
    ctx.save();
    ctx.translate(30, h - 80);
    ctx.rotate(-0.2);
    ctx.fillRect(0, 0, 40, 15);
    ctx.restore();
    ctx.save();
    ctx.translate(w - 70, h - 75);
    ctx.rotate(0.15);
    ctx.fillRect(0, 0, 35, 12);
    ctx.restore();
    ctx.globalAlpha = 1;

    // Distressed border with staples
    ctx.strokeStyle = cream;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.4;
    ctx.setLineDash([8, 4]);
    ctx.strokeRect(4, 4, w - 8, 87);
    ctx.strokeRect(4, h - 86, w - 8, 82);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Staples
    ctx.strokeStyle = '#606060';
    ctx.lineWidth = 2;
    for (let x = 20; x < w - 20; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 6);
        ctx.lineTo(x, 2);
        ctx.lineTo(x + 8, 2);
        ctx.lineTo(x + 8, 6);
        ctx.stroke();
    }
}

// ========== WATERCOLOR / ARTISTIC STYLE ==========
function applyWatercolorWatermark(ctx, w, h, domain) {
    const cream = '#FFFEF0';
    const softPink = '#FFB6C1';
    const softBlue = '#87CEEB';
    const softPurple = '#DDA0DD';
    const softGreen = '#98FB98';
    const softOrange = '#FFDAB9';
    const charcoal = '#36454F';

    // Cream paper background
    ctx.fillStyle = cream;
    ctx.fillRect(0, 0, w, 95);
    ctx.fillRect(0, h - 90, w, 90);

    // Paper texture
    ctx.fillStyle = 'rgba(200, 180, 150, 0.08)';
    for (let i = 0; i < 200; i++) {
        ctx.fillRect(Math.random() * w, Math.random() * 95, Math.random() * 3, Math.random() * 3);
        ctx.fillRect(Math.random() * w, h - 90 + Math.random() * 90, Math.random() * 3, Math.random() * 3);
    }

    // Watercolor washes - soft overlapping blobs
    const colors = [softPink, softBlue, softPurple, softGreen, softOrange];
    ctx.globalAlpha = 0.25;
    for (let i = 0; i < 12; i++) {
        const radGrad = ctx.createRadialGradient(
            Math.random() * w, Math.random() * 95, 0,
            Math.random() * w, Math.random() * 95, 40 + Math.random() * 60
        );
        radGrad.addColorStop(0, colors[Math.floor(Math.random() * colors.length)]);
        radGrad.addColorStop(0.6, colors[Math.floor(Math.random() * colors.length)]);
        radGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.ellipse(Math.random() * w, Math.random() * 95, 50 + Math.random() * 50, 30 + Math.random() * 30, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
    }
    for (let i = 0; i < 10; i++) {
        const radGrad = ctx.createRadialGradient(
            Math.random() * w, h - 90 + Math.random() * 90, 0,
            Math.random() * w, h - 90 + Math.random() * 90, 35 + Math.random() * 50
        );
        radGrad.addColorStop(0, colors[Math.floor(Math.random() * colors.length)]);
        radGrad.addColorStop(0.5, colors[Math.floor(Math.random() * colors.length)]);
        radGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.ellipse(Math.random() * w, h - 90 + Math.random() * 90, 45 + Math.random() * 45, 25 + Math.random() * 25, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Watercolor drip edges
    ctx.globalAlpha = 0.3;
    for (let x = 0; x < w; x += 8) {
        ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
        const dripH = Math.random() * 15;
        ctx.fillRect(x, 90, 6, dripH);
        ctx.fillRect(x, h - 90 - dripH, 6, dripH);
    }
    ctx.globalAlpha = 1;

    // Soft painted border
    ctx.strokeStyle = charcoal;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.4;
    ctx.setLineDash([10, 5, 2, 5]);
    ctx.strokeRect(8, 8, w - 16, 79);
    ctx.strokeRect(8, h - 82, w - 16, 74);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // HALCYON in brush stroke style
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px serif';
    // Watercolor text effect - multiple soft layers
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = softPurple;
    ctx.fillText('HALCYON', w/2 + 3, 58);
    ctx.fillStyle = softBlue;
    ctx.fillText('HALCYON', w/2 - 2, 53);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = charcoal;
    ctx.fillText('HALCYON', w/2, 55);
    ctx.globalAlpha = 1;

    // Paint palette circles
    const paletteX = [30, 55, 80];
    colors.slice(0, 3).forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(paletteX[i], 75, 8, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Paintbrush
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(w - 60, 35, 40, 6);
    ctx.fillStyle = '#D2691E';
    ctx.fillRect(w - 65, 33, 8, 10);
    ctx.fillStyle = softBlue;
    ctx.beginPath();
    ctx.moveTo(w - 65, 33);
    ctx.lineTo(w - 75, 38);
    ctx.lineTo(w - 65, 43);
    ctx.fill();

    // Subtitle
    ctx.font = '11px serif';
    ctx.fillStyle = charcoal;
    ctx.globalAlpha = 0.7;
    ctx.fillText('Subdomain Registry', w/2, 80);
    ctx.globalAlpha = 1;

    // Domain
    ctx.font = 'bold 30px serif';
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = softPink;
    ctx.fillText(domain, w/2 + 2, h - 38);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = charcoal;
    ctx.fillText(domain, w/2, h - 40);
    ctx.globalAlpha = 1;

    // Flower decorations
    const drawFlower = (cx, cy, size) => {
        ctx.fillStyle = softPink;
        ctx.globalAlpha = 0.6;
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2;
            const px = cx + Math.cos(angle) * size;
            const py = cy + Math.sin(angle) * size;
            ctx.beginPath();
            ctx.ellipse(px, py, size * 0.6, size * 0.4, angle, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    };
    drawFlower(50, h - 60, 10);
    drawFlower(w - 55, h - 55, 8);
}

// ========== MEDIEVAL / FANTASY STYLE ==========
function applyMedievalWatermark(ctx, w, h, domain) {
    const parchment = '#D4C4A8';
    const darkBrown = '#3D2B1F';
    const gold = '#D4AF37';
    const crimson = '#8B0000';
    const royalBlue = '#002366';

    // Parchment background
    const topGrad = ctx.createLinearGradient(0, 0, 0, 95);
    topGrad.addColorStop(0, '#C9B896');
    topGrad.addColorStop(0.5, parchment);
    topGrad.addColorStop(1, '#C9B896');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, 95);

    const bottomGrad = ctx.createLinearGradient(0, h - 90, 0, h);
    bottomGrad.addColorStop(0, '#C9B896');
    bottomGrad.addColorStop(0.5, parchment);
    bottomGrad.addColorStop(1, '#C9B896');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, h - 90, w, 90);

    // Aged texture
    ctx.fillStyle = 'rgba(61, 43, 31, 0.1)';
    for (let i = 0; i < 300; i++) {
        ctx.fillRect(Math.random() * w, Math.random() * 95, Math.random() * 2, Math.random() * 2);
        ctx.fillRect(Math.random() * w, h - 90 + Math.random() * 90, Math.random() * 2, Math.random() * 2);
    }

    // Ornate medieval border
    ctx.strokeStyle = darkBrown;
    ctx.lineWidth = 3;
    ctx.strokeRect(5, 5, w - 10, 85);
    ctx.strokeRect(5, h - 85, w - 10, 80);
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, w - 16, 79);
    ctx.strokeRect(8, h - 82, w - 16, 74);

    // Corner flourishes
    const drawCornerFlourish = (x, y, flipX, flipY) => {
        ctx.strokeStyle = gold;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + 20 * flipY);
        ctx.quadraticCurveTo(x + 10 * flipX, y + 10 * flipY, x + 20 * flipX, y + 15 * flipY);
        ctx.quadraticCurveTo(x + 15 * flipX, y + 5 * flipY, x + 25 * flipX, y);
        ctx.stroke();
    };
    drawCornerFlourish(12, 12, 1, 1);
    drawCornerFlourish(w - 12, 12, -1, 1);
    drawCornerFlourish(12, 83, 1, -1);
    drawCornerFlourish(w - 12, 83, -1, -1);

    // Shield with crest
    ctx.save();
    ctx.translate(55, 50);
    ctx.fillStyle = royalBlue;
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.lineTo(20, -20);
    ctx.lineTo(20, 5);
    ctx.quadraticCurveTo(20, 25, 0, 30);
    ctx.quadraticCurveTo(-20, 25, -20, 5);
    ctx.lineTo(-20, -20);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Cross on shield
    ctx.fillStyle = gold;
    ctx.fillRect(-3, -18, 6, 40);
    ctx.fillRect(-12, -5, 24, 6);
    ctx.restore();

    // Crossed swords
    ctx.save();
    ctx.translate(w - 60, 50);
    ctx.strokeStyle = '#808080';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-25, -20);
    ctx.lineTo(25, 20);
    ctx.moveTo(25, -20);
    ctx.lineTo(-25, 20);
    ctx.stroke();
    // Hilts
    ctx.fillStyle = gold;
    ctx.fillRect(-28, -23, 8, 8);
    ctx.fillRect(20, -23, 8, 8);
    ctx.restore();

    // HALCYON in medieval script
    ctx.textAlign = 'center';
    ctx.font = 'bold 46px serif';
    ctx.fillStyle = darkBrown;
    ctx.fillText('HALCYON', w/2 + 2, 57);
    ctx.fillStyle = crimson;
    ctx.fillText('HALCYON', w/2, 55);

    // Decorative divider
    ctx.fillStyle = gold;
    ctx.fillRect(w/2 - 80, 70, 160, 2);
    ctx.beginPath();
    ctx.arc(w/2, 71, 5, 0, Math.PI * 2);
    ctx.fill();

    // Subtitle
    ctx.font = '10px serif';
    ctx.fillStyle = darkBrown;
    ctx.fillText('Subdomain Registry', w/2, 85);

    // Domain
    ctx.font = 'bold 28px serif';
    ctx.fillStyle = darkBrown;
    ctx.fillText(domain, w/2 + 1, h - 40);
    ctx.fillStyle = crimson;
    ctx.fillText(domain, w/2, h - 42);

    // Crown
    ctx.save();
    ctx.translate(w/2, h - 70);
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.moveTo(-20, 10);
    ctx.lineTo(-20, 0);
    ctx.lineTo(-15, -8);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-5, -12);
    ctx.lineTo(0, 0);
    ctx.lineTo(5, -12);
    ctx.lineTo(10, 0);
    ctx.lineTo(15, -8);
    ctx.lineTo(20, 0);
    ctx.lineTo(20, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = crimson;
    ctx.beginPath();
    ctx.arc(-10, -2, 3, 0, Math.PI * 2);
    ctx.arc(0, -6, 3, 0, Math.PI * 2);
    ctx.arc(10, -2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Dragon silhouette
    ctx.fillStyle = 'rgba(61, 43, 31, 0.2)';
    ctx.save();
    ctx.translate(w - 100, h - 55);
    ctx.scale(0.4, 0.4);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(20, -30, 50, -20);
    ctx.quadraticCurveTo(70, -25, 80, -10);
    ctx.lineTo(90, -15);
    ctx.lineTo(85, -5);
    ctx.quadraticCurveTo(75, 5, 60, 0);
    ctx.quadraticCurveTo(40, 10, 20, 5);
    ctx.quadraticCurveTo(10, 15, 0, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

// ========== SYNTHWAVE STYLE ==========
function applySynthwaveWatermark(ctx, w, h, domain) {
    const darkPurple = '#1a0a2e';
    const neonPink = '#ff00ff';
    const neonBlue = '#00ffff';
    const hotPink = '#ff1493';
    const electricPurple = '#bf00ff';
    const sunOrange = '#ff6b35';
    const sunYellow = '#ffcc00';

    // Dark gradient background
    const topGrad = ctx.createLinearGradient(0, 0, 0, 95);
    topGrad.addColorStop(0, '#0a0015');
    topGrad.addColorStop(0.5, darkPurple);
    topGrad.addColorStop(1, '#2a0a4e');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, 95);

    const bottomGrad = ctx.createLinearGradient(0, h - 90, 0, h);
    bottomGrad.addColorStop(0, '#2a0a4e');
    bottomGrad.addColorStop(0.5, darkPurple);
    bottomGrad.addColorStop(1, '#0a0015');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, h - 90, w, 90);

    // Perspective grid floor
    ctx.strokeStyle = neonPink;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    // Horizontal lines
    for (let i = 0; i < 8; i++) {
        const y = 60 + i * 5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
    // Vertical perspective lines
    for (let i = -5; i <= 5; i++) {
        ctx.beginPath();
        ctx.moveTo(w/2 + i * 20, 55);
        ctx.lineTo(w/2 + i * 80, 95);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Sun/sunset gradient
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, 55);
    ctx.clip();
    const sunGrad = ctx.createLinearGradient(w/2, 0, w/2, 60);
    sunGrad.addColorStop(0, sunYellow);
    sunGrad.addColorStop(0.4, sunOrange);
    sunGrad.addColorStop(0.7, hotPink);
    sunGrad.addColorStop(1, electricPurple);
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(w/2, 55, 45, 0, Math.PI * 2);
    ctx.fill();
    // Sun stripes
    ctx.fillStyle = darkPurple;
    for (let i = 0; i < 6; i++) {
        ctx.fillRect(w/2 - 45, 25 + i * 8, 90, 3);
    }
    ctx.restore();

    // Neon border glow
    ctx.strokeStyle = neonPink;
    ctx.shadowColor = neonPink;
    ctx.shadowBlur = 15;
    ctx.lineWidth = 3;
    ctx.strokeRect(5, 5, w - 10, 85);
    ctx.strokeStyle = neonBlue;
    ctx.shadowColor = neonBlue;
    ctx.strokeRect(5, h - 85, w - 10, 80);
    ctx.shadowBlur = 0;

    // HALCYON in chrome/neon style
    ctx.textAlign = 'center';
    ctx.font = 'bold italic 50px sans-serif';
    // Chrome gradient
    const chromeGrad = ctx.createLinearGradient(w/2 - 100, 20, w/2 + 100, 60);
    chromeGrad.addColorStop(0, neonBlue);
    chromeGrad.addColorStop(0.3, '#FFFFFF');
    chromeGrad.addColorStop(0.5, neonPink);
    chromeGrad.addColorStop(0.7, '#FFFFFF');
    chromeGrad.addColorStop(1, neonBlue);
    ctx.shadowColor = neonPink;
    ctx.shadowBlur = 20;
    ctx.fillStyle = chromeGrad;
    ctx.fillText('HALCYON', w/2, 45);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.font = '12px sans-serif';
    ctx.fillStyle = neonBlue;
    ctx.shadowColor = neonBlue;
    ctx.shadowBlur = 8;
    ctx.fillText('◆ RETRO FUTURE ◆', w/2, 82);
    ctx.shadowBlur = 0;

    // Palm tree silhouettes
    const drawPalm = (x, y, size) => {
        ctx.fillStyle = '#000000';
        // Trunk
        ctx.fillRect(x - 2, y, 4, size);
        // Fronds
        for (let i = 0; i < 5; i++) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(-0.8 + i * 0.4);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(size * 0.3, -size * 0.5, size * 0.8, -size * 0.3);
            ctx.quadraticCurveTo(size * 0.4, -size * 0.3, 0, 0);
            ctx.fill();
            ctx.restore();
        }
    };
    drawPalm(40, 55, 35);
    drawPalm(w - 45, 58, 30);

    // Domain with glow
    ctx.font = 'bold italic 32px sans-serif';
    ctx.shadowColor = neonPink;
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(domain, w/2, h - 40);
    ctx.shadowBlur = 0;

    // Stars
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 30; i++) {
        const x = Math.random() * w;
        const y = Math.random() * 50;
        ctx.globalAlpha = 0.3 + Math.random() * 0.7;
        ctx.beginPath();
        ctx.arc(x, y, Math.random() * 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Neon triangle
    ctx.strokeStyle = neonBlue;
    ctx.shadowColor = neonBlue;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w/2, h - 82);
    ctx.lineTo(w/2 - 25, h - 55);
    ctx.lineTo(w/2 + 25, h - 55);
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;
}

// ========== ORIGAMI / JAPANESE PAPER STYLE ==========
function applyOrigamiWatermark(ctx, w, h, domain) {
    const washi = '#F5F5DC';
    const sakuraPink = '#FFB7C5';
    const forestGreen = '#228B22';
    const oceanBlue = '#4682B4';
    const inkBlack = '#1a1a1a';
    const gold = '#D4AF37';

    // Washi paper background
    ctx.fillStyle = washi;
    ctx.fillRect(0, 0, w, 95);
    ctx.fillRect(0, h - 90, w, 90);

    // Paper texture - subtle fibers
    ctx.strokeStyle = 'rgba(200, 180, 150, 0.15)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 100; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * w, Math.random() * 95);
        ctx.lineTo(Math.random() * w, Math.random() * 95);
        ctx.stroke();
    }

    // Origami crane (left side)
    ctx.save();
    ctx.translate(50, 50);
    ctx.fillStyle = sakuraPink;
    // Body
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(15, -15);
    ctx.lineTo(25, 0);
    ctx.lineTo(15, 15);
    ctx.closePath();
    ctx.fill();
    // Wings
    ctx.beginPath();
    ctx.moveTo(15, -15);
    ctx.lineTo(35, -25);
    ctx.lineTo(25, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(15, 15);
    ctx.lineTo(35, 25);
    ctx.lineTo(25, 0);
    ctx.fill();
    // Head
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-15, -5);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-15, 5);
    ctx.closePath();
    ctx.fill();
    // Fold lines
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(25, 0);
    ctx.stroke();
    ctx.restore();

    // Origami boat (right side)
    ctx.save();
    ctx.translate(w - 60, 55);
    ctx.fillStyle = oceanBlue;
    ctx.beginPath();
    ctx.moveTo(-25, 10);
    ctx.lineTo(-15, -5);
    ctx.lineTo(0, -15);
    ctx.lineTo(15, -5);
    ctx.lineTo(25, 10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.lineTo(0, 10);
    ctx.stroke();
    ctx.restore();

    // Japanese wave pattern border
    ctx.strokeStyle = oceanBlue;
    ctx.lineWidth = 2;
    for (let x = 0; x < w; x += 20) {
        ctx.beginPath();
        ctx.arc(x, 90, 10, Math.PI, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, h - 90, 10, 0, Math.PI);
        ctx.stroke();
    }

    // HALCYON in brush stroke style
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px serif';
    ctx.fillStyle = inkBlack;
    ctx.fillText('HALCYON', w/2, 50);

    // Japanese characters decoration
    ctx.font = '14px serif';
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillText('折り紙', w/2 - 100, 75);
    ctx.fillText('美しい', w/2 + 100, 75);

    // Subtitle
    ctx.font = '11px serif';
    ctx.fillStyle = inkBlack;
    ctx.fillText('Subdomain Registry', w/2, 82);

    // Domain
    ctx.font = 'bold 28px serif';
    ctx.fillStyle = inkBlack;
    ctx.fillText(domain, w/2, h - 40);

    // Cherry blossom petals
    const drawPetal = (x, y, size, rotation) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.fillStyle = sakuraPink;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.ellipse(0, 0, size, size * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
    };
    for (let i = 0; i < 15; i++) {
        drawPetal(Math.random() * w, Math.random() * 95, 4 + Math.random() * 4, Math.random() * Math.PI);
        drawPetal(Math.random() * w, h - 90 + Math.random() * 90, 3 + Math.random() * 4, Math.random() * Math.PI);
    }

    // Origami frog (bottom center)
    ctx.save();
    ctx.translate(w/2, h - 65);
    ctx.fillStyle = forestGreen;
    // Body
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(12, 0);
    ctx.lineTo(8, 12);
    ctx.lineTo(-8, 12);
    ctx.lineTo(-12, 0);
    ctx.closePath();
    ctx.fill();
    // Eyes
    ctx.fillStyle = '#90EE90';
    ctx.beginPath();
    ctx.arc(-5, -5, 4, 0, Math.PI * 2);
    ctx.arc(5, -5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = inkBlack;
    ctx.beginPath();
    ctx.arc(-5, -5, 2, 0, Math.PI * 2);
    ctx.arc(5, -5, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Gold seal stamp
    ctx.fillStyle = gold;
    ctx.fillRect(w - 45, h - 80, 30, 30);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px serif';
    ctx.fillText('登', w - 30, h - 60);
}

// ========== ART DECO STYLE ==========
function applyDecoWatermark(ctx, w, h, domain) {
    const black = '#0a0a0a';
    const gold = '#D4AF37';
    const brightGold = '#FFD700';
    const cream = '#F5F5DC';
    const teal = '#008080';
    const coral = '#FF6F61';
    const silver = '#C0C0C0';

    // Black background
    ctx.fillStyle = black;
    ctx.fillRect(0, 0, w, 95);
    ctx.fillRect(0, h - 90, w, 90);

    // Art deco sunburst pattern (more rays)
    ctx.save();
    ctx.translate(w/2, 95);
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 30; i++) {
        const angle = (i / 30) * Math.PI - Math.PI;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * 250, Math.sin(angle) * 120);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Triple geometric border pattern
    ctx.strokeStyle = gold;
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, w - 6, 89);
    ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, w - 16, 79);
    ctx.strokeRect(12, 12, w - 24, 71);

    // Detailed corner chevrons with accents
    const drawChevronCorner = (x, y, flipX, flipY) => {
        ctx.fillStyle = gold;
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(x, y + (8 + i * 7) * flipY);
            ctx.lineTo(x + (8 + i * 7) * flipX, y);
            ctx.lineTo(x + (12 + i * 7) * flipX, y);
            ctx.lineTo(x, y + (12 + i * 7) * flipY);
            ctx.closePath();
            ctx.fill();
        }
        // Diamond accent
        ctx.fillStyle = teal;
        ctx.beginPath();
        ctx.moveTo(x + 6 * flipX, y + 6 * flipY);
        ctx.lineTo(x + 12 * flipX, y + 12 * flipY);
        ctx.lineTo(x + 6 * flipX, y + 18 * flipY);
        ctx.lineTo(x, y + 12 * flipY);
        ctx.closePath();
        ctx.fill();
    };
    drawChevronCorner(15, 15, 1, 1);
    drawChevronCorner(w - 15, 15, -1, 1);
    drawChevronCorner(15, 80, 1, -1);
    drawChevronCorner(w - 15, 80, -1, -1);

    // Detailed Art Deco star (top center)
    ctx.save();
    ctx.translate(w/2, 25);
    // Outer star with many points
    ctx.fillStyle = gold;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? 18 : 8;
        if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
        else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    ctx.closePath();
    ctx.fill();
    // Inner circle
    ctx.fillStyle = teal;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    // Center dot
    ctx.fillStyle = brightGold;
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    // Radiating lines
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 20, Math.sin(angle) * 20);
        ctx.lineTo(Math.cos(angle) * 28, Math.sin(angle) * 28);
        ctx.stroke();
    }
    ctx.restore();

    // Fan motif (left) - more detailed
    ctx.save();
    ctx.translate(55, 60);
    // Outer fans
    ctx.fillStyle = teal;
    for (let i = 0; i < 9; i++) {
        ctx.save();
        ctx.rotate(-0.6 + i * 0.15);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-6, -32);
        ctx.lineTo(6, -32);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    // Gold accents
    ctx.fillStyle = gold;
    for (let i = 0; i < 5; i++) {
        ctx.save();
        ctx.rotate(-0.4 + i * 0.2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-2, -25);
        ctx.lineTo(2, -25);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    // Base circle
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = black;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Fan motif (right) - more detailed
    ctx.save();
    ctx.translate(w - 55, 60);
    ctx.fillStyle = coral;
    for (let i = 0; i < 9; i++) {
        ctx.save();
        ctx.rotate(-0.6 + i * 0.15);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-6, -32);
        ctx.lineTo(6, -32);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    ctx.fillStyle = gold;
    for (let i = 0; i < 5; i++) {
        ctx.save();
        ctx.rotate(-0.4 + i * 0.2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-2, -25);
        ctx.lineTo(2, -25);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = black;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // HALCYON in deco style
    ctx.textAlign = 'center';
    ctx.font = 'bold 46px sans-serif';
    const goldGrad = ctx.createLinearGradient(w/2 - 100, 30, w/2 + 100, 70);
    goldGrad.addColorStop(0, '#8B7355');
    goldGrad.addColorStop(0.2, gold);
    goldGrad.addColorStop(0.4, brightGold);
    goldGrad.addColorStop(0.6, gold);
    goldGrad.addColorStop(0.8, brightGold);
    goldGrad.addColorStop(1, '#8B7355');
    ctx.fillStyle = goldGrad;
    ctx.fillText('HALCYON', w/2, 70);

    // Decorative line with diamonds
    ctx.fillStyle = gold;
    ctx.fillRect(w/2 - 110, 80, 220, 2);
    // Center diamond
    ctx.beginPath();
    ctx.moveTo(w/2, 75);
    ctx.lineTo(w/2 + 6, 81);
    ctx.lineTo(w/2, 87);
    ctx.lineTo(w/2 - 6, 81);
    ctx.closePath();
    ctx.fill();
    // Side diamonds
    ctx.beginPath();
    ctx.moveTo(w/2 - 50, 78);
    ctx.lineTo(w/2 - 46, 81);
    ctx.lineTo(w/2 - 50, 84);
    ctx.lineTo(w/2 - 54, 81);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w/2 + 50, 78);
    ctx.lineTo(w/2 + 54, 81);
    ctx.lineTo(w/2 + 50, 84);
    ctx.lineTo(w/2 + 46, 81);
    ctx.closePath();
    ctx.fill();

    // Bottom border
    ctx.strokeStyle = gold;
    ctx.lineWidth = 3;
    ctx.strokeRect(3, h - 87, w - 6, 84);
    ctx.lineWidth = 1;
    ctx.strokeRect(8, h - 82, w - 16, 74);
    ctx.strokeRect(12, h - 78, w - 24, 66);

    // Bottom chevrons
    drawChevronCorner(15, h - 80, 1, 1);
    drawChevronCorner(w - 15, h - 80, -1, 1);
    drawChevronCorner(15, h - 15, 1, -1);
    drawChevronCorner(w - 15, h - 15, -1, -1);

    // Domain
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = goldGrad;
    ctx.fillText(domain, w/2, h - 38);

    // Elaborate geometric diamond at bottom center
    ctx.save();
    ctx.translate(w/2, h - 65);
    // Outer diamond
    ctx.strokeStyle = gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(18, 0);
    ctx.lineTo(0, 18);
    ctx.lineTo(-18, 0);
    ctx.closePath();
    ctx.stroke();
    // Mid diamond
    ctx.fillStyle = teal;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(12, 0);
    ctx.lineTo(0, 12);
    ctx.lineTo(-12, 0);
    ctx.closePath();
    ctx.fill();
    // Inner diamond
    ctx.fillStyle = coral;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(6, 0);
    ctx.lineTo(0, 6);
    ctx.lineTo(-6, 0);
    ctx.closePath();
    ctx.fill();
    // Center circle
    ctx.fillStyle = brightGold;
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Side stars
    const drawDecoStar = (x, y, size) => {
        ctx.fillStyle = gold;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
            const r = i % 2 === 0 ? size : size * 0.4;
            if (i === 0) ctx.moveTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
            else ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.fill();
    };
    drawDecoStar(50, h - 65, 10);
    drawDecoStar(w - 50, h - 65, 10);
}

// ========== JUNGLE / TROPICAL STYLE ==========
function applyJungleWatermark(ctx, w, h, domain) {
    const jungleGreen = '#228B22';
    const darkGreen = '#006400';
    const leafGreen = '#32CD32';
    const limeGreen = '#90EE90';
    const tropicalOrange = '#FF6B35';
    const tropicalPink = '#FF69B4';
    const tropicalYellow = '#FFD700';
    const skyBlue = '#87CEEB';
    const brown = '#8B4513';
    const darkBrown = '#5D4037';

    // Vibrant sky gradient background
    const topGrad = ctx.createLinearGradient(0, 0, 0, 95);
    topGrad.addColorStop(0, '#5BC0EB');
    topGrad.addColorStop(0.4, '#98D8C8');
    topGrad.addColorStop(0.7, leafGreen);
    topGrad.addColorStop(1, jungleGreen);
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, 95);

    const bottomGrad = ctx.createLinearGradient(0, h - 90, 0, h);
    bottomGrad.addColorStop(0, jungleGreen);
    bottomGrad.addColorStop(0.3, leafGreen);
    bottomGrad.addColorStop(0.6, '#98D8C8');
    bottomGrad.addColorStop(1, '#5BC0EB');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, h - 90, w, 90);

    // More detailed monstera leaves with multiple holes
    const drawMonsteraLeaf = (x, y, size, flip, color) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(flip ? -1 : 1, 1);
        ctx.fillStyle = color || darkGreen;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(size * 0.3, -size * 0.4, size * 0.7, -size * 0.2);
        ctx.quadraticCurveTo(size, -size * 0.1, size * 1.1, size * 0.1);
        ctx.quadraticCurveTo(size * 0.9, size * 0.3, size * 0.7, size * 0.2);
        ctx.quadraticCurveTo(size * 0.6, size * 0.5, size * 0.4, size * 0.3);
        ctx.quadraticCurveTo(size * 0.3, size * 0.6, size * 0.1, size * 0.4);
        ctx.quadraticCurveTo(0, size * 0.2, 0, 0);
        ctx.closePath();
        ctx.fill();
        // Multiple holes
        ctx.fillStyle = topGrad;
        ctx.beginPath();
        ctx.ellipse(size * 0.35, -size * 0.05, size * 0.08, size * 0.12, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(size * 0.55, size * 0.15, size * 0.06, size * 0.1, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(size * 0.25, size * 0.2, size * 0.05, size * 0.08, 0.5, 0, Math.PI * 2);
        ctx.fill();
        // Leaf vein
        ctx.strokeStyle = 'rgba(0, 50, 0, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(size * 0.5, size * 0.1, size * 0.9, size * 0.05);
        ctx.stroke();
        ctx.restore();
    };
    // Top leaves - varied colors
    drawMonsteraLeaf(0, 25, 70, false, darkGreen);
    drawMonsteraLeaf(w, 20, 65, true, jungleGreen);
    drawMonsteraLeaf(25, 65, 50, false, leafGreen);
    drawMonsteraLeaf(w - 35, 60, 55, true, darkGreen);

    // Detailed palm fronds with individual leaves
    const drawPalmFrond = (x, y, length, angle, color) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        // Stem
        ctx.strokeStyle = darkBrown;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(length, 0);
        ctx.stroke();
        // Individual leaflets
        ctx.fillStyle = color || leafGreen;
        for (let i = 2; i < length - 5; i += 4) {
            const leafLen = 12 * (1 - i / length);
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.quadraticCurveTo(i + leafLen * 0.5, -leafLen, i + leafLen, -leafLen * 0.3);
            ctx.quadraticCurveTo(i + leafLen * 0.7, 0, i, 0);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.quadraticCurveTo(i + leafLen * 0.5, leafLen, i + leafLen, leafLen * 0.3);
            ctx.quadraticCurveTo(i + leafLen * 0.7, 0, i, 0);
            ctx.fill();
        }
        ctx.restore();
    };
    drawPalmFrond(75, 8, 55, 0.4, leafGreen);
    drawPalmFrond(95, 5, 45, 0.6, limeGreen);
    drawPalmFrond(w - 85, 12, 50, 2.5, leafGreen);
    drawPalmFrond(w - 100, 8, 40, 2.7, limeGreen);

    // Detailed vines with curls
    ctx.strokeStyle = darkGreen;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 45);
    ctx.bezierCurveTo(25, 35, 45, 55, 65, 40);
    ctx.bezierCurveTo(85, 25, 100, 50, 120, 35);
    ctx.stroke();
    // Vine curls
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(70, 45, 8, 0, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w, 50);
    ctx.bezierCurveTo(w - 30, 40, w - 50, 60, w - 70, 45);
    ctx.bezierCurveTo(w - 90, 30, w - 110, 55, w - 130, 40);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w - 75, 50, 6, Math.PI, Math.PI * 2.5);
    ctx.stroke();

    // Multiple tropical flowers
    const drawFlower = (cx, cy, size, petalColor, centerColor) => {
        ctx.fillStyle = petalColor;
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            ctx.beginPath();
            ctx.ellipse(cx + Math.cos(angle) * size * 0.8, cy + Math.sin(angle) * size * 0.8, size * 0.5, size * 0.25, angle, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = centerColor;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.35, 0, Math.PI * 2);
        ctx.fill();
        // Stamen dots
        ctx.fillStyle = '#FFA500';
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(angle) * size * 0.2, cy + Math.sin(angle) * size * 0.2, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    };
    drawFlower(105, 40, 12, tropicalOrange, tropicalYellow);
    drawFlower(130, 60, 8, tropicalPink, '#FFFFFF');
    drawFlower(w - 115, 45, 10, tropicalPink, tropicalYellow);
    drawFlower(w - 140, 65, 7, tropicalOrange, '#FFFFFF');

    // Hibiscus flower accent
    ctx.save();
    ctx.translate(w/2 + 80, 35);
    ctx.fillStyle = '#FF1493';
    for (let i = 0; i < 5; i++) {
        ctx.save();
        ctx.rotate((i / 5) * Math.PI * 2);
        ctx.beginPath();
        ctx.ellipse(0, -12, 8, 15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    ctx.fillStyle = tropicalYellow;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    // Pistil
    ctx.strokeStyle = '#FF69B4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -20);
    ctx.stroke();
    ctx.fillStyle = tropicalYellow;
    ctx.beginPath();
    ctx.arc(0, -20, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // HALCYON in jungle style with leaf shadow
    ctx.textAlign = 'center';
    ctx.font = 'bold 46px sans-serif';
    ctx.fillStyle = 'rgba(0, 50, 0, 0.3)';
    ctx.fillText('HALCYON', w/2 + 3, 58);
    ctx.fillStyle = brown;
    ctx.fillText('HALCYON', w/2 + 1, 56);
    ctx.fillStyle = '#FFFEF0';
    ctx.fillText('HALCYON', w/2, 55);

    // Subtitle with leaf icons
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#FFFEF0';
    ctx.fillText('Subdomain Registry', w/2, 78);

    // Wooden bamboo border
    ctx.fillStyle = brown;
    ctx.fillRect(0, 90, w, 5);
    ctx.fillRect(0, h - 93, w, 5);
    // Bamboo nodes
    ctx.fillStyle = darkBrown;
    for (let x = 0; x < w; x += 40) {
        ctx.fillRect(x, 90, 3, 5);
        ctx.fillRect(x + 20, h - 93, 3, 5);
    }

    // Domain
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = 'rgba(0, 50, 0, 0.3)';
    ctx.fillText(domain, w/2 + 2, h - 38);
    ctx.fillStyle = brown;
    ctx.fillText(domain, w/2 + 1, h - 40);
    ctx.fillStyle = '#FFFEF0';
    ctx.fillText(domain, w/2, h - 42);

    // Detailed Toucan
    ctx.save();
    ctx.translate(50, h - 58);
    // Body
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 14, -0.2, 0, Math.PI * 2);
    ctx.fill();
    // White chest
    ctx.fillStyle = '#FFFEF0';
    ctx.beginPath();
    ctx.ellipse(5, 5, 8, 10, -0.2, 0, Math.PI * 2);
    ctx.fill();
    // Colorful beak
    const beakGrad = ctx.createLinearGradient(12, -8, 40, 5);
    beakGrad.addColorStop(0, tropicalOrange);
    beakGrad.addColorStop(0.3, tropicalYellow);
    beakGrad.addColorStop(0.6, leafGreen);
    beakGrad.addColorStop(1, '#FF0000');
    ctx.fillStyle = beakGrad;
    ctx.beginPath();
    ctx.moveTo(12, -6);
    ctx.quadraticCurveTo(45, -2, 40, 5);
    ctx.quadraticCurveTo(30, 10, 12, 8);
    ctx.closePath();
    ctx.fill();
    // Beak tip
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(40, 2, 4, 0, Math.PI * 2);
    ctx.fill();
    // Eye ring
    ctx.fillStyle = '#00BFFF';
    ctx.beginPath();
    ctx.arc(3, -4, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(3, -4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(4, -4, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Colorful Parrot
    ctx.save();
    ctx.translate(w - 55, h - 55);
    // Body
    ctx.fillStyle = '#00AA00';
    ctx.beginPath();
    ctx.ellipse(0, 5, 14, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    // Head
    ctx.fillStyle = '#FF0000';
    ctx.beginPath();
    ctx.ellipse(0, -15, 12, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // Wing
    ctx.fillStyle = '#0066CC';
    ctx.beginPath();
    ctx.ellipse(-8, 8, 8, 14, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // Yellow accent
    ctx.fillStyle = tropicalYellow;
    ctx.beginPath();
    ctx.ellipse(0, -8, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Beak
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.moveTo(8, -18);
    ctx.quadraticCurveTo(18, -15, 12, -12);
    ctx.quadraticCurveTo(10, -14, 8, -18);
    ctx.fill();
    // Eye
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(4, -16, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(5, -16, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // More bottom leaves
    drawMonsteraLeaf(5, h - 25, 55, false, darkGreen);
    drawMonsteraLeaf(w - 15, h - 20, 50, true, jungleGreen);
    drawMonsteraLeaf(80, h - 35, 35, false, leafGreen);
    drawMonsteraLeaf(w - 90, h - 30, 40, true, leafGreen);

    // Butterfly
    ctx.save();
    ctx.translate(w/2 - 50, h - 70);
    ctx.fillStyle = '#FF6B35';
    ctx.beginPath();
    ctx.ellipse(-8, 0, 10, 6, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(8, 0, 10, 6, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-1, -8, 2, 12);
    // Spots
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-8, 0, 3, 0, Math.PI * 2);
    ctx.arc(8, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// ========== COMIC / POP ART STYLE ==========
function applyComicWatermark(ctx, w, h, domain) {
    const yellow = '#FFFF00';
    const red = '#FF0000';
    const blue = '#0000FF';
    const white = '#FFFFFF';
    const black = '#000000';
    const pink = '#FF69B4';

    // Halftone dot background
    ctx.fillStyle = yellow;
    ctx.fillRect(0, 0, w, 95);
    ctx.fillRect(0, h - 90, w, 90);

    // Halftone dots
    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    for (let x = 0; x < w; x += 8) {
        for (let y = 0; y < 95; y += 8) {
            const size = 2 + Math.sin(x * 0.1) * Math.cos(y * 0.1) * 1.5;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    for (let x = 0; x < w; x += 8) {
        for (let y = h - 90; y < h; y += 8) {
            const size = 2 + Math.sin(x * 0.1) * Math.cos(y * 0.1) * 1.5;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // POW burst (left)
    ctx.save();
    ctx.translate(50, 50);
    ctx.fillStyle = red;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const r = i % 2 === 0 ? 30 : 18;
        ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = black;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = yellow;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('POW!', 0, 5);
    ctx.restore();

    // ZAP burst (right) - properly aligned star
    ctx.save();
    ctx.translate(w - 60, 48);
    // Draw properly aligned star burst
    ctx.fillStyle = blue;
    ctx.beginPath();
    const zapPoints = 12;
    const outerR = 28;
    const innerR = 16;
    for (let i = 0; i < zapPoints; i++) {
        const angle = (i / zapPoints) * Math.PI * 2 - Math.PI / 2; // Start from top
        const r = i % 2 === 0 ? outerR : innerR;
        if (i === 0) {
            ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
        } else {
            ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = black;
    ctx.lineWidth = 3;
    ctx.stroke();
    // Inner highlight
    ctx.fillStyle = '#4444FF';
    ctx.beginPath();
    for (let i = 0; i < zapPoints; i++) {
        const angle = (i / zapPoints) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? outerR * 0.6 : innerR * 0.6;
        if (i === 0) {
            ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
        } else {
            ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = white;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ZAP!', 0, 5);
    ctx.restore();

    // HALCYON in comic style
    ctx.textAlign = 'center';
    ctx.font = 'bold 52px sans-serif';
    // Shadow
    ctx.fillStyle = black;
    ctx.fillText('HALCYON', w/2 + 4, 60);
    // Outline
    ctx.strokeStyle = black;
    ctx.lineWidth = 4;
    ctx.strokeText('HALCYON', w/2, 55);
    // Fill with gradient
    const comicGrad = ctx.createLinearGradient(w/2 - 100, 20, w/2 + 100, 60);
    comicGrad.addColorStop(0, red);
    comicGrad.addColorStop(0.5, yellow);
    comicGrad.addColorStop(1, red);
    ctx.fillStyle = comicGrad;
    ctx.fillText('HALCYON', w/2, 55);

    // Speech bubble subtitle
    ctx.fillStyle = white;
    ctx.strokeStyle = black;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(w/2, 78, 70, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Tail
    ctx.beginPath();
    ctx.moveTo(w/2 - 10, 88);
    ctx.lineTo(w/2, 95);
    ctx.lineTo(w/2 + 5, 88);
    ctx.fill();
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = black;
    ctx.fillText('Subdomain Registry', w/2, 82);

    // Bold border
    ctx.strokeStyle = black;
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, w - 6, 89);
    ctx.strokeRect(3, h - 88, w - 6, 85);

    // Domain in comic style
    ctx.font = 'bold 32px sans-serif';
    ctx.fillStyle = black;
    ctx.fillText(domain, w/2 + 3, h - 38);
    ctx.strokeStyle = black;
    ctx.lineWidth = 3;
    ctx.strokeText(domain, w/2, h - 40);
    ctx.fillStyle = white;
    ctx.fillText(domain, w/2, h - 40);

    // Action lines
    ctx.strokeStyle = black;
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(20 + i * 5, h - 85);
        ctx.lineTo(10 + i * 3, h - 70);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w - 25 - i * 5, h - 85);
        ctx.lineTo(w - 15 - i * 3, h - 70);
        ctx.stroke();
    }

    // BOOM burst bottom
    ctx.save();
    ctx.translate(w/2, h - 65);
    ctx.fillStyle = pink;
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
        const angle = (i / 14) * Math.PI * 2;
        const r = i % 2 === 0 ? 20 : 12;
        ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = black;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = black;
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('BOOM!', 0, 4);
    ctx.restore();
}

// ========== LASER TAG / ARCADE LASER STYLE ==========
function applyLaserWatermark(ctx, w, h, domain) {
    const black = '#0a0a0a';
    const laserRed = '#FF0000';
    const laserGreen = '#00FF00';
    const laserBlue = '#00BFFF';
    const laserPurple = '#9400D3';
    const laserYellow = '#FFFF00';

    // Dark background
    ctx.fillStyle = black;
    ctx.fillRect(0, 0, w, 95);
    ctx.fillRect(0, h - 90, w, 90);

    // Laser grid
    ctx.strokeStyle = laserGreen;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    for (let x = 0; x < w; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 95);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, h - 90);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    for (let y = 0; y < 95; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
    for (let y = h - 90; y < h; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Crossing laser beams
    const drawLaser = (x1, y1, x2, y2, color) => {
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#FFFFFF';
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    };

    // Top lasers
    drawLaser(0, 20, w, 70, laserRed);
    drawLaser(0, 70, w, 20, laserBlue);
    drawLaser(50, 0, 150, 95, laserPurple);
    drawLaser(w - 60, 0, w - 160, 95, laserGreen);

    // Bottom lasers
    drawLaser(0, h - 70, w, h - 20, laserGreen);
    drawLaser(0, h - 20, w, h - 70, laserPurple);
    drawLaser(100, h - 90, 200, h, laserRed);
    drawLaser(w - 110, h - 90, w - 210, h, laserBlue);

    // Target reticle (left)
    ctx.strokeStyle = laserRed;
    ctx.shadowColor = laserRed;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(50, 50, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(50, 25);
    ctx.lineTo(50, 40);
    ctx.moveTo(50, 60);
    ctx.lineTo(50, 75);
    ctx.moveTo(25, 50);
    ctx.lineTo(40, 50);
    ctx.moveTo(60, 50);
    ctx.lineTo(75, 50);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Target reticle (right)
    ctx.strokeStyle = laserBlue;
    ctx.shadowColor = laserBlue;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(w - 55, 45, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w - 55, 22);
    ctx.lineTo(w - 55, 35);
    ctx.moveTo(w - 55, 55);
    ctx.lineTo(w - 55, 68);
    ctx.moveTo(w - 78, 45);
    ctx.lineTo(w - 65, 45);
    ctx.moveTo(w - 45, 45);
    ctx.lineTo(w - 32, 45);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // HALCYON with laser glow
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px sans-serif';
    const colors = [laserRed, laserYellow, laserGreen, laserBlue, laserPurple];
    // Rainbow laser text
    ctx.save();
    const text = 'HALCYON';
    const startX = w/2 - 95;
    ctx.font = 'bold 48px sans-serif';
    for (let i = 0; i < text.length; i++) {
        const color = colors[i % colors.length];
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.fillText(text[i], startX + i * 28, 55);
    }
    ctx.shadowBlur = 0;
    ctx.restore();

    // Subtitle
    ctx.font = '12px sans-serif';
    ctx.fillStyle = laserGreen;
    ctx.shadowColor = laserGreen;
    ctx.shadowBlur = 8;
    ctx.fillText('Subdomain Registry', w/2, 82);
    ctx.shadowBlur = 0;

    // Neon border
    ctx.strokeStyle = laserPurple;
    ctx.shadowColor = laserPurple;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.strokeRect(5, 5, w - 10, 85);
    ctx.strokeStyle = laserGreen;
    ctx.shadowColor = laserGreen;
    ctx.strokeRect(5, h - 85, w - 10, 80);
    ctx.shadowBlur = 0;

    // Domain with glow
    ctx.font = 'bold 30px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = laserBlue;
    ctx.shadowBlur = 20;
    ctx.fillText(domain, w/2, h - 40);
    ctx.shadowBlur = 0;

    // Bottom targets
    ctx.strokeStyle = laserYellow;
    ctx.shadowColor = laserYellow;
    ctx.shadowBlur = 8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(60, h - 60, 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(60, h - 60, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w - 65, h - 55, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w - 65, h - 55, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Score display
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = laserGreen;
    ctx.textAlign = 'left';
    ctx.fillText('SCORE: 50000', 15, 88);
    ctx.textAlign = 'right';
    ctx.fillText('HITS: 99', w - 15, 88);
}

function applyVintageWatermark(ctx, w, h, domain) {
    const sepia = '#704214';
    const cream = '#F5F5DC';
    const brown = '#8B4513';
    const darkBrown = '#3E2723';
    const gold = '#DAA520';

    // Aged paper background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 95);
    bgGrad.addColorStop(0, '#D4C4A8');
    bgGrad.addColorStop(0.5, cream);
    bgGrad.addColorStop(1, '#C4B498');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, 95);

    const bgGrad2 = ctx.createLinearGradient(0, h - 90, 0, h);
    bgGrad2.addColorStop(0, '#C4B498');
    bgGrad2.addColorStop(0.5, cream);
    bgGrad2.addColorStop(1, '#D4C4A8');
    ctx.fillStyle = bgGrad2;
    ctx.fillRect(0, h - 90, w, 90);

    // Film strip perforations (top)
    ctx.fillStyle = darkBrown;
    for (let x = 20; x < w - 20; x += 35) {
        ctx.fillRect(x, 5, 15, 8);
        ctx.fillRect(x, 82, 15, 8);
    }

    // Film strip perforations (bottom)
    for (let x = 20; x < w - 20; x += 35) {
        ctx.fillRect(x, h - 90 + 5, 15, 8);
        ctx.fillRect(x, h - 13, 15, 8);
    }

    // Vintage camera (left)
    ctx.save();
    ctx.translate(55, 50);
    // Camera body
    ctx.fillStyle = darkBrown;
    ctx.fillRect(-25, -18, 50, 36);
    ctx.fillStyle = brown;
    ctx.fillRect(-22, -15, 44, 30);
    // Lens
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    // Lens reflection
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(-3, -3, 4, 0, Math.PI * 2);
    ctx.fill();
    // Viewfinder
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(8, -16, 12, 8);
    ctx.fillStyle = '#222';
    ctx.fillRect(9, -15, 10, 6);
    ctx.restore();

    // HALCYON in vintage font style
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px Georgia, serif';
    ctx.fillStyle = darkBrown;
    ctx.fillText('HALCYON', w/2 + 2, 52);
    ctx.fillStyle = sepia;
    ctx.fillText('HALCYON', w/2, 50);

    // Decorative flourishes
    ctx.strokeStyle = gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w/2 - 110, 65);
    ctx.quadraticCurveTo(w/2 - 70, 58, w/2 - 40, 65);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w/2 + 110, 65);
    ctx.quadraticCurveTo(w/2 + 70, 58, w/2 + 40, 65);
    ctx.stroke();

    // Vintage badge (right)
    ctx.save();
    ctx.translate(w - 60, 48);
    ctx.fillStyle = brown;
    ctx.beginPath();
    ctx.arc(0, 0, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = 'bold 8px Georgia';
    ctx.fillStyle = cream;
    ctx.textAlign = 'center';
    ctx.fillText('EST.', 0, -5);
    ctx.font = 'bold 12px Georgia';
    ctx.fillText('2024', 0, 10);
    ctx.restore();

    // Subtitle
    ctx.font = 'italic 12px Georgia';
    ctx.fillStyle = brown;
    ctx.textAlign = 'center';
    ctx.fillText('Subdomain Registry', w/2, 82);

    // Decorative border
    ctx.strokeStyle = sepia;
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 16, w - 16, 65);
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1;
    ctx.strokeRect(12, 20, w - 24, 57);

    // Domain in elegant script
    ctx.font = 'bold 28px Georgia, serif';
    ctx.fillStyle = darkBrown;
    ctx.fillText(domain, w/2 + 1, h - 41);
    ctx.fillStyle = sepia;
    ctx.fillText(domain, w/2, h - 42);

    // Bottom flourishes
    ctx.strokeStyle = gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w/2 - 100, h - 60);
    ctx.quadraticCurveTo(w/2, h - 70, w/2 + 100, h - 60);
    ctx.stroke();

    // Corner ornaments
    const drawCorner = (x, y, flipX, flipY) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(flipX, flipY);
        ctx.strokeStyle = brown;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 15);
        ctx.lineTo(0, 0);
        ctx.lineTo(15, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(5, 5, 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    };
    drawCorner(15, h - 85, 1, 1);
    drawCorner(w - 15, h - 85, -1, 1);
    drawCorner(15, h - 10, 1, -1);
    drawCorner(w - 15, h - 10, -1, -1);
}

function applyPCBWatermark(ctx, w, h, domain) {
    const darkGreen = '#003300';
    const pcbGreen = '#0D4D0D';
    const copper = '#B87333';
    const gold = '#FFD700';
    const silver = '#C0C0C0';

    // PCB green background
    ctx.fillStyle = pcbGreen;
    ctx.fillRect(0, 0, w, 95);
    ctx.fillRect(0, h - 90, w, 90);

    // Circuit traces (top)
    ctx.strokeStyle = copper;
    ctx.lineWidth = 2;
    const drawTrace = (startX, startY, segments) => {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        let x = startX, y = startY;
        for (const seg of segments) {
            x += seg[0];
            y += seg[1];
            ctx.lineTo(x, y);
        }
        ctx.stroke();
    };

    // Multiple circuit traces (top)
    drawTrace(0, 25, [[50, 0], [0, 20], [30, 0], [0, -15], [40, 0]]);
    drawTrace(0, 55, [[70, 0], [0, -20], [50, 0], [0, 25], [30, 0]]);
    drawTrace(w - 150, 30, [[40, 0], [0, 15], [30, 0], [0, -10], [80, 0]]);
    drawTrace(w - 120, 65, [[50, 0], [0, -20], [70, 0]]);

    // Circuit traces (bottom)
    drawTrace(0, h - 65, [[60, 0], [0, 15], [40, 0], [0, -20], [50, 0]]);
    drawTrace(0, h - 35, [[80, 0], [0, -10], [30, 0], [0, 15], [40, 0]]);
    drawTrace(w - 180, h - 55, [[50, 0], [0, 20], [40, 0], [0, -15], [90, 0]]);

    // Solder points
    ctx.fillStyle = silver;
    const solderPoints = [
        [50, 45], [80, 55], [120, 40], [170, 60],
        [w - 110, 45], [w - 70, 55], [w - 40, 35],
        [60, h - 50], [100, h - 60], [150, h - 45],
        [w - 130, h - 55], [w - 80, h - 40], [w - 50, h - 65]
    ];
    for (const [x, y] of solderPoints) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    // IC chip (left)
    ctx.save();
    ctx.translate(50, 50);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-20, -15, 40, 30);
    // IC pins
    ctx.fillStyle = silver;
    for (let i = 0; i < 5; i++) {
        ctx.fillRect(-23, -12 + i * 6, 6, 3);
        ctx.fillRect(17, -12 + i * 6, 6, 3);
    }
    // IC dot
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(-12, -8, 3, 0, Math.PI * 2);
    ctx.fill();
    // IC label
    ctx.font = 'bold 6px monospace';
    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';
    ctx.fillText('HSR', 0, 0);
    ctx.fillText('2024', 0, 8);
    ctx.restore();

    // HALCYON in digital style
    ctx.textAlign = 'center';
    ctx.font = 'bold 42px monospace';
    ctx.fillStyle = darkGreen;
    ctx.fillText('HALCYON', w/2 + 2, 52);
    ctx.fillStyle = gold;
    ctx.shadowColor = gold;
    ctx.shadowBlur = 8;
    ctx.fillText('HALCYON', w/2, 50);
    ctx.shadowBlur = 0;

    // Capacitor (right)
    ctx.save();
    ctx.translate(w - 55, 50);
    ctx.fillStyle = '#1E90FF';
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = silver;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(0, -28);
    ctx.moveTo(0, 22);
    ctx.lineTo(0, 28);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '8px sans-serif';
    ctx.fillText('100', 0, -2);
    ctx.fillText('µF', 0, 8);
    ctx.restore();

    // Subtitle
    ctx.font = '11px monospace';
    ctx.fillStyle = copper;
    ctx.textAlign = 'center';
    ctx.fillText('Subdomain Registry', w/2, 82);

    // Border with corner pads
    ctx.strokeStyle = copper;
    ctx.lineWidth = 2;
    ctx.strokeRect(5, 5, w - 10, 85);
    ctx.strokeRect(5, h - 85, w - 10, 80);

    // Corner mounting holes
    ctx.fillStyle = darkGreen;
    ctx.strokeStyle = copper;
    ctx.lineWidth = 2;
    [[15, 15], [w - 15, 15], [15, 80], [w - 15, 80]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });

    // Domain
    ctx.font = 'bold 28px monospace';
    ctx.fillStyle = gold;
    ctx.shadowColor = gold;
    ctx.shadowBlur = 10;
    ctx.fillText(domain, w/2, h - 42);
    ctx.shadowBlur = 0;

    // LED indicators (bottom)
    const leds = [
        [40, h - 60, '#00FF00'],
        [60, h - 60, '#FF0000'],
        [w - 45, h - 60, '#00FF00'],
        [w - 65, h - 60, '#FFFF00']
    ];
    for (const [x, y, color] of leds) {
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Resistor (bottom)
    ctx.save();
    ctx.translate(100, h - 50);
    ctx.fillStyle = '#DEB887';
    ctx.fillRect(-15, -5, 30, 10);
    // Resistor bands
    const bands = ['#8B4513', '#FF0000', '#FFA500', gold];
    for (let i = 0; i < 4; i++) {
        ctx.fillStyle = bands[i];
        ctx.fillRect(-12 + i * 7, -5, 4, 10);
    }
    // Leads
    ctx.strokeStyle = silver;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-15, 0);
    ctx.lineTo(-25, 0);
    ctx.moveTo(15, 0);
    ctx.lineTo(25, 0);
    ctx.stroke();
    ctx.restore();
}

function applyStainedGlassWatermark(ctx, w, h, domain) {
    const deepBlue = '#1a237e';
    const ruby = '#C41E3A';
    const emerald = '#50C878';
    const gold = '#FFD700';
    const purple = '#6A0DAD';
    const amber = '#FFBF00';
    const leadGray = '#2F4F4F';

    // Dark background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, 95);
    ctx.fillRect(0, h - 90, w, 90);

    // Stained glass panels (top)
    const drawGlassPanel = (x, y, width, height, color) => {
        const grad = ctx.createRadialGradient(x + width/2, y + height/2, 0, x + width/2, y + height/2, Math.max(width, height));
        grad.addColorStop(0, color);
        grad.addColorStop(0.7, color);
        grad.addColorStop(1, shadeColor(color, -30));
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = leadGray;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, width, height);
    };

    function shadeColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.max(0, Math.min(255, (num >> 16) + amt));
        const G = Math.max(0, Math.min(255, (num >> 8 & 0x00FF) + amt));
        const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }

    // Top panels arrangement
    drawGlassPanel(10, 10, 60, 40, deepBlue);
    drawGlassPanel(10, 52, 30, 33, ruby);
    drawGlassPanel(42, 52, 28, 33, emerald);
    drawGlassPanel(72, 10, 50, 75, purple);
    drawGlassPanel(124, 10, 40, 35, amber);
    drawGlassPanel(124, 47, 40, 38, deepBlue);
    drawGlassPanel(w - 70, 10, 60, 40, ruby);
    drawGlassPanel(w - 70, 52, 60, 33, emerald);
    drawGlassPanel(w - 132, 10, 60, 30, amber);
    drawGlassPanel(w - 132, 42, 60, 43, purple);

    // Rose window (center top)
    ctx.save();
    ctx.translate(w/2, 50);
    const petalColors = [ruby, emerald, deepBlue, amber, purple, ruby, emerald, deepBlue];
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        ctx.fillStyle = petalColors[i];
        ctx.beginPath();
        ctx.ellipse(Math.cos(angle) * 20, Math.sin(angle) * 20, 12, 8, angle, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = leadGray;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    // Center jewel
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = leadGray;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // HALCYON with glow effect
    ctx.textAlign = 'center';
    ctx.font = 'bold 36px serif';
    ctx.fillStyle = gold;
    ctx.shadowColor = gold;
    ctx.shadowBlur = 15;
    ctx.fillText('HALCYON', w/2, 55);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.font = 'italic 11px serif';
    ctx.fillStyle = amber;
    ctx.fillText('Subdomain Registry', w/2, 82);

    // Bottom panels
    drawGlassPanel(10, h - 85, 50, 40, emerald);
    drawGlassPanel(10, h - 43, 50, 35, ruby);
    drawGlassPanel(62, h - 85, 45, 77, deepBlue);
    drawGlassPanel(w - 115, h - 85, 50, 77, purple);
    drawGlassPanel(w - 63, h - 85, 53, 40, amber);
    drawGlassPanel(w - 63, h - 43, 53, 35, emerald);

    // Domain with cathedral style
    ctx.font = 'bold 26px serif';
    ctx.fillStyle = gold;
    ctx.shadowColor = gold;
    ctx.shadowBlur = 12;
    ctx.fillText(domain, w/2, h - 42);
    ctx.shadowBlur = 0;

    // Gothic arch frame (bottom center)
    ctx.strokeStyle = leadGray;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(w/2 - 80, h - 10);
    ctx.lineTo(w/2 - 80, h - 55);
    ctx.quadraticCurveTo(w/2 - 80, h - 80, w/2, h - 80);
    ctx.quadraticCurveTo(w/2 + 80, h - 80, w/2 + 80, h - 55);
    ctx.lineTo(w/2 + 80, h - 10);
    ctx.stroke();

    // Inner arch glow
    ctx.strokeStyle = gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w/2 - 75, h - 12);
    ctx.lineTo(w/2 - 75, h - 52);
    ctx.quadraticCurveTo(w/2 - 75, h - 75, w/2, h - 75);
    ctx.quadraticCurveTo(w/2 + 75, h - 75, w/2 + 75, h - 52);
    ctx.lineTo(w/2 + 75, h - 12);
    ctx.stroke();

    // Corner crosses
    const drawCross = (x, y, size) => {
        ctx.fillStyle = gold;
        ctx.fillRect(x - size/6, y - size/2, size/3, size);
        ctx.fillRect(x - size/2, y - size/6, size, size/3);
    };
    drawCross(30, h - 50, 16);
    drawCross(w - 30, h - 50, 16);
}

function applyCasinoWatermark(ctx, w, h, domain) {
    const casinoRed = '#C41E3A';
    const casinoGreen = '#228B22';
    const gold = '#FFD700';
    const black = '#1a1a1a';
    const white = '#FFFFFF';

    // Casino felt background
    const feltGrad = ctx.createLinearGradient(0, 0, 0, 95);
    feltGrad.addColorStop(0, '#1B5E20');
    feltGrad.addColorStop(0.5, casinoGreen);
    feltGrad.addColorStop(1, '#1B5E20');
    ctx.fillStyle = feltGrad;
    ctx.fillRect(0, 0, w, 95);
    ctx.fillRect(0, h - 90, w, 90);

    // Felt texture dots
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    for (let x = 0; x < w; x += 8) {
        for (let y = 0; y < 95; y += 8) {
            if (Math.random() > 0.5) {
                ctx.fillRect(x, y, 2, 2);
            }
        }
        for (let y = h - 90; y < h; y += 8) {
            if (Math.random() > 0.5) {
                ctx.fillRect(x, y, 2, 2);
            }
        }
    }

    // Playing card (left) - Ace of Spades
    ctx.save();
    ctx.translate(55, 50);
    ctx.rotate(-0.15);
    ctx.fillStyle = white;
    ctx.fillRect(-20, -28, 40, 56);
    ctx.strokeStyle = black;
    ctx.lineWidth = 2;
    ctx.strokeRect(-20, -28, 40, 56);
    // Spade symbol
    ctx.fillStyle = black;
    ctx.font = 'bold 28px serif';
    ctx.textAlign = 'center';
    ctx.fillText('♠', 0, 8);
    ctx.font = 'bold 10px serif';
    ctx.fillText('A', -12, -16);
    ctx.fillText('A', 12, 24);
    ctx.restore();

    // Playing card behind (King of Hearts)
    ctx.save();
    ctx.translate(48, 48);
    ctx.rotate(0.1);
    ctx.fillStyle = white;
    ctx.fillRect(-20, -28, 40, 56);
    ctx.strokeStyle = black;
    ctx.lineWidth = 2;
    ctx.strokeRect(-20, -28, 40, 56);
    ctx.fillStyle = casinoRed;
    ctx.font = 'bold 28px serif';
    ctx.textAlign = 'center';
    ctx.fillText('♥', 0, 8);
    ctx.font = 'bold 10px serif';
    ctx.fillText('K', -12, -16);
    ctx.restore();

    // HALCYON in casino style
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px serif';
    ctx.fillStyle = black;
    ctx.fillText('HALCYON', w/2 + 2, 52);
    ctx.fillStyle = gold;
    ctx.shadowColor = '#8B6914';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillText('HALCYON', w/2, 50);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Poker chips (right)
    const drawChip = (x, y, color, value) => {
        // Chip base
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 18, 0, Math.PI * 2);
        ctx.fill();
        // Edge notches
        ctx.strokeStyle = white;
        ctx.lineWidth = 3;
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(x, y, 18, angle - 0.15, angle + 0.15);
            ctx.stroke();
        }
        // Inner circle
        ctx.fillStyle = white;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(value, x, y + 4);
    };

    drawChip(w - 45, 35, casinoRed, '100');
    drawChip(w - 65, 55, '#1E3A8A', '500');
    drawChip(w - 38, 65, black, '1K');

    // Dice (scattered)
    const drawDie = (x, y, rotation, dots) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.fillStyle = white;
        ctx.fillRect(-10, -10, 20, 20);
        ctx.strokeStyle = black;
        ctx.lineWidth = 1;
        ctx.strokeRect(-10, -10, 20, 20);
        ctx.fillStyle = black;
        // Draw dots based on value
        if (dots >= 1) ctx.fillRect(-2, -2, 4, 4); // center
        if (dots >= 2) { ctx.fillRect(-7, -7, 3, 3); ctx.fillRect(4, 4, 3, 3); }
        if (dots >= 4) { ctx.fillRect(4, -7, 3, 3); ctx.fillRect(-7, 4, 3, 3); }
        if (dots === 6) { ctx.fillRect(-7, -1, 3, 3); ctx.fillRect(4, -1, 3, 3); }
        ctx.restore();
    };

    drawDie(120, 75, 0.2, 6);
    drawDie(148, 68, -0.3, 5);

    // Subtitle
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = gold;
    ctx.textAlign = 'center';
    ctx.fillText('Subdomain Registry', w/2, 85);

    // Gold border
    ctx.strokeStyle = gold;
    ctx.lineWidth = 3;
    ctx.strokeRect(5, 5, w - 10, 85);
    ctx.strokeRect(5, h - 85, w - 10, 80);

    // Domain
    ctx.font = 'bold 28px serif';
    ctx.fillStyle = gold;
    ctx.shadowColor = '#8B6914';
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillText(domain, w/2, h - 42);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Bottom chips
    drawChip(50, h - 55, gold, 'VIP');
    drawChip(w - 55, h - 55, '#7B3F00', '10K');

    // Roulette indicator (bottom center background)
    ctx.strokeStyle = gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w/2, h - 45, 35, Math.PI * 0.8, Math.PI * 0.2);
    ctx.stroke();
    // Numbers on arc
    ctx.font = '8px sans-serif';
    ctx.fillStyle = gold;
    const nums = ['7', '11', '21', '777'];
    nums.forEach((num, i) => {
        const angle = Math.PI * 0.8 + (i / (nums.length - 1)) * (Math.PI * 0.4 - Math.PI * 0.8 + Math.PI * 2);
        const x = w/2 + Math.cos(angle) * 42;
        const y = h - 45 + Math.sin(angle) * 42;
        ctx.fillText(num, x, y);
    });

    // Corner card suits
    ctx.font = '16px serif';
    ctx.fillStyle = casinoRed;
    ctx.fillText('♥', 20, h - 75);
    ctx.fillText('♦', w - 20, h - 75);
    ctx.fillStyle = black;
    ctx.fillText('♠', 20, h - 15);
    ctx.fillText('♣', w - 20, h - 15);
}

function applyUnderwaterWatermark(ctx, w, h, domain) {
    const deepBlue = '#001F3F';
    const oceanBlue = '#0077BE';
    const seafoam = '#3EB489';
    const coral = '#FF7F50';
    const sand = '#F4A460';

    // Deep ocean gradient background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 95);
    bgGrad.addColorStop(0, '#000810');
    bgGrad.addColorStop(0.5, deepBlue);
    bgGrad.addColorStop(1, '#001428');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, 95);

    const bgGrad2 = ctx.createLinearGradient(0, h - 90, 0, h);
    bgGrad2.addColorStop(0, '#001428');
    bgGrad2.addColorStop(0.5, deepBlue);
    bgGrad2.addColorStop(1, sand);
    ctx.fillStyle = bgGrad2;
    ctx.fillRect(0, h - 90, w, 90);

    // Bubbles (top)
    const drawBubble = (x, y, r) => {
        const bubbleGrad = ctx.createRadialGradient(x - r/3, y - r/3, 0, x, y, r);
        bubbleGrad.addColorStop(0, 'rgba(255,255,255,0.4)');
        bubbleGrad.addColorStop(0.5, 'rgba(135,206,250,0.2)');
        bubbleGrad.addColorStop(1, 'rgba(135,206,250,0.1)');
        ctx.fillStyle = bubbleGrad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(x - r/3, y - r/3, r/4, 0, Math.PI * 2);
        ctx.fill();
    };

    // Scattered bubbles
    [[30, 25, 8], [45, 50, 5], [20, 70, 4], [70, 35, 6], [85, 65, 3],
     [w - 30, 30, 7], [w - 50, 55, 5], [w - 25, 75, 4], [w - 70, 40, 6]].forEach(([x, y, r]) => {
        drawBubble(x, y, r);
    });

    // Tropical fish (left)
    ctx.save();
    ctx.translate(55, 50);
    // Body
    const fishGrad = ctx.createLinearGradient(-15, -10, -15, 10);
    fishGrad.addColorStop(0, '#FF6B6B');
    fishGrad.addColorStop(0.5, coral);
    fishGrad.addColorStop(1, '#FF8E53');
    ctx.fillStyle = fishGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tail
    ctx.fillStyle = '#FF6B6B';
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(30, -10);
    ctx.lineTo(30, 10);
    ctx.closePath();
    ctx.fill();
    // Stripes
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-5, -10);
    ctx.lineTo(-5, 10);
    ctx.moveTo(5, -8);
    ctx.lineTo(5, 8);
    ctx.stroke();
    // Eye
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-10, -2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(-9, -2, 2, 0, Math.PI * 2);
    ctx.fill();
    // Fin
    ctx.fillStyle = '#FF8E53';
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(-5, -20);
    ctx.lineTo(10, -10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // HALCYON with underwater glow
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillStyle = oceanBlue;
    ctx.shadowColor = seafoam;
    ctx.shadowBlur = 15;
    ctx.fillText('HALCYON', w/2, 52);
    ctx.shadowBlur = 0;

    // Wavy subtitle
    ctx.font = '12px sans-serif';
    ctx.fillStyle = seafoam;
    ctx.fillText('Subdomain Registry', w/2, 80);

    // Seaweed (right side)
    ctx.save();
    ctx.translate(w - 40, 85);
    for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = i === 0 ? '#228B22' : (i === 1 ? '#32CD32' : '#006400');
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(i * 15, 0);
        for (let y = 0; y > -70; y -= 10) {
            ctx.quadraticCurveTo(i * 15 + Math.sin(y / 10) * 8, y - 5, i * 15 + Math.sin((y - 10) / 10) * 8, y - 10);
        }
        ctx.stroke();
    }
    ctx.restore();

    // Coral (left bottom)
    ctx.save();
    ctx.translate(50, h - 15);
    ctx.fillStyle = coral;
    // Branch coral
    for (let i = 0; i < 5; i++) {
        const angle = -Math.PI/2 + (i - 2) * 0.4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * 25, Math.sin(angle) * 25);
        ctx.lineWidth = 6 - i * 0.5;
        ctx.strokeStyle = coral;
        ctx.stroke();
        // Tips
        ctx.fillStyle = '#FF6347';
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * 25, Math.sin(angle) * 25, 4, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // Jellyfish (right bottom)
    ctx.save();
    ctx.translate(w - 55, h - 55);
    // Bell
    const jellyGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 20);
    jellyGrad.addColorStop(0, 'rgba(255,105,180,0.8)');
    jellyGrad.addColorStop(1, 'rgba(255,20,147,0.4)');
    ctx.fillStyle = jellyGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 18, Math.PI, 0);
    ctx.quadraticCurveTo(18, 10, 0, 8);
    ctx.quadraticCurveTo(-18, 10, -18, 0);
    ctx.fill();
    // Tentacles
    ctx.strokeStyle = 'rgba(255,105,180,0.6)';
    ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 6, 8);
        ctx.quadraticCurveTo(i * 6 + 5, 20, i * 6, 35);
        ctx.stroke();
    }
    ctx.restore();

    // Domain
    ctx.font = 'bold 26px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = oceanBlue;
    ctx.shadowBlur = 12;
    ctx.textAlign = 'center';
    ctx.fillText(domain, w/2, h - 42);
    ctx.shadowBlur = 0;

    // More bubbles (bottom)
    [[w/2 - 60, h - 30, 5], [w/2 + 70, h - 25, 6], [w/2 - 30, h - 65, 4],
     [w/2 + 40, h - 70, 3], [100, h - 50, 4], [w - 100, h - 45, 5]].forEach(([x, y, r]) => {
        drawBubble(x, y, r);
    });

    // Sandy bottom texture
    ctx.fillStyle = 'rgba(244,164,96,0.3)';
    for (let x = 0; x < w; x += 4) {
        const y = h - 5 + Math.sin(x / 20) * 3;
        ctx.fillRect(x, y, 3, 5);
    }

    // Shells
    ctx.fillStyle = '#FFF5EE';
    ctx.beginPath();
    ctx.ellipse(80, h - 12, 8, 5, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(w - 90, h - 10, 6, 4, -0.2, 0, Math.PI * 2);
    ctx.fill();
}

function applyFireworksWatermark(ctx, w, h, domain) {
    const nightSky = '#0a0a1a';
    const gold = '#FFD700';
    const red = '#FF0000';
    const blue = '#00BFFF';
    const green = '#00FF00';
    const purple = '#9400D3';
    const pink = '#FF69B4';
    const orange = '#FF8C00';

    // Night sky background
    ctx.fillStyle = nightSky;
    ctx.fillRect(0, 0, w, 95);
    ctx.fillRect(0, h - 90, w, 90);

    // Stars
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 30; i++) {
        const x = Math.random() * w;
        const y = Math.random() * 85 + 5;
        ctx.globalAlpha = 0.3 + Math.random() * 0.5;
        ctx.fillRect(x, y, 1, 1);
    }
    for (let i = 0; i < 30; i++) {
        const x = Math.random() * w;
        const y = h - 85 + Math.random() * 80;
        ctx.globalAlpha = 0.3 + Math.random() * 0.5;
        ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1;

    // Firework burst function
    const drawFirework = (cx, cy, radius, color, rays) => {
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.lineWidth = 2;
        for (let i = 0; i < rays; i++) {
            const angle = (i / rays) * Math.PI * 2;
            const innerR = radius * 0.3;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
            ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
            ctx.stroke();
            // Sparkle at end
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        // Center glow
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    };

    // Top fireworks
    drawFirework(60, 45, 30, red, 12);
    drawFirework(w - 70, 40, 25, blue, 10);
    drawFirework(w/2 - 80, 60, 20, green, 8);
    drawFirework(w/2 + 90, 55, 22, purple, 10);

    // Starburst (center top)
    ctx.save();
    ctx.translate(w/2, 45);
    const colors = [gold, orange, red, pink];
    for (let ring = 0; ring < 3; ring++) {
        const r = 15 + ring * 10;
        const points = 8 + ring * 4;
        ctx.strokeStyle = colors[ring % colors.length];
        ctx.shadowColor = colors[ring % colors.length];
        ctx.shadowBlur = 8;
        ctx.lineWidth = 2;
        for (let i = 0; i < points; i++) {
            const angle = (i / points) * Math.PI * 2 + ring * 0.2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
            ctx.stroke();
        }
    }
    ctx.shadowBlur = 0;
    ctx.restore();

    // HALCYON with sparkle effect
    ctx.textAlign = 'center';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillStyle = gold;
    ctx.shadowColor = gold;
    ctx.shadowBlur = 15;
    ctx.fillText('HALCYON', w/2, 55);
    ctx.shadowBlur = 0;

    // Sparkles around text
    ctx.fillStyle = '#FFFFFF';
    [[w/2 - 100, 35], [w/2 + 100, 35], [w/2 - 90, 60], [w/2 + 90, 60]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x + 2, y);
        ctx.lineTo(x, y + 4);
        ctx.lineTo(x - 2, y);
        ctx.closePath();
        ctx.fill();
    });

    // Subtitle
    ctx.font = '11px sans-serif';
    ctx.fillStyle = pink;
    ctx.shadowColor = pink;
    ctx.shadowBlur = 8;
    ctx.fillText('Subdomain Registry', w/2, 82);
    ctx.shadowBlur = 0;

    // Decorative border with sparkles
    ctx.strokeStyle = gold;
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, w - 16, 80);
    ctx.strokeRect(8, h - 82, w - 16, 74);

    // Bottom fireworks
    drawFirework(55, h - 50, 28, pink, 12);
    drawFirework(w - 60, h - 55, 24, orange, 10);
    drawFirework(130, h - 60, 18, blue, 8);
    drawFirework(w - 130, h - 45, 20, green, 8);

    // Domain
    ctx.font = 'bold 26px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = gold;
    ctx.shadowBlur = 15;
    ctx.fillText(domain, w/2, h - 42);
    ctx.shadowBlur = 0;

    // Trailing sparks
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;
    const trails = [
        [40, 80, 40, 95], [w - 45, 75, w - 45, 95],
        [50, h - 80, 50, h - 90], [w - 55, h - 75, w - 55, h - 90]
    ];
    trails.forEach(([x1, y1, x2, y2]) => {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    });
    ctx.globalAlpha = 1;

    // Celebration emojis/icons
    ctx.font = '14px sans-serif';
    ctx.fillText('🎆', 15, 45);
    ctx.fillText('🎇', w - 25, 50);
    ctx.fillText('🎆', 15, h - 45);
    ctx.fillText('🎇', w - 25, h - 50);
}

function applyTattooWatermark(ctx, w, h, domain) {
    const black = '#1a1a1a';
    const darkRed = '#8B0000';
    const gold = '#DAA520';
    const navy = '#1a1a3e';
    const skin = '#DEB887';

    // Parchment-like background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 95);
    bgGrad.addColorStop(0, '#D4C4A8');
    bgGrad.addColorStop(0.5, '#E8DCC8');
    bgGrad.addColorStop(1, '#D4C4A8');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, 95);
    ctx.fillRect(0, h - 90, w, 90);

    // Traditional anchor (left)
    ctx.save();
    ctx.translate(55, 50);
    ctx.strokeStyle = navy;
    ctx.fillStyle = navy;
    ctx.lineWidth = 3;
    // Anchor shaft
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.lineTo(0, 20);
    ctx.stroke();
    // Anchor cross bar
    ctx.beginPath();
    ctx.moveTo(-15, -10);
    ctx.lineTo(15, -10);
    ctx.stroke();
    // Anchor bottom curve
    ctx.beginPath();
    ctx.moveTo(-20, 15);
    ctx.quadraticCurveTo(-20, 25, 0, 20);
    ctx.quadraticCurveTo(20, 25, 20, 15);
    ctx.stroke();
    // Anchor flukes
    ctx.beginPath();
    ctx.moveTo(-20, 15);
    ctx.lineTo(-25, 8);
    ctx.moveTo(20, 15);
    ctx.lineTo(25, 8);
    ctx.stroke();
    // Ring at top
    ctx.beginPath();
    ctx.arc(0, -28, 5, 0, Math.PI * 2);
    ctx.stroke();
    // Rope wrap
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    for (let i = -18; i < 15; i += 8) {
        ctx.beginPath();
        ctx.moveTo(-5, i);
        ctx.lineTo(5, i + 5);
        ctx.stroke();
    }
    ctx.restore();

    // Traditional rose (right)
    ctx.save();
    ctx.translate(w - 55, 50);
    // Petals
    ctx.fillStyle = darkRed;
    for (let ring = 0; ring < 3; ring++) {
        const petals = 5 + ring * 2;
        const r = 8 + ring * 6;
        for (let i = 0; i < petals; i++) {
            const angle = (i / petals) * Math.PI * 2 + ring * 0.3;
            ctx.beginPath();
            ctx.ellipse(
                Math.cos(angle) * r * 0.5,
                Math.sin(angle) * r * 0.5,
                8, 5,
                angle,
                0, Math.PI * 2
            );
            ctx.fill();
        }
    }
    // Center
    ctx.fillStyle = '#5C0000';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    // Leaves
    ctx.fillStyle = '#228B22';
    ctx.beginPath();
    ctx.ellipse(-18, 15, 10, 5, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(18, 15, 10, 5, 0.5, 0, Math.PI * 2);
    ctx.fill();
    // Leaf veins
    ctx.strokeStyle = '#006400';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-25, 15);
    ctx.lineTo(-11, 15);
    ctx.moveTo(25, 15);
    ctx.lineTo(11, 15);
    ctx.stroke();
    ctx.restore();

    // Banner behind HALCYON
    ctx.save();
    ctx.translate(w/2, 48);
    ctx.fillStyle = '#F5DEB3';
    ctx.strokeStyle = black;
    ctx.lineWidth = 2;
    // Main banner
    ctx.beginPath();
    ctx.moveTo(-90, -18);
    ctx.lineTo(90, -18);
    ctx.lineTo(95, 0);
    ctx.lineTo(90, 18);
    ctx.lineTo(-90, 18);
    ctx.lineTo(-95, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Banner folds
    ctx.beginPath();
    ctx.moveTo(-90, -18);
    ctx.lineTo(-100, -25);
    ctx.lineTo(-105, -10);
    ctx.lineTo(-95, 0);
    ctx.closePath();
    ctx.fillStyle = '#DEB887';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(90, -18);
    ctx.lineTo(100, -25);
    ctx.lineTo(105, -10);
    ctx.lineTo(95, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // HALCYON in tattoo style
    ctx.textAlign = 'center';
    ctx.font = 'bold 36px Georgia, serif';
    ctx.fillStyle = black;
    ctx.fillText('HALCYON', w/2, 55);

    // Decorative swallows
    const drawSwallow = (x, y, flip) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(flip, 1);
        ctx.fillStyle = navy;
        // Body
        ctx.beginPath();
        ctx.ellipse(0, 0, 12, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Head
        ctx.beginPath();
        ctx.arc(10, -2, 5, 0, Math.PI * 2);
        ctx.fill();
        // Wings
        ctx.beginPath();
        ctx.moveTo(-5, -3);
        ctx.quadraticCurveTo(-15, -15, -5, -12);
        ctx.quadraticCurveTo(0, -8, -5, -3);
        ctx.fill();
        // Tail
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(-20, 5);
        ctx.lineTo(-18, 0);
        ctx.lineTo(-20, -5);
        ctx.closePath();
        ctx.fill();
        // Eye
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(12, -3, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    };

    drawSwallow(120, 25, 1);
    drawSwallow(w - 120, 25, -1);

    // Subtitle
    ctx.font = 'italic 11px Georgia';
    ctx.fillStyle = black;
    ctx.fillText('Subdomain Registry', w/2, 82);

    // Decorative border with corner flourishes
    ctx.strokeStyle = black;
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, w - 20, 75);

    // Corner flourishes
    const drawFlourish = (x, y, flipX, flipY) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(flipX, flipY);
        ctx.strokeStyle = black;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(15, 0, 20, 10);
        ctx.quadraticCurveTo(25, 20, 15, 20);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(0, 15, 10, 20);
        ctx.stroke();
        ctx.restore();
    };

    drawFlourish(15, 15, 1, 1);
    drawFlourish(w - 15, 15, -1, 1);
    drawFlourish(15, 80, 1, -1);
    drawFlourish(w - 15, 80, -1, -1);

    // Domain in banner (bottom)
    ctx.save();
    ctx.translate(w/2, h - 45);
    ctx.fillStyle = '#F5DEB3';
    ctx.strokeStyle = black;
    ctx.lineWidth = 2;
    // Banner shape
    ctx.beginPath();
    ctx.moveTo(-80, -15);
    ctx.lineTo(80, -15);
    ctx.lineTo(85, 0);
    ctx.lineTo(80, 15);
    ctx.lineTo(-80, 15);
    ctx.lineTo(-85, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.font = 'bold 24px Georgia, serif';
    ctx.fillStyle = black;
    ctx.fillText(domain, w/2, h - 40);

    // Dagger (bottom left)
    ctx.save();
    ctx.translate(50, h - 50);
    ctx.rotate(-0.3);
    // Blade
    ctx.fillStyle = '#C0C0C0';
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.lineTo(5, 15);
    ctx.lineTo(0, 20);
    ctx.lineTo(-5, 15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = black;
    ctx.lineWidth = 1;
    ctx.stroke();
    // Handle
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(-4, -30, 8, 8);
    // Guard
    ctx.fillStyle = gold;
    ctx.fillRect(-10, -25, 20, 3);
    ctx.restore();

    // Skull (bottom right)
    ctx.save();
    ctx.translate(w - 50, h - 55);
    ctx.fillStyle = '#F5F5F5';
    ctx.strokeStyle = black;
    ctx.lineWidth = 2;
    // Skull shape
    ctx.beginPath();
    ctx.arc(0, -5, 15, Math.PI, 0);
    ctx.lineTo(12, 10);
    ctx.quadraticCurveTo(8, 18, 0, 18);
    ctx.quadraticCurveTo(-8, 18, -12, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Eyes
    ctx.fillStyle = black;
    ctx.beginPath();
    ctx.ellipse(-5, -2, 4, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(5, -2, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Nose
    ctx.beginPath();
    ctx.moveTo(0, 3);
    ctx.lineTo(-2, 8);
    ctx.lineTo(2, 8);
    ctx.closePath();
    ctx.fill();
    // Teeth
    ctx.strokeStyle = black;
    ctx.lineWidth = 1;
    for (let i = -6; i <= 6; i += 4) {
        ctx.beginPath();
        ctx.moveTo(i, 12);
        ctx.lineTo(i, 17);
        ctx.stroke();
    }
    ctx.restore();

    // Heart (near bottom center)
    ctx.save();
    ctx.translate(w/2 + 60, h - 70);
    ctx.fillStyle = darkRed;
    ctx.beginPath();
    ctx.moveTo(0, 5);
    ctx.bezierCurveTo(-10, -5, -10, -12, 0, -8);
    ctx.bezierCurveTo(10, -12, 10, -5, 0, 5);
    ctx.fill();
    ctx.restore();
}

// =============================================================
//                     SINGLE IMAGE GENERATION
// =============================================================

/**
 * Generate a single image on one available GPU
 * Used by nft.js for generateImage() and generatePreview()
 * @param {Object} options
 * @param {string} options.domain - Full domain name (e.g., "mycompany.cryptofans")
 * @param {string} [options.themeId] - Theme ID (defaults to 'cosmic')
 * @param {string} [options.customPrompt] - Custom prompt
 * @param {number} [options.seed] - Specific seed
 * @param {boolean} [options.randomSeed] - Use random seed
 * @returns {Promise<{success: boolean, imageBuffer?: Buffer, seed?: number, tier?: string, theme?: string, error?: string}>}
 */
async function generateSingle(options = {}) {
  const { domain, themeId = 'cosmic', customPrompt, seed, randomSeed = false, artStyle = null } = options;

  // Direct execution (Redis/BullMQ queue disabled)
  return _generateSingleDirect(options);
}

/**
 * Direct (non-queued) single image generation — called by enqueueOrDirect fallback
 * and by the BullMQ worker via generateOnServer.
 */
async function _generateSingleDirect(options = {}) {
  const { domain, themeId = 'cosmic', customPrompt, seed, randomSeed = false, artStyle = null } = options;

  // Get one available server
  const availableServers = await getAvailableServers();
  if (availableServers.length === 0) {
    return { success: false, error: 'No ComfyUI servers available' };
  }

  // Filter for safe servers (skip display GPU if VRAM too high)
  let safeServers = [];
  for (const server of availableServers) {
    if (server.isDisplayGPU) {
      const isSafe = await isDisplayGPUSafe(server.url);
      if (isSafe) safeServers.push(server);
    } else {
      safeServers.push(server);
    }
  }

  if (safeServers.length === 0) {
    return { success: false, error: 'No safe GPU servers available' };
  }

  // Pick first available (non-display preferred, already sorted)
  const server = safeServers[0];

  // Load theme — if not found by exact ID, pick a random one
  let theme = await getThemeById(themeId);
  if (!theme) {
    // Legacy style names (cosmic, cyberpunk, etc.) don't exist in the new theme system.
    // Map common legacy names to categories, or pick a random theme.
    const legacyCategoryMap = {
      cosmic: 'space', space: 'space',
      nature: 'nature', fantasy: 'fantasy',
      cyberpunk: 'exotic', abstract: 'fractal',
      elegant: 'business', corporate: 'business',
      minimalist: 'business', industrial: 'exotic',
      retro: 'exotic', tech: 'business',
    };
    const category = legacyCategoryMap[themeId] || 'space';
    const allThemes = loadAllThemes();
    const categoryThemes = allThemes[category] || allThemes.space || Object.values(allThemes)[0];
    if (categoryThemes) {
      const ids = Object.keys(categoryThemes);
      const randomId = ids[Math.floor(Math.random() * ids.length)];
      theme = { ...categoryThemes[randomId], id: randomId, category };
      console.log(`[SDXLMultiGPU] Mapped legacy theme '${themeId}' -> ${theme.id} (${category})`);
    } else {
      return { success: false, error: `No themes available` };
    }
  }

  // Spin up fans for the specific GPU that will handle this job
  await gpuFanControl.onJobStart(server.url);

  try {
    const result = await generateOnServer(server, theme, domain, customPrompt, artStyle);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        theme: themeId,
      };
    }

    // Apply watermark
    const finalBuffer = await addDomainWatermark(result.imageBuffer, domain, result.theme);

    return {
      success: true,
      imageBuffer: finalBuffer,
      seed: result.seed,
      tier: result.theme?.category || 'standard',
      theme: themeId,
    };
  } catch (error) {
    console.error('[SDXLMultiGPU] generateSingle error:', error.message);
    return { success: false, error: error.message };
  } finally {
    await gpuFanControl.onJobComplete(server.url);
  }
}

// =============================================================
//                     PARALLEL GENERATION
// =============================================================

/**
 * Generate images in parallel across multiple GPUs
 * @param {string} domain - Full domain name (e.g., "mycompany.cryptofans")
 * @param {string[]} themeIds - Array of 3 theme IDs
 * @param {string} customPrompt - Optional custom prompt to prepend
 * @param {object} artStyle - Optional art style { id, name, prompt, negative, settings, lora }
 * @param {object} options - Optional options { skipWatermark: boolean }
 * @returns {Promise<{success: boolean, images: Array, generationId: string}>}
 */
async function generateParallel(domain, themeIds, customPrompt, artStyle = null, options = {}) {
  if (!themeIds || themeIds.length < 1 || themeIds.length > 5) {
    throw new Error('1 to 5 themes required for generation');
  }

  // Direct execution (Redis/BullMQ queue disabled)
  return _generateParallelDirect(domain, themeIds, customPrompt, artStyle, options);
}

/**
 * Direct (non-queued) parallel generation — called by enqueueOrDirect fallback.
 */
async function _generateParallelDirect(domain, themeIds, customPrompt, artStyle = null, options = {}) {
  const { skipWatermark = false } = options;

  const { type: modelType } = getActiveModelConfig();

  // Get available servers
  const availableServers = await getAvailableServers();
  if (availableServers.length === 0) {
    throw new Error('No ComfyUI servers available');
  }

  console.log(`[SDXLMultiGPU] Starting parallel generation for ${domain}`);
  console.log(`[SDXLMultiGPU] Model: ${modelType}`);
  console.log(`[SDXLMultiGPU] Themes: ${themeIds.join(', ')}`);
  if (artStyle) {
    console.log(`[SDXLMultiGPU] Art Style: ${artStyle.name} (${artStyle.id}) - CFG: ${artStyle.settings?.cfg}, Steps: ${artStyle.settings?.steps}`);
  }
  console.log(`[SDXLMultiGPU] Available servers: ${availableServers.length}`);

  // Load themes
  const themes = await Promise.all(
    themeIds.map(async (id) => {
      const theme = await getThemeById(id);
      if (!theme) {
        throw new Error(`Theme not found: ${id}`);
      }
      return theme;
    })
  );

  // Generate unique ID for this generation session
  const generationId = crypto.randomUUID();

  // Filter out display GPU if VRAM is too high
  let safeServers = [];
  for (const server of availableServers) {
    if (server.isDisplayGPU) {
      const isSafe = await isDisplayGPUSafe(server.url);
      if (isSafe) {
        safeServers.push(server);
      } else {
        console.log(`[SDXLMultiGPU] Skipping ${server.name} (display GPU) due to VRAM pressure`);
      }
    } else {
      safeServers.push(server);
    }
  }

  if (safeServers.length === 0) {
    throw new Error('No safe GPU servers available (display GPU VRAM too high, other GPUs unavailable)');
  }

  console.log(`[SDXLMultiGPU] Using ${safeServers.length} safe servers: ${safeServers.map(s => s.name).join(', ')}`);

  // Assign themes to servers (round-robin if fewer servers than themes)
  // Non-display GPUs are already first in the list due to sorting
  const serverAssignments = themes.map((theme, index) => {
    return safeServers[index % safeServers.length];
  });

  // Get unique server URLs being used for per-machine fan control
  const uniqueServerUrls = [...new Set(serverAssignments.map(s => s.url))];

  // Spin up GPU fans only for the machines that will be used
  await Promise.all(uniqueServerUrls.map(url => gpuFanControl.onJobStart(url)));

  const tasks = themes.map((theme, index) => {
    const server = serverAssignments[index];
    return generateOnServer(server, theme, domain, customPrompt, artStyle);
  });

  // Execute all in parallel
  const startTime = Date.now();
  let results;
  try {
    const settled = await Promise.allSettled(tasks);
    results = settled.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      console.error(`[SDXLMultiGPU] GPU ${i} failed: ${r.reason?.message || r.reason}`);
      return { success: false, error: r.reason?.message || 'Generation failed', theme: themes[i] };
    });
  } finally {
    // Signal job complete for each machine used
    await Promise.all(uniqueServerUrls.map(url => gpuFanControl.onJobComplete(url)));
  }
  const totalTime = (Date.now() - startTime) / 1000;
  const gpuSuccessCount = results.filter(r => r.success).length;

  console.log(`[SDXLMultiGPU] Parallel generation complete in ${totalTime.toFixed(1)}s (${gpuSuccessCount}/${results.length} succeeded)`);

  // Apply watermarks to successful images (unless skipWatermark is true)
  const images = await Promise.all(
    results.map(async (result, index) => {
      if (result.success) {
        // If skipWatermark, use raw image; otherwise apply watermark
        let finalBuffer = result.imageBuffer;
        if (!skipWatermark) {
          finalBuffer = await addDomainWatermark(
            result.imageBuffer,
            domain,
            result.theme
          );
        }

        // Convert to base64 for frontend
        const base64 = `data:image/png;base64,${finalBuffer.toString('base64')}`;

        return {
          index,
          success: true,
          imageBase64: base64,
          seed: result.seed,
          theme: {
            id: result.theme.id,
            name: result.theme.name,
            category: result.theme.category,
          },
          server: result.server,
          generationTime: result.generationTime,
          modelType: result.modelType,
        };
      } else {
        return {
          index,
          success: false,
          error: result.error,
          theme: {
            id: result.theme.id,
            name: result.theme.name,
            category: result.theme.category,
          },
          server: result.server,
          modelType: result.modelType,
        };
      }
    })
  );

  const successCount = images.filter(i => i.success).length;

  return {
    success: successCount > 0,
    generationId,
    domain,
    images,
    successCount,
    totalCount: themes.length,
    totalTime,
    modelType,
    timestamp: new Date().toISOString(),
  };
}

// =============================================================
//                     SERVICE CLASS
// =============================================================

class SDXLMultiGPUService {
  constructor() {
    this.activeGenerations = new Map();
  }

  /**
   * Check health of all servers
   */
  async checkServerHealth() {
    return getAllServersStatus();
  }

  /**
   * Get all available themes
   */
  async getThemes() {
    return getAllThemes();
  }

  /**
   * Get theme by ID
   */
  async getTheme(themeId) {
    return getThemeById(themeId);
  }

  /**
   * Generate a single image on one GPU
   * @param {Object} options - { domain, themeId, customPrompt, seed, randomSeed }
   * @returns {Promise<{success: boolean, imageBuffer?: Buffer, seed?: number, tier?: string, theme?: string, error?: string}>}
   */
  async generateSingle(options) {
    return generateSingle(options);
  }

  /**
   * Generate 3 images in parallel
   * @param {string} domain - Domain name
   * @param {string[]} themeIds - Array of 3 theme IDs
   * @param {string} customPrompt - Optional custom prompt
   * @param {object} artStyle - Optional art style config
   * @param {object} options - Optional options { skipWatermark: boolean }
   */
  async generateParallel(domain, themeIds, customPrompt, artStyle = null, options = {}) {
    // Store generation in active map
    const result = await generateParallel(domain, themeIds, customPrompt, artStyle, options);
    this.activeGenerations.set(result.generationId, result);

    // Auto-cleanup after 1 hour
    setTimeout(() => {
      this.activeGenerations.delete(result.generationId);
    }, 3600000);

    return result;
  }

  /**
   * Get status of a generation
   */
  getGeneration(generationId) {
    return this.activeGenerations.get(generationId) || null;
  }

  /**
   * Get current model configuration
   */
  getModelConfig() {
    return getActiveModelConfig();
  }

  /**
   * Get service status
   */
  async getStatus() {
    const serverStatus = await getAllServersStatus();
    const modelConfig = getActiveModelConfig();

    return {
      enabled: config.fluxMultiGPU?.enabled ?? true,
      model: modelConfig,
      servers: serverStatus,
      activeGenerations: this.activeGenerations.size,
    };
  }
}

// Export singleton instance
const sdxlMultiGPUService = new SDXLMultiGPUService();

export default sdxlMultiGPUService;

// Also export as fluxMultiGPUService for backwards compatibility
export const fluxMultiGPUService = sdxlMultiGPUService;

export {
  SDXLMultiGPUService,
  sdxlMultiGPUService,
  getAllThemes,
  getThemeById,
  getAllServersStatus,
  generateSingle,
  generateParallel,
  addDomainWatermark,
  setWatermarkStyle,
  WATERMARK_STYLES,
  DEFAULT_WATERMARK_STYLE,
  buildSDXLWorkflow,
  buildFluxGGUFWorkflow,
  buildWorkflow,
  getServerVramUsage,
  isDisplayGPUSafe,
  getActiveModelConfig,
  isSDXLModel,
  setActiveModel,
  getAvailableModels,
  clearAllVRAM,
  gpuHealthWatcher,
  generateOnServer,
  getAvailableServers,
  _generateSingleDirect,
  _generateParallelDirect,
  MODEL_CONFIG,
  SERVERS,
  DISPLAY_GPU_CONFIG,
};
