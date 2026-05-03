# History

## 2026-05-03: Simplified Layout Type Selection to 2 Edit Buttons

**Task:** Replace 3-button layout creation flow (2 type cards + separate edit button) with 2 combined edit buttons  
**Mode:** interactive  
**Verdict:** SUCCESS

**Summary:**
Refactored the new layout creation UI in LayoutSettingsDialog to eliminate the separate floating edit button. The two type selector cards (Grid/Canvas) were transformed into type edit buttons that immediately launch the appropriate zone editor on click.

**Implementation Details:**
- Removed `_createTypeCard()`, replaced with `_createTypeEditButton()`
- Each button shows type icon (⊞/⊡) prominently, edit icon (document-edit-symbolic) as secondary indicator
- Button text changed from "Grid"/"Canvas" to "Edit Grid Layout"/"Edit Canvas Layout"
- Click handler `_onTypeEditButtonClicked()` sets layout type and immediately calls `_openZoneEditor()`
- Removed separate floating edit button for new layouts (only shown for existing layouts)
- Updated `_buildDialogCard()` to skip preview container for new layouts since type buttons handle editor launch
- Removed obsolete `_onTypeSelected()` and `_updateTypeCardStyles()` methods
- Updated type definitions: `_gridTypeCard` and `_canvasTypeCard` now use `_hoverStyle` instead of `_selectedStyle`

**Key Design Changes:**
- Button size: 160×100px (slightly larger than old 140×90px cards to accommodate longer text)
- Icon hierarchy: type icon 28pt (vs old 24pt), title 10pt + edit icon 14px
- Hover effect: accent border on hover (reuses module-level `handleWidgetHoverEnter`/`Leave`)
- NEW LAYOUT: shows 2 type edit buttons → user clicks → editor opens immediately
- EXISTING LAYOUT: shows preview with floating edit button (unchanged)

**Validation:**
- Typecheck: ✓ passing
- Lint: ✓ passing (strict mode, zero warnings)
- Tests: ✓ 98 passing

**Outcome:** Streamlined UX — reduced 3 interactions (select type → see card selected → click edit) to 1 interaction (click type to edit). Respects Decision 1 (type immutability) and Decision 4 (LayoutSettingsDialog as gateway).

## 2026-05-02: Canvas Layout System UX/UI Design Review

**Task:** UX/UI design specification for canvas layout system  
**Mode:** background  
**Verdict:** PROCEED WITH IMPLEMENTATION

**Summary:**
Analyzed existing grid editor UI architecture and designed comprehensive canvas editor UX specification. Maintained Zoned's visual language while introducing canvas-specific interactions.

**Key Design Specifications:**
- Full-screen overlay pattern (reuse ThemeManager color palette)
- Floating control panel: top-left corner (20px from edges), fixed position (not draggable)
- Canvas zones rendering: semi-transparent fill, 3px border, large zone numbers
- Resize handles: 10×10px squares (corners + edge midpoints), cursor feedback
- Snap guides: visual-only dashed lines (2px offset), magnetic feedback
- Canvas thumbnails: semi-transparent zones (0.7 alpha) with visible background

**Key Design Decisions:**
- Manual pointer tracking for drag (not Clutter.DragAction)
- Contextual resize handles: selected zone only (reduces visual clutter)
- Fixed control panel: top-left position, not draggable (simplifies interaction)
- Keyboard shortcuts: Escape (cancel), Enter (save) - consistent with grid editor

**Accessibility & Theme:**
- Reuses existing ThemeManager for light/dark theme support
- Help text and toolbar follow established patterns
- Keyboard-accessible interactions throughout

**Open Questions:**
- Canvas thumbnail background color and transparency level
- Snap tolerance (5px vs percentage-based)
- Add zone default size (25%×25% vs 33%×33%)
- Canvas zone minimum size (5% of screen)

**Outcome:** Complete UX specification ready for implementation

## 2026-05-03: Grid/Canvas Type Selector UI Implementation

**Task:** Add UI to choose Grid vs Canvas when creating layouts  
**Mode:** background  
**Model:** claude-sonnet-4.5  
**Verdict:** SUCCESS

**Summary:**
Implemented two-card type selector UI in LayoutSettingsDialog. Eric identified that users had no visual way to select between Grid and Canvas layout modes during new layout creation. Added clear, differentiated selector cards with visual indicators.

