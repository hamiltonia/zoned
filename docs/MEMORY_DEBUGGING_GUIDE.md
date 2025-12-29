# GNOME Shell Extension Memory Leak Debugging Guide

**Last Updated:** 2025-12-18

This guide covers all available tools and techniques for debugging memory leaks in GNOME Shell extensions written in GJS (GNOME JavaScript).

---

## Understanding the Problem

**Current Situation:**
- Extension leaks ~271MB over 30 minutes of testing
- Instance tracking shows objects ARE being created/destroyed correctly
- This means: Objects are destroyed, but memory they allocated is NOT freed
- Likely causes:
  1. Actors not removed from scene graph before destruction
  2. Signal connections to global objects never disconnected
  3. Closures capturing large objects
  4. Accumulated state in long-lived objects

---

## Method 1: Looking Glass (Easiest, Built-in)

### What It Is
GNOME Shell's built-in JavaScript console with live object inspection.

### How to Use

**IMPORTANT:** Close any Zoned dialogs BEFORE opening Looking Glass. The layout window has a modal grab that will prevent interaction with Looking Glass.

1. **Open Looking Glass:**
   ```bash
   # Press Alt+F2
   # Type: lg
   # Press Enter
   ```

**Troubleshooting:** If the layout window pops on top:
- Press Escape to close it first
- Then reopen Looking Glass (Alt+F2 → lg)
- OR use the D-Bus method below to query without UI

### Alternative: D-Bus Console (No UI Conflict)

If Looking Glass won't work due to modal conflicts, use command line instead:

```bash
# Count actors via D-Bus eval
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell \
  --method org.gnome.Shell.Eval \
  'Main.uiGroup.get_n_children()'

# Force GC
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell \
  --method org.gnome.Shell.Eval \
  'System.gc()'

# List actor types
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell \
  --method org.gnome.Shell.Eval \
  'JSON.stringify(Main.uiGroup.get_children().reduce((acc, c) => { acc[c.constructor.name] = (acc[c.constructor.name] || 0) + 1; return acc; }, {}))'
```

**Output format:**
```
(true, '45')  # true = success, '45' = result
```

2. **Check UI Actor Counts:**
   ```javascript
   // In the "Evaluator" tab, type:
   Main.uiGroup.get_n_children()
   
   // Run your test, then check again
   Main.uiGroup.get_n_children()
   
   // If the count increased → actors are leaking
   ```

3. **Force Garbage Collection:**
   ```javascript
   System.gc()
   
   // Wait 2 seconds, then check count again
   Main.uiGroup.get_n_children()
   
   // If count DIDN'T decrease → real leak (not just delayed GC)
   ```

4. **Inspect Leaked Actors:**
   ```javascript
   // List all children
   for (let i = 0; i < Main.uiGroup.get_n_children(); i++) {
       let child = Main.uiGroup.get_child_at_index(i);
       log(`${i}: ${child.constructor.name} - visible: ${child.visible}`);
   }
   
   // Look for Zoned-related actors
   for (let i = 0; i < Main.uiGroup.get_n_children(); i++) {
       let child = Main.uiGroup.get_child_at_index(i);
       if (child.constructor.name.includes('St') || child.visible) {
           log(`${i}: ${child.constructor.name}`);
       }
   }
   ```

5. **Check Window Actors:**
   ```javascript
   global.get_window_actors().length
   ```

### What to Look For
- **Before test:** Note the count (e.g., 45 children)
- **After test:** If count is 145 → 100 actors leaked
- **After GC:** If still 145 → actors are referenced somewhere

---

## Method 2: Chrome DevTools (Most Powerful)

### What It Is
Full heap profiler with retention paths showing what's keeping objects alive.

### Setup

1. **Enable Chrome DevTools in GJS:**
   ```bash
   # Edit /usr/bin/gnome-shell or run directly:
   env GNOME_SHELL_SLOWDOWN_FACTOR=2 \
       GJS_DEBUG_TOPICS=debugger \
       GJS_DEBUGGER_PORT=9229 \
       gnome-shell --replace
   ```

2. **Connect Chrome:**
   ```bash
   # Open Chrome browser
   # Go to: chrome://inspect
   # Click "Configure" → Add: localhost:9229
   # Wait for "GNOME Shell" to appear
   # Click "inspect"
   ```

