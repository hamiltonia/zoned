#!/bin/bash
#
# test-enable-disable.sh - Extension lifecycle stability test
#
# Tests extension enable/disable cycles for memory leaks and stability.
# This is the most critical stability test as it exercises the full
# lifecycle of the extension.
#
# Usage:
#   ./test-enable-disable.sh [cycles] [delay_ms]
#
# Arguments:
#   cycles   - Number of enable/disable cycles (default: 50)
#   delay_ms - Delay between operations in milliseconds (default: 500)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/setup.sh"

# Configuration
CYCLES=${1:-50}
DELAY_MS=${2:-500}
EXTENSION_UUID="zoned@hamiltonia.me"

echo "========================================"
echo "  Enable/Disable Cycle Test"
echo "========================================"
echo "  Cycles: $CYCLES"
echo "  Delay: ${DELAY_MS}ms"
echo ""

# Initialize test for result tracking
init_test "${TEST_NAME:-Enable/Disable}"

# Record baseline memory
info "Recording baseline memory..."
baseline_memory=$(get_gnome_shell_memory)
info "Baseline memory: ${baseline_memory}KB"
echo ""

# Run cycles
echo "Running enable/disable cycles..."
for i in $(seq 1 $CYCLES); do
    # Disable extension
    gnome-extensions disable "$EXTENSION_UUID" 2>/dev/null || true
    sleep_ms "$DELAY_MS"
    
    # Enable extension
    gnome-extensions enable "$EXTENSION_UUID" 2>/dev/null || true
    sleep_ms "$DELAY_MS"
    
    # Check for D-Bus interface (only if available)
    if dbus_interface_available; then
        report=$(dbus_get_resource_report)
        leaked_signals=$(extract_variant "leakedSignals" "$report" 2>/dev/null || echo "0")
        leaked_timers=$(extract_variant "leakedTimers" "$report" 2>/dev/null || echo "0")
        
        if [ "$leaked_signals" -gt 0 ] || [ "$leaked_timers" -gt 0 ]; then
            fail "Cycle $i: Resources leaked (signals: $leaked_signals, timers: $leaked_timers)"
        fi
    fi
    
    progress $i $CYCLES
done

echo ""

# Compare memory
final_memory=$(get_gnome_shell_memory)
memory_diff=$((final_memory - baseline_memory))

info "Final memory: ${final_memory}KB"
info "Memory difference: ${memory_diff}KB"

# Check for significant memory growth (10MB threshold)
if [ $memory_diff -gt 10000 ]; then
    warn "Memory grew by ${memory_diff}KB after $CYCLES cycles (threshold: 10MB)"
fi

# Final resource check if D-Bus available
if dbus_interface_available; then
    report=$(dbus_get_resource_report)
    assert_no_leaks "$report" "Final resource check"
fi

pass "Completed $CYCLES enable/disable cycles"
print_summary
