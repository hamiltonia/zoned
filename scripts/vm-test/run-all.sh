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
    ZONE_CYCLING_ITERATIONS=100
    LAYOUT_SWITCH_CYCLES=3
    COMBINED_STRESS_ITERATIONS=25
    MULTI_MONITOR_ITERATIONS=10
    WINDOW_MOVEMENT_ITERATIONS=15
else
    ENABLE_DISABLE_CYCLES=50
    UI_STRESS_ITERATIONS=50
    ZONE_CYCLING_ITERATIONS=500
    LAYOUT_SWITCH_CYCLES=10
    COMBINED_STRESS_ITERATIONS=100
    MULTI_MONITOR_ITERATIONS=25
    WINDOW_MOVEMENT_ITERATIONS=50
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

# Reload extension to ensure fresh code is loaded
echo ""
echo "Reloading extension for clean state..."
gnome-extensions disable zoned@hamiltonia.dev 2>/dev/null || true
sleep 1
gnome-extensions enable zoned@hamiltonia.dev 2>/dev/null || true
sleep 2
echo "Extension reloaded"

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

echo ""
echo "========================================"
echo "  Test 2: UI Stress Test"
echo "========================================"
"$SCRIPT_DIR/test-ui-stress.sh" "$UI_STRESS_ITERATIONS"

echo ""
echo "========================================"
echo "  Test 3: Zone Cycling"
echo "========================================"
"$SCRIPT_DIR/test-zone-cycling.sh" "$ZONE_CYCLING_ITERATIONS"

echo ""
echo "========================================"
echo "  Test 4: Layout Switching"
echo "========================================"
"$SCRIPT_DIR/test-layout-switching.sh" "$LAYOUT_SWITCH_CYCLES"

echo ""
echo "========================================"
echo "  Test 5: Combined Stress"
echo "========================================"
"$SCRIPT_DIR/test-combined-stress.sh" "$COMBINED_STRESS_ITERATIONS"

echo ""
echo "========================================"
echo "  Test 6: Multi-Monitor"
echo "========================================"
"$SCRIPT_DIR/test-multi-monitor.sh" "$MULTI_MONITOR_ITERATIONS"

echo ""
echo "========================================"
echo "  Test 7: Window Movement"
echo "========================================"
"$SCRIPT_DIR/test-window-movement.sh" "$WINDOW_MOVEMENT_ITERATIONS"

# Disable debug features
echo ""
echo "Disabling debug features..."
gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus false 2>/dev/null || true
gsettings set org.gnome.shell.extensions.zoned debug-track-resources false 2>/dev/null || true

echo ""
echo "========================================"
echo -e "  ${GREEN}All Tests Completed!${NC}"
echo "========================================"
