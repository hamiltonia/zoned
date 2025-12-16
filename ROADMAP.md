# Zoned Development Roadmap

**Current Status:** Pre-release (v1.0 development)  
**Branch:** `initial_dev`

## v1.0 Release

### Remaining Work

**Code Quality:**
- [ ] Review GSettings schema naming for consistency
- [ ] Final testing pass on X11 and Wayland

**Documentation:**
- [x] README review and update for v1.0 features

### Known Issues

None critical at this time.

---

## Architecture Overview

### Core Components

| Component | Purpose |
|-----------|---------|
| **LayoutManager** | Layout state, zone cycling, persistence |
| **WindowManager** | Window positioning, multi-monitor |
| **KeybindingManager** | Keyboard shortcut registration |
| **SpatialStateManager** | Per-workspace/monitor layouts |
| **TemplateManager** | Built-in layout templates |

### UI Components

| Component | Purpose |
|-----------|---------|
| **LayoutSwitcher** | Grid picker for layout selection |
| **ZoneEditor** | Full-screen edge-based layout editor |
| **PanelIndicator** | Top bar icon and menu |
| **ZoneOverlay** | Visual zone preview during drag |
| **NotificationManager** | OSD-style notifications |

### Key Features

- **Zone cycling:** Super+Left/Right to move windows between zones
- **Layout picker:** Super+` for visual layout selection
- **Custom layouts:** Create and edit via full-screen editor
- **Per-space layouts:** Different layouts per workspace×monitor
- **Quick shortcuts:** Super+Ctrl+Alt+1-9 for instant layout switching
- **Conflict detection:** Auto-detect and fix GNOME keybinding conflicts

---

## Post-v1.0 Roadmap

### v1.1: UX Improvements
- Add screenshots to README (Layout Switcher, Zone Editor)
- Revisit default layout templates (current set was placeholder)
- Child dialog behavior refinement
- Workspace switcher integration improvements
- Monitor hot-plug handling

### v1.2: Advanced Features
- Per-layout keyboard shortcuts
- Layout padding/margin controls
- Window rules (per-app layout preferences)
- Import/export layouts
- Document JSON format for custom layouts (power users)

### v1.3: Polish
- Animated window transitions (optional)
- Localization support
- Extension preferences cleanup

---

## Development

```bash
# Quick setup
make dev

# Watch logs
make logs

# VM development (recommended for fast iteration)
make vm-init
make vm-setup
make vm-logs
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for details.

## Documentation

- [docs/architecture.md](docs/architecture.md) - Component design
- [docs/technical-specs.md](docs/technical-specs.md) - Edge layouts, per-space system
- [docs/coding-patterns.md](docs/coding-patterns.md) - Code style guide
- [docs/keybindings.md](docs/keybindings.md) - Keyboard shortcuts
- [docs/vm-setup-guide.md](docs/vm-setup-guide.md) - VM setup for development
