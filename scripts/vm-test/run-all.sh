#!/bin/bash
#
# run-all.sh - Run all stability tests
#
# This script runs the complete stability test suite for the Zoned extension.
# Should be run inside the VM with a desktop session.
#
# Usage:
#   ./run-all.sh [--quick]
#   ./run-all.sh [--long-haul DURATION]
#
# Options:
#   --quick              Run reduced iterations for quick verification
#   --long-haul DURATION Run extended soak test for specified duration
#                        DURATION format: 8h, 30m, etc (default: 8h)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/setup.sh"

# Results file for aggregation
export TEST_RESULTS_FILE="/tmp/zoned-test-results.txt"
SUITE_START_TIME=$(date +%s)

# Suite-level memory thresholds (in KB)
SUITE_MEM_WARN_THRESHOLD_KB=${SUITE_MEM_WARN_THRESHOLD_KB:-30720}   # 30 MB
SUITE_MEM_FAIL_THRESHOLD_KB=${SUITE_MEM_FAIL_THRESHOLD_KB:-51200}   # 50 MB

# Long haul safety thresholds
LONG_HAUL_MAX_MEMORY_KB=${LONG_HAUL_MAX_MEMORY_KB:-2097152}        # 2 GB - absolute memory ceiling
LONG_HAUL_MAX_GROWTH_KB=${LONG_HAUL_MAX_GROWTH_KB:-524288}         # 500 MB - max cumulative growth
LONG_HAUL_CHECKPOINT_CYCLES=${LONG_HAUL_CHECKPOINT_CYCLES:-10}     # Print checkpoint every N cycles

# Long haul state variables (for signal handler)
LONG_HAUL_CYCLE=0
LONG_HAUL_FAILURES=0
LONG_HAUL_CUMULATIVE_GROWTH=0
LONG_HAUL_BASELINE_MEM=0
LONG_HAUL_ABORTED=false

# Parse arguments
QUICK_MODE=false
LONG_HAUL_MODE=false
LONG_HAUL_DURATION_SECS=28800  # Default 8 hours

# Parse duration string (e.g., "8h", "30m", "1h30m") to seconds
parse_duration() {
    local duration="$1"
    local total_secs=0
    
    # Extract hours
    if [[ "$duration" =~ ([0-9]+)h ]]; then
        total_secs=$((total_secs + ${BASH_REMATCH[1]} * 3600))
    fi
    
    # Extract minutes
    if [[ "$duration" =~ ([0-9]+)m ]]; then
        total_secs=$((total_secs + ${BASH_REMATCH[1]} * 60))
    fi
    
    # If just a number, treat as hours
    if [[ "$duration" =~ ^[0-9]+$ ]]; then
        total_secs=$((duration * 3600))
    fi
    
    echo "$total_secs"
}

# Format seconds as human-readable duration
format_duration() {
    local secs=$1
    local hours=$((secs / 3600))
    local mins=$(( (secs % 3600) / 60))
    local s=$((secs % 60))
    
    if [ $hours -gt 0 ]; then
        printf "%dh %dm %ds" $hours $mins $s
    elif [ $mins -gt 0 ]; then
        printf "%dm %ds" $mins $s
    else
        printf "%ds" $s
    fi
}

if [ "$1" == "--quick" ]; then
    QUICK_MODE=true
    echo "Running in quick mode..."
elif [ "$1" == "--long-haul" ]; then
    LONG_HAUL_MODE=true
    if [ -n "$2" ]; then
        LONG_HAUL_DURATION_SECS=$(parse_duration "$2")
        if [ "$LONG_HAUL_DURATION_SECS" -eq 0 ]; then
            echo "Invalid duration format: $2"
            echo "Use format like: 8h, 30m, 1h30m"
            exit 1
        fi
    fi
    echo "Running in long haul mode for $(format_duration $LONG_HAUL_DURATION_SECS)..."
fi

# Set iterations based on mode
if [ "$QUICK_MODE" = true ]; then
    ENABLE_DISABLE_CYCLES=10
    UI_STRESS_ITERATIONS=20
    ZONE_CYCLING_ITERATIONS=100
    LAYOUT_SWITCH_CYCLES=3
    COMBINED_STRESS_ITERATIONS=25
    MULTI_MONITOR_ITERATIONS=10
    WINDOW_MOVEMENT_PASSES=1
    WINDOW_MOVEMENT_LAYOUTS=2  # Limit layouts for quick test
elif [ "$LONG_HAUL_MODE" = true ]; then
    # Long haul uses mini iterations per cycle (faster per-test runs)
    ENABLE_DISABLE_CYCLES=10
    UI_STRESS_ITERATIONS=15
    ZONE_CYCLING_ITERATIONS=100
    LAYOUT_SWITCH_CYCLES=3
    COMBINED_STRESS_ITERATIONS=25
    MULTI_MONITOR_ITERATIONS=10
    WINDOW_MOVEMENT_PASSES=1
    WINDOW_MOVEMENT_LAYOUTS=2
