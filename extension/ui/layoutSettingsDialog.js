/**
 * LayoutSettingsDialog - Gateway for all layout operations
 * 
 * ARCHITECTURE NOTE:
 * - This is the entry point for creating/editing layouts
 * - Handles METADATA (name, settings) separate from GEOMETRY (zones)
 * - Uses ZoneEditor for geometry editing
 * - Enforces settings-first approach (name required before save)
 * - Uses custom UI framework (not ModalDialog) for z-order control
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

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { createLogger } from '../utils/debug.js';
import { ThemeManager } from '../utils/theme.js';
import { ZoneEditor } from './zoneEditor.js';
import { ConfirmDialog } from './confirmDialog.js';

const logger = createLogger('LayoutSettingsDialog');

/**
 * LayoutSettingsDialog - Gateway dialog for layout management
 * 
 * Separates metadata editing (name, padding, shortcut) from geometry editing (zones).
 * This enforces a settings-first approach where users must name their layout
 * before saving.
 * 
 * Uses custom UI framework (Main.uiGroup + pushModal) for full z-order control,
 * allowing layout preview background to show behind the dialog.
 */
export class LayoutSettingsDialog {
    constructor(layout, layoutManager, settings, onSave, onCancel) {
        this._isNewLayout = (layout === null);
        
        // Create working copy to avoid mutating input
        this._layout = layout ? JSON.parse(JSON.stringify(layout)) : {
            zones: [],
            padding: 8
        };
        
        this._layoutManager = layoutManager;
        this._settings = settings;
        this._themeManager = new ThemeManager(settings);
        this._onSaveCallback = onSave;
        this._onCancelCallback = onCancel;
        
        // UI elements
        this._container = null;
        this._dialogCard = null;
        this._nameEntry = null;
        this._layoutStatusLabel = null;
        this._paddingEntry = null;
        this._shortcutButton = null;
        this._saveButton = null;
        
        this._modal = null;
        this._visible = false;
        this._closing = false;  // Re-entrance guard

        logger.debug(`LayoutSettingsDialog created (${this._isNewLayout ? 'CREATE' : 'EDIT'} mode)`);
    }

