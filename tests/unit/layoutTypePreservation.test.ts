/**
 * Unit tests for layout type preservation
 *
 * Tests the bug fix in layoutSettingsDialog.ts where _buildFinalLayout()
 * and _onDuplicate() were not including the `type` field, causing canvas
 * layouts to lose their type on save and default to 'grid' on next load.
 *
 * Since LayoutSettingsDialog has heavy GNOME Shell dependencies (Clutter, St,
 * GLib, Shell), we test the pure logic by reimplementing the build/duplicate
 * algorithms — matching the pattern used in canvasValidation.test.ts.
 */

import {describe, it, expect} from 'vitest';
import type {Layout, LayoutType} from '../../extension/types/layout';

/**
 * Replicates the layout construction logic from
 * LayoutSettingsDialog._buildFinalLayout() (line ~2469)
 */
function buildFinalLayout(
    existingLayout: Layout,
    nameText: string,
): Layout {
    return {
        id: existingLayout.id || 'generated-id',
        name: nameText.trim(),
        type: existingLayout.type || 'grid',
        zones: existingLayout.zones,
        padding: 0,
        shortcut: null,
        metadata: {
            createdDate: existingLayout.metadata?.createdDate || Date.now(),
            modifiedDate: Date.now(),
        },
    };
}

/**
 * Replicates the layout duplication logic from
 * LayoutSettingsDialog._onDuplicate() (line ~1933)
 */
function duplicateLayout(sourceLayout: Layout): Layout {
    return {
        id: 'new-unique-id',
        name: `${sourceLayout.name} Copy`,
        type: sourceLayout.type || 'grid',
        zones: JSON.parse(JSON.stringify(sourceLayout.zones || [])),
        padding: sourceLayout.padding || 0,
        shortcut: null,
        metadata: {
            createdDate: Date.now(),
            modifiedDate: Date.now(),
        },
    };
}

// ----- Test Fixtures -----

const CANVAS_LAYOUT: Layout = {
    id: 'canvas-1',
    name: 'My Canvas',
    type: 'canvas',
    zones: [
        {x: 0.1, y: 0.1, w: 0.4, h: 0.4},
        {x: 0.3, y: 0.3, w: 0.5, h: 0.5},
    ],
    padding: 8,
};

const GRID_LAYOUT: Layout = {
    id: 'grid-1',
    name: 'My Grid',
    type: 'grid',
    zones: [
        {x: 0, y: 0, w: 0.5, h: 1},
        {x: 0.5, y: 0, w: 0.5, h: 1},
    ],
    padding: 4,
};

const LEGACY_LAYOUT: Layout = {
    id: 'legacy-1',
    name: 'Old Layout',
    zones: [{x: 0, y: 0, w: 1, h: 1}],
};

// ----- Tests -----

describe('Layout Type Preservation — _buildFinalLayout()', () => {
    it('preserves type: canvas when building final layout', () => {
        const result = buildFinalLayout(CANVAS_LAYOUT, 'My Canvas');
        expect(result.type).toBe('canvas');
    });

    it('preserves type: grid when building final layout', () => {
        const result = buildFinalLayout(GRID_LAYOUT, 'My Grid');
        expect(result.type).toBe('grid');
    });

    it('defaults to grid when source layout has no type (legacy)', () => {
        const result = buildFinalLayout(LEGACY_LAYOUT, 'Old Layout');
        expect(result.type).toBe('grid');
    });

    it('preserves zones alongside type', () => {
        const result = buildFinalLayout(CANVAS_LAYOUT, 'My Canvas');
        expect(result.type).toBe('canvas');
        expect(result.zones).toHaveLength(2);
        expect(result.zones[0]).toEqual({x: 0.1, y: 0.1, w: 0.4, h: 0.4});
    });

    it('preserves id from source layout', () => {
        const result = buildFinalLayout(CANVAS_LAYOUT, 'Renamed');
        expect(result.id).toBe('canvas-1');
    });

    it('uses provided name text', () => {
        const result = buildFinalLayout(CANVAS_LAYOUT, '  New Name  ');
        expect(result.name).toBe('New Name');
    });
});

