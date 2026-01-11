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

import Gio from '@girs/gio-2.0';
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
} as const;

export type NotifyCategoryType = typeof NotifyCategory[keyof typeof NotifyCategory];

// Notification style constants
const NotifyStyle = {
    CENTER: 'center',
    SYSTEM: 'system',
    DISABLED: 'disabled',
} as const;

type NotifyStyleType = typeof NotifyStyle[keyof typeof NotifyStyle];

/**
 * Options for notification display
 */
export interface NotifyOptions {
    /** Title for zone overlay (used with zone cycling) */
    title?: string;
    /** Zone index (0-based) for zone cycling */
    zoneIndex?: number;
    /** Total zones for zone cycling */
    totalZones?: number;
    /** Override default duration (milliseconds) */
    duration?: number;
}

/**
 * Extension interface with settings access
 */
interface Extension {
    getSettings(): Gio.Settings;
}

/**
 * ZoneOverlay interface for center notifications
 */
interface ZoneOverlay {
    show(layoutName: string, zoneIndex: number, totalZones: number, duration: number): void;
    showMessage(message: string, duration: number): void;
}

/**
 * NotificationManager interface for system notifications
 */
interface NotificationManager {
    show(message: string, duration: number): void;
}

export class NotificationService {
    private _extension: Extension | null;
    private _settings: Gio.Settings | null;
    private _zoneOverlay: ZoneOverlay | null;
    private _notificationManager: NotificationManager | null;

    /**
     * @param extension - Extension object with settings
     * @param zoneOverlay - ZoneOverlay instance for center notifications
     * @param notificationManager - NotificationManager instance for system notifications
     */
    constructor(
        extension: Extension,
        zoneOverlay: ZoneOverlay | null,
        notificationManager: NotificationManager | null,
    ) {
        this._extension = extension;
        this._settings = extension.getSettings();
        this._zoneOverlay = zoneOverlay;
        this._notificationManager = notificationManager;
    }

    /**
     * Check if notifications are globally enabled
     */
    private _isEnabled(): boolean {
        if (!this._settings) return false;
        return this._settings.get_boolean('notifications-enabled');
    }

    /**
     * Get the configured duration for notifications
     * @returns Duration in milliseconds
     */
    private _getDuration(): number {
        if (!this._settings) return 2000;
        return this._settings.get_int('notification-duration');
    }

    /**
     * Get the notification style for a category
     * @param category - Category from NotifyCategory
     * @returns Style from NotifyStyle
     */
    private _getStyleForCategory(category: NotifyCategoryType): NotifyStyleType {
        if (!this._settings) return NotifyStyle.CENTER;

        const settingsKey = `notify-${category}`;
        try {
            const value = this._settings.get_string(settingsKey);
            return value as NotifyStyleType;
        } catch {
            logger.warn(`Failed to get setting for ${settingsKey}, defaulting to center`);
            return NotifyStyle.CENTER;
        }
    }

    /**
     * Show a notification based on category settings
     *
     * @param category - Category from NotifyCategory
     * @param message - Message to display
     * @param options - Optional parameters
     */
    notify(category: NotifyCategoryType, message: string, options: NotifyOptions = {}): void {
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
     * @param category - Category (usually WINDOW_SNAPPING)
     * @param layoutName - Layout name
     * @param zoneIndex - Zone index (0-based)
     * @param totalZones - Total zones in layout
     */
    notifyZone(
        category: NotifyCategoryType,
        layoutName: string,
        zoneIndex: number,
        totalZones: number,
    ): void {
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
     */
    private _showCenter(message: string, options: NotifyOptions, duration: number): void {
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
     */
    private _showSystem(message: string, duration: number): void {
        if (!this._notificationManager) {
            logger.warn('NotificationManager not available');
            return;
        }
        this._notificationManager.show(message, duration);
    }

    /**
     * Update references (used if managers are re-created)
     */
    updateReferences(zoneOverlay: ZoneOverlay | null, notificationManager: NotificationManager | null): void {
        this._zoneOverlay = zoneOverlay;
        this._notificationManager = notificationManager;
    }

    /**
     * Clean up
     */
    destroy(): void {
        this._extension = null;
        this._settings = null;
        this._zoneOverlay = null;
        this._notificationManager = null;
    }
}
