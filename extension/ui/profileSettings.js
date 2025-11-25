/**
 * ProfileSettings - Dialog for managing profiles
 * 
 * Provides a UI for:
 * - Listing all profiles with drag-and-drop ordering
 * - Creating new profiles
 * - Editing existing profiles
 * - Duplicating profiles
 * - Deleting custom profiles
 * - Resetting all profiles to defaults
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import { MessageDialog } from './messageDialog.js';
import { createLogger } from '../utils/debug.js';

const logger = createLogger('ProfileSettings');

export class ProfileSettings {
    /**
     * @param {ProfileManager} profileManager - Profile manager instance
     * @param {Gio.Settings} settings - GSettings instance
     * @param {string} extensionPath - Path to extension directory
     */
    constructor(profileManager, settings, extensionPath, profileEditorClass) {
        this._profileManager = profileManager;
        this._settings = settings;
        this._extensionPath = extensionPath;
        this._ProfileEditorClass = profileEditorClass;
        this._dialog = null;
        this._profileItems = [];
        this._profileListBox = null;
        this._clickInProgress = false;
    }

    /**
     * Show the profile settings dialog
     */
    show() {
        if (this._dialog) {
            // Already showing
            return;
        }

        this._createDialog();
        logger.info('Profile settings shown');
    }

    /**
     * Hide the profile settings dialog
     */
    hide() {
        if (this._dialog) {
            Main.uiGroup.remove_child(this._dialog);
            this._dialog.destroy();
            this._dialog = null;
            this._profileItems = [];
            this._profileListBox = null;
            logger.info('Profile settings hidden');
        }
    }

    /**
     * Create the settings dialog UI
     * @private
     */
    _createDialog() {
        const monitor = Main.layoutManager.currentMonitor;
        
        // Background overlay - minimal transparency, centered dialog
        this._dialog = new St.Bin({
            style_class: 'modal-dialog',
            reactive: true,
            style: 'background-color: rgba(0, 0, 0, 0.3);',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        
        // Click outside to close
        this._dialog.connect('button-press-event', (actor, event) => {
            if (event.get_source() === this._dialog) {
                this.hide();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Container
        const dialogWidth = Math.min(700, monitor.width * 0.8);
        const dialogHeight = Math.min(600, monitor.height * 0.8);
        
        const container = new St.BoxLayout({
            vertical: true,
            style: `background-color: rgba(40, 40, 40, 0.95); ` +
                   `border-radius: 16px; ` +
                   `padding: 30px; ` +
                   `spacing: 20px; ` +
                   `width: ${dialogWidth}px; ` +
                   `height: ${dialogHeight}px;`
        });
        
        container.connect('button-press-event', () => Clutter.EVENT_STOP);

        // Title
        const titleBox = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 10px;'
        });
        
        const title = new St.Label({
            text: 'Profile Settings',
            style: 'font-weight: bold; font-size: 16pt; color: #ffffff;',
            x_expand: true
        });
        titleBox.add_child(title);
        
        container.add_child(titleBox);

        // Scrollable profile list
        const scrollView = new St.ScrollView({
            style: 'flex: 1;',
            overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            x_expand: true,
            y_expand: true
        });

        // Store reference to profile list container for refreshing
        this._profileListBox = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 8px;'
        });

        // Build profile list
        this._rebuildProfileList();

        scrollView.add_child(this._profileListBox);
        container.add_child(scrollView);

        // Info text
        const info = new St.Label({
            text: 'ⓘ Drag profiles to reorder • First 9 can be selected with number keys',
            style: 'color: #aaaaaa; font-size: 9pt;'
        });
        container.add_child(info);

        // Bottom buttons
        const buttonBox = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 10px;',
            x_align: Clutter.ActorAlign.END
        });

        const resetButton = new St.Button({
            label: 'Reset All to Defaults',
            style_class: 'button',
            style: 'padding: 8px 16px; border-radius: 6px; ' +
                   'background-color: rgba(200, 50, 50, 0.8); ' +
                   'color: white;'
        });
        resetButton.connect('clicked', () => {
            logger.debug('[CLICK] Reset All button clicked');
            if (this._clickInProgress) return;
            this._clickInProgress = true;
            this._onResetAll();
            setTimeout(() => { this._clickInProgress = false; }, 300);
        });
        buttonBox.add_child(resetButton);

        // Spacer
        const spacer = new St.Widget({ x_expand: true });
        buttonBox.add_child(spacer);

        const newButton = new St.Button({
            label: '+ New Profile',
            style_class: 'button',
            style: 'padding: 8px 16px; border-radius: 6px; ' +
                   'background-color: rgba(74, 144, 217, 0.8); ' +
                   'color: white;'
        });
        newButton.connect('clicked', () => {
            logger.debug('[CLICK] New Profile button clicked');
            if (this._clickInProgress) return;
            this._clickInProgress = true;
            this._onNewProfile();
            setTimeout(() => { this._clickInProgress = false; }, 300);
        });
        buttonBox.add_child(newButton);

        const closeButton = new St.Button({
            label: 'Close',
            style_class: 'button',
            style: 'padding: 8px 16px; border-radius: 6px; ' +
                   'background-color: rgba(80, 80, 80, 0.8); ' +
                   'color: white;'
        });
        closeButton.connect('clicked', () => {
            logger.debug('[CLICK] Close button clicked');
            this.hide();
        });
        buttonBox.add_child(closeButton);

        container.add_child(buttonBox);

        this._dialog.set_child(container);

        // Add to stage
        Main.uiGroup.add_child(this._dialog);
        this._dialog.set_position(0, 0);
        this._dialog.set_size(global.screen_width, global.screen_height);
    }

    /**
     * Rebuild the profile list (internal method)
     * @private
     */
    _rebuildProfileList() {
        if (!this._profileListBox) {
            logger.warn('Profile list box not initialized');
            return;
        }
        
        // Clear existing items
        this._profileListBox.remove_all_children();
        this._profileItems = [];
        
        // Build fresh list
        const profiles = this._profileManager.getAllProfilesOrdered();
        profiles.forEach((profile, index) => {
            const item = this._createProfileItem(profile, index);
            this._profileListBox.add_child(item);
            this._profileItems.push({ profile, widget: item });
        });
        
        logger.debug(`Profile list rebuilt with ${profiles.length} items`);
    }

    /**
     * Refresh the profile list without destroying the dialog
     * @private
     */
    _refreshProfileList() {
        logger.debug('Refreshing profile list');
        this._rebuildProfileList();
    }

    /**
     * Create a profile list item
     * @private
     */
    _createProfileItem(profile, index) {
        const isDefault = this._isDefaultProfile(profile.id);
        
        const item = new St.BoxLayout({
            vertical: false,
            style: `padding: 12px; ` +
                   `background-color: rgba(60, 60, 60, 0.5); ` +
                   `border-radius: 8px; ` +
                   `spacing: 12px;`,
            reactive: true
        });
        
        // Drag handle
        const dragHandle = new St.Label({
            text: '☰',
            style: 'color: #888888; font-size: 14pt; width: 20px;'
        });
        item.add_child(dragHandle);

        // Profile info
        const infoBox = new St.BoxLayout({
            vertical: true,
            x_expand: true
        });
        
        const nameLabel = new St.Label({
            text: `${index + 1}. ${profile.name}`,
            style: 'font-weight: bold; color: #ffffff;'
        });
        infoBox.add_child(nameLabel);
        
        const detailLabel = new St.Label({
            text: `${profile.zones.length} zones${isDefault ? ' · Default' : ' · Custom'}`,
            style: 'color: #aaaaaa; font-size: 9pt;'
        });
        infoBox.add_child(detailLabel);
        
        item.add_child(infoBox);

        // Action buttons
        const editButton = new St.Button({
            label: 'Edit',
            style_class: 'button',
            style: 'padding: 6px 12px; border-radius: 4px; ' +
                   'background-color: rgba(74, 144, 217, 0.6);'
        });
        editButton.connect('clicked', () => {
            logger.debug(`[CLICK] Edit button clicked for ${profile.id}`);
            if (this._clickInProgress) return;
            this._clickInProgress = true;
            this._onEditProfile(profile.id);
            setTimeout(() => { this._clickInProgress = false; }, 300);
        });
        item.add_child(editButton);

        const duplicateButton = new St.Button({
            label: 'Duplicate',
            style_class: 'button',
            style: 'padding: 6px 12px; border-radius: 4px; ' +
                   'background-color: rgba(100, 100, 100, 0.6);'
        });
        duplicateButton.connect('clicked', () => {
            logger.debug(`[CLICK] Duplicate button clicked for ${profile.id}`);
            if (this._clickInProgress) return;
            this._clickInProgress = true;
            this._onDuplicateProfile(profile.id);
            setTimeout(() => { this._clickInProgress = false; }, 300);
        });
        item.add_child(duplicateButton);

        // Only show delete for custom profiles
        if (!isDefault) {
            const deleteButton = new St.Button({
                label: '🗑',
                style_class: 'button',
                style: 'padding: 6px 12px; border-radius: 4px; ' +
                       'background-color: rgba(200, 50, 50, 0.6);'
            });
            deleteButton.connect('clicked', () => {
                logger.debug(`[CLICK] Delete button clicked for ${profile.id}`);
                if (this._clickInProgress) return;
                this._clickInProgress = true;
                this._onDeleteProfile(profile.id);
                setTimeout(() => { this._clickInProgress = false; }, 300);
            });
            item.add_child(deleteButton);
        }

        return item;
    }

    /**
     * Check if a profile ID is a default profile
     * @private
     */
    _isDefaultProfile(profileId) {
        const defaultIds = [
            'center_focus', 'balanced_focus', 'thirds', 'halves', 
            'quarters', 'main_side_left', 'main_side_right',
            'balanced_left', 'balanced_right'
        ];
        return defaultIds.includes(profileId);
    }

    /**
     * Generate unique profile ID
     * @private
     */
    _generateUniqueId() {
        return `profile-${Date.now()}`;
    }

    /**
     * Handle new profile creation
     * @private
     */
    _onNewProfile() {
        logger.info('Creating new profile');
        
        // Create new profile with halves template
        const newProfile = {
            id: this._generateUniqueId(),
            name: 'New Profile',
            zones: [
                { name: 'Left', x: 0.0, y: 0.0, w: 0.5, h: 1.0 },
                { name: 'Right', x: 0.5, y: 0.0, w: 0.5, h: 1.0 }
            ]
        };
        
        // Open editor for new profile
        this._openProfileEditor(newProfile, true);
    }

    /**
     * Handle edit profile
     * @private
     */
    _onEditProfile(profileId) {
        logger.info(`Editing profile: ${profileId}`);
        
        const profiles = this._profileManager.getAllProfiles();
        const profile = profiles.find(p => p.id === profileId);
        
        if (!profile) {
            logger.error(`Profile not found: ${profileId}`);
            return;
        }
        
        // Deep copy profile for editing
        const profileCopy = {
            id: profile.id,
            name: profile.name,
            zones: JSON.parse(JSON.stringify(profile.zones))
        };
        
        this._openProfileEditor(profileCopy, false);
    }

    /**
     * Handle duplicate profile
     * @private
     */
    _onDuplicateProfile(profileId) {
        const timestamp = Date.now();
        logger.info(`[${timestamp}] Duplicating profile: ${profileId}`);
        
        const profiles = this._profileManager.getAllProfiles();
        const profile = profiles.find(p => p.id === profileId);
        
        if (!profile) {
            logger.error(`Profile not found: ${profileId}`);
            return;
        }
        
        // Generate new name
        const newName = `${profile.name} (Copy)`;
        
        // Duplicate via ProfileManager
        const newProfile = this._profileManager.duplicateProfile(profileId, newName);
        
        if (newProfile) {
            // Refresh UI (smart refresh, not full rebuild)
            this._refreshProfileList();
            
            logger.info(`[${timestamp}] Profile duplicated: ${newProfile.id}`);
        }
    }

    /**
     * Handle delete profile
     * @private
     */
    _onDeleteProfile(profileId) {
        const timestamp = Date.now();
        logger.info(`[${timestamp}] Deleting profile: ${profileId}`);
        
        try {
            const profiles = this._profileManager.getAllProfiles();
            const profile = profiles.find(p => p.id === profileId);
            
            if (!profile) {
                logger.warn('Profile not found, cannot delete');
                return;
            }
            
            logger.debug(`[${timestamp}] Creating confirmation dialog for ${profile.name}`);
            
            // Confirmation dialog
            const dialog = new MessageDialog({
                title: 'Delete Profile',
                message: `Are you sure you want to delete "${profile.name}"?\n\nThis action cannot be undone.`,
                type: 'warning'
            });
            
            logger.debug(`[${timestamp}] Dialog object created, typeof: ${typeof dialog}`);
            logger.debug(`[${timestamp}] Dialog has setButtons: ${typeof dialog.setButtons}`);
            logger.debug(`[${timestamp}] Dialog has show: ${typeof dialog.show}`);
            
            logger.debug(`[${timestamp}] Setting buttons on dialog`);
            dialog.setButtons([
                {
                    label: 'Cancel',
                    action: () => {
                        logger.debug(`[${timestamp}] User cancelled deletion`);
                        dialog.hide();
                    },
                    default: true
                },
                {
                    label: 'Delete',
                    action: () => {
                        logger.debug(`[${timestamp}] User confirmed deletion`);
                        if (this._profileManager.deleteProfile(profileId)) {
                            // Refresh UI (smart refresh, not full rebuild)
                            this._refreshProfileList();
                        }
                        dialog.hide();
                    }
                }
            ]);
            
            logger.debug(`[${timestamp}] About to call dialog.show()`);
            dialog.show();
            logger.debug(`[${timestamp}] Returned from dialog.show()`);
        } catch (error) {
            logger.error(`[${timestamp}] ERROR in _onDeleteProfile: ${error.message}`);
            logger.error(`[${timestamp}] Stack: ${error.stack}`);
        }
    }

    /**
     * Handle reset all profiles
     * @private
     */
    _onResetAll() {
        const timestamp = Date.now();
        logger.info(`[${timestamp}] Resetting all profiles to defaults`);
        
        const dialog = new MessageDialog({
            title: 'Reset All Profiles',
            message: 'This will replace all profiles with extension defaults.\n\n' +
                    'Your current profiles will be backed up to profiles.json.backup.\n\n' +
                    'Continue?',
            type: 'warning'
        });
        
        dialog.setButtons([
            {
                label: 'Cancel',
                action: () => dialog.hide(),
                default: true
            },
            {
                label: 'Reset All',
                action: () => {
                    logger.debug(`[${timestamp}] User confirmed reset`);
                    if (this._profileManager.resetToDefaults()) {
                        // Refresh UI (smart refresh, not full rebuild)
                        this._refreshProfileList();
                    }
                    dialog.hide();
                }
            }
        ]);
        
        dialog.show();
    }

    /**
     * Open profile editor
     * @private
     */
    _openProfileEditor(profile, isNew) {
        if (!this._ProfileEditorClass) {
            logger.error('ProfileEditor class not provided');
            return;
        }
        
        // Close settings dialog
        this.hide();
        
        // Open editor
        const editor = new this._ProfileEditorClass(
            profile,
            this._profileManager,
            this._settings,
            this._extensionPath
        );
        
        editor.show();
        
        // Reopen settings when editor closes
        editor.connect('closed', () => {
            this.show();
        });
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.hide();
    }
}
