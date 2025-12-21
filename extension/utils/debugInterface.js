/**
 * D-Bus Debug Interface for Zoned Extension
 *
 * Exposes extension internals for automated stability testing.
 * Only active when debug-expose-dbus GSettings key is true.
 *
 * D-Bus Interface: org.gnome.Shell.Extensions.Zoned.Debug
 * Object Path: /org/gnome/Shell/Extensions/Zoned/Debug
 *
 * Usage from command line:
 *   gdbus call -e -d org.gnome.Shell \
 *     -o /org/gnome/Shell/Extensions/Zoned/Debug \
 *     -m org.gnome.Shell.Extensions.Zoned.Debug.GetState
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {createLogger} from './debug.js';
import {
    getAggregatedReport,
    resetAllTracking,
} from './resourceTracker.js';
import {ZoneEditor} from '../ui/zoneEditor.js';

const logger = createLogger('DebugInterface');

// D-Bus interface XML definition
const DBUS_INTERFACE_XML = `
<node>
  <interface name="org.gnome.Shell.Extensions.Zoned.Debug">
    <method name="GetState">
      <arg direction="out" type="a{sv}" name="state"/>
    </method>
    
    <method name="GetResourceReport">
      <arg direction="out" type="a{sv}" name="report"/>
    </method>

    <method name="GetMemoryReport">
      <arg direction="out" type="s" name="report"/>
    </method>

    <method name="GetComponentReports">
      <arg direction="out" type="s" name="reports"/>
    </method>
    
    <method name="TriggerAction">
      <arg direction="in" type="s" name="action"/>
      <arg direction="in" type="s" name="paramsJson"/>
      <arg direction="out" type="b" name="success"/>
      <arg direction="out" type="s" name="error"/>
    </method>
    
    <method name="ResetResourceTracking">
      <arg direction="out" type="b" name="success"/>
    </method>
    
    <method name="Ping">
      <arg direction="out" type="s" name="response"/>
    </method>
    
    <method name="GetGJSMemory">
      <arg direction="out" type="a{sv}" name="memory"/>
    </method>
    
    <signal name="ActionCompleted">
      <arg type="s" name="action"/>
      <arg type="b" name="success"/>
    </signal>
  </interface>
</node>
`;

// Track debug zone editor instance for cleanup
let _debugZoneEditor = null;

// Action handlers map for TriggerAction
const ACTION_HANDLERS = {
    'cycle-zone': handleCycleZone,
    'cycle-zone-state': handleCycleZoneState,
    'switch-layout': handleSwitchLayout,
    'show-layout-switcher': handleShowLayoutSwitcher,
    'hide-layout-switcher': handleHideLayoutSwitcher,
    'show-zone-overlay': handleShowZoneOverlay,
    'hide-zone-overlay': handleHideZoneOverlay,
    'show-zone-editor': handleShowZoneEditor,
    'hide-zone-editor': handleHideZoneEditor,
    'get-layout-ids': handleGetLayoutIds,
    'get-monitor-count': handleGetMonitorCount,
    'move-focused-to-zone': handleMoveFocusedToZone,
    'get-focused-window-geometry': handleGetFocusedWindowGeometry,
    'get-current-zone-geometry': handleGetCurrentZoneGeometry,
    'switch-workspace': handleSwitchWorkspace,
    'get-workspace-info': handleGetWorkspaceInfo,
    'move-window-to-workspace': handleMoveWindowToWorkspace,
    'set-per-workspace-mode': handleSetPerWorkspaceMode,
    'get-spatial-state': handleGetSpatialState,
};

function handleCycleZone(extension, params) {
    const direction = params.direction || 1;
    extension._layoutManager?.cycleZone(direction);
    const window = extension._windowManager?.getFocusedWindow();
    if (window) {
        const zone = extension._layoutManager?.getCurrentZone();
        if (zone) {
            extension._windowManager?.moveWindowToZone(window, zone);
        }
    }
    return [true, ''];
}

function handleCycleZoneState(extension, params) {
    // State-only zone cycling - does NOT move any windows
    // Used for stress testing zone state management without side effects
    const direction = params.direction || 1;
    extension._layoutManager?.cycleZone(direction);
    return [true, ''];
}

function handleSwitchLayout(extension, params) {
    const layoutId = params.layoutId;
    if (!layoutId) {
        return [false, 'Missing layoutId parameter'];
    }
    // Check if layout exists before switching
    const layouts = extension._layoutManager?.getAllLayouts() || [];
    const layoutExists = layouts.some(l => l.id === layoutId);
    if (!layoutExists) {
        return [false, `Layout not found: ${layoutId}`];
    }
    extension._layoutManager?.setLayout(layoutId);
    return [true, ''];
}

function handleShowLayoutSwitcher(extension) {
    extension._layoutSwitcher?.show();
    return [true, ''];
}

function handleHideLayoutSwitcher(extension) {
    extension._layoutSwitcher?.hide();
    return [true, ''];
}

function handleShowZoneOverlay(extension) {
    const layout = extension._layoutManager?.getCurrentLayout();
    const zoneIndex = extension._layoutManager?.getCurrentZoneIndex() ?? 0;
    const totalZones = layout?.zones?.length ?? 0;
    const layoutName = layout?.name ?? 'Unknown';
    extension._zoneOverlay?.show(layoutName, zoneIndex, totalZones);
    return [true, ''];
}

function handleHideZoneOverlay(extension) {
    extension._zoneOverlay?._hide();
    return [true, ''];
}

function handleShowZoneEditor(extension) {
    // Clean up any existing debug editor
    if (_debugZoneEditor) {
        try {
            _debugZoneEditor.destroy();
        } catch {
            // May already be destroyed
        }
        _debugZoneEditor = null;
    }

    const layout = extension._layoutManager?.getCurrentLayout();
    if (!layout) {
        return [false, 'No current layout'];
    }

    // Create a zone editor instance for the current layout
    // Use no-op callbacks since this is just for memory testing
    _debugZoneEditor = new ZoneEditor(
        layout,
        extension._layoutManager,
        extension._settings,
        () => {
            // onSave - no-op for debug
            _debugZoneEditor = null;
        },
        () => {
            // onCancel - no-op for debug
            _debugZoneEditor = null;
        },
    );
    _debugZoneEditor.show();
    return [true, ''];
}

function handleHideZoneEditor(_extension) {
    if (_debugZoneEditor) {
        try {
            _debugZoneEditor.destroy();
        } catch {
            // May already be destroyed
        }
        _debugZoneEditor = null;
    }
    return [true, ''];
}

function handleGetLayoutIds(extension) {
    const layouts = extension._layoutManager?.getAllLayouts() || [];
    return [true, JSON.stringify(layouts.map(l => l.id))];
}

function handleGetMonitorCount(_extension) {
    const monitorCount = Main.layoutManager.monitors?.length ?? 1;
    return [true, JSON.stringify({count: monitorCount})];
}

function handleMoveFocusedToZone(extension) {
    const window = extension._windowManager?.getFocusedWindow();
    if (!window) {
        return [false, 'No focused window'];
    }
    const zone = extension._layoutManager?.getCurrentZone();
    if (!zone) {
        return [false, 'No current zone'];
    }
    extension._windowManager?.moveWindowToZone(window, zone);
    return [true, ''];
}

function handleGetFocusedWindowGeometry(extension) {
    const window = extension._windowManager?.getFocusedWindow();
    if (!window) {
        return [false, 'No focused window'];
    }
    const rect = window.get_frame_rect();
    return [true, JSON.stringify({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
    })];
}

function handleGetCurrentZoneGeometry(extension) {
    const zone = extension._layoutManager?.getCurrentZone();
    if (!zone) {
        return [false, 'No current zone'];
    }
    // Zones use w/h for width/height and are in percentage (0-1) format
    // Convert to pixels using primary monitor workarea
    const monitor = global.display.get_primary_monitor();
    const workarea = Main.layoutManager.getWorkAreaForMonitor(monitor);

    return [true, JSON.stringify({
        x: Math.round(workarea.x + zone.x * workarea.width),
        y: Math.round(workarea.y + zone.y * workarea.height),
        width: Math.round(zone.w * workarea.width),
        height: Math.round(zone.h * workarea.height),
    })];
}

function handleSwitchWorkspace(_extension, params) {
    const index = params.index;
    if (typeof index !== 'number') {
        return [false, 'Missing or invalid index parameter'];
    }
    const ws = global.workspace_manager.get_workspace_by_index(index);
    if (!ws) {
        return [false, `Workspace ${index} does not exist`];
    }
    ws.activate(global.get_current_time());
    return [true, ''];
}

function handleGetWorkspaceInfo(_extension) {
    const workspaceManager = global.workspace_manager;
    const currentIndex = workspaceManager.get_active_workspace_index();
    const count = workspaceManager.get_n_workspaces();
    return [true, JSON.stringify({
        current: currentIndex,
        count: count,
    })];
}

function handleMoveWindowToWorkspace(extension, params) {
    const targetIndex = params.index;
    if (typeof targetIndex !== 'number') {
        return [false, 'Missing or invalid index parameter'];
    }
    const window = extension._windowManager?.getFocusedWindow();
    if (!window) {
        return [false, 'No focused window'];
    }
    window.change_workspace_by_index(targetIndex, false);
    return [true, ''];
}

function handleSetPerWorkspaceMode(extension, params) {
    const enabled = params.enabled;
    if (typeof enabled !== 'boolean') {
        return [false, 'Missing or invalid enabled parameter'];
    }
    const settings = extension._settings;
    if (!settings) {
        return [false, 'Settings not available'];
    }
    settings.set_boolean('use-per-workspace-layouts', enabled);
    // Sync settings to ensure the change is persisted
    Gio.Settings.sync();
    return [true, ''];
}

function handleGetSpatialState(extension) {
    const spatialManager = extension._spatialStateManager;
    if (!spatialManager) {
        return [false, 'SpatialStateManager not available'];
    }
    // Build state object from all space keys
    const spaceKeys = spatialManager.getAllSpaceKeys();
    const state = {};
    for (const key of spaceKeys) {
        state[key] = spatialManager.getState(key);
    }
    // Also include current space info
    const currentKey = spatialManager.getCurrentSpaceKey();
    const currentState = spatialManager.getState(currentKey);
    return [true, JSON.stringify({
        current: {
            key: currentKey,
            ...currentState,
        },
        spaces: state,
    })];
}

/**
 * Debug Interface - D-Bus service for automated testing
 */
