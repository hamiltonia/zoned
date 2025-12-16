#!/bin/bash
#
# test-zone-cycling.sh - Zone cycling stress test
#
# Tests zone cycling operations for state consistency and stability.
# Cycles through zones rapidly to ensure state remains correct.
#
# Usage:
#   ./test-zone-cycling.sh [cycles]
#
# Arguments:
#   cycles - Number of zone cycle operations (default: 500)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/setup.sh"

# Configuration
CYCLES=${1:-500}

echo "========================================"
echo "  Zone Cycling Test"
echo "========================================"
echo "  Cycles: $CYCLES"
echo ""

# Check if D-Bus interface is available
if ! dbus_interface_available; then
    echo -e "${RED}Error: D-Bus debug interface required for zone cycling test${NC}"
    echo "Enable it with: gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true"
    exit 1
fi

# Get initial state
initial_state=$(dbus_get_state)
initial_layout=$(extract_variant "layoutId" "$initial_state" 2>/dev/null || echo "unknown")
zone_count=$(extract_variant "zoneCount" "$initial_state" 2>/dev/null || echo "4")

info "Initial layout: $initial_layout"
info "Zone count: $zone_count"
echo ""

# Reset resource tracking and show baseline
dbus_reset_tracking >/dev/null 2>&1
print_resource_baseline "Initial"

# Record baseline memory and resources
baseline_mem=$(get_gnome_shell_memory)
baseline_res=$(snapshot_resources)

echo "Running zone cycling ($CYCLES operations)..."
for i in $(seq 1 $CYCLES); do
    # Alternate between forward and backward cycling
    if [ $((i % 2)) -eq 0 ]; then
        direction=1
    else
        direction=-1
    fi
    
    dbus_trigger "cycle-zone" "{\"direction\": $direction}" >/dev/null 2>&1
    sleep_ms 10
    
    # Every 100 cycles, verify state consistency
    if [ $((i % 100)) -eq 0 ]; then
        state=$(dbus_get_state)
        current_layout=$(extract_variant "layoutId" "$state" 2>/dev/null || echo "unknown")
        current_zone=$(extract_variant "zoneIndex" "$state" 2>/dev/null || echo "0")
        
        # Layout should not change during zone cycling
        if [ "$current_layout" != "$initial_layout" ]; then
            fail "Layout changed unexpectedly: $current_layout (expected: $initial_layout)"
        fi
        
        # Zone index should be valid
        if [ "$current_zone" -lt 0 ] || [ "$current_zone" -ge "$zone_count" ]; then
            fail "Zone index out of range: $current_zone (valid: 0-$((zone_count-1)))"
        fi
        
        progress $i $CYCLES
    fi
done

echo ""

# Compare memory and resources
final_mem=$(get_gnome_shell_memory)
final_res=$(snapshot_resources)
mem_diff=$((final_mem - baseline_mem))
info "Memory change: ${mem_diff}KB"

# Check for excessive memory growth
if [ $mem_diff -gt 5000 ]; then
    warn "Memory grew by ${mem_diff}KB after $CYCLES zone cycles"
fi

# Check for resource growth
res_diff=$(compare_snapshots "$baseline_res" "$final_res")
read signal_diff timer_diff <<< "$res_diff"
if [ "$signal_diff" -ne 0 ] || [ "$timer_diff" -ne 0 ]; then
    info "Resource delta: signals=${signal_diff}, timers=${timer_diff}"
fi

check_leaks_and_report "Zone cycling: $CYCLES operations completed, state consistent"

print_summary
