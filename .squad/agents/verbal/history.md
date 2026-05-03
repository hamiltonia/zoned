# History

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
