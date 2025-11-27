# Component Design Details

**Status:** ⚠️ OUTDATED  
**Last Verified:** 2025-11-26  
**Notes:** This document describes deleted components (LayoutSettings, LayoutEditor, MessageDialog, ZoneCanvas). Needs rewrite to document current components (TemplatePicker, ZoneEditor, TemplateManager, ConfirmDialog). See memory/STATUS.md for current component list.

---

Detailed implementation specifications for each component in the Zoned GNOME Shell extension.

## 1. LayoutManager

**File:** `extension/layoutManager.js`

### Responsibilities
- Load and merge default and user layout configurations
- Validate layout definitions
- Manage current layout and zone state
- Provide layout query/selection API
- Coordinate with GSettings for state persistence

### Properties
```javascript
class LayoutManager {
    _layouts = [];              // Array of loaded layouts
    _currentLayoutId = null;    // ID of active layout
    _currentZoneIndex = 0;       // Index of active zone (0-based)
    _settings = null;            // GSettings instance
    _defaultLayoutsPath = '';   // Path to bundled layouts
    _userLayoutsPath = '';      // Path to user layouts
}
```

### Methods

#### `constructor(settings)`
- Store GSettings reference
- Set layout paths
- Initialize state variables

#### `loadLayouts()`
```javascript
loadLayouts() {
    // 1. Load default layouts from extension/config/default-layouts.json
    const defaultLayouts = this._loadJsonFile(this._defaultLayoutsPath);
    
    // 2. Check for user layouts at ~/.config/zoned/layouts.json
    const userLayouts = this._loadJsonFile(this._userLayoutsPath);
    
    // 3. Merge: user layouts override defaults by matching 'id'
    this._layouts = this._mergeLayouts(defaultLayouts, userLayouts);
    
    // 4. Validate all layouts
    this._layouts.forEach(p => this._validateLayout(p));
    
    // 5. Restore saved state from GSettings
    this._restoreState();
}
```

#### `_validateLayout(layout)`
- Check required fields: `id`, `name`, `zones`
- Validate zones array not empty
- Validate zone fields: `name`, `x`, `y`, `w`, `h`
- Check percentages in range [0, 1]
- Throw error if invalid

#### `getCurrentLayout()`
- Return layout object matching `_currentLayoutId`
- If not found, return first layout as fallback

#### `getCurrentZone()`
- Get current layout
- Return zone at `_currentZoneIndex`
- Handle index bounds checking

#### `setLayout( layoutId)`
```javascript
setLayout( layoutId) {
    // Validate layout exists
    const layout = this._layouts.find(p => p.id === layoutId);
    if (!layout) throw new Error(`Layout ${layoutId} not found`);
    
    // Update state
    this._currentLayoutId = layoutId;
    this._currentZoneIndex = 0;  // Reset to first zone
    
    // Persist to GSettings
    this._saveState();
}
```

#### `cycleZone(direction)`
```javascript
cycleZone(direction) {
    // direction: +1 (next), -1 (previous)
    const layout = this.getCurrentLayout();
    const numZones = layout.zones.length;
    
    // Calculate new index with wraparound
    this._currentZoneIndex = 
        (this._currentZoneIndex + direction + numZones) % numZones;
    
    // Persist
    this._saveState();
    
    return this.getCurrentZone();
}
```

