# Technical Specifications

Detailed technical documentation for Zoned's core systems.

## Zone Data Structure

### Zone Object

A zone defines a rectangular window target area using percentages (0.0-1.0).

```javascript
{
    name: string,    // Display name: "Left Half", "Main Area"
    x: number,       // X position (0.0 = left edge)
    y: number,       // Y position (0.0 = top edge)
    w: number,       // Width (1.0 = full screen width)
    h: number        // Height (1.0 = full screen height)
}
```

**Coordinate System:**
```
(0,0) ──────────────────→ x (1.0)
  │
  │    ┌────────────────┐
  │    │                │
  │    │  Screen Area   │
  │    │                │
  │    └────────────────┘
  ↓
  y
(1.0)
```

**Examples:**

```javascript
// Left half
{ name: "Left", x: 0, y: 0, w: 0.5, h: 1 }

// Top-right quarter
{ name: "Top-Right", x: 0.5, y: 0, w: 0.5, h: 0.5 }

// Center 60%
{ name: "Center", x: 0.2, y: 0, w: 0.6, h: 1 }
```

### Layout Object

A layout is a complete arrangement of zones.

```javascript
{
    id: string,           // Unique identifier
    name: string,         // Display name
    zones: Zone[],        // Array of zone definitions
    isTemplate?: boolean  // True for built-in templates
}
```

**Example:**
```javascript
{
    id: "focus",
    name: "Focus",
    zones: [
        { name: "Main", x: 0, y: 0, w: 0.7, h: 1 },
        { name: "Side", x: 0.7, y: 0, w: 0.3, h: 1 }
    ]
}
```

### Validation Rules

1. **Required fields:** `id`, `name`, `zones`
2. **ID format:** Alphanumeric + underscores
3. **Zone count:** At least 1, recommended max 10
4. **Value ranges:** 0.0 ≤ x, y < 1.0; 0.0 < w, h ≤ 1.0
5. **Bounds:** x + w ≤ 1.0, y + h ≤ 1.0

---

## Edge-Based Layout System

The ZoneEditor uses an edge-based representation for layout editing. This enables intuitive split/merge operations and drag-to-resize.

### Why Edge-Based?

**Zone-based (simple):** Each zone stores its own x, y, w, h.
- Problem: Resizing one zone requires manually updating adjacent zones.

**Edge-based:** Zones reference shared edges.
- Benefit: Move an edge, all adjacent zones update automatically.

### Edge Object

```javascript
{
    id: string,        // "v0", "h1", "left", "right", "top", "bottom"
    type: string,      // "vertical" or "horizontal"
    position: number,  // 0.0-1.0 (X for vertical, Y for horizontal)
    start: number,     // Where edge segment starts
    length: number,    // Length of edge segment
    fixed: boolean     // True for screen boundaries
}
```

### Region Object

Regions reference edges by ID:

```javascript
{
    name: string,      // Display name
    left: string,      // Edge ID for left boundary
    right: string,     // Edge ID for right boundary
    top: string,       // Edge ID for top boundary
    bottom: string     // Edge ID for bottom boundary
}
```

### Edge Naming Convention

- **Vertical edges:** `v0`, `v1`, `v2`... numbered left-to-right
- **Horizontal edges:** `h0`, `h1`, `h2`... numbered top-to-bottom
- **Boundary edges:** `left`, `right`, `top`, `bottom` (fixed)

### Example: 2×2 Grid

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
- `v0`: vertical at x=0.5, spans y=[0.0, 1.0]
- `h0`: horizontal at y=0.5, spans x=[0.0, 0.5]
- `h1`: horizontal at y=0.5, spans x=[0.5, 1.0]

**Regions:**
1. left=left, right=v0, top=top, bottom=h0
2. left=v0, right=right, top=top, bottom=h1
3. left=left, right=v0, top=h0, bottom=bottom
4. left=v0, right=right, top=h1, bottom=bottom

### Operations

#### Split Zone

**Horizontal split** (click zone):
1. Calculate midpoint: `mid = (left.position + right.position) / 2`
2. Create new vertical edge at midpoint
3. Original zone becomes two zones referencing new edge

