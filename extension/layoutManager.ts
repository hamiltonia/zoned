// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * LayoutManager - Manages window layouts and state
 *
 * ARCHITECTURE NOTE - Layout vs Layout Model:
 * ============================================
 *
 * INTERNAL (Code):
 * - PROFILE = Complete data object containing:
 *   - id: Unique identifier
 *   - name: User-visible name
 *   - zones: Array of zone geometry (the ZONE data)
 *   - metadata: (future) padding, shortcuts, per-layout settings
 *
 * - LayoutManager class manages complete layout objects
 * - Layouts are persisted to ~/.config/zoned/layouts.json
 * - GSettings keys use "layout" naming (for backward compatibility)
 *
 * USER-FACING (UI):
 * - Users see "ZONE" everywhere in the UI
 * - "Choose a layout", "Edit layout", "Zone Editor"
 * - ZoneEditor component edits the zones array (geometry portion)
 * - TemplatePicker shows layouts but calls them "layouts"
 *
 * WHY THIS ARCHITECTURE?
 * 1. Separation of Concerns:
 *    - Layout = Pure geometry data (zones/edges)
 *    - Layout = Complete package (metadata + layout + settings)
 *
 * 2. User Simplicity:
 *    - Users don't need to understand internal "layouts" concept
 *    - "Layout" matches industry terminology for zone-based window management
 *
 * 3. Code Precision:
 *    - Code explicitly manages complete layout objects
 *    - Clear separation between data model and presentation
 *
 * 4. Future-Proof:
 *    - Easy to add per-layout settings (padding, shortcuts, colors)
 *    - Layout geometry remains pure and reusable
 *
 * See: memory/development/v1-mvp-roadmap.md for full architecture spec
 *
 * Responsibilities:
 * - Loading default and user layouts
 * - Managing current layout and zone state
 * - Zone cycling logic
 * - State persistence via GSettings
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {createLogger} from './utils/debug.js';
import {TemplateManager} from './templateManager.js';
import type {Layout, Zone} from './types/layout.js';
import type {SpatialStateManager} from './spatialStateManager.js';

const logger = createLogger('LayoutManager');

interface LayoutData {
    version: number;
    layouts: Layout[];
}

interface UserLayoutsData {
    layouts: Layout[];
    layout_order: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ZoneOverlay = any; // Will be typed when UI components are migrated

export class LayoutManager {
    private _settings: Gio.Settings;
    private _extensionPath: string;
    private _layouts: Layout[];
    private _currentLayout: Layout | null;
    private _currentZoneIndex: number;
    private _spatialStateManager: SpatialStateManager | null;

    constructor(settings: Gio.Settings, extensionPath: string) {
        this._settings = settings;
        this._extensionPath = extensionPath;
        this._layouts = [];
        this._currentLayout = null;
        this._currentZoneIndex = 0;
        this._spatialStateManager = null;
    }

    /**
     * Set the spatial state manager for per-space layout support
     */
    setSpatialStateManager(manager: SpatialStateManager): void {
        this._spatialStateManager = manager;
    }

    /**
     * Get the spatial state manager
     */
    getSpatialStateManager(): SpatialStateManager | null {
        return this._spatialStateManager;
    }

    /**
     * Get the extension path
     */
    getExtensionPath(): string {
        return this._extensionPath;
    }

    /**
     * Load all layouts (default + user custom)
     */
    loadLayouts(): boolean {
        try {
            // First-run setup: copy defaults to user config if needed
            this._ensureUserLayoutsExist();

            // Load default layouts from extension
            const defaultLayouts = this._loadDefaultLayouts();

            // Load user layouts from config directory
            const userLayouts = this._loadUserLayouts() ;

            // Merge layouts (user layouts override defaults by matching id)
            this._layouts = this._mergeLayouts(defaultLayouts, userLayouts);

            // Validate all layouts
            this._layouts = this._layouts.filter(layout => this._validateLayout(layout));

            if (this._layouts.length === 0) {
                logger.error('No valid layouts loaded!');
                return false;
            }

            // Apply custom ordering if set
            this._applyLayoutOrder() ;

            logger.info(`Loaded ${this._layouts.length} layouts`);

            // Restore state from GSettings
            this._restoreState();

            return true;
        } catch (error) {
            logger.error(`Error loading layouts: ${error}`);
            return false;
        }
    }

    /**
     * Load default layouts from extension directory
     * @private
     */
    private _loadDefaultLayouts(): Layout[] {
        const data = this._loadDefaultLayoutsData();
        return data.layouts || [];
    }