#### `_saveState()` / `_restoreState()`
- Save/load `current-layout-id` and `current-zone-index` to/from GSettings

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
    _layoutManager = null;
    _windowManager = null;
    _notificationManager = null;
    _layoutPicker = null;
    _keybindings = [];  // Track registered keybindings
}
```

### Methods

#### `constructor(settings, layoutMgr, windowMgr, notifyMgr, layoutPicker)`
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
            name: 'show-layout-picker',
            handler: this._onShowLayoutSwitcher.bind(this)
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
    const zone = this._layoutManager.cycleZone(-1);
    const window = this._windowManager.getFocusedWindow();
    
    if (this._windowManager.moveWindowToZone(window, zone)) {
        const layout = this._layoutManager.getCurrentLayout();
        this._notificationManager.show(`${layout.name} | ${zone.name}`);
    }
}

_onCycleZoneRight() {
    const zone = this._layoutManager.cycleZone(+1);
    const window = this._windowManager.getFocusedWindow();
    
    if (this._windowManager.moveWindowToZone(window, zone)) {
        const layout = this._layoutManager.getCurrentLayout();
        this._notificationManager.show(`${layout.name} | ${zone.name}`);
    }
}

_onShowLayoutSwitcher() {
    this._layoutPicker.show();
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

## 4. LayoutSwitcher (UI)

**File:** `extension/ui/layoutPicker.js`

### Responsibilities
- Display modal dialog with layout list
- Show ASCII visual representations
- Handle keyboard navigation
- Indicate current active layout

### Properties
```javascript
class LayoutSwitcher {
    _layoutManager = null;
    _notificationManager = null;
    _dialog = null;               // St.BoxLayout
    _selectedIndex = 0;           // Currently highlighted layout
    _layoutButtons = [];         // Array of St.Button widgets
}
```

### Methods

#### `constructor(layoutManager, notificationManager)`
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
    
    // Add layout items
    const layouts = this._layoutManager._layouts;
    const currentLayout = this._layoutManager.getCurrentLayout();
    
    layouts.forEach((layout, index) => {
        const item = this._createLayoutItem(layout, layout.id === currentLayout.id);
        this._dialog.add_child(item);
        this._layoutButtons.push(item);
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

#### `_createLayoutItem(layout, isCurrent)`
```javascript
_createLayoutItem(layout, isCurrent) {
    const button = new St.Button({
        style_class: 'zoned-layout-item',
        reactive: true,
        can_focus: true,
        track_hover: true
    });
    
    const box = new St.BoxLayout({vertical: true});
    
    // Layout name (with indicator if current)
    const name = new St.Label({
        text: (isCurrent ? '● ' : '  ') + layout.name,
        style_class: 'layout-name'
    });
    
    // ASCII visual
    const visual = this._generateVisual(layout);
    const visualLabel = new St.Label({
        text: visual,
        style_class: 'layout-visual'
    });
    
    box.add_child(name);
    box.add_child(visualLabel);
    button.set_child(box);
    
    // Click handler
    button.connect('clicked', () => {
        this._onLayoutSelected(layout.id);
    });
    
    return button;
}
```

#### `_generateVisual(layout)`
- Generate ASCII art representation of zone layout
- Use logic from Hammerspoon reference (see `generateVisual` function)

#### `hide()`
```javascript
hide() {
    if (this._dialog) {
        Main.uiGroup.remove_child(this._dialog);
        this._dialog.destroy();
        this._dialog = null;
        this._layoutButtons = [];
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
        this._layoutManager = null;
        this._windowManager = null;
        this._keybindingManager = null;
        this._notificationManager = null;
        this._layoutPicker = null;
        this._settings = null;
    }
    
    enable() {
        // 1. Get settings
        this._settings = this.getSettings();
        
        // 2. Initialize managers
        this._layoutManager = new LayoutManager(this._settings);
        this._windowManager = new WindowManager();
        this._notificationManager = new NotificationManager();
        
        // 3. Load layouts
        this._layoutManager.loadLayouts();
        
        // 4. Initialize UI
        this._layoutPicker = new LayoutSwitcher(
            this._layoutManager,
            this._notificationManager
        );
        
        // 5. Register keybindings
        this._keybindingManager = new KeybindingManager(
            this._settings,
            this._layoutManager,
            this._windowManager,
            this._notificationManager,
            this._layoutPicker
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
        if (this._layoutPicker) {
            this._layoutPicker.hide();
            this._layoutPicker = null;
        }
        
        if (this._notificationManager) {
            this._notificationManager.destroy();
            this._notificationManager = null;
        }
        
        // Clear references
        this._windowManager = null;
        this._layoutManager = null;
        this._settings = null;
    }
}
```

---
*Last Updated: 2025-11-21*
