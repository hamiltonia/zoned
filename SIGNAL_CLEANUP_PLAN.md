# Signal Cleanup & Memory Leak Fix Plan

**Created:** 2024-12-21  
**Updated:** 2024-12-21 (Phase 0 integration)  
**Status:** Phase 0 Complete, Phase 1+ In Progress  
**Priority:** BLOCKING 1.0 RELEASE  
**Root Cause:** 104 signal connections, only 32 disconnections → ~72 leaked connections

---

## Integration with Phase 0 (Completed Work)

This plan **builds upon** the diagnostic infrastructure completed in Phase 0:

✅ **What Phase 0 Delivered** (commits `d2f84ba`, `e7f665b`):
- Conditional logging via `logger.memdebug()`
- GSettings toggle for memory debug mode
- Instance tracking in `global.zonedDebug`
- D-Bus `GetMemoryReport()` method
- 4 classes converted to use global instance registry

🔨 **What This Plan Adds:**
- Signal tracking to `global.zonedDebug` (Phase 1)
- `SignalTracker` utility class (Phase 2)
- Systematic signal cleanup (Phases 3-4)
- Verification using Phase 0 + Phase 1 tools (Phase 5)

**All verification steps use the diagnostic tools from Phase 0.**

---

## Executive Summary

Automated audit of the codebase reveals the **primary cause** of the 271MB/30min memory leak:

- **104 signal connections** found (`.connect()` calls with arrow functions)
- **32 signal disconnections** found (`.disconnect()` calls)
- **~72 connections NEVER disconnected** 🚨

Per the [GJS Memory Management Guide](GJS_MEMORY_MANAGEMENT_GUIDE.md), arrow function closures capture `this` and create hidden references preventing garbage collection. Even after objects are "destroyed," these signal connections keep them alive in memory.

---

## Integration with Existing Plans

This plan **integrates with and extends** existing memory leak work:

### Relationship to MEMORY_LEAK_DETECTION.md
- **MEMORY_LEAK_DETECTION.md** → Adds `global.zonedDebug` tracking infrastructure
- **THIS PLAN** → Fixes the actual leaks by ensuring signals are disconnected
- **TOGETHER** → We add tracking, fix leaks, then verify with tracking

### Relationship to MEMORY_DEBUGGING_GUIDE.md
- **MEMORY_DEBUGGING_GUIDE.md** → Tools for investigating (Looking Glass, DevTools)
- **THIS PLAN** → Specific fixes based on investigation results

### Relationship to GJS_MEMORY_MANAGEMENT_GUIDE.md
- **GJS_MEMORY_MANAGEMENT_GUIDE.md** → Educational reference on GJS memory
- **THIS PLAN** → Application of those principles to Zoned's code

---

## Critical Findings from Code Audit

### Finding 1: Arrow Function Closures (104 instances)

**Problem Pattern:**
```javascript
this._settings.connect('changed::some-key', () => {
    this.doSomething();  // Captures 'this', creates hidden reference
});
```

**Per GJS Guide:**
> Arrow functions capture their enclosing scope. This creates hidden references that prevent garbage collection.

**File Breakdown:**
- `extension/prefs.js` → ~30 arrow function connects
- `extension/ui/layoutSwitcher/cardFactory.js` → ~20 hover effect connects
- `extension/ui/layoutSwitcher/topBar.js` → ~15 hover/click connects
- `extension/ui/layoutSettingsDialog.js` → ~15 hover/click connects
- `extension/extension.js` → 3 settings connects
- Others → ~21 connects

### Finding 2: Missing Disconnects (72+ instances)

**Disconnects found in:**
- `extension/extension.js` → 4 disconnects ✓
- `extension/prefs.js` → 4 disconnects (partial)
- `extension/keybindingManager.js` → 3 disconnects ✓
- `extension/utils/theme.js` → 2 disconnects ✓
- `extension/ui/layoutSwitcher.js` → ~10 disconnects (partial)
- Others → ~9 disconnects

