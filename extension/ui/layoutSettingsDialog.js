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
import GLib from 'gi://GLib';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
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
 */
export const LayoutSettingsDialog = GObject.registerClass(
class LayoutSettingsDialog extends ModalDialog.ModalDialog {
    _init(layout, layoutManager, settings, onSave, onCancel) {
        super._init({ styleClass: 'layout-settings-dialog' });

        this._isNewLayout = (layout === null);
        this._isReopening = false;  // Flag to prevent re-entrance
        
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
        
        // UI elements (will be created in _buildUI)
        this._nameEntry = null;
        this._layoutStatusLabel = null;
        this._paddingEntry = null;
        this._shortcutButton = null;
        this._saveButton = null;

        this._buildUI();

        logger.debug(`LayoutSettingsDialog created (${this._isNewLayout ? 'CREATE' : 'EDIT'} mode)`);
    }

    /**
     * Apply CSS custom properties to dialog for stylesheet theming
     * Uses dialogLayout which is the actual container element
     * @private
     */
    _applyCSSVariables() {
        const colors = this._themeManager.getColors();
        
        // Use dialogLayout instead of _dialog (which doesn't exist in GNOME's ModalDialog)
        if (this.dialogLayout) {
            const style = this.dialogLayout.get_style();
            this.dialogLayout.set_style(
                (style || '') +
                `--zoned-container-bg: ${colors.containerBg}; ` +
                `--zoned-card-bg: ${colors.cardBg}; ` +
                `--zoned-text-primary: ${colors.textPrimary}; ` +
                `--zoned-text-secondary: ${colors.textSecondary}; ` +
                `--zoned-text-muted: ${colors.textMuted}; ` +
                `--zoned-accent: ${colors.accentHex}; ` +
                `--zoned-button-bg: ${colors.buttonBg}; ` +
                `--zoned-button-text: ${colors.buttonText}; ` +
                `--zoned-button-bg-hover: ${colors.buttonBgHover}; ` +
                `--zoned-accent-hover: ${colors.accentHexHover}; ` +
                `--zoned-border: ${colors.border};`
            );
            
            // Apply theme class
            const themeClass = colors.isDark ? 'zoned-theme-dark' : 'zoned-theme-light';
            this.dialogLayout.add_style_class_name(themeClass);
            
            logger.debug(`Applied CSS variables and theme class: ${themeClass} to dialogLayout`);
        } else {
            logger.error('ModalDialog.dialogLayout not available');
        }
    }
    
    /**
     * Override open() to apply CSS variables when dialog is shown
     * @override
     */
    open() {
        super.open();
        // Apply CSS variables to dialogLayout
        this._applyCSSVariables();
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
                box-shadow: ${colors.inputShadowInset};
            `
        });
        return entry;
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
                box-shadow: ${colors.sectionShadow};
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
     * Build the dialog UI
     * @private
     */
    _buildUI() {
        const colors = this._themeManager.getColors();
        
        // Apply CSS custom properties to dialog root for stylesheet
        // These variables are used by stylesheet.css to theme ModalDialog internals
        this._applyCSSVariables();

        
        // Title
        const title = this._isNewLayout ? 'New Layout' : `Edit Layout: ${this._layout.name}`;
        const titleLabel = new St.Label({
            text: title,
            style: `font-weight: bold; font-size: 14pt; margin-bottom: 16px; color: ${colors.textPrimary};`
        });
        this.contentLayout.add_child(titleLabel);

        // ============================================
        // SECTION 1: Layout Information
        // ============================================
        const infoSection = this._createSection(colors, 'Layout Information');

        // Name input row
        const nameBox = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 12px; margin-bottom: 12px;'
        });

        const nameLabel = new St.Label({
            text: 'Name:',
            style: `font-size: 11pt; padding-top: 8px; color: ${colors.textPrimary}; min-width: 70px;`,
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
            vertical: false,
            style: 'spacing: 12px;'
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
        this.contentLayout.add_child(infoSection);

        // ============================================
        // SECTION 2: Layout Editor
        // ============================================
        const editorSection = this._createSection(colors, 'Zone Editor');

        const editorDescription = new St.Label({
            text: 'Define the zones for your layout using the visual editor.',
            style: `font-size: 10pt; color: ${colors.textSecondary}; margin-bottom: 12px; line-height: 1.4;`
        });
        editorDescription.clutter_text.line_wrap = true;
        editorSection.add_child(editorDescription);

        // "Edit Layout..." button (neutral style - accent only on focus)
        const editButtonNormalStyle = `
            padding: 10px 24px; 
            background-color: ${colors.buttonBg}; 
            color: ${colors.buttonText}; 
            border-radius: 6px;
            border: 1px solid ${colors.sectionBorder};
        `;
        const editButtonHoverStyle = `
            padding: 10px 24px; 
            background-color: ${colors.buttonBgHover}; 
            color: ${colors.buttonText}; 
            border-radius: 6px;
            border: 1px solid ${colors.sectionBorder};
        `;
        const editButton = new St.Button({
            label: 'Edit Layout...',
            style_class: 'button',
            style: editButtonNormalStyle,
            can_focus: true
        });
        editButton.connect('clicked', () => this._openZoneEditor());
        this._addButtonHover(editButton, editButtonNormalStyle, editButtonHoverStyle);
        editorSection.add_child(editButton);

        this.contentLayout.add_child(editorSection);

        // ============================================
        // SECTION 3: Settings
        // ============================================
        const settingsSection = this._createSection(colors, 'Settings');

        // Padding field
        const paddingBox = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 12px; margin-bottom: 12px;'
        });

        const paddingLabel = new St.Label({
            text: 'Padding:',
            style: `font-size: 11pt; padding-top: 8px; color: ${colors.textPrimary}; min-width: 70px;`,
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
            style: `font-size: 11pt; color: ${colors.textMuted}; padding-top: 8px;`,
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
            vertical: false,
            style: 'spacing: 12px;'
        });

        const shortcutLabel = new St.Label({
            text: 'Shortcut:',
            style: `font-size: 11pt; padding-top: 6px; color: ${colors.textPrimary}; min-width: 70px;`,
            y_align: Clutter.ActorAlign.CENTER
        });
        shortcutBox.add_child(shortcutLabel);

        const shortcutNormalStyle = `
            padding: 6px 16px; 
            background-color: ${colors.inputBg}; 
            color: ${colors.buttonText}; 
            border-radius: 6px;
            border: 1px solid ${colors.inputBorder};
        `;
        const shortcutHoverStyle = `
            padding: 6px 16px; 
            background-color: ${colors.buttonBgHover}; 
            color: ${colors.buttonText}; 
            border-radius: 6px;
            border: 1px solid ${colors.inputBorder};
        `;
        this._shortcutButton = new St.Button({
            label: this._layout.shortcut || 'Click to record',
            style_class: 'button',
            style: shortcutNormalStyle
        });
        this._shortcutButton.connect('clicked', () => this._recordShortcut());
        this._addButtonHover(this._shortcutButton, shortcutNormalStyle, shortcutHoverStyle);
        shortcutBox.add_child(this._shortcutButton);

        const shortcutHint = new St.Label({
            text: '(Not yet implemented)',
            style: `font-size: 9pt; color: ${colors.textMuted}; padding-top: 8px;`,
            y_align: Clutter.ActorAlign.CENTER
        });
        shortcutBox.add_child(shortcutHint);

        settingsSection.add_child(shortcutBox);
        this.contentLayout.add_child(settingsSection);

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
        
        // Apply theme to button layout and individual buttons (must happen after setButtons)
        // NOTE: ModalDialog uses 'buttonLayout' (no underscore), not '_buttonLayout'
        if (this.buttonLayout) {
            this.buttonLayout.style = `background-color: ${colors.containerBg}; padding: 16px; padding-top: 0;`;
            
            // Style individual buttons with hover states
            const buttonActors = this.buttonLayout.get_children();
            logger.debug(`Found ${buttonActors.length} buttons, isDark: ${colors.isDark}`);
            buttonActors.forEach((button, index) => {
                // Delete button gets same neutral styling as other buttons
                if (index === 0 && !this._isNewLayout) {
                    const normalStyle = `background-color: ${colors.buttonBg}; color: ${colors.buttonText}; padding: 8px 24px; border-radius: 6px;`;
                    const hoverStyle = `background-color: ${colors.buttonBgHover}; color: ${colors.buttonText}; padding: 8px 24px; border-radius: 6px;`;
                    button.style = normalStyle;
                    this._addButtonHover(button, normalStyle, hoverStyle);
                }
                // Save button gets neutral styling (same as Cancel - accent only on focus)
                else if (index === buttonActors.length - 1) {
                    const normalStyle = `background-color: ${colors.buttonBg}; color: ${colors.buttonText}; padding: 8px 24px; border-radius: 6px;`;
                    const hoverStyle = `background-color: ${colors.buttonBgHover}; color: ${colors.buttonText}; padding: 8px 24px; border-radius: 6px;`;
                    button.style = normalStyle;
                    this._saveButton = button;
                    this._addButtonHover(button, normalStyle, hoverStyle);
                }
                // Cancel button gets neutral styling
                else {
                    const normalStyle = `background-color: ${colors.buttonBg}; color: ${colors.buttonText}; padding: 8px 24px; border-radius: 6px;`;
                    const hoverStyle = `background-color: ${colors.buttonBgHover}; color: ${colors.buttonText}; padding: 8px 24px; border-radius: 6px;`;
                    button.style = normalStyle;
                    this._addButtonHover(button, normalStyle, hoverStyle);
                }
            });
        } else {
            logger.error('buttonLayout not found - buttons not styled');
        }

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
        
        // Capture current state before closing
        const currentName = this._nameEntry.get_text();
        const currentPadding = this._paddingEntry.get_text();
        const layoutData = JSON.parse(JSON.stringify(this._layout));
        
        this.close();

        const layoutForEditor = (layoutData.zones.length > 0) ? layoutData : null;

        // Create one-shot callbacks to prevent multiple invocations
        let saveCallbackExecuted = false;
        let cancelCallbackExecuted = false;
        
        const editor = new ZoneEditor(
            layoutForEditor,
            this._layoutManager,
            this._settings,
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
                        this._layoutManager,
                        this._settings,
                        this._onSaveCallback,
                        this._onCancelCallback
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
                        this._layoutManager,
                        this._settings,
                        this._onSaveCallback,
                        this._onCancelCallback
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
        logger.info('LayoutSettingsDialog canceled');
        
        this.close();

        if (this._onCancelCallback) {
            this._onCancelCallback();
        }
    }

    /**
     * Add hover effect to a button using enter/leave events
     * @param {St.Button} button - Button to add hover effect to
     * @param {string} normalStyle - Style when not hovered
     * @param {string} hoverStyle - Style when hovered
     * @private
     */
    _addButtonHover(button, normalStyle, hoverStyle) {
        button.connect('enter-event', () => {
            button.style = hoverStyle;
            return Clutter.EVENT_PROPAGATE;
        });
        button.connect('leave-event', () => {
            button.style = normalStyle;
            return Clutter.EVENT_PROPAGATE;
        });
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
