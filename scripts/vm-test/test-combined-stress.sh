#!/bin/bash
#
# test-combined-stress.sh - Combined operations stress test
#
# Interleaves multiple operations (layout switching, zone cycling,
# UI components) to simulate realistic usage patterns and test
# for race conditions and state inconsistencies.
#
# Usage:
#   ./test-combined-stress.sh [iterations]
#
# Arguments:
#   iterations - Number of combined operation cycles (default: 100)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/setup.sh"

# Configuration
ITERATIONS=${1:-100}

echo "========================================"
echo "  Combined Operations Stress Test"
echo "========================================"
echo "  Iterations: $ITERATIONS"
echo ""

# Check if D-Bus interface is available
if ! dbus_interface_available; then
    echo -e "${RED}Error: D-Bus debug interface required for combined stress test${NC}"
    echo "Enable it with: gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true"
    exit 1
fi

# Get initial state and available layouts
initial_state=$(dbus_get_state)
initial_layout=$(extract_variant "layoutId" "$initial_state" 2>/dev/null || echo "unknown")

# Get available layout IDs
layouts_result=$(dbus_trigger "get-layout-ids" "{}" 2>/dev/null || echo "")
# Parse layouts from result - expect format like: (true, '["layout1","layout2"...]')
layout_ids=$(echo "$layouts_result" | grep -oP '\[.*\]' | tr -d '[]"' | tr ',' ' ')

if [ -z "$layout_ids" ]; then
    # Fallback to using initial layout if we can't get them via D-Bus
    warn "Could not fetch layout IDs via D-Bus, using initial layout"
    layout_ids="$initial_layout"
fi

# Convert to array
read -ra LAYOUT_IDS <<< "$layout_ids"

info "Initial layout: $initial_layout"
info "Available layouts: ${#LAYOUT_IDS[@]} (${LAYOUT_IDS[*]})"
echo ""

# Reset resource tracking and show baseline
dbus_reset_tracking >/dev/null 2>&1
print_resource_baseline "Initial"

# Record baseline
baseline_mem=$(get_gnome_shell_memory)
baseline_res=$(snapshot_resources)

echo "Running combined stress test ($ITERATIONS iterations)..."
echo ""

for i in $(seq 1 $ITERATIONS); do
    # Each iteration performs a mix of operations
    
    # 1. Switch layout (randomly select from available)
    layout_idx=$((RANDOM % ${#LAYOUT_IDS[@]}))
    layout_id="${LAYOUT_IDS[$layout_idx]}"
    dbus_trigger "switch-layout" "{\"layoutId\": \"$layout_id\"}" >/dev/null 2>&1
    sleep_ms 50
    
    # 2. Cycle through zones (3 times)
    for z in 1 2 3; do
        dbus_trigger "cycle-zone" "{\"direction\": 1}" >/dev/null 2>&1
        sleep_ms 20
    done
    
    # 3. Show and hide layout switcher
    dbus_trigger "show-layout-switcher" "{}" >/dev/null 2>&1
    sleep_ms 100
    dbus_trigger "hide-layout-switcher" "{}" >/dev/null 2>&1
    sleep_ms 50
    
    # 4. Show and hide zone overlay
    dbus_trigger "show-zone-overlay" "{}" >/dev/null 2>&1
    sleep_ms 80
    dbus_trigger "hide-zone-overlay" "{}" >/dev/null 2>&1
    sleep_ms 30
    
    # 5. More zone cycling
    dbus_trigger "cycle-zone" "{\"direction\": -1}" >/dev/null 2>&1
    sleep_ms 20
    
    # Every 10 iterations, verify state consistency
    if [ $((i % 10)) -eq 0 ]; then
        state=$(dbus_get_state)
        current_zone=$(extract_variant "zoneIndex" "$state" 2>/dev/null || echo "0")
        current_layout=$(extract_variant "layoutId" "$state" 2>/dev/null || echo "unknown")
        zone_count=$(extract_variant "zoneCount" "$state" 2>/dev/null || echo "4")
        
        # Zone index should be valid
        if [ "$current_zone" -lt 0 ] || [ "$current_zone" -ge "$zone_count" ]; then
            fail "Zone index out of range: $current_zone (valid: 0-$((zone_count-1)))"
        fi
        
        progress $i $ITERATIONS
    fi
done

echo ""

# Final state check
final_mem=$(get_gnome_shell_memory)
final_res=$(snapshot_resources)
mem_diff=$((final_mem - baseline_mem))
info "Memory change: ${mem_diff}KB"

# Check for excessive memory growth (10MB threshold for this test)
if [ $mem_diff -gt 10000 ]; then
    warn "Memory grew by ${mem_diff}KB after $ITERATIONS combined iterations"
fi

# Check for resource growth
res_diff=$(compare_snapshots "$baseline_res" "$final_res")
read signal_diff timer_diff <<< "$res_diff"
if [ "$signal_diff" -ne 0 ] || [ "$timer_diff" -ne 0 ]; then
    info "Resource delta: signals=${signal_diff}, timers=${timer_diff}"
fi

check_leaks_and_report "Combined stress: $ITERATIONS iterations completed"

# Restore to initial layout
dbus_trigger "switch-layout" "{\"layoutId\": \"$initial_layout\"}" >/dev/null 2>&1

print_summary
