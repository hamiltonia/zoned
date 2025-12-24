#!/bin/bash
#
# xdotool-restart-gnome.sh - Automated GNOME Shell restart using xdotool
#
# Restarts GNOME Shell by simulating Alt+F2 → 'r' → Enter keyboard sequence.
# Requires xdotool and X11 session.
#
# Usage:
#   ./xdotool-restart-gnome.sh [wait_seconds] [stabilization_wait]
#
# Arguments:
#   wait_seconds        - Seconds to wait for GNOME Shell to stabilize (default: 3)
#   stabilization_wait  - Additional seconds to wait for full stabilization (default: 0)
#

# Parse arguments
WAIT_TIME=${1:-3}
STABILIZATION_WAIT=${2:-0}

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if xdotool is installed
if ! command -v xdotool &> /dev/null; then
    echo -e "${RED}ERROR: xdotool is not installed${NC}"
    echo ""
    echo "Install xdotool to use automated GNOME Shell restart:"
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
    echo "To use automated restart, switch to X11:"
    echo "  1. Logout"
    echo "  2. At login screen, click gear icon"
    echo "  3. Select 'GNOME on Xorg'"
    echo "  4. Login"
    echo ""
    echo "Fallback: Restart GNOME Shell manually with Alt+F2 → 'r' → Enter"
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
        echo "Fallback: Restart GNOME Shell manually"
        echo ""
        exit 1
    fi
fi

# Validate wait time
if ! [[ "$WAIT_TIME" =~ ^[0-9]+$ ]] || [ "$WAIT_TIME" -lt 1 ]; then
    echo -e "${YELLOW}WARNING: Invalid wait time '$WAIT_TIME', using default (3s)${NC}"
    WAIT_TIME=3
fi

echo -e "${GREEN}Restarting GNOME Shell...${NC}"

# Execute restart sequence
xdotool key alt+F2
sleep 0.3
xdotool type r
sleep 0.3
xdotool key Return

# Wait for GNOME Shell to restart and stabilize
echo "Waiting ${WAIT_TIME}s for GNOME Shell to stabilize..."
sleep "$WAIT_TIME"

# Additional stabilization wait if requested
if [ "$STABILIZATION_WAIT" -gt 0 ]; then
    echo "Waiting additional ${STABILIZATION_WAIT}s for full stabilization..."
    sleep "$STABILIZATION_WAIT"
fi

echo -e "${GREEN}✓ GNOME Shell restart complete${NC}"
exit 0
