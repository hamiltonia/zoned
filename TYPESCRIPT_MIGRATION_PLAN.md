# TypeScript Migration Plan for Zoned

**Branch:** `infra/typescript-migration`  
**Created:** January 9, 2026  
**Status:** In Progress - Phase 2 (Utilities Migration)  
**Last Updated:** January 10, 2026

---

## Executive Summary

This document outlines the complete strategy for migrating the Zoned GNOME Shell extension from JavaScript to TypeScript. The migration will be performed incrementally to minimize risk while maximizing the benefits of type safety, better tooling support, and improved maintainability.

**Estimated Timeline:** 2-3 weeks  
**Risk Level:** Medium (GJS TypeScript ecosystem is maturing but not fully mature)  
**Expected ROI:** High (improved developer experience, reduced runtime errors, better AI assistance)

---

## Goals

### Primary Objectives
1. **Type Safety**: Catch type-related errors at compile time instead of runtime
2. **Developer Experience**: Improve autocomplete and IntelliSense for GNOME/GJS APIs
3. **Refactoring Confidence**: Enable safe large-scale refactoring with type checking
4. **Memory Safety**: Enforce proper cleanup patterns through type contracts
5. **Documentation**: Self-documenting code through explicit type definitions

### Success Criteria
- [ ] All `.js` files converted to `.ts` with proper type annotations
- [ ] Build pipeline compiles TypeScript without errors
- [ ] Extension loads and functions identically to JavaScript version
- [ ] VM test suite passes on TypeScript build
- [ ] No regression in memory leak tests
- [ ] ESLint/TypeScript linting rules enforced
- [ ] Type coverage >90% (minimal `any` usage)

---

## Benefits Analysis

### 1. Type Safety
**Current Risk**: Complex inter-component dependencies (11+ manager classes) with runtime type checks only
- Example: `layoutManager.setLayout()` expects string, but could receive wrong type
- Memory leaks from incorrect signal cleanup

**TypeScript Solution**:
```typescript
interface Layout {
    id: string;
    name: string;
    zones: Zone[];
}

setLayout(layoutId: string): boolean {
    // TypeScript prevents passing Layout object instead of string
}
```

### 2. Enhanced IntelliSense
**Current**: Manual reference to GNOME Shell documentation for API signatures  
**With TypeScript**: Autocomplete for:
- `resource:///org/gnome/shell/*` imports
- GSettings property types
- Signal handler signatures (`workspace-switched`, `changed::*`)
- GTK4/Adwaita widget properties

### 3. Refactoring Safety
**Scenario**: Renaming `SpatialStateManager.makeKey()` signature  
**Current**: Manually find/replace, test everything  
**TypeScript**: Compiler identifies all breaking usages instantly

### 4. Memory Leak Prevention
**Current State**: Extensive manual tracking (`global.zonedDebug`, signal tracker)
```javascript
// Easy to forget destroy()
class Component {
    destroy() { /* cleanup */ }
}
```

**TypeScript Enforcement**:
```typescript
interface Destroyable {
    destroy(): void;
}

class Component implements Destroyable {
    // Compiler error if destroy() not implemented
    destroy(): void { /* cleanup */ }
}
```

### 5. AI-Assisted Development
**Key Benefit**: Your codebase is AI-generated (Claude via Cline)
- Better type hints → More accurate code generation
- Fewer runtime surprises → Faster iteration
- Self-documenting types → Better context for AI

---

## Risks & Mitigation

### Risk 1: GJS TypeScript Ecosystem Maturity
**Issue**: `ts-for-gir` type definitions may be incomplete for GNOME Shell 46+  
**Mitigation**:
- Start with well-typed modules (`@girs/gjs`, `@girs/gnome-shell`)
- Create custom `.d.ts` files for missing definitions
- Contribute improvements back to `ts-for-gir` project
- Use `// @ts-ignore` sparingly for genuinely untyped APIs

### Risk 2: Build Complexity
**Issue**: Adds compilation step to development workflow  
**Mitigation**:
- Integrate TypeScript into existing Makefile seamlessly
- Add watch mode for development (`tsc --watch`)
- Ensure VM deployment handles build artifacts correctly
- Document new workflow clearly in DEVELOPMENT.md

