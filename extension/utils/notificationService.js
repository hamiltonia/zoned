/**
 * NotificationService - Centralized notification routing based on user settings
 *
 * Routes notifications to the appropriate display method (center, system, or disabled)
 * based on user preferences stored in GSettings.
 *
 * Categories:
 * - window-snapping: Zone cycling (Super+Left/Right)
 * - layout-switching: Layout/profile changes via picker, menu, or shortcuts
 * - window-management: Minimize/maximize/restore actions
 * - workspace-changes: Per-space layout display when switching workspaces
 * - startup: Extension enabled notification on startup
 * - conflicts: Keybinding conflict detection alerts
 */

import {createLogger} from './debug.js';

const logger = createLogger('NotificationService');

// Notification category constants
export const NotifyCategory = {
    WINDOW_SNAPPING: 'window-snapping',
    LAYOUT_SWITCHING: 'layout-switching',
    WINDOW_MANAGEMENT: 'window-management',
    WORKSPACE_CHANGES: 'workspace-changes',
    STARTUP: 'startup',
    CONFLICTS: 'conflicts',
};

// Notification style constants
const NotifyStyle = {
    CENTER: 'center',
    SYSTEM: 'system',
    DISABLED: 'disabled',
};

export class NotificationService {
    /**
     * @param {Object} extension - Extension object with settings
     * @param {Object} zoneOverlay - ZoneOverlay instance for center notifications
     * @param {Object} notificationManager - NotificationManager instance for system notifications
     */
    constructor(extension, zoneOverlay, notificationManager) {
        this._extension = extension;
        this._settings = extension.getSettings();
        this._zoneOverlay = zoneOverlay;
        this._notificationManager = notificationManager;
    }

    /**
     * Check if notifications are globally enabled
     * @returns {boolean}
     */
    _isEnabled() {
        return this._settings.get_boolean('notifications-enabled');
    }

    /**
     * Get the configured duration for notifications
     * @returns {number} Duration in milliseconds
     */
    _getDuration() {
        return this._settings.get_int('notification-duration');
    }

    /**
     * Get the notification style for a category
     * @param {string} category - Category from NotifyCategory
     * @returns {string} Style from NotifyStyle
     */
    _getStyleForCategory(category) {
        const settingsKey = `notify-${category}`;
        try {
            return this._settings.get_string(settingsKey);
        } catch {
            logger.warn(`Failed to get setting for ${settingsKey}, defaulting to center`);
            return NotifyStyle.CENTER;
        }
    }

    /**
     * Show a notification based on category settings
     *
     * @param {string} category - Category from NotifyCategory
     * @param {string} message - Message to display
     * @param {Object} options - Optional parameters
     * @param {string} options.title - Title for zone overlay (used with zone cycling)
     * @param {number} options.zoneIndex - Zone index (0-based) for zone cycling
     * @param {number} options.totalZones - Total zones for zone cycling
     * @param {number} options.duration - Override default duration (milliseconds)
     */
    notify(category, message, options = {}) {
        // Check if notifications are globally enabled
        if (!this._isEnabled()) {
            logger.debug(`Notifications disabled globally, skipping: ${message}`);
            return;
        }

        const style = this._getStyleForCategory(category);
        const duration = options.duration || this._getDuration();

        logger.debug(`Notify [${category}] style=${style}: ${message}`);

        if (style === NotifyStyle.DISABLED) {
            logger.debug(`Category ${category} is disabled`);
            return;
        }

        if (style === NotifyStyle.CENTER) {
            this._showCenter(message, options, duration);
        } else if (style === NotifyStyle.SYSTEM) {
            this._showSystem(message, duration);
        }
    }

    /**
     * Show a zone cycling notification (special case with layout name and zone info)
     *
     * @param {string} category - Category (usually WINDOW_SNAPPING)
     * @param {string} layoutName - Layout name
     * @param {number} zoneIndex - Zone index (0-based)
     * @param {number} totalZones - Total zones in layout
     */
    notifyZone(category, layoutName, zoneIndex, totalZones) {
        if (!this._isEnabled()) {
            logger.debug('Notifications disabled globally, skipping zone notification');
            return;
        }

        const style = this._getStyleForCategory(category);
        const duration = this._getDuration();

        logger.debug(`NotifyZone [${category}] style=${style}: ${layoutName} zone ${zoneIndex + 1}/${totalZones}`);

        if (style === NotifyStyle.DISABLED) {
            return;
        }

        if (style === NotifyStyle.CENTER) {
            if (this._zoneOverlay) {
                this._zoneOverlay.show(layoutName, zoneIndex, totalZones, duration);
            }
        } else if (style === NotifyStyle.SYSTEM) {
            if (this._notificationManager) {
                const message = `${layoutName} - Zone ${zoneIndex + 1} of ${totalZones}`;
                this._notificationManager.show(message, duration);
            }
        }
    }

    /**
     * Show center-screen notification (ZoneOverlay)
     * @private
     */
    _showCenter(message, options, duration) {
        if (!this._zoneOverlay) {
            logger.warn('ZoneOverlay not available');
            return;
        }

        if (options.title && options.zoneIndex !== undefined && options.totalZones !== undefined) {
            // Zone cycling notification with title
            this._zoneOverlay.show(options.title, options.zoneIndex, options.totalZones, duration);
        } else {
            // Generic message
            this._zoneOverlay.showMessage(message, duration);
        }
    }

    /**
     * Show system (top-bar) notification (NotificationManager)
     * @private
     */
    _showSystem(message, duration) {
        if (!this._notificationManager) {
            logger.warn('NotificationManager not available');
            return;
        }
        this._notificationManager.show(message, duration);
    }

    /**
     * Update references (used if managers are re-created)
     */
    updateReferences(zoneOverlay, notificationManager) {
        this._zoneOverlay = zoneOverlay;
        this._notificationManager = notificationManager;
    }

    /**
     * Clean up
     */
    destroy() {
        this._extension = null;
        this._settings = null;
        this._zoneOverlay = null;
        this._notificationManager = null;
    }
}