**Vertical split** (Shift+click):
1. Calculate midpoint: `mid = (top.position + bottom.position) / 2`
2. Create new horizontal edge at midpoint
3. Original zone becomes two zones referencing new edge

#### Drag Edge

1. User drags edge to new position
2. Enforce minimum zone size (10%)
3. Update `edge.position`
4. All zones referencing this edge update automatically

#### Delete Edge (Ctrl+click)

1. Find all regions referencing this edge
2. Verify deletion is safe (boundaries align)
3. Merge adjacent regions
4. Remove edge

**Deletion blocked when:**
- Edge is a fixed boundary
- Adjacent regions have misaligned perpendicular boundaries
- Would create invalid layout

### Zone ↔ Edge Conversion

The `layoutConverter.js` utility handles bidirectional conversion:

```javascript
import { zonesToEdges, edgesToZones } from './utils/layoutConverter.js';

// Load layout from storage (zone format)
const layout = loadLayout();

// Convert to edges for editing
const { edges, regions } = zonesToEdges(layout.zones);

// ... user edits layout ...

// Convert back to zones for storage
const newZones = edgesToZones(edges, regions);
```

---

## Per-Space Layouts

The SpatialStateManager enables different layouts for different workspace×monitor combinations.

### Space Key Format

A "space" is identified by: `"connector:workspaceIndex"`

Examples:
- `"DP-1:0"` - Monitor DP-1, workspace 0
- `"eDP-1:2"` - Built-in display, workspace 2
- `"HDMI-1:0"` - HDMI monitor, workspace 0

### State Structure

```javascript
// Stored in GSettings as JSON string
{
    "DP-1:0": {
        "layoutId": "focus",
        "zoneIndex": 0
    },
    "DP-1:1": {
        "layoutId": "split",
        "zoneIndex": 1
    },
    "eDP-1:0": {
        "layoutId": "quarters",
        "zoneIndex": 2
    }
}
```

### SpatialStateManager API

```javascript
class SpatialStateManager {
    // Get connector name for a monitor index
    getMonitorConnector(monitorIndex)
    
    // Build space key from connector and workspace
    makeKey(connector, workspaceIndex)
    
    // Get key for current workspace/monitor
    getCurrentSpaceKey()
    
    // Get state for a space
    getState(spaceKey)
    
    // Set state for a space
    setState(spaceKey, state)
    
    // Clear state for a space (falls back to global)
    clearState(spaceKey)
}
```

### Integration Points

**LayoutManager:**
```javascript
// Get layout for specific space
getLayoutForSpace(spaceKey)

// Set layout for specific space  
setLayoutForSpace(spaceKey, layoutId)

// Zone cycling is space-aware
cycleZone(direction, spaceKey)
```

**KeybindingManager:**
```javascript
// Get space context from focused window
_getSpaceKeyFromWindow(window)

// Zone cycling uses window's space
_onCycleZone(direction) {
    const window = this._windowManager.getFocusedWindow();
    const spaceKey = this._getSpaceKeyFromWindow(window);
    this._layoutManager.cycleZone(direction, spaceKey);
}
```

**Workspace Switching:**
```javascript
// In extension.js enable()
global.workspaceManager.connect('workspace-switched', (manager, from, to) => {
    if (this._settings.get_boolean('use-per-workspace-layouts')) {
        const spaceKey = this._spatialStateManager.getCurrentSpaceKey();
        const layout = this._layoutManager.getLayoutForSpace(spaceKey);
        // Apply layout, show notification
    }
});
```

### Global vs Per-Space Mode

**Global mode** (default):
- `use-per-workspace-layouts: false`
- Single layout applies everywhere
- Zone index is global

**Per-space mode:**
- `use-per-workspace-layouts: true`
- Each space can have different layout
- Zone index tracked per-space
- Workspace switch triggers layout change

### Quick Layout Shortcuts

`Super+Ctrl+Alt+1-9` apply layouts by position:

```javascript
// Quick layout 1 = first layout in list
// Applies to focused window's space (if per-space enabled)
// Or globally (if per-space disabled)
```

---

## Layout Picker Tier System

The LayoutSwitcher uses resolution-based sizing tiers for responsive display across different screen sizes and scale factors.