### Taking Heap Snapshots

1. **Baseline Snapshot:**
   - In DevTools → Memory tab
   - Select "Heap snapshot"
   - Click "Take snapshot"
   - Label it "Before test"

2. **Run Your Test:**
   - UI Stress test (open/close LayoutSwitcher 100 times)

3. **After Snapshot:**
   - Force GC in Looking Glass: `System.gc()`
   - Wait 5 seconds
   - Take another snapshot: "After test"

4. **Compare:**
   - Select "After test" snapshot
   - Change view to "Comparison"
   - Select "Before test" as baseline
   - Sort by "Size Delta" (descending)

### What to Look For

- **Retained Size** - How much memory an object is keeping alive
- **Shallow Size** - The object's own memory
- **Retainers** - What's keeping it alive

**Example:**
```
Object: St.BoxLayout
Retained Size: +50MB
Retainers:
  → Main.uiGroup.children[145]
  → _dialog property in LayoutSwitcher
```

This tells you: LayoutSwitcher has a `_dialog` property that wasn't cleared, and it's still in Main.uiGroup.

---

## Method 3: Manual Actor Counting

### Add to Your Code

Create `extension/utils/actorDebug.js`:

```javascript
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {createLogger} from './debug.js';

const logger = createLogger('ActorDebug');

export function countActors() {
    const total = Main.uiGroup.get_n_children();
    const types = {};
    
    for (let i = 0; i < total; i++) {
        const child = Main.uiGroup.get_child_at_index(i);
        const type = child.constructor.name;
        types[type] = (types[type] || 0) + 1;
    }
    
    logger.info(`Total actors: ${total}`);
    for (const [type, count] of Object.entries(types)) {
        if (count > 1) {
            logger.info(`  ${type}: ${count}`);
        }
    }
    
    return {total, types};
}

export function dumpActorTree() {
    const total = Main.uiGroup.get_n_children();
    logger.info(`=== Actor Tree (${total} children) ===`);
    
    for (let i = 0; i < total; i++) {
        const child = Main.uiGroup.get_child_at_index(i);
        logger.info(`[${i}] ${child.constructor.name} - visible: ${child.visible}, reactive: ${child.reactive}`);
    }
}
```

### Use in Tests

```javascript
import {countActors, dumpActorTree} from './utils/actorDebug.js';

// Before test
const before = countActors();

// Run test
// ... UI Stress test ...

// After test
System.gc();  // Force garbage collection
const after = countActors();

logger.warn(`Actors leaked: ${after.total - before.total}`);

if (after.total > before.total + 10) {
    dumpActorTree();  // Show what's there
}
```

---

## Method 4: Signal Connection Tracking

### The Problem
Signal connections to global objects prevent garbage collection.

### Track Connections

Add to your component:

```javascript
class MyComponent {
    constructor() {
        this._signals = [];  // Track all signal IDs
    }
    
    connectSignal(object, signal, callback) {
        const id = object.connect(signal, callback);
        this._signals.push({object, id});
        return id;
    }
    
    destroy() {
        // Disconnect ALL signals
        for (const {object, id} of this._signals) {
            try {
                object.disconnect(id);
            } catch (e) {
                // Object may be destroyed
            }
        }
        this._signals = [];
    }
}
```

### Audit Existing Code

Search for all `.connect()` calls without corresponding `.disconnect()`:

```bash
# Find all signal connections
grep -r "\.connect(" extension/ | grep -v "disconnect"

# Find connections to global objects (biggest risk)
grep -r "global\." extension/ | grep "connect"
grep -r "Main\." extension/ | grep "connect"
grep -r "this\._settings\.connect" extension/
```

For every `.connect()`, ensure there's a `.disconnect()` in `destroy()`.

---

## Method 5: Valgrind (Nuclear Option)

### What It Is
Memory profiler that tracks EVERY allocation. Very slow but finds everything.

### Run GNOME Shell Under Valgrind

```bash
# Stop current session
gnome-session-quit --no-prompt

# From TTY (Ctrl+Alt+F2):
valgrind \
    --tool=massif \
    --massif-out-file=/tmp/massif.out \
    --pages-as-heap=yes \
    gnome-shell --replace &

# Run your tests
# After 5 minutes, kill gnome-shell

# Analyze
ms_print /tmp/massif.out | less
```