### Risk 3: Migration Effort
**Issue**: ~3,000+ lines of code across 15+ files  
**Mitigation**:
- Incremental migration (JS and TS coexist)
- Start with low-coupling utilities, end with high-coupling components
- Test after each file migration
- Use automated tools where possible (`ts-migrate`)

### Risk 4: Type Definition Maintenance
**Issue**: GNOME Shell updates may break type definitions  
**Mitigation**:
- Pin `@girs/*` versions to tested releases
- Monitor `ts-for-gir` repository for updates
- Budget time for type definition updates in release cycle

### Risk 5: Testing Iteration Speed
**Issue**: Build step adds latency to VM testing loop  
**Mitigation**:
- Use watch mode during active development
- Optimize TypeScript compilation (`incremental: true`)
- Consider source maps for debugging compiled code

---

## Migration Strategy

### Phase 1: Foundation (Week 1, Days 1-2)

#### 1.1 Install TypeScript Toolchain
```bash
npm install --save-dev typescript@latest
npm install --save-dev @tsconfig/recommended
npm install --save-dev @girs/gjs@latest
npm install --save-dev @girs/gnome-shell@latest
npm install --save-dev @girs/gtk4@latest
npm install --save-dev @girs/adw1@latest
```

**Verification**: `npx tsc --version` outputs TypeScript 5.x

#### 1.2 Configure TypeScript
**File**: `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./build/typescript",
    "rootDir": "./extension",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictPropertyInitialization": false,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "types": ["@girs/gjs", "@girs/gnome-shell"],
    "typeRoots": ["./node_modules/@types", "./node_modules/@girs"],
    "paths": {
      "resource://*": ["./node_modules/@girs/*"]
    }
  },
  "include": ["extension/**/*.ts"],
  "exclude": ["node_modules", "build", "dist", "scripts"]
}
```

#### 1.3 Update Build Pipeline
**Makefile changes**:
```makefile
# New target: Build TypeScript
build-ts:
	@echo "Compiling TypeScript..."
	npx tsc

# Modified: Install includes build step
install: build-ts
	# Copy compiled JS from build/typescript/
	# ... existing install logic
```

**New script**: `scripts/watch-typescript`
```bash
#!/bin/bash
# Watch mode for development
npx tsc --watch
```

#### 1.4 Configure TypeScript ESLint
```bash
npm install --save-dev @typescript-eslint/parser
npm install --save-dev @typescript-eslint/eslint-plugin
```

**Update**: `eslint.config.js` → `eslint.config.mjs`
```javascript
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['extension/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // Migrate existing GNOME rules
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      // ... port other rules
    },
  },
];
```

#### 1.5 Update Documentation
**Files to update**:
- `DEVELOPMENT.md` - Add TypeScript build instructions
- `README.md` - Note TypeScript requirement for contributors
- `CONTRIBUTING.md` - TypeScript coding standards

---

### Phase 2: Incremental File Migration (Week 1-2)

#### **CRITICAL: Preserve Git History During Migration**

**All file migrations MUST use `git mv` to preserve git history!**

**Correct Workflow for Each File:**

1. **`git mv extension/file.js extension/file.ts`** - Rename with git (preserves history)
2. **Write TypeScript version** to `extension/file.tmp.ts` - Create converted file
3. **`cp extension/file.tmp.ts extension/file.ts`** - Overwrite renamed file with TypeScript
4. **`rm extension/file.tmp.ts`** - Clean up temporary file
5. **Add to rollup.config.js** - Include in build configuration
6. **Git result**: Shows `RM file.js -> file.ts` with modifications ✅

**Why This Matters:**
- ✅ Preserves full git blame history
- ✅ Git shows rename + modification (not delete + create)
- ✅ Easier code archaeology later
- ✅ Proper attribution in git history

**Example:**
```bash
# Step 1: Rename with git
git mv extension/templateManager.js extension/templateManager.ts

# Step 2-4: Convert content (AI writes to tmp, copies over, deletes tmp)
# ... conversion happens here ...

# Step 5: Verify git status
git status
# Output: RM extension/templateManager.js -> extension/templateManager.ts
```

---

