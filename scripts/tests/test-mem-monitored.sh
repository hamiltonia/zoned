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
WARMUP_BASELINE=0
INIT_COST=0
WARMUP_CYCLES=1  # Reduced from 30: single cycle + GC for accurate baseline
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
    local final_mem_mb=$(echo "scale=1; $final_mem/1024" | bc)
    local baseline_mb=$(echo "scale=1; $BASELINE_MEM/1024" | bc)
    local init_cost_mb=$(echo "scale=1; $INIT_COST/1024" | bc)
    
    # Calculate expected final if no leak (baseline + init cost)
    local expected_final=$((BASELINE_MEM + INIT_COST))
    local expected_final_mb=$(echo "scale=1; $expected_final/1024" | bc)
    local deviation=$((final_mem - expected_final))
    local deviation_mb=$(echo "scale=1; $deviation/1024" | bc)
    
    echo ""
    echo "========================================"
    echo "  Final Report"
    echo "========================================"
    printf "Duration:      %dm %ds\n" "$minutes" "$seconds"
    printf "Total cycles:  %d\n" "$CYCLES"
    echo ""
    echo "Memory Results:"
    printf "  Baseline (pre-load):     %6.1f MB\n" "$baseline_mb"
    printf "  Init cost (one-time):    %6.1f MB\n" "$init_cost_mb"
    printf "  Expected final:          %6.1f MB (baseline + init)\n" "$expected_final_mb"
    printf "  Actual final:            %6.1f MB\n" "$final_mem_mb"
    printf "  Deviation:               %+6.1f MB\n" "$deviation_mb"
    echo ""
    
    if dbus_interface_available; then
        local report=$(dbus_get_resource_report)
        local leaked_signals=$(extract_variant "leakedSignals" "$report" 2>/dev/null || echo "0")
        local leaked_timers=$(extract_variant "leakedTimers" "$report" 2>/dev/null || echo "0")
        printf "Resource Tracking:\n"
        printf "  Leaked signals: %d\n" "$leaked_signals"
        printf "  Leaked timers:  %d\n" "$leaked_timers"
        echo ""
    fi
    
    # Determine pass/fail based on deviation
    local abs_deviation_mb=$(echo "$deviation_mb" | sed 's/-//')
    if dbus_interface_available; then
        local report=$(dbus_get_resource_report)
        local leaked_signals=$(extract_variant "leakedSignals" "$report" 2>/dev/null || echo "0")
        local leaked_timers=$(extract_variant "leakedTimers" "$report" 2>/dev/null || echo "0")
        
        if [ "$leaked_signals" -gt 0 ] || [ "$leaked_timers" -gt 0 ]; then
            echo -e "${RED}FAIL: Resources leaked (signals: $leaked_signals, timers: $leaked_timers)${NC}"
        elif (( $(echo "$abs_deviation_mb > 15.0" | bc -l) )); then
            echo -e "${YELLOW}WARN: Memory deviation >15 MB from expected${NC}"
            echo -e "${YELLOW}Note: Some variance is normal due to GC timing and background processes${NC}"
        else
            echo -e "${GREEN}PASS: Memory stable (deviation within normal range)${NC}"
        fi
    else
        if (( $(echo "$abs_deviation_mb > 15.0" | bc -l) )); then
            echo -e "${YELLOW}WARN: Memory deviation >15 MB from expected${NC}"
            echo -e "${YELLOW}Note: Some variance is normal due to GC timing and background processes${NC}"
        else
            echo -e "${GREEN}PASS: Memory stable (deviation within normal range)${NC}"
        fi
    fi
    echo "========================================"
}

