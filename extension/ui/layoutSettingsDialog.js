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
 * Enhanced with FancyZones features:
 * - Padding field
 * - Keyboard shortcut recorder (placeholder)
 * - Delete button for existing layouts
 */

import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import { createLogger } from '../utils/debug.js';
import { ZoneEditor } from './zoneEditor.js';
import { ConfirmDialog } from './confirmDialog.js';

const logger = createLogger('LayoutSettingsDialog');

/**
 * LayoutSettingsDialog - Gateway dialog for layout management
 * 
 * Separates metadata editing (name, padding, shortcut) from geometry editing (zones).
 * This enforces a settings-first approach where users must name their layout
 * before saving.
 */
export const LayoutSettingsDialog = GObject.registerClass(
class LayoutSettingsDialog extends ModalDialog.ModalDialog {
    _init(layout, layoutManager, onSave, onCancel) {
        super._init({ styleClass: 'layout-settings-dialog' });

        this._isNewLayout = (layout === null);
        
        // Create working copy to avoid mutating input
        this._layout = layout ? JSON.parse(JSON.stringify(layout)) : {
            zones: [],
            padding: 8
        };
        
        this._layoutManager = layoutManager;
        this._onSaveCallback = onSave;
        this._onCancelCallback = onCancel;
        
        // UI elements (will be created in _buildUI)
        this._nameEntry = null;
        this._layoutStatusLabel = null;
        this._paddingSpinButton = null;
        this._shortcutButton = null;
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

        // Padding field
        const paddingBox = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 12px; margin-bottom: 16px;'
        });

        const paddingLabel = new St.Label({
            text: 'Padding:',
            style: 'font-size: 11pt; padding-top: 6px;',
            y_align: Clutter.ActorAlign.CENTER
        });
        paddingBox.add_child(paddingLabel);

        this._paddingSpinButton = new St.SpinButton({
            adjustment: new St.Adjustment({
                lower: 0,
                upper: 64,
                step_increment: 1,
                value: this._layout.padding || 8
            }),
            style: 'width: 80px;'
        });
        paddingBox.add_child(this._paddingSpinButton);

        const paddingUnit = new St.Label({
            text: 'pixels',
            style: 'font-size: 11pt; color: #999; padding-top: 6px;',
            y_align: Clutter.ActorAlign.CENTER
        });
        paddingBox.add_child(paddingUnit);

        this.contentLayout.add_child(paddingBox);

        // Keyboard shortcut field
        const shortcutBox = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 12px; margin-bottom: 16px;'
        });

        const shortcutLabel = new St.Label({
            text: 'Shortcut:',
            style: 'font-size: 11pt; padding-top: 6px;',
            y_align: Clutter.ActorAlign.CENTER
        });
        shortcutBox.add_child(shortcutLabel);

        this._shortcutButton = new St.Button({
            label: this._layout.shortcut || 'Click to record',
            style_class: 'button',
            style: 'padding: 6px 16px;'
        });
        this._shortcutButton.connect('clicked', () => this._recordShortcut());
        shortcutBox.add_child(this._shortcutButton);

        const shortcutHint = new St.Label({
            text: '(Not yet implemented)',
            style: 'font-size: 9pt; color: #888; padding-top: 8px;',
            y_align: Clutter.ActorAlign.CENTER
        });
        shortcutBox.add_child(shortcutHint);

        this.contentLayout.add_child(shortcutBox);

        // Add buttons using ModalDialog's button system
        const buttons = [
            {
                label: 'Cancel',
                action: () => this._onCancel(),
                key: Clutter.KEY_Escape
            },
            {
                label: 'Save',
                action: () => this._onSave()
            }
        ];

        // Add delete button for existing layouts
        if (!this._isNewLayout) {
            buttons.unshift({
                label: 'Delete',
                action: () => this._onDelete()
            });
        }

        this.setButtons(buttons);

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
            this._layoutManager,
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
     * Record keyboard shortcut (placeholder)
     * @private
     */
    _recordShortcut() {
        logger.info('Shortcut recorder not yet implemented');
        // TODO: Implement keyboard shortcut recording
        // This will involve capturing key press events and storing the combination
    }

    /**
     * Handle delete action
     * @private
     */
    _onDelete() {
        logger.info(`Delete requested for layout: ${this._layout.name}`);

        const confirmDialog = new ConfirmDialog(
            'Delete Layout',
            `Are you sure you want to delete "${this._layout.name}"? This cannot be undone.`,
            () => {
                // Confirmed - delete the layout
                const success = this._layoutManager.deleteLayout(this._layout.id);
                
                if (success) {
                    logger.info(`Layout deleted: ${this._layout.name}`);
                    this.close();
                    
                    if (this._onSaveCallback) {
                        this._onSaveCallback(null); // Signal deletion
                    }
                } else {
                    logger.error('Failed to delete layout');
                }
            },
            () => {
                // Canceled
                logger.info('Delete canceled');
            }
        );

        confirmDialog.open();
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
        const padding = this._paddingSpinButton.get_value();

        const finalLayout = {
            id: this._layout.id || this._generateId(),
            name: name,
            zones: this._layout.zones,
            padding: padding,
            shortcut: this._layout.shortcut || null,
            metadata: {
                createdDate: this._layout.metadata?.createdDate || Date.now(),
                modifiedDate: Date.now()
            }
        };

        logger.info(`Saving layout: ${finalLayout.name} (${finalLayout.id})`);

        const success = this._layoutManager.saveLayout(finalLayout);

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
     * Generate a unique layout ID
     * @returns {string} Unique ID
     * @private
     */
    _generateId() {
        return `layout-${Date.now()}`;
    }
});
