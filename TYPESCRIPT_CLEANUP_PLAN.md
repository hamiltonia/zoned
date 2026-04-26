# TypeScript Migration - Cleanup & Polish Plan

**Created:** January 25, 2026  
**Status:** TypeScript Migration Complete ✅ - Focus on Code Quality  
**Branch:** `infra/typescript-migration`

---

## 🎉 Current State - MUCH BETTER THAN EXPECTED!

### ✅ What's Working

**TypeScript Compilation: PERFECT** 🎯
```bash
npx tsc --noEmit  # ✓ 0 errors
```

**Rollup Build: CLEAN** ✓
```bash
make build-ts     # ✓ All 32 files compile successfully
```

**Extension Runtime: FUNCTIONAL** ✓
- All files converted to TypeScript (.ts)
- Rollup successfully transforms `@girs/*` → `gi://` imports
- Build outputs to `build/rollup/`
- Extension can be installed and runs

### ⚠️ What Needs Attention

**ESLint: 382 Issues** (4 errors, 378 warnings)
```bash
make lint  # 4 errors, 378 warnings
```

**No actual TypeScript type errors!** The ~1,586 errors mentioned in old docs don't exist.

---

## 📊 Issue Breakdown

### ESLint Summary (from actual run)

| Category | Count | Severity | Priority |
|----------|-------|----------|----------|
| `@typescript-eslint/no-explicit-any` | ~329 | Warning | Medium |
| `@typescript-eslint/no-non-null-assertion` | ~37 | Warning | Low |
| `complexity` | 4 | **Error** | High |
| `max-len` | ~11 | Warning | Low |
| `@typescript-eslint/no-unused-vars` | 3 | Warning | Medium |
| `no-console` | 1 | Warning | Low |

### Critical Issues (Blocking Errors)

**4 Complexity Violations** - Must fix before merge
1. `extension.ts:453` - `_destroyComponents()` has complexity 12 (limit: 10)
2. `prefs.ts:400` - `acceleratorToLabel()` has complexity 11 (limit: 10)
3. `layoutSettingsDialog.ts:1619` - `_showDeleteConfirmation()` has complexity 14 (limit: 10)
4. `layoutSwitcher.ts:917` - Arrow function has complexity 11 (limit: 10)

---

## 🎯 Cleanup Strategy

### Phase 1: Fix Blocking Errors (Required) ⚡

**Goal:** Get `make lint` to pass with 0 errors

**Task 1.1: Reduce Complexity Violations** (30 minutes)
- Break down the 4 complex functions into smaller helper methods
- Extract conditional logic into separate validation functions
- Aim for single responsibility per method

**Example Refactoring:**
```typescript
// Before: Complexity 14
_showDeleteConfirmation(layout) {
    // 14 branches of logic...
}

// After: Complexity < 10
_showDeleteConfirmation(layout) {
    const overlay = this._createDeleteOverlay(layout);
    this._attachDeleteHandlers(overlay);
    this._showOverlay(overlay);
}

_createDeleteOverlay(layout) { /* ... */ }
_attachDeleteHandlers(overlay) { /* ... */ }
_showOverlay(overlay) { /* ... */ }
```

---

### Phase 2: Clean Up Warnings (Optional but Recommended) 🧹

**Priority 1: Address `any` Types** (~329 warnings)

Most `any` types fall into these categories:

1. **Event Handlers** - Can type with Clutter types
   ```typescript
   // Before
   _handleClick(actor: any, event: any)
   
   // After
   _handleClick(actor: Clutter.Actor, event: Clutter.Event)
   ```

2. **Signal Callbacks** - Can use proper GObject types
   ```typescript
   // Before
   callback: (arg: any) => void
   
   // After  
   callback: (arg: GObject.Object) => void
   ```

3. **Layout/Settings Data** - Already have types defined
   ```typescript
   // Before
   layout: any
   
   // After
   layout: Layout
   ```

**Strategy:**
- Fix one file at a time
- Start with smaller files (utils, managers)
- End with large UI files (layoutSwitcher, zoneEditor)
- Use `@ts-expect-error` with TODO for genuinely untyped GNOME APIs

**Priority 2: Replace Non-null Assertions** (~37 warnings)

Non-null assertions (`!`) bypass TypeScript safety. Replace with:

```typescript
// Before
this._layoutManager!.destroy();

// After - Option A: Null check
if (this._layoutManager) {
    this._layoutManager.destroy();
}

// After - Option B: Early return
if (!this._layoutManager) return;
this._layoutManager.destroy();
```

**Priority 3: Fix Line Length** (~11 warnings)

Simple formatting fixes - split long lines:
```typescript
// Before (137 chars)
const reallyLongLine = someFunction(arg1, arg2, arg3, arg4, arg5, arg6, arg7);

// After
const reallyLongLine = someFunction(
    arg1, arg2, arg3,
    arg4, arg5, arg6, arg7
);
```

**Priority 4: Remove Unused Variables** (3 warnings)

- `layoutManager.ts`: Remove unused `UserLayoutsData`, `ZoneOverlay`
- `gnome-shell-augment.d.ts`: Remove unused `St` import

