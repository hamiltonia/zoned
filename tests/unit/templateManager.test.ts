/**
 * Unit tests for templateManager
 *
 * Tests built-in template data and TemplateManager class methods.
 * Mocks debug logger and gjsGlobal to avoid GJS dependency.
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';

// Mock debug logger
vi.mock('../../extension/utils/debug.js', () => ({
    createLogger: () => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        memdebug: vi.fn(),
    }),
}));

// Mock GJS global
vi.mock('../../extension/types/gjsGlobal', () => ({
    global: {
        zonedDebug: null,
    },
}));

import {TemplateManager} from '../../extension/templateManager';

describe('TemplateManager', () => {
    let mgr: TemplateManager;

    beforeEach(() => {
        mgr = new TemplateManager();
    });

    describe('getBuiltinTemplates', () => {
        it('returns 8 built-in templates', () => {
            const templates = mgr.getBuiltinTemplates();
            expect(templates).toHaveLength(8);
        });

        it('each template has required properties', () => {
            for (const t of mgr.getBuiltinTemplates()) {
                expect(t).toHaveProperty('id');
                expect(t).toHaveProperty('name');
                expect(t).toHaveProperty('zones');
                expect(t).toHaveProperty('description');
                expect(t).toHaveProperty('type');
                expect(['grid', 'canvas']).toContain(t.type);
                expect(t.zones.length).toBeGreaterThan(0);
            }
        });

        it('all zone coordinates are in 0-1 range', () => {
            for (const t of mgr.getBuiltinTemplates()) {
                for (const z of t.zones) {
                    expect(z.x).toBeGreaterThanOrEqual(0);
                    expect(z.y).toBeGreaterThanOrEqual(0);
                    expect(z.x + z.w).toBeLessThanOrEqual(1.001);
                    expect(z.y + z.h).toBeLessThanOrEqual(1.001);
                }
            }
        });
    });

    describe('getTemplate', () => {
        it('returns the split template', () => {
            const t = mgr.getTemplate('split');
            expect(t).not.toBeNull();
            expect(t!.id).toBe('split');
            expect(t!.zones).toHaveLength(2);
        });

        it('returns null for unknown template', () => {
            expect(mgr.getTemplate('nonexistent')).toBeNull();
        });
    });

    describe('hasTemplate', () => {
        it('returns true for known templates', () => {
            expect(mgr.hasTemplate('split')).toBe(true);
            expect(mgr.hasTemplate('triple')).toBe(true);
            expect(mgr.hasTemplate('wide')).toBe(true);
            expect(mgr.hasTemplate('quarters')).toBe(true);
            expect(mgr.hasTemplate('triple_stack')).toBe(true);
            expect(mgr.hasTemplate('ultrawide_focus')).toBe(true);
            expect(mgr.hasTemplate('picture_in_picture')).toBe(true);
            expect(mgr.hasTemplate('center_stage')).toBe(true);
        });

        it('returns false for unknown templates', () => {
            expect(mgr.hasTemplate('bogus')).toBe(false);
        });
    });

    describe('getTemplateCount', () => {
        it('returns 8', () => {
            expect(mgr.getTemplateCount()).toBe(8);
        });
    });

    describe('createLayoutFromTemplate', () => {
        it('creates a layout with template- prefixed ID', () => {
            const layout = mgr.createLayoutFromTemplate('split');
            expect(layout.id).toBe('template-split');
            expect(layout.name).toBe('Split');
            expect(layout.type).toBe('grid');
            expect(layout.editable).toBe(false);
        });

        it('deep copies zones (mutation-safe)', () => {
            const layout = mgr.createLayoutFromTemplate('split');
            layout.zones[0].x = 999;

            // Original template should be unaffected
            const fresh = mgr.getTemplate('split');
            expect(fresh!.zones[0].x).toBe(0);
        });

        it('throws for unknown template', () => {
            expect(() => mgr.createLayoutFromTemplate('bogus')).toThrow('Unknown template: bogus');
        });
    });

    describe('destroy', () => {
        it('nullifies templates', () => {
            mgr.destroy();
            expect(mgr.getBuiltinTemplates()).toEqual([]);
            expect(mgr.getTemplate('split')).toBeNull();
            expect(mgr.hasTemplate('split')).toBe(false);
            expect(mgr.getTemplateCount()).toBe(0);
        });

        it('createLayoutFromTemplate throws after destroy', () => {
            mgr.destroy();
            expect(() => mgr.createLayoutFromTemplate('split')).toThrow('destroyed');
        });
    });

    describe('template content', () => {
        it('split has two 50% columns', () => {
            const t = mgr.getTemplate('split')!;
            expect(t.zones[0]).toMatchObject({x: 0, y: 0, w: 0.5, h: 1});
            expect(t.zones[1]).toMatchObject({x: 0.5, y: 0, w: 0.5, h: 1});
        });

        it('quarters has four 50x50 zones', () => {
            const t = mgr.getTemplate('quarters')!;
            expect(t.zones).toHaveLength(4);
            for (const z of t.zones) {
                expect(z.w).toBeCloseTo(0.5);
                expect(z.h).toBeCloseTo(0.5);
            }
        });

        it('triple_stack has 4 zones with stacked right panel', () => {
            const t = mgr.getTemplate('triple_stack')!;
            expect(t.zones).toHaveLength(4);
            // Right panel is split into top-right and bottom-right
            const rightZones = t.zones.filter(z => z.x >= 0.667);
            expect(rightZones).toHaveLength(2);
            expect(rightZones[0].h).toBeCloseTo(0.5);
            expect(rightZones[1].h).toBeCloseTo(0.5);
        });

        it('canvas templates have type canvas', () => {
            const canvasIds = ['ultrawide_focus', 'picture_in_picture', 'center_stage'];
            for (const id of canvasIds) {
                const t = mgr.getTemplate(id)!;
                expect(t.type).toBe('canvas');
            }
        });

        it('ultrawide_focus has overlapping zones', () => {
            const t = mgr.getTemplate('ultrawide_focus')!;
            expect(t.zones).toHaveLength(5);
            // Top-Left and Full-Left share the same x position
            expect(t.zones[0].x).toBe(t.zones[2].x);
        });

        it('picture_in_picture has overlapping main and pip zones', () => {
            const t = mgr.getTemplate('picture_in_picture')!;
            expect(t.zones).toHaveLength(2);
            expect(t.zones[0].w).toBe(1.0);
            expect(t.zones[0].h).toBe(1.0);
            expect(t.zones[1].w).toBeLessThan(0.5);
        });

        it('center_stage has partial screen coverage', () => {
            const t = mgr.getTemplate('center_stage')!;
            expect(t.zones).toHaveLength(1);
            expect(t.zones[0].x).toBeGreaterThan(0);
            expect(t.zones[0].w).toBeLessThan(1);
        });
    });
});
