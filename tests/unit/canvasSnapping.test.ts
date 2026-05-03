/**
 * Unit tests for canvas snapping utilities
 *
 * Tests the magnetic snap algorithm used by CanvasZoneEditor.
 */

import {describe, it, expect, vi} from 'vitest';

vi.mock('../../extension/utils/debug.js', () => ({
    createLogger: () => ({
        error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), memdebug: vi.fn(),
    }),
}));

import {snapAxis, collectSnapPoints} from '../../extension/utils/canvasSnapping';

const THRESHOLD = 0.02;

describe('snapAxis', () => {
    it('snaps leading edge to screen left boundary (x=0)', () => {
        const result = snapAxis(0.01, 0.3, [0, 1], THRESHOLD);
        expect(result.snapped).toBe(0);
        expect(result.snapPoint).toBe(0);
    });

    it('snaps trailing edge to screen right boundary (x=1)', () => {
        // zone at x=0.69, w=0.3 => trailing edge at 0.99, within 0.02 of 1
        const result = snapAxis(0.69, 0.3, [0, 1], THRESHOLD);
        expect(result.snapped).toBeCloseTo(0.7);
        expect(result.snapPoint).toBe(1);
    });

    it('snaps leading edge to another zone left edge', () => {
        const result = snapAxis(0.49, 0.2, [0, 0.5, 0.8, 1], THRESHOLD);
        expect(result.snapped).toBe(0.5);
        expect(result.snapPoint).toBe(0.5);
    });

    it('snaps leading edge to another zone right edge', () => {
        // Zone B ends at 0.8; we position at 0.79 — within threshold of 0.8
        const result = snapAxis(0.79, 0.2, [0, 0.5, 0.8, 1], THRESHOLD);
        expect(result.snapped).toBe(0.8);
        expect(result.snapPoint).toBe(0.8);
    });

    it('snaps trailing edge to another zone edge', () => {
        // zone at x=0.31, w=0.2 => trailing edge at 0.51, within threshold of 0.5
        const result = snapAxis(0.31, 0.2, [0, 0.5, 1], THRESHOLD);
        expect(result.snapped).toBeCloseTo(0.3);
        expect(result.snapPoint).toBe(0.5);
    });

    it('does not snap when outside threshold', () => {
        const result = snapAxis(0.45, 0.2, [0, 0.8, 1], THRESHOLD);
        expect(result.snapped).toBe(0.45);
        expect(result.snapPoint).toBeNull();
    });

    it('snaps to nearest point — leading edge wins if both within threshold', () => {
        // pos=0.01 is 0.01 from point 0 (leading) — checked first, so it wins
        const result = snapAxis(0.01, 0.02, [0, 0.03, 1], THRESHOLD);
        expect(result.snapped).toBe(0);
        expect(result.snapPoint).toBe(0);
    });

    it('works independently on Y axis (same math)', () => {
        // Snap near top boundary
        const result = snapAxis(0.015, 0.5, [0, 1], THRESHOLD);
        expect(result.snapped).toBe(0);
        expect(result.snapPoint).toBe(0);
    });

    it('snaps trailing edge to screen bottom boundary', () => {
        // zone at y=0.49, h=0.5 => trailing at 0.99, within threshold of 1
        const result = snapAxis(0.49, 0.5, [0, 1], THRESHOLD);
        expect(result.snapped).toBeCloseTo(0.5);
        expect(result.snapPoint).toBe(1);
    });

    it('uses exact threshold boundary (just inside)', () => {
        // exactly at threshold - 0.001
        const result = snapAxis(0.019, 0.3, [0, 1], THRESHOLD);
        expect(result.snapped).toBe(0);
        expect(result.snapPoint).toBe(0);
    });

    it('does not snap at exactly the threshold distance', () => {
        // Math.abs(0.02 - 0) = 0.02, which is NOT < 0.02
        const result = snapAxis(0.02, 0.3, [0, 1], THRESHOLD);
        expect(result.snapped).toBe(0.02);
        expect(result.snapPoint).toBeNull();
    });
});

describe('collectSnapPoints', () => {
    it('always includes screen boundaries', () => {
        const result = collectSnapPoints([], -1);
        expect(result.xPoints).toContain(0);
        expect(result.xPoints).toContain(1);
        expect(result.yPoints).toContain(0);
        expect(result.yPoints).toContain(1);
    });

    it('collects edges from other zones', () => {
        const zones = [
            {x: 0, y: 0, w: 0.5, h: 0.5},
            {x: 0.5, y: 0.5, w: 0.5, h: 0.5},
        ];
        const result = collectSnapPoints(zones, -1);
        expect(result.xPoints).toContain(0.5);
        expect(result.xPoints).toContain(1);
        expect(result.yPoints).toContain(0.5);
        expect(result.yPoints).toContain(1);
    });

    it('excludes the specified zone index', () => {
        const zones = [
            {x: 0, y: 0, w: 0.3, h: 0.3},
            {x: 0.5, y: 0.5, w: 0.4, h: 0.4},
        ];
        const result = collectSnapPoints(zones, 0);
        // Zone 0 edges (0.3) should not appear beyond boundaries
        expect(result.xPoints).not.toContain(0.3);
        expect(result.yPoints).not.toContain(0.3);
        // Zone 1 edges should appear
        expect(result.xPoints).toContain(0.5);
        expect(result.xPoints).toContain(0.9);
    });

    it('includes both leading and trailing edges of zones', () => {
        const zones = [{x: 0.2, y: 0.3, w: 0.4, h: 0.5}];
        const result = collectSnapPoints(zones, -1);
        expect(result.xPoints).toContain(0.2);
        expect(result.xPoints[3]).toBeCloseTo(0.6);  // 0.2 + 0.4
        expect(result.yPoints).toContain(0.3);
        expect(result.yPoints[3]).toBeCloseTo(0.8);  // 0.3 + 0.5
    });
});
