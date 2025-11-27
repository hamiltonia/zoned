# Reference Implementation Mapping

This document maps concepts and APIs from the reference Hammerspoon implementation to GNOME Shell equivalents. The Hammerspoon code (`dotfiles/hammerspoon/.hammerspoon/init.lua`) implements a FancyZones-style window management system on macOS. Zoned brings the same layout-based zone management workflow to Linux/GNOME.

**Note:** This is not a port of Hammerspoon to Linux. Hammerspoon is a macOS automation tool that was used to create a FancyZones-like system. Zoned is a native GNOME Shell extension that implements the same window management concepts using GNOME's APIs.

## Core Concept Mappings

### Layout System

**Hammerspoon (Lua):**
```lua
local layouts = {
    {
        id = "halves",
        name = "Halves",
        zones = {
            {name = "Left Half", x = 0, y = 0, w = 0.5, h = 1},
            {name = "Right Half", x = 0.5, y = 0, w = 0.5, h = 1}
        }
    }
}
```

**GNOME Shell (JavaScript):**
```javascript
const layouts = [
    {
        id: "halves",
        name: "Halves",
        zones: [
            {name: "Left Half", x: 0, y: 0, w: 0.5, h: 1},
            {name: "Right Half", x: 0.5, y: 0, w: 0.5, h: 1}
        ]
    }
];
```

**Changes:**
- Lua tables → JavaScript objects/arrays
- `{}` for arrays → `[]`
- `=` → `:`
- No trailing commas → allowed (but optional)

### State Management

**Hammerspoon (Lua):**
```lua
local state = {
    currentLayoutIndex = 1,
    currentZoneIndex = 1
}

-- Load from disk
local savedState = hs.settings.get("windowManagement.state")

-- Save to disk
hs.settings.set("windowManagement.state", {
    layoutIndex = state.currentLayoutIndex,
    zoneIndex = state.currentZoneIndex
})
```

**GNOME Shell (JavaScript):**
```javascript
// GSettings schema required first
const settings = ExtensionUtils.getSettings();

// Load from GSettings
let currentLayoutId = settings.get_string('current-layout-id');
let currentZoneIndex = settings.get_int('current-zone-index');

// Save to GSettings
settings.set_string('current-layout-id', layoutId);
settings.set_int('current-zone-index', zoneIndex);
```

**Changes:**
- `hs.settings` → `Gio.Settings` (GSettings)
- Requires XML schema definition
- Type-specific getters/setters: `get_string()`, `get_int()`, etc.
- Uses layout ID (string) instead of index (more stable)

## API Translations

### Window Management

| Hammerspoon | GNOME Shell | Notes |
|-------------|-------------|-------|
| `hs.window.focusedWindow()` | `global.display.focus_window` | Current focused window |
| `win:screen()` | `window.get_monitor()` | Get window's monitor |
| `screen:frame()` | `global.display.get_monitor_geometry(monitor)` | Monitor dimensions |
| `win:setFrame(frame, duration)` | `window.move_resize_frame(user_op, x, y, w, h)` | Position window |
| `win:minimize()` | `window.minimize()` | Minimize window |
| `win:maximize()` | `window.maximize(Meta.MaximizeFlags.BOTH)` | Maximize window |
| `win:unminimize()` | `window.unminimize()` | Restore minimized window |

### Window Positioning Algorithm

**Hammerspoon (Lua):**
```lua
local function moveWindowToZone(zone)
    local win = hs.window.focusedWindow()
    local screen = win:screen()
    local frame = screen:frame()
    
    local newFrame = {
        x = frame.x + (frame.w * zone.x),
        y = frame.y + (frame.h * zone.y),
        w = frame.w * zone.w,
        h = frame.h * zone.h
    }
    win:setFrame(newFrame, 0)
end
```

**GNOME Shell (JavaScript):**
```javascript
function moveWindowToZone(window, zone) {
    const monitor = window.get_monitor();
    const workArea = global.display.get_monitor_geometry(monitor);
    
    const x = workArea.x + (workArea.width * zone.x);
    const y = workArea.y + (workArea.height * zone.y);
    const width = workArea.width * zone.w;
    const height = workArea.height * zone.h;
    
    window.move_resize_frame(
        true,  // user_op (counts as user action)
        x, y, width, height
    );
}
```

