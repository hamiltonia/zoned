# GNOME Shell Extension Development Guidelines

> **Purpose**: Reference document for AI agents reviewing GNOME Shell extension code. Based on official gjs.guide documentation (Dec 2025).

---

## Table of Contents

1. [Core Principles](#1-core-principles)
2. [Extension Lifecycle](#2-extension-lifecycle)
3. [File Structure & Anatomy](#3-file-structure--anatomy)
4. [ESM Imports (GNOME 45+)](#4-esm-imports-gnome-45)
5. [Review Guidelines Checklist](#5-review-guidelines-checklist)
6. [Common Rejection Reasons](#6-common-rejection-reasons)
7. [GSettings & Preferences](#7-gsettings--preferences)
8. [Session Modes](#8-session-modes)
9. [Debugging & Logging](#9-debugging--logging)
10. [Code Patterns](#10-code-patterns)

---

## 1. Core Principles

### Three Fundamental Rules

1. **Don't create or modify anything before `enable()` is called**
2. **Use `enable()` to create objects, connect signals, and add main loop sources**
3. **Use `disable()` to cleanup EVERYTHING done in `enable()`**

### General Best Practices

- Write clean code with consistent indentation and style
- Use modern features: ES6 classes, `async`/`await`
- Use a linter (ESLint recommended)
- Keep logging minimal—focus on unexpected events and failures
- Follow GNOME HIG for preferences UI

---

## 2. Extension Lifecycle

### GNOME 45+ Pattern (ESM)

```javascript
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class MyExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        // ❌ DO NOT: create objects, connect signals, add main loop sources
        // ✅ OK: setup translations, static data structures
    }

    enable() {
        // ✅ Create objects, connect signals, create main loop sources
    }

    disable() {
        // ✅ MUST: destroy objects, disconnect signals, remove main loop sources
        // ✅ MUST: null out all references
    }
}
```

### What's Allowed During Initialization

| Allowed | NOT Allowed |
|---------|-------------|
| Built-in JS types (`Map`, `Set`, `RegExp`) | GObject classes (`Gio.Settings`, `St.Widget`) |
| Static data structures | Signal connections |
| Translations setup | Main loop sources |
| Simple state objects | Any GNOME Shell modifications |

---

## 3. File Structure & Anatomy

### Required Files

```
extension-id@namespace/
├── extension.js      # Required - main extension code
└── metadata.json     # Required - extension metadata
```

### Complete Extension Structure

```
extension-id@namespace/
├── extension.js
├── metadata.json
├── prefs.js          # Optional - preferences window (GTK4/Adwaita)
├── stylesheet.css    # Optional - St widget styling
├── schemas/
│   ├── gschemas.compiled
│   └── org.gnome.shell.extensions.example.gschema.xml
└── locale/
    └── de/
        └── LC_MESSAGES/
            └── example.mo
```

### metadata.json Requirements

```json
{
    "uuid": "example@username.github.io",
    "name": "Example Extension",
    "description": "Short description of functionality",
    "shell-version": ["45", "46", "47"],
    "url": "https://github.com/username/example",
    "gettext-domain": "example@username.github.io",
    "settings-schema": "org.gnome.shell.extensions.example"
}
```

#### UUID Rules

- Format: `extension-id@namespace`
- Characters allowed: letters, numbers, `.`, `_`, `-`
- Namespace: use domain you control (e.g., `username.github.io`)
- **NEVER use `gnome.org`**

#### shell-version Rules

- Only include stable releases + max one development release
- Don't claim future version support
- GNOME 40+: use major version only (e.g., `"45"`, not `"45.1"`)
- Pre-GNOME 40: use major.minor (e.g., `"3.38"`)

#### Optional Fields

| Field | Description |
|-------|-------------|
| `session-modes` | Only include if using `unlock-dialog`; drop entirely if only `user` |
| `version` | **DO NOT SET** - controlled by extensions.gnome.org |
| `version-name` | User-visible version string (1-16 chars) |
| `donations` | Object with keys: `github`, `kofi`, `patreon`, `paypal`, etc. |

---

## 4. ESM Imports (GNOME 45+)

### GObject Introspection Libraries

```javascript
// Standard import
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

// Versioned import
import Soup from 'gi://Soup?version=3.0';

// For prefs.js only
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import Adw from 'gi://Adw';
```

### GNOME Shell Modules

```javascript
// In extension.js - note lowercase path
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

// In prefs.js - note different case in path!
import {ExtensionPreferences, gettext as _} from 
    'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
```

### Your Own Modules

```javascript
// Relative imports
import * as Utils from './utils.js';
import {SomeClass} from './myModule.js';
```

### Built-in Modules

```javascript
import Cairo from 'cairo';
import System from 'system';
```

---

## 5. Review Guidelines Checklist

### Critical Requirements (Will Cause Rejection)

- [ ] **No initialization side effects**: Nothing created/connected in constructor or module scope
- [ ] **All objects destroyed in `disable()`**
- [ ] **All signals disconnected in `disable()`**
- [ ] **All main loop sources removed in `disable()`**
- [ ] **No GTK/GDK imports in extension.js**
- [ ] **No Clutter/Meta/St/Shell imports in prefs.js**
- [ ] **No deprecated modules** (`ByteArray`, `Lang`, `Mainloop`)
- [ ] **No binary executables or libraries included**
- [ ] **No obfuscated or minified code**
- [ ] **No telemetry or user tracking**
- [ ] **Code is readable and reviewable**

### metadata.json Validation

- [ ] UUID format correct (`id@namespace`)
- [ ] Unique name (not conflicting with other extensions)
- [ ] Valid shell-version entries
- [ ] URL points to repository
- [ ] No `version` field (auto-managed)
- [ ] `session-modes` dropped if only using `user`

### GSettings Schema Requirements

- [ ] Schema ID starts with `org.gnome.shell.extensions`
- [ ] Schema path starts with `/org/gnome/shell/extensions`
- [ ] XML file included in extension
- [ ] Filename matches pattern `<schema-id>.gschema.xml`

### Code Quality

- [ ] No excessive logging
- [ ] No `GObject.Object.run_dispose()` without documented necessity
- [ ] Clipboard access declared in description
- [ ] No privileged subprocess spawning from user-writable scripts

---

## 6. Common Rejection Reasons

### 1. Objects Not Destroyed

```javascript
// ❌ BAD
disable() {
    // Missing cleanup!
}

// ✅ GOOD
disable() {
    this._indicator?.destroy();
    this._indicator = null;
}
```

### 2. Signals Not Disconnected

```javascript
// ❌ BAD - signal ID not stored or not disconnected
enable() {
    global.settings.connect('changed', this._onChanged.bind(this));
}

// ✅ GOOD
enable() {
    this._handlerId = global.settings.connect('changed', this._onChanged.bind(this));
}

disable() {
    if (this._handlerId) {
        global.settings.disconnect(this._handlerId);
        this._handlerId = null;
    }
}
```

### 3. Main Loop Sources Not Removed

```javascript
// ❌ BAD - timeout not removed
enable() {
    GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
        return GLib.SOURCE_CONTINUE;
    });
}

// ✅ GOOD
enable() {
    this._sourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
        return GLib.SOURCE_CONTINUE;
    });
}

disable() {
    if (this._sourceId) {
        GLib.Source.remove(this._sourceId);
        this._sourceId = null;
    }
}
```

### 4. GTK Imported in Shell Process

```javascript
// ❌ FATAL - crashes GNOME Shell
// In extension.js:
import Gtk from 'gi://Gtk';

// ✅ CORRECT - only in prefs.js
// In prefs.js:
import Gtk from 'gi://Gtk?version=4.0';
```

### 5. Deprecated Module Usage

```javascript
// ❌ DEPRECATED
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const ByteArray = imports.byteArray;

// ✅ MODERN
// Use ES6 classes instead of Lang
// Use GLib.timeout_add() instead of Mainloop
// Use TextEncoder/TextDecoder instead of ByteArray
```

### 6. Module-Scope Side Effects

```javascript
// ❌ BAD - GObject created at module load time
const settings = new Gio.Settings({schema_id: 'org.example'});

// ✅ GOOD - created in enable()
let settings = null;

export default class MyExtension extends Extension {
    enable() {
        settings = this.getSettings();
    }
    disable() {
        settings = null;
    }
}
```

---

## 7. GSettings & Preferences

### Schema File Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<schemalist>
  <schema id="org.gnome.shell.extensions.example"
          path="/org/gnome/shell/extensions/example/">
    <key name="show-indicator" type="b">
      <default>true</default>
      <summary>Show indicator</summary>
      <description>Whether to show the panel indicator</description>
    </key>
  </schema>
</schemalist>
```

### Using Settings in extension.js

```javascript
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class MyExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._settingsChangedId = this._settings.connect('changed::show-indicator', 
            () => this._updateIndicator());
    }

    disable() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        this._settings = null;
    }
}
```

### Preferences Window (prefs.js)

```javascript
import Adw from 'gi://Adw';
import {ExtensionPreferences, gettext as _} from 
    'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class MyPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'dialog-information-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: _('Appearance'),
        });
        page.add(group);

        const row = new Adw.SwitchRow({
            title: _('Show Indicator'),
            subtitle: _('Whether to show the panel indicator'),
        });
        group.add(row);

        settings.bind('show-indicator', row, 'active',
            Gio.SettingsBindFlags.DEFAULT);
    }
}
```

---

## 8. Session Modes

### Default Behavior

- Extensions only specify `session-modes` if using `unlock-dialog`
- Default is `user` mode only (enabled on login, disabled on lock)

### Using unlock-dialog Mode

**Requirements for approval:**

1. MUST be necessary for extension functionality
2. MUST disconnect all keyboard event signals when locked
3. MUST include comment in `disable()` explaining necessity

```javascript
// metadata.json
{
    "session-modes": ["user", "unlock-dialog"]
}
```

```javascript
// extension.js
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class MyExtension extends Extension {
    enable() {
        this._sessionId = Main.sessionMode.connect('updated', 
            () => this._onSessionModeChanged());
    }

    _onSessionModeChanged() {
        if (Main.sessionMode.isLocked) {
            // Disable UI interactions, disconnect keyboard signals
        } else {
            // Re-enable functionality
        }
    }

    disable() {
        // This extension uses unlock-dialog mode because [explanation].
        // UI elements are disabled when locked to prevent security issues.
        if (this._sessionId) {
            Main.sessionMode.disconnect(this._sessionId);
            this._sessionId = null;
        }
    }
}
```

---

## 9. Debugging & Logging

### Logging Best Practices

```javascript
// Use console API (GNOME 45+)
console.debug('Debug information');  // Development only
console.log('General information');
console.warn('Warning: something unexpected');
console.error('Error occurred', error);

// For errors with stack traces
try {
    riskyOperation();
} catch (e) {
    console.error('Operation failed:', e);
}
```

### Viewing Logs

```bash
# Monitor GNOME Shell logs
journalctl -f -o cat /usr/bin/gnome-shell

# Filter for JS messages
journalctl -f | grep -i js

# Monitor prefs.js (separate process)
journalctl -f -o cat /usr/bin/gjs
```

### Looking Glass (Built-in Debugger)

- Open: `Alt+F2` → type `lg` → Enter
- Features: JS REPL, actor inspector, extension status
- Pre-imported: `GLib`, `GObject`, `Gio`, `Clutter`, `Meta`, `St`, `Shell`, `Main`

### Development Environment

**Wayland (Recommended):**
```bash
# Run nested GNOME Shell session
dbus-run-session -- gnome-shell --nested --wayland
```

**X11:**
```bash
# Restart GNOME Shell to reload extensions
# Press Alt+F2, type 'r', press Enter
```

---

## 10. Code Patterns

### Panel Indicator

```javascript
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

export default class IndicatorExtension extends Extension {
    enable() {
        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);

        const icon = new St.Icon({
            icon_name: 'system-search-symbolic',
            style_class: 'system-status-icon',
        });
        this._indicator.add_child(icon);

        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
```

### Popup Menu

```javascript
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

enable() {
    // ... create indicator ...
    
    const menuItem = new PopupMenu.PopupMenuItem('Click Me');
    menuItem.connect('activate', () => {
        console.log('Menu item clicked');
    });
    this._indicator.menu.addMenuItem(menuItem);
    
    this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    
    const subMenu = new PopupMenu.PopupSubMenuMenuItem('Submenu');
    subMenu.menu.addMenuItem(new PopupMenu.PopupMenuItem('Sub Item'));
    this._indicator.menu.addMenuItem(subMenu);
}
```

### Keybinding

```javascript
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class KeybindingExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        
        Main.wm.addKeybinding(
            'my-keybinding',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._onKeybindingActivated()
        );
    }

    disable() {
        Main.wm.removeKeybinding('my-keybinding');
        this._settings = null;
    }
}
```

### Settings Binding

```javascript
import Gio from 'gi://Gio';

enable() {
    this._settings = this.getSettings();
    
    // Bind property to setting
    this._settings.bind(
        'show-indicator',
        this._indicator,
        'visible',
        Gio.SettingsBindFlags.DEFAULT
    );
}
```

### Async Operations

```javascript
async _loadData() {
    try {
        const file = Gio.File.new_for_path('/some/path');
        const [contents] = await file.load_contents_async(null);
        const decoder = new TextDecoder('utf-8');
        return decoder.decode(contents);
    } catch (e) {
        console.error('Failed to load data:', e);
        return null;
    }
}
```

---

## Quick Reference Card

### Process Separation

| File | Process | Toolkit | Imports Allowed |
|------|---------|---------|-----------------|
| `extension.js` | `gnome-shell` | Clutter/St | Clutter, Meta, St, Shell |
| `prefs.js` | `gjs` | GTK4/Adwaita | Gtk, Gdk, Adw |

### Import Path Prefixes

| Context | Base Path |
|---------|-----------|
| extension.js | `resource:///org/gnome/shell/` |
| prefs.js | `resource:///org/gnome/Shell/Extensions/js/` |

### Deprecated → Modern

| Deprecated | Use Instead |
|------------|-------------|
| `imports.gi.X` | `import X from 'gi://X'` |
| `imports.ui.main` | `import * as Main from 'resource:///org/gnome/shell/ui/main.js'` |
| `Lang.Class` | ES6 `class` |
| `Mainloop.timeout_add()` | `GLib.timeout_add()` |
| `ByteArray` | `TextEncoder`/`TextDecoder` |
| `log()` | `console.log()` |
| `logError()` | `console.error()` |

---

## Resources

- **Official Guide**: https://gjs.guide/extensions/
- **API Documentation**: https://gjs-docs.gnome.org
- **GNOME Shell Source**: https://gitlab.gnome.org/GNOME/gnome-shell/-/tree/main/js
- **Review Guidelines**: https://gjs.guide/extensions/review-guidelines/review-guidelines.html
- **Matrix Chat**: https://matrix.to/#/#extensions:gnome.org
- **Discourse**: https://discourse.gnome.org/tag/extensions

---

*Document generated from gjs.guide documentation, December 2025*
