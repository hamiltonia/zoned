#!/bin/bash
#
# longhaul-interactive.sh - Interactive long-running test suite
#
# Menu-driven interface for running extended memory leak tests.
# Tests run for a specified duration with live monitoring.
#
# Usage:
#   ./longhaul-interactive.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/setup.sh"

# Global state for cleanup
START_TIME=0
CYCLES=0
BASELINE_MEM=0
INTERRUPTED=false

# Cleanup handler for Ctrl+C
cleanup() {
    INTERRUPTED=true
    echo ""
    echo ""
    info "Test interrupted by user"
    print_final_report
    exit 0
}

trap cleanup SIGINT SIGTERM

# Print final report
print_final_report() {
    local duration=$(($(date +%s) - START_TIME))
    local minutes=$((duration / 60))
    local seconds=$((duration % 60))
    local final_mem=$(get_gnome_shell_memory)
    local mem_diff=$((final_mem - BASELINE_MEM))
    
    echo ""
    echo "========================================"
    echo "  Final Report"
    echo "========================================"
    printf "Duration:      %dm %ds\n" "$minutes" "$seconds"
    printf "Total cycles:  %d\n" "$CYCLES"
    printf "Memory growth: %+d KB (%.1f MB)\n" "$mem_diff" "$(echo "scale=1; $mem_diff/1024" | bc)"
    
    if dbus_interface_available; then
        local report=$(dbus_get_resource_report)
        local leaked_signals=$(extract_variant "leakedSignals" "$report" 2>/dev/null || echo "0")
        local leaked_timers=$(extract_variant "leakedTimers" "$report" 2>/dev/null || echo "0")
        printf "Leaked signals: %d\n" "$leaked_signals"
        printf "Leaked timers:  %d\n" "$leaked_timers"
        
        if [ "$leaked_signals" -gt 0 ] || [ "$leaked_timers" -gt 0 ]; then
            echo ""
            echo -e "${RED}FAIL: Resources leaked${NC}"
        elif [ "$mem_diff" -gt 20000 ]; then
            echo ""
            echo -e "${YELLOW}WARN: Significant memory growth (>20MB)${NC}"
        else
            echo ""
            echo -e "${GREEN}PASS: No leaks detected${NC}"
        fi
    else
        if [ "$mem_diff" -gt 20000 ]; then
            echo ""
            echo -e "${YELLOW}WARN: Significant memory growth (>20MB)${NC}"
        else
            echo ""
            echo -e "${GREEN}PASS: Memory stable${NC}"
        fi
    fi
    echo "========================================"
}

# Run enable/disable test
run_enable_disable() {
    local duration_minutes=$1
    local delay_ms=$2
    local end_time=$(($(date +%s) + duration_minutes * 60))
    local next_report=$(($(date +%s) + 30))
    
    EXTENSION_UUID="zoned@hamiltonia.me"
    
    info "Starting enable/disable test..."
    info "Duration: ${duration_minutes} minutes, Delay: ${delay_ms}ms"
    echo ""
    
    while [ $(date +%s) -lt $end_time ]; do
        # Disable
        gnome-extensions disable "$EXTENSION_UUID" 2>/dev/null || true
        sleep_ms "$delay_ms"
        
        # Enable
        gnome-extensions enable "$EXTENSION_UUID" 2>/dev/null || true
        sleep_ms "$delay_ms"
        
        CYCLES=$((CYCLES + 1))
        
        # Periodic report every 30 seconds
        if [ $(date +%s) -ge $next_report ]; then
            local elapsed=$(($(date +%s) - START_TIME))
            local mem=$(get_gnome_shell_memory)
            local mem_diff=$((mem - BASELINE_MEM))
            printf "[%02d:%02d] Memory: %+6d KB | Cycles: %5d" \
                   $((elapsed / 60)) $((elapsed % 60)) "$mem_diff" "$CYCLES"
            
            if dbus_interface_available; then
                local report=$(dbus_get_resource_report)
                local leaked_signals=$(extract_variant "leakedSignals" "$report" 2>/dev/null || echo "0")
                local leaked_timers=$(extract_variant "leakedTimers" "$report" 2>/dev/null || echo "0")
                printf " | Signals: %d | Timers: %d\n" "$leaked_signals" "$leaked_timers"
            else
                echo ""
            fi
            
            next_report=$(($(date +%s) + 30))
        fi
    done
}

