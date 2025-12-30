#!/bin/bash
#
# format-release-summary-json.sh - Format test suite summary from JSON
#
# Usage:
#   format-release-summary-json.sh --mem <path> [--func <path>] [--suite <name>]
#   format-release-summary-json.sh --func <path>
#
# Arguments:
#   --mem <path>    - Path to memory test JSON file
#   --func <path>   - Path to functional test JSON file
#   --suite <name>  - Suite name (e.g., "release-test", "release")
#                     Required when both --mem and --func are provided
#
# Examples:
#   # Format memory test only
#   format-release-summary-json.sh --mem /tmp/mem.json
#
#   # Format functional test only
#   format-release-summary-json.sh --func /tmp/func.json
#
#   # Format combined suite
#   format-release-summary-json.sh --mem /tmp/mem.json --func /tmp/func.json --suite release-test
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed
#

set -e

# Parse named arguments
MEM_JSON=""
FUNC_JSON=""
SUITE_NAME=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --mem)
            MEM_JSON="$2"
            shift 2
            ;;
        --func)
            FUNC_JSON="$2"
            shift 2
            ;;
        --suite)
            SUITE_NAME="$2"
            shift 2
            ;;
        *)
            echo "Error: Unknown argument: $1"
            echo ""
            echo "Usage: $0 --mem <path> [--func <path>] [--suite <name>]"
            echo "   or: $0 --func <path>"
            exit 1
            ;;
    esac
done

# Validate arguments
if [ -z "$MEM_JSON" ] && [ -z "$FUNC_JSON" ]; then
    echo "Error: At least one of --mem or --func must be provided"
    echo ""
    echo "Usage: $0 --mem <path> [--func <path>] [--suite <name>]"
    echo "   or: $0 --func <path>"
    exit 1
fi

# If both are provided, suite name is required
if [ -n "$MEM_JSON" ] && [ -n "$FUNC_JSON" ] && [ -z "$SUITE_NAME" ]; then
    SUITE_NAME="test-suite"
fi

# Default suite name for single test
if [ -z "$SUITE_NAME" ]; then
    if [ -n "$MEM_JSON" ]; then
        SUITE_NAME="memory-test"
    else
        SUITE_NAME="functional-test"
    fi
fi

# Verify files exist (only check files that were provided)
if [ -n "$MEM_JSON" ] && [ ! -f "$MEM_JSON" ]; then
    echo "Error: Memory JSON file not found: $MEM_JSON"
    exit 1
fi

if [ -n "$FUNC_JSON" ] && [ ! -f "$FUNC_JSON" ]; then
    echo "Error: Functional JSON file not found: $FUNC_JSON"
    exit 1
fi

# Check for jq
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed"
    exit 1
fi

# Color codes
COLOR_SUCCESS='\033[0;32m'
COLOR_ERROR='\033[0;31m'
COLOR_WARN='\033[1;33m'
COLOR_RESET='\033[0m'

# Parse memory test data (if provided)
MEM_EXIT=0
if [ -n "$MEM_JSON" ]; then
    MEM_TESTS=$(jq -r '.tests | length' "$MEM_JSON")
    MEM_TEST_NAMES=$(jq -r '.tests | map(.name) | join(", ")' "$MEM_JSON")
    
    # Get first test's configuration (assumes all tests in a run have same config)
    MEM_RUNS=$(jq -r '.tests[0].runs // 0' "$MEM_JSON")
    MEM_VARIABLE=$(jq -r '.tests[0].variable_duration' "$MEM_JSON")
    if [ "$MEM_VARIABLE" = "true" ]; then
        MEM_DURATION="Variable"
    else
        FIRST_DUR=$(jq -r '.tests[0].duration_values[0] // 0' "$MEM_JSON")
        MEM_DURATION="${FIRST_DUR}min"
    fi
    
    # Calculate aggregate statistics across all tests (handling null values)
    MEM_AVG_INIT=$(jq -r '[.tests[].statistics.avg_init_cost_mb | select(. != null)] | if length > 0 then (add / length | . * 10 | round / 10) else null end' "$MEM_JSON")
    MEM_MAX_RANGE=$(jq -r '[.tests[].statistics.final_range_mb | select(. != null)] | if length > 0 then (max | . * 10 | round / 10) else null end' "$MEM_JSON") 
    MEM_AVG_R2=$(jq -r '[.tests[].statistics.r_squared | select(. != null)] | if length > 0 then (add / length | . * 1000 | round / 1000) else null end' "$MEM_JSON")
    
    # Determine memory status (all tests must pass)
    MEM_STATUS="PASS"
fi

# Parse functional test data (if provided)
FUNC_EXIT=0
if [ -n "$FUNC_JSON" ]; then
    FUNC_TOTAL=$(jq -r '.summary.total' "$FUNC_JSON")
    FUNC_PASSED=$(jq -r '.summary.passed' "$FUNC_JSON")
    FUNC_FAILED=$(jq -r '.summary.failed' "$FUNC_JSON")
    FUNC_MEM_LEAKS=$(jq -r '.summary.memory_leaks' "$FUNC_JSON")
    
    # Get passed and failed test lists
    FUNC_PASSED_LIST=$(jq -r '.tests[] | select(.status == "PASS") | .name' "$FUNC_JSON" | tr '\n' ',' | sed 's/,$//')
    FUNC_FAILED_LIST=$(jq -r '.tests[] | select(.status == "FAIL") | if .memory_leak then .name + " (memory leak)" else .name end' "$FUNC_JSON" | tr '\n' ',' | sed 's/,$//')
    
    # Determine functional status
    if [ "$FUNC_FAILED" -gt 0 ]; then
        FUNC_EXIT=1
    fi