else
    ENABLE_DISABLE_CYCLES=50
    UI_STRESS_ITERATIONS=50
    ZONE_CYCLING_ITERATIONS=500
    LAYOUT_SWITCH_CYCLES=10
    COMBINED_STRESS_ITERATIONS=100
    MULTI_MONITOR_ITERATIONS=25
    WINDOW_MOVEMENT_PASSES=2
    WINDOW_MOVEMENT_LAYOUTS=0  # 0 = all layouts
fi

# Long haul CSV file for raw data export
# We write to /tmp/ (append works locally) and sync to results/ (full copy works on WebDAV)
LONG_HAUL_TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
LONG_HAUL_TMP_FILE="/tmp/longhaul-${LONG_HAUL_TIMESTAMP}.csv"
LONG_HAUL_RESULTS_DIR="$SCRIPT_DIR/../../results"
mkdir -p "$LONG_HAUL_RESULTS_DIR" 2>/dev/null || true
LONG_HAUL_CSV_FILE="$LONG_HAUL_RESULTS_DIR/longhaul-${LONG_HAUL_TIMESTAMP}.csv"

# Test names for long haul tracking (must match the test order)
declare -a TEST_NAMES=("Enable/Disable" "UI Stress" "Zone Cycling" "Layout Switching" "Combined Stress" "Multi-Monitor" "Window Movement" "Edge Cases" "Workspace")

# Per-test memory delta arrays for statistics
declare -a MEM_DELTAS_0 MEM_DELTAS_1 MEM_DELTAS_2 MEM_DELTAS_3 MEM_DELTAS_4 MEM_DELTAS_5 MEM_DELTAS_6 MEM_DELTAS_7 MEM_DELTAS_8

# Long haul helper: Get GNOME Shell RSS memory in KB
get_shell_memory_kb() {
    ps -o rss= -p $(pgrep -f gnome-shell | head -1) 2>/dev/null | tr -d ' ' || echo "0"
}

# Long haul helper: Run a single test and return memory delta
# Usage: run_test_and_get_delta test_index
# Returns the memory delta in KB via echo
run_test_and_get_delta() {
    local test_index=$1
    local mem_before=$(get_shell_memory_kb)
    local exit_code=0
    
    case $test_index in
        0) "$SCRIPT_DIR/test-enable-disable.sh" "$ENABLE_DISABLE_CYCLES" 300 >/dev/null 2>&1 || exit_code=$? ;;
        1) "$SCRIPT_DIR/test-ui-stress.sh" "$UI_STRESS_ITERATIONS" >/dev/null 2>&1 || exit_code=$? ;;
        2) "$SCRIPT_DIR/test-zone-cycling.sh" "$ZONE_CYCLING_ITERATIONS" >/dev/null 2>&1 || exit_code=$? ;;
        3) "$SCRIPT_DIR/test-layout-switching.sh" "$LAYOUT_SWITCH_CYCLES" >/dev/null 2>&1 || exit_code=$? ;;
        4) "$SCRIPT_DIR/test-combined-stress.sh" "$COMBINED_STRESS_ITERATIONS" >/dev/null 2>&1 || exit_code=$? ;;
        5) "$SCRIPT_DIR/test-multi-monitor.sh" "$MULTI_MONITOR_ITERATIONS" >/dev/null 2>&1 || exit_code=$? ;;
        6) "$SCRIPT_DIR/test-window-movement.sh" "$WINDOW_MOVEMENT_PASSES" "$WINDOW_MOVEMENT_LAYOUTS" >/dev/null 2>&1 || exit_code=$? ;;
        7) "$SCRIPT_DIR/test-edge-cases.sh" >/dev/null 2>&1 || exit_code=$? ;;
        8) "$SCRIPT_DIR/test-workspace.sh" >/dev/null 2>&1 || exit_code=$? ;;
    esac
    
    local mem_after=$(get_shell_memory_kb)
    local delta=$((mem_after - mem_before))
    echo "$delta:$exit_code"
}

# Statistics helper: Calculate min of an array
# Note: Use _data to avoid circular ref when caller passes 'arr'
calc_min() {
    local -n _data=$1
    local min=${_data[0]:-0}
    for val in "${_data[@]}"; do
        if [ "$val" -lt "$min" ] 2>/dev/null; then
            min=$val
        fi
    done
    echo "$min"
}

# Statistics helper: Calculate max of an array
calc_max() {
    local -n _data=$1
    local max=${_data[0]:-0}
    for val in "${_data[@]}"; do
        if [ "$val" -gt "$max" ] 2>/dev/null; then
            max=$val
        fi
    done
    echo "$max"
}

# Statistics helper: Calculate average (integer)
calc_avg() {
    local -n _data=$1
    local sum=0
    local count=0
    for val in "${_data[@]}"; do
        sum=$((sum + val))
        ((++count))
    done
    if [ $count -gt 0 ]; then
        echo $((sum / count))
    else
        echo 0
    fi
}