    /**
     * Load default layouts data including version
     * @private
     */
    private _loadDefaultLayoutsData(): LayoutData {
        try {
            const layoutsPath = `${this._extensionPath}/config/default-layouts.json`;
            const file = Gio.File.new_for_path(layoutsPath);

            if (!file.query_exists(null)) {
                logger.error(`Default layouts file not found: ${layoutsPath}`);
                return {version: 0, layouts: []};
            }

            const [success, contents] = file.load_contents(null);
            if (!success) {
                logger.error('Failed to read default layouts file');
                return {version: 0, layouts: []};
            }

            const decoder = new TextDecoder('utf-8');
            const jsonString = decoder.decode(contents);
            const data = JSON.parse(jsonString);

            logger.info(`Loaded ${data.layouts.length} default layouts (version ${data.version || 0})`);
            return {
                version: data.version || 0,
                layouts: data.layouts || [],
            };
        } catch (error) {
            logger.error(`Error loading default layouts: ${error}`);
            return {version: 0, layouts: []};
        }
    }

    /**
     * Load user-defined layouts from ~/.config/zoned/layouts.json
     * @private
     */
    private _loadUserLayouts(): Layout[] {
        try {
            const configDir = GLib.get_user_config_dir();
            const layoutsPath = `${configDir}/zoned/layouts.json`;
            const file = Gio.File.new_for_path(layoutsPath);

            if (!file.query_exists(null)) {
                logger.info('No user layouts found (this is okay)');
                return [];
            }

            const [success, contents] = file.load_contents(null);
            if (!success) {
                logger.warn('Failed to read user layouts file');
                return [];
            }

            const decoder = new TextDecoder('utf-8');
            const jsonString = decoder.decode(contents);
            const data = JSON.parse(jsonString);

            logger.info(`Loaded ${data.layouts.length} user layouts`);
            return data.layouts;
        } catch (error) {
            logger.warn(`Error loading user layouts: ${error}`);
            return [];
        }
    }

    /**
     * Merge user layouts with default layouts
     * User layouts override defaults if they have matching IDs
     * @private
     */
    private _mergeLayouts(defaultLayouts: Layout[], userLayouts: Layout[]): Layout[] {
        const merged = [...defaultLayouts];

        userLayouts.forEach((userLayout: Layout) => {
            const existingIndex = merged.findIndex(p => p.id === userLayout.id);
            if (existingIndex >= 0) {
                // Override existing layout
                merged[existingIndex] = userLayout;
                logger.debug(`User layout '${userLayout.id}' overrides default`);
            } else {
                // Add new user layout
                merged.push(userLayout);
                logger.debug(`Added user layout '${userLayout.id}'`);
            }
        });

        return merged;
    }

    /**
     * Validate layout has valid id
     * @private
     */
    private _validateLayoutId(layout: Layout): boolean {
        if (!layout.id || typeof layout.id !== 'string') {
            logger.warn('Layout missing valid id:', layout);
            return false;
        }
        return true;
    }

    /**
     * Validate layout has valid name
     * @private
     */
    private _validateLayoutName(layout: Layout): boolean {
        if (!layout.name || typeof layout.name !== 'string') {
            logger.warn(`Layout '${layout.id}' missing valid name`);
            return false;
        }
        return true;
    }

    /**
     * Validate layout has valid zones array
     * @private
     */
    private _validateLayoutZonesArray(layout: Layout): boolean {
        if (!Array.isArray(layout.zones) || layout.zones.length === 0) {
            logger.warn(`Layout '${layout.id}' missing valid zones array`);
            return false;
        }
        return true;
    }

    /**
     * Validate a single zone has proper coordinate types
     * @private
     */
    private _validateZoneTypes(zone: Zone): boolean {
        return typeof zone.x === 'number' &&
               typeof zone.y === 'number' &&
               typeof zone.w === 'number' &&
               typeof zone.h === 'number';
    }

    /**
     * Validate a single zone has coordinates in valid range (0-1)
     * @private
     */
    private _validateZoneRanges(zone: Zone): boolean {
        return zone.x >= 0 && zone.x <= 1 &&
               zone.y >= 0 && zone.y <= 1 &&
               zone.w >= 0 && zone.w <= 1 &&
               zone.h >= 0 && zone.h <= 1;
    }