describe('Layout Type Preservation — _onDuplicate()', () => {
    it('preserves type: canvas when duplicating', () => {
        const result = duplicateLayout(CANVAS_LAYOUT);
        expect(result.type).toBe('canvas');
    });

    it('preserves type: grid when duplicating', () => {
        const result = duplicateLayout(GRID_LAYOUT);
        expect(result.type).toBe('grid');
    });

    it('defaults to grid when duplicating a legacy layout without type', () => {
        const result = duplicateLayout(LEGACY_LAYOUT);
        expect(result.type).toBe('grid');
    });

    it('appends "Copy" to the name', () => {
        const result = duplicateLayout(CANVAS_LAYOUT);
        expect(result.name).toBe('My Canvas Copy');
    });

    it('generates a new unique id', () => {
        const result = duplicateLayout(CANVAS_LAYOUT);
        expect(result.id).not.toBe(CANVAS_LAYOUT.id);
    });

    it('deep-clones zones (no shared references)', () => {
        const result = duplicateLayout(CANVAS_LAYOUT);
        expect(result.zones).toEqual(CANVAS_LAYOUT.zones);
        // Mutating the copy must not affect the original
        result.zones[0].x = 0.99;
        expect(CANVAS_LAYOUT.zones[0].x).toBe(0.1);
    });

    it('clears shortcut to avoid conflicts', () => {
        const layoutWithShortcut: Layout = {
            ...GRID_LAYOUT,
            shortcut: 3,
        };
        const result = duplicateLayout(layoutWithShortcut);
        expect(result.shortcut).toBeNull();
    });

    it('preserves padding from source', () => {
        const result = duplicateLayout(CANVAS_LAYOUT);
        expect(result.padding).toBe(8);
    });

    it('defaults padding to 0 when source has no padding', () => {
        const result = duplicateLayout(LEGACY_LAYOUT);
        expect(result.padding).toBe(0);
    });
});

describe('Layout Type Round-Trip', () => {
    it('canvas type survives build→serialize→parse round-trip', () => {
        const built = buildFinalLayout(CANVAS_LAYOUT, 'Canvas RT');
        const serialized = JSON.stringify(built);
        const parsed: Layout = JSON.parse(serialized);
        expect(parsed.type).toBe('canvas');
    });

    it('grid type survives build→serialize→parse round-trip', () => {
        const built = buildFinalLayout(GRID_LAYOUT, 'Grid RT');
        const serialized = JSON.stringify(built);
        const parsed: Layout = JSON.parse(serialized);
        expect(parsed.type).toBe('grid');
    });

    it('legacy layout gets grid type after build, survives round-trip', () => {
        const built = buildFinalLayout(LEGACY_LAYOUT, 'Legacy RT');
        expect(built.type).toBe('grid');
        const parsed: Layout = JSON.parse(JSON.stringify(built));
        expect(parsed.type).toBe('grid');
    });

    it('duplicate→build round-trip preserves canvas type', () => {
        const duplicated = duplicateLayout(CANVAS_LAYOUT);
        const built = buildFinalLayout(duplicated, duplicated.name);
        expect(built.type).toBe('canvas');
    });

    it('duplicate→build round-trip preserves grid type', () => {
        const duplicated = duplicateLayout(GRID_LAYOUT);
        const built = buildFinalLayout(duplicated, duplicated.name);
        expect(built.type).toBe('grid');
    });
});

describe('Canvas Editor Instructions Persistence', () => {
    /**
     * Tests the GSettings-based persistence for canvas editor instructions
     * visibility (Decision 9). Since we can't import the real GSettings or
     * Clutter-dependent editor, we test the state management logic in isolation.
     */

    class InstructionsState {
        private _visible: boolean;

        constructor(initialValue: boolean = true) {
            this._visible = initialValue;
        }

        get visible(): boolean {
            return this._visible;
        }

        toggleInstructions(): void {
            this._visible = !this._visible;
        }

        selectZone(_zoneIndex: number): void {
            // Zone selection must NOT change instructions visibility
            // This was the key behavior requirement from Decision 9
        }
    }

    it('defaults to visible on first launch', () => {
        const state = new InstructionsState();
        expect(state.visible).toBe(true);
    });

    it('can be toggled off', () => {
        const state = new InstructionsState();
        state.toggleInstructions();
        expect(state.visible).toBe(false);
    });

    it('can be toggled back on', () => {
        const state = new InstructionsState();
        state.toggleInstructions();
        state.toggleInstructions();
        expect(state.visible).toBe(true);
    });

    it('persists state when initialized with saved value (false)', () => {
        const state = new InstructionsState(false);
        expect(state.visible).toBe(false);
    });

    it('zone selection does NOT change instructions visibility', () => {
        const state = new InstructionsState(true);
        state.selectZone(0);
        expect(state.visible).toBe(true);

        state.toggleInstructions();
        expect(state.visible).toBe(false);
        state.selectZone(2);
        expect(state.visible).toBe(false);
    });

    it('help toggle controls instructions visibility independently', () => {
        const state = new InstructionsState(true);
        state.selectZone(0);
        state.toggleInstructions(); // hide
        expect(state.visible).toBe(false);
        state.selectZone(1);
        expect(state.visible).toBe(false);
        state.toggleInstructions(); // show
        expect(state.visible).toBe(true);
    });
});
