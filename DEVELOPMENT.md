# Development Quick Reference

**Zoned GNOME Shell Extension - Developer Guide**

This is a quick reference for developers. For detailed information, see [memory/development/setup.md](memory/development/setup.md).

## Fresh Setup (New System)

```bash
# 1. Clone repository
cd ~/GitHub
git clone https://github.com/hamiltonia/zoned.git
cd zoned

# 2. Complete development setup
make dev

# 3. Reload GNOME Shell
#    Wayland: Log out → Log back in
#    X11: Alt+F2 → type 'r' → Enter
```

That's it! The extension is now installed, compiled, and enabled.

## Makefile Commands

### Essential Commands
| Command | Description |
|---------|-------------|
| `make dev` | **Complete setup**: install + compile schema + enable |
| `make install` | Copy extension files to GNOME extensions directory |
| `make compile-schema` | Compile GSettings schema (required after install) |
| `make logs` | Follow extension logs in real-time (Ctrl+C to stop) |
| `make reload` | Reload GNOME Shell (X11) or show Wayland instructions |

### Additional Commands
| Command | Description |
|---------|-------------|
| `make enable` | Enable the extension |
| `make disable` | Disable the extension |
| `make reinstall` | Uninstall + Install + Compile |
| `make uninstall` | Remove extension from GNOME |
| `make clean` | Remove build artifacts |
| `make zip` | Create distribution package |
| `make help` | Show all available commands |

## VM Development Workflow (Recommended)

**Problem:** On Fedora 43+ Wayland, GNOME Shell reload requires logout/login (~15-30 seconds per test).

**Solution:** Use a Fedora 42 VM with X11 for fast reload with `Alt+F2 → r` (~2-3 seconds per test).

### Quick Start

```bash
# One-time setup (30-45 minutes total):
# 1. Create Fedora 42 VM in GNOME Boxes (see docs/VM-SETUP-GUIDE.md)
# 2. Configure VM:
make vm-init    # Interactive: enter VM IP, username
make vm-setup   # Configures VM environment

# Daily development:
make vm-logs    # Terminal 1: Watch VM logs
code .          # Terminal 2: Edit code
# In VM: Alt+F2 → r → Enter (after each save)
```

### VM Commands

| Command | Description |
|---------|-------------|
| `make vm-init` | **First-time setup**: Create VM configuration |
| `make vm-setup` | **One-time**: Configure VM for development |
| `make vm-install` | Install/update extension in VM |
| `make vm-logs` | Watch extension logs from VM |
| `make vm-dev` | Quick install + reload in VM |

### Detailed VM Setup

See **[docs/VM-SETUP-GUIDE.md](docs/VM-SETUP-GUIDE.md)** for complete step-by-step VM setup instructions.

For deep troubleshooting and advanced tips, see **[memory/development/vm-workflow.md](memory/development/vm-workflow.md)**.

---

## Local Development Workflow

For local development (without VM), use these commands:

### Quick Iteration Cycle

```bash
# 1. Edit code in extension/ directory

# 2. Install changes
make install

# 3. Reload GNOME Shell
make reload          # X11: instant, Wayland: shows logout instructions

# 4. Watch logs for errors
make logs
```

### X11 vs Wayland

**X11 (Recommended for Development):**
- Fast reload: `Alt+F2` → type `r` → Enter (2 seconds)
- Switch to X11: Logout → Click gear → "GNOME on Xorg"

**Wayland (Production Testing):**
- Must log out and log back in after changes
- Use for final testing before release

## Project Structure

```
zoned/
├── extension/                  # Source code (edit here)
│   ├── extension.js           # Entry point
│   ├── metadata.json          # Extension metadata
│   ├── keybindingManager.js   # Keyboard shortcuts
│   ├── layoutManager.js      # Layout system
│   ├── windowManager.js       # Window positioning
│   ├── ui/                    # UI components
│   │   ├── panelIndicator.js  # Top panel icon
│   │   ├── layoutPicker.js   # Layout selector
│   │   ├── conflictDetector.js # Keybinding conflicts
│   │   ├── notificationManager.js
│   │   └── zoneOverlay.js
│   ├── schemas/               # GSettings schema
│   └── config/                # Default layouts
├── memory/                     # Documentation
├── Makefile                   # Build automation
└── README.md                  # User documentation

# Installed location (don't edit directly):
~/.local/share/gnome-shell/extensions/zoned@hamiltonia.me/
```

## Common Tasks

### View Logs

