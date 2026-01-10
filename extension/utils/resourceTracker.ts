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

import GLib from '@girs/glib-2.0';
import Gio from '@girs/gio-2.0';
import GObject from '@girs/gobject-2.0';
import Clutter from '@girs/clutter-14';
import {createLogger} from './debug.js';

const logger = createLogger('ResourceTracker');

// Signal tracking information
interface SignalInfo {
    object: WeakRef<GObject.Object>;
    objectType: string;
    signalName: string;
    signalId: number;
    key: string;
    connectedAt: string;
    stack: string | undefined;
}

// Timer tracking information
interface TimerInfo {
    sourceId: number;
    intervalMs: number;
    priority: number;
    addedAt: string;
    stack: string | undefined;
    type: 'timeout' | 'timeout_seconds' | 'idle';
}

// Leaked signal info (for reports)
interface LeakedSignal {
    signalName: string;
    objectType: string;
    connectedAt: string;
}

// Leaked timer info (for reports)
interface LeakedTimer {
    sourceId: number;
    type: string;
    addedAt: string;
}

// Per-component resource report
interface ResourceReport {
    componentName: string;
    signals: {
        active: number;
        total: number;
        leaked: LeakedSignal[];
    };
    timers: {
        active: number;
        total: number;
        leaked: LeakedTimer[];
    };
    actors: {
        active: number;
        total: number;
    };
    warnings: string[];
}

// Aggregated report from all trackers
interface AggregatedReport {
    totalSignals: number;
    activeSignals: number;
    leakedSignals: number;
    totalTimers: number;
    activeTimers: number;
    leakedTimers: number;
    totalActors: number;
    activeActors: number;
    componentsWithLeaks: string[];
    componentReports: ResourceReport[];
    warnings: string[];
}

// Global tracking state
let _trackingEnabled = false;
let _settings: Gio.Settings | null = null;
let _settingsChangedId: number | null = null;
const _allTrackers = new Set<ResourceTracker>();

/**
 * Handler for debug-track-resources setting changes
 * Separated to avoid arrow function closure
 * @private
 */
function _onTrackingSettingChanged(): void {
    if (!_settings) return;
    _trackingEnabled = _settings.get_boolean('debug-track-resources');
    logger.info(`Resource tracking ${_trackingEnabled ? 'enabled' : 'disabled'}`);
}

/**
 * Initialize resource tracking from GSettings
 * Called once when extension loads
 * @param settings - Extension settings
 */
export function initResourceTracking(settings: Gio.Settings): void {
    _settings = settings;

    // Read initial value
    _trackingEnabled = _settings.get_boolean('debug-track-resources');

    // Watch for changes - use named function to avoid closure leak
    if (_settingsChangedId) {
        _settings.disconnect(_settingsChangedId);
        _settingsChangedId = null;
    }
    _settingsChangedId = _settings.connect('changed::debug-track-resources', _onTrackingSettingChanged);

    if (_trackingEnabled) {
        logger.info('Resource tracking enabled');
    }
}

/**
 * Clean up global tracking state
 */
