# Squad Decisions

## Active Decisions

### TypeScript Global Access Pattern

**Decision:** Use explicit import of typed `global` accessor instead of ambient global declarations.

**Rationale:**
- TypeScript's global augmentation doesn't reliably work in ES module contexts with `.d.ts` files that have imports
- The pattern `(globalThis as any).global` with explicit typing provides compile-time type safety while working around module system limitations
- Centralizing the cast in `types/gjsGlobal.ts` means only one `as any` assertion for the entire codebase

**Alternative Considered:** 
- Ambient .d.ts declarations — failed because module imports prevent global scope augmentation
- Per-file `declare const global` — too repetitive and error-prone

**Impact:**
- All files accessing GJS `global` must import from `types/gjsGlobal`
- One-time pattern; future code should follow the same import approach
- Clean, type-safe access without scattered `as any` casts

**Status:** Implemented (2026-04-25)

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