# Statistics helper: Calculate total sum
calc_sum() {
    local -n _data=$1
    local sum=0
    for val in "${_data[@]}"; do
        sum=$((sum + val))
    done
    echo "$sum"
}

# Statistics helper: Calculate standard deviation (integer approximation)
calc_stddev() {
    local -n _data=$1
    # Calculate average inline to avoid nested nameref
    local sum=0
    local count=0
    for val in "${_data[@]}"; do
        sum=$((sum + val))
        ((++count))
    done
    local avg=0
    if [ $count -gt 0 ]; then
        avg=$((sum / count))
    fi
    
    local sum_sq=0
    count=0
    for val in "${_data[@]}"; do
        local diff=$((val - avg))
        sum_sq=$((sum_sq + diff * diff))
        ((++count))
    done
    if [ $count -gt 0 ]; then
        # Integer sqrt approximation
        local variance=$((sum_sq / count))
        # Newton's method for sqrt
        if [ $variance -eq 0 ]; then
            echo 0
        else
            local x=$variance
            for _ in {1..10}; do
                x=$(( (x + variance / x) / 2 ))
            done
            echo "$x"
        fi
    else
        echo 0
    fi
}

# Store delta in appropriate array
store_delta() {
    local test_index=$1
    local delta=$2
    case $test_index in
        0) MEM_DELTAS_0+=("$delta") ;;
        1) MEM_DELTAS_1+=("$delta") ;;
        2) MEM_DELTAS_2+=("$delta") ;;
        3) MEM_DELTAS_3+=("$delta") ;;
        4) MEM_DELTAS_4+=("$delta") ;;
        5) MEM_DELTAS_5+=("$delta") ;;
        6) MEM_DELTAS_6+=("$delta") ;;
        7) MEM_DELTAS_7+=("$delta") ;;
        8) MEM_DELTAS_8+=("$delta") ;;
    esac
}

# Get delta array by index
get_delta_array_name() {
    echo "MEM_DELTAS_$1"
}

# Long haul leak detection: is this test a consistent leaker?
# Returns: "LEAK", "WARN", or "OK"
detect_leak_status() {
    local test_index=$1
    local arr_name="MEM_DELTAS_$test_index"
    
    # Pass array name directly to avoid double nameref
    local min=$(calc_min "$arr_name")
    local avg=$(calc_avg "$arr_name")
    
    # Leak threshold: avg > 50KB AND min > 0 (always positive)
    # This indicates consistent growth, not GC fluctuation
    if [ "$min" -gt 0 ] && [ "$avg" -gt 50 ]; then
        echo "LEAK"
    elif [ "$avg" -gt 100 ]; then
        # High average even with some negative deltas
        echo "WARN"
    else
        echo "OK"
    fi
}

# Print colorized verdict
print_verdict() {
    local status=$1
    case $status in
        "LEAK") echo -e "${RED}⚠ LEAK${NC}" ;;
        "WARN") echo -e "${YELLOW}⚠ WARN${NC}" ;;
        "OK") echo -e "${GREEN}✓ OK${NC}" ;;
        *) echo "$status" ;;
    esac
}

# Long haul signal handler: gracefully handle Ctrl+C / SIGTERM
long_haul_signal_handler() {
    echo ""
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}                    LONG HAUL TEST INTERRUPTED${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    LONG_HAUL_ABORTED=true
    
    # Final sync of CSV data
    cp "$LONG_HAUL_TMP_FILE" "$LONG_HAUL_CSV_FILE" 2>/dev/null || true
    
    # Print whatever results we have
    print_long_haul_results "$LONG_HAUL_CYCLE" "$LONG_HAUL_FAILURES"
    
    # Disable debug features
    echo ""
    echo "Disabling debug features..."
    gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus false 2>/dev/null || true
    gsettings set org.gnome.shell.extensions.zoned debug-track-resources false 2>/dev/null || true
    
    exit 130  # Standard exit code for SIGINT
}

# Long haul checkpoint: print periodic status summary
print_checkpoint() {
    local cycle=$1
    local elapsed=$2
    local current_mem=$(get_shell_memory_kb)
    local growth=$((current_mem - LONG_HAUL_BASELINE_MEM))
    local growth_mb=$((growth / 1024))
    local current_mb=$((current_mem / 1024))
    
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo -e "  ${YELLOW}CHECKPOINT${NC} @ Cycle $cycle ($(format_duration $elapsed) elapsed)"
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo "  Current GNOME Shell Memory: ${current_mb}MB"
    echo "  Memory growth since start:  ${growth_mb}MB"
    echo ""
    echo "  Per-test trends (last $cycle cycles):"
    
    for i in {0..8}; do
        local arr_name="MEM_DELTAS_$i"
        local -n _arr=$arr_name
        
        if [ ${#_arr[@]} -eq 0 ]; then
            continue
        fi
        
        # Pass array name directly to avoid double nameref
        local avg=$(calc_avg "$arr_name")
        local status=$(detect_leak_status $i)
        local status_indicator=""
        
        case $status in
            "LEAK") status_indicator="${RED}⚠ LEAK${NC}" ;;
            "WARN") status_indicator="${YELLOW}⚠ warn${NC}" ;;
            "OK") status_indicator="${GREEN}ok${NC}" ;;
        esac
        
        printf "    %-20s avg %+6dKB  (%b)\n" "${TEST_NAMES[$i]}" "$avg" "$status_indicator"
    done
    
    echo ""
    echo "  CSV data: $LONG_HAUL_CSV_FILE"
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo ""
}

