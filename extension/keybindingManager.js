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
import {createLogger} from './utils/debug.js';
import {NotifyCategory} from './utils/notificationService.js';

const logger = createLogger('KeybindingManager');

export class KeybindingManager {
    /**
     * @param {Gio.Settings} settings - GSettings object
     * @param {LayoutManager} layoutManager - Layout manager instance
     * @param {WindowManager} windowManager - Window manager instance
     * @param {NotificationManager} notificationManager - Notification manager instance (legacy)
     * @param {LayoutSwitcher} layoutSwitcher - Layout editor instance
     * @param {ZoneOverlay} zoneOverlay - Zone overlay instance (optional)
     * @param {NotificationService} notificationService - Notification service for routing (optional)
     */
    constructor(
        settings, layoutManager, windowManager, notificationManager,
        layoutEditor, zoneOverlay = null, notificationService = null,
    ) {
        this._settings = settings;
        this._layoutManager = layoutManager;
        this._windowManager = windowManager;
        this._notificationManager = notificationManager;
        this._layoutSwitcher = layoutEditor;
        this._zoneOverlay = zoneOverlay;
        this._notificationService = notificationService;
        this._registeredKeys = [];
        this._enhancedWindowManagementKeys = ['minimize-window', 'maximize-window'];
        this._quickLayoutKeys = ['quick-layout-1', 'quick-layout-2', 'quick-layout-3',
            'quick-layout-4', 'quick-layout-5', 'quick-layout-6',
            'quick-layout-7', 'quick-layout-8', 'quick-layout-9'];
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
            this._onCycleZoneLeft.bind(this),
        );

        this._registerKeybinding(
            'cycle-zone-right',
            this._onCycleZoneRight.bind(this),
        );

        // Layout picker
        this._registerKeybinding(
            'show-layout-picker',
            this._onShowLayoutSwitcher.bind(this),
        );

        // Enhanced window management (optional)
        this._registerEnhancedWindowManagement();

        // Quick layout shortcuts (Super+Ctrl+Alt+1-9)
        this._registerQuickLayoutShortcuts();

        // Listen for settings changes to toggle enhanced window management
        this._settingsChangedId = this._settings.connect(
            'changed::enhanced-window-management-enabled',
            () => this._onEnhancedWindowManagementChanged(),
        );

