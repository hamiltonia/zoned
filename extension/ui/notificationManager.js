/**
 * NotificationManager - Displays toast-style notifications
 * 
 * Provides visual feedback for user actions using GNOME Shell's
 * OSD (On-Screen Display) system - the same one used for volume, brightness, etc.
 */

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class NotificationManager {
    constructor() {
        this._label = null;
    }

    /**
     * Display a notification message using on-screen overlay
     * 
     * @param {string} message - The message to display
     * @param {number} duration - Duration in milliseconds (default: 750)
     */
    show(message, duration = 750) {
        try {
            // Destroy any existing notification first
            this.destroy();

            // Create overlay label
            this._label = new St.Label({
                style_class: 'osd-window',
                style: 'font-size: 32px; ' +
                       'padding: 20px 40px; ' +
                       'border-radius: 16px; ' +
                       'background-color: rgba(0, 0, 0, 0.8); ' +
                       'color: white;',
                text: message
            });

            // Center on screen
            Main.layoutManager.uiGroup.add_child(this._label);
            
            const monitor = Main.layoutManager.primaryMonitor;
            this._label.set_position(
                monitor.x + Math.floor((monitor.width - this._label.width) / 2),
                monitor.y + Math.floor(monitor.height * 0.8)
            );

            // Fade in
            this._label.opacity = 0;
            this._label.ease({
                opacity: 255,
                duration: 150,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD
            });

            // Auto-dismiss after duration
            this._timeoutId = setTimeout(() => {
                if (this._label) {
                    this._label.ease({
                        opacity: 0,
                        duration: 150,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                        onComplete: () => this.destroy()
                    });
                }
            }, duration);

            console.log(`[Zoned] Notification shown: ${message}`);
        } catch (error) {
            console.error(`[Zoned] Failed to show notification: ${error}`);
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this._timeoutId) {
            clearTimeout(this._timeoutId);
            this._timeoutId = null;
        }

        if (this._label) {
            Main.layoutManager.uiGroup.remove_child(this._label);
            this._label.destroy();
            this._label = null;
        }
    }
}
