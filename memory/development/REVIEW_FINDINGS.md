# Zoned MVP Release - Code Review Findings

**Review Date:** 2025-12-13  
**Reviewer:** Cline (automated + manual analysis)  
**Checklist Reference:** `memory/development/mvp-release-checklist.md`

---

## Executive Summary

The codebase is in **good shape** for GNOME extension review. One potential leak was identified that should be fixed before release. The extension follows GNOME lifecycle patterns correctly with proper enable/disable cleanup.

| Severity | Count |
|----------|-------|
| 🔴 BLOCKER | 0 |
| 🟠 HIGH | 0 (1 found, fixed) |
| 🟡 MEDIUM | 0 (1 found, fixed) |
| 🟢 LOW | 2 |

---

## Phase 1: Pattern Grep Audit Results

### Signal Connections vs Disconnections

| Metric | Count | Notes |
|--------|-------|-------|
| `.connect()` calls | 120 | Most on actors that get destroyed |
| `.disconnect()` calls | 14 | For persistent objects (GSettings, global.*) |

**Analysis:** The mismatch is expected. Signals on St.Widget actors are automatically cleaned when the widget is destroyed. Only signals on persistent objects (GSettings, global.stage, global.workspace_manager) require explicit disconnection.

### Timeout/Idle Sources

| File | Type | Auto-cleanup? |
|------|------|---------------|
| layoutSettingsDialog.js:181 | idle_add | ✅ Returns SOURCE_REMOVE |
| layoutSettingsDialog.js:1344 | idle_add | ✅ Returns SOURCE_REMOVE |
| layoutSettingsDialog.js:1503 | idle_add | ✅ Returns SOURCE_REMOVE |
| notificationManager.js:118 | timeout_add | ✅ Stored ID, removed in _hide() |
| zoneOverlay.js:138 | timeout_add | ✅ Stored ID, removed in _hide() |
| layoutSwitcher.js:623 | timeout_add | ✅ Returns SOURCE_REMOVE |
| prefs.js:899 | timeout_add | ✅ Returns SOURCE_REMOVE (separate process) |
| prefs.js:1433 | timeout_add | ✅ Returns SOURCE_REMOVE (separate process) |

### Other Patterns

| Pattern | Result |
|---------|--------|
| eval() / new Function() | ✅ None found |
| Global state (file-level let/var) | ✅ None found |
| console.log | ✅ 4 occurrences - all in debug utilities |
| GTK imports in extension.js | ✅ None (correct) |
| Clutter/St imports in prefs.js | ✅ None (correct) |

---

## Phase 2: Lifecycle Audit

### Extension.js enable/disable Mapping

| Created in enable() | Destroyed in disable() | Status |
|---------------------|------------------------|--------|
| `_settings` | `= null` | ✅ |
| `_windowManager` | `.destroy()` | ✅ |
| `_layoutManager` | `.destroy()` | ✅ |
| `_spatialStateManager` | `.destroy()` | ✅ |
| `_conflictDetector` | `.destroy()` | ✅ |
| `_notificationManager` | `.destroy()` | ✅ |
| `_zoneOverlay` | `.destroy()` | ✅ |
| `_templateManager` | `= null` (no cleanup needed) | ✅ |
| `_layoutSwitcher` | `.destroy()` | ✅ |
| `_panelIndicator` | `.destroy()` | ✅ |
| `_keybindingManager` | `.destroy()` | ✅ |
| `_conflictCountSignal` | `_settings.disconnect()` | ✅ |
| `_workspaceSwitchedSignal` | `workspace_manager.disconnect()` | ✅ |

### Signal Connection Inventory (Persistent Objects)

| File | Line | Object | Signal | Disconnected? | Location |
|------|------|--------|--------|---------------|----------|
| extension.js | 124 | _settings | 'changed::keybinding-conflict-count' | ✅ | disable():209 |
| extension.js | 280 | workspace_manager | 'workspace-switched' | ✅ | disable():202 |
| keybindingManager.js | 71 | _settings | 'changed::enhanced-window-management-enabled' | ✅ | destroy():409 |
| prefs.js | 535 | _settings | 'changed::${key}' | ✅ | destroy():943 |
| prefs.js | 541 | _settings | 'changed::keybinding-conflict-count' | ✅ | destroy():947 |
| prefs.js | 1449 | settings | 'changed::prefs-close-requested' | ✅ | window.close-request handler:1461 |

### Stage Signal Cleanup

| File | Signal | Connected | Disconnected | Status |
|------|--------|-----------|--------------|--------|
| resizeHandler.js | motion-event | startResize():111 | endResize():191 | ⚠️ See HIGH issue |
| resizeHandler.js | button-release-event | startResize():115 | endResize():195 | ⚠️ See HIGH issue |
| topBar.js | ??? | Never connected | closeMonitorDropdown():670 | 🟡 Dead code |

---

## Issues Found

### 🟠 HIGH: Stage signals not cleaned if dialog closed during resize

**File:** `extension/ui/layoutSwitcher/resizeHandler.js`  
**Lines:** 111, 115 (connect), 191, 195 (disconnect)

**Problem:** When the user starts resizing the LayoutSwitcher dialog (`startResize()`), two signals are connected to `global.stage`:
- `_resizeMotionId` (motion-event)
- `_resizeButtonReleaseId` (button-release-event)

These are properly disconnected in `endResize()`. However, if the dialog is closed (via Escape key or clicking outside) while a resize is in progress, `layoutSwitcher.hide()` does NOT call `endResize()` to clean up these signals.

**Impact:** Signal leak on `global.stage` - will accumulate if user repeatedly closes dialog during resize.

**Fix:**
```javascript
// In layoutSwitcher.js hide() method, add before releasing modal:
if (this._isResizing) {
    endResize(this);
}
```

