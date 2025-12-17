#!/bin/bash
#
# test-window-movement.sh - Window movement to zones test
#
# Tests actual window movement to zones using a test window.
# Verifies windows are positioned and sized correctly against
# the zone definitions in each layout template.
#
# Usage:
#   ./test-window-movement.sh [passes] [max_layouts]
#
# Arguments:
#   passes      - Number of complete passes through layouts (default: 2)
#   max_layouts - Maximum number of layouts to test (default: all)
#
# Requirements:
#   - D-Bus debug interface enabled
#   - python3 with GTK4 (for test window)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/setup.sh"

# Configuration
PASSES=${1:-2}
MAX_LAYOUTS=${2:-0}  # 0 means all layouts
TEST_WINDOW_PID=""
TEST_WINDOW_DBUS="org.zoned.TestWindow"
TEST_WINDOW_PATH="/org/zoned/TestWindow"

# Tolerance for position matching (pixels)
# Windows may not be exactly at zone position due to window decorations
POSITION_TOLERANCE=50

# Tolerance for size matching (pixels)
# Windows may have decorations or constraints that affect exact sizing
SIZE_TOLERANCE=50

echo "========================================"
echo "  Window Movement Test (Multi-Layout)"
echo "========================================"
echo "  Passes: $PASSES"
echo ""

# Initialize test for result tracking
init_test "${TEST_NAME:-Window Movement}"

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
    
    # Window should be near the zone's top-left corner
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

# Check if window size matches zone size (with tolerance)
check_window_size() {
    local win_w="$1"
    local win_h="$2"
    local zone_w="$3"
    local zone_h="$4"
    
    # Window should be approximately the same size as the zone
    local w_diff=$((win_w - zone_w))
    local h_diff=$((win_h - zone_h))
    
    # Use absolute value
    [ $w_diff -lt 0 ] && w_diff=$((-w_diff))
    [ $h_diff -lt 0 ] && h_diff=$((-h_diff))
    
    if [ $w_diff -le $SIZE_TOLERANCE ] && [ $h_diff -le $SIZE_TOLERANCE ]; then
        return 0
    else
        return 1
    fi
}

# Get initial state
initial_state=$(dbus_get_state)
initial_layout=$(extract_variant "layoutId" "$initial_state" 2>/dev/null || echo "unknown")

info "Initial layout: $initial_layout"

# Get available layout IDs
layouts_result=$(dbus_trigger "get-layout-ids" "{}" 2>/dev/null || echo "")
# Parse layouts from result - expect format like: (true, '["layout1","layout2"...]')
layout_ids=$(echo "$layouts_result" | grep -oP '\[.*\]' | tr -d '[]"' | tr ',' ' ')

if [ -z "$layout_ids" ]; then
    warn "Could not fetch layout IDs via D-Bus, using initial layout only"
    layout_ids="$initial_layout"
fi

# Convert to array
read -ra LAYOUT_IDS <<< "$layout_ids"

# Apply layout limit if specified
if [ "$MAX_LAYOUTS" -gt 0 ] && [ "${#LAYOUT_IDS[@]}" -gt "$MAX_LAYOUTS" ]; then
    LAYOUT_IDS=("${LAYOUT_IDS[@]:0:$MAX_LAYOUTS}")
    info "Limited to $MAX_LAYOUTS layouts for quick test"
fi

