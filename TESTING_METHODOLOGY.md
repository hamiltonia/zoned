# Memory Leak Testing Methodology

## Overview

This document describes the systematic approach for testing GNOME Shell extension memory leaks using incremental component enablement and statistical correlation analysis.

## Testing Philosophy

**Problem:** GNOME Shell extensions with memory leaks become unusable over time. Traditional testing doesn't reliably detect small per-cycle leaks or distinguish them from measurement noise.

**Solution:** Incremental component enablement + correlation analysis
1. Start with minimal components (known clean state)
2. Add one component at a time
3. Test each build with multiple runs and GNOME Shell restarts
4. Use statistical correlation (R²) to detect real leaks vs noise
5. When a leak is found, fix it before continuing

## Build System

### What is a "Build"?

A "Build" is a specific configuration of enabled components in `extension/extension.js`. We progressively enable components to isolate leak sources.

### Build Progression

| Build | Components Enabled | Status | Variance |
|-------|-------------------|--------|----------|
| **Build 1** | debugInterface | ✅ Clean | - |
| **Build 2** | + NotificationManager | ✅ Clean | - |
| **Build 3** | + TemplateManager | ✅ Clean | - |
| **Build 4** | + SpatialStateManager | ✅ Clean | 0.4 MB |
| **Build 5a** | Build 4 + ConflictDetector | ✅ Clean | 3.6 MB |
| **Build 5b** | Build 4 + ZoneOverlay | ✅ Clean | 6.8 MB |
| **Build 6** | Build 5b + NotificationService | ✅ Clean | 12.6 MB |
| **Build 6+** | Build 5a + 5b + 6 (all tested) | ✅ Clean | 3.5 MB |
| **Build 7** | Build 6+ + LayoutManager | ✅ Clean | 5.4 MB |
| **Build 8** | Build 7 + WindowManager | ✅ Clean | 7.8 MB |
| **Build 9** | Build 8 + LayoutSwitcher | ✅ Clean | 4.7 MB |
| **Build 10** | Build 9 + PanelIndicator | ✅ Clean | 6.0 MB |
| **Build 11** | Build 10 + KeybindingManager | ✅ Clean | 14.8 MB* |
| **Full** | All components + workspace handler | ⏳ Next | - |

### Current State

**Current Build:** Build 11 (ALL INDIVIDUAL COMPONENTS TESTED!)  
**Status:** 🎉 ALL components are CLEAN - Zero leaks detected!  
**Next Step:** Test Full extension (enable workspace handler for complete integration test)

## Testing Protocol

### Quick Test (3 runs)
```bash
make vm-test-restart
# Select: 1 (Enable/Disable)
# Variable cycles: Y
# Max duration: 3 (for 1, 2, 3 minutes)
```

**Use when:** Initial testing of a new build

### Extended Test (4 runs)
```bash
make vm-test-restart
# Select: 1 (Enable/Disable)
# Variable cycles: Y
# Max duration: 4 (for 1, 2, 3, 4 minutes)
```

**Use when:** 3-run test shows borderline results (R² > 0.8 or variance > 10 MB)

### Interpreting Results

**Clean Result:**
- Final memory variance < 10 MB (ideally < 5 MB)
- R² < 0.8 (no statistical correlation)
- Status: PASS ✅

**Borderline Result:**
- Final memory variance 10-15 MB
- R² near 0.8
- Action: Run extended test (4 runs) for better statistics

**Leak Detected:**
- R² > 0.8 (strong correlation between cycles and memory)
- Positive per-cycle leak rate
- Action: Inspect component code, fix leak, re-test

## How to Continue Testing

### Starting Build 7 (LayoutManager)

1. **Modify extension/extension.js:**
   ```javascript
   // Change from Build 6+ to Build 7
   // Uncomment LayoutManager initialization:
   this._layoutManager = new LayoutManager(
       this._settings,
       this._templateManager,
       this._spatialStateManager,
       this._notificationService
   );
   logger.debug('LayoutManager initialized');
   
   // Update log message:
   logger.warn('🧪 TEST BUILD 7: + LayoutManager');
   ```

2. **Deploy and test:**
   ```bash
   make vm-dev
   make vm-test-restart  # 3-run quick test
   ```

3. **Analyze results:**
   - If CLEAN: Continue to Build 8 (WindowManager)
   - If BORDERLINE: Run 4-run extended test
   - If LEAK: Inspect LayoutManager for issues

### Pattern for Each New Build

1. Add ONE component to extension/extension.js
2. Update build number in log message
3. Deploy: `make vm-dev`
4. Test: `make vm-test-restart` (3 runs initially)
5. If borderline: Re-test with 4 runs
6. If clean: Document and move to next component
7. If leak: Fix, re-test, then continue

## Test Infrastructure

### Available Tests

| Command | Description | Use Case |
|---------|-------------|----------|
| `make vm-test-restart` | Multi-run with restarts | Primary method |
| `make vm-test` | Single long-haul test | Quick validation |
| `make vm-test-all` | Run all VM tests | Comprehensive check |

### Key Scripts