#### Migration Order (Low → High Coupling)

##### 2.1 Utilities (Week 1, Days 3-4)
**Low coupling, good for learning TypeScript patterns**

```
Priority 1 (No dependencies):
- extension/utils/versionUtil.js → versionUtil.ts
- extension/utils/theme.js → theme.ts

Priority 2 (Minimal dependencies):
- extension/utils/debug.js → debug.ts
- extension/utils/notificationService.js → notificationService.ts
- extension/utils/signalTracker.js → signalTracker.ts
- extension/utils/resourceTracker.js → resourceTracker.ts
```

**Key Types to Define**:
```typescript
// utils/debug.ts
type LogLevel = 'info' | 'debug' | 'warn' | 'error' | 'memdebug';
interface Logger {
    info(message: string): void;
    debug(message: string): void;
    warn(message: string): void;
    error(message: string): void;
    memdebug(message: string): void;
}

// utils/signalTracker.ts
interface SignalConnection {
    disconnect(): void;
}
class SignalTracker {
    track(obj: GObject.Object, signal: string, handler: Function): void;
    destroy(): void;
}
```

**Test After Each**: Run `make vm-install && make vm-logs` to verify

##### 2.2 Data Structures (Week 1, Day 5)
```
- extension/templateManager.js → templateManager.ts
```

**Critical Types**:
```typescript
interface Zone {
    x: number;        // 0.0 - 1.0 (percentage)
    y: number;        // 0.0 - 1.0 (percentage)
    width: number;    // 0.0 - 1.0 (percentage)
    height: number;   // 0.0 - 1.0 (percentage)
}

interface Layout {
    id: string;
    name: string;
    zones: Zone[];
    editable: boolean;
    isTemplate?: boolean;
}

interface BuiltinTemplate {
    id: string;
    name: string;
    description: string;
    createLayout(): Layout;
}
```

##### 2.3 State Managers (Week 2, Days 1-2)
```
- extension/spatialStateManager.js → spatialStateManager.ts
- extension/layoutManager.js → layoutManager.ts
```

**SpatialStateManager Types**:
```typescript
type SpaceKey = string;  // Format: "monitorID:workspaceIndex"

interface SpatialState {
    layoutId: string;
    zoneIndex: number;
}

class SpatialStateManager {
    makeKey(monitor: number, workspace: number): SpaceKey;
    getState(key: SpaceKey): SpatialState;
    setState(key: SpaceKey, layoutId: string, zoneIndex?: number): void;
    // ...
}
```

**LayoutManager Types**:
```typescript
interface LayoutValidationError {
    field: string;
    message: string;
}

class LayoutManager {
    private _layouts: Layout[];
    private _currentLayoutId: string | null;
    private _spatialStateManager: SpatialStateManager | null;
    
    loadLayouts(): boolean;
    setLayout(layoutId: string): boolean;
    getCurrentLayout(spaceKey?: SpaceKey): Layout | null;
    cycleZone(direction: 1 | -1, spaceKey?: SpaceKey): void;
    // ...
}
```

##### 2.4 Window Management (Week 2, Day 2)
```
- extension/windowManager.js → windowManager.ts
```

**Types**:
```typescript
import Meta from '@girs/meta';

class WindowManager {
    getFocusedWindow(): Meta.Window | null;
    moveWindowToZone(window: Meta.Window, zone: Zone, padding?: number): void;
    minimizeWindow(window: Meta.Window): void;
    maximizeWindow(window: Meta.Window): void;
    // ...
}
```

##### 2.5 UI Components (Week 2, Days 3-4)
**Highest complexity - save for when patterns are established**

```
- extension/ui/notificationManager.js → notificationManager.ts
- extension/ui/zoneOverlay.js → zoneOverlay.ts
- extension/ui/conflictDetector.js → conflictDetector.ts
- extension/ui/confirmDialog.js → confirmDialog.ts
- extension/ui/layoutPreviewBackground.js → layoutPreviewBackground.ts
- extension/ui/zoneEditor.js → zoneEditor.ts
- extension/ui/layoutSwitcher.js → layoutSwitcher.ts
- extension/ui/panelIndicator.js → panelIndicator.ts
```

