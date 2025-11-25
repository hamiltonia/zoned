# Zoned - Next Steps for Implementation

## Current Status

✅ **Completed:**
- Project structure and configuration
- Comprehensive documentation (memory bank)
- GSettings schema with keybindings
- Default profiles JSON (9 layouts)
- Development workflow (Makefile)
- **Core JavaScript implementation (All phases complete!)**
  - WindowManager - Window positioning and manipulation
  - ProfileManager - Profile loading and state management
  - KeybindingManager - Keyboard shortcut handling
  - NotificationManager - Visual feedback
  - ProfilePicker - Profile selection UI with ASCII visualization
  - Extension.js - Main entry point with proper lifecycle
- **Additional features beyond original plan:**
  - ConflictDetector - Keybinding conflict detection and auto-fix
  - PanelIndicator - Top bar integration with menu
  - ZoneOverlay - Visual zone feedback when cycling

📋 **Current Phase: UI/UX Refinement & Core Features**

This document now serves as a reference for the implementation and checklist for remaining tasks.

**Note:** Testing and documentation phases are postponed until core UI/UX refinements and feature additions are complete.

## ✅ Implementation Complete

### Phase 1: Core Managers ✅ COMPLETE

All core manager components have been implemented:

#### 1. WindowManager (`extension/windowManager.js`) ✅ COMPLETE
**Status:** Fully implemented

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

#### 2. ProfileManager (`extension/profileManager.js`) ✅ COMPLETE
**Status:** Fully implemented

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
- Check for user profiles at `~/.config/zoned/profiles.json`
- Merge user profiles (override by matching `id`)
- Validate all profiles on load
- Use GSettings for state persistence
- Handle wraparound in zone cycling

**Reference:** `memory/architecture/component-design.md` (ProfileManager section)

#### 3. KeybindingManager (`extension/keybindingManager.js`) ✅ COMPLETE
**Status:** Fully implemented

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

### Phase 2: UI Components ✅ COMPLETE

#### 4. NotificationManager (`extension/ui/notificationManager.js`) ✅ COMPLETE
**Status:** Fully implemented

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

#### 5. ProfilePicker (`extension/ui/profilePicker.js`) ✅ COMPLETE
**Status:** Fully implemented

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

### Phase 3: Main Extension Entry Point ✅ COMPLETE

#### 6. Extension (`extension/extension.js`) ✅ COMPLETE
**Status:** Fully implemented

