/**
 * Layout Settings Diagnostic Dialog
 *
 * Minimal dialog for isolating memory leaks in layoutSettingsDialog.
 * Uses boolean flags to enable/disable individual controls.
 * Follows all memory best practices: SignalTracker, module-level handlers,
 * proper cleanup, no closures.
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {createLogger} from '../utils/debug.js';
import {SignalTracker} from '../utils/signalTracker.js';
import {ThemeManager} from '../utils/theme.js';

const logger = createLogger('LayoutSettingsDiagnostic');

// CONTROL FLAGS - Toggle these to isolate memory leaks
const ENABLE_CONTROLS = {
    labels: true,
    buttons: true,
    iconButtons: true,
    entries: true,
    checkboxes: false,
    spinners: false,
    dropdowns: false,
    hoverEffects: true,
    themeManager: true,
};

/**
 * Module-level handler functions to prevent closure leaks
 * Following layoutSettingsDialog's proven pattern
 */

function handleButtonClick() {
    logger.debug('Diagnostic button clicked');
}

function handleWidgetHoverEnter(widget, hoverStyle) {
    widget.style = hoverStyle;
    return Clutter.EVENT_PROPAGATE;
}

function handleWidgetHoverLeave(widget, normalStyle) {
    widget.style = normalStyle;
    return Clutter.EVENT_PROPAGATE;
}

function handleUpButtonClick(container, valueLabel, optionsOrMax, step) {
    if (Array.isArray(optionsOrMax)) {
        // Dropdown
        container._selectedIndex = (container._selectedIndex + 1) % optionsOrMax.length;
        valueLabel.text = optionsOrMax[container._selectedIndex];
    } else {
        // Spinner
        const max = optionsOrMax;
        if (container._value < max) {
            container._value = Math.min(max, container._value + step);
            valueLabel.text = String(container._value);
        }
    }
}

function handleDownButtonClick(container, valueLabel, optionsOrMin, step) {
    if (Array.isArray(optionsOrMin)) {
        // Dropdown
        const options = optionsOrMin;
        container._selectedIndex = (container._selectedIndex - 1 + options.length) % options.length;
        valueLabel.text = options[container._selectedIndex];
    } else {
        // Spinner
        const min = optionsOrMin;
        if (container._value > min) {
            container._value = Math.max(min, container._value - step);
            valueLabel.text = String(container._value);
        }
    }
}

/**
 * Diagnostic Dialog for Memory Leak Testing
 */
export class LayoutSettingsDiagnostic {
    constructor(settings) {
        this._settings = settings;
        this._themeManager = ENABLE_CONTROLS.themeManager ? new ThemeManager(settings) : null;

        // Widget tracking
        this._widgets = [];

        // Signal tracking
        this._signalTracker = new SignalTracker('LayoutSettingsDiagnostic');

        // Source tracking
        this._idleSourceIds = [];

        // Modal state
        this._container = null;
        this._dialogCard = null;
        this._modal = null;
        this._visible = false;
        this._closing = false;

        // Bound methods
        this._boundHandleContainerClick = this._handleContainerClick.bind(this);
        this._boundHandleKeyPress = this._handleKeyPress.bind(this);
        this._boundOnClose = this._onClose.bind(this);

        logger.debug('LayoutSettingsDiagnostic created', ENABLE_CONTROLS);
    }