    /**
     * Validate a layout structure
     * @private
     */
    private _validateLayout(layout: Layout): boolean {
        if (!this._validateLayoutId(layout)) return false;
        if (!this._validateLayoutName(layout)) return false;
        if (!this._validateLayoutZonesArray(layout)) return false;

        // Validate each zone
        for (let i = 0; i < layout.zones.length; i++) {
            const zone = layout.zones[i];

            if (!this._validateZoneTypes(zone)) {
                logger.warn(`Layout '${layout.id}' zone ${i} has invalid coordinates`);
                return false;
            }

            if (!this._validateZoneRanges(zone)) {
                logger.warn(`Layout '${layout.id}' zone ${i} has out-of-range coordinates`);
                return false;
            }
        }

        return true;
    }

    /**
     * Get the currently active layout
     * When spaceKey is provided and per-workspace mode is enabled, returns the layout for that space
     * @param {string|null} spaceKey - Optional space key for per-space mode
     * @returns {Object|null} The current layout
     */
    getCurrentLayout(spaceKey = null) {
        // Check if per-workspace mode is enabled and we have spatial state manager
        const perSpaceEnabled = this._settings.get_boolean('use-per-workspace-layouts');

        if (perSpaceEnabled && spaceKey && this._spatialStateManager) {
            const state = this._spatialStateManager.getState(spaceKey);
            const layout = this._layouts.find(l => l.id === state.layoutId);
            return layout || this._currentLayout || this._layouts[0];
        }

        return this._currentLayout;
    }

    /**
     * Get layout for a specific space
     * @param {string} spaceKey - Space key (connector:workspace)
     * @returns {Object|null} The layout for the space
     */
    getLayoutForSpace(spaceKey) {
        if (!this._spatialStateManager) {
            return this._currentLayout;
        }

        const state = this._spatialStateManager.getState(spaceKey);
        let layout = this._layouts.find(l => l.id === state.layoutId);

        // Handle template-prefixed layout IDs (e.g., "template-quarters")
        // These are created when selecting templates but should map to actual layouts after restart
        if (!layout && state.layoutId.startsWith('template-')) {
            const baseId = state.layoutId.replace('template-', '');
            layout = this._layouts.find(l => l.id === baseId);

            if (layout) {
                // Found the base layout, update spatial state to use correct ID
                logger.info(`Remapped template layout '${state.layoutId}' to '${layout.id}' for space ${spaceKey}`);
                this._spatialStateManager.setState(spaceKey, layout.id, state.zoneIndex);
                return layout;
            }
        }

        if (!layout) {
            // Layout no longer exists (e.g., old template removed)
            // Use fallback and persist it to prevent repeated warnings
            const fallback = this._currentLayout || this._layouts[0];
            if (fallback) {
                logger.info(`Layout '${state.layoutId}' not found for space ${spaceKey}, migrating to '${fallback.id}'`);
                this._spatialStateManager.setState(spaceKey, fallback.id, 0);
            }
            return fallback;
        }

        return layout;
    }

    /**
     * Set layout for a specific space (per-workspace mode)
     * @param {string} spaceKey - Space key (connector:workspace)
     * @param {string} layoutId - Layout ID to assign
     * @returns {boolean} True if set successfully
     */
    setLayoutForSpace(spaceKey, layoutId) {
        if (!this._spatialStateManager) {
            logger.warn('SpatialStateManager not initialized');
            return false;
        }

        const layout = this._layouts.find(l => l.id === layoutId);
        if (!layout) {
            logger.warn(`Layout '${layoutId}' not found`);
            return false;
        }

        this._spatialStateManager.setState(spaceKey, layoutId, 0);
        logger.info(`Set layout '${layoutId}' for space ${spaceKey}`);

        return true;
    }

    /**
     * Get zone index for a specific space
     * @param {string} spaceKey - Space key
     * @returns {number} Zone index
     */
    getZoneIndexForSpace(spaceKey) {
        if (!this._spatialStateManager) {
            return this._currentZoneIndex;
        }

        const state = this._spatialStateManager.getState(spaceKey);
        const layout = this.getLayoutForSpace(spaceKey);

        // Validate zone index against layout
        if (layout && layout.zones) {
            return this._spatialStateManager.validateZoneIndex(state.zoneIndex, layout.zones.length);
        }

        return state.zoneIndex;
    }

    /**
     * Get current zone for a specific space
     * @param {string} spaceKey - Space key
     * @returns {Object|null} The zone geometry
     */
    getZoneForSpace(spaceKey) {
        const layout = this.getLayoutForSpace(spaceKey);
        if (!layout || !layout.zones) return null;

        const zoneIndex = this.getZoneIndexForSpace(spaceKey);
        return layout.zones[zoneIndex] || layout.zones[0];
    }

