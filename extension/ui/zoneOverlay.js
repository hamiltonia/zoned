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
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { createLogger } from '../utils/debug.js';

const logger = createLogger('ZoneOverlay');

export class ZoneOverlay {
    constructor(extension) {
        this._extension = extension;
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
            // Create main container with BinLayout for proper stacking
            const container = new St.Widget({
                style_class: 'zone-overlay-container',
                layout_manager: new Clutter.BinLayout(),
                width: 512,
                height: 512
            });

            // Add icon as full background (first child = back layer)
            try {
                const iconPath = this._extension.path + '/icons/zoned-watermark.svg';
                const iconFile = Gio.File.new_for_path(iconPath);
                
                if (iconFile.query_exists(null)) {
                    const backgroundIcon = new St.Icon({
                        gicon: Gio.icon_new_for_string(iconPath),
                        icon_size: 512,
                        opacity: 80,  // Semi-transparent icon background
                        x_align: Clutter.ActorAlign.CENTER,
                        y_align: Clutter.ActorAlign.CENTER,
                        x_expand: true,
                        y_expand: true
                    });
                    
                    container.add_child(backgroundIcon);
                    logger.debug('Background icon added to overlay');
                }
            } catch (iconError) {
                logger.debug(`Background icon not loaded: ${iconError}`);
            }

            // Add content box on top of icon (second child = front layer)
            const contentBox = new St.BoxLayout({
                vertical: true,
                style: 'spacing: 8px; padding: 30px 40px;',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
                y_expand: true
            });

            // Add title if provided (for zone cycling)
            if (titleText) {
                const titleLabel = new St.Label({
                    text: titleText,
                    style: 'font-weight: bold; ' +
                           'color: #ffffff; ' +
                           'text-align: center; ' +
                           'text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);'
                });
                contentBox.add_child(titleLabel);
            }

            // Add message text
            const messageLabel = new St.Label({
                text: messageText,
                style: 'font-weight: normal; ' +
                       'color: #4a90d9; ' +
                       'text-align: center; ' +
                       'text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);'
            });
            contentBox.add_child(messageLabel);

            container.add_child(contentBox);

            this._overlay = container;

            // Add to UI
            Main.uiGroup.add_child(this._overlay);

            // Center on screen
            this._overlay.set_position(
                Math.floor((global.screen_width - this._overlay.width) / 2),
                Math.floor(global.screen_height / 4)  // Top quarter of screen
            );

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
    }
}