**Missing disconnects in:**
- `extension/ui/layoutSwitcher/cardFactory.js` → 0 disconnects for ~20 connects
- `extension/ui/layoutSwitcher/topBar.js` → 0 disconnects for ~15 connects
- `extension/ui/layoutSettingsDialog.js` → 1 disconnect for ~15 connects
- `extension/ui/panelIndicator.js` → 0 disconnects for ~7 connects
- `extension/prefs.js` → Partial (many button clicks never disconnected)

### Finding 3: Cairo Disposal ✓ GOOD

**Good news:**
```javascript
canvas.connect('repaint', () => {
    // ... drawing code ...
    cr.$dispose();  // ✓ CORRECT
});
```

Cairo context disposal is already implemented correctly in `cardFactory.js`.

---

## Fix Strategy

### Phase 0: Diagnostic Infrastructure ✅ COMPLETED

**Status:** COMPLETED (commits `d2f84ba`, `e7f665b`)  
**Duration:** ~2 hours  
**Outcome:** Foundation for memory leak detection and verification

**What was implemented:**

#### 0.1 Conditional Memory Debug Logging ✅
- **File:** `extension/utils/debug.js`
- **Added:** `logger.memdebug()` method that only logs when `memory-debug` GSettings key is true
- **Pattern:**
  ```javascript
  logger.memdebug('Disconnecting ${count} signals');  // Only logs if memory-debug=true
  logger.info('Normal operation');                     // Always logs (if debug-logging=true)
  ```

#### 0.2 GSettings Integration ✅
- **File:** `extension/schemas/org.gnome.shell.extensions.zoned.gschema.xml`
- **Added:** `<key name="memory-debug" type="b">` with default `false`
- **File:** `extension/prefs.js`  
- **Added:** Memory Debug toggle in Developer Settings section
- **Usage:** Users can enable detailed memory logging without modifying code

#### 0.3 Instance Tracking Registry ✅
- **File:** `extension/extension.js`
- **Created:** `global.zonedDebug` object in `enable()`:
  ```javascript
  global.zonedDebug = {
      instances: new Map(),  // className → count
      
      trackInstance(className, increment) {
          const current = this.instances.get(className) || 0;
          const newCount = current + increment;
          this.instances.set(className, newCount);
          log(`[Zoned:Instance] ${className}: ${newCount} instances`);
      },
      
      getReport() {
          let report = 'Instance Counts:\n';
          for (const [className, count] of this.instances) {
              report += `  ${className}: ${count}\n`;
          }
          return report;
      }
  };
  ```
- **Cleanup:** Nullified in `disable()` to prevent leaks

#### 0.4 D-Bus Memory Reporting ✅
- **File:** `extension/utils/debugInterface.js`
- **Added:** `GetMemoryReport()` D-Bus method
- **Usage:**
  ```bash
  gdbus call --session \
    --dest org.gnome.Shell \
    --object-path /org/gnome/Shell/Extensions/Zoned \
    --method org.gnome.Shell.Extensions.Zoned.GetMemoryReport
  ```
- **Returns:** Instance counts from `global.zonedDebug.getReport()`

#### 0.5 Instance Tracking Conversion ✅
**Converted 4 classes to use global registry:**

1. **extension/templateManager.js**
   - Constructor: `global.zonedDebug?.trackInstance('TemplateManager', 1)`
   - destroy(): `global.zonedDebug?.trackInstance('TemplateManager', -1)`

2. **extension/utils/theme.js**
   - Same pattern for `ThemeManager`

3. **extension/ui/layoutPreviewBackground.js**
   - Same pattern for `LayoutPreviewBackground`

4. **extension/ui/layoutSwitcher.js**
   - Same pattern for `LayoutSwitcher`

**Old pattern removed:**
```javascript
let _instanceCount = 0;  // ← Deleted module-level variable
```

**Benefits of Phase 0:**
- ✅ Silent in production (memory-debug defaults to false)
- ✅ Detailed logging available for debugging
- ✅ Centralized instance tracking
- ✅ Remote querying via D-Bus
- ✅ Foundation for signal tracking (Phase 1)

---

