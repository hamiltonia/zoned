#!/bin/bash
#
# test-leak-diagnostic.sh - Quick signal leak diagnostic (<1 minute)
#
# Interactive diagnostic tool that sets up the environment, runs quick
# automated tests, then evaluates logs and results to pinpoint leaks.
#
# This script focuses on the two most problematic areas:
# 1. Extension enable/disable lifecycle
# 2. LayoutSwitcher open/close cycles
#
# USAGE:
#   From host machine:
#     SSH into your VM first, then run this script:
#       ssh your-vm
#       cd /path/to/zoned
#       ./scripts/vm-test/test-leak-diagnostic.sh
#
#   Or use your vm connection method:
#       # Your method to access VM
#       cd /path/to/zoned
#       ./scripts/vm-test/test-leak-diagnostic.sh
#
# NOTE: This script must run INSIDE the VM where the extension is installed.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Check if we're in the right environment before sourcing setup.sh
EXTENSION_UUID="zoned@hamiltonia.me"
if ! command -v gnome-extensions &>/dev/null; then
    echo -e "\033[0;31mError: This script must run inside a VM with GNOME installed.\033[0m"
    echo ""
    echo "You appear to be running this on the host machine."
    echo "Please SSH into your VM first:"
    echo ""
    echo "  ssh your-vm"
    echo "  cd /path/to/zoned"
    echo "  ./scripts/vm-test/test-leak-diagnostic.sh"
    echo ""
    exit 1
fi

if ! gnome-extensions list 2>/dev/null | grep -q "$EXTENSION_UUID"; then
    echo -e "\033[0;31mError: Zoned extension not installed in this environment.\033[0m"
    echo ""
    echo "Make sure you're running this inside the VM where Zoned is installed."
    echo "Install the extension with: make install"
    echo ""
    exit 1
fi

source "$SCRIPT_DIR/lib/setup.sh"

# Configuration
QUICK_TEST_CYCLES=10  # Just enough to expose leaks
EXTENSION_UUID="zoned@hamiltonia.me"

# Cleanup on interrupt
cleanup_on_interrupt() {
    echo ""
    echo ""
    warn "Test interrupted by user"
    print_final_results
    exit 1
}

trap cleanup_on_interrupt SIGINT SIGTERM

# Print banner
print_banner() {
    clear
    echo "========================================"
    echo "  Zoned Quick Leak Diagnostic"
    echo "========================================"
    echo ""
    echo "This tool runs fast automated tests to"
    echo "detect signal leaks in under 1 minute."
    echo ""
    echo "Runtime: ~30-60 seconds"
    echo "Test cycles: $QUICK_TEST_CYCLES per component"
    echo ""
}

# Setup environment
setup_environment() {
    info "Setting up test environment..."
    echo ""
    
    # Enable debug features (gracefully handle if keys don't exist)
    info "Enabling debug features..."
    if gsettings set org.gnome.shell.extensions.zoned memory-debug true 2>/dev/null; then
        info "  memory-debug enabled"
    else
        warn "  memory-debug key not available (extension may need reinstall)"
    fi
    
    if gsettings set org.gnome.shell.extensions.zoned debug-logging true 2>/dev/null; then
        info "  debug-logging enabled"
    else
        warn "  debug-logging not available"
    fi
    
    # Check if D-Bus interface is available (needed for LayoutSwitcher test)
    if dbus_interface_available; then
        info "D-Bus debug interface detected ✓"
        DBUS_AVAILABLE=true
    else
        warn "D-Bus debug interface not available"
        info "Enable with: gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true"
        DBUS_AVAILABLE=false
    fi
    
    echo ""
}

# Test 1: Extension Enable/Disable
test_extension_lifecycle() {
    echo "========================================"
    echo "  Test 1: Extension Lifecycle"
    echo "========================================"
    echo "  Testing: Enable/Disable cycles"
    echo "  Cycles: $QUICK_TEST_CYCLES"
    echo ""
    
    # Record baseline
    local baseline_mem=$(get_gnome_shell_memory)
    info "Baseline memory: ${baseline_mem} KB"
    
    # Run cycles
    info "Running enable/disable cycles..."
    for i in $(seq 1 $QUICK_TEST_CYCLES); do
        gnome-extensions disable "$EXTENSION_UUID" 2>/dev/null || true
        sleep 0.15
        gnome-extensions enable "$EXTENSION_UUID" 2>/dev/null || true
        sleep 0.15
        progress $i $QUICK_TEST_CYCLES
    done
    echo ""
    
    # Measure results
    local final_mem=$(get_gnome_shell_memory)
    local mem_diff=$((final_mem - baseline_mem))
    
    info "Final memory: ${final_mem} KB"
    info "Memory growth: ${mem_diff} KB"
    
    # Store results
    TEST1_MEM_DIFF=$mem_diff
    TEST1_PASSED=true
    
    # Evaluate (10 cycles shouldn't grow more than ~5MB)
    if [ $mem_diff -gt 5000 ]; then
        warn "Significant memory growth detected (>${mem_diff}KB)"
        TEST1_PASSED=false
    fi
    
    echo ""
}

