# Per-Space Layouts Implementation Specification

**Status:** Implementation In Progress (Phases 1-4 Complete, Phase 5 Remaining)  
**Created:** 2025-12-07  
**Updated:** 2025-12-07  
**Feature:** Different layouts for different workspaces and monitors

---

## Overview

When `use-per-workspace-layouts` is disabled (default), all spaces share one global layout. When enabled, each workspace×monitor combination (a "space") can have its own independent layout and zone state.

## Terminology

| Term | Definition |
|------|------------|
| **Space** | A (monitor, workspace) pair - e.g., "DP-1 on Workspace 2" |
| **SpaceKey** | String identifier: `"connector:workspaceIndex"` (e.g., "DP-1:1") |
| **Connector** | Hardware port name from GNOME: "eDP-1", "HDMI-1", "DP-2", etc. |

---

## State Model

### SpaceKey Format

```javascript
const key = `${monitorConnector}:${workspaceIndex}`;
// Examples: "DP-1:0", "eDP-1:2", "HDMI-1:1"
```

### Spatial State Structure

```javascript
{
  "DP-1:0": { layoutId: "halves", zoneIndex: 2 },
  "DP-1:1": { layoutId: "code-focus", zoneIndex: 0 },
  "eDP-1:0": { layoutId: "thirds", zoneIndex: 1 },
  // ...
}
```

### Fallback Chain

When looking up state for a space:
1. Check `spatial-state-map` for exact `connector:workspace` key
2. If not found → use `last-selected-layout` 
3. If never configured → use "halves"

---

## Schema Changes

### New Keys

```xml
<!-- Spatial state map (replaces workspace-layout-map) -->
<key name="spatial-state-map" type="s">
  <default>"{}"</default>
  <summary>Per-space layout state</summary>
  <description>
    JSON mapping "connector:workspace" to {layoutId, zoneIndex}.
    Example: {"DP-1:0": {"layoutId": "halves", "zoneIndex": 0}}
  </description>
</key>

<!-- Last selected layout (fallback for unconfigured spaces) -->
<key name="last-selected-layout" type="s">
  <default>"halves"</default>
  <summary>Most recently selected layout</summary>
  <description>
    Used as default for unconfigured spaces when per-space mode enabled.
  </description>
</key>

<!-- Quick layout shortcuts (position-based, 1-9) -->
<key name="quick-layout-1" type="as">
  <default>['&lt;Super&gt;&lt;Ctrl&gt;&lt;Alt&gt;1']</default>
  <summary>Activate first layout in order</summary>
</key>
<key name="quick-layout-2" type="as">
  <default>['&lt;Super&gt;&lt;Ctrl&gt;&lt;Alt&gt;2']</default>
  <summary>Activate second layout in order</summary>
</key>
<!-- ... through quick-layout-9 ... -->
```

### Deprecated Keys (Migration)

```xml
<!-- workspace-layout-map - migrate to spatial-state-map on first load -->
```

---

## Component Changes

### 1. SpatialStateManager (New Class)

**File:** `extension/spatialStateManager.js`

