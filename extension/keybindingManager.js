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
     * @param {LayoutSwitcher} layoutSwitcher - Layout editor instance
     * @param {ZoneOverlay} zoneOverlay - Zone overlay instance (optional)
     */
    constructor(settings, layoutManager, windowManager, notificationManager, layoutEditor, zoneOverlay = null) {
        this._settings = settings;
        this._layoutManager = layoutManager;
        this._windowManager = windowManager;
        this._notificationManager = notificationManager;
        this._layoutSwitcher = layoutEditor;
        this._zoneOverlay = zoneOverlay;
        this._registeredKeys = [];
        this._enhancedWindowManagementKeys = ['minimize-window', 'maximize-window'];
        this._settingsChangedId = null;
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

        // Enhanced window management (optional)
        this._registerEnhancedWindowManagement();

        // Listen for settings changes to toggle enhanced window management
        this._settingsChangedId = this._settings.connect(
            'changed::enhanced-window-management-enabled',
            () => this._onEnhancedWindowManagementChanged()
        );

        logger.info(`Registered ${this._registeredKeys.length} keybindings`);
    }

    /**
     * Register enhanced window management keybindings if enabled
     * @private
     */
    _registerEnhancedWindowManagement() {
        const enabled = this._settings.get_boolean('enhanced-window-management-enabled');
        
        if (!enabled) {
            logger.debug('Enhanced window management disabled, skipping registration');
            return;
        }

        logger.info('Registering enhanced window management keybindings...');

        this._registerKeybinding(
            'minimize-window',
            this._onMinimizeWindow.bind(this)
        );

        this._registerKeybinding(
            'maximize-window',
            this._onMaximizeWindow.bind(this)
        );
    }

    /**
     * Handle enhanced window management setting change
     * @private
     */
    _onEnhancedWindowManagementChanged() {
        const enabled = this._settings.get_boolean('enhanced-window-management-enabled');
        logger.info(`Enhanced window management ${enabled ? 'enabled' : 'disabled'}`);

        if (enabled) {
            // Register if not already registered
            this._registerEnhancedWindowManagement();
        } else {
            // Unregister enhanced keybindings
            this._unregisterEnhancedWindowManagement();
        }
    }

    /**
     * Unregister only enhanced window management keybindings
     * @private
     */
    _unregisterEnhancedWindowManagement() {
        this._enhancedWindowManagementKeys.forEach(name => {
            if (this._registeredKeys.includes(name)) {
                try {
                    Main.wm.removeKeybinding(name);
                    this._registeredKeys = this._registeredKeys.filter(k => k !== name);
                    logger.debug(`Unregistered enhanced keybinding: ${name}`);
                } catch (error) {
                    logger.error(`Failed to unregister enhanced keybinding '${name}': ${error}`);
                }
            }
        });
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
     * Handler: Show layout editor (Super+grave)
     * @private
     */
    _onShowLayoutSwitcher() {
        logger.debug('Show layout editor triggered');

        if (this._layoutSwitcher) {
            this._layoutSwitcher.show();
        } else {
            logger.warn('Layout editor not available');
        }
    }

    /**
     * Handler: Minimize window (Super+Down)
     * If already minimized (by us), restore it instead.
     * @private
     */
    _onMinimizeWindow() {
        logger.debug('Minimize window triggered');

        const window = this._windowManager.getFocusedWindow();
        if (!window) {
            // No focused window - try to restore the last minimized
            const restored = this._windowManager.restoreMinimizedWindow();
            if (restored) {
                if (this._zoneOverlay) {
                    this._zoneOverlay.showMessage('Restored');
                }
            }
            return;
        }

        // Minimize the focused window
        this._windowManager.minimizeWindow(window);
        if (this._zoneOverlay) {
            this._zoneOverlay.showMessage('Minimized');
        }
    }

    /**
     * Handler: Maximize/restore window (Super+Up)
     * If a window was minimized by Super+Down, restore it.
     * Otherwise, toggle between maximized and floating.
     * @private
     */
    _onMaximizeWindow() {
        logger.debug('Maximize window triggered');

        // First, try to restore a minimized window
        const restored = this._windowManager.restoreMinimizedWindow();
        if (restored) {
            if (this._zoneOverlay) {
                this._zoneOverlay.showMessage('Restored');
            }
            return;
        }

        // No minimized window to restore, toggle maximize on focused window
        const window = this._windowManager.getFocusedWindow();
        if (!window) {
            logger.debug('No focused window to maximize');
            return;
        }

        const wasMaximized = window.maximized_horizontally || window.maximized_vertically;
        this._windowManager.maximizeWindow(window);
        
        if (this._zoneOverlay) {
            this._zoneOverlay.showMessage(wasMaximized ? 'Unmaximized' : 'Maximized');
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        // Disconnect settings listener
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        
        this.unregisterKeybindings();
    }
}
