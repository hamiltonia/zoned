# Zoned MVP Release Checklist

## Purpose

This document defines the systematic validation process for the Zoned GNOME Shell extension before v1.0 release. It covers code review, GNOME compliance, runtime validation, and release infrastructure.

**Context**: 100% of code was written by agentic AI (Cline + Sonnet/Opus). This checklist ensures the codebase meets GNOME extension standards and is production-ready.

---

## Unit Testing Decision

> **IMPORTANT**: Complete this section before executing Phase 7.1. Unit testing may require code restructuring.

### The Problem

GNOME Shell extensions are difficult to unit test because:
- They run inside GNOME Shell's process
- They depend on GJS bindings and live objects (Meta.Window, St.Widget, etc.)
- Mocking the GNOME Shell environment is non-trivial

### Options

| Option | Effort | Coverage | Trade-offs |
|--------|--------|----------|------------|
| **A. No unit tests** | None | Manual/runtime only | Relies on Phase 5 validation |
| **B. Pure function tests** | Low | Utilities only | Test `layoutConverter.js`, etc. with Node.js/Jest |
| **C. Integration harness** | Medium | Black-box | Script that drives extension via D-Bus |
| **D. Major restructure** | High | Full | Extract logic into testable pure modules |

### Decision

- [ ] **Selected option**: ________________
- [ ] **Rationale**: ________________
- [ ] **Date decided**: ________________

---

## Review Phases

### Phase 1: Automated Static Analysis

**Objective**: Catch low-hanging fruit with zero manual effort.

#### 1.1 ESLint Validation
```bash
cd extension
npm run lint -- --max-warnings 0
```

**Pass criteria**: Zero errors, zero warnings.

**Note**: If no ESLint config exists, use GNOME's recommended config or create a minimal one.

#### 1.2 Complexity Check
```bash
npx eslint --rule 'complexity: ["warn", 10]' src/**/*.js
```

**Flag**: Any function with cyclomatic complexity > 10.

#### 1.3 Pattern Grep Audit

Run these searches and document findings:

| Pattern | Command | Risk |
|---------|---------|------|
| Signal connections | `grep -rn "\.connect(" extension/` | Memory leak if untracked |
| Signal disconnections | `grep -rn "\.disconnect(" extension/` | Must match connections |
| Timeout sources | `grep -rn "GLib.timeout_add\|GLib.idle_add" extension/` | Must be removed in disable() |
| Object destruction | `grep -rn "\.destroy(" extension/` | Verify lifecycle |
| Constructor work | `grep -rn "constructor\|_init" extension/` | Should be minimal |
| eval/Function | `grep -rn "eval(\|new Function(" extension/` | Security blocker |
| Global state | `grep -rn "^let \|^var " extension/*.js` | Potential leak |
| Debug logs | `grep -rn "console\.log\|log(" extension/` | Remove before release |

**Deliverable**: Table of grep results with line counts.

---

### Phase 2: Lifecycle Audit (CRITICAL)

**Objective**: Verify strict compliance with GNOME extension lifecycle rules.

> **GNOME Rule**: Extensions must not do work in `constructor()` or `_init()`. All setup happens in `enable()`, all teardown in `disable()`.

#### 2.1 extension.js Analysis

Create a two-column mapping:

| Created in enable() | Destroyed in disable() |
|---------------------|------------------------|
| `this._indicator` | `this._indicator.destroy()` |
| `this._settings.connect(...)` | `this._settings.disconnect(...)` |
| ... | ... |

**Pass criteria**: Every row has both columns filled. No orphans.

#### 2.2 Signal Connection Inventory

For each file, document:

```markdown
### [filename.js]

| Line | Object | Signal | Connection Variable | Disconnected? | Location |
|------|--------|--------|---------------------|---------------|----------|
| 45 | this._settings | 'changed' | this._settingsChangedId | ✅ | disable():102 |
| 67 | global.display | 'window-created' | this._windowCreatedId | ❌ MISSING | - |
```

**Pass criteria**: All connections have corresponding disconnections in `disable()`.

#### 2.3 Timeout/Idle Source Inventory

