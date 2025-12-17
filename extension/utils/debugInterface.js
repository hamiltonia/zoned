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
    
    <signal name="ActionCompleted">
      <arg type="s" name="action"/>
      <arg type="b" name="success"/>
    </signal>
  </interface>
</node>
`;

// Action handlers map for TriggerAction
const ACTION_HANDLERS = {
    'cycle-zone': handleCycleZone,
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

function handleSwitchLayout(extension, params) {
    const layoutId = params.layoutId;
    if (!layoutId) {
        return [false, 'Missing layoutId parameter'];
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

        // Watch for setting changes
        this._settingsChangedId = settings.connect('changed::debug-expose-dbus', () => {
            const newValue = settings.get_boolean('debug-expose-dbus');
            if (newValue && !this._enabled) {
                this._enable();
            } else if (!newValue && this._enabled) {
                this._disable();
            }
            this._enabled = newValue;
        });

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
        logger.debug('D-Bus GetResourceReport called');

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
        logger.debug('D-Bus Ping called');
        return 'pong';
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
