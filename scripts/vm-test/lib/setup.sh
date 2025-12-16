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

# Source helper libraries
_SETUP_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$_SETUP_LIB_DIR/dbus-helpers.sh"
source "$_SETUP_LIB_DIR/assertions.sh"
