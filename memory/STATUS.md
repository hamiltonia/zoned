# Zoned Implementation Status

**Last Updated:** 2025-12-07  
**Version:** Pre-release (active development)

---

## Purpose

This document tracks the current implementation state of the Zoned GNOME Shell Extension. Use this as the single source of truth for what's implemented, what's evolving, and what's planned.

**For Contributors:** Check this before diving into architecture docs - some may describe older/planned systems.

---

## ✅ Implemented & Stable

These components are implemented and unlikely to change significantly:

- **WindowManager** (`windowManager.js`)
  - Window positioning and zone assignment
  - Multi-monitor support
  - Move window to zone functionality
  
- **KeybindingManager** (`keybindingManager.js`)
  - Core keyboard shortcuts (Super+arrows, etc.)
  - Keybinding registration/cleanup
  
- **ZoneOverlay** (`ui/zoneOverlay.js`)
  - Visual zone preview overlays
  
- **NotificationManager** (`ui/notificationManager.js`)
  - OSD-style zone change notifications
  
- **TemplateManager** (`templateManager.js`)
  - Built-in layout templates (halves, thirds, quarters, focus)
  - Template-to-layout conversion
  
- **LayoutConverter** (`utils/layoutConverter.js`)
  - Zone ↔ Edge layout conversion
  - Bidirectional transformation utilities

- **ConfirmDialog** (`ui/confirmDialog.js`)
  - Simple ModalDialog wrapper for confirmations

- **LayoutSettingsDialog** (`ui/layoutSettingsDialog.js`)
  - Gateway dialog for creating/editing layouts
  - Two modes: Create (layout=null) and Edit (layout=existing)
  - Settings-first approach enforcing name before save
  - Integration with ZoneEditor for geometry editing
  - **Status:** Phase 2 complete (2025-11-27)
  - **Critical Bug Fixed (2025-11-27):** Resolved infinite loop caused by ModalDialog lifecycle issue
    - Root cause: Attempting to reopen same dialog instance after closing
    - Solution: Create NEW dialog instance when returning from ZoneEditor
    - Impact: Eliminated event loop recursion completely

- **LayoutSwitcher Tier System** (`ui/layoutSwitcher/tierConfig.js`) **NEW 2025-12-06**
  - Resolution-based tier selection for responsive layout picker sizing
  - 5 tiers: TINY, SMALL, MEDIUM, LARGE, XLARGE
  - Auto-selection based on logical pixel height (after scale factor)
  - User-configurable via Preferences → Appearance → "Layout Picker Size"
  - Debug tools: Ctrl+T (cycle tiers), Ctrl+D (debug rects), Ctrl+O (overlay)
  - **GSettings key:** `debug-force-tier` (0=auto, 1-5=forced tier)
  
- **LayoutSwitcher Grid Alignment** (`ui/layoutSwitcher/sectionFactory.js`) **FIXED 2025-12-06**
  - Fixed symmetric left/right margins for card rows
  - Fixed partial row alignment (rows with <5 cards now align with full rows)
  - Both Templates and Custom Layouts sections use consistent alignment
  - Spacers (invisible widgets) fill partial rows to maintain grid structure
  - Debug mode shows magenta spacers for troubleshooting
  - Scrollbar positioning improved (overlay scrollbars enabled)

---

## 🚧 Implemented but Evolving

These components exist and work, but may undergo architectural changes:

- **LayoutManager** (`layoutManager.js`)
  - Current: Manages layouts and zone cycling
  - **May change:** Likely to merge with TemplatePicker into unified component
  - **Rationale:** Reduce complexity, tighter coupling needed
  
- **TemplatePicker** (`ui/layoutPicker.js`)
  - Current: ModalDialog-based template picker
  - **May change:** Architecture redesign if merged with LayoutManager
  - Status: Working, but UI may be redesigned
  
- **ZoneEditor** (`ui/zoneEditor.js`)
  - Current: Full-screen edge-based layout editor
  - Status: Core implementation complete (Sprint 4 done)
  - **May change:** Polish, additional features (merge zones, undo/redo)
  - Architecture: Stable (edge-based system)
  
- **PanelIndicator** (`ui/panelIndicator.js`)
  - Current: Panel icon and menu
  - **May change:** Menu items, integration with settings UI

---

## 🚀 In Progress (Next Major Feature)

### Per-Space Layouts **IMPLEMENTATION IN PROGRESS 2025-12-07**

