#!/bin/bash
# HSR Flux Schnell - 3x Parallel GGUF Q8 Mode
# Each GPU runs its own instance = 3x throughput!

echo "=== HSR Flux Schnell 3x Parallel GGUF Q8 ==="
echo ""
echo "Starting 3 ComfyUI instances (one per GPU):"
echo "  GPU 0 (cuda:0) -> Port 8188"
echo "  GPU 1 (cuda:1) -> Port 8189"
echo "  GPU 2 (cuda:2) -> Port 8190"
echo ""

cd /home/localai/ComfyUI
source venv/bin/activate

# Start instance on GPU 0
echo "Starting GPU 0 on port 8188..."
CUDA_VISIBLE_DEVICES=0 python main.py --port 8188 &
PID0=$!
sleep 5

# Start instance on GPU 1
echo "Starting GPU 1 on port 8189..."
CUDA_VISIBLE_DEVICES=1 python main.py --port 8189 &
PID1=$!
sleep 5

# Start instance on GPU 2
echo "Starting GPU 2 on port 8190..."
CUDA_VISIBLE_DEVICES=2 python main.py --port 8190 &
PID2=$!

echo ""
echo "All instances started!"
echo "  http://127.0.0.1:8188 (GPU 0)"
echo "  http://127.0.0.1:8189 (GPU 1)"
echo "  http://127.0.0.1:8190 (GPU 2)"
echo ""
echo "Press Ctrl+C to stop all instances"

# Trap to kill all on exit
trap "kill $PID0 $PID1 $PID2 2>/dev/null; exit" INT TERM

# Wait for any to exit
wait
