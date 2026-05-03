# Canvas Thumbnail Rendering Alpha Values

**Decision:** Canvas layout thumbnails use 0.6 fill alpha (vs 0.9/0.85 for grid) to make zone overlaps visually apparent in the layout picker.

**Rationale:**
- Canvas layouts allow overlapping zones — opaque fills hide this overlap in previews
- At 0.6 alpha, overlapping regions appear darker, giving users immediate visual feedback about zone stacking
- Grid layouts keep existing opaque fill since they never overlap
- The 0.6 value balances visibility (zones are still clearly distinct) with overlap indication

**Impact:**
- `handleCanvasRepaint()` now branches on `layoutType` for fill alpha
- `createZonePreview()` signature expanded to accept `layoutType` parameter
- All callers (cardFactory template cards, custom cards, topBar workspace thumbnails) updated

**Status:** Implemented (2026-05-04)