**Implementation Details:**
- Two-card selector: Grid (⊞) and Canvas (⊡)
- Integrated into new layout creation flow in LayoutSettingsDialog
- Maintains visual consistency with Zoned design language
- Clear type differentiation through symbols and spacing

**Validation:**
- Typecheck: ✓ passing
- Lint: ✓ passing  
- Tests: ✓ 75 passing

**Outcome:** Type selector UI now visible and functional. Users can clearly choose layout mode when creating new layouts.

## Learnings

- `createZonePreview()` in cardFactory.ts is used by both card rendering and workspace thumbnails in topBar.ts — always check both callers when changing its signature
- The local `BuiltinTemplate` interface in `layoutSwitcher/types.ts` is separate from the one in `types/layout.d.ts` — both need updating when adding fields like `type`
- `workspaceLayout` in topBar.ts is typed as `unknown`, requiring `any` casts with eslint-disable comments (matches existing pattern for `zones` access)
- Layout type label follows the existing settings row pattern: label with `textPrimary` + value with `textMuted`, both at 11pt
- Type selector buttons in LayoutSettingsDialog should immediately launch the zone editor rather than requiring a separate edit button — combines type selection with immediate action for cleaner UX flow
- Module-level hover handlers (`handleWidgetHoverEnter`, `handleWidgetHoverLeave`) prevent closure leaks and follow established pattern — use these instead of inline arrow functions
- New layout creation flow skips the preview container entirely since type edit buttons immediately launch the zone editor — preview is only needed for existing layouts


### 2026-05-03: Canvas Editor Panel Consolidation UX Review

**Observations:**
- Canvas editor currently has **three separate panels**: help text (top-center), control panel (top-left), and toolbar (bottom-center) — too many competing focal points
- Grid editor has **two panels** (help + toolbar) as a cleaner pattern, but canvas editor needs additional controls (add/delete zones)
- Both editors use identical help text pattern: 800px width, top-center position, 14pt title + 11pt instructions in 3 lines
- Both editors use identical toolbar pattern: 250px width, bottom-center, Save (accent) + Cancel (neutral) buttons
- Canvas control panel (80px from top-left) contains: "+ New Zone", zone info label, and "✕ Delete" button — currently isolated from other actions

**Key Design Insight:**
- Screen real estate vs. discoverability tradeoff: Always-visible help text takes ~120px vertical space (10-15% of 1080p height)
- Progressive disclosure pattern needed: Help overlay should be collapsible/toggleable after users learn shortcuts
- Action grouping matters: "Add zone" + "Delete zone" are zone-level actions; "Save" + "Cancel" are modal-level actions
- Future zone dimensions display (task #3) needs to fit in zone info area without creating visual clutter

**Proposed Solution:**
- **Option A** (recommended): Two-panel layout with compact header bar (title + add + info + help toggle) + bottom toolbar (delete + save + cancel)
- **Option B** (alternative): Single unified header bar with all controls (breaks grid editor pattern)
- Instructions become collapsible overlay (hidden by default, toggled with "ⓘ" button)
- Delete button moves to bottom toolbar (grouped with Save/Cancel as "commitment actions")
- Zone dimensions integrate into zone info label: "Zone 1 of 5 • 640×480px (32×30%)"

**Awaiting Eric's Decision:**
- Which option to proceed with (A vs B)
- Instructions default visibility (hidden vs first-launch onboarding)
- Zone dimensions format and display timing
- Help button keyboard shortcut preference
- `St.ScrollView` with `hscrollbar_policy: St.PolicyType.AUTOMATIC` enables horizontal scrolling when content overflows — wrap horizontal `St.BoxLayout` containers in ScrollView to prevent visual overflow beyond dialog bounds
- Canvas zone actors in `canvasZoneEditor.ts` use `St.BoxLayout` containers (vertical) to stack multiple labels — zone number (24pt bold) + dimension label (11pt muted). Both `_createZoneActors()` and `_updateZoneActor()` must maintain consistency when updating dimensions during drag/resize operations
- Zone dimension display: percentage values (`Math.round(zone.w * 100)`) are more meaningful than pixel values across different monitor sizes — always display as "50% × 25%" format for width × height
- Dynamic zone label updates: access child labels via `actor.get_child()` and `container.get_children()` — check container type with `instanceof St.BoxLayout` before accessing children to avoid type errors
- Follow custom layouts section pattern for ScrollView configuration: `overlay_scrollbars: true`, appropriate expand flags, and add ScrollView as intermediate wrapper between section and content container
