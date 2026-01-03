#!/bin/bash
# Setup and prerequisites for VM stability tests
# Source this file in test scripts

set -e

# Constants
EXTENSION_UUID="zoned@hamiltonia.me"
EXTENSION_PATH="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"
DBUS_DEST="org.gnome.Shell.Extensions.Zoned.Debug"
DBUS_PATH="/org/gnome/Shell/Extensions/Zoned/Debug"
DBUS_IFACE="org.gnome.Shell.Extensions.Zoned.Debug"

# Set GSETTINGS_SCHEMA_DIR so gsettings can find extension's schema
export GSETTINGS_SCHEMA_DIR="$EXTENSION_PATH/schemas"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Detect and export graphical session environment
# This is needed when running via SSH which doesn't inherit the desktop session
setup_graphical_session_env() {
    # If we already have a display, we're good
    if [ -n "$DISPLAY" ] || [ -n "$WAYLAND_DISPLAY" ]; then
        return 0
    fi
    
    # Try to find the graphical session
    local graphical_session=""
    local session_type=""
    
    # Find a graphical session (x11 or wayland) using loginctl
    for sid in $(loginctl --no-legend 2>/dev/null | awk '{print $1}'); do
        local type=$(loginctl show-session "$sid" -p Type --value 2>/dev/null)
        if [ "$type" = "x11" ] || [ "$type" = "wayland" ]; then
            graphical_session="$sid"
            session_type="$type"
            break
        fi
    done
    
    if [ -z "$graphical_session" ]; then
        return 1
    fi
    
    # Get the session's user
    local session_user=$(loginctl show-session "$graphical_session" -p Name --value 2>/dev/null)
    local session_uid=$(id -u "$session_user" 2>/dev/null)
    
    # Export D-Bus session address (systemd user bus)
    if [ -n "$session_uid" ]; then
        export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${session_uid}/bus"
    fi
    
    # Export display variables based on session type
    if [ "$session_type" = "x11" ]; then
        # Try to get DISPLAY from the session, default to :0
        local display=$(loginctl show-session "$graphical_session" -p Display --value 2>/dev/null)
        export DISPLAY="${display:-:0}"
    elif [ "$session_type" = "wayland" ]; then
        # Wayland display is typically wayland-0
        export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
        # Also set XDG_RUNTIME_DIR if not set
        if [ -z "$XDG_RUNTIME_DIR" ] && [ -n "$session_uid" ]; then
            export XDG_RUNTIME_DIR="/run/user/${session_uid}"
        fi
    fi
    
    return 0
}

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."
    
    # Try to set up graphical session environment (for SSH sessions)
    setup_graphical_session_env
    
    # Check if running in a graphical session
    if [ -z "$DISPLAY" ] && [ -z "$WAYLAND_DISPLAY" ]; then
        echo -e "${RED}Error: No display available. Run this inside a VM with a desktop session.${NC}"
        echo -e "${YELLOW}Hint: Make sure you're logged into the desktop in the VM.${NC}"
        exit 1
    fi
    
    # Check if gnome-extensions command exists
    if ! command -v gnome-extensions &> /dev/null; then
        echo -e "${RED}Error: gnome-extensions command not found${NC}"
        exit 1
    fi
    
    # Check if extension is installed
    if ! gnome-extensions list | grep -q "$EXTENSION_UUID"; then
        echo -e "${RED}Error: Zoned extension not installed${NC}"
        exit 1
    fi
    
    # Check if extension is enabled
    if ! gnome-extensions list --enabled | grep -q "$EXTENSION_UUID"; then
        echo -e "${YELLOW}Warning: Extension not enabled. Enabling...${NC}"
        gnome-extensions enable "$EXTENSION_UUID"
        sleep 2
    fi
    
    # Check if jq is available (for JSON parsing)
    if ! command -v jq &> /dev/null; then
        echo -e "${YELLOW}Warning: jq not installed. Some tests may have limited functionality.${NC}"
    fi
    
    # Check if bc is available (for sleep_ms)
    if ! command -v bc &> /dev/null; then
        echo -e "${YELLOW}Warning: bc not installed. Using integer sleep instead.${NC}"
    fi
    
    echo -e "${GREEN}Prerequisites check passed${NC}"
}

# Send desktop notification (gracefully skips if notify-send unavailable)
# Usage: send_notification STATUS TITLE MESSAGE
#   STATUS: PASS, WARN, or FAIL
#   TITLE: Notification title
#   MESSAGE: Notification body
send_notification() {
    local status="$1"
    local title="$2"
    local message="$3"
    
    # Map status to urgency and icon
    local urgency="normal"
    local icon="dialog-information"
    
    case "$status" in
        PASS)
            urgency="normal"
            icon="dialog-information"
            ;;
        WARN)
            urgency="normal"
            icon="dialog-warning"
            ;;
        FAIL)
            urgency="critical"
            icon="dialog-error"
            ;;
    esac
    
    # Detect if we're running in a VM
    local in_vm=false
    if command -v systemd-detect-virt &> /dev/null; then
        if systemd-detect-virt -q 2>/dev/null; then
            in_vm=true
        fi
    fi
    
    # If in VM, try to send notification to host
    if [ "$in_vm" = true ]; then
        # Get gateway IP (typically the host for libvirt VMs)
        local gateway_ip=$(ip route | grep default | awk '{print $3}' | head -1)
        
        if [ -n "$gateway_ip" ]; then
            # Try to send notification to host via SSH
            # Use BatchMode to avoid password prompts, ConnectTimeout for quick failure
            ssh -o BatchMode=yes -o ConnectTimeout=2 -o StrictHostKeyChecking=no "$gateway_ip" \
                "DISPLAY=:0 notify-send -u '$urgency' -i '$icon' -a 'zoned-test (VM)' '$title' '$message'" \
                2>/dev/null && return 0
        fi
        
        # If SSH to host failed, fall through to local notification
    fi
    
    # Send notification locally (either not in VM, or host notification failed)
    if command -v notify-send &> /dev/null; then
        notify-send -u "$urgency" -i "$icon" -a "zoned-test" "$title" "$message" 2>/dev/null || true
    fi
}

