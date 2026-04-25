# Project Context

- **Project:** zoned
- **Created:** 2026-04-24

## Core Context

Agent Scribe initialized and ready for work.

## Recent Updates

📌 Team initialized on 2026-04-24

## Learnings

### Edie's TypeScript Migration Success (2026-04-25)

**From:** Edie's completion of 70 TypeScript errors across 16 files.

**Key Technical Insights:**
1. **Global Declaration Pattern:** TypeScript's ambient global augmentation fails in ES module contexts when .d.ts files have imports. Solution: explicit typed accessor module with `(globalThis as any).global` cast centralized in one place.
2. **@girs Type Conflicts:** Transitive dependencies in @girs packages can import same types from different paths, causing TS2345/TS2322 errors. Safe to use `as any` assertions with explanatory comments since runtime type is identical.
3. **Module Boundary Issues:** Many errors were cascading symptoms of one root cause (global type). Focus on root diagnosis before mass-fixing.

**Applicable to Future Work:**
- Any new global state access should import from `types/gjsGlobal`
- TypeScript migration is complete; maintain lint-strict and zero-error state going forward
- For @girs conflicts, document with "eslint-disable-line" comments rather than exploring alternatives

**Validation Recipe:**
```bash
npx tsc --noEmit      # Type checking
make lint-strict      # Zero warnings (CI-level)
make build-ts         # Full compilation test
```

---

Initial setup complete.
