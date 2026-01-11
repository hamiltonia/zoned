/**
 * SpatialStateManager - Manages per-space layout state
 *
 * A "space" is a (monitor, workspace) pair. When per-workspace-layouts is enabled,
 * each space can have its own independent layout and zone state.
 *
 * SpaceKey format: "connector:workspaceIndex" (e.g., "DP-1:0", "eDP-1:2")
 *
 * Responsibilities:
 * - Get/set layout+zoneIndex for any space
 * - Persist state to GSettings (spatial-state-map)
 * - Handle fallback chain for unconfigured spaces
 * - Migration from old workspace-layout-map format
 */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Gio from '@girs/gio-2.0';
import Meta from '@girs/meta-14';
import {createLogger} from './utils/debug.js';

const logger = createLogger('SpatialStateManager');

/**
 * Space key identifier: "connector:workspaceIndex"
 */
export type SpaceKey = string;

/**
 * State for a specific space
 */
export interface SpatialState {
    layoutId: string;
    zoneIndex: number;
}

/**
 * Cache of spatial states keyed by SpaceKey
 */
type SpatialStateCache = Record<SpaceKey, SpatialState>;

/**
 * Monitor object with optional connector property
 */
interface MonitorInfo {
    connector?: string;
    index?: number;
}

export class SpatialStateManager {
    private _settings: Gio.Settings;
    private _stateCache: SpatialStateCache;

    constructor(settings: Gio.Settings) {
        this._settings = settings;
        this._stateCache = {};
        this._loadState();
    }

    /**
     * Get monitor connector string
     * @param monitor - Monitor index or monitor object
     * @returns Connector name (e.g., "DP-1", "eDP-1")
     */
    getMonitorConnector(monitor: number | MonitorInfo): string {
        let monitorObj: MonitorInfo | undefined;

        if (typeof monitor === 'number') {
            monitorObj = Main.layoutManager.monitors[monitor];
        } else {
            monitorObj = monitor;
        }

        // Meta.Monitor.connector available in GNOME 42+
        // Fall back to index-based naming if not available
        if (monitorObj?.connector) {
            return monitorObj.connector;
        }

        // Fallback for older GNOME or missing connector
        const index = typeof monitor === 'number' ? monitor : (monitorObj?.index ?? 0);
        return `monitor-${index}`;
    }

    /**
     * Get primary monitor connector
     * @returns Primary monitor connector name
     */
    getPrimaryConnector(): string {
        return this.getMonitorConnector(Main.layoutManager.primaryIndex);
    }

    /**
     * Get current workspace index
     * @returns Active workspace index
     */
    getCurrentWorkspaceIndex(): number {
        return global.workspace_manager.get_active_workspace_index();
    }

    /**
     * Build space key from monitor and workspace
     * @param monitor - Monitor index or connector string
     * @param workspace - Workspace index
     * @returns SpaceKey in format "connector:workspace"
     */
    makeKey(monitor: number | string, workspace: number): SpaceKey {
        const connector = typeof monitor === 'string'
            ? monitor
            : this.getMonitorConnector(monitor);
        return `${connector}:${workspace}`;
    }

    /**
     * Get current space key for the primary monitor
     * @returns SpaceKey for current workspace on primary monitor
     */
    getCurrentSpaceKey(): SpaceKey {
        return this.makeKey(
            Main.layoutManager.primaryIndex,
            this.getCurrentWorkspaceIndex(),
        );
    }

    /**
     * Get space key from a window
     * @param window - The window
     * @returns SpaceKey for the window's monitor and workspace
     */
    getSpaceKeyForWindow(window: Meta.Window | null): SpaceKey {
        if (!window) return this.getCurrentSpaceKey();

        const monitorIndex = window.get_monitor();
        const workspace = window.get_workspace();
        const workspaceIndex = workspace ? workspace.index() : this.getCurrentWorkspaceIndex();

        return this.makeKey(monitorIndex, workspaceIndex);
    }

    /**
     * Get state for a space
     * @param key - SpaceKey
     * @returns State object
     */
    getState(key: SpaceKey): SpatialState {
        // Check cache for exact match
        if (this._stateCache[key]) {
            return {...this._stateCache[key]};
        }

        // Fallback: use last-selected-layout
        const fallbackLayoutId = this._settings.get_string('last-selected-layout') || 'halves';

        return {
            layoutId: fallbackLayoutId,
            zoneIndex: 0,
        };
    }

    /**
     * Set state for a space
     * @param key - SpaceKey
     * @param layoutId - Layout ID
     * @param zoneIndex - Zone index
     */
    setState(key: SpaceKey, layoutId: string, zoneIndex: number = 0): void {
        this._stateCache[key] = {layoutId, zoneIndex};
        this._saveState();

        // Also update last-selected for future fallback
        this._settings.set_string('last-selected-layout', layoutId);

        logger.debug(`Set state for ${key}: layout=${layoutId}, zone=${zoneIndex}`);
    }

    /**
     * Update layout ID only (preserves zone index if exists)
     * @param key - SpaceKey
     * @param layoutId - Layout ID
     */
    setLayoutId(key: SpaceKey, layoutId: string): void {
        const currentState = this.getState(key);
        this.setState(key, layoutId, currentState.zoneIndex);
    }