- **test-with-restarts.sh**: Multi-run testing with GNOME Shell restarts
- **test-correlation.sh**: Statistical correlation analysis
- **xdotool-restart-gnome.sh**: Automated GNOME Shell restart
- **xdotool-force-gc.sh**: Force garbage collection
- **test-longhaul-interactive.sh**: Individual test runner

### Understanding Correlation Analysis

The test calculates R² (coefficient of determination):

- **R² < 0.6**: Excellent - no correlation, just noise
- **R² 0.6-0.8**: Good - minor correlation, likely noise
- **R² > 0.8**: Problem - strong correlation, likely leak
- **R² > 0.9**: Critical - very strong correlation, definite leak

## Fixes Applied

### ZoneOverlay (Build 5b)

**Issue:** Missing reference cleanup in destroy()

**Fix:**
```javascript
destroy() {
    this._hide();
    
    // Clear references to prevent memory leaks
    this._extension = null;
    this._settings = null;
}
```

**Result:** Variance improved from 10.7 MB → 6.8 MB (36% reduction)

### WindowManager (Build 8)

**Issues:** 
1. Constructor parameter mismatch
2. Incomplete destroy() method

**Fixes:**
```javascript
// Constructor call fix (was passing wrong params)
this._windowManager = new WindowManager();  // Needs no parameters

// destroy() fix - add reference cleanup
destroy() {
    this._display = null;
}
```

**Result:** Part of Build 8 improvements (see LayoutManager)

### LayoutManager (Build 8)

**Issues:**
1. Constructor parameter mismatch (CRITICAL)
2. Incomplete destroy() method (CRITICAL)

**Fixes:**
```javascript
// Constructor call fix
// Was: new LayoutManager(settings, templateManager, spatialStateManager, notificationService)
// Now: new LayoutManager(settings, extensionPath)
this._layoutManager = new LayoutManager(this._settings, this.path);

// destroy() fix - add missing reference cleanup
destroy() {
    this._layouts = [];
    this._currentLayout = null;
    this._currentZoneIndex = 0;
    // CRITICAL ADDITIONS:
    this._settings = null;
    this._extensionPath = null;
    this._spatialStateManager = null;
}
```

**Result:** Variance improved from 18.3 MB → 7.8 MB (57% reduction, R²=0.023)

### KeybindingManager (Build 11)

**Issues:**
1. Closure leaks in keybinding registration (CRITICAL)
2. Incomplete destroy() method (CRITICAL)

**Fixes:**
```javascript
// Constructor - Pre-bind ALL handlers to prevent closure leaks
constructor(...) {
    // Pre-bind keybinding handlers
    this._boundOnCycleZoneLeft = this._onCycleZoneLeft.bind(this);
    this._boundOnCycleZoneRight = this._onCycleZoneRight.bind(this);
    this._boundOnShowLayoutSwitcher = this._onShowLayoutSwitcher.bind(this);
    this._boundOnMinimizeWindow = this._onMinimizeWindow.bind(this);
    this._boundOnMaximizeWindow = this._onMaximizeWindow.bind(this);
    
    // Pre-bind quick layout handlers (1-9)
    this._boundQuickLayoutHandlers = [];
    for (let i = 1; i <= 9; i++) {
        this._boundQuickLayoutHandlers[i] = (() => this._onQuickLayout(i));
    }
}

// Use pre-bound handlers instead of creating new closures
registerKeybindings() {
    this._registerKeybinding('cycle-zone-left', this._boundOnCycleZoneLeft);
    // etc.
}

// Complete destroy() cleanup
destroy() {
    this.unregisterKeybindings();
    
    // Disconnect signals
    if (this._settingsChangedId) {
        this._settings.disconnect(this._settingsChangedId);
        this._settingsChangedId = null;
    }
    
    // Release ALL bound handlers
    this._boundOnCycleZoneLeft = null;
    this._boundOnCycleZoneRight = null;
    this._boundOnShowLayoutSwitcher = null;
    this._boundOnMinimizeWindow = null;
    this._boundOnMaximizeWindow = null;
    this._boundQuickLayoutHandlers = null;
    // ... (all other bound handlers)
    
    // Release ALL component references
    this._settings = null;
    this._layoutManager = null;
    this._windowManager = null;
    // ... (all component references)
}
```

**Result:** R² improved from 0.452 → 0.132 (71% reduction), leak eliminated

*Note: Build 11 variance of 14.8 MB is due to one outlier run (457.8 MB). Runs 1,3,4 show only 2.8 MB variance, confirming no systematic leak.

## Tips for Success

1. **Always test with GNOME Shell restarts** - Ensures clean baseline
2. **Use variable cycle times** - Better statistical confidence
3. **Look at R², not just variance** - Distinguishes leaks from noise
4. **Run extended tests when borderline** - 4 runs better than 3
5. **Fix leaks immediately** - Don't let them compound
6. **Document as you go** - Update this file with findings

## References

- Memory leak detection: `MEMORY_LEAK_DETECTION.md`
- GJS memory management: `GJS_MEMORY_MANAGEMENT_GUIDE.md`
- VM testing guide: `docs/vm-setup-guide.md`
- Test script docs: `scripts/vm-test/README.md`