```bash
# Real-time logs (recommended)
make logs

# Recent logs
journalctl -n 100 /usr/bin/gnome-shell | grep -i zoned

# All extension activity
journalctl -b /usr/bin/gnome-shell | grep -i zoned
```

### Test Keybindings

```bash
# Check current settings
gsettings list-recursively org.gnome.shell.extensions.zoned

# Test specific binding
gsettings get org.gnome.shell.extensions.zoned cycle-zone-left

# Reset all settings
gsettings reset-recursively org.gnome.shell.extensions.zoned
```

### Debugging

```bash
# GNOME Looking Glass (interactive JS console)
Alt+F2 → type 'lg' → Enter

# Check if extension is loaded
gnome-extensions list --enabled | grep zoned

# View extension info
gnome-extensions info zoned@hamiltonia.me

# Check for GNOME Shell errors
journalctl -b /usr/bin/gnome-shell | grep -i error
```

### Conflict Resolution

The extension automatically detects conflicts with GNOME's default keybindings.

**Testing conflict detection:**
1. Install extension with `make dev`
2. Check panel indicator (orange = conflicts detected)
3. Click panel → View conflicts
4. Click "Auto-Fix Conflicts"
5. Log out and log back in

**Key alias handling:**
The conflict detector handles aliases like `grave` ↔ `Above_Tab` (both refer to backtick key).

## Prerequisites

**Required:**
- GNOME Shell 49+
- Git
- GLib (glib-compile-schemas)

**Optional but recommended:**
```bash
sudo dnf install dconf-editor          # View/edit GSettings
sudo dnf install gnome-extensions-app  # GUI for managing extensions
```

## File Distribution

### Extension Files (Must be installed)
- All files in `extension/` directory
- Including `metadata.json`, `schemas/`, etc.

### Build Artifacts (Auto-generated)
- `schemas/gschemas.compiled` (generated by `make compile-schema`)

### Development-only
- `memory/` (documentation, not installed)
- `Makefile` (build automation)
- `.gitignore`, `.clinerules`

## Testing Checklist

Before committing changes:

- [ ] `make install` - No errors
- [ ] `make compile-schema` - Schema compiles successfully
- [ ] `make logs` - No JS errors in output
- [ ] Test Super+Left/Right - Windows cycle through zones
- [ ] Test Super+grave - Layout picker opens
- [ ] Test Super+Up - Maximize/restore works
- [ ] Test Super+Down - Minimize works
- [ ] Panel indicator shows status correctly
- [ ] Conflict detection works
- [ ] Auto-fix conflicts works
- [ ] Test on both X11 and Wayland

## Troubleshooting

### Extension won't load
```bash
# Check metadata.json shell-version matches your GNOME version
gnome-shell --version

# Recompile schema
make compile-schema

# Check for errors
make logs
```

### Changes not appearing
```bash
# Ensure you've installed (not just edited source)
make install

# Reload GNOME Shell
make reload

# Verify installed files
ls ~/.local/share/gnome-shell/extensions/zoned@hamiltonia.me/
```

### Keybindings not working
```bash
# Check conflict detector
# Click panel indicator → View conflicts

# Manual conflict check
gsettings get org.gnome.mutter.keybindings toggle-tiled-left
gsettings get org.gnome.desktop.wm.keybindings switch-group
```

## Git Workflow

Per `.clinerules`, always ask for user approval before committing:

```bash
# After making changes
git add <files>

# Prepare commit message with attribution
git commit -m "Description - Modified by Cline"

# Push changes
git push origin main
```

## Quick Tips

1. **Faster development**: Use X11 instead of Wayland
2. **Keep logs open**: Run `make logs` in separate terminal
3. **Test incrementally**: Install and test after small changes
4. **Check Looking Glass**: Great for inspecting runtime state
5. **Use dconf-editor**: Visual GSettings browser
6. **Read console output**: Extension logs everything with `[Zoned]` prefix

## Resources

- [GNOME Shell Extensions](https://gjs.guide/extensions/)
- [GJS Guide](https://gjs.guide/)
- [GNOME API Reference](https://gjs-docs.gnome.org/)
- [Development Setup (Detailed)](memory/development/setup.md)
- [Architecture Overview](memory/architecture/overview.md)
- [Component Design](memory/architecture/component-design.md)

## Support

- 🐛 [Report issues](https://github.com/hamiltonia/zoned/issues)
- 💬 [Discussions](https://github.com/hamiltonia/zoned/discussions)
- 📚 [Full Documentation](memory/)

---

**Last Updated:** 2025-11-21
