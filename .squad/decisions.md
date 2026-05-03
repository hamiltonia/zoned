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

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
