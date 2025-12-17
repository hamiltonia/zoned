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

# Results file for aggregation
export TEST_RESULTS_FILE="/tmp/zoned-test-results.txt"
SUITE_START_TIME=$(date +%s)

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
    WINDOW_MOVEMENT_PASSES=1
    WINDOW_MOVEMENT_LAYOUTS=2  # Limit layouts for quick test
else
    ENABLE_DISABLE_CYCLES=50
    UI_STRESS_ITERATIONS=50
    ZONE_CYCLING_ITERATIONS=500
    LAYOUT_SWITCH_CYCLES=10
    COMBINED_STRESS_ITERATIONS=100
    MULTI_MONITOR_ITERATIONS=25
    WINDOW_MOVEMENT_PASSES=2
    WINDOW_MOVEMENT_LAYOUTS=0  # 0 = all layouts
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

# Initialize results file (clear any previous results)
> "$TEST_RESULTS_FILE"

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

# Track failed tests
FAILED_TESTS=0

# Run tests (capture exit codes but don't exit on failure)
echo ""
echo "========================================"
echo "  Test 1: Enable/Disable Cycle"
echo "========================================"
export TEST_NAME="Enable/Disable"
"$SCRIPT_DIR/test-enable-disable.sh" "$ENABLE_DISABLE_CYCLES" 500 || ((++FAILED_TESTS))

echo ""
echo "========================================"
echo "  Test 2: UI Stress Test"
echo "========================================"
export TEST_NAME="UI Stress"
"$SCRIPT_DIR/test-ui-stress.sh" "$UI_STRESS_ITERATIONS" || ((++FAILED_TESTS))

echo ""
echo "========================================"
echo "  Test 3: Zone Cycling"
echo "========================================"
export TEST_NAME="Zone Cycling"
"$SCRIPT_DIR/test-zone-cycling.sh" "$ZONE_CYCLING_ITERATIONS" || ((++FAILED_TESTS))

echo ""
echo "========================================"
echo "  Test 4: Layout Switching"
echo "========================================"
export TEST_NAME="Layout Switching"
"$SCRIPT_DIR/test-layout-switching.sh" "$LAYOUT_SWITCH_CYCLES" || ((++FAILED_TESTS))

echo ""
echo "========================================"
echo "  Test 5: Combined Stress"
echo "========================================"
export TEST_NAME="Combined Stress"
"$SCRIPT_DIR/test-combined-stress.sh" "$COMBINED_STRESS_ITERATIONS" || ((++FAILED_TESTS))

echo ""
echo "========================================"
echo "  Test 6: Multi-Monitor"
echo "========================================"
export TEST_NAME="Multi-Monitor"
"$SCRIPT_DIR/test-multi-monitor.sh" "$MULTI_MONITOR_ITERATIONS" || ((++FAILED_TESTS))

echo ""
echo "========================================"
echo "  Test 7: Window Movement"
echo "========================================"
export TEST_NAME="Window Movement"
"$SCRIPT_DIR/test-window-movement.sh" "$WINDOW_MOVEMENT_PASSES" "$WINDOW_MOVEMENT_LAYOUTS" || ((++FAILED_TESTS))

# Disable debug features
echo ""
echo "Disabling debug features..."
gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus false 2>/dev/null || true
gsettings set org.gnome.shell.extensions.zoned debug-track-resources false 2>/dev/null || true

# Calculate suite duration
SUITE_END_TIME=$(date +%s)
SUITE_DURATION=$((SUITE_END_TIME - SUITE_START_TIME))
SUITE_MINS=$((SUITE_DURATION / 60))
SUITE_SECS=$((SUITE_DURATION % 60))

# Print final summary
echo ""
echo "========================================"
echo "        FINAL TEST RESULTS"
echo "========================================"
echo ""

# Parse results file and display table
printf "%-20s | %-6s | %4s | %4s | %4s | %8s | %6s\n" "Test" "Status" "Pass" "Fail" "Warn" "Mem" "Time"
printf "%-20s-|-%6s-|-%4s-|-%4s-|-%4s-|-%8s-|-%6s\n" "--------------------" "------" "----" "----" "----" "--------" "------"

total_pass=0
total_fail=0
total_warn=0
total_mem=0
passed_tests=0
skipped_tests=0

while IFS='|' read -r name status pass fail warn mem duration; do
    # Skip empty lines
    [ -z "$name" ] && continue
    
    # Format memory change
    if [ "$mem" -gt 0 ]; then
        mem_str="+${mem}KB"
    elif [ "$mem" -lt 0 ]; then
        mem_str="${mem}KB"
    else
        mem_str="0KB"
    fi
    
    # Format duration
    if [ "$duration" -gt 0 ]; then
        dur_str="${duration}s"
    else
        dur_str="-"
    fi
    
    # Status symbol
    case "$status" in
        PASS) 
            status_str="  ✓   "
            ((++passed_tests))
            ;;
        FAIL) 
            status_str="  ✗   "
            ;;
        SKIP) 
            status_str=" SKIP "
            ((++skipped_tests))
            ;;
        *) 
            status_str="  ?   "
            ;;
    esac
    
    printf "%-20s | %s | %4s | %4s | %4s | %8s | %6s\n" "$name" "$status_str" "$pass" "$fail" "$warn" "$mem_str" "$dur_str"
    
    if [ "$status" != "SKIP" ]; then
        total_pass=$((total_pass + pass))
        total_fail=$((total_fail + fail))
        total_warn=$((total_warn + warn))
        total_mem=$((total_mem + mem))
    fi
done < "$TEST_RESULTS_FILE"

echo ""
printf "%-20s-|-%6s-|-%4s-|-%4s-|-%4s-|-%8s-|-%6s\n" "--------------------" "------" "----" "----" "----" "--------" "------"

# Format total memory
if [ "$total_mem" -gt 0 ]; then
    total_mem_str="+${total_mem}KB"
elif [ "$total_mem" -lt 0 ]; then
    total_mem_str="${total_mem}KB"
else
    total_mem_str="0KB"
fi

printf "%-20s | %6s | %4s | %4s | %4s | %8s | %dm %02ds\n" "TOTALS" "" "$total_pass" "$total_fail" "$total_warn" "$total_mem_str" "$SUITE_MINS" "$SUITE_SECS"

echo ""
echo "========================================"

# Count total tests from results file
total_tests=$(wc -l < "$TEST_RESULTS_FILE" 2>/dev/null || echo "0")
total_tests=${total_tests:-0}

if [ "$FAILED_TESTS" -gt 0 ]; then
    echo -e "${RED}  $total_tests tests: $passed_tests passed, $FAILED_TESTS failed, $skipped_tests skipped${NC}"
    echo "========================================"
    exit 1
else
    echo -e "${GREEN}  $total_tests tests: $passed_tests passed, 0 failed, $skipped_tests skipped${NC}"
    echo "========================================"
    exit 0
fi