# Unified warmup phase for all test types
# Runs a single warmup cycle, forces GC, then takes clean baseline
run_warmup() {
    local test_type=$1  # "enable-disable", "layoutswitcher", or "zone-overlay"
    local delay_ms=$2
    
    info "Running warmup phase (1 cycle to load modules)..."
    
    # Run ONE warmup cycle depending on test type
    case $test_type in
        enable-disable)
            EXTENSION_UUID="zoned@hamiltonia.me"
            gnome-extensions disable "$EXTENSION_UUID" 2>/dev/null || true
            sleep_ms "$delay_ms"
            gnome-extensions enable "$EXTENSION_UUID" 2>/dev/null || true
            sleep_ms "$delay_ms"
            ;;
        layoutswitcher)
            dbus_trigger "show-layout-switcher" "{}" >/dev/null 2>&1
            sleep_ms "$delay_ms"
            dbus_trigger "hide-layout-switcher" "{}" >/dev/null 2>&1
            sleep_ms "$((delay_ms / 2))"
            ;;
        zone-overlay)
            dbus_trigger "show-zone-overlay" "{}" >/dev/null 2>&1
            sleep_ms "$delay_ms"
            dbus_trigger "hide-zone-overlay" "{}" >/dev/null 2>&1
            sleep_ms "$((delay_ms / 2))"
            ;;
        global-toggle)
            dbus_trigger "show-layout-switcher" "{}" >/dev/null 2>&1
            sleep_ms "$delay_ms"
            dbus_trigger "set-global-mode" '{"global": true}' >/dev/null 2>&1
            sleep_ms "$delay_ms"
            dbus_trigger "set-global-mode" '{"global": false}' >/dev/null 2>&1
            sleep_ms "$delay_ms"
            dbus_trigger "hide-layout-switcher" "{}" >/dev/null 2>&1
            sleep_ms "$((delay_ms / 2))"
            ;;
        layout-settings)
            dbus_trigger "show-layout-switcher" "{}" >/dev/null 2>&1
            sleep_ms "$delay_ms"
            dbus_trigger "open-layout-settings" '{}' >/dev/null 2>&1
            sleep_ms "$delay_ms"
            dbus_trigger "close-layout-settings" '{}' >/dev/null 2>&1
            sleep_ms "$delay_ms"
            dbus_trigger "hide-layout-switcher" "{}" >/dev/null 2>&1
            sleep_ms "$((delay_ms / 2))"
            ;;
        diagnostic-dialog)
            dbus_trigger "show-layout-switcher" "{}" >/dev/null 2>&1
            sleep_ms "$delay_ms"
            dbus_trigger "open-diagnostic-dialog" '{}' >/dev/null 2>&1
            sleep_ms "$delay_ms"
            dbus_trigger "close-diagnostic-dialog" '{}' >/dev/null 2>&1
            sleep_ms "$delay_ms"
            dbus_trigger "hide-layout-switcher" "{}" >/dev/null 2>&1
            sleep_ms "$((delay_ms / 2))"
            ;;
    esac
    
    # Force GC to clean up warmup artifacts
    echo ""
    if ! force_gc; then
        echo -e "${YELLOW}Warning: GC failed, continuing without GC${NC}"
    fi
    echo ""
    
    # Take clean baseline after GC
    WARMUP_BASELINE=$(get_gnome_shell_memory)
    INIT_COST=$((WARMUP_BASELINE - BASELINE_MEM))
    
    # Reset resource tracking now that we're post-warmup
    if dbus_interface_available; then
        dbus_reset_tracking >/dev/null 2>&1
        info "Resource tracking reset"
    fi
    
    info "Warmup complete."
    info "Initialization cost: ${INIT_COST} KB ($(echo "scale=1; $INIT_COST/1024" | bc) MB)"
    echo ""
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
            local actual_diff=$((mem - WARMUP_BASELINE))
            printf "[%02d:%02d] Memory: %+6d KB | Cycles: %5d" \
                   $((elapsed / 60)) $((elapsed % 60)) "$actual_diff" "$CYCLES"
            
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
            local actual_diff=$((mem - WARMUP_BASELINE))
            local report=$(dbus_get_resource_report)
            local leaked_signals=$(extract_variant "leakedSignals" "$report" 2>/dev/null || echo "0")
            local leaked_timers=$(extract_variant "leakedTimers" "$report" 2>/dev/null || echo "0")
            
            printf "[%02d:%02d] Memory: %+6d KB | Cycles: %5d | Signals: %d | Timers: %d\n" \
                   $((elapsed / 60)) $((elapsed % 60)) "$actual_diff" "$CYCLES" \
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
            local actual_diff=$((mem - WARMUP_BASELINE))
            local report=$(dbus_get_resource_report)
            local leaked_signals=$(extract_variant "leakedSignals" "$report" 2>/dev/null || echo "0")
            local leaked_timers=$(extract_variant "leakedTimers" "$report" 2>/dev/null || echo "0")
            
            printf "[%02d:%02d] Memory: %+6d KB | Cycles: %5d | Signals: %d | Timers: %d\n" \
                   $((elapsed / 60)) $((elapsed % 60)) "$actual_diff" "$CYCLES" \
                   "$leaked_signals" "$leaked_timers"
            
            next_report=$(($(date +%s) + 30))
        fi
    done
}

