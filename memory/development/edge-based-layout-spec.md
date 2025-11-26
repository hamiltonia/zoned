# Edge-Based Layout Specification

**Version:** 1.0  
**Date:** 2025-11-25  
**Status:** Draft

## Overview

This document defines the edge-based layout system for the Zoned grid editor. Layouts are represented as a set of edges and regions that reference those edges, rather than storing zones with absolute coordinates.

## Edge Naming Convention

For clear communication, edges use a **spatial naming system**:

- **Vertical edges** (type="vertical"): Named `v0`, `v1`, `v2`... numbered **left-to-right**
- **Horizontal edges** (type="horizontal"): Named `h0`, `h1`, `h2`... numbered **top-to-bottom**
- **Boundary edges**: Always named `left`, `right`, `top`, `bottom` (fixed)
- **Edge segments**: When multiple segments exist at same position, suffixes may be added but typically each segment gets its own ID

### Edge Naming Tutorial

Let's build up a layout step-by-step to understand edge naming:

#### TUTORIAL-STEP-0: Empty Workspace
```
┌───────────────────┐
│                   │
│         1         │  Only boundary edges exist:
│                   │  - left, right, top, bottom
└───────────────────┘
```

**Edges:** `left`, `right`, `top`, `bottom` (all fixed)  
**Regions:** 1 region spanning entire workspace

---

#### TUTORIAL-STEP-1: Add First Vertical Edge
```
┌─────────┬─────────┐
│    1    │    2    │  Add vertical edge at x=0.5
│         │         │  This becomes v0 (first vertical, leftmost)
│         │         │
└─────────┴─────────┘
```

**New Edge:** `v0` - vertical at x=0.5, from y=[0.0, 1.0]

**Regions:**
- Region 1: left=left, right=v0, top=top, bottom=bottom
- Region 2: left=v0, right=right, top=top, bottom=bottom

**Naming:** This is `v0` because it's the first vertical edge (and leftmost if others exist).

---

#### TUTORIAL-STEP-2A: Split Region 1 Vertically
```
┌─────────┬─────────┐
│    1    │    2    │  Split region 1 (top-left) vertically
├─────────┤         │  Creates h0 between regions 1 and 3
│    3    │         │
└─────────┴─────────┘
```

**New Edge:** 
- `h0` - horizontal at y=0.5, from x=[0.0, 0.5]

**Why this range?** h0 only spans the width of the original region 1 that was split.

**Regions:**
- Region 1: left=left, right=v0, top=top, bottom=h0 (top-left)
- Region 2: left=v0, right=right, top=top, bottom=bottom (entire right side)
- Region 3: left=left, right=v0, top=h0, bottom=bottom (bottom-left)

**Key Point:** h0 borders exactly 2 regions (1 and 3). Region 2 is unaffected.

---

#### TUTORIAL-STEP-2B: Split Region 2 Vertically  
```
┌─────────┬─────────┐
│    1    │    2    │  Now split region 2 (right side) vertically
├─────────┼─────────┤  Creates h1 between regions 2 and 4
│    3    │    4    │
└─────────┴─────────┘
```

**New Edge:**
- `h1` - horizontal at y=0.5, from x=[0.5, 1.0]

**Why separate edge?** h1 is created by splitting region 2, completely independent from h0.

**Final Regions:**
- Region 1: left=left, right=v0, top=top, bottom=h0
- Region 2: left=v0, right=right, top=top, bottom=h1
- Region 3: left=left, right=v0, top=h0, bottom=bottom
- Region 4: left=v0, right=right, top=h1, bottom=bottom

**Important:** h0 and h1 are **independent edges** at the same position. h0 borders regions 1 & 3. h1 borders regions 2 & 4.

**Naming:** `h0` before `h1` because h0 is to the left (created first spatially).

---

#### TUTORIAL-STEP-3: Bisect a Region
```
┌─────────┬────┬────┐
│    1    │ 2  │ 3  │  Add vertical edge at x=0.75 in top-right
│         │    │    │  This becomes v1 (second vertical, it's to the right of v0)
├─────────┴────┴────┤
│         4         │
└───────────────────┘
```

**New Edge:**
- `v1` - vertical at x=0.75, from y=[0.0, 0.5]

