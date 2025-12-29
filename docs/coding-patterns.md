# Coding Patterns

Code style, conventions, and patterns for contributing to Zoned.

## Code Style

### General

- **Indentation:** 4 spaces (no tabs)
- **Line length:** ~100 characters soft limit
- **Semicolons:** Required
- **Quotes:** Single quotes for strings
- **Trailing commas:** Yes, in multi-line arrays/objects

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Classes | PascalCase | `LayoutManager`, `ZoneEditor` |
| Methods/Functions | camelCase | `cycleZone()`, `getCurrentLayout()` |
| Private members | Underscore prefix | `_settings`, `_onButtonClicked()` |
| Constants | SCREAMING_SNAKE | `MIN_ZONE_SIZE`, `DEFAULT_LAYOUT_ID` |
| Signals | kebab-case | `'layout-changed'`, `'zone-selected'` |
| GSettings keys | kebab-case | `current-layout-id`, `show-notifications` |

### File Organization

- **One class per file** (with related helpers allowed)
- **Keep files under 500 lines** when practical
- **Group related imports** at top of file
- **Order:** imports → constants → class → exports

```javascript
// Imports grouped by source
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

// Local imports
import { LayoutManager } from './layoutManager.js';

// Constants
const MIN_ZONE_SIZE = 0.1;
const ANIMATION_DURATION = 150;

// Class definition
export class MyComponent {
    // ...
}
```

## GNOME Shell Extension Patterns

### Extension Lifecycle

**CRITICAL:** All setup must happen in `enable()`, all cleanup in `disable()`.

```javascript
export default class ZonedExtension extends Extension {
    enable() {
        // Initialize everything here
        this._settings = this.getSettings();
        this._layoutManager = new LayoutManager(this._settings);
        
        // Connect signals - TRACK THEM
        this._settingsChangedId = this._settings.connect(
            'changed::some-key',
            this._onSettingChanged.bind(this)
        );
        
        // Register keybindings
        this._registerKeybindings();
    }
    
    disable() {
        // Disconnect signals
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        
        // Unregister keybindings
        this._unregisterKeybindings();
        
        // Destroy objects
        this._layoutManager?.destroy();
        this._layoutManager = null;
        
        // Clear settings reference
        this._settings = null;
    }
}
```

**Never** do work in `constructor()` - it's called at extension load, not enable.

### Signal Connections

Always track signal connections for cleanup:

```javascript
class MyComponent {
    constructor() {
        this._signals = [];
    }
    
    _connectSignal(object, signal, callback) {
        const id = object.connect(signal, callback);
        this._signals.push({ object, id });
        return id;
    }
    
    destroy() {
        for (const { object, id } of this._signals) {
            object.disconnect(id);
        }
        this._signals = [];
    }
}
```

### Timeout/Idle Sources

Always remove GLib timeouts:

```javascript
class MyComponent {
    constructor() {
        this._timeoutId = null;
    }
    
    _scheduleUpdate() {
        // Clear existing timeout first
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
        
        this._timeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            500,
            () => {
                this._doUpdate();
                this._timeoutId = null;
                return GLib.SOURCE_REMOVE;  // Don't repeat
            }
        );
    }
    
    destroy() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
    }
}
```

### Modal Dialogs

Use GNOME's ModalDialog for proper input handling:

```javascript
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

class MyDialog extends ModalDialog.ModalDialog {
    constructor() {
        super({ styleClass: 'my-dialog' });
        
        this._buildUI();
    }
    
    _buildUI() {
        // Add content to this.contentLayout
        const label = new St.Label({ text: 'Hello' });
        this.contentLayout.add_child(label);
        
        // Add buttons
        this.setButtons([
            {
                label: 'Cancel',
                action: () => this.close(),
                key: Clutter.KEY_Escape,
            },
            {
                label: 'OK',
                action: () => this._onConfirm(),
                default: true,
            },
        ]);
    }
}
```

**Important:** Modal grab handling:

```javascript
// When opening
const grab = Main.pushModal(this._actor, { actionMode: Shell.ActionMode.NORMAL });
this._grab = grab;

// When closing - pass the grab object!
if (this._grab) {
    Main.popModal(this._grab);
    this._grab = null;
}
```

### St Widgets

Common patterns for Shell Toolkit widgets:

```javascript
// BoxLayout for vertical/horizontal stacking
const box = new St.BoxLayout({
    vertical: true,
    style_class: 'my-box',
    x_expand: true,
});

// Button with click handler
const button = new St.Button({
    style_class: 'my-button',
    label: 'Click Me',
    can_focus: true,
});
button.connect('clicked', () => this._onButtonClicked());

// Label
const label = new St.Label({
    text: 'Hello',
    style_class: 'my-label',
    x_align: Clutter.ActorAlign.CENTER,
});

// Use layout managers
const grid = new St.Widget({
    layout_manager: new Clutter.GridLayout(),
});
```

### Cairo Drawing

For custom rendering (zone previews, etc.):

```javascript
const canvas = new St.DrawingArea({
    width: 200,
    height: 100,
});

canvas.connect('repaint', () => {
    const cr = canvas.get_context();
    const [width, height] = canvas.get_surface_size();
    
    // Set color (RGBA 0-1)
    cr.setSourceRGBA(0.3, 0.5, 0.8, 0.5);
    
    // Draw rectangle
    cr.rectangle(10, 10, width - 20, height - 20);
    cr.fill();
    
    // Draw border
    cr.setSourceRGBA(0.3, 0.5, 0.8, 1.0);
    cr.setLineWidth(2);
    cr.rectangle(10, 10, width - 20, height - 20);
    cr.stroke();
    
    // IMPORTANT: dispose context
    cr.$dispose();
});

// Trigger repaint
canvas.queue_repaint();
```

