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
 * - "Choose a layout", "Edit layout", "Layout Editor"
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
 *    - "Layout" matches industry terminology (FancyZones, etc.)
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
import { createLogger } from './utils/debug.js';
import { TemplateManager } from './templateManager.js';

const logger = createLogger('LayoutManager');

export class LayoutManager {
    /**
     * @param {Gio.Settings} settings - GSettings object for state persistence
     * @param {string} extensionPath - Path to the extension directory
     */
    constructor(settings, extensionPath) {
        this._settings = settings;
        this._extensionPath = extensionPath;
        this._layouts = [];
        this._currentLayout = null;
        this._currentZoneIndex = 0;
    }

    /**
     * Load all layouts (default + user custom)
     * @returns {boolean} True if layouts loaded successfully
     */
    loadLayouts() {
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
    _loadDefaultLayouts() {
        try {
            const layoutsPath = `${this._extensionPath}/config/default-layouts.json`;
            const file = Gio.File.new_for_path(layoutsPath);
            
            if (!file.query_exists(null)) {
                logger.error(`Default layouts file not found: ${layoutsPath}`);
                return [];
            }
            
            const [success, contents] = file.load_contents(null);
            if (!success) {
                logger.error('Failed to read default layouts file');
                return [];
            }
            
            const decoder = new TextDecoder('utf-8');
            const jsonString = decoder.decode(contents);
            const data = JSON.parse(jsonString);
            
            logger.info(`Loaded ${data.layouts.length} default layouts`);
            return data.layouts;
        } catch (error) {
            logger.error(`Error loading default layouts: ${error}`);
            return [];
        }
    }

    /**
     * Load user-defined layouts from ~/.config/zoned/layouts.json
     * @private
     */
    _loadUserLayouts()  {
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
    _mergeLayouts(defaultLayouts, userLayouts) {
        const merged = [...defaultLayouts];
        
        userLayouts.forEach(userLayout => {
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
     * Validate a layout structure
     * @private
     */
    _validateLayout(layout) {
        if (!layout.id || typeof layout.id !== 'string') {
            logger.warn('Layout missing valid id:', layout);
            return false;
        }
        
        if (!layout.name || typeof layout.name !== 'string') {
            logger.warn(`Layout '${layout.id}' missing valid name`);
            return false;
        }
        
        if (!Array.isArray(layout.zones) || layout.zones.length === 0) {
            logger.warn(`Layout '${layout.id}' missing valid zones array`);
            return false;
        }
        
        // Validate each zone
        for (let i = 0; i < layout.zones.length; i++) {
            const zone = layout.zones[i];
            if (typeof zone.x !== 'number' || typeof zone.y !== 'number' ||
                typeof zone.w !== 'number' || typeof zone.h !== 'number') {
                logger.warn(`Layout '${layout.id}' zone ${i} has invalid coordinates`);
                return false;
            }
            
            // Check ranges (0-1)
            if (zone.x < 0 || zone.x > 1 || zone.y < 0 || zone.y > 1 ||
                zone.w < 0 || zone.w > 1 || zone.h < 0 || zone.h > 1) {
                logger.warn(`Layout '${layout.id}' zone ${i} has out-of-range coordinates`);
                return false;
            }
        }
        
        return true;
    }

    /**
     * Get the currently active layout
     * @returns {Object|null} The current layout
     */
    getCurrentLayout() {
        return this._currentLayout;
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
     * @returns {Object|null} The new current zone
     */
    cycleZone(direction) {
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
     * Restore state from GSettings
     * @private
     */
    _restoreState() {
        const savedLayoutId = this._settings.get_string('current-layout-id');
        const savedZoneIndex = this._settings.get_int('current-zone-index');
        
        // Try to restore saved layout from persistent layouts first
        if (savedLayoutId && this.setLayout(savedLayoutId)) {
            // Validate zone index
            if (this._currentLayout && savedZoneIndex >= 0 && 
                savedZoneIndex < this._currentLayout.zones.length) {
                this._currentZoneIndex = savedZoneIndex;
                logger.info(`Restored state: ${savedLayoutId}, zone ${savedZoneIndex}`);
            }
            return;
        }
        
        // If ID starts with "template-", recreate from template
        if (savedLayoutId && savedLayoutId.startsWith('template-')) {
            const templateId = savedLayoutId.replace('template-', '');
            try {
                const templateManager = new TemplateManager();
                const layout = templateManager.createLayoutFromTemplate(templateId);
                if (layout) {
                    this.registerLayoutTemporary(layout);
                    this._currentLayout = layout;
                    this._currentZoneIndex = 0;
                    // Validate zone index
                    if (savedZoneIndex >= 0 && savedZoneIndex < layout.zones.length) {
                        this._currentZoneIndex = savedZoneIndex;
                    }
                    logger.info(`Restored template layout: ${savedLayoutId}, zone ${this._currentZoneIndex}`);
                    return;
                }
            } catch (e) {
                logger.warn(`Failed to restore template '${templateId}': ${e}`);
            }
        }
        
        // Fall back to first layout
        if (this._layouts.length > 0) {
            this._currentLayout = this._layouts[0];
            this._currentZoneIndex = 0;
            logger.info(`Using default layout: ${this._currentLayout.id}`);
            this._saveState();
        }
    }

    /**
     * Ensure user layouts directory and file exist (first-run setup)
     * @private
     */
    _ensureUserLayoutsExist() {
        try {
            const configDir = GLib.get_user_config_dir();
            const zonedDir = `${configDir}/zoned`;
            const layoutsPath = `${zonedDir}/layouts.json`;
            
            // Check if layouts.json already exists
            const file = Gio.File.new_for_path(layoutsPath);
            if (file.query_exists(null)) {
                logger.debug('User layouts already exist');
                return;
            }
            
            // Create zoned directory if needed
            const dir = Gio.File.new_for_path(zonedDir);
            if (!dir.query_exists(null)) {
                dir.make_directory_with_parents(null);
                logger.info('Created user config directory');
            }
            
            // Copy default layouts to user config
            const defaultLayouts = this._loadDefaultLayouts();
            const data = {
                layouts: defaultLayouts,
                layout_order: []
            };
            
            const encoder = new TextEncoder();
            const jsonString = JSON.stringify(data, null, 2);
            const contents = encoder.encode(jsonString);
            
            file.replace_contents(
                contents,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );
            
            logger.info('First-run: Copied default layouts to user config');
        } catch (error) {
            logger.error(`Error ensuring user layouts exist: ${error}`);
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
                return { layouts: [], layout_order: [] };
            }
            
            const [success, contents] = file.load_contents(null);
            if (!success) {
                return { layouts: [], layout_order: [] };
            }
            
            const decoder = new TextDecoder('utf-8');
            const jsonString = decoder.decode(contents);
            return JSON.parse(jsonString);
        } catch (error) {
            logger.error(`Error loading user layouts data: ${error}`);
            return { layouts: [], layout_order: [] };
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
                layout_order: order
            };
            
            const encoder = new TextEncoder();
            const jsonString = JSON.stringify(data, null, 2);
            const contents = encoder.encode(jsonString);
            
            file.replace_contents(
                contents,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
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
                zones: JSON.parse(JSON.stringify(sourceLayout.zones)) // Deep copy
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
                zones: layout.zones
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
        this._layouts = [];
        this._currentLayout = null;
        this._currentZoneIndex = 0;
    }
}
