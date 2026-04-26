/**
 * Unit tests for layoutConverter
 *
 * Tests zone↔edge geometric transformations. The module uses createLogger
 * from debug.ts, which we mock to avoid GSettings dependency.
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';

// Mock the debug logger before importing the module under test
vi.mock('../../../extension/utils/debug.js', () => ({
    createLogger: () => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        memdebug: vi.fn(),
    }),
}));

import {zonesToEdges, edgesToZones, validateEdgeLayout} from '../../../extension/utils/layoutConverter';
import type {EdgeLayout} from '../../../extension/utils/layoutConverter';

// Helper to create a ZoneLayout
function makeZoneLayout(id: string, name: string, zones: Array<{name?: string; x: number; y: number; w: number; h: number}>) {
    return {id, name, zones};
}

describe('zonesToEdges', () => {
    it('converts a 50/50 split into edges and regions', () => {
        const layout = makeZoneLayout('split', 'Split', [
            {name: 'Left', x: 0, y: 0, w: 0.5, h: 1},
            {name: 'Right', x: 0.5, y: 0, w: 0.5, h: 1},
        ]);
        const result = zonesToEdges(layout);

        expect(result.id).toBe('split');
        expect(result.name).toBe('Split');
        expect(result.regions).toHaveLength(2);

        // Should have 4 boundary edges + 1 internal vertical
        const boundaries = result.edges.filter(e => e.fixed);
        const internal = result.edges.filter(e => !e.fixed);
        expect(boundaries).toHaveLength(4);
        expect(internal).toHaveLength(1);

        // Internal edge at position 0.5
        expect(internal[0].type).toBe('vertical');
        expect(internal[0].position).toBeCloseTo(0.5);

        // Regions reference correct edges
        expect(result.regions[0].name).toBe('Left');
        expect(result.regions[0].left).toBe('left');
        expect(result.regions[0].right).toBe(internal[0].id);
        expect(result.regions[1].name).toBe('Right');
        expect(result.regions[1].left).toBe(internal[0].id);
        expect(result.regions[1].right).toBe('right');
    });

    it('converts triple columns', () => {
        const layout = makeZoneLayout('triple', 'Triple', [
            {name: 'Left', x: 0, y: 0, w: 0.333, h: 1},
            {name: 'Center', x: 0.333, y: 0, w: 0.334, h: 1},
            {name: 'Right', x: 0.667, y: 0, w: 0.333, h: 1},
        ]);
        const result = zonesToEdges(layout);

        expect(result.regions).toHaveLength(3);

        // 4 boundaries + 2 internal verticals
        const internal = result.edges.filter(e => !e.fixed);
        expect(internal).toHaveLength(2);
        expect(internal.every(e => e.type === 'vertical')).toBe(true);
    });

    it('converts 2x2 grid (quarters)', () => {
        const layout = makeZoneLayout('quarters', 'Quarters', [
            {name: 'TL', x: 0, y: 0, w: 0.5, h: 0.5},
            {name: 'TR', x: 0.5, y: 0, w: 0.5, h: 0.5},
            {name: 'BL', x: 0, y: 0.5, w: 0.5, h: 0.5},
            {name: 'BR', x: 0.5, y: 0.5, w: 0.5, h: 0.5},
        ]);
        const result = zonesToEdges(layout);

        expect(result.regions).toHaveLength(4);

        // Should have 1 internal vertical + 1 internal horizontal
        const internal = result.edges.filter(e => !e.fixed);
        const verticals = internal.filter(e => e.type === 'vertical');
        const horizontals = internal.filter(e => e.type === 'horizontal');
        expect(verticals).toHaveLength(1);
        expect(horizontals).toHaveLength(1);
        expect(verticals[0].position).toBeCloseTo(0.5);
        expect(horizontals[0].position).toBeCloseTo(0.5);
    });

    it('handles single full-screen zone', () => {
        const layout = makeZoneLayout('full', 'Full', [
            {name: 'Full', x: 0, y: 0, w: 1, h: 1},
        ]);
        const result = zonesToEdges(layout);

        expect(result.regions).toHaveLength(1);
        // Only boundary edges, no internal
        const internal = result.edges.filter(e => !e.fixed);
        expect(internal).toHaveLength(0);

        expect(result.regions[0].left).toBe('left');
        expect(result.regions[0].right).toBe('right');
        expect(result.regions[0].top).toBe('top');
        expect(result.regions[0].bottom).toBe('bottom');
    });
});

describe('edgesToZones', () => {
    it('converts edge layout back to zones', () => {
        const edgeLayout: EdgeLayout = {
            id: 'split',
            name: 'Split',
            edges: [
                {id: 'left', type: 'vertical', position: 0, start: 0, length: 1, fixed: true},
                {id: 'right', type: 'vertical', position: 1, start: 0, length: 1, fixed: true},
                {id: 'top', type: 'horizontal', position: 0, start: 0, length: 1, fixed: true},
                {id: 'bottom', type: 'horizontal', position: 1, start: 0, length: 1, fixed: true},
                {id: 'v0', type: 'vertical', position: 0.5, start: 0, length: 1, fixed: false},
            ],
            regions: [
                {name: 'Left', left: 'left', right: 'v0', top: 'top', bottom: 'bottom'},
                {name: 'Right', left: 'v0', right: 'right', top: 'top', bottom: 'bottom'},
            ],
        };
        const result = edgesToZones(edgeLayout);

        expect(result.id).toBe('split');
        expect(result.zones).toHaveLength(2);
        expect(result.zones[0]).toEqual({name: 'Left', x: 0, y: 0, w: 0.5, h: 1});
        expect(result.zones[1]).toEqual({name: 'Right', x: 0.5, y: 0, w: 0.5, h: 1});
    });

    it('handles missing edge references gracefully', () => {
        const edgeLayout: EdgeLayout = {
            id: 'broken',
            name: 'Broken',
            edges: [
                {id: 'left', type: 'vertical', position: 0, start: 0, length: 1, fixed: true},
            ],
            regions: [
                {name: 'Bad', left: 'left', right: 'missing', top: 'top', bottom: 'bottom'},
            ],
        };
        const result = edgesToZones(edgeLayout);
        // Region with invalid refs is skipped
        expect(result.zones).toHaveLength(0);
    });
});

describe('round-trip conversion', () => {
    it('zones → edges → zones preserves split layout', () => {
        const original = makeZoneLayout('split', 'Split', [
            {name: 'Left', x: 0, y: 0, w: 0.5, h: 1},
            {name: 'Right', x: 0.5, y: 0, w: 0.5, h: 1},
        ]);
        const edges = zonesToEdges(original);
        const roundTripped = edgesToZones(edges);

        expect(roundTripped.zones).toHaveLength(2);
        for (let i = 0; i < original.zones.length; i++) {
            expect(roundTripped.zones[i].x).toBeCloseTo(original.zones[i].x);
            expect(roundTripped.zones[i].y).toBeCloseTo(original.zones[i].y);
            expect(roundTripped.zones[i].w).toBeCloseTo(original.zones[i].w);
            expect(roundTripped.zones[i].h).toBeCloseTo(original.zones[i].h);
        }
    });

    it('zones → edges → zones preserves quarters layout', () => {
        const original = makeZoneLayout('quarters', 'Quarters', [
            {x: 0, y: 0, w: 0.5, h: 0.5},
            {x: 0.5, y: 0, w: 0.5, h: 0.5},
            {x: 0, y: 0.5, w: 0.5, h: 0.5},
            {x: 0.5, y: 0.5, w: 0.5, h: 0.5},
        ]);
        const edges = zonesToEdges(original);
        const roundTripped = edgesToZones(edges);

        expect(roundTripped.zones).toHaveLength(4);
        for (let i = 0; i < original.zones.length; i++) {
            expect(roundTripped.zones[i].x).toBeCloseTo(original.zones[i].x);
            expect(roundTripped.zones[i].y).toBeCloseTo(original.zones[i].y);
            expect(roundTripped.zones[i].w).toBeCloseTo(original.zones[i].w);
            expect(roundTripped.zones[i].h).toBeCloseTo(original.zones[i].h);
        }
    });

    it('zones → edges → zones preserves triple_stack layout', () => {
        const original = makeZoneLayout('triple_stack', 'Triple Stack', [
            {name: 'Left', x: 0, y: 0, w: 0.333, h: 1},
            {name: 'Center', x: 0.333, y: 0, w: 0.334, h: 1},
            {name: 'Top-Right', x: 0.667, y: 0, w: 0.333, h: 0.5},
            {name: 'Bottom-Right', x: 0.667, y: 0.5, w: 0.333, h: 0.5},
        ]);
        const edges = zonesToEdges(original);
        const roundTripped = edgesToZones(edges);

        expect(roundTripped.zones).toHaveLength(4);
        for (let i = 0; i < original.zones.length; i++) {
            expect(roundTripped.zones[i].x).toBeCloseTo(original.zones[i].x, 2);
            expect(roundTripped.zones[i].y).toBeCloseTo(original.zones[i].y, 2);
            expect(roundTripped.zones[i].w).toBeCloseTo(original.zones[i].w, 2);
            expect(roundTripped.zones[i].h).toBeCloseTo(original.zones[i].h, 2);
        }
    });
});

describe('validateEdgeLayout', () => {
    function makeValidEdgeLayout(): EdgeLayout {
        return {
            id: 'test',
            name: 'Test',
            edges: [
                {id: 'left', type: 'vertical', position: 0, start: 0, length: 1, fixed: true},
                {id: 'right', type: 'vertical', position: 1, start: 0, length: 1, fixed: true},
                {id: 'top', type: 'horizontal', position: 0, start: 0, length: 1, fixed: true},
                {id: 'bottom', type: 'horizontal', position: 1, start: 0, length: 1, fixed: true},
            ],
            regions: [
                {name: 'Full', left: 'left', right: 'right', top: 'top', bottom: 'bottom'},
            ],
        };
    }

    it('accepts a valid edge layout', () => {
        expect(validateEdgeLayout(makeValidEdgeLayout())).toBe(true);
    });

    it('rejects null/undefined', () => {
        expect(validateEdgeLayout(null as unknown as EdgeLayout)).toBe(false);
        expect(validateEdgeLayout(undefined as unknown as EdgeLayout)).toBe(false);
    });

    it('rejects layout missing boundary edges', () => {
        const layout = makeValidEdgeLayout();
        layout.edges = layout.edges.filter(e => e.id !== 'top');
        expect(validateEdgeLayout(layout)).toBe(false);
    });

    it('rejects edge with out-of-range position', () => {
        const layout = makeValidEdgeLayout();
        layout.edges.push({id: 'bad', type: 'vertical', position: 1.5, start: 0, length: 1, fixed: false});
        expect(validateEdgeLayout(layout)).toBe(false);
    });

    it('rejects region referencing nonexistent edge', () => {
        const layout = makeValidEdgeLayout();
        layout.regions[0].left = 'nonexistent';
        expect(validateEdgeLayout(layout)).toBe(false);
    });

    it('rejects layout without edges array', () => {
        const layout = {id: 'bad', name: 'Bad', regions: []} as unknown as EdgeLayout;
        expect(validateEdgeLayout(layout)).toBe(false);
    });

    it('rejects layout without regions array', () => {
        const layout = {id: 'bad', name: 'Bad', edges: []} as unknown as EdgeLayout;
        expect(validateEdgeLayout(layout)).toBe(false);
    });
});
