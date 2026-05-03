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

## Canvas Layout System

### Decision 1: Layout Type Immutability

**Decision:** Layout type (`'grid'` or `'canvas'`) cannot be changed after creation. Conversion between grid and canvas is not supported.

**Rationale:**
- Grid and canvas have incompatible data structures (edge-based vs zone-based)
- "Conversion" would mean "delete all zones and start over" — not a true conversion
- Simpler codebase: no conversion logic or migration pathways needed
- User can always duplicate a layout and recreate in the desired type

**Impact:**
- Type field is immutable after layout creation
- LayoutSettingsDialog should not expose a type-change option
- Type selection UI is only visible during layout creation, not editing
- Type validation must prevent modification attempts

**Status:** Decision (2026-05-02)

---

### Decision 2: Two Editor Classes with Shared Base

**Decision:** Implement `BaseZoneEditor` (abstract class) with `GridZoneEditor` and `CanvasZoneEditor` as subclasses.

**Rationale:**
- Current ZoneEditor is 2700+ lines with edge-based data structure and split/merge interaction model
- Canvas editor requires zone-based data structure with drag/resize interaction model
- Interaction models are fundamentally incompatible (edge constraints vs free positioning)
- Shared base class extracts ~30% of code: overlay setup, modal lifecycle, theme integration, keyboard handlers, cleanup patterns
- Reduces maintenance burden vs two completely separate classes

**Alternative Considered:**
- Single class with `if (type === 'canvas')` branching logic
- Rejected: Would create 4000+ line god class with tangled interaction logic, exponentially harder testing

**File Structure:**
```
extension/ui/editors/
  baseZoneEditor.ts       [abstract base]
  gridZoneEditor.ts       [refactored from existing zoneEditor.ts]
  canvasZoneEditor.ts     [new canvas implementation]
```

**Shared Components:**
- Overlay setup and full-screen modal pattern
- ThemeManager color/style integration
- Modal lifecycle: `show()`, `hide()`, cleanup, signal disconnection
- Keyboard handlers: Escape (cancel), Enter (save)
- Resource cleanup via SignalTracker and ResourceTracker

**Non-Shared Components:**
- Zone rendering (grid edges vs free-floating zones)
- Interaction handlers (edge-drag vs zone-drag)
- Data structure (edge-based vs zone-based)

**Impact:**
- Phase 2a (editor refactoring) becomes a prerequisite: extract BaseZoneEditor first, ensure grid editor still works
- Phase 2b: implement CanvasZoneEditor on stable refactored base
- Reduces risk by allowing grid editor testing before canvas implementation

**Status:** Decision (2026-05-02)

---

### Decision 3: Explicit Validation Rules for Layout Types

**Decision:** Make grid layout constraints explicit and type-specific. Grid requires no overlaps and 100% coverage. Canvas allows overlaps and gaps.

**Rationale:**
- Current grid validation is implicit (enforced by edge-based editor structure, not validator)
- Risk: User can manually edit `~/.config/zoned/layouts.json` and create invalid grid layouts (overlaps, gaps)
- Canvas needs fundamentally different validation (allow overlaps/gaps, prevent off-screen bounds)
- Explicit validation makes design assumptions testable and maintainable

**Implementation:**
```typescript
_validateLayout(layout: Layout): boolean {
    // ... existing checks (id, name, zones array) ...
    
    if (layout.type === 'grid') {
        return this._validateGridConstraints(layout.zones);
    } else if (layout.type === 'canvas') {
        return this._validateCanvasConstraints(layout.zones);
    }
}

_validateGridConstraints(zones: Zone[]): boolean {
    // Enforce: no overlaps, 100% coverage of screen
    // Log warning (not error) for backward compat with pre-existing layouts
}

_validateCanvasConstraints(zones: Zone[]): boolean {
    // Enforce: zones within bounds (0.0 ≤ x+w ≤ 1.0, 0.0 ≤ y+h ≤ 1.0)
    // Enforce: minimum zone size (e.g., 5% of screen)
    // Allow: overlaps, gaps
}
```

