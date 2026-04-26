# History

No sessions yet.

## Learnings

### Fixed TypeScript Migration - Zero Errors Achieved (2025-04-24)

Successfully resolved all 70 TypeScript errors on `infra/typescript-migration` branch:

**Root Cause 1: Global type declaration (44 errors TS7017)**
- TypeScript's global augmentation wasn't working for GJS runtime's `global` object
- Solution: Created `extension/types/gjsGlobal.ts` that exports a typed `global` constant cast from `(globalThis as any).global`
- All 11 files now import `{global} from './types/gjsGlobal'` for type-safe access
- Key insight: `.d.ts` ambient declarations with imports become modules, not global scripts — explicit import pattern is more reliable for ES modules

**Root Cause 2: @girs transitive type conflicts (18 errors TS2345/TS2322)**
- Same types imported from different module paths in @girs packages (e.g., `Gio.Icon` from `@girs/gio-2.0` vs `@girs/meta-14/node_modules/@girs/gio-2.0`)
- Solution: Used `as any` type assertions with `eslint-disable-line` comments explaining "@girs type conflict"
- Affected: `prefs.ts` (Gtk.Widget, Gio.Icon, Gdk.Display, EventController), UI components (St.Icon gicon property)
- Key: These are safe assertions — same runtime type from different compile-time paths

**Root Cause 3: Missing parameter types (8 errors TS7006)**
- All in `extension.ts` — debug callbacks had implicit `any` parameters
- Would have been fixed automatically once global type errors resolved, as the debug interface methods have proper signatures

**Key Files Created:**
- `extension/types/gjsGlobal.ts` — Runtime global accessor with full typing
- Files importing global: extension.ts, windowManager.ts, spatialStateManager.ts, templateManager.ts, layoutSwitcher.ts, topBar.ts, resizeHandler.ts, zoneEditor.ts, debugInterface.ts, signalTracker.ts, theme.ts

**Validation:**
- `npx tsc --noEmit` — 0 errors ✅
- `make lint-strict` — 0 warnings ✅  
- `make build-ts` — successful compilation ✅

