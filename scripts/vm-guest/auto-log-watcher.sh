#!/bin/bash
#
# auto-log-watcher.sh - VM guest-side log watcher
#
# This script runs inside the VM to automatically pipe extension logs
# to the shared folder where they can be viewed from the host.
#
# INSTALLATION (run in VM):
#   1. Copy this script to VM
#   2. Make executable: chmod +x auto-log-watcher.sh
#   3. Run in background: nohup ./auto-log-watcher.sh &
#   4. Or add to ~/.bashrc (see below)
#
# TO ADD TO ~/.bashrc (run in VM):
#   cat >> ~/.bashrc << 'EOF'
#   # Auto-start Zoned extension log watcher
#   if [ -z "$ZONED_LOG_WATCHER" ]; then
#       export ZONED_LOG_WATCHER=1
#       nohup bash -c 'journalctl -f /usr/bin/gnome-shell 2>/dev/null | \
#           grep --line-buffered -i zoned | \
#           tee /run/user/1000/spice-client-folder/zoned-extension.log' \
#           > /dev/null 2>&1 &
#   fi
#   EOF
#

# Shared folder mount point (virtiofs standard location)
VIRTIOFS_MOUNT="/mnt/zoned"
LOG_FILE="$VIRTIOFS_MOUNT/zoned-extension.log"

# Check if shared folder exists
if [ ! -d "$VIRTIOFS_MOUNT" ]; then
    echo "Error: Shared folder not mounted at $VIRTIOFS_MOUNT"
    echo "Make sure virtiofs is configured and mounted."
    exit 1
fi

echo "Starting Zoned extension log watcher..."
echo "Logs will be written to: $LOG_FILE"
echo "View from host: tail -f ~/GitHub/zoned/zoned-extension.log"
echo

# Tail GNOME Shell logs, filter for 'zoned', write to shared folder
journalctl -f /usr/bin/gnome-shell 2>/dev/null | \
    grep --line-buffered -i zoned | \
    tee "$LOG_FILE"
