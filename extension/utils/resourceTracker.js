/**
 * ResourceTracker - Centralized resource tracking for leak detection
 *
 * Tracks signal connections, timers, and actors to detect potential memory leaks.
 * Provides warnings when destroy() is called with unreleased resources.
 *
 * Usage:
 *   const tracker = new ResourceTracker('MyComponent');
 *   tracker.connectSignal(settings, 'changed::foo', callback);
 *   tracker.addTimeout(GLib.PRIORITY_DEFAULT, 1000, callback);
 *   // ... on destroy:
 *   tracker.destroy(); // Cleans up all, warns on leaks
 *
 * Enable tracking via:
 *   gsettings set org.gnome.shell.extensions.zoned debug-track-resources true
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

// Global tracking state
let _trackingEnabled = false;
let _settings = null;
let _settingsChangedId = null;
let _allTrackers = new Set();

/**
 * Initialize resource tracking from GSettings
 * Called once when extension loads
 * @param {Gio.Settings} settings - Extension settings
 */
export function initResourceTracking(settings) {
    _settings = settings;

    // Read initial value
    _trackingEnabled = _settings.get_boolean('debug-track-resources');

    // Watch for changes
    if (_settingsChangedId) {
        _settings.disconnect(_settingsChangedId);
    }
    _settingsChangedId = _settings.connect('changed::debug-track-resources', () => {
        _trackingEnabled = _settings.get_boolean('debug-track-resources');
        console.log(`[Zoned:ResourceTracker] Resource tracking ${_trackingEnabled ? 'enabled' : 'disabled'}`);
    });

    if (_trackingEnabled) {
        console.log('[Zoned:ResourceTracker] Resource tracking enabled');
    }
}

/**
 * Clean up global tracking state
 */
export function destroyResourceTracking() {
    if (_settings && _settingsChangedId) {
        _settings.disconnect(_settingsChangedId);
        _settingsChangedId = null;
    }
    _settings = null;
    _trackingEnabled = false;
    _allTrackers.clear();
}

/**
 * Check if resource tracking is enabled
 * @returns {boolean}
 */
export function isTrackingEnabled() {
    return _trackingEnabled;
}

/**
 * Get aggregated report from all trackers
 * @returns {AggregatedReport}
 */
export function getAggregatedReport() {
    const report = {
        totalSignals: 0,
        activeSignals: 0,
        leakedSignals: 0,
        totalTimers: 0,
        activeTimers: 0,
        leakedTimers: 0,
        totalActors: 0,
        activeActors: 0,
        componentsWithLeaks: [],
        componentReports: [],
        warnings: [],
    };

    for (const tracker of _allTrackers) {
        const componentReport = tracker.getReport();
        report.componentReports.push(componentReport);

        report.totalSignals += componentReport.signals.total;
        report.activeSignals += componentReport.signals.active;
        report.totalTimers += componentReport.timers.total;
        report.activeTimers += componentReport.timers.active;
        report.totalActors += componentReport.actors.total;
        report.activeActors += componentReport.actors.active;

        if (componentReport.signals.leaked.length > 0 ||
            componentReport.timers.leaked.length > 0) {
            report.leakedSignals += componentReport.signals.leaked.length;
            report.leakedTimers += componentReport.timers.leaked.length;
            report.componentsWithLeaks.push(componentReport.componentName);
        }

        report.warnings.push(...componentReport.warnings);
    }

    return report;
}

/**
 * Reset tracking counters across all trackers
 */
export function resetAllTracking() {
    for (const tracker of _allTrackers) {
        tracker.resetCounters();
    }
}

/**
 * ResourceTracker - Per-component resource tracker
 */
export class ResourceTracker {
    /**
     * @param {string} componentName - Name of the component for logging
     */
    constructor(componentName) {
        this._componentName = componentName;
        this._prefix = `[Zoned:ResourceTracker:${componentName}]`;

        // Signal tracking: Map<object+signalId, SignalInfo>
        this._signals = new Map();
        this._signalCounter = 0;

        // Timer tracking: Map<sourceId, TimerInfo>
        this._timers = new Map();
        this._timerCounter = 0;

        // Actor tracking: Set<actor> (weak references where possible)
        this._actors = new Set();
        this._actorCounter = 0;

        // Stats
        this._totalSignals = 0;
        this._totalTimers = 0;
        this._totalActors = 0;

        // Register with global tracker list
        _allTrackers.add(this);
    }

