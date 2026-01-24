/**
 * KeybindingManager - Manages keyboard shortcuts
 *
 * Responsibilities:
 * - Registering keybindings with GNOME Shell
 * - Handling keyboard shortcut events
 * - Coordinating actions between managers
 */

import Meta from '@girs/meta-14';
import Shell from '@girs/shell-14';
import Gio from '@girs/gio-2.0';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {createLogger} from './utils/debug.js';
import {NotifyCategory} from './utils/notificationService.js';
import type {LayoutManager} from './layoutManager';
import type {WindowManager} from './windowManager';
import type {NotificationService} from './utils/notificationService';

const logger = createLogger('KeybindingManager');

// Placeholder types for UI components not yet migrated
type NotificationManager = any;
type LayoutSwitcher = any;
type ZoneOverlay = any;

export class KeybindingManager {
    private _settings: Gio.Settings | null;
    private _layoutManager: LayoutManager | null;
    private _windowManager: WindowManager | null;
    private _layoutSwitcher: LayoutSwitcher | null;
    private _notificationService: NotificationService | null;
    private _registeredKeys: string[];
    private _enhancedWindowManagementKeys: string[];
    private _quickLayoutKeys: string[];
    private _settingsChangedId: number | null;
    private _quickLayoutSettingsChangedId: number | null;
    private _boundOnEnhancedWindowManagementChanged: (() => void) | null;
    private _boundOnQuickLayoutShortcutsChanged: (() => void) | null;
    private _boundOnCycleZoneLeft: () => void;
    private _boundOnCycleZoneRight: () => void;
    private _boundOnShowLayoutSwitcher: () => void;
    private _boundOnMinimizeWindow: () => void;
    private _boundOnMaximizeWindow: () => void;
    private _boundQuickLayoutHandlers: Array<() => void>;

    /**
     * @param settings - GSettings object
     * @param layoutManager - Layout manager instance
     * @param windowManager - Window manager instance
     * @param notificationManager - Notification manager instance (legacy)
     * @param layoutSwitcher - Layout Switcher instance
     * @param zoneOverlay - Zone overlay instance (optional)
     * @param notificationService - Notification service for routing (optional)
     */
    constructor(
        settings: Gio.Settings,
        layoutManager: LayoutManager,
        windowManager: WindowManager,
        _notificationManager: NotificationManager,  // Legacy param, kept for API compatibility
        layoutEditor: LayoutSwitcher,
        _zoneOverlay: ZoneOverlay | null = null,    // Legacy param, kept for API compatibility
        notificationService: NotificationService | null = null,
    ) {
        this._settings = settings;
        this._layoutManager = layoutManager;
        this._windowManager = windowManager;
        this._layoutSwitcher = layoutEditor;
        this._notificationService = notificationService;
        this._registeredKeys = [];
        this._enhancedWindowManagementKeys = ['minimize-window', 'maximize-window'];
        this._quickLayoutKeys = ['quick-layout-1', 'quick-layout-2', 'quick-layout-3',
            'quick-layout-4', 'quick-layout-5', 'quick-layout-6',
            'quick-layout-7', 'quick-layout-8', 'quick-layout-9'];
        this._settingsChangedId = null;
        this._quickLayoutSettingsChangedId = null;

        // Bound signal handlers (for proper cleanup)
        this._boundOnEnhancedWindowManagementChanged = null;
        this._boundOnQuickLayoutShortcutsChanged = null;

        // Pre-bind ALL keybinding handler methods to prevent closure leaks
        this._boundOnCycleZoneLeft = this._onCycleZoneLeft.bind(this);
        this._boundOnCycleZoneRight = this._onCycleZoneRight.bind(this);
        this._boundOnShowLayoutSwitcher = this._onShowLayoutSwitcher.bind(this);
        this._boundOnMinimizeWindow = this._onMinimizeWindow.bind(this);
        this._boundOnMaximizeWindow = this._onMaximizeWindow.bind(this);

        // Pre-bind quick layout handlers (1-9) to prevent closure leaks in loop
        this._boundQuickLayoutHandlers = [];
        for (let i = 1; i <= 9; i++) {
            this._boundQuickLayoutHandlers[i] = (() => this._onQuickLayout(i));
        }
    }

