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
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const PanelIndicator = GObject.registerClass(
class ZonedPanelIndicator extends PanelMenu.Button {
    _init(profileManager, conflictDetector, profilePicker, notificationManager) {
        super._init(0.0, 'Zoned Indicator', false);

        this._profileManager = profileManager;
        this._conflictDetector = conflictDetector;
        this._profilePicker = profilePicker;
        this._notificationManager = notificationManager;
        this._hasConflicts = false;

        // Create icon with reduced padding
        this._icon = new St.Icon({
            icon_name: 'view-grid-symbolic',
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
            
            // Update icon color if conflicts exist
            if (hasConflicts) {
                this._icon.style = 'color: #f57900;'; // Orange warning color
            } else {
                this._icon.style = '';
            }
            
            this.updateMenu();
        }
    }

    /**
     * Handle profile selection from menu
     * @private
     */
    _onProfileSelected(profileId) {
        // Use shared helper that handles both profile switching and notification
        this._profileManager.setProfileWithNotification(profileId, this._notificationManager);
        this.updateMenu();
    }

    /**
     * Auto-fix keybinding conflicts
     * @private
     */
    _autoFixConflicts() {
        console.log('[Zoned] Auto-fixing keybinding conflicts...');
        
        const results = this._conflictDetector.autoFixConflicts();
        
        if (results.fixed.length > 0) {
            let message = `Fixed ${results.fixed.length} conflict${results.fixed.length !== 1 ? 's' : ''}:\n\n`;
            results.fixed.forEach(item => {
                message += `✓ Disabled: ${item.action}\n`;
            });
            
            Main.notify('Zoned - Conflicts Fixed', message);
            
            // Re-detect conflicts and update UI
            this._conflictDetector.detectConflicts();
            this.setConflictStatus(this._conflictDetector.hasConflicts());
            
            console.log(`[Zoned] Fixed ${results.fixed.length} conflicts`);
        }
        
        if (results.failed.length > 0) {
            let message = `Failed to fix ${results.failed.length} conflict${results.failed.length !== 1 ? 's' : ''}:\n\n`;
            results.failed.forEach(item => {
                message += `✗ ${item.action}: ${item.error}\n`;
            });
            
            Main.notifyError('Zoned - Error', message);
        }
    }

    /**
     * Show conflict details
     * @private
     */
    _showConflictDetails() {
        const conflicts = this._conflictDetector.getConflicts();
        
        if (conflicts.length === 0) {
            Main.notify('Zoned', 'No conflicts detected.');
            return;
        }

        let message = `${conflicts.length} keybinding conflict${conflicts.length !== 1 ? 's' : ''} detected:\n\n`;
        
        conflicts.forEach((conflict, index) => {
            message += `${index + 1}. ${conflict.zonedBinding}\n`;
            message += `   ${conflict.gnomeDescription}\n`;
        });
        
        message += '\n\nClick "Fix Conflicts Automatically" to resolve.';
        
        Main.notify('Zoned - Keybinding Conflicts', message);
    }

    /**
     * Show about dialog
     * @private
     */
    _showAbout() {
        const message = 'Zoned - Advanced Window Zone Management\n\n' +
                       'Version: 1.0\n' +
                       'Keyboard Shortcuts:\n' +
                       '  Super+Left/Right - Cycle zones\n' +
                       '  Super+` - Profile picker\n' +
                       '  Super+Up - Maximize/Restore\n' +
                       '  Super+Down - Minimize\n\n' +
                       'https://github.com/hamiltonia/zoned';
        
        Main.notify('Zoned', message);
    }

    /**
     * Clean up
     */
    destroy() {
        super.destroy();
    }
});