    /**
     * Get the current zone within the active layout
     * @returns {Object|null} The current zone
     */
    getCurrentZone() {
        if (!this._currentLayout || !this._currentLayout.zones) {
            return null;
        }

        return this._currentLayout.zones[this._currentZoneIndex];
    }

    /**
     * Get current zone index
     * @returns {number} The current zone index
     */
    getCurrentZoneIndex() {
        return this._currentZoneIndex;
    }

    /**
     * Set the active layout by ID
     * @param {string} layoutId - The layout ID to activate
     * @returns {boolean} True if layout was found and set
     */
    setLayout( layoutId) {
        const layout = this._layouts.find(p => p.id === layoutId);

        if (!layout) {
            logger.warn(`Layout not found: ${layoutId}`);
            return false;
        }

        this._currentLayout = layout;
        this._currentZoneIndex = 0; // Reset to first zone when changing layouts

        logger.info(`Switched to layout: ${layout.name} (${layout.id})`);

        this._saveState();
        return true;
    }

    /**
     * Set the active layout by ID with notification
     * This is the preferred method for UI-triggered layout changes
     * @param {string} layoutId - The layout ID to activate
     * @param {ZoneOverlay} zoneOverlay - Zone overlay instance for center-screen notification
     * @returns {boolean} True if layout was found and set
     */
    setLayoutWithNotification(layoutId, zoneOverlay) {
        logger.debug(`setLayoutWithNotification called with layoutId: ${layoutId}, zoneOverlay: ${zoneOverlay ? 'present' : 'NULL'}`);

        const layout = this._layouts.find(p => p.id === layoutId);

        if (!layout) {
            logger.warn(`Layout not found: ${layoutId}`);
            return false;
        }

        this._currentLayout = layout;
        this._currentZoneIndex = 0; // Reset to first zone when changing layouts

        logger.info(`Switched to layout: ${layout.name} (${layout.id})`);

        this._saveState();

        // Show center-screen notification for user action
        logger.debug(`About to show zone overlay with message: "Switched to: ${layout.name}"`);
        if (zoneOverlay) {
            zoneOverlay.showMessage(`Switched to: ${layout.name}`);
            logger.debug('zoneOverlay.showMessage() called');
        } else {
            logger.error('zoneOverlay is NULL - cannot show notification!');
        }

        return true;
    }

    /**
     * Cycle to the next or previous zone
     * @param {number} direction - 1 for next, -1 for previous
     * @param {string|null} spaceKey - Optional space key for per-space mode
     * @returns {Object|null} The new current zone
     */
    cycleZone(direction, spaceKey = null) {
        // Check if per-workspace mode is enabled
        const perSpaceEnabled = this._settings.get_boolean('use-per-workspace-layouts');

        // Use per-space cycling if enabled and spaceKey provided
        if (perSpaceEnabled && spaceKey && this._spatialStateManager) {
            return this.cycleZoneForSpace(direction, spaceKey);
        }

        // Global mode cycling
        if (!this._currentLayout || !this._currentLayout.zones) {
            logger.warn('No current layout to cycle zones');
            return null;
        }

        const numZones = this._currentLayout.zones.length;

        // Calculate new zone index with wraparound
        this._currentZoneIndex = (this._currentZoneIndex + direction + numZones) % numZones;

        logger.info(`Cycled to zone ${this._currentZoneIndex + 1}/${numZones}`);

        this._saveState();
        return this.getCurrentZone();
    }

    /**
     * Cycle to the next or previous zone for a specific space
     * @param {number} direction - 1 for next, -1 for previous
     * @param {string} spaceKey - Space key (connector:workspace)
     * @returns {Object|null} The new current zone
     */
    cycleZoneForSpace(direction, spaceKey) {
        if (!this._spatialStateManager) {
            logger.warn('SpatialStateManager not initialized');
            return null;
        }

        const layout = this.getLayoutForSpace(spaceKey);
        if (!layout || !layout.zones) {
            logger.warn(`No layout found for space ${spaceKey}`);
            return null;
        }

        const numZones = layout.zones.length;
        const currentState = this._spatialStateManager.getState(spaceKey);
        const currentIndex = this._spatialStateManager.validateZoneIndex(currentState.zoneIndex, numZones);

        // Calculate new zone index with wraparound
        const newIndex = (currentIndex + direction + numZones) % numZones;

        // Update spatial state
        this._spatialStateManager.setZoneIndex(spaceKey, newIndex);

        logger.info(`Space ${spaceKey}: Cycled to zone ${newIndex + 1}/${numZones}`);

        return layout.zones[newIndex];
    }

    /**
     * Get all available layouts
     * @returns {Array} Array of all layouts
     */
    getAllLayouts()  {
        return this._layouts;
    }

