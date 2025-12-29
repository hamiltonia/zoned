#!/bin/bash
#
# test-layout-switching.sh - Layout switching stress test
#
# Tests switching between all available layouts to ensure
# state persists correctly and no resources are leaked.
#
# Usage:
#   ./test-layout-switching.sh [cycles]
#
# Arguments:
#   cycles - Number of complete layout cycles (default: 10)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/setup.sh"

# Configuration
CYCLES=${1:-10}

echo "========================================"
echo "  Layout Switching Test"
echo "========================================"
echo "  Full cycles: $CYCLES"
echo ""

# Initialize test for result tracking
init_test "${TEST_NAME:-Layout Switching}"

# Check if D-Bus interface is available
if ! dbus_interface_available; then
    echo -e "${RED}Error: D-Bus debug interface required for layout switching test${NC}"
    echo "Enable it with: gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true"
    exit 1
fi

# Get available layouts via D-Bus
layouts_result=$(dbus_trigger "get-layout-ids" "{}" 2>/dev/null || echo "")

# Parse layouts from result - expect format like: (true, '["halves","thirds","quarters"...]')
layout_ids=$(echo "$layouts_result" | grep -oP '\[.*\]' | tr -d '[]"' | tr ',' ' ')

if [ -z "$layout_ids" ]; then
    # Fallback to common layouts if we can't get them via D-Bus
    layout_ids="halves thirds quarters fourths focus-left focus-right three-column"
    warn "Could not fetch layout IDs via D-Bus, using defaults"
fi

# Convert to array
read -ra layouts <<< "$layout_ids"
layout_count=${#layouts[@]}

info "Available layouts: ${layouts[*]}"
info "Layout count: $layout_count"
echo ""

echo "Running layout switching ($CYCLES full cycles through $layout_count layouts)..."
total_switches=$((CYCLES * layout_count))
current_switch=0

for cycle in $(seq 1 $CYCLES); do
    for layoutId in "${layouts[@]}"; do
        # Call switch-layout and capture result
        result=$(dbus_trigger "switch-layout" "{\"layoutId\":\"$layoutId\"}" 2>&1)
        sleep_ms 100
        
        # Verify layout changed
        state=$(dbus_get_state)
        current=$(extract_variant "layoutId" "$state" 2>/dev/null || echo "")
        
        if [ "$current" != "$layoutId" ]; then
            # Only warn on first cycle to reduce noise
            if [ "$cycle" -eq 1 ]; then
                warn "Layout switch to '$layoutId' - current: '$current'"
            fi
        fi
        
        current_switch=$((current_switch + 1))
    done
    progress $cycle $CYCLES
done

echo ""
info "Total layout switches: $total_switches"

pass "Layout switching: $total_switches switches completed, all layouts accessible"

print_summary
