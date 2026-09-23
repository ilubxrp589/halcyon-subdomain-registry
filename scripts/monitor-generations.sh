#!/bin/bash
# HSR Generation Monitor - Real-time monitoring of image generation

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

while true; do
    clear
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}                    HSR GENERATION MONITOR                          ${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}$(date '+%Y-%m-%d %H:%M:%S')${NC}"
    echo ""

    # GPU Status
    echo -e "${BLUE}┌─── GPU STATUS ───────────────────────────────────────────────────┐${NC}"
    nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader 2>/dev/null | while read line; do
        idx=$(echo "$line" | cut -d',' -f1 | tr -d ' ')
        name=$(echo "$line" | cut -d',' -f2 | tr -d ' ' | cut -c1-15)
        util=$(echo "$line" | cut -d',' -f3 | tr -d ' ')
        mem_used=$(echo "$line" | cut -d',' -f4 | tr -d ' ')
        mem_total=$(echo "$line" | cut -d',' -f5 | tr -d ' ')
        temp=$(echo "$line" | cut -d',' -f6 | tr -d ' ')

        # Color code utilization
        util_num=${util%\%}
        if [ "$util_num" -gt 80 ]; then
            util_color=$RED
        elif [ "$util_num" -gt 20 ]; then
            util_color=$GREEN
        else
            util_color=$NC
        fi

        printf "│ GPU%s: ${util_color}%5s${NC} | VRAM: %s / %s | Temp: %s\n" "$idx" "$util" "$mem_used" "$mem_total" "$temp"
    done
    echo -e "${BLUE}└───────────────────────────────────────────────────────────────────┘${NC}"
    echo ""

    # ComfyUI Server Status
    echo -e "${BLUE}┌─── COMFYUI SERVERS ──────────────────────────────────────────────┐${NC}"
    for port in 8188 8189 8190; do
        gpu_num=$((port - 8188))
        status=$(curl -s --max-time 1 http://localhost:$port/system_stats 2>/dev/null)
        if [ -n "$status" ]; then
            queue=$(echo "$status" | jq -r '.exec_info.queue_remaining // 0' 2>/dev/null)
            printf "│ GPU%d (:%d): ${GREEN}ONLINE${NC}  | Queue: %s\n" "$gpu_num" "$port" "$queue"
        else
            printf "│ GPU%d (:%d): ${RED}OFFLINE${NC}\n" "$gpu_num" "$port"
        fi
    done
    echo -e "${BLUE}└───────────────────────────────────────────────────────────────────┘${NC}"
    echo ""

    # Backend Status
    echo -e "${BLUE}┌─── BACKEND STATUS ───────────────────────────────────────────────┐${NC}"
    health=$(curl -s --max-time 1 http://localhost:8000/api/v1/health 2>/dev/null)
    if [ -n "$health" ]; then
        status=$(echo "$health" | jq -r '.status' 2>/dev/null)
        printf "│ Backend: ${GREEN}%s${NC}\n" "$status"
    else
        printf "│ Backend: ${RED}OFFLINE${NC}\n"
    fi

    # Get generation counts from server status
    server_status=$(curl -s --max-time 1 http://localhost:8000/api/v1/nft/flux-servers-status 2>/dev/null)
    if [ -n "$server_status" ]; then
        echo "$server_status" | jq -r '.servers[]? | "│ \(.name): Gen \(.generationCount)/\(.restartThreshold) | Status: \(.status)"' 2>/dev/null
    fi
    echo -e "${BLUE}└───────────────────────────────────────────────────────────────────┘${NC}"
    echo ""

    # Recent Generation Activity (last 10 lines with generation info)
    echo -e "${BLUE}┌─── RECENT ACTIVITY ──────────────────────────────────────────────┐${NC}"
    grep -E "(FluxMultiGPU|ComfyUIManager|Completed|Queued|Starting)" /tmp/backend.log 2>/dev/null | tail -8 | while read line; do
        # Truncate long lines
        echo "│ ${line:0:67}"
    done
    echo -e "${BLUE}└───────────────────────────────────────────────────────────────────┘${NC}"
    echo ""
    echo -e "${YELLOW}Press Ctrl+C to exit${NC}"

    sleep 2
done