export class DebugInterface {
    /**
     * @param {Object} extension - Reference to main extension instance
     */
    constructor(extension) {
        this._extension = extension;
        this._dbusExportId = null;
        this._enabled = false;
        this._settingsChangedId = null;

        // Bind methods to avoid closure leaks
        this._boundOnDebugExposeChanged = this._onDebugExposeChanged.bind(this);
    }

    /**
     * Handler for debug-expose-dbus setting changes
     * @private
     */
    _onDebugExposeChanged() {
        const settings = this._extension._settings;
        if (!settings) return;

        const newValue = settings.get_boolean('debug-expose-dbus');
        if (newValue && !this._enabled) {
            this._enable();
        } else if (!newValue && this._enabled) {
            this._disable();
        }
        this._enabled = newValue;
    }

    /**
     * Initialize the debug interface based on settings
     */
    init() {
        const settings = this._extension._settings;
        if (!settings) {
            logger.error('Cannot init debug interface: settings not available');
            return;
        }

        // Check if D-Bus interface should be exposed
        this._enabled = settings.get_boolean('debug-expose-dbus');

        // Watch for setting changes - use bound method to avoid closure leak
        this._settingsChangedId = settings.connect('changed::debug-expose-dbus', this._boundOnDebugExposeChanged);

        if (this._enabled) {
            this._enable();
        }
    }

