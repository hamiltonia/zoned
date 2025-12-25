#!/bin/bash
# Test assertion functions for stability tests
# Source this file from test scripts

# Counters
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# Test context for rollup reporting
TEST_NAME="${TEST_NAME:-unknown}"
TEST_START_TIME=""
TEST_START_MEM=0
TEST_RESULTS_FILE="${TEST_RESULTS_FILE:-/tmp/zoned-test-results.txt}"

# Memory thresholds (in KB)
# WARN if memory grows more than this during a single test
MEM_WARN_THRESHOLD_KB=${MEM_WARN_THRESHOLD_KB:-5120}   # 5 MB
# FAIL if memory grows more than this during a single test
MEM_FAIL_THRESHOLD_KB=${MEM_FAIL_THRESHOLD_KB:-20480}  # 20 MB

# Assert memory growth is within acceptable bounds
# Usage: assert_memory_growth $mem_diff_kb "context"
# Returns: 0=ok, 1=warn, 2=fail
assert_memory_growth() {
    local mem_diff=$1
    local context=${2:-"Memory check"}
    
    # Skip check if memory tracking unavailable
    if [ "$TEST_START_MEM" -eq 0 ]; then
        return 0
    fi
    
    # Convert to absolute value for comparison
    local abs_diff=$mem_diff
    [ $abs_diff -lt 0 ] && abs_diff=$((-abs_diff))
    
    # Only check positive growth (memory increase)
    if [ "$mem_diff" -gt "$MEM_FAIL_THRESHOLD_KB" ]; then
        local mb=$((mem_diff / 1024))
        fail "$context: Memory grew by ${mb}MB (${mem_diff}KB) - exceeds fail threshold (${MEM_FAIL_THRESHOLD_KB}KB)"
        return 2
    elif [ "$mem_diff" -gt "$MEM_WARN_THRESHOLD_KB" ]; then
        local mb=$((mem_diff / 1024))
        warn "$context: Memory grew by ${mb}MB (${mem_diff}KB) - exceeds warn threshold (${MEM_WARN_THRESHOLD_KB}KB)"
        return 1
    fi
    
    return 0
}

# Format memory value with color based on thresholds
# Usage: format_memory_colored $mem_diff_kb
# Returns colored string suitable for printf
format_memory_colored() {
    local mem=$1
    local mem_str
    
    # Format the base string
    if [ "$mem" -gt 0 ]; then
        mem_str="+${mem}KB"
    elif [ "$mem" -lt 0 ]; then
        mem_str="${mem}KB"
    else
        mem_str="0KB"
    fi
    
    # Color based on threshold (only for growth)
    if [ "$mem" -gt "$MEM_FAIL_THRESHOLD_KB" ]; then
        echo -e "${RED:-\033[0;31m}${mem_str}${NC:-\033[0m}"
    elif [ "$mem" -gt "$MEM_WARN_THRESHOLD_KB" ]; then
        echo -e "${YELLOW:-\033[1;33m}${mem_str}${NC:-\033[0m}"
    elif [ "$mem" -le 0 ]; then
        echo -e "${GREEN:-\033[0;32m}${mem_str}${NC:-\033[0m}"
    else
        echo "$mem_str"
    fi
}

# Initialize test timing
init_test() {
    local name=$1
    TEST_NAME="$name"
    TEST_START_TIME=$(date +%s)
    TEST_START_MEM=$(get_gnome_shell_memory)
    PASS_COUNT=0
    FAIL_COUNT=0
    WARN_COUNT=0
    
    # Debug: warn if memory tracking unavailable
    if [ "$TEST_START_MEM" -eq 0 ]; then
        echo -e "${YELLOW:-\033[1;33m}Note: Could not get gnome-shell memory - memory tracking disabled${NC:-\033[0m}"
    fi
}

# Print pass message
pass() {
    echo -e "${GREEN:-\033[0;32m}✓ PASS:${NC:-\033[0m} $1"
    PASS_COUNT=$((PASS_COUNT + 1))
}

# Print fail message and exit
fail() {
    echo -e "${RED:-\033[0;31m}✗ FAIL:${NC:-\033[0m} $1"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    exit 1
}

