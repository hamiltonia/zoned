/**
 * LayoutSwitcher - Visual layout selection dialog
 * 
 * Displays a centered dialog showing all available layouts with:
 * - 3-column grid layout with visual zone previews
 * - Cairo-rendered zone visualizations (replaces ASCII art)
 * - System accent color theming
 * - Aspect ratio-aware card dimensions
 * - Keyboard navigation (arrows, 1-9, Enter, Esc)
 * - Mouse selection
 * - Full-screen zone preview overlay
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { createLogger } from '../utils/debug.js';

const logger = createLogger('LayoutSwitcher');
const COLUMNS = 3;
const CARD_PADDING = 10;
const CARD_SPACING = 10;
const CONTAINER_PADDING = 40;
const TITLE_HEIGHT = 50;  // Approximate height of title + spacing
const INSTRUCTIONS_HEIGHT = 30;  // Approximate height of instructions + spacing
const HEADER_SECTION_HEIGHT = 0;  // Reserved for future: explanation text, settings toggles

export class LayoutSwitcher {
    /**
     * @param {LayoutManager} layoutManager - Layout manager instance
     * @param {ZoneOverlay} zoneOverlay - Zone overlay instance for notifications
     * @param {Gio.Settings} settings - GSettings instance
     */
    constructor(layoutManager, zoneOverlay, settings) {
        this._layoutManager = layoutManager;
        this._zoneOverlay = zoneOverlay;
        this._settings = settings;
        this._dialog = null;
        this._fullScreenOverlay = null;
        this._selectedIndex = 0;
        this._layoutButtons = [];
    }

    /**
     * Show the layout switcher dialog (or hide if already showing - toggle behavior)
     */
    show() {
        if (this._dialog) {
            // Already showing - hide it (toggle behavior)
            this.hide();
            return;
        }

        const layouts = this._layoutManager.getAllLayouts();
        if (!layouts || layouts.length === 0) {
            logger.warn('No layouts available to display');
            return;
        }

        // Find current layout index
        const currentLayout = this._layoutManager.getCurrentLayout();
        this._selectedIndex = layouts.findIndex(p => p.id === currentLayout.id);
        if (this._selectedIndex < 0) {
            this._selectedIndex = 0;
        }

        this._createDialog(layouts);
        this._connectKeyEvents();
        
        // Create zone overlay showing current layout
        this._createZoneOverlay(currentLayout);

        logger.info('Layout switcher shown');
    }

    /**
     * Hide the layout switcher dialog
     */
    hide() {
        logger.debug('Hide called - dialog exists:', !!this._dialog, 'overlay exists:', !!this._zoneOverlay);
        
        // Store dialog reference and immediately clear it to prevent event handlers from triggering
        const dialog = this._dialog;
        this._dialog = null;
        this._layoutButtons = [];
        
        // Always disconnect key events
        this._disconnectKeyEvents();
        
        // Always try to destroy overlay
        this._destroyZoneOverlay();
        
        // Then destroy dialog if it existed
        if (dialog) {
            Main.uiGroup.remove_child(dialog);
            dialog.destroy();
        }
        
        logger.debug('Layout switcher hidden - overlay:', !!this._zoneOverlay, 'dialog:', !!this._dialog);
    }

    /**
     * Draw a rounded rectangle using Cairo
     * @private
     */
    _drawRoundedRect(cr, x, y, width, height, radius) {
        const degrees = Math.PI / 180.0;
        
        cr.newSubPath();
        cr.arc(x + width - radius, y + radius, radius, -90 * degrees, 0 * degrees);
        cr.arc(x + width - radius, y + height - radius, radius, 0 * degrees, 90 * degrees);
        cr.arc(x + radius, y + height - radius, radius, 90 * degrees, 180 * degrees);
        cr.arc(x + radius, y + radius, radius, 180 * degrees, 270 * degrees);
        cr.closePath();
    }

    /**
     * Create or update the full-screen zone overlay
     * Shows the zones of the given layout on the current monitor
     * @private
     */
    _createZoneOverlay(layout) {
        // If overlay already exists, just update it
        if (this._fullScreenOverlay) {
            this._updateZoneOverlay(layout) ;
            return;
        }

        const monitor = Main.layoutManager.currentMonitor;
        const accentColor = this._getAccentColor();
        const CORNER_RADIUS = 12;  // GNOME default window corner radius
        
        // Create full-screen overlay widget
        this._fullScreenOverlay = new St.Widget({
            style: 'background-color: rgba(0, 0, 0, 0.3);',
            width: monitor.width,
            height: monitor.height,
            x: monitor.x,
            y: monitor.y,
            reactive: false  // Don't intercept mouse events
        });
        
        // Create drawing area for zones
        this._fullScreenOverlayCanvas = new St.DrawingArea({
            width: monitor.width,
            height: monitor.height
        });
        
        // Store current layout for repainting
        this._overlayLayout = layout;
        
        this._fullScreenOverlayCanvas.connect('repaint', () => {
            try {
                const cr = this._fullScreenOverlayCanvas.get_context();
                const [w, h] = this._fullScreenOverlayCanvas.get_surface_size();
                
                if (!this._overlayLayout) {
                    cr.$dispose();
                    return;
                }
                
                // Draw each zone with rounded corners
                this._overlayLayout.zones.forEach((zone) => {
                    const x = zone.x * w;
                    const y = zone.y * h;
                    const zoneW = zone.w * w;
                    const zoneH = zone.h * h;
                    
                    // Fill with subtle accent color (20% opacity for overlay)
                    cr.setSourceRGBA(
                        accentColor.red,
                        accentColor.green,
                        accentColor.blue,
                        0.2  // 20% opacity - more subtle for full screen
                    );
                    this._drawRoundedRect(cr, x, y, zoneW, zoneH, CORNER_RADIUS);
                    cr.fill();
                    
                    // Border with accent (60% opacity for overlay, 4px width)
                    cr.setSourceRGBA(
                        accentColor.red,
                        accentColor.green,
                        accentColor.blue,
                        0.6  // 60% opacity - more subtle for full screen
                    );
                    cr.setLineWidth(4);  // Increased from 2px to 4px for better visibility
                    this._drawRoundedRect(cr, x, y, zoneW, zoneH, CORNER_RADIUS);
                    cr.stroke();
                });
                
                cr.$dispose();
            } catch (e) {
                logger.error('Error drawing zone overlay:', e);
            }
        });
        
        this._fullScreenOverlay.add_child(this._fullScreenOverlayCanvas);
        
        // Add to stage BEFORE the dialog (so it appears behind)
        Main.uiGroup.insert_child_below(this._fullScreenOverlay, this._dialog);
        
        logger.debug(`Zone overlay created for layout: ${layout.name}`);
    }

    /**
     * Update the zone overlay with a new layout
     * @private
     */
    _updateZoneOverlay(layout) {
        if (!this._fullScreenOverlay || !this._fullScreenOverlayCanvas) {
            this._createZoneOverlay(layout);
            return;
        }
        
        this._overlayLayout = layout;
        this._fullScreenOverlayCanvas.queue_repaint();
        
        logger.debug(`Zone overlay updated to layout: ${layout.name}`);
    }

    /**
     * Destroy the zone overlay
     * @private
     */
    _destroyZoneOverlay() {
        if (this._fullScreenOverlay) {
            Main.uiGroup.remove_child(this._fullScreenOverlay);
            this._fullScreenOverlay.destroy();
            this._fullScreenOverlay = null;
            this._fullScreenOverlayCanvas = null;
            this._overlayLayout = null;
            logger.debug('Zone overlay destroyed');
        }
    }

    /**
     * Calculate card dimensions dynamically to fill available space
     * Constrains by both width AND height to ensure 3x3 grid fits
     * Uses fixed pixel spacing for consistent layout across displays
     * @private
     */
    _getCardDimensions(dialogWidth, dialogHeight) {
        const monitor = Main.layoutManager.currentMonitor;
        const aspectRatio = monitor.width / monitor.height;
        const ROWS = 3;
        const FIXED_SPACING = 24;  // Fixed spacing in pixels
        
        // Calculate available space for cards
        const availableWidth = dialogWidth - (CONTAINER_PADDING * 2);
        const availableHeight = dialogHeight - (CONTAINER_PADDING * 2) - TITLE_HEIGHT - INSTRUCTIONS_HEIGHT;
        
        // Calculate with fixed spacing
        // For 3 columns: availableWidth = 3W + 2(spacing)
        // Therefore: W = (availableWidth - 2*spacing) / 3
        
        // Calculate from width constraint
        const cardWidthFromHorizontal = Math.floor((availableWidth - (2 * FIXED_SPACING)) / COLUMNS);
        const cardHeightFromWidth = Math.floor(cardWidthFromHorizontal / aspectRatio);
        
        // Calculate from height constraint  
        // For 3 rows: availableHeight = 3H + 2(spacing)
        // Therefore: H = (availableHeight - 2*spacing) / 3
        const cardHeightFromVertical = Math.floor((availableHeight - (2 * FIXED_SPACING)) / ROWS);
        const cardWidthFromHeight = Math.floor(cardHeightFromVertical * aspectRatio);
        
        // Use whichever is smaller to ensure both dimensions fit
        let cardWidth, cardHeight;
        if (cardHeightFromWidth <= cardHeightFromVertical) {
            cardWidth = cardWidthFromHorizontal;
            cardHeight = cardHeightFromWidth;
        } else {
            cardWidth = cardWidthFromHeight;
            cardHeight = cardHeightFromVertical;
        }
        
        logger.debug(`Available space: ${availableWidth}x${availableHeight}`);
        logger.debug(`Card size: ${cardWidth}x${cardHeight}, spacing: ${FIXED_SPACING}px`);
        
        return { width: cardWidth, height: cardHeight, spacing: FIXED_SPACING };
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
            logger.warn('Failed to get accent color, using default blue:', e);
            return {red: 0.29, green: 0.56, blue: 0.85};
        }
    }

    /**
     * Create visual zone preview using Cairo
     * @private
     */
    _createZonePreview(layout, width, height) {
        const canvas = new St.DrawingArea({
            width: width,
            height: height,
            style: 'border: 1px solid #444; background-color: #1a1a1a;'
        });
        
        const accentColor = this._getAccentColor();
        
        canvas.connect('repaint', () => {
            try {
                const cr = canvas.get_context();
                const [w, h] = canvas.get_surface_size();
                
                // Draw each zone
                layout.zones.forEach((zone) => {
                    const x = zone.x * w;
                    const y = zone.y * h;
                    const zoneW = zone.w * w;
                    const zoneH = zone.h * h;
                    
                    // Fill with subtle accent color
                    cr.setSourceRGBA(
                        accentColor.red,
                        accentColor.green,
                        accentColor.blue,
                        0.3  // 30% opacity
                    );
                    cr.rectangle(x, y, zoneW, zoneH);
                    cr.fill();
                    
                    // Border with brighter accent
                    cr.setSourceRGBA(
                        accentColor.red,
                        accentColor.green,
                        accentColor.blue,
                        0.8  // 80% opacity
                    );
                    cr.setLineWidth(1);
                    cr.rectangle(x, y, zoneW, zoneH);
                    cr.stroke();
                });
                
                cr.$dispose();
            } catch (e) {
                logger.error(`Error drawing zone preview for ${layout.name}:`, e);
            }
        });
        
        return canvas;
    }

    /**
     * Create the dialog UI with grid layout
     * @private
     */
    _createDialog(layouts) {
        // Background overlay - fully transparent, centered content, click to close
        this._dialog = new St.Bin({
            style_class: 'modal-dialog',
            reactive: true,
            can_focus: true,
            style: 'background-color: rgba(0, 0, 0, 0);',  // Fully transparent
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        
        // Click outside to close
        this._dialog.connect('button-press-event', (actor, event) => {
            // Only close if clicking on the background, not the container
            if (event.get_source() === this._dialog) {
                this.hide();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Calculate size based on monitor orientation and settings
        const monitor = Main.layoutManager.currentMonitor;
        const aspectRatio = monitor.width / monitor.height;
        const isPortrait = monitor.height > monitor.width;
        
        // Read size from settings (default 0.6 = 60%)
        const dialogSizeFraction = this._settings.get_double('layout-picker-size');
        
        let dialogWidth, dialogHeight;
        
        if (isPortrait) {
            // Portrait: width = X% of screen width, height = same as width (square-ish)
            dialogWidth = Math.floor(monitor.width * dialogSizeFraction);
            dialogHeight = dialogWidth;
        } else {
            // Landscape: height = X% of screen height, width mirrors aspect ratio
            dialogHeight = Math.floor(monitor.height * dialogSizeFraction);
            dialogWidth = Math.floor(dialogHeight * aspectRatio);
        }
        
        logger.debug(`Monitor: ${monitor.width}x${monitor.height} (${aspectRatio.toFixed(2)}:1), Portrait: ${isPortrait}`);
        logger.debug(`Dialog size (${(dialogSizeFraction * 100).toFixed(0)}%): ${dialogWidth}x${dialogHeight}`);

        // Container for layout grid with explicit sizing
        const containerStyle = 'background-color: rgba(40, 40, 40, 0.95); ' +
                   'border-radius: 16px; ' +
                   'padding: 40px; ' +
                   'spacing: 24px;';
        
        const container = new St.BoxLayout({
            vertical: true,
            style: `${containerStyle} width: ${dialogWidth}px; height: ${dialogHeight}px;`
        });
        
        // Prevent clicks on container from closing dialog
        container.connect('button-press-event', () => {
            return Clutter.EVENT_STOP;  // Stop propagation to parent
        });

        // Title
        const title = new St.Label({
            text: 'Select Layout',
            style: 'font-weight: bold; ' +
                   'color: #ffffff; ' +
                   'text-align: center;'
        });
        container.add_child(title);

        // ScrollView for grid - let it expand to fill container
        const scrollView = new St.ScrollView({
            style: 'flex: 1;',  // Expand to fill available space
            overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            x_expand: true,
            y_expand: true
        });

        const dimensions = this._getCardDimensions(dialogWidth, dialogHeight);
        
        // Grid container - use BoxLayout with wrapping instead of GridLayout
        const gridContainer = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            style: `spacing: ${dimensions.spacing}px;`
        });
        
        logger.debug(`Card dimensions: ${dimensions.width}x${dimensions.height}`);
        logger.debug(`Creating cards for ${layouts.length} layouts`);

        // Create rows
        let currentRow = null;
        layouts.forEach((layout, index) => {
            const col = index % COLUMNS;
            
            // Start new row every COLUMNS items
            if (col === 0) {
                currentRow = new St.BoxLayout({
                    vertical: false,
                    style: `spacing: ${dimensions.spacing}px;`
                });
                gridContainer.add_child(currentRow);
            }
            
            const card = this._createLayoutCard(layout, index, dimensions.width, dimensions.height);
            currentRow.add_child(card);
            this._layoutButtons.push(card);
        });
        
        logger.debug(`Created ${this._layoutButtons.length} layout cards`);

        scrollView.add_child(gridContainer);
        container.add_child(scrollView);

        // Instructions
        const instructions = new St.Label({
            text: '1-9: Quick Select  Arrows: Navigate  Enter: Confirm  Esc: Cancel',
            style: 'color: #aaaaaa; ' +
                   'text-align: center;'
        });
        container.add_child(instructions);

        this._dialog.set_child(container);

        // Add to stage - fill screen for proper centering
        Main.uiGroup.add_child(this._dialog);
        this._dialog.set_position(0, 0);
        this._dialog.set_size(global.screen_width, global.screen_height);
        
        // Grab keyboard focus so key events work
        this._dialog.grab_key_focus();
        
        logger.debug('Dialog created and added to stage with focus');

        // Update selection highlight
        this._updateSelection();
    }

    /**
     * Create a single layout card
     * @private
     */
    _createLayoutCard(layout, index, width, height) {
        const currentLayout = this._layoutManager.getCurrentLayout();
        const isCurrentLayout = layout.id === currentLayout.id;
        
        const card = new St.Button({
            style_class: 'layout-card',
            style: `padding: ${CARD_PADDING}px; width: ${width}px; ` +
                   `border-radius: 8px; ` +
                   `background-color: ${isCurrentLayout ? 
                       'rgba(74, 144, 217, 0.3)' : 'rgba(60, 60, 60, 0.5)'};` +
                   `border: ${isCurrentLayout ? '2px solid #4a90d9' : '1px solid #444'};`,
            reactive: true,
            track_hover: true,
            can_focus: true
        });
        
        // Store layout info for later reference
        card._layoutId = layout.id;
        card._layout = layout;  // Store full layout for overlay updates
        card._isCurrentLayout = isCurrentLayout;
        card._layoutIndex = index;
        card._cardWidth = width;  // Store width for _updateSelection
        
        const box = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 6px;'
        });
        
        // Zone preview with overlaid number
        const previewWidth = width - (CARD_PADDING * 2);
        const previewHeight = height - 70; // Leave room for name + indicator + spacing below
        
        const previewContainer = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            width: previewWidth,
            height: previewHeight
        });
        
        const preview = this._createZonePreview(layout, previewWidth, previewHeight);
        previewContainer.add_child(preview);
        
        // Large number overlay (if index < 9)
        if (index < 9) {
            const numberOverlay = new St.Label({
                text: `${index + 1}`,
                style: 'color: rgba(255, 255, 255, 0.3); font-weight: bold;',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
                y_expand: true
            });
            previewContainer.add_child(numberOverlay);
        }
        
        box.add_child(previewContainer);
        
        // Layout name
        const name = new St.Label({
            text: layout.name,
            style: 'text-align: center; font-weight: bold;'
        });
        box.add_child(name);
        
        // Current layout indicator
        if (isCurrentLayout) {
            const indicator = new St.Label({
                text: '●',
                style: 'color: #4a90d9; text-align: center;'
            });
            box.add_child(indicator);
        }
        
        card.set_child(box);
        
        // Hover effects
        card.connect('enter-event', () => {
            // Only update if dialog still exists (not being destroyed)
            if (!this._dialog) return Clutter.EVENT_PROPAGATE;
            
            if (card._layoutIndex !== this._selectedIndex) {
                card.style = `padding: ${CARD_PADDING}px; width: ${width}px; ` +
                            `border-radius: 8px; ` +
                            `background-color: rgba(74, 144, 217, 0.25); ` +
                            `border: 1px solid #6aa0d9;`;
            }
            // Update zone overlay to show this layout's zones
            this._updateZoneOverlay(card._layout);
            return Clutter.EVENT_PROPAGATE;
        });
        
        card.connect('leave-event', () => {
            // Only update if dialog still exists (not being destroyed)
            if (!this._dialog) return Clutter.EVENT_PROPAGATE;
            
            // Restore proper style based on selection state
            this._updateSelection();
            // Revert zone overlay to current active layout
            const currentProf = this._layoutManager.getCurrentLayout();
            this._updateZoneOverlay(currentProf);
            return Clutter.EVENT_PROPAGATE;
        });
        
        // Click handler
        card.connect('clicked', () => {
            this._onLayoutSelected(layout.id);
        });
        
        return card;
    }

    /**
     * Handle layout selection
     * @private
     */
    _onLayoutSelected(layoutId) {
        logger.info(`Layout selection triggered: ${layoutId}`);
        
        // Use shared helper that handles both layout switching and notification
        this._layoutManager.setLayoutWithNotification(layoutId, this._zoneOverlay);
        
        // Hide dialog
        this.hide();
    }

    /**
     * Update selection highlight (visual only, does not update overlay)
     * @private
     */
    _updateSelection() {
        // Don't update if dialog doesn't exist (being destroyed or already destroyed)
        if (!this._dialog) return;
        
        logger.debug(`Updating selection to index: ${this._selectedIndex}`);
        const currentLayout = this._layoutManager.getCurrentLayout();
        
        this._layoutButtons.forEach((button, index) => {
            const isCurrentLayout = button._layoutId === currentLayout.id;
            const isSelected = index === this._selectedIndex;
            const width = button._cardWidth || 200;  // Use stored width or fallback
            
            if (isSelected) {
                // Selected card - bright blue with thick border
                button.style = `padding: ${CARD_PADDING}px; width: ${width}px; ` +
                              `border-radius: 8px; ` +
                              `background-color: rgba(74, 144, 217, 0.5); ` +
                              `border: 3px solid #4a90d9;`;
                logger.debug(`Card ${index} is selected`);
            } else if (isCurrentLayout) {
                // Current layout - medium blue with medium border
                button.style = `padding: ${CARD_PADDING}px; width: ${width}px; ` +
                              `border-radius: 8px; ` +
                              `background-color: rgba(74, 144, 217, 0.3); ` +
                              `border: 2px solid #4a90d9;`;
            } else {
                // Normal card - gray
                button.style = `padding: ${CARD_PADDING}px; width: ${width}px; ` +
                              `border-radius: 8px; ` +
                              `background-color: rgba(60, 60, 60, 0.5); ` +
                              `border: 1px solid #444;`;
            }
        });
    }

    /**
     * Connect keyboard event handlers
     * @private
     */
    _connectKeyEvents() {
        this._keyPressId = global.stage.connect('key-press-event', (actor, event) => {
            const symbol = event.get_key_symbol();
            const layouts = this._layoutManager.getAllLayouts();

            // Number keys 1-9 for quick select
            if (symbol >= Clutter.KEY_1 && symbol <= Clutter.KEY_9) {
                const index = symbol - Clutter.KEY_1;
                if (index < layouts.length) {
                    this._onLayoutSelected(layouts[index].id);
                    return Clutter.EVENT_STOP;
                }
            }

            // 2D Grid navigation
            const currentRow = Math.floor(this._selectedIndex / COLUMNS);
            const currentCol = this._selectedIndex % COLUMNS;
            const totalRows = Math.ceil(layouts.length / COLUMNS);

            switch (symbol) {
                case Clutter.KEY_Escape:
                    this.hide();
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Return:
                case Clutter.KEY_KP_Enter:
                    if (layouts[this._selectedIndex]) {
                        this._onLayoutSelected(layouts[this._selectedIndex].id);
                    }
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Left:
                case Clutter.KEY_KP_Left:
                    // Move left, wrap to previous row's end
                    if (currentCol > 0) {
                        this._selectedIndex--;
                    } else if (currentRow > 0) {
                        this._selectedIndex = (currentRow - 1) * COLUMNS + (COLUMNS - 1);
                        if (this._selectedIndex >= layouts.length) {
                            this._selectedIndex = layouts.length - 1;
                        }
                    }
                    this._updateSelection();
                    // Update overlay to show newly selected layout
                    if (this._layoutButtons[this._selectedIndex]) {
                        this._updateZoneOverlay(this._layoutButtons[this._selectedIndex]._layout);
                    }
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Right:
                case Clutter.KEY_KP_Right:
                    // Move right, wrap to next row's start
                    if (currentCol < COLUMNS - 1 && this._selectedIndex < layouts.length - 1) {
                        this._selectedIndex++;
                    } else if (currentRow < totalRows - 1) {
                        this._selectedIndex = (currentRow + 1) * COLUMNS;
                        if (this._selectedIndex >= layouts.length) {
                            this._selectedIndex = layouts.length - 1;
                        }
                    }
                    this._updateSelection();
                    // Update overlay to show newly selected layout
                    if (this._layoutButtons[this._selectedIndex]) {
                        this._updateZoneOverlay(this._layoutButtons[this._selectedIndex]._layout);
                    }
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Up:
                case Clutter.KEY_KP_Up:
                    // Move up one row
                    const upIndex = this._selectedIndex - COLUMNS;
                    if (upIndex >= 0) {
                        this._selectedIndex = upIndex;
                        this._updateSelection();
                        // Update overlay to show newly selected layout
                        if (this._layoutButtons[this._selectedIndex]) {
                            this._updateZoneOverlay(this._layoutButtons[this._selectedIndex]._layout);
                        }
                    }
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Down:
                case Clutter.KEY_KP_Down:
                    // Move down one row
                    const downIndex = this._selectedIndex + COLUMNS;
                    if (downIndex < layouts.length) {
                        this._selectedIndex = downIndex;
                        this._updateSelection();
                        // Update overlay to show newly selected layout
                        if (this._layoutButtons[this._selectedIndex]) {
                            this._updateZoneOverlay(this._layoutButtons[this._selectedIndex]._layout);
                        }
                    }
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Page_Up:
                case Clutter.KEY_KP_Page_Up:
                case Clutter.KEY_Page_Down:
                case Clutter.KEY_KP_Page_Down:
                    // Allow ScrollView to handle these
                    return Clutter.EVENT_PROPAGATE;
            }

            return Clutter.EVENT_PROPAGATE;
        });
    }

    /**
     * Disconnect keyboard event handlers
     * @private
     */
    _disconnectKeyEvents() {
        if (this._keyPressId) {
            global.stage.disconnect(this._keyPressId);
            this._keyPressId = null;
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.hide();
    }
}
