#!/bin/bash
#
# memory-monitor.sh - Continuous memory sampling during tests
#
# This script runs as a background process during test runs, sampling
# memory statistics every N seconds and outputting to CSV for analysis.
#
# Can be run via SSH while tests execute:
#   ssh gnome-vm "cd scripts/vm-test && ./memory-monitor.sh" &
#
# Usage:
#   ./memory-monitor.sh [OPTIONS]
#
# Options:
#   --interval SECONDS   Sampling interval (default: 5)
#   --output FILE        Output CSV file (default: results/memory-<timestamp>.csv)
#   --marker FILE        Test marker file to read current test name
#   --duration SECONDS   Max duration to run (default: unlimited)
#

# Note: Don't use set -e as this is a daemon-style script that handles errors gracefully

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/setup.sh"

# Defaults
SAMPLE_INTERVAL=5
OUTPUT_FILE=""
MARKER_FILE="/tmp/zoned-test-marker"
MAX_DURATION=0  # 0 = unlimited
START_TIME=$(date +%s)

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --interval)
            SAMPLE_INTERVAL="$2"
            shift 2
            ;;
        --output)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        --marker)
            MARKER_FILE="$2"
            shift 2
            ;;
        --duration)
            MAX_DURATION="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Set default output file if not specified
if [ -z "$OUTPUT_FILE" ]; then
    TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
    RESULTS_DIR="$SCRIPT_DIR/../../results"
    mkdir -p "$RESULTS_DIR" 2>/dev/null || true
    OUTPUT_FILE="$RESULTS_DIR/memory-${TIMESTAMP}.csv"
fi

# Temp file for local writes (remote filesystems may not support append reliably)
TMP_FILE="/tmp/zoned-memory-$(date +%s).csv"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Signal handler for graceful shutdown
RUNNING=true
cleanup() {
    RUNNING=false
    echo ""
    echo "Memory monitor stopping..."
    
    # Final sync to results directory
    if [ -f "$TMP_FILE" ]; then
        cp "$TMP_FILE" "$OUTPUT_FILE" 2>/dev/null || true
        echo "Data saved to: $OUTPUT_FILE"
    fi
    
    exit 0
}
trap cleanup INT TERM

# Get GNOME Shell RSS from ps (fallback when D-Bus unavailable)
get_shell_rss_kb() {
    ps -o rss= -p $(pgrep -f gnome-shell | head -1) 2>/dev/null | tr -d ' ' || echo "0"
}

# Get current test name from marker file
get_current_test() {
    if [ -f "$MARKER_FILE" ]; then
        cat "$MARKER_FILE" 2>/dev/null || echo "unknown"
    else
        echo "idle"
    fi
}

# Sample all memory metrics
# Returns CSV row: timestamp,test_name,shell_rss,gjs_rss,gjs_vm,gjs_shared,gjs_data,active_signals,active_timers,active_actors,leaked_signals,leaked_timers
sample_metrics() {
    local timestamp=$(date +%s)
    local test_name=$(get_current_test)
    
    # Get GNOME Shell RSS from ps
    local shell_rss=$(get_shell_rss_kb)
    
    # Initialize defaults
    local gjs_rss=0 gjs_vm=0 gjs_shared=0 gjs_data=0
    local active_signals=0 active_timers=0 active_actors=0
    local leaked_signals=0 leaked_timers=0
    
    # Try to get detailed metrics via D-Bus (may fail if extension not ready)
    if dbus_interface_available 2>/dev/null; then
        # GJS memory from extension
        local gjs_mem
        gjs_mem=$(dbus_get_gjs_memory 2>/dev/null)
        if [ -n "$gjs_mem" ]; then
            read gjs_rss gjs_vm gjs_shared gjs_data <<< "$gjs_mem"
        fi
        
        # Resource tracker stats
        local report
        report=$(dbus_get_resource_report 2>/dev/null)
        if [ -n "$report" ]; then
            active_signals=$(extract_variant "activeSignals" "$report" 2>/dev/null || echo "0")
            active_timers=$(extract_variant "activeTimers" "$report" 2>/dev/null || echo "0")
            active_actors=$(extract_variant "activeActors" "$report" 2>/dev/null || echo "0")
            leaked_signals=$(extract_variant "leakedSignals" "$report" 2>/dev/null || echo "0")
            leaked_timers=$(extract_variant "leakedTimers" "$report" 2>/dev/null || echo "0")
        fi
    fi
    
    # Output CSV row
    echo "$timestamp,$test_name,$shell_rss,$gjs_rss,$gjs_vm,$gjs_shared,$gjs_data,$active_signals,$active_timers,$active_actors,$leaked_signals,$leaked_timers"
}