```javascript
/**
 * SpatialStateManager - Manages per-space layout state
 * 
 * Responsibilities:
 * - Get/set layout+zoneIndex for any space
 * - Persist state to GSettings
 * - Handle fallback chain
 * - Migration from old workspace-layout-map
 */

export class SpatialStateManager {
    constructor(settings) {
        this._settings = settings;
        this._stateCache = {};  // In-memory cache
        this._loadState();
    }

    /**
     * Get monitor connector string
     * @param {number|Meta.Monitor} monitor - Index or monitor object
     * @returns {string} Connector name (e.g., "DP-1", "eDP-1")
     */
    getMonitorConnector(monitor) {
        if (typeof monitor === 'number') {
            monitor = Main.layoutManager.monitors[monitor];
        }
        // Meta.Monitor.connector available in GNOME 42+
        return monitor?.connector || `monitor-${monitor?.index || 0}`;
    }

    /**
     * Build space key from monitor and workspace
     * @param {number|string} monitor - Index or connector
     * @param {number} workspace - Workspace index
     * @returns {string} SpaceKey
     */
    makeKey(monitor, workspace) {
        const connector = typeof monitor === 'string' 
            ? monitor 
            : this.getMonitorConnector(monitor);
        return `${connector}:${workspace}`;
    }

    /**
     * Get state for a space
     * @param {string} key - SpaceKey
     * @returns {{layoutId: string, zoneIndex: number}}
     */
    getState(key) {
        if (this._stateCache[key]) {
            return { ...this._stateCache[key] };
        }
        // Fallback
        return {
            layoutId: this._settings.get_string('last-selected-layout') || 'halves',
            zoneIndex: 0
        };
    }

    /**
     * Set state for a space
     * @param {string} key - SpaceKey
     * @param {string} layoutId - Layout ID
     * @param {number} zoneIndex - Zone index
     */
    setState(key, layoutId, zoneIndex = 0) {
        this._stateCache[key] = { layoutId, zoneIndex };
        this._saveState();
        
        // Also update last-selected
        this._settings.set_string('last-selected-layout', layoutId);
    }

    /**
     * Update zone index only
     */
    setZoneIndex(key, zoneIndex) {
        if (!this._stateCache[key]) {
            const defaultState = this.getState(key);
            this._stateCache[key] = defaultState;
        }
        this._stateCache[key].zoneIndex = zoneIndex;
        this._saveState();
    }

    _loadState() {
        try {
            const json = this._settings.get_string('spatial-state-map');
            this._stateCache = JSON.parse(json);
        } catch (e) {
            this._stateCache = {};
            this._migrateOldState();
        }
    }

    _saveState() {
        this._settings.set_string('spatial-state-map', JSON.stringify(this._stateCache));
    }

    _migrateOldState() {
        // Migrate workspace-layout-map to spatial-state-map
        // Old format: {"0": "layout-halves", "1": "layout-code"}
        // New format: {"monitor:0": {layoutId, zoneIndex}, ...}
        try {
            const oldJson = this._settings.get_string('workspace-layout-map');
            const oldMap = JSON.parse(oldJson);
            
            // Migrate using primary monitor connector for all
            const primaryConnector = this.getMonitorConnector(Main.layoutManager.primaryIndex);
            
            for (const [wsIndex, layoutId] of Object.entries(oldMap)) {
                const key = `${primaryConnector}:${wsIndex}`;
                this._stateCache[key] = { layoutId, zoneIndex: 0 };
            }
            
            if (Object.keys(this._stateCache).length > 0) {
                this._saveState();
                logger.info('Migrated workspace-layout-map to spatial-state-map');
            }
        } catch (e) {
            // No old data or invalid - that's fine
        }
    }

    destroy() {
        this._stateCache = {};
    }
}
```

### 2. LayoutManager Changes

**File:** `extension/layoutManager.js`

**Changes:**
- Delegate to `SpatialStateManager` when `use-per-workspace-layouts` is true
- Add methods: `getLayoutForSpace(key)`, `setLayoutForSpace(key, layoutId)`
- Modify `cycleZone()` to accept space context

```javascript
// Add to constructor
this._spatialStateManager = null;

// New method
setSpatialStateManager(manager) {
    this._spatialStateManager = manager;
}

// Modified getCurrentLayout() signature
getCurrentLayout(spaceKey = null) {
    if (this._settings.get_boolean('use-per-workspace-layouts') && spaceKey) {
        const state = this._spatialStateManager.getState(spaceKey);
        const layout = this._layouts.find(l => l.id === state.layoutId);
        return layout || this._layouts[0];
    }
    return this._currentLayout;
}

// Modified cycleZone() with optional space context
cycleZone(direction, spaceKey = null) {
    const spatialMode = this._settings.get_boolean('use-per-workspace-layouts');
    
    if (spatialMode && spaceKey && this._spatialStateManager) {
        const state = this._spatialStateManager.getState(spaceKey);
        const layout = this._layouts.find(l => l.id === state.layoutId);
        if (!layout) return null;
        
        const numZones = layout.zones.length;
        const newIndex = (state.zoneIndex + direction + numZones) % numZones;
        
        this._spatialStateManager.setZoneIndex(spaceKey, newIndex);
        return layout.zones[newIndex];
    }
    
    // Global mode (existing behavior)
    // ... existing code ...
}
```

