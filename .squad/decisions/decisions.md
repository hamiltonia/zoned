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

### Canvas Layout Type Persistence Bug

**Author:** verbal  
**Status:** Implemented  
**Date:** 2026-05-04

Fixed data persistence bug where canvas layouts lost their `type: 'canvas'` field when saved or duplicated via LayoutSettingsDialog, reverting to grid layouts on next load.

**Root Cause:** Two methods in `layoutSettingsDialog.ts` constructed Layout objects without the required `type` field:
- `_buildFinalLayout()` — called on Save button
- `_onDuplicate()` — called on Duplicate button

The zone editor flow correctly preserved the type, so the bug only manifested when updating layout metadata without re-opening the zone editor.

**Fix:** Added `type: this._layout.type || 'grid'` to both methods.

**Files Changed:**
- `extension/ui/layoutSettingsDialog.ts`

**Team Relevance:** The `Layout` interface defines `type` as optional, which allowed TypeScript to miss this at compile time. Consider making `type` required in the interface to prevent similar issues in the future.