| Line | Type | Source Variable | Removed? | Location |
|------|------|-----------------|----------|----------|
| 89 | timeout_add | this._updateTimeoutId | ✅ | disable():110 |

**Pass criteria**: All sources removed with `GLib.source_remove()` in `disable()`.

---

### Phase 3: GNOME Review Blockers

**Objective**: Pre-check against [extensions.gnome.org review guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html).

#### 3.1 Blockers Checklist

| Check | Status | Notes |
|-------|--------|-------|
| No work in constructor/init | ⬜ | |
| All cleanup in disable() | ⬜ | |
| No eval() or Function() | ⬜ | |
| No synchronous file I/O in main thread | ⬜ | |
| No hardcoded paths (use ExtensionUtils) | ⬜ | |
| Proper GSettings schema installation | ⬜ | |
| No modifications to GNOME Shell prototypes | ⬜ | |
| ESM imports (GNOME 45+ style) | ⬜ | |
| metadata.json complete and valid | ⬜ | |
| No leftover debug logs (console.log) | ⬜ | |
| License header in all files | ⬜ | |

#### 3.2 GSettings Schema Validation

```bash
# Verify schema compiles
glib-compile-schemas --strict extension/schemas/

# Verify schema ID matches code usage
grep -rn "org.gnome.shell.extensions.zoned" extension/
```

**Pass criteria**: Schema compiles without warnings; ID matches usage.

---

### Phase 4: Architectural Review

**Objective**: Identify structural issues, dead code, and maintainability problems.

#### 4.1 Module Dependency Map

Create a dependency graph showing imports between modules:

```
extension.js
├── windowManager.js
├── layoutManager.js
│   └── layouts.js
├── keybindings.js
└── ui/
    ├── indicator.js
    └── layoutPicker.js
```

**Flag**: Circular dependencies, unused modules.

#### 4.2 Dead Code Detection

```bash
# Find exported functions
grep -rn "^export " extension/

# Cross-reference with imports
grep -rn "^import " extension/
```

**Flag**: Exports with no corresponding imports.

#### 4.3 Error Handling Audit

For each try/catch block:

| File | Line | Catches | Handling | Adequate? |
|------|------|---------|----------|-----------|
| extension.js | 45 | Error | log only | ⚠️ Silent failure |

**Flag**: Empty catch blocks, swallowed errors, missing error boundaries.

#### 4.4 Code Duplication Detection

Scan for repeated patterns:

```bash
# Look for similar function signatures
grep -rn "function.*{" extension/ | sort

# Check for copy-paste patterns (similar multi-line blocks)
```

**Flag**: Functions that do nearly the same thing, repeated logic that should be extracted.

#### 4.5 Settings/Preferences Audit

Review `prefs.js` and GSettings usage:

| Check | Status |
|-------|--------|
| All settings have UI controls | ⬜ |
| All UI controls map to actual settings | ⬜ |
| No orphaned settings keys | ⬜ |
| Consistent naming between schema and code | ⬜ |
| Settings changes trigger appropriate updates | ⬜ |

---

### Phase 5: Runtime Validation

**Objective**: Verify behavior under real conditions.

#### 5.1 Enable/Disable Cycle Test

```bash
# In Fedora 42 X11 VM
journalctl -f /usr/bin/gnome-shell 2>&1 | grep -i "zoned\|error\|warning\|leak"

# Rapid toggle test (10 cycles)
for i in {1..10}; do
  gnome-extensions disable zoned@hamiltonia.github.io
  sleep 1
  gnome-extensions enable zoned@hamiltonia.github.io
  sleep 1
done
```

**Pass criteria**: No errors, no "leak" warnings, no increasing memory.

#### 5.2 Stress Test Scenarios

| Scenario | Steps | Expected | Actual |
|----------|-------|----------|--------|
| Rapid zone cycling | Hold Super+Right for 5s | Smooth cycling | |
| Layout switch during drag | Open picker while dragging | No crash | |
| Multi-monitor hot-plug | Disconnect monitor while zoned | Graceful fallback | |
| Extension disable during operation | Disable mid-cycle | Clean shutdown | |