    /**
     * Save current state to GSettings
     * @private
     */
    _saveState() {
        if (this._currentLayout) {
            this._settings.set_string('current-layout-id', this._currentLayout.id);
            this._settings.set_int('current-zone-index', this._currentZoneIndex);
            logger.debug(`State saved: ${this._currentLayout.id}, zone ${this._currentZoneIndex}`);
        }
    }

    /**
     * Try to restore a template-based layout from saved ID
     * @param {string} savedLayoutId - The saved layout ID starting with "template-"
     * @param {number} savedZoneIndex - The saved zone index
     * @returns {boolean} True if template was restored successfully
     * @private
     */
    _tryRestoreTemplateLayout(savedLayoutId, savedZoneIndex) {
        const templateId = savedLayoutId.replace('template-', '');
        try {
            const templateManager = new TemplateManager();
            const layout = templateManager.createLayoutFromTemplate(templateId);
            if (!layout) return false;

            this.registerLayoutTemporary(layout);
            this._currentLayout = layout;
            this._currentZoneIndex = this._clampZoneIndex(savedZoneIndex, layout.zones.length);
            logger.info(`Restored template layout: ${savedLayoutId}, zone ${this._currentZoneIndex}`);
            return true;
        } catch (e) {
            logger.warn(`Failed to restore template '${templateId}': ${e}`);
            return false;
        }
    }

    /**
     * Clamp zone index to valid range
     * @param {number} zoneIndex - Zone index to clamp
     * @param {number} zonesLength - Number of zones in layout
     * @returns {number} Valid zone index (0 if out of range)
     * @private
     */
    _clampZoneIndex(zoneIndex, zonesLength) {
        return (zoneIndex >= 0 && zoneIndex < zonesLength) ? zoneIndex : 0;
    }

    /**
     * Use first available layout as fallback
     * @private
     */
    _useDefaultLayout() {
        if (this._layouts.length > 0) {
            this._currentLayout = this._layouts[0];
            this._currentZoneIndex = 0;
            logger.info(`Using default layout: ${this._currentLayout.id}`);
            this._saveState();
        }
    }

    /**
     * Restore state from GSettings
     * @private
     */
    _restoreState() {
        const savedLayoutId = this._settings.get_string('current-layout-id');
        const savedZoneIndex = this._settings.get_int('current-zone-index');

        // Try to restore saved layout from persistent layouts first
        if (savedLayoutId && this.setLayout(savedLayoutId)) {
            this._currentZoneIndex = this._clampZoneIndex(savedZoneIndex, this._currentLayout.zones.length);
            logger.info(`Restored state: ${savedLayoutId}, zone ${this._currentZoneIndex}`);
            return;
        }

        // If ID starts with "template-", recreate from template
        if (savedLayoutId && savedLayoutId.startsWith('template-')) {
            if (this._tryRestoreTemplateLayout(savedLayoutId, savedZoneIndex)) {
                return;
            }
        }

        // Fall back to first layout
        this._useDefaultLayout();
    }

    /**
     * Ensure user layouts directory and file exist (first-run setup)
     * Also handles template version migration
     * @private
     */
    _ensureUserLayoutsExist() {
        try {
            const configDir = GLib.get_user_config_dir();
            const zonedDir = `${configDir}/zoned`;
            const layoutsPath = `${zonedDir}/layouts.json`;

            // Create zoned directory if needed
            const dir = Gio.File.new_for_path(zonedDir);
            if (!dir.query_exists(null)) {
                dir.make_directory_with_parents(null);
                logger.info('Created user config directory');
            }

            // Load default layouts with version info
            const defaultData = this._loadDefaultLayoutsData();
            const installedVersion = this._settings.get_int('templates-version');

            const file = Gio.File.new_for_path(layoutsPath);

            // First-run: file doesn't exist
            if (!file.query_exists(null)) {
                this._writeUserLayoutsFile(file, defaultData.layouts, []);
                this._settings.set_int('templates-version', defaultData.version);
                logger.info(`First-run: Installed templates v${defaultData.version}`);
                return;
            }

            // Check if template migration is needed
            if (defaultData.version > installedVersion) {
                logger.info(`Template migration needed: v${installedVersion} → v${defaultData.version}`);
                this._migrateTemplates(defaultData);
                this._settings.set_int('templates-version', defaultData.version);
            } else {
                logger.debug(`Templates up to date (v${installedVersion})`);
            }
        } catch (error) {
            logger.error(`Error ensuring user layouts exist: ${error}`);
        }
    }