# Force garbage collection via Looking Glass
# Calls the standalone xdotool-force-gc.sh script
force_gc() {
    local script_path="$_SETUP_LIB_DIR/../xdotool-force-gc.sh"
    
    if [ ! -x "$script_path" ]; then
        echo -e "${YELLOW}Warning: xdotool-force-gc.sh not found or not executable${NC}"
        return 1
    fi
    
    "$script_path" 1 || return 1
}

# Check for critical exceptions in recent GNOME Shell logs
# Usage: check_for_exceptions [minutes]
#   minutes - How many minutes back to check logs (default: 5)
# Returns: 0 if no exceptions, 1 if critical exception found
# Debug: Set EXCEPTION_DEBUG=1 to see detailed checking progress
check_for_exceptions() {
    local since_minutes=${1:-5}
    
    # Always show that we're checking (user feedback)
    echo -n "⏳ Checking for exceptions in last ${since_minutes} minute(s)... "
    
    if [ "${EXCEPTION_DEBUG:-0}" = "1" ]; then
        echo ""
        echo "[EXCEPTION DEBUG] Fetching logs from journalctl..." >&2
    fi
    
    # Get recent logs from GNOME Shell (suppress stderr to avoid noise)
    local logs=$(journalctl --since "${since_minutes} minutes ago" \
                           /usr/bin/gnome-shell 2>/dev/null || echo "")
    
    # If journalctl failed or returned nothing, skip check
    if [ -z "$logs" ]; then
        if [ "${EXCEPTION_DEBUG:-0}" = "1" ]; then
            echo "[EXCEPTION DEBUG] No logs found, skipping check" >&2
        fi
        echo "⚠ No logs available"
        return 0
    fi
    
    if [ "${EXCEPTION_DEBUG:-0}" = "1" ]; then
        local log_lines=$(echo "$logs" | wc -l)
        echo "[EXCEPTION DEBUG] Found $log_lines log lines to scan" >&2
    fi
    
    # Critical patterns to check (zoned-specific errors)
    local critical_patterns=(
        "JS ERROR:.*zoned"
        "Gjs-CRITICAL.*zoned"
        "Exception in.*zoned"
        "stack trace:.*zoned"
        "@file:///.*zoned@hamiltonia\.me"  # Catch stack traces by file path
        "\[Zoned:DebugInterface\] TriggerAction error"  # Catch D-Bus wrapped exceptions
    )
    
    # Check each pattern
    local exception_found=false
    local exception_lines=""
    local matched_pattern=""
    
    for pattern in "${critical_patterns[@]}"; do
        if [ "${EXCEPTION_DEBUG:-0}" = "1" ]; then
            echo "[EXCEPTION DEBUG] Checking pattern: $pattern" >&2
        fi
        
        if echo "$logs" | grep -qE "$pattern"; then
            exception_found=true
            matched_pattern="$pattern"
            # Capture matching lines and some context
            exception_lines=$(echo "$logs" | grep -E "$pattern" -A 5 | tail -20)
            
            if [ "${EXCEPTION_DEBUG:-0}" = "1" ]; then
                echo "[EXCEPTION DEBUG] ✗ Pattern MATCHED!" >&2
                echo "[EXCEPTION DEBUG] First few matching lines:" >&2
                echo "$exception_lines" | head -5 >&2
            fi
            break
        fi
    done
    
    if [ "$exception_found" = true ]; then
        echo "✗ EXCEPTION FOUND"
        echo ""
        echo "========================================="
        echo "  CRITICAL EXCEPTION DETECTED"
        echo "========================================="
        echo ""
        echo "Pattern matched: $matched_pattern"
        echo ""
        echo "Extension exception found in GNOME Shell logs:"
        echo ""
        echo "$exception_lines"
        echo ""
        echo "Test suite aborted to prevent invalid results."
        echo "========================================="
        echo ""
        return 1
    fi
    
    if [ "${EXCEPTION_DEBUG:-0}" = "1" ]; then
        echo "[EXCEPTION DEBUG] ✓ No patterns matched" >&2
    fi
    
    echo "✓ None found"
    return 0
}

# Source helper libraries
_SETUP_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$_SETUP_LIB_DIR/dbus-helpers.sh"
source "$_SETUP_LIB_DIR/assertions.sh"