layout_count=${#LAYOUT_IDS[@]}

info "Testing layouts: $layout_count (${LAYOUT_IDS[*]})"
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

# Tracking variables
total_position_successes=0
total_position_failures=0
total_size_successes=0
total_size_failures=0
total_zones_tested=0

# Per-layout results (stored as "layoutId:success:total")
declare -a layout_results

echo "Testing window movement across all layouts ($PASSES passes)..."
echo ""

for pass in $(seq 1 $PASSES); do
    echo "Pass $pass/$PASSES:"
    
    for layout_id in "${LAYOUT_IDS[@]}"; do
        # Switch to this layout
        dbus_trigger "switch-layout" "{\"layoutId\": \"$layout_id\"}" >/dev/null 2>&1
        sleep_ms 100
        
        # Get zone count for this layout
        state=$(dbus_get_state)
        zone_count=$(extract_variant "zoneCount" "$state" 2>/dev/null || echo "0")
        
        if [ "$zone_count" -eq 0 ]; then
            warn "  $layout_id: Could not get zone count, skipping"
            continue
        fi
        
        layout_pos_success=0
        layout_size_success=0
        layout_tested=0
        
        # Test each zone in this layout
        for zone_idx in $(seq 0 $((zone_count - 1))); do
            # Cycle to this specific zone (reset to zone 0 first, then cycle forward)
            # First, set to zone 0 by cycling backward enough times
            for reset in $(seq 1 $zone_count); do
                dbus_trigger "cycle-zone-state" '{"direction": -1}' >/dev/null 2>&1 || true
            done
            
            # Now cycle forward to the target zone
            for forward in $(seq 0 $zone_idx); do
                if [ "$forward" -gt 0 ]; then
                    dbus_trigger "cycle-zone-state" '{"direction": 1}' >/dev/null 2>&1 || true
                fi
            done
            sleep_ms 50
            
            # Focus test window
            focus_test_window
            sleep_ms 100
            
            # Get zone geometry (expected from layout definition)
            zone_geom=$(get_zone_geometry)
            zone_x=$(json_value "$zone_geom" "x")
            zone_y=$(json_value "$zone_geom" "y")
            zone_w=$(json_value "$zone_geom" "width")
            zone_h=$(json_value "$zone_geom" "height")
            
            if [ -z "$zone_x" ] || [ -z "$zone_y" ]; then
                warn "  $layout_id zone $zone_idx: Could not get zone geometry"
                continue
            fi
            
            # Move window to zone
            move_to_zone
            sleep_ms 200
            
            # Get window geometry (actual)
            win_geom=$(get_focused_window_geometry)
            win_x=$(json_value "$win_geom" "x")
            win_y=$(json_value "$win_geom" "y")
            win_w=$(json_value "$win_geom" "width")
            win_h=$(json_value "$win_geom" "height")
            
            if [ -z "$win_x" ] || [ -z "$win_y" ]; then
                warn "  $layout_id zone $zone_idx: Could not get window geometry"
                continue
            fi
            
            ((++layout_tested))
            ((++total_zones_tested))
            
            # Check position accuracy
            if check_window_in_zone "$win_x" "$win_y" "$zone_x" "$zone_y"; then
                ((++layout_pos_success))
                ((++total_position_successes))
            else
                ((++total_position_failures))
                if [ $total_position_failures -le 5 ]; then
                    warn "  $layout_id zone $zone_idx: Position mismatch - win=($win_x,$win_y) expected=($zone_x,$zone_y)"
                fi
            fi
            
            # Check size accuracy
            if [ -n "$win_w" ] && [ -n "$win_h" ] && [ -n "$zone_w" ] && [ -n "$zone_h" ]; then
                if check_window_size "$win_w" "$win_h" "$zone_w" "$zone_h"; then
                    ((++layout_size_success))
                    ((++total_size_successes))
                else
                    ((++total_size_failures))
                    if [ $total_size_failures -le 5 ]; then
                        warn "  $layout_id zone $zone_idx: Size mismatch - win=(${win_w}x${win_h}) expected=(${zone_w}x${zone_h})"
                    fi
                fi
            fi
        done
        
        # Report per-layout results
        if [ $layout_tested -gt 0 ]; then
            echo "  $layout_id: $layout_pos_success/$layout_tested positions, $layout_size_success/$layout_tested sizes"
        fi
    done
    echo ""
done

echo "========================================"
echo "  Results Summary"
echo "========================================"
echo ""

# Report position accuracy
total_pos_tests=$((total_position_successes + total_position_failures))
if [ $total_pos_tests -gt 0 ]; then
    pos_accuracy=$((total_position_successes * 100 / total_pos_tests))
    info "Position accuracy: $total_position_successes/$total_pos_tests ($pos_accuracy%)"
    
    if [ $total_position_failures -gt $((total_pos_tests / 10)) ]; then
        warn "High position failure rate: $total_position_failures failures"
    fi
fi

# Report size accuracy
total_size_tests=$((total_size_successes + total_size_failures))
if [ $total_size_tests -gt 0 ]; then
    size_accuracy=$((total_size_successes * 100 / total_size_tests))
    info "Size accuracy: $total_size_successes/$total_size_tests ($size_accuracy%)"
    
    if [ $total_size_failures -gt $((total_size_tests / 10)) ]; then
        warn "High size failure rate: $total_size_failures failures"
    fi
fi

info "Total zones tested: $total_zones_tested across $layout_count layouts ($PASSES passes)"
echo ""

# Compare memory and resources
final_mem=$(get_gnome_shell_memory)
final_res=$(snapshot_resources)
mem_diff=$((final_mem - baseline_mem))
info "Memory change: ${mem_diff}KB"

if [ $mem_diff -gt 5000 ]; then
    warn "Memory grew by ${mem_diff}KB during window movement tests"
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

# Restore initial layout
dbus_trigger "switch-layout" "{\"layoutId\": \"$initial_layout\"}" >/dev/null 2>&1

# Final leak check
check_leaks_and_report "Window movement: $total_zones_tested zones tested across $layout_count layouts"

print_summary
