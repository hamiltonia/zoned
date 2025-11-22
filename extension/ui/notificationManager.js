/**
 * NotificationManager - Displays toast-style notifications
 * 
 * Provides visual feedback for user actions using GNOME Shell's
 * notification system. Notifications auto-dismiss after a short duration.
 */

import GLib from 'gi://GLib';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class NotificationManager {
    constructor() {
        this._source = null;
        this._notification = null;
        this._timeoutId = null;
    }

    /**
     * Display a notification message
     * 
     * @param {string} message - The message to display
     * @param {number} duration - Duration in milliseconds (default: 750)
     */
    show(message, duration = 750) {
        // Destroy any existing notification first
        this._destroyNotification();

        try {
            // Create a notification source if it doesn't exist
            if (!this._source) {
                this._source = new MessageTray.Source({
                    title: 'ZoneFancy',
                    iconName: 'view-grid-symbolic'
                });
                Main.messageTray.add(this._source);
            }

            // Create and show the notification
            this._notification = new MessageTray.Notification({
                source: this._source,
                title: 'ZoneFancy',
                body: message,
                isTransient: true
            });

            this._source.addNotification(this._notification);

            // Auto-dismiss after duration
            this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, duration, () => {
                this._destroyNotification();
                this._timeoutId = null;
                return GLib.SOURCE_REMOVE;
            });

            console.log(`[ZoneFancy] Notification shown: ${message}`);
        } catch (error) {
            console.error(`[ZoneFancy] Failed to show notification: ${error}`);
        }
    }

    /**
     * Destroy the current notification
     * @private
     */
    _destroyNotification() {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }

        if (this._notification) {
            this._notification.destroy();
            this._notification = null;
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        this._destroyNotification();

        if (this._source) {
            this._source.destroy();
            this._source = null;
        }
    }
}