    /**
     * Enable the D-Bus interface
     * @private
     */
    _enable() {
        try {
            const dbusImpl = Gio.DBusExportedObject.wrapJSObject(
                DBUS_INTERFACE_XML,
                this,
            );

            dbusImpl.export(
                Gio.DBus.session,
                '/org/gnome/Shell/Extensions/Zoned/Debug',
            );

            this._dbusExportId = dbusImpl;
            logger.info('D-Bus debug interface enabled');
        } catch (e) {
            logger.error('Failed to enable D-Bus interface:', e.message);
        }
    }

    /**
     * Disable the D-Bus interface
     * @private
     */
    _disable() {
        if (this._dbusExportId) {
            try {
                this._dbusExportId.unexport();
            } catch {
                // May already be unexported
            }
            this._dbusExportId = null;
            logger.info('D-Bus debug interface disabled');
        }
    }

    /**
     * D-Bus Method: GetState
     * Returns current extension state as a variant dictionary
     */
    GetState() {
        logger.debug('D-Bus GetState called');

        try {
            return this._buildStateResponse();
        } catch (e) {
            logger.error('GetState error:', e.message);
            return {error: GLib.Variant.new_string(e.message)};
        }
    }

    /**
     * Build state response object
     * @private
     */
    _buildStateResponse() {
        const layoutState = this._getLayoutState();
        const settingsState = this._getSettingsState();

        return {
            enabled: GLib.Variant.new_boolean(true),
            extensionVersion: GLib.Variant.new_string('1.0'),
            ...layoutState,
            ...settingsState,
        };
    }