# Long haul safety check: returns 0 if safe, 1 if should bail
check_long_haul_safety() {
    local current_mem=$(get_shell_memory_kb)
    local growth=$((current_mem - LONG_HAUL_BASELINE_MEM))
    
    # Check absolute memory ceiling
    if [ "$current_mem" -gt "$LONG_HAUL_MAX_MEMORY_KB" ]; then
        local current_mb=$((current_mem / 1024))
        local max_mb=$((LONG_HAUL_MAX_MEMORY_KB / 1024))
        echo ""
        echo -e "${RED}═══════════════════════════════════════════════════════════════════════════════${NC}"
        echo -e "${RED}  EMERGENCY STOP: Memory ceiling exceeded${NC}"
        echo -e "${RED}═══════════════════════════════════════════════════════════════════════════════${NC}"
        echo "  GNOME Shell memory: ${current_mb}MB (limit: ${max_mb}MB)"
        echo "  Stopping to prevent system instability"
        echo -e "${RED}═══════════════════════════════════════════════════════════════════════════════${NC}"
        return 1
    fi
    
    # Check cumulative growth ceiling
    if [ "$growth" -gt "$LONG_HAUL_MAX_GROWTH_KB" ]; then
        local growth_mb=$((growth / 1024))
        local max_growth_mb=$((LONG_HAUL_MAX_GROWTH_KB / 1024))
        echo ""
        echo -e "${RED}═══════════════════════════════════════════════════════════════════════════════${NC}"
        echo -e "${RED}  EMERGENCY STOP: Memory growth ceiling exceeded${NC}"
        echo -e "${RED}═══════════════════════════════════════════════════════════════════════════════${NC}"
        echo "  Memory growth since start: ${growth_mb}MB (limit: ${max_growth_mb}MB)"
        echo "  Stopping to prevent system instability"
        echo -e "${RED}═══════════════════════════════════════════════════════════════════════════════${NC}"
        return 1
    fi
    
    return 0
}