**Layout Switcher Subdirectory** (migrate together):
```
- extension/ui/layoutSwitcher/cardFactory.js → cardFactory.ts
- extension/ui/layoutSwitcher/resizeHandler.js → resizeHandler.ts
- extension/ui/layoutSwitcher/sectionFactory.js → sectionFactory.ts
- extension/ui/layoutSwitcher/tierConfig.js → tierConfig.ts
- extension/ui/layoutSwitcher/topBar.js → topBar.ts
```

**Key Types**:
```typescript
import St from '@girs/st';
import Clutter from '@girs/clutter';

// zoneOverlay.ts
interface OverlayOptions {
    duration?: number;
    opacity?: number;
    showLabels?: boolean;
}

class ZoneOverlay {
    private _overlayActors: Map<number, Clutter.Actor>;
    show(layout: Layout, options?: OverlayOptions): void;
    hide(): void;
    // ...
}

// layoutSwitcher.ts
interface LayoutCard {
    actor: St.Button;
    layout: Layout;
    updatePreview(): void;
}

class LayoutSwitcher {
    private _dialog: St.Widget | null;
    open(): void;
    close(): void;
    // ...
}
```

##### 2.6 Keybinding Manager (Week 2, Day 5)
```
- extension/keybindingManager.js → keybindingManager.ts
```

**Types**:
```typescript
import Shell from '@girs/shell';

type KeybindingAction = () => void;

interface KeybindingConfig {
    name: string;
    settingsKey: string;
    handler: KeybindingAction;
    flags?: Shell.KeyBindingFlags;
}

class KeybindingManager {
    private _bindings: Map<string, number>;
    registerKeybindings(): void;
    unregisterKeybindings(): void;
    // ...
}
```

##### 2.7 Main Entry Points (Week 2, Day 5)
**Final migration - everything else must be typed first**

```
- extension/extension.js → extension.ts
- extension/prefs.js → prefs.ts
```

**Extension Types**:
```typescript
import {Extension} from '@girs/gnome-shell/extensions/extension';
import Gio from '@girs/gio';

export default class ZonedExtension extends Extension {
    private _settings: Gio.Settings | null;
    private _windowManager: WindowManager | null;
    private _layoutManager: LayoutManager | null;
    // ... all other managers
    
    enable(): void;
    disable(): void;
    // ...
}
```

---

### Phase 3: Type Refinement (Week 3)

#### 3.1 Eliminate `any` Types
**Goal**: <10% usage of `any`

```typescript
// Before (lazy typing)
function handleSignal(data: any): void { ... }

// After (proper union types)
type SignalData = string | number | boolean | null;
function handleSignal(data: SignalData): void { ... }
```

**Search for `any`**:
```bash
grep -r "any" extension/**/*.ts
```

#### 3.2 Add Strict Null Checks
**Enable**: `strictNullChecks: true` in `tsconfig.json`

```typescript
// Forces explicit null handling
getCurrentLayout(): Layout | null {
    if (!this._currentLayoutId) return null;
    return this._layouts.find(l => l.id === this._currentLayoutId) ?? null;
}
```

#### 3.3 Generic Signal Handlers
```typescript
type SignalHandler<T extends any[]> = (...args: T) => void;

class SignalTracker {
    track<T extends any[]>(
        obj: GObject.Object,
        signal: string,
        handler: SignalHandler<T>
    ): void {
        // Properly typed signal tracking
    }
}
```

#### 3.4 Enforce Destroyable Pattern
```typescript
interface Destroyable {
    destroy(): void;
}

// All components must implement
export class WindowManager implements Destroyable {
    destroy(): void {
        // Compiler enforces this method exists
    }
}
```

#### 3.5 Add JSDoc for Generated Documentation
```typescript
/**
 * Manages window zone placement and positioning
 * 
 * @example
 * ```typescript
 * const wm = new WindowManager();
 * const window = wm.getFocusedWindow();
 * if (window) wm.moveWindowToZone(window, zone);
 * ```
 */
export class WindowManager implements Destroyable {
    // ...
}
```

---

### Phase 4: Testing & Validation (Week 3)

#### 4.1 Compilation Validation
```bash
# Zero TypeScript errors
npx tsc --noEmit

# ESLint passes
npm run lint
```

