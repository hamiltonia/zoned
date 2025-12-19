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
 * Template vs Custom Layout Behavior:
 * - Templates (id starts with 'template-'): View-only (all controls disabled), Duplicate only
 * - Custom layouts: Full editing capability with Save, Delete, Duplicate
 *
 * FancyZones-Style UI Design:
 * - Header: "Edit layout" title with action icons (Duplicate, Delete)
 * - Layout Preview: Visual zone preview centered below header with floating edit button
 * - Floating Edit Button: Circular button centered over preview, opens zone editor
 * - Settings Section:
 *   - Name field (disabled for templates)
 *   - Show Space Around Zones: Checkbox + number input (padding)
 *   - Select a Key (1-9): Dropdown for quick-access shortcut
 * - Button Row: Cancel (always), Save (custom layouts only)
 *
 * Duplicate Behavior:
 * - Creates in-place transformation (dialog stays open)
 * - Name changes to "{Name} Copy"
 * - UI updates to custom layout mode
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {createLogger} from '../utils/debug.js';
import {ThemeManager} from '../utils/theme.js';
import {ZoneEditor} from './zoneEditor.js';
import {TemplateManager} from '../templateManager.js';

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
    constructor(layout, layoutManager, settings, onSave, onCancel, onZoneEditorOpen = null, onZoneEditorClose = null) {
        this._isNewLayout = (layout === null);

        // Create working copy to avoid mutating input
        this._layout = layout ? JSON.parse(JSON.stringify(layout)) : {
            zones: [],
            padding: 0,  // Default: padding off (use 4 when enabled)
            name: this._generateDefaultName(),  // Always start with a default name
        };

        // Ensure existing layouts have a name
        if (!this._layout.name) {
            this._layout.name = this._generateDefaultName();
        }

        // Detect if this is a template (immutable built-in layout)
        // Check both: ID prefix AND if it matches a built-in template ID
        this._isTemplate = this._detectIsTemplate(this._layout);

        this._layoutManager = layoutManager;
        this._settings = settings;
        this._themeManager = new ThemeManager(settings);
        this._onSaveCallback = onSave;
        this._onCancelCallback = onCancel;
        this._onZoneEditorOpenCallback = onZoneEditorOpen;
        this._onZoneEditorCloseCallback = onZoneEditorClose;

        // UI elements
        this._container = null;
        this._dialogCard = null;
        this._nameEntry = null;
        this._paddingCheckbox = null;
        this._paddingEntry = null;
        this._shortcutDropdown = null;
        this._saveButton = null;
        this._deleteButton = null;
        this._duplicateButton = null;
        this._previewContainer = null;

        this._modal = null;
        this._visible = false;
        this._closing = false;  // Re-entrance guard

        // Signal tracking for cleanup
        this._signalIds = [];

        // Bind methods to avoid closure leaks
        this._boundHandleContainerClick = this._handleContainerClick.bind(this);
        this._boundHandleKeyPress = this._handleKeyPress.bind(this);
        this._boundHandleDialogCardClick = () => Clutter.EVENT_STOP;
        this._boundUpdateSaveButton = this._updateSaveButton.bind(this);
        this._boundTogglePaddingCheckbox = this._onTogglePaddingCheckbox.bind(this);
        this._boundHandleDeleteCancelClick = this._hideDeleteConfirmation.bind(this);
        this._boundHandleDeleteConfirmClick = this._onDeleteConfirmClick.bind(this);
        this._boundHandleDeleteWrapperClick = this._handleDeleteWrapperClick.bind(this);

        logger.debug(`LayoutSettingsDialog created (${this._isNewLayout ? 'CREATE' : 'EDIT'} mode, template: ${this._isTemplate})`);
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
            style: 'background-color: transparent;',
        });

        // Click on container (outside dialog) dismisses - use bound method
        this._signalIds.push(
            this._container.connect('button-press-event', this._boundHandleContainerClick),
        );

        // Build the dialog card
        this._buildDialogCard(colors);

        // Center the dialog card
        const cardWidth = 420;
        const cardHeight = this._dialogCard.get_preferred_height(cardWidth)[1] || 500;
        this._dialogCard.set_position(
            Math.floor((monitor.width - cardWidth) / 2),
            Math.floor((monitor.height - cardHeight) / 2),
        );

        this._container.add_child(this._dialogCard);
        Main.uiGroup.add_child(this._container);

        // Push modal to capture input
        this._modal = Main.pushModal(this._container, {
            actionMode: 1,  // Shell.ActionMode.NORMAL
        });

        // Connect key handler for ESC - use bound method
        this._keyPressId = this._container.connect('key-press-event', this._boundHandleKeyPress);

        this._visible = true;

        // Re-center and focus after layout is complete
        // get_preferred_height may return incorrect value before widget is laid out
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            // Re-center the dialog now that layout is complete
            if (this._dialogCard && this._container) {
                const actualHeight = this._dialogCard.get_height();
                const actualWidth = this._dialogCard.get_width();
                this._dialogCard.set_position(
                    Math.floor((monitor.width - actualWidth) / 2),
                    Math.floor((monitor.height - actualHeight) / 2),
                );
            }

            // Focus the name entry
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

        // Clean up ThemeManager
        if (this._themeManager) {
            this._themeManager.destroy();
            this._themeManager = null;
        }

        logger.debug('LayoutSettingsDialog closed');
    }

    /**
     * Build header row with title and action icons
     * @param {Object} colors - Theme colors
     * @returns {St.BoxLayout} Header row widget
     * @private
     */
    _buildHeaderRow(colors) {
        const headerRow = new St.BoxLayout({
            vertical: false,
            style: 'margin-bottom: 16px;',
        });

        const titleLabel = new St.Label({
            text: 'Edit layout',
            style: `font-weight: bold; font-size: 14pt; color: ${colors.textPrimary};`,
            x_expand: true,
        });
        headerRow.add_child(titleLabel);

        const iconsBox = new St.BoxLayout({vertical: false, style: 'spacing: 8px;'});

        this._duplicateButton = this._createSymbolicIconButton(
            colors, 'edit-copy-symbolic', 'Duplicate layout', () => this._onDuplicate(),
        );
        iconsBox.add_child(this._duplicateButton);

        if (!this._isTemplate && !this._isNewLayout) {
            this._deleteButton = this._createSymbolicIconButton(
                colors, 'user-trash-symbolic', 'Delete layout', () => this._onDelete(),
            );
            iconsBox.add_child(this._deleteButton);
        }

        headerRow.add_child(iconsBox);
        return headerRow;
    }

    /**
     * Build settings section with name, padding, and shortcut fields
     * @param {Object} colors - Theme colors
     * @returns {St.BoxLayout} Settings section widget
     * @private
     */
    _buildSettingsSection(colors) {
        const settingsSection = new St.BoxLayout({
            vertical: true,
            style: `background-color: ${colors.sectionBg}; border: 1px solid ${colors.sectionBorder}; ` +
                   'border-radius: 12px; padding: 16px; margin-bottom: 16px;',
        });

        // Name row
        settingsSection.add_child(this._buildNameRow(colors));
        settingsSection.add_child(this._createDivider(colors));

        // Padding row
        settingsSection.add_child(this._buildPaddingRow(colors));
        settingsSection.add_child(this._createDivider(colors));

        // Shortcut row
        settingsSection.add_child(this._buildShortcutRow(colors));

        return settingsSection;
    }

    /**
     * Build name field row
     * @param {Object} colors - Theme colors
     * @returns {St.BoxLayout} Name row widget
     * @private
     */
    _buildNameRow(colors) {
        const nameRow = new St.BoxLayout({vertical: false, style: 'margin-bottom: 16px;'});

        const nameLabel = new St.Label({
            text: 'Name',
            style: `font-size: 11pt; color: ${colors.textPrimary}; min-width: 160px;`,
            y_align: Clutter.ActorAlign.CENTER,
        });
        nameRow.add_child(nameLabel);

        this._nameEntry = this._createStyledInput(colors, {
            text: this._layout.name || '',
            hintText: this._isTemplate ? '' : 'Enter layout name',
            minWidth: '200px',
            disabled: this._isTemplate,
        });

        if (!this._isTemplate) {
            this._signalIds.push(
                this._nameEntry.clutter_text.connect('text-changed', this._boundUpdateSaveButton),
            );
        }
        nameRow.add_child(this._nameEntry);
        return nameRow;
    }

    /**
     * Build padding checkbox and spinner row
     * @param {Object} colors - Theme colors
     * @returns {St.BoxLayout} Padding row widget
     * @private
     */
    _buildPaddingRow(colors) {
        const paddingRow = new St.BoxLayout({vertical: false, style: 'margin-bottom: 16px;'});

        const paddingLabelBox = new St.BoxLayout({
            vertical: false, x_expand: true, y_align: Clutter.ActorAlign.CENTER,
        });

        const isChecked = Boolean(this._layout.padding && this._layout.padding > 0);
        this._paddingCheckbox = this._createCheckbox(colors, isChecked);

        // Only allow interaction for custom layouts (not templates)
        if (!this._isTemplate) {
            this._signalIds.push(
                this._paddingCheckbox.connect('clicked', this._boundTogglePaddingCheckbox),
            );
        } else {
            // Disable checkbox for templates (no save button to persist changes)
            this._paddingCheckbox.reactive = false;
            this._paddingCheckbox.opacity = 128;
        }
        paddingLabelBox.add_child(this._paddingCheckbox);

        const paddingLabel = new St.Label({
            text: 'Show space around zones',
            style: `font-size: 11pt; color: ${colors.textPrimary}; margin-left: 8px;`,
            y_align: Clutter.ActorAlign.CENTER,
        });
        paddingLabelBox.add_child(paddingLabel);
        paddingRow.add_child(paddingLabelBox);

        this._paddingSpinner = this._createSpinnerInput(colors, {
            value: this._layout.padding || 4, min: 0, max: 16, step: 1,
        });

        if (this._isTemplate) {
            // Templates: spinner always disabled (no save button to persist changes)
            this._paddingSpinner.reactive = false;
            this._paddingSpinner.opacity = 128;
        } else {
            // Custom layouts: spinner enabled based on checkbox state
            this._paddingSpinner.reactive = isChecked;
            this._paddingSpinner.opacity = isChecked ? 255 : 128;
        }
        paddingRow.add_child(this._paddingSpinner);

        return paddingRow;
    }

    /**
     * Build shortcut dropdown row
     * @param {Object} colors - Theme colors
     * @returns {St.BoxLayout} Shortcut row widget
     * @private
     */
    _buildShortcutRow(colors) {
        const shortcutRow = new St.BoxLayout({vertical: false});

        const shortcutLabelBox = new St.BoxLayout({
            vertical: false, x_expand: true, y_align: Clutter.ActorAlign.CENTER,
        });

        const shortcutLabel = new St.Label({
            text: 'Quick access shortcut',
            style: `font-size: 11pt; color: ${colors.textPrimary};`,
            y_align: Clutter.ActorAlign.CENTER,
        });
        shortcutLabelBox.add_child(shortcutLabel);
        shortcutRow.add_child(shortcutLabelBox);

        this._shortcutDropdown = this._createDropdown(
            colors,
            ['None', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
            this._layout.shortcut || 'None',
        );

        // Disable dropdown for templates (no save button to persist changes)
        if (this._isTemplate) {
            this._shortcutDropdown.reactive = false;
            this._shortcutDropdown.opacity = 128;
        }

        shortcutRow.add_child(this._shortcutDropdown);

        return shortcutRow;
    }

    /**
     * Build button row with Cancel and Save buttons
     * @param {Object} colors - Theme colors
     * @returns {St.BoxLayout} Button row widget
     * @private
     */
    _buildButtonRow(colors) {
        const buttonRow = new St.BoxLayout({
            vertical: false, style: 'margin-top: 8px;', x_align: Clutter.ActorAlign.END,
        });

        buttonRow.add_child(new St.Widget({x_expand: true}));

        const buttonsContainer = new St.BoxLayout({vertical: false, style: 'spacing: 12px;'});

        buttonsContainer.add_child(this._createButton(colors, 'Cancel', () => this._onCancel()));

        if (!this._isTemplate) {
            this._saveButton = this._createButton(colors, 'Save', () => this._onSave(), {accent: true});
            buttonsContainer.add_child(this._saveButton);
        }

        buttonRow.add_child(buttonsContainer);
        return buttonRow;
    }

    /**
     * Build the dialog card UI - FancyZones style
     * @param {Object} colors - Theme colors
     * @private
     */
    _buildDialogCard(colors) {
        this._dialogCard = new St.BoxLayout({
            vertical: true,
            reactive: true,
            style: `background-color: ${colors.containerBg}; border-radius: 16px; ` +
                   'padding: 24px; min-width: 420px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);',
        });

        this._signalIds.push(
            this._dialogCard.connect('button-press-event', this._boundHandleDialogCardClick),
        );

        // Header
        this._dialogCard.add_child(this._buildHeaderRow(colors));

        // Layout Preview with floating edit button
        this._previewContainer = new St.BoxLayout({
            vertical: true,
            style: `background-color: ${colors.sectionBg}; border: 1px solid ${colors.sectionBorder}; ` +
                   'border-radius: 12px; padding: 16px; margin-bottom: 16px;',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._buildLayoutPreview(colors);
        this._dialogCard.add_child(this._previewContainer);

        // Settings Section (no hyperlink - floating button is on preview)
        this._dialogCard.add_child(this._buildSettingsSection(colors));

        // Button Row
        this._dialogCard.add_child(this._buildButtonRow(colors));

        this._updateSaveButton();
    }

    /**
     * Build the layout preview visualization with floating edit button centered
     * @param {Object} colors - Theme colors
     * @private
     */
    _buildLayoutPreview(colors) {
        // Clear existing preview
        this._previewContainer.destroy_all_children();

        const previewWidth = 280;
        const previewHeight = 160;

        // Wrapper with FixedLayout for floating button overlay
        const previewWrapper = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            width: previewWidth,
            height: previewHeight,
        });

        const previewArea = new St.Widget({
            width: previewWidth,
            height: previewHeight,
            style: `
                background-color: ${colors.canvasBg};
                border-radius: 8px;
            `,
        });

        // Draw zones
        const zones = this._layout.zones || [];
        zones.forEach((zone) => {
            const zoneWidget = new St.Widget({
                x: Math.floor(zone.x * previewWidth),
                y: Math.floor(zone.y * previewHeight),
                width: Math.floor(zone.w * previewWidth) - 2,
                height: Math.floor(zone.h * previewHeight) - 2,
                style: `
                    background-color: ${colors.zoneFill};
                    border: 2px solid ${colors.zoneBorder};
                    border-radius: 4px;
                `,
            });
            previewArea.add_child(zoneWidget);
        });

        // Show empty state if no zones
        if (zones.length === 0) {
            const emptyLabel = new St.Label({
                text: 'No zones defined',
                style: `
                    font-size: 10pt;
                    color: ${colors.textMuted};
                `,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
                y_expand: true,
            });
            previewArea.add_child(emptyLabel);
        }

        previewWrapper.add_child(previewArea);

        // Floating circular edit button - centered over preview
        // Only show for custom layouts (templates cannot have zones modified)
        if (!this._isTemplate) {
            const editButton = this._createFloatingEditButton(colors);
            const buttonSize = editButton._buttonSize;
            // Center the button
            const buttonX = Math.floor((previewWidth - buttonSize) / 2);
            const buttonY = Math.floor((previewHeight - buttonSize) / 2);
            editButton.set_position(buttonX, buttonY);
            previewWrapper.add_child(editButton);
        }

        this._previewContainer.add_child(previewWrapper);
    }

    /**
     * Create a floating circular edit button for the layout preview
     * Centered over the preview, opens zone editor on click
     * @param {Object} colors - Theme colors
     * @returns {St.Button} The circular edit button
     * @private
     */
    _createFloatingEditButton(colors) {
        // Fixed size for dialog preview (larger than card buttons)
        const buttonSize = 42;
        const iconSize = 20;

        // Idle state: subtle, semi-transparent
        const idleStyle = `
            width: ${buttonSize}px;
            height: ${buttonSize}px;
            border-radius: ${buttonSize / 2}px;
            background-color: rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.3);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
        `;

        // Hover state: accent background, more prominent
        const hoverStyle = `
            width: ${buttonSize}px;
            height: ${buttonSize}px;
            border-radius: ${buttonSize / 2}px;
            background-color: ${colors.accentHex};
            border: 1px solid ${colors.accentHex};
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        `;

        const button = new St.Button({
            style_class: 'floating-edit-button',
            style: idleStyle,
            reactive: true,
            track_hover: true,
        });

        const icon = new St.Icon({
            icon_name: 'document-edit-symbolic',
            icon_size: iconSize,
            style: 'color: rgba(255, 255, 255, 0.8);',
        });
        button.set_child(icon);

        // Hover effects
        button.connect('enter-event', () => {
            button.style = hoverStyle;
            icon.style = 'color: white;';
            return Clutter.EVENT_PROPAGATE;
        });

        button.connect('leave-event', () => {
            button.style = idleStyle;
            icon.style = 'color: rgba(255, 255, 255, 0.8);';
            return Clutter.EVENT_PROPAGATE;
        });

        // Click opens zone editor
        button.connect('clicked', () => {
            this._openZoneEditor();
        });

        // Store size for positioning
        button._buttonSize = buttonSize;

        return button;
    }

    /**
     * Create a divider line
     * @param {Object} colors - Theme colors
     * @returns {St.Widget} Divider widget
     * @private
     */
    _createDivider(colors) {
        return new St.Widget({
            style: `
                height: 1px;
                background-color: ${colors.divider};
                margin: 8px 0;
            `,
        });
    }

    /**
     * Create a symbolic icon button for the header (using GNOME symbolic icons)
     * @param {Object} colors - Theme colors
     * @param {string} iconName - Symbolic icon name (e.g., 'edit-copy-symbolic')
     * @param {string} tooltip - Tooltip text (for accessibility)
     * @param {Function} onClick - Click handler
     * @returns {St.Button} Icon button
     * @private
     */
    _createSymbolicIconButton(colors, iconName, tooltip, onClick) {
        const normalStyle = `
            padding: 6px 10px;
            background-color: transparent;
            border-radius: 6px;
        `;
        const hoverStyle = `
            padding: 6px 10px;
            background-color: ${colors.buttonBgHover};
            border-radius: 6px;
        `;

        const button = new St.Button({
            style: normalStyle,
            can_focus: true,
            accessible_name: tooltip,
        });

        const icon = new St.Icon({
            icon_name: iconName,
            icon_size: 16,
            style: `color: ${colors.textPrimary};`,
        });
        button.set_child(icon);

        button.connect('clicked', onClick);

        button.connect('enter-event', () => {
            button.style = hoverStyle;
            return Clutter.EVENT_PROPAGATE;
        });

        button.connect('leave-event', () => {
            button.style = normalStyle;
            return Clutter.EVENT_PROPAGATE;
        });

        return button;
    }

    /**
     * Create a hyperlink-style button
     * @param {Object} colors - Theme colors
     * @param {string} text - Link text
     * @param {Function} onClick - Click handler
     * @returns {St.Button} Hyperlink button
     * @private
     */
    _createHyperlinkButton(colors, text, onClick) {
        const button = new St.Button({
            style: `
                padding: 4px 8px;
                background-color: transparent;
            `,
            can_focus: true,
        });

        const linkLabel = new St.Label({
            text: text,
            style: `
                font-size: 11pt;
                color: ${colors.accentHex};
                text-decoration: underline;
            `,
        });
        button.set_child(linkLabel);
        button._linkLabel = linkLabel;

        button.connect('clicked', onClick);

        button.connect('enter-event', () => {
            linkLabel.style = `
                font-size: 11pt;
                color: ${colors.accentHexHover};
                text-decoration: underline;
            `;
            return Clutter.EVENT_PROPAGATE;
        });

        button.connect('leave-event', () => {
            linkLabel.style = `
                font-size: 11pt;
                color: ${colors.accentHex};
                text-decoration: underline;
            `;
            return Clutter.EVENT_PROPAGATE;
        });

        return button;
    }

    /**
     * Create a dropdown selector matching spinner visual style
     * Has up/down arrows like the spinner for visual consistency
     * @param {Object} colors - Theme colors
     * @param {Array} options - Array of option strings
     * @param {string} selected - Currently selected value
     * @returns {St.BoxLayout} Dropdown container (matching spinner structure)
     * @private
     */
    _createDropdown(colors, options, selected) {
        // Container matching spinner structure
        const container = new St.BoxLayout({
            vertical: false,
            style: `
                background-color: ${colors.inputBg};
                border: 1px solid ${colors.inputBorder};
                border-radius: 6px;
            `,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Value display (matching spinner value label style)
        const valueLabel = new St.Label({
            text: selected,
            style: `
                font-size: 11pt;
                color: ${colors.textPrimary};
                min-width: 32px;
                text-align: center;
                padding: 6px 8px;
            `,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        container.add_child(valueLabel);
        container._valueLabel = valueLabel;
        container._options = options;
        container._selectedIndex = options.indexOf(selected);
        if (container._selectedIndex < 0) container._selectedIndex = 0;

        // Buttons container (vertical) - matching spinner exactly
        const buttonsBox = new St.BoxLayout({
            vertical: true,
            style: `
                border-left: 1px solid ${colors.inputBorder};
            `,
        });

        // Up button - increment value
        const upButton = new St.Button({
            style: `
                padding: 2px 6px;
                background-color: transparent;
                border-radius: 0 6px 0 0;
            `,
            can_focus: true,
        });
        const upIcon = new St.Icon({
            icon_name: 'pan-up-symbolic',
            icon_size: 10,
            style: `color: ${colors.textMuted};`,
        });
        upButton.set_child(upIcon);

        upButton.connect('clicked', () => {
            // Cycle forwards through options (higher numbers)
            container._selectedIndex = (container._selectedIndex + 1) % options.length;
            valueLabel.text = options[container._selectedIndex];
        });

        upButton.connect('enter-event', () => {
            upButton.style = `
                padding: 2px 6px;
                background-color: ${colors.buttonBgHover};
                border-radius: 0 6px 0 0;
            `;
            return Clutter.EVENT_PROPAGATE;
        });
        upButton.connect('leave-event', () => {
            upButton.style = `
                padding: 2px 6px;
                background-color: transparent;
                border-radius: 0 6px 0 0;
            `;
            return Clutter.EVENT_PROPAGATE;
        });

        buttonsBox.add_child(upButton);

        // Down button - decrement value
        const downButton = new St.Button({
            style: `
                padding: 2px 6px;
                background-color: transparent;
                border-radius: 0 0 6px 0;
                border-top: 1px solid ${colors.inputBorder};
            `,
            can_focus: true,
        });
        const downIcon = new St.Icon({
            icon_name: 'pan-down-symbolic',
            icon_size: 10,
            style: `color: ${colors.textMuted};`,
        });
        downButton.set_child(downIcon);

        downButton.connect('clicked', () => {
            // Cycle backwards through options (lower numbers)
            container._selectedIndex = (container._selectedIndex - 1 + options.length) % options.length;
            valueLabel.text = options[container._selectedIndex];
        });

        downButton.connect('enter-event', () => {
            downButton.style = `
                padding: 2px 6px;
                background-color: ${colors.buttonBgHover};
                border-radius: 0 0 6px 0;
                border-top: 1px solid ${colors.inputBorder};
            `;
            return Clutter.EVENT_PROPAGATE;
        });
        downButton.connect('leave-event', () => {
            downButton.style = `
                padding: 2px 6px;
                background-color: transparent;
                border-radius: 0 0 6px 0;
                border-top: 1px solid ${colors.inputBorder};
            `;
            return Clutter.EVENT_PROPAGATE;
        });

        buttonsBox.add_child(downButton);
        container.add_child(buttonsBox);

        return container;
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
            `,
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
                `,
            });
            section.add_child(titleLabel);
        }

        return section;
    }

    /**
     * Compute input field style based on disabled state
     * @param {Object} colors - Theme colors
     * @param {Object} options - Input options
     * @returns {Object} Style properties {textColor, bgColor, style}
     * @private
     */
    _computeInputStyle(colors, options) {
        const isDisabled = options.disabled || false;
        const textColor = isDisabled ? colors.textMuted : colors.textPrimary;
        const bgColor = isDisabled ? colors.sectionBg : colors.inputBg;
        const minWidth = options.minWidth || '200px';
        const opacityRule = isDisabled ? 'opacity: 0.7;' : '';

        return {
            isDisabled,
            style: `
                min-width: ${minWidth};
                background-color: ${bgColor};
                color: ${textColor};
                border: 1px solid ${colors.inputBorder};
                border-radius: 6px;
                padding: 8px 12px;
                ${opacityRule}
            `,
        };
    }

    /**
     * Create a styled input field with inset appearance
     * @param {Object} colors - Theme colors
     * @param {Object} options - Input options (text, hintText, minWidth, disabled)
     * @returns {St.Entry} Styled entry widget
     * @private
     */
    _createStyledInput(colors, options = {}) {
        const {isDisabled, style} = this._computeInputStyle(colors, options);

        const entry = new St.Entry({
            text: options.text || '',
            hint_text: options.hintText || '',
            can_focus: !isDisabled,
            reactive: !isDisabled,
            style,
        });

        if (isDisabled && entry.clutter_text) {
            entry.clutter_text.editable = false;
        }

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
            can_focus: true,
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
     * Create a styled checkbox matching topBar.js design
     * Uses accent color when checked, transparent when unchecked
     * @param {Object} colors - Theme colors
     * @param {boolean} checked - Initial checked state
     * @returns {St.Button} Checkbox button
     * @private
     */
    _createCheckbox(colors, checked = false) {
        const checkbox = new St.Button({
            style_class: 'checkbox',
            style: 'width: 18px; height: 18px; ' +
                   `border: 2px solid ${checked ? colors.accentHex : colors.textMuted}; ` +
                   'border-radius: 3px; ' +
                   `background-color: ${checked ? colors.accentHex : 'transparent'};`,
            reactive: true,
            track_hover: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Add checkmark when checked
        if (checked) {
            const checkmark = new St.Label({
                text: '✓',
                style: `color: ${colors.isDark ? '#1a202c' : 'white'}; font-size: 12px; font-weight: bold;`,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            checkbox.set_child(checkmark);
        }

        checkbox._checked = checked;
        return checkbox;
    }

    /**
     * Toggle checkbox state and update appearance
     * @param {St.Button} checkbox - The checkbox button
     * @param {Object} colors - Theme colors
     * @private
     */
    _toggleCheckbox(checkbox, colors) {
        checkbox._checked = !checkbox._checked;

        checkbox.style = 'width: 18px; height: 18px; ' +
               `border: 2px solid ${checkbox._checked ? colors.accentHex : colors.textMuted}; ` +
               'border-radius: 3px; ' +
               `background-color: ${checkbox._checked ? colors.accentHex : 'transparent'};`;

        if (checkbox._checked) {
            const checkmark = new St.Label({
                text: '✓',
                style: `color: ${colors.isDark ? '#1a202c' : 'white'}; font-size: 12px; font-weight: bold;`,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            checkbox.set_child(checkmark);
        } else {
            checkbox.set_child(null);
        }
    }

    /**
     * Create a spinner input with up/down buttons
     * @param {Object} colors - Theme colors
     * @param {Object} options - Spinner options (value, min, max, step)
     * @returns {St.BoxLayout} Spinner container
     * @private
     */
    _createSpinnerInput(colors, options = {}) {
        const value = options.value || 0;
        const min = options.min ?? 0;
        const max = options.max ?? 99;
        const step = options.step || 1;

        const container = new St.BoxLayout({
            vertical: false,
            style: `
                background-color: ${colors.inputBg};
                border: 1px solid ${colors.inputBorder};
                border-radius: 6px;
            `,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Value display
        const valueLabel = new St.Label({
            text: String(value),
            style: `
                font-size: 11pt;
                color: ${colors.textPrimary};
                min-width: 32px;
                text-align: center;
                padding: 6px 8px;
            `,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        container.add_child(valueLabel);
        container._valueLabel = valueLabel;
        container._value = value;
        container._min = min;
        container._max = max;
        container._step = step;

        // Buttons container (vertical)
        const buttonsBox = new St.BoxLayout({
            vertical: true,
            style: `
                border-left: 1px solid ${colors.inputBorder};
            `,
        });

        // Up button
        const upButton = new St.Button({
            style: `
                padding: 2px 6px;
                background-color: transparent;
                border-radius: 0 6px 0 0;
            `,
            can_focus: true,
        });
        const upIcon = new St.Icon({
            icon_name: 'pan-up-symbolic',
            icon_size: 10,
            style: `color: ${colors.textMuted};`,
        });
        upButton.set_child(upIcon);

        upButton.connect('clicked', () => {
            if (container._value < max) {
                container._value = Math.min(max, container._value + step);
                valueLabel.text = String(container._value);
            }
        });

        upButton.connect('enter-event', () => {
            upButton.style = `
                padding: 2px 6px;
                background-color: ${colors.buttonBgHover};
                border-radius: 0 6px 0 0;
            `;
            return Clutter.EVENT_PROPAGATE;
        });
        upButton.connect('leave-event', () => {
            upButton.style = `
                padding: 2px 6px;
                background-color: transparent;
                border-radius: 0 6px 0 0;
            `;
            return Clutter.EVENT_PROPAGATE;
        });

        buttonsBox.add_child(upButton);

        // Down button
        const downButton = new St.Button({
            style: `
                padding: 2px 6px;
                background-color: transparent;
                border-radius: 0 0 6px 0;
                border-top: 1px solid ${colors.inputBorder};
            `,
            can_focus: true,
        });
        const downIcon = new St.Icon({
            icon_name: 'pan-down-symbolic',
            icon_size: 10,
            style: `color: ${colors.textMuted};`,
        });
        downButton.set_child(downIcon);

        downButton.connect('clicked', () => {
            if (container._value > min) {
                container._value = Math.max(min, container._value - step);
                valueLabel.text = String(container._value);
            }
        });

        downButton.connect('enter-event', () => {
            downButton.style = `
                padding: 2px 6px;
                background-color: ${colors.buttonBgHover};
                border-radius: 0 0 6px 0;
                border-top: 1px solid ${colors.inputBorder};
            `;
            return Clutter.EVENT_PROPAGATE;
        });
        downButton.connect('leave-event', () => {
            downButton.style = `
                padding: 2px 6px;
                background-color: transparent;
                border-radius: 0 0 6px 0;
                border-top: 1px solid ${colors.inputBorder};
            `;
            return Clutter.EVENT_PROPAGATE;
        });

        buttonsBox.add_child(downButton);
        container.add_child(buttonsBox);

        return container;
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
     * Capture current dialog state for zone editor handoff
     * @returns {Object} Captured state including name, padding, shortcut, and layout data
     * @private
     */
    _captureDialogState() {
        const currentPadding = this._paddingSpinner?._value ?? this._layout.padding ?? 4;
        return {
            name: this._nameEntry.get_text().trim(),
            padding: currentPadding,
            paddingEnabled: this._paddingCheckbox?._checked ?? (currentPadding > 0),
            shortcut: this._collectShortcutValue(),
            layoutData: JSON.parse(JSON.stringify(this._layout)),
        };
    }

    /**
     * Build layout object from zone editor result and saved state
     * @param {Object} editedLayout - Layout returned from zone editor
     * @param {Object} state - Captured dialog state
     * @returns {Object} Final layout object for saving
     * @private
     */
    _buildLayoutFromEditorResult(editedLayout, state) {
        return {
            id: state.layoutData.id || `layout-${Date.now()}`,
            name: state.name,
            zones: editedLayout.zones,
            padding: state.paddingEnabled ? (parseInt(state.padding) || 4) : 0,
            shortcut: state.shortcut,
            metadata: {
                createdDate: state.layoutData.metadata?.createdDate || Date.now(),
                modifiedDate: Date.now(),
            },
        };
    }

    /**
     * Open ZoneEditor to edit geometry
     *
     * BEHAVIOR CHANGE: Zone editor now returns directly to LayoutSwitcher
     * instead of reopening LayoutSettingsDialog. This simplifies the flow
     * and fixes z-order issues:
     * - Save: saves the layout and returns to LayoutSwitcher
     * - Cancel: discards changes and returns to LayoutSwitcher
     * @private
     */
    _openZoneEditor() {
        logger.info('Opening ZoneEditor from LayoutSettingsDialog');

        // Capture current state before closing
        const state = this._captureDialogState();

        // Store callbacks before closing
        const savedOnSave = this._onSaveCallback;
        const savedOnCancel = this._onCancelCallback;
        const savedOnZoneEditorClose = this._onZoneEditorCloseCallback;
        const layoutManager = this._layoutManager;

        this.close();

        const layoutForEditor = (state.layoutData.zones.length > 0) ? state.layoutData : null;

        // One-shot callback guards
        let saveExecuted = false;
        let cancelExecuted = false;

        const editor = new ZoneEditor(
            layoutForEditor,
            layoutManager,
            this._settings,
            (editedLayout) => {
                if (saveExecuted) return;
                saveExecuted = true;

                logger.info(`ZoneEditor save: ${editedLayout.zones.length} zones`);

                const finalLayout = this._buildLayoutFromEditorResult(editedLayout, state);
                const success = layoutManager.saveLayout(finalLayout);

                logger.info(success ? `Layout saved: ${finalLayout.name}` : `Save failed: ${finalLayout.name}`);

                if (savedOnZoneEditorClose) savedOnZoneEditorClose(finalLayout);
                if (savedOnSave) savedOnSave(finalLayout);
            },
            () => {
                if (cancelExecuted) return;
                cancelExecuted = true;

                logger.info('ZoneEditor canceled');

                if (savedOnZoneEditorClose) savedOnZoneEditorClose(state.layoutData);
                if (savedOnCancel) savedOnCancel();
            },
        );

        if (this._onZoneEditorOpenCallback) {
            this._onZoneEditorOpenCallback();
        }

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
     * Handle duplicate action - creates a copy and transforms dialog in-place
     * @private
     */
    _onDuplicate() {
        logger.info(`Duplicate requested for layout: ${this._layout.name}`);

        // Create duplicated layout data
        const duplicatedLayout = {
            id: this._generateId(),  // New unique ID
            name: `${this._layout.name} Copy`,
            zones: JSON.parse(JSON.stringify(this._layout.zones || [])),
            padding: this._layout.padding || 0,  // Preserve padding; default off
            shortcut: null,  // Don't copy shortcut to avoid conflicts
            metadata: {
                createdDate: Date.now(),
                modifiedDate: Date.now(),
            },
        };

        // Store current callbacks and managers
        const savedOnSave = this._onSaveCallback;
        const savedOnCancel = this._onCancelCallback;
        const layoutManager = this._layoutManager;
        const settings = this._settings;

        // Close current dialog
        this.close();

        // Open new dialog with duplicated layout (now a custom layout, not template)
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            const newDialog = new LayoutSettingsDialog(
                duplicatedLayout,
                layoutManager,
                settings,
                savedOnSave,
                savedOnCancel,
            );
            newDialog.open();
            return GLib.SOURCE_REMOVE;
        });

        logger.info(`Created duplicate: ${duplicatedLayout.name} (${duplicatedLayout.id})`);
    }

    /**
     * Handle delete action
     * Shows inline confirmation overlay (avoids modal conflicts with LayoutPreviewBackground)
     * @private
     */
    _onDelete() {
        logger.info(`Delete requested for layout: ${this._layout.name}`);

        // Show inline confirmation overlay
        this._showDeleteConfirmation();
    }

    /**
     * Show inline delete confirmation overlay
     * Uses same pattern as LayoutSwitcher for consistency and modal compatibility
     * @private
     */
    _showDeleteConfirmation() {
        // Remove any existing confirmation
        if (this._confirmOverlay) {
            this._confirmOverlay.destroy();
            this._confirmOverlay = null;
        }

        const colors = this._themeManager.getColors();

        // Confirmation box
        const confirmBox = new St.BoxLayout({
            vertical: true,
            style: `background-color: ${colors.containerBg}; ` +
                   'border-radius: 12px; ' +
                   'padding: 24px; ' +
                   'min-width: 300px; ' +
                   `border: 1px solid ${colors.border};`,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: false,
            y_expand: false,
        });

        // Title
        const title = new St.Label({
            text: 'Delete Layout',
            style: `color: ${colors.textPrimary}; font-size: 16px; font-weight: bold; margin-bottom: 12px;`,
        });
        confirmBox.add_child(title);

        // Message
        const message = new St.Label({
            text: `Are you sure you want to delete "${this._layout.name}"?\n\nThis action cannot be undone.`,
            style: `color: ${colors.textSecondary}; font-size: 13px; margin-bottom: 20px;`,
        });
        message.clutter_text.line_wrap = true;
        confirmBox.add_child(message);

        // Buttons
        const buttonBox = new St.BoxLayout({
            style: 'spacing: 12px;',
            x_align: Clutter.ActorAlign.END,
        });

        // Store confirmBox for later use
        this._confirmBox = confirmBox;

        // Cancel button
        const cancelBtn = new St.Button({
            label: 'Cancel',
            style: `background-color: ${colors.buttonBg}; ` +
                   `color: ${colors.buttonText}; ` +
                   'padding: 8px 20px; ' +
                   'border-radius: 6px; ' +
                   'font-weight: 500;',
            reactive: true,
            track_hover: true,
        });
        this._signalIds.push(
            cancelBtn.connect('clicked', this._boundHandleDeleteCancelClick),
        );
        buttonBox.add_child(cancelBtn);

        // Delete button (destructive red)
        const deleteBtn = new St.Button({
            label: 'Delete',
            style: 'background-color: #c01c28; ' +
                   'color: white; ' +
                   'padding: 8px 20px; ' +
                   'border-radius: 6px; ' +
                   'font-weight: 500;',
            reactive: true,
            track_hover: true,
        });
        this._signalIds.push(
            deleteBtn.connect('clicked', this._boundHandleDeleteConfirmClick),
        );
        buttonBox.add_child(deleteBtn);

        confirmBox.add_child(buttonBox);

        // Full-screen wrapper with semi-transparent backdrop
        const wrapper = new St.Widget({
            style: 'background-color: rgba(0, 0, 0, 0.5);',
            reactive: true,
            x: 0,
            y: 0,
            width: this._container.width,
            height: this._container.height,
        });

        // Click on backdrop (outside confirm box) to cancel - use bound method
        this._signalIds.push(
            wrapper.connect('button-press-event', this._boundHandleDeleteWrapperClick),
        );

        // Add confirmBox to wrapper
        wrapper.add_child(confirmBox);

        // Add overlay on top of our container
        this._confirmOverlay = wrapper;
        this._container.add_child(wrapper);

        // Center the confirmation box after layout is complete
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            if (confirmBox && wrapper) {
                const [boxW, boxH] = confirmBox.get_size();
                confirmBox.set_position(
                    Math.floor((wrapper.width - boxW) / 2),
                    Math.floor((wrapper.height - boxH) / 2),
                );
            }
            return GLib.SOURCE_REMOVE;
        });

        // Focus the cancel button
        cancelBtn.grab_key_focus();

        logger.debug('Delete confirmation overlay shown');
    }

    /**
     * Handle container click to check if clicking outside dialog card
     * @param {Clutter.Actor} actor - The container actor
     * @param {Clutter.Event} event - The click event
     * @returns {number} Clutter.EVENT_STOP or Clutter.EVENT_PROPAGATE
     * @private
     */
    _handleContainerClick(actor, event) {
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
    }

    /**
     * Handle key press events
     * @param {Clutter.Actor} actor - The container actor
     * @param {Clutter.Event} event - The key press event
     * @returns {number} Clutter.EVENT_STOP or Clutter.EVENT_PROPAGATE
     * @private
     */
    _handleKeyPress(actor, event) {
        const symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Escape) {
            this._onCancel();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    /**
     * Handle padding checkbox toggle
     * @private
     */
    _onTogglePaddingCheckbox() {
        const colors = this._themeManager.getColors();
        this._toggleCheckbox(this._paddingCheckbox, colors);
        const isEnabled = this._paddingCheckbox._checked;
        if (this._paddingSpinner) {
            this._paddingSpinner.reactive = isEnabled;
            this._paddingSpinner.opacity = isEnabled ? 255 : 128;
        }
    }

    /**
     * Handle delete confirm button click
     * @private
     */
    _onDeleteConfirmClick() {
        this._hideDeleteConfirmation();

        // Perform delete
        const success = this._layoutManager.deleteLayout(this._layout.id);

        if (success) {
            logger.info(`Layout deleted: ${this._layout.name}`);
            this.close();

            if (this._onSaveCallback) {
                this._onSaveCallback(null); // Signal deletion
            }
        } else {
            logger.error(`Failed to delete layout: ${this._layout.name}`);
        }
    }

    /**
     * Handle delete wrapper click to check if clicking outside confirmation box
     * @param {Clutter.Actor} actor - The wrapper actor
     * @param {Clutter.Event} event - The click event
     * @returns {number} Clutter.EVENT_STOP
     * @private
     */
    _handleDeleteWrapperClick(actor, event) {
        const [clickX, clickY] = event.get_coords();
        const confirmBox = this._confirmBox;

        if (!confirmBox) {
            return Clutter.EVENT_STOP;
        }

        const boxAlloc = confirmBox.get_transformed_extents();
        const isOutside = clickX < boxAlloc.origin.x ||
                          clickX > boxAlloc.origin.x + boxAlloc.size.width ||
                          clickY < boxAlloc.origin.y ||
                          clickY > boxAlloc.origin.y + boxAlloc.size.height;

        if (isOutside) {
            this._hideDeleteConfirmation();
        }

        return Clutter.EVENT_STOP;
    }

    /**
     * Hide the delete confirmation overlay
     * @private
     */
    _hideDeleteConfirmation() {
        if (this._confirmOverlay) {
            this._confirmOverlay.destroy();
            this._confirmOverlay = null;
            logger.debug('Delete confirmation overlay hidden');
        }

        this._confirmBox = null;

        // Return focus to dialog
        if (this._dialogCard) {
            this._dialogCard.grab_key_focus();
        }
    }

    /**
     * Collect current padding value from UI
     * @returns {number} Padding value (0 if disabled)
     * @private
     */
    _collectPaddingValue() {
        const paddingEnabled = this._paddingCheckbox?._checked;
        return paddingEnabled ? (this._paddingSpinner?._value ?? 4) : 0;
    }

    /**
     * Collect current shortcut value from UI
     * @returns {string|null} Shortcut value or null if 'None'
     * @private
     */
    _collectShortcutValue() {
        const shortcutValue = this._shortcutDropdown?._valueLabel?.text;
        return (shortcutValue && shortcutValue !== 'None') ? shortcutValue : null;
    }

    /**
     * Build final layout object from current UI state
     * @returns {Object} Layout object ready for saving
     * @private
     */
    _buildFinalLayout() {
        return {
            id: this._layout.id || this._generateId(),
            name: this._nameEntry.get_text().trim(),
            zones: this._layout.zones,
            padding: this._collectPaddingValue(),
            shortcut: this._collectShortcutValue(),
            metadata: {
                createdDate: this._layout.metadata?.createdDate || Date.now(),
                modifiedDate: Date.now(),
            },
        };
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

        const finalLayout = this._buildFinalLayout();

        // Clear duplicate shortcuts from other layouts before saving
        if (finalLayout.shortcut) {
            const allLayouts = this._layoutManager.getAllLayouts();
            for (const layout of allLayouts) {
                if (layout.id !== finalLayout.id && layout.shortcut === finalLayout.shortcut) {
                    logger.info(`Clearing duplicate shortcut ${layout.shortcut} from layout: ${layout.name}`);
                    layout.shortcut = null;
                    this._layoutManager.saveLayout(layout);
                }
            }
        }

        logger.info(`Saving layout: ${finalLayout.name} (${finalLayout.id}), padding: ${finalLayout.padding}, shortcut: ${finalLayout.shortcut}`);

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
     * Detect if a layout is a built-in template (immutable)
     * Templates can be identified by:
     * 1. ID starting with 'template-' (e.g., 'template-halves')
     * 2. ID matching a built-in template ID (e.g., 'halves', 'thirds')
     * @param {Object} layout - The layout to check
     * @returns {boolean} True if layout is a template
     * @private
     */
    _detectIsTemplate(layout) {
        if (!layout || !layout.id) {
            return false;
        }

        // Check for template- prefix
        if (layout.id.startsWith('template-')) {
            return true;
        }

        // Check if ID matches a built-in template
        try {
            const templateManager = new TemplateManager();
            return templateManager.hasTemplate(layout.id);
        } catch (e) {
            logger.warn('Could not check template manager:', e);
            return false;
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

    /**
     * Generate a default name for new layouts
     * @returns {string} Default name like "Custom Layout" or "Custom Layout 2"
     * @private
     */
    _generateDefaultName() {
        const baseName = 'Custom Layout';

        // If we don't have a layout manager yet, just return the base name
        if (!this._layoutManager) {
            return baseName;
        }

        // Get all existing layouts to check for name conflicts
        const existingLayouts = this._layoutManager.getAllLayouts() || [];
        const existingNames = new Set(existingLayouts.map(l => l.name));

        // If base name doesn't exist, use it
        if (!existingNames.has(baseName)) {
            return baseName;
        }

        // Otherwise find the next available number
        let counter = 2;
        while (existingNames.has(`${baseName} ${counter}`)) {
            counter++;
        }

        return `${baseName} ${counter}`;
    }
}
