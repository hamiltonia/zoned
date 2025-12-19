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
import {createLogger, initDebugSettings, destroyDebugSettings} from './utils/debug.js';
import {NotificationService, NotifyCategory} from './utils/notificationService.js';
import {initResourceTracking, destroyResourceTracking} from './utils/resourceTracker.js';
import {createDebugInterface} from './utils/debugInterface.js';

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
        this._notificationService = null;
        this._layoutSwitcher = null;
        this._zoneOverlay = null;
        this._conflictDetector = null;
        this._panelIndicator = null;
        this._keybindingManager = null;
        this._workspaceSwitchedSignal = null;
        this._conflictCountSignal = null;
        this._previewSignal = null;
        this._showIndicatorSignal = null;
        this._debugInterface = null;

        logger.info('Extension constructed');
    }

    /**
     * Enable the extension - called when extension is loaded
     */
    enable() {
        logger.info('Enabling extension...');

        // Initialize GSettings
        this._settings = this.getSettings('org.gnome.shell.extensions.zoned');
        logger.debug('GSettings initialized');

        // Initialize debug logging from GSettings (must be early)
        initDebugSettings(this._settings);
        logger.debug('Debug settings initialized');

        // Initialize resource tracking (for stability testing)
        initResourceTracking(this._settings);
        logger.debug('Resource tracking initialized');

        // Initialize D-Bus debug interface (for automated testing)
        this._debugInterface = createDebugInterface(this);
        this._debugInterface.init();
        logger.debug('Debug interface initialized');

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

        // Initialize NotificationService (routes notifications based on settings)
        this._notificationService = new NotificationService(
            this,
            this._zoneOverlay,
            this._notificationManager,
        );
        logger.debug('NotificationService initialized');

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
            this._notificationService,
        );

        // Add to status area, but check visibility setting
        Main.panel.addToStatusArea('zoned-indicator', this._panelIndicator);
        const showIndicator = this._settings.get_boolean('show-panel-indicator');
        this._panelIndicator.visible = showIndicator;

        // Watch for show-panel-indicator changes to show/hide in real-time
        this._showIndicatorSignal = this._settings.connect('changed::show-panel-indicator', () => {
            const show = this._settings.get_boolean('show-panel-indicator');
            logger.debug(`Panel indicator visibility changed to: ${show}`);
            if (this._panelIndicator) {
                this._panelIndicator.visible = show;
            }
        });

        // Set conflict status in panel
        this._panelIndicator.setConflictStatus(this._conflictDetector.hasConflicts());

        // Watch for conflict count changes from prefs (prefs runs in separate process)
        this._conflictCountSignal = this._settings.connect('changed::keybinding-conflict-count', () => {
            logger.debug('Conflict count changed by prefs, re-detecting...');
            this._conflictDetector.detectConflicts();
            this._panelIndicator.setConflictStatus(this._conflictDetector.hasConflicts());
        });
        logger.debug('PanelIndicator initialized');

        // Watch for preview trigger from prefs (shows sample center notification)
        this._previewSignal = this._settings.connect('changed::center-notification-preview', () => {
            if (this._settings.get_boolean('center-notification-preview')) {
                logger.debug('Preview triggered from preferences');
                // Show preview with current settings
                const duration = this._settings.get_int('notification-duration');
                this._zoneOverlay.showMessage('Preview Notification', duration);
                // Reset the flag
                this._settings.set_boolean('center-notification-preview', false);
            }
        });
        logger.debug('Preview signal handler initialized');

        // Initialize KeybindingManager (with notification service)
        this._keybindingManager = new KeybindingManager(
            this._settings,
            this._layoutManager,
            this._windowManager,
            this._notificationManager,
            this._layoutSwitcher,
            this._zoneOverlay,
            this._notificationService,
        );

        // Register all keybindings
        this._keybindingManager.registerKeybindings();
        logger.debug('KeybindingManager initialized');

        // Setup workspace switching handler (if workspace mode enabled)
        this._setupWorkspaceHandler();

        // Show startup notification (uses notification settings)
        // Include conflict warning as 2nd line if conflicts detected
        const hasConflicts = this._conflictDetector.hasConflicts();
        const conflictCount = conflicts.length;
        let startupMessage = 'Zoned Enabled';
        if (hasConflicts) {
            startupMessage += `\n⚠️ ${conflictCount} keybinding conflict${conflictCount !== 1 ? 's' : ''}`;
        }
        this._notificationService.notify(
            NotifyCategory.STARTUP,
            startupMessage,
        );

        logger.info('Extension enabled successfully');
    }

    /**
     * Disable the extension - called when extension is unloaded
     */
    disable() {
        logger.info('Disabling extension...');

        // Disconnect signal handlers first
        this._disconnectSignals();

        // Destroy components in reverse initialization order
        this._destroyComponents();

        // Clean up debug interface
        if (this._debugInterface) {
            this._debugInterface.destroy();
            this._debugInterface = null;
            logger.debug('Debug interface destroyed');
        }

        // Clean up resource tracking
        destroyResourceTracking();
        logger.debug('Resource tracking destroyed');

        // Clean up debug settings listener
        destroyDebugSettings();

        // Clear settings reference
        this._settings = null;

        logger.info('Extension disabled successfully');
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

        if (this._previewSignal && this._settings) {
            this._settings.disconnect(this._previewSignal);
            this._previewSignal = null;
            logger.debug('Preview signal disconnected');
        }

        if (this._showIndicatorSignal && this._settings) {
            this._settings.disconnect(this._showIndicatorSignal);
            this._showIndicatorSignal = null;
            logger.debug('Show indicator signal disconnected');
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
            ['_templateManager', 'TemplateManager'],
            ['_notificationService', 'NotificationService'],
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
                        // Show notification with workspace number (uses notification settings)
                        this._notificationService.notify(
                            NotifyCategory.WORKSPACE_CHANGES,
                            `Workspace ${toIndex + 1}: ${layout.name}`,
                        );
                    } else {
                        // Layout not found - use fallback
                        const fallbackId = 'halves';
                        this._layoutManager.setLayout(fallbackId);
                        logger.warn(`Layout '${layoutId}' not found, using fallback`);
                        this._notificationService.notify(
                            NotifyCategory.WORKSPACE_CHANGES,
                            `Workspace ${toIndex + 1}: Halves (fallback)`,
                        );
                    }
                } catch (e) {
                    logger.error(`Error switching layout for workspace ${toIndex}: ${e}`);
                }
            },
        );

        logger.debug('Workspace switching handler setup (using SpatialStateManager)');
    }
}
