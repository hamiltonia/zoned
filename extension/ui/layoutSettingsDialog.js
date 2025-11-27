/**
 * LayoutSettingsDialog - Gateway for all layout operations
 * 
 * ARCHITECTURE NOTE:
 * - This is the entry point for creating/editing layouts
 * - Handles METADATA (name, settings) separate from GEOMETRY (zones)
 * - Uses ZoneEditor for geometry editing
 * - Enforces settings-first approach (name required before save)
 * 
 * Modes:
 * - Create: layout=null (new layout, starts with no zones)
 * - Edit: layout=existing (modify existing layout)
 * 
 * States:
 * - State A (Create): Name empty, no zones → Save disabled
 * - State B (Edit): Name filled, zones exist → Save enabled
 * - State C (After ZoneEditor): Zone count updated → May enable save
 * 
 * Part of Phase 2 implementation (v1.0 roadmap)
 */

import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import { createLogger } from '../utils/debug.js';
import { ZoneEditor } from './zoneEditor.js';

const logger = createLogger('LayoutSettingsDialog');

/**
 * LayoutSettingsDialog - Gateway dialog for layout management
 * 
 * Separates metadata editing (name, etc.) from geometry editing (zones).
 * This enforces a settings-first approach where users must name their layout
 * before saving.
 */
export const LayoutSettingsDialog = GObject.registerClass(
class LayoutSettingsDialog extends ModalDialog.ModalDialog {
    _init(layout, profileManager, onSave, onCancel) {
        super._init({ styleClass: 'layout-settings-dialog' });

        this._isNewLayout = (layout === null);
        
        // Create working copy to avoid mutating input
        this._layout = layout ? JSON.parse(JSON.stringify(layout)) : {
            zones: []
        };
        
        this._profileManager = profileManager;
        this._onSaveCallback = onSave;
        this._onCancelCallback = onCancel;
        
        // UI elements (will be created in _buildUI)
        this._nameEntry = null;
        this._layoutStatusLabel = null;
        this._saveButton = null;

        this._buildUI();

        logger.debug(`LayoutSettingsDialog created (${this._isNewLayout ? 'CREATE' : 'EDIT'} mode)`);
    }

    /**
     * Build the dialog UI
     * @private
     */
    _buildUI() {
        // Title
        const title = this._isNewLayout ? 'New Layout' : `Edit Layout: ${this._layout.name}`;
        const titleLabel = new St.Label({
            text: title,
            style: 'font-weight: bold; font-size: 14pt; margin-bottom: 16px;'
        });
        this.contentLayout.add_child(titleLabel);

        // Name input section
        const nameBox = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 12px; margin-bottom: 16px;'
        });

        const nameLabel = new St.Label({
            text: 'Name:',
            style: 'font-size: 11pt; padding-top: 6px;',
            y_align: Clutter.ActorAlign.CENTER
        });
        nameBox.add_child(nameLabel);

        this._nameEntry = new St.Entry({
            text: this._layout.name || '',
            hint_text: 'Layout name (required)',
            can_focus: true,
            style: 'min-width: 300px;'
        });
        this._nameEntry.clutter_text.connect('text-changed', () => {
            this._updateSaveButton();
        });
        nameBox.add_child(this._nameEntry);

        this.contentLayout.add_child(nameBox);

        // Layout status display
        const statusBox = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 12px; margin-bottom: 16px;'
        });

        const statusLabelPrefix = new St.Label({
            text: 'Zones:',
            style: 'font-size: 11pt;'
        });
        statusBox.add_child(statusLabelPrefix);

        this._layoutStatusLabel = new St.Label({
            text: this._getLayoutStatus(),
            style: 'font-size: 11pt; color: #999;'
        });
        statusBox.add_child(this._layoutStatusLabel);

        this.contentLayout.add_child(statusBox);

        // "Edit Layout..." button
        const editButton = new St.Button({
            label: 'Edit Layout...',
            style_class: 'button',
            style: 'padding: 8px 24px; margin-bottom: 16px;'
        });
        editButton.connect('clicked', () => this._openZoneEditor());
        this.contentLayout.add_child(editButton);

        // Add buttons using ModalDialog's button system
        this.setButtons([
            {
                label: 'Cancel',
                action: () => this._onCancel(),
                key: Clutter.KEY_Escape
            },
            {
                label: 'Save',
                action: () => this._onSave()
            }
        ]);

        logger.debug('LayoutSettingsDialog UI built');
    }

    /**
     * Get layout status text
     * @returns {string} Status text describing zone count
     * @private
     */
    _getLayoutStatus() {
        const zoneCount = this._layout.zones?.length || 0;
        if (zoneCount === 0) {
            return 'No zones defined';
        }
        return `${zoneCount} zone${zoneCount !== 1 ? 's' : ''} defined`;
    }

    /**
     * Validate if layout can be saved
     * @returns {boolean} True if layout is valid for saving
     * @private
     */
    _validateForSave() {
        const name = this._nameEntry.get_text().trim();
        if (!name) {
            return false;
        }

        if (!this._layout.zones || this._layout.zones.length === 0) {
            return false;
        }

        return true;
    }

    /**
     * Update save button enabled state
     * @private
     */
    _updateSaveButton() {
        logger.debug(`Validation: ${this._validateForSave() ? 'can save' : 'cannot save'}`);
    }

    /**
     * Open ZoneEditor to edit geometry
     * @private
     */
    _openZoneEditor() {
        logger.info('Opening ZoneEditor from LayoutSettingsDialog');
        
        this.close();

        const layoutForEditor = (this._layout.zones.length > 0) ? this._layout : null;

        const editor = new ZoneEditor(
            layoutForEditor,
            this._profileManager,
            (editedLayout) => {
                logger.info(`ZoneEditor returned with ${editedLayout.zones.length} zones`);
                this._layout.zones = editedLayout.zones;

                this.open();
                this._layoutStatusLabel.set_text(this._getLayoutStatus());
                this._updateSaveButton();
            },
            () => {
                logger.info('ZoneEditor canceled, reopening settings dialog');
                this.open();
            }
        );

        editor.show();
    }

    /**
     * Handle save action
     * @private
     */
    _onSave() {
        if (!this._validateForSave()) {
            logger.warn('Cannot save: validation failed');
            return;
        }

        const name = this._nameEntry.get_text().trim();

        const finalLayout = {
            id: this._layout.id || this._generateId(),
            name: name,
            zones: this._layout.zones,
            metadata: {
                createdDate: this._layout.metadata?.createdDate || Date.now(),
                modifiedDate: Date.now()
            }
        };

        logger.info(`Saving layout: ${finalLayout.name} (${finalLayout.id})`);

        const success = this._profileManager.saveProfile(finalLayout);

        if (success) {
            logger.info('Layout saved successfully');
            
            this.close();

            if (this._onSaveCallback) {
                this._onSaveCallback(finalLayout);
            }
        } else {
            logger.error('Failed to save layout');
        }
    }

    /**
     * Handle cancel action
     * @private
     */
    _onCancel() {
        logger.info('LayoutSettingsDialog canceled');
        
        this.close();

        if (this._onCancelCallback) {
            this._onCancelCallback();
        }
    }

    /**
     * Generate a unique profile ID
     * @returns {string} Unique ID
     * @private
     */
    _generateId() {
        return `layout-${Date.now()}`;
    }
});