#### 4.2 Functional Testing
**VM Test Suite**:
```bash
make vm-install
./scripts/vm test func
./scripts/vm test mem
```

**Tests must pass**:
- [ ] Extension loads without errors
- [ ] Layout switching works
- [ ] Zone cycling works  
- [ ] Keybindings function correctly
- [ ] Multi-monitor support intact
- [ ] Workspace switching works
- [ ] Memory leak tests pass (critical!)

#### 4.3 Memory Leak Regression
**Baseline**: Current JavaScript version memory profile  
**TypeScript**: Must not exceed +5% memory variance

```bash
./scripts/tests/test-mem-with-restarts
# Compare before/after migration
```

#### 4.4 Type Coverage Analysis
```bash
# Install type coverage tool
npm install --save-dev type-coverage

# Check coverage
npx type-coverage --detail
# Target: >90% coverage
```

#### 4.5 Performance Testing
**Ensure compilation doesn't slow down extension**:
- Extension load time <100ms delta
- Layout switch responsiveness unchanged
- No perceivable UI lag

---

## File Structure Changes

### Before (JavaScript)
```
extension/
├── extension.js
├── layoutManager.js
├── windowManager.js
├── ...
└── utils/
    └── debug.js
```

### After (TypeScript)
```
extension/              # Source TypeScript files
├── extension.ts
├── layoutManager.ts
├── types/
│   ├── layout.d.ts    # Shared type definitions
│   ├── zone.d.ts
│   └── gnome-shell.d.ts  # Custom GNOME types
└── utils/
    └── debug.ts

build/
└── typescript/        # Compiled JavaScript (gitignored)
    ├── extension.js
    └── ...
```

### Build Artifacts
**Add to `.gitignore`**:
```
build/typescript/
*.tsbuildinfo
```

**Include in release**: Compiled `.js` files (not `.ts` sources)

---

## Makefile Integration

### Updated Makefile Targets

```makefile
# TypeScript compilation
build-ts:
	@echo "Compiling TypeScript..."
	@npx tsc
	@echo "TypeScript compiled successfully"

# Watch mode for development
watch-ts:
	@echo "Starting TypeScript watch mode..."
	@npx tsc --watch

# Clean build artifacts
clean-ts:
	@rm -rf build/typescript
	@rm -f *.tsbuildinfo

# Full clean
clean: clean-ts
	# ... existing clean logic

# Install (with TypeScript build)
install: build-ts
	@echo "Installing extension with TypeScript build..."
	# Copy from build/typescript/ to ~/.local/share/gnome-shell/extensions/
	# ... existing install logic

# VM install (with TypeScript build)
vm-install: build-ts
	@echo "Deploying TypeScript build to VM..."
	# Deploy compiled .js files
	# ... existing vm-install logic

# Development workflow
dev: build-ts install
	@echo "Development install complete"

# Lint TypeScript
lint-ts:
	@npx eslint extension/**/*.ts

# Type check without compilation
typecheck:
	@npx tsc --noEmit

# CI/Testing
test: build-ts lint-ts typecheck
	# Run VM tests with TypeScript build
	./scripts/vm test func
```

### package.json Scripts

```json
{
  "scripts": {
    "build": "tsc",
    "watch": "tsc --watch",
    "lint": "eslint extension/",
    "lint:fix": "eslint extension/ --fix",
    "typecheck": "tsc --noEmit",
    "type-coverage": "type-coverage --detail"
  }
}
```

---

## Migration Checklist

### Phase 1: Foundation ✓
- [x] Create `infra/typescript-migration` branch
- [x] Install TypeScript and GJS type definitions
- [x] Create `tsconfig.json` with GNOME-specific settings
- [x] Update ESLint for TypeScript support
- [x] Update Makefile with Rollup build targets (using Rollup instead of tsc)
- [x] Update `.gitignore` for build artifacts
- [ ] Document TypeScript setup in DEVELOPMENT.md
- [x] Test basic TypeScript compilation (via Rollup)
- [x] Create `extension/types/` directory for centralized type declarations