**Impact:**
- Phase 1 must include validation branching, not just `type` field addition
- Existing implicit grid behavior becomes explicit and testable
- Canvas validation enables intentional overlaps/gaps while preventing invalid off-screen zones
- Backward compatibility: warn (not block) for legacy layouts that violate grid constraints

**Status:** Decision (2026-05-02)

---

### Decision 4: Type Selection in LayoutSettingsDialog

**Decision:** Type selector UI (Grid vs Canvas radio buttons) appears only during layout creation (when `layout=null`), not during editing. Type selector is hidden for existing layouts.

**Rationale:**
- LayoutSettingsDialog is the architectural gateway for layout creation (not LayoutSwitcher)
- Type is immutable after creation (see Decision 1)
- Limiting type selection to creation-time prevents accidental confusion or attempts to "convert" layouts
- Matches GNOME design patterns: critical properties set at object creation, immutable thereafter

**Implementation:**
- LayoutSettingsDialog presents radio button group: `⊙ Grid Layout` vs `⊙ Canvas Layout`
- Only visible when `layout === null` (creation mode)
- Hidden when `layout` exists (edit mode)
- LayoutSettingsDialog dispatches to correct editor class based on selected type:
  ```typescript
  _launchZoneEditor(layout) {
      const EditorClass = (layout.type === 'canvas') 
          ? CanvasZoneEditor 
          : GridZoneEditor;
      const editor = new EditorClass(layout, ...);
      editor.show();
  }
  ```

**Impact:**
- Phase 3 entry point correction: type selector in LayoutSettingsDialog, not LayoutSwitcher
- Undo button in LayoutSwitcher: creates new layout with type selector flow
- Edit button in LayoutSwitcher: launches editor for existing layout (type pre-determined)

**Status:** Decision (2026-05-02)

---

### Decision 5: Manual Pointer Tracking for Canvas Drag Operations

**Decision:** Implement canvas zone dragging and resizing via manual pointer tracking (not Clutter.DragAction).

**Rationale:**
- Clutter.DragAction is designed for simple actor dragging, lacks fine control
- Canvas needs: snap-to-grid, magnetic snapping guides, constrained dragging, multi-handle resize
- Current grid editor already uses manual pointer tracking for edge dragging — proven pattern in codebase
- Manual approach gives pixel-perfect control and integrates seamlessly with magnetic snapping visualization

**Implementation Pattern:**
```typescript
// From existing zoneEditor.ts pattern
private _draggingZone: {zoneIndex: number; offsetX: number; offsetY: number} | null;

// Button press: track drag start
zoneActor.reactive = true;
this._signalTracker.connect(zoneActor, 'button-press-event', (actor, event) => {
    const [x, y] = event.get_coords();
    this._draggingZone = {zoneIndex: index, offsetX: x - actor.x, offsetY: y - actor.y};
    return Clutter.EVENT_STOP;
});

// Motion: global handler on overlay
this._signalTracker.connect(this._overlay, 'motion-event', (actor, event) => {
    if (this._draggingZone) {
        const [x, y] = event.get_coords();
        const newX = x - this._draggingZone.offsetX;
        const newY = y - this._draggingZone.offsetY;
        this._updateZonePosition(this._draggingZone.zoneIndex, newX, newY);
        return Clutter.EVENT_STOP;
    }
});

// Release: clear drag state
this._signalTracker.connect(this._overlay, 'button-release-event', () => {
    this._draggingZone = null;
    return Clutter.EVENT_STOP;
});
```

**Impact:**
- Phase 2c: snapping system integrates directly into `_updateZonePosition()` 
- Resize handles use identical pattern for constrained dragging
- Performance: imperceptible overhead (identical to existing edge drag)

**Status:** Decision (2026-05-02)

---

