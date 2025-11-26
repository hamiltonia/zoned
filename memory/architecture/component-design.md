# Component Design Details

**Status:** ⚠️ OUTDATED  
**Last Verified:** 2025-11-26  
**Notes:** This document describes deleted components (ProfileSettings, ProfileEditor, MessageDialog, ZoneCanvas). Needs rewrite to document current components (LayoutPicker, GridEditor, TemplateManager, ConfirmDialog). See memory/STATUS.md for current component list.

---

Detailed implementation specifications for each component in the Zoned GNOME Shell extension.

## 1. ProfileManager

**File:** `extension/profileManager.js`

### Responsibilities
- Load and merge default and user profile configurations
- Validate profile definitions
- Manage current profile and zone state
- Provide profile query/selection API
- Coordinate with GSettings for state persistence

### Properties
```javascript
class ProfileManager {
    _profiles = [];              // Array of loaded profiles
    _currentProfileId = null;    // ID of active profile
    _currentZoneIndex = 0;       // Index of active zone (0-based)
    _settings = null;            // GSettings instance
    _defaultProfilesPath = '';   // Path to bundled profiles
    _userProfilesPath = '';      // Path to user profiles
}
```

### Methods

#### `constructor(settings)`
- Store GSettings reference
- Set profile paths
- Initialize state variables

#### `loadProfiles()`
```javascript
loadProfiles() {
    // 1. Load default profiles from extension/config/default-profiles.json
    const defaultProfiles = this._loadJsonFile(this._defaultProfilesPath);
    
    // 2. Check for user profiles at ~/.config/zoned/profiles.json
    const userProfiles = this._loadJsonFile(this._userProfilesPath);
    
    // 3. Merge: user profiles override defaults by matching 'id'
    this._profiles = this._mergeProfiles(defaultProfiles, userProfiles);
    
    // 4. Validate all profiles
    this._profiles.forEach(p => this._validateProfile(p));
    
    // 5. Restore saved state from GSettings
    this._restoreState();
}
```

#### `_validateProfile(profile)`
- Check required fields: `id`, `name`, `zones`
- Validate zones array not empty
- Validate zone fields: `name`, `x`, `y`, `w`, `h`
- Check percentages in range [0, 1]
- Throw error if invalid

#### `getCurrentProfile()`
- Return profile object matching `_currentProfileId`
- If not found, return first profile as fallback

#### `getCurrentZone()`
- Get current profile
- Return zone at `_currentZoneIndex`
- Handle index bounds checking

#### `setProfile(profileId)`
```javascript
setProfile(profileId) {
    // Validate profile exists
    const profile = this._profiles.find(p => p.id === profileId);
    if (!profile) throw new Error(`Profile ${profileId} not found`);
    
    // Update state
    this._currentProfileId = profileId;
    this._currentZoneIndex = 0;  // Reset to first zone
    
    // Persist to GSettings
    this._saveState();
}
```

#### `cycleZone(direction)`
```javascript
cycleZone(direction) {
    // direction: +1 (next), -1 (previous)
    const profile = this.getCurrentProfile();
    const numZones = profile.zones.length;
    
    // Calculate new index with wraparound
    this._currentZoneIndex = 
        (this._currentZoneIndex + direction + numZones) % numZones;
    
    // Persist
    this._saveState();
    
    return this.getCurrentZone();
}
```

#### `_saveState()` / `_restoreState()`
- Save/load `current-profile-id` and `current-zone-index` to/from GSettings

## 2. WindowManager

**File:** `extension/windowManager.js`

### Responsibilities
- Calculate window frames based on zone definitions
- Position windows using Meta.Window API
- Handle multi-monitor configurations
- Manage minimize/maximize operations

### Properties
```javascript
class WindowManager {
    _display = null;  // global.display reference
}
```

### Methods

#### `constructor()`
- Store display reference: `this._display = global.display`

#### `getFocusedWindow()`
```javascript
getFocusedWindow() {
    return this._display.focus_window;
}
```

#### `moveWindowToZone(window, zone)`
```javascript
moveWindowToZone(window, zone) {
    if (!window) return false;
    
    // Get monitor for this window
    const monitorIndex = window.get_monitor();
    const workArea = this._display.get_monitor_geometry(monitorIndex);
    
    // Calculate absolute frame from percentage-based zone
    const x = Math.floor(workArea.x + (workArea.width * zone.x));
    const y = Math.floor(workArea.y + (workArea.height * zone.y));
    const width = Math.floor(workArea.width * zone.w);
    const height = Math.floor(workArea.height * zone.h);
    
    // Unmaximize if needed
    if (window.get_maximized()) {
        window.unmaximize(Meta.MaximizeFlags.BOTH);
    }
    
    // Position window
    window.move_resize_frame(true, x, y, width, height);
    
    return true;
}
```