    /**
     * Register all keybindings
     */
    registerKeybindings(): void {
        logger.info('Registering keybindings...');

        // Zone cycling - use pre-bound handlers
        this._registerKeybinding('cycle-zone-left', this._boundOnCycleZoneLeft);
        this._registerKeybinding('cycle-zone-right', this._boundOnCycleZoneRight);

        // Layout picker - use pre-bound handler
        this._registerKeybinding('show-layout-picker', this._boundOnShowLayoutSwitcher);

        // Enhanced window management (optional)
        this._registerEnhancedWindowManagement();

        // Quick layout shortcuts (Super+Ctrl+Alt+1-9) - optional
        this._registerQuickLayoutShortcuts();

        // Listen for settings changes to toggle enhanced window management
        this._boundOnEnhancedWindowManagementChanged = this._onEnhancedWindowManagementChanged.bind(this);
        this._settingsChangedId = this._settings?.connect(
            'changed::enhanced-window-management-enabled',
            this._boundOnEnhancedWindowManagementChanged,
        ) ?? null;

        // Listen for settings changes to toggle quick layout shortcuts
        this._boundOnQuickLayoutShortcutsChanged = this._onQuickLayoutShortcutsChanged.bind(this);
        this._quickLayoutSettingsChangedId = this._settings?.connect(
            'changed::quick-layout-shortcuts-enabled',
            this._boundOnQuickLayoutShortcutsChanged,
        ) ?? null;

        logger.info(`Registered ${this._registeredKeys.length} keybindings`);
    }

    /**
     * Register quick layout shortcuts (Super+Ctrl+Alt+1-9) if enabled
     * @private
     */
    private _registerQuickLayoutShortcuts(): void {
        const enabled = this._settings?.get_boolean('quick-layout-shortcuts-enabled') ?? false;

        if (!enabled) {
            logger.debug('Quick layout shortcuts disabled, skipping registration');
            return;
        }

        logger.info('Registering quick layout shortcuts...');

        // Use pre-bound handlers to prevent closure leaks
        for (let i = 1; i <= 9; i++) {
            this._registerKeybinding(`quick-layout-${i}`, this._boundQuickLayoutHandlers[i]);
        }
    }

    /**
     * Handle quick layout shortcuts setting change
     * @private
     */
    private _onQuickLayoutShortcutsChanged(): void {
        const enabled = this._settings?.get_boolean('quick-layout-shortcuts-enabled') ?? false;
        logger.info(`Quick layout shortcuts ${enabled ? 'enabled' : 'disabled'}`);

        if (enabled) {
            // Register if not already registered
            this._registerQuickLayoutShortcuts();
        } else {
            // Unregister quick layout keybindings
            this._unregisterQuickLayoutShortcuts();
        }
    }

    /**
     * Unregister only quick layout shortcuts keybindings
     * @private
     */
    private _unregisterQuickLayoutShortcuts(): void {
        this._quickLayoutKeys.forEach(name => {
            if (this._registeredKeys.includes(name)) {
                try {
                    (Main.wm as any).removeKeybinding(name);
                    this._registeredKeys = this._registeredKeys.filter(k => k !== name);
                    logger.debug(`Unregistered quick layout keybinding: ${name}`);
                } catch (error) {
                    logger.error(`Failed to unregister quick layout keybinding '${name}': ${error}`);
                }
            }
        });
    }

    /**
     * Register enhanced window management keybindings if enabled
     * @private
     */
    private _registerEnhancedWindowManagement(): void {
        const enabled = this._settings?.get_boolean('enhanced-window-management-enabled') ?? false;

        if (!enabled) {
            logger.debug('Enhanced window management disabled, skipping registration');
            return;
        }

        logger.info('Registering enhanced window management keybindings...');

        // Use pre-bound handlers to prevent closure leaks
        this._registerKeybinding('minimize-window', this._boundOnMinimizeWindow);
        this._registerKeybinding('maximize-window', this._boundOnMaximizeWindow);
    }