    /**
     * Open the dialog
     */
    open() {
        if (this._visible) {
            logger.warn('LayoutSettingsDialog already visible');
            return;
        }

        const monitor = Main.layoutManager.currentMonitor;
        const colors = this._themeManager.getColors();

        // Create full-screen container (transparent, catches clicks outside dialog)
        // NOTE: Preview background is provided by the parent (e.g., LayoutSwitcher)
        // when opened from there, so this container should be transparent
        this._container = new St.Widget({
            reactive: true,
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height,
            style: `background-color: transparent;`
        });

        // Click on container (outside dialog) dismisses
        // Use coordinate check since event.get_source() isn't reliable with modal
        this._container.connect('button-press-event', (actor, event) => {
            const [clickX, clickY] = event.get_coords();
            const cardAlloc = this._dialogCard ? this._dialogCard.get_transformed_extents() : null;
            
            if (cardAlloc) {
                // Check if click is outside the dialog card bounds
                const isOutside = clickX < cardAlloc.origin.x ||
                                  clickX > cardAlloc.origin.x + cardAlloc.size.width ||
                                  clickY < cardAlloc.origin.y ||
                                  clickY > cardAlloc.origin.y + cardAlloc.size.height;
                
                if (isOutside) {
                    this._onCancel();
                    return Clutter.EVENT_STOP;
                }
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Build the dialog card
        this._buildDialogCard(colors);

        // Center the dialog card
        const cardWidth = 420;
        const cardHeight = this._dialogCard.get_preferred_height(cardWidth)[1] || 500;
        this._dialogCard.set_position(
            Math.floor((monitor.width - cardWidth) / 2),
            Math.floor((monitor.height - cardHeight) / 2)
        );

        this._container.add_child(this._dialogCard);
        Main.uiGroup.add_child(this._container);

        // Push modal to capture input
        this._modal = Main.pushModal(this._container, {
            actionMode: 1  // Shell.ActionMode.NORMAL
        });

        // Connect key handler for ESC
        this._keyPressId = this._container.connect('key-press-event', (actor, event) => {
            const symbol = event.get_key_symbol();
            if (symbol === Clutter.KEY_Escape) {
                this._onCancel();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this._visible = true;

        // Focus the name entry
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            if (this._nameEntry) {
                this._nameEntry.grab_key_focus();
            }
            return GLib.SOURCE_REMOVE;
        });

        logger.debug('LayoutSettingsDialog opened');
    }

    /**
     * Close the dialog
     */
    close() {
        if (!this._visible || this._closing) {
            return;
        }
        this._closing = true;

        // Pop modal - pass the Clutter.Grab object returned by pushModal
        if (this._modal) {
            Main.popModal(this._modal);
            this._modal = null;
        }

        // Disconnect key handler
        if (this._keyPressId && this._container) {
            this._container.disconnect(this._keyPressId);
            this._keyPressId = null;
        }

        // Destroy container
        if (this._container) {
            Main.uiGroup.remove_child(this._container);
            this._container.destroy();
            this._container = null;
        }

        this._visible = false;
        logger.debug('LayoutSettingsDialog closed');
    }

    /**
     * Build the dialog card UI
     * @param {Object} colors - Theme colors
     * @private
     */
    _buildDialogCard(colors) {
        // Main dialog card
        this._dialogCard = new St.BoxLayout({
            vertical: true,
            reactive: true,
            style: `
                background-color: ${colors.containerBg};
                border-radius: 16px;
                padding: 24px;
                min-width: 420px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            `
        });

        // Stop clicks from propagating through dialog
        this._dialogCard.connect('button-press-event', () => Clutter.EVENT_STOP);

        // Title
        const title = this._isNewLayout ? 'New Layout' : `Edit Layout: ${this._layout.name}`;
        const titleLabel = new St.Label({
            text: title,
            style: `
                font-weight: bold; 
                font-size: 14pt; 
                margin-bottom: 20px; 
                color: ${colors.textPrimary};
            `
        });
        this._dialogCard.add_child(titleLabel);

        // ============================================
        // SECTION 1: Layout Information
        // ============================================
        const infoSection = this._createSection(colors, 'Layout Information');

        // Name input row
        const nameBox = new St.BoxLayout({
            vertical: false,
            style: 'margin-bottom: 12px;'
        });

        const nameLabel = new St.Label({
            text: 'Name:',
            style: `
                font-size: 11pt; 
                padding-top: 8px; 
                color: ${colors.textPrimary}; 
                min-width: 70px;
            `,
            y_align: Clutter.ActorAlign.CENTER
        });
        nameBox.add_child(nameLabel);

        this._nameEntry = this._createStyledInput(colors, {
            text: this._layout.name || '',
            hintText: 'Layout name (required)',
            minWidth: '280px'
        });
        this._nameEntry.clutter_text.connect('text-changed', () => {
            this._updateSaveButton();
        });
        nameBox.add_child(this._nameEntry);

        infoSection.add_child(nameBox);

        // Zone status row
        const statusBox = new St.BoxLayout({
            vertical: false
        });

        const statusLabelPrefix = new St.Label({
            text: 'Zones:',
            style: `font-size: 11pt; color: ${colors.textPrimary}; min-width: 70px;`
        });
        statusBox.add_child(statusLabelPrefix);

        this._layoutStatusLabel = new St.Label({
            text: this._getLayoutStatus(),
            style: `font-size: 11pt; color: ${colors.textMuted};`
        });
        statusBox.add_child(this._layoutStatusLabel);

        infoSection.add_child(statusBox);
        this._dialogCard.add_child(infoSection);

        // ============================================
        // SECTION 2: Layout Editor
        // ============================================
        const editorSection = this._createSection(colors, 'Zone Editor');

        const editorDescription = new St.Label({
            text: 'Define the zones for your layout using the visual editor.',
            style: `
                font-size: 10pt; 
                color: ${colors.textSecondary}; 
                margin-bottom: 12px; 
                line-height: 1.4;
            `
        });
        editorDescription.clutter_text.line_wrap = true;
        editorSection.add_child(editorDescription);

        // "Edit Layout..." button
        const editButton = this._createButton(colors, 'Edit Layout...', () => {
            this._openZoneEditor();
        });
        editorSection.add_child(editButton);

        this._dialogCard.add_child(editorSection);

        // ============================================
        // SECTION 3: Settings
        // ============================================
        const settingsSection = this._createSection(colors, 'Settings');

        // Padding field
        const paddingBox = new St.BoxLayout({
            vertical: false,
            style: 'margin-bottom: 12px;'
        });

        const paddingLabel = new St.Label({
            text: 'Padding:',
            style: `
                font-size: 11pt; 
                padding-top: 8px; 
                color: ${colors.textPrimary}; 
                min-width: 70px;
            `,
            y_align: Clutter.ActorAlign.CENTER
        });
        paddingBox.add_child(paddingLabel);

        this._paddingEntry = this._createStyledInput(colors, {
            text: String(this._layout.padding || 8),
            minWidth: '80px'
        });
        paddingBox.add_child(this._paddingEntry);

        const paddingUnit = new St.Label({
            text: 'pixels',
            style: `
                font-size: 11pt; 
                color: ${colors.textMuted}; 
                padding-top: 8px;
                margin-left: 8px;
            `,
            y_align: Clutter.ActorAlign.CENTER
        });
        paddingBox.add_child(paddingUnit);

        settingsSection.add_child(paddingBox);

        // Divider
        const divider = new St.Widget({
            style: `
                height: 1px;
                background-color: ${colors.divider};
                margin: 8px 0;
            `
        });
        settingsSection.add_child(divider);

        // Keyboard shortcut field
        const shortcutBox = new St.BoxLayout({
            vertical: false
        });

        const shortcutLabel = new St.Label({
            text: 'Shortcut:',
            style: `
                font-size: 11pt; 
                padding-top: 6px; 
                color: ${colors.textPrimary}; 
                min-width: 70px;
            `,
            y_align: Clutter.ActorAlign.CENTER
        });
        shortcutBox.add_child(shortcutLabel);

        this._shortcutButton = this._createButton(colors, 
            this._layout.shortcut || 'Click to record',
            () => this._recordShortcut(),
            { padding: '6px 16px' }
        );
        shortcutBox.add_child(this._shortcutButton);

        const shortcutHint = new St.Label({
            text: '(Not yet implemented)',
            style: `
                font-size: 9pt; 
                color: ${colors.textMuted}; 
                padding-top: 8px;
                margin-left: 8px;
            `,
            y_align: Clutter.ActorAlign.CENTER
        });
        shortcutBox.add_child(shortcutHint);

        settingsSection.add_child(shortcutBox);
        this._dialogCard.add_child(settingsSection);

        // ============================================
        // Button Row
        // ============================================
        const buttonRow = new St.BoxLayout({
            vertical: false,
            style: 'margin-top: 20px;',
            x_align: Clutter.ActorAlign.END
        });

        // Delete button (for existing layouts)
        if (!this._isNewLayout) {
            const deleteButton = this._createButton(colors, 'Delete', () => {
                this._onDelete();
            });
            deleteButton.style += 'margin-right: auto;';  // Push to left
            buttonRow.add_child(deleteButton);
        }

        // Spacer
        const spacer = new St.Widget({ x_expand: true });
        buttonRow.add_child(spacer);

        // Cancel button
        const cancelButton = this._createButton(colors, 'Cancel', () => {
            this._onCancel();
        });
        cancelButton.style += 'margin-right: 12px;';
        buttonRow.add_child(cancelButton);

        // Save button
        this._saveButton = this._createButton(colors, 'Save', () => {
            this._onSave();
        }, { accent: true });
        buttonRow.add_child(this._saveButton);

        this._dialogCard.add_child(buttonRow);

        // Initial save button state
        this._updateSaveButton();
    }

    /**
     * Create a section card container
     * @param {Object} colors - Theme colors
     * @param {string} title - Optional section title
     * @returns {St.BoxLayout} Section container
     * @private
     */
    _createSection(colors, title = null) {
        const section = new St.BoxLayout({
            vertical: true,
            style: `
                background-color: ${colors.sectionBg};
                border: 1px solid ${colors.sectionBorder};
                border-radius: 12px;
                padding: 16px;
                margin-bottom: 12px;
            `
        });

        if (title) {
            const titleLabel = new St.Label({
                text: title,
                style: `
                    font-size: 9pt;
                    font-weight: 600;
                    color: ${colors.textMuted};
                    margin-bottom: 12px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                `
            });
            section.add_child(titleLabel);
        }

        return section;
    }

    /**
     * Create a styled input field with inset appearance
     * @param {Object} colors - Theme colors
     * @param {Object} options - Input options
     * @returns {St.Entry} Styled entry widget
     * @private
     */
    _createStyledInput(colors, options = {}) {
        const entry = new St.Entry({
            text: options.text || '',
            hint_text: options.hintText || '',
            can_focus: true,
            style: `
                min-width: ${options.minWidth || '200px'};
                background-color: ${colors.inputBg};
                color: ${colors.textPrimary};
                border: 1px solid ${colors.inputBorder};
                border-radius: 6px;
                padding: 8px 12px;
            `
        });
        return entry;
    }

    /**
     * Create a styled button with hover effects
     * @param {Object} colors - Theme colors
     * @param {string} label - Button label
     * @param {Function} onClick - Click handler
     * @param {Object} options - Optional styling options
     * @returns {St.Button}
     * @private
     */
    _createButton(colors, label, onClick, options = {}) {
        const padding = options.padding || '10px 24px';
        const isAccent = options.accent || false;

        const normalBg = isAccent ? colors.accentHex : colors.buttonBg;
        const hoverBg = isAccent ? colors.accentHexHover : colors.buttonBgHover;
        const textColor = isAccent ? 'white' : colors.buttonText;

        const normalStyle = `
            padding: ${padding}; 
            background-color: ${normalBg}; 
            color: ${textColor}; 
            border-radius: 6px;
            border: 1px solid ${colors.sectionBorder};
        `;
        const hoverStyle = `
            padding: ${padding}; 
            background-color: ${hoverBg}; 
            color: ${textColor}; 
            border-radius: 6px;
            border: 1px solid ${colors.sectionBorder};
        `;

        const button = new St.Button({
            label: label,
            style_class: 'button',
            style: normalStyle,
            can_focus: true
        });

        button.connect('clicked', onClick);
        
        button.connect('enter-event', () => {
            button.style = hoverStyle;
            return Clutter.EVENT_PROPAGATE;
        });
        button.connect('leave-event', () => {
            button.style = normalStyle;
            return Clutter.EVENT_PROPAGATE;
        });

        // Store styles for updating later
        button._normalStyle = normalStyle;
        button._hoverStyle = hoverStyle;

        return button;
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
        const name = this._nameEntry?.get_text().trim();
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
        if (!this._saveButton) return;
        
        const canSave = this._validateForSave();
        this._saveButton.reactive = canSave;
        this._saveButton.opacity = canSave ? 255 : 128;
        
        logger.debug(`Validation: ${canSave ? 'can save' : 'cannot save'}`);
    }

    /**
     * Open ZoneEditor to edit geometry
     * @private
     */
    _openZoneEditor() {
        logger.info('Opening ZoneEditor from LayoutSettingsDialog');
        
        // Capture current state before closing
        const currentName = this._nameEntry.get_text();
        const currentPadding = this._paddingEntry.get_text();
        const layoutData = JSON.parse(JSON.stringify(this._layout));
        
        // Store callbacks before closing
        const savedOnSave = this._onSaveCallback;
        const savedOnCancel = this._onCancelCallback;
        const layoutManager = this._layoutManager;
        const settings = this._settings;
        
        this.close();

        const layoutForEditor = (layoutData.zones.length > 0) ? layoutData : null;

        // Create one-shot callbacks to prevent multiple invocations
        let saveCallbackExecuted = false;
        let cancelCallbackExecuted = false;
        
        const editor = new ZoneEditor(
            layoutForEditor,
            layoutManager,
            settings,
            (editedLayout) => {
                // CRITICAL: Set flag FIRST to prevent race condition
                if (saveCallbackExecuted) {
                    logger.warn('Save callback already executed, ignoring duplicate call');
                    return;
                }
                saveCallbackExecuted = true;
                
                logger.info(`ZoneEditor returned with ${editedLayout.zones.length} zones`);
                
                // Update layout data with new zones
                layoutData.zones = editedLayout.zones;
                layoutData.name = currentName;
                layoutData.padding = parseInt(currentPadding) || 8;
                
                // Create NEW dialog instance instead of reopening old one
                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    const newDialog = new LayoutSettingsDialog(
                        layoutData,
                        layoutManager,
                        settings,
                        savedOnSave,
                        savedOnCancel
                    );
                    newDialog.open();
                    return GLib.SOURCE_REMOVE;
                });
            },
            () => {
                // CRITICAL: Set flag FIRST to prevent race condition
                if (cancelCallbackExecuted) {
                    logger.warn('Cancel callback already executed, ignoring duplicate call');
                    return;
                }
                cancelCallbackExecuted = true;
                
                logger.info('ZoneEditor canceled, reopening settings dialog');
                
                // Create NEW dialog instance instead of reopening old one
                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    const newDialog = new LayoutSettingsDialog(
                        layoutData,
                        layoutManager,
                        settings,
                        savedOnSave,
                        savedOnCancel
                    );
                    newDialog.open();
                    return GLib.SOURCE_REMOVE;
                });
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
            {
                settings: this._settings  // Pass settings for theme support
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
        const padding = parseInt(this._paddingEntry.get_text()) || 8;

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
        // Prevent multiple invocations
        if (this._closing || !this._visible) {
            return;
        }
        
        logger.info('LayoutSettingsDialog canceled');
        
        // Save callback before closing (since close clears state)
        const callback = this._onCancelCallback;
        
        this.close();

        if (callback) {
            callback();
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
}
