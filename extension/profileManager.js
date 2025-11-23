/**
 * ProfileManager - Manages window layout profiles and state
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
     * @param {NotificationManager} notificationManager - Notification manager instance
     * @returns {boolean} True if profile was found and set
     */
    setProfileWithNotification(profileId, notificationManager) {
        logger.debug(`setProfileWithNotification called with profileId: ${profileId}, notificationManager: ${notificationManager ? 'present' : 'NULL'}`);
        
        const profile = this._profiles.find(p => p.id === profileId);
        
        if (!profile) {
            logger.warn(`Profile not found: ${profileId}`);
            return false;
        }
        
        this._currentProfile = profile;
        this._currentZoneIndex = 0; // Reset to first zone when changing profiles
        
        logger.info(`Switched to profile: ${profile.name} (${profile.id})`);
        
        this._saveState();
        
        // Show notification using the same system as window snapping
        logger.debug(`About to call notificationManager.show() with message: "Switched to: ${profile.name}"`);
        if (notificationManager) {
            notificationManager.show(`Switched to: ${profile.name}`);
            logger.debug('notificationManager.show() called');
        } else {
            logger.error('notificationManager is NULL - cannot show notification!');
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
     * Clean up resources
     */
    destroy() {
        this._profiles = [];
        this._currentProfile = null;
        this._currentZoneIndex = 0;
    }
}