    /**
     * Handle enhanced window management setting change
     * @private
     */
    private _onEnhancedWindowManagementChanged(): void {
        const enabled = this._settings?.get_boolean('enhanced-window-management-enabled') ?? false;
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
    private _unregisterEnhancedWindowManagement(): void {
        this._enhancedWindowManagementKeys.forEach(name => {
            if (this._registeredKeys.includes(name)) {
                try {
                    (Main.wm as any).removeKeybinding(name);
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
    private _registerKeybinding(name: string, handler: () => void): void {
        try {
            (Main.wm as any).addKeybinding(
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
    unregisterKeybindings(): void {
        logger.info('Unregistering keybindings...');

        this._registeredKeys.forEach(name => {
            try {
                (Main.wm as any).removeKeybinding(name);
                logger.debug(`Unregistered keybinding: ${name}`);
            } catch (error) {
                logger.error(`Failed to unregister keybinding '${name}': ${error}`);
            }
        });

        this._registeredKeys = [];
    }

    /**
     * Get space key from focused window for per-space mode
     * @param window - The window to get space context from
     * @returns Space key if per-workspace mode enabled, null otherwise
     * @private
     */
    private _getSpaceKeyFromWindow(window: Meta.Window | null): string | null {
        const perSpaceEnabled = this._settings?.get_boolean('use-per-workspace-layouts') ?? false;
        if (!perSpaceEnabled || !window) return null;

        const spatialStateManager = this._layoutManager?.getSpatialStateManager();
        if (!spatialStateManager) return null;

        return spatialStateManager.getSpaceKeyForWindow(window);
    }

    /**
     * Cycle zone and move focused window (shared logic)
     * @private
     */
    private _cycleZoneAndNotify(direction: number): void {
        const window = this._windowManager?.getFocusedWindow();
        if (!window) {
            logger.debug('No focused window to move');
            return;
        }

        const spaceKey = this._getSpaceKeyFromWindow(window);
        const zone = this._layoutManager?.cycleZone(direction, spaceKey as any);
        if (!zone) {
            logger.warn(`Failed to cycle to ${direction > 0 ? 'next' : 'previous'} zone`);
            return;
        }

        const layout = this._layoutManager?.getCurrentLayout(spaceKey as any);
        const padding = layout?.padding || 0;
        this._windowManager?.moveWindowToZone(window, zone, padding);

        this._notifyZoneChange(spaceKey, layout);
    }

    /**
     * Show zone change notification
     * @private
     */
    private _notifyZoneChange(spaceKey: string | null, layout: any): void {
        if (!this._notificationService || !layout) return;

        const zoneIndex = spaceKey
            ? this._layoutManager?.getZoneIndexForSpace(spaceKey) ?? 0
            : this._layoutManager?.getCurrentZoneIndex() ?? 0;
        const totalZones = layout?.zones.length ?? 0;

        this._notificationService.notifyZone(
            NotifyCategory.WINDOW_SNAPPING,
            layout.name,
            zoneIndex,
            totalZones,
        );
    }

    /**
     * Handler: Cycle to previous zone (Super+Left)
     * @private
     */
    private _onCycleZoneLeft(): void {
        logger.debug('Cycle zone left triggered');
        this._cycleZoneAndNotify(-1);
    }

    /**
     * Handler: Cycle to next zone (Super+Right)
     * @private
     */
    private _onCycleZoneRight(): void {
        logger.debug('Cycle zone right triggered');
        this._cycleZoneAndNotify(1);
    }

    /**
     * Handler: Show Layout Switcher (Super+grave)
     * @private
     */
    private _onShowLayoutSwitcher(): void {
        logger.debug('Show Layout Switcher triggered');

        if (this._layoutSwitcher) {
            this._layoutSwitcher.show();
        } else {
            logger.warn('Layout Switcher not available');
        }
    }

    /**
     * Find layout by shortcut key
     * @private
     */
    private _findLayoutByShortcut(shortcutKey: number): any | null {
        const layouts = this._layoutManager?.getAllLayoutsOrdered() ?? [];
        return layouts.find(l =>
            l.shortcut === String(shortcutKey) || l.shortcut === shortcutKey,
        ) ?? null;
    }

    /**
     * Apply layout based on current mode (global vs per-workspace)
     * @private
     */
    private _applyLayoutByMode(layout: any): void {
        const perSpaceEnabled = this._settings?.get_boolean('use-per-workspace-layouts') ?? false;

        if (perSpaceEnabled) {
            const spatialStateManager = this._layoutManager?.getSpatialStateManager();
            if (spatialStateManager) {
                const window = this._windowManager?.getFocusedWindow() ?? null;
                const spaceKey = spatialStateManager.getSpaceKeyForWindow(window);
                this._layoutManager?.setLayoutForSpace(spaceKey, layout.id);
                logger.info(`Applied layout '${layout.name}' to space ${spaceKey}`);
            }
        } else {
            this._layoutManager?.setLayout(layout.id);
        }
    }

    /**
     * Handler: Quick layout shortcut (Super+Ctrl+Alt+1-9)
     * Activates layout by its assigned shortcut property (user-configurable in layout settings)
     * @param shortcutKey - The shortcut key pressed (1-9)
     * @private
     */
    private _onQuickLayout(shortcutKey: number): void {
        logger.debug(`Quick layout shortcut ${shortcutKey} triggered`);

        const layout = this._findLayoutByShortcut(shortcutKey);
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
        this._applyLayoutByMode(layout);

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
    private _onMinimizeWindow(): void {
        logger.debug('Minimize window triggered');

        const window = this._windowManager?.getFocusedWindow();
        if (!window) {
            // No focused window - try to restore the last minimized
            const restored = this._windowManager?.restoreMinimizedWindow() ?? false;
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
        this._windowManager?.minimizeWindow(window);
        if (this._notificationService) {
            this._notificationService.notify(
                NotifyCategory.WINDOW_MANAGEMENT,
                'Minimized',
            );
        }
    }

    /**
     * Try to restore a minimized window and notify
     * @private
     */
    private _tryRestoreMinimized(): boolean {
        const restored = this._windowManager?.restoreMinimizedWindow() ?? false;
        if (restored && this._notificationService) {
            this._notificationService.notify(
                NotifyCategory.WINDOW_MANAGEMENT,
                'Restored',
            );
        }
        return restored;
    }

    /**
     * Handler: Maximize/restore window (Super+Up)
     * If a window was minimized by Super+Down, restore it.
     * Otherwise, toggle between maximized and floating.
     * @private
     */
    private _onMaximizeWindow(): void {
        logger.debug('Maximize window triggered');

        if (this._tryRestoreMinimized()) {
            return;
        }

        const window = this._windowManager?.getFocusedWindow();
        if (!window) {
            logger.debug('No focused window to maximize');
            return;
        }

        const wasMaximized = window.maximized_horizontally || window.maximized_vertically;
        this._windowManager?.maximizeWindow(window);

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
    destroy(): void {
        // Unregister keybindings first
        this.unregisterKeybindings();

        // Disconnect settings listeners
        if (this._settingsChangedId && this._settings) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        if (this._quickLayoutSettingsChangedId && this._settings) {
            this._settings.disconnect(this._quickLayoutSettingsChangedId);
            this._quickLayoutSettingsChangedId = null;
        }

        // Release ALL bound function references to prevent memory leaks
        this._boundOnEnhancedWindowManagementChanged = null;
        this._boundOnQuickLayoutShortcutsChanged = null;

        // Release ALL component references to break reference cycles
        this._settings = null;
        this._layoutManager = null;
        this._windowManager = null;
        this._layoutSwitcher = null;
        this._notificationService = null;
    }
}