**Notes:**
- Using Rollup for TypeScript compilation instead of direct tsc
- Centralized global type declarations in `extension/types/global.d.ts`
- Build outputs to `build/rollup/` instead of `build/typescript/`

### Phase 2: File Migration ✓
**Utilities** (2 days) - ✅ COMPLETE (6 of 6)
- [x] Migrate `utils/versionUtil.js` → versionUtil.ts
- [x] Migrate `utils/theme.js` → theme.ts (+ removed duplicate global types)
- [x] Migrate `utils/debug.js` → debug.ts
- [x] Migrate `utils/notificationService.js` → notificationService.ts
- [x] Migrate `utils/signalTracker.js` → signalTracker.ts
- [x] Migrate `utils/resourceTracker.js` → resourceTracker.ts
- [ ] Test: VM install + basic functionality

**Data Structures** (1 day)
- [ ] Define core types (`Zone`, `Layout`, `Template`)
- [ ] Migrate `templateManager.js`
- [ ] Test: Layout templates still work

**State Managers** (2 days)
- [ ] Migrate `spatialStateManager.js`
- [ ] Migrate `layoutManager.js`
- [ ] Test: Layout switching, per-workspace layouts

**Window Management** (1 day)
- [ ] Migrate `windowManager.js`
- [ ] Test: Window snapping, minimize/maximize

**UI Components** (3 days)
- [ ] Migrate `ui/notificationManager.js`
- [ ] Migrate `ui/zoneOverlay.js`
- [ ] Migrate `ui/conflictDetector.js`
- [ ] Migrate `ui/confirmDialog.js`
- [ ] Migrate `ui/layoutPreviewBackground.js`
- [ ] Migrate `ui/zoneEditor.js`
- [ ] Migrate `ui/layoutSwitcher.js` + subdirectory
- [ ] Migrate `ui/panelIndicator.js`
- [ ] Test: Full UI interactions

**Keybindings** (1 day)
- [ ] Migrate `keybindingManager.js`
- [ ] Test: All keyboard shortcuts work

**Entry Points** (1 day)
- [ ] Migrate `extension.js`
- [ ] Migrate `prefs.js`
- [ ] Test: Extension enable/disable, preferences UI

### Phase 3: Type Refinement ✓
- [ ] Fix all TypeScript compilation errors
- [ ] Eliminate `any` usage (<10%)
- [ ] Add strict null checks
- [ ] Implement `Destroyable` interface pattern
- [ ] Add generics for signal handlers
- [ ] Add JSDoc documentation
- [ ] Run type coverage analysis (target >90%)

### Phase 4: Testing & Validation ✓
- [ ] TypeScript compiles with zero errors
- [ ] ESLint passes on all `.ts` files
- [ ] VM functional tests pass
- [ ] Memory leak tests pass (no regression)
- [ ] Extension loads successfully
- [ ] All features work identically to JS version
- [ ] Performance benchmarks acceptable
- [ ] Code review of type definitions

### Phase 5: Documentation & Deployment ✓
- [ ] Update DEVELOPMENT.md with TypeScript workflow
- [ ] Update CONTRIBUTING.md with TypeScript standards
- [ ] Update README.md installation instructions
- [ ] Create TYPESCRIPT_MIGRATION_NOTES.md (lessons learned)
- [ ] Remove old `.js` files
- [ ] Update CI/CD for TypeScript builds
- [ ] Merge to main via PR

---

## Post-Migration Workflow

### Developer Workflow
```bash
# Clone repository
git clone https://github.com/hamiltonia/zoned.git
cd zoned

# Install dependencies (includes TypeScript)
npm install

# Development with watch mode
make watch-ts &         # Terminal 1: TypeScript watch
make vm-logs &          # Terminal 2: VM logs

# Make changes to .ts files
# TypeScript auto-compiles
# Deploy to VM
make vm-install

# Run tests
make typecheck         # Type check only
./scripts/vm test func # Functional tests
```

### Release Process
```bash
# Build production TypeScript
make build-ts

# Run full test suite
make test

# Package extension (includes compiled JS)
make zip

# Release includes compiled .js files, not .ts sources
```

---

## Rollback Plan

If migration encounters blockers:

### Option 1: Branch Pause
- Keep `infra/typescript-migration` branch
- Continue JavaScript development on `main`
- Revisit when GJS TypeScript ecosystem matures

