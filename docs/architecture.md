# Zoned Architecture

A GNOME Shell extension for FancyZones-style window management.

## Overview

Zoned enables layout-based window management with keyboard-driven zone cycling. Users define layouts (arrangements of zones), and windows can be snapped to zones via keyboard shortcuts or drag-and-drop.

```
┌─────────────────────────────────────────────────────────────┐
│                    GNOME Shell Extension                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐                 │
│  │  LayoutManager  │◄──►│  WindowManager  │                 │
│  │  (state, zones) │    │  (positioning)  │                 │
│  └────────┬────────┘    └─────────────────┘                 │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                 │
│  │ SpatialState    │    │  Keybinding     │                 │
│  │ Manager         │    │  Manager        │                 │
│  │ (per-space)     │    │  (shortcuts)    │                 │
│  └─────────────────┘    └─────────────────┘                 │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    UI Components                        ││
│  │  ┌──────────────┐ ┌───────────────┐ ┌────────────────┐  ││
│  │  │LayoutSwitcher│ │  ZoneEditor   │ │ PanelIndicator │  ││
│  │  │ (picker)     │ │  (full-screen)│ │ (top bar)      │  ││
│  │  └──────────────┘ └───────────────┘ └────────────────┘  ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐                 │
│  │    GSettings    │    │ ~/.config/zoned │                 │
│  │    (prefs)      │    │ (custom layouts)│                 │
│  └─────────────────┘    └─────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### LayoutManager (`layoutManager.js`)

Central state manager for layouts and zones.

**Responsibilities:**
- Load default and custom layouts
- Track current layout and zone index
- Manage zone cycling (next/previous)
- Persist state to GSettings
- Coordinate with SpatialStateManager for per-space layouts

**Key Methods:**
```javascript
getCurrentLayout()           // Get active layout object
getCurrentZone()             // Get active zone in current layout
setLayout(layoutId)          // Switch to a layout
cycleZone(direction)         // +1 or -1 to move through zones
saveLayout(layout)           // Persist custom layout
deleteLayout(layoutId)       // Remove custom layout
```

### WindowManager (`windowManager.js`)

Handles window positioning using Meta.Window API.

**Responsibilities:**
- Calculate window frames from zone percentages
- Position windows using `move_resize_frame()`
- Handle multi-monitor scenarios
- Minimize/maximize operations

**Key Methods:**
```javascript
moveWindowToZone(window, zone)   // Position window in zone
getFocusedWindow()               // Get current active window
minimizeWindow(window)           // Minimize
maximizeWindow(window)           // Toggle maximize
```

### KeybindingManager (`keybindingManager.js`)

Registers and handles keyboard shortcuts.

**Default Keybindings:**
| Shortcut | Action |
|----------|--------|
| `Super+Left` | Cycle to previous zone |
| `Super+Right` | Cycle to next zone |
| `Super+`` | Open layout switcher |
| `Super+Up` | Maximize/restore window |
| `Super+Down` | Minimize window |
| `Super+Alt+Left/Right` | Cycle zones (alternative) |
| `Super+Ctrl+Alt+1-9` | Quick layout switch |

### SpatialStateManager (`spatialStateManager.js`)

Manages per-workspace, per-monitor layout state.

**Concept:** A "space" is a unique combination of workspace index and monitor connector (e.g., `"DP-1:0"` = monitor DP-1, workspace 0).

**When enabled:**
- Each space can have its own layout
- Layout persists when switching workspaces
- Zone index tracked per-space

**When disabled (default):**
- One global layout applies everywhere

### TemplateManager (`templateManager.js`)

Provides built-in layout templates.

**Built-in Templates:**
- Halves (50/50)
- Thirds (33/33/33)
- Quarters (2×2 grid)
- Focus (70/30)
- Priority Grid
- And more...

## UI Components

### LayoutSwitcher (`ui/layoutSwitcher.js`)

Modal grid of layout cards for quick selection.

**Features:**
- Cairo-rendered zone previews
- Keyboard navigation (arrows, 1-9 for quick select)
- Shows both templates and custom layouts
- Tier-based sizing for different screen resolutions

**Files:**
- `ui/layoutSwitcher.js` - Main component
- `ui/layoutSwitcher/cardFactory.js` - Card rendering
- `ui/layoutSwitcher/tierConfig.js` - Responsive sizing
- `ui/layoutSwitcher/topBar.js` - Workspace thumbnails

### ZoneEditor (`ui/zoneEditor.js`)

Full-screen layout editor using edge-based system.

**Features:**
- Click zone to split (horizontal)
- Shift+click to split vertical
- Drag edges to resize
- Ctrl+click edge to delete/merge

See [technical-specs.md](technical-specs.md) for edge-based layout details.

### PanelIndicator (`ui/panelIndicator.js`)

Top bar icon with dropdown menu.

**Shows:**
- Current layout name
- Quick layout switching
- Access to layout editor
- Keybinding conflict status