# Print status line
print_status() {
    local timestamp=$1
    local test_name=$2
    local shell_rss=$3
    local gjs_rss=$4
    local leaked_signals=$5
    local leaked_timers=$6
    
    local shell_mb=$((shell_rss / 1024))
    local gjs_mb=$((gjs_rss / 1024))
    local elapsed=$((timestamp - START_TIME))
    
    # Format leak indicators
    local leak_info=""
    if [ "$leaked_signals" -gt 0 ] || [ "$leaked_timers" -gt 0 ]; then
        leak_info="${YELLOW} [leaks: sig=$leaked_signals tim=$leaked_timers]${NC}"
    fi
    
    printf "\r[%5ds] %-20s Shell: %4dMB  GJS: %4dMB%b    " \
        "$elapsed" "$test_name" "$shell_mb" "$gjs_mb" "$leak_info"
}

# Main monitoring loop
echo "Memory Monitor Started"
echo "======================"
echo "Interval: ${SAMPLE_INTERVAL}s"
echo "Output:   $OUTPUT_FILE"
echo "Marker:   $MARKER_FILE"
if [ "$MAX_DURATION" -gt 0 ]; then
    echo "Duration: ${MAX_DURATION}s"
fi
echo ""

# Quick check for D-Bus (non-blocking - we'll continue with limited metrics if not available)
if dbus_interface_available 2>/dev/null; then
    echo "D-Bus debug interface available"
else
    echo -e "${YELLOW}D-Bus interface not yet available - will use limited metrics${NC}"
    echo "Enable with: gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true"
fi

# Write CSV header
echo "timestamp,test_name,shell_rss_kb,gjs_rss_kb,gjs_vm_kb,gjs_shared_kb,gjs_data_kb,active_signals,active_timers,active_actors,leaked_signals,leaked_timers" > "$TMP_FILE"
cp "$TMP_FILE" "$OUTPUT_FILE" 2>/dev/null || true

echo ""
echo "Sampling... (Ctrl+C to stop)"
echo ""

sample_count=0
while $RUNNING; do
    # Check duration limit
    if [ "$MAX_DURATION" -gt 0 ]; then
        elapsed=$(($(date +%s) - START_TIME))
        if [ $elapsed -ge $MAX_DURATION ]; then
            echo ""
            echo "Max duration reached (${MAX_DURATION}s)"
            break
        fi
    fi
    
    # Sample metrics
    row=$(sample_metrics)
    
    # Append to temp file
    echo "$row" >> "$TMP_FILE"
    
    # Parse row for status display
    IFS=',' read -r ts test shell_rss gjs_rss gjs_vm gjs_shared gjs_data \
        act_sig act_tim act_act leak_sig leak_tim <<< "$row"
    
    print_status "$ts" "$test" "$shell_rss" "$gjs_rss" "$leak_sig" "$leak_tim"
    
    sample_count=$((sample_count + 1))
    
    # Periodically sync to output file (every 10 samples)
    if [ $((sample_count % 10)) -eq 0 ]; then
        cp "$TMP_FILE" "$OUTPUT_FILE" 2>/dev/null || true
    fi
    
    sleep "$SAMPLE_INTERVAL"
done

# Final sync
cp "$TMP_FILE" "$OUTPUT_FILE" 2>/dev/null || true

echo ""
echo ""
echo "Memory monitor complete."
echo "Samples: $sample_count"
echo "Output:  $OUTPUT_FILE"
