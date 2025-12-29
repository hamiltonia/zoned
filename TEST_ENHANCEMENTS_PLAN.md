# Test Infrastructure Enhancement Plan

**Date:** 2025-12-29  
**Status:** In Progress  
**Branch:** fix/vm-test-cleanup  
**Goal:** Enhance test infrastructure with better coverage, automation, and reporting

---

## Quick Wins (High Priority - This PR)

### 1. Add Release Suite Summary Rollup

**Status:** Not Started  
**Complexity:** Low  
**Time Estimate:** 15 minutes

**Problem:**
The `run-tests release` command runs both memory and functional tests but doesn't provide a combined summary. Users see separate outputs but no rollup showing overall results.

**Solution:**
Add a final summary section to `scripts/run-tests` for the release suite:
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

### 2. Fix Test Window D-Bus Issue

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

### 3. Add Memory Test for Settings Dialog

**Status:** Not Started  
**Complexity:** Low  
**Time Estimate:** 30 minutes

**Rationale:**
Settings dialog is a significant UI component that should be tested for memory leaks during repeated open/close cycles.

**Implementation:**
Add to `test-mem-monitored.sh` as choice 4:
```
4) Settings Dialog (Open/Close)
```

**Test Logic:**
- Open settings dialog via D-Bus
- Close settings dialog
- Repeat for test duration
- Measure memory growth with R² analysis

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
1. ✅ Release suite summary rollup (quick win)
2. ⚠️ Test window D-Bus fix (if feasible)
3. 📋 Settings dialog memory test (if time permits)

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
- [ ] Release suite shows combined summary
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
