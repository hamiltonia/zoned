# TypeScript Migration - Phase 1 Findings

**Date:** January 9, 2026  
**Branch:** `infra/typescript-migration`  
**Status:** Phase 1 Complete - Critical Issue Discovered

---

## Summary

Phase 1 (Foundation) of the TypeScript migration is complete. The toolchain is installed and configured, and we successfully performed a spike test with `versionUtil.ts`. However, we discovered a **critical blocker** that must be resolved before proceeding with full migration.

---

## ✅ Completed Tasks

### 1.1 TypeScript Toolchain Installed
- **TypeScript:** v5.9.3 ✓
- **@girs type definitions:** Installed ✓
  - `@girs/gjs`
  - `@girs/shell-14`
  - `@girs/st-14`
  - `@girs/clutter-14`
  - `@girs/meta-14`
  - Plus all dependencies (glib-2.0, gio-2.0, etc.)
- **TypeScript ESLint:** Configured ✓

### 1.2 Configuration Files Created
- ✓ `tsconfig.json` - TypeScript compiler configuration
- ✓ `eslint.config.js` - Updated with TypeScript support
- ✓ `.gitignore` - Updated to ignore TypeScript build artifacts

### 1.3 Makefile Targets Added
- ✓ `make build-ts` - Compile TypeScript
- ✓ `make watch-ts` - Watch mode for development
- ✓ `make typecheck` - Type check without compilation
- ✓ `make lint-ts` - Lint TypeScript files
- ✓ `make clean-ts` - Clean TypeScript artifacts

### 1.4 Spike Test Completed
- ✓ Migrated `extension/utils/versionUtil.js` → `versionUtil.ts`
- ✓ Added proper type annotations (`ExtensionVersion`, `ExtensionMetadata`)
- ✓ TypeScript compilation successful
- ✓ Type checking passes with zero errors
- ✓ Output generated in `build/typescript/utils/versionUtil.js`

---

## 🚨 Critical Issue Discovered

### Problem: Import Path Mismatch

**At Build Time (TypeScript):**
```typescript
import GLib from '@girs/glib-2.0';
import Gio from '@girs/gio-2.0';
```

**Required at Runtime (GJS):**
```javascript
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
```

**What Happens:**
TypeScript compiles successfully but outputs `@girs/glib-2.0` imports in the compiled JavaScript. When GNOME Shell tries to load this compiled code, it will fail because:
1. GJS doesn't understand `@girs/*` import specifiers
2. GJS requires `gi://` protocol for GObject Introspection imports
3. The package names don't match (`glib-2.0` vs `GLib`)

**Impact:** 🔴 **BLOCKER** - Compiled TypeScript code will not run in GNOME Shell

---

## Possible Solutions

### Option 1: Post-Build Import Transformation ⭐ Recommended
Add a build step to transform imports after TypeScript compilation:

```bash
# After `tsc`, run a script to transform imports
sed -i "s/@girs\/glib-2.0/gi:\/\/GLib/g" build/typescript/**/*.js
sed -i "s/@girs\/gio-2.0/gi:\/\/Gio/g" build/typescript/**/*.js
# ... etc for all @girs imports
```

**Pros:**
- Simple to implement
- Preserves TypeScript type checking
- No additional dependencies

**Cons:**
- Fragile (regex-based)
- Must maintain mapping for all imports
- Could break on edge cases

### Option 2: Custom TypeScript Transformer
Use `ts-patch` or similar to transform imports during compilation:

```typescript
// tsconfig.json with custom transformer
{
  "compilerOptions": {
    "plugins": [
      {
        "transform": "./build-tools/gjs-import-transformer.ts"
      }
    ]
  }
}
```

**Pros:**
- Robust, AST-based transformation
- Runs as part of compilation
- Type-safe

**Cons:**
- More complex to implement
- Additional build dependencies
- Maintenance burden

### Option 3: Type-Only Imports (Declaration Files) ⭐ Alternative
Keep JavaScript as-is, use TypeScript only for type checking via `.d.ts` files:

```typescript
// versionUtil.d.ts
import type GLib from '@girs/glib-2.0';
import type Gio from '@girs/gio-2.0';

export interface ExtensionVersion { ... }
export function getExtensionVersion(...): ExtensionVersion;
```

```javascript
// versionUtil.js (keep existing JavaScript)
import GLib from 'gi://GLib';  // Runtime import (correct)
import Gio from 'gi://Gio';
// ...
```