### Decision 6: Contextual Resize Handles (Selected Zone Only)

**Decision:** Resize handles are only rendered and interactive on the currently selected zone, not on all zones simultaneously.

**Rationale:**
- Canvas layouts can have many overlapping zones (5-20+ typical)
- Rendering handles on all zones creates visual clutter
- Selected zone only: clearer intent, easier interaction, reduced visual noise
- Matches common design patterns (similar to bounding box in graphics editors)

**Impact:**
- Canvas editor maintains `_selectedZoneIndex` state
- Click zone: update selection (re-render handles)
- Resize handles only visible on selected zone (8 handles: 4 corners + 4 edge midpoints)
- Selected zone also gets visual highlight (thicker border or different color)

**Status:** Decision (2026-05-02)

---

### Decision 7: Fixed Control Panel Position (Top-Left, Not Draggable)

**Decision:** Canvas editor control panel (New Zone, Delete Zone buttons) is positioned fixed at top-left corner (20px from edges), not floating/draggable.

**Rationale:**
- Simplifies UI complexity (no drag state for control panel)
- Consistent with full-screen overlay modal pattern
- Reduces accidental obstruction of canvas editing area
- Predictable UX: controls always in same location

**Position:** 20px from top and left edges (after UI scaling)  
**Contents:** New Zone button, Selected Zone indicator, Delete Zone button  
**Size:** Auto-width based on content (~60px height)

**Impact:**
- Simplified event handling (no panel drag tracking)
- Canvas editing area remains predictable
- Help text at top-center and control panel at top-left don't conflict

**Status:** Decision (2026-05-02)

---

### Decision 8: Type Selection Immediately Launches Zone Editor

**Decision:** New layout creation flow uses combined type-edit buttons that immediately launch the appropriate zone editor, eliminating a separate "Edit zones" button.

**Rationale:**
- Reduces cognitive load: one decision → one action
- Eliminates redundant UI: every new layout needs zone editing, so merge type selection and editor launch
- Faster flow: "I want to create a [grid/canvas] layout" → editor opens immediately
- Visual clarity: edit icon makes the immediate action explicit
- Larger buttons (160×100px) provide better touch target

**Implementation:**
- LayoutSettingsDialog: replaced `_createTypeCard()` with `_createTypeEditButton()`
- Each button shows layout type icon + pencil indicator
- Click button sets `layout.type` and opens appropriate editor immediately
- Existing layout edit flow unchanged (preview + separate edit button)

**Impact:**
- NEW LAYOUT: User sees 2 buttons → clicks Grid or Canvas → zone editor opens with type pre-set
- EXISTING LAYOUT: User sees layout preview with floating edit button (unchanged)
- Simplifies the most common flow without compromising UX

**Status:** Implemented (2026-05-03)

---

### Decision 9: Canvas Editor Panel Consolidation with Progressive Disclosure

**Decision:** Canvas editor consolidates three separate panels (help text, control, toolbar) into two panels with collapsible instructions overlay.

**Recommended Layout (Option A):**

**Header Bar (top-center, persistent)**
- Title, Add Zone button, Zone info label, Help toggle button
- Height: ~50-60px (vs current 120px)
- Recovers 4-6% vertical screen space for editing

**Bottom Toolbar (top-center, persistent)**
- Delete Zone, Save Layout, Cancel buttons
- Position: 80px from bottom edge
- Consistent with Grid Editor pattern

**Instructions Overlay (collapsible)**
- Hidden by default (progressive disclosure)
- Toggle visible with "ⓘ" button in header
- Auto-dismiss after 10 seconds of inactivity (optional)
- Semi-transparent overlay panel (top-center, below header)

**Rationale:**
- Clearer visual hierarchy: header (context) vs toolbar (finality)
- Progressive disclosure: experienced users reclaim vertical space
- Logical action grouping: zone management (header) vs modal actions (toolbar)
- Consistent with Grid Editor two-panel pattern
- Leaves room for zone dimensions display in zone info label

