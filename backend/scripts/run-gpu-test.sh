#!/bin/bash

# GPU Test Runner Helper Script
# Usage: ./run-gpu-test.sh [section] [options]
#
# Examples:
#   ./run-gpu-test.sh list          - List all sections
#   ./run-gpu-test.sh status        - Show section statuses
#   ./run-gpu-test.sh A1            - Run section A1
#   ./run-gpu-test.sh A1 resume     - Resume section A1
#   ./run-gpu-test.sh A1 dry        - Dry run section A1
#   ./run-gpu-test.sh A1 bg         - Run section A1 in background
#   ./run-gpu-test.sh check         - Check prerequisites

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HSR_DIR="$(dirname "$SCRIPT_DIR")"
TEST_SCRIPT="$SCRIPT_DIR/comprehensive-gpu-test.js"
LOG_DIR="/home/localai/Desktop/ThemeTests/comprehensive/logs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create log directory if needed
mkdir -p "$LOG_DIR"

# Functions
check_prerequisites() {
    echo -e "${BLUE}Checking prerequisites...${NC}"
    echo ""

    # Check ComfyUI servers
    for port in 8188 8189 8190; do
        if curl -s "http://127.0.0.1:$port/system_stats" > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} ComfyUI on port $port"
        else
            echo -e "  ${RED}✗${NC} ComfyUI on port $port - NOT RUNNING"
        fi
    done

    # Check Ollama
    if curl -s "http://127.0.0.1:11434/api/tags" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Ollama API"

        # Check LLaVA model
        if curl -s "http://127.0.0.1:11434/api/tags" | grep -q "llava"; then
            echo -e "  ${GREEN}✓${NC} LLaVA model installed"
        else
            echo -e "  ${YELLOW}!${NC} LLaVA model not found - run: ollama pull llava:7b"
        fi
    else
        echo -e "  ${RED}✗${NC} Ollama API - NOT RUNNING"
    fi

    # Check PostgreSQL
    if pg_isready -q 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} PostgreSQL"
    else
        echo -e "  ${RED}✗${NC} PostgreSQL - NOT RUNNING"
    fi

    # Check output directory
    OUTPUT_DIR="/home/localai/Desktop/ThemeTests/comprehensive"
    if [ -d "$OUTPUT_DIR" ]; then
        echo -e "  ${GREEN}✓${NC} Output directory exists"
    else
        echo -e "  ${YELLOW}!${NC} Creating output directory..."
        mkdir -p "$OUTPUT_DIR"
        echo -e "  ${GREEN}✓${NC} Output directory created"
    fi

    echo ""
    echo "Run 'node $TEST_SCRIPT --list' to see available sections"
}

run_section() {
    local section=$1
    local option=$2

    case $option in
        resume)
            echo -e "${BLUE}Resuming section $section...${NC}"
            node "$TEST_SCRIPT" --section "$section" --resume
            ;;
        dry)
            echo -e "${BLUE}Dry run for section $section...${NC}"
            node "$TEST_SCRIPT" --section "$section" --dry-run
            ;;
        bg)
            local logfile="$LOG_DIR/${section}_$(date +%Y%m%d_%H%M%S).log"
            echo -e "${BLUE}Running section $section in background...${NC}"
            echo -e "Log file: $logfile"
            nohup node "$TEST_SCRIPT" --section "$section" > "$logfile" 2>&1 &
            local pid=$!
            echo -e "PID: $pid"
            echo -e "${GREEN}Use 'tail -f $logfile' to monitor progress${NC}"
            ;;
        *)
            echo -e "${BLUE}Running section $section...${NC}"
            node "$TEST_SCRIPT" --section "$section"
            ;;
    esac
}

show_help() {
    echo -e "${BLUE}GPU Test Runner${NC}"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  list              List all available test sections"
    echo "  status            Show status of all sections"
    echo "  check             Check prerequisites (ComfyUI, Ollama, PostgreSQL)"
    echo "  <section>         Run a specific section (e.g., A1, B3)"
    echo ""
    echo "Options (when running a section):"
    echo "  resume            Resume interrupted section"
    echo "  dry               Dry run (preview without generating)"
    echo "  bg                Run in background with logging"
    echo ""
    echo "Examples:"
    echo "  $0 check          # Check if all services are running"
    echo "  $0 list           # List all sections"
    echo "  $0 A1             # Run section A1"
    echo "  $0 A1 resume      # Resume section A1"
    echo "  $0 A1 bg          # Run A1 in background"
    echo ""
    echo "Test Sections:"
    echo "  Phase A (Theme Coverage): A1-A8"
    echo "  Phase B (Style Coverage): B1-B12"
    echo ""
    echo "Full documentation: $SCRIPT_DIR/GPU_TEST_INSTRUCTIONS.md"
}

# Main
case "${1:-help}" in
    help|--help|-h)
        show_help
        ;;
    check)
        check_prerequisites
        ;;
    list)
        node "$TEST_SCRIPT" --list
        ;;
    status)
        node "$TEST_SCRIPT" --status
        ;;
    A[1-8]|B[1-9]|B1[0-2])
        run_section "$1" "$2"
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac
