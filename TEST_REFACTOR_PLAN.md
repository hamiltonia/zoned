# Test Infrastructure Refactor Plan

**Date:** 2025-12-28  
**Status:** In Progress  
**Goal:** Fix broken memory testing, document and remove inadequate functional testing

---

## Current State Audit

### Functional Tests (To Be Removed)

All functional tests use **D-Bus shortcuts** instead of real user interactions (keyboard shortcuts, mouse). This doesn't catch real bugs like the recent schema/keyboard handling issue.

#### Test Scripts
1. **test-enable-disable.sh** - Extension lifecycle
   - Tests: Enable/disable cycles
   - Coverage: Extension activation/deactivation stability
   - Limitation: Uses gnome-extensions CLI, not real user workflow

2. **test-ui-stress.sh** - UI component cycling
   - Tests: LayoutSwitcher and ZoneOverlay show/hide
   - Coverage: UI component memory leaks
   - Limitation: Uses D-Bus calls, not keyboard shortcuts

3. **test-zone-cycling.sh** - Zone navigation
   - Tests: Rapid zone cycling in both directions
   - Coverage: Zone index state consistency
   - Limitation: Uses D-Bus, doesn't test Super+Arrow keybindings

4. **test-layout-switching.sh** - Layout changes
   - Tests: Cycling through all layouts
   - Coverage: Layout switching stability
   - Limitation: Uses D-Bus, doesn't test Super+1-9 keybindings

5. **test-combined-stress.sh** - Mixed operations
   - Tests: Interleaved operations (layout switch + zone cycle + UI)
   - Coverage: Race conditions, concurrent operations
   - Limitation: D-Bus orchestration doesn't match real user timing

6. **test-multi-monitor.sh** - Multi-display
   - Tests: Layout/zone operations across monitors
   - Coverage: Multi-monitor state consistency
   - Limitation: D-Bus doesn't test actual monitor detection/placement

7. **test-window-movement.sh** - Window positioning
   - Tests: Moving GTK4 test window to zones
   - Coverage: Window geometry and positioning
   - Strength: Uses real windows (good!)
   - Limitation: Still triggered via D-Bus, not keyboard

8. **test-edge-cases.sh** - Boundary conditions
   - Tests: Invalid inputs, boundary wrapping, rapid toggles
   - Coverage: Error handling robustness
   - Limitation: D-Bus API testing, not user-facing behavior

9. **test-workspace.sh** - Per-workspace layouts
   - Tests: Workspace-specific layout persistence
   - Coverage: Workspace switching state management
   - Limitation: D-Bus, doesn't test actual workspace navigation

#### Test Runner
- **vm-test-func** - Sequential runner for all 9 tests
  - Features: Presets (full/quick/minimal), memory thresholds
  - Limitation: Simple threshold check (>50MB = FAIL), no statistical analysis

### Memory Testing (To Be Fixed and Kept)

**Current State:** Broken - only completes 1 run instead of 4

**Original Working Version (commit aa89135^):**
- **test-with-restarts.sh** → should be `vm-test-mem`
- **test-longhaul-interactive.sh** → should be `test-memory-monitored.sh`

#### What Makes It Brilliant
- **Variable duration runs** (1min, 2min, 3min, 4min...)
- **GNOME Shell restarts between runs** for clean baselines
- **Statistical R² correlation analysis**:
  - Calculates correlation between cycles and memory deviation
  - R² > 0.8 + high variance = **CONFIRMED LEAK**
  - High variance + low R² = **MEASUREMENT NOISE** (not a leak!)
  
This distinguishes GC inconsistency from real leaks - genius!

#### Known Issue
After refactor (commit aa89135), only Run 1 completes. The script exits after first run instead of continuing with Runs 2-4. Need to revert to working version.

### Infrastructure (Keep)

These are used by memory testing and should be preserved:

- **lib/setup.sh** - Test initialization, prerequisites
- **lib/dbus-helpers.sh** - D-Bus interface utilities
- **lib/assertions.sh** - Test assertion helpers
- **verify-extension-init.sh** - Extension initialization verification
- **xdotool-restart-gnome.sh** - Automated GNOME Shell restart
- **xdotool-force-gc.sh** - Garbage collection trigger
- **memory-monitor.sh** - Background memory tracking
- **setup-host-notifications.sh** - VM-to-host notification setup

