# ZoneFancy - Next Steps for Implementation

## Current Status

✅ **Completed:**
- Project structure and configuration
- Comprehensive documentation (memory bank)
- GSettings schema with keybindings
- Default profiles JSON (9 layouts)
- Development workflow (Makefile)

📋 **Next Phase: JavaScript Implementation**

This document provides a roadmap for implementing the extension code.

## Implementation Priority

### Phase 1: Core Managers (Critical Path)

These components must be implemented in order:

#### 1. WindowManager (`extension/windowManager.js`)
**Priority:** HIGH - Foundation for all window operations

**Required functionality:**
```javascript
class WindowManager {
    constructor()
    getFocusedWindow()              // Get current focused window
    moveWindowToZone(window, zone)  // Position window in zone
    minimizeWindow(window)          // Minimize window
    maximizeWindow(window)          // Toggle maximize
    restoreMinimizedWindow()        // Restore from minimized
}
```

**Key implementation details:**
- Use `global.display.focus_window` for focused window
- Use `window.get_monitor()` for multi-monitor support
- Use `global.display.get_monitor_geometry()` for screen dimensions
- Calculate absolute pixels from zone percentages
- Handle maximized windows (unmaximize before moving)

**Reference:** `memory/architecture/component-design.md` (WindowManager section)

#### 2. ProfileManager (`extension/profileManager.js`)
**Priority:** HIGH - Manages profiles and state

**Required functionality:**
```javascript
class ProfileManager {
    constructor(settings)
    loadProfiles()                  // Load default + user profiles
    getCurrentProfile()             // Get active profile
    getCurrentZone()                // Get active zone
    setProfile(profileId)           // Switch profile
    cycleZone(direction)            // Move to next/previous zone
    _validateProfile(profile)       // Ensure profile is valid
    _saveState()                    // Persist to GSettings
    _restoreState()                 // Load from GSettings
}
```

**Key implementation details:**
- Load `extension/config/default-profiles.json` using GJS file I/O
- Check for user profiles at `~/.config/zonefancy/profiles.json`
- Merge user profiles (override by matching `id`)
- Validate all profiles on load
- Use GSettings for state persistence
- Handle wraparound in zone cycling

**Reference:** `memory/architecture/component-design.md` (ProfileManager section)

#### 3. KeybindingManager (`extension/keybindingManager.js`)
**Priority:** HIGH - User interaction

**Required functionality:**
```javascript
class KeybindingManager {
    constructor(settings, profileMgr, windowMgr, notifyMgr, profilePicker)
    registerKeybindings()           // Register all shortcuts
    unregisterKeybindings()         // Clean up on disable
    _onCycleZoneLeft()             // Handler for Super+Left
    _onCycleZoneRight()            // Handler for Super+Right
    _onShowProfilePicker()         // Handler for Super+grave
    _onMinimizeWindow()            // Handler for Super+Down
    _onMaximizeWindow()            // Handler for Super+Up
}
```

**Key implementation details:**
- Use `Main.wm.addKeybinding()` for registration
- Use `Main.wm.removeKeybinding()` for cleanup
- Bind handlers with `.bind(this)` for proper context
- Coordinate between managers for actions
- Show notifications for feedback

**Reference:** `memory/architecture/component-design.md` (KeybindingManager section)

### Phase 2: UI Components

#### 4. NotificationManager (`extension/ui/notificationManager.js`)
**Priority:** MEDIUM - Visual feedback

**Required functionality:**
```javascript
class NotificationManager {
    constructor()
    show(message, duration)         // Display notification
    destroy()                       // Clean up
}
```

**Key implementation details:**
- Use `MessageTray.Source` and `MessageTray.Notification`
- Ensure only one notification at a time (destroy previous)
- Auto-dismiss after duration (default 750ms)
- Use `GLib.timeout_add()` for auto-dismiss

**Reference:** `memory/architecture/component-design.md` (NotificationManager section)

#### 5. ProfilePicker (`extension/ui/profilePicker.js`)
**Priority:** MEDIUM - Profile selection UI

**Required functionality:**
```javascript
class ProfilePicker {
    constructor(profileManager, notificationManager)
    show()                          // Display picker dialog
    hide()                          // Close picker
    _createProfileItem()            // Create UI item for profile
    _generateVisual(profile)        // ASCII visualization
    _onProfileSelected(profileId)   // Handle selection
    _connectKeyEvents()             // Keyboard navigation
}
```

**Key implementation details:**
- Use `St.BoxLayout`, `St.ScrollView`, `St.Button`, `St.Label`
- Generate ASCII visuals for profiles (see Hammerspoon reference)
- Handle keyboard navigation (arrows, Enter, Esc)
- Indicate current profile with ● marker
- Center dialog on screen

**Reference:** `memory/architecture/component-design.md` (ProfilePicker section)

### Phase 3: Main Extension Entry Point

#### 6. Extension (`extension/extension.js`)
**Priority:** HIGH - Ties everything together

**Required structure (GNOME 45+ ESM format):**
```javascript
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class ZoneFancyExtension {
    constructor() {
        // Initialize properties
    }
    
    enable() {
        // 1. Get settings
        // 2. Initialize managers
        // 3. Load profiles
        // 4. Initialize UI
        // 5. Register keybindings
    }
    
    disable() {
        // 1. Unregister keybindings
        // 2. Destroy UI
        // 3. Clear references
    }
}
```

