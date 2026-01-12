/**
 * Layout Settings Diagnostic Dialog
 *
 * Minimal dialog for isolating memory leaks in layoutSettingsDialog.
 * Uses boolean flags to enable/disable individual controls.
 * Follows all memory best practices: SignalTracker, module-level handlers,
 * proper cleanup, no closures.
 */

import Clutter from '@girs/clutter-14';
import St from '@girs/st-14';
import GLib from '@girs/glib-2.0';
import Shell from '@girs/shell-14';
import Gio from '@girs/gio-2.0';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {createLogger} from '../utils/debug';
import {SignalTracker} from '../utils/signalTracker';
import {ThemeManager} from '../utils/theme';

const logger = createLogger('LayoutSettingsDiagnostic');

// Instance tracking to detect dialog accumulation
let instanceCounter = 0;
let activeInstances = 0;

// CONTROL FLAGS - Toggle these to isolate memory leaks
const ENABLE_CONTROLS = {
    labels: true,          // ✅ SAFE - No leaks (basic controls test: R²=0.475 PASS)
    buttons: true,         // ✅ SAFE - No leaks (basic controls test: R²=0.475 PASS)
    iconButtons: true,     // ✅ SAFE - No leaks (tested with basic: R²=0.713 PASS)
    entries: true,         // ✅ SAFE - No leaks (basic controls test: R²=0.475 PASS)
    checkboxes: false,     // ⚠️ UNCERTAIN - Borderline leak (Test 4: R²=0.650, needs retest)
    spinners: false,       // ❌ LEAKS - When combined with basic (+5.300 MB/100, R²=0.898)
    //    BUT passes alone (+3.506 MB/100, R²=0.720 PASS) - INVESTIGATION NEEDED
    dropdowns: false,      // ❌ LEAKS - Strong leak (+5.243 MB/100, R²=0.898 FAIL)
    //    Fixes applied in code but may not be deployed
    hoverEffects: true,    // ✅ FIXED - Latest test: +2.636 MB/100, R²=0.779 PASS
    //    Bound handler tracking working
    themeManager: true,    // ✅ SAFE - Test 3: +0.514 MB/100, R²=0.061 PASS
};

interface ColorScheme {
    containerBg: string;
    sectionBg: string;
    sectionBorder: string;
    textPrimary: string;
    textSecondary: string;
    inputBg: string;
    inputBorder: string;
    buttonBg: string;
    buttonBgHover: string;
    buttonText: string;
    accentHex: string;
}

interface SpinnerContainer extends St.BoxLayout {
    _valueLabel?: St.Label;
    _value?: number;
    _min?: number;
    _max?: number;
    _step?: number;
}

interface DropdownContainer extends St.BoxLayout {
    _valueLabel?: St.Label;
    _options?: string[];
    _selectedIndex?: number;
}

interface CheckboxButton extends St.Button {
    _checked?: boolean;
}

/**
 * Module-level handler functions to prevent closure leaks
 * Following layoutSettingsDialog's proven pattern
 */

function handleButtonClick(): void {
    logger.debug('Diagnostic button clicked');
}

function handleWidgetHoverEnter(widget: St.Widget, hoverStyle: string): boolean {
    widget.style = hoverStyle;
    return Clutter.EVENT_PROPAGATE;
}

function handleWidgetHoverLeave(widget: St.Widget, normalStyle: string): boolean {
    widget.style = normalStyle;
    return Clutter.EVENT_PROPAGATE;
}

function handleUpButtonClick(container: SpinnerContainer | DropdownContainer, valueLabel: St.Label, optionsOrMax: string[] | number, step: number | undefined): void {
    if (Array.isArray(optionsOrMax)) {
        // Dropdown
        const dropdown = container as DropdownContainer;
        dropdown._selectedIndex = ((dropdown._selectedIndex || 0) + 1) % optionsOrMax.length;
        valueLabel.text = optionsOrMax[dropdown._selectedIndex];
    } else {
        // Spinner
        const spinner = container as SpinnerContainer;
        const max = optionsOrMax;
        if ((spinner._value || 0) < max) {
            spinner._value = Math.min(max, (spinner._value || 0) + (step || 1));
            valueLabel.text = String(spinner._value);
        }
    }
}