# Print warning
warn() {
    echo -e "${YELLOW:-\033[1;33m}⚠ WARN:${NC:-\033[0m} $1"
    WARN_COUNT=$((WARN_COUNT + 1))
}

# Print error message (does not exit - caller decides)
error() {
    echo -e "${RED:-\033[0;31m}✗ ERROR:${NC:-\033[0m} $1"
}

# Print info
info() {
    echo -e "  $1"
}

# Progress indicator
progress() {
    local current=$1
    local total=$2
    local percent=$((current * 100 / total))
    printf "\r  Progress: %d/%d (%d%%)" "$current" "$total" "$percent"
    if [ "$current" -eq "$total" ]; then
        echo ""
    fi
}

# Assert two values are equal
assert_equals() {
    local actual=$1
    local expected=$2
    local msg=$3
    if [ "$actual" != "$expected" ]; then
        fail "$msg: expected '$expected', got '$actual'"
    fi
}

# Assert value is in range
assert_in_range() {
    local value=$1
    local min=$2
    local max=$3
    local msg=$4
    if [ "$value" -lt "$min" ] || [ "$value" -gt "$max" ]; then
        fail "$msg: $value not in range [$min, $max]"
    fi
}

# Assert no resource leaks
assert_no_leaks() {
    local report=$1
    local context=$2
    
    local leaked_signals
    local leaked_timers
    
    leaked_signals=$(extract_variant "leakedSignals" "$report" 2>/dev/null || echo "0")
    leaked_timers=$(extract_variant "leakedTimers" "$report" 2>/dev/null || echo "0")
    
    local total_leaked=$((leaked_signals + leaked_timers))
    
    if [ "$total_leaked" -gt 0 ]; then
        fail "$context: $total_leaked resources leaked (signals: $leaked_signals, timers: $leaked_timers)"
    fi
}

# Assert no resource growth between snapshots
# Usage: assert_no_resource_growth "$before" "$after" "context"
assert_no_resource_growth() {
    local before=$1
    local after=$2
    local context=$3
    local tolerance=${4:-0}  # Allow some tolerance for timing variations
    
    local diffs
    diffs=$(compare_snapshots "$before" "$after")
    
    local signal_diff timer_diff
    read signal_diff timer_diff <<< "$diffs"
    
    if [ "$signal_diff" -gt "$tolerance" ] || [ "$timer_diff" -gt "$tolerance" ]; then
        fail "$context: Resource growth detected (signals: +$signal_diff, timers: +$timer_diff)"
    fi
}

# Check leaks and pass/fail with detailed report
# Usage: check_leaks_and_report "context"
check_leaks_and_report() {
    local context=$1
    
    local counts
    counts=$(get_leak_counts 2>/dev/null)
    
    local leaked_signals leaked_timers
    read leaked_signals leaked_timers <<< "$counts"
    
    local total=$((leaked_signals + leaked_timers))
    
    if [ "$total" -gt 0 ]; then
        print_leak_report "$context"
        fail "$context: $total resources leaked (signals: $leaked_signals, timers: $leaked_timers)"
    else
        pass "$context: No resource leaks"
    fi
}

# Check leaks silently (returns status only)
# Usage: if has_leaks; then ... fi
has_leaks() {
    ! check_for_leaks
}

# Print resource tracking status at test start
print_resource_baseline() {
    local context=${1:-"Baseline"}
    
    local summary
    summary=$(get_resource_summary 2>/dev/null)
    
    if [ -n "$summary" ]; then
        info "$context resource state:"
        echo "$summary" | while read line; do
            info "  $line"
        done
    fi
}

# Get GNOME Shell memory usage in KB
get_gnome_shell_memory() {
    local pid
    local mem
    
    # Try multiple methods to find gnome-shell PID
    pid=$(pgrep -x "gnome-shell" 2>/dev/null | head -1)
    if [ -z "$pid" ]; then
        pid=$(pgrep -f "/usr/bin/gnome-shell" 2>/dev/null | head -1)
    fi
    if [ -z "$pid" ]; then
        pid=$(pidof gnome-shell 2>/dev/null | awk '{print $1}')
    fi
    
    if [ -n "$pid" ]; then
        mem=$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ')
        # Ensure we return a valid number
        if [[ "$mem" =~ ^[0-9]+$ ]]; then
            echo "$mem"
            return 0
        fi
    fi
    
    echo "0"
}