# Run LayoutSwitcher test
run_layoutswitcher() {
    local duration_minutes=$1
    local delay_ms=$2
    local end_time=$(($(date +%s) + duration_minutes * 60))
    local next_report=$(($(date +%s) + 30))
    
    if ! dbus_interface_available; then
        error "LayoutSwitcher test requires D-Bus interface"
        echo "Enable with: gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true"
        exit 1
    fi
    
    info "Starting LayoutSwitcher test..."
    info "Duration: ${duration_minutes} minutes, Delay: ${delay_ms}ms"
    echo ""
    
    while [ $(date +%s) -lt $end_time ]; do
        # Show
        dbus_trigger "show-layout-switcher" "{}" >/dev/null 2>&1
        sleep_ms "$delay_ms"
        
        # Hide
        dbus_trigger "hide-layout-switcher" "{}" >/dev/null 2>&1
        sleep_ms "$((delay_ms / 2))"
        
        CYCLES=$((CYCLES + 1))
        
        # Periodic report every 30 seconds
        if [ $(date +%s) -ge $next_report ]; then
            local elapsed=$(($(date +%s) - START_TIME))
            local mem=$(get_gnome_shell_memory)
            local mem_diff=$((mem - BASELINE_MEM))
            local report=$(dbus_get_resource_report)
            local leaked_signals=$(extract_variant "leakedSignals" "$report" 2>/dev/null || echo "0")
            local leaked_timers=$(extract_variant "leakedTimers" "$report" 2>/dev/null || echo "0")
            
            printf "[%02d:%02d] Memory: %+6d KB | Cycles: %5d | Signals: %d | Timers: %d\n" \
                   $((elapsed / 60)) $((elapsed % 60)) "$mem_diff" "$CYCLES" \
                   "$leaked_signals" "$leaked_timers"
            
            next_report=$(($(date +%s) + 30))
        fi
    done
}

# Run Zone Overlay test
run_zone_overlay() {
    local duration_minutes=$1
    local delay_ms=$2
    local end_time=$(($(date +%s) + duration_minutes * 60))
    local next_report=$(($(date +%s) + 30))
    
    if ! dbus_interface_available; then
        error "Zone Overlay test requires D-Bus interface"
        echo "Enable with: gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true"
        exit 1
    fi
    
    info "Starting Zone Overlay test..."
    info "Duration: ${duration_minutes} minutes, Delay: ${delay_ms}ms"
    echo ""
    
    while [ $(date +%s) -lt $end_time ]; do
        # Show
        dbus_trigger "show-zone-overlay" "{}" >/dev/null 2>&1
        sleep_ms "$delay_ms"
        
        # Hide
        dbus_trigger "hide-zone-overlay" "{}" >/dev/null 2>&1
        sleep_ms "$((delay_ms / 2))"
        
        CYCLES=$((CYCLES + 1))
        
        # Periodic report every 30 seconds
        if [ $(date +%s) -ge $next_report ]; then
            local elapsed=$(($(date +%s) - START_TIME))
            local mem=$(get_gnome_shell_memory)
            local mem_diff=$((mem - BASELINE_MEM))
            local report=$(dbus_get_resource_report)
            local leaked_signals=$(extract_variant "leakedSignals" "$report" 2>/dev/null || echo "0")
            local leaked_timers=$(extract_variant "leakedTimers" "$report" 2>/dev/null || echo "0")
            
            printf "[%02d:%02d] Memory: %+6d KB | Cycles: %5d | Signals: %d | Timers: %d\n" \
                   $((elapsed / 60)) $((elapsed % 60)) "$mem_diff" "$CYCLES" \
                   "$leaked_signals" "$leaked_timers"
            
            next_report=$(($(date +%s) + 30))
        fi
    done
}

# Main script
clear
echo "========================================"
echo "  Zoned Long-Running Test Suite"
echo "========================================"
echo ""
echo "Select test:"
echo "  1) Enable/Disable Cycles"
echo "  2) LayoutSwitcher (Show/Hide)"
echo "  3) Zone Overlay (Show/Hide)"
echo ""
read -p "Choice [1-3]: " choice

case $choice in
    1) TEST_NAME="Enable/Disable" ;;
    2) TEST_NAME="LayoutSwitcher" ;;
    3) TEST_NAME="Zone Overlay" ;;
    *)
        error "Invalid choice"
        exit 1
        ;;
esac

echo ""
read -p "Duration (minutes): " duration_minutes
read -p "Delay between operations (ms) [100]: " delay_ms
delay_ms=${delay_ms:-100}

echo ""
info "Test: $TEST_NAME"
info "Duration: ${duration_minutes} minutes"
info "Delay: ${delay_ms}ms"
echo ""
read -p "Press Enter to start (Ctrl+C to stop early)..."

# Initialize
init_test "$TEST_NAME"
START_TIME=$(date +%s)
BASELINE_MEM=$(get_gnome_shell_memory)

info "Baseline memory: ${BASELINE_MEM} KB"

if dbus_interface_available; then
    dbus_reset_tracking >/dev/null 2>&1
    info "Resource tracking enabled"
fi

echo ""

# Run selected test
case $choice in
    1) run_enable_disable "$duration_minutes" "$delay_ms" ;;
    2) run_layoutswitcher "$duration_minutes" "$delay_ms" ;;
    3) run_zone_overlay "$duration_minutes" "$delay_ms" ;;
esac

# Print final report
print_final_report
