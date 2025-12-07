/**
 * LayoutPreviewBackground - Full-screen layout zone preview
 * 
 * Renders a non-interactive preview of zone rectangles behind modal dialogs.
 * Used by LayoutSwitcher and LayoutSettingsDialog to show a live preview
 * of the selected/hovered layout.
 * 
 * Features:
 * - Full-screen zone rectangles with accent-colored borders
 * - Zone numbers displayed in each zone
 * - No edge grab handles (read-only preview)
 * - Click anywhere to dismiss (passed through to callback)
 * - Fast fade transitions between layouts
 * 
 * Similar to ZoneEditor visuals but completely non-interactive.
 */

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { createLogger } from '../utils/debug.js';
import { ThemeManager } from '../utils/theme.js';

const logger = createLogger('LayoutPreviewBackground');

// Fast fade duration in milliseconds (for polished transitions)
const FADE_DURATION_MS = 100;

export class LayoutPreviewBackground {
    /**
     * Create a new layout preview background
     * @param {Gio.Settings} settings - Extension settings instance
     * @param {Function} onBackgroundClick - Callback when background is clicked (to dismiss dialog)
     */
    constructor(settings, onBackgroundClick) {
        this._settings = settings;
        this._themeManager = new ThemeManager(settings);
        this._onBackgroundClick = onBackgroundClick;
        
        this._overlay = null;
        this._zoneActors = [];
        this._currentLayout = null;
        this._visible = false;
        
        logger.debug('LayoutPreviewBackground created');
    }

    /**
     * Show the preview background
     * @param {Object} layout - Initial layout to display (optional)
     */
    show(layout = null) {
        if (this._visible) {
            logger.warn('LayoutPreviewBackground already visible');
            return;
        }

        const monitor = Main.layoutManager.currentMonitor;
        const colors = this._themeManager.getColors();

        // Create full-screen overlay
        this._overlay = new St.Widget({
            reactive: true,
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height,
            style: `background-color: ${colors.modalOverlay};`
        });

        // Click on overlay to dismiss
        this._overlay.connect('button-press-event', (actor, event) => {
            if (this._onBackgroundClick) {
                this._onBackgroundClick();
            }
            return Clutter.EVENT_STOP;
        });

        // Add to uiGroup (below any dialogs that get added later)
        Main.uiGroup.add_child(this._overlay);
        this._visible = true;

        // Set initial layout if provided
        if (layout) {
            this.setLayout(layout);
        }

        logger.debug('LayoutPreviewBackground shown');
    }

    /**
     * Hide and destroy the preview background
     */
    hide() {
        if (!this._visible || !this._overlay) {
            return;
        }

        this._clearZones();
        
        Main.uiGroup.remove_child(this._overlay);
        this._overlay.destroy();
        this._overlay = null;
        this._visible = false;
        this._currentLayout = null;

        logger.debug('LayoutPreviewBackground hidden');
    }

    /**
     * Update the displayed layout with a fast fade transition
     * @param {Object} layout - Layout to display (with zones array)
     */
    setLayout(layout) {
        if (!this._visible || !this._overlay) {
            logger.warn('Cannot setLayout - preview not visible');
            return;
        }

        // Skip if same layout
        if (this._currentLayout && layout && this._currentLayout.id === layout.id) {
            return;
        }

        this._currentLayout = layout;

        // Fade out existing zones
        if (this._zoneActors.length > 0) {
            this._fadeOutZones(() => {
                this._clearZones();
                if (layout && layout.zones) {
                    this._createZones(layout.zones);
                    this._fadeInZones();
                }
            });
        } else {
            // No existing zones, just create new ones
            this._clearZones();
            if (layout && layout.zones) {
                this._createZones(layout.zones);
                this._fadeInZones();
            }
        }
    }

    /**
     * Set layout immediately without fade (for initial display or performance)
     * @param {Object} layout - Layout to display
     */
    setLayoutImmediate(layout) {
        if (!this._visible || !this._overlay) {
            return;
        }

        this._currentLayout = layout;
        this._clearZones();

        if (layout && layout.zones) {
            this._createZones(layout.zones);
            // Set full opacity immediately
            this._zoneActors.forEach(actor => {
                actor.opacity = 255;
            });
        }
    }

    /**
     * Create zone actors for the given zones
     * @param {Array} zones - Array of zone definitions {x, y, w, h, name}
     * @private
     */
    _createZones(zones) {
        const monitor = Main.layoutManager.currentMonitor;
        const colors = this._themeManager.getColors();
        const accentHex = colors.accentHex;
        const accentFill = colors.accentRGBA(0.25);

        zones.forEach((zone, index) => {
            // Calculate pixel coordinates
            const x = monitor.x + (zone.x * monitor.width);
            const y = monitor.y + (zone.y * monitor.height);
            const width = zone.w * monitor.width;
            const height = zone.h * monitor.height;

            // Gap between zones for visual separation
            const gap = 3;

            // Create zone widget
            const zoneActor = new St.Widget({
                x: x + gap,
                y: y + gap,
                width: width - (gap * 2),
                height: height - (gap * 2),
                style: `
                    background-color: ${accentFill};
                    border: 3px solid ${accentHex};
                    border-radius: 4px;
                `,
                opacity: 0  // Start invisible for fade-in
            });

            // Zone number label (large, centered)
            const label = new St.Label({
                text: `${index + 1}`,
                style: `
                    font-size: 72pt;
                    color: white;
                    font-weight: bold;
                    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
                `,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
                y_expand: true
            });

            // Use a Bin to center the label
            const labelBin = new St.Bin({
                x_expand: true,
                y_expand: true,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                child: label
            });
            
            // Add label to zone
            zoneActor.add_child(labelBin);
            labelBin.set_position(0, 0);
            labelBin.set_size(width - (gap * 2), height - (gap * 2));

            this._overlay.add_child(zoneActor);
            this._zoneActors.push(zoneActor);
        });

        logger.debug(`Created ${zones.length} zone preview actors`);
    }

    /**
     * Clear all zone actors
     * @private
     */
    _clearZones() {
        this._zoneActors.forEach(actor => {
            if (actor.get_parent() === this._overlay) {
                this._overlay.remove_child(actor);
            }
            actor.destroy();
        });
        this._zoneActors = [];
    }

    /**
     * Fade in zone actors
     * @private
     */
    _fadeInZones() {
        this._zoneActors.forEach(actor => {
            actor.ease({
                opacity: 255,
                duration: FADE_DURATION_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD
            });
        });
    }

    /**
     * Fade out zone actors then call callback
     * @param {Function} callback - Called when fade completes
     * @private
     */
    _fadeOutZones(callback) {
        if (this._zoneActors.length === 0) {
            callback();
            return;
        }

        let completed = 0;
        const total = this._zoneActors.length;

        this._zoneActors.forEach(actor => {
            actor.ease({
                opacity: 0,
                duration: FADE_DURATION_MS / 2,  // Fade out faster
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => {
                    completed++;
                    if (completed === total) {
                        callback();
                    }
                }
            });
        });
    }

    /**
     * Bring the overlay to the front (below modal dialog)
     * Used when dialog order changes
     */
    raise() {
        if (this._overlay && this._overlay.get_parent()) {
            // Keep at bottom of uiGroup children
            const parent = this._overlay.get_parent();
            parent.set_child_below_sibling(this._overlay, null);
        }
    }

    /**
     * Get whether the preview is currently visible
     * @returns {boolean}
     */
    isVisible() {
        return this._visible;
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.hide();
        logger.debug('LayoutPreviewBackground destroyed');
    }
}