**Reference:** `memory/architecture/component-design.md` (Extension section)

## Implementation Order

**Recommended sequence:**

1. **WindowManager** (Day 1)
   - Implement basic window positioning
   - Test with hardcoded zone
   - Verify multi-monitor support

2. **ProfileManager** (Day 1-2)
   - Implement profile loading
   - Test with default profiles
   - Add state persistence
   - Test zone cycling logic

3. **NotificationManager** (Day 2)
   - Simple notification display
   - Test auto-dismiss
   - Test notification replacement

4. **KeybindingManager** (Day 2-3)
   - Implement keybinding registration
   - Wire up zone cycling
   - Test all shortcuts

5. **Extension.js** (Day 3)
   - Wire all components together
   - Test enable/disable lifecycle
   - Test installation

6. **ProfilePicker** (Day 3-4)
   - Build UI components
   - Add ASCII visualization
   - Implement keyboard navigation
   - Test profile switching

## Testing Checklist

After implementation, verify:

**Basic Functionality:**
- [ ] Extension installs without errors
- [ ] Extension enables successfully
- [ ] No errors in logs on startup
- [ ] GSettings schema compiles
- [ ] Profiles load correctly

**Window Management:**
- [ ] Zone cycling works (Super+Left/Right)
- [ ] Windows position correctly
- [ ] Multi-monitor support works
- [ ] Maximized windows are unmaximized before positioning
- [ ] No focused window is handled gracefully

**Profile System:**
- [ ] All 9 default profiles load
- [ ] Custom profiles load from ~/.config/zonefancy/
- [ ] Profile switching works
- [ ] State persists across GNOME Shell restarts

**Keyboard Shortcuts:**
- [ ] Super+Left/Right cycle zones
- [ ] Super+grave opens profile picker
- [ ] Super+Up maximizes/restores
- [ ] Super+Down minimizes

**UI:**
- [ ] Profile picker displays correctly
- [ ] ASCII visualizations render properly
- [ ] Current profile is indicated
- [ ] Keyboard navigation works (arrows, Enter, Esc)
- [ ] Notifications appear and auto-dismiss

**Edge Cases:**
- [ ] No focused window
- [ ] Profile with single zone
- [ ] Minimized window handling
- [ ] Different screen resolutions
- [ ] Wayland and X11

## Development Commands

```bash
# Install extension
make install

# Compile GSettings schema
make compile-schema

# Enable extension
make enable

# View logs (while developing)
make logs

# Reload GNOME Shell (X11 only)
make reload

# Full development setup
make dev
```

## Code Style Guidelines

- Use 4 spaces for indentation
- Follow existing GNOME Shell extension patterns
- Add JSDoc comments for public methods
- Use ES6+ features (arrow functions, const/let, etc.)
- Keep files under 500 lines
- One class per file

## Resources

### Essential Documentation
- **Component Specs:** `memory/architecture/component-design.md`
- **API Translation:** `memory/architecture/hammerspoon-translation.md`
- **Profile System:** `memory/api-reference/profiles.md`
- **Keybindings:** `memory/api-reference/keybindings.md`

### GNOME Shell Development
- [GJS Guide](https://gjs.guide/)
- [GNOME Shell Extensions Tutorial](https://gjs.guide/extensions/)
- [Meta Window API](https://gjs-docs.gnome.org/meta13~13/meta.window)
- [St Toolkit](https://gjs-docs.gnome.org/st13/)

### Reference Implementation
- Hammerspoon config: `../shell/dotfiles/hammerspoon/.hammerspoon/init.lua`
- Translation guide: `memory/architecture/hammerspoon-translation.md`

## Common Pitfalls to Avoid

1. **Import Statements**
   - Use ESM imports for GNOME 45+: `import GObject from 'gi://GObject'`
   - Not the old `imports.gi.GObject` style

2. **Context Binding**
   - Always `.bind(this)` when passing methods as callbacks
   - Example: `handler: this._onCycleZoneLeft.bind(this)`

3. **Resource Cleanup**
   - Unregister all keybindings in `disable()`
   - Destroy all UI elements in `disable()`
   - Clear all timers/connections

4. **GSettings Schema**
   - Must compile schema after changes: `make compile-schema`
   - Must restart extension after schema changes

5. **File Paths**
   - Use `import.meta.url` or extension directories
   - User config: `~/.config/zonefancy/profiles.json`
   - Bundled config: `{extension_dir}/config/default-profiles.json`

## Success Criteria

The implementation is complete when:

1. ✅ Extension installs and enables without errors
2. ✅ All keyboard shortcuts work as expected
3. ✅ Windows position correctly in all profiles
4. ✅ Profile picker displays and functions properly
5. ✅ State persists across sessions
6. ✅ Multi-monitor setups work correctly
7. ✅ No errors in GNOME Shell logs
8. ✅ User documentation is complete

## After Implementation

Once core functionality is working:

1. Create user documentation in `docs/`
2. Add screenshots to README
3. Test on different GNOME Shell versions
4. Address any bugs or edge cases
5. Prepare for extensions.gnome.org submission

---

**Current Branch:** `initial_dev`  
**Next Branch:** `implement-core` (for implementation work)  
**Status:** Ready for JavaScript implementation

Use this document as a guide for the next development session.
