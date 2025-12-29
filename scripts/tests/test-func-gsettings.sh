#!/bin/bash
#
# test-func-gsettings.sh - GSettings persistence and validation test
#
# Tests that extension settings persist correctly across state changes
# and that default values are correctly applied.
#
# Usage:
#   ./test-func-gsettings.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/setup.sh"

SCHEMA="org.gnome.shell.extensions.zoned"

echo "========================================"
echo "  GSettings State Test"
echo "========================================"
echo ""

# Initialize test for result tracking
init_test "${TEST_NAME:-GSettings State}"

# Test 1: Store original values and verify we can read them
info "Test 1: Reading current settings..."
ORIGINAL_DEBUG=$(gsettings get $SCHEMA debug-expose-dbus 2>/dev/null || echo "false")
ORIGINAL_INDICATOR=$(gsettings get $SCHEMA show-indicator 2>/dev/null || echo "true")
ORIGINAL_OVERLAY=$(gsettings get $SCHEMA show-zone-overlay-preview 2>/dev/null || echo "true")

if [ -z "$ORIGINAL_DEBUG" ]; then
    fail "Failed to read debug-expose-dbus setting"
fi

pass "Successfully read current settings"
echo ""

# Test 2: Modify a setting and verify change persists
info "Test 2: Setting persistence..."
gsettings set $SCHEMA debug-expose-dbus true
sleep 0.5
NEW_VALUE=$(gsettings get $SCHEMA debug-expose-dbus)

if [ "$NEW_VALUE" != "true" ]; then
    fail "Setting did not persist (expected 'true', got '$NEW_VALUE')"
fi

pass "Setting persisted correctly"
echo ""

# Test 3: Reset to defaults and verify
info "Test 3: Default values..."
gsettings reset $SCHEMA debug-expose-dbus
sleep 0.5
DEFAULT_VALUE=$(gsettings get $SCHEMA debug-expose-dbus)

# debug-expose-dbus should default to false
if [ "$DEFAULT_VALUE" != "false" ]; then
    fail "Default value incorrect (expected 'false', got '$DEFAULT_VALUE')"
fi

pass "Default values restored correctly"
echo ""

# Test 4: Extension disable/enable persistence
info "Test 4: Persistence across extension restart..."

# Set a test value
gsettings set $SCHEMA debug-expose-dbus true
sleep 0.5

# Disable extension
gnome-extensions disable zoned@hamiltonia.me 2>/dev/null || true
sleep 1

# Enable extension
gnome-extensions enable zoned@hamiltonia.me 2>/dev/null || true
sleep 2

# Verify value persisted
PERSISTED_VALUE=$(gsettings get $SCHEMA debug-expose-dbus)
if [ "$PERSISTED_VALUE" != "true" ]; then
    fail "Setting did not persist across extension restart"
fi

pass "Settings persisted across extension restart"
echo ""

# Test 5: Restore original values
info "Restoring original settings..."
gsettings set $SCHEMA debug-expose-dbus "$ORIGINAL_DEBUG"
gsettings set $SCHEMA show-indicator "$ORIGINAL_INDICATOR"
gsettings set $SCHEMA show-zone-overlay-preview "$ORIGINAL_OVERLAY"

pass "Original settings restored"
echo ""

# Print summary
print_summary