### What to Look For

```
MB
^
|     :::::::::
|   ::::::::::::::
| :::::::::::::::::
+-------------------> time

Peak allocations at specific function calls
```

Look for:
- Steadily increasing allocations (not freed)
- Large blocks allocated by your extension's functions

---

## Method 6: Code Audit Checklist

### For Every Component Class

Go through each file in `extension/ui/` and `extension/`:

#### 1. Constructor Audit

List everything created:

```
LayoutSwitcher constructor creates:
  ✓ _templateManager - Has destroy()? YES
  ✓ _themeManager - Has destroy()? YES  
  ✓ _dialog - Removed from uiGroup? CHECK
  ✓ _previewBackground - Has destroy()? YES
  ✗ _settings connections - Disconnected? NO <- LEAK!
```

#### 2. Show/Hide Audit

For UI components with show/hide:

```javascript
show() {
    // Added to scene graph?
    Main.uiGroup.add_child(this._dialog);  // ← Must be REMOVED in hide()
    
    // Signal connections?
    this._keyPressId = this._dialog.connect(...);  // ← Must DISCONNECT in hide()
}

hide() {
    // Remove from scene graph!
    if (this._dialog.get_parent()) {
        Main.uiGroup.remove_child(this._dialog);  // ✓ GOOD
    }
    
    // Disconnect signals!
    if (this._keyPressId) {
        this._dialog.disconnect(this._keyPressId);  // ✓ GOOD
        this._keyPressId = null;
    }
    
    // Destroy the actor!
    this._dialog.destroy();  // ✓ GOOD
    this._dialog = null;
}
```

#### 3. Common Mistakes

**Mistake 1: Forgot to remove from uiGroup**
```javascript
destroy() {
    this._actor.destroy();  // ✗ WRONG - still in uiGroup!
}

// Fix:
destroy() {
    if (this._actor.get_parent()) {
        this._actor.get_parent().remove_child(this._actor);  // ✓ Remove first
    }
    this._actor.destroy();
}
```

**Mistake 2: Signal to global object**
```javascript
constructor() {
    global.stage.connect('key-press-event', () => {...});  // ✗ LEAK - never disconnected
}

// Fix:
constructor() {
    this._keyId = global.stage.connect('key-press-event', () => {...});
}
destroy() {
    if (this._keyId) {
        global.stage.disconnect(this._keyId);
        this._keyId = null;
    }
}
```

**Mistake 3: GSettings connection**
```javascript
constructor() {
    this._settings.connect('changed::some-key', () => {...});  // ✗ LEAK
}

// Fix:
constructor() {
    this._settingsId = this._settings.connect('changed::some-key', () => {...});
}
destroy() {
    if (this._settingsId) {
        this._settings.disconnect(this._settingsId);
        this._settingsId = null;
    }
}
```

---

## Debugging Workflow

### Step-by-Step Process

1. **Reproduce the leak:**
   ```bash
   make vm-long-haul DURATION=5m
   # Note: +271MB growth
   ```

2. **Open Looking Glass:**
   - Before test: Check `Main.uiGroup.get_n_children()` → 45
   - After test: Check again → 145 (100 actors leaked!)

3. **Identify actor types:**
   ```javascript
   for (let i = 0; i < Main.uiGroup.get_n_children(); i++) {
       let c = Main.uiGroup.get_child_at_index(i);
       if (i >= 45) {  // Only new ones
           log(`Leaked: ${c.constructor.name}`);
       }
   }
   ```

4. **Find where they're created:**
   - Search codebase for `new St.Widget` (or whatever type leaked)
   - Check if corresponding `destroy()` exists
   - Check if removed from parent before destroy

5. **Fix and verify:**
   - Add proper cleanup
   - Re-run test
   - Check Looking Glass → Should be back to 45

---

## Quick Reference

### One-Liner Checks