---

## 📋 Detailed Task List

### Must-Do (Before Merge)

- [ ] Fix 4 complexity errors
  - [ ] `extension.ts:453` - `_destroyComponents()`
  - [ ] `prefs.ts:400` - `acceleratorToLabel()`
  - [ ] `layoutSettingsDialog.ts:1619` - `_showDeleteConfirmation()`
  - [ ] `layoutSwitcher.ts:917` - Arrow function
- [ ] Verify `make lint` passes with 0 errors
- [ ] Test in VM (`make vm-install`)
- [ ] Run functional tests (`./scripts/vm test func`)

### Should-Do (Code Quality)

- [ ] Replace `any` types in type definitions (`extension/types/*.d.ts`)
  - ~40 instances in global.d.ts, gnome-shell.d.ts, zone.d.ts
- [ ] Replace `any` types in core managers
  - keybindingManager.ts (~12 instances)
  - extension.ts (~3 instances)
  - windowManager.ts (1 instance)
- [ ] Replace `any` types in UI components
  - layoutSwitcher.ts (~95 instances - largest file)
  - layoutSettingsDialog.ts (~70 instances)
  - zoneEditor.ts (~18 instances)
  - Other UI files (~60 instances combined)
- [ ] Fix line length warnings (~11 files)
- [ ] Remove unused variables (3 instances)

### Nice-to-Have (Polish)

- [ ] Replace non-null assertions with null checks
- [ ] Add JSDoc comments to public methods
- [ ] Document complex type definitions
- [ ] Run `npx type-coverage --detail` (target >90%)

---

## 🚀 Recommended Workflow

### Option A: Merge Now, Polish Later (Recommended)

**Rationale:** Migration is functionally complete. Warnings don't block functionality.

1. **Fix 4 complexity errors** (required for clean lint)
2. **Test thoroughly** in VM
3. **Merge to main** - migration complete! 🎉
4. **Create follow-up issues** for warning cleanup
5. **Address warnings incrementally** in future PRs

**Pros:**
- ✅ Unblock other work
- ✅ Risk is minimal (TypeScript already validates types)
- ✅ Warnings are technical debt, not bugs

**Cons:**
- ⚠️ Leaves 378 warnings in codebase
- ⚠️ `any` types reduce TypeScript benefits

### Option B: Full Polish Before Merge

**Rationale:** Do it right the first time.

1. **Fix all 4 complexity errors**
2. **Address all `any` types** (~329 warnings)
3. **Fix all other warnings** (~49 warnings)
4. **Achieve 0 ESLint warnings**
5. **Merge to main**

**Pros:**
- ✅ Clean, professional codebase
- ✅ Full TypeScript benefits realized
- ✅ No technical debt

**Cons:**
- ⚠️ Estimated 8-12 hours of work
- ⚠️ Higher risk of introducing bugs during refactoring
- ⚠️ Blocks other work until complete

---

## 🔍 How We Got Here (For Context)

### What Changed Today (Jan 25, 2026)

1. **Deleted outdated planning docs** (contradictory info)
2. **Discovered actual state** - much better than documented!
3. **Fixed Rollup build** - removed problematic `.d.ts` import
4. **Created this realistic plan** - based on actual linter output

### Key Insights

- **TYPESCRIPT_STATUS.md was wrong** - claimed 1,586 errors, reality is 0
- **TypeScript migration succeeded** - all type checking passes
- **Only linting warnings remain** - not blocking, just code style
- **Build system works** - Rollup successfully compiles everything

---

## 📝 Commands Reference

```bash
# Type checking (passes clean!)
npx tsc --noEmit

# Build TypeScript → JavaScript
make build-ts

# Lint (4 errors, 378 warnings)
make lint

# Lint with auto-fix
make lint-fix

# Install to VM for testing
make vm-install

# Run tests
./scripts/vm test func

# Type coverage analysis
npm install --save-dev type-coverage
npx type-coverage --detail
```

---

## 🎓 Lessons Learned

### What Worked Well

1. **Rollup with custom transformer** - Elegant solution for `@girs` → `gi://`
2. **Incremental approach** - Low risk, testable at each step
3. **Type definitions** - `extension/types/` for shared types
4. **SignalTracker** - Memory-safe signal management

### What Could Improve

1. **Better documentation maintenance** - Old docs were misleading
2. **Earlier linting** - Should have run ESLint during migration
3. **Stricter lint config** - Consider making `any` an error, not warning

---

## 🎯 Next Actions

**Immediate (This Session):**
1. Review this plan with user
2. Decide: Option A (merge now) or Option B (polish first)
3. If Option A: Fix 4 complexity errors, test, merge
4. If Option B: Start fixing `any` types systematically

**Follow-up (Future Sessions):**
1. Create tracking issue for warning cleanup
2. Break down warning fixes into focused PRs
3. Add pre-commit hook for ESLint
4. Document TypeScript coding standards

---

**Status:** Ready for decision - merge now or polish first?  
**Recommendation:** Option A (fix 4 errors, merge, polish later)  
**Confidence:** High - migration is complete and functional
