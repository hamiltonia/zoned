/**
 * PanelIndicator - Top bar menu for Zoned
 *
 * Displays an icon in the GNOME Shell top bar with a dropdown menu:
 * - Current layout indicator
 * - Layout switcher
 * - Settings option
 * - Conflict warning (if applicable)
 */

import GObject from '@girs/gobject-2.0';
import St from '@girs/st-14';
import Gio from '@girs/gio-2.0';
import GLib from '@girs/glib-2.0';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {createLogger} from '../utils/debug';
import {SignalTracker} from '../utils/signalTracker';
import {NotifyCategory} from '../utils/notificationService';
import type {LayoutManager} from '../layoutManager';
import type {ConflictDetector} from './conflictDetector';
import type {NotificationManager} from './notificationManager';
import type {ZoneOverlay} from './zoneOverlay';
import type {NotificationService} from '../utils/notificationService';

const logger = createLogger('PanelIndicator');

export const PanelIndicator = GObject.registerClass(
    class ZonedPanelIndicator extends PanelMenu.Button {
        private _layoutManager: LayoutManager;
        private _conflictDetector: ConflictDetector;
        private _layoutSwitcher: any;
        private _notificationManager: NotificationManager;
        private _zoneOverlay: ZoneOverlay;
        private _settings: Gio.Settings;
        private _notificationService: NotificationService;
        private _hasConflicts: boolean;
        private _signalTracker: SignalTracker | null;
        private _boundOnMenuOpenStateChanged: ((menu: any, isOpen: boolean) => void) | null;
        private _extensionPath: string;
        private _icon!: St.Icon;
        private _conflictWarningItem?: any;

        _init(
            layoutManager: LayoutManager,
            conflictDetector: ConflictDetector,
            layoutEditor: any,
            notificationManager: NotificationManager,
            zoneOverlay: ZoneOverlay,
            settings: Gio.Settings,
            notificationService: NotificationService,
            extensionPath: string
        ): void {
            super._init(0.0, 'Zoned Indicator', false);

            this._layoutManager = layoutManager;
            this._conflictDetector = conflictDetector;
            this._layoutSwitcher = layoutEditor;
            this._notificationManager = notificationManager;
            this._zoneOverlay = zoneOverlay;
            this._settings = settings;
            this._notificationService = notificationService;
            this._hasConflicts = false;

            // Signal tracking
            this._signalTracker = new SignalTracker('PanelIndicator');

            // Bound methods for signal handlers
            this._boundOnMenuOpenStateChanged = this._onMenuOpenStateChanged.bind(this);

            // Store extension path for icon loading
            this._extensionPath = extensionPath;
            const iconPath = `${this._extensionPath}/icons/zoned-symbolic.svg`;
            this._icon = new St.Icon({
                gicon: Gio.icon_new_for_string(iconPath),
                style_class: 'system-status-icon',
                icon_size: 16,
            });
            (this as any).add_child(this._icon);

            // Reduce padding on the button itself
            (this as any).style = 'padding: 0 4px;';

            // Build menu
            this._buildMenu();

            // Re-detect conflicts every time the menu opens
            this._signalTracker.connect((this as any).menu, 'open-state-changed', this._boundOnMenuOpenStateChanged);
        }

        /**
         * Handle menu open state changed
         * @param menu - The menu
         * @param isOpen - Whether menu is open
         * @private
         */
        private _onMenuOpenStateChanged(menu: any, isOpen: boolean): void {
            if (isOpen) {
                this._conflictDetector.detectConflicts();
                this.setConflictStatus(this._conflictDetector.hasConflicts());
            }
        }

        /**
         * Build the popup menu
         * @private
         */
        private _buildMenu(): void {
            // Current layout section
            const currentLayout = this._layoutManager.getCurrentLayout();
            if (currentLayout) {
                const currentItem = new PopupMenu.PopupMenuItem(
                    `Current: ${currentLayout.name}`,
                    {reactive: false},
                );
                currentItem.label.style = 'font-weight: bold;';
                (this as any).menu.addMenuItem(currentItem);

                (this as any).menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            }

            // Quick switch submenu
            const layoutsSubmenu = new PopupMenu.PopupSubMenuMenuItem('Choose Layout');
            const layouts = this._layoutManager.getAllLayouts();

            layouts.forEach(layout => {
                const isCurrent = currentLayout && layout.id === currentLayout.id;
                const label = isCurrent ? `● ${layout.name}` : layout.name;

                const layoutItem = new PopupMenu.PopupMenuItem(label);
                layoutItem.connect('activate', () => {
                    this._onLayoutSelected(layout.id);
                });

                layoutsSubmenu.menu.addMenuItem(layoutItem);
            });

            (this as any).menu.addMenuItem(layoutsSubmenu);

            (this as any).menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            // Full layout switcher (LayoutSwitcher)
            const layoutsItem = new PopupMenu.PopupMenuItem('Layout Switcher');
            layoutsItem.connect('activate', () => {
                this._openLayoutSwitcher();
            });
            (this as any).menu.addMenuItem(layoutsItem);

            // Settings (Extensions app preferences)
            const settingsItem = new PopupMenu.PopupMenuItem('Settings');
            settingsItem.connect('activate', () => {
                this._openSettings();
            });
            (this as any).menu.addMenuItem(settingsItem);

            (this as any).menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            // Conflict warning and fix option (if applicable)
            if (this._hasConflicts) {
                this._conflictWarningItem = new PopupMenu.PopupMenuItem(
                    '⚠️ Keybinding conflicts detected',
                    {reactive: true},
                );
                this._conflictWarningItem.label.style = 'color: #f57900;';
                this._conflictWarningItem.connect('activate', () => {
                    this._showConflictDetails();
                });
                (this as any).menu.addMenuItem(this._conflictWarningItem);

                // Add "Fix Conflicts" button
                const fixItem = new PopupMenu.PopupMenuItem('Fix Conflicts Automatically');
                fixItem.connect('activate', () => {
                    this._autoFixConflicts();
                });
                (this as any).menu.addMenuItem(fixItem);

                (this as any).menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            }
        }

        /**
         * Update the menu (rebuild it)
         */
        updateMenu(): void {
            (this as any).menu.removeAll();
            this._buildMenu();
        }

        /**
         * Set conflict status and update menu
         * @param hasConflicts - Whether conflicts exist
         */
        setConflictStatus(hasConflicts: boolean): void {
            if (this._hasConflicts !== hasConflicts) {
                this._hasConflicts = hasConflicts;

                // Only update UI if component is fully initialized
                if (this._icon) {
                    // Swap icon file when conflicts exist
                    if (hasConflicts) {
                        const warningIconPath = `${this._extensionPath}/icons/zoned-warning.svg`;
                        this._icon.gicon = Gio.icon_new_for_string(warningIconPath);
                        logger.debug('Switching to warning icon (conflicts detected)');
                    } else {
                        const normalIconPath = `${this._extensionPath}/icons/zoned-symbolic.svg`;
                        this._icon.gicon = Gio.icon_new_for_string(normalIconPath);
                        logger.debug('Switching to normal icon (no conflicts)');
                    }

                    this.updateMenu();
                }
            }
        }

        /**
         * Open the layout switcher (comprehensive layout management)
         * @private
         */
        private _openLayoutSwitcher(): void {
            logger.debug('Opening layout switcher...');

            // Close menu first to release keyboard grab
            (this as any).menu.close();

            if (this._layoutSwitcher) {
                this._layoutSwitcher.show();
            } else {
                logger.error('LayoutSwitcher not available');
                this._notificationManager.show('Layout switcher not available', 2000);
            }
        }

        /**
         * Open settings (GNOME Extensions preferences)
         * @private
         */
        private _openSettings(): void {
            logger.debug('Opening settings...');

            try {
                // Open GNOME Extensions preferences for this extension
                const extensionId = 'zoned@hamiltonia.me';
                const command = `gnome-extensions prefs ${extensionId}`;

                // Execute command
                GLib.spawn_command_line_async(command);

                logger.info('Opened extension preferences');
            } catch (error) {
                logger.error(`Error opening settings: ${error}`);
                this._notificationManager.show('Error opening settings', 2000);
            }
        }

        /**
         * Handle layout selection from menu
         * @private
         */
        private _onLayoutSelected(layoutId: string): void {
            // Use shared helper that handles both layout switching and notification (center-screen for user action)
            (this._layoutManager as any).setLayoutWithNotification(layoutId, this._zoneOverlay);
            this.updateMenu();
        }

        /**
         * Auto-fix keybinding conflicts
         * @private
         */
        private _autoFixConflicts(): void {
            logger.debug('Auto-fixing keybinding conflicts...');

            const results = this._conflictDetector.autoFixConflicts();

            if (results.fixed.length > 0) {
                // Show success notification (uses user's notify-conflicts setting)
                if (this._notificationService) {
                    this._notificationService.notify(
                        NotifyCategory.CONFLICTS,
                        `✓ Fixed ${results.fixed.length} conflict${results.fixed.length !== 1 ? 's' : ''}`,
                    );
                }

                // Re-detect conflicts and update UI
                this._conflictDetector.detectConflicts();
                this.setConflictStatus(this._conflictDetector.hasConflicts());

                // Request prefs window to close (simpler than trying to sync state)
                if (this._settings) {
                    this._settings.set_boolean('prefs-close-requested', true);
                    logger.debug('Requested prefs window to close');
                }

                logger.info(`Fixed ${results.fixed.length} conflicts`);
            }

            if (results.failed.length > 0) {
                // Show error notification (uses user's notify-conflicts setting)
                if (this._notificationService) {
                    this._notificationService.notify(
                        NotifyCategory.CONFLICTS,
                        `Failed to fix ${results.failed.length} conflict${results.failed.length !== 1 ? 's' : ''}`,
                        {duration: 3000},
                    );
                }
                logger.error(`Failed to fix conflicts: ${JSON.stringify(results.failed)}`);
            }
        }

        /**
         * Show conflict details - opens settings scrolled to keyboard shortcuts
         * @private
         */
        private _showConflictDetails(): void {
            const conflicts = this._conflictDetector.getConflicts();

            if (conflicts.length === 0) {
                if (this._notificationService) {
                    this._notificationService.notify(
                        NotifyCategory.CONFLICTS,
                        'No keybinding conflicts detected',
                    );
                }
                return;
            }

            // Log conflicts for debugging
            logger.info(`${conflicts.length} keybinding conflict(s) detected:`);
            conflicts.forEach((conflict, index) => {
                logger.info(`  ${index + 1}. ${conflict.zonedBinding} - ${conflict.gnomeDescription}`);
            });

            // Set scroll target so prefs opens at the keyboard shortcuts section
            if (this._settings) {
                // Determine which section to scroll to based on first conflict
                const firstConflict = conflicts[0];
                const isEnhancedConflict = firstConflict.zonedAction === 'minimize-window' ||
                                       firstConflict.zonedAction === 'maximize-window';
                const scrollTarget = isEnhancedConflict ? 'enhanced-shortcuts' : 'keyboard-shortcuts';

                this._settings.set_string('prefs-scroll-target', scrollTarget);
                logger.debug(`Set prefs-scroll-target to: ${scrollTarget}`);
            }

            // Open settings
            this._openSettings();
        }

        /**
         * Clean up
         */
        destroy(): void {
            // Disconnect all tracked signals
            if (this._signalTracker) {
                this._signalTracker.disconnectAll();
                this._signalTracker = null;
            }

            // Release bound function references
            this._boundOnMenuOpenStateChanged = null;

            super.destroy();
        }
    });