    /**
     * Update zone index only
     * @param key - SpaceKey
     * @param zoneIndex - Zone index
     */
    setZoneIndex(key: SpaceKey, zoneIndex: number): void {
        if (!this._stateCache[key]) {
            // Initialize with fallback state first
            const defaultState = this.getState(key);
            this._stateCache[key] = defaultState;
        }
        this._stateCache[key].zoneIndex = zoneIndex;
        this._saveState();

        logger.debug(`Set zone index for ${key}: ${zoneIndex}`);
    }

    /**
     * Check if a space has explicit state configured
     * @param key - SpaceKey
     * @returns True if space has explicit state
     */
    hasExplicitState(key: SpaceKey): boolean {
        return key in this._stateCache;
    }

    /**
     * Get all configured space keys
     * @returns Array of SpaceKeys
     */
    getAllSpaceKeys(): SpaceKey[] {
        return Object.keys(this._stateCache);
    }

    /**
     * Remove state for a specific space
     * @param key - SpaceKey
     */
    removeState(key: SpaceKey): void {
        delete this._stateCache[key];
        this._saveState();
        logger.debug(`Removed state for ${key}`);
    }

    /**
     * Clear all spatial state (reset to defaults)
     */
    clearAllState(): void {
        this._stateCache = {};
        this._saveState();
        logger.info('Cleared all spatial state');
    }

    /**
     * Validate zone index against layout zone count
     * Returns valid index (clamped if necessary)
     * @param zoneIndex - Current zone index
     * @param zoneCount - Number of zones in layout
     * @returns Valid zone index
     */
    validateZoneIndex(zoneIndex: number, zoneCount: number): number {
        if (zoneCount <= 0) return 0;
        return Math.max(0, Math.min(zoneIndex, zoneCount - 1));
    }

    /**
     * Clean up orphaned state (layouts that no longer exist)
     * @param validLayoutIds - Array of valid layout IDs
     */
    cleanupOrphanedState(validLayoutIds: string[]): void {
        const validSet = new Set(validLayoutIds);
        let cleaned = false;

        for (const [key, state] of Object.entries(this._stateCache)) {
            if (!validSet.has(state.layoutId)) {
                logger.debug(`Cleaning orphaned state for ${key}: layout ${state.layoutId} no longer exists`);
                delete this._stateCache[key];
                cleaned = true;
            }
        }

        if (cleaned) {
            this._saveState();
        }
    }

    /**
     * Load state from GSettings
     */
    private _loadState(): void {
        try {
            const json = this._settings.get_string('spatial-state-map');
            this._stateCache = JSON.parse(json) as SpatialStateCache;

            if (typeof this._stateCache !== 'object' || this._stateCache === null) {
                this._stateCache = {};
            }

            logger.debug(`Loaded spatial state: ${Object.keys(this._stateCache).length} spaces`);
        } catch (e) {
            logger.warn(`Failed to parse spatial-state-map: ${e}`);
            this._stateCache = {};
        }

        // Attempt migration from old format if spatial state is empty
        if (Object.keys(this._stateCache).length === 0) {
            this._migrateOldState();
        }
    }

    /**
     * Save state to GSettings
     */
    private _saveState(): void {
        try {
            const json = JSON.stringify(this._stateCache);
            this._settings.set_string('spatial-state-map', json);
        } catch (e) {
            logger.error(`Failed to save spatial-state-map: ${e}`);
        }
    }

    /**
     * Migrate from old workspace-layout-map format
     * Old format: {"0": "layout-halves", "1": "layout-code"}
     * New format: {"monitor:0": {layoutId, zoneIndex}, ...}
     */
    private _migrateOldState(): void {
        try {
            const oldJson = this._settings.get_string('workspace-layout-map');
            const oldMap = JSON.parse(oldJson) as Record<string, string>;

            if (!oldMap || typeof oldMap !== 'object' || Object.keys(oldMap).length === 0) {
                return; // Nothing to migrate
            }

            // Migrate using primary monitor connector
            const primaryConnector = this.getPrimaryConnector();

            for (const [wsIndex, layoutId] of Object.entries(oldMap)) {
                const key = `${primaryConnector}:${wsIndex}`;
                this._stateCache[key] = {
                    layoutId: layoutId,
                    zoneIndex: 0,
                };
            }

            if (Object.keys(this._stateCache).length > 0) {
                this._saveState();
                logger.info(`Migrated ${Object.keys(this._stateCache).length} workspace mappings to spatial-state-map`);
            }
        } catch (e) {
            // No old data or invalid format - that's fine
            logger.debug(`Migration not needed or failed: ${e}`);
        }
    }

    /**
     * Debug: dump current state to log
     */
    dumpState(): void {
        logger.info('=== Spatial State Dump ===');
        logger.info(`Per-workspace mode enabled: ${this._settings.get_boolean('use-per-workspace-layouts')}`);
        logger.info(`Last selected layout: ${this._settings.get_string('last-selected-layout')}`);
        logger.info(`Configured spaces: ${Object.keys(this._stateCache).length}`);

        for (const [key, state] of Object.entries(this._stateCache)) {
            logger.info(`  ${key}: layout=${state.layoutId}, zone=${state.zoneIndex}`);
        }

        logger.info('==========================');
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        this._stateCache = {};
    }
}
