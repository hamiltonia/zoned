# Test Infrastructure Enhancement Plan

**Date:** 2025-12-29  
**Status:** In Progress  
**Branch:** fix/vm-test-cleanup  
**Goal:** Enhance test infrastructure with better coverage, automation, and reporting

---

  RELEASE TEST SUITE SUMMARY
  Memory Tests:     PASS (R²=0.972, stable)
  Functional Tests: 5/6 PASS, 1/6 FAIL
  
  Overall Result:   FAIL (1 test failed)
```

**Implementation:**
- Capture memory test exit code and output
- Capture functional test counts (passed/failed)
- Generate combined summary before final exit
- Use color coding for visual clarity
## Quick Wins (High Priority - This PR)

### 1. Add Release Suite Summary Rollup

**Status:** ✅ COMPLETED  
**Complexity:** Medium (was more complex than initially estimated)  
**Time Estimate:** 15 minutes (actual: ~2 hours with enhanced features)

**Problem:**
The `run-tests release` command runs both memory and functional tests but doesn't provide a combined summary. Users see separate outputs but no rollup showing overall results. Initial implementation had broken parsing that showed incorrect results.

**Solution Implemented:**
Enhanced summary section in `scripts/run-tests` for the release suite with:
- Proper parsing of memory test metrics (test count, runs, duration, avg init cost, memory range, R²)
- Accurate functional test counting (total/passed/failed with test names)
- Color-coded output (green=pass, red=fail, yellow=warn, orange=memory leak)
- Detailed breakdown showing individual test names in each category
- Proper exit code handling (fails when tests actually fail)

**Example Output:**
```
  RELEASE-TEST SUITE SUMMARY

Memory Tests: PASS
  Tests Run:    3 (Enable/Disable, LayoutSwitcher, Zone Overlay)
  Runs Each:    2 runs, Variable (1, 2 minutes)
  Avg Init:     2.3 MB
  Memory Range: 2.1 MB spread (R²=0.95)

Functional Tests: FAIL
  Total: 7 tests
  ✓ Passed (4):
    - layout-switching
    - multi-monitor
    - workspace
    - zone-cycling
  ✗ Failed (3):
    - edge-cases (memory leak)
    - gsettings
    - window-movement

Overall Result: FAIL
  - Memory tests: stable
  - 3 functional test(s) failed (1 with memory leak)

```
========================================
  RELEASE TEST SUITE SUMMARY
========================================
  Memory Tests:     PASS (R²=0.972, stable)
  Functional Tests: 5/6 PASS, 1/6 FAIL
  
  Overall Result:   FAIL (1 test failed)
========================================
```

**Implementation:**
- Capture memory test exit code and output
- Capture functional test counts (passed/failed)
- Generate combined summary before final exit
- Use color coding for visual clarity

---

### 2. Refactor Test Output to Use Structured Data (JSON)

**Status:** Not Started  
**Complexity:** Medium  
**Time Estimate:** 3-4 hours  
**Priority:** HIGH (architectural improvement)

**Problem:**
Current architecture is backwards:
- Tests write human-readable text output
- Formatters parse text back into data (fragile, error-prone)
- Flow: `data → text → parse → data → text` (inefficient)
- Cannot reformat results without re-running expensive tests
- Parsing breaks when output format changes

**Solution:**
Separate data generation from presentation:
- Tests write structured data (JSON) to files
- Formatters read JSON and generate display output
- Flow: `data → JSON file → format → display` (clean)

**Benefits:**
- **Reusability:** Format same data multiple ways (console, CI, graphs)
- **Persistence:** Preserve test data, analyze later
- **Flexibility:** Change formatting without touching test logic
- **Testability:** Test formatters with static data (no 20-min test runs)
- **--no-cleanup synergy:** Preserved files can be reformatted indefinitely

**Implementation:**