---

## What We're Keeping

### Memory Testing Suite
- ✅ `vm-test-mem` (once fixed)
- ✅ `test-memory-monitored.sh` (once fixed)
- ✅ R² statistical correlation analysis
- ✅ Multi-run with restart methodology
- ✅ Variable duration testing approach

### Infrastructure
- ✅ All `lib/` helper scripts
- ✅ Verification scripts (verify-extension-init.sh)
- ✅ xdotool automation scripts
- ✅ Notification system

---

## What We're Deleting (Actual Duplicates)

### Deleted - Overlap with Memory Tests
- ❌ test-enable-disable.sh - Duplicate of test-mem choice 1
- ❌ test-ui-stress.sh - Duplicate of test-mem choices 2 & 3  
- ❌ test-combined-stress.sh - Mix of above operations

### Deleted - Test Runner
- ❌ vm-test-func - Replaced by unified `scripts/test` runner

### Rationale for Deletion
These tests duplicated memory test operations (enable/disable cycles, LayoutSwitcher show/hide, ZoneOverlay show/hide) without the sophisticated R² statistical analysis. The memory test suite (`test-mem`) already covers these operations with better leak detection methodology.

---

## What We're Restoring (Legitimate Functional Tests)

**Critical Distinction:** Memory tests detect leaks. Functional tests validate correctness.

### Restored Functional Tests (6 tests + dependency)
- ✅ test-window-movement.sh - Zone positioning accuracy
- ✅ test-edge-cases.sh - Error handling & boundary conditions
- ✅ test-workspace.sh - Per-workspace layout feature
- ✅ test-multi-monitor.sh - Multi-display handling
- ✅ test-zone-cycling.sh - Zone state consistency
- ✅ test-layout-switching.sh - Layout state persistence
- ✅ lib/test-window.py - GTK4 test window (required by workspace & window-movement tests)

### Why These Tests Are Legitimate

**1. test-window-movement.sh** - Positioning Accuracy
- **What it tests:** Real GTK4 windows move to correct positions
- **Validation:** window.x ≈ zone.x, window.y ≈ zone.y (±50px tolerance)
- **Why keep:** Core feature correctness (not leak detection)
- **D-Bus use:** For validation/inspection (legitimate)

**2. test-edge-cases.sh** - Error Handling
- **What it tests:** Invalid inputs, extreme values, concurrent operations
- **Validation:** Extension doesn't crash on bad input
- **Why keep:** Memory tests don't test error handling
- **Examples:** Invalid layout IDs, zone cycling >999999, null parameters, SQL injection attempts

**3. test-workspace.sh** - Workspace Feature
- **What it tests:** Per-workspace layouts, state persistence, spatial state
- **Validation:** Layout1 on WS0, Layout2 on WS1, state preserved across switches
- **Why keep:** This is a whole FEATURE not tested by memory tests
- **Real windows:** Creates GTK4 window to test across workspaces

**4. test-multi-monitor.sh** - Multi-Display
- **What it tests:** Layout switching across monitors, UI positioning per monitor
- **Validation:** Extension works with 2+ monitors
- **Why keep:** Multi-monitor setup is a critical use case
- **Smart behavior:** Gracefully skips (returns success) if only 1 monitor

**5. test-zone-cycling.sh** - State Consistency
- **What it tests:** 500 rapid zone cycles, verifies state never goes out of bounds
- **Validation:** zoneIndex ∈ [0, zoneCount-1], layout doesn't change
- **Why keep:** State consistency under stress (different from leak detection)

**6. test-layout-switching.sh** - Layout State
- **What it tests:** 10 cycles through ALL layouts rapidly
- **Validation:** Each layout switch succeeds, state persists
- **Why keep:** Rapid switching stress test (different from leak detection)

### D-Bus Testing: When It's Appropriate

**The D-Bus Limitation (from original rationale):**
> "D-Bus shortcuts don't test real user workflows. The recent schema/keyboard bug would have been caught immediately by proper automation using real keyboard shortcuts (xdotool/ydotool), but D-Bus testing missed it entirely."