### Phase 1: Enhance Signal Tracking Infrastructure

**Goal:** Add signal tracking to existing `global.zonedDebug` registry (built in Phase 0).

**Location:** `extension/extension.js` (enhance existing debug registry)

**Enhancement to existing code:**
```javascript
// In enable(), enhance existing global.zonedDebug:
global.zonedDebug = {
    instances: new Map(),
    signals: new Map(),  // ← ALREADY EXISTS in MEMORY_LEAK_DETECTION.md
    timeouts: new Set(),
    
    // ADD: Helper to track AND connect
    connectAndTrack(objectName, object, signal, handler) {
        const id = object.connect(signal, handler);
        
        if (!this.signals.has(objectName)) {
            this.signals.set(objectName, []);
        }
        this.signals.get(objectName).push({
            id,
            signal,
            stack: new Error().stack  // Capture where it was created
        });
        
        log(`[Zoned:Memory] Connected ${objectName}::${signal} (ID: ${id})`);
        return id;
    },
    
    // ADD: Helper to verify all disconnected
    verifyDisconnected() {
        let leaked = 0;
        for (const [objectName, signals] of this.signals) {
            if (signals.length > 0) {
                log(`⚠️ [Zoned:Memory] ${objectName} has ${signals.length} signals NOT disconnected:`);
                for (const {id, signal, stack} of signals) {
                    log(`   Signal ID ${id} (${signal})`);
                    log(`   Created at: ${stack.split('\n')[2]}`);
                }
                leaked += signals.length;
            }
        }
        return leaked;
    },
    
    // ... rest of existing methods from MEMORY_LEAK_DETECTION.md
};
```

### Phase 2: Create Helper Utilities

**Location:** `extension/utils/signalTracker.js` (NEW FILE)

**Purpose:** Reusable signal tracking for all components.

```javascript
/**
 * Signal tracking utility for memory leak prevention
 * Ensures all signal connections are properly disconnected
 */

import {createLogger} from './debug.js';

const logger = createLogger('SignalTracker');

export class SignalTracker {
    constructor(componentName) {
        this._componentName = componentName;
        this._signals = [];  // Array of {object, id}
    }
    
    /**
     * Connect a signal and track it for cleanup
     * @param {GObject.Object} object - Object to connect to
     * @param {string} signal - Signal name
     * @param {Function} handler - Signal handler (should be bound method)
     * @returns {number} Signal ID
     */
    connect(object, signal, handler) {
        const id = object.connect(signal, handler);
        this._signals.push({object, id, signal});
        
        global.zonedDebug?.connectAndTrack(this._componentName, object, signal, handler);
        
        logger.memdebug(`Connected ${this._componentName}::${signal} (ID: ${id})`);
        return id;
    }
    
    /**
     * Disconnect all tracked signals
     */
    disconnectAll() {
        logger.memdebug(`Disconnecting ${this._signals.length} signals for ${this._componentName}`);
        
        for (const {object, id, signal} of this._signals) {
            try {
                object.disconnect(id);
                logger.memdebug(`  ✓ Disconnected ${signal} (ID: ${id})`);
            } catch (e) {
                logger.warn(`  ✗ Failed to disconnect ${signal} (ID: ${id}): ${e.message}`);
            }
        }
        
        this._signals = [];
    }
    
    /**
     * Get count of active signals
     */
    get count() {
        return this._signals.length;
    }
}
```

### Phase 3: Fix Files by Priority

**Wave 1: CRITICAL - Global Objects** (Highest memory impact)

These signals connect to long-lived global objects and are NEVER garbage collected until disconnected.

#### 3.1 extension/extension.js

**Current violations:**
```javascript
// Line ~45 (approximate)
this._showIndicatorSignal = this._settings.connect('changed::show-panel-indicator', () => {
    const show = this._settings.get_boolean('show-panel-indicator');
    // ...
});

// Line ~60
this._conflictCountSignal = this._settings.connect('changed::keybinding-conflict-count', () => {
    logger.debug('Conflict count changed by prefs, re-detecting...');
    // ...
});

// Line ~75
this._previewSignal = this._settings.connect('changed::center-notification-preview', () => {
    if (this._settings.get_boolean('center-notification-preview')) {
        // ...
    }
});
```

