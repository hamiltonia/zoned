/**
 * ResizeHandler - Handles dialog resize operations
 *
 * Responsible for:
 * - Adding corner resize handles to the dialog
 * - Tracking resize drag operations
 * - Maintaining aspect ratio during resize
 * - Rebuilding dialog with new dimensions
 *
 * Part of the LayoutSwitcher module split for maintainability.
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Meta from 'gi://Meta';
import {createLogger} from '../../utils/debug.js';

const logger = createLogger('ResizeHandler');

/**
 * Add resize handles to the dialog corners
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {St.Widget} wrapper - Wrapper widget for resize handles
 * @param {St.Widget} container - Main dialog container
 */
export function addResizeHandles(ctx, wrapper, container) {
    const handleSize = 24;
    const corners = ['nw', 'ne', 'sw', 'se'];

    ctx._resizeHandles = {};

    corners.forEach(corner => {
        const handle = new St.Widget({
            style: `width: ${handleSize}px; height: ${handleSize}px; ` +
                   `background-color: ${ctx._debugMode ? 'rgba(255, 0, 0, 0.5)' : 'transparent'}; ` +
                   'border-radius: 4px;',
            reactive: true,
            track_hover: true,
        });

        // Position handle at corner
        switch (corner) {
            case 'nw':
                handle.x_align = Clutter.ActorAlign.START;
                handle.y_align = Clutter.ActorAlign.START;
                break;
            case 'ne':
                handle.x_align = Clutter.ActorAlign.END;
                handle.y_align = Clutter.ActorAlign.START;
                break;
            case 'sw':
                handle.x_align = Clutter.ActorAlign.START;
                handle.y_align = Clutter.ActorAlign.END;
                break;
            case 'se':
                handle.x_align = Clutter.ActorAlign.END;
                handle.y_align = Clutter.ActorAlign.END;
                break;
        }

        // Cursor change on hover
        handle.connect('enter-event', () => {
            handle.style = `width: ${handleSize}px; height: ${handleSize}px; ` +
                          'background-color: rgba(255, 165, 0, 0.6); ' +
                          'border-radius: 4px;';
            global.display.set_cursor(Meta.Cursor.SE_RESIZE);
        });

        handle.connect('leave-event', () => {
            if (!ctx._isResizing) {
                handle.style = `width: ${handleSize}px; height: ${handleSize}px; ` +
                              `background-color: ${ctx._debugMode ? 'rgba(255, 0, 0, 0.5)' : 'transparent'}; ` +
                              'border-radius: 4px;';
                global.display.set_cursor(Meta.Cursor.DEFAULT);
            }
        });

        // Start resize on mouse press
        handle.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) { // Left click
                startResize(ctx, corner, event);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        ctx._resizeHandles[corner] = handle;
        wrapper.add_child(handle);
    });
}

/**
 * Start a resize operation
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {string} corner - Which corner is being dragged ('nw', 'ne', 'sw', 'se')
 * @param {Clutter.Event} event - The mouse event
 */
