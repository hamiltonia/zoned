# Development Environment Setup

Guide for setting up a development environment for Zoned GNOME Shell extension.

**Quick Start:** Clone repo → `make dev` → Log out/in (Wayland) or Alt+F2→'r' (X11)

## Prerequisites

### System Requirements
- **Fedora** (or other Linux distribution with GNOME)
- **GNOME Shell** version 49+
- **GJS** (GNOME JavaScript bindings) - usually pre-installed
- **Git** for version control

### Check GNOME Shell Version
```bash
gnome-shell --version
```

Expected output: `GNOME Shell 49.x` or higher

### Required Tools
```bash
# Development tools
sudo dnf install git gnome-extensions-app

# Optional but recommended
sudo dnf install gnome-shell-extension-tool  # For CLI management
sudo dnf install dconf-editor                 # For viewing GSettings
```

## Project Setup

### 1. Clone Repository
```bash
cd ~/GitHub
git clone https://github.com/hamiltonia/zoned.git
cd zoned
```

### 2. Directory Structure
```
zoned/
├── memory/              # This documentation
├── extension/           # Extension source code
├── docs/                # User documentation
├── README.md
├── LICENSE
├── Makefile
└── .gitignore
```

### 3. Install Extension for Development

The extension needs to be installed to:
```
~/.local/share/gnome-shell/extensions/zoned@hamiltonia.me/
```

**Option A: Use Makefile (recommended)**
```bash
make install
```

**Option B: Manual Symlink**
```bash
ln -s ~/GitHub/zoned/extension ~/.local/share/gnome-shell/extensions/zoned@hamiltonia.me
```

**Option C: Manual Copy**
```bash
mkdir -p ~/.local/share/gnome-shell/extensions/zoned@hamiltonia.me
cp -r extension/* ~/.local/share/gnome-shell/extensions/zoned@hamiltonia.me/
```

### 4. Compile GSettings Schema

GSettings schemas must be compiled after installation:

```bash
# Navigate to extension directory
cd ~/.local/share/gnome-shell/extensions/zoned@hamiltonia.me

# Compile schema
glib-compile-schemas schemas/
```

Or use the Makefile:
```bash
make compile-schema
```

### 5. Enable Extension

**Via GUI:**
1. Open GNOME Extensions app
2. Find "Zoned"
3. Toggle switch to ON

**Via CLI:**
```bash
gnome-extensions enable zoned@hamiltonia.me
```

### 6. Verify Installation

```bash
gnome-extensions list
gnome-extensions info zoned@hamiltonia.me
```

## Development Workflow

### Complete Setup from Scratch

If you're starting fresh on a new system:

```bash
# 1. Clone the repository
cd ~/GitHub
git clone https://github.com/hamiltonia/zoned.git
cd zoned

# 2. Run complete development setup
make dev

# 3. Log out and log back in (Wayland) or reload GNOME Shell (X11)
#    Wayland: Top-right menu → Power → Log Out → Log back in
#    X11: Alt+F2 → type 'r' → press Enter
```

The `make dev` command performs these steps automatically:
- Installs extension files to `~/.local/share/gnome-shell/extensions/zoned@hamiltonia.me/`
- Compiles the GSettings schema
- Enables the extension
- Provides session-specific reload instructions

### Makefile Commands Reference

#### Installation & Setup
```bash
make install          # Copy extension files to GNOME extensions directory
make compile-schema   # Compile GSettings schema (required after install)
make enable           # Enable the extension
make dev              # Full setup: install + compile + enable (recommended)
```

#### Development Workflow
```bash
make logs             # Follow extension logs in real-time (Ctrl+C to stop)
make reload           # Reload GNOME Shell (X11) or show Wayland instructions
make reinstall        # Uninstall + Install + Compile (for major changes)
```

#### Cleanup
```bash
make disable          # Disable the extension
make uninstall        # Remove extension from GNOME extensions directory
make clean            # Remove build artifacts and compiled schemas
```

#### Packaging
```bash
make zip              # Create distribution package for extensions.gnome.org
```

#### Help
```bash
make help             # Show all available commands with descriptions
```

### Reload Extension During Development

**On X11 (fast development):**
```bash
# Method 1: Use Makefile (recommended)
make reload

# Method 2: Manual keyboard shortcut
Alt + F2, type 'r', press Enter
```

**On Wayland (requires logout):**
```bash
# Makefile will show detailed instructions:
make reload

# Manual process:
# 1. Log out (top-right menu → Power → Log Out)
# 2. Log back in
```

**Development Tip:** For rapid iteration, temporarily switch to X11:
1. Log out
2. Click the gear icon at the login screen
3. Select "GNOME on Xorg"
4. On X11, Alt+F2 → 'r' reloads in ~2 seconds

### Typical Development Cycle

```bash
# 1. Make code changes in extension/ directory

# 2. Install updated files
make install

# 3. Reload GNOME Shell
make reload          # X11: reloads immediately
                     # Wayland: shows logout instructions

# 4. Watch logs for errors
make logs

# 5. Test your changes
# Use Super+grave to test profile picker
# Use Super+Left/Right to test zone cycling
```