**Fix:**
```javascript
// In enable():
this._boundOnShowIndicatorChanged = this._onShowIndicatorChanged.bind(this);
this._showIndicatorSignal = this._settings.connect('changed::show-panel-indicator', 
    this._boundOnShowIndicatorChanged);

this._boundOnConflictCountChanged = this._onConflictCountChanged.bind(this);
this._conflictCountSignal = this._settings.connect('changed::keybinding-conflict-count',
    this._boundOnConflictCountChanged);

this._boundOnPreviewChanged = this._onPreviewChanged.bind(this);
this._previewSignal = this._settings.connect('changed::center-notification-preview',
    this._boundOnPreviewChanged);

// Add methods:
_onShowIndicatorChanged() {
    const show = this._settings.get_boolean('show-panel-indicator');
    // ... existing logic
}

_onConflictCountChanged() {
    logger.debug('Conflict count changed by prefs, re-detecting...');
    // ... existing logic
}

_onPreviewChanged() {
    if (this._settings.get_boolean('center-notification-preview')) {
        // ... existing logic
    }
}

// In disable() - enhance existing cleanup:
if (this._showIndicatorSignal && this._settings) {
    this._settings.disconnect(this._showIndicatorSignal);
    this._showIndicatorSignal = null;
}
this._boundOnShowIndicatorChanged = null;  // NEW: Release bound function

// Repeat for other signals...
```

**Status:** Partial disconnects exist ✓, need to add bound function cleanup

#### 3.2 extension/utils/theme.js

**Current status:** Already has disconnects ✓

**Enhancement needed:**
```javascript
// In destroy(), add after disconnects:
this._boundOnUserPrefChanged = null;
this._boundOnSystemThemeChanged = null;
```

#### 3.3 extension/keybindingManager.js

**Current status:** Already has disconnects ✓

**No changes needed** (already compliant)

---

**Wave 2: HIGH - UI Component Lifecycles**

These components are created/destroyed frequently (LayoutSwitcher, dialogs).

#### 3.4 extension/ui/layoutSwitcher.js

**Current violations:**
```javascript
// Line ~200 (approximate) - key press handler
const wrapperKeySignalId = wrapper.connect('key-press-event', (actor, event) => {
    if (event.get_key_symbol() === Clutter.KEY_Escape) {
        // ...
    }
});
```

**Current status:** Partial cleanup exists, but many signals not tracked

**Fix using SignalTracker:**
```javascript
import {SignalTracker} from '../utils/signalTracker.js';

class LayoutSwitcher {
    constructor() {
        this._signalTracker = new SignalTracker('LayoutSwitcher');
        // ...
    }
    
    show() {
        // Instead of:
        // wrapper.connect('key-press-event', (actor, event) => { ... });
        
        // Use:
        this._boundOnKeyPress = this._onKeyPress.bind(this);
        this._signalTracker.connect(wrapper, 'key-press-event', this._boundOnKeyPress);
        
        // For GLOBAL stage signals (critical!):
        this._signalTracker.connect(global.stage, 'motion-event', this._boundOnMotion);
    }
    
    _onKeyPress(actor, event) {
        if (event.get_key_symbol() === Clutter.KEY_Escape) {
            // ... existing logic
        }
    }
    
    destroy() {
        // Disconnect ALL signals
        this._signalTracker.disconnectAll();
        
        // Release bound functions
        this._boundOnKeyPress = null;
        this._boundOnMotion = null;
        
        // ... existing cleanup
    }
}
```

#### 3.5 extension/ui/layoutSettingsDialog.js

**Current violations:** ~15 connects, only 1 disconnect

**Fix:** Use SignalTracker pattern (same as layoutSwitcher.js)

#### 3.6 extension/ui/panelIndicator.js

