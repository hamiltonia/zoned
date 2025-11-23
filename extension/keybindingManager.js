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

export class KeybindingManager {
    /**
     * @param {Gio.Settings} settings - GSettings object
     * @param {ProfileManager} profileManager - Profile manager instance
     * @param {WindowManager} windowManager - Window manager instance
     * @param {NotificationManager} notificationManager - Notification manager instance
     * @param {ProfilePicker} profilePicker - Profile picker instance
     * @param {ZoneOverlay} zoneOverlay - Zone overlay instance (optional)
     */
    constructor(settings, profileManager, windowManager, notificationManager, profilePicker, zoneOverlay = null) {
        this._settings = settings;
        this._profileManager = profileManager;
        this._windowManager = windowManager;
        this._notificationManager = notificationManager;
        this._profilePicker = profilePicker;
        this._zoneOverlay = zoneOverlay;
        this._registeredKeys = [];
    }

    /**
     * Register all keybindings
     */
    registerKeybindings() {
        console.log('[Zoned] Registering keybindings...');

        // Zone cycling
        this._registerKeybinding(
            'cycle-zone-left',
            this._onCycleZoneLeft.bind(this)
        );

        this._registerKeybinding(
            'cycle-zone-right',
            this._onCycleZoneRight.bind(this)
        );

        // Profile picker
        this._registerKeybinding(
            'show-profile-picker',
            this._onShowProfilePicker.bind(this)
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

        console.log(`[Zoned] Registered ${this._registeredKeys.length} keybindings`);
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
            console.log(`[Zoned] Registered keybinding: ${name}`);
        } catch (error) {
            console.error(`[Zoned] Failed to register keybinding '${name}': ${error}`);
        }
    }

    /**
     * Unregister all keybindings
     */
    unregisterKeybindings() {
        console.log('[Zoned] Unregistering keybindings...');

        this._registeredKeys.forEach(name => {
            try {
                Main.wm.removeKeybinding(name);
                console.log(`[Zoned] Unregistered keybinding: ${name}`);
            } catch (error) {
                console.error(`[Zoned] Failed to unregister keybinding '${name}': ${error}`);
            }
        });

        this._registeredKeys = [];
    }

    /**
     * Handler: Cycle to previous zone (Super+Left)
     * @private
     */
    _onCycleZoneLeft() {
        console.log('[Zoned] Cycle zone left triggered');

        const window = this._windowManager.getFocusedWindow();
        if (!window) {
            console.log('[Zoned] No focused window to move');
            return;
        }

        const zone = this._profileManager.cycleZone(-1);
        if (!zone) {
            console.warn('[Zoned] Failed to cycle to previous zone');
            return;
        }

        this._windowManager.moveWindowToZone(window, zone);

        const profile = this._profileManager.getCurrentProfile();
        const zoneIndex = this._profileManager.getCurrentZoneIndex();
        const totalZones = profile.zones.length;

        // Show zone overlay if available, otherwise fall back to notification
        if (this._zoneOverlay) {
            this._zoneOverlay.show(profile.name, zoneIndex, totalZones);
        } else {
            this._notificationManager.show(
                `${profile.name}: Zone ${zoneIndex + 1}/${totalZones}`
            );
        }
    }

    /**
     * Handler: Cycle to next zone (Super+Right)
     * @private
     */
    _onCycleZoneRight() {
        console.log('[Zoned] Cycle zone right triggered');

        const window = this._windowManager.getFocusedWindow();
        if (!window) {
            console.log('[Zoned] No focused window to move');
            return;
        }

        const zone = this._profileManager.cycleZone(1);
        if (!zone) {
            console.warn('[Zoned] Failed to cycle to next zone');
            return;
        }

        this._windowManager.moveWindowToZone(window, zone);

        const profile = this._profileManager.getCurrentProfile();
        const zoneIndex = this._profileManager.getCurrentZoneIndex();
        const totalZones = profile.zones.length;

        // Show zone overlay if available, otherwise fall back to notification
        if (this._zoneOverlay) {
            this._zoneOverlay.show(profile.name, zoneIndex, totalZones);
        } else {
            this._notificationManager.show(
                `${profile.name}: Zone ${zoneIndex + 1}/${totalZones}`
            );
        }
    }

    /**
     * Handler: Show profile picker (Super+grave)
     * @private
     */
    _onShowProfilePicker() {
        console.log('[Zoned] Show profile picker triggered');

        if (this._profilePicker) {
            this._profilePicker.show();
        } else {
            console.warn('[Zoned] Profile picker not available');
        }
    }

    /**
     * Handler: Minimize window (Super+Down)
     * @private
     */
    _onMinimizeWindow() {
        console.log('[Zoned] Minimize window triggered');

        const window = this._windowManager.getFocusedWindow();
        if (!window) {
            console.log('[Zoned] No focused window to minimize');
            return;
        }

        this._windowManager.minimizeWindow(window);
        this._notificationManager.show('Minimized');
    }

    /**
     * Handler: Maximize/restore window (Super+Up)
     * @private
     */
    _onMaximizeWindow() {
        console.log('[Zoned] Maximize window triggered');

        const window = this._windowManager.getFocusedWindow();
        
        // First, try to restore any minimized window
        const restored = this._windowManager.restoreMinimizedWindow();
        if (restored) {
            this._notificationManager.show('Restored');
            return;
        }
        
        // If no minimized window and no focused window, nothing to do
        if (!window) {
            console.log('[Zoned] No window to maximize or restore');
            return;
        }

        // Handle the focused window
        const wasMaximized = window.maximized_horizontally || window.maximized_vertically;

        this._windowManager.maximizeWindow(window);

        if (wasMaximized) {
            this._notificationManager.show('Unmaximized');
        } else {
            this._notificationManager.show('Maximized');
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.unregisterKeybindings();
    }
}