### Why Tiers?

Rather than percentage-based scaling (which can produce awkward intermediate sizes), the tier system uses discrete sizing profiles. Each tier provides pre-calculated values for card dimensions, spacing, and UI element sizes that are guaranteed to work well together.

**Benefits:**
- Consistent visual proportions at any resolution
- 5 layout cards always fit per row
- 2 rows of custom layouts visible without scrolling
- Dialog occupies appropriate screen percentage (50-67%)
- Simple to debug and reason about

### How It Works

**Logical height** = Physical height ÷ Scale factor

The tier is auto-selected based on logical screen height. For example:
- 1024×768 display → SMALL tier
- 1080p at 100% scaling → MEDIUM tier
- 4K at 200% scaling → MEDIUM tier
- 4K at 100% scaling → XLARGE tier

### Available Tiers

- **SMALL** - Small screens and high scaling scenarios
- **MEDIUM** - Most common: 1080p, 1440p with moderate scaling
- **LARGE** - Larger displays with moderate/no scaling
- **XLARGE** - 4K+ displays at low/no scaling

See `extension/ui/layoutSwitcher/tierConfig.js` for exact thresholds and dimensions.

### Debug Features

For development, the tier system provides debugging tools:
- **GSettings key:** `debug-force-tier` (0=auto, 1-4=forced tier)
- **Ctrl+T** in picker: Cycle through tiers
- **Ctrl+D**: Show debug rectangles with dimension info
- **Ctrl+O**: Toggle overlay mode

---

## Layout File Format

### Storage Location

`~/.config/zoned/layouts.json`

### File Structure

```json
{
    "layouts": [
        {
            "id": "custom_1702656000000",
            "name": "My Custom Layout",
            "zones": [
                {
                    "name": "Main",
                    "x": 0,
                    "y": 0,
                    "w": 0.6,
                    "h": 1
                },
                {
                    "name": "Top Right",
                    "x": 0.6,
                    "y": 0,
                    "w": 0.4,
                    "h": 0.5
                },
                {
                    "name": "Bottom Right",
                    "x": 0.6,
                    "y": 0.5,
                    "w": 0.4,
                    "h": 0.5
                }
            ]
        }
    ]
}
```

### ID Generation

Custom layout IDs use timestamp-based format:

```javascript
const id = `custom_${Date.now()}`;
// Example: "custom_1702656000000"
```

### Template vs Custom

Templates are loaded from `extension/config/default-layouts.json` and have `isTemplate: true`. They cannot be modified or deleted.

Custom layouts are stored in user config and can be freely edited.

---

## GSettings Schema Reference

### Core Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `current-layout-id` | string | "split" | Active layout ID |
| `current-zone-index` | int | 0 | Active zone (0-based) |
| `last-selected-layout` | string | "" | Fallback layout |
| `show-notifications` | bool | true | Show zone change OSD |

### Per-Space Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `use-per-workspace-layouts` | bool | false | Enable per-space mode |
| `spatial-state-map` | string | "{}" | JSON map of space→state |

### Appearance

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `layout-picker-size` | double | 0.8 | Picker dialog size (0.3-0.95) |
| `debug-force-tier` | int | 0 | Force picker tier (0=auto) |
| `notification-style` | string | "osd" | Notification appearance |

### Keybindings

| Key | Type | Default |
|-----|------|---------|
| `show-layout-picker` | as | `['<Super>grave']` |
| `cycle-zone-left` | as | `['<Super>Left']` |
| `cycle-zone-right` | as | `['<Super>Right']` |
| `maximize-window` | as | `['<Super>Up']` |
| `minimize-window` | as | `['<Super>Down']` |
| `cycle-zone-alt-left` | as | `['<Super><Alt>Left']` |
| `cycle-zone-alt-right` | as | `['<Super><Alt>Right']` |
| `quick-layout-1` through `quick-layout-9` | as | `['<Super><Ctrl><Alt>1']` etc. |

---

## Related Documentation

- [architecture.md](architecture.md) - Component overview
- [keybindings.md](keybindings.md) - Complete keybinding reference
- [coding-patterns.md](coding-patterns.md) - Code style guide
