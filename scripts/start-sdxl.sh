#!/bin/bash
# HSR SDXL Single GPU
# Runs SDXL on GPU 0 - Port 8188

cd /home/localai/ComfyUI
source venv/bin/activate

echo "=== HSR SDXL Image Generation ==="
echo "GPU 0 - SDXL: http://localhost:8188"
echo ""

CUDA_VISIBLE_DEVICES=0 python main.py --port 8188
