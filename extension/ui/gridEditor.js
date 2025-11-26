/**
 * GridEditor - Full-screen grid editor for custom layouts (Edge-based)
 * 
 * FancyZones-style visual editor with edge-based data structure:
 * - Click region: Split horizontally
 * - Shift+Click: Split vertically
 * - Drag edges: Resize (affects all regions sharing that edge)
 * - Ctrl+Click: Delete/merge region
 * - Save/Cancel workflow
 * 
 * Part of FancyZones-style implementation (Sprint 3/4)
 */

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Shell from 'gi://Shell';
import { createLogger } from '../utils/debug.js';
import { zonesToEdges, edgesToZones, validateEdgeLayout } from '../utils/layoutConverter.js';

const logger = createLogger('GridEditor');

/**
 * GridEditor - Full-screen visual layout editor (edge-based)
 * 
 * Usage:
 *   const editor = new GridEditor(
 *       currentLayout,  // zone-based layout
 *       profileManager,
 *       (layout) => profileManager.updateCurrentLayout(layout)  // receives zone-based
 *   );
 *   editor.show();
 */
export class GridEditor {
    /**
     * Create a new grid editor
     * @param {Object} zoneLayout - Initial zone-based layout to edit
     * @param {ProfileManager} profileManager - Profile manager instance
     * @param {Function} onSave - Callback when user saves (receives zone-based layout)
     * @param {Function} onCancel - Callback when user cancels (optional)
     */
    constructor(zoneLayout, profileManager, onSave, onCancel = null) {
        // Convert zone-based to edge-based for internal editing
        this._edgeLayout = zonesToEdges(JSON.parse(JSON.stringify(zoneLayout)));
        this._profileManager = profileManager;
        this._onSaveCallback = onSave;
        this._onCancelCallback = onCancel;
        
        this._overlay = null;
        this._regionActors = [];
        this._edgeActors = [];  // Now contains {lineActor, handleActor, edge}
        this._modalId = null;
        this._draggingEdge = null;
        this._currentHandle = null;  // Currently visible handle
        this._helpTextBox = null;  // Store reference to help text for Z-order management
        this._toolbar = null;  // Store reference to toolbar for Z-order management
        
        // Minimum region size (10% of screen dimension)
        this.MIN_REGION_SIZE = 0.1;
        
        logger.debug('GridEditor created (edge-based)');
        logger.debug(`Initial state: ${this._edgeLayout.regions.length} regions, ${this._edgeLayout.edges.length} edges`);
        this._logLayoutState('CONSTRUCTOR');
    }

    /**
     * Log current layout state for debugging
     * @param {string} context - Context label for this log
     * @private
     */
    _logLayoutState(context) {
        logger.info(`=== LAYOUT STATE [${context}] ===`);
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
        
        logger.info(`=== END LAYOUT STATE ===`);
    }