**Required structure (GNOME 45+ ESM format):**
```javascript
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class ZonedExtension {
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

### Additional Features Implemented ✅

Beyond the original plan, these components were added:

#### 7. ConflictDetector (`extension/ui/conflictDetector.js`) ✅ COMPLETE
**Status:** Fully implemented
- Detects keybinding conflicts with GNOME Shell defaults
- Auto-fix capability with backup/restore
- Integration with panel indicator for conflict warnings

#### 8. PanelIndicator (`extension/ui/panelIndicator.js`) ✅ COMPLETE
**Status:** Fully implemented
- Top bar integration showing current profile
- Menu with profile selection
- Conflict status indicator
- About dialog

#### 9. ZoneOverlay (`extension/ui/zoneOverlay.js`) ✅ COMPLETE
**Status:** Fully implemented
- Visual feedback showing zone position when cycling
- Auto-dismiss after 1 second
- Clean, minimal design

## Testing & Validation

### Current Testing Status

**Basic Functionality:**
- [ ] Extension installs without errors (`make install`)
- [ ] Extension enables successfully (`make enable`)
- [ ] No errors in logs on startup (`make logs`)
- [ ] GSettings schema compiles (`make compile-schema`)
- [ ] Profiles load correctly (check logs)
- [ ] Extension survives disable/re-enable cycle

**Window Management:**
- [ ] Zone cycling works (Super+Left/Right)
- [ ] Windows position correctly in zones
- [ ] Multi-monitor support works correctly
- [ ] Maximized windows are unmaximized before positioning
- [ ] No focused window is handled gracefully (no crash)
- [ ] Window dimensions calculated correctly for all monitors

**Profile System:**
- [ ] All 9 default profiles load successfully
- [ ] Custom profiles load from ~/.config/zoned/profiles.json
- [ ] Profile switching works via picker and panel menu
- [ ] State persists across GNOME Shell restarts
- [ ] Profile picker shows correct current profile indicator
- [ ] Zone cycling wraps around correctly

**Keyboard Shortcuts:**
- [ ] Super+Left/Right cycle zones
- [ ] Super+grave opens profile picker
- [ ] Super+Up maximizes/restores window
- [ ] Super+Down minimizes window
- [ ] Keyboard navigation in profile picker (arrows, Enter, Esc)

**UI Components:**
- [ ] Profile picker displays correctly
- [ ] ASCII visualizations render properly
- [ ] Current profile indicated with ● marker
- [ ] Panel indicator shows current profile name
- [ ] Panel indicator shows conflict warning when needed
- [ ] Zone overlay appears on zone cycling
- [ ] Notifications appear and auto-dismiss
- [ ] About dialog displays correctly

**Conflict Detection:**
- [ ] Conflicts detected on startup
- [ ] Conflict notification shown if conflicts exist
- [ ] Conflict details accessible via panel menu
- [ ] Auto-fix creates backup before changes
- [ ] Auto-fix successfully resolves conflicts
- [ ] Restore from backup works correctly

**Edge Cases:**
- [ ] No focused window (shouldn't crash)
- [ ] Profile with single zone (no cycling)
- [ ] Minimized window handling
- [ ] Different screen resolutions
- [ ] Wayland session compatibility
- [ ] X11 session compatibility
- [ ] Multiple monitors with different resolutions
- [ ] Extension works after suspend/resume

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
   - User config: `~/.config/zoned/profiles.json`
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

## Next Steps (Revised Priority Order)

Core implementation is complete, but significant UI/UX work and feature additions are needed before testing.

### Phase 1: UI/UX Refinements (HIGH PRIORITY)

#### 1.1 Profile Picker Redesign ✅ COMPLETE
**Status:** All requirements implemented and tested

**Completed Features:**
- [x] Grid layout (3 columns, scrollable for overflow)
- [x] Monitor aspect ratio-matched cards
  - Cards match current monitor's aspect ratio (16:9, 21:9, etc.)
  - Intuitive visual representation
- [x] Cairo-rendered zone previews
  - Mini zone preview using Cairo in each card
  - Clean, visual representation of zone layout
- [x] ScrollView with mouse wheel support
  - Handles unlimited profile counts
  - Smooth scrolling experience
- [x] Full-screen zone preview overlay
  - Transparent overlay behind picker showing actual zone positions/sizes
  - 4px border width for visibility
  - 12px rounded corners matching GNOME windows
  - System accent color theming
  - Updates on mouse hover and keyboard navigation
  - Reverts to current profile on mouse leave
  - Proper cleanup on all dismissal methods
- [x] Enhanced keyboard shortcuts
  - Number keys 1-9 for quick selection
  - Arrow keys for 2D grid navigation
  - Page Up/Down for scrolling
  - Enter to confirm, Esc to cancel
- [x] Compact design
  - Optimized card padding (10px)
  - Smaller overall footprint
  - All 9 profiles visible without scrolling (typical case)

**Technical Approach:**
```javascript
// Monitor aspect ratio detection
const monitor = global.display.get_monitor_geometry(monitorIndex);
const aspectRatio = monitor.width / monitor.height;
const cardHeight = cardWidth / aspectRatio;

// Zone preview using St.DrawingArea + Cairo
const canvas = new St.DrawingArea({width, height});
canvas.connect('repaint', () => {
    const cr = canvas.get_context();
    // Draw zones with system accent color
});

// Full-screen hover preview
card.connect('enter-event', () => showFullScreenPreview(profile));
card.connect('leave-event', () => hidePreview());
```

**Reference:** See `memory/architecture/component-design.md` and Hammerspoon's `hs.chooser` pattern

#### 1.2 Alert/Notification System Redesign ✅ COMPLETE
**Status:** Fully implemented with dual-notification system

**Completed Features:**
- [x] Redesigned notification system with two distinct types:
  - **Center-screen notifications (ZoneOverlay)**: User-initiated actions
    - 512x512px container with full colorful SVG icon background
    - Text overlaid with shadow effects for readability
    - Used for: window snap, profile switch, minimize/maximize
  - **Top-bar notifications (NotificationManager)**: System messages
    - [Icon] | Message layout with 36px colorful icon
    - Positioned below panel (proper allocation timing)
    - Used for: startup, conflicts, auto-fix results
- [x] Switched from symbolic to colorful branded icons throughout
- [x] Fixed positioning issues (no overlap with panel)
- [x] Optimized assets (SVG only, ~7KB total for all icons)
- [x] Created comprehensive documentation in `memory/development/notification-strategy.md`

**Technical Implementation:**
```javascript
// Center notification (ZoneOverlay)
container = new St.Widget({
    layout_manager: new Clutter.BinLayout(),
    width: 512, height: 512
});
// Watermark icon as background, text overlaid

