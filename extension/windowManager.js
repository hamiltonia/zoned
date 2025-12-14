/**
 * WindowManager - Handles window positioning and manipulation
 *
 * Provides core window management functionality including:
 * - Moving windows to specific zones
 * - Maximizing/minimizing windows
 * - Multi-monitor support
 * - Window state management
 */

import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {createLogger} from './utils/debug.js';

const logger = createLogger('WindowManager');

export class WindowManager {
    constructor() {
        this._display = global.display;
    }

    /**
     * Get the currently focused window
     * @returns {Meta.Window|null} The focused window, or null if none
     */
    getFocusedWindow() {
        return this._display.focus_window;
    }

    /**
     * Move and resize a window to fit within a specified zone
     *
     * @param {Meta.Window} window - The window to move
     * @param {Object} zone - Zone definition with x, y, w, h (percentages 0-1)
     * @param {number} zone.x - X position as percentage of screen width
     * @param {number} zone.y - Y position as percentage of screen height
     * @param {number} zone.w - Width as percentage of screen width
     * @param {number} zone.h - Height as percentage of screen height
     */
    moveWindowToZone(window, zone) {
        if (!window) {
            logger.warn('No window provided to moveWindowToZone');
            return;
        }

        if (!zone) {
            logger.warn('No zone provided to moveWindowToZone');
            return;
        }

        // Unmaximize window if it's currently maximized
        if (window.maximized_horizontally || window.maximized_vertically) {
            window.unmaximize(Meta.MaximizeFlags.BOTH);
        }

        // Get the monitor the window is currently on
        const monitorIndex = window.get_monitor();
        const workArea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);

        // Calculate absolute pixel coordinates from zone percentages
        const x = Math.round(workArea.x + (zone.x * workArea.width));
        const y = Math.round(workArea.y + (zone.y * workArea.height));
        const width = Math.round(zone.w * workArea.width);
        const height = Math.round(zone.h * workArea.height);

        // Move and resize the window
        window.move_resize_frame(
            false,  // user_op (false = programmatic)
            x,
            y,
            width,
            height,
        );

        logger.debug(`Moved window to zone: x=${x}, y=${y}, w=${width}, h=${height}`);
    }

    /**
     * Minimize the specified window
     * @param {Meta.Window} window - The window to minimize
     */
    minimizeWindow(window) {
        if (!window) {
            logger.warn('No window provided to minimizeWindow');
            return;
        }

        if (!window.minimized) {
            window.minimize();
            logger.debug('Window minimized');
        }
    }

    /**
     * Toggle maximize state of the window
     * If minimized, restore the window
     * If not maximized, maximize it
     * If already maximized, unmaximize it
     *
     * @param {Meta.Window} window - The window to maximize/restore
     */
    maximizeWindow(window) {
        if (!window) {
            logger.warn('No window provided to maximizeWindow');
            return;
        }

        if (window.minimized) {
            // Restore minimized window
            window.unminimize();
            logger.debug('Window restored from minimized');
        } else if (window.maximized_horizontally || window.maximized_vertically) {
            // Unmaximize if currently maximized
            window.unmaximize(Meta.MaximizeFlags.BOTH);
            logger.debug('Window unmaximized');
        } else {
            // Maximize if not currently maximized
            window.maximize(Meta.MaximizeFlags.BOTH);
            logger.debug('Window maximized');
        }
    }

    /**
     * Restore the most recently minimized window
     * @returns {boolean} True if a window was restored, false otherwise
     */
    restoreMinimizedWindow() {
        const workspace = global.workspace_manager.get_active_workspace();
        const windows = workspace.list_windows();

        // Find the most recently minimized window
        // Windows are typically in most-recently-used order
        for (const window of windows) {
            if (window.minimized) {
                window.unminimize();
                window.activate(global.get_current_time());
                logger.debug('Restored minimized window');
                return true;
            }
        }

        logger.debug('No minimized window to restore');
        return false;
    }

    /**
     * Clean up resources (currently no cleanup needed)
     */
    destroy() {
        // No resources to clean up currently
        // Placeholder for future use
    }
}