**A. Memory Test JSON Schema (`/tmp/mem-results.json`):**
```json
{
  "schema_version": "1.0",
  "timestamp": "2025-12-30T09:30:00Z",
  "preset": "test",
  "tests": [
    {
      "name": "Enable/Disable",
      "runs": 3,
      "variable_duration": true,
      "durations": [1, 2, 3],
      "delay_ms": 100,
      "results": [
        {
          "run": 1,
          "duration_min": 1,
          "start_mem_mb": 145.2,
          "final_mem_mb": 147.5,
          "init_cost_mb": 2.3,
          "deviation_mb": 0.0,
          "cycles": 120
        }
      ],
      "statistics": {
        "avg_init_cost_mb": 2.3,
        "final_range_mb": 0.8,
        "r_squared": 0.972,
        "result": "PASS"
      }
    }
  ]
}
```

**B. Functional Test JSON Schema (`/tmp/func-results.json`):**
```json
{
  "schema_version": "1.0",
  "timestamp": "2025-12-30T09:45:00Z",
  "tests": [
    {
      "name": "layout-switching",
      "result": "PASS",
      "duration_sec": 45,
      "cycles": 10,
      "errors": []
    },
    {
      "name": "edge-cases",
      "result": "FAIL",
      "duration_sec": 120,
      "cycles": 500,
      "errors": ["Memory leak detected (correlation analysis)"]
    }
  ],
  "summary": {
    "total": 6,
    "passed": 5,
    "failed": 1,
    "skipped": 0
  }
}
```

**C. Changes Required:**
1. **test-mem-with-restarts:** Add JSON output alongside console output
2. **test-func-runner.sh:** Write JSON after all tests complete
3. **format-release-summary.sh:** Read JSON instead of parsing text
4. **run-tests:** Use JSON-based formatter, keep text for debugging

**Migration Strategy:**
- Phase 1: Add JSON output, keep text parsing (both work)
- Phase 2: Switch formatter to JSON, validate output matches
- Phase 3: Remove text parsing code

**Trade-offs:**
- Adds ~100 lines of JSON generation code
- Slight performance overhead (negligible)
- Requires jq for JSON parsing (already available)
- **Worth it:** Massively improves maintainability and flexibility

---

### 3. Fix Memory Test BATCH SUMMARY Output

**Status:** ⚠️ BLOCKED - Needs Investigation  
**Complexity:** Medium  
**Time Estimate:** 2-3 hours (debug + fix)  
**Priority:** HIGH (release summary depends on this)

**Problem:**
When running multiple memory tests (e.g., `--preset test` runs 3 tests), the BATCH SUMMARY section at the end should display aggregate statistics for all tests, but the values are empty:

```
Avg Init:      MB          <- Should be: 2.3 MB
Memory Range:  MB spread (R²=)   <- Should be: 2.1 MB spread (R²=0.95)
```

**Root Cause Analysis (Incomplete):**

The BATCH SUMMARY code was initially placed in the wrong location (at script start, line ~118) where batch arrays were empty. This was moved to the correct location (after final statistics, line ~780), but values are still not populating.

**Current Implementation:**
File: `scripts/tests/test-mem-with-restarts`

1. **Batch arrays declared** (line ~104):
   ```bash
   declare -a BATCH_TEST_NAMES
   declare -a BATCH_AVG_INIT_COSTS
   declare -a BATCH_FINAL_RANGES
   declare -a BATCH_R_SQUARED
   ```

2. **Batch stats stored per test** (lines ~520-575, inside multi-test loop):
   ```bash
   BATCH_TEST_NAMES+=("$TEST_NAME")
   # Calculate avg init cost from NUMERIC_INIT_COSTS
   # Calculate final range from NUMERIC_FINAL_MEM
   # Store r_squared value
   ```

3. **BATCH SUMMARY output** (lines ~780-810, after final test):
   ```bash
   if [ ${#BATCH_TEST_NAMES[@]} -gt 0 ]; then
       echo "BATCH SUMMARY (All Tests)"
       for i in $(seq 0 $((${#BATCH_TEST_NAMES[@]} - 1))); do
           echo "Test: ${BATCH_TEST_NAMES[$i]}"
           printf "Average init cost: %s MB\n" "${BATCH_AVG_INIT_COSTS[$i]}"
           # etc...
       done
   fi
   ```