// Top notification (NotificationManager)  
notification = new St.BoxLayout({
    vertical: false  // Horizontal [Icon] | Message layout
});
// 36px icon, separator, message text
```

**Reference:** `memory/development/notification-strategy.md`

#### 1.3 Panel Indicator Icon Update
- [ ] Change icon from 2x2 grid (`view-grid-symbolic`) to 3-column style
  - Current icon looks too much like Windows
  - Need icon representing column-based layouts
  - Consider custom icon or find better symbolic icon

#### 1.4 Replace System Alerts with Custom MessageDialog ✅ COMPLETE
**Status:** Fully implemented and integrated

**Problem:** Currently using 7 instances of `Main.notify()` and `Main.notifyError()` system notifications
- 2 in `extension/extension.js` (startup warnings, errors)
- 5 in `extension/ui/panelIndicator.js` (conflict messages, about dialog)

**Solution:** Create custom MessageDialog component for consistent, branded UI

**Implementation Steps:**
- [x] Create `extension/ui/messageDialog.js` (see spec for full implementation)
- [x] Support three message types: info, warning, error
- [x] Modal dialog with fade animations
- [x] Multiple dismissal methods (OK button, Esc key, click outside)
- [x] Replace all 7 system notification calls
- [x] Test all dialog types and dismissal methods

**Reference:** `memory/development/message-dialog-spec.md`

#### 1.5 Settings Integration
- [ ] Add "Settings" or "Preferences" menu item to PanelIndicator
- [ ] Settings should be accessible from top bar menu
- [ ] Create settings/preferences dialog framework

### Phase 2: Core Feature Additions (HIGH PRIORITY - AFTER PHASE 1)

#### 2.1 Multi-Desktop & Multi-Monitor Support
**Approach:** Per-Workspace (Option C)
- [ ] Implement per-workspace profile state management
  - Different profile on each workspace/desktop
  - Same profile applies to all monitors within a workspace
- [ ] Add workspace change detection
- [ ] Persist workspace-to-profile mapping in GSettings
- [ ] Handle workspace add/remove events
- [ ] UI: Show current workspace's profile in panel indicator
- [ ] UI: Profile picker should set profile for current workspace only

**Future Enhancement (Option D):** Per-monitor-per-workspace can be added later if needed

**Technical Details:**
```javascript
// State structure
state = {
    workspace0: "halves",
    workspace1: "thirds",
    workspace2: "columns"
    // Each workspace has one profile (applies to all monitors)
}

// GSettings schema addition
<key name="workspace-profiles" type="s">
    <default>'{}'</default>
    <summary>Workspace to profile mapping (JSON)</summary>
</key>
```

#### 2.2 Profile Editor UI
- [ ] Visual editor for creating/modifying profiles
- [ ] Add/remove/resize zones interactively
- [ ] Save custom profiles to `~/.config/zoned/profiles.json`
- [ ] Zone preview while editing (not just ASCII)
- [ ] Profile import/export functionality
- [ ] Validate zone layouts (no overlaps, full coverage, etc.)

#### 2.3 Keyboard Shortcut Editor UI
- [ ] UI for customizing all keybindings
- [ ] Show current bindings in table/list
- [ ] Conflict detection when changing shortcuts
- [ ] Integration with ConflictDetector
- [ ] Save to GSettings
- [ ] Reset to defaults option

### Phase 3: Testing & Validation (AFTER PHASE 1 & 2)

**Only proceed to testing after UI/UX refinements and core features are complete.**

- [ ] Basic functionality testing (see checklist below)
- [ ] Window management testing
- [ ] Profile system testing
- [ ] Keyboard shortcuts testing
- [ ] UI components testing
- [ ] Multi-workspace testing
- [ ] Edge case testing
- [ ] Test on GNOME Shell versions (45, 46, 47)
- [ ] Test on Wayland and X11 sessions
- [ ] Test with different monitor configurations

### Phase 4: Documentation & Polish (AFTER PHASE 3)

- [ ] Create user documentation in `docs/`
- [ ] Add screenshots/GIFs to README
- [ ] Document custom profile creation
- [ ] Create troubleshooting guide
- [ ] Review all console.log statements
- [ ] Add comprehensive error handling
- [ ] Performance testing and optimization
- [ ] Code review and cleanup

### Phase 5: Packaging & Distribution (FINAL)

- [ ] Test packaging with `make pack`
- [ ] Validate metadata.json
- [ ] Prepare for extensions.gnome.org submission
- [ ] Create release notes
- [ ] Tag release version

### Future Enhancements (Post-Release)

- [ ] Per-monitor-per-workspace profiles (Option D)
- [ ] Window resize animations
- [ ] Integration with window rules/app preferences
- [ ] Custom zone templates
- [ ] Zone snapping with drag-and-drop

---

**Current Branch:** `main`  
**Status:** Core implementation complete ✅ - Ready for testing and refinement

**Last Updated:** 2025-11-22