### Other UI Components

| Component | Purpose |
|-----------|---------|
| `ZoneOverlay` | Visual zone preview during drag |
| `NotificationManager` | OSD-style notifications |
| `ConfirmDialog` | Simple confirmation dialogs |
| `LayoutSettingsDialog` | Layout name/settings editor |
| `ConflictDetector` | Keybinding conflict detection |

## Data Flow

### Zone Cycling

```
User: Super+Right
    ↓
KeybindingManager._onCycleZoneRight()
    ↓
LayoutManager.cycleZone(+1)
    ↓
WindowManager.moveWindowToZone(window, zone)
    ↓
NotificationManager.show("Layout | Zone")
    ↓
GSettings.save(layoutId, zoneIndex)
```

### Layout Switching

```
User: Super+`
    ↓
KeybindingManager._onShowLayoutSwitcher()
    ↓
LayoutSwitcher.show()
    ↓
User selects layout
    ↓
LayoutManager.setLayout(layoutId)
    ↓
NotificationManager.show("Switched to: Layout")
```

### Per-Space Layout (when enabled)

```
User switches workspace
    ↓
global.workspaceManager 'workspace-switched'
    ↓
SpatialStateManager.getCurrentSpaceKey()
    ↓
LayoutManager.getLayoutForSpace(spaceKey)
    ↓
Auto-apply layout for that space
```

## State Management

### GSettings

User preferences stored in GSettings schema (`org.gnome.shell.extensions.zoned`):

| Key | Type | Purpose |
|-----|------|---------|
| `current-layout-id` | string | Active layout ID |
| `current-zone-index` | int | Active zone (0-based) |
| `use-per-workspace-layouts` | bool | Enable per-space mode |
| `spatial-state-map` | string | JSON map of space→layout |
| `show-notifications` | bool | Show zone change OSD |

### File Storage

Custom layouts: `~/.config/zoned/layouts.json`

```json
{
  "layouts": [
    {
      "id": "custom_1234567890",
      "name": "My Layout",
      "zones": [
        {"name": "Left", "x": 0, "y": 0, "w": 0.5, "h": 1},
        {"name": "Right", "x": 0.5, "y": 0, "w": 0.5, "h": 1}
      ]
    }
  ]
}
```

## Terminology

| Term | Definition |
|------|------------|
| **Zone** | A rectangular window target area (percentage-based) |
| **Layout** | A complete arrangement of zones |
| **Template** | A built-in, read-only layout pattern |
| **Custom Layout** | A user-created layout |
| **Space** | A workspace×monitor combination |
| **Edge** | Internal representation for zone boundaries (see technical-specs.md) |

## Extension Lifecycle

### enable()

1. Load GSettings
2. Initialize managers (Layout, Window, Spatial)
3. Load layouts (defaults + custom)
4. Restore saved state
5. Register keybindings
6. Create UI components (PanelIndicator)

### disable()

1. Unregister all keybindings
2. Disconnect all signal handlers
3. Destroy UI components
4. Save state to GSettings
5. Clear all references

**Critical:** Every signal connection in `enable()` must have a corresponding disconnection in `disable()`.

## File Structure

```
extension/
├── extension.js              # Entry point, lifecycle
├── layoutManager.js          # Layout state management
├── windowManager.js          # Window positioning
├── keybindingManager.js      # Keyboard shortcuts
├── spatialStateManager.js    # Per-space layouts
├── templateManager.js        # Built-in templates
├── prefs.js                  # Preferences UI
├── metadata.json             # Extension metadata
├── stylesheet.css            # GTK styles
├── config/
│   └── default-layouts.json  # Bundled templates
├── schemas/
│   └── org.gnome.shell.extensions.zoned.gschema.xml
├── ui/
│   ├── panelIndicator.js
│   ├── layoutSwitcher.js
│   ├── zoneEditor.js
│   ├── zoneOverlay.js
│   ├── notificationManager.js
│   ├── confirmDialog.js
│   ├── layoutSettingsDialog.js
│   ├── conflictDetector.js
│   └── layoutSwitcher/       # Switcher sub-components
└── utils/
    ├── debug.js
    ├── layoutConverter.js    # Zone ↔ Edge conversion
    └── theme.js
```

## Multi-Monitor Support

Each monitor is independent:
- Zones are percentage-based, scale to any resolution
- Per-space mode allows different layouts per monitor
- Hot-plug detection handles monitor changes

Monitor identification uses connector names (e.g., `DP-1`, `eDP-1`, `HDMI-1`).

## Related Documentation

- [technical-specs.md](technical-specs.md) - Edge-based layout system, per-space layouts
- [coding-patterns.md](coding-patterns.md) - Code style and GNOME patterns
- [keybindings.md](keybindings.md) - Complete keybinding reference
- [vm-setup-guide.md](vm-setup-guide.md) - VM development setup
