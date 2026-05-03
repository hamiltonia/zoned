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

## Learnings

### 2025-07-15: `/` Key Zone Ordering — Help Text Ambiguity Fix

**Task:** Fix reported `/` key not working for zone ordering in canvas editor.

**Finding:** The `/` key was never a keybinding. The help text `[ / ]: Adjust order` used `/` as a separator between the `[` and `]` keys, but read ambiguously as "the slash key." The `[` and `]` keys were already fully implemented via `_adjustZOrder()` (lines 722-726), swapping zones in the array and refreshing the display.

**Fix:** Changed help text from `[ / ]:` to `[, ]:` — unambiguous notation that these are two separate bracket keys.

**Key insight:** When documenting keybindings that use bracket characters, avoid `/` as a separator — it creates false bug reports.

## 2026-05-03: Canvas Editor Zone Ordering Help Text — Bracket Notation Clarification

**Task:** Investigate and fix zone ordering keybinding documentation in canvas editor

**Verdict:** SUCCESS — Issue was formatting, not code

**Summary:**
Investigation of reported `/` key issue in canvas editor determined the problem was purely a help text notation ambiguity, not a keyboard handling bug. The help text format `[ / ]:` was confusing users who interpreted `/` as a key, when it was merely a separator between `[` and `]` keys.

**Root Cause Analysis:**
- Keyboard handler `_adjustZOrder()` correctly implements zone cycling via `[` and `]` keys (verified in code)
- Help text notation used `/` as visual separator, creating false impression of a third keybinding
- No GJS event handling issue — purely a documentation/UI communication problem

**Resolution:**
- Changed help text notation from `[ / ]` to `[, ]` — unambiguous comma separator
- Improves readability: "Press [ or ] to adjust zone order" now reads clearly
- No changes to keyboard event handling or event dispatch logic required

**Files Modified:**
- `extension/ui/editors/canvasZoneEditor.ts` — help text formatting only

**Validation:**
- Zone cycling via `[` and `]` keys: ✓ verified working
- Keyboard event state handling: ✓ no issues found
- Help text readability: ✓ improved with clearer notation

**Outcome:** Investigation confirmed zone ordering functionality is correct. Help text clarified. Users will no longer misinterpret bracket notation as requiring a `/` key.