# Sleep for milliseconds
sleep_ms() {
    local ms=$1
    if command -v bc &> /dev/null; then
        sleep "$(echo "scale=3; $ms / 1000" | bc)"
    else
        # Fallback to seconds (round up)
        local seconds=$(( (ms + 999) / 1000 ))
        sleep "$seconds"
    fi
}

# Print test summary and optionally write to results file
print_summary() {
    local status="PASS"
    local exit_code=0
    local mem_status=""
    
    # Calculate timing
    local end_time=$(date +%s)
    local duration=0
    if [ -n "$TEST_START_TIME" ] && [ "$TEST_START_TIME" -gt 0 ]; then
        duration=$((end_time - TEST_START_TIME))
    fi
    
    # Calculate memory change
    local end_mem=$(get_gnome_shell_memory)
    local mem_diff=0
    if [ "$TEST_START_MEM" -gt 0 ] && [ "$end_mem" -gt 0 ]; then
        mem_diff=$((end_mem - TEST_START_MEM))
    fi
    
    # Check memory thresholds (only for positive growth)
    if [ "$TEST_START_MEM" -gt 0 ] && [ "$mem_diff" -gt 0 ]; then
        if [ "$mem_diff" -gt "$MEM_FAIL_THRESHOLD_KB" ]; then
            local mb=$((mem_diff / 1024))
            echo -e "${RED:-\033[0;31m}⚠ MEMORY LEAK: +${mb}MB exceeds fail threshold${NC:-\033[0m}"
            mem_status="MEM_FAIL"
            FAIL_COUNT=$((FAIL_COUNT + 1))
        elif [ "$mem_diff" -gt "$MEM_WARN_THRESHOLD_KB" ]; then
            local mb=$((mem_diff / 1024))
            echo -e "${YELLOW:-\033[1;33m}⚠ MEMORY WARNING: +${mb}MB exceeds warn threshold${NC:-\033[0m}"
            mem_status="MEM_WARN"
            WARN_COUNT=$((WARN_COUNT + 1))
        fi
    fi
    
    echo ""
    echo "========================================"
    echo "  Test Summary"
    echo "========================================"
    echo "  Passed:   $PASS_COUNT"
    echo "  Failed:   $FAIL_COUNT"
    echo "  Warnings: $WARN_COUNT"
    if [ "$TEST_START_MEM" -gt 0 ]; then
        local mem_str=$(format_memory_colored $mem_diff)
        echo -e "  Memory:   $mem_str"
    fi
    echo "========================================"
    
    if [ "$FAIL_COUNT" -gt 0 ]; then
        echo -e "  ${RED:-\033[0;31m}TESTS FAILED${NC:-\033[0m}"
        status="FAIL"
        exit_code=1
    else
        echo -e "  ${GREEN:-\033[0;32m}ALL TESTS PASSED${NC:-\033[0m}"
    fi
    
    # Write result to shared file if TEST_RESULTS_FILE is set and non-empty
    if [ -n "$TEST_RESULTS_FILE" ]; then
        # Format: test_name|status|pass|fail|warn|mem_diff|duration|mem_status
        echo "${TEST_NAME}|${status}|${PASS_COUNT}|${FAIL_COUNT}|${WARN_COUNT}|${mem_diff}|${duration}|${mem_status}" >> "$TEST_RESULTS_FILE"
    fi
    
    return $exit_code
}

# Mark test as skipped
skip_test() {
    local reason=${1:-"not applicable"}
    
    echo -e "${YELLOW:-\033[1;33m}SKIP:${NC:-\033[0m} $reason"
    
    # Write skip result to shared file
    if [ -n "$TEST_RESULTS_FILE" ]; then
        echo "${TEST_NAME}|SKIP|0|0|0|0|0" >> "$TEST_RESULTS_FILE"
    fi
    
    exit 0
}