    /**
     * Write user layouts file to disk
     * @private
     */
    _writeUserLayoutsFile(file, layouts, layoutOrder) {
        const data = {
            layouts: layouts,
            layout_order: layoutOrder,
        };

        const encoder = new TextEncoder();
        const jsonString = JSON.stringify(data, null, 2);
        const contents = encoder.encode(jsonString);

        file.replace_contents(
            contents,
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null,
        );
    }

    /**
     * Check if a layout ID is a built-in template (vs user custom)
     * Templates have simple IDs like: split, triple, wide, quarters, triple_stack
     * Custom layouts have prefixed IDs like: layout-*, custom_*
     * @private
     */
    _isTemplateId(layoutId) {
        // Custom layout patterns
        if (layoutId.startsWith('layout-')) return false;
        if (layoutId.startsWith('custom_')) return false;
        if (layoutId.startsWith('template-')) return false;

        // All other simple IDs are likely templates
        return true;
    }

    /**
     * Migrate templates to new version while preserving user custom layouts
     * @private
     */
    _migrateTemplates(defaultData) {
        try {
            // Backup existing layouts
            this._backupUserLayouts();

            // Load existing user data
            const userData = this._loadUserLayoutsData();

            // Get template IDs from new defaults
            const newTemplateIds = new Set(defaultData.layouts.map(l => l.id));

            // Separate user customs from old templates
            const userCustoms = userData.layouts.filter(layout => {
                // Keep if it's a user custom layout
                if (!this._isTemplateId(layout.id)) {
                    return true;
                }
                // Keep if it's a template ID that's also in the new templates
                // (will be replaced below)
                return false;
            });

            // Also keep any old templates that user explicitly modified
            // (detected by checking if they exist in user file but differ from defaults)
            const preservedOldTemplates = userData.layouts.filter(layout => {
                // Only consider template-like IDs
                if (!this._isTemplateId(layout.id)) return false;
                // Skip if it's being replaced by a new template
                if (newTemplateIds.has(layout.id)) return false;
                // This is an old template that's being removed - don't keep it
                return false;
            });

            // Combine: new templates + user customs
            const migratedLayouts = [
                ...defaultData.layouts,    // New templates first
                ...userCustoms,            // Then user custom layouts
                ...preservedOldTemplates,  // Any preserved old templates
            ];

            // Update layout order: keep custom layout ordering, let templates use default order
            const newOrder = userData.layout_order.filter(id => {
                return !this._isTemplateId(id) || newTemplateIds.has(id);
            });

            // Save migrated layouts
            const layoutsPath = this._getUserLayoutsPath();
            const file = Gio.File.new_for_path(layoutsPath);
            this._writeUserLayoutsFile(file, migratedLayouts, newOrder);

            logger.info(`Template migration complete: ${defaultData.layouts.length} templates, ${userCustoms.length} user customs preserved`);
        } catch (error) {
            logger.error(`Error migrating templates: ${error}`);
        }
    }

    /**
     * Apply custom layout ordering from GSettings
     * @private
     */
    _applyLayoutOrder()  {
        const customOrder = this._settings.get_strv('layout-order');

        if (!customOrder || customOrder.length === 0) {
            logger.debug('No custom layout order set');
            return;
        }

        // Reorder layouts based on custom order
        const ordered = [];
        const remaining = [...this._layouts];

        customOrder.forEach(id => {
            const index = remaining.findIndex(p => p.id === id);
            if (index >= 0) {
                ordered.push(remaining[index]);
                remaining.splice(index, 1);
            }
        });

        // Append any layouts not in order list
        this._layouts = [...ordered, ...remaining];

        logger.debug(`Applied custom layout order (${customOrder.length} ordered)`);
    }

    /**
     * Get user layouts file path
     * @private
     */
    _getUserLayoutsPath() {
        const configDir = GLib.get_user_config_dir();
        return `${configDir}/zoned/layouts.json`;
    }

    /**
     * Load user layouts data structure (with layout_order)
     * @private
     */
    _loadUserLayoutsData() {
        try {
            const layoutsPath = this._getUserLayoutsPath();
            const file = Gio.File.new_for_path(layoutsPath);

            if (!file.query_exists(null)) {
                return {layouts: [], layout_order: []};
            }

            const [success, contents] = file.load_contents(null);
            if (!success) {
                return {layouts: [], layout_order: []};
            }

            const decoder = new TextDecoder('utf-8');
            const jsonString = decoder.decode(contents);
            return JSON.parse(jsonString);
        } catch (error) {
            logger.error(`Error loading user layouts data: ${error}`);
            return {layouts: [], layout_order: []};
        }
    }

