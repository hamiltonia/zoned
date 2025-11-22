# Keyboard Shortcuts Reference

Complete reference for ZoneFancy keyboard shortcuts and keybinding customization.

## Default Keybindings

### Zone Management

| Shortcut | Action | Description |
|----------|--------|-------------|
| `Super+Left` | Cycle Zone Left | Move window to previous zone in current profile |
| `Super+Right` | Cycle Zone Right | Move window to next zone in current profile |
| `Super+grave` | Profile Picker | Open profile selection dialog |

**Note:** `Super` is the Windows key (⊞) on most keyboards.

### Window Management

| Shortcut | Action | Description |
|----------|--------|-------------|
| `Super+Up` | Maximize/Restore | Toggle window maximize state |
| `Super+Down` | Minimize | Minimize focused window |

## Keybinding Behavior

### Zone Cycling

**Wraparound:**
- Pressing `Super+Right` on the last zone cycles back to the first zone
- Pressing `Super+Left` on the first zone cycles to the last zone

**Example with Halves profile (2 zones):**
```
Zone 1 (Left) →[Super+Right]→ Zone 2 (Right) →[Super+Right]→ Zone 1 (Left)
              ←[Super+Left]←                  ←[Super+Left]←
```

**State Persistence:**
- Current zone position is saved to GSettings
- Persists across GNOME Shell restarts
- Each profile remembers its last active zone

### Profile Picker

**Opening:**
- Press `Super+grave` (backtick/tilde key)
- Dialog appears centered on screen
- Current profile is highlighted with ●

**Navigation:**
- `Up/Down` arrows: Navigate profile list
- `Enter`: Select highlighted profile
- `Esc`: Cancel and close picker
- Mouse click: Select profile

**Selection Effects:**
- Switches to selected profile
- Resets to first zone in new profile
- Shows notification: "Switched to: [Profile Name

]"
- Saves to GSettings

### Maximize/Restore

**Super+Up behavior:**

1. **If window is not maximized:**
   - Maximizes the focused window
   - Shows notification: "Maximized"

2. **If window is already maximized:**
   - Restores to previous size/position
   - Shows notification: "Restored"

3. **If no focused window:**
   - Attempts to restore most recent minimized window
   - Shows notification: "Restored" (if successful)

### Minimize

**Super+Down behavior:**

1. **If window is focused:**
   - Minimizes the window
   - Shows notification: "Minimized"

2. **If no focused window:**
   - No action taken
   - No notification shown

## Customizing Keybindings

### Via GSettings Schema

Keybindings are defined in the GSettings schema and can be customized.

**Schema location:**
`~/.local/share/gnome-shell/extensions/zonefancy@hamiltonia/schemas/org.gnome.shell.extensions.zonefancy.gschema.xml`

**Default schema:**
```xml
<key name="cycle-zone-left" type="as">
    <default>['&lt;Super&gt;Left']</default>
    <summary>Cycle to previous zone</summary>
</key>

<key name="cycle-zone-right" type="as">
    <default>['&lt;Super&gt;Right']</default>
    <summary>Cycle to next zone</summary>
</key>

<key name="show-profile-picker" type="as">
    <default>['&lt;Super&gt;grave']</default>
    <summary>Open profile picker</summary>
</key>

<key name="minimize-window" type="as">
    <default>['&lt;Super&gt;Down']</default>
    <summary>Minimize window</summary>
</key>

<key name="maximize-window" type="as">
    <default>['&lt;Super&gt;Up']</default>
    <summary>Maximize or restore window</summary>
</key>
```

### Using gsettings Command

```bash
# View current keybindings
gsettings get org.gnome.shell.extensions.zonefancy cycle-zone-left
gsettings get org.gnome.shell.extensions.zonefancy cycle-zone-right

# Change keybinding
gsettings set org.gnome.shell.extensions.zonefancy cycle-zone-left "['<Super><Shift>Left']"

# Reset to default
gsettings reset org.gnome.shell.extensions.zonefancy cycle-zone-left

# View all extension settings
gsettings list-keys org.gnome.shell.extensions.zonefancy
```

### Using dconf-editor

1. Install: `sudo dnf install dconf-editor`
2. Launch: `dconf-editor`
3. Navigate to: `/org/gnome/shell/extensions/zonefancy/`
4. Click on keybinding to edit
5. Enter new key combination

### Custom Keybinding Examples

**Alternative zone cycling (Ctrl+Alt instead of Super):**
```bash
gsettings set org.gnome.shell.extensions.zonefancy cycle-zone-left "['<Ctrl><Alt>Left']"
gsettings set org.gnome.shell.extensions.zonefancy cycle-zone-right "['<Ctrl><Alt>Right']"
```

**Profile picker with F-key:**
```bash
gsettings set org.gnome.shell.extensions.zonefancy show-profile-picker "['<Super>F12']"
```

**Multiple keybindings for one action:**
```bash
gsettings set org.gnome.shell.extensions.zonefancy cycle-zone-right "['<Super>Right', '<Super><Shift>period']"
```

## Keybinding Modifiers

### Available Modifiers

| Modifier | Symbol | Key |
|----------|--------|-----|
| Super | `<Super>` | Windows/Command key |
| Control | `<Ctrl>` or `<Control>` | Ctrl key |
| Alt | `<Alt>` | Alt key |
| Shift | `<Shift>` | Shift key |

