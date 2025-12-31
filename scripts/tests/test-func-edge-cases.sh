#!/bin/bash
#
# test-edge-cases.sh - Edge case and boundary condition tests
#
# Tests handling of invalid inputs, boundary conditions, and error scenarios.
# Ensures the extension handles edge cases gracefully without crashes.
#
# Usage:
#   ./test-edge-cases.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/setup.sh"

echo "========================================"
echo "  Edge Case Tests"
echo "========================================"
echo ""

# Initialize test for result tracking
init_test "${TEST_NAME:-Edge Cases}"

# Check if D-Bus interface is available
if ! dbus_interface_available; then
    echo -e "${RED}Error: D-Bus debug interface required for edge case tests${NC}"
    echo "Enable it with: gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true"
    exit 1
fi

# Get initial state
initial_state=$(dbus_get_state)
initial_layout=$(extract_variant "layoutId" "$initial_state" 2>/dev/null || echo "unknown")

info "Initial layout: $initial_layout"
echo ""

# ==========================================
# Test 1: Invalid layout ID handling
# ==========================================
echo ""
echo "Test 1: Invalid layout ID handling..."

# Try to switch to non-existent layouts
invalid_layouts=(
    "nonexistent-layout"
    ""
    "123"
    "null"
    "../../../etc/passwd"
    "halves'; DROP TABLE layouts;--"
)

for invalid_id in "${invalid_layouts[@]}"; do
    result=$(dbus_trigger "switch-layout" "{\"layoutId\": \"$invalid_id\"}" 2>&1) || true
    
    # Should return false or handle gracefully
    if [[ "$result" == *"true"* ]]; then
        warn "Unexpectedly accepted invalid layout: '$invalid_id'"
    fi
    sleep_ms 50
done

# Verify layout didn't change
state=$(dbus_get_state)
current_layout=$(extract_variant "layoutId" "$state" 2>/dev/null || echo "unknown")
if [ "$current_layout" == "$initial_layout" ]; then
    pass "Invalid layout IDs rejected correctly"
else
    fail "Layout changed unexpectedly after invalid IDs: $current_layout"
fi

# ==========================================
# Test 2: Zone cycling at boundaries
# ==========================================
echo ""
echo "Test 2: Zone cycling at boundaries..."

state=$(dbus_get_state)
zone_count=$(extract_variant "zoneCount" "$state" 2>/dev/null || echo "4")

# Reset to zone 0
for i in $(seq 1 $zone_count); do
    dbus_trigger "cycle-zone-state" '{"direction": -1}' >/dev/null 2>&1 || true
done
sleep_ms 50

state=$(dbus_get_state)
zone_idx=$(extract_variant "zoneIndex" "$state" 2>/dev/null || echo "0")

# Verify at zone 0 (or wrapped)
if [ "$zone_idx" -lt 0 ] || [ "$zone_idx" -ge "$zone_count" ]; then
    fail "Zone index out of bounds after backward cycling: $zone_idx"
fi

# Cycle forward past the end (should wrap)
for i in $(seq 1 $((zone_count + 5))); do
    dbus_trigger "cycle-zone-state" '{"direction": 1}' >/dev/null 2>&1 || true
done
sleep_ms 50

state=$(dbus_get_state)
zone_idx=$(extract_variant "zoneIndex" "$state" 2>/dev/null || echo "0")

if [ "$zone_idx" -ge 0 ] && [ "$zone_idx" -lt "$zone_count" ]; then
    pass "Zone cycling wraps correctly at boundaries"
else
    fail "Zone index out of bounds: $zone_idx (zone_count: $zone_count)"
fi

# ==========================================
# Test 3: Rapid toggle operations
# ==========================================
echo ""
echo "Test 3: Rapid toggle operations..."

# Rapidly show/hide UI components
for i in $(seq 1 20); do
    dbus_trigger "show-layout-switcher" "{}" >/dev/null 2>&1 || true
    sleep_ms 10
    dbus_trigger "hide-layout-switcher" "{}" >/dev/null 2>&1 || true
    sleep_ms 10
    dbus_trigger "show-zone-overlay" "{}" >/dev/null 2>&1 || true
    sleep_ms 10
    dbus_trigger "hide-zone-overlay" "{}" >/dev/null 2>&1 || true
    sleep_ms 10
done

# Verify extension is still responsive
state=$(dbus_get_state 2>&1) || state=""
if [ -n "$state" ]; then
    pass "Extension responsive after rapid toggle operations"
else
    fail "Extension unresponsive after rapid toggles"
fi

# ==========================================
# Test 4: Window-related actions graceful handling
# ==========================================
echo ""
echo "Test 4: Window-related actions graceful handling..."

# NOTE: We cannot reliably test "no focused window" scenario because
# some window is almost always focused (terminal, system monitor, etc.)
# Calling move-focused-to-zone would move that window unexpectedly.
#
# Instead, we test that the D-Bus interface responds correctly to
# get-focused-window-geometry (which is read-only and safe).

# Get focused window geometry - should return data or graceful error
result=$(dbus_trigger "get-focused-window-geometry" "{}" 2>&1) || true
sleep_ms 50

# The result should be either a successful JSON response or a graceful "No focused window" error
if [[ "$result" == *'"x"'* ]] || [[ "$result" == *"No focused window"* ]] || [[ "$result" == *"false"* ]]; then
    pass "get-focused-window-geometry returned expected response"
else
    warn "Unexpected response format: $result"
fi

if dbus_interface_available; then
    pass "D-Bus interface stable after window geometry query"
else
    fail "Extension crashed after get-focused-window-geometry"
fi

