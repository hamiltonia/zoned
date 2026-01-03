# Exception Monitoring and Auto-Cancellation Specification

**Status**: Planning  
**Created**: 2026-01-01  
**Target**: Future enhancement after current work

## Overview

This specification defines a system to monitor GNOME Shell logs during test execution, detect JavaScript exceptions and critical errors, and automatically cancel test runs when problems are detected. This will improve test reliability and provide faster feedback when extension code has runtime issues.

## Motivation

Currently, test runs may complete "successfully" even when JavaScript exceptions occur during execution. These hidden failures can:
- Produce invalid test results (especially in memory tests)
- Waste time by continuing tests after a critical failure
- Make debugging harder by burying exception context in logs
- Miss runtime errors that only occur under specific test conditions

## Goals

1. **Real-time exception detection** during all test types (mem, func, release)
2. **Automatic test cancellation** on critical exceptions
3. **Exception context preservation** for debugging
4. **Configurable strictness** (fail-fast vs monitor-only modes)
5. **Pattern-based classification** (critical vs warning vs noise)
6. **Minimal performance overhead** during test execution

## Current State

### Existing Log Monitoring
- `scripts/vm-guest/auto-log-watcher.sh` - Monitors and streams logs but doesn't analyze them
- Tests use `journalctl` but only for manual log review
- No systematic exception detection during automated test runs

### Existing Error Handling
- Basic error checking via exit codes
- Some tests check D-Bus interface availability
- Pre-flight verification (`verify-extension-init.sh`)
- No runtime exception monitoring

## Architecture

### Components

#### 1. Log Monitor Daemon (`scripts/tests/log-monitor.sh`)

Background process that:
- Monitors `journalctl -f /usr/bin/gnome-shell` in real-time
- Applies pattern matching to detect exceptions
- Classifies exceptions by severity
- Signals parent test process on critical errors
- Writes exception details to shared temp file