# Main long haul loop function
run_long_haul() {
    local end_time=$((SUITE_START_TIME + LONG_HAUL_DURATION_SECS))
    local cycle=0
    local total_test_failures=0
    
    # Set up signal handler for graceful abort
    trap 'long_haul_signal_handler' INT TERM
    
    # Record baseline memory
    LONG_HAUL_BASELINE_MEM=$(get_shell_memory_kb)
    local baseline_mb=$((LONG_HAUL_BASELINE_MEM / 1024))
    
    # Initialize CSV with header (write to temp, sync to results)
    echo "cycle,timestamp,$(IFS=,; echo "${TEST_NAMES[*]}")" > "$LONG_HAUL_TMP_FILE"
    cp "$LONG_HAUL_TMP_FILE" "$LONG_HAUL_CSV_FILE" 2>/dev/null || true
    
    echo ""
    echo "Long haul test started at $(date)"
    echo "Will run until $(date -d "@$end_time" 2>/dev/null || date -r "$end_time" 2>/dev/null || echo "end time")"
    echo "CSV output: $LONG_HAUL_CSV_FILE"
    echo "  (temp file: $LONG_HAUL_TMP_FILE)"
    echo ""
    echo "Safety limits:"
    echo "  Max GNOME Shell memory: $((LONG_HAUL_MAX_MEMORY_KB / 1024))MB"
    echo "  Max memory growth: $((LONG_HAUL_MAX_GROWTH_KB / 1024))MB"
    echo "  Checkpoint interval: every $LONG_HAUL_CHECKPOINT_CYCLES cycles"
    echo "  Baseline memory: ${baseline_mb}MB"
    echo ""
    
    while [ $(date +%s) -lt $end_time ]; do
        ((++cycle))
        
        # Update global state for signal handler
        LONG_HAUL_CYCLE=$cycle
        LONG_HAUL_FAILURES=$total_test_failures
        
        local cycle_start=$(date +%s)
        local elapsed=$((cycle_start - SUITE_START_TIME))
        local remaining=$((end_time - cycle_start))
        
        printf "\r[Cycle %d] Elapsed: %s | Remaining: %s | Running tests...        " \
            "$cycle" "$(format_duration $elapsed)" "$(format_duration $remaining)"
        
        local csv_row="$cycle,$cycle_start"
        local cycle_failures=0
        local -a failed_test_names=()
        
        # Run all 9 tests and collect deltas
        for i in {0..8}; do
            local result=$(run_test_and_get_delta $i)
            local delta=$(echo "$result" | cut -d: -f1)
            local exit_code=$(echo "$result" | cut -d: -f2)
            
            store_delta $i "$delta"
            csv_row="$csv_row,$delta"
            
            if [ "$exit_code" -ne 0 ]; then
                ((++cycle_failures))
                ((++total_test_failures))
                LONG_HAUL_FAILURES=$total_test_failures
                failed_test_names+=("${TEST_NAMES[$i]}")
            fi
        done
        
        # Write CSV row to temp file and sync to results (WebDAV doesn't support append)
        echo "$csv_row" >> "$LONG_HAUL_TMP_FILE"
        cp "$LONG_HAUL_TMP_FILE" "$LONG_HAUL_CSV_FILE" 2>/dev/null || true
        
        # Brief status after each cycle - include failed test names if any
        local cycle_duration=$(($(date +%s) - cycle_start))
        local failure_info=""
        if [ "$cycle_failures" -gt 0 ]; then
            # Join failed test names with comma, truncate if too long
            local failed_names_str=$(IFS=', '; echo "${failed_test_names[*]}")
            if [ ${#failed_names_str} -gt 40 ]; then
                failed_names_str="${failed_names_str:0:37}..."
            fi
            failure_info=" (${failed_names_str})"
        fi
        printf "\r[Cycle %d] Completed in %ds | Failures: %d%s\n" \
            "$cycle" "$cycle_duration" "$cycle_failures" "$failure_info"
        
        # Safety check - bail if memory limits exceeded
        if ! check_long_haul_safety; then
            echo ""
            echo "Bailing out due to safety limits..."
            print_long_haul_results "$cycle" "$total_test_failures"
            return 2  # Distinctive exit code for safety bailout
        fi
        
        # Periodic checkpoint
        if [ $((cycle % LONG_HAUL_CHECKPOINT_CYCLES)) -eq 0 ]; then
            print_checkpoint "$cycle" "$elapsed"
        fi
        
        # Brief pause between cycles
        sleep 2
    done
    
    # Clear the signal handler
    trap - INT TERM
    
    echo ""
    echo "Long haul test completed: $cycle cycles in $(format_duration $(($(date +%s) - SUITE_START_TIME)))"
    echo ""
    
    # Print detailed statistics
    print_long_haul_results "$cycle" "$total_test_failures"
}

# Print long haul results with per-test statistics
print_long_haul_results() {
    local total_cycles=$1
    local total_failures=$2
    
    # Capture final memory state BEFORE GC
    local mem_after_tests=$(get_shell_memory_kb)
    local mem_after_tests_mb=$((mem_after_tests / 1024))
    
    # Force garbage collection
    echo "Running garbage collection..."
    force_gc
    sleep 2  # Extra time for GC to complete
    
    # Capture memory AFTER GC
    local mem_after_gc=$(get_shell_memory_kb)
    local mem_after_gc_mb=$((mem_after_gc / 1024))
    
    # Calculate deltas
    local baseline_mb=$((LONG_HAUL_BASELINE_MEM / 1024))
    local gc_recovered=$((mem_after_tests - mem_after_gc))
    local gc_recovered_mb=$((gc_recovered / 1024))
    local net_retained=$((mem_after_gc - LONG_HAUL_BASELINE_MEM))
    local net_retained_mb=$((net_retained / 1024))
    
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo "                         LONG HAUL TEST RESULTS"
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo ""
    echo "Duration: $(format_duration $(($(date +%s) - SUITE_START_TIME)))"
    echo "Cycles Completed: $total_cycles"
    echo "Test Failures: $total_failures"
    echo ""
    echo "MEMORY SUMMARY (Three-Point Measurement):"
    echo "───────────────────────────────────────────────────────────────────────────────"
    printf "  %-24s %8dMB (%dKB)\n" "Before Tests:" "$baseline_mb" "$LONG_HAUL_BASELINE_MEM"
    printf "  %-24s %8dMB (%dKB)\n" "After Tests (raw):" "$mem_after_tests_mb" "$mem_after_tests"
    printf "  %-24s %8dMB (%dKB)\n" "After GC (true cost):" "$mem_after_gc_mb" "$mem_after_gc"
    echo "───────────────────────────────────────────────────────────────────────────────"
    if [ "$gc_recovered" -gt 0 ]; then
        printf "  %-24s %b\n" "GC Recovered:" "${GREEN}${gc_recovered_mb}MB (${gc_recovered}KB)${NC}"
    else
        printf "  %-24s %dMB (%dKB)\n" "GC Recovered:" "$gc_recovered_mb" "$gc_recovered"
    fi
    if [ "$net_retained" -gt 10240 ]; then  # > 10MB retained is concerning
        printf "  %-24s %b\n" "Net Retained:" "${YELLOW}+${net_retained_mb}MB (+${net_retained}KB)${NC}"
    elif [ "$net_retained" -gt 0 ]; then
        printf "  %-24s +%dMB (+%dKB)\n" "Net Retained:" "$net_retained_mb" "$net_retained"
    else
        printf "  %-24s %b\n" "Net Retained:" "${GREEN}${net_retained_mb}MB (${net_retained}KB)${NC}"
    fi
    echo "───────────────────────────────────────────────────────────────────────────────"
    echo ""
    echo "PER-TEST MEMORY ANALYSIS:"
    echo "───────────────────────────────────────────────────────────────────────────────"
    printf "%-18s │ %8s │ %8s │ %8s │ %8s │ %10s │ %s\n" \
        "Test" "Min Δ" "Max Δ" "Avg Δ" "StdDev" "Total" "Verdict"
    echo "───────────────────────────────────────────────────────────────────────────────"
    
    local detected_leaks=0
    local detected_warns=0
    local grand_total=0
    
    for i in {0..8}; do
        local arr_name="MEM_DELTAS_$i"
        local -n _arr=$arr_name
        
        # Skip if no data
        if [ ${#_arr[@]} -eq 0 ]; then
            printf "%-18s │ %8s │ %8s │ %8s │ %8s │ %10s │ %s\n" \
                "${TEST_NAMES[$i]}" "-" "-" "-" "-" "-" "NO DATA"
            continue
        fi
        
        # Pass array name directly to avoid double nameref
        local min=$(calc_min "$arr_name")
        local max=$(calc_max "$arr_name")
        local avg=$(calc_avg "$arr_name")
        local stddev=$(calc_stddev "$arr_name")
        local total=$(calc_sum "$arr_name")
        local status=$(detect_leak_status $i)
        
        grand_total=$((grand_total + total))
        
        case $status in
            "LEAK") ((++detected_leaks)) ;;
            "WARN") ((++detected_warns)) ;;
        esac
        
        # Format values with KB suffix
        local min_str=$([ "$min" -ge 0 ] && echo "+${min}KB" || echo "${min}KB")
        local max_str=$([ "$max" -ge 0 ] && echo "+${max}KB" || echo "${max}KB")
        local avg_str=$([ "$avg" -ge 0 ] && echo "+${avg}KB" || echo "${avg}KB")
        local stddev_str="${stddev}KB"
        local total_str=$([ "$total" -ge 0 ] && echo "+${total}KB" || echo "${total}KB")
        
        # Color the min if always positive (leak indicator)
        if [ "$min" -gt 0 ]; then
            min_str="${RED}${min_str}${NC}"
        elif [ "$min" -lt 0 ]; then
            min_str="${GREEN}${min_str}${NC}"
        fi
        
        printf "%-18s │ %b │ %8s │ %8s │ %8s │ %10s │ %b\n" \
            "${TEST_NAMES[$i]}" "$min_str" "$max_str" "$avg_str" "$stddev_str" "$total_str" "$(print_verdict $status)"
    done
    
    echo "───────────────────────────────────────────────────────────────────────────────"
    
    # Grand total
    local grand_total_str=$([ "$grand_total" -ge 0 ] && echo "+${grand_total}KB" || echo "${grand_total}KB")
    if [ "$grand_total" -gt "$SUITE_MEM_FAIL_THRESHOLD_KB" ]; then
        grand_total_str="${RED}${grand_total_str}${NC}"
    elif [ "$grand_total" -gt "$SUITE_MEM_WARN_THRESHOLD_KB" ]; then
        grand_total_str="${YELLOW}${grand_total_str}${NC}"
    fi
    
    printf "%-18s │ %8s │ %8s │ %8s │ %8s │ %b │\n" \
        "GRAND TOTAL" "" "" "" "" "$grand_total_str"
    
    echo ""
    
    # Print detected issues
    if [ "$detected_leaks" -gt 0 ] || [ "$detected_warns" -gt 0 ]; then
        echo "DETECTED ISSUES:"
        for i in {0..8}; do
            local status=$(detect_leak_status $i)
            local arr_name="MEM_DELTAS_$i"
            if [ "$status" = "LEAK" ]; then
                # Pass array name directly to avoid double nameref
                local min=$(calc_min "$arr_name")
                echo -e "  ${RED}⚠ ${TEST_NAMES[$i]}: Always positive delta (+${min}KB min) - likely resource leak${NC}"
            elif [ "$status" = "WARN" ]; then
                # Pass array name directly to avoid double nameref
                local avg=$(calc_avg "$arr_name")
                echo -e "  ${YELLOW}⚠ ${TEST_NAMES[$i]}: High average memory growth (+${avg}KB avg)${NC}"
            fi
        done
        echo ""
    fi
    
    echo "TOTAL MEMORY GROWTH: ${grand_total}KB over $total_cycles cycles"
    echo ""
    echo "Per-cycle raw data saved to:"
    echo "  Host (results/): $LONG_HAUL_CSV_FILE"
    echo "  VM (backup):     $LONG_HAUL_TMP_FILE"
    echo ""
    
    # Set exit code based on detected issues and explain it
    if [ "$detected_leaks" -gt 0 ]; then
        echo -e "${YELLOW}⚠ Exiting with code 1: Memory leaks detected (test ran successfully)${NC}"
        echo "═══════════════════════════════════════════════════════════════════════════════"
        return 1
    else
        echo -e "${GREEN}✓ Exiting with code 0: No memory leaks detected${NC}"
        echo "═══════════════════════════════════════════════════════════════════════════════"
        return 0
    fi
}

# ============================================================================
# LONG HAUL MODE - runs a different flow
# ============================================================================
if [ "$LONG_HAUL_MODE" = true ]; then
    run_long_haul
    long_haul_result=$?
    
    # Disable debug features
    echo ""
    echo "Disabling debug features..."
    gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus false 2>/dev/null || true
    gsettings set org.gnome.shell.extensions.zoned debug-track-resources false 2>/dev/null || true
    
    exit $long_haul_result
fi

# ============================================================================
# NORMAL MODE (Quick or Full) - sequential test execution
# ============================================================================

# Track failed tests
FAILED_TESTS=0

# Run tests (capture exit codes but don't exit on failure)
echo ""
echo "========================================"
echo "  Test 1: Enable/Disable Cycle"
echo "========================================"
export TEST_NAME="Enable/Disable"
"$SCRIPT_DIR/test-enable-disable.sh" "$ENABLE_DISABLE_CYCLES" 500 || ((++FAILED_TESTS))

echo ""
echo "========================================"
echo "  Test 2: UI Stress Test"
echo "========================================"
export TEST_NAME="UI Stress"
"$SCRIPT_DIR/test-ui-stress.sh" "$UI_STRESS_ITERATIONS" || ((++FAILED_TESTS))

echo ""
echo "========================================"
echo "  Test 3: Zone Cycling"
echo "========================================"
export TEST_NAME="Zone Cycling"
"$SCRIPT_DIR/test-zone-cycling.sh" "$ZONE_CYCLING_ITERATIONS" || ((++FAILED_TESTS))

echo ""
echo "========================================"
echo "  Test 4: Layout Switching"
echo "========================================"
export TEST_NAME="Layout Switching"
"$SCRIPT_DIR/test-layout-switching.sh" "$LAYOUT_SWITCH_CYCLES" || ((++FAILED_TESTS))

echo ""
echo "========================================"
echo "  Test 5: Combined Stress"
echo "========================================"
export TEST_NAME="Combined Stress"
"$SCRIPT_DIR/test-combined-stress.sh" "$COMBINED_STRESS_ITERATIONS" || ((++FAILED_TESTS))

echo ""
echo "========================================"
echo "  Test 6: Multi-Monitor"
echo "========================================"
export TEST_NAME="Multi-Monitor"
"$SCRIPT_DIR/test-multi-monitor.sh" "$MULTI_MONITOR_ITERATIONS" || ((++FAILED_TESTS))

echo ""
echo "========================================"
echo "  Test 7: Window Movement"
echo "========================================"
export TEST_NAME="Window Movement"
"$SCRIPT_DIR/test-window-movement.sh" "$WINDOW_MOVEMENT_PASSES" "$WINDOW_MOVEMENT_LAYOUTS" || ((++FAILED_TESTS))

echo ""
echo "========================================"
echo "  Test 8: Edge Cases"
echo "========================================"
export TEST_NAME="Edge Cases"
"$SCRIPT_DIR/test-edge-cases.sh" || ((++FAILED_TESTS))

echo ""
echo "========================================"
echo "  Test 9: Workspace Tests"
echo "========================================"
export TEST_NAME="Workspace"
"$SCRIPT_DIR/test-workspace.sh" || ((++FAILED_TESTS))

# Disable debug features
echo ""
echo "Disabling debug features..."
gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus false 2>/dev/null || true
gsettings set org.gnome.shell.extensions.zoned debug-track-resources false 2>/dev/null || true

# Calculate suite duration
SUITE_END_TIME=$(date +%s)
SUITE_DURATION=$((SUITE_END_TIME - SUITE_START_TIME))
SUITE_MINS=$((SUITE_DURATION / 60))
SUITE_SECS=$((SUITE_DURATION % 60))

# Print final summary
echo ""
echo "========================================"
echo "        FINAL TEST RESULTS"
echo "========================================"
echo ""

# Parse results file and display table
printf "%-20s | %-6s | %4s | %4s | %4s | %8s | %6s\n" "Test" "Status" "Pass" "Fail" "Warn" "Mem" "Time"
printf "%-20s-|-%6s-|-%4s-|-%4s-|-%4s-|-%8s-|-%6s\n" "--------------------" "------" "----" "----" "----" "--------" "------"

total_pass=0
total_fail=0
total_warn=0
total_mem=0
passed_tests=0
skipped_tests=0
mem_warnings=0
mem_failures=0

while IFS='|' read -r name status pass fail warn mem duration mem_status; do
    # Skip empty lines
    [ -z "$name" ] && continue
    
    # Format memory change with color
    if [ "$mem" -gt "$MEM_FAIL_THRESHOLD_KB" ] 2>/dev/null; then
        mem_str="${RED}+${mem}KB${NC}"
        ((++mem_failures))
    elif [ "$mem" -gt "$MEM_WARN_THRESHOLD_KB" ] 2>/dev/null; then
        mem_str="${YELLOW}+${mem}KB${NC}"
        ((++mem_warnings))
    elif [ "$mem" -gt 0 ] 2>/dev/null; then
        mem_str="+${mem}KB"
    elif [ "$mem" -lt 0 ] 2>/dev/null; then
        mem_str="${GREEN}${mem}KB${NC}"
    else
        mem_str="${GREEN}0KB${NC}"
    fi
    
    # Format duration
    if [ "$duration" -gt 0 ] 2>/dev/null; then
        dur_str="${duration}s"
    else
        dur_str="-"
    fi
    
    # Status symbol (consider mem_status too)
    case "$status" in
        PASS) 
            if [ "$mem_status" = "MEM_FAIL" ]; then
                status_str="${RED}  ✗   ${NC}"
            elif [ "$mem_status" = "MEM_WARN" ]; then
                status_str="${YELLOW}  ⚠   ${NC}"
                ((++passed_tests))
            else
                status_str="${GREEN}  ✓   ${NC}"
                ((++passed_tests))
            fi
            ;;
        FAIL) 
            status_str="${RED}  ✗   ${NC}"
            ;;
        SKIP) 
            status_str="${YELLOW} SKIP ${NC}"
            ((++skipped_tests))
            ;;
        *) 
            status_str="  ?   "
            ;;
    esac
    
    printf "%-20s | %b | %4s | %4s | %4s | %b | %6s\n" "$name" "$status_str" "$pass" "$fail" "$warn" "$mem_str" "$dur_str"
    
    if [ "$status" != "SKIP" ]; then
        total_pass=$((total_pass + pass))
        total_fail=$((total_fail + fail))
        total_warn=$((total_warn + warn))
        total_mem=$((total_mem + mem))
    fi