**Spec:** `memory/development/per-space-layouts-spec.md`  
**Status:** Phases 1-4 implemented, Phase 5 (polish) remaining

Different layouts for different workspaces and monitors. When disabled (default), all spaces share one global layout. When enabled, each workspace×monitor combination ("space") can have its own layout.

**Key Components:**
- **SpatialStateManager** (`spatialStateManager.js`) ✅ IMPLEMENTED
  - Core class for managing per-space layout state
  - SpaceKey format: `"connector:workspaceIndex"` (e.g., "DP-1:1", "eDP-1:0")
  - Methods: getMonitorConnector(), makeKey(), getCurrentSpaceKey(), getState(), setState()
  - Persists to GSettings `spatial-state-map` key
  - Migration from old `workspace-layout-map` format

- **GSettings Schema Updates** ✅ IMPLEMENTED
  - `spatial-state-map` - JSON string for per-space state
  - `last-selected-layout` - Fallback layout ID
  - `quick-layout-1` through `quick-layout-9` - Keybindings for Super+Ctrl+Alt+1-9
  - `workspace-layout-map` marked deprecated

- **LayoutManager Integration** ✅ IMPLEMENTED
  - `getSpatialStateManager()` / `setSpatialStateManager()` methods
  - `getCurrentLayout(spaceKey)` - Per-space layout queries
  - `getLayoutForSpace(spaceKey)` - Get layout for specific space
  - `setLayoutForSpace(spaceKey, layoutId)` - Set layout for specific space
  - `cycleZone(direction, spaceKey)` - Space-aware zone cycling

- **KeybindingManager Updates** ✅ IMPLEMENTED
  - `_getSpaceKeyFromWindow(window)` - Get space context from focused window
  - Zone cycling (Super+Alt+arrows) now space-aware
  - Quick layout shortcuts registered (Super+Ctrl+Alt+1-9)

- **Multi-Monitor Preview** ✅ IMPLEMENTED (Phase 3)
  - `LayoutPreviewBackground` now creates overlays for ALL monitors
  - Each monitor shows its own layout when per-space mode enabled
  - Selected monitor has bright zones, others are dimmed
  - `setLayoutManager()` method for per-space lookups

- **TopBar Workspace Thumbnails** ✅ IMPLEMENTED
  - Each workspace thumbnail shows the layout for that specific workspace×monitor space
  - Monitor selector dropdown tracks `_selectedMonitorIndex`
  - Single click: Select workspace for configuration
  - Double click (same workspace): Switch to that GNOME workspace

- **Workspace Switch Handler** ✅ FIXED (2025-12-07)
  - Fixed `workspace-switched` signal handler in extension.js
  - Bug: Was calling `to.index()` but `to` is already an integer, not a workspace object
  - Now correctly looks up per-space layout and auto-applies on workspace change
  - Shows "Workspace N: Layout Name" notification

- **Settings Sync** ✅ IMPLEMENTED (2025-12-07)
  - `use-per-workspace-layouts` is the ONE setting (default: false = global mode)
  - LayoutSwitcher checkbox "Apply one layout to all spaces" reads/writes inverted value
  - prefs.js switch and LayoutSwitcher checkbox stay in sync

**Implementation Status by Phase:**
- ✅ Phase 1: State Foundation (SpatialStateManager, schema, integration)
- ✅ Phase 2: Keybinding Context Awareness (space-aware zone cycling)
- ✅ Phase 3: Multi-Monitor Preview (all monitors show layouts)
- ✅ Phase 4: Quick Layout Shortcuts (Super+Ctrl+Alt+1-9)
- 🚧 Phase 5: Polish (testing, edge cases)

**Remaining Work (Phase 5):**
- Multi-monitor testing (layout preview per monitor)
- Monitor hotplug handling (retain state when monitors reconnect)
- Zone index validation (clamp to valid range)
- Handle deleted layouts in spatial state
- Error recovery and edge cases

---

## 📋 Planned (Not Yet Implemented)

Features/components in planning or design phase:

- **Settings/Preferences UI**
  - Visual preferences dialog
  - Per-application layout assignments
  - Advanced configuration options
  
- **Layout Persistence Improvements**
  - Better user layout management
  - Import/export layouts
  - Layout sharing/templates
  
- **Advanced ZoneEditor Features**
  - Merge zones operation
  - Undo/Redo with history
  - Keyboard-only editing mode
  - Zone margin controls

---

## 🗑️ Deleted (No Longer Exists)

Components that were removed during development:

