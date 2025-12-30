#!/bin/bash
#
# test-func-runner.sh - Functional test suite runner
#
# Runs all functional tests sequentially with proper Ctrl+C handling.
# This runner tracks active child processes and ensures clean interruption.
#
# Usage:
#   ./test-func-runner.sh              # Interactive mode
#   ./test-func-runner.sh --all        # Run all tests
#   ./test-func-runner.sh --test 1     # Run specific test (1-7)
#
# Results Rollup:
#   Set TEST_RESULTS_FILE env var to write results for aggregation.
#   Format: test_name|status|pass|fail|warn|mem_diff|duration|mem_status|passed_tests|failed_tests
#   Example: functional-suite|PASS|6|1|0|0|45|MEM_LEAK|test1,test2|test3 (memory leak)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CURRENT_TEST=""
FAILED=0
TOTAL=0
declare -a PASSED_TESTS
declare -a FAILED_TESTS

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
ORANGE='\033[38;5;214m'
NC='\033[0m' # No Color

# Results file for rollup (shared with other test scripts)
TEST_RESULTS_FILE="${TEST_RESULTS_FILE:-}"
START_TIME=$(date +%s)

# Cleanup handler for Ctrl+C
cleanup() {
    echo ""
    echo "Test suite interrupted"
    if [ -n "$CURRENT_TEST" ]; then
        echo "Interrupted during: $CURRENT_TEST"
    fi
    exit 130
}

trap cleanup INT TERM

# Parse command line arguments
test_choice=""
if [ "$1" == "--all" ]; then
    test_choice=8
elif [ "$1" == "--test" ]; then
    test_choice="$2"
    if [ -z "$test_choice" ] || [ "$test_choice" -lt 1 ] || [ "$test_choice" -gt 7 ]; then
        echo "Error: --test requires a number 1-7"
        exit 1
    fi
fi

# If no arguments and stdin is not a TTY, default to all tests
if [ -z "$test_choice" ] && [ ! -t 0 ]; then
    test_choice=8
fi

# If still no choice, show interactive menu
if [ -z "$test_choice" ]; then
    echo "========================================"
    echo "  Functional Test Suite"
    echo "========================================"
    echo ""
    echo "Select tests to run:"
    echo "  1) Edge Cases"
    echo "  2) GSettings"
    echo "  3) Layout Switching"
    echo "  4) Multi-Monitor"
    echo "  5) Window Movement"
    echo "  6) Workspace"
    echo "  7) Zone Cycling"
    echo "  A) All tests"
    echo ""
    read -p "Choice [1-7, A]: " test_choice
fi

# Build test list based on selection
case $test_choice in
    1) FUNC_TESTS=("test-func-edge-cases.sh") ;;
    2) FUNC_TESTS=("test-func-gsettings.sh") ;;
    3) FUNC_TESTS=("test-func-layout-switching.sh") ;;
    4) FUNC_TESTS=("test-func-multi-monitor.sh") ;;
    5) FUNC_TESTS=("test-func-window-movement.sh") ;;
    6) FUNC_TESTS=("test-func-workspace.sh") ;;
    7) FUNC_TESTS=("test-func-zone-cycling.sh") ;;
    A|a|8) FUNC_TESTS=(
           "test-func-edge-cases.sh"
           "test-func-gsettings.sh"
           "test-func-layout-switching.sh"
           "test-func-multi-monitor.sh"
           "test-func-window-movement.sh"
           "test-func-workspace.sh"
           "test-func-zone-cycling.sh"
       ) ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