**This is TRUE for keyboard shortcut testing** (Super+1-9, Super+Arrow, etc.)

**But FUNCTIONAL VALIDATION is different:**
- Edge case handling (invalid inputs) - D-Bus appropriate
- Multi-monitor support - D-Bus appropriate  
- Workspace features - D-Bus appropriate
- State consistency - D-Bus appropriate
- Position accuracy - D-Bus appropriate for validation

**The distinction:**
- ❌ D-Bus to TRIGGER user actions (bypasses keyboard → schema → extension pipeline)
- ✅ D-Bus to VALIDATE results and test features

These restored tests validate that features WORK correctly, which is orthogonal to leak detection.

---

## Future Improvement: Consistent Test Naming Convention

**Status:** Not yet implemented - documented for future commit

Current test names lack clear categorization. This makes it difficult to immediately identify a test's purpose.

### Proposed Naming Convention

**Memory Leak Detection Tests:**
- `test-mem` → `test-mem-with-restarts` (multi-run statistical analysis)
- `test-memory-monitored.sh` → `test-mem-monitored.sh` (single run implementation)

**Functional Correctness Tests:**
- `test-window-movement.sh` → `test-func-window-movement.sh` (positioning accuracy)
- `test-edge-cases.sh` → `test-func-edge-cases.sh` (error handling)
- `test-workspace.sh` → `test-func-workspace.sh` (workspace features)
- `test-multi-monitor.sh` → `test-func-multi-monitor.sh` (multi-display)
- `test-zone-cycling.sh` → `test-func-zone-cycling.sh` (state consistency)
- `test-layout-switching.sh` → `test-func-layout-switching.sh` (layout state)

### Benefits
- **Immediately clear categorization** - Prefix shows test type at a glance
- **Easier to organize test runs** - Can glob `test-mem-*` or `test-func-*`
- **Better documentation** - Self-documenting filenames
- **Consistent with unified runner** - Matches `scripts/test mem` and `scripts/test func` commands

### Implementation Plan
This should be done in a **separate commit** after the restoration is complete and tested:
1. Rename all test files according to convention
2. Update cross-references in scripts
3. Update documentation
4. Single-purpose commit: "Apply consistent test naming convention"

This separation keeps commits focused and makes git history clearer.

---

## Refactor Plan

### Phase 1: Fix Memory Testing

1. **Revert to working state (commit aa89135^)**
   ```bash
   git show aa89135^:scripts/vm-test/test-with-restarts.sh > scripts/vm-test/vm-test-mem
   git show aa89135^:scripts/vm-test/test-longhaul-interactive.sh > scripts/vm-test/test-memory-monitored.sh
   chmod +x scripts/vm-test/vm-test-mem
   ```

2. **Apply critical fixes only**
   - Fix KB→MB label in test-memory-monitored.sh output (line 66)
   - Verify preset support is working (--preset quick/standard/deep)

3. **Test verification**
   - Run `vm-test-mem --preset quick` in VM
   - Confirm all 4 runs complete successfully
   - Verify R² correlation analysis appears in output

### Phase 2: Remove Inadequate Functional Tests

1. **Delete test scripts**
   ```bash
   rm scripts/vm-test/test-enable-disable.sh
   rm scripts/vm-test/test-ui-stress.sh
   rm scripts/vm-test/test-zone-cycling.sh
   rm scripts/vm-test/test-layout-switching.sh
   rm scripts/vm-test/test-combined-stress.sh
   rm scripts/vm-test/test-multi-monitor.sh
   rm scripts/vm-test/test-window-movement.sh
   rm scripts/vm-test/test-edge-cases.sh
   rm scripts/vm-test/test-workspace.sh
   ```

2. **Delete functional test runner**
   ```bash
   rm scripts/vm-test/vm-test-func
   ```

3. **Remove from Makefile**
   - Remove `vm-test-func` related targets
   - Keep `vm-test-mem` targets

4. **Check for orphaned dependencies**
   - Verify no other scripts reference deleted tests
   - Check `run-all.sh` - may need updating or removal

### Phase 3: Update Documentation

