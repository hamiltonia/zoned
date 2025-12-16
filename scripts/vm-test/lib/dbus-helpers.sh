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