# Test get-current-zone-geometry (also safe, read-only)
result=$(dbus_trigger "get-current-zone-geometry" "{}" 2>&1) || true
sleep_ms 50

if dbus_interface_available; then
    pass "get-current-zone-geometry handled gracefully"
else
    fail "Extension crashed after get-current-zone-geometry"
fi

# ==========================================
# Test 5: Double show/hide operations
# ==========================================
echo ""
echo "Test 5: Double show/hide operations..."

# Show twice (should not break)
dbus_trigger "show-layout-switcher" "{}" >/dev/null 2>&1 || true
sleep_ms 50
dbus_trigger "show-layout-switcher" "{}" >/dev/null 2>&1 || true
sleep_ms 50

# Hide twice
dbus_trigger "hide-layout-switcher" "{}" >/dev/null 2>&1 || true
sleep_ms 50
dbus_trigger "hide-layout-switcher" "{}" >/dev/null 2>&1 || true
sleep_ms 50

# Same for overlay
dbus_trigger "show-zone-overlay" "{}" >/dev/null 2>&1 || true
sleep_ms 50
dbus_trigger "show-zone-overlay" "{}" >/dev/null 2>&1 || true
sleep_ms 50
dbus_trigger "hide-zone-overlay" "{}" >/dev/null 2>&1 || true
sleep_ms 50
dbus_trigger "hide-zone-overlay" "{}" >/dev/null 2>&1 || true
sleep_ms 50

if dbus_interface_available; then
    pass "Double show/hide operations handled correctly"
else
    fail "Extension crashed on double show/hide"
fi

# ==========================================
# Test 6: Invalid D-Bus action parameters
# ==========================================
echo ""
echo "Test 6: Invalid D-Bus action parameters..."

# Invalid JSON
result=$(dbus_trigger "switch-layout" "not-json" 2>&1) || true
sleep_ms 50

# Missing required parameter
result=$(dbus_trigger "switch-layout" "{}" 2>&1) || true
sleep_ms 50

# Wrong type for parameter
result=$(dbus_trigger "cycle-zone-state" '{"direction": "forward"}' 2>&1) || true
sleep_ms 50

# Extra unknown parameters (should be ignored)
result=$(dbus_trigger "switch-layout" '{"layoutId": "'"$initial_layout"'", "unknownParam": true}' 2>&1) || true
sleep_ms 50

if dbus_interface_available; then
    pass "Invalid parameters handled gracefully"
else
    fail "Extension crashed on invalid parameters"
fi

# ==========================================
# Test 7: Extreme direction values
# ==========================================
echo ""
echo "Test 7: Extreme direction values..."

# Very large positive direction
dbus_trigger "cycle-zone-state" '{"direction": 999999}' >/dev/null 2>&1 || true
sleep_ms 50

# Very large negative direction
dbus_trigger "cycle-zone-state" '{"direction": -999999}' >/dev/null 2>&1 || true
sleep_ms 50

# Zero direction (should be a no-op)
dbus_trigger "cycle-zone-state" '{"direction": 0}' >/dev/null 2>&1 || true
sleep_ms 50

state=$(dbus_get_state)
zone_idx=$(extract_variant "zoneIndex" "$state" 2>/dev/null || echo "0")
zone_count=$(extract_variant "zoneCount" "$state" 2>/dev/null || echo "4")

if [ "$zone_idx" -ge 0 ] && [ "$zone_idx" -lt "$zone_count" ]; then
    pass "Extreme direction values handled correctly"
else
    fail "Zone index corrupt after extreme directions: $zone_idx"
fi

# ==========================================
# Test 8: Concurrent operations
# ==========================================
echo ""
echo "Test 8: Concurrent-like rapid operations..."

# Fire multiple operations without waiting (simulates race conditions)
{
    dbus_trigger "show-layout-switcher" "{}" >/dev/null 2>&1 || true
    dbus_trigger "cycle-zone-state" '{"direction": 1}' >/dev/null 2>&1 || true
    dbus_trigger "switch-layout" "{\"layoutId\": \"$initial_layout\"}" >/dev/null 2>&1 || true
    dbus_trigger "hide-layout-switcher" "{}" >/dev/null 2>&1 || true
} &

{
    dbus_trigger "show-zone-overlay" "{}" >/dev/null 2>&1 || true
    dbus_trigger "cycle-zone-state" '{"direction": -1}' >/dev/null 2>&1 || true
    dbus_trigger "hide-zone-overlay" "{}" >/dev/null 2>&1 || true
} &

# Wait for background jobs
wait

sleep_ms 200

if dbus_interface_available; then
    pass "Concurrent operations handled without crash"
else
    fail "Extension may have crashed during concurrent operations"
fi

# ==========================================
# Final state validation
# ==========================================
echo ""
echo "Final state validation..."

# Restore initial layout
dbus_trigger "switch-layout" "{\"layoutId\": \"$initial_layout\"}" >/dev/null 2>&1

state=$(dbus_get_state)
if [ -z "$state" ]; then
    fail "Could not get state after edge case tests"
fi

final_layout=$(extract_variant "layoutId" "$state" 2>/dev/null || echo "unknown")
if [ "$final_layout" != "$initial_layout" ]; then
    warn "Could not restore initial layout: $final_layout vs $initial_layout"
fi

pass "Edge cases: All boundary conditions handled gracefully"

# Note: Edge case tests intentionally perform intensive operations that may
# temporarily increase memory usage. Memory leak detection is handled by the
# dedicated memory test suite (test-mem-*) which has proper GC control and
# baseline measurement. Disable memory threshold checking for this test.
TEST_START_MEM=0

print_summary
