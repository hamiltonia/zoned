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
import * as LayoutSettingsDialogModule from './ui/layoutSettingsDialog.js';
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

        // Bound signal handlers (for proper cleanup)
        this._boundOnShowIndicatorChanged = null;
        this._boundOnConflictCountChanged = null;
        this._boundOnPreviewChanged = null;
        this._boundOnWorkspaceSwitched = null;

        // Recursion guard for preview signal handler
        this._handlingPreview = false;

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

        // Initialize global memory debug registry
        global.zonedDebug = {
            instances: new Map(),
            signals: new Map(),  // Track active signal connections: componentName → [{id, signal, source, stack}]

            trackInstance(className, increment = true) {
                if (!this.instances.has(className)) {
                    this.instances.set(className, 0);
                }
                const current = this.instances.get(className);
                const newCount = current + (increment ? 1 : -1);
                this.instances.set(className, newCount);

                logger.memdebug(`${className} instance count: ${newCount} (${increment ? '+' : '-'}1)`);
            },

            /**
             * Track a signal connection for leak detection
             * @param {string} componentName - Component that owns the connection
             * @param {number} signalId - Signal ID from connect()
             * @param {string} signalName - Name of the signal
             * @param {string} source - Source object type
             */
            trackSignal(componentName, signalId, signalName, source) {
                if (!this.signals.has(componentName)) {
                    this.signals.set(componentName, []);
                }
                this.signals.get(componentName).push({
                    id: signalId,
                    signal: signalName,
                    source: source,
                    stack: new Error().stack.split('\n')[3], // Capture creation location
                });
                logger.memdebug(`[${componentName}] Tracked signal ${signalName} (ID: ${signalId})`);
            },

            /**
             * Untrack a signal when it's disconnected
             * @param {string} componentName - Component that owns the connection
             * @param {number} signalId - Signal ID to remove
             */
            untrackSignal(componentName, signalId) {
                if (!this.signals.has(componentName)) {
                    return;
                }

                const signals = this.signals.get(componentName);
                const index = signals.findIndex(s => s.id === signalId);
                if (index !== -1) {
                    const removed = signals.splice(index, 1)[0];
                    logger.memdebug(`[${componentName}] Untracked signal ${removed.signal} (ID: ${signalId})`);
                }
            },

            /**
             * Verify all signals have been disconnected (for testing/debugging)
             * @returns {string} Report of leaked signals or success message
             */
            verifySignalsDisconnected() {
                let totalLeaked = 0;
                const report = [];

                for (const [componentName, signals] of this.signals) {
                    if (signals.length > 0) {
                        report.push(`⚠️  ${componentName}: ${signals.length} signal(s) NOT disconnected`);
                        for (const {id, signal, stack} of signals) {
                            report.push(`   - Signal ID ${id} (${signal})`);
                            report.push(`     Created at: ${stack}`);
                        }
                        totalLeaked += signals.length;
                    }
                }

                if (totalLeaked === 0) {
                    return '✅ All signals properly disconnected';
                } else {
                    report.unshift(`🚨 LEAKED ${totalLeaked} signal connection(s):`);
                    return report.join('\n');
                }
            },

            getReport() {
                const lines = ['=== Zoned Instance Counts ==='];
                for (const [className, count] of this.instances) {
                    lines.push(`  ${className}: ${count}`);
                }

                lines.push('\n=== Active Signal Connections ===');
                let totalSignals = 0;
                for (const [componentName, signals] of this.signals) {
                    lines.push(`  ${componentName}: ${signals.length} active`);
                    totalSignals += signals.length;
                }
                lines.push(`  TOTAL: ${totalSignals} signals`);

                lines.push('================================');
                return lines.join('\n');
            },
        };
        logger.debug('Memory debug registry initialized');

        // Initialize resource tracking (for stability testing)
        initResourceTracking(this._settings);
        logger.debug('Resource tracking initialized');

        // Store LayoutSettingsDialog module for D-Bus testing
        this._layoutSettingsDialogModule = LayoutSettingsDialogModule;

        // Initialize D-Bus debug interface
        this._debugInterface = createDebugInterface(this);
        this._debugInterface.init();
        logger.debug('Debug interface initialized');

        // ============================================================
        // TEMPORARY TEST CONFIGURATION - Build 6+
        // Testing incremental component enable to isolate memory leaks
        // Current: All tested components (ConflictDetector + ZoneOverlay + NotificationService)
        // Status: All components tested CLEAN (variance 3.5 MB)
        // Next: Will add LayoutManager (Build 7) after commit
        // ============================================================

        this._notificationManager = new NotificationManager(this);
        logger.debug('NotificationManager initialized');

        this._templateManager = new TemplateManager();
        logger.debug('TemplateManager initialized');

        this._spatialStateManager = new SpatialStateManager(this._settings);
        logger.debug('SpatialStateManager initialized');

        this._conflictDetector = new ConflictDetector(this._settings);
        logger.debug('ConflictDetector initialized');

        // Add ZoneOverlay (with fix)
        this._zoneOverlay = new ZoneOverlay(this);
        logger.debug('ZoneOverlay initialized');

        // Add NotificationService (depends on ZoneOverlay)
        this._notificationService = new NotificationService(this, this._zoneOverlay, this._notificationManager);
        logger.debug('NotificationService initialized');

        // Initialize LayoutManager and load layouts - MUST be before LayoutSwitcher and PanelIndicator
        this._layoutManager = new LayoutManager(this._settings, this.path);
        const layoutsLoaded = this._layoutManager.loadLayouts();
        if (!layoutsLoaded) {
            throw new Error('Failed to load layouts');
        }
        this._layoutManager.setSpatialStateManager(this._spatialStateManager);
        logger.debug('LayoutManager initialized');

        // Initialize WindowManager
        this._windowManager = new WindowManager();
        logger.debug('WindowManager initialized');

        // Add LayoutSwitcher (layout selection UI) - MUST be after LayoutManager
        this._layoutSwitcher = new LayoutSwitcher(this._layoutManager, this._zoneOverlay, this._settings);
        logger.debug('LayoutSwitcher initialized');

        // Add PanelIndicator (top bar menu) - MUST be after LayoutManager and LayoutSwitcher
        this._panelIndicator = new PanelIndicator(
            this._layoutManager,
            this._conflictDetector,
            this._layoutSwitcher,
            this._notificationManager,
            this._zoneOverlay,
            this._settings,
            this._notificationService,
        );
        logger.debug('PanelIndicator initialized');

        // Connect panel indicator signals
        this._boundOnShowIndicatorChanged = this._onShowIndicatorChanged.bind(this);
        this._showIndicatorSignal = this._settings.connect(
            'changed::show-panel-indicator',
            this._boundOnShowIndicatorChanged,
        );

        this._boundOnConflictCountChanged = this._onConflictCountChanged.bind(this);
        this._conflictCountSignal = this._settings.connect(
            'changed::keybinding-conflict-count',
            this._boundOnConflictCountChanged,
        );

        // Preview signal with recursion guard to prevent memory leak
        this._boundOnPreviewChanged = this._onPreviewChanged.bind(this);
        this._previewSignal = this._settings.connect(
            'changed::center-notification-preview',
            this._boundOnPreviewChanged,
        );

        // Set initial visibility
        this._panelIndicator.visible = this._settings.get_boolean('show-panel-indicator');

        // Detect keybinding conflicts and update panel indicator
        this._conflictDetector.detectConflicts();
        this._panelIndicator.setConflictStatus(this._conflictDetector.hasConflicts());

        // Show startup notification if conflicts detected
        if (this._conflictDetector.hasConflicts()) {
            const count = this._settings.get_int('keybinding-conflict-count');
            this._notificationService.notify(
                NotifyCategory.WARNINGS,
                `Warning: ${count} keybinding conflict(s) detected`,
            );
        }

        this._keybindingManager = new KeybindingManager(
            this._settings,
            this._layoutManager,
            this._windowManager,
            this._notificationManager,
            this._layoutSwitcher,
            this._zoneOverlay,
            this._notificationService,
        );
        this._keybindingManager.registerKeybindings();
        logger.debug('KeybindingManager initialized');

        // Setup workspace switching handler
        this._setupWorkspaceHandler();

        // Add panel indicator to top bar
        Main.panel.addToStatusArea('zoned-indicator', this._panelIndicator);

        // Apply per-workspace layout for initial workspace if enabled
        // This ensures the correct layout is shown on startup, not just when switching workspaces
        if (this._settings.get_boolean('use-per-workspace-layouts')) {
            const spaceKey = this._spatialStateManager.getCurrentSpaceKey();
            const state = this._spatialStateManager.getState(spaceKey);
            if (this._layoutManager.setLayout(state.layoutId)) {
                logger.info(`Applied per-workspace layout for initial workspace: ${state.layoutId}`);
            } else {
                logger.warn(`Failed to apply per-workspace layout: ${state.layoutId}`);
            }
        }

        logger.info('Extension enabled successfully');

        // Signal successful initialization via D-Bus (for automated testing)
        this._debugInterface?.emitInitCompleted(true);
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

        // Clear global memory debug registry
        if (global.zonedDebug) {
            global.zonedDebug = null;
            logger.debug('Memory debug registry cleared');
        }

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

        // Release bound function references to prevent memory leaks
        this._boundOnShowIndicatorChanged = null;
        this._boundOnConflictCountChanged = null;
        this._boundOnPreviewChanged = null;
        this._boundOnWorkspaceSwitched = null;
        logger.debug('Bound signal handlers released');
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
        this._boundOnWorkspaceSwitched = this._onWorkspaceSwitched.bind(this);
        this._workspaceSwitchedSignal = global.workspace_manager.connect(
            'workspace-switched',
            this._boundOnWorkspaceSwitched,
        );

        logger.debug('Workspace switching handler setup (using SpatialStateManager)');
    }

    /**
     * Signal handler: show-panel-indicator changed
     * @private
     */
    _onShowIndicatorChanged() {
        const show = this._settings.get_boolean('show-panel-indicator');
        logger.debug(`Panel indicator visibility changed to: ${show}`);
        if (this._panelIndicator) {
            this._panelIndicator.visible = show;
        }
    }

    /**
     * Signal handler: keybinding-conflict-count changed
     * @private
     */
    _onConflictCountChanged() {
        logger.debug('Conflict count changed by prefs, re-detecting...');
        this._conflictDetector.detectConflicts();
        this._panelIndicator.setConflictStatus(this._conflictDetector.hasConflicts());
    }

    /**
     * Signal handler: center-notification-preview changed
     * Uses recursion guard to prevent memory leak from signal loop
     * @private
     */
    _onPreviewChanged() {
        // Prevent recursive call when we reset the flag
        if (this._handlingPreview) return;

        if (this._settings.get_boolean('center-notification-preview')) {
            this._handlingPreview = true;
            logger.debug('Preview triggered from preferences');
            // Show preview with current settings
            const duration = this._settings.get_int('notification-duration');
            this._zoneOverlay.showMessage('Preview Notification', duration);
            // Reset the flag (won't recurse due to guard)
            this._settings.set_boolean('center-notification-preview', false);
            this._handlingPreview = false;
        }
    }

    /**
     * Signal handler: workspace-switched
     * @private
     */
    _onWorkspaceSwitched(manager, from, to, _direction) {
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
    }
}