### Watch Logs While Developing

The extension logs all activity with `[Zoned]` prefix:

```bash
# Follow logs in real-time (best for active development)
make logs

# View recent logs
journalctl -n 100 /usr/bin/gnome-shell | grep -i zoned

# View logs with timestamps
journalctl -f /usr/bin/gnome-shell | grep --line-buffered zoned
```

### Automated Watch Script (X11 only)

For automatic reload on file changes:

```bash
#!/bin/bash
# save as: watch-and-reload.sh
# usage: ./watch-and-reload.sh

sudo dnf install inotify-tools  # if not installed

while inotifywait -e modify,create,delete -r ~/GitHub/zoned/extension; do
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Changes detected, reloading extension..."
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    make install
    sleep 1
    make reload
    echo "Extension reloaded at $(date)"
done
```

## Development Tools

### GNOME Shell Debugging

#### Looking Glass (Interactive Console)
1. Press `Alt + F2`
2. Type `lg`
3. Press Enter

Commands in Looking Glass:
- View extension objects
- Execute JavaScript
- Inspect UI elements
- Check for errors

#### Monitor Logs
```bash
# Follow GNOME Shell logs
journalctl -f -o cat /usr/bin/gnome-shell

# Filter for Zoned
journalctl -f -o cat /usr/bin/gnome-shell | grep -i zoned

# View last 100 lines
journalctl -n 100 /usr/bin/gnome-shell
```

#### GSettings Inspector
```bash
# Launch dconf-editor
dconf-editor

# Navigate to:
# /org/gnome/shell/extensions/zoned/
```

### Code Editor Setup

**VS Code Integration:**
```bash
# Open project
code ~/GitHub/zoned

# Recommended extensions:
# - ESLint
# - JavaScript (ES6) code snippets
# - GNOME Shell Extension snippets (if available)
```

**EditorConfig:**
Create `.editorconfig`:
```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 4

[*.json]
indent_size = 2

[*.md]
trim_trailing_whitespace = false
```

### Linting and Code Quality

**ESLint Setup (recommended):**
```bash
# In project root
npm init -y
npm install --save-dev eslint eslint-config-airbnb-base

# Create .eslintrc.json
cat > .eslintrc.json << 'EOF'
{
  "extends": "airbnb-base",
  "env": {
    "es6": true
  },
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module"
  },
  "rules": {
    "indent": ["error", 4],
    "no-underscore-dangle": "off"
  }
}
EOF
```

## Testing Profile Configurations

### Create Test Profiles

```bash
# Create user config directory
mkdir -p ~/.config/zoned

# Create test profiles
cat > ~/.config/zoned/profiles.json << 'EOF'
{
  "profiles": [
    {
      "id": "test_layout",
      "name": "Test Layout",
      "zones": [
        {"name": "Left 40%", "x": 0, "y": 0, "w": 0.4, "h": 1},
        {"name": "Right 60%", "x": 0.4, "y": 0, "w": 0.6, "h": 1}
      ]
    }
  ]
}
EOF
```

### Validate Profiles

```bash
# Check JSON syntax
jq . ~/.config/zoned/profiles.json

# Reload extension to test
make reload
```

## Troubleshooting

### Extension Not Loading

1. Check metadata.json for correct shell-version
2. Verify GSettings schema is compiled
3. Check logs for errors:
   ```bash
   journalctl -b /usr/bin/gnome-shell | grep -i error
   ```

### GSettings Errors

```bash
# Recompile schema
cd ~/.local/share/gnome-shell/extensions/zoned@hamiltonia.me
glib-compile-schemas schemas/

# Reset settings to defaults
dconf reset -f /org/gnome/shell/extensions/zoned/
```

### Keyboard Shortcuts Not Working

1. Check for conflicts with existing bindings:
   ```bash
   # View all keybindings
   gsettings list-recursively | grep -i keybindings
   ```

2. Verify schema defines keybindings correctly
3. Check if extension is enabled and keybindings registered

### Profile Picker Not Showing

1. Check logs for UI-related errors
2. Verify St toolkit imports are correct
3. Test with Looking Glass:
   ```javascript
   let ext = imports.misc.extensionUtils.getCurrentExtension();
   log(ext);
   ```

## Performance Tips

1. **Minimize logging in production**
   - Use conditional logging: `if (DEBUG) log(...)`

2. **Efficient zone calculations**
   - Cache monitor geometry when possible
   - Avoid unnecessary recalculations

3. **Profile loading**
   - Load profiles once on enable()
   - Don't reload on every zone cycle

4. **Memory management**
   - Destroy UI elements in disable()
   - Clean up timers and connections

## Next Steps

After setting up the development environment:
1. Review [Testing Guide](testing.md)
2. Read [Debugging Guide](debugging.md)
3. Study [GNOME APIs Reference](gnome-apis.md)
4. Check [Component Design](../architecture/component-design.md)

---
*Last Updated: 2025-11-21*
