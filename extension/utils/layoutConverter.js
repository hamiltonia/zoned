/**
 * LayoutConverter - Converts between zone-based and edge-based layout formats
 *
 * Edge-based format is used internally for editing (makes dragging trivial).
 * Zone-based format is computed from edges for window positioning and storage.
 */

import {createLogger} from './debug.js';

const logger = createLogger('LayoutConverter');

// Boundary edge lookup by type and normalized position (0 or 1)
const BOUNDARY_EDGE_IDS = {
    'vertical-0': 'left',
    'vertical-1': 'right',
    'horizontal-0': 'top',
    'horizontal-1': 'bottom',
};

/**
 * Check if a position is at a boundary edge
 * @param {string} type - Edge type ('vertical' or 'horizontal')
 * @param {number} position - Position to check (0.0 to 1.0)
 * @param {number} tolerance - Position tolerance
 * @returns {string|null} Boundary edge ID or null
 */
function getBoundaryEdgeId(type, position, tolerance) {
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
 *
 * @param {Object} zoneLayout - Layout with zones array
 * @returns {Object} Edge-based layout with edges and regions
 */
export function zonesToEdges(zoneLayout) {
    const edges = [];
    const regions = [];
    let edgeIdCounter = 0;
    const TOLERANCE = 0.001;

    // Always have screen boundaries (full-span edges)
    edges.push({id: 'left', type: 'vertical', position: 0.0, start: 0.0, length: 1.0, fixed: true});
    edges.push({id: 'right', type: 'vertical', position: 1.0, start: 0.0, length: 1.0, fixed: true});
    edges.push({id: 'top', type: 'horizontal', position: 0.0, start: 0.0, length: 1.0, fixed: true});
    edges.push({id: 'bottom', type: 'horizontal', position: 1.0, start: 0.0, length: 1.0, fixed: true});

    // Create segmented edges from zone boundaries
    // For each zone, create edge segments for its four sides
    const edgeSegments = [];

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
    const groupedEdges = new Map();

    edgeSegments.forEach(seg => {
        const key = `${seg.type}-${seg.position.toFixed(4)}`;
        if (!groupedEdges.has(key)) {
            groupedEdges.set(key, []);
        }
        groupedEdges.get(key).push(seg);
    });

    // For each group, merge overlapping/adjacent segments
    groupedEdges.forEach((segments, key) => {
        const [type, posStr] = key.split('-');
        const position = parseFloat(posStr);

        // Sort by start position
        segments.sort((a, b) => a.start - b.start);

        // Merge overlapping/adjacent segments
        const merged = [];
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
                type: seg.type,
                position: position,
                start: seg.start,
                length: seg.end - seg.start,
                fixed: false,
            });
        });
    });

    // Helper to find edge ID by position, type, and range
    const findEdgeId = (type, position, rangeStart, rangeEnd) => {
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
 *
 * @param {Object} edgeLayout - Layout with edges and regions
 * @returns {Object} Zone-based layout
 */
export function edgesToZones(edgeLayout) {
    const edgeMap = new Map();

    // Build edge lookup map
    edgeLayout.edges.forEach(edge => {
        edgeMap.set(edge.id, edge);
    });

    // Convert regions to zones
    const zones = edgeLayout.regions.map((region, index) => {
        const left = edgeMap.get(region.left);
        const right = edgeMap.get(region.right);
        const top = edgeMap.get(region.top);
        const bottom = edgeMap.get(region.bottom);

        if (!left || !right || !top || !bottom) {
            logger.error(`Region ${index} has invalid edge references`);
            return null;
        }

        return {
            name: region.name || `Zone ${index + 1}`,
            x: left.position,
            y: top.position,
            w: right.position - left.position,
            h: bottom.position - top.position,
        };
    }).filter(zone => zone !== null);

    logger.debug(`Converted ${edgeLayout.regions.length} regions to ${zones.length} zones`);

    return {
        id: edgeLayout.id,
        name: edgeLayout.name,
        zones: zones,
    };
}

/**
 * Check if layout has required structure
 * @param {Object} edgeLayout - Layout to validate
 * @returns {boolean} True if structure is valid
 */
function hasValidStructure(edgeLayout) {
    if (!edgeLayout || !edgeLayout.edges || !edgeLayout.regions) {
        logger.warn('Layout missing edges or regions');
        return false;
    }
    return true;
}

/**
 * Check if layout has all required boundary edges
 * @param {Array} edges - Edges array
 * @returns {boolean} True if all boundary edges present
 */
function hasBoundaryEdges(edges) {
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
 * @param {Array} edges - Edges array
 * @returns {boolean} True if all edge positions are valid
 */
function hasValidEdgePositions(edges) {
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
 * @param {Array} regions - Regions array
 * @param {Map} edgeMap - Edge lookup map
 * @returns {boolean} True if all region edge references are valid
 */
function hasValidRegionEdges(regions, edgeMap) {
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
 *
 * @param {Object} edgeLayout - Layout to validate
 * @returns {boolean} True if valid
 */
export function validateEdgeLayout(edgeLayout) {
    if (!hasValidStructure(edgeLayout)) return false;
    if (!hasBoundaryEdges(edgeLayout.edges)) return false;
    if (!hasValidEdgePositions(edgeLayout.edges)) return false;

    const edgeMap = new Map(edgeLayout.edges.map(e => [e.id, e]));
    if (!hasValidRegionEdges(edgeLayout.regions, edgeMap)) return false;

    logger.debug('Edge layout validation passed');
    return true;
}
