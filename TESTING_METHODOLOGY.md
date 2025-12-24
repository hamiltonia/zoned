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
| **Build 7** | Build 6+ + LayoutManager | ⏳ Next | - |
| **Build 8** | Build 7 + WindowManager | 📋 Future | - |
| **Build 9** | Build 8 + LayoutSwitcher | 📋 Future | - |
| **Build 10** | Build 9 + PanelIndicator | 📋 Future | - |
| **Build 11** | Build 10 + KeybindingManager | 📋 Future | - |
| **Full** | All components | 📋 Goal | - |

### Current State

**Current Build:** Build 6+  
**Status:** All tested components are CLEAN  
**Next Step:** Test Build 7 (add LayoutManager)

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
