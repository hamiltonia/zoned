/**
 * ProfileEditor - Visual profile editing dialog
 * 
 * Provides comprehensive zone editing with:
 * - Visual zone canvas
 * - Zone list and properties sidebar
 * - Split horizontal/vertical operations
 * - Zone name editing
 * - Save/Cancel workflow
 */

import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { ZoneCanvas } from './zoneCanvas.js';
import { MessageDialog } from './messageDialog.js';
import { createLogger } from '../utils/debug.js';

const logger = createLogger('ProfileEditor');

export const ProfileEditor = GObject.registerClass({
    Signals: {
        'closed': {}
    }
}, class ProfileEditor extends GObject.Object {
    /**
     * @param {Object} profile - Profile to edit (will be copied)
     * @param {ProfileManager} profileManager - Profile manager instance
     * @param {Gio.Settings} settings - GSettings instance
     * @param {string} extensionPath - Path to extension directory
     */
   _init(profile, profileManager, settings, extensionPath) {
        super._init();
        
        this._profile = JSON.parse(JSON.stringify(profile)); // Deep copy
        this._profileManager = profileManager;
        this._settings = settings;
        this._extensionPath = extensionPath;
        this._dialog = null;
        this._canvas = null;
        this._selectedZoneIndex = 0;
        this._nameEntry = null;
        this._zoneListBox = null;
        this._selectedZonePropsBox = null;
        this._sidebarContainer = null;
        this._clickInProgress = false;
    }

    /**
     * Show the editor dialog
     */
    show() {
        if (this._dialog) {
            return;
        }

        this._createDialog();
        logger.info(`Profile editor shown for: ${this._profile.name}`);
    }

    /**
     * Hide the editor dialog
     */
    hide() {
        if (this._dialog) {
            Main.uiGroup.remove_child(this._dialog);
            this._dialog.destroy();
            this._dialog = null;
            
            if (this._canvas) {
                this._canvas.destroy();
                this._canvas = null;
            }
            
            // Reset click debounce flag
            this._clickInProgress = false;
            
            // Emit closed signal
            this.emit('closed');
            
            logger.info('Profile editor hidden');
        }
    }

    /**
     * Create the editor dialog
     * @private
     */
    _createDialog() {
        const monitor = Main.layoutManager.currentMonitor;
        
        // Background overlay
        this._dialog = new St.Bin({
            style_class: 'modal-dialog',
            reactive: true,
            style: 'background-color: rgba(0, 0, 0, 0.7);',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        
        // Click outside to close (with confirmation)
        this._dialog.connect('button-press-event', (actor, event) => {
            if (event.get_source() === this._dialog) {
                this._onCancel();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Main container
        const dialogWidth = Math.min(900, monitor.width * 0.85);
        const dialogHeight = Math.min(650, monitor.height * 0.85);
        
        const container = new St.BoxLayout({
            vertical: true,
            style: `background-color: rgba(35, 35, 35, 0.98); ` +
                   `border-radius: 16px; ` +
                   `padding: 25px; ` +
                   `spacing: 20px; ` +
                   `width: ${dialogWidth}px; ` +
                   `height: ${dialogHeight}px;`
        });
        
        container.connect('button-press-event', () => Clutter.EVENT_STOP);

        // Title bar
        const titleBar = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 10px;'
        });
        
        const title = new St.Label({
            text: `Editing: ${this._profile.name}`,
            style: 'font-weight: bold; font-size: 14pt; color: #ffffff;',
            x_expand: true
        });
        titleBar.add_child(title);
        
        container.add_child(titleBar);

        // Content area - canvas on left, sidebar on right
        const contentBox = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 20px;',
            x_expand: true,
            y_expand: true
        });

        // Canvas section (60%)
        const canvasWidth = Math.floor((dialogWidth - 90) * 0.6);
        const canvasHeight = dialogHeight - 180;
        
        this._canvas = new ZoneCanvas(canvasWidth, canvasHeight);
        this._canvas.setZones(this._profile.zones);
        this._canvas.setSelectedZone(this._selectedZoneIndex);
        
        // Connect to zone selection
        this._canvas.connect('zone-selected', (canvas, index) => {
            this._onZoneSelected(index);
        });
        
        contentBox.add_child(this._canvas.getWidget());

        // Sidebar section (40%)
        const sidebarWidth = Math.floor((dialogWidth - 90) * 0.4);
        const sidebar = this._createSidebar(sidebarWidth, canvasHeight);
        contentBox.add_child(sidebar);

        container.add_child(contentBox);

        // Bottom buttons
        const buttonBox = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 10px;',
            x_align: Clutter.ActorAlign.END
        });

        const cancelButton = new St.Button({
            label: 'Cancel',
            style_class: 'button',
            style: 'padding: 10px 20px; border-radius: 6px; ' +
                   'background-color: rgba(100, 100, 100, 0.8); ' +
                   'color: white;'
        });
        cancelButton.connect('clicked', () => {
            if (this._clickInProgress) return;
            this._clickInProgress = true;
            this._onCancel();
            // Note: timeout reset happens in hide()
        });
        buttonBox.add_child(cancelButton);

        const saveButton = new St.Button({
            label: 'Save Changes',
            style_class: 'button',
            style: 'padding: 10px 20px; border-radius: 6px; ' +
                   'background-color: rgba(74, 144, 217, 0.9); ' +
                   'color: white; font-weight: bold;'
        });
        saveButton.connect('clicked', () => {
            if (this._clickInProgress) return;
            this._clickInProgress = true;
            this._onSave();
            setTimeout(() => { this._clickInProgress = false; }, 300);
        });
        buttonBox.add_child(saveButton);

        container.add_child(buttonBox);

        this._dialog.set_child(container);

        // Add to stage
        Main.uiGroup.add_child(this._dialog);
        this._dialog.set_position(0, 0);
        this._dialog.set_size(global.screen_width, global.screen_height);
        this._dialog.grab_key_focus();
    }

    /**
     * Create the sidebar UI
     * @private
     */
    _createSidebar(width, height) {
        const sidebar = new St.BoxLayout({
            vertical: true,
            style: `width: ${width}px; spacing: 15px;`
        });

        // Profile name section
        const nameBox = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 5px;'
        });
        
        const nameLabel = new St.Label({
            text: 'Profile Name:',
            style: 'color: #cccccc; font-size: 10pt;'
        });
        nameBox.add_child(nameLabel);
        
        this._nameEntry = new St.Entry({
            text: this._profile.name,
            style: 'padding: 8px; border-radius: 4px; ' +
                   'background-color: rgba(60, 60, 60, 0.8); ' +
                   'color: white;',
            hint_text: 'Profile name...'
        });
        this._nameEntry.clutter_text.connect('text-changed', () => {
            this._profile.name = this._nameEntry.get_text();
        });
        nameBox.add_child(this._nameEntry);
        
        sidebar.add_child(nameBox);

        // Zone list section
        const zoneListLabel = new St.Label({
            text: `Zones (${this._profile.zones.length}):`,
            style: 'color: #cccccc; font-size: 10pt; font-weight: bold;'
        });
        sidebar.add_child(zoneListLabel);

        // Scrollable zone list
        const scrollView = new St.ScrollView({
            style: 'flex: 1; max-height: 200px;',
            overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            x_expand: true
        });

        this._zoneListBox = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 4px;'
        });
        
        this._updateZoneList();
        
        scrollView.add_child(this._zoneListBox);
        sidebar.add_child(scrollView);

        // Selected zone properties
        const propsLabel = new St.Label({
            text: 'Selected Zone:',
            style: 'color: #cccccc; font-size: 10pt; font-weight: bold;'
        });
        sidebar.add_child(propsLabel);
        
        this._selectedZonePropsBox = this._createZoneProperties();
        sidebar.add_child(this._selectedZonePropsBox);
        
        // Store reference to sidebar for zone properties updates
        this._sidebarContainer = sidebar;

        // Action buttons
        const actionsLabel = new St.Label({
            text: 'Actions:',
            style: 'color: #cccccc; font-size: 10pt; font-weight: bold;'
        });
        sidebar.add_child(actionsLabel);

        const actionsBox = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 6px;'
        });

        const splitHButton = new St.Button({
            label: 'Split Horizontal (Left/Right)',
            style_class: 'button',
            style: 'padding: 8px; border-radius: 4px; ' +
                   'background-color: rgba(74, 144, 217, 0.6);'
        });
        splitHButton.connect('clicked', () => {
            if (this._clickInProgress) return;
            this._clickInProgress = true;
            this._onSplitHorizontal();
            setTimeout(() => { this._clickInProgress = false; }, 300);
        });
        actionsBox.add_child(splitHButton);

        const splitVButton = new St.Button({
            label: 'Split Vertical (Top/Bottom)',
            style_class: 'button',
            style: 'padding: 8px; border-radius: 4px; ' +
                   'background-color: rgba(74, 144, 217, 0.6);'
        });
        splitVButton.connect('clicked', () => {
            if (this._clickInProgress) return;
            this._clickInProgress = true;
            this._onSplitVertical();
            setTimeout(() => { this._clickInProgress = false; }, 300);
        });
        actionsBox.add_child(splitVButton);

        sidebar.add_child(actionsBox);

        return sidebar;
    }

    /**
     * Create zone properties UI
     * @private
     */
    _createZoneProperties() {
        const box = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 8px; padding: 10px; ' +
                   'background-color: rgba(50, 50, 50, 0.5); ' +
                   'border-radius: 6px;'
        });
        
        if (this._selectedZoneIndex < 0 || this._selectedZoneIndex >= this._profile.zones.length) {
            const noSelection = new St.Label({
                text: 'No zone selected',
                style: 'color: #888888;'
            });
            box.add_child(noSelection);
            return box;
        }
        
        const zone = this._profile.zones[this._selectedZoneIndex];
        
        // Zone name
        const nameEntry = new St.Entry({
            text: zone.name || '',
            style: 'padding: 6px; border-radius: 4px; ' +
                   'background-color: rgba(70, 70, 70, 0.8);',
            hint_text: 'Zone name...'
        });
        nameEntry.clutter_text.connect('text-changed', () => {
            zone.name = nameEntry.get_text();
            this._updateZoneList();
            this._canvas.setZones(this._profile.zones);
        });
        box.add_child(nameEntry);
        
        //Position & size info
        const infoLabel = new St.Label({
            text: `Position: ${(zone.x * 100).toFixed(1)}%, ${(zone.y * 100).toFixed(1)}%\n` +
                  `Size: ${(zone.w * 100).toFixed(1)}% × ${(zone.h * 100).toFixed(1)}%`,
            style: 'color: #aaaaaa; font-size: 9pt;'
        });
        box.add_child(infoLabel);
        
        return box;
    }

    /**
     * Update the zone list
     * @private
     */
    _updateZoneList() {
        this._zoneListBox.remove_all_children();
        
        this._profile.zones.forEach((zone, index) => {
            const isSelected = index === this._selectedZoneIndex;
            
            const zoneItem = new St.Button({
                style_class: 'button',
                style: `padding: 8px; border-radius: 4px; ` +
                       `background-color: ${isSelected ? 'rgba(74, 144, 217, 0.5)' : 'rgba(60, 60, 60, 0.4)'}; ` +
                       `border: ${isSelected ? '2px solid #4a90d9' : '1px solid #555'};`,
                reactive: true,
                x_align: Clutter.ActorAlign.START
            });
            
            const label = new St.Label({
                text: `${isSelected ? '● ' : ''}${zone.name || `Zone ${index + 1}`}`,
                style: 'color: #ffffff;'
            });
            zoneItem.set_child(label);
            
            zoneItem.connect('clicked', () => {
                this._onZoneSelected(index);
            });
            
            this._zoneListBox.add_child(zoneItem);
        });
    }

    /**
     * Handle zone selection
     * @private
     */
    _onZoneSelected(index) {
        this._selectedZoneIndex = index;
        this._canvas.setSelectedZone(index);
        this._updateZoneList();
        this._updateSelectedZoneProperties();
        logger.debug(`Zone ${index} selected in editor`);
    }

    /**
     * Update selected zone properties display
     * @private
     */
    _updateSelectedZoneProperties() {
        if (!this._sidebarContainer || !this._selectedZonePropsBox) {
            logger.warn('Cannot update zone properties - sidebar not initialized');
            return;
        }
        
        // Get children to find the index where the props box should be
        const children = this._sidebarContainer.get_children();
        let propsBoxIndex = -1;
        
        for (let i = 0; i < children.length; i++) {
            if (children[i] === this._selectedZonePropsBox) {
                propsBoxIndex = i;
                break;
            }
        }
        
        if (propsBoxIndex === -1) {
            logger.warn('Could not find zone properties box in sidebar');
            return;
        }
        
        // Remove old properties box
        this._sidebarContainer.remove_child(this._selectedZonePropsBox);
        this._selectedZonePropsBox.destroy();
        
        // Create new one
        this._selectedZonePropsBox = this._createZoneProperties();
        
        // Insert at same position
        this._sidebarContainer.insert_child_at_index(this._selectedZonePropsBox, propsBoxIndex);
        
        logger.debug('Zone properties updated');
    }

    /**
     * Split zone horizontally (left/right)
     * @private
     */
    _onSplitHorizontal() {
        if (this._selectedZoneIndex < 0) {
            logger.warn('No zone selected for split');
            return;
        }
        
        const zone = this._profile.zones[this._selectedZoneIndex];
        
        // Create two new zones
        const leftZone = {
            name: `${zone.name} Left`,
            x: zone.x,
            y: zone.y,
            w: zone.w * 0.5,
            h: zone.h
        };
        
        const rightZone = {
            name: `${zone.name} Right`,
            x: zone.x + zone.w * 0.5,
            y: zone.y,
            w: zone.w * 0.5,
            h: zone.h
        };
        
        // Replace original zone with two new zones
        this._profile.zones.splice(this._selectedZoneIndex, 1, leftZone, rightZone);
        
        // Update UI
        this._canvas.setZones(this._profile.zones);
        this._updateZoneList();
        
        logger.info('Split zone horizontally');
    }

    /**
     * Split zone vertically (top/bottom)
     * @private
     */
    _onSplitVertical() {
        if (this._selectedZoneIndex < 0) {
            logger.warn('No zone selected for split');
            return;
        }
        
        const zone = this._profile.zones[this._selectedZoneIndex];
        
        // Create two new zones
        const topZone = {
            name: `${zone.name} Top`,
            x: zone.x,
            y: zone.y,
            w: zone.w,
            h: zone.h * 0.5
        };
        
        const bottomZone = {
            name: `${zone.name} Bottom`,
            x: zone.x,
            y: zone.y + zone.h * 0.5,
            w: zone.w,
            h: zone.h * 0.5
        };
        
        // Replace original zone with two new zones
        this._profile.zones.splice(this._selectedZoneIndex, 1, topZone, bottomZone);
        
        // Update UI
        this._canvas.setZones(this._profile.zones);
        this._updateZoneList();
        
        logger.info('Split zone vertically');
    }

    /**
     * Handle save
     * @private
     */
    _onSave() {
        logger.info('Saving profile');
        
        // Basic validation
        if (!this._profile.name || this._profile.name.trim() === '') {
            const dialog = new MessageDialog({
                title: 'Invalid Profile',
                message: 'Profile name cannot be empty.',
                type: 'error'
            });
            dialog.show();
            return;
        }
        
        if (this._profile.zones.length < 2) {
            const dialog = new MessageDialog({
                title: 'Invalid Profile',
                message: 'Profile must have at least 2 zones.',
                type: 'error'
            });
            dialog.show();
            return;
        }
        
        // Save via ProfileManager
        if (this._profileManager.saveProfile(this._profile)) {
            logger.info(`Profile saved: ${this._profile.id}`);
            this.hide();
        } else {
            const dialog = new MessageDialog({
                title: 'Save Failed',
                message: 'Failed to save profile. Check logs for details.',
                type: 'error'
            });
            dialog.show();
        }
    }

    /**
     * Handle cancel
     * @private
     */
    _onCancel() {
        logger.info('Canceling profile edit');
        
        // Show confirmation if changes were made
        const dialog = new MessageDialog({
            title: 'Discard Changes?',
            message: 'Are you sure you want to discard all changes?',
            type: 'warning'
        });
        
        dialog.setButtons([
            {
                label: 'Keep Editing',
                action: () => dialog.hide(),
                default: true
            },
            {
                label: 'Discard',
                action: () => {
                    dialog.hide();
                    this.hide();
                }
            }
        ]);
        
        dialog.show();
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.hide();
    }
});
