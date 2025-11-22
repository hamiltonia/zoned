# Development Environment Setup

Guide for setting up a development environment for ZoneFancy GNOME Shell extension.

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
git clone https://github.com/hamiltonia/zonefancy.git
cd zonefancy
```

### 2. Directory Structure
```
zonefancy/
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
~/.local/share/gnome-shell/extensions/zonefancy@hamiltonia/
```

**Option A: Use Makefile (recommended)**
```bash
make install
```

**Option B: Manual Symlink**
```bash
ln -s ~/GitHub/zonefancy/extension ~/.local/share/gnome-shell/extensions/zonefancy@hamiltonia
```

**Option C: Manual Copy**
```bash
mkdir -p ~/.local/share/gnome-shell/extensions/zonefancy@hamiltonia
cp -r extension/* ~/.local/share/gnome-shell/extensions/zonefancy@hamiltonia/
```

### 4. Compile GSettings Schema

GSettings schemas must be compiled after installation:

```bash
# Navigate to extension directory
cd ~/.local/share/gnome-shell/extensions/zonefancy@hamiltonia

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
2. Find "ZoneFancy"
3. Toggle switch to ON

**Via CLI:**
```bash
gnome-extensions enable zonefancy@hamiltonia
```

### 6. Verify Installation

```bash
gnome-extensions list
gnome-extensions info zonefancy@hamiltonia
```

## Development Workflow

### Reload Extension During Development

**On X11 (easy):**
```bash
# Restart GNOME Shell
Alt + F2, type 'r', press Enter
```

**On Wayland (requires logout):**
```bash
# Disable and re-enable extension
gnome-extensions disable zonefancy@hamiltonia
gnome-extensions enable zonefancy@hamiltonia

# Or logout and login
```

**Tip:** Develop on X11 for faster iteration, test on Wayland before release.

### Watch for Changes (Development)

Create a script to auto-reload (X11 only):
```bash
#!/bin/bash
# watch-reload.sh

while inotifywait -e modify,create,delete -r ~/GitHub/zonefancy/extension; do
    echo "Changes detected, reloading extension..."
    gnome-extensions disable zonefancy@hamiltonia
    sleep 0.5
    make install
    sleep 0.5
    gnome-extensions enable zonefancy@hamiltonia
    echo "Extension reloaded!"
done
```

Requires: `sudo dnf install inotify-tools`

### Quick Development Commands

```bash
# Full development cycle
make install && make enable

# Quick reload (X11)
make reload

# View logs
make logs

# Disable extension
make disable

# Uninstall
make uninstall
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

# Filter for ZoneFancy
journalctl -f -o cat /usr/bin/gnome-shell | grep -i zonefancy

# View last 100 lines
journalctl -n 100 /usr/bin/gnome-shell
```

#### GSettings Inspector
```bash
# Launch dconf-editor
dconf-editor

# Navigate to:
# /org/gnome/shell/extensions/zonefancy/
```

### Code Editor Setup

**VS Code Integration:**
```bash
# Open project
code ~/GitHub/zonefancy

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
mkdir -p ~/.config/zonefancy

# Create test profiles
cat > ~/.config/zonefancy/profiles.json << 'EOF'
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
jq . ~/.config/zonefancy/profiles.json

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
cd ~/.local/share/gnome-shell/extensions/zonefancy@hamiltonia
glib-compile-schemas schemas/

# Reset settings to defaults
dconf reset -f /org/gnome/shell/extensions/zonefancy/
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