**Implementation Notes (TBD):**
- Remove `_createHelpText()` always-on rendering
- Add `_createHeaderBar()` with help toggle
- Modify `_createToolbar()` to include Delete button
- Add `_toggleInstructionsOverlay()` method

**Resolved Questions (2026-05-03, Eric's input):**
1. Instructions default visibility → Show on first launch, persist collapsed state via GSettings
2. Auto-dismiss timer → None (skip it — let users toggle explicitly)
3. Zone dimensions format → Already settled by Decision 10 (pixels first, percentages in parens)
4. Delete button placement → Header bar with Add Zone (zone lifecycle actions together) + Delete key shortcut
5. Option preference → Option A (two-panel)
6. Instructions content → 3-4 lines sufficient
7. Accessibility → F1 keyboard shortcut for help toggle

**Status:** Approved — ready for implementation (2026-05-03)

---

### Decision 10: Zone Dimensions Display in Canvas Editor

**Decision:** Canvas editor displays zone dimensions (pixel and percentage) in the zone info label when a zone is selected.

**Format:**
- Before selection: "Zone 1 of 5"
- After selection: "Zone 1 of 5 • 640×480px (32×30%)"
- Pixel dimensions first (what users see)
- Percentage dimensions in parentheses (normalized coordinates)
- Subtle text color to avoid clutter

**Rationale:**
- Enables users to verify exact zone positioning while editing
- Supports both coordinate systems: screen pixels and normalized percentages
- Integrates cleanly into header bar zone info label
- Real-time feedback during drag/resize operations (future enhancement)

**Implementation:**
- Canvas editor maintains `_selectedZoneIndex` state
- Zone info label auto-expands to accommodate dimensions
- Header bar width is fluid, not fixed (adapts to label width)

**Impact:**
- Complements zone dimensions feedback during drag/resize (future tooltip feature)
- Supports both grid-based and free-form layout design workflows

**Status:** Implemented (2026-05-03)

---

### Decision 11: Template Overflow Fix in Layout Settings

**Decision:** Layout template section uses ScrollView with fixed height to prevent overflow when displaying many built-in templates.

**Implementation:**
- sectionFactory.ts: Wrap template container in ScrollView
- Fixed height: max-height: 400px (configurable per theme)
- Native scrollbar with kinetic scrolling
- Accessible (standard GNOME scrolling behavior)

**Rationale:**
- Prevents layout dialog content clipping with 20+ templates
- Maintains responsive dialog appearance
- Enables future template management features without UI degradation
- Standard GNOME pattern (ScrollView for overflow containers)

**Status:** Implemented (2026-05-03)

---

### Decision 12: Canvas Editor Snapping Improvements

**Decision:** Increase magnetic snap threshold from 2% to 5%, implement shift-key override, and add resize snapping.

**Rationale:**
- 2% threshold (~38px on 1920px monitor) feels too weak — users must be extremely precise
- 5% threshold (~96px) provides stronger magnetic feel while remaining intentional
- Shift key override enables precision placement when needed
- Resize operations lacked snapping — only drag had it, creating inconsistent UX

**Implementation:**
1. `SNAP_THRESHOLD` in `canvasSnapping.ts`: `0.02` → `0.05`
2. Shift detection during pointer motion: check `Clutter.ModifierType.SHIFT_MASK` in event state
3. Clear snap guides when shift held; resume on release
4. New `_applyResizeSnap()` method: decomposed into `_snapLeadingEdge()` / `_snapTrailingEdge()` for complexity
5. Instructions updated: "Hold Shift to disable snapping • Esc: Deselect / Cancel • Enter: Save • F1: Help"

**Impact:**
- Snapping feel significantly improved — professional-grade canvas editor
- Users can escape magnetic snapping for manual placement (shift modifier)
- Resize and drag operations behave consistently
- Instructions communicate new shift behavior

**Status:** Implemented (2026-05-03)

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
