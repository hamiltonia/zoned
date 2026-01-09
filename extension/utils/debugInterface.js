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
import {getExtensionVersion} from './versionUtil.js';
import {LayoutSettingsDiagnostic} from '../ui/layoutSettingsDiagnostic.js';

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
    
    <method name="GetActorCount">
      <arg direction="out" type="i" name="count"/>
    </method>
    
    <signal name="ActionCompleted">
      <arg type="s" name="action"/>
      <arg type="b" name="success"/>
    </signal>
    
    <signal name="InitCompleted">
      <arg type="b" name="success"/>
      <arg type="s" name="version"/>
    </signal>
  </interface>
</node>
`;

// Action handler functions
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

function handleSetGlobalMode(extension, params) {
    // Set global/per-workspace mode explicitly
    // params.global: true = apply to all spaces, false = per-workspace mode
    const globalMode = params.global;
    if (typeof globalMode !== 'boolean') {
        return [false, 'Missing or invalid global parameter (expected boolean)'];
    }

    const settings = extension._settings;
    if (!settings) {
        return [false, 'Settings not available'];
    }

    // use-per-workspace-layouts is INVERTED from global mode
    // global=true means per-workspace=false
    const perWorkspaceMode = !globalMode;
    settings.set_boolean('use-per-workspace-layouts', perWorkspaceMode);
    Gio.Settings.sync();

    return [true, ''];
}

function handleOpenLayoutSettings(extension, params) {
    // Delegate to LayoutSwitcher to open layout settings dialog
    // This simulates the actual user workflow through the UI
    logger.info('[D-Bus] handleOpenLayoutSettings called');

    const layoutSwitcher = extension._layoutSwitcher;
    if (!layoutSwitcher) {
        logger.error('[D-Bus] LayoutSwitcher not available');
        return [false, 'LayoutSwitcher not available'];
    }

    // Check if a dialog is already open
    const dialogExists = extension._testLayoutSettingsDialog != null;
    logger.info(`[D-Bus] Dialog exists check: ${dialogExists}`);
    if (dialogExists) {
        logger.warn('[D-Bus] Layout settings dialog already open - rejecting open request');
        return [false, 'Layout settings dialog already open'];
    }

    const layoutManager = extension._layoutManager;
    if (!layoutManager) {
        logger.error('[D-Bus] LayoutManager not available');
        return [false, 'LayoutManager not available'];
    }

    let layout = null;
    if (params.layoutId) {
        const allLayouts = layoutManager.getAllLayouts() || [];
        layout = allLayouts.find(l => l.id === params.layoutId);
        if (!layout) {
            logger.error(`[D-Bus] Layout not found: ${params.layoutId}`);
            return [false, `Layout not found: ${params.layoutId}`];
        }
        logger.info(`[D-Bus] Using layout: ${layout.name} (${layout.id})`);
    } else {
        // Use first template as default
        const allLayouts = layoutManager.getAllLayouts() || [];
        const templates = allLayouts.filter(l => !l.id?.startsWith('layout-'));
        if (templates.length === 0) {
            logger.error('[D-Bus] No templates available');
            return [false, 'No templates available'];
        }
        layout = templates[0];
        logger.info(`[D-Bus] Using first template: ${layout.name} (${layout.id})`);
    }

    // Delegate to LayoutSwitcher
    logger.info('[D-Bus] Delegating to layoutSwitcher.openLayoutSettings()');
    layoutSwitcher.openLayoutSettings(layout);
    logger.info('[D-Bus] openLayoutSettings() call completed');

    return [true, ''];
}

function handleCloseLayoutSettings(extension) {
    // Close the currently open layout settings dialog via LayoutSwitcher
    logger.info('[D-Bus] handleCloseLayoutSettings called');

    const layoutSwitcher = extension._layoutSwitcher;
    if (!layoutSwitcher) {
        logger.error('[D-Bus] LayoutSwitcher not available');
        return [false, 'LayoutSwitcher not available'];
    }

    // Delegate to LayoutSwitcher which manages dialog lifecycle
    logger.info('[D-Bus] Calling layoutSwitcher.closeLayoutSettings()');
    layoutSwitcher.closeLayoutSettings();
    logger.info('[D-Bus] closeLayoutSettings() call completed');

    return [true, ''];
}

function handleOpenDiagnosticDialog(extension) {
    // Open the memory leak diagnostic dialog
    logger.info('[D-Bus] handleOpenDiagnosticDialog called');

    // Check if dialog already exists
    if (extension._diagnosticDialog) {
        logger.warn('[D-Bus] Diagnostic dialog already open');
        return [false, 'Diagnostic dialog already open'];
    }

    const settings = extension._settings;
    if (!settings) {
        logger.error('[D-Bus] Settings not available');
        return [false, 'Settings not available'];
    }

    // Create and open dialog
    extension._diagnosticDialog = new LayoutSettingsDiagnostic(settings);
    extension._diagnosticDialog.open();

    logger.info('[D-Bus] Diagnostic dialog opened');
    return [true, ''];
}

function handleCloseDiagnosticDialog(extension) {
    // Close the diagnostic dialog
    logger.info('[D-Bus] handleCloseDiagnosticDialog called');

    if (!extension._diagnosticDialog) {
        logger.warn('[D-Bus] No diagnostic dialog to close');
        return [false, 'No diagnostic dialog open'];
    }

    extension._diagnosticDialog.close();
    extension._diagnosticDialog = null;

    logger.info('[D-Bus] Diagnostic dialog closed');
    return [true, ''];
}

// Action handlers map
const ACTION_HANDLERS = {
    'cycle-zone': handleCycleZone,
    'cycle-zone-state': handleCycleZoneState,
    'switch-layout': handleSwitchLayout,
    'show-layout-switcher': handleShowLayoutSwitcher,
    'hide-layout-switcher': handleHideLayoutSwitcher,
    'show-zone-overlay': handleShowZoneOverlay,
    'hide-zone-overlay': handleHideZoneOverlay,
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
    'set-global-mode': handleSetGlobalMode,
    'open-layout-settings': handleOpenLayoutSettings,
    'close-layout-settings': handleCloseLayoutSettings,
    'open-diagnostic-dialog': handleOpenDiagnosticDialog,
    'close-diagnostic-dialog': handleCloseDiagnosticDialog,
};

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
        return this._buildStateResponse();
    }

    /**
     * Build state response object
     * @private
     */
    _buildStateResponse() {
        const layoutState = this._getLayoutState();
        const settingsState = this._getSettingsState();

        // Get version info dynamically
        const versionInfo = getExtensionVersion(this._extension.path, this._extension.metadata);

        return {
            enabled: GLib.Variant.new_boolean(true),
            extensionVersion: GLib.Variant.new_string(versionInfo.name),
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
    }

    /**
     * D-Bus Method: GetMemoryReport
     * Returns instance count report from global memory debug registry
     */
    GetMemoryReport() {
        if (global.zonedDebug) {
            return global.zonedDebug.getReport();
        }
        return 'Memory debug registry not initialized';
    }

    /**
     * D-Bus Method: GetComponentReports
     * Returns detailed per-component reports as JSON string
     */
    GetComponentReports() {
        const report = getAggregatedReport();
        return JSON.stringify(report.componentReports, null, 2);
    }

    /**
     * D-Bus Method: TriggerAction
     * Trigger an extension action programmatically
     * @param {string} action - Action name
     * @param {string} paramsJson - JSON string of parameters
     * @returns {[boolean, string]} [success, error]
     */
    TriggerAction(action, paramsJson) {
        try {
            const handler = ACTION_HANDLERS[action];
            if (!handler) {
                return [false, `Unknown action: ${action}`];
            }

            // Parse parameters
            let params = {};
            if (paramsJson && paramsJson !== '{}') {
                try {
                    params = JSON.parse(paramsJson);
                } catch (e) {
                    return [false, `Invalid JSON parameters: ${e.message}`];
                }
            }

            // Execute handler
            const [success, error] = handler(this._extension, params);

            // Emit signal
            this.emitActionCompleted(action, success);

            return [success, error || ''];
        } catch (e) {
            logger.error(`TriggerAction error for '${action}':`, e.message);
            return [false, e.message];
        }
    }

    /**
     * D-Bus Method: ResetResourceTracking
     * Reset all resource tracking counters
     */
    ResetResourceTracking() {
        try {
            resetAllTracking();
            return true;
        } catch (e) {
            logger.error('Failed to reset resource tracking:', e.message);
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
            return {
                timestamp: GLib.Variant.new_int64(GLib.get_real_time()),
                pageSize: GLib.Variant.new_int32(4096),
            };
        } catch (e) {
            logger.error('GetGJSMemory error:', e.message);
            return {
                timestamp: GLib.Variant.new_int64(GLib.get_real_time()),
                error: GLib.Variant.new_string(e.message),
            };
        }
    }

    /**
     * D-Bus Method: GetActorCount
     * Returns the number of actors in Main.uiGroup
     * Used for leak detection by comparing counts before/after operations
     * @returns {number} Number of child actors
     */
    GetActorCount() {
        try {
            return Main.uiGroup.get_n_children();
        } catch (e) {
            logger.error('GetActorCount error:', e.message);
            return -1;
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
     * Emit InitCompleted signal
     * Called at the end of extension enable() to signal successful initialization
     * @param {boolean} success - Whether initialization completed successfully
     */
    emitInitCompleted(success) {
        if (this._dbusExportId) {
            // Get version info dynamically
            const versionInfo = getExtensionVersion(this._extension.path, this._extension.metadata);

            this._dbusExportId.emit_signal(
                'InitCompleted',
                new GLib.Variant('(bs)', [success, versionInfo.name]),
            );
            logger.debug(`InitCompleted signal emitted: ${success}`);
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
