#!/bin/bash
#
# test-multi-monitor.sh - Multi-monitor layout switching test
#
# Tests layout switching and zone cycling across multiple monitors.
# Gracefully skips with success if only one monitor is available.
#
# Usage:
#   ./test-multi-monitor.sh [iterations]
#
# Arguments:
#   iterations - Number of test cycles per monitor (default: 25)
#
# Exit codes:
#   0 - Test passed (or skipped due to single monitor)
#   1 - Test failed
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/setup.sh"

# Configuration
ITERATIONS=${1:-25}

echo "========================================"
echo "  Multi-Monitor Test"
echo "========================================"
echo ""

# Initialize test for result tracking
init_test "${TEST_NAME:-Multi-Monitor}"

# Check if D-Bus interface is available
if ! dbus_interface_available; then
    echo -e "${RED}Error: D-Bus debug interface required for multi-monitor test${NC}"
    echo "Enable it with: gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true"
    exit 1
fi

# Detect monitor count
MONITOR_COUNT=$(get_monitor_count)
info "Detected monitors: $MONITOR_COUNT"
echo ""

# Check for multi-monitor setup
if [ "$MONITOR_COUNT" -le 1 ]; then
    echo -e "${GREEN}SKIP${NC}: Multi-monitor test requires 2+ monitors"
    echo "  Only $MONITOR_COUNT monitor(s) detected."
    echo "  This is not a failure - test is not applicable to this configuration."
    echo ""
    echo -e "${GREEN}Test result: SKIP (single monitor)${NC}"
    # Exit with success - skipping is not a failure
    exit 0
fi

echo "Multi-monitor setup detected. Running tests..."
echo "  Iterations per monitor: $ITERATIONS"
echo ""

# Get initial state
initial_state=$(dbus_get_state)
initial_layout=$(extract_variant "layoutId" "$initial_state" 2>/dev/null || echo "unknown")

info "Initial layout: $initial_layout"

# Get available layout IDs
layouts_result=$(dbus_trigger "get-layout-ids" "{}" 2>/dev/null || echo "")
# Parse layouts from result - expect format like: (true, '["layout1","layout2"...]')
layout_ids=$(echo "$layouts_result" | grep -oP '\[.*\]' | tr -d '[]"' | tr ',' ' ')

if [ -z "$layout_ids" ]; then
    warn "Could not fetch layout IDs via D-Bus, using initial layout"
    layout_ids="$initial_layout"
fi

# Convert to array
read -ra LAYOUT_IDS <<< "$layout_ids"

info "Available layouts: ${#LAYOUT_IDS[@]} (${LAYOUT_IDS[*]})"
echo ""

# Test 1: Rapid layout switching across all monitors
echo "Test 1: Rapid layout switching ($ITERATIONS cycles)..."
for i in $(seq 1 $ITERATIONS); do
    # Switch through all layouts
    for layout_id in "${LAYOUT_IDS[@]}"; do
        dbus_trigger "switch-layout" "{\"layoutId\": \"$layout_id\"}" >/dev/null 2>&1
        sleep_ms 30
    done
    
    # Cycle zones - state only, no window movement
    for z in 1 2 3; do
        dbus_trigger "cycle-zone-state" "{\"direction\": 1}" >/dev/null 2>&1
        sleep_ms 20
    done
    
    if [ $((i % 5)) -eq 0 ]; then
        progress $i $ITERATIONS
    fi
done

echo ""

# Test 2: UI components with multi-monitor
echo "Test 2: UI components stress ($ITERATIONS cycles)..."
for i in $(seq 1 $ITERATIONS); do
    # Show layout switcher (should appear on correct monitor)
    dbus_trigger "show-layout-switcher" "{}" >/dev/null 2>&1
    sleep_ms 100
    
    # Switch layout while switcher is shown
    layout_idx=$((RANDOM % ${#LAYOUT_IDS[@]}))
    layout_id="${LAYOUT_IDS[$layout_idx]}"
    dbus_trigger "switch-layout" "{\"layoutId\": \"$layout_id\"}" >/dev/null 2>&1
    sleep_ms 50
    
    dbus_trigger "hide-layout-switcher" "{}" >/dev/null 2>&1
    sleep_ms 30
    
    # Zone overlay
    dbus_trigger "show-zone-overlay" "{}" >/dev/null 2>&1
    sleep_ms 80
    dbus_trigger "hide-zone-overlay" "{}" >/dev/null 2>&1
    sleep_ms 30
    
    if [ $((i % 5)) -eq 0 ]; then
        progress $i $ITERATIONS
    fi
done

echo ""

pass "Multi-monitor: $ITERATIONS iterations on $MONITOR_COUNT monitors"

# Restore to initial layout
dbus_trigger "switch-layout" "{\"layoutId\": \"$initial_layout\"}" >/dev/null 2>&1

print_summary