**Changes:**
- `frame.w` → `workArea.width`
- `frame.h` → `workArea.height`
- `setFrame()` → `move_resize_frame()`
- Duration parameter removed (instant positioning)

### Keyboard Shortcuts

**Hammerspoon (Lua):**
```lua
-- Layout Picker: Option+` (⌥~)
hs.hotkey.bind({"alt"}, "`", function()
    showLayoutSwitcher()
end)

-- Cycle Zone Left: Option+Command+Left (⌥⌘←)
hs.hotkey.bind({"alt", "cmd"}, "Left", function()
    cycleZoneLeft()
end)

-- Cycle Zone Right: Option+Command+Right (⌥⌘→)
hs.hotkey.bind({"alt", "cmd"}, "Right", function()
    cycleZoneRight()
end)
```

**GNOME Shell (JavaScript):**
```javascript
// Layout Picker: Super+` (Win+`)
Main.wm.addKeybinding(
    'show-layout-picker',
    this._settings,
    Meta.KeyBindingFlags.NONE,
    Shell.ActionMode.NORMAL,
    this._showLayoutSwitcher.bind(this)
);

// Cycle Zone Left: Super+Left (Win+←)
Main.wm.addKeybinding(
    'cycle-zone-left',
    this._settings,
    Meta.KeyBindingFlags.NONE,
    Shell.ActionMode.NORMAL,
    this._cycleZoneLeft.bind(this)
);

// Cycle Zone Right: Super+Right (Win+→)
Main.wm.addKeybinding(
    'cycle-zone-right',
    this._settings,
    Meta.KeyBindingFlags.NONE,
    Shell.ActionMode.NORMAL,
    this._cycleZoneRight.bind(this)
);
```

**Changes:**
- `hs.hotkey.bind()` → `Main.wm.addKeybinding()`
- `alt+cmd` → `<Super>` (Windows key)
- Requires GSettings schema with keybinding definitions
- Must provide unique action names
- Must bind function context with `.bind(this)`

**GSettings Schema for Keybindings:**
```xml
<key name="show-layout-picker" type="as">
    <default>['&lt;Super&gt;grave']</default>
</key>
<key name="cycle-zone-left" type="as">
    <default>['&lt;Super&gt;Left']</default>
</key>
<key name="cycle-zone-right" type="as">
    <default>['&lt;Super&gt;Right']</default>
</key>
```

### Notifications

**Hammerspoon (Lua):**
```lua
-- Track current alert to replace it
local currentAlert = nil

-- Show notification
if currentAlert then
    hs.alert.closeSpecific(currentAlert)
end
currentAlert = hs.alert.show(
    string.format("%s | %s", layout.name, zone.name),
    0.75
)
```

**GNOME Shell (JavaScript):**
```javascript
// Track current notification
let currentNotification = null;

// Show notification
if (currentNotification) {
    currentNotification.destroy();
}

const source = new MessageTray.Source('Zoned', 'preferences-system');
Main.messageTray.add(source);

const notification = new MessageTray.Notification(
    source,
    'Zoned',
    `${layout.name} | ${zone.name}`
);

currentNotification = notification;
source.showNotification(notification);

// Auto-dismiss after 750ms
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 750, () => {
    if (currentNotification === notification) {
        notification.destroy();
        currentNotification = null;
    }
    return GLib.SOURCE_REMOVE;
});
```

**Changes:**
- `hs.alert` → `MessageTray.Notification`
- More setup required (source, message tray)
- Manual timeout handling with `GLib.timeout_add()`
- Different notification lifecycle

### Layout Picker UI

**Hammerspoon (Lua):**
```lua
local layoutChooser = hs.chooser.new(function(choice)
    if not choice then
        hs.alert.show("Cancelled", 0.75)
        return
    end
    
    local selectedIndex = choice.layoutIndex
    if selectedIndex ~= state.currentLayoutIndex then
        state.currentLayoutIndex = selectedIndex
        state.currentZoneIndex = 1
        saveState()
        hs.alert.show(
            string.format("Switched to: %s", getCurrentLayout().name),
            1
        )
    end
end)

