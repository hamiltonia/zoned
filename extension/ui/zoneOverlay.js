/**
 * ZoneOverlay - Visual feedback showing current zone
 *
 * Displays a translucent overlay when cycling zones showing:
 * - Current layout name
 * - Current zone number and total zones
 * - Auto-dismisses after a short duration
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {createLogger} from '../utils/debug.js';

const logger = createLogger('ZoneOverlay');

// Size configurations: small, medium, large
const SIZE_CONFIG = {
    small: {container: 256, icon: 256, titleFont: 14, messageFont: 12, padding: '14px 20px'},
    medium: {container: 384, icon: 384, titleFont: 16, messageFont: 14, padding: '18px 26px'},
    large: {container: 512, icon: 512, titleFont: 18, messageFont: 16, padding: '20px 32px'},
};

export class ZoneOverlay {
    constructor(extension) {
        this._extension = extension;
        this._settings = extension.getSettings();
        this._overlay = null;
        this._timeoutId = null;
    }

    /**
     * Show the zone overlay with current zone information
     *
     * @param {string} layoutName - Name of the current layout
     * @param {number} zoneIndex - Current zone index (0-based)
     * @param {number} totalZones - Total number of zones in layout
     * @param {number} duration - Duration to show overlay in milliseconds (default: 1000)
     */
    show(layoutName, zoneIndex, totalZones, duration = 1000) {
        const layoutText = layoutName;
        const messageText = `Zone ${zoneIndex + 1} of ${totalZones}`;
        this._showNotification(layoutText, messageText, duration);
    }

    /**
     * Show a generic message notification (center-screen)
     *
     * @param {string} message - Message to display
     * @param {number} duration - Duration to show overlay in milliseconds (default: 1000)
     */
    showMessage(message, duration = 1000) {
        this._showNotification(null, message, duration);
    }

    /**
     * Internal method to display the notification
     * @private
     */
    _showNotification(titleText, messageText, duration) {
        // Remove existing overlay first
        this._hide();

        try {
            // Get size and opacity settings
            const sizeSetting = this._settings.get_string('center-notification-size');
            const opacityPercent = this._settings.get_int('center-notification-opacity');
            const config = SIZE_CONFIG[sizeSetting] || SIZE_CONFIG.medium;
            const bgOpacity = opacityPercent / 100;

            logger.debug(`Overlay settings: size=${sizeSetting}, opacity=${opacityPercent}%`);

            // Create main container with BinLayout for proper stacking
            const container = new St.Widget({
                style_class: 'zone-overlay-container',
                layout_manager: new Clutter.BinLayout(),
                width: config.container,
                height: config.container,
            });

            // Add icon as full background (first child = back layer)
            try {
                const iconPath = this._extension.path + '/icons/zoned-watermark.svg';
                const iconFile = Gio.File.new_for_path(iconPath);

                if (iconFile.query_exists(null)) {
                    // Icon opacity scales from subtle (30) at 50% to solid (255) at 100%
                    // Formula: 30 + 225 * ((opacity - 0.5) / 0.5) = 30 + 450 * (opacity - 0.5)
                    const iconOpacity = Math.floor(30 + 450 * (bgOpacity - 0.5));
                    const backgroundIcon = new St.Icon({
                        gicon: Gio.icon_new_for_string(iconPath),
                        icon_size: config.icon,
                        opacity: iconOpacity,
                        x_align: Clutter.ActorAlign.CENTER,
                        y_align: Clutter.ActorAlign.CENTER,
                        x_expand: true,
                        y_expand: true,
                    });

                    container.add_child(backgroundIcon);
                    logger.debug(`Background icon added with opacity ${iconOpacity}`);
                }
            } catch (iconError) {
                logger.debug(`Background icon not loaded: ${iconError}`);
            }

            // Add content box on top of icon (second child = front layer)
            // Semi-transparent dark pill background for better readability
            const contentBox = new St.BoxLayout({
                vertical: true,
                style: 'spacing: 12px; ' +
                       `padding: ${config.padding}; ` +
                       `background-color: rgba(30, 30, 30, ${bgOpacity}); ` +
                       'border-radius: 16px;',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
                y_expand: true,
            });

            // Add title if provided (for zone cycling)
            if (titleText) {
                const titleLabel = new St.Label({
                    text: titleText,
                    style: `font-size: ${config.titleFont}px; ` +
                           'font-weight: bold; ' +
                           'color: #ffffff; ' +
                           'text-align: center; ' +
                           'text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.9);',
                });
                contentBox.add_child(titleLabel);
            }

            // Add message text (brighter blue for better contrast)
            const messageLabel = new St.Label({
                text: messageText,
                style: `font-size: ${config.messageFont}px; ` +
                       'font-weight: normal; ' +
                       'color: #88c0ff; ' +
                       'text-align: center; ' +
                       'text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.9);',
            });
            contentBox.add_child(messageLabel);

            container.add_child(contentBox);

            this._overlay = container;

            // Add to UI
            Main.uiGroup.add_child(this._overlay);

            // Position notification with text pill centered at same screen location for all sizes
            // The text pill is centered within the container, so we offset based on container size
            const monitor = Main.layoutManager.currentMonitor;
            const calcX = Math.floor(monitor.x + (monitor.width - config.container) / 2);
            // Target: put pill center at true center of screen (50%)
            // Pill center = container top + (container / 2)
            // So: container top = target - (container / 2)
            const targetPillY = Math.floor(monitor.height * 0.50);  // 50% = true center
            const calcY = Math.floor(monitor.y + targetPillY - (config.container / 2));

            this._overlay.set_position(calcX, calcY);

            // Auto-hide after duration
            this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, duration, () => {
                this._hide();
                this._timeoutId = null;
                return GLib.SOURCE_REMOVE;
            });

            logger.debug(`Overlay shown: ${titleText ? titleText + ' - ' : ''}${messageText}`);
        } catch (error) {
            logger.error(`Error showing overlay: ${error}`);
        }
    }

    /**
     * Hide the overlay
     * @private
     */
    _hide() {
        // Clear timeout
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }

        // Remove overlay
        if (this._overlay) {
            Main.uiGroup.remove_child(this._overlay);
            this._overlay.destroy();
            this._overlay = null;
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        this._hide();

        // Clear references to prevent memory leaks
        this._extension = null;
        this._settings = null;
    }
}
