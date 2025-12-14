/**
 * ZoneEditor - Full-screen visual layout editor (Edge-based)
 *
 * ARCHITECTURE NOTE:
 * - This component edits ZONE data (pure geometry: zones/edges)
 * - Layouts are referenced by PROFILES (which add metadata like name, settings)
 * - Users see "Layout" everywhere; internal code uses LayoutManager for complete objects
 * - See: memory/development/v1-mvp-roadmap.md for architecture details
 *
 * FancyZones-style visual editor with edge-based data structure:
 * - Click region: Split horizontally
 * - Shift+Click: Split vertically
 * - Drag edges: Resize (affects all regions sharing that edge)
 * - Ctrl+Click on edge: Delete/merge regions
 * - Save/Cancel workflow
 *
 * Part of FancyZones-style implementation (Sprint 3/4)
 */

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Shell from 'gi://Shell';
import Gio from 'gi://Gio';
import {createLogger} from '../utils/debug.js';
import {zonesToEdges, edgesToZones, validateEdgeLayout} from '../utils/layoutConverter.js';
import {ThemeManager} from '../utils/theme.js';

const logger = createLogger('ZoneEditor');

/**
 * ZoneEditor - Full-screen visual layout editor (edge-based)
 *
 * Edits the layout geometry (zones/edges) portion of a layout.
 * Users see this as "Layout Editor" - the component for designing window zones.
 *
 * Usage:
 *   const editor = new ZoneEditor(
 *       currentLayout,  // Contains zones array (zone-based layout)
 *       layoutManager,
 *       (layout) => layoutManager.updateCurrentLayout(layout)  // receives zone-based
 *   );
 *   editor.show();
 */
export class ZoneEditor {
    /**
     * Create a new grid editor
     * @param {Object} zoneLayout - Initial zone-based layout to edit
     * @param {LayoutManager} layoutManager - Layout manager instance
     * @param {Gio.Settings} settings - Extension settings instance
     * @param {Function} onSave - Callback when user saves (receives zone-based layout)
     * @param {Function} onCancel - Callback when user cancels (optional)
     */
    constructor(zoneLayout, layoutManager, settings, onSave, onCancel = null) {
        // Handle null layout (new layout with no zones) by creating default split template
        const layoutToEdit = zoneLayout || {
            id: null,
            name: 'New Layout',
            zones: [
                // Default: 2-zone left/right split (50/50)
                {name: 'Zone 1', x: 0.0, y: 0.0, w: 0.5, h: 1.0},
                {name: 'Zone 2', x: 0.5, y: 0.0, w: 0.5, h: 1.0},
            ],
        };

        // Convert zone-based to edge-based for internal editing
        this._edgeLayout = zonesToEdges(JSON.parse(JSON.stringify(layoutToEdit)));
        this._layoutManager = layoutManager;
        this._settings = settings;
        this._onSaveCallback = onSave;
        this._onCancelCallback = onCancel;

        // Initialize theme manager
        this._themeManager = new ThemeManager(settings);

        this._overlay = null;
        this._regionActors = [];
        this._edgeActors = [];  // Now contains {lineActor, handleActor, edge}
        this._modalId = null;
        this._draggingEdge = null;
        this._currentHandle = null;  // Currently visible handle
        this._helpTextBox = null;  // Store reference to help text for Z-order management
        this._toolbar = null;  // Store reference to toolbar for Z-order management
        this._resolutionLabels = [];  // Resolution labels shown during edge resize

        // Prevent multiple save/cancel invocations
        this._saveExecuted = false;
        this._cancelExecuted = false;

        // Minimum region size (10% of screen dimension)
        this.MIN_REGION_SIZE = 0.1;

        // Visual settings
        // TODO: Make this user-configurable in settings
        // When false, uses single accent color; when true, uses 4-color map diagnostic
        this.USE_MAP_COLORS = false;

        logger.debug('ZoneEditor created (edge-based)');
        logger.debug(`Initial state: ${this._edgeLayout.regions.length} regions, ${this._edgeLayout.edges.length} edges`);
        this._logLayoutState('CONSTRUCTOR');
    }

    /**
     * Log current layout state for debugging
     * @param {string} context - Context label for this log
     * @private
     */
    _logLayoutState(context) {
        logger.info(`=== ZONE STATE [${context}] ===`);
        logger.info(`Regions: ${this._edgeLayout.regions.length}, Edges: ${this._edgeLayout.edges.length}`);

        // Log all edges
        this._edgeLayout.edges.forEach(edge => {
            logger.info(`  Edge ${edge.id}: ${edge.type} at ${edge.position.toFixed(3)}, start=${edge.start.toFixed(3)}, len=${edge.length.toFixed(3)}, fixed=${edge.fixed}`);
        });

        // Log all regions
        this._edgeLayout.regions.forEach((region, i) => {
            logger.info(`  Region ${i}: ${region.name} [L:${region.left}, R:${region.right}, T:${region.top}, B:${region.bottom}]`);
        });

        // Validate all region edge references
        const edgeMap = new Map(this._edgeLayout.edges.map(e => [e.id, e]));
        let invalidCount = 0;
        this._edgeLayout.regions.forEach((region, i) => {
            const missing = [];
            if (!edgeMap.has(region.left)) missing.push(`left:${region.left}`);
            if (!edgeMap.has(region.right)) missing.push(`right:${region.right}`);
            if (!edgeMap.has(region.top)) missing.push(`top:${region.top}`);
            if (!edgeMap.has(region.bottom)) missing.push(`bottom:${region.bottom}`);

            if (missing.length > 0) {
                logger.error(`  Region ${i} has INVALID edges: ${missing.join(', ')}`);
                invalidCount++;
            }
        });

        if (invalidCount > 0) {
            logger.error(`!!! ${invalidCount} regions have invalid edge references !!!`);
        }

        logger.info('=== END ZONE STATE ===');
    }

    /**
     * Show the grid editor
     */
    show() {
        const monitor = Main.layoutManager.currentMonitor;

        // Get display scale factor
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        const scaleFactor = themeContext.scale_factor;

        logger.info('Showing grid editor');
        logger.info(`Monitor dimensions: ${monitor.width}×${monitor.height} at position (${monitor.x}, ${monitor.y})`);
        logger.info(`Scale factor: ${scaleFactor}x`);

        // Get theme colors
        const colors = this._themeManager.getColors();

        // Create full-screen overlay - keep at physical dimensions
        this._overlay = new St.Widget({
            style_class: 'grid-editor-overlay',
            reactive: true,
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height,
        });

        // Dim background with theme-aware color
        this._overlay.style = `background-color: ${colors.modalOverlay};`;

        // Add regions and edges FIRST (lower Z-order)
        this._createRegions();
        this._createEdges();

        // Add toolbar at bottom
        this._createToolbar();

        // Add help text at top LAST (higher Z-order, renders above regions)
        this._createHelpText();

        // Add to stage
        Main.uiGroup.add_child(this._overlay);

        // Grab modal input
        this._modalId = Main.pushModal(this._overlay, {
            actionMode: Shell.ActionMode.NORMAL,
        });

        // Setup keyboard handling
        this._setupKeyboardHandlers();

        // Setup global motion/release handlers for edge dragging
        this._setupDragHandlers();

        logger.debug('Grid editor displayed');
    }

