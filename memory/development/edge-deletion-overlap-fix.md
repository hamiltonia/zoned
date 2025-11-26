# Edge Deletion Overlap Detection Fix

**Date**: 2025-11-26  
**Status**: ✅ IMPLEMENTED  
**File**: `extension/ui/gridEditor.js`

## Problem Summary

Edge deletion in the grid editor fails for TUTORIAL-STEP-2A case where:
- **Left side**: Region 0 with `top=top, bottom=bottom` (spans full height 0.0 to 1.0)
- **Right side**: Region 1 with `top=top, bottom=h0` (top half, 0.0 to 0.5) + Region 2 with `top=h0, bottom=bottom` (bottom half, 0.5 to 1.0)
- **Edge v0**: Vertical edge at x=0.5 that should be deletable to merge all three regions

### Root Cause

The `_canDeleteEdge()` method uses **exact edge ID matching** instead of **position-based overlap detection**:

```javascript
// OLD BROKEN LOGIC (exact match):
if (leftReg.top === rightReg.top && leftReg.bottom === rightReg.bottom) {
    hasMatch = true;
}
```

This fails because:
- Region 0's `top` and `bottom` edge IDs don't match Region 1's or Region 2's individually
- Even though Region 0 spans the same vertical space as Region 1 + Region 2 combined

## Solution: Position-Based Overlap Detection

Replace exact edge ID matching with position-based overlap checking:

```javascript
// NEW WORKING LOGIC (overlap detection):
const leftTop = edgeMap.get(leftReg.top).position;
const leftBottom = edgeMap.get(leftReg.bottom).position;
const rightTop = edgeMap.get(rightReg.top).position;
const rightBottom = edgeMap.get(rightReg.bottom).position;

// Overlap check: leftTop < rightBottom AND leftBottom > rightTop
if (leftTop < rightBottom && leftBottom > rightTop) {
    hasOverlap = true;
}
```

This correctly identifies that Region 0 (0.0→1.0) overlaps with both Region 1 (0.0→0.5) and Region 2 (0.5→1.0).

## Code Changes Required

### 1. Update `_canDeleteEdge()` Method

**Location**: `extension/ui/gridEditor.js`, around line 850-920

**Find this section:**
```javascript
        // Check if atleast one region per side can be merged
        // (shares the same perpendicular bounds with a region on the other side)
        let hasMatch = false;
        
        if (edge.type === 'vertical') {
            // For vertical edges: check if any left region matches any right region vertically
            for (const leftReg of leftOrTopRegions) {
                for (const rightReg of rightOrBottomRegions) {
                    if (leftReg.top === rightReg.top && leftReg.bottom === rightReg.bottom) {
                        hasMatch = true;
                        break;
                    }
                }
                if (hasMatch) break;
            }
        } else {
            // For horizontal edges: check if any top region matches any bottom region horizontally
            for (const topReg of leftOrTopRegions) {
                for (const bottomReg of rightOrBottomRegions) {
                    if (topReg.left === bottomReg.left && topReg.right === bottomReg.right) {
                        hasMatch = true;
                        break;
                    }
                }
                if (hasMatch) break;
            }
        }
        
        return hasMatch;
```

