#!/bin/bash
# HSR Triple SDXL Setup
# All 3 GPUs running SDXL for parallel image generation

cd /home/localai/ComfyUI
source venv/bin/activate

echo "=== HSR Triple SDXL Image Generation ==="
echo ""
echo "Starting 3 SDXL instances..."
echo "  GPU 0: http://localhost:8188"
echo "  GPU 1: http://localhost:8189"
echo "  GPU 2: http://localhost:8190"
echo ""

# GPU 0
CUDA_VISIBLE_DEVICES=0 python main.py --port 8188 &
PID0=$!
sleep 3

# GPU 1
CUDA_VISIBLE_DEVICES=1 python main.py --port 8189 &
PID1=$!
sleep 3

# GPU 2
CUDA_VISIBLE_DEVICES=2 python main.py --port 8190 &
PID2=$!

echo "PIDs: GPU0=$PID0, GPU1=$PID1, GPU2=$PID2"
echo "Press Ctrl+C to stop all instances"

trap "kill $PID0 $PID1 $PID2 2>/dev/null" EXIT
wait $PID0 $PID1 $PID2