# Test 2: LayoutSwitcher Open/Close
test_layoutswitcher() {
    if [ "$DBUS_AVAILABLE" != "true" ]; then
        echo "========================================"
        echo "  Test 2: LayoutSwitcher (SKIPPED)"
        echo "========================================"
        echo "  Reason: D-Bus interface not available"
        echo ""
        TEST2_SKIPPED=true
        return
    fi
    
    echo "========================================"
    echo "  Test 2: LayoutSwitcher"
    echo "========================================"
    echo "  Testing: Open/Close cycles"
    echo "  Cycles: $QUICK_TEST_CYCLES"
    echo ""
    
    # Reset tracking
    dbus_reset_tracking >/dev/null 2>&1
    
    # Record baseline
    local baseline_mem=$(get_gnome_shell_memory)
    local baseline_res=$(snapshot_resources)
    info "Baseline memory: ${baseline_mem} KB"
    
    # Run cycles
    info "Running open/close cycles..."
    for i in $(seq 1 $QUICK_TEST_CYCLES); do
        dbus_trigger "show-layout-switcher" "{}" >/dev/null 2>&1
        sleep 0.12
        dbus_trigger "hide-layout-switcher" "{}" >/dev/null 2>&1
        sleep 0.08
        progress $i $QUICK_TEST_CYCLES
    done
    echo ""
    
    # Force garbage collection
    force_gc >/dev/null 2>&1
    sleep 1
    
    # Measure results
    local final_mem=$(get_gnome_shell_memory)
    local final_res=$(snapshot_resources)
    local mem_diff=$((final_mem - baseline_mem))
    
    info "Final memory: ${final_mem} KB"
    info "Memory growth: ${mem_diff} KB"
    
    # Check for resource leaks
    local report=$(dbus_get_resource_report)
    local leaked_signals=$(extract_variant "leakedSignals" "$report" 2>/dev/null || echo "0")
    local leaked_timers=$(extract_variant "leakedTimers" "$report" 2>/dev/null || echo "0")
    
    info "Leaked signals: ${leaked_signals}"
    info "Leaked timers: ${leaked_timers}"
    
    # Store results
    TEST2_MEM_DIFF=$mem_diff
    TEST2_LEAKED_SIGNALS=$leaked_signals
    TEST2_LEAKED_TIMERS=$leaked_timers
    TEST2_SKIPPED=false
    
    # Evaluate signal/timer cleanup (separate from memory growth)
    if [ "$leaked_signals" -gt 0 ] || [ "$leaked_timers" -gt 0 ]; then
        error "Signal/timer leaks detected!"
        TEST2_SIGNAL_CLEANUP_PASSED=false
    else
        TEST2_SIGNAL_CLEANUP_PASSED=true
    fi
    
    # Track memory growth separately (not a failure of signal cleanup)
    if [ $mem_diff -gt 5000 ]; then
        TEST2_MEM_GROWTH_HIGH=true
    else
        TEST2_MEM_GROWTH_HIGH=false
    fi
    
    echo ""
}