```javascript
// In Looking Glass:

// Total UI actors
Main.uiGroup.get_n_children()

// Force GC
System.gc()

// List actor types
Main.uiGroup.get_children().map(c => c.constructor.name)

// Count by type
Main.uiGroup.get_children().reduce((acc, c) => {
    acc[c.constructor.name] = (acc[c.constructor.name] || 0) + 1;
    return acc;
}, {})

// Find invisible actors (likely leaked)
Main.uiGroup.get_children().filter(c => !c.visible).map(c => c.constructor.name)
```

### Common Leak Patterns

| Pattern | Symptom | Fix |
|---------|---------|-----|
| Actor not removed | `get_n_children()` grows | `parent.remove_child()` before `destroy()` |
| Signal to global | Object can't be GC'd | Store IDs, disconnect in `destroy()` |
| Closure captures this | Memory held by callback | Use `bind(this)` sparingly, disconnect signals |
| Settings connection | Listener never removed | Store ID, `settings.disconnect()` in destroy |
| Timeout/interval | Keeps running forever | Store ID, `GLib.source_remove()` in destroy |

---

## Your Specific Leak (Zoned Extension)

### What We Know

1. **Instance counters show CLEAN:**
   - LayoutSwitcher: 0→1→0→1→0 (perfect)
   - TemplateManager: 1→2→1→2→1 (perfect)
   - ThemeManager: 0→1→2→1→2→1 (perfect)
   - LayoutPreviewBackground: 0→1→0→1→0 (perfect)

2. **But memory still leaks +271MB**

3. **Conclusion:**
   - Objects ARE being destroyed
   - But SOMETHING they created is NOT being destroyed
   - Likely: Actors still in Main.uiGroup

### Next Steps

1. **Check Main.uiGroup before/after UI Stress test:**
   ```javascript
   // In Looking Glass before test:
   let before = Main.uiGroup.get_n_children();
   log(`Before: ${before}`);
   
   // Run: make vm-test-ui-stress
   
   // In Looking Glass after test:
   let after = Main.uiGroup.get_n_children();
   log(`After: ${after}, Leaked: ${after - before}`);
   ```

2. **If actors are leaking, find which type:**
   ```javascript
   let types = {};
   for (let i = 0; i < Main.uiGroup.get_n_children(); i++) {
       let c = Main.uiGroup.get_child_at_index(i);
       types[c.constructor.name] = (types[c.constructor.name] || 0) + 1;
   }
   log(JSON.stringify(types, null, 2));
   ```

3. **Search codebase for that actor type:**
   ```bash
   # If St.Widget is leaking:
   grep -r "new St.Widget" extension/
   
   # Check each location has matching destroy()
   ```

4. **Add actor removal before destroy:**
   ```javascript
   // In every destroy() method:
   if (this._someActor && this._someActor.get_parent()) {
       this._someActor.get_parent().remove_child(this._someActor);
   }
   this._someActor.destroy();
   this._someActor = null;
   ```

---

## Getting Help

If you're still stuck:

1. **Provide Looking Glass output:**
   - Actor count before/after
   - List of actor types

2. **Provide heap snapshot comparison:**
   - Top 10 objects by delta size
   - Retention paths for largest leak

3. **Provide code audit:**
   - List of components
   - Which ones have destroy() methods
   - Which signal connections exist

---

## Tools Summary

| Tool | Difficulty | Accuracy | Speed | Best For |
|------|-----------|----------|-------|----------|
| Looking Glass | Easy | Medium | Fast | Actor leaks |
| Chrome DevTools | Medium | High | Medium | All leaks + retention paths |
| actorDebug.js | Easy | Medium | Fast | Actor counting |
| Code Audit | Medium | High | Slow | Finding root cause |
| Valgrind | Hard | Highest | Very Slow | Last resort |

**Recommendation:** Start with Looking Glass, then use Chrome DevTools if actors aren't the issue.

---

## Success Criteria

You've fixed the leak when:

1. **Actor count stable:**
   ```javascript
   // Looking Glass before/after test:
   Main.uiGroup.get_n_children()  // Same number (+/- 5)
   ```

2. **Memory growth minimal:**
   ```bash
   make vm-long-haul DURATION=30m
   # Result: <50MB growth (vs current 271MB)
   ```

3. **Post-GC recovery:**
   - Run test
   - `System.gc()` in Looking Glass
   - Memory returns to baseline

Good luck. You can do this - the tools are all here.