- **LayoutSettings** - Old modal dialog implementation (~552 lines)
  - Deleted: 2024-11-25
  - Reason: Replaced by TemplatePicker using proper ModalDialog
  
- **LayoutEditor** - Old layout editor (~706 lines)
  - Deleted: 2024-11-25
  - Reason: Replaced by ZoneEditor (edge-based system)
  
- **MessageDialog** - Custom dialog implementation (~334 lines)
  - Deleted: 2024-11-25
  - Reason: Replaced by ConfirmDialog using ModalDialog.ModalDialog
  
- **ZoneCanvas** - Old zone editing canvas (~250 lines)
  - Deleted: 2024-11-25
  - Reason: Replaced by ZoneEditor's edge-based approach

---

## 📚 Documentation Status

### Current Technical References
- ✅ `edge-based-layout-spec.md` - Active technical specification
- ✅ `setup.md`, `vm-workflow.md` - Development workflows
- ✅ `hammerspoon-translation.md` - Conceptual mapping (stable)

### Historical/Completed Specs
- 🗄️ `fancyzones-implementation-spec.md` - Sprint planning log (Sprint 1-4 complete)
- 🗄️ `layout-editor-status.md` - Transition documentation (old→new editor)
- 🗄️ `layout-picker-redesign.md` - Completed redesign spec

### Outdated (Needs Rewrite)
- ⚠️ `architecture/overview.md` - Describes deleted components, needs full rewrite
- ⚠️ `architecture/component-design.md` - Describes deleted components, needs update
- ⚠️ `api-reference/layouts.md` - May not match current LayoutManager API

**Plan:** Rewrite architecture/API docs after LayoutManager/TemplatePicker architecture stabilizes.

---

## 🔄 Known Architecture Decisions

### 1. Layout vs Layout Terminology ✅ DECIDED (2025-11-26)

**Decision:** Use separate terminology for internal code vs user-facing UI.

**INTERNAL (Code):**
- **Layout** = Complete data object with:
  - `id`, `name` (metadata)
  - `zones` array (the layout geometry)
  - Future: `padding`, `shortcuts`, per-layout settings
- `LayoutManager` class manages layouts
- File: `extension/layoutManager.js`
- Persisted to: `~/.config/zoned/layouts.json`
- GSettings keys use "layout" naming (backward compatibility)

**USER-FACING (UI):**
- Users see "**Layout**" everywhere
- "Choose a layout", "Edit layout", "Layout Editor"
- `ZoneEditor` component (renamed from ZoneEditor)
- `TemplatePicker` shows layouts but calls them "layouts"

**Rationale:**
1. Separation of concerns: Layout = geometry, Layout = complete package
2. User simplicity: "Layout" matches industry terminology
3. Code precision: Explicit layout object management
4. Future-proof: Easy to add per-layout settings

**References:**
- `memory/development/v1-mvp-roadmap.md` - Full architecture spec
- `extension/layoutManager.js` - Detailed implementation notes
- `extension/ui/zoneEditor.js` - Component documentation

### 2. LayoutManager + TemplatePicker Merger

**Status:** NOT merging (conflicts with terminology decision)
- LayoutManager stays as backend service
- TemplatePicker remains separate UI component
- Clear separation between data and presentation

### 3. Settings UI Architecture

**Status:** Planned (Phase 6 in roadmap)
- Comprehensive LayoutManager dialog for power users
- LayoutSettingsDialog for quick metadata edits
- See v1-mvp-roadmap.md for detailed specs

---

## Version History

- **2025-11-26:** Initial STATUS.md created
  - ZoneEditor (Sprint 4) complete
  - Old dialog system deleted
  - LayoutManager/TemplatePicker architecture under review

---

## Quick Reference for Contributors

**Want to understand the current system?**
1. Read this STATUS.md first
2. See `edge-based-layout-spec.md` for layout system details
3. Check `development/setup.md` for dev environment
4. Architecture docs are outdated - use with caution

**Want to add features?**
1. Check "Implemented & Stable" section for what exists
2. Check "Planned" section to see if it's already designed
3. Discuss in issues before major architectural changes

**Found outdated documentation?**
1. Check this STATUS.md to see if component still exists
2. Update doc with status header (see template below)
3. PR welcome!

### Status Header Template
```markdown
**Status:** ✅ CURRENT | 🚧 IN PROGRESS | 📋 PLANNED | ⚠️ OUTDATED | 🗄️ HISTORICAL
**Last Verified:** YYYY-MM-DD
**Notes:** [Any relevant context]
```
