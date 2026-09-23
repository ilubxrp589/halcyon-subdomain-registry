#!/bin/bash
# PM2 Watchdog Script - Monitors PM2 and restarts crashed services
# Run via cron every minute: * * * * * /home/localai/Desktop/HSR/backend/pm2-watchdog.sh

LOG_FILE="/home/localai/Desktop/FULL HSR start/logs/pm2-watchdog.log"
PM2_BIN="/home/localai/.nvm/versions/node/v24.12.0/lib/node_modules/pm2/bin/pm2"
ECOSYSTEM="/home/localai/Desktop/HSR/backend/ecosystem.config.cjs"

export PATH="/home/localai/.nvm/versions/node/v24.12.0/bin:$PATH"
export PM2_HOME="/home/localai/.pm2"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Check if PM2 daemon is running
if ! pgrep -f "PM2" > /dev/null 2>&1; then
    log "CRITICAL: PM2 daemon not running! Starting PM2 and resurrecting processes..."
    $PM2_BIN resurrect >> "$LOG_FILE" 2>&1

    if [ $? -ne 0 ]; then
        log "Resurrect failed, starting from ecosystem config..."
        $PM2_BIN start "$ECOSYSTEM" >> "$LOG_FILE" 2>&1
    fi

    $PM2_BIN save >> "$LOG_FILE" 2>&1
    log "PM2 daemon recovery attempted"
    exit 0
fi

# Check for errored/stopped processes and restart them
ERRORED=$($PM2_BIN jlist 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    errored = [p['name'] for p in data if p.get('pm2_env', {}).get('status') in ('errored', 'stopped')]
    print(' '.join(errored))
except:
    pass
" 2>/dev/null)

if [ -n "$ERRORED" ]; then
    log "Found errored/stopped processes: $ERRORED"
    for proc in $ERRORED; do
        log "Restarting $proc..."
        $PM2_BIN restart "$proc" >> "$LOG_FILE" 2>&1
    done
fi

# Check for processes that exceeded max_restarts (status will show as 'stopped')
# and reset their restart count
STOPPED_COUNT=$($PM2_BIN jlist 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    count = sum(1 for p in data if p.get('pm2_env', {}).get('status') == 'stopped')
    print(count)
except:
    print(0)
" 2>/dev/null)

if [ "$STOPPED_COUNT" -gt 0 ]; then
    log "Found $STOPPED_COUNT stopped processes - checking if restart limit reached..."

    # Reset restart counters for stopped processes and restart them
    $PM2_BIN jlist 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for p in data:
        env = p.get('pm2_env', {})
        if env.get('status') == 'stopped':
            print(p['name'])
except:
    pass
" 2>/dev/null | while read proc; do
        log "Resetting and restarting $proc..."
        $PM2_BIN delete "$proc" >> "$LOG_FILE" 2>&1
    done

    # Restart from ecosystem config to get fresh instances
    $PM2_BIN start "$ECOSYSTEM" >> "$LOG_FILE" 2>&1
    $PM2_BIN save >> "$LOG_FILE" 2>&1
fi

# GPU health check - if nvidia-smi fails, log it (GPUs may need reset)
if ! nvidia-smi > /dev/null 2>&1; then
    log "WARNING: nvidia-smi failed - GPU may be in bad state"
fi
