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

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {WindowManager} from './windowManager.js';
import {LayoutManager} from './layoutManager.js';
import {SpatialStateManager} from './spatialStateManager.js';
import {TemplateManager} from './templateManager.js';
import {KeybindingManager} from './keybindingManager.js';
import {NotificationManager} from './ui/notificationManager.js';
import {LayoutSwitcher} from './ui/layoutSwitcher.js';
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
        this._spatialStateManager = null;
        this._templateManager = null;
        this._notificationManager = null;
        this._layoutSwitcher = null;
        this._zoneOverlay = null;
        this._conflictDetector = null;
        this._panelIndicator = null;
        this._keybindingManager = null;
        this._workspaceSwitchedSignal = null;
        this._conflictCountSignal = null;

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

            // Initialize SpatialStateManager (per-space layout state)
            this._spatialStateManager = new SpatialStateManager(this._settings);
            this._layoutManager.setSpatialStateManager(this._spatialStateManager);
            logger.debug('SpatialStateManager initialized');

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

            // Initialize LayoutSwitcher
            this._layoutSwitcher = new LayoutSwitcher(
                this._layoutManager,
                this._zoneOverlay,
                this._settings,
            );
            logger.debug('LayoutSwitcher initialized');

            // Initialize PanelIndicator (pass settings for scroll-target support)
            this._panelIndicator = new PanelIndicator(
                this._layoutManager,
                this._conflictDetector,
                this._layoutSwitcher,
                this._notificationManager,
                this._zoneOverlay,
                this._settings,
            );
            Main.panel.addToStatusArea('zoned-indicator', this._panelIndicator);

            // Set conflict status in panel
            this._panelIndicator.setConflictStatus(this._conflictDetector.hasConflicts());

            // Watch for conflict count changes from prefs (prefs runs in separate process)
            this._conflictCountSignal = this._settings.connect('changed::keybinding-conflict-count', () => {
                logger.debug('Conflict count changed by prefs, re-detecting...');
                this._conflictDetector.detectConflicts();
                this._panelIndicator.setConflictStatus(this._conflictDetector.hasConflicts());
            });
            logger.debug('PanelIndicator initialized');

            // Initialize KeybindingManager (with zone overlay)
            this._keybindingManager = new KeybindingManager(
                this._settings,
                this._layoutManager,
                this._windowManager,
                this._notificationManager,
                this._layoutSwitcher,
                this._zoneOverlay,
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
                    1500,
                );
            }

            // Warn if conflicts detected
            if (this._conflictDetector.hasConflicts()) {
                const conflictCount = conflicts.length;
                this._notificationManager.show(
                    `⚠️ ${conflictCount} keybinding conflict${conflictCount !== 1 ? 's' : ''} detected. Click icon for details.`,
                    3000,
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
            // Disconnect signal handlers first
            this._disconnectSignals();

            // Destroy components in reverse initialization order
            this._destroyComponents();

            // Clear settings reference
            this._settings = null;

            logger.info('Extension disabled successfully');
        } catch (error) {
            logger.error(`Error disabling extension: ${error}`);
            logger.error(error.stack);
        }
    }

    /**
     * Disconnect signal handlers during disable
     * @private
     */
    _disconnectSignals() {
        if (this._workspaceSwitchedSignal) {
            global.workspace_manager.disconnect(this._workspaceSwitchedSignal);
            this._workspaceSwitchedSignal = null;
            logger.debug('Workspace handler disconnected');
        }

        if (this._conflictCountSignal && this._settings) {
            this._settings.disconnect(this._conflictCountSignal);
            this._conflictCountSignal = null;
            logger.debug('Conflict count watcher disconnected');
        }
    }

    /**
     * Destroy all extension components in proper order
     * @private
     */
    _destroyComponents() {
        // Components with destroy() methods, in reverse init order
        const components = [
            ['_keybindingManager', 'KeybindingManager'],
            ['_panelIndicator', 'PanelIndicator'],
            ['_layoutSwitcher', 'LayoutSwitcher'],
            ['_zoneOverlay', 'ZoneOverlay'],
            ['_notificationManager', 'NotificationManager'],
            ['_conflictDetector', 'ConflictDetector'],
            ['_spatialStateManager', 'SpatialStateManager'],
            ['_layoutManager', 'LayoutManager'],
            ['_windowManager', 'WindowManager'],
        ];

        for (const [prop, name] of components) {
            if (this[prop]) {
                this[prop].destroy();
                this[prop] = null;
                logger.debug(`${name} destroyed`);
            }
        }

        // TemplateManager has no destroy method (no cleanup needed)
        this._templateManager = null;
    }

    /**
     * Setup workspace switching handler
     * Uses SpatialStateManager for per-space layout state when workspace mode enabled
     * @private
     */
    _setupWorkspaceHandler() {
        // Connect to workspace-switched signal
        // Signal signature: (manager, from, to, direction) where from/to are INTEGER indices
        this._workspaceSwitchedSignal = global.workspace_manager.connect(
            'workspace-switched',
            (manager, from, to, _direction) => {
                // Only react if workspace mode is enabled
                const workspaceMode = this._settings.get_boolean('use-per-workspace-layouts');
                if (!workspaceMode) {
                    return;
                }

                // 'to' is already an integer index, NOT a workspace object
                const toIndex = to;

                // Use SpatialStateManager for per-space state
                try {
                    const spaceKey = this._spatialStateManager.makeKey(
                        Main.layoutManager.primaryIndex,
                        toIndex,
                    );

                    const state = this._spatialStateManager.getState(spaceKey);
                    const layoutId = state.layoutId;

                    // Switch to the assigned layout
                    const layout = this._layoutManager.getAllLayouts().find(l => l.id === layoutId);
                    if (layout) {
                        this._layoutManager.setLayout(layoutId);
                        // Show notification with workspace number
                        this._zoneOverlay.showMessage(`Workspace ${toIndex + 1}: ${layout.name}`);
                    } else {
                        // Layout not found - use fallback
                        const fallbackId = 'halves';
                        this._layoutManager.setLayout(fallbackId);
                        logger.warn(`Layout '${layoutId}' not found, using fallback`);
                        this._zoneOverlay.showMessage(`Workspace ${toIndex + 1}: Halves (fallback)`);
                    }
                } catch (e) {
                    logger.error(`Error switching layout for workspace ${toIndex}: ${e}`);
                }
            },
        );

        logger.debug('Workspace switching handler setup (using SpatialStateManager)');
    }
}
