/**
 * NotificationManager - Temporal notifications for system messages
 *
 * Displays notifications at the top-center of the screen (standard GNOME position)
 * for system messages like startup, conflicts, and auto-fix results.
 *
 * Design: [Icon] | Message layout
 * - Zoned icon on the left
 * - Vertical separator line
 * - Message text on the right
 * - Auto-dismisses after duration
 * - No user interaction required
 */

import GLib from '@girs/glib-2.0';
import Gio from '@girs/gio-2.0';
import St from '@girs/st-14';
import Clutter from '@girs/clutter-14';
import Pango from '@girs/pango-1.0';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {createLogger} from '../utils/debug.js';

const logger = createLogger('NotificationManager');

// Extension type placeholder
type Extension = {
    path: string;
};

export class NotificationManager {
    private _extension: Extension;
    private _notification: St.BoxLayout | null;
    private _timeoutId: number | null;

    constructor(extension: Extension) {
        this._extension = extension;
        this._notification = null;
        this._timeoutId = null;
    }

    /**
     * Show a notification with [Icon] | Message layout
     *
     * @param message - Notification message
     * @param duration - Duration to show notification in milliseconds (default: 2000)
     */
    show(message: string, duration: number = 2000): void {
        // Remove existing notification first
        this._hide();

        try {
            // Create horizontal container for [Icon] | Message layout
            this._notification = new St.BoxLayout({
                style_class: 'notification',
                vertical: false,
                style: 'background-color: rgba(40, 40, 40, 0.95); ' +
                       'border-radius: 8px; ' +
                       'padding: 12px 16px; ' +
                       'spacing: 12px; ' +
                       'min-width: 300px; ' +
                       'max-width: 600px;',
                x_align: Clutter.ActorAlign.CENTER,
                x_expand: false,
            });

            // Add Zoned icon on the left
            try {
                const iconPath = this._extension.path + '/icons/zoned-watermark.svg';
                const iconFile = Gio.File.new_for_path(iconPath);

                if (iconFile.query_exists(null)) {
                    const icon = new St.Icon({
                        gicon: Gio.icon_new_for_string(iconPath),
                        icon_size: 36,
                    });
                    this._notification.add_child(icon);
                }
            } catch (iconError) {
                logger.debug(`Icon not loaded: ${iconError}`);
            }

            // Add vertical separator
            const separator = new St.Widget({
                style: 'width: 1px; ' +
                       'background-color: rgba(255, 255, 255, 0.3); ' +
                       'margin: 0px;',
            });
            this._notification.add_child(separator);

            // Add message label with text wrapping
            const messageLabel = new St.Label({
                text: message,
                style: 'color: #ffffff;',
                y_align: Clutter.ActorAlign.CENTER,
            });
            messageLabel.clutter_text.line_wrap = true;
            messageLabel.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
            messageLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            this._notification.add_child(messageLabel);

            // Add to UI at top-center
            (Main.layoutManager as any).uiGroup.add_child(this._notification);

            // Wait for allocation then position (width won't be available until allocated)
            const allocationId = this._notification.connect('notify::allocation', () => {
                this._notification?.disconnect(allocationId);

                // Position at top-center of current monitor (below panel)
                const monitor = (Main.layoutManager as any).currentMonitor;
                const panel = (Main.layoutManager as any).panelBox;

                this._notification?.set_position(
                    monitor.x + (monitor.width - this._notification.width) / 2,
                    monitor.y + panel.height + 10,  // 10px below top panel
                );
            });

            // Fade in
            this._notification.opacity = 0;
            (this._notification as any).ease({
                opacity: 255,
                duration: 150,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });

            // Auto-hide after duration
            this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, duration, () => {
                this._hide();
                this._timeoutId = null;
                return GLib.SOURCE_REMOVE;
            });

            logger.debug(`Notification shown: ${message}`);
        } catch (error) {
            logger.error(`Error showing notification: ${error}`);
        }
    }

    /**
     * Hide the notification
     * @private
     */
    private _hide(): void {
        // Clear timeout
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }

        // Remove notification with fade out
        if (this._notification) {
            (this._notification as any).ease({
                opacity: 0,
                duration: 150,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    if (this._notification) {
                        (Main.layoutManager as any).uiGroup.remove_child(this._notification);
                        this._notification.destroy();
                        this._notification = null;
                    }
                },
            });
        }
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        this._hide();
    }
}
