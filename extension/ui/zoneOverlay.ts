/**
 * ZoneOverlay - Visual feedback showing current zone
 *
 * Displays a translucent overlay when cycling zones showing:
 * - Current layout name
 * - Current zone number and total zones
 * - Auto-dismisses after a short duration
 */

import GLib from '@girs/glib-2.0';
import Gio from '@girs/gio-2.0';
import St from '@girs/st-14';
import Clutter from '@girs/clutter-14';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {createLogger} from '../utils/debug.js';

const logger = createLogger('ZoneOverlay');

// Size configurations: small, medium, large
const SIZE_CONFIG = {
    small: {container: 256, icon: 256, titleFont: 14, messageFont: 12, padding: '14px 20px'},
    medium: {container: 384, icon: 384, titleFont: 16, messageFont: 14, padding: '18px 26px'},
    large: {container: 512, icon: 512, titleFont: 18, messageFont: 16, padding: '20px 32px'},
};

type SizeKey = keyof typeof SIZE_CONFIG;

// Extension and Settings type placeholders
type Extension = {
    path: string;
    getSettings(): Settings;
};

type Settings = {
    get_string(key: string): string;
    get_int(key: string): number;
};

export class ZoneOverlay {
    private _extension: Extension | null;
    private _settings: Settings | null;
    private _overlay: St.Widget | null;
    private _timeoutId: number | null;

    constructor(extension: Extension) {
        this._extension = extension;
        this._settings = extension.getSettings();
        this._overlay = null;
        this._timeoutId = null;
    }

    /**
     * Show the zone overlay with current zone information
     *
     * @param layoutName - Name of the current layout
     * @param zoneIndex - Current zone index (0-based)
     * @param totalZones - Total number of zones in layout
     * @param duration - Duration to show overlay in milliseconds (default: 1000)
     */
    show(layoutName: string, zoneIndex: number, totalZones: number, duration: number = 1000): void {
        const layoutText = layoutName;
        const messageText = `Zone ${zoneIndex + 1} of ${totalZones}`;
        this._showNotification(layoutText, messageText, duration);
    }

    /**
     * Show a generic message notification (center-screen)
     *
     * @param message - Message to display
     * @param duration - Duration to show overlay in milliseconds (default: 1000)
     */
    showMessage(message: string, duration: number = 1000): void {
        this._showNotification(null, message, duration);
    }

    /**
     * Create background icon for overlay
     * @private
     */
    private _createBackgroundIcon(config: any, bgOpacity: number): St.Icon | null {
        try {
            const iconPath = (this._extension?.path || '') + '/icons/zoned-watermark.svg';
            const iconFile = Gio.File.new_for_path(iconPath);

            if (!iconFile.query_exists(null)) {
                return null;
            }

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

            logger.debug(`Background icon added with opacity ${iconOpacity}`);
            return backgroundIcon;
        } catch (iconError) {
            logger.debug(`Background icon not loaded: ${iconError}`);
            return null;
        }
    }

    /**
     * Create content box with labels
     * @private
     */
    private _createContentBox(
        config: any,
        bgOpacity: number,
        titleText: string | null,
        messageText: string,
    ): St.BoxLayout {
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

        const messageLabel = new St.Label({
            text: messageText,
            style: `font-size: ${config.messageFont}px; ` +
                   'font-weight: normal; ' +
                   'color: #88c0ff; ' +
                   'text-align: center; ' +
                   'text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.9);',
        });
        contentBox.add_child(messageLabel);

        return contentBox;
    }

    /**
     * Calculate overlay position on screen
     * @private
     */
    private _calculateOverlayPosition(config: any): {x: number; y: number} {
        const monitor = (Main.layoutManager as any).currentMonitor;
        const calcX = Math.floor(monitor.x + (monitor.width - config.container) / 2);
        const targetPillY = Math.floor(monitor.height * 0.50);
        const calcY = Math.floor(monitor.y + targetPillY - (config.container / 2));

        return {x: calcX, y: calcY};
    }

    /**
     * Internal method to display the notification
     * @private
     */
    private _showNotification(titleText: string | null, messageText: string, duration: number): void {
        this._hide();

        try {
            const sizeSetting = this._settings?.get_string('center-notification-size') || 'medium';
            const opacityPercent = this._settings?.get_int('center-notification-opacity') ?? 85;
            const config = SIZE_CONFIG[sizeSetting as SizeKey] || SIZE_CONFIG.medium;
            const bgOpacity = opacityPercent / 100;

            logger.debug(`Overlay settings: size=${sizeSetting}, opacity=${opacityPercent}%`);

            const container = new St.Widget({
                style_class: 'zone-overlay-container',
                layout_manager: new Clutter.BinLayout(),
                width: config.container,
                height: config.container,
            });

            const backgroundIcon = this._createBackgroundIcon(config, bgOpacity);
            if (backgroundIcon) {
                container.add_child(backgroundIcon);
            }

            const contentBox = this._createContentBox(config, bgOpacity, titleText, messageText);
            container.add_child(contentBox);

            this._overlay = container;
            (Main as any).uiGroup.add_child(this._overlay);

            const position = this._calculateOverlayPosition(config);
            this._overlay.set_position(position.x, position.y);

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
    private _hide(): void {
        // Clear timeout
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }

        // Remove overlay
        if (this._overlay) {
            (Main as any).uiGroup.remove_child(this._overlay);
            this._overlay.destroy();
            this._overlay = null;
        }
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        this._hide();

        // Clear references to prevent memory leaks
        this._extension = null;
        this._settings = null;
    }
}