        logger.info(`Registered ${this._registeredKeys.length} keybindings`);
    }

    /**
     * Register quick layout shortcuts (Super+Ctrl+Alt+1-9)
     * @private
     */
    _registerQuickLayoutShortcuts() {
        logger.info('Registering quick layout shortcuts...');

        for (let i = 1; i <= 9; i++) {
            this._registerKeybinding(
                `quick-layout-${i}`,
                () => this._onQuickLayout(i),
            );
        }
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
            this._onMinimizeWindow.bind(this),
        );

        this._registerKeybinding(
            'maximize-window',
            this._onMaximizeWindow.bind(this),
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
                handler,
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
     * Get space key from focused window for per-space mode
     * @param {Meta.Window} window - The window to get space context from
     * @returns {string|null} Space key if per-workspace mode enabled, null otherwise
     * @private
     */
    _getSpaceKeyFromWindow(window) {
        const perSpaceEnabled = this._settings.get_boolean('use-per-workspace-layouts');
        if (!perSpaceEnabled || !window) return null;

        const spatialStateManager = this._layoutManager.getSpatialStateManager();
        if (!spatialStateManager) return null;

        return spatialStateManager.getSpaceKeyForWindow(window);
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

        // Get space context for per-workspace mode
        const spaceKey = this._getSpaceKeyFromWindow(window);

        const zone = this._layoutManager.cycleZone(-1, spaceKey);
        if (!zone) {
            logger.warn('Failed to cycle to previous zone');
            return;
        }

        // Get layout info (space-aware if per-workspace mode)
        const layout = this._layoutManager.getCurrentLayout(spaceKey);
        const padding = layout?.padding || 0;

        this._windowManager.moveWindowToZone(window, zone, padding);
        const zoneIndex = spaceKey
            ? this._layoutManager.getZoneIndexForSpace(spaceKey)
            : this._layoutManager.getCurrentZoneIndex();
        const totalZones = layout.zones.length;

        // Show zone notification (uses notification settings)
        if (this._notificationService) {
            this._notificationService.notifyZone(
                NotifyCategory.WINDOW_SNAPPING,
                layout.name,
                zoneIndex,
                totalZones,
            );
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

        // Get space context for per-workspace mode
        const spaceKey = this._getSpaceKeyFromWindow(window);

        const zone = this._layoutManager.cycleZone(1, spaceKey);
        if (!zone) {
            logger.warn('Failed to cycle to next zone');
            return;
        }

        // Get layout info (space-aware if per-workspace mode)
        const layout = this._layoutManager.getCurrentLayout(spaceKey);
        const padding = layout?.padding || 0;

        this._windowManager.moveWindowToZone(window, zone, padding);
        const zoneIndex = spaceKey
            ? this._layoutManager.getZoneIndexForSpace(spaceKey)
            : this._layoutManager.getCurrentZoneIndex();
        const totalZones = layout.zones.length;

        // Show zone notification (uses notification settings)
        if (this._notificationService) {
            this._notificationService.notifyZone(
                NotifyCategory.WINDOW_SNAPPING,
                layout.name,
                zoneIndex,
                totalZones,
            );
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
     * Handler: Quick layout shortcut (Super+Ctrl+Alt+1-9)
     * Activates layout by its assigned shortcut property (user-configurable in layout settings)
     * @param {number} shortcutKey - The shortcut key pressed (1-9)
     * @private
     */
    _onQuickLayout(shortcutKey) {
        logger.debug(`Quick layout shortcut ${shortcutKey} triggered`);

        const layouts = this._layoutManager.getAllLayoutsOrdered();

        // Find layout with matching shortcut assignment
        // shortcut can be string ('1'-'9') or number (1-9)
        const layout = layouts.find(l =>
            l.shortcut === String(shortcutKey) || l.shortcut === shortcutKey,
        );

        // Check if any layout has this shortcut assigned
        if (!layout) {
            logger.debug(`No layout assigned to shortcut ${shortcutKey}`);
            if (this._notificationService) {
                this._notificationService.notify(
                    NotifyCategory.LAYOUT_SWITCHING,
                    `No layout assigned to shortcut ${shortcutKey}`,
                );
            }
            return;
        }

        logger.info(`Quick switching to layout: ${layout.name} (shortcut ${shortcutKey})`);

        // Check if per-workspace mode is enabled
        const perSpaceEnabled = this._settings.get_boolean('use-per-workspace-layouts');
        const window = this._windowManager.getFocusedWindow();

        if (perSpaceEnabled && window) {
            // Apply to the focused window's space
            const spatialStateManager = this._layoutManager.getSpatialStateManager();
            if (spatialStateManager) {
                const spaceKey = spatialStateManager.getSpaceKeyForWindow(window);
                this._layoutManager.setLayoutForSpace(spaceKey, layout.id);
                logger.info(`Applied layout '${layout.name}' to space ${spaceKey}`);
            }
        } else {
            // Apply globally
            this._layoutManager.setLayout(layout.id);
        }

        // Show notification (uses notification settings)
        if (this._notificationService) {
            this._notificationService.notify(
                NotifyCategory.LAYOUT_SWITCHING,
                `Switched to: ${layout.name}`,
            );
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
                if (this._notificationService) {
                    this._notificationService.notify(
                        NotifyCategory.WINDOW_MANAGEMENT,
                        'Restored',
                    );
                }
            }
            return;
        }

        // Minimize the focused window
        this._windowManager.minimizeWindow(window);
        if (this._notificationService) {
            this._notificationService.notify(
                NotifyCategory.WINDOW_MANAGEMENT,
                'Minimized',
            );
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
            if (this._notificationService) {
                this._notificationService.notify(
                    NotifyCategory.WINDOW_MANAGEMENT,
                    'Restored',
                );
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

        if (this._notificationService) {
            this._notificationService.notify(
                NotifyCategory.WINDOW_MANAGEMENT,
                wasMaximized ? 'Unmaximized' : 'Maximized',
            );
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