### 3. KeybindingManager Changes

**File:** `extension/keybindingManager.js`

**Changes:**
- Get space context from focused window
- Pass space context to LayoutManager

```javascript
_onCycleZoneRight() {
    const window = this._windowManager.getFocusedWindow();
    if (!window) return;

    // Get space context
    const spatialMode = this._settings.get_boolean('use-per-workspace-layouts');
    let spaceKey = null;
    
    if (spatialMode) {
        const monitorIndex = window.get_monitor();
        const workspaceIndex = window.get_workspace().index();
        spaceKey = this._spatialStateManager.makeKey(monitorIndex, workspaceIndex);
    }

    const zone = this._layoutManager.cycleZone(1, spaceKey);
    if (!zone) return;

    this._windowManager.moveWindowToZone(window, zone);
    
    // Show overlay with space-aware layout
    const layout = this._layoutManager.getCurrentLayout(spaceKey);
    // ... show notification ...
}
```

### 4. LayoutSwitcher Changes

**File:** `extension/ui/layoutSwitcher.js`

**Changes:**
- Workspace thumbnail shows per-space layout preview
- Clicking workspace → switches to that workspace
- Track selected space (monitor + workspace)

```javascript
// In createWorkspaceThumbnails (topBar.js)
const zones = this._getLayoutForSpace(monitorIndex, workspaceIndex)?.zones || [];

// Workspace click handler
onWorkspaceThumbnailClicked(ctx, workspaceIndex) {
    // Switch to that workspace (moves user there)
    const workspace = global.workspace_manager.get_workspace_by_index(workspaceIndex);
    workspace.activate(global.get_current_time());
    
    // Update selected workspace in switcher
    ctx._currentWorkspace = workspaceIndex;
    
    // Refresh dialog (will re-open on new workspace due to workspace-switch signal)
    // OR: Add delay and refresh in place
}
```

### 5. LayoutPreviewBackground Changes

**File:** `extension/ui/layoutPreviewBackground.js`

**Changes:**
- Support per-monitor layout preview
- Draw each monitor's configured layout

```javascript
show(layouts = null) {
    // If spatial mode: get layout per monitor
    const monitors = Main.layoutManager.monitors;
    
    if (this._settings.get_boolean('use-per-workspace-layouts')) {
        const currentWorkspace = global.workspace_manager.get_active_workspace_index();
        
        monitors.forEach((monitor, idx) => {
            const spaceKey = this._spatialStateManager.makeKey(idx, currentWorkspace);
            const layout = this._layoutManager.getCurrentLayout(spaceKey);
            this._drawZonesForMonitor(monitor, layout);
        });
    } else {
        // Global mode: same layout on all monitors
        monitors.forEach(monitor => {
            this._drawZonesForMonitor(monitor, layouts);
        });
    }
}
```

### 6. Quick Layout Shortcuts

**File:** `extension/keybindingManager.js` (additions)

```javascript
// In registerKeybindings()
for (let i = 1; i <= 9; i++) {
    this._registerKeybinding(
        `quick-layout-${i}`,
        () => this._onQuickLayout(i)
    );
}

_onQuickLayout(position) {
    const layouts = this._layoutManager.getAllLayoutsOrdered();
    const index = position - 1;
    
    if (index >= layouts.length) return;
    
    const layout = layouts[index];
    
    // Determine target space
    const spatialMode = this._settings.get_boolean('use-per-workspace-layouts');
    const window = this._windowManager.getFocusedWindow();
    
    if (spatialMode && window) {
        const spaceKey = this._spatialStateManager.makeKey(
            window.get_monitor(),
            window.get_workspace().index()
        );
        this._layoutManager.setLayoutForSpace(spaceKey, layout.id);
    } else {
        // Apply globally or to primary monitor current workspace
        this._layoutManager.setLayout(layout.id);
    }
    
    this._zoneOverlay.showMessage(`Switched to: ${layout.name}`);
}
```

