/**
 * Zoned - Advanced window zone management for GNOME Shell
 * 
 * Main extension entry point that coordinates all components:
 * - WindowManager: Window positioning and manipulation
 * - ProfileManager: Profile loading and state management
 * - KeybindingManager: Keyboard shortcut handling
 * - NotificationManager: Visual feedback
 * - ProfilePicker: Profile selection UI
 * - ZoneOverlay: Visual zone feedback
 * - ConflictDetector: Keybinding conflict detection
 * - PanelIndicator: Top bar menu
 */

import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {WindowManager} from './windowManager.js';
import {ProfileManager} from './profileManager.js';
import {KeybindingManager} from './keybindingManager.js';
import {NotificationManager} from './ui/notificationManager.js';
import {ProfilePicker} from './ui/profilePicker.js';
import {ZoneOverlay} from './ui/zoneOverlay.js';
import {ConflictDetector} from './ui/conflictDetector.js';
import {PanelIndicator} from './ui/panelIndicator.js';
import {createLogger} from './utils/debug.js';

const logger = createLogger('Extension');

export default class ZonedExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        
        // Manager instances
        this._settings = null;
        this._windowManager = null;
        this._profileManager = null;
        this._notificationManager = null;
        this._profilePicker = null;
        this._zoneOverlay = null;
        this._conflictDetector = null;
        this._panelIndicator = null;
        this._keybindingManager = null;
        
        logger.info('Extension constructed');
    }

    /**
     * Enable the extension - called when extension is loaded
     */
    enable() {
        logger.info('Enabling extension...');

        try {
            // Initialize GSettings
            this._settings = this.getSettings('org.gnome.shell.extensions.zoned');
            logger.debug('GSettings initialized');

            // Initialize WindowManager
            this._windowManager = new WindowManager();
            logger.debug('WindowManager initialized');

            // Initialize ProfileManager and load profiles
            this._profileManager = new ProfileManager(this._settings, this.path);
            const profilesLoaded = this._profileManager.loadProfiles();
            
            if (!profilesLoaded) {
                throw new Error('Failed to load profiles');
            }
            logger.debug('ProfileManager initialized');

            // Initialize ConflictDetector
            this._conflictDetector = new ConflictDetector(this._settings);
            const conflicts = this._conflictDetector.detectConflicts();
            logger.debug('ConflictDetector initialized');

            // Initialize NotificationManager
            this._notificationManager = new NotificationManager();
            logger.debug('NotificationManager initialized');

            // Initialize ZoneOverlay
            this._zoneOverlay = new ZoneOverlay();
            logger.debug('ZoneOverlay initialized');

            // Initialize ProfilePicker (simple, no callbacks needed)
            this._profilePicker = new ProfilePicker(
                this._profileManager,
                this._notificationManager,
                this._settings
            );
            logger.debug('ProfilePicker initialized');

            // Initialize PanelIndicator
            this._panelIndicator = new PanelIndicator(
                this._profileManager,
                this._conflictDetector,
                this._profilePicker,
                this._notificationManager
            );
            Main.panel.addToStatusArea('zoned-indicator', this._panelIndicator);
            
            // Set conflict status in panel
            this._panelIndicator.setConflictStatus(this._conflictDetector.hasConflicts());
            logger.debug('PanelIndicator initialized');

            // Initialize KeybindingManager (with zone overlay)
            this._keybindingManager = new KeybindingManager(
                this._settings,
                this._profileManager,
                this._windowManager,
                this._notificationManager,
                this._profilePicker,
                this._zoneOverlay
            );

            // Register all keybindings
            this._keybindingManager.registerKeybindings();
            logger.debug('KeybindingManager initialized');

            // Show startup notification
            const currentProfile = this._profileManager.getCurrentProfile();
            if (currentProfile) {
                this._notificationManager.show(
                    `Zoned enabled: ${currentProfile.name}`,
                    1500
                );
            }

            // Warn if conflicts detected
            if (this._conflictDetector.hasConflicts()) {
                const conflictCount = conflicts.length;
                Main.notify(
                    'Zoned',
                    `⚠️ ${conflictCount} keybinding conflict${conflictCount !== 1 ? 's' : ''} detected. Click the Zoned icon in the top bar for details.`
                );
            }

            logger.info('Extension enabled successfully');
        } catch (error) {
            logger.error(`Error enabling extension: ${error}`);
            logger.error(error.stack);
            
            // Clean up on error
            this.disable();
            
            // Show error notification
            Main.notifyError('Zoned Error', `Failed to enable: ${error.message}`);
        }
    }

    /**
     * Disable the extension - called when extension is unloaded
     */
    disable() {
        logger.info('Disabling extension...');

        try {
            // Unregister keybindings
            if (this._keybindingManager) {
                this._keybindingManager.destroy();
                this._keybindingManager = null;
                logger.debug('KeybindingManager destroyed');
            }

            // Destroy panel indicator
            if (this._panelIndicator) {
                this._panelIndicator.destroy();
                this._panelIndicator = null;
                logger.debug('PanelIndicator destroyed');
            }

            // Destroy UI components
            if (this._profilePicker) {
                this._profilePicker.destroy();
                this._profilePicker = null;
                logger.debug('ProfilePicker destroyed');
            }

            if (this._zoneOverlay) {
                this._zoneOverlay.destroy();
                this._zoneOverlay = null;
                logger.debug('ZoneOverlay destroyed');
            }

            if (this._notificationManager) {
                this._notificationManager.destroy();
                this._notificationManager = null;
                logger.debug('NotificationManager destroyed');
            }

            // Destroy conflict detector
            if (this._conflictDetector) {
                this._conflictDetector.destroy();
                this._conflictDetector = null;
                logger.debug('ConflictDetector destroyed');
            }

            // Destroy managers
            if (this._profileManager) {
                this._profileManager.destroy();
                this._profileManager = null;
                logger.debug('ProfileManager destroyed');
            }

            if (this._windowManager) {
                this._windowManager.destroy();
                this._windowManager = null;
                logger.debug('WindowManager destroyed');
            }

            // Clear settings
            this._settings = null;

            logger.info('Extension disabled successfully');
        } catch (error) {
            logger.error(`Error disabling extension: ${error}`);
            logger.error(error.stack);
        }
    }
}
