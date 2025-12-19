# Memory Leak Detection and Fix Specification

## Objective
Implement comprehensive memory leak detection, logging, and verification in the Zoned extension to identify and fix remaining memory leaks before 1.0 release.

## Phase 1: Add Memory Tracking Infrastructure

### 1.1 Global Debug Registry

Add to the top of `extension.js`, inside the `Extension` class `enable()` method:
```javascript
// Memory tracking for debugging
global.zonedDebug = {
    instances: new Map(),
    signals: new Map(),
    timeouts: new Set(),
    
    register(name, obj) {
        if (!this.instances.has(name)) {
            this.instances.set(name, []);
        }
        this.instances.get(name).push(new WeakRef(obj));
        log(`[Zoned:Memory] Registered ${name}, total instances: ${this.instances.get(name).length}`);
    },
    
    registerSignal(objectName, signalId) {
        if (!this.signals.has(objectName)) {
            this.signals.set(objectName, []);
        }
        this.signals.get(objectName).push(signalId);
        log(`[Zoned:Memory] Registered signal on ${objectName}, ID: ${signalId}`);
    },
    
    registerTimeout(timeoutId) {
        this.timeouts.add(timeoutId);
        log(`[Zoned:Memory] Registered timeout ID: ${timeoutId}`);
    },
    
    report() {
        log('[Zoned:Memory] === MEMORY REPORT ===');
        log(`Total instance types tracked: ${this.instances.size}`);
        
        for (let [name, refs] of this.instances) {
            let alive = refs.filter(ref => ref.deref() !== undefined).length;
            let total = refs.length;
            log(`  ${name}: ${alive}/${total} alive (${total - alive} GC'd)`);
            
            if (alive > 0 && alive === total) {
                log(`    ⚠️  WARNING: No instances have been garbage collected!`);
            }
        }
        
        log(`Active signal connections tracked: ${Array.from(this.signals.values()).flat().length}`);
        log(`Active timeouts tracked: ${this.timeouts.size}`);
        log('[Zoned:Memory] === END REPORT ===');
    },
    
    clear() {
        log('[Zoned:Memory] Clearing debug registry');
        this.instances.clear();
        this.signals.clear();
        this.timeouts.clear();
    }
};

log('[Zoned:Memory] Debug registry initialized');
```

### 1.2 Register All Class Instances

In the constructor or `_init()` of EVERY class (ZoneManager, PrefsWindow, ZonePreview, etc.):
```javascript
constructor() {
    // ... existing code ...
    
    // Register for memory tracking
    global.zonedDebug?.register(this.constructor.name, this);
}
```

### 1.3 Track Signal Connections

Wrap ALL signal connections to track them:
```javascript
// BEFORE:
this._signalId = object.connect('signal', this._boundMethod);

// AFTER:
this._signalId = object.connect('signal', this._boundMethod);
global.zonedDebug?.registerSignal(object.constructor?.name || 'Unknown', this._signalId);
```

### 1.4 Track Timeout/Idle Callbacks

Wrap ALL timeout/idle registrations:
```javascript
// BEFORE:
this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, this._boundCallback);