done < "$TEST_RESULTS_FILE"

echo ""
printf "%-20s-|-%6s-|-%4s-|-%4s-|-%4s-|-%8s-|-%6s\n" "--------------------" "------" "----" "----" "----" "--------" "------"

# Format total memory with color
if [ "$total_mem" -gt "$SUITE_MEM_FAIL_THRESHOLD_KB" ]; then
    total_mem_str="${RED}+${total_mem}KB${NC}"
elif [ "$total_mem" -gt "$SUITE_MEM_WARN_THRESHOLD_KB" ]; then
    total_mem_str="${YELLOW}+${total_mem}KB${NC}"
elif [ "$total_mem" -gt 0 ]; then
    total_mem_str="+${total_mem}KB"
elif [ "$total_mem" -lt 0 ]; then
    total_mem_str="${GREEN}${total_mem}KB${NC}"
else
    total_mem_str="${GREEN}0KB${NC}"
fi

printf "%-20s | %6s | %4s | %4s | %4s | %b | %dm %02ds\n" "TOTALS" "" "$total_pass" "$total_fail" "$total_warn" "$total_mem_str" "$SUITE_MINS" "$SUITE_SECS"

echo ""

# Suite-level memory validation
SUITE_MEM_STATUS=""
if [ "$total_mem" -gt "$SUITE_MEM_FAIL_THRESHOLD_KB" ]; then
    mb=$((total_mem / 1024))
    echo -e "${RED}⚠ SUITE MEMORY LEAK: Total memory grew by ${mb}MB - exceeds fail threshold (${SUITE_MEM_FAIL_THRESHOLD_KB}KB)${NC}"
    SUITE_MEM_STATUS="FAIL"
    ((++FAILED_TESTS))