    /**
     * Show the grid editor
     */
    show() {
        const monitor = Main.layoutManager.primaryMonitor;
        
        logger.info('Showing grid editor');
        
        // Create full-screen overlay
        this._overlay = new St.Widget({
            style_class: 'grid-editor-overlay',
            reactive: true,
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height
        });
        
        // Dim background
        this._overlay.style = 'background-color: rgba(0, 0, 0, 0.7);';
        
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
            actionMode: Shell.ActionMode.NORMAL
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
                logger.info(`[DRAG] Button release - ending drag`);
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
        this._helpTextBox = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 8px; padding: 20px; background-color: rgba(30, 30, 30, 0.95); border-radius: 8px;',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.START
        });
        
        const monitor = Main.layoutManager.primaryMonitor;
        this._helpTextBox.set_position(monitor.x + (monitor.width - 800) / 2, monitor.y + 20);
        this._helpTextBox.width = 800;
        
        const title = new St.Label({
            text: 'Grid Editor',
            style: 'font-size: 14pt; font-weight: bold; color: white; margin-bottom: 8px;'
        });
        this._helpTextBox.add_child(title);
        
        const instructions = [
            'Click region: Split horizontally  •  Shift+Click: Split vertically',
            'Hover edge + Ctrl+Click: Delete edge  •  Drag edge handle: Resize zones',
            'Esc: Cancel  •  Enter: Save layout'
        ];
        
        instructions.forEach(text => {
            const label = new St.Label({
                text: text,
                style: 'font-size: 11pt; color: #e0e0e0;'
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
        const monitor = Main.layoutManager.primaryMonitor;
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
                x: monitor.x + left.position * monitor.width,
                y: monitor.y + top.position * monitor.height,
                width: (right.position - left.position) * monitor.width,
                height: (bottom.position - top.position) * monitor.height
            });
            
            // Region styling - blue with semi-transparent fill
            actor.style = `
                background-color: rgba(28, 113, 216, 0.3);
                border: 3px solid rgb(28, 113, 216);
                border-radius: 4px;
            `;
            
            // Region number label
            const label = new St.Label({
                text: `${index + 1}`,
                style: 'font-size: 72pt; color: white; font-weight: bold;'
            });
            actor.set_child(label);
            
            // Click to split
            actor.connect('button-press-event', (actor, event) => {
                return this._onRegionClicked(index, event);
            });
            
            // Hover effect
            actor.connect('enter-event', () => {
                actor.style = `
                    background-color: rgba(28, 113, 216, 0.5);
                    border: 3px solid rgb(53, 132, 228);
                    border-radius: 4px;
                `;
            });
            
            actor.connect('leave-event', () => {
                actor.style = `
                    background-color: rgba(28, 113, 216, 0.3);
                    border: 3px solid rgb(28, 113, 216);
                    border-radius: 4px;
                `;
            });
            
            this._overlay.add_child(actor);
            this._regionActors.push(actor);
        });
        
        logger.debug(`Created ${this._regionActors.length} region actors`);
    }

    /**
     * Create edge actors with drag handles
     * Each edge has a line (for hover detection) and a handle (for dragging)
     * @private
     */
    _createEdges() {
        const monitor = Main.layoutManager.primaryMonitor;
        
        // Only create actors for non-fixed edges (not screen boundaries)
        const draggableEdges = this._edgeLayout.edges.filter(edge => !edge.fixed);
        
        draggableEdges.forEach(edge => {
            // Create edge LINE actor (thin, for hover detection only)
            const lineActor = new St.Widget({
                reactive: true,
                track_hover: true
            });
            
            if (edge.type === 'vertical') {
                lineActor.set_position(
                    monitor.x + edge.position * monitor.width - 15,
                    monitor.y + edge.start * monitor.height
                );
                lineActor.set_size(30, edge.length * monitor.height);
                lineActor.style = 'background-color: rgba(255, 255, 255, 0.2);';
            } else {
                lineActor.set_position(
                    monitor.x + edge.start * monitor.width,
                    monitor.y + edge.position * monitor.height - 15
                );
                lineActor.set_size(edge.length * monitor.width, 30);
                lineActor.style = 'background-color: rgba(255, 255, 255, 0.2);';
            }
            
            // Create drag HANDLE actor (circle, initially hidden)
            const handleActor = new St.Widget({
                style_class: 'edge-drag-handle',
                width: 40,
                height: 40,
                reactive: true,
                opacity: 0,  // Hidden by default
                style: `
                    background-color: rgba(255, 255, 255, 0.9);
                    border: 3px solid rgba(255, 255, 255, 1.0);
                    border-radius: 20px;
                `
            });
            
            // Line hover - show and position handle
            lineActor.connect('motion-event', (actor, event) => {
                const [mouseX, mouseY] = event.get_coords();
                this._positionHandle(handleActor, edge, mouseX, mouseY, monitor);
                
                // Fade in handle
                handleActor.ease({
                    opacity: 255,
                    duration: 150,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD
                });
                
                // Highlight line slightly
                if (edge.type === 'vertical') {
                    lineActor.style = 'background-color: rgba(255, 255, 255, 0.4);';
                } else {
                    lineActor.style = 'background-color: rgba(255, 255, 255, 0.4);';
                }
                
                return Clutter.EVENT_PROPAGATE;
            });
            
            // Line leave - hide handle (unless dragging)
            lineActor.connect('leave-event', () => {
                if (!this._draggingEdge) {
                    handleActor.ease({
                        opacity: 0,
                        duration: 150,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD
                    });
                    
                    // Dim line
                    lineActor.style = 'background-color: rgba(255, 255, 255, 0.2);';
                }
            });
            
            // Handle drag start - ONLY the handle can be dragged, not the line
            handleActor.connect('button-press-event', (actor, event) => {
                const modifiers = event.get_state();
                const ctrlPressed = modifiers & Clutter.ModifierType.CONTROL_MASK;
                
                if (ctrlPressed) {
                    // Ctrl+Click on handle: Delete edge
                    logger.info(`[DELETE] Ctrl+Click on edge ${edge.id}`);
                    this._deleteEdge(edge);
                    return Clutter.EVENT_STOP;
                } else {
                    // Regular click: Start drag
                    logger.info(`[DRAG] Handle button-press: ${edge.id} (${edge.type})`);
                    this._onEdgeDragBegin(edge, event);
                    return Clutter.EVENT_STOP;
                }
            });
            
            // Add both actors to overlay
            this._overlay.add_child(lineActor);
            this._overlay.add_child(handleActor);
            
            // Store both actors
            this._edgeActors.push({
                lineActor: lineActor,
                handleActor: handleActor,
                edge: edge
            });
        });
        
        logger.debug(`Created ${this._edgeActors.length} edge+handle pairs`);
    }
    
    /**
     * Position drag handle at mouse location along edge
     * @private
     */
    _positionHandle(handleActor, edge, mouseX, mouseY, monitor) {
        if (edge.type === 'vertical') {
            // Handle moves along vertical edge (fixed X, varying Y)
            const edgeX = monitor.x + edge.position * monitor.width;
            const edgeStartY = monitor.y + edge.start * monitor.height;
            const edgeEndY = edgeStartY + edge.length * monitor.height;
            
            // Clamp mouse Y to edge bounds
            const handleY = Math.max(edgeStartY, Math.min(edgeEndY, mouseY));
            
            handleActor.set_position(
                edgeX - 20,  // Center on edge (handle is 40px wide)
                handleY - 20  // Center on mouse
            );
        } else {
            // Handle moves along horizontal edge (varying X, fixed Y)
            const edgeY = monitor.y + edge.position * monitor.height;
            const edgeStartX = monitor.x + edge.start * monitor.width;
            const edgeEndX = edgeStartX + edge.length * monitor.width;
            
            // Clamp mouse X to edge bounds
            const handleX = Math.max(edgeStartX, Math.min(edgeEndX, mouseX));
            
            handleActor.set_position(
                handleX - 20,  // Center on mouse
                edgeY - 20  // Center on edge (handle is 40px tall)
            );
        }
    }

    /**
     * Handle edge drag begin
     * @private
     */
    _onEdgeDragBegin(edge, event) {
        const [x, y] = event.get_coords();
        
        this._draggingEdge = {
            edge: edge,
            originalPosition: edge.position
        };
        
        logger.debug(`Started dragging edge ${edge.id} at position ${edge.position.toFixed(3)}`);
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
        const monitor = Main.layoutManager.primaryMonitor;
        const edge = this._draggingEdge.edge;
        
        let newPosition;
        
        if (edge.type === 'vertical') {
            newPosition = (x - monitor.x) / monitor.width;
        } else {
            newPosition = (y - monitor.y) / monitor.height;
        }
        
        // Calculate constraints based on adjacent regions
        const { minPos, maxPos } = this._getEdgeConstraints(edge);
        
        // Clamp to constraints
        newPosition = Math.max(minPos, Math.min(maxPos, newPosition));
        
        // Update edge position - THIS IS IT! Just one line to move the edge.
        // All regions referencing this edge will automatically reflect the change.
        edge.position = newPosition;
        
        logger.debug(`[DRAG] Edge ${edge.id} moved to ${newPosition.toFixed(3)}`);
        
        // Refresh display
        this._refreshDisplay();
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
        
        return { minPos, maxPos };
    }

    /**
     * Handle edge drag end
     * @private
     */
    _onEdgeDragEnd() {
        if (!this._draggingEdge) return;
        
        logger.debug(`Ended dragging edge ${this._draggingEdge.edge.id}`);
        this._draggingEdge = null;
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
        
        logger.debug(`Region ${regionIndex} clicked (Shift: ${shiftPressed})`);
        
        // Shift+Click: Split vertically
        if (shiftPressed) {
            this._splitVertical(regionIndex);
        }
        // Click: Split horizontally
        else {
            this._splitHorizontal(regionIndex);
        }
        
        return Clutter.EVENT_STOP;
    }

    /**
     * Split region horizontally (left/right)
     * @param {number} regionIndex - Index of region to split
     * @private
     */
    _splitHorizontal(regionIndex) {
        const region = this._edgeLayout.regions[regionIndex];
        const edgeMap = new Map(this._edgeLayout.edges.map(e => [e.id, e]));
        
        const left = edgeMap.get(region.left);
        const right = edgeMap.get(region.right);
        const top = edgeMap.get(region.top);
        const bottom = edgeMap.get(region.bottom);
        
        // Create new vertical edge at midpoint, spanning this region's height
        const newEdgeId = `v${Date.now()}`;
        const newEdge = {
            id: newEdgeId,
            type: 'vertical',
            position: (left.position + right.position) / 2,
            start: top.position,
            length: bottom.position - top.position,
            fixed: false
        };
        
        this._edgeLayout.edges.push(newEdge);
        
        // Create two new regions
        const leftRegion = {
            name: `Zone ${this._edgeLayout.regions.length + 1}`,
            left: region.left,
            right: newEdgeId,
            top: region.top,
            bottom: region.bottom
        };
        
        const rightRegion = {
            name: `Zone ${this._edgeLayout.regions.length + 2}`,
            left: newEdgeId,
            right: region.right,
            top: region.top,
            bottom: region.bottom
        };
        
        // Replace original region with two new ones
        this._edgeLayout.regions.splice(regionIndex, 1, leftRegion, rightRegion);
        
        logger.info(`[SPLIT-H] Split region ${regionIndex} horizontally, created edge ${newEdgeId}`);
        logger.info(`[SPLIT-H] Left region: [L:${leftRegion.left}, R:${leftRegion.right}, T:${leftRegion.top}, B:${leftRegion.bottom}]`);
        logger.info(`[SPLIT-H] Right region: [L:${rightRegion.left}, R:${rightRegion.right}, T:${rightRegion.top}, B:${rightRegion.bottom}]`);
        
        this._logLayoutState('AFTER-SPLIT-HORIZONTAL');
        this._refreshDisplay();
    }

    /**
     * Split region vertically (top/bottom)
     * @param {number} regionIndex - Index of region to split
     * @private
     */
    _splitVertical(regionIndex) {
        const region = this._edgeLayout.regions[regionIndex];
        const edgeMap = new Map(this._edgeLayout.edges.map(e => [e.id, e]));
        
        const left = edgeMap.get(region.left);
        const right = edgeMap.get(region.right);
        const top = edgeMap.get(region.top);
        const bottom = edgeMap.get(region.bottom);
        
        // Create new horizontal edge at midpoint, spanning this region's width
        const newEdgeId = `h${Date.now()}`;
        const newEdge = {
            id: newEdgeId,
            type: 'horizontal',
            position: (top.position + bottom.position) / 2,
            start: left.position,
            length: right.position - left.position,
            fixed: false
        };
        
        this._edgeLayout.edges.push(newEdge);
        
        // Create two new regions
        const topRegion = {
            name: `Zone ${this._edgeLayout.regions.length + 1}`,
            left: region.left,
            right: region.right,
            top: region.top,
            bottom: newEdgeId
        };
        
        const bottomRegion = {
            name: `Zone ${this._edgeLayout.regions.length + 2}`,
            left: region.left,
            right: region.right,
            top: newEdgeId,
            bottom: region.bottom
        };
        
        // Replace original region with two new ones
        this._edgeLayout.regions.splice(regionIndex, 1, topRegion, bottomRegion);
        
        logger.info(`[SPLIT-V] Split region ${regionIndex} vertically, created edge ${newEdgeId}`);
        logger.info(`[SPLIT-V] Top region: [L:${topRegion.left}, R:${topRegion.right}, T:${topRegion.top}, B:${topRegion.bottom}]`);
        logger.info(`[SPLIT-V] Bottom region: [L:${bottomRegion.left}, R:${bottomRegion.right}, T:${bottomRegion.top}, B:${bottomRegion.bottom}]`);
        
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
                bottom: this._maxEdge(region.bottom, other.bottom, edgeMap)
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
            edge.fixed || usedEdges.has(edge.id)
        );
        
        const removed = beforeCount - this._edgeLayout.edges.length;
        if (removed > 0) {
            logger.debug(`Cleaned up ${removed} unused edges`);
        }
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
            region.bottom === edgeId
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
        
        // Check if atleast one region per side can be merged
        // (shares the same perpendicular bounds with a region on the other side)
        let hasMatch = false;
        
        if (edge.type === 'vertical') {
            // For vertical edges: check if any left region matches any right region vertically
            for (const leftReg of leftOrTopRegions) {
                for (const rightReg of rightOrBottomRegions) {
                    if (leftReg.top === rightReg.top && leftReg.bottom === rightReg.bottom) {
                        hasMatch = true;
                        break;
                    }
                }
                if (hasMatch) break;
            }
        } else {
            // For horizontal edges: check if any top region matches any bottom region horizontally
            for (const topReg of leftOrTopRegions) {
                for (const bottomReg of rightOrBottomRegions) {
                    if (topReg.left === bottomReg.left && topReg.right === bottomReg.right) {
                        hasMatch = true;
                        break;
                    }
                }
                if (hasMatch) break;
            }
        }
        
        return hasMatch;
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
            logger.error(`[EDGE-DELETE] No regions reference this edge - should not happen`);
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
        const newRegions = [];
        const processed = new Set();
        
        if (edge.type === 'vertical') {
            // For vertical edge: match regions with overlapping vertical (top/bottom) ranges
            leftOrTopRegions.forEach(leftReg => {
                if (processed.has(leftReg)) return;
                
                const leftTop = edgeMap.get(leftReg.top);
                const leftBottom = edgeMap.get(leftReg.bottom);
                
                // Find all right regions that overlap with this left region vertically
                const matchingRightRegions = rightOrBottomRegions.filter(rightReg => {
                    if (processed.has(rightReg)) return false;
                    
                    const rightTop = edgeMap.get(rightReg.top);
                    const rightBottom = edgeMap.get(rightReg.bottom);
                    
                    // Check if they share the same vertical bounds
                    return leftReg.top === rightReg.top && leftReg.bottom === rightReg.bottom;
                });
                
                if (matchingRightRegions.length > 0) {
                    // Merge this left region with matching right region(s)
                    const allToMerge = [leftReg, ...matchingRightRegions];
                    const leftEdge = edgeMap.get(leftReg.left);
                    const rightEdge = edgeMap.get(matchingRightRegions[0].right);
                    
                    const merged = {
                        name: leftReg.name,
                        left: leftReg.left,
                        right: matchingRightRegions[0].right,
                        top: leftReg.top,
                        bottom: leftReg.bottom
                    };
                    
                    logger.info(`[EDGE-DELETE] Merged vertical: [L:${merged.left}, R:${merged.right}, T:${merged.top}, B:${merged.bottom}]`);
                    newRegions.push(merged);
                    
                    processed.add(leftReg);
                    matchingRightRegions.forEach(r => processed.add(r));
                }
            });
        } else {
            // For horizontal edge: match regions with overlapping horizontal (left/right) ranges
            leftOrTopRegions.forEach(topReg => {
                if (processed.has(topReg)) return;
                
                // Find all bottom regions that overlap with this top region horizontally
                const matchingBottomRegions = rightOrBottomRegions.filter(bottomReg => {
                    if (processed.has(bottomReg)) return false;
                    
                    // Check if they share the same horizontal bounds
                    return topReg.left === bottomReg.left && topReg.right === bottomReg.right;
                });
                
                if (matchingBottomRegions.length > 0) {
                    // Merge this top region with matching bottom region(s)
                    const merged = {
                        name: topReg.name,
                        left: topReg.left,
                        right: topReg.right,
                        top: topReg.top,
                        bottom: matchingBottomRegions[0].bottom
                    };
                    
                    logger.info(`[EDGE-DELETE] Merged horizontal: [L:${merged.left}, R:${merged.right}, T:${merged.top}, B:${merged.bottom}]`);
                    newRegions.push(merged);
                    
                    processed.add(topReg);
                    matchingBottomRegions.forEach(r => processed.add(r));
                }
            });
        }
        
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
        
        logger.info(`[EDGE-DELETE] Edge deletion complete`);
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
        const monitor = Main.layoutManager.primaryMonitor;
        
        const notificationBox = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 12px; padding: 20px; background-color: rgba(30, 30, 30, 0.95); border-radius: 8px;',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        
        // Warning icon (⚠)
        const icon = new St.Label({
            text: '⚠',
            style: 'font-size: 24pt; color: rgb(255, 193, 7);'
        });
        notificationBox.add_child(icon);
        
        // Text container - fixed width for proper wrapping
        const textBox = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 4px;',
            width: 480
        });
        
        const titleLabel = new St.Label({
            text: title,
            style: 'font-size: 12pt; font-weight: bold; color: white;'
        });
        titleLabel.clutter_text.line_wrap = true;
        titleLabel.clutter_text.ellipsize = 0; // NONE
        textBox.add_child(titleLabel);
        
        const messageLabel = new St.Label({
            text: message,
            style: 'font-size: 10pt; color: #e0e0e0;'
        });
        messageLabel.clutter_text.line_wrap = true;
        messageLabel.clutter_text.ellipsize = 0; // NONE
        messageLabel.clutter_text.line_wrap_mode = 2; // WORD_CHAR
        textBox.add_child(messageLabel);
        
        notificationBox.add_child(textBox);
        
        // Calculate width based on content - icon (40px) + text (480px) + spacing (12px) + padding (40px)
        const boxWidth = 572;
        notificationBox.set_position(
            monitor.x + (monitor.width - boxWidth) / 2,
            monitor.y + (monitor.height / 2) - 50
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
        logger.debug('Refreshing display');
        
        // Remove old actors (but keep help text and toolbar)
        this._regionActors.forEach(actor => {
            this._overlay.remove_child(actor);
            actor.destroy();
        });
        this._regionActors = [];
        
        // Remove edge actors (now objects with lineActor and handleActor)
        this._edgeActors.forEach(edgeObj => {
            this._overlay.remove_child(edgeObj.lineActor);
            this._overlay.remove_child(edgeObj.handleActor);
            edgeObj.lineActor.destroy();
            edgeObj.handleActor.destroy();
        });
        this._edgeActors = [];
        
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
        const monitor = Main.layoutManager.primaryMonitor;
        
        this._toolbar = new St.BoxLayout({
            style: 'spacing: 12px; padding: 16px; background-color: rgba(255, 255, 255, 0.95); border-radius: 8px;',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.END
        });
        
        // Position at bottom center
        this._toolbar.set_position(
            monitor.x + (monitor.width - 250) / 2,
            monitor.y + monitor.height - 80
        );
        this._toolbar.width = 250;
        
        // Save button
        const saveButton = new St.Button({
            label: 'Save Layout',
            style_class: 'button',
            style: 'padding: 8px 24px; background-color: #1c71d8; color: white; border-radius: 4px; font-weight: bold;'
        });
        saveButton.connect('clicked', () => this._onSave());
        this._toolbar.add_child(saveButton);
        
        // Cancel button
        const cancelButton = new St.Button({
            label: 'Cancel',
            style_class: 'button',
            style: 'padding: 8px 24px; background-color: #666; color: white; border-radius: 4px;'
        });
        cancelButton.connect('clicked', () => this._onCancel());
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
     * Handle region click
     * @param {number} regionIndex - Index of clicked region
     * @param {Clutter.Event} event - Click event
     * @returns {boolean} EVENT_STOP to prevent propagation
     * @private
     */
    _onRegionClicked(regionIndex, event) {
        const modifiers = event.get_state();
        const shiftPressed = modifiers & Clutter.ModifierType.SHIFT_MASK;
        const ctrlPressed = modifiers & Clutter.ModifierType.CONTROL_MASK;
        
        logger.debug(`Region ${regionIndex} clicked (Shift: ${shiftPressed}, Ctrl: ${ctrlPressed})`);
        
        // Ctrl+Click: Do nothing (region deletion removed)
        if (ctrlPressed) {
            logger.debug('Ctrl+Click on region ignored (deletion not supported)');
            return Clutter.EVENT_STOP;
        }
        // Shift+Click: Split vertically
        else if (shiftPressed) {
            this._splitVertical(regionIndex);
        }
        // Click: Split horizontally
        else {
            this._splitHorizontal(regionIndex);
        }
        
        return Clutter.EVENT_STOP;
    }

    /**
     * Handle cancel action
     * @private
     */
    _onCancel() {
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
     * Clean up resources
     */
    destroy() {
        this.hide();
        logger.debug('GridEditor destroyed');
    }
}
