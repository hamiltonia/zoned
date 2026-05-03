# History

No sessions yet.

## Learnings

- Extracted snap logic from `canvasZoneEditor.ts` into `extension/utils/canvasSnapping.ts` with pure functions `snapAxis()` and `collectSnapPoints()` — making private editor logic testable without mocking GNOME Shell UI.
- Floating point arithmetic (e.g. `0.2 + 0.4 = 0.6000000000000001`) requires `toBeCloseTo()` instead of `toContain()` when asserting computed zone edge positions in tests.
- Canvas validation tests can reimplement the validation algorithm locally (matching `LayoutManager._validateCanvasConstraints`) since the real class has heavy GJS dependencies that are impractical to mock fully.
- The `snapAxis` algorithm checks leading edge first, then trailing edge — first match within threshold wins, which means leading edge has priority over trailing edge for the same snap point.