**Known Issues:**

1. **Variable Scope Problem:** The batch statistics calculation (lines 520-575) attempts to use:
   - `NUMERIC_INIT_COSTS` array
   - `NUMERIC_FINAL_MEM` array  
   - `r_squared` variable
   
   But these are calculated LATER in the final statistics section (lines 650-750). When running test #1 and #2, these variables may not exist or may be from the wrong test context.

2. **Timing Issue:** The code flow is:
   - Test 1 runs → tries to store batch stats (but source vars not calculated yet?)
   - Test 2 runs → tries to store batch stats (but source vars from Test 1?)
   - Test 3 runs → final stats calculated → BATCH SUMMARY outputs

3. **Array Reset Issue:** Lines 590-600 reset the numeric arrays between tests:
   ```bash
   NUMERIC_INIT_COSTS=()
   NUMERIC_FINAL_MEM=()
   # etc...
   ```
   This may be clearing data before it's stored in batch arrays.

**Investigation Needed:**

1. **Read `/tmp/mem-output.txt`** (saved by `--no-cleanup` flag):
   - Check if BATCH SUMMARY section exists in raw output
   - See what values (if any) are actually in batch arrays
   - Determine if arrays are empty or contain wrong values

2. **Trace variable lifecycle:**
   - When are `NUMERIC_INIT_COSTS` and `NUMERIC_FINAL_MEM` arrays populated?
   - When is batch statistics calculation code executed?
   - Are the source arrays available at that time?

3. **Test single vs multiple:**
   - Run single test (should have no BATCH SUMMARY) - verify works
   - Run 2 tests - check if both appear in BATCH SUMMARY
   - Run 3 tests - check current output

**Possible Solutions:**

**Option A: Calculate batch stats AFTER final statistics**
- Move batch calculation code (lines 520-575) to run AFTER the numeric arrays are populated
- Calculate all batch stats at the very end before output
- Store test names during execution, calculate stats later

**Option B: Calculate and store immediately**
- During each test's final statistics section, calculate the values
- Store them directly in batch arrays at that moment
- Don't rely on arrays that get reset

**Option C: Use formatted output strings (cleaner)**
- When final statistics are calculated and displayed, also capture the formatted strings
- Store: `"2.3 MB"`, `"2.1 MB spread (R²=0.95)"` as strings
- BATCH SUMMARY just echoes the stored strings (no recalculation)

**Test Files for Debugging:**
- Memory test output: `/tmp/mem-output.txt` (from `--no-cleanup`)
- Script: `scripts/tests/test-mem-with-restarts`
- Formatter: `scripts/tests/lib/format-release-summary.sh`

