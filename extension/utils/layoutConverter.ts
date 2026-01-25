/**
 * LayoutConverter - Converts between zone-based and edge-based layout formats
 *
 * Edge-based format is used internally for editing (makes dragging trivial).
 * Zone-based format is computed from edges for window positioning and storage.
 */

import {createLogger} from './debug.js';

const logger = createLogger('LayoutConverter');

/**
 * Zone definition (window positioning format)
 */
interface Zone {
    name?: string;
    x: number;        // 0.0 to 1.0
    y: number;        // 0.0 to 1.0
    w: number;        // width (0.0 to 1.0)
    h: number;        // height (0.0 to 1.0)
}

/**
 * Zone-based layout (storage format)
 */
interface ZoneLayout {
    id: string;
    name: string;
    zones: Zone[];
}

/**
 * Edge definition (for zone editor)
 */
interface Edge {
    id: string;
    type: 'vertical' | 'horizontal';
    position: number;    // 0.0 to 1.0
    start: number;       // 0.0 to 1.0
    length: number;      // 0.0 to 1.0
    fixed: boolean;      // true for screen boundaries
}

/**
 * Region definition (zone represented by edge references)
 */
interface Region {
    name: string;
    left: string;       // Edge ID
    right: string;      // Edge ID
    top: string;        // Edge ID
    bottom: string;     // Edge ID
}

/**
 * Edge-based layout (editor format)
 */
export interface EdgeLayout {
    id: string;
    name: string;
    edges: Edge[];
    regions: Region[];
}

/**
 * Edge segment (intermediate format during conversion)
 */
interface EdgeSegment {
    type: 'vertical' | 'horizontal';
    position: number;
    start: number;
    end: number;
    zoneIdx: number;
}

// Boundary edge lookup by type and normalized position (0 or 1)
const BOUNDARY_EDGE_IDS: Record<string, string> = {
    'vertical-0': 'left',
    'vertical-1': 'right',
    'horizontal-0': 'top',
    'horizontal-1': 'bottom',
};

/**
 * Check if a position is at a boundary edge
 */
function getBoundaryEdgeId(type: string, position: number, tolerance: number): string | null {
    if (Math.abs(position) < tolerance) {
        return BOUNDARY_EDGE_IDS[`${type}-0`] || null;
    }
    if (Math.abs(position - 1.0) < tolerance) {
        return BOUNDARY_EDGE_IDS[`${type}-1`] || null;
    }
    return null;
}

/**
 * Convert zone-based layout to edge-based representation
 * Creates segmented edges - each zone boundary becomes a separate edge segment
 */
