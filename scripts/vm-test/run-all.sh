#!/bin/bash
#
# run-all.sh - Run all stability tests
#
# This script runs the complete stability test suite for the Zoned extension.
# Should be run inside the VM with a desktop session.
#
# Usage:
#   ./run-all.sh [--quick]
#
# Options:
#   --quick   Run reduced iterations for quick verification
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/setup.sh"

# Parse arguments
QUICK_MODE=false
if [ "$1" == "--quick" ]; then
    QUICK_MODE=true
    echo "Running in quick mode..."
fi

# Set iterations based on mode
if [ "$QUICK_MODE" = true ]; then
    ENABLE_DISABLE_CYCLES=10
    UI_STRESS_ITERATIONS=20
else
    ENABLE_DISABLE_CYCLES=50
    UI_STRESS_ITERATIONS=50
fi

echo "========================================"
echo "  Zoned Stability Test Suite"
echo "========================================"
echo ""
echo "  Mode: $([ "$QUICK_MODE" = true ] && echo 'Quick' || echo 'Full')"
echo "  Date: $(date)"
echo ""

# Check prerequisites
check_prerequisites

# Enable debug features
echo ""
echo "Enabling debug features..."
gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true 2>/dev/null || true
gsettings set org.gnome.shell.extensions.zoned debug-track-resources true 2>/dev/null || true

# Give extension time to set up D-Bus
echo "Waiting for debug interface to initialize..."
sleep 3

# Check if D-Bus interface is available
if dbus_interface_available; then
    echo -e "${GREEN}D-Bus debug interface available${NC}"
else
    echo -e "${YELLOW}Warning: D-Bus debug interface not available (continuing without D-Bus checks)${NC}"
fi

# Run tests
echo ""
echo "========================================"
echo "  Test 1: Enable/Disable Cycle"
echo "========================================"
"$SCRIPT_DIR/test-enable-disable.sh" "$ENABLE_DISABLE_CYCLES" 500

# Future tests can be added here:
# echo ""
# echo "========================================"
# echo "  Test 2: UI Stress Test"
# echo "========================================"
# "$SCRIPT_DIR/test-ui-stress.sh" "$UI_STRESS_ITERATIONS"

# Disable debug features
echo ""
echo "Disabling debug features..."
gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus false 2>/dev/null || true
gsettings set org.gnome.shell.extensions.zoned debug-track-resources false 2>/dev/null || true

echo ""
echo "========================================"
echo -e "  ${GREEN}All Tests Completed!${NC}"
echo "========================================"