**Regions:**
- Region 1: left=left, right=v0, top=top, bottom=h0
- Region 2: left=v0, right=v1, top=top, bottom=h1
- Region 3: left=v1, right=right, top=top, bottom=h1
- Region 4: left=left, right=right, top=h0, bottom=bottom

**Naming:** `v1` because it's the second vertical edge, positioned to the right of v0.

**Note:** Region 4 references either h0 or h1 for its top (they're at same position). Convention: use the leftmost segment.

**Edge Deletion Status:**
- ✅ **v0**: Deletable (standard 2-region merge)
- ✅ **v1**: Deletable (borders 2 regions: 2 & 3)
- ✅ **h0 + h1**: Deletable as colinear group (see below)

**Colinear Edge Group:** h0 and h1 are both at y=0.5, forming a logical horizontal divider:
- h0 spans x=[0.0, 0.5], borders regions 1 (above) ↔ 4 (below)
- h1 spans x=[0.5, 1.0], borders regions 2, 3 (above) ↔ 4 (below)
- **Together** they form a complete boundary spanning the full width
- Deleting this group extends regions 1, 2, 3 all the way down to the bottom
- ✅ **Allowed:** Vertical edges align perfectly (v0 at x=0.5 on both sides)

---

#### TUTORIAL-STEP-4: Complex Layout with Undeletable Edges
```
┌─────────┬────┬────┐
│    1    │ 2  │ 3  │  Starting from TUTORIAL-STEP-3,
├─────┬───┴────┴────┤  split region 4 at x=0.25
│  4  │      5      │  Creates v2 (vertical edge)
└─────┴─────────────┘
```

**New Edge:**
- `v2` - vertical at x=0.25, from y=[0.5, 1.0]

**Regions:**
- Region 1: left=left, right=v0, top=top, bottom=h0
- Region 2: left=v0, right=v1, top=top, bottom=h1
- Region 3: left=v1, right=right, top=top, bottom=h1
- Region 4: left=left, right=v2, top=h0, bottom=bottom
- Region 5: left=v2, right=right, top=h0 (or h1?), bottom=bottom

**Edge Deletion Status:**
- ✅ **v0**: Deletable (borders regions 1 & 2)
- ✅ **v1**: Deletable (borders regions 2 & 3)
- ✅ **v2**: Deletable (borders regions 4 & 5)
- ❌ **h0 + h1 (colinear group)**: UNDELETABLE!

**Critical Problem - Misaligned Vertical Boundaries:**

The colinear edge group h0 + h1 at y=0.5 would normally be deletable, but:

**Above the divider (top half):**
- Vertical edges at: left (x=0.0), v0 (x=0.5), v1 (x=0.75), right (x=1.0)

**Below the divider (bottom half):**
- Vertical edges at: left (x=0.0), v2 (x=0.25), right (x=1.0)

**Conflict:** The vertical boundaries don't align!
- Region 1 extends to x=0.5 (bounded by v0)
- But below, region 4 only extends to x=0.25 (bounded by v2)
- If we delete h0+h1, where would region 1 extend to? It can't merge with both regions 4 and 5
- The vertical structure changes across the horizontal divider

**Why It's Blocked:**
- Deleting h0+h1 requires extending regions 1, 2, 3 downward
- But the vertical divisions below (at x=0.25) don't match those above (at x=0.5, 0.75)
- This creates structural ambiguity that cannot be resolved cleanly
- Algorithm detects: `!verticalEdgesAlign(aboveRegions, belowRegions)`

**User Experience:**
- Attempting to Ctrl+Click h0 or h1 shows: "Cannot delete: regions misaligned"
- These edges appear as dashed lines with different color
- User can delete v2 first to align the structure, then h0+h1 becomes deletable
- Or cancel and start over with a simpler layout

---

### Naming Rules Summary

1. **Vertical edges:** Number sequentially left-to-right (v0 is leftmost)
2. **Horizontal edges:** Number sequentially top-to-bottom (h0 is topmost)
3. **Segments:** Each edge segment at same position gets unique ID (h0, h1 both at y=0.5)
4. **Reading order:** For segments at same position, number left-to-right (horizontal) or top-to-bottom (vertical)

## Core Data Structures

### Edge

An edge represents a line segment that forms the boundary of one or more regions.

```javascript
{
  id: string,          // Unique identifier: "v0", "h1", "left", "right", "top", "bottom"
  type: string,        // "vertical" or "horizontal"
  position: number,    // 0.0-1.0: X coordinate for vertical, Y coordinate for horizontal
  start: number,       // 0.0-1.0: Where the edge segment starts (Y for vertical, X for horizontal)
  length: number,      // 0.0-1.0: Length of the edge segment
  fixed: boolean       // true for screen boundaries (left, right, top, bottom)
}
```

### Region

A region represents a rectangular zone defined by references to four edges.

```javascript
{
  name: string,        // Display name: "Zone 1", "Main", etc.
  left: string,        // Edge ID for left boundary
  right: string,       // Edge ID for right boundary
  top: string,         // Edge ID for top boundary
  bottom: string       // Edge ID for bottom boundary
}
```

### Layout

```javascript
{
  id: string,
  name: string,
  edges: Edge[],
  regions: Region[]
}
```

## Invariants

The following rules MUST always be true for a valid layout:

1. **Fixed Boundaries**: Layout must always have 4 fixed boundary edges:
   - `left`: vertical edge at position 0.0, start 0.0, length 1.0
   - `right`: vertical edge at position 1.0, start 0.0, length 1.0
   - `top`: horizontal edge at position 0.0, start 0.0, length 1.0
   - `bottom`: horizontal edge at position 1.0, start 0.0, length 1.0

2. **Valid Edge References**: Every region must reference exactly 4 valid edge IDs (left, right, top, bottom)

3. **Multi-Region Per Edge**: Non-boundary edges may be referenced by 2 or more regions.
   - Simple edges created by splitting a region border exactly 2 regions
   - Full-span edges (e.g., vertical edge from top to bottom) may border multiple stacked regions
   - This is valid and occurs naturally when creating grid layouts
   - Example: In a 2×2 grid, the central vertical edge borders all 4 regions (2 on each side)

4. **Edge Consistency**: For each region:
   - `left.type === "vertical"` and `right.type === "vertical"`
   - `top.type === "horizontal"` and `bottom.type === "horizontal"`
   - `left.position < right.position`
   - `top.position < bottom.position`

5. **No Region Overlap**: Regions must never overlap. Each point in screen space [0,1]×[0,1] should belong to exactly one region.

6. **Coverage**: The union of all regions must equal the full screen space [0,1]×[0,1]

## Reference Layouts

These named layouts serve as examples and can be referenced when discussing bugs.

### REF-2X2: Basic 2×2 Grid
```
┌─────────┬─────────┐
│    1    │    2    │
│         │         │
├─────────┼─────────┤
│    3    │    4    │
│         │         │
└─────────┴─────────┘
```

**Edges:**
- Boundaries: `left`, `right`, `top`, `bottom` (fixed)
- `v0`: vertical at x=0.5, from y=[0.0, 1.0]
- `h0`: horizontal at y=0.5, from x=[0.0, 0.5]
- `h1`: horizontal at y=0.5, from x=[0.5, 1.0]

**Regions:**
1. left=left, right=v0, top=top, bottom=h0
2. left=v0, right=right, top=top, bottom=h1
3. left=left, right=v0, top=h0, bottom=bottom
4. left=v0, right=right, top=h1, bottom=bottom

**Note:** `h0` and `h1` are separate edges at same position (y=0.5) but different ranges.

### REF-SPLIT-TR: 2×2 with Top-Right Split
```
┌─────────┬────┬────┐
│    1    │ 2  │ 3  │
│         │    │    │
├─────────┴────┴────┤
│         4         │
│                   │
└───────────────────┘
```

**Edges:**
- Boundaries: `left`, `right`, `top`, `bottom`
- `v0`: vertical at x=0.5, from y=[0.0, 1.0]
- `v1`: vertical at x=0.75, from y=[0.0, 0.5]
- `h0`: horizontal at y=0.5, from x=[0.0, 0.5]
- `h1`: horizontal at y=0.5, from x=[0.5, 1.0]

**Regions:**
1. left=left, right=v0, top=top, bottom=h0
2. left=v0, right=v1, top=top, bottom=h1
3. left=v1, right=right, top=top, bottom=h1
4. left=left, right=right, top=h0 (or h1), bottom=bottom

**Critical:** Region 4 spans full width. Should it reference h0 or h1 for its top edge?
Answer: Either works since they're at same position, but h0 is cleaner.

### REF-THIRDS: Three Columns
```
┌─────┬─────┬─────┐
│  1  │  2  │  3  │
│     │     │     │
│     │     │     │
│     │     │     │
└─────┴─────┴─────┘
```

**Edges:**
- Boundaries: `left`, `right`, `top`, `bottom`
- `v0`: vertical at x=0.333, from y=[0.0, 1.0]
- `v1`: vertical at x=0.667, from y=[0.0, 1.0]

**Regions:**
1. left=left, right=v0, top=top, bottom=bottom
2. left=v0, right=v1, top=top, bottom=bottom
3. left=v1, right=right, top=top, bottom=bottom

### REF-L-SHAPE: L-Shaped Region
```
┌───────────┬───────┐
│     1     │   2   │
│           │       │
├───────┬───┴───────┤
│   3   │     4     │
│       │           │
└───────┴───────────┘
```

**Edges:**
- Boundaries: `left`, `right`, `top`, `bottom`
- `v0`: vertical at x=0.5, from y=[0.0, 0.5]
- `v1`: vertical at x=0.66, from y=[0.0, 1.0]
- `h0`: horizontal at y=0.5, from x=[0.0, 0.5]
- `h1`: horizontal at y=0.5, from x=[0.5, 1.0]

**Regions:**
1. left=left, right=v1, top=top, bottom=h0
2. left=v1, right=right, top=top, bottom=h1
3. left=left, right=v0, top=h0, bottom=bottom
4. left=v0, right=right, top=h1, bottom=bottom

**Note:** Region 4 is L-shaped conceptually, but represents a rectangle from (0.5, 0.5) to (1.0, 1.0).

### REF-FOCUS: Focus Layout (70/30)
```
┌──────────────┬─────┐
│              │     │
│      1       │  2  │
│              │     │
│              │     │
└──────────────┴─────┘
```

**Edges:**
- Boundaries: `left`, `right`, `top`, `bottom`
- `v0`: vertical at x=0.7, from y=[0.0, 1.0]

**Regions:**
1. left=left, right=v0, top=top, bottom=bottom
2. left=v0, right=right, top=top, bottom=bottom

## Operations

### Split Region Horizontally (Left/Right)

**Operation:** Divide a region into two by adding a vertical edge.

**Preconditions:**
- Region exists and is valid
- Region has sufficient width (> 2 × MIN_REGION_SIZE)

**Steps:**
1. Get region's left, right, top, bottom edges
2. Calculate midpoint: `mid = (left.position + right.position) / 2`
3. Create new vertical edge:
   - `id`: generate unique (e.g., `v{timestamp}`)
   - `type`: "vertical"
   - `position`: mid
   - `start`: top.position
   - `length`: bottom.position - top.position
   - `fixed`: false
4. Add edge to layout.edges
5. Create two new regions:
   - Left region: left=region.left, right=newEdge.id, top=region.top, bottom=region.bottom
   - Right region: left=newEdge.id, right=region.right, top=region.top, bottom=region.bottom
6. Remove original region
7. Add two new regions

**Postconditions:**
- New edge is referenced by exactly 2 regions
- All invariants maintained

### Split Region Vertically (Top/Bottom)

**Operation:** Divide a region into two by adding a horizontal edge.

**Preconditions:**
- Region exists and is valid
- Region has sufficient height (> 2 × MIN_REGION_SIZE)

**Steps:**
1. Get region's left, right, top, bottom edges
2. Calculate midpoint: `mid = (top.position + bottom.position) / 2`
3. Create new horizontal edge:
   - `id`: generate unique
   - `type`: "horizontal"
   - `position`: mid
   - `start`: left.position
   - `length`: right.position - left.position
   - `fixed`: false
4. Add edge to layout.edges
5. Create two new regions:
   - Top region: left=region.left, right=region.right, top=region.top, bottom=newEdge.id
   - Bottom region: left=region.left, right=region.right, top=newEdge.id, bottom=region.bottom
6. Remove original region
7. Add two new regions

**Postconditions:**
- New edge is referenced by exactly 2 regions
- All invariants maintained

### Drag Edge

**Operation:** Move an edge to a new position, affecting all regions that reference it.

**Preconditions:**
- Edge is not fixed (non-boundary)
- New position respects MIN_REGION_SIZE constraints for all affected regions

**Steps:**
1. Calculate constraints:
   - For each region referencing this edge, determine min/max position
   - Min: ensure region doesn't shrink below MIN_REGION_SIZE
   - Max: ensure region doesn't shrink below MIN_REGION_SIZE
2. Clamp new position to [min, max]
3. Update edge.position
4. All regions automatically update (they reference the edge)

**Postconditions:**
- All affected regions maintain minimum size
- All invariants maintained

**Critical:** This is the beauty of edge-based! Just update edge.position and all regions update automatically.

### Delete Edge (Recommended Approach)

**Operation:** Remove an edge, causing regions on both sides to merge.

**Preconditions:**
- Edge is not fixed (non-boundary)
- At least 2 regions exist

**Steps:**
1. Find all regions referencing this edge
2. Group regions by which side of edge they're on:
   - For vertical edge: left regions (those with `right === edgeId`), right regions (those with `left === edgeId`)
   - For horizontal edge: top regions (those with `bottom === edgeId`), bottom regions (those with `top === edgeId`)
3. Merge each group into one region:
   - Left/Top group: Create region with leftmost/topmost bounds
   - Right/Bottom group: Create region with rightmost/bottommost bounds
4. Remove the edge from layout.edges
5. Remove all old regions from layout.regions
6. Add merged regions
7. Clean up any other orphaned edges

**Example - Delete v0 from REF-2X2:**
```
Before:                After:
┌─────────┬─────────┐  ┌───────────────────┐
│    1    │    2    │  │         1         │
├─────────┼─────────┤  ├───────────────────┤
│    3    │    4    │  │         2         │
└─────────┴─────────┘  └───────────────────┘

Regions 1 & 3 merge (both have right=v0)
Regions 2 & 4 merge (both have left=v0)
```

**Example - Delete h0 from REF-2X2:**
```
Before:                After:
┌─────────┬─────────┐  ┌─────────┬─────────┐
│    1    │    2    │  │    1    │    2    │
├─────────┼─────────┤  │         ├─────────┤
│    3    │    4    │  │         │    3    │
└─────────┴─────────┘  └─────────┴─────────┘

Regions 1 & 3 merge (both have bottom=h0, left side)
Regions 2 & 4 not affected (reference h1, not h0)
```

**Postconditions:**
- Edge removed
- Regions on each side of edge merged
- All invariants maintained
- No ambiguity about which regions merge

**Benefits:**
- User explicitly chooses what to merge (by selecting which edge to delete)
- Predictable behavior
- Simpler algorithm
- Matches mental model of "removing a divider"

**UI:** Ctrl+Click on **edge** to delete (not region)

### Delete Edge Safety Check

**Important:** Not all edges can be safely deleted. Before allowing deletion, the system must verify that all affected regions can form valid merged results.

#### Colinear Edge Groups

Multiple edge segments at the same position form a **colinear edge group** that should be treated as a single logical divider:

**Example:**
```
┌─────────┬────┬────┐
│    1    │ 2  │ 3  │  h0: x=[0.0, 0.5], y=0.5
├─────────┴────┴────┤  h1: x=[0.5, 1.0], y=0.5
│         4         │  Together: complete horizontal divider
└───────────────────┘
```

**Detection:** When user clicks to delete an edge, check if other edges exist at the same position:

```javascript
function getColinearEdgeGroup(edge) {
    return edges.filter(e => 
        e.type === edge.type && 
        e.position === edge.position &&
        !e.fixed
    );
}
```

**Deletion:** All colinear edges are deleted together atomically.

#### Deletion Constraints

An edge or edge group **CAN** be deleted if:
- Single edge borders exactly 2 regions (simple case), OR
- Colinear edge group borders regions with **aligned boundaries**

An edge or edge group **CANNOT** be deleted if:
- It's a fixed boundary edge
- Colinear group has **misaligned vertical/horizontal boundaries** on opposite sides

#### Algorithm

```javascript
canDeleteEdge(edgeId) {
    const edge = findEdge(edgeId);
    if (edge.fixed) return false;  // Never delete boundaries
    
    // Find colinear edge group
    const colinearGroup = getColinearEdgeGroup(edge);
    
    if (colinearGroup.length === 1) {
        // Single edge: simple 2-region check
        const regions = findRegionsReferencingEdge(edge);
        return regions.length === 2;
    } else {
        // Multiple colinear edges: check boundary alignment
        return canDeleteColinearGroup(colinearGroup);
    }
}

canDeleteColinearGroup(edgeGroup) {
    // Partition regions on either side of the edge group
    const { aboveRegions, belowRegions } = partitionRegionsByEdgeGroup(edgeGroup);
    
    // Get vertical boundaries (for horizontal edge group) or
    // horizontal boundaries (for vertical edge group)
    if (edgeGroup[0].type === "horizontal") {
        const aboveVEdges = getVerticalBoundariesOfRegions(aboveRegions);
        const belowVEdges = getVerticalBoundariesOfRegions(belowRegions);
        
        // Check if vertical edges align across the divider
        return verticalEdgesAlign(aboveVEdges, belowVEdges);
    } else {
        const leftHEdges = getHorizontalBoundariesOfRegions(leftRegions);
        const rightHEdges = getHorizontalBoundariesOfRegions(rightRegions);
        
        // Check if horizontal edges align across the divider
        return horizontalEdgesAlign(leftHEdges, rightHEdges);
    }
}

verticalEdgesAlign(edges1, edges2) {
    // Extract unique x-positions from both sets
    const positions1 = [...new Set(edges1.map(e => e.position))].sort();
    const positions2 = [...new Set(edges2.map(e => e.position))].sort();
    
    // They align if they have the same set of x-positions
    if (positions1.length !== positions2.length) return false;
    
    return positions1.every((pos, i) => 
        Math.abs(pos - positions2[i]) < 0.001  // Floating point tolerance
    );
}
```

**Examples:**

✅ **TUTORIAL-STEP-3** (deletable):
- h0 + h1 at y=0.5
- Above: regions have verticals at x=[0, 0.5, 0.75, 1.0]
- Below: regions have verticals at x=[0, 0.5, 0.75, 1.0] (same as above, from inherited v0)
- Actually, below has NO internal verticals, only boundaries [0, 1.0]
- Wait, need to reconsider this...

Actually, for STEP-3:
- Above: v0 (x=0.5), v1 (x=0.75) 
- Below: None (region 4 spans full width)
- This is a special case: **full-width merge is always allowed**

✅ **TUTORIAL-STEP-3** (revised check):
- Below has single region spanning full width → always allows merge
- Check: `belowRegions.length === 1 && belowRegions[0] spans full width`

❌ **TUTORIAL-STEP-4** (blocked):
- h0 + h1 at y=0.5
- Above: verticals at x=[0.5, 0.75]
- Below: verticals at x=[0.25] 
- Misaligned! → Cannot delete

#### Visual Feedback

- **Deletable edges**: Solid white line, 30% opacity → 70% on hover
  - If part of colinear group: all segments highlight together
- **Undeletable edges**: Dashed red/orange line, 20% opacity, no delete interaction
- **Hover tooltip**: 
  - Deletable: "Delete horizontal edge at 50% (2 segments)"
  - Blocked: "Cannot delete: regions misaligned"

#### User Experience

- Clicking any edge in a colinear group deletes the entire group
- All segments highlight together on hover
- Most common layouts (2×2, 3 columns, etc.) have all deletable edges
- Complex misaligned layouts correctly block deletion with clear feedback

---

### Delete Region (Alternative - Not Recommended)

**Operation:** Remove a region by merging it with an adjacent region.

**Issue:** Ambiguous - which adjacent region should it merge with? The "Delete Edge" approach above is clearer.

**Status:** Superseded by "Delete Edge" operation above.

## Known Problem Scenarios

### PROBLEM-1: Dragging in REF-SPLIT-TR ✅ RESOLVED

**Scenario:** In REF-SPLIT-TR layout, dragging the horizontal edge between regions 2 and 4.

**Original Problem:** Edge `h1` only spans x=[0.5, 1.0], so regions 2 and 3 reference it, but region 4 references h0.
Dragging h1 only affects regions 2 and 3, not region 4.

**Resolution:** With the "2-region per edge" invariant, this behavior is now CORRECT.
- h0 borders regions 1 and 4 (left side)
- h1 borders regions 2 and 4 (right side after it's split)
- When you drag h0, it affects only regions 1 and 4
- When you drag h1, it affects only regions 2 and 4
- This is the expected behavior! Edges are independent.

**Key Insight:** The user's expectation was wrong. In REF-SPLIT-TR, dragging h1 should NOT affect all three regions. Each edge controls exactly 2 regions.

**Status:** RESOLVED - Not a bug, correct behavior by design.

### PROBLEM-2: Split Creates Overlapping Edge Segments

**Scenario:** Start with REF-2X2, split region 2 vertically (top/bottom).

**Before split:**
- h1: horizontal at y=0.5, from x=[0.5, 1.0]

**After split:**
- New edge `h2`: horizontal at y=0.75, from x=[0.5, 1.0]
- h1 still exists

**Problem:** Now there are two edge segments in the same column at different heights. This is correct.

But what if we split region 1 vertically at y=0.75?
- New edge `h3`: horizontal at y=0.75, from x=[0.0, 0.5]

Now we have `h2` and `h3` both at y=0.75 but in different columns. Should they be merged?

**Decision Needed:** When do adjacent edge segments get merged?

### PROBLEM-3: Delete Region Creates Gap

**Scenario:** In REF-SPLIT-TR, delete region 2.

**Before:**
- Regions: 1, 2, 3, 4
- Region 2: left=v0, right=v1, top=top, bottom=h1

**After simple merge with adjacent region 3:**
- Merged 2+3: left=v0, right=right, top=top, bottom=h1
- But region 1 is below it: left=left, right=v0, top=top, bottom=h0
- And region 4 is below both: left=left, right=right, top=h0, bottom=bottom

**Problem:** Merged region 2+3 and region 1 are both at top, creating a weird layout.

**Question:** Should delete operation be smarter about which region to merge with?

## Open Questions

### Resolved:

✅ **Edge Segment Merging:** NO - edges are never merged. Each split creates one new edge bordering exactly 2 regions.

✅ **Multi-Edge Regions:** Allowed - regions may reference edges at same position as long as each region has exactly 4 edges.

✅ **Delete Strategy:** Use "Delete Edge" operation. User selects which edge to delete, with safety checks.

✅ **Edge Coupling:** NO - edges at same position are independent. Dragging one does not affect others.

✅ **Deletion Constraints:** Edges can be deleted only if all affected regions can merge cleanly. Complex boundaries create undeletable edges (see TUTORIAL-STEP-4).

### Still Open:

1. **Edge Naming in Implementation:** Should we use spatial naming (v0, v1...) in code, or auto-generated IDs with spatial mapping in UI?
   - **Recommendation:** Use timestamp-based IDs internally (v{timestamp}), document spatial naming for discussion only

2. **Validation Strictness:** Should we prevent creating certain valid-but-unusual layouts, or allow anything that meets invariants?
   - **Recommendation:** Allow all valid layouts, use visual feedback for undeletable edges

## Implementation Status

- [x] Basic edge-based data structure
- [x] Zone-to-edge conversion
- [x] Edge-to-zone conversion
- [x] Split operations (horizontal and vertical)
- [x] Delete/merge operation (edge-based deletion with safety checks)
- [x] Edge dragging with real-time bounds updates
- [x] Edge bounds recalculation for perpendicular edges
- [x] Visual polish: transparent edge handles with hover states
- [x] 4-color map diagnostic mode (optional, default: system accent color)
- [ ] Comprehensive validation (basic validation implemented)

### Recent Improvements (2025-11-26)

**Bug Fix: Edge Bounds Update During Drag**
- Fixed issue where perpendicular edge bounds weren't updating in real-time during drag operations
- Now directly updates perpendicular edge start/length during `_onEdgeDragMotion()`
- Ensures visual feedback is accurate and drag handles match actual region extent

**Visual Polish: Transparent Edge Handles**
- Edge line actors now default to `transparent` instead of `rgba(255, 255, 255, 0.2)`
- Edges only become visible on hover (40% white opacity)
- Eliminates visual clutter and unprofessional transparency overlap at edge intersections
- Maintains 30px-wide hit targets for easy mouse interaction
- Provides cleaner, more professional interface while preserving full functionality

## Next Steps

1. Decide on edge segment merging strategy
2. Resolve multi-edge region issue (PROBLEM-1)
3. Refine delete/merge operation
4. Implement comprehensive validation
5. Add unit tests for all operations