    /**
     * Save user layouts to disk
     * @private
     */
    _saveUserLayouts(layouts, layoutOrder = null) {
        try {
            const layoutsPath = this._getUserLayoutsPath();
            const file = Gio.File.new_for_path(layoutsPath);

            // Use provided order or get from GSettings
            const order = layoutOrder !== null ? layoutOrder : this._settings.get_strv('layout-order');

            const data = {
                layouts: layouts,
                layout_order: order,
            };

            const encoder = new TextEncoder();
            const jsonString = JSON.stringify(data, null, 2);
            const contents = encoder.encode(jsonString);

            file.replace_contents(
                contents,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null,
            );

            logger.info(`Saved ${layouts.length} user layouts`);
            return true;
        } catch (error) {
            logger.error(`Error saving user layouts: ${error}`);
            return false;
        }
    }

    /**
     * Create backup of user layouts
     * @private
     */
    _backupUserLayouts(){
        try {
            const layoutsPath = this._getUserLayoutsPath();
            const backupPath = `${layoutsPath}.backup`;

            const sourceFile = Gio.File.new_for_path(layoutsPath);
            const destFile = Gio.File.new_for_path(backupPath);

            if (sourceFile.query_exists(null)) {
                sourceFile.copy(destFile, Gio.FileCopyFlags.OVERWRITE, null, null);
                logger.info('Created backup of user layouts');
                return true;
            }

            return false;
        } catch (error) {
            logger.error(`Error backing up user layouts: ${error}`);
            return false;
        }
    }

    /**
     * Generate a unique layout ID
     * @private
     */
    _generateUniqueId() {
        const timestamp = Date.now();
        return `layout-${timestamp}`;
    }

    /**
     * Save a layout to user config
     * @param {Object} layout - The layout to save
     * @returns {boolean} True if saved successfully
     */
    saveLayout(layout) {
        try {
            // Validate layout structure
            if (!this._validateLayout(layout)) {
                logger.error('Cannot save invalid layout');
                return false;
            }

            // Load current user layouts
            const data = this._loadUserLayoutsData();

            // Find if layout already exists
            const existingIndex = data.layouts.findIndex(p => p.id === layout.id);

            if (existingIndex >= 0) {
                // Update existing layout
                data.layouts[existingIndex] = layout;
                logger.info(`Updated layout '${layout.id}'`);
            } else {
                // Add new layout
                data.layouts.push(layout);
                logger.info(`Added new layout '${layout.id}'`);
            }

            // Save to disk
            if (this._saveUserLayouts(data.layouts, data.layout_order)) {
                // Reload layouts to refresh in-memory state
                this.loadLayouts();
                return true;
            }

            return false;
        } catch (error) {
            logger.error(`Error in saveLayout: ${error}`);
            return false;
        }
    }

    /**
     * Delete a layout from user config
     * @param {string} layoutId - The layout ID to delete
     * @returns {boolean} True if deleted successfully
     */
    deleteLayout(layoutId) {
        try {
            // Create backup first
            this._backupUserLayouts();

            // Load current user layouts
            const data = this._loadUserLayoutsData();

            // Find layout
            const index = data.layouts.findIndex(p => p.id === layoutId);

            if (index < 0) {
                logger.warn(`Layout '${layoutId}' not found in user layouts`);
                return false;
            }

            // Remove layout
            data.layouts.splice(index, 1);

            // Remove from order if present
            const orderIndex = data.layout_order.indexOf(layoutId);
            if (orderIndex >= 0) {
                data.layout_order.splice(orderIndex, 1);
            }

            // Save to disk
            if (this._saveUserLayouts(data.layouts, data.layout_order)) {
                logger.info(`Deleted layout '${layoutId}'`);

                // Update GSettings order
                this._settings.set_strv('layout-order', data.layout_order);

                // Reload layouts
                this.loadLayouts();
                return true;
            }

            return false;
        } catch (error) {
            logger.error(`Error in deleteLayout: ${error}`);
            return false;
        }
    }

    /**
     * Duplicate a layout
     * @param {string} layoutId - The layout ID to duplicate
     * @param {string} newName - Name for the new layout
     * @returns {Object|null} The new layout if successful, null otherwise
     */
    duplicateLayout( layoutId, newName) {
        try {
            // Find source layout
            const sourceLayout = this._layouts.find(p => p.id === layoutId);

            if (!sourceLayout) {
                logger.error(`Layout '${layoutId}' not found`);
                return null;
            }

            // Create copy with new ID and name
            const newLayout = {
                id: this._generateUniqueId(),
                name: newName,
                zones: JSON.parse(JSON.stringify(sourceLayout.zones)), // Deep copy
            };

            // Save the new layout
            if (this.saveLayout(newLayout)) {
                logger.info(`Duplicated layout '${layoutId}' as '${newLayout.id}'`);
                return newLayout;
            }

            return null;
        } catch (error) {
            logger.error(`Error in duplicateLayout: ${error}`);
            return null;
        }
    }

