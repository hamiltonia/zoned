# GJS Memory Management Guide for AI Agents

> **Source**: https://gjs.guide/guides/gjs/memory-management.html  
> **Target**: AI agents developing GNOME Shell extensions  
> **Last Updated**: December 2025

---

## Executive Summary

GJS uses **dual memory management**: JavaScript's reference tracing + GObject's reference counting. Memory leaks in GNOME Shell extensions typically stem from:

1. **Lost handler IDs** -- signal connections or GLib sources without stored IDs
2. **Closure captures** -- arrow functions capturing `this` or variables
3. **Scope escapes** -- variables falling out of scope while GObjects persist
4. **Missing cleanup** -- `disable()` not reversing everything from `enable()`

**The Golden Rule**: Everything created/connected in `enable()` must be destroyed/disconnected in `disable()`.

---

## Core Concepts

### Reference Counting (GObject)

| Count | State |
|-------|-------|
| `>0` | Object alive, resources allocated |
| `0` | Object freed, resources released |

GObjects increment count when added to containers (e.g., `panel.addToStatusArea()`), decrement when removed.

### Reference Tracing (JavaScript)

Variables "trace" objects. If JS engine can't trace a value back to any variable, it's garbage collected.

```javascript
// Traced -- won't be collected
const myLabel = new St.Label({ text: 'Hello' });

// Lost reference -- eligible for collection
let temp = new St.Label({ text: 'Gone' });
temp = null;  // No more trace
```

### The Trap: GObject + JS Disconnect

A GObject can be destroyed (finalized) while JS still holds a reference to its wrapper. Accessing it causes:

```
Object St_Label (0x...) has been finalized. Impossible to get any property from it.
```

---

## GNOME Shell Extension Lifecycle

### The Three Rules

1. **No work in constructor/`init()`** -- only store metadata
2. **All work in `enable()`** -- create objects, connect signals, add sources
3. **Full cleanup in `disable()`** -- reverse everything from `enable()`

### Correct Pattern

```javascript
export default class MyExtension extends Extension {
    _indicator = null;
    _settings = null;
    _signalIds = [];
    _sourceIds = [];

    enable() {
        this._settings = this.getSettings();
        this._indicator = new PanelMenu.Button(0.0, 'MyIndicator', false);
        
        // Store ALL signal handler IDs
        this._signalIds.push(
            this._settings.connect('changed::some-key', () => this._onSettingChanged())
        );
        
        // Store ALL source IDs
        this._sourceIds.push(
            GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
                this._update();
                return GLib.SOURCE_CONTINUE;
            })
        );
        
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        // Disconnect ALL signals
        this._signalIds.forEach(id => this._settings.disconnect(id));
        this._signalIds = [];
        
        // Remove ALL sources
        this._sourceIds.forEach(id => GLib.Source.remove(id));
        this._sourceIds = [];
        
        // Destroy ALL created objects
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
    }
}
```

---

## Signal Handler Patterns

### The Problem: Arrow Function Closures

Arrow functions capture their enclosing scope. This creates hidden references that prevent garbage collection.

```javascript
// DANGEROUS -- closure captures `this`, creates hidden reference
this._handlerId = someObject.connect('signal', () => {
    this.doSomething();  // `this` is captured in closure
});
```

Even after disconnecting, the closure may retain references to captured variables.

### Safe Pattern: Bound Methods

```javascript
class MyClass {
    constructor() {
        // Create bound method ONCE
        this._boundHandler = this._onSignal.bind(this);
    }

    enable() {
        this._handlerId = someObject.connect('signal', this._boundHandler);
    }

    disable() {
        if (this._handlerId) {
            someObject.disconnect(this._handlerId);
            this._handlerId = null;
        }
        this._boundHandler = null;  // Release bound function
    }

    _onSignal() {
        // Handle signal
    }
}
```

### Alternative: WeakRef for Non-Critical References

```javascript
enable() {
    const weakSelf = new WeakRef(this);
    this._handlerId = someObject.connect('signal', () => {
        const self = weakSelf.deref();
        if (self) self._onSignal();
    });
}
```

---

## GLib Source Management

### Timeout Sources

```javascript
// WRONG -- source ID lost
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
    this.update();
    return GLib.SOURCE_CONTINUE;
});

// CORRECT -- ID stored for cleanup
this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
    this.update();
    return GLib.SOURCE_CONTINUE;
});

// In disable():
if (this._timeoutId) {
    GLib.Source.remove(this._timeoutId);
    this._timeoutId = null;
}
```

### Idle Sources

```javascript
this._idleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
    this._deferredWork();
    return GLib.SOURCE_REMOVE;  // One-shot
});
```

### Source Callback Return Values

| Return | Effect |
|--------|--------|
| `GLib.SOURCE_CONTINUE` or `true` | Source repeats |
| `GLib.SOURCE_REMOVE` or `false` | Source removed from loop |

