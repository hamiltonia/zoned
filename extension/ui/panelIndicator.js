/**
 * PanelIndicator - Top bar menu for Zoned
 *
 * Displays an icon in the GNOME Shell top bar with a dropdown menu:
 * - Current layout indicator
 * - Layout switcher
 * - Settings option
 * - Conflict warning (if applicable)
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {createLogger} from '../utils/debug.js';
import {NotifyCategory} from '../utils/notificationService.js';

const logger = createLogger('PanelIndicator');

export const PanelIndicator = GObject.registerClass(
    class ZonedPanelIndicator extends PanelMenu.Button {
        _init(layoutManager, conflictDetector, layoutEditor, notificationManager, zoneOverlay, settings, notificationService) {
            super._init(0.0, 'Zoned Indicator', false);

            this._layoutManager = layoutManager;
            this._conflictDetector = conflictDetector;
            this._layoutSwitcher = layoutEditor;
            this._notificationManager = notificationManager;
            this._zoneOverlay = zoneOverlay;
            this._settings = settings;
            this._notificationService = notificationService;
            this._hasConflicts = false;

            // Create icon with reduced padding - using custom SVG
            this._extensionPath = import.meta.url.replace('file://', '').replace('/ui/panelIndicator.js', '');
            const iconPath = `${this._extensionPath}/icons/zoned-symbolic.svg`;
            this._icon = new St.Icon({
                gicon: Gio.icon_new_for_string(iconPath),
                style_class: 'system-status-icon',
                icon_size: 16,
            });
            this.add_child(this._icon);

            // Reduce padding on the button itself
            this.style = 'padding: 0 4px;';

            // Build menu
            this._buildMenu();

            // Re-detect conflicts every time the menu opens
            this.menu.connect('open-state-changed', (menu, isOpen) => {
                if (isOpen) {
                    this._conflictDetector.detectConflicts();
                    this.setConflictStatus(this._conflictDetector.hasConflicts());
                }
            });
        }

        /**
     * Build the popup menu
     * @private
     */
        _buildMenu() {
        // Current layout section
            const currentLayout = this._layoutManager.getCurrentLayout();
            if (currentLayout) {
                const currentItem = new PopupMenu.PopupMenuItem(
                    `Current: ${currentLayout.name}`,
                    {reactive: false},
                );
                currentItem.label.style = 'font-weight: bold;';
                this.menu.addMenuItem(currentItem);

                this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            }

            // Quick switch submenu
            const layoutsSubmenu = new PopupMenu.PopupSubMenuMenuItem('Choose Layout');
            const layouts = this._layoutManager.getAllLayouts() ;

            layouts.forEach(layout => {
                const isCurrent = currentLayout && layout.id === currentLayout.id;
                const label = isCurrent ? `● ${layout.name}` : layout.name;

                const layoutItem = new PopupMenu.PopupMenuItem(label);
                layoutItem.connect('activate', () => {
                    this._onLayoutSelected(layout.id);
                });

                layoutsSubmenu.menu.addMenuItem(layoutItem);
            });

            this.menu.addMenuItem(layoutsSubmenu);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            // Full layout editor (LayoutSwitcher)
            const layoutsItem = new PopupMenu.PopupMenuItem('Layout Editor');
            layoutsItem.connect('activate', () => {
                this._openLayoutSwitcher();
            });
            this.menu.addMenuItem(layoutsItem);

            // Settings (Extensions app preferences)
            const settingsItem = new PopupMenu.PopupMenuItem('Settings');
            settingsItem.connect('activate', () => {
                this._openSettings();
            });
            this.menu.addMenuItem(settingsItem);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

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
                this.menu.addMenuItem(this._conflictWarningItem);

                // Add "Fix Conflicts" button
                const fixItem = new PopupMenu.PopupMenuItem('Fix Conflicts Automatically');
                fixItem.connect('activate', () => {
                    this._autoFixConflicts();
                });
                this.menu.addMenuItem(fixItem);

                this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            }

        }

        /**
     * Update the menu (rebuild it)
     */
        updateMenu() {
            this.menu.removeAll();
            this._buildMenu();
        }

        /**
     * Set conflict status and update menu
     * @param {boolean} hasConflicts - Whether conflicts exist
     */
        setConflictStatus(hasConflicts) {
            if (this._hasConflicts !== hasConflicts) {
                this._hasConflicts = hasConflicts;

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

        /**
     * Open the layout editor (comprehensive layout management)
     * @private
     */
        _openLayoutSwitcher() {
            logger.debug('Opening layout editor...');

            // Close menu first to release keyboard grab
            this.menu.close();

            if (this._layoutSwitcher) {
                this._layoutSwitcher.show();
            } else {
                logger.error('LayoutSwitcher not available');
                this._notificationManager.show('Layout editor not available', 2000);
            }
        }

        /**
     * Open settings (GNOME Extensions preferences)
     * @private
     */
        _openSettings() {
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
        _onLayoutSelected(layoutId) {
        // Use shared helper that handles both layout switching and notification (center-screen for user action)
            this._layoutManager.setLayoutWithNotification(layoutId, this._zoneOverlay);
            this.updateMenu();
        }

        /**
     * Auto-fix keybinding conflicts
     * @private
     */
        _autoFixConflicts() {
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
        _showConflictDetails() {
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
        destroy() {
            super.destroy();
        }
    });