### Modifier Combinations

You can combine multiple modifiers:
- `<Super><Shift>Left`
- `<Ctrl><Alt>Right`
- `<Super><Ctrl><Shift>Up`

### Key Names

Common key names:
- Arrow keys: `Left`, `Right`, `Up`, `Down`
- Function keys: `F1`, `F2`, ..., `F12`
- Letter keys: `a`, `b`, ..., `z`
- Number keys: `0`, `1`, ..., `9`
- Special: `grave` (backtick), `minus`, `equal`, `Return`, `space`

**Full list:** See GTK+ key constants documentation

## Conflict Detection

### Checking for Conflicts

GNOME Shell will warn if keybindings conflict with:
- System keybindings
- Other extension keybindings
- Application keybindings

**Check current system keybindings:**
```bash
# List all keybindings
gsettings list-recursively org.gnome.desktop.wm.keybindings
gsettings list-recursively org.gnome.shell.keybindings

# Check for specific key
gsettings list-recursively | grep -i "super.*left"
```

### Common Conflicts

**Super+Left/Right:**
- Default GNOME: Tile window left/right
- Solution: Disable GNOME tiling or use different keys

**To disable GNOME window tiling:**
```bash
gsettings set org.gnome.mutter.keybindings toggle-tiled-left "[]"
gsettings set org.gnome.mutter.keybindings toggle-tiled-right "[]"
```

**Super+Up:**
- Default GNOME: Maximize window
- ZoneFancy: Also maximizes (similar behavior)
- Usually not a conflict

**Super+Down:**
- Default GNOME: May be unbound or minimize
- Check: `gsettings get org.gnome.desktop.wm.keybindings minimize`

## Keybinding Registration

### How It Works (Internal)

ZoneFancy registers keybindings in `keybindingManager.js`:

```javascript
Main.wm.addKeybinding(
    'cycle-zone-left',           // Action name (from GSettings)
    this._settings,              // GSettings object
    Meta.KeyBindingFlags.NONE,   // Flags
    Shell.ActionMode.NORMAL,     // When active
    this._onCycleZoneLeft.bind(this)  // Handler function
);
```

**Action Modes:**
- `NORMAL`: Desktop/window management mode
- `OVERVIEW`: Activities overview mode
- `ALL`: All modes

ZoneFancy uses `NORMAL` mode only (active when managing windows).

### Keybinding Lifecycle

1. **Enable:**
   - Extension reads keybindings from GSettings
   - Registers each action with GNOME Shell
   - Binds handler functions

2. **Runtime:**
   - User presses key combination
   - GNOME Shell checks for matching keybinding
   - Calls ZoneFancy handler if matched
   - Handler performs action

3. **Disable:**
   - Extension unregisters all keybindings
   - GNOME Shell no longer intercepts keys
   - Keys return to default behavior

## Troubleshooting

### Keybindings Not Working

**1. Check if extension is enabled:**
```bash
gnome-extensions list --enabled | grep zonefancy
```

**2. Check keybinding registration:**
```bash
# View in Looking Glass (Alt+F2, type 'lg')
# Then in Evaluator:
Main.wm._allowedKeybindings
```

**3. Check for errors in logs:**
```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep -i zonefancy
```

**4. Reset to defaults:**
```bash
gsettings reset-recursively org.gnome.shell.extensions.zonefancy
```

**5. Restart GNOME Shell:**
- X11: `Alt+F2`, type `r`, press Enter
- Wayland: Log out and log back in

### Keys Not Registering

**Problem:** Pressing key combination does nothing.

**Solutions:**
1. Check for conflicts with other keybindings
2. Verify key combination syntax is correct
3. Ensure modifiers are properly specified
4. Try different key combination

**Test keybinding syntax:**
```bash
# Valid
gsettings set org.gnome.shell.extensions.zonefancy cycle-zone-left "['<Super>Left']"

# Invalid (missing quotes, brackets)
gsettings set org.gnome.shell.extensions.zonefancy cycle-zone-left <Super>Left
```

### Profile Picker Won't Open

**Backtick/grave key not working:**

Some keyboard layouts have backtick on different keys.

**Alternatives:**
```bash
# Use a different key
gsettings set org.gnome.shell.extensions.zonefancy show-profile-picker "['<Super>space']"
```

## Best Practices

1. **Avoid Core System Keys:**
   - Don't override critical system functions
   - Avoid `Super+Tab`, `Super+Esc`, `Alt+Tab`, etc.

2. **Use Consistent Modifiers:**
   - Stick with Super for window management
   - Maintain consistency with GNOME defaults

3. **Consider Ergonomics:**
   - Prefer easy-to-reach key combinations
   - Arrow keys are natural for directional actions
   - Avoid complex multi-modifier combinations

4. **Test Thoroughly:**
   - Test on different keyboard layouts
   - Verify no conflicts with frequent applications
   - Check both X11 and Wayland

5. **Document Custom Keybindings:**
   - Keep notes on customizations
   - Share configurations if useful to others

## Future Enhancements

Potential keybinding features for future versions:

- Per-monitor zone cycling
- Direct zone selection (e.g., Super+1, Super+2)
- Custom actions (move and resize in one step)
- Temporary profile switch (hold key)
- Zone preview overlay

---
*Last Updated: 2025-11-21*