# Run Global/Per-Workspace Toggle test
run_global_toggle() {
    local duration_minutes=$1
    local delay_ms=$2
    local end_time=$(($(date +%s) + duration_minutes * 60))
    local next_report=$(($(date +%s) + 30))
    
    if ! dbus_interface_available; then
        error "Global Toggle test requires D-Bus interface"
        echo "Enable with: gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true"
        exit 1
    fi
    
    info "Starting Global/Per-Workspace Toggle test..."
    info "Duration: ${duration_minutes} minutes, Delay: ${delay_ms}ms"
    echo ""
    
    # Show LayoutSwitcher ONCE at start (keep it open for entire test)
    dbus_trigger "show-layout-switcher" "{}" >/dev/null 2>&1
    sleep_ms "$delay_ms"
    
    while [ $(date +%s) -lt $end_time ]; do
        # Toggle to global mode (recreates Cairo thumbnails while LS is open)
        dbus_trigger "set-global-mode" '{"global": true}' >/dev/null 2>&1
        sleep_ms "$delay_ms"
        
        # Toggle to per-workspace mode (recreates Cairo thumbnails again)
        dbus_trigger "set-global-mode" '{"global": false}' >/dev/null 2>&1
        sleep_ms "$delay_ms"
        
        CYCLES=$((CYCLES + 1))
        
        # Periodic report every 30 seconds
        if [ $(date +%s) -ge $next_report ]; then
            local elapsed=$(($(date +%s) - START_TIME))
            local mem=$(get_gnome_shell_memory)
            local actual_diff=$((mem - WARMUP_BASELINE))
            local report=$(dbus_get_resource_report)
            local leaked_signals=$(extract_variant "leakedSignals" "$report" 2>/dev/null || echo "0")
            local leaked_timers=$(extract_variant "leakedTimers" "$report" 2>/dev/null || echo "0")
            
            printf "[%02d:%02d] Memory: %+6d KB | Cycles: %5d | Signals: %d | Timers: %d\n" \
                   $((elapsed / 60)) $((elapsed % 60)) "$actual_diff" "$CYCLES" \
                   "$leaked_signals" "$leaked_timers"
            
            next_report=$(($(date +%s) + 30))
        fi
    done
    
    # Close LayoutSwitcher ONCE at end
    dbus_trigger "hide-layout-switcher" "{}" >/dev/null 2>&1
}

# Run Layout Settings Dialog test
run_layout_settings() {
    local duration_minutes=$1
    local delay_ms=$2
    local end_time=$(($(date +%s) + duration_minutes * 60))
    local next_report=$(($(date +%s) + 30))
    
    if ! dbus_interface_available; then
        error "Layout Settings test requires D-Bus interface"
        echo "Enable with: gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true"
        exit 1
    fi
    
    info "Starting Layout Settings Dialog test..."
    info "Duration: ${duration_minutes} minutes, Delay: ${delay_ms}ms"
    echo ""
    
    # Show LayoutSwitcher ONCE at start (keep it open for entire test)
    dbus_trigger "show-layout-switcher" "{}" >/dev/null 2>&1
    sleep_ms "$delay_ms"
    
    while [ $(date +%s) -lt $end_time ]; do
        # Open layout settings (uses first template by default)
        dbus_trigger "open-layout-settings" '{}' >/dev/null 2>&1
        sleep_ms "$delay_ms"
        
        # Close layout settings
        dbus_trigger "close-layout-settings" '{}' >/dev/null 2>&1
        sleep_ms "$delay_ms"
        
        CYCLES=$((CYCLES + 1))
        
        # Periodic report every 30 seconds
        if [ $(date +%s) -ge $next_report ]; then
            local elapsed=$(($(date +%s) - START_TIME))
            local mem=$(get_gnome_shell_memory)
            local actual_diff=$((mem - WARMUP_BASELINE))
            local report=$(dbus_get_resource_report)
            local leaked_signals=$(extract_variant "leakedSignals" "$report" 2>/dev/null || echo "0")
            local leaked_timers=$(extract_variant "leakedTimers" "$report" 2>/dev/null || echo "0")
            
            printf "[%02d:%02d] Memory: %+6d KB | Cycles: %5d | Signals: %d | Timers: %d\n" \
                   $((elapsed / 60)) $((elapsed % 60)) "$actual_diff" "$CYCLES" \
                   "$leaked_signals" "$leaked_timers"
            
            next_report=$(($(date +%s) + 30))
        fi
    done
    
    # Close LayoutSwitcher ONCE at end
    dbus_trigger "hide-layout-switcher" "{}" >/dev/null 2>&1
}