// AFTER:
this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, this._boundCallback);
global.zonedDebug?.registerTimeout(this._timeoutId);
```

## Phase 2: Comprehensive Disable Logging

### 2.1 Enhanced Disable Method Template

Every class with `enable()`/`disable()` or lifecycle methods needs this pattern:
```javascript
disable() {
    log(`[Zoned:Lifecycle] ${this.constructor.name}.disable() START`);
    
    // Log all properties that need cleanup
    let propsToClean = Object.keys(this).filter(k => k.startsWith('_'));
    log(`[Zoned:Lifecycle]   Properties to clean: ${propsToClean.length}`);
    
    for (let key of propsToClean) {
        if (this[key] === null || this[key] === undefined) continue;
        
        let value = this[key];
        let type = typeof value;
        let hasDisconnect = value?.disconnect !== undefined;
        let hasDestroy = value?.destroy !== undefined;
        let isSignalId = key.includes('SignalId') || key.includes('_id') || key.endsWith('Id');
        
        log(`[Zoned:Lifecycle]   ${key}: type=${type}, disconnect=${hasDisconnect}, destroy=${hasDestroy}, signalId=${isSignalId}`);
    }
    
    // Disconnect all signals
    log(`[Zoned:Lifecycle]   Disconnecting signals...`);
    if (this._signalId1) {
        this._targetObject.disconnect(this._signalId1);
        log(`[Zoned:Lifecycle]     ✓ Disconnected signal ID ${this._signalId1}`);
        this._signalId1 = null;
    }
    // ... repeat for all signal IDs ...
    
    // Remove all timeouts/idles
    log(`[Zoned:Lifecycle]   Removing timeouts...`);
    if (this._timeoutId) {
        GLib.Source.remove(this._timeoutId);
        log(`[Zoned:Lifecycle]     ✓ Removed timeout ID ${this._timeoutId}`);
        this._timeoutId = null;
    }
    // ... repeat for all timeout IDs ...
    
    // Destroy all widgets/actors
    log(`[Zoned:Lifecycle]   Destroying widgets...`);
    if (this._widget) {
        this._widget.destroy();
        log(`[Zoned:Lifecycle]     ✓ Destroyed widget`);
        this._widget = null;
    }
    // ... repeat for all widgets ...
    
    // Null all object references
    log(`[Zoned:Lifecycle]   Nullifying object references...`);
    this._settings = null;
    this._manager = null;
    // ... null ALL remaining object properties ...
    
    log(`[Zoned:Lifecycle] ${this.constructor.name}.disable() END`);
}
```

### 2.2 Main Extension Disable

The main `extension.js` `disable()` must be exhaustive:
```javascript
disable() {
    log('[Zoned:Lifecycle] ===== EXTENSION DISABLE START =====');
    
    // Disable all sub-components first
    if (this._zoneManager) {
        log('[Zoned:Lifecycle] Disabling ZoneManager...');
        this._zoneManager.disable();
        this._zoneManager = null;
    }
    
    if (this._keybindingManager) {
        log('[Zoned:Lifecycle] Disabling KeybindingManager...');
        this._keybindingManager.disable();
        this._keybindingManager = null;
    }
    
    // ... disable all other managers/components ...
    
    // Disconnect all extension-level signals
    log('[Zoned:Lifecycle] Disconnecting extension signals...');
    // ... disconnect each signal with logging ...
    
    // Remove settings
    log('[Zoned:Lifecycle] Clearing settings reference...');
    this._settings = null;
    
    // Clear global registry
    log('[Zoned:Lifecycle] Clearing debug registry...');
    global.zonedDebug?.clear();
    global.zonedDebug = null;
    
    log('[Zoned:Lifecycle] ===== EXTENSION DISABLE END =====');
}
```

## Phase 3: Audit All Signal Connections

### 3.1 Verify Every .connect() Has .disconnect()

Create a comprehensive audit:
```bash
# Find all signal connections
rg "\.connect\(" --type js -n > /tmp/connects.txt

# Find all disconnections  
rg "\.disconnect\(" --type js -n > /tmp/disconnects.txt

# Count them
echo "Total connects: $(wc -l < /tmp/connects.txt)"
echo "Total disconnects: $(wc -l < /tmp/disconnects.txt)"
```

**Deliverable**: Provide a report showing:
- File:line for each `.connect()` call
- Whether a corresponding `.disconnect()` exists in the same class's `disable()` method
- Which signal IDs are NOT being disconnected

### 3.2 Common Missing Disconnects

Check these specific cases:

1. **Settings connections** - MUST disconnect AND null settings object
```javascript
// In enable/constructor:
this._settingsChangedId = this._settings.connect('changed::zone-layouts', this._boundLoadLayouts);

// In disable - BOTH required:
if (this._settingsChangedId) {
    this._settings.disconnect(this._settingsChangedId);
    this._settingsChangedId = null;
}
this._settings = null; // THIS IS CRITICAL
```

2. **Global display signals**
```javascript
// Check for:
global.display.connect('window-created', ...)
global.display.connect('notify::focus-window', ...)
global.workspace_manager.connect('workspace-switched', ...)

// Must be disconnected in disable()
```

3. **Monitor signals**
```javascript
// Check for:
Main.layoutManager.connect('monitors-changed', ...)

// Must be disconnected
```

4. **Actor/widget signals**
```javascript
// Check for any St.Widget, Clutter.Actor connections
button.connect('clicked', ...)
actor.connect('notify::visible', ...)