    open() {
        if (this._visible) {
            logger.warn('Diagnostic dialog already visible');
            return;
        }

        const monitor = Main.layoutManager.currentMonitor;
        const colors = this._themeManager ? this._themeManager.getColors() : this._getDefaultColors();

        // Create full-screen container
        this._container = new St.Widget({
            reactive: true,
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height,
            style: 'background-color: rgba(0, 0, 0, 0.5);',
        });

        // Click on container dismisses
        this._signalTracker.connect(
            this._container, 'button-press-event', this._boundHandleContainerClick,
        );

        // Build dialog
        this._buildDialogCard(colors);

        // Add to container
        this._container.add_child(this._dialogCard);

        // Position and show
        const positionSourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            if (this._closing || !this._visible || !this._container || !this._dialogCard) {
                return GLib.SOURCE_REMOVE;
            }

            const actualHeight = this._dialogCard.get_height();
            const actualWidth = this._dialogCard.get_width();
            this._dialogCard.set_position(
                Math.floor((monitor.width - actualWidth) / 2),
                Math.floor((monitor.height - actualHeight) / 2),
            );

            this._dialogCard.opacity = 255;
            Main.uiGroup.add_child(this._container);

            return GLib.SOURCE_REMOVE;
        });
        this._idleSourceIds.push(positionSourceId);

        // Push modal
        const modalSourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            if (this._closing || !this._visible || !this._container) {
                return GLib.SOURCE_REMOVE;
            }

            try {
                this._modal = Main.pushModal(this._container, {
                    actionMode: Shell.ActionMode.NORMAL,
                });
                if (!this._modal) {
                    logger.error('Failed to acquire modal');
                }
            } catch (e) {
                logger.error(`Exception acquiring modal: ${e.message}`);
                this._modal = null;
            }

            return GLib.SOURCE_REMOVE;
        });
        this._idleSourceIds.push(modalSourceId);

        // Connect key handler
        this._signalTracker.connect(
            this._container, 'key-press-event', this._boundHandleKeyPress,
        );

        this._visible = true;
        logger.debug('Diagnostic dialog opened');
    }

    close() {
        if (!this._visible || this._closing) {
            return;
        }
        this._closing = true;

        this._cleanupIdleSources();
        this._cleanupModal();
        this._signalTracker.disconnectAll();
        this._destroyWidgets();
        this._releaseBoundFunctions();
        this._destroyContainer();
        this._cleanupThemeManager();

        this._visible = false;
        logger.debug('Diagnostic dialog closed');
    }

    _buildDialogCard(colors) {
        this._dialogCard = new St.BoxLayout({
            vertical: true,
            reactive: true,
            style: `background-color: ${colors.containerBg}; border-radius: 16px; ` +
                   'padding: 24px; min-width: 420px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4); ' +
                   'opacity: 0;',
        });

        // Title
        const title = new St.Label({
            text: 'Memory Leak Diagnostic',
            style: `font-weight: bold; font-size: 14pt; color: ${colors.textPrimary}; margin-bottom: 16px;`,
        });
        this._dialogCard.add_child(title);
        this._widgets.push(title);

        // Controls section
        const section = this._createSection(colors);
        this._dialogCard.add_child(section);
        this._widgets.push(section);

        // Close button
        const closeBtn = this._createButton(colors, 'Close', this._boundOnClose);
        this._dialogCard.add_child(closeBtn);
        this._widgets.push(closeBtn);
    }

    _createSection(colors) {
        const section = new St.BoxLayout({
            vertical: true,
            style: `background-color: ${colors.sectionBg}; border: 1px solid ${colors.sectionBorder}; ` +
                   'border-radius: 12px; padding: 16px; margin-bottom: 16px;',
        });

        // Add controls based on flags
        // Don't push any of these to _widgets - they're all children of section
        if (ENABLE_CONTROLS.labels) {
            const label = new St.Label({
                text: 'Test Label',
                style: `color: ${colors.textPrimary}; margin-bottom: 8px;`,
            });
            section.add_child(label);
        }

        if (ENABLE_CONTROLS.entries) {
            const entry = new St.Entry({
                text: 'Test Entry',
                style: `color: ${colors.textPrimary}; background-color: ${colors.inputBg}; ` +
                       'border: 1px solid ' + colors.inputBorder + '; border-radius: 6px; padding: 8px; margin-bottom: 8px;',
            });
            section.add_child(entry);
        }

        if (ENABLE_CONTROLS.buttons) {
            const btn = this._createButton(colors, 'Test Button', handleButtonClick);
            section.add_child(btn);
        }

        if (ENABLE_CONTROLS.iconButtons) {
            const iconBtn = this._createIconButton(colors);
            section.add_child(iconBtn);
        }

        if (ENABLE_CONTROLS.checkboxes) {
            const checkbox = this._createCheckbox(colors);
            section.add_child(checkbox);
            // Don't push checkbox to _widgets - checkmark child handled by checkbox itself
        }

        if (ENABLE_CONTROLS.spinners) {
            const spinner = this._createSpinner(colors);
            section.add_child(spinner);
            // Don't push spinner to _widgets - all children handled by section
        }

        if (ENABLE_CONTROLS.dropdowns) {
            const dropdown = this._createDropdown(colors);
            section.add_child(dropdown);
            // Don't push dropdown to _widgets - all children handled by section
        }

        return section;
    }

    _createButton(colors, label, onClick) {
        const normalStyle = 'padding: 10px 24px; background-color: ' + colors.buttonBg + '; ' +
                           'color: ' + colors.buttonText + '; border-radius: 6px; border: 1px solid ' + colors.sectionBorder + ';';
        const hoverStyle = 'padding: 10px 24px; background-color: ' + colors.buttonBgHover + '; ' +
                          'color: ' + colors.buttonText + '; border-radius: 6px; border: 1px solid ' + colors.sectionBorder + ';';

        const button = new St.Button({
            label: label,
            style: normalStyle,
            can_focus: true,
        });

        this._signalTracker.connect(button, 'clicked', onClick);

        if (ENABLE_CONTROLS.hoverEffects) {
            const boundEnter = handleWidgetHoverEnter.bind(null, button, hoverStyle);
            const boundLeave = handleWidgetHoverLeave.bind(null, button, normalStyle);
            this._signalTracker.connect(button, 'enter-event', boundEnter);
            this._signalTracker.connect(button, 'leave-event', boundLeave);
        }

        return button;
    }

    _createIconButton(colors) {
        const normalStyle = 'padding: 6px 10px; background-color: transparent; border-radius: 6px;';
        const hoverStyle = `padding: 6px 10px; background-color: ${colors.buttonBgHover}; border-radius: 6px;`;

        const button = new St.Button({
            style: normalStyle,
            can_focus: true,
        });

        const icon = new St.Icon({
            icon_name: 'edit-copy-symbolic',
            icon_size: 16,
            style: `color: ${colors.textPrimary};`,
        });
        button.set_child(icon);

        this._signalTracker.connect(button, 'clicked', handleButtonClick);

        if (ENABLE_CONTROLS.hoverEffects) {
            const boundEnter = handleWidgetHoverEnter.bind(null, button, hoverStyle);
            const boundLeave = handleWidgetHoverLeave.bind(null, button, normalStyle);
            this._signalTracker.connect(button, 'enter-event', boundEnter);
            this._signalTracker.connect(button, 'leave-event', boundLeave);
        }

        return button;
    }

    _createCheckbox(colors) {
        const checked = true;
        const checkbox = new St.Button({
            style: 'width: 18px; height: 18px; margin-bottom: 8px; ' +
                   `border: 2px solid ${checked ? colors.accentHex : colors.textSecondary}; ` +
                   'border-radius: 3px; ' +
                   `background-color: ${checked ? colors.accentHex : 'transparent'};`,
            reactive: true,
            track_hover: true,
        });

        if (checked) {
            const checkmark = new St.Label({
                text: '✓',
                style: 'color: white; font-size: 12px; font-weight: bold;',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            checkbox.set_child(checkmark);
            // Don't push checkmark to _widgets - it's a child of checkbox
        }

        checkbox._checked = checked;
        return checkbox;
    }

    _createSpinner(colors) {
        const container = new St.BoxLayout({
            vertical: false,
            style: `background-color: ${colors.inputBg}; border: 1px solid ${colors.inputBorder}; ` +
                   'border-radius: 6px; margin-bottom: 8px;',
            y_align: Clutter.ActorAlign.CENTER,
        });

        const valueLabel = new St.Label({
            text: '5',
            style: `color: ${colors.textPrimary}; min-width: 32px; text-align: center; padding: 6px 8px;`,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        container.add_child(valueLabel);
        // Don't push valueLabel to _widgets - it's a child of container

        container._valueLabel = valueLabel;
        container._value = 5;
        container._min = 0;
        container._max = 10;
        container._step = 1;

        const buttonsBox = new St.BoxLayout({
            vertical: true,
            style: `border-left: 1px solid ${colors.inputBorder};`,
        });

        const upButton = new St.Button({
            style: 'padding: 2px 6px; background-color: transparent; border-radius: 0 6px 0 0;',
            can_focus: true,
        });
        const upIcon = new St.Icon({
            icon_name: 'pan-up-symbolic',
            icon_size: 10,
            style: `color: ${colors.textSecondary};`,
        });
        upButton.set_child(upIcon);
        // Don't push upIcon to _widgets - it's a child of upButton

        const boundUpClick = handleUpButtonClick.bind(null, container, valueLabel, 10, 1);
        this._signalTracker.connect(upButton, 'clicked', boundUpClick);

        buttonsBox.add_child(upButton);
        // Don't push upButton to _widgets - it's a child of buttonsBox

        const downButton = new St.Button({
            style: `padding: 2px 6px; background-color: transparent; border-radius: 0 0 6px 0; border-top: 1px solid ${colors.inputBorder};`,
            can_focus: true,
        });
        const downIcon = new St.Icon({
            icon_name: 'pan-down-symbolic',
            icon_size: 10,
            style: `color: ${colors.textSecondary};`,
        });
        downButton.set_child(downIcon);
        // Don't push downIcon to _widgets - it's a child of downButton

        const boundDownClick = handleDownButtonClick.bind(null, container, valueLabel, 0, 1);
        this._signalTracker.connect(downButton, 'clicked', boundDownClick);

        buttonsBox.add_child(downButton);
        // Don't push downButton to _widgets - it's a child of buttonsBox

        container.add_child(buttonsBox);
        // Don't push buttonsBox to _widgets - it's a child of container

        return container;
    }

    _createDropdown(colors) {
        const options = ['Option 1', 'Option 2', 'Option 3'];
        const container = new St.BoxLayout({
            vertical: false,
            style: `background-color: ${colors.inputBg}; border: 1px solid ${colors.inputBorder}; ` +
                   'border-radius: 6px; margin-bottom: 8px;',
            y_align: Clutter.ActorAlign.CENTER,
        });

        const valueLabel = new St.Label({
            text: options[0],
            style: `color: ${colors.textPrimary}; min-width: 80px; text-align: center; padding: 6px 8px;`,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        container.add_child(valueLabel);
        // Don't push valueLabel to _widgets - it's a child of container

        container._valueLabel = valueLabel;
        container._options = options;
        container._selectedIndex = 0;

        const buttonsBox = new St.BoxLayout({
            vertical: true,
            style: `border-left: 1px solid ${colors.inputBorder};`,
        });

        const upButton = new St.Button({
            style: 'padding: 2px 6px; background-color: transparent; border-radius: 0 6px 0 0;',
            can_focus: true,
        });
        const upIcon = new St.Icon({
            icon_name: 'pan-up-symbolic',
            icon_size: 10,
            style: `color: ${colors.textSecondary};`,
        });
        upButton.set_child(upIcon);
        // Don't push upIcon to _widgets - it's a child of upButton

        const boundUpClick = handleUpButtonClick.bind(null, container, valueLabel, options, undefined);
        this._signalTracker.connect(upButton, 'clicked', boundUpClick);

        buttonsBox.add_child(upButton);
        // Don't push upButton to _widgets - it's a child of buttonsBox

        const downButton = new St.Button({
            style: `padding: 2px 6px; background-color: transparent; border-radius: 0 0 6px 0; border-top: 1px solid ${colors.inputBorder};`,
            can_focus: true,
        });
        const downIcon = new St.Icon({
            icon_name: 'pan-down-symbolic',
            icon_size: 10,
            style: `color: ${colors.textSecondary};`,
        });
        downButton.set_child(downIcon);
        // Don't push downIcon to _widgets - it's a child of downButton

        const boundDownClick = handleDownButtonClick.bind(null, container, valueLabel, options, undefined);
        this._signalTracker.connect(downButton, 'clicked', boundDownClick);

        buttonsBox.add_child(downButton);
        // Don't push downButton to _widgets - it's a child of buttonsBox

        container.add_child(buttonsBox);
        // Don't push buttonsBox to _widgets - it's a child of container

        return container;
    }

    _getDefaultColors() {
        return {
            containerBg: '#2d2d2d',
            sectionBg: '#3a3a3a',
            sectionBorder: '#4a4a4a',
            textPrimary: '#ffffff',
            textSecondary: '#cccccc',
            inputBg: '#252525',
            inputBorder: '#4a4a4a',
            buttonBg: '#3a3a3a',
            buttonBgHover: '#4a4a4a',
            buttonText: '#ffffff',
            accentHex: '#3584e4',
        };
    }

    _handleContainerClick(actor, event) {
        const [clickX, clickY] = event.get_coords();
        const cardAlloc = this._dialogCard ? this._dialogCard.get_transformed_extents() : null;

        if (cardAlloc) {
            const isOutside = clickX < cardAlloc.origin.x ||
                              clickX > cardAlloc.origin.x + cardAlloc.size.width ||
                              clickY < cardAlloc.origin.y ||
                              clickY > cardAlloc.origin.y + cardAlloc.size.height;

            if (isOutside) {
                this._onClose();
                return Clutter.EVENT_STOP;
            }
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _handleKeyPress(actor, event) {
        const symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Escape) {
            this._onClose();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _onClose() {
        if (this._closing || !this._visible) {
            return;
        }
        logger.info('Diagnostic dialog closing');
        this.close();
    }

    _cleanupIdleSources() {
        logger.debug(`Removing ${this._idleSourceIds.length} idle sources`);
        for (const sourceId of this._idleSourceIds) {
            GLib.Source.remove(sourceId);
        }
        this._idleSourceIds = [];
    }

    _cleanupModal() {
        if (this._modal) {
            Main.popModal(this._modal);
            this._modal = null;
        }
    }

    _destroyWidgets() {
        logger.debug(`Destroying ${this._widgets.length} widgets`);
        for (const widget of this._widgets.reverse()) {
            if (widget) {
                widget.destroy();
            }
        }
        this._widgets = [];

        if (this._dialogCard) {
            this._dialogCard.destroy();
            this._dialogCard = null;
        }

        this._signalTracker = null;
    }

    _releaseBoundFunctions() {
        this._boundHandleContainerClick = null;
        this._boundHandleKeyPress = null;
        this._boundOnClose = null;
    }

    _destroyContainer() {
        if (this._container) {
            Main.uiGroup.remove_child(this._container);
            this._container.destroy();
            this._container = null;
        }
    }

    _cleanupThemeManager() {
        if (this._themeManager) {
            this._themeManager.destroy();
            this._themeManager = null;
        }
    }
}
