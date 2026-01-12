# TypeScript Migration - Next Steps

**Date:** January 11, 2026  
**Status:** Phase 2 Complete - All Files Migrated ✅  
**Branch:** `infra/typescript-migration`

---

## ✅ What Was Accomplished

### Phase 2: Complete TypeScript Migration - COMPLETE

All 32 extension files have been successfully migrated to TypeScript (100%):

#### Utilities (6 files) ✅
1. ✅ `versionUtil.ts` - Extension version detection
2. ✅ `theme.ts` - Theme utilities  
3. ✅ `debug.ts` - Logging and debug utilities
4. ✅ `notificationService.ts` - Notification routing
5. ✅ `signalTracker.ts` - Signal connection tracking
6. ✅ `resourceTracker.ts` - Memory leak detection

#### Additional Utilities (3 files) ✅
7. ✅ `keybindingConfig.ts` - Keybinding configuration
8. ✅ `layoutConverter.ts` - Layout conversion utilities
9. ✅ `debugInterface.ts` - D-Bus debug interface

#### Core Managers (5 files) ✅
10. ✅ `templateManager.ts` - Template management
11. ✅ `spatialStateManager.ts` - Spatial state tracking
12. ✅ `layoutManager.ts` - Layout management
13. ✅ `windowManager.ts` - Window manipulation
14. ✅ `keybindingManager.ts` - Keybinding management

#### UI Components - Small (5 files) ✅
15. ✅ `notificationManager.ts` - Notification display
16. ✅ `zoneOverlay.ts` - Zone visual feedback
17. ✅ `conflictDetector.ts` - Keybinding conflict detection
18. ✅ `confirmDialog.ts` - Confirmation dialogs
19. ✅ `layoutPreviewBackground.ts` - Layout preview rendering

#### UI Components - Large (3 files) ✅
20. ✅ `panelIndicator.ts` - Top bar panel indicator
21. ✅ `layoutSettingsDiagnostic.ts` - Layout settings diagnostic
22. ✅ `layoutSettingsDialog.ts` - Layout settings dialog
23. ✅ `layoutSwitcher.ts` - Layout switcher UI
24. ✅ `zoneEditor.ts` - Zone editor UI

#### Layout Switcher Subdirectory (5 files) ✅
25. ✅ `topBar.ts` - Layout switcher top bar
26. ✅ `tierConfig.ts` - Tier configuration
27. ✅ `sectionFactory.ts` - Section factory
28. ✅ `cardFactory.ts` - Card factory
29. ✅ `resizeHandler.ts` - Resize handler

#### Entry Points (2 files) ✅
30. ✅ `extension.ts` - Main extension entry point
31. ✅ `prefs.ts` - Preferences entry point

### Build System Status

- ✅ Rollup configured with custom `@girs/*` → `gi://` import transformer
- ✅ All 32 files compile successfully with expected TypeScript warnings
- ✅ Import paths correctly transformed for GJS runtime
- ✅ Build time: ~2 seconds for incremental builds
- ✅ Extension bundles to single `extension.js` and `prefs.js` files
- ✅ Icons and static assets copied during installation

### Critical Fixes Applied

**PanelIndicator Icon Path Issue (Fixed Jan 11, 2026)**
- **Problem:** Rollup bundles all files into single `extension.js`, so path derivation using `import.meta.url` and `/ui/` substring failed
- **Solution:** Pass extension path as parameter from Extension class to PanelIndicator
- **Result:** Panel indicator icon now displays correctly in top bar
- **Verification:** Tested in VM, icon appears and switches correctly with conflict detection

### Type Safety Improvements

All migrated files now include:
- Proper TypeScript interfaces for all data structures
- Type-safe GSettings interaction
- Null-safety checks and initialization guards
- Strict parameter typing on all methods
- Full type coverage with `@girs/*` packages

---

## 🚨 CRITICAL: Git History Preservation

### **Required Workflow for All Migrations**

**All future file migrations MUST use `git mv` to preserve git history!**

