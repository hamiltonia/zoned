#!/bin/bash
#
# test-actor-leak-check.sh - Find what's ACTUALLY leaking (not signals)
#
# This script uses Looking Glass inspection to find leaked actors, widgets,
# and other objects that remain in memory after components are destroyed.
#
# Usage: Run inside VM
#   ./scripts/vm-test/test-actor-leak-check.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/setup.sh"

EXTENSION_UUID="zoned@hamiltonia.me"

echo "========================================"
echo "  Actor Leak Detective"
echo "========================================"
echo ""
echo "This diagnostic finds REAL leaks:"
echo "- Actors not removed from scene graph"
echo "- Widgets not destroyed"
echo "- Objects keeping refs alive"
echo ""

# Check prerequisites
check_prerequisites

echo "Recording baseline..."

# Get baseline actor count using our D-Bus debug interface
BASELINE_ACTORS=$(gdbus call --session \
    --dest org.gnome.Shell \
    --object-path /org/gnome/Shell/Extensions/Zoned/Debug \
    --method org.gnome.Shell.Extensions.Zoned.Debug.GetActorCount 2>/dev/null | grep -oE '[0-9]+' || echo "unknown")

if [ "$BASELINE_ACTORS" = "unknown" ]; then
    echo "Error: Could not get actor count from D-Bus"
    echo "Make sure debug-expose-dbus is enabled:"
    echo "  gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true"
    exit 1
fi

echo "Baseline: ${BASELINE_ACTORS} actors in Main.uiGroup"
echo ""

# Test: Enable and disable extension 10 times
echo "Running extension enable/disable cycles (10 cycles)..."
for i in {1..10}; do
    gnome-extensions disable "$EXTENSION_UUID" 2>/dev/null || true
    sleep 0.3
    
    gnome-extensions enable "$EXTENSION_UUID" 2>/dev/null || true
    sleep 0.3
    
    echo "  Cycle $i complete"
done

echo ""
echo "Forcing garbage collection..."
force_gc >/dev/null 2>&1
sleep 2

# Get final actor count (use same D-Bus method as baseline)
FINAL_ACTORS=$(gdbus call --session \
    --dest org.gnome.Shell \
    --object-path /org/gnome/Shell/Extensions/Zoned/Debug \
    --method org.gnome.Shell.Extensions.Zoned.Debug.GetActorCount 2>/dev/null | grep -oE '[0-9]+' || echo "unknown")

echo ""
echo "Results:"
echo "========================================"
echo "Baseline actors: ${BASELINE_ACTORS}"
echo "Final actors:    ${FINAL_ACTORS}"

if [ "$BASELINE_ACTORS" != "unknown" ] && [ "$FINAL_ACTORS" != "unknown" ]; then
    DIFF=$((FINAL_ACTORS - BASELINE_ACTORS))
    echo "Difference:      ${DIFF}"
    echo ""
    
    if [ $DIFF -gt 5 ]; then
        echo "❌ LEAK DETECTED: ${DIFF} actors not cleaned up"
        echo ""
        echo "Next steps:"
        echo "1. Open Looking Glass (Alt+F2, type 'lg', Enter)"
        echo "2. In Evaluator tab, run:"
        echo "   Main.uiGroup.get_children().filter(c => c.toString().includes('Zoned'))"
        echo "3. Check which Zoned actors are still in the scene graph"
    else
        echo "✓ Actors cleaned up properly (±${DIFF})"
    fi
else
    echo "⚠ Could not measure actor count"
fi

echo ""
echo "To investigate further, open Looking Glass and check:"
echo "  Main.uiGroup.get_children().length"
echo "  Main.layoutManager._backgroundGroup.get_children().length"