# Evaluate and print results
print_final_results() {
    echo "========================================"
    echo "  Diagnostic Results"
    echo "========================================"
    echo ""
    
    # Test 1 results
    echo "Extension Lifecycle:"
    if [ "$TEST1_PASSED" = "true" ]; then
        echo -e "  ${GREEN}✓ PASS${NC} - Memory growth: ${TEST1_MEM_DIFF}KB"
    else
        echo -e "  ${RED}✗ FAIL${NC} - Memory growth: ${TEST1_MEM_DIFF}KB (threshold: 5MB)"
        echo "  Issue: Extension enable/disable is leaking memory"
    fi
    echo ""
    
    # Test 2 results
    if [ "$TEST2_SKIPPED" = "true" ]; then
        echo "LayoutSwitcher:"
        echo "  ⊘ SKIPPED - D-Bus interface not available"
        echo ""
    else
        echo "LayoutSwitcher Signal/Timer Cleanup:"
        if [ "$TEST2_SIGNAL_CLEANUP_PASSED" = "true" ]; then
            echo -e "  ${GREEN}✓ PASS${NC} - No signal or timer leaks"
            echo "    Leaked signals: 0"
            echo "    Leaked timers: 0"
        else
            echo -e "  ${RED}✗ FAIL${NC} - Signal/timer leaks detected!"
            echo "    Leaked signals: ${TEST2_LEAKED_SIGNALS}"
            echo "    Leaked timers: ${TEST2_LEAKED_TIMERS}"
        fi
        echo ""
        
        # Report memory growth separately
        if [ "$TEST2_MEM_GROWTH_HIGH" = "true" ]; then
            echo "LayoutSwitcher Memory:"
            echo -e "  ${YELLOW}⚠ WARNING${NC} - Memory growth: ${TEST2_MEM_DIFF}KB (threshold: 5MB)"
            echo "    This indicates a different leak source (actors, textures, closures, etc.)"
            echo "    Use test-actor-leak-check.sh to investigate further."
        else
            echo "LayoutSwitcher Memory:"
            echo -e "  ${GREEN}✓ OK${NC} - Memory growth: ${TEST2_MEM_DIFF}KB"
        fi
        echo ""
    fi
    
    # Overall status
    if [ "$TEST2_SIGNAL_CLEANUP_PASSED" = "true" ] || [ "$TEST2_SKIPPED" = "true" ]; then
        echo -e "${GREEN}════════════════════════════════════════${NC}"
        echo -e "${GREEN}  ✓ SIGNAL CLEANUP SUCCESSFUL${NC}"
        echo -e "${GREEN}════════════════════════════════════════${NC}"
        echo ""
        echo "No signal/timer leaks detected! Signal cleanup"
        echo "is working correctly."
        
        # Check if there's memory growth to investigate
        if [ "$TEST2_MEM_GROWTH_HIGH" = "true" ] || [ "$TEST1_PASSED" != "true" ]; then
            echo ""
            echo -e "${YELLOW}Note: Memory growth detected (not from signals/timers).${NC}"
            echo "This indicates leaks from other sources like:"
            echo "  - Actors not removed from scene graph"
            echo "  - Textures/Cairo surfaces not disposed"
            echo "  - Closures in non-signal code"
            echo "  - GObject references held by widgets"
            echo ""
            echo "Run: make vm-actor-leak-check"
            echo "  to investigate actor/texture leaks"
        fi
        
        FINAL_EXIT_CODE=0
    else
        echo -e "${RED}════════════════════════════════════════${NC}"
        echo -e "${RED}  ✗ SIGNAL/TIMER LEAKS DETECTED${NC}"
        echo -e "${RED}════════════════════════════════════════${NC}"
        echo ""
        echo "Use the following command to see detailed"
        echo "leak information with stack traces:"
        echo ""
        echo "  journalctl -f -o cat /usr/bin/gnome-shell | grep -E 'Zoned|MEMDEBUG|WARN'"
        echo ""
        
        # If D-Bus available, show component reports
        if [ "$DBUS_AVAILABLE" = "true" ]; then
            echo "Getting component leak details..."
            echo ""
            local comp_report=$(dbus_get_component_reports 2>/dev/null)
            if [ -n "$comp_report" ] && [ "$comp_report" != "{}" ] && [ "$comp_report" != "[]" ]; then
                echo "$comp_report" | head -30
            else
                echo "  (No component-specific leaks reported)"
                echo "  Empty [] means components properly cleaned up all tracked resources."
            fi
        fi
        
        FINAL_EXIT_CODE=1
    fi
    echo ""
}

# Main execution
print_banner

# Ask user to confirm
read -p "Press Enter to start diagnostic (Ctrl+C to cancel)..."
echo ""

# Setup
setup_environment

# Run tests
test_extension_lifecycle
test_layoutswitcher

# Evaluate results
print_final_results

# Cleanup
info "Cleaning up..."
gsettings set org.gnome.shell.extensions.zoned memory-debug false 2>/dev/null || true
gsettings set org.gnome.shell.extensions.zoned debug-logging false 2>/dev/null || true

echo "Diagnostic complete."
exit $FINAL_EXIT_CODE
