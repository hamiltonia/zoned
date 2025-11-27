/**
 * KeybindingManager - Manages keyboard shortcuts
 * 
 * Responsibilities:
 * - Registering keybindings with GNOME Shell
 * - Handling keyboard shortcut events
 * - Coordinating actions between managers
 */

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { createLogger } from './utils/debug.js';

const logger = createLogger('KeybindingManager');

export class KeybindingManager {
    /**
     * @param {Gio.Settings} settings - GSettings object
     * @param {LayoutManager} layoutManager - Layout manager instance
     * @param {WindowManager} windowManager - Window manager instance
     * @param {NotificationManager} notificationManager - Notification manager instance
     * @param {LayoutSwitcher} layoutSwitcher - Layout switcher instance
     * @param {ZoneOverlay} zoneOverlay - Zone overlay instance (optional)
     */
    constructor(settings, layoutManager, windowManager, notificationManager, layoutSwitcher, zoneOverlay = null) {
        this._settings = settings;
        this._layoutManager = layoutManager;
        this._windowManager = windowManager;
        this._notificationManager = notificationManager;
        this._layoutSwitcher = layoutSwitcher;
        this._zoneOverlay = zoneOverlay;
        this._registeredKeys = [];
    }

    /**
     * Register all keybindings
     */
    registerKeybindings() {
        logger.info('Registering keybindings...');

        // Zone cycling
        this._registerKeybinding(
            'cycle-zone-left',
            this._onCycleZoneLeft.bind(this)
        );

        this._registerKeybinding(
            'cycle-zone-right',
            this._onCycleZoneRight.bind(this)
        );

        // Layout picker
        this._registerKeybinding(
            'show-layout-picker',
            this._onShowLayoutSwitcher.bind(this)
        );

        // Window management
        this._registerKeybinding(
            'minimize-window',
            this._onMinimizeWindow.bind(this)
        );

        this._registerKeybinding(
            'maximize-window',
            this._onMaximizeWindow.bind(this)
        );

        logger.info(`Registered ${this._registeredKeys.length} keybindings`);
    }

    /**
     * Register a single keybinding
     * @private
     */
    _registerKeybinding(name, handler) {
        try {
            Main.wm.addKeybinding(
                name,
                this._settings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL,
                handler
            );
            this._registeredKeys.push(name);
            logger.debug(`Registered keybinding: ${name}`);
        } catch (error) {
            logger.error(`Failed to register keybinding '${name}': ${error}`);
        }
    }

    /**
     * Unregister all keybindings
     */
    unregisterKeybindings() {
        logger.info('Unregistering keybindings...');

        this._registeredKeys.forEach(name => {
            try {
                Main.wm.removeKeybinding(name);
                logger.debug(`Unregistered keybinding: ${name}`);
            } catch (error) {
                logger.error(`Failed to unregister keybinding '${name}': ${error}`);
            }
        });

        this._registeredKeys = [];
    }

    /**
     * Handler: Cycle to previous zone (Super+Left)
     * @private
     */
    _onCycleZoneLeft() {
        logger.debug('Cycle zone left triggered');

        const window = this._windowManager.getFocusedWindow();
        if (!window) {
            logger.debug('No focused window to move');
            return;
        }

        const zone = this._layoutManager.cycleZone(-1);
        if (!zone) {
            logger.warn('Failed to cycle to previous zone');
            return;
        }

        this._windowManager.moveWindowToZone(window, zone);

        const layout = this._layoutManager.getCurrentLayout();
        const zoneIndex = this._layoutManager.getCurrentZoneIndex();
        const totalZones = layout.zones.length;

        // Show zone overlay (center-screen notification for user action)
        if (this._zoneOverlay) {
            this._zoneOverlay.show(layout.name, zoneIndex, totalZones);
        }
    }

    /**
     * Handler: Cycle to next zone (Super+Right)
     * @private
     */
    _onCycleZoneRight() {
        logger.debug('Cycle zone right triggered');

        const window = this._windowManager.getFocusedWindow();
        if (!window) {
            logger.debug('No focused window to move');
            return;
        }

        const zone = this._layoutManager.cycleZone(1);
        if (!zone) {
            logger.warn('Failed to cycle to next zone');
            return;
        }

        this._windowManager.moveWindowToZone(window, zone);

        const layout = this._layoutManager.getCurrentLayout();
        const zoneIndex = this._layoutManager.getCurrentZoneIndex();
        const totalZones = layout.zones.length;

        // Show zone overlay (center-screen notification for user action)
        if (this._zoneOverlay) {
            this._zoneOverlay.show(layout.name, zoneIndex, totalZones);
        }
    }

    /**
     * Handler: Show layout switcher (Super+grave)
     * @private
     */
    _onShowLayoutSwitcher() {
        logger.debug('Show layout switcher triggered');

        if (this._layoutSwitcher) {
            this._layoutSwitcher.show();
        } else {
            logger.warn('Layout switcher not available');
        }
    }

    /**
     * Handler: Minimize window (Super+Down)
     * @private
     */
    _onMinimizeWindow() {
        logger.debug('Minimize window triggered');

        const window = this._windowManager.getFocusedWindow();
        if (!window) {
            logger.debug('No focused window to minimize');
            return;
        }

        this._windowManager.minimizeWindow(window);
        
        // Show center-screen notification for user action
        if (this._zoneOverlay) {
            this._zoneOverlay.showMessage('Minimized');
        }
    }

    /**
     * Handler: Maximize/restore window (Super+Up)
     * @private
     */
    _onMaximizeWindow() {
        logger.debug('Maximize window triggered');

        const window = this._windowManager.getFocusedWindow();
        
        // First, try to restore any minimized window
        const restored = this._windowManager.restoreMinimizedWindow();
        if (restored) {
            // Show center-screen notification for user action
            if (this._zoneOverlay) {
                this._zoneOverlay.showMessage('Restored');
            }
            return;
        }
        
        // If no minimized window and no focused window, nothing to do
        if (!window) {
            logger.debug('No window to maximize or restore');
            return;
        }

        // Handle the focused window
        const wasMaximized = window.maximized_horizontally || window.maximized_vertically;

        this._windowManager.maximizeWindow(window);

        // Show center-screen notification for user action
        if (this._zoneOverlay) {
            if (wasMaximized) {
                this._zoneOverlay.showMessage('Unmaximized');
            } else {
                this._zoneOverlay.showMessage('Maximized');
            }
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.unregisterKeybindings();
    }
}
