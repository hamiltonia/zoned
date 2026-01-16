# TypeScript Migration - Phase 2 Plan

**Status:** Ready to Start  
**Estimated Effort:** 2-3 hours  
**Goal:** Reduce remaining ~50 TypeScript errors to 0

---

## Phase 1 Results (Completed)

✅ **Progress Achieved:**
- Added 17 class field declarations with proper types to ZonedExtension
- Created ambient module declarations for GNOME Shell imports
- Enhanced global.d.ts with ExtensionMetadata interface
- Fixed constructor parameter types
- **Error Reduction:** 150 errors → 50 errors (67% reduction)

---

## Phase 2 Objectives

### 1. Null Safety Guards (~30 errors)

**Problem:** TypeScript detects properties that are potentially null/undefined when accessed in `enable()` and `disable()` methods.

**Affected Properties:**
- `this._layoutManager`
- `this._windowManager`
- `this._keybindingManager`
- `this._panelIndicator`
- `this._zoneOverlay`
- `this._spatialStateManager`
- `this._templateManager`
- `this._debugInterface`

**Solution Approaches:**

**Option A: Non-null Assertion Operator (`!`)**
```typescript
// Quick fix - tells TypeScript "I know this is not null"
this._layoutManager!.destroy();
```
- **Pros:** Fast, minimal code changes
- **Cons:** Removes safety net, runtime errors possible

**Option B: Explicit Null Checks**
```typescript
// Safer approach
if (this._layoutManager) {
    this._layoutManager.destroy();
}
```
- **Pros:** True null safety, prevents runtime errors
- **Cons:** More verbose, requires more changes

**Option C: Early Return Pattern**
```typescript
disable(): void {
    if (!this._layoutManager) {
        console.warn('Extension not fully initialized');
        return;
    }
    
    // Now TypeScript knows it's safe
    this._layoutManager.destroy();
    // ... rest of cleanup
}
```
- **Pros:** Best practice, clear intent
- **Cons:** Requires restructuring methods

**Recommendation:** Use Option B/C for critical managers (layout, window, keybinding) and Option A for UI components that are definitely initialized.

---

### 2. Enum Definition Issues

**Problem:** `NotifyCategory.WARNINGS` referenced but not defined in enum

**Files Affected:**
- `extension/ui/notificationManager.ts`

**Solution:**
```typescript
// In global.d.ts or appropriate type file
enum NotifyCategory {
    APPLICATION = 0,
    SYSTEM = 1,
    WARNINGS = 2,  // ADD THIS
}
```

**Verification:** Search codebase for all NotifyCategory usage to ensure completeness.

---

### 3. Import Resolution Issues

**Problem:** Module declarations may need tsconfig.json adjustments

**Investigation Needed:**
1. Check if `@imports/*` paths resolve correctly
2. Verify `resource:///` paths work with bundler
3. Test that ambient declarations are found by TypeScript

**Potential Fixes:**
- Adjust `tsconfig.json` paths mapping
- Add explicit type references
- Update rollup configuration if needed

---

### 4. Type Compatibility Issues

**Problem:** Some component types may need refinement

**Areas to Check:**
- Signal connection types (GObject.SignalID vs number)
- Settings schema types (GioSettings parameter signatures)
- Actor/Widget hierarchy types
- Event handler function signatures

**Approach:**
1. Group similar errors by type
2. Fix underlying type definition once
3. Errors cascade-fix automatically

---

## Recommended Workflow

### Step 1: Quick Wins (15 minutes)
1. Add `NotifyCategory.WARNINGS` to enum
2. Fix any obvious typos or simple type mismatches
3. Run `npm run check` to see updated error count

### Step 2: Null Safety Pass (60-90 minutes)
1. Start with `extension.ts` - the main file
2. Add null guards to `enable()` method
3. Add null guards to `disable()` method
4. Move to manager classes if errors remain
5. Test after each major change

### Step 3: Import/Type Resolution (30-45 minutes)
1. Address any remaining import errors
2. Fix type compatibility issues
3. Ensure all ambient declarations work

### Step 4: Final Verification (15-30 minutes)
1. Run full TypeScript check: `npm run check`
2. Run ESLint: `npm run lint`
3. Build extension: `make compile-schema && npm run build`
4. Verify 0 errors across all tools

---

## Success Criteria

- [ ] 0 TypeScript errors (`npm run check`)
- [ ] 0 ESLint errors (`npm run lint`)
- [ ] Extension builds without errors
- [ ] No regression in functionality (test in VM)
- [ ] Clean commit ready for PR

---

## Risk Mitigation

**If Errors Explode:**
- Revert to last known good state
- Break into smaller, more focused changes
- Consider using `@ts-expect-error` with TODO comments for truly complex cases

**If Type System Fights Back:**
- May need to adjust type declarations in global.d.ts
- Consider making some properties required vs optional
- Use type guards (`is` functions) for complex checks

---

## Next Session Checklist

When starting Phase 2:
1. ✅ Review this plan
2. ✅ Run `npm run check` to get baseline error list
3. ✅ Work through errors systematically
4. ✅ Commit when reaching 0 errors

---

**Document Created:** 2026-01-11  
**Phase 1 Commit Hash:** TBD  
**Target Completion:** One focused session
