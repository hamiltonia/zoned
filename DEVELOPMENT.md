# Development Quick Reference

**Zoned GNOME Shell Extension - Developer Guide**

This is a quick reference for developers. For detailed architecture and coding patterns, see the [docs/](docs/) directory.

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
./scripts/vm logs    # Terminal 1: Watch VM logs
code .          # Terminal 2: Edit code
# In VM: Alt+F2 → r → Enter (after each save)
```

### VM Commands

| Command | Description |
|---------|-------------|
| `make vm-init` | **First-time setup**: Create VM configuration |
| `make vm-setup` | **One-time**: Configure VM for development |
| `make vm-install` | Install/update extension in VM |
| `./scripts/vm logs` | Watch extension logs from VM |
| `make vm-install` | Quick install + reload in VM |

### Detailed VM Setup

See **[docs/vm-setup-guide.md](docs/vm-setup-guide.md)** for complete step-by-step VM setup instructions.


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
│   ├── layoutManager.js       # Layout system
│   ├── windowManager.js       # Window positioning
│   ├── ui/                    # UI components
│   │   ├── panelIndicator.js  # Top panel icon
│   │   ├── layoutSwitcher.js  # Layout picker
│   │   ├── zoneEditor.js      # Full-screen editor
│   │   ├── conflictDetector.js
│   │   └── notificationManager.js
│   ├── schemas/               # GSettings schema
│   └── config/                # Default layouts
├── docs/                       # Documentation
├── scripts/                    # Development scripts
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
- GNOME Shell 46+ (supports 46, 47, 48, 49)
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
- `docs/` (documentation, not installed)
- `scripts/` (development scripts)
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

```bash
# After making changes
git status                    # Review what changed
git add <files>               # Stage specific files
git add -A                    # Or stage all changes

# Commit with proper attribution (in body, not title)
git commit -m "Brief description of change" -m "Modified by Cline"

# Push changes
git push origin <branch>
```

**Note:** Per `.clinerules`, attribution ("Modified by Cline") belongs in the commit body, not the title.

## Quick Tips

1. **Faster development**: Use X11 instead of Wayland
2. **Keep logs open**: Run `make logs` in separate terminal
3. **Test incrementally**: Install and test after small changes
4. **Check Looking Glass**: Great for inspecting runtime state
5. **Use dconf-editor**: Visual GSettings browser
6. **Read console output**: Extension logs everything with `[Zoned]` prefix

## Resources

**Project Documentation:**
- [Architecture](docs/architecture.md) - Component overview
- [Technical Specs](docs/technical-specs.md) - Edge layouts, per-space system
- [Coding Patterns](docs/coding-patterns.md) - Code style guide
- [Keybindings](docs/keybindings.md) - Keyboard shortcuts

**External References:**
- [GNOME Shell Extensions](https://gjs.guide/extensions/)
- [GJS Guide](https://gjs.guide/)
- [GNOME API Reference](https://gjs-docs.gnome.org/)

## Support

- 🐛 [Report issues](https://github.com/hamiltonia/zoned/issues)
- 💬 [Discussions](https://github.com/hamiltonia/zoned/discussions)

## Squad (AI Agent Team)

Zoned uses [Squad](https://github.com/bradygaster/squad) for AI-assisted development via GitHub Copilot. The team lives in `.squad/` and persists across sessions.

### Team Members

| Agent | Role | Domain |
|-------|------|--------|
| keaton | Lead / Architect | Scope, priorities, code review, triage |
| fenster | GNOME/GJS Specialist | GObject, Clutter, Meta/Mutter, extension lifecycle |
| edie | TypeScript Engineer | Types, Rollup build, `@girs/*` imports |
| hockney | Tester | VM integration tests, D-Bus debug, memory leaks |
| verbal | UI/UX Developer | Zone editor, layout switcher, panel indicator, CSS |
| mcmanus | Documentation | README, CONTRIBUTING, DEVELOPMENT, docs/ |
| baer | Security & CI | ESLint, GitHub Actions, security patterns, releases |
| kobayashi | Multi-monitor & Wayland | Display config, X11/Wayland compat, workspaces |

### Usage

Open GitHub Copilot and select the Squad agent:

```bash
copilot --agent squad
```

Or in VS Code, select Squad from the agent list in Copilot Chat.

### Issue Triage

Label an issue with `squad` to trigger automatic triage. keaton (Lead) will analyze the issue and assign it to the right team member via `squad:{name}` labels.

Ralph's watch mode can also auto-triage on a schedule:

```bash
npx squad triage                    # One-shot triage
npx squad triage --execute          # Triage + dispatch agents
npx squad triage --interval 10      # Poll every 10 minutes
```

### Key Commands

```bash
npx squad status    # Check team status
npx squad doctor    # Diagnose setup issues
npx squad nap       # Compress/prune session logs
```
