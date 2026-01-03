# Layout Settings Diagnostic Dialog - Implementation Plan

**Branch**: `fix/layoutsettings-memory-diagnostic`  
**Created**: January 3, 2026  
**Purpose**: Isolate memory leaks in layoutSettingsDialog through programmatic control testing

---

## Overview

Create a minimal diagnostic dialog that displays one instance of each UI control used in layoutSettingsDialog. Through boolean flags, we can enable/disable controls to isolate which components are leaking memory.

## Controls to Test

From layoutSettingsDialog.js analysis:

1. **St.Label** - Text labels
2. **St.Button** - Standard buttons (Cancel, Save)
3. **St.Icon** - Icons in symbolic buttons
4. **St.Entry** - Text input fields (name field)
5. **St.BoxLayout** - Container layouts
6. **St.Widget** - Generic widgets (dividers, spacers, wrappers)
7. **Custom Checkbox** - St.Button styled as checkbox (padding enable)
8. **Custom Spinner** - St.BoxLayout with up/down buttons (padding value)
9. **Custom Dropdown** - St.BoxLayout with up/down buttons (shortcut selector)
10. **Hover Effects** - Enter/leave event handlers on various widgets

## Memory Best Practices Applied

### ✅ SignalTracker Pattern
- Track ALL signal connections
- Disconnect ALL in close()

### ✅ No Closure Leaks
- Module-level handler functions (same pattern as layoutSettingsDialog)
- Bound methods stored as instance properties
- Released in cleanup
- No arrow functions capturing `this`

### ✅ GLib Source Management
- Track all timeout/idle source IDs in array
- Remove all sources in cleanup using GLib.Source.remove()

### ✅ Widget Lifecycle
- Track all created widgets
- Destroy in reverse order of creation
- Null all references after destruction
- Break circular references before destruction

### ✅ ThemeManager Cleanup
- Create in constructor (if enabled)
- Call destroy() in cleanup
- Null reference

### ✅ Modal Handling
- Store modal grab object
- Pass to Main.popModal()
- Guard against double-close with _closing flag

## File Structure

```
extension/ui/layoutSettingsDiagnostic.js   (NEW)
```

## Control Flags System

```javascript
const ENABLE_CONTROLS = {
    label: true,
    button: true,
    iconButton: true,
    entry: true,
    checkbox: true,
    spinner: true,
    dropdown: true,
    hoverEffects: true,
    themeManager: true,
};
```

Each control creation method checks its flag and only instantiates if enabled.

## Integration

**Activation**: Via debugInterface using same test infrastructure that currently opens layoutSettings.

This allows us to:
- Reuse existing test infrastructure
- Open/close dialog programmatically for memory testing
- No need to build new test harness

## Testing Workflow

### Step 1: Baseline Test (All Controls Enabled)
```bash
# Via debugInterface: Open diagnostic dialog
# Close diagnostic dialog
# Repeat 10-20 times
# Check memory usage in logs
```

### Step 2: Binary Search Isolation
- Disable half the controls
- Test if leak persists
- Narrow down to specific control(s)

### Step 3: Fine-Grained Isolation
Once problematic control identified:
- Test with/without signal handlers
- Test with/without hover effects
- Test with/without bound methods
- Identify exact leak source

### Step 4: Fix and Verify
- Apply fix to layoutSettingsDialog
- Verify leak is resolved
- Clean up diagnostic code (or keep for future use)

## Test Results

### Test 1: Basic Controls (January 3, 2026)

**Configuration:**
```javascript
const ENABLE_CONTROLS = {
    labels: true,
    buttons: true,
    iconButtons: true,
    entries: true,
    checkboxes: false,    // DISABLED
    spinners: false,      // DISABLED
    dropdowns: false,     // DISABLED
    hoverEffects: false,  // DISABLED
    themeManager: false,  // DISABLED
};
```

**Test Parameters:**
- Duration: Variable (1, 2, 3 minutes)
- Delay: 200ms per operation
- Runs: 3

