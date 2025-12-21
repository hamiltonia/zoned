# Phase 5: Signal Cleanup Verification Task

**Created:** 2024-12-21  
**Prerequisites:** Waves 1-4 Complete (commits `19b4c5a` through `cbb1065`)  
**Objective:** Verify that signal cleanup fixes have eliminated the 271MB/30min memory leak  
**Expected Outcome:** <20MB memory growth over 30 minutes (90%+ reduction)

---

## Task Context

### What Was Done (Waves 1-4)
All 104 arrow function signal connections across the codebase have been converted to bound methods with proper cleanup:

- **Wave 1** (Critical): extension.js, theme.js, keybindingManager.js - Global object signals
- **Wave 2** (High): layoutSwitcher.js, layoutSettingsDialog.js, panelIndicator.js, zoneEditor.js - UI component lifecycles
- **Wave 3** (Medium): All layoutSwitcher/* modules - Transient UI hover effects
- **Wave 4** (Low): prefs.js - Preferences window (31 arrow functions)

**Pattern Applied:**
```javascript
// Before: Arrow function closure (leaks memory)
object.connect('signal', () => { this.doSomething(); });

// After: Bound method (properly cleaned up)
this._boundHandler = this._handler.bind(this);
object.connect('signal', this._boundHandler);
// In destroy(): 
object.disconnect(signalId);
this._boundHandler = null;
```

### What Needs Verification
Confirm that these code changes have actually fixed the memory leak by:
1. Measuring memory growth over time
2. Verifying signal disconnection via debug logging
3. Checking instance counts return to baseline
4. Looking Glass actor count verification

---

## Verification Steps

### Step 1: Deploy to VM Environment

**Important:** Testing must be done in the VM, not locally (per .clinerules).

```bash
# From host machine
make install    # User will handle deployment to VM

# Verify deployment succeeded
# Check extension is loaded in VM
```

### Step 2: Enable Memory Debug Logging

```bash
# In VM terminal
gsettings set org.gnome.shell.extensions.zoned memory-debug true
gsettings set org.gnome.shell.extensions.zoned debug-logging true

# Verify settings
gsettings get org.gnome.shell.extensions.zoned memory-debug
# Should return: true
```

###
 Step 3: Baseline Measurements

**3.1 Memory Baseline**
```bash
# In VM terminal
ps aux | grep gnome-shell | awk '{print "Memory: " $6 " KB"}'

# Record this value as BASELINE_MEMORY
```

**3.2 D-Bus Instance Report**
```bash
# In VM terminal
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/Zoned \
  --method org.gnome.Shell.Extensions.Zoned.GetMemoryReport

# Should show instance counts (all should be at baseline or 0)
# Record this output
```

**3.3 Looking Glass Baseline**
```javascript
// Open Looking Glass (Alt+F2, type 'lg', press Enter)
// In Evaluator tab:
Main.uiGroup.get_n_children()

// Record this count as BASELINE_ACTORS
```

### Step 4: Run Stress Tests

**4.1 UI Stress Test (30 minutes)**
```bash
# In VM terminal
# Start journal logging in one terminal:
journalctl -f -o cat /usr/bin/gnome-shell | grep -E "\[Zoned|MEMDEBUG"

# In another terminal, run the stress test:
cd /path/to/zoned  # Navigate to your zoned repo in VM
./scripts/vm-test/test-ui-stress.sh

# This will:
# - Open/close Layout Switcher 100+ times
# - Hover over cards and buttons
# - Resize dialogs
# - Switch layouts repeatedly
# - Run for ~30 minutes
```

**4.2 Monitor Debug Output**

While test is running, watch for in the journal:
- ✅ `[Zoned:LayoutSwitcher] [MEMDEBUG] Disconnecting N signals`
- ✅ `[Zoned:LayoutSwitcher] [MEMDEBUG]   ✓ Disconnected signal ID...`
- ❌ NO errors or warnings about "finalized object"
- ❌ NO "attempt to disconnect already-disconnected signal"

### Step 5: Post-Test Measurements

**5.1 Memory After Stress Test**
```bash
# In VM terminal (after test completes)
ps aux | grep gnome-shell | awk '{print "Memory: " $6 " KB"}'

# Calculate growth:
# MEMORY_GROWTH = AFTER_MEMORY - BASELINE_MEMORY
# Expected: < 20MB (~20,000 KB)
# Before fixes: ~271MB (~271,000 KB)
```

**5.2 Force Garbage Collection**
```javascript
// In Looking Glass:
System.gc()
System.gc()  // Run twice to ensure cleanup

// Wait 2-3 seconds, then check memory again:
```

```bash
ps aux | grep gnome-shell | awk '{print "Memory: " $6 " KB"}'

# Memory should drop significantly after GC
# If not, there are still leaks
```

**5.3 Instance Count Verification**
```bash
# Check D-Bus report again
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/Zoned \
  --method org.gnome.Shell.Extensions.Zoned.GetMemoryReport

# All instance counts should be:
# - At baseline (e.g., LayoutSwitcher: 0)
# - Or small stable counts for persistent objects
```

**5.4 Actor Count Verification**
```javascript
// In Looking Glass:
Main.uiGroup.get_n_children()

// Should be within ± 5 of BASELINE_ACTORS
// Large difference indicates UI elements not cleaned up
```

### Step 6: Disable Debug Logging

```bash
# In VM terminal
gsettings set org.gnome.shell.extensions.zoned memory-debug false
gsettings set org.gnome.shell.extensions.zoned debug-logging false
```

---

## Success Criteria

### ✅ PASS if ALL of the following are true:

1. **Memory Growth**: < 20MB over 30-minute stress test
   - Before fixes: 271MB
   - Target: <20MB (90%+ reduction)

2. **Debug Logging**: All signals show clean disconnection
   - No "finalized object" warnings
   - No "already disconnected" errors
   - Disconnect count matches connection count

3. **Instance Counts**: Return to baseline after GC
   - LayoutSwitcher: 0
   - LayoutSettingsDialog: 0  
   - ThemeManager: 1 (persistent)
   - TemplateManager: 1 (persistent)

4. **Actor Count**: Within ±5 of baseline after GC
   - Indicates no lingering UI elements

5. **Console**: No errors or warnings related to memory/signals

### ❌ FAIL if ANY of the following occur:

- Memory growth > 50MB
- "Finalized object" warnings in console
- Instance counts don't return to baseline
- Actor count grows significantly
- Signal disconnect errors in logs

---

## Reporting Results

### Template for Success Report

```markdown
## Verification Results - PASS ✅

**Test Date:** YYYY-MM-DD
**Commits Tested:** 19b4c5a through cbb1065

### Measurements
- Baseline Memory: XXX KB
- After Stress Test: XXX KB
- Growth: XXX KB (~XX MB)
- Growth Reduction: XX% (from 271MB baseline)

- Baseline Actors: XXX
- After Test + GC: XXX
- Difference: ±X

### Debug Logging
- All signals disconnected cleanly ✅
- No finalization warnings ✅
- No disconnect errors ✅

### Instance Counts
- LayoutSwitcher: 0 ✅
- LayoutSettingsDialog: 0 ✅
- All counts at baseline ✅

### Conclusion
Signal cleanup fixes have successfully eliminated the memory leak.
Ready to merge to main and proceed with 1.0 release.
```

### Template for Failure Report

```markdown
## Verification Results - FAIL ❌

**Test Date:** YYYY-MM-DD  
**Commits Tested:** 19b4c5a through cbb1065

### Issues Found
- [ ] Memory growth still high: XXX MB (expected <20MB)
- [ ] Instance counts not returning to baseline
- [ ] Actor count growing: baseline XXX, after test XXX
- [ ] Console warnings/errors (paste below)

### Console Output
```
[paste relevant errors/warnings]
```

### Next Steps
[AI should analyze failures and suggest additional fixes]
```

---

## Debugging Failed Tests

If verification fails, check these common issues:

### High Memory Growth (>50MB)

**Possible causes:**
- Signals still not disconnected in some code path
- Bound functions not released (`= null`)
- WeakRef not working as expected

**Debug steps:**
```javascript
// In Looking Glass after test:
global.zonedDebug?.verifyDisconnected()
// Returns count of leaked signals

// Check which component has leaks:
global.zonedDebug?.signals
// Shows map of component → signal arrays
```

### Instance Counts Not Zero

**Possible causes:**
- destroy() not called on all instances
- Instance tracking increment/decrement mismatch

**Debug steps:**
```javascript
// Check specific instance count:
global.zonedDebug?.instances.get('LayoutSwitcher')

// Manual cleanup test:
// 1. Open Layout Switcher
// 2. Close it
// 3. Force GC
// 4. Check count (should be 0)
```

### Actor Count Growing

**Possible causes:**
- UI elements not removed from parent
- Actors not destroyed

**Debug steps:**
```javascript
// List all children:
for (let i = 0; i < Main.uiGroup.get_n_children(); i++) {
    let child = Main.uiGroup.get_child_at_index(i);
    log(child.toString());
}

// Look for Zoned-related actors that shouldn't be there
```

---

## Additional Verification (Optional)

### Long-Haul Test (2+ hours)
```bash
# Run extended stress test
./scripts/vm-test/test-longhaul-interactive.sh

# Monitor memory every 15 minutes
watch -n 900 'ps aux | grep gnome-shell | awk "{print \"Memory: \" \$6 \" KB\"}"'

# Expected: Linear (small) growth, not exponential
# Acceptable: <50-100MB over 2 hours
```

### Multi-Monitor Test
```bash
# If you have multi-monitor setup in VM
./scripts/vm-test/test-multi-monitor.sh

# Verify memory doesn't grow differently with multiple monitors
```

### Workspace Test
```bash
# Test per-workspace layouts mode
./scripts/vm-test/test-workspace.sh

# Each workspace creates separate layout instances
# Should still clean up properly
```

---

## Reference Commands

```bash
# Quick memory check
alias zoned-mem='ps aux | grep gnome-shell | awk "{print \"Memory: \" \$6 \" KB\"}"'

# Quick instance check
alias zoned-instances='gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell/Extensions/Zoned --method org.gnome.Shell.Extensions.Zoned.GetMemoryReport'

# Watch memory in real-time
watch -n 5 zoned-mem

# Enable/disable debug
alias zoned-debug-on='gsettings set org.gnome.shell.extensions.zoned memory-debug true && gsettings set org.gnome.shell.extensions.zoned debug-logging true'
alias zoned-debug-off='gsettings set org.gnome.shell.extensions.zoned memory-debug false && gsettings set org.gnome.shell.extensions.zoned debug-logging false'
```

---

## Task Completion Checklist

- [ ] Deploy code to VM
- [ ] Enable debug logging
- [ ] Record baseline measurements (memory, actors, instances)
- [ ] Run 30-minute UI stress test
- [ ] Monitor debug output for clean disconnections
- [ ] Record post-test measurements
- [ ] Force GC and verify cleanup
- [ ] Calculate memory growth percentage
- [ ] Verify all success criteria met
- [ ] Disable debug logging
- [ ] Document results in report template
- [ ] Update SIGNAL_CLEANUP_PLAN.md with verification results

---

## Related Documentation

- [SIGNAL_CLEANUP_PLAN.md](SIGNAL_CLEANUP_PLAN.md) - Full cleanup plan and status
- [MEMORY_LEAK_DETECTION.md](MEMORY_LEAK_DETECTION.md) - Diagnostic infrastructure
- [docs/MEMORY_DEBUGGING_GUIDE.md](docs/MEMORY_DEBUGGING_GUIDE.md) - Investigation tools
- [GJS_MEMORY_MANAGEMENT_GUIDE.md](GJS_MEMORY_MANAGEMENT_GUIDE.md) - GJS memory concepts

---

**IMPORTANT NOTES:**

1. **VM Testing Required**: Per .clinerules, all testing must be done in VM, not on host machine
2. **User Deploys Code**: User controls when code is deployed via `make install`
3. **No Auto-Install**: Never run install/build commands without explicit user permission
4. **Memory Debug Mode**: Must be MANUALLY enabled/disabled for testing
5. **Baseline Critical**: Always record baseline before starting stress test

---

**Last Updated:** 2024-12-21
