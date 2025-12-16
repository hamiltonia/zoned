# Keybindings Reference

Complete keyboard shortcut reference for Zoned.

## Default Keybindings

### Zone Cycling

| Shortcut | Action | Description |
|----------|--------|-------------|
| `Super+Left` | Cycle zone left | Move window to previous zone (wraps around) |
| `Super+Right` | Cycle zone right | Move window to next zone (wraps around) |
| `Super+Alt+Left` | Cycle zone left (alt) | Alternative binding for zone cycling |
| `Super+Alt+Right` | Cycle zone right (alt) | Alternative binding for zone cycling |

### Window Actions

| Shortcut | Action | Description |
|----------|--------|-------------|
| `Super+Up` | Maximize/Restore | Toggle maximize state |
| `Super+Down` | Minimize | Minimize focused window |

### Layout Picker

| Shortcut | Action | Description |
|----------|--------|-------------|
| `Super+`` | Show layout picker | Open the layout selection dialog |

### Quick Layout Switching

| Shortcut | Action | Description |
|----------|--------|-------------|
| `Super+Ctrl+Alt+1` | Quick layout 1 | Apply first layout |
| `Super+Ctrl+Alt+2` | Quick layout 2 | Apply second layout |
| `Super+Ctrl+Alt+3` | Quick layout 3 | Apply third layout |
| `Super+Ctrl+Alt+4` | Quick layout 4 | Apply fourth layout |
| `Super+Ctrl+Alt+5` | Quick layout 5 | Apply fifth layout |
| `Super+Ctrl+Alt+6` | Quick layout 6 | Apply sixth layout |
| `Super+Ctrl+Alt+7` | Quick layout 7 | Apply seventh layout |
| `Super+Ctrl+Alt+8` | Quick layout 8 | Apply eighth layout |
| `Super+Ctrl+Alt+9` | Quick layout 9 | Apply ninth layout |

Quick layout shortcuts are assigned per-layout in the layout settings dialog. Edit a layout and assign it to one of the 1-9 slots.

## Layout Picker Shortcuts

When the layout picker is open:

| Key | Action |
|-----|--------|
| `1-9` | Select layout by number |
| `Arrow keys` | Navigate grid |
| `Enter` | Confirm selection |
| `Escape` | Cancel and close |
| `Tab` | Move focus |

## Zone Editor Shortcuts

When the zone editor is open:

| Action | Interaction |
|--------|-------------|
| Click zone | Split horizontally |
| Shift+click zone | Split vertically |
| Drag edge | Resize adjacent zones |
| Ctrl+click edge | Delete edge (merge zones) |
| `E` | Open layout settings |
| `Escape` | Cancel without saving |
| `Enter` | Save and close |

## Settings

### Accessing Preferences

1. Open Extensions app (or GNOME Extensions website)
2. Click gear icon on Zoned
3. Configure settings

### Debug Settings

Hidden debug settings are available for development and troubleshooting:

| Shortcut | Location | Action |
|----------|----------|--------|
| `Ctrl+Shift+D` | In Preferences | Toggle debug settings visibility |

Once enabled, debug settings appear in preferences:
- **Debug Layout Rectangles** - Show zone boundary overlays
- **Debug Measurement UI** - Display sizing and measurement info

**Debug shortcuts in Layout Picker:**

| Key | Action |
|-----|--------|
| `Ctrl+T` | Cycle display tiers |
| `Ctrl+D` | Toggle debug rectangles |
| `Ctrl+O` | Toggle overlay mode |

## Customizing Keybindings

### Via Preferences

1. Open Extensions app
2. Click gear icon on Zoned
3. Navigate to Keybindings section
4. Click a shortcut to change it

### Via Command Line

```bash
# View current keybinding
gsettings get org.gnome.shell.extensions.zoned cycle-zone-left

# Set keybinding
gsettings set org.gnome.shell.extensions.zoned cycle-zone-left "['<Super>Left']"

# Set multiple bindings for same action
gsettings set org.gnome.shell.extensions.zoned cycle-zone-left "['<Super>Left', '<Alt>Left']"