1. **Update scripts/vm-test/README.md**
   - Remove functional testing sections
   - Focus on memory testing with R² analysis
   - Add note about future functional testing plans

2. **Update docs/testing-strategy.md** (if exists)
   - Document the inadequacy of D-Bus testing
   - Explain need for real user automation

3. **Archive this plan**
   - Move to `docs/test-refactor-history.md` for historical reference
   - Or delete if user prefers

---

## Future: Proper Functional Testing

### Requirements

**Real User Automation:**
- Use **xdotool** (X11) or **ydotool** (Wayland) for keyboard shortcuts
- Simulate actual Super+Arrow, Super+1-9, Super+Z keybindings
- Test the full user interaction path

**Test Coverage Needed:**
1. **Keyboard Shortcuts**
   - Zone cycling (Super+Arrow)
   - Layout switching (Super+1-9)
   - LayoutSwitcher (Super+Z)
   - ZoneOverlay (Super+Shift+Z)
   - Settings (Super+Shift+S)

2. **Schema Validation**
   - Verify keybindings load correctly
   - Test settings persistence
   - Validate against schema definition

3. **User Workflows**
   - Open LayoutSwitcher → select layout → verify change
   - Cycle zones → verify window moves
   - Switch workspaces → verify per-workspace layout persistence

4. **Error Handling**
   - Invalid keybinding conflicts
   - Missing layouts
   - Disabled extension scenarios

### Technology Options
- **xdotool** - X11 automation (current VM uses X11)
- **ydotool** - Wayland automation (future-proof)
- **dogtail** - GNOME accessibility automation
- **pytest + PyAutoGUI** - Python-based framework

### Example Bug That Was Missed
The recent **schema/keyboard handling bug** would have been immediately caught by:
```bash
# Press Super+1 to switch to layout 1
xdotool key Super_L+1
sleep 0.5
# Verify layout actually changed via D-Bus query
current_layout=$(gdbus call ... GetCurrentLayout)
assert "$current_layout" == "Layout 1"
```

D-Bus testing bypassed the keyboard → schema → extension → action pipeline entirely, missing the bug.

---

---

## FINAL ARCHITECTURE (Decided 2025-12-28)

### Design Principles
1. **Unified test runner** - `scripts/test` handles both local and VM testing
2. **VM-first approach** - Default to VM testing (where most testing happens)
3. **Context-agnostic test scripts** - Tests work the same locally or in VM
4. **Clean separation** - `scripts/vm` for VM management, `scripts/test` for testing
5. **No Makefile bloat** - Keep Makefile focused on building, not testing

### Directory Structure
```
scripts/
  test                          # NEW: Unified test runner (replaces vm test command)
  vm                            # KEEP: VM management (logs, setup, headless, profile)
  tests/                        # RENAMED FROM: vm-test/ (plural to avoid collision)
    test-mem                    # RENAMED FROM: vm-test-mem
    test-memory-monitored.sh    # KEEP: Single memory test implementation
    lib/                        # KEEP: Test infrastructure
      setup.sh
      dbus-helpers.sh
      assertions.sh
    verify-extension-init.sh    # KEEP
    xdotool-restart-gnome.sh    # KEEP
    xdotool-force-gc.sh         # KEEP
    memory-monitor.sh           # KEEP
    setup-host-notifications.sh # KEEP
```

**Note:** Directory is `tests/` (plural) to avoid naming collision with `test` script.

### Usage Examples

**Memory Testing (default: VM via SSH)**
```bash
# Quick memory test in VM
./scripts/test mem --preset quick

# Standard memory test in VM
./scripts/test mem --preset standard

# Deep memory test in VM
./scripts/test mem --preset deep

# Local testing (when needed)
./scripts/test mem --local --preset quick
```

**Future Functional Testing**
```bash
# Functional tests in VM (once rebuilt with xdotool)
./scripts/test func --preset full

# Local functional testing
./scripts/test func --local --preset full
```

### Implementation Details

#### `scripts/test` (New Unified Runner)

**Behavior:**
- Default: Detect VM from profile, SSH and run tests in VM
- `--local` flag: Run tests on current machine
- Supports both memory and functional test types
- Passes all arguments down to test scripts

