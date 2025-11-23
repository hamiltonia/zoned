/**
 * ZoneOverlay - Visual feedback showing current zone
 * 
 * Displays a translucent overlay when cycling zones showing:
 * - Current profile name
 * - Current zone number and total zones
 * - Auto-dismisses after a short duration
 */

import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class ZoneOverlay {
    constructor() {
        this._overlay = null;
        this._timeoutId = null;
    }

    /**
     * Show the zone overlay with current zone information
     * 
     * @param {string} profileName - Name of the current profile
     * @param {number} zoneIndex - Current zone index (0-based)
     * @param {number} totalZones - Total number of zones in profile
     * @param {number} duration - Duration to show overlay in milliseconds (default: 1000)
     */
    show(profileName, zoneIndex, totalZones, duration = 1000) {
        // Remove existing overlay first
        this._hide();

        try {
            // Create overlay container
            this._overlay = new St.BoxLayout({
                style_class: 'zone-overlay',
                vertical: true,
                style: 'background-color: rgba(40, 40, 40, 0.9); ' +
                       'border-radius: 12px; ' +
                       'padding: 20px 30px; ' +
                       'spacing: 8px;'
            });

            // Profile name label
            const profileLabel = new St.Label({
                text: profileName,
                style: 'font-size: 18px; ' +
                       'font-weight: bold; ' +
                       'color: #ffffff; ' +
                       'text-align: center;'
            });
            this._overlay.add_child(profileLabel);

            // Zone info label
            const zoneLabel = new St.Label({
                text: `Zone ${zoneIndex + 1} of ${totalZones}`,
                style: 'font-size: 24px; ' +
                       'font-weight: normal; ' +
                       'color: #4a90d9; ' +
                       'text-align: center;'
            });
            this._overlay.add_child(zoneLabel);

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

            console.log(`[Zoned] Overlay shown: ${profileName} - Zone ${zoneIndex + 1}/${totalZones}`);
        } catch (error) {
            console.error(`[Zoned] Error showing overlay: ${error}`);
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