    /**
     * Setup global drag event handlers
     * @private
     */
    _setupDragHandlers() {
        // Global motion handler - tracks mouse movement during drag
        this._overlay.connect('motion-event', (actor, event) => {
            if (this._draggingEdge) {
                this._onEdgeDragMotion(event);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Global button-release handler - ends drag
        this._overlay.connect('button-release-event', (actor, event) => {
            if (this._draggingEdge) {
                logger.info('[DRAG] Button release - ending drag');
                this._onEdgeDragEnd();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        logger.debug('Global drag handlers installed on overlay');
    }

    /**
     * Hide the grid editor
     */
    hide() {
        if (this._overlay) {
            logger.debug('Hiding grid editor');

            // Release modal
            if (this._modalId) {
                Main.popModal(this._modalId);
                this._modalId = null;
            }

            // Remove from stage
            Main.uiGroup.remove_child(this._overlay);
            this._overlay.destroy();
            this._overlay = null;
            this._regionActors = [];
            this._edgeActors = [];
        }
    }

    /**
     * Create help text at top of screen
     * @private
     */
    _createHelpText() {
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        const scaleFactor = themeContext.scale_factor;
        const colors = this._themeManager.getColors();

        this._helpTextBox = new St.BoxLayout({
            vertical: true,
            style: `spacing: 8px; padding: 20px; background-color: ${colors.helpBoxBg}; border-radius: 8px;`,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.START,
        });

        const monitor = Main.layoutManager.currentMonitor;
        const helpWidth = 800 * scaleFactor;
        this._helpTextBox.set_position((monitor.width - helpWidth) / 2, 20);
        this._helpTextBox.width = helpWidth;

        const title = new St.Label({
            text: 'Layout Editor',
            style: `font-size: 14pt; font-weight: bold; color: ${colors.textPrimary}; margin-bottom: 8px;`,
        });
        this._helpTextBox.add_child(title);

        const instructions = [
            'Click region: Split horizontally  •  Shift+Click: Split vertically',
            'Hover edge + Ctrl+Click: Delete edge  •  Drag edge handle: Resize zones',
            'Esc: Cancel  •  Enter: Save layout',
        ];

        instructions.forEach(text => {
            const label = new St.Label({
                text: text,
                style: `font-size: 11pt; color: ${colors.textSecondary};`,
            });
            label.clutter_text.line_wrap = true;
            this._helpTextBox.add_child(label);
        });

        this._overlay.add_child(this._helpTextBox);
    }

    /**
     * Create region actors
     * @private
     */
    _createRegions() {
        const monitor = Main.layoutManager.currentMonitor;
        const edgeMap = new Map(this._edgeLayout.edges.map(e => [e.id, e]));

        this._edgeLayout.regions.forEach((region, index) => {
            const left = edgeMap.get(region.left);
            const right = edgeMap.get(region.right);
            const top = edgeMap.get(region.top);
            const bottom = edgeMap.get(region.bottom);

            if (!left || !right || !top || !bottom) {
                logger.error(`Region ${index} has invalid edge references`);
                return;
            }

            const actor = new St.Button({
                style_class: 'region-actor',
                reactive: true,
                x: left.position * monitor.width,
                y: top.position * monitor.height,
                width: (right.position - left.position) * monitor.width,
                height: (bottom.position - top.position) * monitor.height,
            });

            // Choose color scheme based on setting
            let colorScheme;
            if (this.USE_MAP_COLORS) {
                // 4-color map diagnostic - helps identify duplicate/overlapping regions visually
                const colors = [
                    {bg: 'rgba(28, 113, 216, 0.3)', border: 'rgb(28, 113, 216)', name: 'Blue'},
                    {bg: 'rgba(38, 162, 105, 0.3)', border: 'rgb(38, 162, 105)', name: 'Green'},
                    {bg: 'rgba(192, 97, 203, 0.3)', border: 'rgb(192, 97, 203)', name: 'Purple'},
                    {bg: 'rgba(230, 97, 0, 0.3)', border: 'rgb(230, 97, 0)', name: 'Orange'},
                ];
                colorScheme = colors[index % colors.length];
            } else {
                // Single system accent color for all regions
                // Use the theme's accent color (respects user's GNOME appearance settings)
                const accentColor = this._getAccentColor();
                colorScheme = {
                    bg: `rgba(${Math.round(accentColor.red * 255)}, ${Math.round(accentColor.green * 255)}, ${Math.round(accentColor.blue * 255)}, 0.3)`,
                    border: this._rgbToHex(accentColor.red, accentColor.green, accentColor.blue),
                    name: 'Accent',
                };
            }

            actor.style = `
                background-color: ${colorScheme.bg};
                border: 3px solid ${colorScheme.border};
                border-radius: 4px;
            `;

            // Region number label
            const label = new St.Label({
                text: `${index + 1}`,
                style: 'font-size: 72pt; color: white; font-weight: bold;',
            });
            actor.set_child(label);

            // Click to split
            actor.connect('button-press-event', (actor, event) => {
                return this._onRegionClicked(index, event);
            });

            // Hover effect - brighten the current color
            actor.connect('enter-event', () => {
                // Increase opacity for hover effect
                const hoverBg = colorScheme.bg.replace('0.3', '0.5');
                actor.style = `
                    background-color: ${hoverBg};
                    border: 3px solid ${colorScheme.border};
                    border-radius: 4px;
                `;
            });

            actor.connect('leave-event', () => {
                // Return to original opacity
                actor.style = `
                    background-color: ${colorScheme.bg};
                    border: 3px solid ${colorScheme.border};
                    border-radius: 4px;
                `;
            });

            this._overlay.add_child(actor);
            this._regionActors.push(actor);
        });

        logger.debug(`Created ${this._regionActors.length} region actors`);
    }

    /**
     * Create edge actors for dragging and deletion
     * @private
     */
    _createEdges() {
        const monitor = Main.layoutManager.currentMonitor;

        // Get system accent color for edge highlights
        const accentColor = this._getAccentColor();
        const accentRGBA = `rgba(${Math.round(accentColor.red * 255)}, ${Math.round(accentColor.green * 255)}, ${Math.round(accentColor.blue * 255)}, 0.4)`;

        // Only create actors for non-fixed edges (not screen boundaries)
        const draggableEdges = this._edgeLayout.edges.filter(edge => !edge.fixed);

        draggableEdges.forEach(edge => {
            // Create edge LINE actor (for hover, drag, and delete)
            const lineActor = new St.Widget({
                reactive: true,
                track_hover: true,
            });

            if (edge.type === 'vertical') {
                lineActor.set_position(
                    edge.position * monitor.width - 15,
                    edge.start * monitor.height,
                );
                lineActor.set_size(30, edge.length * monitor.height);
                lineActor.style = 'background-color: transparent;';
            } else {
                lineActor.set_position(
                    edge.start * monitor.width,
                    edge.position * monitor.height - 15,
                );
                lineActor.set_size(edge.length * monitor.width, 30);
                lineActor.style = 'background-color: transparent;';
            }

            // Line hover - highlight with accent color
            lineActor.connect('enter-event', () => {
                lineActor.style = `background-color: ${accentRGBA};`;
            });

            // Line leave - hide (unless dragging)
            lineActor.connect('leave-event', () => {
                if (!this._draggingEdge) {
                    lineActor.style = 'background-color: transparent;';
                }
            });

            // Line button press - drag or delete
            lineActor.connect('button-press-event', (actor, event) => {
                const modifiers = event.get_state();
                const ctrlPressed = modifiers & Clutter.ModifierType.CONTROL_MASK;

                if (ctrlPressed) {
                    // Ctrl+Click on line: Delete edge
                    logger.info(`[DELETE] Ctrl+Click on edge ${edge.id}`);
                    this._deleteEdge(edge);
                    return Clutter.EVENT_STOP;
                } else {
                    // Regular click: Start drag
                    logger.info(`[DRAG] Line button-press: ${edge.id} (${edge.type})`);
                    this._onEdgeDragBegin(edge, event);
                    return Clutter.EVENT_STOP;
                }
            });

            // Add line actor to overlay
            this._overlay.add_child(lineActor);

            // Store line actor
            this._edgeActors.push({
                lineActor: lineActor,
                edge: edge,
            });
        });

        logger.debug(`Created ${this._edgeActors.length} edge actors`);
    }

    /**
     * Handle edge drag begin
     * @private
     */
    _onEdgeDragBegin(edge, event) {
        const [x, y] = event.get_coords();

        // Find all regions affected by this edge
        const affectedRegions = this._findRegionsReferencingEdge(edge.id);

        this._draggingEdge = {
            edge: edge,
            originalPosition: edge.position,
            affectedRegionIndices: affectedRegions.map(r => this._edgeLayout.regions.indexOf(r)),
        };

        logger.debug(`Started dragging edge ${edge.id} at position ${edge.position.toFixed(3)}, affects ${affectedRegions.length} regions`);

        // Create initial resolution labels
        this._createResolutionLabels();
    }

    /**
     * Create resolution labels for affected regions during edge drag
     * @private
     */
    _createResolutionLabels() {
        // Remove any existing labels first
        this._removeResolutionLabels();

        if (!this._draggingEdge || !this._overlay) return;

        const monitor = Main.layoutManager.currentMonitor;
        const edgeMap = new Map(this._edgeLayout.edges.map(e => [e.id, e]));
        const colors = this._themeManager.getColors();

        // Create labels for each affected region
        this._draggingEdge.affectedRegionIndices.forEach(regionIndex => {
            const region = this._edgeLayout.regions[regionIndex];
            if (!region) return;

            const left = edgeMap.get(region.left);
            const right = edgeMap.get(region.right);
            const top = edgeMap.get(region.top);
            const bottom = edgeMap.get(region.bottom);

            if (!left || !right || !top || !bottom) return;

            // Calculate pixel dimensions
            const widthPx = Math.round((right.position - left.position) * monitor.width);
            const heightPx = Math.round((bottom.position - top.position) * monitor.height);

            // Create label with resolution text
            const label = new St.Label({
                text: `${widthPx}×${heightPx}`,
                style: `font-size: 16pt; font-weight: bold; color: white; 
                        background-color: rgba(0, 0, 0, 0.7); 
                        padding: 8px 12px; border-radius: 4px;`,
            });

            // Calculate position below region number (which is centered with 72pt font)
            const regionX = left.position * monitor.width;
            const regionY = top.position * monitor.height;
            const regionW = (right.position - left.position) * monitor.width;
            const regionH = (bottom.position - top.position) * monitor.height;

            // Position below the region number
            // Region number is ~90px tall at 72pt, so offset downward from center
            const labelWidth = 120; // Approximate width
            const labelHeight = 40; // Approximate height
            const numberOffset = 60; // Offset below center to clear the region number

            label.set_position(
                regionX + (regionW - labelWidth) / 2,
                regionY + (regionH / 2) + numberOffset,
            );

            this._overlay.add_child(label);
            this._resolutionLabels.push({label, regionIndex});
        });

        logger.debug(`Created ${this._resolutionLabels.length} resolution labels`);
    }

    /**
     * Update resolution labels during drag
     * @private
     */
    _updateResolutionLabels() {
        if (!this._draggingEdge || !this._overlay) return;

        const monitor = Main.layoutManager.currentMonitor;
        const edgeMap = new Map(this._edgeLayout.edges.map(e => [e.id, e]));

        this._resolutionLabels.forEach(({label, regionIndex}) => {
            const region = this._edgeLayout.regions[regionIndex];
            if (!region) return;

            const left = edgeMap.get(region.left);
            const right = edgeMap.get(region.right);
            const top = edgeMap.get(region.top);
            const bottom = edgeMap.get(region.bottom);

            if (!left || !right || !top || !bottom) return;

            // Calculate pixel dimensions
            const widthPx = Math.round((right.position - left.position) * monitor.width);
            const heightPx = Math.round((bottom.position - top.position) * monitor.height);

            // Update label text
            label.text = `${widthPx}×${heightPx}`;

            // Recalculate position below region number
            const regionX = left.position * monitor.width;
            const regionY = top.position * monitor.height;
            const regionW = (right.position - left.position) * monitor.width;
            const regionH = (bottom.position - top.position) * monitor.height;

            // Get actual label size for centering horizontally
            const labelWidth = label.width || 120;
            const numberOffset = 60; // Offset below center to clear the region number

            label.set_position(
                regionX + (regionW - labelWidth) / 2,
                regionY + (regionH / 2) + numberOffset,
            );
        });
    }

    /**
     * Remove resolution labels
     * @private
     */
    _removeResolutionLabels() {
        this._resolutionLabels.forEach(({label}) => {
            if (label && this._overlay && label.get_parent() === this._overlay) {
                this._overlay.remove_child(label);
                label.destroy();
            }
        });
        this._resolutionLabels = [];
    }

    /**
     * Handle edge drag motion
     * This is where the magic happens - just update the edge position!
     * All regions that reference this edge automatically update.
     * @private
     */
    _onEdgeDragMotion(event) {
        if (!this._draggingEdge) return;

        const [x, y] = event.get_coords();
        const monitor = Main.layoutManager.currentMonitor;
        const edge = this._draggingEdge.edge;

        let newPosition;

        if (edge.type === 'vertical') {
            newPosition = (x - monitor.x) / monitor.width;
        } else {
            newPosition = (y - monitor.y) / monitor.height;
        }

        // Calculate constraints based on adjacent regions
        const {minPos, maxPos} = this._getEdgeConstraints(edge);

        // Clamp to constraints
        newPosition = Math.max(minPos, Math.min(maxPos, newPosition));

        // Update edge position - THIS IS IT! Just one line to move the edge.
        // All regions referencing this edge will automatically reflect the change.
        edge.position = newPosition;

        // DIRECTLY update perpendicular edge bounds during drag (like we do for position)
        // This is more reliable than _recalculateEdgeBounds() during active dragging
        const edgeMap = new Map(this._edgeLayout.edges.map(e => [e.id, e]));
        const affectedRegions = this._findRegionsReferencingEdge(edge.id);

        // For each perpendicular edge, update its bounds based on the dragged edge's new position
        this._edgeLayout.edges.forEach(perpEdge => {
            if (perpEdge.fixed || perpEdge.type === edge.type) return; // Skip same-type and fixed edges

            // Check if this perpendicular edge is used by any of the affected regions
            const perpRegions = this._findRegionsReferencingEdge(perpEdge.id);
            const hasSharedRegion = affectedRegions.some(r => perpRegions.includes(r));

            if (hasSharedRegion) {
                // Recalculate bounds for this perpendicular edge
                if (perpEdge.type === 'vertical') {
                    let minTop = 1.0;
                    let maxBottom = 0.0;
                    perpRegions.forEach(region => {
                        const top = edgeMap.get(region.top);
                        const bottom = edgeMap.get(region.bottom);
                        if (top && bottom) {
                            minTop = Math.min(minTop, top.position);
                            maxBottom = Math.max(maxBottom, bottom.position);
                        }
                    });
                    perpEdge.start = minTop;
                    perpEdge.length = maxBottom - minTop;
                } else {
                    let minLeft = 1.0;
                    let maxRight = 0.0;
                    perpRegions.forEach(region => {
                        const left = edgeMap.get(region.left);
                        const right = edgeMap.get(region.right);
                        if (left && right) {
                            minLeft = Math.min(minLeft, left.position);
                            maxRight = Math.max(maxRight, right.position);
                        }
                    });
                    perpEdge.start = minLeft;
                    perpEdge.length = maxRight - minLeft;
                }
            }
        });

        logger.debug(`[DRAG] Edge ${edge.id} moved to ${newPosition.toFixed(3)}`);

        // Refresh display with updated bounds
        this._refreshDisplay();

        // Update resolution labels (must be after refresh since regions are recreated)
        this._updateResolutionLabels();
    }

    /**
     * Get constraints for an edge based on adjacent regions
     * @private
     */
    _getEdgeConstraints(edge) {
        const edgeMap = new Map(this._edgeLayout.edges.map(e => [e.id, e]));
        let minPos = 0;
        let maxPos = 1;

        if (edge.type === 'vertical') {
            // For vertical edges, find regions on left and right
            this._edgeLayout.regions.forEach(region => {
                const left = edgeMap.get(region.left);
                const right = edgeMap.get(region.right);

                // Region to the left - edge must be at least MIN_SIZE to the right of its left edge
                if (region.right === edge.id) {
                    minPos = Math.max(minPos, left.position + this.MIN_REGION_SIZE);
                }

                // Region to the right - edge must be at least MIN_SIZE to the left of its right edge
                if (region.left === edge.id) {
                    maxPos = Math.min(maxPos, right.position - this.MIN_REGION_SIZE);
                }
            });
        } else {
            // For horizontal edges, find regions above and below
            this._edgeLayout.regions.forEach(region => {
                const top = edgeMap.get(region.top);
                const bottom = edgeMap.get(region.bottom);

                // Region above - edge must be at least MIN_SIZE below its top edge
                if (region.bottom === edge.id) {
                    minPos = Math.max(minPos, top.position + this.MIN_REGION_SIZE);
                }

                // Region below - edge must be at least MIN_SIZE above its bottom edge
                if (region.top === edge.id) {
                    maxPos = Math.min(maxPos, bottom.position - this.MIN_REGION_SIZE);
                }
            });
        }

        return {minPos, maxPos};
    }

    /**
     * Handle edge drag end
     * @private
     */
    _onEdgeDragEnd() {
        if (!this._draggingEdge) return;

        logger.debug(`Ended dragging edge ${this._draggingEdge.edge.id}`);

        // Remove resolution labels before clearing drag state
        this._removeResolutionLabels();

        // Recalculate edge bounds after drag completes
        // This ensures perpendicular edges update their start/length to match new region extents
        this._recalculateEdgeBounds();
        this._logLayoutState('AFTER-EDGE-DRAG');

        this._draggingEdge = null;

        // Refresh display with updated edge bounds
        this._refreshDisplay();
    }

    /**
     * Handle region click
     * @param {number} regionIndex - Index of clicked region
     * @param {Clutter.Event} event - Click event
     * @returns {boolean} EVENT_STOP to prevent propagation
     * @private
     */
    _onRegionClicked(regionIndex, event) {
        const modifiers = event.get_state();
        const shiftPressed = modifiers & Clutter.ModifierType.SHIFT_MASK;

        // Get click position for split location
        const [clickX, clickY] = event.get_coords();

        logger.debug(`Region ${regionIndex} clicked at (${clickX}, ${clickY}) (Shift: ${shiftPressed})`);

        // Shift+Click: Split vertically
        if (shiftPressed) {
            this._splitVertical(regionIndex, clickY);
        }
        // Click: Split horizontally
        else {
            this._splitHorizontal(regionIndex, clickX);
        }

        return Clutter.EVENT_STOP;
    }

    /**
     * Split region horizontally (left/right)
     * @param {number} regionIndex - Index of region to split
     * @param {number} clickX - X coordinate of click (in screen pixels)
     * @private
     */
    _splitHorizontal(regionIndex, clickX) {
        const region = this._edgeLayout.regions[regionIndex];
        const edgeMap = new Map(this._edgeLayout.edges.map(e => [e.id, e]));
        const monitor = Main.layoutManager.currentMonitor;

        const left = edgeMap.get(region.left);
        const right = edgeMap.get(region.right);
        const top = edgeMap.get(region.top);
        const bottom = edgeMap.get(region.bottom);

        // Convert click position to normalized 0-1 position
        let splitPosition = (clickX - monitor.x) / monitor.width;

        // Clamp to ensure minimum region size on both sides
        const minPosition = left.position + this.MIN_REGION_SIZE;
        const maxPosition = right.position - this.MIN_REGION_SIZE;
        splitPosition = Math.max(minPosition, Math.min(maxPosition, splitPosition));

        // Create new vertical edge at click position, spanning this region's height
        const newEdgeId = `v${Date.now()}`;
        const newEdge = {
            id: newEdgeId,
            type: 'vertical',
            position: splitPosition,
            start: top.position,
            length: bottom.position - top.position,
            fixed: false,
        };

        this._edgeLayout.edges.push(newEdge);

        // Create two new regions
        const leftRegion = {
            name: `Zone ${this._edgeLayout.regions.length + 1}`,
            left: region.left,
            right: newEdgeId,
            top: region.top,
            bottom: region.bottom,
        };

        const rightRegion = {
            name: `Zone ${this._edgeLayout.regions.length + 2}`,
            left: newEdgeId,
            right: region.right,
            top: region.top,
            bottom: region.bottom,
        };

        // Replace original region with two new ones
        this._edgeLayout.regions.splice(regionIndex, 1, leftRegion, rightRegion);

        logger.info(`[SPLIT-H] Split region ${regionIndex} horizontally, created edge ${newEdgeId}`);
        logger.info(`[SPLIT-H] Left region: [L:${leftRegion.left}, R:${leftRegion.right}, T:${leftRegion.top}, B:${leftRegion.bottom}]`);
        logger.info(`[SPLIT-H] Right region: [L:${rightRegion.left}, R:${rightRegion.right}, T:${rightRegion.top}, B:${rightRegion.bottom}]`);

        // Recalculate edge bounds to ensure perpendicular edges update their start/length
        this._recalculateEdgeBounds();

        this._logLayoutState('AFTER-SPLIT-HORIZONTAL');
        this._refreshDisplay();
    }

    /**
     * Split region vertically (top/bottom)
     * @param {number} regionIndex - Index of region to split
     * @param {number} clickY - Y coordinate of click (in screen pixels)
     * @private
     */
    _splitVertical(regionIndex, clickY) {
        const region = this._edgeLayout.regions[regionIndex];
        const edgeMap = new Map(this._edgeLayout.edges.map(e => [e.id, e]));
        const monitor = Main.layoutManager.currentMonitor;

        const left = edgeMap.get(region.left);
        const right = edgeMap.get(region.right);
        const top = edgeMap.get(region.top);
        const bottom = edgeMap.get(region.bottom);

        // Convert click position to normalized 0-1 position
        let splitPosition = (clickY - monitor.y) / monitor.height;

        // Clamp to ensure minimum region size on both sides
        const minPosition = top.position + this.MIN_REGION_SIZE;
        const maxPosition = bottom.position - this.MIN_REGION_SIZE;
        splitPosition = Math.max(minPosition, Math.min(maxPosition, splitPosition));

        // Create new horizontal edge at click position, spanning this region's width
        const newEdgeId = `h${Date.now()}`;
        const newEdge = {
            id: newEdgeId,
            type: 'horizontal',
            position: splitPosition,
            start: left.position,
            length: right.position - left.position,
            fixed: false,
        };

        this._edgeLayout.edges.push(newEdge);

        // Create two new regions
        const topRegion = {
            name: `Zone ${this._edgeLayout.regions.length + 1}`,
            left: region.left,
            right: region.right,
            top: region.top,
            bottom: newEdgeId,
        };

        const bottomRegion = {
            name: `Zone ${this._edgeLayout.regions.length + 2}`,
            left: region.left,
            right: region.right,
            top: newEdgeId,
            bottom: region.bottom,
        };

        // Replace original region with two new ones
        this._edgeLayout.regions.splice(regionIndex, 1, topRegion, bottomRegion);

        logger.info(`[SPLIT-V] Split region ${regionIndex} vertically, created edge ${newEdgeId}`);
        logger.info(`[SPLIT-V] Top region: [L:${topRegion.left}, R:${topRegion.right}, T:${topRegion.top}, B:${topRegion.bottom}]`);
        logger.info(`[SPLIT-V] Bottom region: [L:${bottomRegion.left}, R:${bottomRegion.right}, T:${bottomRegion.top}, B:${bottomRegion.bottom}]`);

        // Recalculate edge bounds to ensure perpendicular edges update their start/length
        this._recalculateEdgeBounds();

        this._logLayoutState('AFTER-SPLIT-VERTICAL');
        this._refreshDisplay();
    }

    /**
     * Delete a region by merging with adjacent region
     * @param {number} regionIndex - Index of region to delete
     * @private
     */
    _deleteRegion(regionIndex) {
        // Must keep at least one region
        if (this._edgeLayout.regions.length <= 1) {
            logger.warn('Cannot delete last region');
            return;
        }

        const region = this._edgeLayout.regions[regionIndex];
        logger.info(`Deleting region ${regionIndex}`);

        // Find adjacent region to merge with
        let mergeIndex = -1;

        for (let i = 0; i < this._edgeLayout.regions.length; i++) {
            if (i === regionIndex) continue;

            const other = this._edgeLayout.regions[i];

            // Check if they share an edge (any edge in common means adjacent)
            if (other.left === region.right || other.right === region.left ||
                other.top === region.bottom || other.bottom === region.top) {
                mergeIndex = i;
                break;
            }
        }

        if (mergeIndex >= 0) {
            const other = this._edgeLayout.regions[mergeIndex];
            const edgeMap = new Map(this._edgeLayout.edges.map(e => [e.id, e]));

            // Merge by taking the union of bounds
            const mergedRegion = {
                name: other.name,
                left: this._minEdge(region.left, other.left, edgeMap),
                right: this._maxEdge(region.right, other.right, edgeMap),
                top: this._minEdge(region.top, other.top, edgeMap),
                bottom: this._maxEdge(region.bottom, other.bottom, edgeMap),
            };

            // Remove both regions and add merged one
            const indicesToRemove = [regionIndex, mergeIndex].sort((a, b) => b - a);
            indicesToRemove.forEach(idx => this._edgeLayout.regions.splice(idx, 1));
            this._edgeLayout.regions.push(mergedRegion);

            // Clean up unused edges
            this._cleanupUnusedEdges();

            this._refreshDisplay();
        } else {
            logger.warn('No adjacent region found to merge with');
        }
    }

    /**
     * Get edge with minimum position
     * @private
     */
    _minEdge(edge1Id, edge2Id, edgeMap) {
        const e1 = edgeMap.get(edge1Id);
        const e2 = edgeMap.get(edge2Id);
        return e1.position < e2.position ? edge1Id : edge2Id;
    }

    /**
     * Get edge with maximum position
     * @private
     */
    _maxEdge(edge1Id, edge2Id, edgeMap) {
        const e1 = edgeMap.get(edge1Id);
        const e2 = edgeMap.get(edge2Id);
        return e1.position > e2.position ? edge1Id : edge2Id;
    }

    /**
     * Remove edges that are not referenced by any region
     * @private
     */
    _cleanupUnusedEdges() {
        const usedEdges = new Set();

        this._edgeLayout.regions.forEach(region => {
            usedEdges.add(region.left);
            usedEdges.add(region.right);
            usedEdges.add(region.top);
            usedEdges.add(region.bottom);
        });

        const beforeCount = this._edgeLayout.edges.length;
        this._edgeLayout.edges = this._edgeLayout.edges.filter(edge =>
            edge.fixed || usedEdges.has(edge.id),
        );

        const removed = beforeCount - this._edgeLayout.edges.length;
        if (removed > 0) {
            logger.debug(`Cleaned up ${removed} unused edges`);
        }
    }

    /**
     * Recalculate start and length for all non-fixed edges based on regions that reference them
     * This is critical after edge deletion/region merging to ensure edge bounds match their actual extent
     * @private
     */
    _recalculateEdgeBounds() {
        const edgeMap = new Map(this._edgeLayout.edges.map(e => [e.id, e]));

        // For each non-fixed edge, recalculate its bounds
        this._edgeLayout.edges.forEach(edge => {
            if (edge.fixed) return; // Skip boundary edges

            // Find all regions that reference this edge
            const regions = this._findRegionsReferencingEdge(edge.id);

            if (regions.length === 0) {
                logger.warn(`[EDGE-BOUNDS] Edge ${edge.id} has no referencing regions (should be cleaned up)`);
                return;
            }

            if (edge.type === 'vertical') {
                // For vertical edges: calculate bounds in perpendicular (Y) direction
                // start = minimum top position, length = max bottom - min top
                let minTop = 1.0;
                let maxBottom = 0.0;

                regions.forEach(region => {
                    const top = edgeMap.get(region.top);
                    const bottom = edgeMap.get(region.bottom);

                    if (top && bottom) {
                        minTop = Math.min(minTop, top.position);
                        maxBottom = Math.max(maxBottom, bottom.position);
                    }
                });

                const oldStart = edge.start;
                const oldLength = edge.length;

                edge.start = minTop;
                edge.length = maxBottom - minTop;

                if (Math.abs(oldStart - edge.start) > 0.001 || Math.abs(oldLength - edge.length) > 0.001) {
                    logger.info(`[EDGE-BOUNDS] Updated vertical edge ${edge.id}: start ${oldStart.toFixed(3)}→${edge.start.toFixed(3)}, len ${oldLength.toFixed(3)}→${edge.length.toFixed(3)}`);
                }
            } else {
                // For horizontal edges: calculate bounds in perpendicular (X) direction
                // start = minimum left position, length = max right - min left
                let minLeft = 1.0;
                let maxRight = 0.0;

                regions.forEach(region => {
                    const left = edgeMap.get(region.left);
                    const right = edgeMap.get(region.right);

                    if (left && right) {
                        minLeft = Math.min(minLeft, left.position);
                        maxRight = Math.max(maxRight, right.position);
                    }
                });

                const oldStart = edge.start;
                const oldLength = edge.length;

                edge.start = minLeft;
                edge.length = maxRight - minLeft;

                if (Math.abs(oldStart - edge.start) > 0.001 || Math.abs(oldLength - edge.length) > 0.001) {
                    logger.info(`[EDGE-BOUNDS] Updated horizontal edge ${edge.id}: start ${oldStart.toFixed(3)}→${edge.start.toFixed(3)}, len ${oldLength.toFixed(3)}→${edge.length.toFixed(3)}`);
                }
            }
        });
    }

    /**
     * Find all regions that reference a given edge
     * @param {string} edgeId - Edge ID to search for
     * @returns {Array} Array of regions referencing this edge
     * @private
     */
    _findRegionsReferencingEdge(edgeId) {
        return this._edgeLayout.regions.filter(region =>
            region.left === edgeId ||
            region.right === edgeId ||
            region.top === edgeId ||
            region.bottom === edgeId,
        );
    }

    /**
     * Check if an edge can be safely deleted
     * @param {Object} edge - Edge to check
     * @returns {boolean} True if edge can be deleted
     * @private
     */
    _canDeleteEdge(edge) {
        // Never delete fixed boundary edges
        if (edge.fixed) {
            return false;
        }

        // Must keep at least 2 regions
        if (this._edgeLayout.regions.length <= 1) {
            return false;
        }

        // Find all regions using this edge
        const regions = this._findRegionsReferencingEdge(edge.id);

        // Must have at least one region using this edge
        if (regions.length === 0) {
            return false;
        }

        // Group regions by side
        const leftOrTopRegions = [];
        const rightOrBottomRegions = [];

        regions.forEach(region => {
            if (edge.type === 'vertical') {
                if (region.right === edge.id) {
                    leftOrTopRegions.push(region);
                } else if (region.left === edge.id) {
                    rightOrBottomRegions.push(region);
                }
            } else {
                if (region.bottom === edge.id) {
                    leftOrTopRegions.push(region);
                } else if (region.top === edge.id) {
                    rightOrBottomRegions.push(region);
                }
            }
        });

        // Must have regions on both sides
        if (leftOrTopRegions.length === 0 || rightOrBottomRegions.length === 0) {
            logger.warn(`[EDGE-DELETE] Edge ${edge.id} only has regions on one side`);
            return false;
        }

        // Check if ANY region from one side OVERLAPS with ANY region from the other side
        // in the perpendicular direction (uses position-based overlap, not exact edge ID matching)
        const edgeMap = new Map(this._edgeLayout.edges.map(e => [e.id, e]));
        let hasOverlap = false;

        if (edge.type === 'vertical') {
            // For vertical edges: check perpendicular (vertical/Y-axis) overlap
            for (const leftReg of leftOrTopRegions) {
                const leftTop = edgeMap.get(leftReg.top).position;
                const leftBottom = edgeMap.get(leftReg.bottom).position;

                for (const rightReg of rightOrBottomRegions) {
                    const rightTop = edgeMap.get(rightReg.top).position;
                    const rightBottom = edgeMap.get(rightReg.bottom).position;

                    // Overlap: leftTop < rightBottom AND leftBottom > rightTop
                    if (leftTop < rightBottom && leftBottom > rightTop) {
                        hasOverlap = true;
                        break;
                    }
                }
                if (hasOverlap) break;
            }
        } else {
            // For horizontal edges: check perpendicular (horizontal/X-axis) overlap
            for (const topReg of leftOrTopRegions) {
                const topLeft = edgeMap.get(topReg.left).position;
                const topRight = edgeMap.get(topReg.right).position;

                for (const bottomReg of rightOrBottomRegions) {
                    const bottomLeft = edgeMap.get(bottomReg.left).position;
                    const bottomRight = edgeMap.get(bottomReg.right).position;

                    // Overlap: topLeft < bottomRight AND topRight > bottomLeft
                    if (topLeft < bottomRight && topRight > bottomLeft) {
                        hasOverlap = true;
                        break;
                    }
                }
                if (hasOverlap) break;
            }
        }

        logger.debug(`[EDGE-DELETE] Edge ${edge.id}: leftOrTop=${leftOrTopRegions.length}, rightOrBottom=${rightOrBottomRegions.length}, hasOverlap=${hasOverlap}`);

        return hasOverlap;
    }

    /**
     * Delete an edge by merging regions across it while preserving other edges
     * @param {Object} edge - Edge to delete
     * @private
     */
    _deleteEdge(edge) {
        // Safety check
        if (!this._canDeleteEdge(edge)) {
            logger.warn(`[EDGE-DELETE] Cannot delete edge ${edge.id}: safety check failed`);
            this._showCenteredNotification('Cannot delete this edge', 'This would create an invalid layout');
            return;
        }

        logger.info(`[EDGE-DELETE] Deleting edge ${edge.id} (${edge.type} at ${edge.position.toFixed(3)})`);

        const regions = this._findRegionsReferencingEdge(edge.id);
        logger.info(`[EDGE-DELETE] Found ${regions.length} regions referencing this edge`);

        if (regions.length === 0) {
            logger.error('[EDGE-DELETE] No regions reference this edge - should not happen');
            return;
        }

        const edgeMap = new Map(this._edgeLayout.edges.map(e => [e.id, e]));

        // Group regions by which side of the edge they're on
        const leftOrTopRegions = [];
        const rightOrBottomRegions = [];

        regions.forEach(region => {
            if (edge.type === 'vertical') {
                // Vertical edge: group by left/right
                if (region.right === edge.id) {
                    leftOrTopRegions.push(region);
                } else if (region.left === edge.id) {
                    rightOrBottomRegions.push(region);
                }
            } else {
                // Horizontal edge: group by top/bottom
                if (region.bottom === edge.id) {
                    leftOrTopRegions.push(region);
                } else if (region.top === edge.id) {
                    rightOrBottomRegions.push(region);
                }
            }
        });

        logger.info(`[EDGE-DELETE] Left/Top side: ${leftOrTopRegions.length}, Right/Bottom side: ${rightOrBottomRegions.length}`);

        // Merge regions that overlap in the perpendicular direction
        // Strategy: Process whichever side has MORE regions (to preserve maximum granularity)
        // Example: 1 left + 2 right → process 2 right regions → 2 merged regions
        // Example: 3 top + 1 bottom → process 3 top regions → 3 merged regions
        const newRegions = [];
        const processed = new Set();

        // Determine which side to process (the one with more regions)
        let primaryRegions, secondaryRegions;
        let processPrimary; // function to process each primary region

        if (edge.type === 'vertical') {
            // For vertical edges
            if (leftOrTopRegions.length >= rightOrBottomRegions.length) {
                // More regions on left → process LEFT regions
                primaryRegions = leftOrTopRegions;
                secondaryRegions = rightOrBottomRegions;

                processPrimary = (leftReg) => {
                    const leftTop = edgeMap.get(leftReg.top).position;
                    const leftBottom = edgeMap.get(leftReg.bottom).position;

                    logger.debug(`[EDGE-DELETE] Processing left region: top=${leftTop.toFixed(3)}, bottom=${leftBottom.toFixed(3)}`);

                    // Find all right regions that overlap with this left region vertically
                    const matchingRightRegions = secondaryRegions.filter(rightReg => {
                        const rightTop = edgeMap.get(rightReg.top).position;
                        const rightBottom = edgeMap.get(rightReg.bottom).position;

                        const overlaps = leftTop < rightBottom && leftBottom > rightTop;
                        logger.debug(`[EDGE-DELETE]   Right region: top=${rightTop.toFixed(3)}, bottom=${rightBottom.toFixed(3)}, overlaps=${overlaps}`);

                        return overlaps;
                    });

                    logger.debug(`[EDGE-DELETE] Found ${matchingRightRegions.length} matching right regions`);

                    if (matchingRightRegions.length > 0) {
                        // Merge: keep left region's vertical bounds, expand right to include right side
                        const merged = {
                            name: leftReg.name,
                            left: leftReg.left,                  // Keep left edge from left region
                            right: matchingRightRegions[0].right, // Use right edge from right region
                            top: leftReg.top,                    // Keep left region's vertical bounds
                            bottom: leftReg.bottom,
                        };

                        logger.info(`[EDGE-DELETE] Merged vertical (L-first): [L:${merged.left}, R:${merged.right}, T:${merged.top}, B:${merged.bottom}] from ${1 + matchingRightRegions.length} regions`);
                        newRegions.push(merged);
                    }
                };
            } else {
                // More regions on right → process RIGHT regions
                primaryRegions = rightOrBottomRegions;
                secondaryRegions = leftOrTopRegions;

                processPrimary = (rightReg) => {
                    const rightTop = edgeMap.get(rightReg.top).position;
                    const rightBottom = edgeMap.get(rightReg.bottom).position;

                    logger.debug(`[EDGE-DELETE] Processing right region: top=${rightTop.toFixed(3)}, bottom=${rightBottom.toFixed(3)}`);

                    // Find all left regions that overlap with this right region vertically
                    const matchingLeftRegions = secondaryRegions.filter(leftReg => {
                        const leftTop = edgeMap.get(leftReg.top).position;
                        const leftBottom = edgeMap.get(leftReg.bottom).position;

                        const overlaps = leftTop < rightBottom && leftBottom > rightTop;
                        logger.debug(`[EDGE-DELETE]   Left region: top=${leftTop.toFixed(3)}, bottom=${leftBottom.toFixed(3)}, overlaps=${overlaps}`);

                        return overlaps;
                    });

                    logger.debug(`[EDGE-DELETE] Found ${matchingLeftRegions.length} matching left regions`);

                    if (matchingLeftRegions.length > 0) {
                        // Merge: keep right region's vertical bounds, expand left to include left side
                        const merged = {
                            name: rightReg.name,
                            left: matchingLeftRegions[0].left,  // Use left edge from left region
                            right: rightReg.right,              // Keep right edge from right region
                            top: rightReg.top,                  // Keep right region's vertical bounds
                            bottom: rightReg.bottom,
                        };

                        logger.info(`[EDGE-DELETE] Merged vertical (R-first): [L:${merged.left}, R:${merged.right}, T:${merged.top}, B:${merged.bottom}] from ${1 + matchingLeftRegions.length} regions`);
                        newRegions.push(merged);
                    }
                };
            }
        } else {
            // For horizontal edges
            if (leftOrTopRegions.length >= rightOrBottomRegions.length) {
                // More regions on top → process TOP regions
                primaryRegions = leftOrTopRegions;
                secondaryRegions = rightOrBottomRegions;

                processPrimary = (topReg) => {
                    const topLeft = edgeMap.get(topReg.left).position;
                    const topRight = edgeMap.get(topReg.right).position;

                    logger.debug(`[EDGE-DELETE] Processing top region: left=${topLeft.toFixed(3)}, right=${topRight.toFixed(3)}`);

                    // Find all bottom regions that overlap with this top region horizontally
                    const matchingBottomRegions = secondaryRegions.filter(bottomReg => {
                        const bottomLeft = edgeMap.get(bottomReg.left).position;
                        const bottomRight = edgeMap.get(bottomReg.right).position;

                        const overlaps = topLeft < bottomRight && topRight > bottomLeft;
                        logger.debug(`[EDGE-DELETE]   Bottom region: left=${bottomLeft.toFixed(3)}, right=${bottomRight.toFixed(3)}, overlaps=${overlaps}`);

                        return overlaps;
                    });

                    logger.debug(`[EDGE-DELETE] Found ${matchingBottomRegions.length} matching bottom regions`);

                    if (matchingBottomRegions.length > 0) {
                        // Merge: keep top region's horizontal bounds, expand down to include bottom side
                        const merged = {
                            name: topReg.name,
                            left: topReg.left,                      // Keep top region's horizontal bounds
                            right: topReg.right,
                            top: topReg.top,                        // Keep top edge from top region
                            bottom: matchingBottomRegions[0].bottom, // Use bottom edge from bottom region
                        };

                        logger.info(`[EDGE-DELETE] Merged horizontal (T-first): [L:${merged.left}, R:${merged.right}, T:${merged.top}, B:${merged.bottom}] from ${1 + matchingBottomRegions.length} regions`);
                        newRegions.push(merged);
                    }
                };
            } else {
                // More regions on bottom → process BOTTOM regions
                primaryRegions = rightOrBottomRegions;
                secondaryRegions = leftOrTopRegions;

                processPrimary = (bottomReg) => {
                    const bottomLeft = edgeMap.get(bottomReg.left).position;
                    const bottomRight = edgeMap.get(bottomReg.right).position;

                    logger.debug(`[EDGE-DELETE] Processing bottom region: left=${bottomLeft.toFixed(3)}, right=${bottomRight.toFixed(3)}`);

                    // Find all top regions that overlap with this bottom region horizontally
                    const matchingTopRegions = secondaryRegions.filter(topReg => {
                        const topLeft = edgeMap.get(topReg.left).position;
                        const topRight = edgeMap.get(topReg.right).position;

                        const overlaps = topLeft < bottomRight && topRight > bottomLeft;
                        logger.debug(`[EDGE-DELETE]   Top region: left=${topLeft.toFixed(3)}, right=${topRight.toFixed(3)}, overlaps=${overlaps}`);

                        return overlaps;
                    });

                    logger.debug(`[EDGE-DELETE] Found ${matchingTopRegions.length} matching top regions`);

                    if (matchingTopRegions.length > 0) {
                        // Merge: keep bottom region's horizontal bounds, expand up to include top side
                        const merged = {
                            name: bottomReg.name,
                            left: bottomReg.left,               // Keep bottom region's horizontal bounds
                            right: bottomReg.right,
                            top: matchingTopRegions[0].top,     // Use top edge from top region
                            bottom: bottomReg.bottom,            // Keep bottom edge from bottom region
                        };

                        logger.info(`[EDGE-DELETE] Merged horizontal (B-first): [L:${merged.left}, R:${merged.right}, T:${merged.top}, B:${merged.bottom}] from ${1 + matchingTopRegions.length} regions`);
                        newRegions.push(merged);
                    }
                };
            }
        }

        // Now process all primary regions
        primaryRegions.forEach(reg => {
            if (processed.has(reg)) return;
            processPrimary(reg);
            processed.add(reg);
        });

        logger.info(`[EDGE-DELETE] Created ${newRegions.length} merged regions from ${regions.length} original regions`);

        // Remove all old regions
        regions.forEach(region => {
            const index = this._edgeLayout.regions.indexOf(region);
            if (index >= 0) {
                this._edgeLayout.regions.splice(index, 1);
            }
        });

        // Add new merged regions
        newRegions.forEach(region => {
            this._edgeLayout.regions.push(region);
        });

        // Remove the edge
        const edgeIndex = this._edgeLayout.edges.findIndex(e => e.id === edge.id);
        if (edgeIndex >= 0) {
            logger.info(`[EDGE-DELETE] Removing edge ${edge.id} from edges array`);
            this._edgeLayout.edges.splice(edgeIndex, 1);
        }

        // Clean up any orphaned edges
        this._cleanupUnusedEdges();

        // Recalculate edge bounds to ensure hit targets match actual extent
        this._recalculateEdgeBounds();

        logger.info('[EDGE-DELETE] Edge deletion complete');
        this._logLayoutState('AFTER-EDGE-DELETE');

        // Refresh display
        this._refreshDisplay();
    }

    /**
     * Show a centered notification message
     * @param {string} title - Notification title
     * @param {string} message - Notification message
     * @private
     */
    _showCenteredNotification(title, message) {
        const monitor = Main.layoutManager.currentMonitor;
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        const scaleFactor = themeContext.scale_factor;
        const colors = this._themeManager.getColors();

        const notificationBox = new St.BoxLayout({
            vertical: false,
            style: `spacing: 12px; padding: 20px; background-color: ${colors.helpBoxBg}; border-radius: 8px;`,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Warning icon (⚠) - yellow/orange warning color (theme-independent)
        const icon = new St.Label({
            text: '⚠',
            style: 'font-size: 24pt; color: rgb(255, 193, 7);',
        });
        notificationBox.add_child(icon);

        // Text container - scale width for HiDPI
        const textBox = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 4px;',
            width: 480 * scaleFactor,
        });

        const titleLabel = new St.Label({
            text: title,
            style: `font-size: 12pt; font-weight: bold; color: ${colors.textPrimary};`,
        });
        titleLabel.clutter_text.line_wrap = true;
        titleLabel.clutter_text.ellipsize = 0; // NONE
        textBox.add_child(titleLabel);

        const messageLabel = new St.Label({
            text: message,
            style: `font-size: 10pt; color: ${colors.textSecondary};`,
        });
        messageLabel.clutter_text.line_wrap = true;
        messageLabel.clutter_text.ellipsize = 0; // NONE
        messageLabel.clutter_text.line_wrap_mode = 2; // WORD_CHAR
        textBox.add_child(messageLabel);

        notificationBox.add_child(textBox);

        // Calculate width based on content - scale for HiDPI
        // icon (40px) + text (480px) + spacing (12px) + padding (40px) = 572px
        const boxWidth = 572 * scaleFactor;
        notificationBox.set_position(
            (monitor.width - boxWidth) / 2,
            (monitor.height / 2) - (50 * scaleFactor),
        );

        // Add to overlay (high Z-order since added last)
        this._overlay.add_child(notificationBox);

        // Auto-remove after 2.5 seconds
        setTimeout(() => {
            if (this._overlay && notificationBox.get_parent() === this._overlay) {
                this._overlay.remove_child(notificationBox);
                notificationBox.destroy();
            }
        }, 2500);
    }

    /**
     * Find an edge ID at a specific position
     * @param {string} type - Edge type ('vertical' or 'horizontal')
     * @param {number} position - Position to search for
     * @param {Map} edgeMap - Map of edge IDs to edges
     * @returns {string} Edge ID at that position
     * @private
     */
    _findEdgeAtPosition(type, position, edgeMap) {
        for (const [id, edge] of edgeMap) {
            if (edge.type === type && Math.abs(edge.position - position) < 0.001) {
                return id;
            }
        }
        // If not found, this is a problem - but return something
        logger.error(`Could not find ${type} edge at position ${position}`);
        return null;
    }

    /**
     * Refresh display after layout changes
     * @private
     */
    _refreshDisplay() {
        logger.info('[REFRESH] Starting display refresh');
        logger.info(`[REFRESH] Current state: ${this._regionActors.length} region actors, ${this._edgeActors.length} edge actors`);
        logger.info(`[REFRESH] Data state: ${this._edgeLayout.regions.length} regions, ${this._edgeLayout.edges.length} edges`);

        // Remove old actors (but keep help text and toolbar)
        const oldRegionCount = this._regionActors.length;
        const oldEdgeCount = this._edgeActors.length;

        this._regionActors.forEach(actor => {
            this._overlay.remove_child(actor);
            actor.destroy();
        });
        this._regionActors = [];

        // Remove edge actors (now objects with lineActor only)
        this._edgeActors.forEach(edgeObj => {
            this._overlay.remove_child(edgeObj.lineActor);
            edgeObj.lineActor.destroy();
        });
        this._edgeActors = [];

        logger.info(`[REFRESH] Cleanup complete: removed ${oldRegionCount} region actors, ${oldEdgeCount} edge actors`);
        logger.info(`[REFRESH] Creating new actors for ${this._edgeLayout.regions.length} regions, ${this._edgeLayout.edges.filter(e => !e.fixed).length} edges`);

        // Recreate regions and edges
        this._createRegions();
        this._createEdges();

        // CRITICAL: Remove and re-add toolbar and help text to ensure they're on top
        // In Clutter, last child added = highest Z-order
        if (this._toolbar && this._toolbar.get_parent() === this._overlay) {
            this._overlay.remove_child(this._toolbar);
            this._overlay.add_child(this._toolbar);
            logger.debug('Re-added toolbar to top of Z-order');
        }
        if (this._helpTextBox && this._helpTextBox.get_parent() === this._overlay) {
            this._overlay.remove_child(this._helpTextBox);
            this._overlay.add_child(this._helpTextBox);
            logger.debug('Re-added help text to top of Z-order');
        }
    }

    /**
     * Create toolbar with Save/Cancel buttons
     * @private
     */
    _createToolbar() {
        const monitor = Main.layoutManager.currentMonitor;
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        const scaleFactor = themeContext.scale_factor;
        const colors = this._themeManager.getColors();

        this._toolbar = new St.BoxLayout({
            style: `spacing: 12px; padding: 16px; background-color: ${colors.toolbarBg}; border-radius: 8px;`,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.END,
        });

        // Scale the toolbar width and position for HiDPI displays
        const toolbarWidth = 250 * scaleFactor;
        const toolbarHeight = 80 * scaleFactor;

        this._toolbar.set_position(
            (monitor.width - toolbarWidth) / 2,
            monitor.height - toolbarHeight,
        );
        this._toolbar.width = toolbarWidth;

        // Save button - uses system accent color
        const saveButton = new St.Button({
            label: 'Save Layout',
            style_class: 'button',
            style: `padding: 8px 24px; background-color: ${colors.accentHex}; color: white; border-radius: 4px; font-weight: bold;`,
        });
        saveButton.connect('clicked', () => this._onSave());

        // Hover effect for Save button
        saveButton.connect('enter-event', () => {
            saveButton.style = `padding: 8px 24px; background-color: ${colors.accentHexHover}; color: white; border-radius: 4px; font-weight: bold;`;
        });
        saveButton.connect('leave-event', () => {
            saveButton.style = `padding: 8px 24px; background-color: ${colors.accentHex}; color: white; border-radius: 4px; font-weight: bold;`;
        });

        this._toolbar.add_child(saveButton);

        // Cancel button - uses neutral theme-aware color
        const cancelButton = new St.Button({
            label: 'Cancel',
            style_class: 'button',
            style: `padding: 8px 24px; background-color: ${colors.buttonBg}; color: ${colors.buttonText}; border-radius: 4px;`,
        });
        cancelButton.connect('clicked', () => this._onCancel());

        // Hover effect for Cancel button
        cancelButton.connect('enter-event', () => {
            cancelButton.style = `padding: 8px 24px; background-color: ${colors.buttonBgHover}; color: ${colors.buttonText}; border-radius: 4px;`;
        });
        cancelButton.connect('leave-event', () => {
            cancelButton.style = `padding: 8px 24px; background-color: ${colors.buttonBg}; color: ${colors.buttonText}; border-radius: 4px;`;
        });

        this._toolbar.add_child(cancelButton);

        this._overlay.add_child(this._toolbar);
    }

    /**
     * Setup keyboard event handlers
     * @private
     */
    _setupKeyboardHandlers() {
        this._overlay.connect('key-press-event', (actor, event) => {
            const keySymbol = event.get_key_symbol();

            switch (keySymbol) {
                case Clutter.KEY_Escape:
                    this._onCancel();
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Return:
                case Clutter.KEY_KP_Enter:
                    this._onSave();
                    return Clutter.EVENT_STOP;

                default:
                    return Clutter.EVENT_PROPAGATE;
            }
        });
    }


    /**
     * Handle save action
     * @private
     */
    _onSave() {
        // One-shot guard: prevent multiple invocations
        if (this._saveExecuted) {
            logger.warn('Save already executed, ignoring duplicate call');
            return;
        }
        this._saveExecuted = true;

        logger.info('Saving grid editor layout');

        // Validate edge layout
        const isValid = validateEdgeLayout(this._edgeLayout);
        if (!isValid) {
            logger.error('Layout validation failed');
            this._showCenteredNotification('Invalid Layout', 'This layout cannot be saved');
            return;
        }

        // Convert edge-based back to zone-based
        const zoneLayout = edgesToZones(this._edgeLayout);

        logger.debug(`Converted to ${zoneLayout.zones.length} zones`);

        // Hide editor
        this.hide();

        // Call save callback with zone-based layout
        if (this._onSaveCallback) {
            this._onSaveCallback(zoneLayout);
        }
    }

    /**
     * Handle cancel action
     * @private
     */
    _onCancel() {
        // One-shot guard: prevent multiple invocations
        if (this._cancelExecuted) {
            logger.warn('Cancel already executed, ignoring duplicate call');
            return;
        }
        this._cancelExecuted = true;

        logger.info('Cancelling grid editor');
        this.hide();

        // Call the cancel callback if provided
        if (this._onCancelCallback) {
            logger.debug('Calling onCancel callback to reopen layout picker');
            this._onCancelCallback();
        } else {
            logger.warn('No cancel callback provided - cannot reopen layout picker');
        }
    }

    /**
     * Get GNOME system accent color
     * @private
     */
    _getAccentColor() {
        try {
            const interfaceSettings = new Gio.Settings({schema: 'org.gnome.desktop.interface'});
            const accentColorName = interfaceSettings.get_string('accent-color');

            const accentColors = {
                'blue': {red: 0.29, green: 0.56, blue: 0.85},
                'teal': {red: 0.13, green: 0.63, blue: 0.62},
                'green': {red: 0.38, green: 0.68, blue: 0.33},
                'yellow': {red: 0.84, green: 0.65, blue: 0.13},
                'orange': {red: 0.92, green: 0.49, blue: 0.18},
                'red': {red: 0.88, green: 0.29, blue: 0.29},
                'pink': {red: 0.90, green: 0.39, blue: 0.64},
                'purple': {red: 0.60, green: 0.41, blue: 0.82},
                'slate': {red: 0.45, green: 0.52, blue: 0.60},
            };

            return accentColors[accentColorName] || accentColors['blue'];
        } catch (e) {
            logger.warn('Failed to get accent color:', e);
            return {red: 0.29, green: 0.56, blue: 0.85};
        }
    }

    /**
     * Convert RGB values (0-1) to hex color string
     * @private
     */
    _rgbToHex(r, g, b) {
        const toHex = (val) => {
            const hex = Math.round(val * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.hide();
        logger.debug('ZoneEditor destroyed');
    }
}