**Key features**:
- Non-blocking background execution
- Minimal CPU overhead (grep-based filtering)
- Graceful cleanup on test completion
- Process isolation (won't crash if test crashes)

#### 2. Exception Pattern Database

Configuration file defining patterns to match:

```bash
# Critical patterns (auto-cancel test)
CRITICAL_PATTERNS=(
    "JS ERROR:.*zoned"              # JavaScript errors in extension
    "stack trace"                    # Stack traces (usually unhandled)
    "Segmentation fault"             # Crashes
    "Exception in.*zoned"            # Unhandled exceptions
    "Gjs-CRITICAL.*zoned"           # Critical GJS errors
)

# Warning patterns (log but continue)
WARNING_PATTERNS=(
    "Gjs-WARNING:.*zoned"           # GJS warnings
    "JS WARNING:.*zoned"            # JS warnings (deprecations)
)

# Whitelist patterns (ignore)
WHITELIST_PATTERNS=(
    "Extension zoned had error:.*Trying to re-enable"  # Expected during restarts
    "Cannot access property.*of null"                  # Known false positive
)
```

#### 3. Test Script Integration

Modify existing test runners to:
1. Start log monitor before tests begin
2. Set up signal handlers for exception notifications
3. Check for exceptions between test steps
4. Clean up monitor on exit
5. Report exception context in results

**Integration points**:
- `scripts/tests/test-func-runner.sh` - Functional tests
- `scripts/tests/test-mem-with-restarts` - Memory tests
- `scripts/run-tests` - Release suite orchestration

#### 4. Exception Storage and Reporting

Store detected exceptions with context:
```json
{
  "timestamp": "2026-01-01T15:10:23Z",
  "test_name": "LayoutSwitcher",
  "test_type": "functional",
  "severity": "CRITICAL",
  "pattern_matched": "JS ERROR:.*zoned",
  "message": "JS ERROR: TypeError: Cannot read property 'x' of undefined",
  "stack_trace": "@/home/.../layoutSwitcher.js:142:15\n...",
  "context": "During test: test-func-layout-switching.sh",
  "action_taken": "Test cancelled"
}
```

## Implementation Details

### Log Monitor Script

```bash
#!/bin/bash
# scripts/tests/log-monitor.sh
#
# Background log monitor for exception detection during tests
#
# Usage:
#   log-monitor.sh <parent_pid> <exception_file> [--strict|--monitor-only]
#
# Signals parent process via SIGUSR1 on critical exception detection

PARENT_PID=$1
EXCEPTION_FILE=$2
MODE=${3:---strict}  # --strict or --monitor-only

# Load pattern database
source "$(dirname "$0")/lib/exception-patterns.sh"

# Monitor journalctl in background
journalctl -f /usr/bin/gnome-shell 2>/dev/null | \
while IFS= read -r line; do
    # Check whitelist first (skip known false positives)
    for pattern in "${WHITELIST_PATTERNS[@]}"; do
        if [[ "$line" =~ $pattern ]]; then
            continue 2  # Skip this line
        fi
    done
    
    # Check critical patterns
    for pattern in "${CRITICAL_PATTERNS[@]}"; do
        if [[ "$line" =~ $pattern ]]; then
            # Critical exception detected
            echo "CRITICAL|$(date -u +"%Y-%m-%dT%H:%M:%SZ")|$line" >> "$EXCEPTION_FILE"
            
            if [ "$MODE" = "--strict" ]; then
                # Signal parent to cancel test
                kill -SIGUSR1 "$PARENT_PID" 2>/dev/null || true
            fi
            break
        fi
    done
    
    # Check warning patterns
    for pattern in "${WARNING_PATTERNS[@]}"; do
        if [[ "$line" =~ $pattern ]]; then
            echo "WARNING|$(date -u +"%Y-%m-%dT%H:%M:%SZ")|$line" >> "$EXCEPTION_FILE"
            break
        fi
    done
done
```

### Test Runner Integration

Example modification to `test-func-runner.sh`:

```bash
# Exception handling setup
EXCEPTION_FILE=$(mktemp)
MONITOR_PID=""

# Signal handler for exception notification
handle_exception() {
    echo ""
    echo "========================================="
    echo "  EXCEPTION DETECTED - CANCELLING TEST"
    echo "========================================="
    
    # Read exception from file
    if [ -f "$EXCEPTION_FILE" ]; then
        tail -n 5 "$EXCEPTION_FILE" | while IFS='|' read -r severity timestamp message; do
            echo "[$severity] $timestamp"
            echo "$message"
        done
    fi
    
    # Cleanup
    cleanup_exception_monitor
    
    # Mark test as failed
    FAILED=$((FAILED + 1))
    FAILED_TESTS+=("$CURRENT_TEST (exception detected)")
    
    exit 3  # Special exit code for exception-cancelled
}

# Start log monitor
start_exception_monitor() {
    local mode="${1:---strict}"
    
    "$SCRIPT_DIR/log-monitor.sh" $$ "$EXCEPTION_FILE" "$mode" &
    MONITOR_PID=$!
    
    # Set up signal handler
    trap handle_exception SIGUSR1
}

# Stop log monitor
cleanup_exception_monitor() {
    if [ -n "$MONITOR_PID" ]; then
        kill "$MONITOR_PID" 2>/dev/null || true
        wait "$MONITOR_PID" 2>/dev/null || true
    fi
    rm -f "$EXCEPTION_FILE"
}

# Use in test runner
start_exception_monitor --strict

# ... run tests ...

cleanup_exception_monitor
```

## Configuration Options

### Command-Line Flags

**For all test scripts**:
- `--fail-on-exception` - Cancel test immediately on any critical exception (strict mode)
- `--warn-on-exception` - Log exceptions but continue test (monitor-only mode)
- `--ignore-exceptions` - Disable exception monitoring entirely
- `--exception-whitelist FILE` - Load additional whitelist patterns from file
- `--save-exceptions DIR` - Save exception logs to directory for later analysis

### Environment Variables

```bash
# Strictness level
ZONED_TEST_EXCEPTION_MODE="strict|monitor|ignore"

# Pattern database path
ZONED_TEST_EXCEPTION_PATTERNS="/path/to/patterns.sh"

# Exception storage
ZONED_TEST_EXCEPTION_DIR="/path/to/save/exceptions"
```

## Testing Strategy

### Phase 1: Validation with Known Failures
1. Create intentional exceptions in test extension
2. Verify detection and cancellation works
3. Test pattern matching accuracy (false positive rate)

### Phase 2: Integration Testing
1. Run full test suite with monitor enabled
2. Verify no false positives on clean runs
3. Test signal handling and cleanup

### Phase 3: Tuning
1. Adjust patterns based on real test runs
2. Build whitelist for known false positives
3. Optimize performance overhead

## Success Metrics

1. **Detection rate**: >95% of real exceptions caught
2. **False positive rate**: <5% (clean tests don't trigger)
3. **Performance overhead**: <5% increase in test duration
4. **Time to detection**: Exceptions caught within 1 second
5. **Cleanup reliability**: 100% of monitors cleaned up properly

## Migration Path

### Stage 1: Opt-in (2-4 weeks testing)
- Feature available via `--fail-on-exception` flag
- Default: disabled
- Gather data on pattern accuracy

### Stage 2: Monitor-only default (2 weeks)
- Default: `--warn-on-exception` (log but don't cancel)
- Users can opt into strict mode
- Refine pattern database

### Stage 3: Strict mode default
- Default: `--fail-on-exception` (auto-cancel)
- Users can opt out with `--ignore-exceptions`
- Feature fully integrated

## Implementation Checklist

### Core Components
- [ ] Create `scripts/tests/log-monitor.sh` - Background monitoring daemon
- [ ] Create `scripts/tests/lib/exception-patterns.sh` - Pattern database
- [ ] Create `scripts/tests/lib/exception-handler.sh` - Shared handler functions

### Test Script Integration
- [ ] Modify `scripts/tests/test-func-runner.sh` - Add exception monitoring
- [ ] Modify `scripts/tests/test-mem-with-restarts` - Add exception monitoring
- [ ] Modify `scripts/run-tests` - Coordinate exception handling across suites

### Reporting
- [ ] Extend JSON output format to include exception data
- [ ] Update `format-release-summary-json.sh` to display exceptions
- [ ] Add exception section to test result notifications

### Documentation
- [ ] Update `scripts/tests/README.md` with exception monitoring docs
- [ ] Add examples of using different modes
- [ ] Document pattern customization

### Testing & Validation
- [ ] Create test cases with intentional exceptions
- [ ] Validate pattern matching accuracy
- [ ] Test signal handling and cleanup
- [ ] Performance benchmarking

## Future Enhancements

1. **Pattern learning**: Automatically suggest new patterns based on observed logs
2. **Exception aggregation**: Group similar exceptions across multiple runs
3. **Historical tracking**: Track exception trends over time
4. **Smart retry**: Automatically retry on transient exceptions (e.g., timing issues)
5. **Integration with CI**: Report exceptions to CI system metadata
6. **Web dashboard**: Visualize exception patterns and trends

## Open Questions

1. Should memory tests retry a run if an exception occurs, or abort entirely?
2. How should exceptions during GNOME Shell restart be handled (expected vs unexpected)?
3. Should there be different pattern sets for different test types?
4. What's the right balance between sensitivity and false positives?
5. Should exceptions be reported to a central service for pattern learning?

## References

- Current log watcher: `scripts/vm-guest/auto-log-watcher.sh`
- Test runner: `scripts/tests/test-func-runner.sh`
- Memory test: `scripts/tests/test-mem-with-restarts`
- Pre-flight verification: `scripts/tests/verify-extension-init.sh`