**Pros:**
- No build step required
- JavaScript stays runtime-compatible
- Still get TypeScript type checking and IDE support

**Cons:**
- Duplicate type definitions
- Doesn't provide as much value as full TypeScript
- More maintenance (keep .js and .d.ts in sync)

### Option 4: JSDoc with TypeScript
Use JSDoc comments for types, skip TypeScript compilation entirely:

```javascript
import GLib from 'gi://GLib';  // Runtime-compatible
import Gio from 'gi://Gio';

/**
 * @typedef {Object} ExtensionVersion
 * @property {string} name
 * @property {string} display
 * @property {number} ego
 * @property {boolean} isDev
 */

/**
 * @param {string} extensionPath
 * @param {ExtensionMetadata} metadata
 * @returns {ExtensionVersion}
 */
export function getExtensionVersion(extensionPath, metadata) { ... }
```

**Pros:**
- No compilation needed
- Runtime-compatible imports
- TypeScript tooling still works (~70% benefit)
- Simpler workflow

**Cons:**
- Less strict than TypeScript
- More verbose syntax
- No compile-time type errors

---

## Recommendation

**Short-term (Immediate):**
Implement **Option 1 (Post-Build Transformation)** as a proof-of-concept:
1. Create `scripts/transform-gjs-imports.sh` script
2. Update Makefile to run transformation after `tsc`
3. Test with `versionUtil.ts` → verify extension loads in VM

**Long-term (If PoC succeeds):**
Evaluate **Option 2 (Custom Transformer)** for robustness and maintainability once migration proves valuable.

**Alternative Path:**
If build complexity becomes prohibitive, pivot to **Option 4 (JSDoc)** which provides ~70% of TypeScript benefits with zero build step.

---

## Next Steps

### Before Proceeding with Full Migration:

1. **Implement import transformation** (Option 1 PoC)
   ```bash
   # Create transformation script
   scripts/transform-gjs-imports.sh
   
   # Update Makefile build-ts target
   make build-ts
   
   # Test in VM
   make vm-install
   ```

2. **Verify extension loads** with transformed TypeScript build
   - Check logs for import errors
   - Verify versionUtil still works correctly
   - Ensure no runtime breakage

3. **Decision Point:**
   - ✅ If successful → Update migration plan, proceed to Phase 2
   - ❌ If problematic → Evaluate alternatives (JSDoc, type-only approach)

### If Transformation Works:

4. **Update TYPESCRIPT_MIGRATION_PLAN.md**
   - Add import transformation details to Phase 1
   - Document transformation script in build pipeline
   - Add validation step for import compatibility

5. **Proceed to Phase 2** (Incremental File Migration)
   - Start with remaining utilities
   - Apply learnings from versionUtil spike test
   - Test after each file migration

---

## Test Commands

```bash
# Verify TypeScript setup
npx tsc --version                    # v5.9.3
make build-ts                         # Compiles TypeScript
make typecheck                        # Type checks without compilation
make lint-ts                          # Lints TypeScript files (when .ts files exist)

# Check compiled output
ls build/typescript/utils/            # versionUtil.js exists
cat build/typescript/utils/versionUtil.js  # Has @girs imports (needs transformation)

# After implementing transformation
make build-ts                         # Should transform imports
grep "gi://" build/typescript/**/*.js # Should find gi:// imports (not @girs)
```

---

## Files Modified in Phase 1

### New Files
- `tsconfig.json`
- `extension/utils/versionUtil.ts` (spike test)
- `TYPESCRIPT_PHASE1_FINDINGS.md` (this document)

### Modified Files
- `Makefile` - Added TypeScript build targets
- `eslint.config.js` - Added TypeScript configuration
- `.gitignore` - Added TypeScript build artifacts
- `package.json` - Added TypeScript dependencies (via npm install)

### Build Artifacts (gitignored)
- `build/typescript/` - Compiled JavaScript output
- `node_modules/@girs/` - Type definition packages

---

## Conclusion

**Phase 1 Status:** ✅ **Complete** - Foundation established successfully

**Next Action Required:** 🔴 **Resolve import transformation blocker before Phase 2**

The TypeScript toolchain works perfectly for type checking and compilation. The only blocker is the import path mismatch between TypeScript's `@girs/*` packages and GJS's `gi://` runtime imports. This is solvable with a post-build transformation script or alternative approaches.

**Recommendation:** Implement post-build transformation PoC before committing to full migration.