**Current violations:**
```javascript
// Line ~80 - menu open state
this.menu.connect('open-state-changed', (menu, isOpen) => {
    if (isOpen) {
        // ...
    }
});

// Line ~100 - layout item clicks
layoutItem.connect('activate', () => {
    this._onLayoutSelected(layout.id);
});
```

**Fix:** Track all signals, disconnect in destroy()

---

**Wave 3: MEDIUM - Transient UI (Hover Effects)**

These have lower individual impact but high volume.

#### 3.7 extension/ui/layoutSwitcher/cardFactory.js

**Current violations:** ~20 hover effect connects, 0 disconnects

**Problem:**
```javascript
// Line ~300
const enterId = button.connect('enter-event', () => {
    button.style = hoverStyle;
});

const leaveId = button.connect('leave-event', () => {
    button.style = idleStyle;
});

// These IDs are RETURNED but never stored for cleanup!
```

**Two fix options:**

**Option A: Track and disconnect** (most thorough)
```javascript
export function createCard(layout, ctx) {
    // Store signal IDs on the card object itself
    const card = new St.Button(...);
    card._hoverSignals = [];
    
    const enterId = button.connect('enter-event', () => {
        button.style = hoverStyle;
    });
    const leaveId = button.connect('leave-event', () => {
        button.style = idleStyle;
    });
    
    card._hoverSignals.push({object: button, ids: [enterId, leaveId]});
    
    // When card is destroyed (track in LayoutSwitcher):
    // for (const {object, ids} of card._hoverSignals) {
    //     for (const id of ids) object.disconnect(id);
    // }
    
    return card;
}
```

**Option B: WeakRef** (for truly transient UI)
```javascript
const weakButton = new WeakRef(button);
button.connect('enter-event', () => {
    const btn = weakButton.deref();
    if (btn) btn.style = hoverStyle;
});
```

**Recommendation:** Option A (explicit cleanup) for cards that are recreated on every show.

#### 3.8 extension/ui/layoutSwitcher/topBar.js

**Current violations:** ~15 hover/click connects

**Fix:** Same pattern as cardFactory.js

#### 3.9 extension/ui/layoutSwitcher/resizeHandler.js

**Current violations:**
```javascript
// Line ~80
ctx._resizeMotionId = global.stage.connect('motion-event', (actor, event) => {
    return onResizeMotion(ctx, event);
});

ctx._resizeButtonReleaseId = global.stage.connect('button-release-event', (actor, event) => {
    if (event.get_button() === 1) {
        // ...
    }
});
```

**Current status:** Has disconnects ✓

**Enhancement:** Remove arrow functions, use bound methods

---

**Wave 4: LOW PRIORITY - Preferences Window**

Prefs run in separate process and are closed when window closes, but still should be clean.

#### 3.10 extension/prefs.js

**Current violations:** ~30 connects, ~4 disconnects

**Fix:** Track all button click/toggle handlers, disconnect on window close

---

## Phase 4: Systematic Refactor Pattern

For EACH file that needs fixing:

### Step 1: Add SignalTracker
```javascript
import {SignalTracker} from './utils/signalTracker.js';  // Adjust path

class MyComponent {
    constructor() {
        this._signalTracker = new SignalTracker('MyComponent');
    }
}
```

### Step 2: Convert Arrow Functions to Bound Methods
```javascript
// BEFORE:
someObject.connect('signal', () => {
    this.doSomething();
});

// AFTER:
this._boundOnSignal = this._onSignal.bind(this);
this._signalTracker.connect(someObject, 'signal', this._boundOnSignal);

_onSignal() {
    this.doSomething();
}
```

### Step 3: Add Cleanup
```javascript
destroy() {
    this._signalTracker.disconnectAll();
    
    // Release bound functions
    this._boundOnSignal = null;
    this._boundOnOtherSignal = null;
    
    // ... rest of cleanup
}
```

---

## Phase 5: Verification Protocol

**Uses Phase 0 diagnostic infrastructure for comprehensive verification**

### After Each Wave