// Must be disconnected AND actor must be destroyed
```

## Phase 4: Timeout/Idle Callback Audit

### 4.1 Find All GLib Callbacks
```bash
# Find all timeout/idle registrations
rg "(timeout_add|idle_add|timeout_add_seconds)" --type js -n
```

**Verify**: Each one has corresponding `GLib.Source.remove()` call in cleanup

### 4.2 Common Pattern
```javascript
// In enable/method:
this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, this._boundCallback);

// MUST have in disable:
if (this._timeoutId) {
    GLib.Source.remove(this._timeoutId);
    this._timeoutId = null;
}
```

## Phase 5: Object Reference Nullification

### 5.1 Null ALL Object Properties

In every `disable()` method, after disconnecting signals and removing timeouts:
```javascript
// Null ALL object references
this._settings = null;
this._zoneManager = null;
this._layoutManager = null;
this._windowTracker = null;
// ... continue for EVERY object property
```

**Rule**: If it's an object and stored as `this._something`, it MUST be set to `null` in `disable()`

### 5.2 Destroy Widget Hierarchy
```javascript
// For any UI elements:
if (this._container) {
    this._container.destroy(); // Recursively destroys children
    this._container = null;
}

// NOT just:
if (this._container) {
    this._container.remove_all_children(); // Insufficient!
    this._container = null;
}
```

## Phase 6: Testing Protocol

### 6.1 Memory Test Procedure

1. **Baseline measurement**
```bash
# Terminal 1: Watch logs
journalctl -f -o cat /usr/bin/gnome-shell | grep -E "(Zoned|Memory)"

# Terminal 2: Get baseline
ps aux | grep gnome-shell | awk '{print "Memory: " $6 " KB"}'
```

2. **Load test**
```bash
# In Looking Glass (Alt+F2, type 'lg'):
Main.extensionManager.lookup('zoned@your-uuid').stateObj.disable()
System.gc()
global.zonedDebug?.report()

Main.extensionManager.lookup('zoned@your-uuid').stateObj.enable()
# Use extension heavily (create zones, move windows, etc.)

Main.extensionManager.lookup('zoned@your-uuid').stateObj.disable()
System.gc()
System.gc() # Run twice
global.zonedDebug?.report()

# Check memory again
```

3. **Cycle test**
```bash
# Repeat enable/disable 10 times
for i in {1..10}; do
    # Enable, use, disable via Looking Glass
    echo "Cycle $i"
done

# Check memory growth
ps aux | grep gnome-shell | awk '{print "Memory: " $6 " KB"}'
```

### 6.2 Success Criteria

- **Memory growth < 5MB after 10 enable/disable cycles**
- **`zonedDebug.report()` shows instances being GC'd**
- **No warnings in logs about un-disconnected signals**
- **Settings object shows as disconnected in logs**

## Phase 7: Code Review Checklist

Go through EVERY file and verify:

- [ ] Every class constructor calls `global.zonedDebug?.register()`
- [ ] Every `.connect()` is wrapped with `global.zonedDebug?.registerSignal()`
- [ ] Every timeout/idle is wrapped with `global.zonedDebug?.registerTimeout()`
- [ ] Every class with signals has corresponding `.disconnect()` calls
- [ ] Every timeout/idle has corresponding `GLib.Source.remove()` call
- [ ] Every object property is nullified in `disable()`
- [ ] Every widget/actor has `.destroy()` called before nullification
- [ ] Settings object is both disconnected AND nullified
- [ ] No arrow functions remain in signal handlers (should all be bound methods)
- [ ] All `disable()` methods have comprehensive logging

## Deliverables

1. **Audit Report**: List of all `.connect()` calls and their corresponding (or missing) `.disconnect()` calls
2. **Modified Code**: All files updated with memory tracking and enhanced logging
3. **Test Results**: Output from `zonedDebug.report()` before/after enable/disable cycles
4. **Memory Measurement**: PS memory readings before/after 10 cycles

## Critical Reminders

- **Settings objects MUST be nullified** - disconnecting signals is not enough
- **Widget hierarchy MUST be destroyed** - `.destroy()` propagates to children
- **Every `.connect()` needs `.disconnect()`** - no exceptions
- **Every timeout needs `GLib.Source.remove()`** - they don't auto-clean
- **Bound methods still create references** - they MUST be disconnected

## Success Metric

After implementing all fixes and running 10 enable/disable cycles:
- Memory growth: < 5MB (currently: unknown, likely 50-100MB+)
- Instances GC'd: > 80% of registered instances show as collected
- Zero warnings in logs about leaked references

This is a **blocking issue for 1.0 release**.