**Logic Flow:**
```bash
#!/bin/bash
# Parse arguments
TYPE=$1           # mem or func
shift

# Check for --local flag
LOCAL=false
if [[ "$1" == "--local" ]]; then
    LOCAL=true
    shift
fi

if [ "$LOCAL" = true ]; then
    # Run locally
    exec "./scripts/test/test-$TYPE" "$@"
else
    # Run in VM via SSH (extract from scripts/vm logic)
    detect_vm_and_ssh() { ... }
    detect_vm_and_ssh
    ssh -t "$VM_DOMAIN" "cd $REMOTE_PROJECT_DIR && ./scripts/test/test-$TYPE $@"
fi
```

#### Directory Rename: `vm-test/` → `test/`

**Rationale:** Tests are context-agnostic and work locally or in VM

**Files to rename:**
- `scripts/vm-test/` → `scripts/test/`
- `scripts/vm-test/vm-test-mem` → `scripts/test/test-mem`
- All other files in directory stay the same

#### Update `scripts/vm`

**Remove:** `test` command (delegated to new `scripts/test`)

**Keep:**
- `setup` - VM initial configuration
- `profile` - Profile management
- `install` - Deploy extension to VM
- `logs` - Watch VM logs
- `headless` - Headless VM operations

---

## Implementation Plan (FINAL)

### Phase 1: Document and Prepare ✅
- [x] Created TEST_REFACTOR_PLAN.md
- [x] Reverted memory testing scripts to working version (aa89135^)
- [x] Deleted inadequate functional tests
- [x] Analyzed working system in zoned-archive
- [x] Designed final unified architecture
- [x] Documented complete implementation plan

### Phase 2: Implement Unified Test System

1. **Create `scripts/test`** (new unified runner)
   - Extract VM detection logic from `scripts/vm`
   - Support `--local` flag for local execution
   - Default to VM testing via SSH
   - Support `mem` and `func` (future) test types

2. **Rename test directory and files**
   ```bash
   mv scripts/vm-test scripts/test
   mv scripts/test/vm-test-mem scripts/test/test-mem
   ```

3. **Update cross-references**
   - Fix any scripts referencing old paths
   - Update `scripts/test/test-mem` if it has hardcoded paths
   - Check `run-all.sh` and other orchestration scripts

4. **Update `scripts/vm`**
   - Remove `test` command and its logic
   - Keep all VM management commands
   - Update help text

5. **Update documentation**
   - `scripts/test/README.md` - New location and usage
   - `scripts/README.md` - Document new `test` script
   - Remove Makefile test targets documentation

### Phase 3: Testing & Validation

1. **Test VM execution**
   ```bash
   ./scripts/test mem --preset quick
   ```
   - Should detect VM, SSH, run 4 iterations
   - Should display R² correlation analysis
   - Should complete successfully

2. **Test local execution**
   ```bash
   ./scripts/test mem --local --preset quick
   ```
   - Should run locally (if extension installed)
   - Should complete 4 iterations
   - Should work without VM profile

3. **Verify `scripts/vm` still works**
   ```bash
   ./scripts/vm setup
   ./scripts/vm logs
   ./scripts/vm headless status
   ```

---

## Success Criteria

- [x] Memory testing scripts reverted to working version
- [x] Inadequate functional tests removed and documented
- [x] Final unified architecture designed and documented
- [x] `scripts/test` runner created and working
- [x] Directory renamed: `vm-test/` → `tests/` (plural to avoid collision)
- [x] Test runner renamed: `vm-test-mem` → `test-mem`
- [x] `scripts/vm` updated (test command removed)
- [ ] Documentation updated (README files)
- [ ] End-to-end VM testing verified (4 runs complete, R² analysis works)
- [ ] End-to-end local testing verified (optional nice-to-have)

---

## Notes

- The statistical R² correlation in memory testing is the most valuable part of this test suite
- Tests are context-agnostic - work the same locally or in VM
- VM-first approach: most testing happens in VM, local is for convenience
- Clean separation: `scripts/vm` for VM ops, `scripts/test` for testing
- Functional testing needs complete rebuild with proper automation (future)
- This refactor preserves what works and builds proper infrastructure