#### `minimizeWindow(window)`
```javascript
minimizeWindow(window) {
    if (!window) return false;
    window.minimize();
    return true;
}
```

#### `maximizeWindow(window)`
```javascript
maximizeWindow(window) {
    if (!window) return false;
    
    // Check if already maximized - if so, unmaximize
    if (window.get_maximized()) {
        window.unmaximize(Meta.MaximizeFlags.BOTH);
    } else {
        window.maximize(Meta.MaximizeFlags.BOTH);
    }
    
    return true;
}
```

#### `restoreMinimizedWindow()`
```javascript
restoreMinimizedWindow() {
    // Get focused application
    const app = Shell.AppSystem.get_default().get_running()[0];
    if (!app) return false;
    
    // Find minimized windows
    const windows = app.get_windows().filter(w => w.minimized);
    if (windows.length === 0) return false;
    
    // Restore first minimized window
    windows[0].unminimize();
    windows[0].activate(global.get_current_time());
    
    return true;
}
```

## 3. KeybindingManager

**File:** `extension/keybindingManager.js`

### Responsibilities
- Register keyboard shortcuts with GNOME Shell
- Handle shortcut events
- Coordinate actions between managers

### Properties
```javascript
class KeybindingManager {
    _settings = null;
    _profileManager = null;
    _windowManager = null;
    _notificationManager = null;
    _profilePicker = null;
    _keybindings = [];  // Track registered keybindings
}
```

### Methods

#### `constructor(settings, profileMgr, windowMgr, notifyMgr, profilePicker)`
- Store references to all managers

#### `registerKeybindings()`
```javascript
registerKeybindings() {
    const bindings = [
        {
            name: 'cycle-zone-left',
            handler: this._onCycleZoneLeft.bind(this)
        },
        {
            name: 'cycle-zone-right',
            handler: this._onCycleZoneRight.bind(this)
        },
        {
            name: 'show-profile-picker',
            handler: this._onShowProfilePicker.bind(this)
        },
        {
            name: 'minimize-window',
            handler: this._onMinimizeWindow.bind(this)
        },
        {
            name: 'maximize-window',
            handler: this._onMaximizeWindow.bind(this)
        }
    ];
    
    bindings.forEach(binding => {
        Main.wm.addKeybinding(
            binding.name,
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            binding.handler
        );
        this._keybindings.push(binding.name);
    });
}
```

#### `unregisterKeybindings()`
```javascript
unregisterKeybindings() {
    this._keybindings.forEach(name => {
        Main.wm.removeKeybinding(name);
    });
    this._keybindings = [];
}
```

#### Event Handlers

```javascript
_onCycleZoneLeft() {
    const zone = this._profileManager.cycleZone(-1);
    const window = this._windowManager.getFocusedWindow();
    
    if (this._windowManager.moveWindowToZone(window, zone)) {
        const profile = this._profileManager.getCurrentProfile();
        this._notificationManager.show(`${profile.name} | ${zone.name}`);
    }
}

_onCycleZoneRight() {
    const zone = this._profileManager.cycleZone(+1);
    const window = this._windowManager.getFocusedWindow();
    
    if (this._windowManager.moveWindowToZone(window, zone)) {
        const profile = this._profileManager.getCurrentProfile();
        this._notificationManager.show(`${profile.name} | ${zone.name}`);
    }
}

_onShowProfilePicker() {
    this._profilePicker.show();
}

_onMinimizeWindow() {
    const window = this._windowManager.getFocusedWindow();
    if (this._windowManager.minimizeWindow(window)) {
        this._notificationManager.show('Minimized');
    }
}

_onMaximizeWindow() {
    const window = this._windowManager.getFocusedWindow();
    const wasMaximized = window && window.get_maximized();
    
    if (this._windowManager.maximizeWindow(window)) {
        this._notificationManager.show(wasMaximized ? 'Restored' : 'Maximized');
    } else if (this._windowManager.restoreMinimizedWindow()) {
        this._notificationManager.show('Restored');
    }
}
```

## 4. ProfilePicker (UI)

**File:** `extension/ui/profilePicker.js`

### Responsibilities
- Display modal dialog with profile list
- Show ASCII visual representations
- Handle keyboard navigation
- Indicate current active profile

### Properties
```javascript
class ProfilePicker {
    _profileManager = null;
    _notificationManager = null;
    _dialog = null;               // St.BoxLayout
    _selectedIndex = 0;           // Currently highlighted profile
    _profileButtons = [];         // Array of St.Button widgets
}
```

### Methods

#### `constructor(profileManager, notificationManager)`
- Store manager references