    /**
     * Get layout-related state
     * @private
     */
    _getLayoutState() {
        const data = this._extractLayoutData();

        return {
            layoutId: GLib.Variant.new_string(data.layoutId),
            layoutName: GLib.Variant.new_string(data.layoutName),
            zoneIndex: GLib.Variant.new_int32(data.zoneIndex),
            zoneCount: GLib.Variant.new_int32(data.zoneCount),
            layoutCount: GLib.Variant.new_int32(data.layoutCount),
            layouts: GLib.Variant.new_strv(data.layoutIds),
        };
    }

    /**
     * Extract raw layout data
     * @private
     */
    // eslint-disable-next-line complexity
    _extractLayoutData() {
        const layoutManager = this._extension._layoutManager;
        if (!layoutManager) {
            return {layoutId: '', layoutName: '', zoneIndex: 0, zoneCount: 0, layoutCount: 0, layoutIds: []};
        }

        const currentLayout = layoutManager.getCurrentLayout();
        const allLayouts = layoutManager.getAllLayouts() ?? [];

        return {
            layoutId: currentLayout?.id ?? '',
            layoutName: currentLayout?.name ?? '',
            zoneIndex: layoutManager.getCurrentZoneIndex() ?? 0,
            zoneCount: currentLayout?.zones?.length ?? 0,
            layoutCount: allLayouts.length,
            layoutIds: allLayouts.map(l => l.id),
        };
    }

    /**
     * Get settings-related state
     * @private
     */
    _getSettingsState() {
        const settings = this._extension._settings;

        return {
            workspaceMode: GLib.Variant.new_boolean(this._getBoolSetting(settings, 'use-per-workspace-layouts')),
            debugLogging: GLib.Variant.new_boolean(this._getBoolSetting(settings, 'debug-logging')),
            resourceTracking: GLib.Variant.new_boolean(this._getBoolSetting(settings, 'debug-track-resources')),
        };
    }

    /**
     * Safely get boolean setting
     * @private
     */
    _getBoolSetting(settings, key) {
        return settings?.get_boolean(key) || false;
    }

    /**
     * D-Bus Method: GetResourceReport
     * Returns aggregated resource tracking report
     */
    GetResourceReport() {
        try {
            const report = getAggregatedReport();

            return {
                totalSignals: GLib.Variant.new_int32(report.totalSignals),
                activeSignals: GLib.Variant.new_int32(report.activeSignals),
                leakedSignals: GLib.Variant.new_int32(report.leakedSignals),
                totalTimers: GLib.Variant.new_int32(report.totalTimers),
                activeTimers: GLib.Variant.new_int32(report.activeTimers),
                leakedTimers: GLib.Variant.new_int32(report.leakedTimers),
                totalActors: GLib.Variant.new_int32(report.totalActors),
                activeActors: GLib.Variant.new_int32(report.activeActors),
                componentsWithLeaks: GLib.Variant.new_strv(report.componentsWithLeaks),
                warnings: GLib.Variant.new_strv(report.warnings),
            };
        } catch (e) {
            logger.error('GetResourceReport error:', e.message);
            return {
                error: GLib.Variant.new_string(e.message),
            };
        }
    }

    /**
     * D-Bus Method: GetMemoryReport
     * Returns instance count report from global memory debug registry
     */
    GetMemoryReport() {
        logger.debug('D-Bus GetMemoryReport called');

        try {
            if (global.zonedDebug) {
                return global.zonedDebug.getReport();
            } else {
                return 'Memory debug registry not initialized';
            }
        } catch (e) {
            logger.error('GetMemoryReport error:', e.message);
            return `Error: ${e.message}`;
        }
    }

    /**
     * D-Bus Method: GetComponentReports
     * Returns detailed per-component reports as JSON string
     */
    GetComponentReports() {
        logger.debug('D-Bus GetComponentReports called');

        try {
            const report = getAggregatedReport();
            return JSON.stringify(report.componentReports, null, 2);
        } catch (e) {
            logger.error('GetComponentReports error:', e.message);
            return JSON.stringify({error: e.message});
        }
    }

