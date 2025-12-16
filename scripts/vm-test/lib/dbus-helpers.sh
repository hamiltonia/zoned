#!/bin/bash
# D-Bus helper functions for stability tests
# Source this file from test scripts

# D-Bus connection info (set in setup.sh)
: ${DBUS_DEST:="org.gnome.Shell.Extensions.Zoned.Debug"}
: ${DBUS_PATH:="/org/gnome/Shell/Extensions/Zoned/Debug"}
: ${DBUS_IFACE:="org.gnome.Shell.Extensions.Zoned.Debug"}

# Check if D-Bus interface is available
dbus_interface_available() {
    # Try to ping the interface
    gdbus call -e -d org.gnome.Shell \
        -o "$DBUS_PATH" \
        -m "${DBUS_IFACE}.Ping" &>/dev/null
    return $?
}

# Generic D-Bus call
dbus_call() {
    local method=$1
    shift
    gdbus call -e -d org.gnome.Shell \
        -o "$DBUS_PATH" \
        -m "${DBUS_IFACE}.${method}" "$@" 2>/dev/null
}

# Get extension state
dbus_get_state() {
    local raw
    raw=$(dbus_call "GetState")
    # Convert GVariant to pseudo-JSON for parsing
    echo "$raw" | tr -d "()" | sed "s/', '/, /g"
}

# Get resource report
dbus_get_resource_report() {
    local raw
    raw=$(dbus_call "GetResourceReport")
    echo "$raw" | tr -d "()" | sed "s/', '/, /g"
}

# Get component reports (returns JSON)
dbus_get_component_reports() {
    local raw
    raw=$(dbus_call "GetComponentReports")
    # Extract the string content from the variant
    echo "$raw" | sed "s/^('//;s/',)$//;s/\\\\n/\\n/g"
}

# Trigger an action
# Note: params should be JSON without quotes - gdbus handles the variant conversion
dbus_trigger() {
    local action=$1
    local params=${2:-"{}"}
    # Don't quote $params - gdbus needs the raw JSON for D-Bus string type
    dbus_call "TriggerAction" "\"$action\"" "$params"
}

# Reset resource tracking counters
dbus_reset_tracking() {
    dbus_call "ResetResourceTracking"
}

# Ping the interface (health check)
dbus_ping() {
    dbus_call "Ping"
}

# Wait for D-Bus interface to become available
wait_for_dbus() {
    local max_attempts=${1:-30}
    local attempt=0
    
    echo "Waiting for D-Bus debug interface..."
    while [ $attempt -lt $max_attempts ]; do
        if dbus_interface_available; then
            echo "D-Bus interface ready"
            return 0
        fi
        sleep 0.5
        ((attempt++))
    done
    
    echo "D-Bus interface not available after ${max_attempts} attempts"
    return 1
}

# Ensure D-Bus interface is available (exit if not)
ensure_dbus_available() {
    if ! dbus_interface_available; then
        echo -e "${RED:-}Error: D-Bus debug interface not available${NC:-}"
        echo "Enable it with: gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true"
        exit 1
    fi
}

# Extract a value from GVariant output
# Usage: extract_variant "leakedSignals" "$report"
extract_variant() {
    local key=$1
    local data=$2
    # Extract value and strip quotes
    echo "$data" | grep -oP "'$key': <[^>]+>" | grep -oP "<[^>]+>" | tr -d "<>'" 
}

# =============================================================================
# ResourceTracker Integration
# =============================================================================

# Get resource leak counts
# Returns: "leaked_signals leaked_timers leaked_actors"
get_leak_counts() {
    local report
    report=$(dbus_get_resource_report 2>/dev/null)
    
    local leaked_signals leaked_timers
    leaked_signals=$(extract_variant "leakedSignals" "$report" 2>/dev/null || echo "0")
    leaked_timers=$(extract_variant "leakedTimers" "$report" 2>/dev/null || echo "0")
    
    echo "${leaked_signals:-0} ${leaked_timers:-0}"
}

# Get detailed leak info
# Returns: active signals, active timers, components with leaks
get_resource_summary() {
    local report
    report=$(dbus_get_resource_report 2>/dev/null)
    
    local active_signals active_timers leaked_signals leaked_timers
    active_signals=$(extract_variant "activeSignals" "$report" 2>/dev/null || echo "0")
    active_timers=$(extract_variant "activeTimers" "$report" 2>/dev/null || echo "0")
    leaked_signals=$(extract_variant "leakedSignals" "$report" 2>/dev/null || echo "0")
    leaked_timers=$(extract_variant "leakedTimers" "$report" 2>/dev/null || echo "0")
    
    # Extract components with leaks (array parsing)
    local components_raw
    components_raw=$(echo "$report" | grep -oP "'componentsWithLeaks': <\[.*?\]>" | grep -oP "\[.*?\]" || echo "[]")
    
    echo "Active: signals=${active_signals:-0}, timers=${active_timers:-0}"
    echo "Leaked: signals=${leaked_signals:-0}, timers=${leaked_timers:-0}"
    
    if [ "$components_raw" != "[]" ]; then
        echo "Components with leaks: $components_raw"
    fi
}

# Check for leaks and return status
# Returns: 0 if no leaks, 1 if leaks detected
check_for_leaks() {
    local counts
    counts=$(get_leak_counts)
    
    local leaked_signals leaked_timers
    read leaked_signals leaked_timers <<< "$counts"
    
    local total=$((leaked_signals + leaked_timers))
    if [ "$total" -gt 0 ]; then
        return 1
    fi
    return 0
}

# Print leak report with details
print_leak_report() {
    local context=${1:-"Resource Check"}
    
    local report
    report=$(dbus_get_resource_report 2>/dev/null)
    
    local leaked_signals leaked_timers components
    leaked_signals=$(extract_variant "leakedSignals" "$report" 2>/dev/null || echo "0")
    leaked_timers=$(extract_variant "leakedTimers" "$report" 2>/dev/null || echo "0")
    
    echo "=== $context ==="
    echo "  Leaked signals: ${leaked_signals:-0}"
    echo "  Leaked timers: ${leaked_timers:-0}"
    
    # Get component details if available
    local comp_report
    comp_report=$(dbus_get_component_reports 2>/dev/null)
    if [ -n "$comp_report" ] && [ "$comp_report" != "{}" ]; then
        echo "  Component details:"
        echo "$comp_report" | head -50  # Limit output
    fi
}

# Snapshot resource state (for before/after comparison)
# Stores: active signals, active timers
snapshot_resources() {
    local report
    report=$(dbus_get_resource_report 2>/dev/null)
    
    local active_signals active_timers
    active_signals=$(extract_variant "activeSignals" "$report" 2>/dev/null || echo "0")
    active_timers=$(extract_variant "activeTimers" "$report" 2>/dev/null || echo "0")
    
    echo "${active_signals:-0} ${active_timers:-0}"
}

# Compare resource snapshots
# Usage: compare_snapshots "before_signals before_timers" "after_signals after_timers"
# Returns: "signal_diff timer_diff"
compare_snapshots() {
    local before=$1
    local after=$2
    
    local before_signals before_timers after_signals after_timers
    read before_signals before_timers <<< "$before"
    read after_signals after_timers <<< "$after"
    
    local signal_diff=$((after_signals - before_signals))
    local timer_diff=$((after_timers - before_timers))
    
    echo "$signal_diff $timer_diff"
}
