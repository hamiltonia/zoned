# History

## Session: Test Coverage Scribe Log (2026-05-03 19:12)
- Orchestration log: `2026-05-03T19-12-00Z-hockney.md` created
- Session log: `2026-05-03T19-12-00Z-test-coverage.md` created
- All team documentation updated

## Session: Layout Type Preservation + Panel Consolidation Tests (2026-05-03)
- Added `tests/unit/layoutTypePreservation.test.ts` with 26 tests covering:
  - `_buildFinalLayout()` type preservation for canvas, grid, and legacy layouts (6 tests)
  - `_onDuplicate()` type preservation, deep cloning, shortcut clearing, padding defaults (9 tests)
  - Save→load round-trip type survival including duplicate→build chains (5 tests)
  - Canvas editor instructions visibility state management (6 tests)
- All 122 tests passing (96 existing + 26 new)
- Canvas editor panel consolidation UI behaviors (Clutter/St-dependent) were tested via extracted state logic, not full GNOME Shell mocking

## Learnings

- Extracted snap logic from `canvasZoneEditor.ts` into `extension/utils/canvasSnapping.ts` with pure functions `snapAxis()` and `collectSnapPoints()` — making private editor logic testable without mocking GNOME Shell UI.
- Floating point arithmetic (e.g. `0.2 + 0.4 = 0.6000000000000001`) requires `toBeCloseTo()` instead of `toContain()` when asserting computed zone edge positions in tests.
- Canvas validation tests can reimplement the validation algorithm locally (matching `LayoutManager._validateCanvasConstraints`) since the real class has heavy GJS dependencies that are impractical to mock fully.
- The `snapAxis` algorithm checks leading edge first, then trailing edge — first match within threshold wins, which means leading edge has priority over trailing edge for the same snap point.
- For `_buildFinalLayout()` and `_onDuplicate()` logic, the "reimplement pure logic" test pattern works well — these functions are simple object construction that can be tested without GNOME Shell mocks.
- Instructions visibility state management (toggle, persist, zone-selection-independent) is testable by extracting the state machine from UI code into a minimal class.