    /**
     * Connect a signal with tracking
     * @param {GObject.Object} object - Object to connect to
     * @param {string} signalName - Signal name
     * @param {Function} callback - Callback function
     * @returns {number} Signal ID
     */
    connectSignal(object, signalName, callback) {
        const signalId = object.connect(signalName, callback);

        if (_trackingEnabled) {
            const key = `${this._signalCounter++}`;
            const info = {
                object: new WeakRef(object),
                objectType: object.constructor?.name || 'Unknown',
                signalName,
                signalId,
                key,
                connectedAt: new Date().toISOString(),
                stack: new Error().stack,
            };
            this._signals.set(key, info);
            this._totalSignals++;
        }

        return signalId;
    }

    /**
     * Disconnect a specific signal
     * @param {GObject.Object} object - Object to disconnect from
     * @param {number} signalId - Signal ID to disconnect
     */
    disconnectSignal(object, signalId) {
        try {
            object.disconnect(signalId);
        } catch {
            // Object may already be destroyed
        }

        if (_trackingEnabled) {
            // Find and remove the signal info
            for (const [key, info] of this._signals) {
                if (info.signalId === signalId) {
                    this._signals.delete(key);
                    break;
                }
            }
        }
    }

    /**
     * Disconnect all tracked signals
     */
    disconnectAllSignals() {
        for (const [key, info] of this._signals) {
            const objectRef = info.object.deref();
            if (objectRef) {
                try {
                    objectRef.disconnect(info.signalId);
                } catch {
                    // Object may already be destroyed
                }
            }
        }
        this._signals.clear();
    }

    /**
     * Add a timeout with tracking
     * @param {number} priority - GLib priority
     * @param {number} intervalMs - Interval in milliseconds
     * @param {Function} callback - Callback function
     * @returns {number} Source ID
     */
    addTimeout(priority, intervalMs, callback) {
        // Wrap callback to auto-remove on completion if it returns false
        const wrappedCallback = () => {
            const result = callback();
            if (result === false || result === GLib.SOURCE_REMOVE) {
                if (_trackingEnabled) {
                    this._timers.delete(sourceId);
                }
            }
            return result;
        };

        const sourceId = GLib.timeout_add(priority, intervalMs, wrappedCallback);

        if (_trackingEnabled) {
            const info = {
                sourceId,
                intervalMs,
                priority,
                addedAt: new Date().toISOString(),
                stack: new Error().stack,
                type: 'timeout',
            };
            this._timers.set(sourceId, info);
            this._totalTimers++;
        }

        return sourceId;
    }

    /**
     * Add a timeout in seconds with tracking
     * @param {number} priority - GLib priority
     * @param {number} seconds - Interval in seconds
     * @param {Function} callback - Callback function
     * @returns {number} Source ID
     */
    addTimeoutSeconds(priority, seconds, callback) {
        const wrappedCallback = () => {
            const result = callback();
            if (result === false || result === GLib.SOURCE_REMOVE) {
                if (_trackingEnabled) {
                    this._timers.delete(sourceId);
                }
            }
            return result;
        };

        const sourceId = GLib.timeout_add_seconds(priority, seconds, wrappedCallback);

        if (_trackingEnabled) {
            const info = {
                sourceId,
                intervalMs: seconds * 1000,
                priority,
                addedAt: new Date().toISOString(),
                stack: new Error().stack,
                type: 'timeout_seconds',
            };
            this._timers.set(sourceId, info);
            this._totalTimers++;
        }

        return sourceId;
    }

    /**
     * Add an idle callback with tracking
     * @param {number} priority - GLib priority
     * @param {Function} callback - Callback function
     * @returns {number} Source ID
     */
    addIdle(priority, callback) {
        const wrappedCallback = () => {
            const result = callback();
            if (result === false || result === GLib.SOURCE_REMOVE) {
                if (_trackingEnabled) {
                    this._timers.delete(sourceId);
                }
            }
            return result;
        };

        const sourceId = GLib.idle_add(priority, wrappedCallback);

        if (_trackingEnabled) {
            const info = {
                sourceId,
                intervalMs: 0,
                priority,
                addedAt: new Date().toISOString(),
                stack: new Error().stack,
                type: 'idle',
            };
            this._timers.set(sourceId, info);
            this._totalTimers++;
        }

        return sourceId;
    }

    /**
     * Remove a timeout/idle source
     * @param {number} sourceId - Source ID to remove
     * @returns {boolean} True if removed
     */
    removeTimeout(sourceId) {
        if (sourceId) {
            GLib.source_remove(sourceId);
            if (_trackingEnabled) {
                this._timers.delete(sourceId);
            }
            return true;
        }
        return false;
    }

