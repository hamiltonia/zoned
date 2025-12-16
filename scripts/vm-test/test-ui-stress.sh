#!/bin/bash
#
# test-ui-stress.sh - UI component stress test
#
# Rapidly opens and closes UI components to test for memory leaks
# and stability under repeated UI operations.
#
# Usage:
#   ./test-ui-stress.sh [iterations]
#
# Arguments:
#   iterations - Number of open/close cycles per component (default: 50)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/setup.sh"

# Configuration
ITERATIONS=${1:-50}

echo "========================================"
echo "  UI Stress Test"
echo "========================================"
echo "  Iterations per component: $ITERATIONS"
echo ""

# Check if D-Bus interface is available
if ! dbus_interface_available; then
    echo -e "${RED}Error: D-Bus debug interface required for UI stress test${NC}"
    echo "Enable it with: gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true"
    exit 1
fi

# Reset resource tracking
dbus_reset_tracking >/dev/null 2>&1

# Test 1: Layout Switcher
echo ""
echo "Testing Layout Switcher (open/close $ITERATIONS times)..."
baseline=$(get_gnome_shell_memory)

for i in $(seq 1 $ITERATIONS); do
    dbus_trigger "show-layout-switcher" "{}" >/dev/null 2>&1
    sleep_ms 100
    dbus_trigger "hide-layout-switcher" "{}" >/dev/null 2>&1
    sleep_ms 50
    progress $i $ITERATIONS
done

final=$(get_gnome_shell_memory)
diff=$((final - baseline))
info "Memory change: ${diff}KB"

# Check for resource leaks
report=$(dbus_get_resource_report)
leaked_signals=$(extract_variant "leakedSignals" "$report" 2>/dev/null || echo "0")
leaked_timers=$(extract_variant "leakedTimers" "$report" 2>/dev/null || echo "0")

if [ "${leaked_signals:-0}" -gt 0 ] || [ "${leaked_timers:-0}" -gt 0 ]; then
    fail "LayoutSwitcher: Resources leaked (signals: ${leaked_signals:-0}, timers: ${leaked_timers:-0})"
else
    pass "LayoutSwitcher: No resource leaks after $ITERATIONS cycles"
fi

# Reset tracking for next test
dbus_reset_tracking >/dev/null 2>&1

# Test 2: Zone Overlay
echo ""
echo "Testing Zone Overlay (show/hide $ITERATIONS times)..."
baseline=$(get_gnome_shell_memory)

for i in $(seq 1 $ITERATIONS); do
    dbus_trigger "show-zone-overlay" "{}" >/dev/null 2>&1
    sleep_ms 100
    dbus_trigger "hide-zone-overlay" "{}" >/dev/null 2>&1
    sleep_ms 50
    progress $i $ITERATIONS
done

final=$(get_gnome_shell_memory)
diff=$((final - baseline))
info "Memory change: ${diff}KB"

# Check for resource leaks
report=$(dbus_get_resource_report)
leaked_signals=$(extract_variant "leakedSignals" "$report" 2>/dev/null || echo "0")
leaked_timers=$(extract_variant "leakedTimers" "$report" 2>/dev/null || echo "0")

if [ "${leaked_signals:-0}" -gt 0 ] || [ "${leaked_timers:-0}" -gt 0 ]; then
    fail "ZoneOverlay: Resources leaked (signals: ${leaked_signals:-0}, timers: ${leaked_timers:-0})"
else
    pass "ZoneOverlay: No resource leaks after $ITERATIONS cycles"
fi

print_summary
