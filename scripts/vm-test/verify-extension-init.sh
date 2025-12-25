#!/bin/bash
#
# verify-extension-init.sh - Verify extension initialization
#
# This script verifies that the extension can initialize successfully:
#   1. Disables extension (if enabled)
#   2. Restarts GNOME Shell
#   3. Enables extension
#   4. Waits for InitCompleted D-Bus signal
#   5. Exits with code 0 on success, 1 on failure
#
# Parent scripts can call this to verify extension health before running tests.
#
# Usage:
#   ./verify-extension-init.sh [timeout]
#
# Arguments:
#   timeout - Timeout in seconds to wait for signal (default: 10)
#
# Exit codes:
#   0 - Extension initialized successfully
#   1 - Extension failed to initialize
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/setup.sh"

# Configuration
EXTENSION_UUID="zoned@hamiltonia.me"
TIMEOUT=${1:-10}  # Default 10 second timeout

echo "========================================"
echo "  Extension Initialization Verification"
echo "========================================"
echo ""

# Step 1: Disable extension
info "Step 1: Disabling extension..."
gnome-extensions disable "$EXTENSION_UUID" 2>/dev/null || true
sleep 1
echo "✓ Extension disabled"
echo ""

# Step 2: Restart GNOME Shell
info "Step 2: Restarting GNOME Shell..."
if ! "$SCRIPT_DIR/xdotool-restart-gnome.sh" 3 5; then
    error "GNOME Shell restart failed"
    exit 1
fi
echo "✓ GNOME Shell restarted"
echo ""

# Step 3: Start monitoring for InitCompleted signal, then enable extension
info "Step 3: Starting signal monitor and enabling extension..."

# Start gdbus monitor in background
TEMP_FILE=$(mktemp)
MONITOR_PID=""

gdbus monitor --session \
    --dest org.gnome.Shell \
    --object-path /org/gnome/Shell/Extensions/Zoned/Debug 2>/dev/null > "$TEMP_FILE" &
MONITOR_PID=$!

# Give monitor time to start
sleep 0.5

# Enable extension (signal will be emitted during initialization)
gnome-extensions enable "$EXTENSION_UUID" 2>/dev/null || true
echo "✓ Extension enabled, monitoring for signal..."
echo ""

# Step 4: Wait for InitCompleted signal
info "Step 4: Waiting for InitCompleted signal (timeout: ${TIMEOUT}s)..."
echo ""

# Wait for signal or timeout
SIGNAL_RECEIVED=0
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
    if grep -q "InitCompleted" "$TEMP_FILE" 2>/dev/null; then
        # Extract success status from signal
        SUCCESS_STATUS=$(grep "InitCompleted" "$TEMP_FILE" | grep -oP "true|false" | head -1)
        
        if [ "$SUCCESS_STATUS" = "true" ]; then
            echo "✓ Extension initialized successfully"
            SIGNAL_RECEIVED=1
            break
        else
            echo "✗ Extension initialization failed (signal received but success=false)"
            break
        fi
    fi
    
    sleep 0.5
    ELAPSED=$((ELAPSED + 1))
done

# Clean up monitor (disable exit-on-error for rest of script)
set +e
kill $MONITOR_PID 2>/dev/null
wait $MONITOR_PID 2>/dev/null
rm -f "$TEMP_FILE"

if [ $SIGNAL_RECEIVED -eq 1 ]; then
    # Verify D-Bus interface is responsive (retry a few times)
    echo "Verifying D-Bus interface..."
    DBUS_READY=0
    
    for attempt in 1 2 3 4 5; do
        dbus_interface_available
        AVAIL_RESULT=$?
        
        if [ $AVAIL_RESULT -eq 0 ]; then
            PING_RESULT=$(dbus_ping 2>/dev/null)
            if [ "$PING_RESULT" = "('pong',)" ]; then
                echo "✓ D-Bus interface verified (attempt $attempt)"
                DBUS_READY=1
                break
            else
                echo "  Attempt $attempt: Ping returned: '$PING_RESULT'"
            fi
        else
            echo "  Attempt $attempt: D-Bus interface not available yet"
        fi
        sleep 0.5
    done
    
    if [ $DBUS_READY -eq 0 ]; then
        echo "✗ D-Bus interface not responsive after init"
        echo ""
        echo "========================================"
        echo -e "  ${RED}VERIFICATION FAILED${NC}"
        echo "========================================"
        echo ""
        echo "D-Bus interface check failed after 5 retries."
        echo "This may indicate the extension didn't fully initialize."
        echo ""
        exit 1
    fi
    
    echo ""
    echo "========================================"
    echo -e "  ${GREEN}VERIFICATION PASSED${NC}"
    echo "========================================"
    echo ""
    echo "Extension initialized successfully and is ready for testing."
    echo ""
    exit 0
else
    echo ""
    echo "✗ Timeout waiting for InitCompleted signal after ${TIMEOUT}s"
    echo ""
    echo "========================================"
    echo -e "  ${RED}VERIFICATION FAILED${NC}"
    echo "========================================"
    echo ""
    echo "Extension failed to initialize properly."
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check logs: journalctl -f /usr/bin/gnome-shell"
    echo "  2. Verify D-Bus is enabled: gsettings get org.gnome.shell.extensions.zoned debug-expose-dbus"
    echo "  3. Check for JavaScript errors in extension code"
    echo ""
    exit 1
fi