**Correct Workflow:**
1. `git mv extension/file.js extension/file.ts` - Rename with git (preserves history)
2. Write TypeScript version to `extension/file.tmp.ts` - Create converted file
3. `cp extension/file.tmp.ts extension/file.ts` - Overwrite renamed file
4. `rm extension/file.tmp.ts` - Clean up
5. **Git shows**: `RM file.js -> file.ts` with modifications ✅

**Example (templateManager - Fixed):**
```bash
git mv extension/templateManager.js extension/templateManager.ts
# ... AI conversion ...
git status  # Shows: RM extension/templateManager.js -> extension/templateManager.ts
```

---

## 🎯 Recommended Next Steps

### Phase 2b: Validation Checkpoint (1-2 hours)

**Goal:** Verify the TypeScript utilities work correctly in the VM before proceeding

#### Step 2: Update Import References
Check if any other files import the utilities with `.js` extension:
```bash
grep -r "from './debug.js'" extension/
grep -r "from './theme.js'" extension/
# etc.
```

Most imports should work as-is since they reference the compiled `.js` output in `build/rollup/utils/`.

#### Step 3: Test in VM
```bash
# Build and deploy to VM
make build-ts
make vm-install

# Monitor logs for any import errors
make vm-logs

# Run functional tests
./scripts/vm test func
```

**Success Criteria:**
- [ ] Extension loads without errors
- [ ] No import/module errors in logs
- [ ] Basic functionality works (layout switching, zone cycling)
- [ ] No TypeScript-related runtime errors

---

### Phase 2c: Data Structures Migration (2-3 days)

Once utilities are validated, proceed with remaining files.

#### **REMEMBER: Use git mv workflow for ALL migrations!**

**For each file:**
1. `git mv extension/file.js extension/file.ts`
2. Write TypeScript to temp file
3. Copy temp over renamed file
4. Remove temp file

#### Step 1: Define Core Type Interfaces (Already Done ✅)

Create `extension/types/layout.d.ts`:
```typescript
/**
 * Zone definition - rectangular area within a layout
 * All dimensions are percentages (0.0 - 1.0)
 */
export interface Zone {
    x: number;        // Left position (0.0 = left edge)
    y: number;        // Top position (0.0 = top edge)
    width: number;    // Width (1.0 = full width)
    height: number;   // Height (1.0 = full height)
}

/**
 * Layout definition - collection of zones
 */
export interface Layout {
    id: string;              // Unique identifier (UUID)
    name: string;            // Display name
    zones: Zone[];           // Array of zones
    editable: boolean;       // Can user edit this layout?
    isTemplate?: boolean;    // Is this a built-in template?
}

/**
 * Builtin template definition
 */
export interface BuiltinTemplate {
    id: string;
    name: string;
    description: string;
    createLayout(): Layout;
}
```

#### Step 2: Migrate templateManager.js

1. Create `extension/templateManager.ts`
2. Import type definitions
3. Add proper types to all methods
4. Add to `rollup.config.js`
5. Build and test

#### Step 3: Export Types Globally

Update `extension/types/global.d.ts` to export layout types:
```typescript
export type { Zone, Layout, BuiltinTemplate } from './layout';
```

---

### Phase 2d: State Managers (3-4 days)

After `templateManager.ts` is complete:

1. **spatialStateManager.js** → `spatialStateManager.ts`
   - Define `SpaceKey` type
   - Define `SpatialState` interface
   - Type-safe GSettings interaction

2. **layoutManager.js** → `layoutManager.ts`
   - Uses `Layout`, `Zone` types from Phase 2c
   - Type-safe layout operations
   - Proper null handling

---

## 📋 Testing Checklist

### Before Removing .js Files
- [ ] All 6 utilities compile without errors
- [ ] Import transformer verified (check compiled output)
- [ ] No TypeScript errors in IDE

### After Removing .js Files
- [ ] Extension loads in VM
- [ ] No module import errors
- [ ] Basic extension functionality works
- [ ] Logs show no TypeScript-related errors

### After Each New Migration
- [ ] TypeScript compiles successfully
- [ ] File added to `rollup.config.js`
- [ ] VM deployment successful
- [ ] Functionality related to migrated file works
- [ ] No new memory leaks introduced

