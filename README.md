# Zoned

A GNOME Shell extension that brings FancyZones-style window management to Linux. Organize windows into customizable zones with keyboard-driven workflows.

**Inspired by PowerToys Fancy Zones**

## Features

- 🎯 **Profile-Based Layouts** - 9 built-in profiles plus custom profile support
- ⌨️ **Keyboard-First** - Cycle through zones with simple keyboard shortcuts
- 💾 **State Persistence** - Remembers your profile and zone across sessions
- 🎨 **Visual Profile Picker** - Quick profile switching with ASCII previews
- 🔧 **Auto-Fix Conflicts** - Detects and resolves keyboard shortcut conflicts with GNOME
- 🖥️ **Multi-Monitor Ready** - Works seamlessly with multiple displays
- ⚙️ **Customizable** - Define your own zone layouts via JSON

## What is Zoned?

Zoned provides Windows PowerToys FancyZones-like functionality for GNOME. Instead of dragging windows to snap them, you use keyboard shortcuts to cycle through predefined zones in your chosen profile.

**Inspiration:** This project brings the profile-based window management workflow I created with Hammerspoon on macOS to Linux/GNOME.

## Installation

### Prerequisites

- GNOME Shell 49+
- Fedora or other Linux distribution with GNOME

### Quick Install from Source

```bash
# Clone repository
git clone https://github.com/hamiltonia/zoned.git
cd zoned

# Complete setup: install + compile schema + enable
make dev

# Log out and log back in (Wayland) or reload GNOME Shell (X11)
# Wayland: Top-right → Power → Log Out
# X11: Alt+F2 → type 'r' → Enter
```

### Manual Install

```bash
# Clone repository
git clone https://github.com/hamiltonia/zoned.git
cd zoned

# Install extension files
make install

# Compile GSettings schema (required)
make compile-schema

# Enable extension
make enable

# Or manually enable via GNOME Extensions app
```

### Install from extensions.gnome.org

*(Coming soon)*

## Quick Start

### Default Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Super+Left` | Cycle to previous zone |
| `Super+Right` | Cycle to next zone |
| `Super+grave` | Open profile picker (backtick key) |
| `Super+Up` | Maximize/restore window |
| `Super+Down` | Minimize window |

**Note:** `Super` is the Windows key (⊞)

### Basic Workflow

1. Open some windows
2. Focus a window you want to position
3. Press `Super+grave` to open the profile picker
4. Select a profile (e.g., "Halves")
5. Press `Super+Right` to cycle through zones
6. Window positions itself in each zone as you cycle

### Example: Setting Up a Coding Layout

```
1. Open profile picker (Super+grave)
2. Select "Main Left" profile (67% left, 33% right)
3. Focus your code editor
4. Press Super+Right → Editor fills left 67%
5. Focus your terminal
6. Press Super+Right → Terminal fills right 33%
```

## Built-in Profiles

1. **Center Focus (60%)** - Center window with narrow sides (20/60/20)
2. **Balanced Focus (50%)** - Balanced center with sides (25/50/25)
3. **Thirds** - Three equal columns (33/33/33)
4. **Halves** - Two equal columns (50/50)
5. **Quarters** - Four quadrants (2×2 grid)
6. **Main Left** - Large left, small right (67/33)
7. **Main Right** - Small left, large right (33/67)
8. **Balanced Left** - Two left, one right (40/40/20)
9. **Balanced Right** - One left, two right (20/40/40)

## Custom Profiles

Create your own layouts by editing:
`~/.config/zoned/profiles.json`

Example custom profile:

```json
{
  "profiles": [
    {
      "id": "my_custom",
      "name": "My Custom Layout",
      "zones": [
        {"name": "Left 40%", "x": 0, "y": 0, "w": 0.4, "h": 1},
        {"name": "Right 60%", "x": 0.4, "y": 0, "w": 0.6, "h": 1}
      ]
    }
  ]
}
```

See [Profile Documentation](docs/customization.md) for details.

## Documentation

- [Installation Guide](docs/installation.md)
- [Usage Guide](docs/usage.md)
- [Customization](docs/customization.md)
- [Keyboard Shortcuts](memory/api-reference/keybindings.md)
- [Profile API](memory/api-reference/profiles.md)

### For Developers

- [Architecture Overview](memory/architecture/overview.md)
- [Development Setup](memory/development/setup.md)
- [Component Design](memory/architecture/component-design.md)
- [Contributing Guidelines](CONTRIBUTING.md)

## Troubleshooting

### Extension Not Loading

```bash
# Check if extension is enabled
gnome-extensions list --enabled | grep zoned

# View logs for errors
journalctl -f -o cat /usr/bin/gnome-shell | grep -i zoned

# Reset to defaults
gsettings reset-recursively org.gnome.shell.extensions.zoned
```

### Keyboard Shortcuts Conflicting

Zoned includes automatic conflict detection and resolution!

**Using the Panel Indicator (Recommended):**
1. Look for the orange grid icon in your top panel
2. Click on it to view detected conflicts
3. Click "Auto-Fix Conflicts" to automatically disable conflicting GNOME shortcuts
4. Log out and log back in to apply changes

**Manual Fix:**

If you prefer to disable conflicts manually:

```bash
# Disable GNOME's default tiling shortcuts
gsettings set org.gnome.mutter.keybindings toggle-tiled-left "[]"
gsettings set org.gnome.mutter.keybindings toggle-tiled-right "[]"

# Disable GNOME's switch-group shortcut (for Super+grave)
gsettings set org.gnome.desktop.wm.keybindings switch-group "[]"

# Disable GNOME's maximize shortcut (optional)
gsettings set org.gnome.desktop.wm.keybindings maximize "[]"

# Disable GNOME's minimize shortcut (optional)
gsettings set org.gnome.desktop.wm.keybindings minimize "[]"
```

**Note:** The conflict detector handles key name aliases (e.g., `grave` and `Above_Tab` both refer to the backtick key) to ensure accurate detection.

See [Troubleshooting Guide](docs/troubleshooting.md) for more help.

## Development

```bash
# Install for development (symlink)
make install

# View logs
make logs

# Reload extension (X11 only)
make reload

# Run tests
make test
```

For detailed development setup, see [Development Guide](memory/development/setup.md).

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

Areas where help is appreciated:
- Testing on different GNOME versions
- Additional profile designs
- UI/UX improvements
- Bug reports and fixes
- Documentation improvements

## Roadmap

- [x] Core zone cycling functionality
- [x] Profile system with 9 default profiles
- [x] State persistence
- [x] Profile picker UI
- [ ] Preferences UI for visual profile editing
- [ ] Per-application profile assignments
- [ ] Zone preview overlay
- [ ] Animated transitions (optional)
- [ ] Wayland optimization

## License

GNU General Public License v3.0 - see [LICENSE](LICENSE) for details.

## Acknowledgments

- **Windows PowerToys FancyZones** - Original inspiration for zone-based window management
- **GNOME Shell** - Excellent extensibility platform
- **Hammerspoon** - macOS automation tool used to prototype the initial implementation

## Support

- 🐛 [Report bugs](https://github.com/hamiltonia/zoned/issues)
- 💬 [Discussions](https://github.com/hamiltonia/zoned/discussions)
- 📧 Contact: [GitHub Profile](https://github.com/hamiltonia)

---

**Note:** This is an independent project and is not affiliated with Microsoft PowerToys, GNOME, or Hammerspoon.
