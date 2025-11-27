# Zoned Architecture Overview

**Status:** ⚠️ OUTDATED  
**Last Verified:** 2025-11-26  
**Notes:** This document describes the OLD architecture with LayoutSwitcher, LayoutSettings, and MessageDialog components that have been deleted. Needs complete rewrite to reflect current TemplatePicker + ZoneEditor architecture. See memory/STATUS.md for current state.

---

## Project Vision

Zoned is a GNOME Shell extension that brings FancyZones-style window management to Linux. It provides layout-based window layouts with keyboard-driven zone cycling, inspired by Windows PowerToys FancyZones and macOS Hammerspoon.

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   GNOME Shell Extension                   │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────┐ │
│  │   Layout    │───▶│   Window     │───▶│  Keyboard  │ │
│  │   Manager    │    │   Manager    │    │  Bindings  │ │
│  └──────────────┘    └──────────────┘    └────────────┘ │
│         │                    │                    │       │
│         │                    │                    │       │
│         ▼                    ▼                    ▼       │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────┐ │
│  │ Config File  │    │ Meta.Window  │    │ Main.wm    │ │
│  │   Loader     │    │     API      │    │  Keybinds  │ │
│  └──────────────┘    └──────────────┘    └────────────┘ │
│         │                                                 │
│         ▼                                                 │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │   GSettings  │    │ UI Components│                   │
│  │ State Persist│    │ (St toolkit) │                   │
│  └──────────────┘    └──────────────┘                   │
│                             │                             │
│                             ▼                             │
│                     ┌──────────────┐                     │
│                     │   Layout    │                     │
│                     │   Picker UI  │                     │
│                     └──────────────┘                     │
└──────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Layout Manager (`layoutManager.js`)
**Responsibilities:**
- Load default layouts from bundled JSON
- Load user custom layouts from `~/.config/zoned/layouts.json`
- Merge and validate layout definitions
- Provide layout query/selection API
- Track current layout and zone state

**Key APIs:**
```javascript
class LayoutManager {
    loadLayouts()           // Load default + user configs
    getCurrentLayout()      // Get active layout
    getCurrentZone()         // Get active zone in current layout
    setLayout( layoutId)    // Switch to different layout
    cycleZone(direction)     // Cycle to next/previous zone
    validateLayout(layout) // Ensure layout is valid
}
```

### 2. Window Manager (`windowManager.js`)
**Responsibilities:**
- Calculate window frames based on zone definitions
- Position windows using Meta.Window API
- Handle multi-monitor scenarios
- Manage minimize/maximize operations

**Key APIs:**
```javascript
class WindowManager {
    moveWindowToZone(window, zone)      // Position window
    getMonitorGeometry(monitor)         // Get screen dimensions
    minimizeWindow(window)              // Minimize focused window
    maximizeWindow(window)              // Maximize/restore window
    getFocusedWindow()                  // Get current active window
}
```

### 3. Keybinding Manager (`keybindingManager.js`)
**Responsibilities:**
- Register/unregister keyboard shortcuts
- Handle shortcut events
- Coordinate with Layout and Window managers

**Keybindings:**
- `<Super>grave` - Open layout picker
- `<Super>Left` - Cycle to previous zone
- `<Super>Right` - Cycle to next zone
- `<Super>Up` - Maximize/restore window
- `<Super>Down` - Minimize window

### 4. Layout Picker UI (`ui/layoutPicker.js`)
**Responsibilities:**
- Display modal dialog with layout list
- Show ASCII visual representations
- Handle keyboard navigation (arrows, Enter, Esc)
- Indicate current active layout

**UI Components:**
- `St.BoxLayout` - Container
- `St.ScrollView` - Scrollable layout list
- `St.Label` - Layout names and ASCII visuals
- `St.Button` - Selection (optional, keyboard-only works too)

### 5. Notification Manager (`ui/notificationManager.js`)
**Responsibilities:**
- Display zone change notifications
- Display layout switch notifications
- Ensure only one notification visible at a time
- Use GNOME Shell notification system

## Data Flow

### Zone Cycling Flow
```
User presses Super+Right
    ↓
KeybindingManager.onCycleRight()
    ↓
LayoutManager.cycleZone(+1)
    ↓
LayoutManager.getCurrentZone()
    ↓
WindowManager.moveWindowToZone(zone)
    ↓
NotificationManager.show("Layout | Zone")
    ↓
GSettings.saveState(layoutId, zoneIndex)
```

### Layout Switching Flow
```
User presses Super+grave
    ↓
KeybindingManager.onLayoutSwitcher()
    ↓
LayoutSwitcher.show(layouts)
    ↓
User selects layout
    ↓
LayoutManager.setLayout( layoutId)
    ↓
LayoutManager.setZone(1) // Reset to first zone
    ↓
NotificationManager.show("Switched to: Layout")
    ↓
GSettings.saveState(layoutId, zoneIndex)
```

## State Management

### Persistent State (GSettings)
Stored in GSettings schema:
```xml
<key name="current-layout-id" type="s">
  <default>"halves"</default>
</key>
<key name="current-zone-index" type="i">
  <default>1</default>
</key>
```

### Session State (Memory)
- Loaded layouts (default + user)
- Current focused window
- Active notification ID
- Layout picker dialog instance

## Configuration System

### Default Layouts
Bundled in: `extension/config/default-layouts.json`

Contains 9 layouts:
1. Center Focus (60%)
2. Balanced Focus (50%)
3. Thirds
4. Halves
5. Quarters
6. Main Left (67/33)
7. Main Right (67/33)
8. Balanced Left (40/40/20)
9. Balanced Right (20/40/40)

### User Layouts
Optional file: `~/.config/zoned/layouts.json`

Users can:
- Override default layouts (by matching `id`)
- Add custom layouts
- Define their own zone layouts

### Layout Format
```json
{
  "layouts": [
    {
      "id": "custom_layout",
      "name": "My Custom Layout",
      "zones": [
        {"name": "Zone 1", "x": 0, "y": 0, "w": 0.7, "h": 1},
        {"name": "Zone 2", "x": 0.7, "y": 0, "w": 0.3, "h": 1}
      ]
    }
  ]
}
```

## Extension Lifecycle

### Initialization (enable())
```javascript
1. Load GSettings schema
2. Load layouts (default + user)
3. Restore saved state (layout + zone)
4. Register keybindings
5. Initialize UI components
6. Ready for user interaction
```

### Shutdown (disable())
```javascript
1. Save current state to GSettings
2. Unregister keybindings
3. Destroy UI components
4. Clean up resources
5. Extension disabled
```

## Technology Stack

- **Language:** JavaScript (GJS - GNOME JavaScript bindings)
- **GNOME Shell Version:** 49+
- **UI Framework:** St (Shell Toolkit)
- **Window Management:** Meta.Window, Meta.Display APIs
- **State Persistence:** GSettings
- **Configuration:** JSON files

## Design Principles

1. **Keyboard-first:** All operations accessible via keyboard shortcuts
2. **Stateful:** Remember layout and zone across sessions
3. **Customizable:** Users can define their own layouts
4. **Non-invasive:** Works alongside existing GNOME workflows
5. **Performant:** Minimal overhead, instant window positioning
6. **Accessible:** Clear visual feedback via notifications

## Future Enhancements

- Preferences UI for visual layout editing
- Per-application layout assignments
- Advanced multi-monitor zone configurations
- Import/export layout collections
- Animated window transitions (optional)
- Integration with GNOME's window overview

---
*Last Updated: 2025-11-21*