export function zonesToEdges(zoneLayout: ZoneLayout): EdgeLayout {
    const edges: Edge[] = [];
    const regions: Region[] = [];
    let edgeIdCounter = 0;
    const TOLERANCE = 0.001;

    // Always have screen boundaries (full-span edges)
    edges.push({id: 'left', type: 'vertical', position: 0.0, start: 0.0, length: 1.0, fixed: true});
    edges.push({id: 'right', type: 'vertical', position: 1.0, start: 0.0, length: 1.0, fixed: true});
    edges.push({id: 'top', type: 'horizontal', position: 0.0, start: 0.0, length: 1.0, fixed: true});
    edges.push({id: 'bottom', type: 'horizontal', position: 1.0, start: 0.0, length: 1.0, fixed: true});

    // Create segmented edges from zone boundaries
    // For each zone, create edge segments for its four sides
    const edgeSegments: EdgeSegment[] = [];

    zoneLayout.zones.forEach((zone, zoneIdx) => {
        // Left edge of this zone (vertical at zone.x, from zone.y to zone.y+zone.h)
        if (zone.x > TOLERANCE) {
            edgeSegments.push({
                type: 'vertical',
                position: zone.x,
                start: zone.y,
                end: zone.y + zone.h,
                zoneIdx,
            });
        }

        // Right edge of this zone (vertical at zone.x+zone.w, from zone.y to zone.y+zone.h)
        if (zone.x + zone.w < 1.0 - TOLERANCE) {
            edgeSegments.push({
                type: 'vertical',
                position: zone.x + zone.w,
                start: zone.y,
                end: zone.y + zone.h,
                zoneIdx,
            });
        }

        // Top edge of this zone (horizontal at zone.y, from zone.x to zone.x+zone.w)
        if (zone.y > TOLERANCE) {
            edgeSegments.push({
                type: 'horizontal',
                position: zone.y,
                start: zone.x,
                end: zone.x + zone.w,
                zoneIdx,
            });
        }

        // Bottom edge of this zone (horizontal at zone.y+zone.h, from zone.x to zone.x+zone.w)
        if (zone.y + zone.h < 1.0 - TOLERANCE) {
            edgeSegments.push({
                type: 'horizontal',
                position: zone.y + zone.h,
                start: zone.x,
                end: zone.x + zone.w,
                zoneIdx,
            });
        }
    });

    // Merge overlapping edge segments that should be one edge
    // Group by type and position
    const groupedEdges = new Map<string, EdgeSegment[]>();

    edgeSegments.forEach(seg => {
        const key = `${seg.type}-${seg.position.toFixed(4)}`;
        if (!groupedEdges.has(key)) {
            groupedEdges.set(key, []);
        }
        groupedEdges.get(key)!.push(seg);
    });

    // For each group, merge overlapping/adjacent segments
    groupedEdges.forEach((segments, key) => {
        const [type, posStr] = key.split('-');
        const position = parseFloat(posStr);

        // Sort by start position
        segments.sort((a, b) => a.start - b.start);

        // Merge overlapping/adjacent segments
        const merged: EdgeSegment[] = [];
        let current = {...segments[0]};

        for (let i = 1; i < segments.length; i++) {
            const seg = segments[i];

            // If this segment overlaps or is adjacent to current, extend current
            if (seg.start <= current.end + TOLERANCE) {
                current.end = Math.max(current.end, seg.end);
            } else {
                // No overlap, save current and start new segment
                merged.push({...current});
                current = {...seg};
            }
        }
        merged.push(current);

        // Create edge objects from merged segments
        merged.forEach(seg => {
            const id = type === 'vertical' ? `v${edgeIdCounter++}` : `h${edgeIdCounter++}`;
            edges.push({
                id,
                type: seg.type as 'vertical' | 'horizontal',
                position: position,
                start: seg.start,
                length: seg.end - seg.start,
                fixed: false,
            });
        });
    });

    // Helper to find edge ID by position, type, and range
    const findEdgeId = (type: 'vertical' | 'horizontal', position: number, rangeStart: number, rangeEnd: number): string | null => {
        // Check boundaries first using lookup
        const boundaryId = getBoundaryEdgeId(type, position, TOLERANCE);
        if (boundaryId) return boundaryId;

        // Find edge that matches position and contains the range
        for (const edge of edges) {
            const positionMatch = edge.type === type && Math.abs(edge.position - position) < TOLERANCE;
            if (!positionMatch) continue;

            // Check if edge segment contains this range
            const edgeEnd = edge.start + edge.length;
            const containsRange = edge.start <= rangeStart + TOLERANCE && edgeEnd >= rangeEnd - TOLERANCE;
            if (containsRange) return edge.id;
        }

        logger.error(`Could not find edge: type=${type}, position=${position}, range=[${rangeStart}, ${rangeEnd}]`);
        return null;
    };

    // Convert zones to regions (with edge references)
    zoneLayout.zones.forEach((zone, index) => {
        const leftId = findEdgeId('vertical', zone.x, zone.y, zone.y + zone.h);
        const rightId = findEdgeId('vertical', zone.x + zone.w, zone.y, zone.y + zone.h);
        const topId = findEdgeId('horizontal', zone.y, zone.x, zone.x + zone.w);
        const bottomId = findEdgeId('horizontal', zone.y + zone.h, zone.x, zone.x + zone.w);

        if (leftId && rightId && topId && bottomId) {
            regions.push({
                name: zone.name || `Zone ${index + 1}`,
                left: leftId,
                right: rightId,
                top: topId,
                bottom: bottomId,
            });
        }
    });

    logger.debug(`Converted ${zoneLayout.zones.length} zones to ${edges.length} edges and ${regions.length} regions`);

    return {
        id: zoneLayout.id,
        name: zoneLayout.name,
        edges: edges,
        regions: regions,
    };
}