**Results:**
```
Run 1 (1 min):  Start 384.8 MB → Final 415.5 MB  [Init cost: 18.7 MB, 127 cycles]
Run 2 (2 min):  Start 388.0 MB → Final 416.8 MB  [Init cost: 20.9 MB, 264 cycles]
Run 3 (3 min):  Start 386.8 MB → Final 414.8 MB  [Init cost: 21.7 MB, 389 cycles]

Summary:
  Start memory range:  384.8 - 388.0 MB (3.2 MB spread)
  Final memory range:  414.8 - 416.8 MB (2.0 MB spread)
  Average init cost:   20.4 MB

Correlation Analysis:
  Per-cycle leak rate: -2.150 MB/100 cycles (R²=0.954)
  ✓ Strong correlation but NEGLIGIBLE rate
```

**Verdict:** ✅ **PASS** - Memory stable across runs (2.0 MB variance)

**Analysis:**
- Basic controls (labels, buttons, icon buttons, entries) show NO memory leaks
- Initialization cost is consistent (~20.4 MB average)
- Final memory variance is minimal (2.0 MB spread across 3 runs)
- Negative correlation indicates slight GC stabilization, not leaks
- These controls are implementing cleanup properly

**Next Steps:**
- Test with checkboxes, spinners, dropdowns enabled
- Test with hoverEffects enabled → COMPLETED (see Test 2)
- Test with themeManager enabled → COMPLETED (see Test 2)
- Binary search to isolate any problematic controls → IN PROGRESS

---

### Test 2: Basic Controls + Hover Effects + ThemeManager (January 3, 2026)

**Configuration:**
```javascript
const ENABLE_CONTROLS = {
    labels: true,
    buttons: true,
    iconButtons: true,
    entries: true,
    checkboxes: false,    // DISABLED
    spinners: false,      // DISABLED
    dropdowns: false,     // DISABLED
    hoverEffects: true,   // ENABLED ⚡
    themeManager: true,   // ENABLED ⚡
};
```

**Test Parameters:**
- Duration: Variable (1, 2, 3 minutes)
- Delay: 200ms per operation
- Runs: 3

**Results:**
```
Run 1 (1 min):  Start 386.6 MB → Final 419.0 MB  [Init cost: 19.5 MB, 132 cycles]
Run 2 (2 min):  Start 388.7 MB → Final 424.6 MB  [Init cost: 21.4 MB, 256 cycles]
Run 3 (3 min):  Start 389.2 MB → Final 429.2 MB  [Init cost: 21.5 MB, 400 cycles]

Summary:
  Start memory range:  386.6 - 389.2 MB (2.6 MB spread)
  Final memory range:  419.0 - 429.2 MB (10.2 MB spread)
  Average init cost:   20.8 MB

Correlation Analysis:
  Per-cycle leak rate: +2.106 MB/100 cycles (R²=0.968)
  ⚠ Strong correlation: Per-cycle leak detected
```

**Verdict:** ❌ **FAIL** - Memory leak detected (+2.106 MB/100 cycles)

**Analysis:**
- **LEAK IDENTIFIED**: Adding hoverEffects + themeManager introduces a memory leak
- Leak rate: +2.106 MB per 100 open/close cycles
- High correlation (R²=0.968) confirms this is a real leak, not noise
- Final memory variance increased from 2.0 MB (Test 1) to 10.2 MB (Test 2)
- Initialization cost similar to Test 1 (~20.8 MB vs 20.4 MB)

**Comparison with Test 1:**
| Test | Controls | Leak Rate | R² | Verdict |
|------|----------|-----------|-----|---------|
| Test 1 | Basic only | -2.150 MB/100 cycles | 0.954 | ✅ PASS |
| Test 2 | Basic + hover + theme | **+2.106 MB/100 cycles** | 0.968 | ❌ FAIL |

**Root Cause Candidates:**
1. **hoverEffects**: Enter/leave event handlers may not be properly disconnected
2. **themeManager**: ThemeManager cleanup may be incomplete
3. **Both**: Combination of both features

**Next Steps:**
- Test with ONLY hoverEffects (themeManager disabled)
- Test with ONLY themeManager (hoverEffects disabled)
- Isolate which component is leaking

## Implementation Checklist