#### `show()`
```javascript
show() {
    if (this._dialog) {
        this._dialog.destroy();
    }
    
    // Build dialog
    this._dialog = new St.BoxLayout({
        vertical: true,
        style_class: 'zoned-picker-dialog',
        reactive: true
    });
    
    // Add profile items
    const profiles = this._profileManager._profiles;
    const currentProfile = this._profileManager.getCurrentProfile();
    
    profiles.forEach((profile, index) => {
        const item = this._createProfileItem(profile, profile.id === currentProfile.id);
        this._dialog.add_child(item);
        this._profileButtons.push(item);
    });
    
    // Center on screen
    this._positionDialog();
    
    // Add to UI
    Main.uiGroup.add_child(this._dialog);
    
    // Grab keyboard focus
    this._dialog.grab_key_focus();
    
    // Connect keyboard events
    this._connectKeyEvents();
}
```

#### `_createProfileItem(profile, isCurrent)`
```javascript
_createProfileItem(profile, isCurrent) {
    const button = new St.Button({
        style_class: 'zoned-profile-item',
        reactive: true,
        can_focus: true,
        track_hover: true
    });
    
    const box = new St.BoxLayout({vertical: true});
    
    // Profile name (with indicator if current)
    const name = new St.Label({
        text: (isCurrent ? '● ' : '  ') + profile.name,
        style_class: 'profile-name'
    });
    
    // ASCII visual
    const visual = this._generateVisual(profile);
    const visualLabel = new St.Label({
        text: visual,
        style_class: 'profile-visual'
    });
    
    box.add_child(name);
    box.add_child(visualLabel);
    button.set_child(box);
    
    // Click handler
    button.connect('clicked', () => {
        this._onProfileSelected(profile.id);
    });
    
    return button;
}
```

#### `_generateVisual(profile)`
- Generate ASCII art representation of zone layout
- Use logic from Hammerspoon reference (see `generateVisual` function)

#### `hide()`
```javascript
hide() {
    if (this._dialog) {
        Main.uiGroup.remove_child(this._dialog);
        this._dialog.destroy();
        this._dialog = null;
        this._profileButtons = [];
    }
}
```

## 5. NotificationManager

**File:** `extension/ui/notificationManager.js`

### Responsibilities
- Display OSD-style notifications
- Ensure only one notification visible
- Auto-dismiss after timeout

### Properties
```javascript
class NotificationManager {
    _currentNotification = null;
    _source = null;
}
```

### Methods

#### `constructor()`
- Create message source

#### `show(message, duration = 750)`
```javascript
show(message, duration = 750) {
    // Destroy previous notification
    if (this._currentNotification) {
        this._currentNotification.destroy();
        this._currentNotification = null;
    }
    
    // Create source if needed
    if (!this._source) {
        this._source = new MessageTray.Source('Zoned', 'preferences-system');
        Main.messageTray.add(this._source);
    }
    
    // Create notification
    const notification = new MessageTray.Notification(
        this._source,
        'Zoned',
        message
    );
    
    this._currentNotification = notification;
    this._source.showNotification(notification);
    
    // Auto-dismiss
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, duration, () => {
        if (this._currentNotification === notification) {
            notification.destroy();
            this._currentNotification = null;
        }
        return GLib.SOURCE_REMOVE;
    });
}
```

#### `destroy()`
```javascript
destroy() {
    if (this._currentNotification) {
        this._currentNotification.destroy();
        this._currentNotification = null;
    }
    
    if (this._source) {
        this._source.destroy();
        this._source = null;
    }
}
```

## 6. Extension (Main Entry Point)

**File:** `extension/extension.js`

### Structure (GNOME 45+ ESM format)
```javascript
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class ZonedExtension {
    constructor() {
        this._profileManager = null;
        this._windowManager = null;
        this._keybindingManager = null;
        this._notificationManager = null;
        this._profilePicker = null;
        this._settings = null;
    }
    
    enable() {
        // 1. Get settings
        this._settings = this.getSettings();
        
        // 2. Initialize managers
        this._profileManager = new ProfileManager(this._settings);
        this._windowManager = new WindowManager();
        this._notificationManager = new NotificationManager();
        
        // 3. Load profiles
        this._profileManager.loadProfiles();
        
        // 4. Initialize UI
        this._profilePicker = new ProfilePicker(
            this._profileManager,
            this._notificationManager
        );
        
        // 5. Register keybindings
        this._keybindingManager = new KeybindingManager(
            this._settings,
            this._profileManager,
            this._windowManager,
            this._notificationManager,
            this._profilePicker
        );
        this._keybindingManager.registerKeybindings();
    }
    
    disable() {
        // Unregister keybindings
        if (this._keybindingManager) {
            this._keybindingManager.unregisterKeybindings();
            this._keybindingManager = null;
        }
        
        // Destroy UI
        if (this._profilePicker) {
            this._profilePicker.hide();
            this._profilePicker = null;
        }
        
        if (this._notificationManager) {
            this._notificationManager.destroy();
            this._notificationManager = null;
        }
        
        // Clear references
        this._windowManager = null;
        this._profileManager = null;
        this._settings = null;
    }
}
```

---
*Last Updated: 2025-11-21*