    /**
     * Reset all layouts to extension defaults
     * @returns {boolean} True if reset successfully
     */
    resetToDefaults() {
        try {
            // Create backup first
            this._backupUserLayouts();

            // Load default layouts
            const defaultLayouts = this._loadDefaultLayouts();

            // Save as user layouts with empty order
            if (this._saveUserLayouts(defaultLayouts, [])) {
                // Clear custom order in GSettings
                this._settings.set_strv('layout-order', []);

                logger.info('Reset all layouts to defaults');

                // Reload layouts
                this.loadLayouts();
                return true;
            }

            return false;
        } catch (error) {
            logger.error(`Error in resetToDefaults: ${error}`);
            return false;
        }
    }

    /**
     * Get custom layout order
     * @returns {Array} Array of layout IDs in custom order
     */
    getLayoutOrder(){
        return this._settings.get_strv('layout-order');
    }

    /**
     * Set custom layout order
     * @param {Array} orderedIds - Array of layout IDs in desired order
     * @returns {boolean} True if saved successfully
     */
    setLayoutOrder(orderedIds) {
        try {
            // Update GSettings
            this._settings.set_strv('layout-order', orderedIds);

            // Also update user layouts file
            const data = this._loadUserLayoutsData();
            this._saveUserLayouts(data.layouts, orderedIds);

            // Reload to apply new order
            this.loadLayouts();

            logger.info('Updated layout order');
            return true;
        } catch (error) {
            logger.error(`Error setting layout order: ${error}`);
            return false;
        }
    }

    /**
     * Update current layout's layout with new zones
     * Used by TemplatePicker to apply templates to the active layout
     * @param {Object} layout - Layout object with zones array
     * @returns {boolean} True if updated successfully
     */
    updateCurrentLayout(layout) {
        try {
            if (!this._currentLayout) {
                logger.error('No current layout to update');
                return false;
            }

            // Update current layout's zones
            const updatedLayout = {
                id: this._currentLayout.id,
                name: layout.name || this._currentLayout.name,
                zones: layout.zones,
            };

            // Validate the updated layout
            if (!this._validateLayout(updatedLayout)) {
                logger.error('Invalid layout structure');
                return false;
            }

            // Save the updated layout
            if (this.saveLayout(updatedLayout)) {
                logger.info(`Updated layout for layout '${this._currentLayout.id}'`);

                // Update in-memory current layout reference
                this._currentLayout = this._layouts.find(p => p.id === this._currentLayout.id);

                // Reset zone index to first zone
                this._currentZoneIndex = 0;
                this._saveState();

                return true;
            }

            return false;
        } catch (error) {
            logger.error(`Error in updateCurrentLayout: ${error}`);
            return false;
        }
    }

    /**
     * Get all layouts in custom order
     * @returns {Array} Layouts sorted by custom order
     */
    getAllLayoutsOrdered() {
        return this._layouts; // Already ordered by _applyLayoutOrder()
    }

    /**
     * Register a layout temporarily in memory (not persisted to disk)
     * Used for template-derived layouts that shouldn't clutter custom layouts
     *
     * @param {Object} layout - The layout to register
     * @returns {boolean} True if registered successfully
     */
    registerLayoutTemporary(layout) {
        // Validate layout structure
        if (!this._validateLayout(layout)) {
            logger.error('Cannot register invalid layout');
            return false;
        }

        // Check if already registered
        const existingIndex = this._layouts.findIndex(l => l.id === layout.id);
        if (existingIndex >= 0) {
            // Update existing entry
            this._layouts[existingIndex] = layout;
            logger.debug(`Updated temporary layout: ${layout.id}`);
        } else {
            // Add to in-memory array only (not saved to disk)
            this._layouts.push(layout);
            logger.info(`Registered temporary layout: ${layout.id}`);
        }

        return true;
    }

    /**
     * Clean up resources
     */
    destroy() {
        // Clear all references to prevent memory leaks
        this._layouts = [];
        this._currentLayout = null;
        this._currentZoneIndex = 0;
        this._settings = null;
        this._extensionPath = null;
        this._spatialStateManager = null;
    }
}