export function startResize(ctx, corner, event) {
    ctx._isResizing = true;
    ctx._resizeCorner = corner;

    const [x, y] = event.get_coords();
    ctx._resizeStartX = x;
    ctx._resizeStartY = y;
    ctx._resizeStartWidth = ctx._currentDialogWidth;
    ctx._resizeStartHeight = ctx._currentDialogHeight;

    logger.info(`Starting resize from ${corner} corner, size: ${ctx._resizeStartWidth}×${ctx._resizeStartHeight}`);

    // Connect global mouse events for tracking
    ctx._resizeMotionId = global.stage.connect('motion-event', (actor, event) => {
        return onResizeMotion(ctx, event);
    });

    ctx._resizeButtonReleaseId = global.stage.connect('button-release-event', (actor, event) => {
        if (event.get_button() === 1) {
            endResize(ctx);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });
}

/**
 * Handle mouse motion during resize
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {Clutter.Event} event - The mouse motion event
 * @returns {Clutter.EVENT_STOP|Clutter.EVENT_PROPAGATE}
 */
export function onResizeMotion(ctx, event) {
    if (!ctx._isResizing) return Clutter.EVENT_PROPAGATE;

    const [x, y] = event.get_coords();
    const deltaX = x - ctx._resizeStartX;
    const deltaY = y - ctx._resizeStartY;

    // Calculate new dimensions based on which corner
    // Content-driven sizing: width and height resize independently
    let newWidth = ctx._resizeStartWidth;
    let newHeight = ctx._resizeStartHeight;

    switch (ctx._resizeCorner) {
        case 'se': // Bottom-right - most common
            newWidth = ctx._resizeStartWidth + deltaX;
            newHeight = ctx._resizeStartHeight + deltaY;
            break;
        case 'sw': // Bottom-left
            newWidth = ctx._resizeStartWidth - deltaX;
            newHeight = ctx._resizeStartHeight + deltaY;
            break;
        case 'ne': // Top-right
            newWidth = ctx._resizeStartWidth + deltaX;
            newHeight = ctx._resizeStartHeight - deltaY;
            break;
        case 'nw': // Top-left
            newWidth = ctx._resizeStartWidth - deltaX;
            newHeight = ctx._resizeStartHeight - deltaY;
            break;
    }

    // Apply minimum constraints
    newWidth = Math.max(ctx._MIN_DIALOG_WIDTH, newWidth);
    newHeight = Math.max(ctx._MIN_DIALOG_HEIGHT, newHeight);

    // Update container size directly (live preview)
    if (ctx._container) {
        ctx._container.style = ctx._container.style.replace(
            /width:\s*\d+px/,
            `width: ${newWidth}px`,
        ).replace(
            /height:\s*\d+px/,
            `height: ${newHeight}px`,
        );
    }

    return Clutter.EVENT_STOP;
}

/**
 * End a resize operation and rebuild the dialog
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 */
export function endResize(ctx) {
    if (!ctx._isResizing) return;

    ctx._isResizing = false;
    global.display.set_cursor(Meta.Cursor.DEFAULT);

    // Disconnect motion events
    if (ctx._resizeMotionId) {
        global.stage.disconnect(ctx._resizeMotionId);
        ctx._resizeMotionId = null;
    }
    if (ctx._resizeButtonReleaseId) {
        global.stage.disconnect(ctx._resizeButtonReleaseId);
        ctx._resizeButtonReleaseId = null;
    }

    // Get final dimensions from container (both width and height, content-driven)
    if (ctx._container) {
        const widthMatch = ctx._container.style.match(/width:\s*(\d+)px/);
        const heightMatch = ctx._container.style.match(/height:\s*(\d+)px/);

        if (widthMatch && heightMatch) {
            const newWidth = parseInt(widthMatch[1]);
            const newHeight = parseInt(heightMatch[1]);

            logger.info(`Resize complete: ${newWidth}×${newHeight}`);

            // Store new dimensions and rebuild with recalculated card sizes
            ctx._currentDialogWidth = newWidth;
            ctx._currentDialogHeight = newHeight;

            // Rebuild dialog with new dimensions
            rebuildWithNewSize(ctx, newWidth, newHeight);
        }
    }
}

/**
 * Rebuild the dialog with new dimensions
 * Recalculates card sizes to fit the new dialog size
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {number} newWidth - New dialog width
 * @param {number} newHeight - New dialog height
 */
export function rebuildWithNewSize(ctx, newWidth, newHeight) {
    // Store current state
    const wasWorkspace = ctx._currentWorkspace;
    const wasSelectedIndex = ctx._selectedCardIndex;

    // Store new size to use in calculations
    ctx._overrideDialogWidth = newWidth;
    ctx._overrideDialogHeight = newHeight;

    // Refresh dialog
    ctx.hide();
    ctx._currentWorkspace = wasWorkspace;
    ctx.show();

    // Restore selection
    if (wasSelectedIndex >= 0 && wasSelectedIndex < ctx._allCards.length) {
        ctx._selectedCardIndex = wasSelectedIndex;
        ctx._updateCardFocus();
    }

    // Clear override after rebuild
    ctx._overrideDialogWidth = null;
    ctx._overrideDialogHeight = null;
}