export function destroyResourceTracking(): void {
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
 * @returns True if tracking is enabled
 */
export function isTrackingEnabled(): boolean {
    return _trackingEnabled;
}

/**
 * Get aggregated report from all trackers
 * @returns Aggregated resource report
 */
export function getAggregatedReport(): AggregatedReport {
    const report: AggregatedReport = {
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
export function resetAllTracking(): void {
    for (const tracker of _allTrackers) {
        tracker.resetCounters();
    }
}

/**
 * ResourceTracker - Per-component resource tracker
 */
export class ResourceTracker {
    private _componentName: string;
    private _prefix: string;

    // Signal tracking: Map<key, SignalInfo>
    private _signals: Map<string, SignalInfo>;
    private _signalCounter: number;

    // Timer tracking: Map<sourceId, TimerInfo>
    private _timers: Map<number, TimerInfo>;
    private _timerCounter: number;

    // Actor tracking: Set<actor>
    private _actors: Set<Clutter.Actor>;
    private _actorCounter: number;

    // Stats
    private _totalSignals: number;
    private _totalTimers: number;
    private _totalActors: number;

    /**
     * @param componentName - Name of the component for logging
     */
    constructor(componentName: string) {
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
     * @param object - Object to connect to
     * @param signalName - Signal name
     * @param callback - Callback function
     * @returns Signal ID
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connectSignal(object: GObject.Object, signalName: string, callback: (...args: any[]) => void): number {
        const signalId = object.connect(signalName, callback);

        if (_trackingEnabled) {
            const key = `${this._signalCounter++}`;
            const info: SignalInfo = {
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
     * @param object - Object to disconnect from
     * @param signalId - Signal ID to disconnect
     */
    disconnectSignal(object: GObject.Object, signalId: number): void {
        try {
            object.disconnect(signalId);
        } catch {
            // Object may already be destroyed
        }

        if (_trackingEnabled) {
            // Find and remove the signal info
            for (const [_key, info] of this._signals) {
                if (info.signalId === signalId) {
                    this._signals.delete(info.key);
                    break;
                }
            }
        }
    }

    /**
     * Disconnect all tracked signals
     */
    disconnectAllSignals(): void {
        for (const [_key, info] of this._signals) {
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
     * @param priority - GLib priority
     * @param intervalMs - Interval in milliseconds
     * @param callback - Callback function
     * @returns Source ID
     */
    addTimeout(priority: number, intervalMs: number, callback: () => boolean | number): number {
        // Wrap callback to auto-remove on completion if it returns false
        const wrappedCallback = (): boolean => {
            const result = callback();
            if (result === false || result === GLib.SOURCE_REMOVE) {
                if (_trackingEnabled) {
                    this._timers.delete(sourceId);
                }
            }
            return result as boolean;
        };

        const sourceId = GLib.timeout_add(priority, intervalMs, wrappedCallback);

        if (_trackingEnabled) {
            const info: TimerInfo = {
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
     * @param priority - GLib priority
     * @param seconds - Interval in seconds
     * @param callback - Callback function
     * @returns Source ID
     */
    addTimeoutSeconds(priority: number, seconds: number, callback: () => boolean | number): number {
        const wrappedCallback = (): boolean => {
            const result = callback();
            if (result === false || result === GLib.SOURCE_REMOVE) {
                if (_trackingEnabled) {
                    this._timers.delete(sourceId);
                }
            }
            return result as boolean;
        };

        const sourceId = GLib.timeout_add_seconds(priority, seconds, wrappedCallback);

        if (_trackingEnabled) {
            const info: TimerInfo = {
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
     * @param priority - GLib priority
     * @param callback - Callback function
     * @returns Source ID
     */
    addIdle(priority: number, callback: () => boolean | number): number {
        const wrappedCallback = (): boolean => {
            const result = callback();
            if (result === false || result === GLib.SOURCE_REMOVE) {
                if (_trackingEnabled) {
                    this._timers.delete(sourceId);
                }
            }
            return result as boolean;
        };

        const sourceId = GLib.idle_add(priority, wrappedCallback);

        if (_trackingEnabled) {
            const info: TimerInfo = {
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
     * @param sourceId - Source ID to remove
     * @returns True if removed
     */
    removeTimeout(sourceId: number | null): boolean {
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
    removeAllTimeouts(): void {
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
     * @param actor - Actor to track
     */
    trackActor(actor: Clutter.Actor): void {
        if (_trackingEnabled) {
            this._actors.add(actor);
            this._totalActors++;
        }
    }

    /**
     * Untrack an actor
     * @param actor - Actor to untrack
     */
    untrackActor(actor: Clutter.Actor): void {
        if (_trackingEnabled) {
            this._actors.delete(actor);
        }
    }

    /**
     * Get report for this tracker
     * @returns Resource report for this component
     */
    getReport(): ResourceReport {
        const leakedSignals: LeakedSignal[] = [];
        const leakedTimers: LeakedTimer[] = [];
        const warnings: string[] = [];

        // Check for leaked signals
        for (const [_key, info] of this._signals) {
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
        for (const [_sourceId, info] of this._timers) {
            leakedTimers.push({
                sourceId: info.sourceId,
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
     * @returns True if leaks detected
     */
    hasLeaks(): boolean {
        return this._signals.size > 0 || this._timers.size > 0;
    }

    /**
     * Reset counters (for testing)
     */
    resetCounters(): void {
        this._totalSignals = this._signals.size;
        this._totalTimers = this._timers.size;
        this._totalActors = this._actors.size;
    }

    /**
     * Log current state (for debugging)
     */
    logState(): void {
        if (!_trackingEnabled)
            return;

        const report = this.getReport();
        logger.debug(`${this._componentName} State: ${JSON.stringify(report, null, 2)}`);
    }

    /**
     * Destroy tracker - clean up all resources and warn about leaks
     */
    destroy(): void {
        // Log warnings about leaks before cleanup
        if (_trackingEnabled) {
            const report = this.getReport();

            if (report.warnings.length > 0) {
                logger.warn(`${this._componentName} Resource warnings during destroy:`);
                for (const warning of report.warnings) {
                    logger.warn(`  - ${warning}`);
                }

                // Log details for leaked signals
                if (report.signals.leaked.length > 0) {
                    logger.warn(`${this._componentName} Leaked signals:`);
                    for (const sig of report.signals.leaked) {
                        logger.warn(`    ${sig.objectType}.${sig.signalName} (connected at ${sig.connectedAt})`);
                    }
                }

                // Log details for leaked timers
                if (report.timers.leaked.length > 0) {
                    logger.warn(`${this._componentName} Leaked timers:`);
                    for (const timer of report.timers.leaked) {
                        logger.warn(`    ${timer.type} source ${timer.sourceId} (added at ${timer.addedAt})`);
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
 * @param componentName - Name of the component
 * @returns New ResourceTracker instance
 */
export function createResourceTracker(componentName: string): ResourceTracker {
    return new ResourceTracker(componentName);
}