## Error Handling

### Valid Try/Catch Uses

Use try/catch for:
- File I/O operations
- JSON parsing
- GSettings operations that might fail
- External API calls

```javascript
// File I/O
try {
    const [success, contents] = GLib.file_get_contents(path);
    if (success) {
        const data = JSON.parse(new TextDecoder().decode(contents));
    }
} catch (e) {
    console.error(`[Zoned] Failed to load file: ${e.message}`);
}

// GSettings
try {
    this._settings.set_string('key', value);
} catch (e) {
    console.error(`[Zoned] Failed to save setting: ${e.message}`);
}
```

### Avoid Defensive Wrappers

Don't wrap everything in try/catch:

```javascript
// BAD - hides real bugs
enable() {
    try {
        this._init();
    } catch (e) {
        console.error(e);  // Silently fails
    }
}

// GOOD - let errors propagate
enable() {
    this._init();  // Errors will be logged properly
}
```

## Logging

### Debug Logging

Use the debug utility for conditional logging:

```javascript
import { debug, debugError } from './utils/debug.js';

// Debug messages (only shown when debug mode enabled)
debug('Zone cycling to index:', newIndex);

// Error logging (always shown)
debugError('Failed to load layout:', error);
```

### Enabling Debug Mode

Debug logging is disabled by default. To enable:

1. Open Zoned preferences (Extensions app → Zoned → gear icon)
2. Press `Ctrl+Shift+D` to show hidden debug settings near the bottom
3. Enable "Debug Mode"

See [keybindings.md](keybindings.md#debug-settings) for more debug options.

### Console Logging

For development only - remove before release:

```javascript
// Development logging (remove before commit)
console.log('[Zoned] Debug:', someValue);

// ESLint will warn about console.log statements
```

All log messages should be prefixed with `[Zoned]`.

## Testing Patterns

### Manual Testing Checklist

Before committing:

- [ ] Extension enables without errors (`make logs`)
- [ ] Extension disables cleanly (no errors on disable)
- [ ] Enable/disable 10 times rapidly - no memory leaks
- [ ] Zone cycling works (Super+Left/Right)
- [ ] Layout picker opens and closes (Super+`)
- [ ] Keybinding conflicts detected if present
- [ ] Test on both X11 and Wayland

### VM Development

Use VM for fast iteration:

```bash
# Terminal 1: Watch logs
make vm-logs

# Terminal 2: Edit code
# After saving, in VM: Alt+F2 → r → Enter
```

See [vm-setup-guide.md](vm-setup-guide.md) for setup.

## GSettings Schema

### Defining Keys

```xml
<key name="my-setting" type="s">
    <default>'default-value'</default>
    <summary>Short description</summary>
    <description>Longer description of what this setting does.</description>
</key>

<!-- Boolean -->
<key name="show-notifications" type="b">
    <default>true</default>
</key>

<!-- Integer -->
<key name="zone-index" type="i">
    <default>0</default>
</key>

<!-- Double -->
<key name="picker-size" type="d">
    <default>0.8</default>
    <range min="0.3" max="0.95"/>
</key>

<!-- Keybinding -->
<key name="cycle-zone-left" type="as">
    <default>['&lt;Super&gt;Left']</default>
</key>
```

### Accessing Settings

```javascript
// Get
const value = this._settings.get_string('my-setting');
const enabled = this._settings.get_boolean('show-notifications');

// Set
this._settings.set_string('my-setting', newValue);
this._settings.set_boolean('show-notifications', false);

// Watch for changes
this._settings.connect('changed::my-setting', (settings, key) => {
    const newValue = settings.get_string(key);
    this._onSettingChanged(newValue);
});
```

## ESLint Configuration

The project uses ESLint with GNOME-friendly rules:

```bash
# Run linter
make lint

# Auto-fix issues
make lint-fix
```

Key rules:
- No unused variables
- No console.log (warning)
- Consistent spacing and formatting

## Common Gotchas

### Actor Destruction

Always null references after destroying:

```javascript
destroy() {
    if (this._container) {
        this._container.destroy();
        this._container = null;
    }
}
```

### Asynchronous Operations

Be careful with async in GNOME Shell context:

```javascript
// If using Gio async operations, ensure extension is still enabled
async _loadFile() {
    const file = Gio.File.new_for_path(path);
    try {
        const [contents] = await file.load_contents_async(null);
        // Check if we're still active
        if (!this._settings) return;  // Extension was disabled
        this._processContents(contents);
    } catch (e) {
        // Handle error
    }
}
```

### Clutter Event Propagation

```javascript
// Stop event from propagating
actor.connect('button-press-event', () => {
    this._handleClick();
    return Clutter.EVENT_STOP;  // Don't propagate
});

// Allow propagation
actor.connect('enter-event', () => {
    this._handleHover();
    return Clutter.EVENT_PROPAGATE;  // Let parent handle too
});
```

## Related Documentation

- [architecture.md](architecture.md) - Component overview
- [gjs-memory-guide.md](gjs-memory-guide.md) - GJS memory management reference
- [GNOME Extension Guide](https://gjs.guide/extensions/) - Official guide
- [GJS Guide](https://gjs.guide/) - JavaScript bindings reference
- [GJS API Docs](https://gjs-docs.gnome.org/) - API reference