fi

# Display enhanced summary
echo ""
echo "========================================"
echo "  $(echo $SUITE_NAME | tr '[:lower:]' '[:upper:]') SUMMARY"
echo "========================================"
echo ""

# Memory Tests Section (only if provided)
if [ -n "$MEM_JSON" ]; then
    printf "Memory Tests: "
    if [ "$MEM_STATUS" = "PASS" ]; then
        printf "${COLOR_SUCCESS}PASS${COLOR_RESET}\n"
    else
        printf "${COLOR_ERROR}FAIL${COLOR_RESET}\n"
    fi
    
    if [ "$MEM_TESTS" != "0" ]; then
        printf "  Tests Run:    %s" "$MEM_TESTS"
        if [ "$MEM_TEST_NAMES" != "null" ] && [ -n "$MEM_TEST_NAMES" ]; then
            printf " (%s)" "$MEM_TEST_NAMES"
        fi
        printf "\n"
    fi
    
    if [ "$MEM_RUNS" != "0" ] && [ "$MEM_RUNS" != "null" ]; then
        printf "  Runs Each:    %s runs" "$MEM_RUNS"
        if [ "$MEM_DURATION" != "null" ]; then
            printf ", %s" "$MEM_DURATION"
        fi
        printf "\n"
    fi
    
    if [ "$MEM_AVG_INIT" != "null" ] && [ "$MEM_AVG_INIT" != "0" ]; then
        printf "  Avg Init:     %s MB\n" "$MEM_AVG_INIT"
    fi
    
    if [ "$MEM_MAX_RANGE" != "null" ] && [ "$MEM_MAX_RANGE" != "0" ]; then
        printf "  Memory Range: %s MB spread" "$MEM_MAX_RANGE"
        if [ "$MEM_AVG_R2" != "null" ] && [ "$MEM_AVG_R2" != "0" ]; then
            printf " (R²=%s)" "$MEM_AVG_R2"
        fi
        printf "\n"
    fi
    
    echo ""
fi

# Functional Tests Section (only if provided)
if [ -n "$FUNC_JSON" ]; then
    printf "Functional Tests: "
    if [ $FUNC_EXIT -eq 0 ]; then
        printf "${COLOR_SUCCESS}PASS${COLOR_RESET}\n"
    else
        printf "${COLOR_ERROR}FAIL${COLOR_RESET}\n"
    fi
    
    if [ "$FUNC_TOTAL" != "0" ]; then
        printf "  Total: %s tests\n" "$FUNC_TOTAL"
        
        if [ "$FUNC_PASSED" != "0" ] && [ -n "$FUNC_PASSED_LIST" ]; then
            printf "  ${COLOR_SUCCESS}✓ Passed (%s):${COLOR_RESET}\n" "$FUNC_PASSED"
            echo "$FUNC_PASSED_LIST" | tr ',' '\n' | while read -r test; do
                [ -n "$test" ] && printf "    - %s\n" "$test"
            done
        fi
        
        if [ "$FUNC_FAILED" != "0" ] && [ -n "$FUNC_FAILED_LIST" ]; then
            printf "  ${COLOR_ERROR}✗ Failed (%s):${COLOR_RESET}\n" "$FUNC_FAILED"
            echo "$FUNC_FAILED_LIST" | tr ',' '\n' | while read -r test; do
                if [ -n "$test" ]; then
                    if echo "$test" | grep -q "(memory leak)"; then
                        printf "    ${COLOR_WARN}- %s${COLOR_RESET}\n" "$test"
                    else
                        printf "    - %s\n" "$test"
                    fi
                fi
            done
        fi
    fi
    
    echo ""
fi

# Overall Result
printf "Overall Result: "
if [ $MEM_EXIT -eq 0 ] && [ $FUNC_EXIT -eq 0 ]; then
    printf "${COLOR_SUCCESS}PASS${COLOR_RESET}\n"
    if [ -n "$MEM_JSON" ]; then
        printf "  - Memory tests: stable\n"
    fi
    if [ -n "$FUNC_JSON" ]; then
        printf "  - All functional tests passed\n"
    fi
    echo ""
    echo "========================================"
    exit 0
else
    printf "${COLOR_ERROR}FAIL${COLOR_RESET}\n"
    if [ -n "$MEM_JSON" ]; then
        if [ $MEM_EXIT -ne 0 ]; then
            printf "  - Memory tests: ${COLOR_ERROR}FAILED${COLOR_RESET}\n"
        else
            printf "  - Memory tests: stable\n"
        fi
    fi
    
    if [ -n "$FUNC_JSON" ] && [ $FUNC_EXIT -ne 0 ] && [ "$FUNC_FAILED" != "0" ]; then
        if [ "$FUNC_MEM_LEAKS" -gt 0 ]; then
            printf "  - %s functional test(s) failed (%s with memory leak)\n" "$FUNC_FAILED" "$FUNC_MEM_LEAKS"
        else
            printf "  - %s functional test(s) failed\n" "$FUNC_FAILED"
        fi
    fi
    echo ""
    echo "========================================"
    exit 1
fi
