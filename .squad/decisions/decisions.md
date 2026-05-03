# Team Decisions

## 2026-05-04

### Canvas Editor Instructions Panel UX Fixes

**Author:** Verbal  
**Status:** Complete

Fixed four UX issues with the canvas editor instructions panel:

1. **Visual separation** — 12px gap between header bar and instructions panel (Y offset 70→82 scaled)
2. **Close button** — ✕ button on instructions panel itself (calls `_hideInstructionsOverlay()`)
3. **Right-justified help toggle** — ⓘ button pushed to right end of header bar via `x_expand` spacer
4. **State management bug** — Clutter's `add_child()` resets `visible` to `true`; fixed by re-applying `_instructionsVisible` after z-order re-raise in `_refreshDisplay()`

**Key Pattern:** Clutter resets actor visibility when re-added to a parent. Any `remove_child()`→`add_child()` z-order pattern must re-apply `visible` state afterward. This affects any future UI that uses the same re-raise technique.

**Files Changed:**
- `extension/ui/editors/canvasZoneEditor.ts`
- `extension/stylesheet.css`
