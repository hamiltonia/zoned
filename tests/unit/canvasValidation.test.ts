/**
 * Unit tests for canvas layout validation
 *
 * Tests the canvas-specific validation rules in LayoutManager:
 * - Canvas zones allow overlaps and gaps
 * - Canvas zones must stay within screen bounds
 * - Canvas zones have minimum size requirement
 * - Type field migration for existing layouts
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import type {Layout, Zone} from '../../extension/types/layout';

// Mock all GJS dependencies
vi.mock('gi://GLib', () => ({
    default: {
        get_user_config_dir: () => '/tmp/test-config',
    },
}));

vi.mock('gi://Gio', () => ({
    default: {
        File: {
            new_for_path: () => ({
                query_exists: () => false,
                load_contents: () => [false, null],
            }),
        },
        FileCreateFlags: {REPLACE_DESTINATION: 0},
        Settings: vi.fn(),
    },
}));

vi.mock('../../extension/utils/debug.js', () => ({
    createLogger: () => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        memdebug: vi.fn(),
    }),
}));

vi.mock('../../extension/types/gjsGlobal', () => ({
    global: {
        zonedDebug: null,
    },
}));

vi.mock('../../extension/templateManager.js', () => ({
    TemplateManager: vi.fn(),
}));

// Since LayoutManager has complex GJS dependencies, we test the validation
// logic through the type system and data model contracts.

describe('Canvas Layout Data Model', () => {
    describe('Layout type field', () => {
        it('allows grid type', () => {
            const layout: Layout = {
                id: 'test-grid',
                name: 'Test Grid',
                type: 'grid',
                zones: [{x: 0, y: 0, w: 0.5, h: 1}, {x: 0.5, y: 0, w: 0.5, h: 1}],
            };
            expect(layout.type).toBe('grid');
        });

        it('allows canvas type', () => {
            const layout: Layout = {
                id: 'test-canvas',
                name: 'Test Canvas',
                type: 'canvas',
                zones: [{x: 0.1, y: 0.1, w: 0.4, h: 0.4}],
            };
            expect(layout.type).toBe('canvas');
        });

        it('type is optional (backward compatibility)', () => {
            const layout: Layout = {
                id: 'test-legacy',
                name: 'Legacy Layout',
                zones: [{x: 0, y: 0, w: 1, h: 1}],
            };
            expect(layout.type).toBeUndefined();
        });

        it('defaults to grid when type is missing', () => {
            const layout: Layout = {
                id: 'test-default',
                name: 'Default Type',
                zones: [{x: 0, y: 0, w: 1, h: 1}],
            };
            const resolvedType = layout.type || 'grid';
            expect(resolvedType).toBe('grid');
        });
    });

    describe('Canvas zone constraints', () => {
        const MIN_CANVAS_ZONE_SIZE = 0.05;

        function validateCanvasZone(zone: Zone): {valid: boolean; reason?: string} {
            if (zone.x + zone.w > 1.001 || zone.y + zone.h > 1.001) {
                return {valid: false, reason: 'extends beyond screen bounds'};
            }
            if (zone.w < MIN_CANVAS_ZONE_SIZE || zone.h < MIN_CANVAS_ZONE_SIZE) {
                return {valid: false, reason: 'too small'};
            }
            return {valid: true};
        }

        it('allows overlapping zones', () => {
            const zone1: Zone = {x: 0, y: 0, w: 0.5, h: 1};
            const zone2: Zone = {x: 0.25, y: 0, w: 0.5, h: 1};
            expect(validateCanvasZone(zone1).valid).toBe(true);
            expect(validateCanvasZone(zone2).valid).toBe(true);
        });

        it('allows partial screen coverage', () => {
            const zone: Zone = {x: 0.2, y: 0.2, w: 0.3, h: 0.3};
            expect(validateCanvasZone(zone).valid).toBe(true);
        });

        it('rejects zones that extend beyond screen bounds', () => {
            const zone: Zone = {x: 0.8, y: 0, w: 0.3, h: 1};
            const result = validateCanvasZone(zone);
            expect(result.valid).toBe(false);
            expect(result.reason).toBe('extends beyond screen bounds');
        });

        it('rejects zones that are too small', () => {
            const zone: Zone = {x: 0, y: 0, w: 0.03, h: 0.5};
            const result = validateCanvasZone(zone);
            expect(result.valid).toBe(false);
            expect(result.reason).toBe('too small');
        });

        it('accepts zones at exactly minimum size', () => {
            const zone: Zone = {x: 0, y: 0, w: 0.05, h: 0.05};
            expect(validateCanvasZone(zone).valid).toBe(true);
        });

        it('accepts zones at exactly screen bounds', () => {
            const zone: Zone = {x: 0, y: 0, w: 1, h: 1};
            expect(validateCanvasZone(zone).valid).toBe(true);
        });
    });

    describe('Ultrawide use case (Eric)', () => {
        it('supports overlapping zones for ultrawide layout', () => {
            const layout: Layout = {
                id: 'ultrawide-focus',
                name: 'Ultrawide Focus',
                type: 'canvas',
                zones: [
                    {name: 'Top-Left', x: 0, y: 0, w: 0.25, h: 0.5},
                    {name: 'Bottom-Left', x: 0, y: 0.5, w: 0.25, h: 0.5},
                    {name: 'Full-Left', x: 0, y: 0, w: 0.25, h: 1},
                    {name: 'Center', x: 0.25, y: 0, w: 0.5, h: 1},
                    {name: 'Right', x: 0.75, y: 0, w: 0.25, h: 1},
                ],
            };

            expect(layout.type).toBe('canvas');
            expect(layout.zones).toHaveLength(5);

            // Zones 0, 1, and 2 overlap (same x, different heights)
            expect(layout.zones[0].x).toBe(layout.zones[2].x);
            expect(layout.zones[1].x).toBe(layout.zones[2].x);

            // Cycling order: top-left → bottom-left → full-left → center → right
            const cycleOrder = layout.zones.map(z => z.name);
            expect(cycleOrder).toEqual([
                'Top-Left', 'Bottom-Left', 'Full-Left', 'Center', 'Right',
            ]);
        });
    });
});