function handleDownButtonClick(container: SpinnerContainer | DropdownContainer, valueLabel: St.Label, optionsOrMin: string[] | number, step: number | undefined): void {
    if (Array.isArray(optionsOrMin)) {
        // Dropdown
        const dropdown = container as DropdownContainer;
        const options = optionsOrMin;
        dropdown._selectedIndex = ((dropdown._selectedIndex || 0) - 1 + options.length) % options.length;
        valueLabel.text = options[dropdown._selectedIndex!];
    } else {
        // Spinner
        const spinner = container as SpinnerContainer;
        const min = optionsOrMin;
        if ((spinner._value || 0) > min) {
            spinner._value = Math.max(min, (spinner._value || 0) - (step || 1));
            valueLabel.text = String(spinner._value);
        }
    }
}

/**
 * Diagnostic Dialog for Memory Leak Testing
 */
export class LayoutSettingsDiagnostic {
    private _settings: Gio.Settings;
    private _themeManager: ThemeManager | null;
    private _widgets: St.Widget[];
    private _signalTracker: SignalTracker | null;
    private _idleSourceIds: number[];
    private _boundHandlers: ((...args: any[]) => any)[];
    private _container: St.Widget | null;
    private _dialogCard: St.BoxLayout | null;
    private _modal: any;
    private _visible: boolean;
    private _closing: boolean;
    private _boundHandleContainerClick: ((actor: St.Widget, event: Clutter.Event) => boolean) | null;
    private _boundHandleKeyPress: ((actor: St.Widget, event: Clutter.Event) => boolean) | null;
    private _boundOnClose: (() => void) | null;
    private _instanceId: number;

    constructor(settings: Gio.Settings) {
        this._settings = settings;
        this._themeManager = ENABLE_CONTROLS.themeManager ? new ThemeManager(settings) : null;

        // Widget tracking
        this._widgets = [];

        // Signal tracking
        this._signalTracker = new SignalTracker('LayoutSettingsDiagnostic');

        // Source tracking
        this._idleSourceIds = [];

        // Bound handler tracking (for closures that capture widget references)
        this._boundHandlers = [];

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

        // Track instance creation
        this._instanceId = ++instanceCounter;
        activeInstances++;
        logger.debug(`LayoutSettingsDiagnostic #${this._instanceId} created. Active instances: ${activeInstances}`, ENABLE_CONTROLS);
    }

