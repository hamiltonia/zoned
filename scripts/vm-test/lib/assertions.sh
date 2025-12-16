#!/bin/bash
# Test assertion functions for stability tests
# Source this file from test scripts

# Counters
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

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

# Get GNOME Shell memory usage in KB
get_gnome_shell_memory() {
    local pid
    pid=$(pgrep -f "gnome-shell" | head -1)
    if [ -n "$pid" ]; then
        ps -o rss= -p "$pid" | tr -d ' '
    else
        echo "0"
    fi
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

# Print test summary
print_summary() {
    echo ""
    echo "========================================"
    echo "  Test Summary"
    echo "========================================"
    echo "  Passed:   $PASS_COUNT"
    echo "  Failed:   $FAIL_COUNT"
    echo "  Warnings: $WARN_COUNT"
    echo "========================================"
    
    if [ "$FAIL_COUNT" -gt 0 ]; then
        echo -e "  ${RED:-\033[0;31m}TESTS FAILED${NC:-\033[0m}"
        return 1
    else
        echo -e "  ${GREEN:-\033[0;32m}ALL TESTS PASSED${NC:-\033[0m}"
        return 0
    fi
}