#### 5.3 Memory Leak Check

```bash
# Before enabling
ps aux | grep gnome-shell | awk '{print $6}'

# After 100 zone cycles
ps aux | grep gnome-shell | awk '{print $6}'
```

**Pass criteria**: Memory delta < 5MB after operations.

---

### Phase 6: Code Quality Review

**Objective**: Ensure maintainability and readability.

#### 6.1 Documentation Check

| Item | Present? | Quality |
|------|----------|---------|
| JSDoc on public functions | ⬜ | |
| Module-level comments | ⬜ | |
| Complex logic explained | ⬜ | |
| README accurate | ⬜ | |

#### 6.2 Naming Consistency

**Check for**:
- Private members prefixed with `_`
- Consistent casing (camelCase for functions, PascalCase for classes)
- Descriptive signal handler names (`_onWindowCreated` not `_handler1`)

#### 6.3 Magic Numbers/Strings

```bash
grep -rn "[0-9]\{3,\}" extension/  # Numbers > 99
grep -rn "\"[a-z-]\{10,\}\"" extension/  # Long strings
```

**Flag**: Unexplained constants that should be named.

---

### Phase 7: Release Infrastructure

**Objective**: Set up tooling for maintainable releases.

#### 7.1 Unit Testing

**Prerequisite**: Complete "Unit Testing Decision" section above.

Based on the decision:

| If Option | Action |
|-----------|--------|
| A (No tests) | Document rationale; rely on Phase 5 |
| B (Pure functions) | Set up Jest/Node.js test runner for utilities |
| C (Integration) | Create D-Bus test harness script |
| D (Restructure) | Create separate task for refactoring |

#### 7.2 GitHub Release Pipeline

- [ ] Create `.github/workflows/release.yml`
- [ ] Build extension zip on tag push
- [ ] Validate metadata.json
- [ ] Run ESLint in CI
- [ ] Publish to GitHub Releases

#### 7.3 GitHub Issue Templates

- [ ] Create `.github/ISSUE_TEMPLATE/bug_report.md`
- [ ] Create `.github/ISSUE_TEMPLATE/feature_request.md`
- [ ] Include system info collection (GNOME version, etc.)

---

## Deliverables

After completing all phases, produce:

1. **REVIEW_FINDINGS.md** — Table of all issues found
2. **LIFECYCLE_MAP.md** — Complete enable/disable resource mapping
3. **SIGNAL_INVENTORY.md** — All signal connections with status
4. **ISSUES.md** — Prioritized list of fixes needed

### Issue Severity Levels

| Level | Description | Example |
|-------|-------------|---------|
| 🔴 BLOCKER | Prevents GNOME review approval | Missing cleanup in disable() |
| 🟠 HIGH | Will cause runtime failures | Untracked signal connection |
| 🟡 MEDIUM | Code quality concern | Missing error handling |
| 🟢 LOW | Nice to fix | Inconsistent naming |

---

## Review Execution

### For AI Agent (Cline)

When executing this review:

1. Process phases sequentially
2. Output findings in markdown tables
3. Include file paths and line numbers
4. Do not fix issues during review — document only
5. Flag uncertainty with `[NEEDS VERIFICATION]`

### For Human Review

Focus manual attention on:

1. Phase 2 results (lifecycle) — highest risk
2. Any `[NEEDS VERIFICATION]` items
3. Phase 5 runtime tests — cannot be automated

---

## Acceptance Criteria

The codebase is ready for release when:

- [ ] Zero 🔴 BLOCKER issues
- [ ] Zero 🟠 HIGH issues
- [ ] All Phase 5 runtime tests pass
- [ ] ESLint passes with zero warnings
- [ ] GSettings schema compiles cleanly
- [ ] Unit Testing Decision documented
- [ ] Release pipeline functional
- [ ] Issue templates in place

---

## References

- [GJS Extension Review Guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html)
- [GNOME Shell Extension Development](https://gjs.guide/extensions/)
- [GJS API Documentation](https://gjs-docs.gnome.org/)
- [GNOME 45+ ESM Migration](https://gjs.guide/extensions/upgrading/gnome-shell-45.html)