    open(): void {
        if (this._visible) {
            logger.warn('Diagnostic dialog already visible');
            return;
        }

        // Reset bound handlers array at start of each open to prevent accumulation
        this._boundHandlers = [];

        const monitor = (Main.layoutManager as any).currentMonitor;
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
        this._signalTracker!.connect(
            this._container, 'button-press-event', this._boundHandleContainerClick,
        );

        // Build dialog
        this._buildDialogCard(colors);

        // Add to container
        this._container.add_child(this._dialogCard!);

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
            (Main.uiGroup as any).add_child(this._container);

            return GLib.SOURCE_REMOVE;
        });
        this._idleSourceIds.push(positionSourceId);

        // Push modal
        const modalSourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            if (this._closing || !this._visible || !this._container) {
                return GLib.SOURCE_REMOVE;
            }

            try {
                this._modal = (Main as any).pushModal(this._container, {
                    actionMode: Shell.ActionMode.NORMAL,
                });
                if (!this._modal) {
                    logger.error('Failed to acquire modal');
                }
            } catch (e) {
                logger.error(`Exception acquiring modal: ${(e as Error).message}`);
                this._modal = null;
            }

            return GLib.SOURCE_REMOVE;
        });
        this._idleSourceIds.push(modalSourceId);

        // Connect key handler
        this._signalTracker!.connect(
            this._container, 'key-press-event', this._boundHandleKeyPress,
        );

        this._visible = true;
        logger.debug('Diagnostic dialog opened');
    }

    close(): void {
        if (!this._visible || this._closing) {
            return;
        }
        this._closing = true;

        this._cleanupIdleSources();
        this._cleanupModal();
        this._signalTracker!.disconnectAll();
        this._destroyWidgets();
        this._releaseBoundFunctions();
        this._destroyContainer();
        this._cleanupThemeManager();

        this._visible = false;

        // Track instance destruction
        activeInstances--;
        logger.debug(`LayoutSettingsDiagnostic #${this._instanceId} closed. Active instances: ${activeInstances}`);
    }

    private _buildDialogCard(colors: any): void {
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
        const closeBtn = this._createButton(colors, 'Close', this._boundOnClose!);
        this._dialogCard.add_child(closeBtn);
        this._widgets.push(closeBtn);
    }

    private _createSection(colors: any): St.BoxLayout {
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

    private _createButton(colors: any, label: string, onClick: () => void): St.Button {
        const normalStyle = 'padding: 10px 24px; background-color: ' + colors.buttonBg + '; ' +
                           'color: ' + colors.buttonText + '; border-radius: 6px; border: 1px solid ' + colors.sectionBorder + ';';
        const hoverStyle = 'padding: 10px 24px; background-color: ' + colors.buttonBgHover + '; ' +
                          'color: ' + colors.buttonText + '; border-radius: 6px; border: 1px solid ' + colors.sectionBorder + ';';

        const button = new St.Button({
            label: label,
            style: normalStyle,
            can_focus: true,
        });

        this._signalTracker!.connect(button, 'clicked', onClick);

        if (ENABLE_CONTROLS.hoverEffects) {
            const boundEnter = handleWidgetHoverEnter.bind(null, button, hoverStyle);
            const boundLeave = handleWidgetHoverLeave.bind(null, button, normalStyle);
            this._boundHandlers.push(boundEnter, boundLeave);
            this._signalTracker!.connect(button, 'enter-event', boundEnter);
            this._signalTracker!.connect(button, 'leave-event', boundLeave);
        }

        return button;
    }

    private _createIconButton(colors: any): St.Button {
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

        this._signalTracker!.connect(button, 'clicked', handleButtonClick);

        if (ENABLE_CONTROLS.hoverEffects) {
            const boundEnter = handleWidgetHoverEnter.bind(null, button, hoverStyle);
            const boundLeave = handleWidgetHoverLeave.bind(null, button, normalStyle);
            this._boundHandlers.push(boundEnter, boundLeave);
            this._signalTracker!.connect(button, 'enter-event', boundEnter);
            this._signalTracker!.connect(button, 'leave-event', boundLeave);
        }

        return button;
    }

    private _createCheckbox(colors: any): CheckboxButton {
        const checked = true;
        const checkbox: CheckboxButton = new St.Button({
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

    private _createSpinner(colors: any): SpinnerContainer {
        const container: SpinnerContainer = new St.BoxLayout({
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
        this._boundHandlers.push(boundUpClick);
        this._signalTracker!.connect(upButton, 'clicked', boundUpClick);

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
        this._boundHandlers.push(boundDownClick);
        this._signalTracker!.connect(downButton, 'clicked', boundDownClick);

        buttonsBox.add_child(downButton);
        // Don't push downButton to _widgets - it's a child of buttonsBox

        container.add_child(buttonsBox);
        // Don't push buttonsBox to _widgets - it's a child of container

        return container;
    }

    private _createDropdown(colors: any): DropdownContainer {
        const options = ['Option 1', 'Option 2', 'Option 3'];
        const container: DropdownContainer = new St.BoxLayout({
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
        this._boundHandlers.push(boundUpClick);
        this._signalTracker!.connect(upButton, 'clicked', boundUpClick);

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
        this._boundHandlers.push(boundDownClick);
        this._signalTracker!.connect(downButton, 'clicked', boundDownClick);

        buttonsBox.add_child(downButton);
        // Don't push downButton to _widgets - it's a child of buttonsBox

        container.add_child(buttonsBox);
        // Don't push buttonsBox to _widgets - it's a child of container

        return container;
    }

    private _getDefaultColors(): ColorScheme {
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

    private _handleContainerClick(actor: St.Widget, event: Clutter.Event): boolean {
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

    private _handleKeyPress(actor: St.Widget, event: Clutter.Event): boolean {
        const symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Escape) {
            this._onClose();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    private _onClose(): void {
        if (this._closing || !this._visible) {
            return;
        }
        logger.info('Diagnostic dialog closing');
        this.close();
    }

    private _cleanupIdleSources(): void {
        logger.debug(`Removing ${this._idleSourceIds.length} idle sources`);
        for (const sourceId of this._idleSourceIds) {
            GLib.Source.remove(sourceId);
        }
        this._idleSourceIds = [];
    }

    private _cleanupModal(): void {
        if (this._modal) {
            (Main as any).popModal(this._modal);
            this._modal = null;
        }
    }

    private _destroyWidgets(): void {
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

    private _releaseBoundFunctions(): void {
        logger.debug(`Releasing ${this._boundHandlers.length} bound handlers`);
        this._boundHandlers = [];
        this._boundHandleContainerClick = null;
        this._boundHandleKeyPress = null;
        this._boundOnClose = null;
    }

    private _destroyContainer(): void {
        if (this._container) {
            (Main.uiGroup as any).remove_child(this._container);
            this._container.destroy();
            this._container = null;
        }
    }

    private _cleanupThemeManager(): void {
        if (this._themeManager) {
            this._themeManager.destroy();
            this._themeManager = null;
        }
    }
}