**Important**: After returning `SOURCE_REMOVE`, the source ID becomes invalid. Clear your stored ID:

```javascript
this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
    this._doWork();
    this._timeoutId = null;  // Clear before returning
    return GLib.SOURCE_REMOVE;
});
```

---

## Common Leak Patterns

### Pattern 1: Overwritten Variable

```javascript
// BUG: indicator1 reference lost
this._indicators['key'] = indicator1;
this._indicators['key'] = indicator2;  // indicator1 now unreachable
```

### Pattern 2: Lost Random ID

```javascript
// BUG: Can't remove indicator later
Main.panel.addToStatusArea(GLib.uuid_string_random(), indicator);

// CORRECT: Store retrievable ID
const id = 'myextension-indicator';
Main.panel.addToStatusArea(id, indicator);
// Later: Main.panel.statusArea[id].destroy();
```

### Pattern 3: Closure Capturing Dictionary

```javascript
// BUG: `config` captured in closure, never freed
enable() {
    const config = { complex: 'data', nested: { deep: true } };
    this._handlerId = settings.connect('changed', () => {
        console.log(config.complex);  // config captured forever
    });
}
```

### Pattern 4: Recursive Object References

```javascript
// BUG: Circular reference prevents collection
this._objectA = { ref: null };
this._objectB = { ref: this._objectA };
this._objectA.ref = this._objectB;

// SOLUTION: Break cycle in disable()
disable() {
    this._objectA.ref = null;
    this._objectB.ref = null;
    this._objectA = null;
    this._objectB = null;
}
```

---

## Cairo Special Case

Cairo contexts must be explicitly disposed. Unlike GObjects, they don't participate in normal GC.

```javascript
drawingArea.set_draw_func((area, cr, width, height) => {
    // Draw operations...
    cr.setSourceRGBA(1, 0, 0, 1);
    cr.rectangle(0, 0, width, height);
    cr.fill();
    
    // MANDATORY: Free Cairo context
    cr.$dispose();
});
```

---

## Memory Leak Detection Protocol

### 1. Signal Connection Audit

```bash
# In extension code, add tracking:
_debugSignals = new Map();

connect(obj, signal, handler) {
    const id = obj.connect(signal, handler);
    const key = `${obj.constructor.name}::${signal}`;
    this._debugSignals.set(id, { key, stack: new Error().stack });
    return id;
}

# In disable(), log uncleared:
for (const [id, info] of this._debugSignals) {
    console.warn(`Leaked signal: ${info.key}`);
}
```

### 2. WeakRef Tracking

```javascript
// Track object lifecycle
const tracked = new WeakRef(myObject);
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 10, () => {
    if (tracked.deref()) {
        console.warn('Object still alive after 10s');
    } else {
        console.log('Object properly collected');
    }
    return GLib.SOURCE_REMOVE;
});
```

### 3. Force GC for Testing

```javascript
// In Looking Glass (Alt+F2, lg):
imports.system.gc();
```

---

## Checklist for AI Agents

Before generating extension code, verify:

- [ ] All `connect()` calls store handler IDs in instance properties
- [ ] All `GLib.timeout_add*` / `idle_add` store source IDs
- [ ] `disable()` disconnects every signal connected in `enable()`
- [ ] `disable()` removes every source added in `enable()`
- [ ] `disable()` calls `destroy()` on created widgets/actors
- [ ] `disable()` nulls all instance properties
- [ ] No arrow functions capturing `this` in signal handlers (use `.bind()`)
- [ ] Cairo contexts call `cr.$dispose()` before returning
- [ ] No work done in constructor -- only in `enable()`
- [ ] Random IDs (UUIDs) stored for later retrieval

---

## Quick Reference

### Safe Signal Connection

```javascript
// Setup
this._boundHandler = this._onSignal.bind(this);
this._handlerId = obj.connect('signal', this._boundHandler);

// Cleanup
obj.disconnect(this._handlerId);
this._handlerId = null;
this._boundHandler = null;
```

### Safe Timeout

```javascript
// Setup
this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, N, () => {
    this._work();
    return GLib.SOURCE_CONTINUE;
});

// Cleanup
GLib.Source.remove(this._timeoutId);
this._timeoutId = null;
```

### Safe Settings

```javascript
// Setup (in enable)
this._settings = this.getSettings();
this._settingsHandlerId = this._settings.connect('changed::key', 
    this._onSettingChanged.bind(this));

// Cleanup (in disable)
this._settings.disconnect(this._settingsHandlerId);
this._settingsHandlerId = null;
this._settings = null;
```

---

## References

- [GJS Memory Management Guide](https://gjs.guide/guides/gjs/memory-management.html)
- [GJS Style Guide](https://gjs.guide/guides/gjs/style-guide.html)
- [GNOME Shell Extensions Guide](https://gjs.guide/extensions/)
- [MDN: JavaScript Scope](https://developer.mozilla.org/docs/Glossary/Scope)
- [MDN: WeakRef](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/WeakRef)