# Run Diagnostic Dialog test
run_diagnostic_dialog() {
    local duration_minutes=$1
    local delay_ms=$2
    local end_time=$(($(date +%s) + duration_minutes * 60))
    local next_report=$(($(date +%s) + 30))
    
    if ! dbus_interface_available; then
        error "Diagnostic Dialog test requires D-Bus interface"
        echo "Enable with: gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true"
        exit 1
    fi
    
    info "Starting Diagnostic Dialog test..."
    info "Duration: ${duration_minutes} minutes, Delay: ${delay_ms}ms"
    echo ""
    
    # Show LayoutSwitcher ONCE at start (keep it open for entire test)
    dbus_trigger "show-layout-switcher" "{}" >/dev/null 2>&1
    sleep_ms "$delay_ms"
    
    while [ $(date +%s) -lt $end_time ]; do
        # Open diagnostic dialog
        dbus_trigger "open-diagnostic-dialog" '{}' >/dev/null 2>&1
        sleep_ms "$delay_ms"
        
        # Close diagnostic dialog
        dbus_trigger "close-diagnostic-dialog" '{}' >/dev/null 2>&1
        sleep_ms "$delay_ms"
        
        CYCLES=$((CYCLES + 1))
        
        # Periodic report every 30 seconds
        if [ $(date +%s) -ge $next_report ]; then
            local elapsed=$(($(date +%s) - START_TIME))
            local mem=$(get_gnome_shell_memory)
            local actual_diff=$((mem - WARMUP_BASELINE))
            local report=$(dbus_get_resource_report)
            local leaked_signals=$(extract_variant "leakedSignals" "$report" 2>/dev/null || echo "0")
            local leaked_timers=$(extract_variant "leakedTimers" "$report" 2>/dev/null || echo "0")
            
            printf "[%02d:%02d] Memory: %+6d KB | Cycles: %5d | Signals: %d | Timers: %d\n" \
                   $((elapsed / 60)) $((elapsed % 60)) "$actual_diff" "$CYCLES" \
                   "$leaked_signals" "$leaked_timers"
            
            next_report=$(($(date +%s) + 30))
        fi
    done
    
    # Close LayoutSwitcher ONCE at end
    dbus_trigger "hide-layout-switcher" "{}" >/dev/null 2>&1
}

# Main script
# Only clear if running interactively (not piped/automated)
if [ -t 0 ]; then
    clear
fi

echo "========================================"
echo "  Zoned Long-Running Test Suite"
echo "========================================"
echo ""
echo "Select test:"
echo "  1) Enable/Disable Cycles"
echo "  2) LayoutSwitcher (Show/Hide)"
echo "  3) Zone Overlay (Show/Hide)"
echo "  4) Global/Per-Workspace Toggle"
echo "  5) Layout Settings Dialog (Open/Close)"
echo "  6) Diagnostic Dialog (Open/Close)"
echo ""
read -p "Choice [1-6]: " choice

case $choice in
    1) TEST_NAME="Enable/Disable" ;;
    2) TEST_NAME="LayoutSwitcher" ;;
    3) TEST_NAME="Zone Overlay" ;;
    4) TEST_NAME="Global Toggle" ;;
    5) TEST_NAME="Layout Settings" ;;
    6) TEST_NAME="Diagnostic Dialog" ;;
    *)
        error "Invalid choice"
        exit 1
        ;;
esac

echo ""
read -p "Duration (minutes): " duration_minutes
read -p "Delay between operations (ms) [200]: " delay_ms
delay_ms=${delay_ms:-200}

echo ""
info "Test: $TEST_NAME"
info "Duration: ${duration_minutes} minutes"
info "Delay: ${delay_ms}ms"
echo ""
read -p "Press Enter to start (Ctrl+C to stop early)..."

# Initialize
init_memory_test "$TEST_NAME"
START_TIME=$(date +%s)
BASELINE_MEM=$(get_gnome_shell_memory)

info "Baseline memory: ${BASELINE_MEM} KB"

if dbus_interface_available; then
    dbus_reset_tracking >/dev/null 2>&1
    info "Resource tracking enabled"
fi

echo ""

# Run warmup phase for selected test (unified warmup)
case $choice in
    1) run_warmup "enable-disable" "$delay_ms" ;;
    2) run_warmup "layoutswitcher" "$delay_ms" ;;
    3) run_warmup "zone-overlay" "$delay_ms" ;;
    4) run_warmup "global-toggle" "$delay_ms" ;;
    5) run_warmup "layout-settings" "$delay_ms" ;;
    6) run_warmup "diagnostic-dialog" "$delay_ms" ;;
esac

# Run selected test
case $choice in
    1) run_enable_disable "$duration_minutes" "$delay_ms" ;;
    2) run_layoutswitcher "$duration_minutes" "$delay_ms" ;;
    3) run_zone_overlay "$duration_minutes" "$delay_ms" ;;
    4) run_global_toggle "$duration_minutes" "$delay_ms" ;;
    5) run_layout_settings "$duration_minutes" "$delay_ms" ;;
    6) run_diagnostic_dialog "$duration_minutes" "$delay_ms" ;;
esac

# Force GC before final measurement
echo ""
if ! force_gc; then
    echo -e "${YELLOW}Warning: GC failed before final measurement${NC}"
fi

# Print final report
print_final_report
