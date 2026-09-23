/**
 * Flux Multi-GPU Service - Backwards Compatibility Layer
 *
 * This file re-exports from sdxlMultiGPU.js for backwards compatibility.
 * The new service supports both SDXL (default, more stable) and Flux GGUF.
 *
 * To switch models, set environment variable:
 *   IMAGE_MODEL=sdxl           # SDXL base (default, most stable, ~6GB)
 *   IMAGE_MODEL=sdxl-playground # Playground v2.5 (better aesthetics, ~6GB)
 *   IMAGE_MODEL=flux-gguf-q4   # Flux Schnell Q4 (stable, ~6-7GB)
 *   IMAGE_MODEL=flux-gguf-q5   # Flux Schnell Q5 (good balance, ~8-9GB)
 *   IMAGE_MODEL=flux-gguf      # Flux Schnell Q8 (may crash on 12GB, ~12.7GB)
 */

// Re-export everything from the new SDXL service
export {
  default,
  SDXLMultiGPUService as FluxMultiGPUService,
  sdxlMultiGPUService as fluxMultiGPUService,
  getAllThemes,
  getThemeById,
  getAllServersStatus,
  generateParallel,
  addDomainWatermark,
  setWatermarkStyle,
  WATERMARK_STYLES,
  DEFAULT_WATERMARK_STYLE,
  buildSDXLWorkflow,
  buildFluxGGUFWorkflow as buildGGUFWorkflow,
  buildWorkflow,
  getServerVramUsage,
  isDisplayGPUSafe,
  getActiveModelConfig,
  setActiveModel,
  getAvailableModels,
  isSDXLModel,
  gpuHealthWatcher,
  MODEL_CONFIG,
  SERVERS,
  DISPLAY_GPU_CONFIG,
} from './sdxlMultiGPU.js';
