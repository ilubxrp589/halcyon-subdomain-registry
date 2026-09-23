// PM2 Ecosystem Configuration for Halcyon Subdomain Registry
// All services managed by PM2 for automatic restart and monitoring

module.exports = {
  apps: [
    // ============================================
    // BACKEND API SERVER
    // ============================================
    {
      name: 'halcyon-backend',
      script: 'src/index.js',
      cwd: '/home/localai/Desktop/HSR/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: 5000,
      env: {
        NODE_ENV: 'development',
      },
      error_file: '/home/localai/Desktop/FULL HSR start/logs/backend-error.log',
      out_file: '/home/localai/Desktop/FULL HSR start/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },

    // ============================================
    // FRONTEND (Next.js)
    // ============================================
    {
      name: 'halcyon-frontend',
      script: 'npm',
      args: 'run dev',
      cwd: '/home/localai/Desktop/HSR/frontend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: 10000,
      env: {
        NODE_ENV: 'development',
      },
      error_file: '/home/localai/Desktop/FULL HSR start/logs/frontend-error.log',
      out_file: '/home/localai/Desktop/FULL HSR start/logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },

    // ============================================
    // TASKBOARD - Vite Dev Server (UI on port 5173)
    // ============================================
    {
      name: 'hsr-taskboard',
      script: 'npm',
      args: 'run dev',
      cwd: '/home/localai/Desktop/Taskboard',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: 5000,
      env: {
        NODE_ENV: 'development',
      },
      error_file: '/home/localai/Desktop/FULL HSR start/logs/taskboard-error.log',
      out_file: '/home/localai/Desktop/FULL HSR start/logs/taskboard-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },

    // ============================================
    // TASKBOARD - API Server (data persistence on port 4000)
    // ============================================
    {
      name: 'hsr-taskboard-api',
      script: 'server.js',
      cwd: '/home/localai/Desktop/Taskboard',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: 5000,
      env: {
        NODE_ENV: 'development',
      },
      error_file: '/home/localai/Desktop/FULL HSR start/logs/taskboard-api-error.log',
      out_file: '/home/localai/Desktop/FULL HSR start/logs/taskboard-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },

    // ============================================
    // REDIRECT SERVER (URL Forwarding, Port 8080)
    // ============================================
    {
      name: 'halcyon-redirect',
      script: 'src/redirect-server.js',
      cwd: '/home/localai/Desktop/HSR/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: 5000,
      env: {
        NODE_ENV: 'development',
        REDIRECT_PORT: 8080,
      },
      error_file: '/home/localai/Desktop/FULL HSR start/logs/redirect-error.log',
      out_file: '/home/localai/Desktop/FULL HSR start/logs/redirect-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },

    // ============================================
    // HANDSHAKE NODE (HSD)
    // ============================================
    {
      name: 'halcyon-hsd',
      script: '/home/localai/.nvm/versions/node/v24.12.0/lib/node_modules/hsd/bin/hsd',
      cwd: '/home/localai',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      restart_delay: 5000,
      max_restarts: 5,
      min_uptime: 10000,
      error_file: '/home/localai/Desktop/FULL HSR start/logs/hsd-error.log',
      out_file: '/home/localai/Desktop/FULL HSR start/logs/hsd-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },

    // ============================================
    // DNS MONITORING AGENT (Port 8070)
    // ============================================
    {
      name: 'halcyon-dns-agent',
      script: 'src/agents/dns/index.js',
      cwd: '/home/localai/Desktop/HSR/backend',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: 5000,
      env: {
        NODE_ENV: 'development',
      },
      error_file: '/home/localai/Desktop/FULL HSR start/logs/dns-agent-error.log',
      out_file: '/home/localai/Desktop/FULL HSR start/logs/dns-agent-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },

    // ============================================
    // COMFYUI GPU 0 (Port 8188)
    // ============================================
    {
      name: 'comfyui-gpu0',
      script: '/home/localai/ComfyUI/venv/bin/python',
      args: '/home/localai/ComfyUI/main.py --port 8188',
      cwd: '/home/localai/ComfyUI',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '14G',
      restart_delay: 30000,        // 30s delay to ensure port is released
      max_restarts: 10,
      min_uptime: 60000,           // Must run 60s to be considered stable
      kill_timeout: 10000,         // 10s to kill process
      env: {
        CUDA_VISIBLE_DEVICES: '0',
        PYTORCH_CUDA_ALLOC_CONF: 'expandable_segments:True',  // Better VRAM management
      },
      error_file: '/home/localai/Desktop/FULL HSR start/logs/comfyui-gpu0-error.log',
      out_file: '/home/localai/Desktop/FULL HSR start/logs/comfyui-gpu0-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },

    // ============================================
    // COMFYUI GPU 1 (Port 8189)
    // ============================================
    {
      name: 'comfyui-gpu1',
      script: '/home/localai/ComfyUI/venv/bin/python',
      args: '/home/localai/ComfyUI/main.py --port 8189',
      cwd: '/home/localai/ComfyUI',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '14G',
      restart_delay: 15000,
      max_restarts: 50,
      min_uptime: 60000,           // Must run 60s to be considered stable
      kill_timeout: 10000,         // 10s to kill process
      env: {
        CUDA_VISIBLE_DEVICES: '1',
        PYTORCH_CUDA_ALLOC_CONF: 'expandable_segments:True',
      },
      error_file: '/home/localai/Desktop/FULL HSR start/logs/comfyui-gpu1-error.log',
      out_file: '/home/localai/Desktop/FULL HSR start/logs/comfyui-gpu1-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },

    // ============================================
    // COMFYUI GPU 2 (Port 8190)
    // ============================================
    {
      name: 'comfyui-gpu2',
      script: '/home/localai/ComfyUI/venv/bin/python',
      args: '/home/localai/ComfyUI/main.py --port 8190',
      cwd: '/home/localai/ComfyUI',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '14G',
      restart_delay: 15000,
      max_restarts: 50,
      min_uptime: 60000,           // Must run 60s to be considered stable
      kill_timeout: 10000,         // 10s to kill process
      env: {
        CUDA_VISIBLE_DEVICES: '2',
        PYTORCH_CUDA_ALLOC_CONF: 'expandable_segments:True',
      },
      error_file: '/home/localai/Desktop/FULL HSR start/logs/comfyui-gpu2-error.log',
      out_file: '/home/localai/Desktop/FULL HSR start/logs/comfyui-gpu2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
