![Zoned Banner](zoned-assets/github/github-banner.png)

<div align="center">

# Zoned

**FancyZones-style window management for GNOME Shell**

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![GNOME Shell](https://img.shields.io/badge/GNOME_Shell-46%2B-4A86CF.svg)](https://extensions.gnome.org/)

</div>

---

## What is Zoned?

Inspired by [Windows PowerToys FancyZones](https://learn.microsoft.com/en-us/windows/powertoys/fancyzones), Zoned brings layout-based window management to GNOME. A must-have for ultrawide and super-ultrawide monitors where a simple left/right split isn't enough.

**A helpful in-between:** Zoned sits between full tiling window managers and free-floating windows. Snap windows into predefined zones with keyboard shortcuts, or move them around freely — Zoned won't stop you.

### About This Project

This is a hobby project fulfilling a personal need for better window management on GNOME with a super-ultrawide monitor (5120×1440). Built entirely using agentic AI as a learning opportunity, exploring best practices for code hygiene and development workflow.

## Features

- 🎯 **Layout-Based Window Management** — Built-in templates plus a visual editor for custom layouts
- ⌨️ **Keyboard-First** — Snap windows to zones with shortcuts; layout picker menu also available
- 💾 **State Persistence** — Remembers your layout and zone across sessions
- 🖥️ **Multi-Monitor & Multi-Workspace** — Use different layouts per monitor/workspace, or one layout for all
- 🔧 **Auto-Fix Conflicts** — Detects and resolves keyboard shortcut conflicts with GNOME

## Quick Install

```bash
git clone https://github.com/hamiltonia/zoned.git
cd zoned
make dev
```

Then reload GNOME Shell:
- **Wayland:** Log out → Log back in
- **X11:** `Alt+F2` → type `r` → Enter

## Basic Workflow

1. **Choose a layout:** Press `Super+grave` to open the layout picker
2. **Select a layout** (e.g., "Halves", "Thirds", "Main Left")
3. **Snap windows:** Focus any window and press `Super+Right` to snap it to the next zone
4. **Repeat:** Focus another window, press `Super+Right` again to fill the layout

Your layout choice persists — just snap windows as you open them.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Super+Left` | Snap window to previous zone |
| `Super+Right` | Snap window to next zone |
| `Super+grave` | Open layout picker (backtick key) |
| `Super+Up` | Maximize/restore window |
| `Super+Down` | Minimize window |

> **Note:** `Super` is the Windows key (⊞)

## Built-in Layout Templates

| Layout | Zones |
|--------|-------|
| Center (60%) | 20% / 60% / 20% |
| Balanced (50%) | 25% / 50% / 25% |
| Thirds | 33% / 33% / 33% |
| Halves | 50% / 50% |
| Quarters | 2×2 grid |
| Main Left | 67% / 33% |
| Main Right | 33% / 67% |
| Balanced Left | 40% / 40% / 20% |
| Balanced Right | 20% / 40% / 40% |

### Custom Layouts

Create your own layouts using the **Layout Switcher** and **Zone Editor**:

1. Press `Super+grave` to open the layout picker
2. Click "New Layout" to create a custom layout
3. Use the visual zone editor to define your zones

## Documentation

| Document | Description |
|----------|-------------|
| [DEVELOPMENT.md](DEVELOPMENT.md) | Developer quick reference, Makefile commands |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines, code style, PR process |
| [docs/architecture.md](docs/architecture.md) | Component overview, system design |
| [docs/keybindings.md](docs/keybindings.md) | Complete keyboard shortcut reference |
| [docs/technical-specs.md](docs/technical-specs.md) | Data structures, edge layouts |
| [docs/coding-patterns.md](docs/coding-patterns.md) | Code style guide |
| [docs/vm-setup-guide.md](docs/vm-setup-guide.md) | VM development environment setup |
| [ROADMAP.md](ROADMAP.md) | Planned features and project direction |
| [CHANGELOG.md](CHANGELOG.md) | Version history and release notes |

## Troubleshooting

**Extension not loading?**
```bash
gnome-extensions list --enabled | grep zoned  # Check if enabled
make logs                                      # View errors
gsettings reset-recursively org.gnome.shell.extensions.zoned  # Reset
```

**Keyboard conflicts?** Look for the orange indicator in your panel → Click → "Auto-Fix Conflicts"

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Ways to help:**
- Testing on different GNOME versions
- Bug reports and fixes
- Documentation improvements
- New layout designs

## License

[GNU General Public License v3.0](LICENSE)

## Acknowledgments

- **Windows PowerToys FancyZones** — Original inspiration for zone-based window management
- **Hammerspoon** — Inspiration for solving a similar problem on macOS
- **GNOME Shell** — Excellent extensibility platform

**Coming soon:** Zoned for macOS

---

<div align="center">

🐛 [Report bugs](https://github.com/hamiltonia/zoned/issues) · 💬 [Discussions](https://github.com/hamiltonia/zoned/discussions)

*Not affiliated with Microsoft PowerToys, GNOME, or Hammerspoon*

</div>
