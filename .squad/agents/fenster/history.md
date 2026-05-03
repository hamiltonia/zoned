# History

## 2026-05-02: Canvas Layout System GNOME Shell Feasibility Review

**Task:** Technical feasibility assessment for canvas layout system in GNOME Shell  
**Mode:** background  
**Verdict:** FEASIBLE WITH CAVEATS (90% confidence)

**Summary:**
Assessed canvas layout system feasibility in GNOME Shell with Clutter/GJS stack. Verified that existing architecture is canvas-agnostic and current codebase poses no architectural blockers.

**Architecture Verification:**
- ✅ WindowManager: type-agnostic, accepts any zone geometry
- ✅ LayoutManager: validation checks only zone ranges, no grid-specific logic
- ✅ Extension lifecycle: standard enable/disable, no blockers
- ✅ ZoneEditor: self-contained, can coexist with canvas editor

**Technical Analysis:**
- Draggable zones: Manual pointer tracking (proven pattern in edge drag)
- Resize handles: 8 handles per zone (corners + edge midpoints) via St.Button
- Snapping system: Magnetic guides (visual-only), 5px snap tolerance, negligible performance impact
- Multi-monitor: Canvas zones remain normalized 0-1 per monitor (type-agnostic)

**Key Decisions:**
- Manual pointer tracking for drag (not Clutter.DragAction)
- Snapping system design: magnetic guides with 5px tolerance

**Known Caveats:**
1. Z-order cycling: Array-order only (no reordering UI yet)
2. Resize handle ergonomics: Test on high-DPI multi-monitor hardware
3. Undo/redo: Not currently supported (out of scope)
4. GSettings schema: No new keys needed (type in JSON only)

**Risk Assessment:**
- Low: Data model (type field addition)
- Medium: Validation logic
- Medium-High: Editor refactoring (2700+ line ZoneEditor)

**Recommendations:**
- Phase 2a (editor refactor) as separate PR with grid editor testing
- Then Phase 2b/2c (canvas implementation) on stable base
- Test resize handles on real hardware (multi-monitor, high DPI)

**Outcome:** Feasibility confirmed at 90% confidence; implementation plan ready

