#!/bin/bash
# Run this script with sudo to install robust PM2 configuration
# Usage: sudo bash /home/localai/Desktop/HSR/backend/INSTALL-ROBUST-PM2.sh

set -e

echo "=== Installing Robust PM2 Configuration ==="

# Backup existing service file
if [ -f /etc/systemd/system/pm2-localai.service ]; then
    cp /etc/systemd/system/pm2-localai.service /etc/systemd/system/pm2-localai.service.bak
    echo "✓ Backed up existing service file"
fi

# Install new service file
cp /home/localai/Desktop/HSR/backend/pm2-localai.service /etc/systemd/system/pm2-localai.service
echo "✓ Installed improved systemd service"

# Reload systemd
systemctl daemon-reload
echo "✓ Reloaded systemd daemon"

# Enable and start service
systemctl enable pm2-localai
systemctl start pm2-localai
echo "✓ Enabled and started PM2 service"

# Install cron job for watchdog (runs every minute)
CRON_LINE="* * * * * /home/localai/Desktop/HSR/backend/pm2-watchdog.sh"
(crontab -u localai -l 2>/dev/null | grep -v "pm2-watchdog.sh"; echo "$CRON_LINE") | crontab -u localai -
echo "✓ Installed watchdog cron job (runs every minute)"

# Create log directory if missing
mkdir -p "/home/localai/Desktop/FULL HSR start/logs"
chown localai:localai "/home/localai/Desktop/FULL HSR start/logs"
echo "✓ Ensured log directory exists"

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Improvements made:"
echo "  1. systemd service now uses Restart=always (was on-failure)"
echo "  2. Added RestartSec=10 for delay between restarts"
echo "  3. Added StartLimitBurst=5 / StartLimitIntervalSec=300 to prevent rapid loops"
echo "  4. Watchdog cron runs every minute to:"
echo "     - Resurrect PM2 daemon if it dies"
echo "     - Restart errored/stopped processes"
echo "     - Reset processes that hit max_restarts limit"
echo "  5. ComfyUI now has:"
echo "     - max_restarts: 50 (was 3)"
echo "     - exp_backoff_restart_delay for exponential backoff"
echo "     - PYTORCH_CUDA_ALLOC_CONF for better VRAM management"
echo ""
echo "To verify:"
echo "  systemctl status pm2-localai"
echo "  crontab -l"
echo "  pm2 list"