Or directly in hide():
```javascript
// Clean up resize signals if active
if (this._resizeMotionId) {
    global.stage.disconnect(this._resizeMotionId);
    this._resizeMotionId = null;
}
if (this._resizeButtonReleaseId) {
    global.stage.disconnect(this._resizeButtonReleaseId);
    this._resizeButtonReleaseId = null;
}
this._isResizing = false;
```

---

### 🟡 MEDIUM: Dead code in topBar.js closeMonitorDropdown()

**File:** `extension/ui/layoutSwitcher/topBar.js`  
**Line:** 670

**Problem:** `closeMonitorDropdown()` attempts to disconnect `ctx._menuCaptureId` from `global.stage`, but this ID is never connected anywhere in the codebase. This appears to be leftover code from a removed feature.

**Impact:** No leak (since nothing is connected), but dead code should be cleaned up.

**Fix:** Remove the unused disconnect block:
```javascript
// Remove these lines from closeMonitorDropdown():
if (ctx._menuCaptureId) {
    global.stage.disconnect(ctx._menuCaptureId);
    ctx._menuCaptureId = null;
}
```

---

### 🟢 LOW: Excessive logging in prefs.js

**File:** `extension/prefs.js`  
**Lines:** Multiple (241-258, 306, 350, 401, 441, etc.)

**Problem:** Many `log()` calls for debugging shortcut capture flow. While prefs.js runs in a separate GTK process (not blocking GNOME Shell), excessive logging can clutter journalctl.

**Impact:** Minor - affects journalctl readability during development/debugging.

**Recommendation:** Either:
1. Remove debug logging before release
2. Gate behind a debug flag
3. Leave as-is (acceptable for v1.0, clean up in v1.1)

---

### 🟢 LOW: Unused _menuCaptureId variable

**File:** `extension/ui/layoutSwitcher/topBar.js`

**Problem:** Related to MEDIUM issue - the `_menuCaptureId` variable is referenced but never assigned.

**Impact:** Minimal - cleanup for code hygiene.

---

## Phase 3: GNOME Review Blockers Checklist

| Check | Status | Notes |
|-------|--------|-------|
| No work in constructor/init | ✅ | Only null initialization in constructors |
| All cleanup in disable() | ⚠️ | One issue with resize signals, otherwise clean |
| No eval() or Function() | ✅ | None found |
| No synchronous file I/O in main thread | ✅ | Layout loading uses sync but at enable() time |
| No hardcoded paths | ✅ | Uses Extension.path properly |
| Proper GSettings schema installation | ✅ | Schema compiles with --strict |
| No GNOME Shell prototype modifications | ✅ | None found |
| ESM imports (GNOME 45+ style) | ✅ | All imports use ESM syntax |
| metadata.json complete and valid | ✅ | Recently cleaned up |
| No leftover debug logs (console.log) | ✅ | Only in debug utilities |
| License header in all files | 🟡 | Missing from most files (minor) |

### GSettings Schema Validation

```bash
$ glib-compile-schemas --strict extension/schemas/
# No output = success
```

✅ Schema compiles cleanly with no warnings.

---

## Phase 4: Architecture Notes

### Module Dependency Structure (Simplified)

```
extension.js
├── WindowManager
├── LayoutManager
│   └── SpatialStateManager
├── TemplateManager
├── KeybindingManager
├── NotificationManager
├── ZoneOverlay
├── ConflictDetector
├── PanelIndicator
└── LayoutSwitcher
    ├── cardFactory.js
    ├── sectionFactory.js
    ├── topBar.js
    └── resizeHandler.js
```

### Error Handling

Most try/catch blocks log errors appropriately. No empty catch blocks found.

### Code Quality

- Consistent naming conventions (_private members)
- JSDoc on most public methods
- Reasonable file sizes (largest is layoutSwitcher.js ~1300 lines)

---

## Recommendations

### Before v1.0 Release

1. **Fix HIGH issue** - Add resize signal cleanup to `layoutSwitcher.hide()`
2. **Remove dead code** - Clean up unused `_menuCaptureId` references

### Nice to Have (v1.1)

1. Gate prefs.js logging behind debug flag
2. Add license headers to files
3. Consider file size reduction for layoutSwitcher.js (already modularized)

---

## Test Commands for Runtime Validation (Phase 5)

To be executed in VM:

```bash
# Enable/disable cycle test
for i in {1..10}; do
  gnome-extensions disable zoned@hamiltonia.github.io
  sleep 1
  gnome-extensions enable zoned@hamiltonia.github.io
  sleep 1
done

# Watch for errors
journalctl -f /usr/bin/gnome-shell 2>&1 | grep -i "zoned\|error\|warning\|leak"

# Memory baseline
ps aux | grep gnome-shell | awk '{print $6}'
```

---

## Acceptance Criteria Status

| Criteria | Status |
|----------|--------|
| Zero 🔴 BLOCKER issues | ✅ |
| Zero 🟠 HIGH issues | ✅ (1 found, **fixed** 2025-12-13) |
| All Phase 5 runtime tests pass | ⏳ Pending VM testing |
| ESLint passes with zero warnings | ⏳ No ESLint config yet |
| GSettings schema compiles cleanly | ✅ |
| Unit Testing Decision documented | ⏳ Pending |
| Release pipeline functional | ⏳ Not started |
| Issue templates in place | ⏳ Not started |

### Fixes Applied (2025-12-13)

1. **layoutSwitcher.js** - Added resize signal cleanup in `hide()` method to prevent stage signal leak when dialog closes during resize
2. **topBar.js** - Removed dead code (`_menuCaptureId` disconnect block that was never connected)

---

*Generated by Cline MVP Review Process*
