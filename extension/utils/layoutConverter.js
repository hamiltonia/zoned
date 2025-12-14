/**
 * LayoutConverter - Converts between zone-based and edge-based layout formats
 *
 * Edge-based format is used internally for editing (makes dragging trivial).
 * Zone-based format is computed from edges for window positioning and storage.
 */

import {createLogger} from './debug.js';

const logger = createLogger('LayoutConverter');

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
        // Check boundaries first
        if (type === 'vertical') {
            if (Math.abs(position) < TOLERANCE) return 'left';
            if (Math.abs(position - 1.0) < TOLERANCE) return 'right';
        } else {
            if (Math.abs(position) < TOLERANCE) return 'top';
            if (Math.abs(position - 1.0) < TOLERANCE) return 'bottom';
        }

        // Find edge that matches position and contains the range
        for (const edge of edges) {
            if (edge.type === type && Math.abs(edge.position - position) < TOLERANCE) {
                // Check if edge segment contains this range
                const edgeEnd = edge.start + edge.length;
                if (edge.start <= rangeStart + TOLERANCE && edgeEnd >= rangeEnd - TOLERANCE) {
                    return edge.id;
                }
            }
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
 * Validate edge-based layout
 *
 * @param {Object} edgeLayout - Layout to validate
 * @returns {boolean} True if valid
 */
export function validateEdgeLayout(edgeLayout) {
    if (!edgeLayout || !edgeLayout.edges || !edgeLayout.regions) {
        logger.warn('Layout missing edges or regions');
        return false;
    }

    // Check for required boundary edges
    const edgeIds = new Set(edgeLayout.edges.map(e => e.id));
    if (!edgeIds.has('left') || !edgeIds.has('right') ||
        !edgeIds.has('top') || !edgeIds.has('bottom')) {
        logger.warn('Layout missing required boundary edges');
        return false;
    }

    // Validate each edge
    for (const edge of edgeLayout.edges) {
        if (typeof edge.position !== 'number' || edge.position < 0 || edge.position > 1) {
            logger.warn(`Edge ${edge.id} has invalid position: ${edge.position}`);
            return false;
        }
    }

    // Validate regions reference valid edges
    const edgeMap = new Map(edgeLayout.edges.map(e => [e.id, e]));
    for (const region of edgeLayout.regions) {
        if (!edgeMap.has(region.left) || !edgeMap.has(region.right) ||
            !edgeMap.has(region.top) || !edgeMap.has(region.bottom)) {
            logger.warn('Region has invalid edge references');
            return false;
        }
    }

    logger.debug('Edge layout validation passed');
    return true;
}