**Replace with:**
```javascript
        // Must have regions on both sides
        if (leftOrTopRegions.length === 0 || rightOrBottomRegions.length === 0) {
            logger.warn(`[EDGE-DELETE] Edge ${edge.id} only has regions on one side`);
            return false;
        }
        
        // Check if ANY region from one side OVERLAPS with ANY region from the other side
        // in the perpendicular direction (uses position-based overlap, not exact edge ID matching)
        const edgeMap = new Map(this._edgeLayout.edges.map(e => [e.id, e]));
        let hasOverlap = false;
        
        if (edge.type === 'vertical') {
            // For vertical edges: check perpendicular (vertical/Y-axis) overlap
            for (const leftReg of leftOrTopRegions) {
                const leftTop = edgeMap.get(leftReg.top).position;
                const leftBottom = edgeMap.get(leftReg.bottom).position;
                
                for (const rightReg of rightOrBottomRegions) {
                    const rightTop = edgeMap.get(rightReg.top).position;
                    const rightBottom = edgeMap.get(rightReg.bottom).position;
                    
                    // Overlap: leftTop < rightBottom AND leftBottom > rightTop
                    if (leftTop < rightBottom && leftBottom > rightTop) {
                        hasOverlap = true;
                        break;
                    }
                }
                if (hasOverlap) break;
            }
        } else {
            // For horizontal edges: check perpendicular (horizontal/X-axis) overlap
            for (const topReg of leftOrTopRegions) {
                const topLeft = edgeMap.get(topReg.left).position;
                const topRight = edgeMap.get(topReg.right).position;
                
                for (const bottomReg of rightOrBottomRegions) {
                    const bottomLeft = edgeMap.get(bottomReg.left).position;
                    const bottomRight = edgeMap.get(bottomReg.right).position;
                    
                    // Overlap: topLeft < bottomRight AND topRight > bottomLeft
                    if (topLeft < bottomRight && topRight > bottomLeft) {
                        hasOverlap = true;
                        break;
                    }
                }
                if (hasOverlap) break;
            }
        }
        
        logger.debug(`[EDGE-DELETE] Edge ${edge.id}: leftOrTop=${leftOrTopRegions.length}, rightOrBottom=${rightOrBottomRegions.length}, hasOverlap=${hasOverlap}`);
        
        return hasOverlap;
```

### 2. Add Missing `_onSave()` Method

**Location**: `extension/ui/gridEditor.js`, before `_onCancel()` method

**Add this method:**
```javascript
    /**
     * Handle save action
     * @private
     */
    _onSave() {
        logger.info('Saving grid editor layout');
        
        // Validate edge layout
        const validation = validateEdgeLayout(this._edgeLayout);
        if (!validation.valid) {
            logger.error(`Layout validation failed: ${validation.errors.join(', ')}`);
            this._showCenteredNotification('Invalid Layout', validation.errors[0]);
            return;
        }
        
        // Convert edge-based back to zone-based
        const zoneLayout = edgesToZones(this._edgeLayout);
        
        logger.debug(`Converted to ${zoneLayout.zones.length} zones`);
        
        // Hide editor
        this.hide();
        
        // Call save callback with zone-based layout
        if (this._onSaveCallback) {
            this._onSaveCallback(zoneLayout);
        }
    }
```

## Testing Steps

1. Start with Halves layout (2 regions split vertically at x=0.5)
2. Shift+Click on right region to split it horizontally at y=0.5
3. You now have 3 regions:
   - Region 0: Left half (full height)
   - Region 1: Top-right quarter
   - Region 2: Bottom-right quarter
4. Hover over the vertical edge v0 at x=0.5
5. Ctrl+Click to delete it
6. **Expected**: Edge deletes successfully, merging all 3 regions into 1
7. **Previous behavior**: Edge deletion blocked with "Cannot delete this edge" message

## Optional Enhancements (Not Critical)

### 4-Color Map Diagnostic

To help identify duplicate/overlapping regions visually, replace the region styling in `_createRegions()`:

```javascript
// Replace this:
actor.style = `
    background-color: rgba(28, 113, 216, 0.3);
    border: 3px solid rgb(28, 113, 216);
    border-radius: 4px;
`;

// With this:
const colors = [
    { bg: 'rgba(28, 113, 216, 0.3)', border: 'rgb(28, 113, 216)', name: 'Blue' },
    { bg: 'rgba(38, 162, 105, 0.3)', border: 'rgb(38, 162, 105)', name: 'Green' },
    { bg: 'rgba(192, 97, 203, 0.3)', border: 'rgb(192, 97, 203)', name: 'Purple' },
    { bg: 'rgba(230, 97, 0, 0.3)', border: 'rgb(230, 97, 0)', name: 'Orange' }
];
const colorScheme = colors[index % colors.length];

actor.style = `
    background-color: ${colorScheme.bg};
    border: 3px solid ${colorScheme.border};
    border-radius: 4px;
