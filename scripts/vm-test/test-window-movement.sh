#!/bin/bash
#
# test-window-movement.sh - Window movement to zones test
#
# Tests actual window movement to zones using a test window.
# Verifies windows are positioned correctly within zone bounds.
#
# Usage:
#   ./test-window-movement.sh [cycles]
#
# Arguments:
#   cycles - Number of zone cycle + move operations (default: 50)
#
# Requirements:
#   - D-Bus debug interface enabled
#   - python3 with GTK4 (for test window)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/setup.sh"

# Configuration
CYCLES=${1:-50}
TEST_WINDOW_PID=""
TEST_WINDOW_DBUS="org.zoned.TestWindow"
TEST_WINDOW_PATH="/org/zoned/TestWindow"

# Tolerance for position matching (pixels)
# Windows may not be exactly at zone position due to window decorations
POSITION_TOLERANCE=50

echo "========================================"
echo "  Window Movement Test"
echo "========================================"
echo "  Cycles: $CYCLES"
echo ""

cleanup_test_window() {
    if [ -n "$TEST_WINDOW_PID" ] && kill -0 "$TEST_WINDOW_PID" 2>/dev/null; then
        # Try D-Bus close first
        gdbus call -e -d "$TEST_WINDOW_DBUS" \
            -o "$TEST_WINDOW_PATH" \
            -m "${TEST_WINDOW_DBUS}.Close" >/dev/null 2>&1 || true
        sleep 0.2
        # Force kill if still running
        kill "$TEST_WINDOW_PID" 2>/dev/null || true
    fi
}

trap cleanup_test_window EXIT

# Check if D-Bus interface is available
if ! dbus_interface_available; then
    echo -e "${RED}Error: D-Bus debug interface required for window movement test${NC}"
    echo "Enable it with: gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true"
    exit 1
fi

# Check for python3 and GTK4
if ! command -v python3 &>/dev/null; then
    echo -e "${RED}Error: python3 required for test window${NC}"
    exit 1
fi

# Start the test window
info "Starting test window..."
nohup python3 "$SCRIPT_DIR/lib/test-window.py" >/dev/null 2>&1 &
TEST_WINDOW_PID=$!
sleep 2

# Verify test window D-Bus is available
test_window_available() {
    gdbus call -e -d "$TEST_WINDOW_DBUS" \
        -o "$TEST_WINDOW_PATH" \
        -m "${TEST_WINDOW_DBUS}.Ping" 2>/dev/null | grep -q "pong"
}

if ! test_window_available; then
    echo -e "${RED}Error: Test window D-Bus interface not available${NC}"
    exit 1
fi

info "Test window started (PID: $TEST_WINDOW_PID)"

# Focus the test window
focus_test_window() {
    gdbus call -e -d "$TEST_WINDOW_DBUS" \
        -o "$TEST_WINDOW_PATH" \
        -m "${TEST_WINDOW_DBUS}.Focus" >/dev/null 2>&1 || true
    sleep 0.1
}

# Get test window geometry via its D-Bus interface
get_test_window_geometry() {
    local result
    result=$(gdbus call -e -d "$TEST_WINDOW_DBUS" \
        -o "$TEST_WINDOW_PATH" \
        -m "${TEST_WINDOW_DBUS}.GetGeometry" 2>/dev/null)
    # Extract JSON from result like "('{"x": 0, "y": 0, "width": 400, "height": 300}',)"
    echo "$result" | sed "s/^('//; s/',)$//"
}

# Get focused window geometry via extension D-Bus
get_focused_window_geometry() {
    local result
    result=$(dbus_trigger "get-focused-window-geometry" "{}" 2>/dev/null) || result=""
    # Result is like "(true, '{"x": 100, "y": 100, "width": 400, "height": 300}')"
    if [[ "$result" =~ '"x"' ]]; then
        # Extract JSON from success response
        echo "$result" | sed "s/^(true, '//; s/')$//"
    else
        echo "{}"
    fi
}

# Get current zone geometry
get_zone_geometry() {
    local result
    result=$(dbus_trigger "get-current-zone-geometry" "{}" 2>/dev/null) || result=""
    if [[ "$result" =~ '"x"' ]]; then
        echo "$result" | sed "s/^(true, '//; s/')$//"
    else
        echo "{}"
    fi
}

# Move focused window to current zone
move_to_zone() {
    dbus_trigger "move-focused-to-zone" "{}" >/dev/null 2>&1 || true
}

# Extract numeric value from JSON
json_value() {
    local json="$1"
    local key="$2"
    echo "$json" | grep -o "\"$key\": *[0-9]*" 2>/dev/null | grep -o "[0-9]*" 2>/dev/null || echo ""
}