**Workaround:**
The JSON output solution (#2 above) would completely avoid this issue by separating data generation from formatting.

**Next Steps for Implementer:**
1. Examine `/tmp/mem-output.txt` to see actual BATCH SUMMARY content
2. Add debug echo statements to trace when arrays are populated
3. Determine if issue is: empty arrays, wrong values, or timing
4. Implement fix based on root cause
5. Test with 1, 2, and 3 test runs to verify

---

### 4. Fix Test Window D-Bus Issue

**Status:** Not Started  
**Complexity:** Medium  
**Time Estimate:** 1-2 hours (investigation + fix)

**Problem:**
GTK4 test window (`lib/test-window.py`) fails to start in VM environment, causing:
- `test-func-window-movement.sh` to fail
- `test-func-workspace.sh` to skip window movement test

Error: "Test window D-Bus interface not available"

**Investigation Needed:**
1. Check GTK4 installation in VM
2. Verify D-Bus session bus configuration
3. Test python script manually in VM
4. Check for missing dependencies

**Possible Solutions:**
- Install missing GTK4/python dependencies
- Fix D-Bus session bus permissions
- Adjust test window initialization timing
- Add better error diagnostics

---

## Memory Testing Enhancements

### 3. ~~Add Memory Test for Settings Dialog~~ (REMOVED)

**Status:** Rejected  
**Complexity:** N/A  
**Time Estimate:** N/A

**Decision:**
After review, determined this test is unnecessary. Settings dialog usage is infrequent enough that dedicated leak testing is not warranted.

---

### 4. Add Memory Test for Menu (After Investigation)

**Status:** Investigation Needed  
**Complexity:** Low  
**Time Estimate:** 15 minutes (investigation) + 30 minutes (implementation)

**Investigation Questions:**
1. Which menu? Panel indicator menu?
2. How frequently is it used?
3. Is the menu complex enough to warrant testing?
4. Does it create/destroy significant resources?

**Decision Criteria:**
- If menu creates actors/widgets: Test it
- If menu is lightweight/simple: Skip it
- Consider cost/benefit of test maintenance

---

## Functional Testing Enhancements

### 5. Investigate Functional Test Cycle Counts

**Status:** Not Started  
**Complexity:** Medium  
**Time Estimate:** 1 hour

**Question:**
Why do functional tests run multiple cycles (e.g., 500 zone cycles, 10 layout switches) instead of single validation passes?

**Investigation:**
- Review each test's cycle count rationale
- Determine if cycles are for:
  - Stress testing?
  - State consistency verification?
  - Leak detection (should be in mem tests)?
- Identify optimization opportunities

**Potential Outcome:**
- Reduce unnecessary cycles for faster test runs
- Keep high cycle counts only where justified
- Document rationale for cycle counts

---

### 6. Keyboard Shortcut Testing

**Status:** Not Started  
**Complexity:** High  
**Time Estimate:** 4-6 hours

**Requirements:**
Real keyboard automation (xdotool for X11, ydotool for Wayland)

**Test Coverage Needed:**

**A. Layout Switcher Navigation**
- Super+Z to open LayoutSwitcher
- Arrow keys to navigate
- Enter to apply layout
- Escape to cancel
- Verify layout actually changes

**B. Profile Switching**
- Test profile switch shortcuts
- Verify profile actually switches
- Check state persistence

**C. Window Operations**
- Super+Arrow for zone cycling
- Super+1-9 for layout switching
- Window minimize/maximize/restore
- Verify window moves to correct zones

**Implementation Notes:**
- Requires xdotool/ydotool setup in VM
- Must wait for UI elements to render
- Screenshot verification may be needed
- Test actual keyboard → schema → extension pipeline

---

### 7. Keyboard Conflict Detection Testing

**Status:** Not Started  
**Complexity:** Medium  
**Time Estimate:** 2 hours

**Test Scenarios:**
1. **Conflict Detection**
   - Set up conflicting keybindings
   - Verify conflict detector identifies them
   - Check warning/error messages

2. **Conflict Resolution**
   - Test automatic conflict resolution
   - Test manual conflict resolution UI
   - Verify resolution persists

3. **Edge Cases**
   - System shortcuts vs extension shortcuts
   - Multiple extensions with same shortcuts
   - Invalid shortcut combos

**Implementation:**
- Use GSettings to programmatically set shortcuts
- Trigger conflict detector
- Validate warnings/errors via D-Bus
- Test resolution workflow

---

## Infrastructure & Automation

### 8. UI Automation Investigation

**Status:** Not Started  
**Complexity:** High  
**Time Estimate:** 4-8 hours (exploration + POC)

**Goal:** Choose best UI automation approach for GNOME Shell testing

**Options to Evaluate:**

**A. xdotool (X11)**
- ✅ Pros: Simple, well-documented, currently used for Shell restarts
- ❌ Cons: X11 only, no Wayland support
- Use case: Current X11 VM environment

**B. ydotool (Wayland)**
- ✅ Pros: Wayland support, future-proof
- ❌ Cons: Requires uinput permissions, less mature
- Use case: Future Wayland migration

**C. dogtail (Accessibility)**
- ✅ Pros: GNOME-native, accessibility API, element inspection
- ❌ Cons: Requires a11y enabled, complex setup
- Use case: Deep UI element testing

**D. PyAutoGUI + pytest**
- ✅ Pros: Python ecosystem, screenshot verification
- ❌ Cons: Mouse/keyboard only, no element inspection
- Use case: Simple automation

**Investigation Tasks:**
1. Set up POC for each option
2. Test basic workflow (open UI, click element, verify)
3. Evaluate complexity, reliability, maintenance
4. Document recommendation with rationale

---

### 9. Test Result Artifacts

**Status:** Not Started  
**Complexity:** Medium  
**Time Estimate:** 2-3 hours

**Goal:** Write test results to files for PR submissions and historical tracking

**Requirements:**

**A. Result File Format**
- JSON or structured text
- Include: test name, result, duration, timestamp
- Memory tests: include R² values, memory deltas
- Functional tests: include pass/fail counts

**B. File Location**
- `results/` directory (already exists)
- Timestamped filenames: `test-results-2025-12-29-09-30.json`
- Latest symlink: `results/latest.json`

**C. PR Integration**
- Script to format results for PR comments
- Include summary statistics
- Highlight failures/warnings
- Compare with previous runs (if available)

**Implementation:**
- Modify `scripts/run-tests` to capture output
- Create result file writer utility
- Add `--output-file` flag option
- Create result formatter script

---

### 10. GSettings State Testing

**Status:** Not Started  
**Complexity:** Low  
**Time Estimate:** 1 hour

**Goal:** Verify that settings persist correctly in GSettings

**Test Scenarios:**
1. **Setting Persistence**
   - Change setting via D-Bus
   - Query GSettings to verify
   - Restart extension
   - Verify setting still persists

2. **Default Values**
   - Reset to defaults
   - Verify all settings match schema defaults

3. **Invalid Values**
   - Attempt to set invalid values
   - Verify rejection or validation

**Implementation:**
- Add to `test-func-edge-cases.sh` or create new test
- Use `gsettings` CLI for verification
- Test each setting type (boolean, string, int, enum)

---

## Investigation Tasks

### UI Automation Technology Choice
- **Owner:** TBD
- **Timeline:** Before implementing keyboard shortcut tests
- **Deliverable:** Decision document with POC results

### Menu Memory Test Value Assessment
- **Owner:** TBD  
- **Timeline:** Before implementing menu test
- **Deliverable:** Go/No-go decision with rationale

### Functional Test Cycle Optimization
- **Owner:** TBD
- **Timeline:** After release summary implemented
- **Deliverable:** Updated test scripts with optimized cycles

### GSettings Persistence Verification
- **Owner:** TBD
- **Timeline:** Low priority, fits with other functional tests
- **Deliverable:** Test script or addition to existing tests

---

## Prioritization Summary

### This PR (fix/vm-test-cleanup)
1. ✅ Release suite summary rollup (COMPLETED)
2. ⚠️ Test window D-Bus fix (IN PROGRESS)

### Next PR (test-enhancements-1)
4. Keyboard shortcut testing (after UI automation investigation)
5. Keyboard conflict detection
6. Test result artifacts

### Future PRs
7. Menu memory test (after investigation)
8. GSettings state testing
9. Functional test cycle optimization
10. UI automation infrastructure

---

## Success Metrics

**For This PR:**
- [x] Release suite shows enhanced combined summary with detailed metrics
- [ ] Test window starts successfully in VM (or issue documented)
- [ ] All tests continue to pass (except known issues)

**Overall Goals:**
- Increase test coverage to catch integration bugs
- Reduce false positives from test environment issues
- Improve test result visibility for PR reviews
- Build foundation for automated UI testing

---

## Notes

- Focus on quick wins first to maintain momentum
- Investigation tasks should complete before implementations
- Each enhancement should be independently committable
- Maintain backward compatibility with existing test workflows