/**
 * Convert edge-based layout to zone-based representation
 */
export function edgesToZones(edgeLayout: EdgeLayout): ZoneLayout {
    const edgeMap = new Map<string, Edge>();

    // Build edge lookup map
    edgeLayout.edges.forEach(edge => {
        edgeMap.set(edge.id, edge);
    });

    // Convert regions to zones
    const zones: Zone[] = [];

    edgeLayout.regions.forEach((region, index) => {
        const left = edgeMap.get(region.left);
        const right = edgeMap.get(region.right);
        const top = edgeMap.get(region.top);
        const bottom = edgeMap.get(region.bottom);

        if (!left || !right || !top || !bottom) {
            logger.error(`Region ${index} has invalid edge references`);
            return;
        }

        zones.push({
            name: region.name || `Zone ${index + 1}`,
            x: left.position,
            y: top.position,
            w: right.position - left.position,
            h: bottom.position - top.position,
        });
    });

    logger.debug(`Converted ${edgeLayout.regions.length} regions to ${zones.length} zones`);

    return {
        id: edgeLayout.id,
        name: edgeLayout.name,
        zones: zones,
    };
}

/**
 * Check if layout has required structure
 */
function hasValidStructure(edgeLayout: EdgeLayout): boolean {
    if (!edgeLayout || !edgeLayout.edges || !edgeLayout.regions) {
        logger.warn('Layout missing edges or regions');
        return false;
    }
    return true;
}

/**
 * Check if layout has all required boundary edges
 */
function hasBoundaryEdges(edges: Edge[]): boolean {
    const edgeIds = new Set(edges.map(e => e.id));
    const required = ['left', 'right', 'top', 'bottom'];
    const missing = required.filter(id => !edgeIds.has(id));

    if (missing.length > 0) {
        logger.warn(`Layout missing required boundary edges: ${missing.join(', ')}`);
        return false;
    }
    return true;
}

/**
 * Check if all edges have valid positions (0-1 range)
 */
function hasValidEdgePositions(edges: Edge[]): boolean {
    for (const edge of edges) {
        const pos = edge.position;
        if (typeof pos !== 'number' || pos < 0 || pos > 1) {
            logger.warn(`Edge ${edge.id} has invalid position: ${pos}`);
            return false;
        }
    }
    return true;
}

/**
 * Check if all regions reference valid edges
 */
function hasValidRegionEdges(regions: Region[], edgeMap: Map<string, Edge>): boolean {
    for (const region of regions) {
        const refs = [region.left, region.right, region.top, region.bottom];
        const invalid = refs.filter(ref => !edgeMap.has(ref));

        if (invalid.length > 0) {
            logger.warn(`Region has invalid edge references: ${invalid.join(', ')}`);
            return false;
        }
    }
    return true;
}

/**
 * Validate edge-based layout
 */
export function validateEdgeLayout(edgeLayout: EdgeLayout): boolean {
    if (!hasValidStructure(edgeLayout)) return false;
    if (!hasBoundaryEdges(edgeLayout.edges)) return false;
    if (!hasValidEdgePositions(edgeLayout.edges)) return false;

    const edgeMap = new Map(edgeLayout.edges.map(e => [e.id, e]));
    if (!hasValidRegionEdges(edgeLayout.regions, edgeMap)) return false;

    logger.debug('Edge layout validation passed');
    return true;
}