    /**
     * D-Bus Method: TriggerAction
     * Trigger an extension action programmatically
     * @param {string} action - Action name
     * @param {string} paramsJson - JSON string of parameters
     * @returns {[boolean, string]} [success, error]
     */
    TriggerAction(action, paramsJson) {
        logger.debug(`D-Bus TriggerAction: ${action} with params: ${paramsJson}`);

        try {
            const params = paramsJson ? JSON.parse(paramsJson) : {};
            const handler = ACTION_HANDLERS[action];

            if (!handler) {
                return [false, `Unknown action: ${action}`];
            }

            return handler(this._extension, params);
        } catch (e) {
            logger.error(`TriggerAction error: ${e.message}`);
            return [false, e.message];
        }
    }

    /**
     * D-Bus Method: ResetResourceTracking
     * Reset all resource tracking counters
     */
    ResetResourceTracking() {
        logger.debug('D-Bus ResetResourceTracking called');

        try {
            resetAllTracking();
            return true;
        } catch (e) {
            logger.error('ResetResourceTracking error:', e.message);
            return false;
        }
    }

    /**
     * D-Bus Method: Ping
     * Simple health check
     */
    Ping() {
        return 'pong';
    }

    /**
     * D-Bus Method: GetGJSMemory
     * Returns GJS memory statistics for leak detection
     * @returns {Object} Memory stats as variant dictionary
     */
    GetGJSMemory() {
        try {
            // Try to read /proc/self/statm for detailed process memory
            // This gives us: size resident shared text lib data dt (in pages)
            let procMemory = null;
            try {
                const [ok, contents] = GLib.file_get_contents('/proc/self/statm');
                if (ok) {
                    const decoder = new TextDecoder();
                    const parts = decoder.decode(contents).trim().split(/\s+/);
                    // Page size is almost always 4096 bytes on modern systems
                    const pageSize = 4096;
                    procMemory = {
                        // Virtual memory size
                        vmSizeKb: Math.round((parseInt(parts[0], 10) * pageSize) / 1024),
                        // Resident set size (physical memory)
                        rssKb: Math.round((parseInt(parts[1], 10) * pageSize) / 1024),
                        // Shared memory
                        sharedKb: Math.round((parseInt(parts[2], 10) * pageSize) / 1024),
                        // Data + stack
                        dataKb: Math.round((parseInt(parts[5], 10) * pageSize) / 1024),
                    };
                }
            } catch {
                // /proc not available (non-Linux)
            }

            // Build response with available metrics
            const response = {
                // Timestamp for correlation
                timestamp: GLib.Variant.new_int64(GLib.get_real_time()),
            };

            if (procMemory) {
                response.vmSizeKb = GLib.Variant.new_int32(procMemory.vmSizeKb);
                response.rssKb = GLib.Variant.new_int32(procMemory.rssKb);
                response.sharedKb = GLib.Variant.new_int32(procMemory.sharedKb);
                response.dataKb = GLib.Variant.new_int32(procMemory.dataKb);
            }

            // GLib memory stats (allocations through GLib)
            // GLib.mem_profile() exists but just prints to stderr
            // We can check if malloc trimming helps
            response.pageSize = GLib.Variant.new_int32(4096);

            return response;
        } catch (e) {
            logger.error('GetGJSMemory error:', e.message);
            return {
                error: GLib.Variant.new_string(e.message),
            };
        }
    }

    /**
     * Emit ActionCompleted signal
     * @param {string} action - Action that completed
     * @param {boolean} success - Whether action succeeded
     */
    emitActionCompleted(action, success) {
        if (this._dbusExportId) {
            this._dbusExportId.emit_signal(
                'ActionCompleted',
                new GLib.Variant('(sb)', [action, success]),
            );
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        // Disconnect settings handler
        if (this._settingsChangedId && this._extension?._settings) {
            try {
                this._extension._settings.disconnect(this._settingsChangedId);
            } catch {
                // Settings may already be gone
            }
            this._settingsChangedId = null;
        }

        // Disable D-Bus interface
        this._disable();

        this._extension = null;
        logger.debug('DebugInterface destroyed');
    }
}

/**
 * Create a debug interface instance
 * @param {Object} extension - Reference to main extension
 * @returns {DebugInterface}
 */
export function createDebugInterface(extension) {
    return new DebugInterface(extension);
}
