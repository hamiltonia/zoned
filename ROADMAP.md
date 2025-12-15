# Zoned Development Roadmap

**Last Updated:** 2025-12-15  
**Current Status:** Pre-release (active development)  
**Current Branch:** `initial_dev`

---

## Remaining Work (v1.0)

The following items need to be completed before v1.0 release:

### Core Features
- [x] **Delete custom layout** - Implement deletion for user-created layouts ✅
- [x] **Current layout background** - LayoutSwitcher card backgrounds show accent when selected/hovered ✅
- [x] **Modal handling fix** - Fixed popModal() to pass grab object correctly ✅
- [x] **Preview background z-order** - LayoutPreviewBackground stays visible behind both LayoutSwitcher and LayoutSettingsDialog ✅
- [x] **Per-space layouts** - Different layouts for different workspaces/monitors (see spec below)
- [x] **Layout keyboard shortcuts** - Add keyboard shortcuts to activate specific layouts (in layout settings)
- [x] **Duplicate custom layouts** - Allow duplicating custom layouts (not just templates)

### Per-Space Layouts Feature (Major)
See: `memory/development/per-space-layouts-spec.md`

**Phase 1: State Foundation + UI Preview** ✅ (2025-12-07)
- [x] Create `SpatialStateManager` class
- [x] Add GSettings keys: `spatial-state-map`, `last-selected-layout`
- [x] Workspace thumbnails show per-space layout preview
- [x] Workspace click → select for config; double-click → switch workspace
- [x] Auto-switch layout on workspace change (via `workspace-switched` signal)
- [x] Settings sync between LayoutSwitcher checkbox and prefs.js switch
- [x] Multi-monitor support (needs testing)
- [x] Revisit notifications (make them optional where needed, provide options for look & feel) ✅
- [x] Style updates, ensure consistency, polish, etc.

**Phase 2: Keybinding Context Awareness**
- [x] Zone cycling respects current space context
- [x] Track zone index per-space (not just per-layout)

**Phase 3: Quick Layout Shortcuts**
- [x] `Super+Ctrl+Alt+1-9` activates layouts by position
- [x] Apply to focused window's space

### UX/UI
- [x] **Card top bar design** - Grey header with name (left) and circular edit button (right), zone preview below ✅
- [x] **Edit button click isolation** - Edit icon no longer triggers layout activation ✅
- [x] **LayoutSettingsDialog FancyZones redesign** - Template detection, destructive delete button, spinner/dropdown consistency, descriptive shortcut label ✅

### Code Quality & Release Preparation

See: [`memory/development/mvp-release-checklist.md`](memory/development/mvp-release-checklist.md)

This comprehensive checklist covers:
- **Phases 1-6**: Static analysis, lifecycle audit, GNOME compliance, architecture review, runtime validation, code quality
- **Phase 7**: Release infrastructure (unit testing decision, GitHub Actions, issue templates)

**Code Quality Tasks:**
- [x] **ESLint validation** - Added to Makefile, runs via `make lint` ✅
- [ ] **Review logging** - Clean up log statements for tidiness, gate debug logs appropriately
- [ ] **Review try/catch statements** - Remove unnecessary ones, ensure proper error handling
- [ ] **Review Schema naming** - ensure the schema for settings has consistent and appropriate naming

### Documentation & Testing
- [ ] **Documentation audit** - Review all repo documentation for cruft before pushing to main (public repo)
- [ ] **Memory bank cleanup** - Remove outdated/internal development notes not needed for public release
- [ ] **README review** - Ensure README accurately reflects v1.0 features and installation

---

## Architecture: Layout Object Model

**Internal (Code):**
- **Layout** = Complete data object with `id`, `name`, `zones` array, and future `metadata`
- **LayoutManager** class manages layouts (loading, saving, state)
- Persisted to: `~/.config/zoned/layouts.json`

**User-Facing (UI):**
- Users see "**Layout**" everywhere
- **ZoneEditor** = edits zone geometry
- **LayoutSwitcher** = displays/selects layouts

### Component Mapping

| Component | What it manages | User sees |
|-----------|----------------|-----------|
| LayoutManager | Layouts (complete objects) | N/A (internal) |
| ZoneEditor | zones array (geometry) | "Layout Editor" |
| LayoutSwitcher | Layouts (displays as cards) | "Choose a layout" |
| LayoutSettingsDialog | Layout metadata (name, etc.) | "Layout Settings" |

---

## Completed Components

### ✅ Stable & Complete

- **WindowManager** - Window positioning and zone assignment, multi-monitor support
- **KeybindingManager** - Core keyboard shortcuts, registration/cleanup
- **ZoneOverlay** - Visual zone preview overlays
- **NotificationManager** - Top-bar notifications with branded icons
- **TemplateManager** - Built-in layout templates (halves, thirds, quarters, focus)
- **LayoutConverter** - Zone ↔ Edge layout conversion utilities
- **ConfirmDialog** - ModalDialog wrapper for confirmations
- **ConflictDetector** - Keybinding conflict detection with auto-fix
- **PanelIndicator** - Top bar integration with menu and conflict status
- **LayoutSwitcher** - Grid layout with Cairo-rendered previews, keyboard shortcuts
- **ZoneEditor** - Full-screen edge-based layout editor
- **LayoutSettingsDialog** - Gateway dialog for creating/editing layouts

### ✅ Completed Phases

| Phase | Description | Date |
|-------|-------------|------|
| 1 | Terminology Cleanup - Renamed GridEditor → ZoneEditor | 2025-11-26 |
| 2 | LayoutSettingsDialog - Create/edit gateway with validation | 2025-11-27 |
| 2A | Menu Structure & Keyboard Grab Fix | 2025-11-26 |

---

## Post-v1 Roadmap

### v1.1: Enhanced UX & Multi-Workspace Support
- **Child dialog behavior** - LayoutSettingsDialog as inline panel within LayoutSwitcher (modal-on-modal alternative)
- Per-workspace layout state
- Workspace switcher integration

### v1.2: Multi-Monitor Support
- Per-monitor layout assignments
- Monitor selector in dialogs

### v1.3: Advanced Features
- Per-layout keyboard shortcuts
- Layout padding controls
- Window rules/app preferences
- Import/export layouts
- Localization support

---

## Development Workflow

```bash
# Install extension
make install

# Compile GSettings schema
make compile-schema

# View logs (while developing)
make logs

# Reload GNOME Shell (X11 only)
make reload
```

### Code Style
- 4 spaces for indentation
- JSDoc comments for public methods
- ES6+ features (arrow functions, const/let)
- Keep files under 500 lines, one class per file

---

## Resources

- **Architecture Decisions:** `memory/STATUS.md`
- **Manual Tests:** `tests/LAYOUTSWITCHER_MANUAL_TESTS.md`
- **API Reference:** `memory/api-reference/`
- **GJS Guide:** https://gjs.guide/
- **GNOME Extensions Tutorial:** https://gjs.guide/extensions/