`;
```

### Enhanced Logging in `_refreshDisplay()`

Add detailed logging before the cleanup:

```javascript
_refreshDisplay() {
    logger.info('[REFRESH] Starting display refresh');
    logger.info(`[REFRESH] Current state: ${this._regionActors.length} region actors, ${this._edgeActors.length} edge actors`);
    logger.info(`[REFRESH] Data state: ${this._edgeLayout.regions.length} regions, ${this._edgeLayout.edges.length} edges`);
    
    // ... existing cleanup code ...
    
    logger.info(`[REFRESH] Cleanup complete: removed ${oldRegionCount} region actors, ${oldEdgeCount} edge actors`);
    logger.info(`[REFRESH] Creating new actors for ${this._edgeLayout.regions.length} regions, ${this._edgeLayout.edges.filter(e => !e.fixed).length} edges`);
    
    // ... recreate regions and edges ...
    
    logger.info(`[REFRESH] Created ${this._regionActors.length} new region actors, ${this._edgeActors.length} new edge actors`);
}
```

## Why This Fix Works

The key insight is that **overlap is a geometric property**, not an edge ID property:

- **Old logic**: "Do these regions share the exact same edge objects?"
- **New logic**: "Do these regions occupy overlapping space in the perpendicular direction?"

For TUTORIAL-STEP-2A:
- Region 0 spans 0.0→1.0
- Region 1 spans 0.0→0.5
- Region 2 spans 0.5→1.0

Position-based overlap correctly identifies:
- Region 0 overlaps with Region 1: `0.0 < 0.5 AND 1.0 > 0.0` ✓
- Region 0 overlaps with Region 2: `0.0 < 1.0 AND 1.0 > 0.5` ✓

This allows the edge deletion to proceed, and the existing merge logic in `_deleteEdge()` handles the actual merging correctly.

## Related Tutorial Steps

This fix enables:
- **TUTORIAL-STEP-2A**: Delete v0 when left has 1 full-height region, right has 2 half-height regions
- **TUTORIAL-STEP-2B**: Similar case with horizontal edges
- **TUTORIAL-STEP-3**: May require additional colinear edge detection (future work)

## Implementation Notes

### Phase 1: Overlap Detection Fix
- Fixed `_canDeleteEdge()` to use position-based overlap instead of exact edge ID matching
- The overlap formula works symmetrically for both vertical and horizontal edges
- Added missing `_onSave()` method

### Phase 2: Symmetric Merge Strategy
- **Problem**: Initial merge implementation always processed RIGHT/BOTTOM regions, causing asymmetric behavior
  - Vertical edge (1 left, 2 right) → 2 regions ✓
  - Horizontal edge (3 top, 1 bottom) → 1 region ✗
  
- **Solution**: Process whichever side has MORE regions (uses `>=` for ties)
  - Preserves maximum granularity by keeping subdivisions intact
  - Works identically for vertical/horizontal and left/right/top/bottom orientations

### Merge Behavior
- Each primary region preserves its perpendicular bounds, only extends in parallel direction
- With unequal region sizes (e.g., mismatched horizontal splits), merge still proceeds
- Result is always valid and understandable, even if not strictly "reversing" the split
- Users can experiment freely with Cancel available to undo

### Blocked Edge Deletion Cases
In practice, edge deletion is blocked ONLY for:
1. **Screen boundary edges** (left, right, top, bottom) - these are fixed
2. **Edges with regions on only one side** (impossible to create via UI)

All other internal edges can be deleted. The overlap check ensures valid merges but doesn't block normal operations.
