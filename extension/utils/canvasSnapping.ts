/**
 * Canvas snapping utilities
 *
 * Pure functions for magnetic edge snapping in canvas zone editors.
 * Extracted from CanvasZoneEditor for testability.
 */

export interface SnapResult {
    snapped: number;
    snapPoint: number | null;
}

export interface SnapPoints {
    xPoints: number[];
    yPoints: number[];
}

export interface ZoneRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * Snap a position along a single axis to the nearest snap point.
 * Checks both leading edge (pos) and trailing edge (pos + size).
 * First match within threshold wins (leading edge checked first).
 */
export function snapAxis(pos: number, size: number, points: number[], threshold: number): SnapResult {
    // Check leading edge
    for (const p of points) {
        if (Math.abs(pos - p) < threshold) {
            return {snapped: p, snapPoint: p};
        }
    }
    // Check trailing edge
    for (const p of points) {
        if (Math.abs(pos + size - p) < threshold) {
            return {snapped: p - size, snapPoint: p};
        }
    }
    return {snapped: pos, snapPoint: null};
}

/**
 * Collect snap points from a set of zones, excluding one zone by index.
 * Always includes screen boundaries (0 and 1).
 */
export function collectSnapPoints(zones: ZoneRect[], excludeIndex: number): SnapPoints {
    const xPoints: number[] = [0, 1];
    const yPoints: number[] = [0, 1];

    zones.forEach((zone, i) => {
        if (i === excludeIndex) return;
        xPoints.push(zone.x, zone.x + zone.w);
        yPoints.push(zone.y, zone.y + zone.h);
    });

    return {xPoints, yPoints};
}
