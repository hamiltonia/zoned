# ZoneFancy Architecture Overview

## Project Vision

ZoneFancy is a GNOME Shell extension that brings FancyZones-style window management to Linux. It provides profile-based window layouts with keyboard-driven zone cycling, inspired by Windows PowerToys FancyZones and macOS Hammerspoon.

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   GNOME Shell Extension                   │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────┐ │
│  │   Profile    │───▶│   Window     │───▶│  Keyboard  │ │
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
│                     │   Profile    │                     │
│                     │   Picker UI  │                     │
│                     └──────────────┘                     │
└──────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Profile Manager (`profileManager.js`)
**Responsibilities:**
- Load default profiles from bundled JSON
- Load user custom profiles from `~/.config/zonefancy/profiles.json`
- Merge and validate profile definitions
- Provide profile query/selection API
- Track current profile and zone state

**Key APIs:**
```javascript
class ProfileManager {
    loadProfiles()           // Load default + user configs
    getCurrentProfile()      // Get active profile
    getCurrentZone()         // Get active zone in current profile
    setProfile(profileId)    // Switch to different profile
    cycleZone(direction)     // Cycle to next/previous zone
    validateProfile(profile) // Ensure profile is valid
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
- Coordinate with Profile and Window managers

**Keybindings:**
- `<Super>grave` - Open profile picker
- `<Super>Left` - Cycle to previous zone
- `<Super>Right` - Cycle to next zone
- `<Super>Up` - Maximize/restore window
- `<Super>Down` - Minimize window

### 4. Profile Picker UI (`ui/profilePicker.js`)
**Responsibilities:**
- Display modal dialog with profile list
- Show ASCII visual representations
- Handle keyboard navigation (arrows, Enter, Esc)
- Indicate current active profile

**UI Components:**
- `St.BoxLayout` - Container
- `St.ScrollView` - Scrollable profile list
- `St.Label` - Profile names and ASCII visuals
- `St.Button` - Selection (optional, keyboard-only works too)

### 5. Notification Manager (`ui/notificationManager.js`)
**Responsibilities:**
- Display zone change notifications
- Display profile switch notifications
- Ensure only one notification visible at a time
- Use GNOME Shell notification system

## Data Flow

### Zone Cycling Flow
```
User presses Super+Right
    ↓
KeybindingManager.onCycleRight()
    ↓
ProfileManager.cycleZone(+1)
    ↓
ProfileManager.getCurrentZone()
    ↓
WindowManager.moveWindowToZone(zone)
    ↓
NotificationManager.show("Profile | Zone")
    ↓
GSettings.saveState(profileId, zoneIndex)
```

### Profile Switching Flow
```
User presses Super+grave
    ↓
KeybindingManager.onProfilePicker()
    ↓
ProfilePicker.show(profiles)
    ↓
User selects profile
    ↓
ProfileManager.setProfile(profileId)
    ↓
ProfileManager.setZone(1) // Reset to first zone
    ↓
NotificationManager.show("Switched to: Profile")
    ↓
GSettings.saveState(profileId, zoneIndex)
```

## State Management

### Persistent State (GSettings)
Stored in GSettings schema:
```xml
<key name="current-profile-id" type="s">
  <default>"halves"</default>
</key>
<key name="current-zone-index" type="i">
  <default>1</default>
</key>
```

### Session State (Memory)
- Loaded profiles (default + user)
- Current focused window
- Active notification ID
- Profile picker dialog instance

## Configuration System

### Default Profiles
Bundled in: `extension/config/default-profiles.json`

Contains 9 profiles:
1. Center Focus (60%)
2. Balanced Focus (50%)
3. Thirds
4. Halves
5. Quarters
6. Main Left (67/33)
7. Main Right (67/33)
8. Balanced Left (40/40/20)
9. Balanced Right (20/40/40)

### User Profiles
Optional file: `~/.config/zonefancy/profiles.json`

Users can:
- Override default profiles (by matching `id`)
- Add custom profiles
- Define their own zone layouts

### Profile Format
```json
{
  "profiles": [
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
2. Load profiles (default + user)
3. Restore saved state (profile + zone)
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
2. **Stateful:** Remember profile and zone across sessions
3. **Customizable:** Users can define their own layouts
4. **Non-invasive:** Works alongside existing GNOME workflows
5. **Performant:** Minimal overhead, instant window positioning
6. **Accessible:** Clear visual feedback via notifications

## Future Enhancements

- Preferences UI for visual profile editing
- Per-application profile assignments
- Advanced multi-monitor zone configurations
- Import/export profile collections
- Animated window transitions (optional)
- Integration with GNOME's window overview

---
*Last Updated: 2025-11-21*
