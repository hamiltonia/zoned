# History

## Core Context

### Grid/Canvas Decisions & Early Implementation
- **Decision 1:** Layout type immutability — type ('grid'/'canvas') cannot change after creation (2026-05-02)
- **Decision 4:** LayoutSettingsDialog as gateway for layout management (2026-05-02)
- **UX Design Review (2026-05-02):** Full-screen overlay pattern for canvas editor, floating control panel (top-left), fixed toolbar (bottom-center)
- **Type Selector Implementation (2026-05-03):** Added Grid/Canvas selector cards in LayoutSettingsDialog; refined to 2 edit buttons (2026-05-03)
- **UI Pattern Learnings:** Module-level hover handlers prevent closure leaks; layout type label follows settings row pattern; new layouts skip preview container
- **Canvas Styling Pattern:** Zone visual language — neutral gray background (rgba(68,68,68,0.6)), 2px accent border, 24pt zone numbers, inline dimension labels (% format preferred)
- **Grid+Canvas Alignment:** Share same zone visual language; multi-color mode removed in favor of unified neutral styling

## 2026-05-03: Fixed LayoutSettingsDialog Horizontal Centering

**Task:** Dialog not horizontally centered on screen when opened  
**Verdict:** SUCCESS

**Root Cause:**
The dialog card's container was added to `Main.uiGroup` AFTER `get_width()`/`get_height()` were called in the idle callback. Without stage allocation, these methods returned incorrect dimensions, causing the centering math `(monitor.width - actualWidth) / 2` to compute the wrong x position.

**Fix:**
Moved `Main.uiGroup.add_child(this._container)` before the idle callback. The dialog card already starts with `opacity: 0` (set in CSS), so it remains invisible until positioned. The idle callback now reads properly allocated dimensions from a staged actor, then reveals the dialog.

**Validation:**
- Typecheck: ✓ passing
- Lint (layoutSettingsDialog.ts): ✓ zero errors
- Tests: ✓ 96 passing

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
- Every method that constructs a Layout object literal must include the `type` field — `_buildFinalLayout()`, `_onDuplicate()`, `_buildLayoutFromEditorResult()` all need it. Missing `type` silently defaults to `'grid'` on reload via backward-compat migration.


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
- Grid and canvas editors should share the same zone visual language: neutral gray background (`rgba(68, 68, 68, 0.6)`), 2px accent border, 24pt zone numbers, and inline dimension labels — the canvas editor is the styling reference
- When adding labels that use edge-derived variables (`left`/`right`/`top`/`bottom`) inside the `forEach` callback in `_createRegions()`, reuse the already-declared and null-checked variables rather than re-declaring them
- Removing `USE_MAP_COLORS` multi-color mode in favor of unified neutral-gray styling — if diagnostic coloring is needed in the future, implement it as a separate debug overlay rather than baked into region actors
- Clutter resets `visible` to `true` when an actor is re-added via `add_child()` — always re-apply visibility state after remove/re-add z-order operations in `_refreshDisplay()`
- Instructions overlay close button uses `_hideInstructionsOverlay()` (explicit hide) vs `_toggleInstructionsOverlay()` (toggle) — separate methods for clarity
- Right-justify header bar items using `St.Widget({ x_expand: true })` spacer before the target element — standard Clutter/St pattern for flexible layouts
- Instructions panel Y offset: `82 * scaleFactor` provides ~12px visual gap below header bar at `20 * scaleFactor` — enough separation to read as distinct elements

### 2026-05-04: Canvas Editor Instructions Panel UX Fixes (4 bugs)

**Task:** Fix visual separation, add close button, right-justify help toggle, fix state management bug
**Verdict:** SUCCESS

**Fixes:**
1. **Visual separation** — increased instructions overlay Y from `70 * scaleFactor` to `82 * scaleFactor` for ~12px gap below header bar
2. **Close button** — added right-aligned ✕ button to instructions panel via `_hideInstructionsOverlay()`, with hover effects
3. **Right-justified help toggle** — replaced sep3 separator with `St.Widget({ x_expand: true })` spacer to push ⓘ button to far right of header bar
4. **State management** — `_refreshDisplay()` remove/re-add cycle was resetting `visible` to `true`; added `this._instructionsOverlay.visible = this._instructionsVisible` after re-add

**Validation:**
- Typecheck: ✓ passing
- Lint (strict): ✓ zero warnings
- Build: ✓ passing
- Tests: ✓ 96 passing

### 2026-05-04: Canvas Editor Panel Consolidation (Decision 9)

**Task:** Consolidate three panels (help text, control, toolbar) into two panels with collapsible instructions overlay  
**Verdict:** SUCCESS

**Summary:**
Implemented Decision 9 — replaced the three-panel canvas editor UI (help text at top-center, control panel at top-left, toolbar at bottom) with a two-panel layout plus collapsible instructions overlay.

