/**
 * ZoneCanvas - Visual zone editor using Cairo
 * 
 * Provides interactive zone editing with:
 * - Visual rendering of zones
 * - Click to select zones
 * - Selected zone highlighting
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import { createLogger } from '../utils/debug.js';

const logger = createLogger('ZoneCanvas');

export const ZoneCanvas = GObject.registerClass({
    Signals: {
        'zone-selected': { param_types: [GObject.TYPE_INT] }
    }
}, class ZoneCanvas extends GObject.Object {
    /**
     * @param {number} width - Canvas width in pixels
     * @param {number} height - Canvas height in pixels
     */
    _init(width, height) {
        super._init();
        
        this._width = width;
        this._height = height;
        this._zones = [];
        this._selectedIndex = -1;
        this._accentColor = this._getAccentColor();
        
        // Create canvas widget
        this._canvas = new St.DrawingArea({
            width: width,
            height: height,
            style: 'border: 1px solid #444; background-color: #1a1a1a;',
            reactive: true
        });
        
        // Connect repaint handler
        this._canvas.connect('repaint', () => this._onRepaint());
        
        // Connect click handler
        this._canvas.connect('button-press-event', (actor, event) => {
            return this._onCanvasClicked(event);
        });
    }

    /**
     * Get the canvas widget
     * @returns {St.DrawingArea} The canvas widget
     */
    getWidget() {
        return this._canvas;
    }

    /**
     * Set the zones to display
     * @param {Array} zones - Array of zone objects
     */
    setZones(zones) {
        this._zones = zones;
        this._canvas.queue_repaint();
    }

    /**
     * Set the selected zone index
     * @param {number} index - Zone index to select (-1 for none)
     */
    setSelectedZone(index) {
        this._selectedIndex = index;
        this._canvas.queue_repaint();
    }

    /**
     * Get the selected zone index
     * @returns {number} The selected index
     */
    getSelectedZone() {
        return this._selectedIndex;
    }

    /**
     * Handle canvas click
     * @private
     */
    _onCanvasClicked(event) {
        const [x, y] = event.get_coords();
        
        // Get canvas position
        const [canvasX, canvasY] = this._canvas.get_position();
        
        // Calculate relative position
        const relX = x - canvasX;
        const relY = y - canvasY;
        
        // Find which zone was clicked
        const zoneIndex = this._getZoneAtPoint(relX, relY);
        
        if (zoneIndex >= 0) {
            this._selectedIndex = zoneIndex;
            this._canvas.queue_repaint();
            
            // Emit selection changed event
            this.emit('zone-selected', zoneIndex);
            logger.debug(`Zone ${zoneIndex} selected`);
        }
        
        return Clutter.EVENT_STOP;
    }

    /**
     * Find which zone contains the given point
     * @private
     */
    _getZoneAtPoint(x, y) {
        const normX = x / this._width;
        const normY = y / this._height;
        
        for (let i = 0; i < this._zones.length; i++) {
            const zone = this._zones[i];
            if (normX >= zone.x && normX < zone.x + zone.w &&
                normY >= zone.y && normY < zone.y + zone.h) {
                return i;
            }
        }
        
        return -1;
    }

    /**
     * Get GNOME system accent color
     * @private
     */
    _getAccentColor() {
        try {
            const interfaceSettings = new Gio.Settings({
                schema: 'org.gnome.desktop.interface'
            });
            
            const accentColorName = interfaceSettings.get_string('accent-color');
            
            // Map accent color names to RGB values (0-1 range for Cairo)
            const accentColors = {
                'blue': {red: 0.29, green: 0.56, blue: 0.85},
                'teal': {red: 0.18, green: 0.65, blue: 0.65},
                'green': {red: 0.20, green: 0.65, blue: 0.42},
                'yellow': {red: 0.96, green: 0.76, blue: 0.13},
                'orange': {red: 0.96, green: 0.47, blue: 0.00},
                'red': {red: 0.75, green: 0.22, blue: 0.17},
                'pink': {red: 0.87, green: 0.33, blue: 0.61},
                'purple': {red: 0.61, green: 0.29, blue: 0.85},
                'slate': {red: 0.44, green: 0.50, blue: 0.56}
            };
            
            return accentColors[accentColorName] || accentColors['blue'];
        } catch (e) {
            logger.warn('Failed to get accent color, using default blue');
            return {red: 0.29, green: 0.56, blue: 0.85};
        }
    }

    /**
     * Render the canvas
     * @private
     */
    _onRepaint() {
        try {
            const cr = this._canvas.get_context();
            const [w, h] = this._canvas.get_surface_size();
            
            // Draw each zone
            this._zones.forEach((zone, index) => {
                const x = zone.x * w;
                const y = zone.y * h;
                const zoneW = zone.w * w;
                const zoneH = zone.h * h;
                
                const isSelected = index === this._selectedIndex;
                
                // Fill with accent color
                cr.setSourceRGBA(
                    this._accentColor.red,
                    this._accentColor.green,
                    this._accentColor.blue,
                    isSelected ? 0.4 : 0.2  // Brighter if selected
                );
                cr.rectangle(x, y, zoneW, zoneH);
                cr.fill();
                
                // Border
                cr.setSourceRGBA(
                    this._accentColor.red,
                    this._accentColor.green,
                    this._accentColor.blue,
                    isSelected ? 1.0 : 0.6  // Full opacity if selected
                );
                cr.setLineWidth(isSelected ? 3 : 1);
                cr.rectangle(x, y, zoneW, zoneH);
                cr.stroke();
                
                // Draw zone name in center
                if (zone.name) {
                    cr.setSourceRGBA(
                        this._accentColor.red * 1.5,
                        this._accentColor.green * 1.5,
                        this._accentColor.blue * 1.5,
                        0.7
                    );
                    cr.setFontSize(12);
                    cr.moveTo(x + zoneW / 2 - 20, y + zoneH / 2);
                    cr.showText(zone.name);
                }
            });
            
            cr.$dispose();
        } catch (e) {
            logger.error(`Error drawing canvas: ${e}`);
        }
    }

    // Note: connect() and disconnect() are inherited from GObject.Object
    // No need to override them - they work with our defined signals

    /**
     * Clean up resources
     */
    destroy() {
        if (this._canvas) {
            this._canvas.destroy();
            this._canvas = null;
        }
    }
});
