/**
 * ProfileManager - Manages window layout profiles and state
 * 
 * ARCHITECTURE NOTE - Profile vs Layout Model:
 * ============================================
 * 
 * INTERNAL (Code):
 * - PROFILE = Complete data object containing:
 *   - id: Unique identifier
 *   - name: User-visible name
 *   - zones: Array of zone geometry (the LAYOUT data)
 *   - metadata: (future) padding, shortcuts, per-profile settings
 * 
 * - ProfileManager class manages complete profile objects
 * - Profiles are persisted to ~/.config/zoned/profiles.json
 * - GSettings keys use "profile" naming (for backward compatibility)
 * 
 * USER-FACING (UI):
 * - Users see "LAYOUT" everywhere in the UI
 * - "Choose a layout", "Edit layout", "Layout Editor"
 * - LayoutEditor component edits the zones array (geometry portion)
 * - LayoutPicker shows profiles but calls them "layouts"
 * 
 * WHY THIS ARCHITECTURE?
 * 1. Separation of Concerns:
 *    - Layout = Pure geometry data (zones/edges)
 *    - Profile = Complete package (metadata + layout + settings)
 * 
 * 2. User Simplicity:
 *    - Users don't need to understand internal "profiles" concept
 *    - "Layout" matches industry terminology (FancyZones, etc.)
 * 
 * 3. Code Precision:
 *    - Code explicitly manages complete profile objects
 *    - Clear separation between data model and presentation
 * 
 * 4. Future-Proof:
 *    - Easy to add per-profile settings (padding, shortcuts, colors)
 *    - Layout geometry remains pure and reusable
 * 
 * See: memory/development/v1-mvp-roadmap.md for full architecture spec
 * 
 * Responsibilities:
 * - Loading default and user profiles
 * - Managing current profile and zone state
 * - Zone cycling logic
 * - State persistence via GSettings
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { createLogger } from './utils/debug.js';

const logger = createLogger('ProfileManager');

export class ProfileManager {
    /**
     * @param {Gio.Settings} settings - GSettings object for state persistence
     * @param {string} extensionPath - Path to the extension directory
     */
    constructor(settings, extensionPath) {
        this._settings = settings;
        this._extensionPath = extensionPath;
        this._profiles = [];
        this._currentProfile = null;
        this._currentZoneIndex = 0;
    }

    /**
     * Load all profiles (default + user custom)
     * @returns {boolean} True if profiles loaded successfully
     */
    loadProfiles() {
        try {
            // First-run setup: copy defaults to user config if needed
            this._ensureUserProfilesExist();
            
            // Load default profiles from extension
            const defaultProfiles = this._loadDefaultProfiles();
            
            // Load user profiles from config directory
            const userProfiles = this._loadUserProfiles();
            
            // Merge profiles (user profiles override defaults by matching id)
            this._profiles = this._mergeProfiles(defaultProfiles, userProfiles);
            
            // Validate all profiles
            this._profiles = this._profiles.filter(profile => this._validateProfile(profile));
            
            if (this._profiles.length === 0) {
                logger.error('No valid profiles loaded!');
                return false;
            }
            
            // Apply custom ordering if set
            this._applyProfileOrder();
            
            logger.info(`Loaded ${this._profiles.length} profiles`);
            
            // Restore state from GSettings
            this._restoreState();
            
            return true;
        } catch (error) {
            logger.error(`Error loading profiles: ${error}`);
            return false;
        }
    }

    /**
     * Load default profiles from extension directory
     * @private
     */
    _loadDefaultProfiles() {
        try {
            const profilesPath = `${this._extensionPath}/config/default-profiles.json`;
            const file = Gio.File.new_for_path(profilesPath);
            
            if (!file.query_exists(null)) {
                logger.error(`Default profiles file not found: ${profilesPath}`);
                return [];
            }
            
            const [success, contents] = file.load_contents(null);
            if (!success) {
                logger.error('Failed to read default profiles file');
                return [];
            }
            
            const decoder = new TextDecoder('utf-8');
            const jsonString = decoder.decode(contents);
            const data = JSON.parse(jsonString);
            
            logger.info(`Loaded ${data.profiles.length} default profiles`);
            return data.profiles;
        } catch (error) {
            logger.error(`Error loading default profiles: ${error}`);
            return [];
        }
    }

    /**
     * Load user-defined profiles from ~/.config/zoned/profiles.json
     * @private
     */
    _loadUserProfiles() {
        try {
            const configDir = GLib.get_user_config_dir();
            const profilesPath = `${configDir}/zoned/profiles.json`;
            const file = Gio.File.new_for_path(profilesPath);
            
            if (!file.query_exists(null)) {
                logger.info('No user profiles found (this is okay)');
                return [];
            }
            
            const [success, contents] = file.load_contents(null);
            if (!success) {
                logger.warn('Failed to read user profiles file');
                return [];
            }
            
            const decoder = new TextDecoder('utf-8');
            const jsonString = decoder.decode(contents);
            const data = JSON.parse(jsonString);
            
            logger.info(`Loaded ${data.profiles.length} user profiles`);
            return data.profiles;
        } catch (error) {
            logger.warn(`Error loading user profiles: ${error}`);
            return [];
        }
    }

    /**
     * Merge user profiles with default profiles
     * User profiles override defaults if they have matching IDs
     * @private
     */
    _mergeProfiles(defaultProfiles, userProfiles) {
        const merged = [...defaultProfiles];
        
        userProfiles.forEach(userProfile => {
            const existingIndex = merged.findIndex(p => p.id === userProfile.id);
            if (existingIndex >= 0) {
                // Override existing profile
                merged[existingIndex] = userProfile;
                logger.debug(`User profile '${userProfile.id}' overrides default`);
            } else {
                // Add new user profile
                merged.push(userProfile);
                logger.debug(`Added user profile '${userProfile.id}'`);
            }
        });
        
        return merged;
    }

    /**
     * Validate a profile structure
     * @private
     */
    _validateProfile(profile) {
        if (!profile.id || typeof profile.id !== 'string') {
            logger.warn('Profile missing valid id:', profile);
            return false;
        }
        
        if (!profile.name || typeof profile.name !== 'string') {
            logger.warn(`Profile '${profile.id}' missing valid name`);
            return false;
        }
        
        if (!Array.isArray(profile.zones) || profile.zones.length === 0) {
            logger.warn(`Profile '${profile.id}' missing valid zones array`);
            return false;
        }
        
        // Validate each zone
        for (let i = 0; i < profile.zones.length; i++) {
            const zone = profile.zones[i];
            if (typeof zone.x !== 'number' || typeof zone.y !== 'number' ||
                typeof zone.w !== 'number' || typeof zone.h !== 'number') {
                logger.warn(`Profile '${profile.id}' zone ${i} has invalid coordinates`);
                return false;
            }
            
            // Check ranges (0-1)
            if (zone.x < 0 || zone.x > 1 || zone.y < 0 || zone.y > 1 ||
                zone.w < 0 || zone.w > 1 || zone.h < 0 || zone.h > 1) {
                logger.warn(`Profile '${profile.id}' zone ${i} has out-of-range coordinates`);
                return false;
            }
        }
        
        return true;
    }

    /**
     * Get the currently active profile
     * @returns {Object|null} The current profile
     */
    getCurrentProfile() {
        return this._currentProfile;
    }

    /**
     * Get the current zone within the active profile
     * @returns {Object|null} The current zone
     */
    getCurrentZone() {
        if (!this._currentProfile || !this._currentProfile.zones) {
            return null;
        }
        
        return this._currentProfile.zones[this._currentZoneIndex];
    }

    /**
     * Get current zone index
     * @returns {number} The current zone index
     */
    getCurrentZoneIndex() {
        return this._currentZoneIndex;
    }

    /**
     * Set the active profile by ID
     * @param {string} profileId - The profile ID to activate
     * @returns {boolean} True if profile was found and set
     */
    setProfile(profileId) {
        const profile = this._profiles.find(p => p.id === profileId);
        
        if (!profile) {
            logger.warn(`Profile not found: ${profileId}`);
            return false;
        }
        
        this._currentProfile = profile;
        this._currentZoneIndex = 0; // Reset to first zone when changing profiles
        
        logger.info(`Switched to profile: ${profile.name} (${profile.id})`);
        
        this._saveState();
        return true;
    }

    /**
     * Set the active profile by ID with notification
     * This is the preferred method for UI-triggered profile changes
     * @param {string} profileId - The profile ID to activate
     * @param {ZoneOverlay} zoneOverlay - Zone overlay instance for center-screen notification
     * @returns {boolean} True if profile was found and set
     */
    setProfileWithNotification(profileId, zoneOverlay) {
        logger.debug(`setProfileWithNotification called with profileId: ${profileId}, zoneOverlay: ${zoneOverlay ? 'present' : 'NULL'}`);
        
        const profile = this._profiles.find(p => p.id === profileId);
        
        if (!profile) {
            logger.warn(`Profile not found: ${profileId}`);
            return false;
        }
        
        this._currentProfile = profile;
        this._currentZoneIndex = 0; // Reset to first zone when changing profiles
        
        logger.info(`Switched to profile: ${profile.name} (${profile.id})`);
        
        this._saveState();
        
        // Show center-screen notification for user action
        logger.debug(`About to show zone overlay with message: "Switched to: ${profile.name}"`);
        if (zoneOverlay) {
            zoneOverlay.showMessage(`Switched to: ${profile.name}`);
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
        if (!this._currentProfile || !this._currentProfile.zones) {
            logger.warn('No current profile to cycle zones');
            return null;
        }
        
        const numZones = this._currentProfile.zones.length;
        
        // Calculate new zone index with wraparound
        this._currentZoneIndex = (this._currentZoneIndex + direction + numZones) % numZones;
        
        logger.info(`Cycled to zone ${this._currentZoneIndex + 1}/${numZones}`);
        
        this._saveState();
        return this.getCurrentZone();
    }

    /**
     * Get all available profiles
     * @returns {Array} Array of all profiles
     */
    getAllProfiles() {
        return this._profiles;
    }

    /**
     * Save current state to GSettings
     * @private
     */
    _saveState() {
        if (this._currentProfile) {
            this._settings.set_string('current-profile-id', this._currentProfile.id);
            this._settings.set_int('current-zone-index', this._currentZoneIndex);
            logger.debug(`State saved: ${this._currentProfile.id}, zone ${this._currentZoneIndex}`);
        }
    }

    /**
     * Restore state from GSettings
     * @private
     */
    _restoreState() {
        const savedProfileId = this._settings.get_string('current-profile-id');
        const savedZoneIndex = this._settings.get_int('current-zone-index');
        
        // Try to restore saved profile
        if (savedProfileId && this.setProfile(savedProfileId)) {
            // Validate zone index
            if (this._currentProfile && savedZoneIndex >= 0 && 
                savedZoneIndex < this._currentProfile.zones.length) {
                this._currentZoneIndex = savedZoneIndex;
                logger.info(`Restored state: ${savedProfileId}, zone ${savedZoneIndex}`);
            }
        } else {
            // Fall back to first profile
            if (this._profiles.length > 0) {
                this._currentProfile = this._profiles[0];
                this._currentZoneIndex = 0;
                logger.info(`Using default profile: ${this._currentProfile.id}`);
                this._saveState();
            }
        }
    }

    /**
     * Ensure user profiles directory and file exist (first-run setup)
     * @private
     */
    _ensureUserProfilesExist() {
        try {
            const configDir = GLib.get_user_config_dir();
            const zonedDir = `${configDir}/zoned`;
            const profilesPath = `${zonedDir}/profiles.json`;
            
            // Check if profiles.json already exists
            const file = Gio.File.new_for_path(profilesPath);
            if (file.query_exists(null)) {
                logger.debug('User profiles already exist');
                return;
            }
            
            // Create zoned directory if needed
            const dir = Gio.File.new_for_path(zonedDir);
            if (!dir.query_exists(null)) {
                dir.make_directory_with_parents(null);
                logger.info('Created user config directory');
            }
            
            // Copy default profiles to user config
            const defaultProfiles = this._loadDefaultProfiles();
            const data = {
                profiles: defaultProfiles,
                profile_order: []
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
            
            logger.info('First-run: Copied default profiles to user config');
        } catch (error) {
            logger.error(`Error ensuring user profiles exist: ${error}`);
        }
    }

    /**
     * Apply custom profile ordering from GSettings
     * @private
     */
    _applyProfileOrder() {
        const customOrder = this._settings.get_strv('profile-order');
        
        if (!customOrder || customOrder.length === 0) {
            logger.debug('No custom profile order set');
            return;
        }
        
        // Reorder profiles based on custom order
        const ordered = [];
        const remaining = [...this._profiles];
        
        customOrder.forEach(id => {
            const index = remaining.findIndex(p => p.id === id);
            if (index >= 0) {
                ordered.push(remaining[index]);
                remaining.splice(index, 1);
            }
        });
        
        // Append any profiles not in order list
        this._profiles = [...ordered, ...remaining];
        
        logger.debug(`Applied custom profile order (${customOrder.length} ordered)`);
    }

    /**
     * Get user profiles file path
     * @private
     */
    _getUserProfilesPath() {
        const configDir = GLib.get_user_config_dir();
        return `${configDir}/zoned/profiles.json`;
    }

    /**
     * Load user profiles data structure (with profile_order)
     * @private
     */
    _loadUserProfilesData() {
        try {
            const profilesPath = this._getUserProfilesPath();
            const file = Gio.File.new_for_path(profilesPath);
            
            if (!file.query_exists(null)) {
                return { profiles: [], profile_order: [] };
            }
            
            const [success, contents] = file.load_contents(null);
            if (!success) {
                return { profiles: [], profile_order: [] };
            }
            
            const decoder = new TextDecoder('utf-8');
            const jsonString = decoder.decode(contents);
            return JSON.parse(jsonString);
        } catch (error) {
            logger.error(`Error loading user profiles data: ${error}`);
            return { profiles: [], profile_order: [] };
        }
    }

    /**
     * Save user profiles to disk
     * @private
     */
    _saveUserProfiles(profiles, profileOrder = null) {
        try {
            const profilesPath = this._getUserProfilesPath();
            const file = Gio.File.new_for_path(profilesPath);
            
            // Use provided order or get from GSettings
            const order = profileOrder !== null ? profileOrder : this._settings.get_strv('profile-order');
            
            const data = {
                profiles: profiles,
                profile_order: order
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
            
            logger.info(`Saved ${profiles.length} user profiles`);
            return true;
        } catch (error) {
            logger.error(`Error saving user profiles: ${error}`);
            return false;
        }
    }

    /**
     * Create backup of user profiles
     * @private
     */
    _backupUserProfiles() {
        try {
            const profilesPath = this._getUserProfilesPath();
            const backupPath = `${profilesPath}.backup`;
            
            const sourceFile = Gio.File.new_for_path(profilesPath);
            const destFile = Gio.File.new_for_path(backupPath);
            
            if (sourceFile.query_exists(null)) {
                sourceFile.copy(destFile, Gio.FileCopyFlags.OVERWRITE, null, null);
                logger.info('Created backup of user profiles');
                return true;
            }
            
            return false;
        } catch (error) {
            logger.error(`Error backing up user profiles: ${error}`);
            return false;
        }
    }

    /**
     * Generate a unique profile ID
     * @private
     */
    _generateUniqueId() {
        const timestamp = Date.now();
        return `profile-${timestamp}`;
    }

    /**
     * Save a profile to user config
     * @param {Object} profile - The profile to save
     * @returns {boolean} True if saved successfully
     */
    saveProfile(profile) {
        try {
            // Validate profile structure
            if (!this._validateProfile(profile)) {
                logger.error('Cannot save invalid profile');
                return false;
            }
            
            // Load current user profiles
            const data = this._loadUserProfilesData();
            
            // Find if profile already exists
            const existingIndex = data.profiles.findIndex(p => p.id === profile.id);
            
            if (existingIndex >= 0) {
                // Update existing profile
                data.profiles[existingIndex] = profile;
                logger.info(`Updated profile '${profile.id}'`);
            } else {
                // Add new profile
                data.profiles.push(profile);
                logger.info(`Added new profile '${profile.id}'`);
            }
            
            // Save to disk
            if (this._saveUserProfiles(data.profiles, data.profile_order)) {
                // Reload profiles to refresh in-memory state
                this.loadProfiles();
                return true;
            }
            
            return false;
        } catch (error) {
            logger.error(`Error in saveProfile: ${error}`);
            return false;
        }
    }

    /**
     * Delete a profile from user config
     * @param {string} profileId - The profile ID to delete
     * @returns {boolean} True if deleted successfully
     */
    deleteProfile(profileId) {
        try {
            // Create backup first
            this._backupUserProfiles();
            
            // Load current user profiles
            const data = this._loadUserProfilesData();
            
            // Find profile
            const index = data.profiles.findIndex(p => p.id === profileId);
            
            if (index < 0) {
                logger.warn(`Profile '${profileId}' not found in user profiles`);
                return false;
            }
            
            // Remove profile
            data.profiles.splice(index, 1);
            
            // Remove from order if present
            const orderIndex = data.profile_order.indexOf(profileId);
            if (orderIndex >= 0) {
                data.profile_order.splice(orderIndex, 1);
            }
            
            // Save to disk
            if (this._saveUserProfiles(data.profiles, data.profile_order)) {
                logger.info(`Deleted profile '${profileId}'`);
                
                // Update GSettings order
                this._settings.set_strv('profile-order', data.profile_order);
                
                // Reload profiles
                this.loadProfiles();
                return true;
            }
            
            return false;
        } catch (error) {
            logger.error(`Error in deleteProfile: ${error}`);
            return false;
        }
    }

    /**
     * Duplicate a profile
     * @param {string} profileId - The profile ID to duplicate
     * @param {string} newName - Name for the new profile
     * @returns {Object|null} The new profile if successful, null otherwise
     */
    duplicateProfile(profileId, newName) {
        try {
            // Find source profile
            const sourceProfile = this._profiles.find(p => p.id === profileId);
            
            if (!sourceProfile) {
                logger.error(`Profile '${profileId}' not found`);
                return null;
            }
            
            // Create copy with new ID and name
            const newProfile = {
                id: this._generateUniqueId(),
                name: newName,
                zones: JSON.parse(JSON.stringify(sourceProfile.zones)) // Deep copy
            };
            
            // Save the new profile
            if (this.saveProfile(newProfile)) {
                logger.info(`Duplicated profile '${profileId}' as '${newProfile.id}'`);
                return newProfile;
            }
            
            return null;
        } catch (error) {
            logger.error(`Error in duplicateProfile: ${error}`);
            return null;
        }
    }

    /**
     * Reset all profiles to extension defaults
     * @returns {boolean} True if reset successfully
     */
    resetToDefaults() {
        try {
            // Create backup first
            this._backupUserProfiles();
            
            // Load default profiles
            const defaultProfiles = this._loadDefaultProfiles();
            
            // Save as user profiles with empty order
            if (this._saveUserProfiles(defaultProfiles, [])) {
                // Clear custom order in GSettings
                this._settings.set_strv('profile-order', []);
                
                logger.info('Reset all profiles to defaults');
                
                // Reload profiles
                this.loadProfiles();
                return true;
            }
            
            return false;
        } catch (error) {
            logger.error(`Error in resetToDefaults: ${error}`);
            return false;
        }
    }

    /**
     * Get custom profile order
     * @returns {Array} Array of profile IDs in custom order
     */
    getProfileOrder() {
        return this._settings.get_strv('profile-order');
    }

    /**
     * Set custom profile order
     * @param {Array} orderedIds - Array of profile IDs in desired order
     * @returns {boolean} True if saved successfully
     */
    setProfileOrder(orderedIds) {
        try {
            // Update GSettings
            this._settings.set_strv('profile-order', orderedIds);
            
            // Also update user profiles file
            const data = this._loadUserProfilesData();
            this._saveUserProfiles(data.profiles, orderedIds);
            
            // Reload to apply new order
            this.loadProfiles();
            
            logger.info('Updated profile order');
            return true;
        } catch (error) {
            logger.error(`Error setting profile order: ${error}`);
            return false;
        }
    }

    /**
     * Update current profile's layout with new zones
     * Used by LayoutPicker to apply templates to the active profile
     * @param {Object} layout - Layout object with zones array
     * @returns {boolean} True if updated successfully
     */
    updateCurrentLayout(layout) {
        try {
            if (!this._currentProfile) {
                logger.error('No current profile to update');
                return false;
            }

            // Update current profile's zones
            const updatedProfile = {
                id: this._currentProfile.id,
                name: layout.name || this._currentProfile.name,
                zones: layout.zones
            };

            // Validate the updated profile
            if (!this._validateProfile(updatedProfile)) {
                logger.error('Invalid layout structure');
                return false;
            }

            // Save the updated profile
            if (this.saveProfile(updatedProfile)) {
                logger.info(`Updated layout for profile '${this._currentProfile.id}'`);
                
                // Update in-memory current profile reference
                this._currentProfile = this._profiles.find(p => p.id === this._currentProfile.id);
                
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
     * Get all profiles in custom order
     * @returns {Array} Profiles sorted by custom order
     */
    getAllProfilesOrdered() {
        return this._profiles; // Already ordered by _applyProfileOrder()
    }

    /**
     * Clean up resources
     */
    destroy() {
        this._profiles = [];
        this._currentProfile = null;
        this._currentZoneIndex = 0;
    }
}