**New Structure:**
- **Header Bar** (`_createHeaderBar()`): Top-center, compact, contains title + Add Zone + Delete Zone + zone info label + ⓘ help toggle
- **Bottom Toolbar** (`_createToolbar()`): Save Layout + Cancel buttons, 80px from bottom
- **Instructions Overlay** (`_createInstructionsOverlay()`): Collapsible, positioned below header, visibility persisted via GSettings

**Implementation Details:**
- Removed `_createControlPanel()`, `_updateControlPanel()`, `_createHelpText()` — replaced with `_createHeaderBar()`, `_updateHeaderBar()`, `_createInstructionsOverlay()`, `_toggleInstructionsOverlay()`
- New GSettings key: `canvas-editor-show-instructions` (boolean, default `true`) — persists collapsed state
- F1 keyboard shortcut toggles instructions overlay
- Delete button moved from separate control panel to header bar alongside Add Zone
- Instructions include F1 shortcut hint in last line
- Removed `_controlPanel` and `_helpTextBox` private fields, added `_headerBar`, `_instructionsOverlay`, `_instructionsVisible`

**Validation:**
- Typecheck: ✓ passing
- Lint (strict): ✓ zero warnings
- Schema compilation: ✓ passing
- Build: ✓ passing
- Tests: ✓ 96 passing

**Key Learnings:**
- Progressive disclosure via GSettings persistence is a clean pattern for editor UI state — read boolean in constructor, write on toggle
- Header bar with separators (`St.Widget` with 1px width) creates visual grouping without extra container nesting
- Instructions overlay positioned at `70 * scaleFactor` Y offset sits cleanly below the header bar at `20 * scaleFactor`

## 2026-05-03: Fixed 4 Instructions Panel UX Bugs

**Task:** Fix visual separation, close button, right-justified help toggle, reopen-on-click state bug  
**Mode:** background  
**Verdict:** SUCCESS

**Bugs Fixed:**

1. **Visual Separation** — Increased Y offset from 70 to 82 (scaled) to add 12px gap between header bar and instructions panel
2. **Close Button** — Added ✕ button directly on instructions panel calling `_hideInstructionsOverlay()`
3. **Right-Justified Help Toggle** — Moved ⓘ button to right end of header bar using `x_expand: true` spacer
4. **Reopen-on-Click Bug** — Fixed state management: Clutter resets `visible` to `true` when actor is reparented via `add_child()`. Solution: re-apply `_instructionsVisible` state after z-order re-raise in `_refreshDisplay()` using `Meta.later(Meta.LaterType.BEFORE_REDRAW, ...)`

**Root Cause (Bug #4):** When removing a Clutter actor from one parent and adding it to another, the lifecycle events reset the `visible` property. This affected the instructions overlay z-order re-raise pattern — the overlay would reappear even when intended to stay hidden. Fixed by scheduling visibility restoration after the layout cycle completes.

**Files Modified:**
- `extension/ui/editors/canvasZoneEditor.ts`
- `extension/stylesheet.css`

**Validations:**
- ESLint (strict): ✓ zero warnings
- Typecheck: ✓ passing
- Build: ✓ passing
- GSettings schema: ✓ valid
- All 4 bugs: ✓ visually verified closed

**Key Pattern:** Any `remove_child()`→`add_child()` z-order pattern in Clutter must explicitly re-apply the intended `visible` state afterward using `Meta.later()`.

## 2026-05-04: Fixed Canvas Layout Type Lost on Save/Duplicate

**Task:** Canvas layouts opened in grid editor when editing existing canvas layout  
**Verdict:** SUCCESS

**Root Cause:**
Two methods in `layoutSettingsDialog.ts` constructed layout objects without the `type` field:
- `_buildFinalLayout()` (line ~2472) — used by the Save button in the settings dialog
- `_onDuplicate()` (line ~1937) — used by the Duplicate button

When a canvas layout was saved via the settings dialog, the persisted JSON lacked `type: 'canvas'`. On next load, `_loadUserLayouts()` migrated it back to `type: 'grid'` (backward compat default). The edit button's dispatch logic (`_openZoneEditor()`) then correctly read `type: 'grid'` and opened the grid editor.

**Fix:**
Added `type: this._layout.type || 'grid'` to both `_buildFinalLayout()` and `_onDuplicate()` layout object literals.

**Note:** The dispatch logic in `_openZoneEditor()` and `_buildLayoutFromEditorResult()` were already correct — they properly checked `state.layoutData.type`. The bug was purely a data persistence issue in two other code paths.

**Validation:**
- Typecheck: ✓ passing
- Lint (strict): ✓ zero warnings
- Build: ✓ passing
- Tests: ✓ 96 passing

**Team Insight:** The `Layout` interface defines `type` as optional (`type?: LayoutType`), which allowed TypeScript to miss this at compile time. Consider making `type` required in the interface to prevent future similar issues.