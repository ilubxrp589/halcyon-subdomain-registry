# GPU Infrastructure Setup Session - Feb 5, 2026

## Completed Work

### 192.0.2.249 (nosana4) - 2x RTX 3060 12GB - FULLY SET UP
- LACT fan control installed and configured with aggressive curve
- ComfyUI installed with PyTorch CUDA 12.4
- PM2 ecosystem config for 2 GPU instances (ports 8188, 8189)
- PM2 auto-startup enabled
- Added to GPU dashboard (MACHINES, REMOTE_HOSTS with display :1)
- Added to HSR backend (comfyuiManager.js, .env FLUX_EXTRA_SERVERS)

### HSR Backend Updates
- Removed local GPU references (no GPUs on 192.0.2.39 anymore)
- Updated comfyuiManager.js - now 6 remote GPUs (gpu0-gpu5)
- Updated config/index.js - removed local GPU definitions
- Updated sdxlMultiGPU.js - removed local GPU refs, updated fallbacks
- Updated gpuFanControl.js - disabled local queue poller
- Updated .env FLUX_EXTRA_SERVERS to include all 6 remote GPUs
- Backend restarted, local comfyui PM2 processes deleted

### GPU Dashboard (192.0.2.67:8085)
All 6 GPUs showing with RPM:
- 192.0.2.67: 2x RTX 3080 (gpu0, gpu1)
- 192.0.2.220: 2x RTX 3080 (gpu2, gpu3)
- 192.0.2.249: 2x RTX 3060 (gpu4, gpu5)

## In Progress - 192.0.2.97 (nosana2)

### Status: USER REINSTALLING UBUNTU
- Had 2x RTX 3060 detected
- Installed pre-signed nvidia-570 modules for Secure Boot
- LACT installed but couldn't detect GPUs (drm issue)
- Rebooted, got stuck at MOK enrollment
- User entered password, but network didn't come up
- User decided to reinstall Ubuntu fresh

### When .97 is ready, need to:
1. Get new credentials from user
2. Install nvidia driver (pre-signed for Secure Boot): `linux-modules-nvidia-570-$(uname -r)`
3. Install LACT: vulkan-tools, clinfo, then deb from GitHub
4. Configure LACT fan curve
5. Install ComfyUI: git clone, venv, pytorch cuda, requirements
6. Set up PM2 ecosystem config
7. Add to dashboard: REMOTE_HOSTS, MACHINES (check display number!)
8. Add to HSR backend: comfyuiManager.js (gpu6, gpu7), .env FLUX_EXTRA_SERVERS

## Current GPU Fleet

| Machine | GPUs | VRAM | Status |
|---------|------|------|--------|
| 192.0.2.67 | 2x RTX 3080 | 20GB | Online |
| 192.0.2.220 | 2x RTX 3080 | 20GB | Online |
| 192.0.2.249 | 2x RTX 3060 | 24GB | Online |
| 192.0.2.97 | 2x RTX 3060 | 24GB | Reinstalling |

## Key Files Modified

### Dashboard (192.0.2.67)
- `/home/mosana1/gpu-dashboard.py` - REMOTE_HOSTS, MACHINES dicts

### HSR Backend
- `/home/localai/Desktop/HSR/backend/.env` - FLUX_EXTRA_SERVERS
- `/home/localai/Desktop/HSR/backend/src/services/comfyuiManager.js` - GPU_SERVERS array
- `/home/localai/Desktop/HSR/backend/src/services/sdxlMultiGPU.js` - comments, fallback URLs
- `/home/localai/Desktop/HSR/backend/src/services/gpuFanControl.js` - disabled local poller
- `/home/localai/Desktop/HSR/backend/src/config/index.js` - removed local GPU config

## Credentials Reference
- 192.0.2.67: mosana1 (SSH key)
- 192.0.2.220: render1x3080 / REDACTED
- 192.0.2.249: nosana4 / REDACTED
- 192.0.2.97: (new creds after reinstall)

## LACT Config Template
```yaml
version: 5
daemon:
  log_level: info
  admin_group: sudo
  disable_clocks_cleanup: false
apply_settings_timer: 5
gpus:
  <GPU_ID>:
    fan_control_enabled: true
    fan_control_settings:
      mode: curve
      temperature_key: edge
      interval_ms: 500
      curve:
        30: 0.3
        40: 0.4
        50: 0.55
        60: 0.7
        70: 0.85
        80: 1.0
```

## PM2 Ecosystem Config Template
```javascript
module.exports = {
  apps: [
    {
      name: "comfyui-gpu0",
      cwd: "/home/<user>/ComfyUI",
      script: "venv/bin/python",
      args: "main.py --listen 0.0.0.0 --port 8188",
      env: { CUDA_VISIBLE_DEVICES: "0" },
      autorestart: true,
      watch: false,
      max_memory_restart: "10G"
    },
    {
      name: "comfyui-gpu1",
      cwd: "/home/<user>/ComfyUI",
      script: "venv/bin/python",
      args: "main.py --listen 0.0.0.0 --port 8189",
      env: { CUDA_VISIBLE_DEVICES: "1" },
      autorestart: true,
      watch: false,
      max_memory_restart: "10G"
    }
  ]
};
```
