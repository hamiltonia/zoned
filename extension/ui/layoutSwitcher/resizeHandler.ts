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

import Clutter from '@girs/clutter-14';
import St from '@girs/st-14';
import Meta from 'gi://Meta';
import {createLogger} from '../../utils/debug';
import type {LayoutSwitcherContext} from './types';

const logger = createLogger('ResizeHandler');

type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

/**
 * Bound method handlers for resize signal connections
 * These avoid closure leaks from arrow functions
 */

/**
 * Handle resize handle hover enter
 * @param _ctx - Parent LayoutSwitcher instance (unused but required for bound signature)
 * @param handle - The resize handle
 * @param handleSize - Size of the handle
 */
function handleResizeHandleEnter(_ctx: LayoutSwitcherContext, handle: St.Widget, handleSize: number): void {
    handle.style = `width: ${handleSize}px; height: ${handleSize}px; ` +
                  'background-color: rgba(255, 165, 0, 0.6); ' +
                  'border-radius: 4px;';
    global.display.set_cursor(Meta.Cursor.SE_RESIZE);
}

/**
 * Handle resize handle hover leave
 * @param ctx - Parent LayoutSwitcher instance
 * @param handle - The resize handle
 * @param handleSize - Size of the handle
 */
function handleResizeHandleLeave(ctx: LayoutSwitcherContext, handle: St.Widget, handleSize: number): void {
    if (!ctx._isResizing) {
        handle.style = `width: ${handleSize}px; height: ${handleSize}px; ` +
                      `background-color: ${ctx._debugMode ? 'rgba(255, 0, 0, 0.5)' : 'transparent'}; ` +
                      'border-radius: 4px;';
        global.display.set_cursor(Meta.Cursor.DEFAULT);
    }
}

/**
 * Handle resize handle button press
 * @param ctx - Parent LayoutSwitcher instance
 * @param corner - Which corner ('nw', 'ne', 'sw', 'se')
 * @param _actor - The handle actor (unused but required for signal signature)
 * @param event - The button press event
 */
function handleResizeHandlePress(
    ctx: LayoutSwitcherContext,
    corner: ResizeCorner,
    _actor: Clutter.Actor,
    event: Clutter.Event
): boolean {
    if (event.get_button() === 1) { // Left click
        startResize(ctx, corner, event);
        return Clutter.EVENT_STOP;
    }
    return Clutter.EVENT_PROPAGATE;
}

/**
 * Handle stage motion event during resize
 * @param ctx - Parent LayoutSwitcher instance
 * @param _actor - The stage actor (unused but required for signal signature)
 * @param event - The motion event
 */
function handleResizeMotion(ctx: LayoutSwitcherContext, _actor: Clutter.Actor, event: Clutter.Event): boolean {
    return onResizeMotion(ctx, event);
}

/**
 * Handle stage button release event during resize
 * @param ctx - Parent LayoutSwitcher instance
 * @param _actor - The stage actor (unused but required for signal signature)
 * @param event - The button release event
 */
function handleResizeRelease(ctx: LayoutSwitcherContext, _actor: Clutter.Actor, event: Clutter.Event): boolean {
    if (event.get_button() === 1) {
        endResize(ctx);
        return Clutter.EVENT_STOP;
    }
    return Clutter.EVENT_PROPAGATE;
}

/**
 * Add resize handles to the dialog corners
 * @param ctx - Parent LayoutSwitcher instance
 * @param wrapper - Wrapper widget for resize handles
 */
export function addResizeHandles(ctx: LayoutSwitcherContext, wrapper: St.Widget): void {
    const handleSize = 24;
    const corners: ResizeCorner[] = ['nw', 'ne', 'sw', 'se'];

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

        // Cursor change on hover - use bound methods with captured parameters
        const boundEnter = handleResizeHandleEnter.bind(null, ctx, handle, handleSize);
        const boundLeave = handleResizeHandleLeave.bind(null, ctx, handle, handleSize);
        const boundPress = handleResizeHandlePress.bind(null, ctx, corner);

        ctx._signalTracker.connect(handle, 'enter-event', boundEnter);
        ctx._signalTracker.connect(handle, 'leave-event', boundLeave);
        ctx._signalTracker.connect(handle, 'button-press-event', boundPress);

        ctx._resizeHandles[corner] = handle;
        wrapper.add_child(handle);
    });
}

/**
 * Start a resize operation
 * @param ctx - Parent LayoutSwitcher instance
 * @param corner - Which corner is being dragged ('nw', 'ne', 'sw', 'se')
 * @param event - The mouse event
 */
export function startResize(ctx: LayoutSwitcherContext, corner: ResizeCorner, event: Clutter.Event): void {
    ctx._isResizing = true;
    ctx._resizeCorner = corner;

    const [x, y] = event.get_coords();
    ctx._resizeStartX = x;
    ctx._resizeStartY = y;
    ctx._resizeStartWidth = ctx._currentDialogWidth ?? 0;
    ctx._resizeStartHeight = ctx._currentDialogHeight ?? 0;

    logger.info(`Starting resize from ${corner} corner, size: ${ctx._resizeStartWidth}×${ctx._resizeStartHeight}`);

    // Connect global mouse events for tracking - use bound methods
    const boundMotion = handleResizeMotion.bind(null, ctx);
    const boundRelease = handleResizeRelease.bind(null, ctx);

    ctx._resizeMotionId = ctx._signalTracker.connect(global.stage, 'motion-event', boundMotion);
    ctx._resizeButtonReleaseId = ctx._signalTracker.connect(global.stage, 'button-release-event', boundRelease);
}

/**
 * Handle mouse motion during resize
 * @param ctx - Parent LayoutSwitcher instance
 * @param event - The mouse motion event
 * @returns Clutter.EVENT_STOP or Clutter.EVENT_PROPAGATE
 */
export function onResizeMotion(ctx: LayoutSwitcherContext, event: Clutter.Event): boolean {
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
        ctx._container.style = ctx._container.style?.replace(
            /width:\s*\d+px/,
            `width: ${newWidth}px`,
        ).replace(
            /height:\s*\d+px/,
            `height: ${newHeight}px`,
        ) ?? '';
    }

    return Clutter.EVENT_STOP;
}

/**
 * End a resize operation and rebuild the dialog
 * @param ctx - Parent LayoutSwitcher instance
 */
export function endResize(ctx: LayoutSwitcherContext): void {
    if (!ctx._isResizing) return;

    ctx._isResizing = false;
    global.display.set_cursor(Meta.Cursor.DEFAULT);

    // Disconnect motion events
    if (ctx._resizeMotionId) {
        ctx._signalTracker.disconnect(ctx._resizeMotionId);
        ctx._resizeMotionId = null;
    }
    if (ctx._resizeButtonReleaseId) {
        ctx._signalTracker.disconnect(ctx._resizeButtonReleaseId);
        ctx._resizeButtonReleaseId = null;
    }

    // Get final dimensions from container (both width and height, content-driven)
    if (ctx._container) {
        const widthMatch = ctx._container.style?.match(/width:\s*(\d+)px/);
        const heightMatch = ctx._container.style?.match(/height:\s*(\d+)px/);

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
 * @param ctx - Parent LayoutSwitcher instance
 * @param newWidth - New dialog width
 * @param newHeight - New dialog height
 */
export function rebuildWithNewSize(ctx: LayoutSwitcherContext, newWidth: number, newHeight: number): void {
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
