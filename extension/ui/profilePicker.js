/**
 * ProfilePicker - Visual profile selection dialog
 * 
 * Displays a centered dialog showing all available profiles with:
 * - ASCII visualizations of zones
 * - Current profile indicator
 * - Keyboard navigation (arrows, Enter, Esc)
 * - Mouse selection
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class ProfilePicker {
    /**
     * @param {ProfileManager} profileManager - Profile manager instance
     * @param {NotificationManager} notificationManager - Notification manager instance
     */
    constructor(profileManager, notificationManager) {
        this._profileManager = profileManager;
        this._notificationManager = notificationManager;
        this._dialog = null;
        this._selectedIndex = 0;
        this._profileButtons = [];
    }

    /**
     * Show the profile picker dialog
     */
    show() {
        if (this._dialog) {
            // Already showing, just ensure it's visible
            return;
        }

        const profiles = this._profileManager.getAllProfiles();
        if (!profiles || profiles.length === 0) {
            console.warn('[ZoneFancy] No profiles available to display');
            return;
        }

        // Find current profile index
        const currentProfile = this._profileManager.getCurrentProfile();
        this._selectedIndex = profiles.findIndex(p => p.id === currentProfile.id);
        if (this._selectedIndex < 0) {
            this._selectedIndex = 0;
        }

        this._createDialog(profiles);
        this._connectKeyEvents();

        console.log('[ZoneFancy] Profile picker shown');
    }

    /**
     * Hide the profile picker dialog
     */
    hide() {
        if (this._dialog) {
            this._disconnectKeyEvents();
            Main.uiGroup.remove_child(this._dialog);
            this._dialog.destroy();
            this._dialog = null;
            this._profileButtons = [];
            console.log('[ZoneFancy] Profile picker hidden');
        }
    }

    /**
     * Create the dialog UI
     * @private
     */
    _createDialog(profiles) {
        // Background overlay
        this._dialog = new St.BoxLayout({
            style_class: 'modal-dialog',
            vertical: true,
            reactive: true,
            style: 'background-color: rgba(0, 0, 0, 0.8); padding: 40px;'
        });

        // Container for profile list
        const container = new St.BoxLayout({
            vertical: true,
            style: 'background-color: rgba(40, 40, 40, 0.95); ' +
                   'border-radius: 12px; ' +
                   'padding: 30px; ' +
                   'spacing: 15px;'
        });

        // Title
        const title = new St.Label({
            text: 'Select Profile',
            style: 'font-size: 24px; ' +
                   'font-weight: bold; ' +
                   'color: #ffffff; ' +
                   'margin-bottom: 20px;'
        });
        container.add_child(title);

        // ScrollView for profiles
        const scrollView = new St.ScrollView({
            style: 'max-height: 600px;',
            overlay_scrollbars: true
        });

        const profileList = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 10px;'
        });

        // Create profile items
        profiles.forEach((profile, index) => {
            const profileItem = this._createProfileItem(profile, index);
            profileList.add_child(profileItem);
            this._profileButtons.push(profileItem);
        });

        scrollView.add_child(profileList);
        container.add_child(scrollView);

        // Instructions
        const instructions = new St.Label({
            text: '↑↓: Navigate  Enter: Select  Esc: Cancel',
            style: 'font-size: 14px; ' +
                   'color: #aaaaaa; ' +
                   'margin-top: 20px;'
        });
        container.add_child(instructions);

        this._dialog.add_child(container);

        // Center the dialog
        Main.uiGroup.add_child(this._dialog);
        this._dialog.set_position(
            Math.floor((global.screen_width - this._dialog.width) / 2),
            Math.floor((global.screen_height - this._dialog.height) / 2)
        );

        // Update selection highlight
        this._updateSelection();
    }

    /**
     * Create a single profile list item
     * @private
     */
    _createProfileItem(profile, index) {
        const button = new St.Button({
            reactive: true,
            can_focus: true,
            track_hover: true,
            style: 'padding: 15px; ' +
                   'border-radius: 8px; ' +
                   'background-color: rgba(60, 60, 60, 0.5);'
        });

        const content = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 20px;'
        });

        // Current profile indicator
        const currentProfile = this._profileManager.getCurrentProfile();
        const indicator = new St.Label({
            text: profile.id === currentProfile.id ? '●' : ' ',
            style: 'font-size: 20px; ' +
                   'color: #4a90d9; ' +
                   'width: 20px;'
        });
        content.add_child(indicator);

        // Profile info
        const infoBox = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 8px;'
        });

        const nameLabel = new St.Label({
            text: profile.name,
            style: 'font-size: 18px; ' +
                   'font-weight: bold; ' +
                   'color: #ffffff;'
        });
        infoBox.add_child(nameLabel);

        // ASCII visualization
        const visual = this._generateVisual(profile);
        const visualLabel = new St.Label({
            text: visual,
            style: 'font-family: monospace; ' +
                   'font-size: 12px; ' +
                   'color: #cccccc;'
        });
        infoBox.add_child(visualLabel);

        // Zone count
        const zoneInfo = new St.Label({
            text: `${profile.zones.length} zone${profile.zones.length !== 1 ? 's' : ''}`,
            style: 'font-size: 14px; ' +
                   'color: #999999;'
        });
        infoBox.add_child(zoneInfo);

        content.add_child(infoBox);
        button.set_child(content);

        // Click handler
        button.connect('clicked', () => {
            this._onProfileSelected(profile.id);
        });

        return button;
    }

    /**
     * Generate ASCII visualization for a profile
     * @private
     */
    _generateVisual(profile) {
        const width = 40;
        const height = 8;
        const grid = Array(height).fill(null).map(() => Array(width).fill(' '));

        // Draw each zone
        profile.zones.forEach((zone, index) => {
            const zoneChar = String.fromCharCode(65 + index); // A, B, C, etc.
            
            const x1 = Math.floor(zone.x * width);
            const y1 = Math.floor(zone.y * height);
            const x2 = Math.min(Math.floor((zone.x + zone.w) * width), width - 1);
            const y2 = Math.min(Math.floor((zone.y + zone.h) * height), height - 1);

            // Fill zone
            for (let y = y1; y <= y2; y++) {
                for (let x = x1; x <= x2; x++) {
                    if (y === y1 || y === y2 || x === x1 || x === x2) {
                        grid[y][x] = '█'; // Border
                    } else if (grid[y][x] === ' ') {
                        grid[y][x] = zoneChar;
                    }
                }
            }
        });

        return grid.map(row => row.join('')).join('\n');
    }

    /**
     * Handle profile selection
     * @private
     */
    _onProfileSelected(profileId) {
        const profile = this._profileManager.getAllProfiles().find(p => p.id === profileId);
        
        if (profile) {
            this._profileManager.setProfile(profileId);
            this._notificationManager.show(`Switched to: ${profile.name}`);
            console.log(`[ZoneFancy] Profile selected: ${profile.name}`);
        }

        this.hide();
    }

    /**
     * Update selection highlight
     * @private
     */
    _updateSelection() {
        this._profileButtons.forEach((button, index) => {
            if (index === this._selectedIndex) {
                button.style = 'padding: 15px; ' +
                              'border-radius: 8px; ' +
                              'background-color: rgba(74, 144, 217, 0.4); ' +
                              'border: 2px solid #4a90d9;';
            } else {
                button.style = 'padding: 15px; ' +
                              'border-radius: 8px; ' +
                              'background-color: rgba(60, 60, 60, 0.5);';
            }
        });
    }

    /**
     * Connect keyboard event handlers
     * @private
     */
    _connectKeyEvents() {
        this._keyPressId = global.stage.connect('key-press-event', (actor, event) => {
            const symbol = event.get_key_symbol();

            switch (symbol) {
                case Clutter.KEY_Escape:
                    this.hide();
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Return:
                case Clutter.KEY_KP_Enter:
                    const profiles = this._profileManager.getAllProfiles();
                    if (profiles[this._selectedIndex]) {
                        this._onProfileSelected(profiles[this._selectedIndex].id);
                    }
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Up:
                case Clutter.KEY_KP_Up:
                    this._selectedIndex = Math.max(0, this._selectedIndex - 1);
                    this._updateSelection();
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Down:
                case Clutter.KEY_KP_Down:
                    const maxIndex = this._profileManager.getAllProfiles().length - 1;
                    this._selectedIndex = Math.min(maxIndex, this._selectedIndex + 1);
                    this._updateSelection();
                    return Clutter.EVENT_STOP;
            }

            return Clutter.EVENT_PROPAGATE;
        });
    }

    /**
     * Disconnect keyboard event handlers
     * @private
     */
    _disconnectKeyEvents() {
        if (this._keyPressId) {
            global.stage.disconnect(this._keyPressId);
            this._keyPressId = null;
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.hide();
    }
}
