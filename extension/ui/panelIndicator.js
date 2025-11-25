/**
 * PanelIndicator - Top bar menu for Zoned
 * 
 * Displays an icon in the GNOME Shell top bar with a dropdown menu:
 * - Current profile indicator
 * - Profile switcher
 * - Settings option
 * - Conflict warning (if applicable)
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { createLogger } from '../utils/debug.js';

const logger = createLogger('PanelIndicator');

export const PanelIndicator = GObject.registerClass(
class ZonedPanelIndicator extends PanelMenu.Button {
    _init(profileManager, conflictDetector, profilePicker, notificationManager, zoneOverlay, layoutPicker) {
        super._init(0.0, 'Zoned Indicator', false);

        this._profileManager = profileManager;
        this._conflictDetector = conflictDetector;
        this._profilePicker = profilePicker;
        this._notificationManager = notificationManager;
        this._zoneOverlay = zoneOverlay;
        this._layoutPicker = layoutPicker;
        this._hasConflicts = false;

        // Create icon with reduced padding - using custom SVG
        this._extensionPath = import.meta.url.replace('file://', '').replace('/ui/panelIndicator.js', '');
        const iconPath = `${this._extensionPath}/icons/zoned-symbolic.svg`;
        this._icon = new St.Icon({
            gicon: Gio.icon_new_for_string(iconPath),
            style_class: 'system-status-icon',
            icon_size: 16
        });
        this.add_child(this._icon);
        
        // Reduce padding on the button itself
        this.style = 'padding: 0 4px;';

        // Build menu
        this._buildMenu();
    }

    /**
     * Build the popup menu
     * @private
     */
    _buildMenu() {
        // Current profile section
        const currentProfile = this._profileManager.getCurrentProfile();
        if (currentProfile) {
            const currentItem = new PopupMenu.PopupMenuItem(
                `Current: ${currentProfile.name}`,
                {reactive: false}
            );
            currentItem.label.style = 'font-weight: bold;';
            this.menu.addMenuItem(currentItem);
            
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        // Profile submenu
        const profilesSubmenu = new PopupMenu.PopupSubMenuMenuItem('Profiles');
        const profiles = this._profileManager.getAllProfiles();
        
        profiles.forEach(profile => {
            const isCurrent = currentProfile && profile.id === currentProfile.id;
            const label = isCurrent ? `● ${profile.name}` : profile.name;
            
            const profileItem = new PopupMenu.PopupMenuItem(label);
            profileItem.connect('activate', () => {
                this._onProfileSelected(profile.id);
            });
            
            profilesSubmenu.menu.addMenuItem(profileItem);
        });
        
        this.menu.addMenuItem(profilesSubmenu);
        
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Layout picker menu item
        const layoutPickerItem = new PopupMenu.PopupMenuItem('Choose Layout...');
        layoutPickerItem.connect('activate', () => {
            this._openLayoutPicker();
        });
        this.menu.addMenuItem(layoutPickerItem);
        
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Conflict warning and fix option (if applicable)
        if (this._hasConflicts) {
            this._conflictWarningItem = new PopupMenu.PopupMenuItem(
                '⚠️ Keybinding conflicts detected',
                {reactive: true}
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

        // About item
        const aboutItem = new PopupMenu.PopupMenuItem('About Zoned');
        aboutItem.connect('activate', () => {
            this._showAbout();
        });
        this.menu.addMenuItem(aboutItem);
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
     * Open the layout picker dialog
     * @private
     */
    _openLayoutPicker() {
        logger.debug('Opening LayoutPicker...');
        
        if (this._layoutPicker) {
            this._layoutPicker.open();
        } else {
            logger.error('LayoutPicker not available');
            this._notificationManager.show('Layout picker not available', 2000);
        }
    }

    /**
     * Handle profile selection from menu
     * @private
     */
    _onProfileSelected(profileId) {
        // Use shared helper that handles both profile switching and notification (center-screen for user action)
        this._profileManager.setProfileWithNotification(profileId, this._zoneOverlay);
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
            // Show success notification at top (system message)
            this._notificationManager.show(
                `✓ Fixed ${results.fixed.length} conflict${results.fixed.length !== 1 ? 's' : ''}`,
                2000
            );
            
            // Re-detect conflicts and update UI
            this._conflictDetector.detectConflicts();
            this.setConflictStatus(this._conflictDetector.hasConflicts());
            
            logger.info(`Fixed ${results.fixed.length} conflicts`);
        }
        
        if (results.failed.length > 0) {
            // Show error notification (MessageDialog removed)
            this._notificationManager.show(
                `Failed to fix ${results.failed.length} conflict${results.failed.length !== 1 ? 's' : ''}`,
                3000
            );
            logger.error(`Failed to fix conflicts: ${JSON.stringify(results.failed)}`);
        }
    }

    /**
     * Show conflict details
     * @private
     */
    _showConflictDetails() {
        const conflicts = this._conflictDetector.getConflicts();
        
        if (conflicts.length === 0) {
            this._notificationManager.show('No keybinding conflicts detected', 2000);
            return;
        }

        // Log conflicts (dialog removed - will add proper UI in future sprint)
        logger.info(`${conflicts.length} keybinding conflict(s) detected:`);
        conflicts.forEach((conflict, index) => {
            logger.info(`  ${index + 1}. ${conflict.zonedBinding} - ${conflict.gnomeDescription}`);
        });
        
        this._notificationManager.show(
            `${conflicts.length} conflict${conflicts.length !== 1 ? 's' : ''} detected. Use "Fix Conflicts" to resolve.`,
            3000
        );
    }

    /**
     * Show about dialog
     * @private
     */
    _showAbout() {
        // Simple notification (dialog removed - will add proper about UI in future sprint)
        this._notificationManager.show('Zoned v1.0 - github.com/hamiltonia/zoned', 3000);
        logger.info('About: Zoned v1.0 - Advanced Window Zone Management');
    }

    /**
     * Clean up
     */
    destroy() {
        super.destroy();
    }
});
