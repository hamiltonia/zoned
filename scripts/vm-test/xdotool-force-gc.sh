#!/bin/bash
#
# xdotool-force-gc.sh - Force garbage collection in GNOME Shell
#
# Triggers garbage collection by opening Looking Glass and running System.gc().
# Requires xdotool and X11 session.
#
# Usage:
#   ./xdotool-force-gc.sh [wait_seconds]
#
# Arguments:
#   wait_seconds - Seconds to wait for GC to complete (default: 1)
#

# Parse arguments
WAIT_TIME=${1:-3}

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if xdotool is installed
if ! command -v xdotool &> /dev/null; then
    echo -e "${RED}ERROR: xdotool is not installed${NC}"
    echo ""
    echo "Install xdotool to use automated garbage collection:"
    echo "  Fedora/RHEL: sudo dnf install xdotool"
    echo "  Ubuntu/Debian: sudo apt install xdotool"
    echo "  Arch: sudo pacman -S xdotool"
    echo ""
    exit 1
fi

# Check if we're in an X11 session (not Wayland)
if [ "$XDG_SESSION_TYPE" = "wayland" ]; then
    echo -e "${RED}ERROR: Wayland session detected${NC}"
    echo ""
    echo "xdotool only works on X11 sessions, not Wayland."
    echo ""
    echo "To use automated GC, switch to X11:"
    echo "  1. Logout"
    echo "  2. At login screen, click gear icon"
    echo "  3. Select 'GNOME on Xorg'"
    echo "  4. Login"
    echo ""
    echo "Fallback: Run GC manually with Alt+F2 → 'lg' → Enter → 'System.gc()'"
    echo ""
    exit 1
fi

# Check if DISPLAY is set, auto-detect for SSH sessions
if [ -z "$DISPLAY" ]; then
    # If in SSH session, try to use default X11 display
    if [ -n "$SSH_CONNECTION" ] || [ -n "$SSH_CLIENT" ]; then
        export DISPLAY=:0
        echo -e "${YELLOW}SSH session detected, using DISPLAY=:0${NC}"
    else
        # Not SSH and no DISPLAY - can't continue
        echo -e "${RED}ERROR: No DISPLAY found${NC}"
        echo ""
        echo "xdotool requires an X11 display."
        echo "Cannot auto-detect display in this environment."
        echo ""
        echo "Fallback: Run GC manually"
        echo ""
        exit 1
    fi
fi

# Validate wait time
if ! [[ "$WAIT_TIME" =~ ^[0-9]+$ ]]; then
    echo -e "${YELLOW}WARNING: Invalid wait time '$WAIT_TIME', using default (1s)${NC}"
    WAIT_TIME=1
fi

echo -e "${GREEN}Forcing garbage collection...${NC}"

# Execute GC sequence
xdotool key alt+F2
sleep 0.3
xdotool type lg
sleep 0.3
xdotool key Return
sleep 0.5
xdotool type 'System.gc()'
sleep 0.3
xdotool key Return
sleep 0.3
xdotool key Escape

# Wait for GC to complete
if [ "$WAIT_TIME" -gt 0 ]; then
    echo "Waiting ${WAIT_TIME}s for GC to complete..."
    sleep "$WAIT_TIME"
fi

echo -e "${GREEN}✓ Garbage collection complete${NC}"
exit 0