---

## Implementation Phases

### Phase 1: State Foundation + UI Preview
**Files:** spatialStateManager.js, layoutManager.js, layoutSwitcher.js, topBar.js

- [x] Create `SpatialStateManager` class
- [x] Add GSettings keys: `spatial-state-map`, `last-selected-layout`
- [x] Modify `LayoutManager` to use spatial state when enabled
- [x] Update workspace thumbnails to call `getLayoutForSpace()`
- [ ] Workspace click → switch to that workspace (optional: actual GNOME workspace switch)
- [x] Migration from `workspace-layout-map`

### Phase 2: Keybinding Context Awareness
**Files:** keybindingManager.js, windowManager.js

- [x] Modify `_onCycleZoneLeft/Right` to detect space context
- [x] Track zone index per-space
- [x] Pass `spaceKey` through to `cycleZone()`

### Phase 3: Multi-Monitor Preview ✅ COMPLETE
**Files:** layoutPreviewBackground.js, layoutSwitcher.js

- [x] `LayoutPreviewBackground.show()` draws per-monitor layouts
- [x] Calculate zone positions relative to each monitor
- [x] `setLayoutManager()` method for per-space lookups
- [x] Selected monitor shows bright zones, others dimmed
- [x] Each monitor overlay stores its own zone actors and layout state

### Phase 4: Quick Layout Shortcuts
**Files:** keybindingManager.js, schema

- [x] Add `quick-layout-1` through `quick-layout-9` GSettings keys
- [x] Register position-based keybindings
- [x] Implement `_onQuickLayout(position)` handler

### Phase 5: Polish
- [ ] Monitor hotplug handling
- [ ] Validate zone indices on load
- [ ] Error recovery and logging
- [ ] Handle deleted layouts in state

---

## Edge Cases

### Monitor Hotplug
- On disconnect: State preserved, will apply when reconnected
- On reconnect: Lookup by connector, restore previous state
- Unknown connector: Use fallback chain

### Workspace Dynamic Creation
- New workspace gets fallback state (last-selected layout)
- Workspace deletion: State remains (harmless orphans)

### Layout Deletion
- If layout ID in state is deleted: Falls through to last-selected
- If last-selected is deleted: Falls through to "halves"

### Zone Index Out of Bounds
```javascript
const validIndex = Math.min(state.zoneIndex, layout.zones.length - 1);
```

---

## Testing Checklist

- [ ] Enable per-space mode, assign different layouts to workspaces
- [ ] Switch workspaces, verify correct layout shown
- [ ] Zone cycle on each workspace maintains separate zone index
- [ ] Workspace thumbnail shows correct preview
- [ ] Disable per-space mode, verify global behavior restored
- [ ] Quick shortcuts (Super+Ctrl+Alt+1-9) apply to correct space
- [ ] Multi-monitor: each monitor shows its layout
- [ ] Restart GNOME Shell, state persists correctly
- [ ] Delete a layout, verify graceful fallback

---

## Related Files

- `extension/extension.js` - Initialize SpatialStateManager
- `extension/layoutManager.js` - Layout retrieval per-space
- `extension/keybindingManager.js` - Context-aware keybindings
- `extension/windowManager.js` - May need explicit monitor param
- `extension/ui/layoutSwitcher.js` - Space selection UI
- `extension/ui/layoutSwitcher/topBar.js` - Workspace thumbnails
- `extension/ui/layoutPreviewBackground.js` - Per-monitor preview
- `extension/schemas/org.gnome.shell.extensions.zoned.gschema.xml` - New keys

---

*Implementation order: Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5*
