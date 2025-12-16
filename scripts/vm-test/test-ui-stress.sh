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

# Reset resource tracking and show baseline
dbus_reset_tracking >/dev/null 2>&1
print_resource_baseline "Initial"

# Test 1: Layout Switcher
echo ""
echo "Testing Layout Switcher (open/close $ITERATIONS times)..."
baseline_mem=$(get_gnome_shell_memory)
baseline_res=$(snapshot_resources)

for i in $(seq 1 $ITERATIONS); do
    dbus_trigger "show-layout-switcher" "{}" >/dev/null 2>&1
    sleep_ms 100
    dbus_trigger "hide-layout-switcher" "{}" >/dev/null 2>&1
    sleep_ms 50
    progress $i $ITERATIONS
done

final_mem=$(get_gnome_shell_memory)
final_res=$(snapshot_resources)
mem_diff=$((final_mem - baseline_mem))
info "Memory change: ${mem_diff}KB"

# Check for resource growth and leaks
res_diff=$(compare_snapshots "$baseline_res" "$final_res")
read signal_diff timer_diff <<< "$res_diff"
if [ "$signal_diff" -ne 0 ] || [ "$timer_diff" -ne 0 ]; then
    info "Resource delta: signals=${signal_diff}, timers=${timer_diff}"
fi

check_leaks_and_report "LayoutSwitcher after $ITERATIONS cycles"

# Reset tracking for next test
dbus_reset_tracking >/dev/null 2>&1

# Test 2: Zone Overlay
echo ""
echo "Testing Zone Overlay (show/hide $ITERATIONS times)..."
baseline_mem=$(get_gnome_shell_memory)
baseline_res=$(snapshot_resources)

for i in $(seq 1 $ITERATIONS); do
    dbus_trigger "show-zone-overlay" "{}" >/dev/null 2>&1
    sleep_ms 100
    dbus_trigger "hide-zone-overlay" "{}" >/dev/null 2>&1
    sleep_ms 50
    progress $i $ITERATIONS
done

final_mem=$(get_gnome_shell_memory)
final_res=$(snapshot_resources)
mem_diff=$((final_mem - baseline_mem))
info "Memory change: ${mem_diff}KB"

# Check for resource growth and leaks
res_diff=$(compare_snapshots "$baseline_res" "$final_res")
read signal_diff timer_diff <<< "$res_diff"
if [ "$signal_diff" -ne 0 ] || [ "$timer_diff" -ne 0 ]; then
    info "Resource delta: signals=${signal_diff}, timers=${timer_diff}"
fi

check_leaks_and_report "ZoneOverlay after $ITERATIONS cycles"

print_summary