# Display configuration
echo ""
echo "Configuration:"
echo "  Tests: ${#FUNC_TESTS[@]} test(s) selected"
if [ ${#FUNC_TESTS[@]} -eq 1 ]; then
    echo "  Test: $(basename "${FUNC_TESTS[0]}" .sh | sed 's/test-func-//')"
fi
echo ""

# Only prompt for confirmation in interactive mode
if [ -t 0 ] && [ "$1" != "--all" ] && [ "$1" != "--test" ]; then
    echo "Before starting, ensure:"
    echo "  1. You have deployed latest code"
    echo ""
    read -p "Press Enter to confirm and start testing..."
fi

echo ""
echo "========================================"
echo "  PRE-FLIGHT VERIFICATION"
echo "========================================"
echo "  Testing extension initialization..."
echo ""

# Verify extension is properly initialized before running tests
if ! "$SCRIPT_DIR/verify-extension-init.sh" 10; then
    echo ""
    echo "ERROR: Extension failed initialization verification"
    echo "Cannot proceed with functional tests."
    echo ""
    exit 1
fi

echo "  ✓ Pre-flight verification passed"
echo "========================================"
echo ""

echo "Running ${#FUNC_TESTS[@]} functional tests..."
echo ""

# Run each test (disable set -e for the entire loop to handle test failures)
set +e
for test in "${FUNC_TESTS[@]}"; do
    TOTAL=$((TOTAL + 1))
    CURRENT_TEST="$test"
    
    # Get test name without prefix/suffix for display
    test_name=$(basename "$test" .sh | sed 's/test-func-//')
    
    echo "[$TOTAL/${#FUNC_TESTS[@]}] $test"
    
    # Run test in foreground (trap will kill whole script on Ctrl+C)
    "$SCRIPT_DIR/$test"
    TEST_EXIT=$?
    
    # Check exit code: 0=pass, 1=fail, 2=memory leak
    if [ $TEST_EXIT -eq 0 ]; then
        echo "✓ PASS"
        echo ""
        PASSED_TESTS+=("$test_name")
    elif [ $TEST_EXIT -eq 2 ]; then
        echo "✗ FAIL (memory leak detected)"
        echo "  Note: Memory leak detected but continuing with remaining tests"
        echo ""
        FAILED_TESTS+=("$test_name (memory leak)")
        FAILED=$((FAILED + 1))
    else
        echo "✗ FAIL"
        echo ""
        FAILED_TESTS+=("$test_name")
        FAILED=$((FAILED + 1))
    fi
done
set -e

# Display detailed summary
echo "========================================"
echo "  Functional Tests Summary"
echo "========================================"
echo ""
echo "Total tests run: $TOTAL"
echo "Passed: ${#PASSED_TESTS[@]}"
echo "Failed: $FAILED"
echo ""

if [ ${#PASSED_TESTS[@]} -gt 0 ]; then
    echo "Passed tests:"
    for test_name in "${PASSED_TESTS[@]}"; do
        echo -e "  ${GREEN}✓ $test_name${NC}"
    done
    echo ""
fi

if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
    echo "Failed tests:"
    for test_name in "${FAILED_TESTS[@]}"; do
        # Color based on failure type
        if [[ "$test_name" == *"(memory leak)"* ]]; then
            echo -e "  ${ORANGE}✗ $test_name${NC}"
        else
            echo -e "  ${RED}✗ $test_name${NC}"
        fi
    done
    echo ""
fi

echo "========================================"

# Write results to shared file for rollup reporting (if TEST_RESULTS_FILE is set)
if [ -n "$TEST_RESULTS_FILE" ]; then
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    
    # Determine overall status and memory status
    if [ $FAILED -eq 0 ]; then
        STATUS="PASS"
    else
        STATUS="FAIL"
    fi
    
    # Check if any failures were memory leaks
    MEM_STATUS=""
    for test_name in "${FAILED_TESTS[@]}"; do
        if [[ "$test_name" == *"(memory leak)"* ]]; then
            MEM_STATUS="MEM_LEAK"
            break
        fi
    done
    
    # Build test details (passed and failed test names)
    PASSED_LIST=$(IFS=,; echo "${PASSED_TESTS[*]}")
    FAILED_LIST=$(IFS=,; echo "${FAILED_TESTS[*]}")
    
    # Format: test_name|status|pass_count|fail_count|warn|mem_diff|duration|mem_status|passed_tests|failed_tests
    # Extended format for suite-level results
    echo "functional-suite|${STATUS}|${#PASSED_TESTS[@]}|${FAILED}|0|0|${DURATION}|${MEM_STATUS}|${PASSED_LIST}|${FAILED_LIST}" >> "$TEST_RESULTS_FILE"
fi

if [ $FAILED -eq 0 ]; then
    echo -e "  ${GREEN}ALL TESTS PASSED${NC}"
    echo "========================================"
    exit 0
else
    echo -e "  ${RED}$FAILED OF $TOTAL TESTS FAILED${NC}"
    echo "========================================"
    exit 1
fi