# Disable a keybinding
gsettings set org.gnome.shell.extensions.zoned cycle-zone-left "[]"
```

### Available GSettings Keys

| Key | Type | Default |
|-----|------|---------|
| `show-layout-picker` | as | `['<Super>grave']` |
| `cycle-zone-left` | as | `['<Super>Left']` |
| `cycle-zone-right` | as | `['<Super>Right']` |
| `cycle-zone-alt-left` | as | `['<Super><Alt>Left']` |
| `cycle-zone-alt-right` | as | `['<Super><Alt>Right']` |
| `maximize-window` | as | `['<Super>Up']` |
| `minimize-window` | as | `['<Super>Down']` |
| `quick-layout-1` | as | `['<Super><Ctrl><Alt>1']` |
| `quick-layout-2` | as | `['<Super><Ctrl><Alt>2']` |
| ... | ... | ... |
| `quick-layout-9` | as | `['<Super><Ctrl><Alt>9']` |

## Modifier Key Reference

| Key | Meaning |
|-----|---------|
| `<Super>` | Windows/Meta key |
| `<Ctrl>` | Control key |
| `<Alt>` | Alt key |
| `<Shift>` | Shift key |

### Keybinding Format Examples

```
<Super>Left          → Super + Left Arrow
<Super><Alt>Right    → Super + Alt + Right Arrow
<Super><Ctrl><Alt>1  → Super + Ctrl + Alt + 1
<Shift>grave         → Shift + Backtick
```

## Conflict Detection

Zoned automatically detects conflicts with GNOME's default keybindings.

### Common Conflicts

| Zoned Binding | GNOME Default | Resolution |
|---------------|---------------|------------|
| `Super+Left` | Tile left | Zoned disables GNOME's |
| `Super+Right` | Tile right | Zoned disables GNOME's |
| `Super+Up` | Maximize | Zoned overrides |
| `Super+Down` | Minimize | Zoned overrides |

### Conflict Indicator

The panel indicator shows conflict status:
- **Normal icon:** No conflicts
- **Warning icon:** Conflicts detected

Click the panel indicator to see conflict details and auto-fix options.

### Auto-Fix Conflicts

Zoned can automatically disable conflicting GNOME keybindings:

1. Click panel indicator
2. Select "View Conflicts"
3. Click "Auto-Fix All"

This modifies the following GSettings keys:
- `org.gnome.mutter.keybindings toggle-tiled-left`
- `org.gnome.mutter.keybindings toggle-tiled-right`
- `org.gnome.desktop.wm.keybindings switch-group`

### Manual Conflict Resolution

```bash
# Disable GNOME's tile left/right
gsettings set org.gnome.mutter.keybindings toggle-tiled-left "[]"
gsettings set org.gnome.mutter.keybindings toggle-tiled-right "[]"

# Restore GNOME defaults
gsettings reset org.gnome.mutter.keybindings toggle-tiled-left
gsettings reset org.gnome.mutter.keybindings toggle-tiled-right
```

## Keybinding Aliases

Some keys have multiple names that are treated as equivalent:

| Alias | Actual Key |
|-------|------------|
| `grave` | Backtick (`) |
| `Above_Tab` | Key above Tab (also backtick) |

The conflict detector handles these aliases when checking for conflicts.

## Recommended Workflow

### Basic Usage

1. `Super+`` to open layout picker
2. Use `1-9` to quickly select a layout
3. `Super+Left/Right` to cycle through zones

### Power User

1. Set up `Super+Ctrl+Alt+1-9` for your favorite layouts
2. Use `Super+Alt+Left/Right` for zone cycling (leaves Super+Left/Right for GNOME)
3. Enable per-space layouts for workspace-specific configurations

### Minimal Conflicts

If you prefer to keep GNOME's default tiling:

```bash
# Use Alt variants only
gsettings set org.gnome.shell.extensions.zoned cycle-zone-left "['<Super><Alt>Left']"
gsettings set org.gnome.shell.extensions.zoned cycle-zone-right "['<Super><Alt>Right']"
```

## Related Documentation

- [architecture.md](architecture.md) - Component overview
- [technical-specs.md](technical-specs.md) - GSettings schema reference