---

## 🚧 Known Warnings (Non-Blocking)

The following TypeScript warnings appear during build but are **non-critical**:

1. **`_component` is declared but never read** (debug.ts)
   - Intentional: Used for future debugging features
   
2. **`_extension` is declared but never read** (notificationService.ts)
   - Intentional: Needed for lifecycle management

3. **`_prefix`, `_timerCounter`, `_actorCounter` declared but never read** (resourceTracker.ts)
   - Intentional: Used in logger instance tracking

**Resolution:** These can be addressed later with TypeScript comments:
```typescript
// eslint-disable-next-line @typescript-eslint/no-unused-vars
private _component: string;
```

Or by using the properties in debug/logging methods.

---

## 📊 Migration Progress

```
Phase 1: Foundation               [████████████████████] 100% ✅
Phase 2a: Utilities               [████████████████████] 100% ✅
Phase 2b: Validation              [░░░░░░░░░░░░░░░░░░░░]   0% ⏳ NEXT
Phase 2c: Data Structures         [░░░░░░░░░░░░░░░░░░░░]   0%
Phase 2d: State Managers          [░░░░░░░░░░░░░░░░░░░░]   0%
Phase 2e: Window Management       [░░░░░░░░░░░░░░░░░░░░]   0%
Phase 2f: UI Components           [░░░░░░░░░░░░░░░░░░░░]   0%
Phase 2g: Keybindings             [░░░░░░░░░░░░░░░░░░░░]   0%
Phase 2h: Entry Points            [░░░░░░░░░░░░░░░░░░░░]   0%
```

**Overall Progress:** ~25% (2 of 8 sub-phases complete)

---

## 🎬 Immediate Actions

### Option A: Validation First (Recommended)
1. Remove duplicate `.js` utility files
2. Test extension in VM
3. Verify all utilities work correctly
4. Commit progress with message: "Complete utilities migration to TypeScript"
5. Proceed to Phase 2c (templateManager)

### Option B: Continue Migration
1. Keep `.js` files as fallback
2. Start migrating `templateManager.js`
3. Test both utilities and templateManager together
4. Remove all `.js` files at once when validated

### Option C: Pause & Document
1. Commit current progress
2. Update DEVELOPMENT.md with TypeScript build instructions
3. Create PR for review
4. Resume after feedback

---

## 📝 Documentation Updates Needed

Before merging to main:

1. **DEVELOPMENT.md**
   - Add TypeScript build setup instructions
   - Document `make build-ts` workflow
   - Add troubleshooting section for common issues

2. **README.md**
   - Note TypeScript requirement for contributors
   - Update build instructions

3. **CONTRIBUTING.md**
   - TypeScript coding standards
   - Type annotation guidelines
   - Import path conventions

---

## 🔍 Risk Assessment

**Current Risk Level:** ✅ **LOW**

- ✅ Build system proven to work (Rollup transformer successful)
- ✅ All utilities compile without errors
- ✅ Import transformation validated
- ⚠️ Not yet tested in VM runtime
- ⚠️ JavaScript files still present (fallback available)

**Recommendation:** Proceed with Phase 2b (Validation) to verify VM compatibility before continuing migration.

---

## 💡 Lessons Learned

### What Worked Well
1. **Rollup with custom transformer** - Elegant solution to @girs→gi:// problem
2. **Incremental migration** - Low-complexity utilities first built confidence
3. **Type definitions** - `extension/types/global.d.ts` for shared types
4. **Preserved compatibility** - Compiled output matches JavaScript patterns

### Challenges Overcome
1. **Import path mismatch** - Solved with AST-based transformer
2. **GJS type definitions** - @girs packages provide excellent coverage
3. **Build integration** - Makefile seamlessly incorporates Rollup

### For Next Phase
1. **Test early, test often** - VM validation after each migration
2. **Keep backups** - Don't delete `.js` files until validated
3. **Watch for circular imports** - Layout types may create dependency cycles
4. **Memory testing** - Ensure no regressions in leak detection

---

**Next Action:** Choose validation strategy (Option A recommended) and proceed with Phase 2b testing.
