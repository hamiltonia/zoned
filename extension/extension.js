/**
 * Zoned - Advanced window zone management for GNOME Shell
 * 
 * Main extension entry point that coordinates all components:
 * - WindowManager: Window positioning and manipulation
 * - LayoutManager: Layout loading and state management
 * - KeybindingManager: Keyboard shortcut handling
 * - NotificationManager: Visual feedback
 * - LayoutSwitcher: Layout selection UI
 * - ZoneOverlay: Visual zone feedback
 * - ConflictDetector: Keybinding conflict detection
 * - PanelIndicator: Top bar menu
 */

import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {WindowManager} from './windowManager.js';
import {LayoutManager} from './layoutManager.js';
import {TemplateManager} from './templateManager.js';
import {KeybindingManager} from './keybindingManager.js';
import {NotificationManager} from './ui/notificationManager.js';
import {LayoutEditor} from './ui/layoutEditor.js';
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
        this._layoutManager = null;
        this._templateManager = null;
        this._notificationManager = null;
        this._layoutEditor = null;
        this._zoneOverlay = null;
        this._conflictDetector = null;
        this._panelIndicator = null;
        this._keybindingManager = null;
        this._workspaceSwitchedSignal = null;
        
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

            // Initialize LayoutManager and load layouts
            this._layoutManager = new LayoutManager(this._settings, this.path);
            const layoutsLoaded = this._layoutManager.loadLayouts();
            
            if (!layoutsLoaded) {
                throw new Error('Failed to load layouts');
            }
            logger.debug('LayoutManager initialized');

            // Initialize ConflictDetector
            this._conflictDetector = new ConflictDetector(this._settings);
            const conflicts = this._conflictDetector.detectConflicts();
            logger.debug('ConflictDetector initialized');

            // Initialize NotificationManager
            this._notificationManager = new NotificationManager(this);
            logger.debug('NotificationManager initialized');

            // Initialize ZoneOverlay
            this._zoneOverlay = new ZoneOverlay(this);
            logger.debug('ZoneOverlay initialized');

            // Initialize TemplateManager
            this._templateManager = new TemplateManager();
            logger.debug('TemplateManager initialized');

            // Initialize LayoutEditor
            this._layoutEditor = new LayoutEditor(
                this._layoutManager,
                this._zoneOverlay,
                this._settings
            );
            logger.debug('LayoutEditor initialized');

            // Initialize PanelIndicator
            this._panelIndicator = new PanelIndicator(
                this._layoutManager,
                this._conflictDetector,
                this._layoutEditor,
                this._notificationManager,
                this._zoneOverlay
            );
            Main.panel.addToStatusArea('zoned-indicator', this._panelIndicator);
            
            // Set conflict status in panel
            this._panelIndicator.setConflictStatus(this._conflictDetector.hasConflicts());
            logger.debug('PanelIndicator initialized');

            // Initialize KeybindingManager (with zone overlay)
            this._keybindingManager = new KeybindingManager(
                this._settings,
                this._layoutManager,
                this._windowManager,
                this._notificationManager,
                this._layoutEditor,
                this._zoneOverlay
            );

            // Register all keybindings
            this._keybindingManager.registerKeybindings();
            logger.debug('KeybindingManager initialized');

            // Setup workspace switching handler (if workspace mode enabled)
            this._setupWorkspaceHandler();

            // Show startup notification
            const currentLayout = this._layoutManager.getCurrentLayout();
            if (currentLayout) {
                this._notificationManager.show(
                    `Enabled: ${currentLayout.name}`,
                    1500
                );
            }

            // Warn if conflicts detected
            if (this._conflictDetector.hasConflicts()) {
                const conflictCount = conflicts.length;
                this._notificationManager.show(
                    `⚠️ ${conflictCount} keybinding conflict${conflictCount !== 1 ? 's' : ''} detected. Click icon for details.`,
                    3000
                );
            }

            logger.info('Extension enabled successfully');
        } catch (error) {
            logger.error(`Error enabling extension: ${error}`);
            logger.error(error.stack);
            
            // Clean up on error
            this.disable();
            
            // Error dialog removed - MessageDialog deleted
            // Extension will fail to load, user can check logs
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

            // Disconnect workspace handler
            if (this._workspaceSwitchedSignal) {
                global.workspace_manager.disconnect(this._workspaceSwitchedSignal);
                this._workspaceSwitchedSignal = null;
                logger.debug('Workspace handler disconnected');
            }

            // Destroy UI components
            if (this._layoutEditor) {
                this._layoutEditor.destroy();
                this._layoutEditor = null;
                logger.debug('LayoutEditor destroyed');
            }

            // TemplateManager has no destroy method (no cleanup needed)
            this._templateManager = null;

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
            if (this._layoutManager) {
                this._layoutManager.destroy();
                this._layoutManager = null;
                logger.debug('LayoutManager destroyed');
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

    /**
     * Setup workspace switching handler
     * Automatically switches layouts when workspace changes (if workspace mode enabled)
     * @private
     */
    _setupWorkspaceHandler() {
        // Connect to workspace-switched signal
        this._workspaceSwitchedSignal = global.workspace_manager.connect(
            'workspace-switched',
            (manager, from, to) => {
                // Only auto-switch if workspace mode is enabled
                const workspaceMode = this._settings.get_boolean('use-per-workspace-layouts');
                if (!workspaceMode) {
                    return;
                }

                const toIndex = to.index();
                logger.debug(`Workspace switched to ${toIndex}`);

                // Get layout for this workspace
                try {
                    const mapString = this._settings.get_string('workspace-layout-map');
                    const map = JSON.parse(mapString);
                    const layoutId = map[toIndex.toString()];

                    if (layoutId) {
                        // Switch to the assigned layout
                        const success = this._layoutManager.setLayout(layoutId);
                        if (success) {
                            const layout = this._layoutManager.getCurrentLayout();
                            logger.info(`Auto-switched to layout: ${layout.name} for workspace ${toIndex}`);
                            
                            // Show notification
                            this._zoneOverlay.showMessage(`Workspace ${toIndex + 1}: ${layout.name}`);
                        }
                    } else {
                        // No layout assigned - use halves as default
                        const layouts = this._layoutManager.getAllLayouts();
                        const halvesLayout = layouts.find(l => l.id === 'halves');
                        if (halvesLayout) {
                            this._layoutManager.setLayout('halves');
                            logger.debug(`No layout assigned for workspace ${toIndex}, using halves`);
                        }
                    }
                } catch (e) {
                    logger.error(`Error switching layout for workspace ${toIndex}:`, e);
                }
            }
        );

        logger.debug('Workspace switching handler setup');
    }
}
