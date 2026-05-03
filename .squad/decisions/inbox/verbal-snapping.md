# Decision: Canvas Editor Snapping Improvements

**Author:** Verbal (UI/UX Developer)
**Date:** 2026-05-04

## Changes

### 1. Stronger Snapping Threshold
- `SNAP_THRESHOLD` increased from `0.02` (2%) to `0.05` (5% of screen)
- On a 1920px monitor, this means snap distance goes from ~38px to ~96px — much more magnetic
- Applies to both drag and resize operations

### 2. Shift Key Disables Snapping
- Holding Shift during drag or resize bypasses snapping entirely
- Uses `Clutter.ModifierType.SHIFT_MASK` from Clutter event state
- Snap guides are cleared when Shift is held
- Snapping resumes immediately when Shift is released

### 3. Resize Snapping
- Added `_applyResizeSnap()` — previously only drag operations had snapping
- Only the edges being manipulated by the resize handle snap to points
- Decomposed into `_snapLeadingEdge()` / `_snapTrailingEdge()` helpers for ESLint complexity compliance

### 4. Instructions Updated
- Third line now reads: "Hold Shift to disable snapping • Esc: Deselect / Cancel • Enter: Save • F1: Help"

## Impact
- `canvasSnapping.ts` utility is unchanged — all logic changes are in `canvasZoneEditor.ts`
- Test threshold updated from 0.02 to 0.05 in `canvasSnapping.test.ts`
- All 122 tests passing

## Status
Implemented