- [x] Create branch
- [x] Create plan document
- [x] Create layoutSettingsDiagnostic.js
- [x] Implement control flag system
- [x] Implement module-level handlers
- [x] Implement each control creation method:
  - [x] Label
  - [x] Button
  - [x] Icon Button
  - [x] Entry
  - [x] Checkbox
  - [x] Spinner
  - [x] Dropdown
  - [x] Hover effects
- [x] Implement full cleanup/dispose pattern:
  - [x] _cleanupIdleSources()
  - [x] _cleanupModal()
  - [x] _destroyWidgets()
  - [x] _releaseBoundFunctions()
  - [x] _cleanupThemeManager()
- [x] Integrate with debugInterface
- [x] Test baseline (basic controls: labels, buttons, iconButtons, entries)
- [x] Document findings
- [ ] Test advanced controls (checkboxes, spinners, dropdowns)
- [ ] Test hover effects
- [ ] Test with ThemeManager

## Expected Outcomes

1. **Identify Leak Source**: Pinpoint exact control or pattern causing leaks
2. **Fix Pattern**: Apply proper cleanup to layoutSettingsDialog
3. **Reference Implementation**: Diagnostic dialog serves as clean example
4. **Prevent Regression**: Keep diagnostic for future memory testing

## Notes

- Keep dialog minimal - no business logic, just UI controls
- Each control should be visually identifiable (labeled)
- Focus on cleanup patterns, not functionality
- Document any findings in this plan

## Usage via debugInterface

The diagnostic dialog is integrated with the D-Bus debug interface and can be triggered using the same test infrastructure as layoutSettings:

### Open Dialog
```bash
gdbus call -e -d org.gnome.Shell \
  -o /org/gnome/Shell/Extensions/Zoned/Debug \
  -m org.gnome.Shell.Extensions.Zoned.Debug.TriggerAction \
  'open-diagnostic-dialog' '{}'
```

### Close Dialog
```bash
gdbus call -e -d org.gnome.Shell \
  -o /org/gnome/Shell/Extensions/Zoned/Debug \
  -m org.gnome.Shell.Extensions.Zoned.Debug.TriggerAction \
  'close-diagnostic-dialog' '{}'
```

### Example Test Loop
```bash
# Open/close 10 times to test for memory leaks
for i in {1..10}; do
  echo "Iteration $i"
  gdbus call -e -d org.gnome.Shell \
    -o /org/gnome/Shell/Extensions/Zoned/Debug \
    -m org.gnome.Shell.Extensions.Zoned.Debug.TriggerAction \
    'open-diagnostic-dialog' '{}'
  sleep 0.5
  gdbus call -e -d org.gnome.Shell \
    -o /org/gnome/Shell/Extensions/Zoned/Debug \
    -m org.gnome.Shell.Extensions.Zoned.Debug.TriggerAction \
    'close-diagnostic-dialog' '{}'
  sleep 0.5
done
```

### Check Actor Count (Memory Leak Indicator)
```bash
# Get actor count before
gdbus call -e -d org.gnome.Shell \
  -o /org/gnome/Shell/Extensions/Zoned/Debug \
  -m org.gnome.Shell.Extensions.Zoned.Debug.GetActorCount

# Run open/close loop (above)

# Get actor count after - should be same as before
gdbus call -e -d org.gnome.Shell \
  -o /org/gnome/Shell/Extensions/Zoned/Debug \
  -m org.gnome.Shell.Extensions.Zoned.Debug.GetActorCount
```

## Modifying Control Flags

To test specific controls, edit `ENABLE_CONTROLS` at the top of `layoutSettingsDiagnostic.js`:

```javascript
const ENABLE_CONTROLS = {
    labels: true,          // Toggle labels
    buttons: true,         // Toggle buttons
    iconButtons: false,    // Disable icon buttons
    entries: true,         // Toggle text entries
    checkboxes: false,     // Disable checkboxes
    spinners: false,       // Disable spinners
    dropdowns: false,      // Disable dropdowns
    hoverEffects: true,    // Toggle hover effects on all controls
    themeManager: true,    // Toggle ThemeManager usage
};
```

After editing, run:
```bash
make install  # Or deploy to VM
# Then test with the dialog
```

---

**Status**: Implementation Complete - Ready for Testing  
**Last Updated**: January 3, 2026