### Option 2: Partial TypeScript
- Migrate only utilities and data structures
- Keep complex UI in JavaScript
- Gradual adoption over multiple releases

### Option 3: JSDoc Alternative
- Add TypeScript-compatible JSDoc annotations
- Get 70% of benefits without build complexity
- Example:
  ```javascript
  /**
   * @param {string} layoutId
   * @returns {boolean}
   */
  setLayout(layoutId) { ... }
  ```

---

## Open Questions

1. **GJS Type Definitions**: Are `@girs/gnome-shell` types complete for Shell 46?
   - **Action**: Test with sample migration before committing
   - **Fallback**: Create custom `.d.ts` files

2. **Source Maps**: Should we generate source maps for debugging?
   - **Consideration**: Helpful for stack traces, adds file size
   - **Decision**: Enable in development, disable in production

3. **Bundle Size**: Does TypeScript compilation affect extension size?
   - **Action**: Compare bundle sizes before/after
   - **Acceptable**: <10% increase

4. **Type Definition Updates**: How to handle GNOME Shell version updates?
   - **Strategy**: Pin `@girs/*` versions, test before updating
   - **Document**: Add version compatibility matrix

5. **CI/CD**: Should CI run on TypeScript source or compiled JS?
   - **Answer**: Run TypeScript compilation in CI, test compiled JS
   - **Benefit**: Catches type errors before merge

---

## Resources

### TypeScript for GJS
- [`ts-for-gir`](https://github.com/gjsify/ts-for-gir) - GJS TypeScript type generator
- [`@girs` packages](https://www.npmjs.com/search?q=%40girs) - Pre-generated type definitions
- [GJS Guide](https://gjs.guide/) - GJS/GNOME Shell development guide

### TypeScript Documentation
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Do's and Don'ts](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)
- [TypeScript ESLint](https://typescript-eslint.io/)

### GNOME Shell Extension Development
- [GNOME Shell Extensions](https://gjs.guide/extensions/)
- [Extension Review Guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html)

---

## Timeline

### Week 1: Foundation + Utilities
- **Days 1-2**: Setup, tooling, configuration
- **Days 3-4**: Migrate utility files
- **Day 5**: Migrate data structures

### Week 2: Core Components
- **Days 1-2**: State managers (spatial, layout)
- **Day 2**: Window manager
- **Days 3-4**: UI components
- **Day 5**: Keybindings + entry points

### Week 3: Polish + Testing
- **Days 1-2**: Type refinement, eliminate `any`
- **Days 3-4**: Testing, validation, memory leak checks
- **Day 5**: Documentation, code review, merge prep

**Total**: 15 working days (3 weeks)

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-09 | Proceed with full TypeScript migration | Benefits outweigh risks; AI development benefits from stronger types |
| 2026-01-09 | Use incremental migration strategy | Minimize risk, allow testing at each stage |
| 2026-01-09 | Target >90% type coverage | Balance between strictness and pragmatism |
| TBD | Source map decision | Pending size analysis |
| TBD | `strictPropertyInitialization` setting | May need to disable for GNOME patterns |

---

## Success Metrics

### Code Quality
- **Type Coverage**: >90%
- **ESLint Errors**: 0
- **TypeScript Errors**: 0
- **any Usage**: <10%

### Functionality
- **Test Pass Rate**: 100%
- **Extension Load**: Success
- **Memory Variance**: <5% vs. JavaScript baseline
- **Feature Parity**: 100%

### Developer Experience
- **Build Time**: <5 seconds
- **Watch Mode Latency**: <1 second recompile
- **IDE Autocomplete**: Functional for GNOME APIs
- **Error Messages**: Clear and actionable

---

## Next Steps

1. **Review this plan** - Stakeholder approval
2. **Create tracking issue** - GitHub issue for migration progress
3. **Set up tooling** - Phase 1 execution
4. **Spike test** - Migrate one utility file to validate approach
5. **Full execution** - Proceed through phases 2-4
6. **Merge strategy** - PR review and main branch merge

---

**Status**: Awaiting approval to proceed with Phase 1

**Last Updated**: January 9, 2026