    /**
     * Remove all tracked timers
     */
    removeAllTimeouts() {
        for (const [sourceId] of this._timers) {
            try {
                GLib.source_remove(sourceId);
            } catch {
                // Source may already be removed
            }
        }
        this._timers.clear();
    }

    /**
     * Track an actor for leak detection
     * @param {Clutter.Actor} actor - Actor to track
     */
    trackActor(actor) {
        if (_trackingEnabled) {
            this._actors.add(actor);
            this._totalActors++;
        }
    }

    /**
     * Untrack an actor
     * @param {Clutter.Actor} actor - Actor to untrack
     */
    untrackActor(actor) {
        if (_trackingEnabled) {
            this._actors.delete(actor);
        }
    }

    /**
     * Get report for this tracker
     * @returns {ResourceReport}
     */
    getReport() {
        const leakedSignals = [];
        const leakedTimers = [];
        const warnings = [];

        // Check for leaked signals
        for (const [key, info] of this._signals) {
            const objectRef = info.object.deref();
            if (objectRef) {
                leakedSignals.push({
                    signalName: info.signalName,
                    objectType: info.objectType,
                    connectedAt: info.connectedAt,
                });
            }
        }

        // Check for leaked timers
        for (const [sourceId, info] of this._timers) {
            leakedTimers.push({
                sourceId,
                type: info.type,
                addedAt: info.addedAt,
            });
        }

        // Generate warnings
        if (leakedSignals.length > 0) {
            warnings.push(`${this._componentName}: ${leakedSignals.length} signal(s) not disconnected`);
        }
        if (leakedTimers.length > 0) {
            warnings.push(`${this._componentName}: ${leakedTimers.length} timer(s) not removed`);
        }
        if (this._actors.size > 0) {
            warnings.push(`${this._componentName}: ${this._actors.size} actor(s) still tracked`);
        }

        return {
            componentName: this._componentName,
            signals: {
                active: this._signals.size,
                total: this._totalSignals,
                leaked: leakedSignals,
            },
            timers: {
                active: this._timers.size,
                total: this._totalTimers,
                leaked: leakedTimers,
            },
            actors: {
                active: this._actors.size,
                total: this._totalActors,
            },
            warnings,
        };
    }

    /**
     * Check if this tracker has any leaks
     * @returns {boolean}
     */
    hasLeaks() {
        return this._signals.size > 0 || this._timers.size > 0;
    }

    /**
     * Reset counters (for testing)
     */
    resetCounters() {
        this._totalSignals = this._signals.size;
        this._totalTimers = this._timers.size;
        this._totalActors = this._actors.size;
    }

    /**
     * Log current state (for debugging)
     */
    logState() {
        if (!_trackingEnabled)
            return;

        const report = this.getReport();
        console.log(`${this._prefix} State:`, JSON.stringify(report, null, 2));
    }

    /**
     * Destroy tracker - clean up all resources and warn about leaks
     */
    destroy() {
        // Log warnings about leaks before cleanup
        if (_trackingEnabled) {
            const report = this.getReport();

            if (report.warnings.length > 0) {
                console.warn(`${this._prefix} Resource warnings during destroy:`);
                for (const warning of report.warnings) {
                    console.warn(`  - ${warning}`);
                }

                // Log details for leaked signals
                if (report.signals.leaked.length > 0) {
                    console.warn(`${this._prefix} Leaked signals:`);
                    for (const sig of report.signals.leaked) {
                        console.warn(`    ${sig.objectType}.${sig.signalName} (connected at ${sig.connectedAt})`);
                    }
                }

                // Log details for leaked timers
                if (report.timers.leaked.length > 0) {
                    console.warn(`${this._prefix} Leaked timers:`);
                    for (const timer of report.timers.leaked) {
                        console.warn(`    ${timer.type} source ${timer.sourceId} (added at ${timer.addedAt})`);
                    }
                }
            }
        }

        // Clean up all resources
        this.disconnectAllSignals();
        this.removeAllTimeouts();
        this._actors.clear();

        // Unregister from global tracker list
        _allTrackers.delete(this);
    }
}

/**
 * Create a ResourceTracker for a component
 * @param {string} componentName - Name of the component
 * @returns {ResourceTracker}
 */
export function createResourceTracker(componentName) {
    return new ResourceTracker(componentName);
}