#### 5.1 D-Bus Memory Report (Phase 0 Tool) 🔧
```bash
# Get comprehensive report using Phase 0 infrastructure
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/Zoned \
  --method org.gnome.Shell.Extensions.Zoned.GetMemoryReport

# Output should show (once Phase 1 complete):
# - Instance counts (Phase 0 ✅)
# - Active signal counts (Phase 1 enhancement)
# - All counts should return to baseline after stress test
```

#### 5.2 Memory Debug Logging (Phase 0 Tool) 🔧
```bash
# Enable detailed cleanup logging using Phase 0 toggle
gsettings set org.gnome.shell.extensions.zoned memory-debug true

# Run tests, watch journal for Phase 0 memdebug output:
journalctl -f -o cat /usr/bin/gnome-shell

# Look for:
# - "[Zoned:LayoutSwitcher] [MEMDEBUG] Disconnecting N signals"
# - "[Zoned:LayoutSwitcher] [MEMDEBUG]   ✓ Disconnected signal..."
# - "[Zoned:SignalTracker] [MEMDEBUG] Connected..." (Phase 2)
# - No error messages

# Disable when done
gsettings set org.gnome.shell.extensions.zoned memory-debug false
```

#### 5.3 Looking Glass + global.zonedDebug (Phase 0 + Phase 1)
```javascript
// Before test
Main.uiGroup.get_n_children()  // Note baseline count

// Run stress test (e.g., open/close LayoutSwitcher 10x)

// After test - verify cleanup
System.gc()
System.gc()
Main.uiGroup.get_n_children()  // Should be same +/- 5

// Phase 0: Check instance counts
global.zonedDebug?.getReport()
// Expected: All instance counts at 0 or baseline

// Phase 1: Check for signal leaks (once Phase 1 complete)
global.zonedDebug?.verifyDisconnected()  
// Expected: returns 0 (no leaked signals)
```

#### 5.4 Memory Measurement (Baseline)
```bash
# Before test
ps aux | grep gnome-shell | awk '{print "Memory: " $6 " KB"}'

# Run 30-minute stress test
make vm-test-ui-stress  # Or equivalent

# After test
ps aux | grep gnome-shell | awk '{print "Memory: " $6 " KB"}'

# Memory growth should decrease after each wave:
# Before fixes:  ~271MB growth
# After Wave 1:  ~150MB growth (50% reduction)
# After Wave 2:  ~50MB growth (80% reduction)  
# After Wave 3:  <20MB growth (SUCCESS ✅)
```

---

### Verification Checklist

After each phase, verify using Phase 0 + Phase 1 tools:

- [ ] **D-Bus Report**: Instance counts at baseline
- [ ] **D-Bus Report**: Signal counts at 0 (Phase 1+)
- [ ] **memdebug Logs**: All signals disconnected cleanly
- [ ] **Looking Glass**: Actor count returns to baseline
- [ ] **Memory**: Growth reduced vs previous wave
- [ ] **Console**: No finalization warnings

**All tools provided by Phase 0 infrastructure** ✅

---

## Phase 6: File-by-File Checklist

Use this checklist to track progress:

### Critical Priority (Wave 1)
- [ ] `extension/extension.js` - Remove arrow functions, verify bound function cleanup
- [ ] `extension/utils/theme.js` - Add bound function cleanup (has disconnects)
- [ ] `extension/keybindingManager.js` - ✓ Already compliant (verify)

### High Priority (Wave 2)
- [ ] `extension/ui/layoutSwitcher.js` - Implement SignalTracker
- [ ] `extension/ui/layoutSettingsDialog.js` - Implement SignalTracker
- [ ] `extension/ui/panelIndicator.js` - Track menu signals
- [ ] `extension/ui/notificationManager.js` - Verify allocation signal cleanup
- [ ] `extension/ui/zoneEditor.js` - Track button/hover signals

### Medium Priority (Wave 3)
- [ ] `extension/ui/layoutSwitcher/cardFactory.js` - Store hover signal IDs
- [ ] `extension/ui/layoutSwitcher/topBar.js` - Store hover signal IDs
- [ ] `extension/ui/layoutSwitcher/resizeHandler.js` - Remove arrow functions
- [ ] `extension/ui/layoutSwitcher/sectionFactory.js` - Track scroll signals
- [ ] `extension/ui/layoutPreviewBackground.js` - Track button signals
- [ ] `extension/ui/confirmDialog.js` - Track hover signals