elif [ "$total_mem" -gt "$SUITE_MEM_WARN_THRESHOLD_KB" ]; then
    mb=$((total_mem / 1024))
    echo -e "${YELLOW}⚠ SUITE MEMORY WARNING: Total memory grew by ${mb}MB - exceeds warn threshold (${SUITE_MEM_WARN_THRESHOLD_KB}KB)${NC}"
    SUITE_MEM_STATUS="WARN"
fi

echo "========================================"

# Count total tests from results file
total_tests=$(wc -l < "$TEST_RESULTS_FILE" 2>/dev/null || echo "0")
total_tests=${total_tests:-0}

# Build summary message
summary_parts=""
if [ "$mem_failures" -gt 0 ]; then
    summary_parts="${summary_parts}, ${RED}${mem_failures} memory fail${NC}"
fi
if [ "$mem_warnings" -gt 0 ]; then
    summary_parts="${summary_parts}, ${YELLOW}${mem_warnings} memory warn${NC}"
fi

if [ "$FAILED_TESTS" -gt 0 ]; then
    echo -e "${RED}  $total_tests tests: $passed_tests passed, $FAILED_TESTS failed, $skipped_tests skipped${summary_parts}${NC}"
    echo "========================================"
    exit 1
else
    echo -e "${GREEN}  $total_tests tests: $passed_tests passed, 0 failed, $skipped_tests skipped${summary_parts}${NC}"
    echo "========================================"
    exit 0
fi