layoutChooser:choices(choices)
layoutChooser:show()
```

**GNOME Shell (JavaScript):**
```javascript
// Custom St-based dialog
const dialog = new St.BoxLayout({
    vertical: true,
    style_class: 'zoned-picker'
});

const scrollView = new St.ScrollView();
const layoutList = new St.BoxLayout({vertical: true});

layouts.forEach((layout, index) => {
    const item = new St.Button({
        label: layout.name,
        style_class: index === currentIndex ? 'selected' : ''
    });
    
    item.connect('clicked', () => {
        this._onLayoutSelected(index);
        dialog.destroy();
    });
    
    layoutList.add(item);
});

scrollView.add_actor(layoutList);
dialog.add(scrollView);

Main.uiGroup.add_actor(dialog);
```

**Changes:**
- `hs.chooser` → Custom `St` widgets
- More manual UI construction
- Must handle keyboard events explicitly
- More styling control via CSS

### Multi-Monitor Support

**Hammerspoon (Lua):**
```lua
-- Automatically uses window's current screen
local win = hs.window.focusedWindow()
local screen = win:screen()
local frame = screen:frame()
```

**GNOME Shell (JavaScript):**
```javascript
// Get window's monitor
const monitor = window.get_monitor();
const workArea = global.display.get_monitor_geometry(monitor);

// Or get all monitors
const nMonitors = global.display.get_n_monitors();
for (let i = 0; i < nMonitors; i++) {
    const geometry = global.display.get_monitor_geometry(i);
    // Process each monitor
}
```

**Changes:**
- Explicit monitor index retrieval
- Can enumerate all monitors
- Same positioning logic works across monitors

## File Organization

**Hammerspoon:**
- Single file: `~/.hammerspoon/init.lua`
- All code in one place
- Lua modules optional

**GNOME Shell:**
- Multiple files required:
  - `metadata.json` - Extension metadata
  - `extension.js` - Main entry point
  - `layoutManager.js` - Layout management
  - `windowManager.js` - Window positioning
  - Component modules in `ui/` directory
  - GSettings schema in `schemas/`
  - Config files in `config/`

## Extension Lifecycle

**Hammerspoon:**
```lua
-- Auto-reload on file change
local myWatcher = hs.pathwatcher.new(
    os.getenv("HOME") .. "/.hammerspoon/",
    reloadConfig
)
myWatcher:start()
```

**GNOME Shell:**
```javascript
class Extension {
    enable() {
        // Initialize extension
        this._loadLayouts();
        this._registerKeybindings();
    }
    
    disable() {
        // Clean up
        this._unregisterKeybindings();
        this._destroyUI();
    }
}

// Manual reload: Alt+F2, type 'r', Enter
// Or: gnome-extensions disable zoned@hamiltonia.me
//     gnome-extensions enable zoned@hamiltonia.me
```

**Changes:**
- No auto-reload (must manually reload shell)
- Explicit enable/disable lifecycle
- Must clean up resources in disable()

## Testing and Debugging

**Hammerspoon:**
```lua
-- Hammerspoon Console
hs.console.clearConsole()
print("Debug message")

-- Reload config
hs.reload()
```

**GNOME Shell:**
```javascript
// Looking Glass (Alt+F2, type 'lg')
log('Debug message');

// Journal logs
// journalctl -f -o cat /usr/bin/gnome-shell

// Reload shell
// Alt+F2, type 'r', Enter (X11)
// Log out/in (Wayland)
```

**Changes:**
- Different debugging tools
- More complex logging
- Harder to reload in Wayland

## Summary of Key Differences

1. **Language:** Lua → JavaScript (ES6+)
2. **Modifier Key:** Cmd (⌘) → Super (Win key)
3. **State Persistence:** `hs.settings` → GSettings with schema
4. **Window API:** Simple frame setting → `move_resize_frame()`
5. **Notifications:** Built-in alerts → MessageTray system
6. **UI Components:** `hs.chooser` → Custom St widgets
7. **File Structure:** Single file → Multi-file extension
8. **Lifecycle:** Auto-reload → Manual enable/disable
9. **Debugging:** Console → Looking Glass + journal

---
*Last Updated: 2025-11-21*