### Low Priority (Wave 4)
- [ ] `extension/prefs.js` - Track all button/toggle signals

### Verification Files (Already Good ✓)
- [x] `extension/ui/layoutSwitcher/cardFactory.js` - Cairo disposal present
- [x] `extension/keybindingManager.js` - Has proper disconnects
- [x] `extension/utils/theme.js` - Has proper disconnects

---

## Expected Timeline

| Phase | Duration | Outcome |
|-------|----------|---------|
| Phase 1: Add tracking infrastructure | 1 hour | global.zonedDebug enhanced |
| Phase 2: Create SignalTracker utility | 1 hour | Reusable helper ready |
| Phase 3: Wave 1 fixes | 2 hours | 50% memory reduction |
| Phase 3: Wave 2 fixes | 3 hours | 80% memory reduction |
| Phase 3: Wave 3 fixes | 2 hours | 90%+ memory reduction |
| Phase 4: Prefs cleanup | 1 hour | Complete coverage |
| Phase 5: Full verification | 2 hours | Confirm <20MB growth |
| **Total** | **12 hours** | **Memory leak fixed** |

---

## Success Criteria

### Quantitative
- ✅ Memory growth over 30 minutes: **<20MB** (vs current 271MB)
- ✅ Actor count after GC returns to baseline: **±5 actors**
- ✅ `global.zonedDebug.verifyDisconnected()`: **0 leaked signals**
- ✅ Signal connections === disconnections: **104 connects → 104 disconnects**

### Qualitative
- ✅ All `.connect()` calls use bound methods (no arrow functions)
- ✅ All `.connect()` calls have corresponding `.disconnect()`
- ✅ All bound functions released in cleanup (`= null`)
- ✅ SignalTracker used in all major components
- ✅ No warnings in console about finalized objects

---

## Coordination Points for Multiple Agents

### If Working in Parallel

**Agent A - Infrastructure:**
- Phase 1: Enhance global.zonedDebug
- Phase 2: Create SignalTracker utility
- Test infrastructure works

**Agent B - Extension Core:**
- Phase 3 Wave 1: Fix extension.js, theme.js, keybindingManager.js
- Verify with: `global.zonedDebug.verifyDisconnected()`

**Agent C - UI Components:**
- Phase 3 Wave 2: Fix layoutSwitcher.js, layoutSettingsDialog.js, panelIndicator.js
- Verify with: Looking Glass actor count

**Agent D - Transient UI:**
- Phase 3 Wave 3: Fix cardFactory.js, topBar.js, hover effects
- Verify with: Memory measurement

### Merge Order
1. Agent A merges infrastructure first (Phases 1-2)
2. Agent B merges extension core (depends on infrastructure)
3. Agents C & D merge in parallel (both depend on infrastructure)
4. Final verification by any agent (Phase 5)

### Communication
- Use `global.zonedDebug.report()` output to share results
- Post memory measurements before/after each wave
- Flag any unexpected behaviors in coordination channel

---

## Reference Documentation

- [GJS Memory Management Guide](GJS_MEMORY_MANAGEMENT_GUIDE.md) - Educational reference
- [Memory Leak Detection Spec](MEMORY_LEAK_DETECTION.md) - Tracking infrastructure
- [Memory Debugging Guide](docs/MEMORY_DEBUGGING_GUIDE.md) - Investigation tools

---

## Notes

- **Cairo contexts**: Already handled correctly ✓ (`cr.$dispose()` present)
- **Settings objects**: Must be BOTH disconnected AND nullified
- **Global objects**: Highest leak risk (Main.*, global.*, settings)
- **Arrow functions**: Create hidden closures that prevent GC
- **Bound functions**: Also create references, must be released (`= null`)

---

**Last Updated:** 2024-12-21  
**Next Review:** After Phase 1 completion