# Check if window is within zone bounds (with tolerance)
check_window_in_zone() {
    local win_x="$1"
    local win_y="$2"
    local zone_x="$3"
    local zone_y="$4"
    local zone_w="$5"
    local zone_h="$6"
    
    # Window should be near the zone's top-left corner
    # (Zoned positions windows at zone coordinates)
    local x_diff=$((win_x - zone_x))
    local y_diff=$((win_y - zone_y))
    
    # Use absolute value
    [ $x_diff -lt 0 ] && x_diff=$((-x_diff))
    [ $y_diff -lt 0 ] && y_diff=$((-y_diff))
    
    if [ $x_diff -le $POSITION_TOLERANCE ] && [ $y_diff -le $POSITION_TOLERANCE ]; then
        return 0
    else
        return 1
    fi
}

# Get initial state
initial_state=$(dbus_get_state)
initial_layout=$(extract_variant "layoutId" "$initial_state" 2>/dev/null || echo "unknown")
zone_count=$(extract_variant "zoneCount" "$initial_state" 2>/dev/null || echo "4")

info "Initial layout: $initial_layout"
info "Zone count: $zone_count"
echo ""

# Reset resource tracking
dbus_reset_tracking >/dev/null 2>&1
print_resource_baseline "Initial"

# Record baseline
baseline_mem=$(get_gnome_shell_memory)
baseline_res=$(snapshot_resources)

# Focus the test window initially
info "Focusing test window..."
focus_test_window
sleep 0.3

echo "Running window movement test ($CYCLES operations)..."
move_failures=0
move_successes=0

for i in $(seq 1 $CYCLES); do
    # Cycle to next zone
    dbus_trigger "cycle-zone" '{"direction": 1}' >/dev/null 2>&1 || true
    sleep_ms 50
    
    # Re-focus our test window (cycling may have changed focus)
    focus_test_window
    sleep_ms 100
    
    # Get zone geometry before move
    zone_geom=$(get_zone_geometry)
    zone_x=$(json_value "$zone_geom" "x")
    zone_y=$(json_value "$zone_geom" "y")
    zone_w=$(json_value "$zone_geom" "width")
    zone_h=$(json_value "$zone_geom" "height")
    
    if [ -z "$zone_x" ] || [ -z "$zone_y" ]; then
        warn "Could not get zone geometry at cycle $i"
        continue
    fi
    
    # Move window to zone
    move_to_zone
    sleep_ms 200
    
    # Get window geometry after move (via extension's view)
    win_geom=$(get_focused_window_geometry)
    win_x=$(json_value "$win_geom" "x")
    win_y=$(json_value "$win_geom" "y")
    
    if [ -z "$win_x" ] || [ -z "$win_y" ]; then
        warn "Could not get window geometry at cycle $i"
        continue
    fi
    
    # Verify window is in zone
    if check_window_in_zone "$win_x" "$win_y" "$zone_x" "$zone_y" "$zone_w" "$zone_h"; then
        ((++move_successes))
    else
        ((++move_failures))
        if [ $move_failures -le 3 ]; then
            warn "Window not in zone at cycle $i: win=($win_x,$win_y) zone=($zone_x,$zone_y)"
        fi
    fi
    
    # Progress indicator
    if [ $((i % 10)) -eq 0 ]; then
        progress $i $CYCLES
    fi
done

echo ""

# Report movement accuracy
total_moves=$((move_successes + move_failures))
if [ $total_moves -gt 0 ]; then
    accuracy=$((move_successes * 100 / total_moves))
    info "Movement accuracy: $move_successes/$total_moves ($accuracy%)"
    
    if [ $move_failures -gt $((total_moves / 10)) ]; then
        warn "High movement failure rate: $move_failures failures"
    fi
fi

# Compare memory and resources
final_mem=$(get_gnome_shell_memory)
final_res=$(snapshot_resources)
mem_diff=$((final_mem - baseline_mem))
info "Memory change: ${mem_diff}KB"

if [ $mem_diff -gt 5000 ]; then
    warn "Memory grew by ${mem_diff}KB after $CYCLES window movements"
fi

res_diff=$(compare_snapshots "$baseline_res" "$final_res")
read signal_diff timer_diff <<< "$res_diff"
if [ "$signal_diff" -ne 0 ] || [ "$timer_diff" -ne 0 ]; then
    info "Resource delta: signals=${signal_diff}, timers=${timer_diff}"
fi

# Clean up test window
info "Cleaning up test window..."
cleanup_test_window
TEST_WINDOW_PID=""  # Prevent double cleanup

# Final leak check
check_leaks_and_report "Window movement: $CYCLES operations, $move_successes successful moves"

print_summary
