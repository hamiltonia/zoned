/**
 * Preferences for Zoned extension
 *
 * This file provides the preferences UI shown in GNOME Extensions app.
 * Includes editable keyboard shortcuts with capture functionality.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {
    GNOME_BINDINGS,
    normalizeAccelerator,
} from './utils/keybindingConfig.js';
import {getExtensionVersion} from './utils/versionUtil.js';

// Debug logging for prefs (console.log goes to journalctl)
// Reads debug-logging setting to gate verbose output
let _debugLoggingEnabled = null;

function isDebugEnabled() {
    if (_debugLoggingEnabled === null) {
        try {
            const settings = new Gio.Settings({schema_id: 'org.gnome.shell.extensions.zoned'});
            _debugLoggingEnabled = settings.get_boolean('debug-logging');
            // Watch for changes (Wave 4: bound method)
            const boundHandler = handleDebugLoggingChanged.bind(null, settings);
            settings.connect('changed::debug-logging', boundHandler);
        } catch {
            _debugLoggingEnabled = false;
        }
    }
    return _debugLoggingEnabled;
}

function log(msg) {
    if (isDebugEnabled()) {
        console.log(`[Zoned Prefs] ${msg}`);
    }
}

/**
 * Module-level signal handlers (Wave 4: avoid arrow function closures)
 */

// Handler for debug-logging setting change
function handleDebugLoggingChanged(settings) {
    _debugLoggingEnabled = settings.get_boolean('debug-logging');
}

// ShortcutCaptureRow signal handlers
function handleWarningButtonClicked(row) {
    row._showConflictDialog();
}

function handleResetButtonClicked(row) {
    log(`Reset clicked for ${row._settingsKey}`);
    row._resetToDefault();
}

function handleModifierToggled(row) {
    row._onModifierChanged();
}

function handleRecordButtonClicked(row) {
    log(`Record clicked for ${row._settingsKey}`);
    row._startCapture();
}

function handleKeyControllerKeyPressed(row, ctrl, keyval, keycode, state) {
    log(`key-pressed event: keyval=${keyval}, keycode=${keycode}, state=${state}, capturing=${row._isCapturing}`);
    if (!row._isCapturing) {
        log('Not capturing, propagating event');
        return false; // Gdk.EVENT_PROPAGATE
    }
    return row._onKeyPressed(keyval, keycode, state);
}

function handleFocusControllerLeave(row) {
    log(`Focus LEAVE on record button for ${row._settingsKey}, capturing=${row._isCapturing}`);
    if (row._isCapturing) {
        row._stopCapture();
    }
}

function handleSettingsChanged(row) {
    log(`Settings changed for ${row._settingsKey}`);
    row._loadFromSettings();
}

function handleConflictCountChanged(row) {
    log(`Conflict count changed externally for ${row._settingsKey}, refreshing display`);
    row._updateDisplay();
}

function handleDialogResponse(row, conflict, dlg, response) {
    if (response === 'fix') {
        row._fixConflict(conflict);
    }
}

// _createQuickLayoutRow signal handlers
function handleQuickLayoutResetClicked(row, shiftCheck, ctrlCheck, superCheck, altCheck, saveQuickLayoutShortcuts) {
    row._loadingFromSettings = true;
    shiftCheck.set_active(false);
    ctrlCheck.set_active(true);
    superCheck.set_active(true);
    altCheck.set_active(true);
    row._loadingFromSettings = false;
    saveQuickLayoutShortcuts();
}

function handleQuickLayoutSettingsChanged(loadFromSettings) {
    loadFromSettings();
}

// fillPreferencesWindow signal handlers
function handleThemeRowSelected(prefs, themeMapping, themeRow, settings) {
    const newTheme = themeMapping[themeRow.get_selected()];
    settings.set_string('ui-theme', newTheme);
    // Apply theme immediately to this preferences window
    prefs._applyTheme(newTheme);
}

function handleTierRowSelected(tierRow, settings) {
    const newTier = tierRow.get_selected();
    settings.set_int('option-force-tier', newTier);
}

function handleDurationRowSelected(durationMapping, durationRow, settings) {
    settings.set_int('notification-duration', durationMapping[durationRow.get_selected()]);
}

function handleSizeRowSelected(sizeMapping, sizeRow, settings) {
    settings.set_string('center-notification-size', sizeMapping[sizeRow.get_selected()]);
}

function handleOpacityScaleChanged(opacityScale, settings) {
    settings.set_int('center-notification-opacity', Math.round(opacityScale.get_value()));
}

function handlePreviewButtonClicked(settings) {
    log('Preview button clicked - triggering center notification');
    // Trigger preview via GSettings flag (extension will show notification)
    settings.set_boolean('center-notification-preview', true);
}

function handleCategoryRowSelected(settingsKey, styleMapping, row, settings) {
    settings.set_string(settingsKey, styleMapping[row.get_selected()]);
}

function handleGithubButtonClicked() {
    Gtk.show_uri(null, 'https://github.com/hamiltonia/zoned', Gdk.CURRENT_TIME);
}

function handleCoffeeButtonClicked() {
    Gtk.show_uri(null, 'https://buymeacoffee.com/hamiltonia', Gdk.CURRENT_TIME);
}

function handleResetDialogResponse(prefs, settings, window, dlg, response) {
    if (response === 'reset') {
        log('Resetting all settings to defaults');
        prefs._resetAllSettings(settings);
        // Close the preferences window after reset
        window.close();
    }
}

function handleResetDebugButtonClicked(settings, developerGroup) {
    log('Resetting all debug settings to defaults');
    // Reset all debug settings to their defaults
    settings.reset('debug-logging');
    settings.reset('memory-debug');
    settings.reset('debug-layout-rects');
    settings.reset('debug-layout-overlay');
    settings.reset('option-force-tier');
    // Hide the developer section
    settings.set_boolean('developer-mode-revealed', false);
    developerGroup.visible = false;
}

function handleDevKeyPressed(settings, developerGroup, ctrl, keyval, keycode, state) {
    // Check for Ctrl+Shift+D
    const ctrlPressed = (state & Gdk.ModifierType.CONTROL_MASK) !== 0;
    const shiftPressed = (state & Gdk.ModifierType.SHIFT_MASK) !== 0;
    const isDKey = keyval === Gdk.KEY_d || keyval === Gdk.KEY_D;

    if (ctrlPressed && shiftPressed && isDKey) {
        const isCurrentlyRevealed = settings.get_boolean('developer-mode-revealed');
        if (isCurrentlyRevealed) {
            // Hide developer section and reset all debug settings
            // This prevents users from accidentally leaving debug features on
            log('Developer mode hidden via Ctrl+Shift+D');
            settings.reset('debug-logging');
            settings.reset('debug-layout-rects');
            settings.reset('debug-layout-overlay');
            settings.set_boolean('developer-mode-revealed', false);
            developerGroup.visible = false;
        } else {
            // Reveal developer section
            log('Developer mode revealed via Ctrl+Shift+D');
            settings.set_boolean('developer-mode-revealed', true);
            developerGroup.visible = true;
            // Scroll to the developer section
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                developerGroup.grab_focus();
                return GLib.SOURCE_REMOVE;
            });
        }
        return true; // Event handled
    }
    return false; // Propagate event
}

function handleScrollTargetChanged(scrollToSection, settings) {
    const newTarget = settings.get_string('prefs-scroll-target');
    if (newTarget) {
        log(`Scroll target changed to: ${newTarget}`);
        settings.set_string('prefs-scroll-target', '');
        scrollToSection(newTarget);
    }
}

function handleCloseRequestChanged(settings, window) {
    if (settings.get_boolean('prefs-close-requested')) {
        log('Close requested by extension, closing prefs window');
        // Reset the flag
        settings.set_boolean('prefs-close-requested', false);
        // Close the window
        window.close();
    }
}

function handleWindowCloseRequest(settings, closeRequestSignal, scrollTargetSignal) {
    settings.disconnect(closeRequestSignal);
    settings.disconnect(scrollTargetSignal);
    return false; // Allow window to close
}

/**
 * Keybinding definitions with metadata
 * Order: Layout picker first, then zone navigation
 */
const KEYBINDINGS = [
    {
        key: 'show-layout-picker',
        title: 'Open Layout Picker',
        subtitle: 'Show the layout selection dialog (press 1-9 for quick select)',
        default: '<Super>grave',
    },
    {
        key: 'cycle-zone-left',
        title: 'Move Window to Previous Zone',
        subtitle: 'Move the focused window to the previous zone in the current layout',
        default: '<Super>Left',
    },
    {
        key: 'cycle-zone-right',
        title: 'Move Window to Next Zone',
        subtitle: 'Move the focused window to the next zone in the current layout',
        default: '<Super>Right',
    },
];

/**
 * Enhanced Windows Management keybindings (optional feature)
 * These are only active when enhanced-window-management-enabled is true
 */
const ENHANCED_KEYBINDINGS = [
    {
        key: 'minimize-window',
        title: 'Minimize / Restore',
        subtitle: 'Minimize focused window. Press again to restore.',
        default: '<Super>Down',
    },
    {
        key: 'maximize-window',
        title: 'Maximize / Restore',
        subtitle: 'Restore minimized window, or toggle maximize on focused window.',
        default: '<Super>Up',
    },
];

/**
 * Key display name mapping for human-readable shortcuts
 * Converts GTK key names to user-friendly symbols/names
 */
const KEY_DISPLAY_MAP = {
    'Left': '←',
    'Right': '→',
    'Up': '↑',
    'Down': '↓',
    'grave': '`',
    'asciitilde': '~',
    'space': 'Space',
    'Return': 'Enter',
    'Tab': 'Tab',
    'Escape': 'Esc',
    'BackSpace': 'Backspace',
    'Delete': 'Delete',
    'Home': 'Home',
    'End': 'End',
    'Page_Up': 'Page Up',
    'Page_Down': 'Page Down',
};

/**
 * Convert Gtk accelerator string to human-readable format
 * e.g., '<Super>Left' -> 'Super + ←'
 */
function acceleratorToLabel(accelerator) {
    if (!accelerator || accelerator === '') {
        return 'Disabled';
    }

    const parsed = parseAccelerator(accelerator);
    if (!parsed) {
        return accelerator;
    }

    const {keyval, mods} = parsed;

    // Build modifier string (keyboard order: Shift, Ctrl, Super, Alt)
    const parts = [];

    if (mods & Gdk.ModifierType.SHIFT_MASK) parts.push('Shift');
    if (mods & Gdk.ModifierType.CONTROL_MASK) parts.push('Ctrl');
    if (mods & Gdk.ModifierType.SUPER_MASK) parts.push('Super');
    if (mods & Gdk.ModifierType.ALT_MASK) parts.push('Alt');

    // Get key name and prettify using lookup table
    const keyName = Gdk.keyval_name(keyval);
    parts.push(KEY_DISPLAY_MAP[keyName] || keyName);

    return parts.join(' + ');
}

/**
 * Parse accelerator string into keyval and modifiers
 * @param {string} accelerator - The accelerator string
 * @returns {Object|null} {keyval, mods} or null if parsing fails
 */
function parseAccelerator(accelerator) {
    if (!accelerator) return null;

    try {
        const result = Gtk.accelerator_parse(accelerator);
        if (Array.isArray(result)) {
            if (result.length === 3) {
                const [success, keyval, mods] = result;
                if (!success || keyval === 0) return null;
                return {keyval, mods};
            } else if (result.length === 2) {
                const [keyval, mods] = result;
                if (keyval === 0) return null;
                return {keyval, mods};
            }
        }
    } catch (e) {
        log(`Error parsing accelerator '${accelerator}': ${e.message}`);
    }
    return null;
}

// KEY_ALIASES and normalizeAccelerator are imported from utils/keybindingConfig.js

/**
 * Check if two accelerators are equivalent (same key + same modifiers)
 * This handles different modifier ordering in strings and key name aliases
 * @param {string} accel1 - First accelerator
 * @param {string} accel2 - Second accelerator
 * @returns {boolean} True if they represent the same shortcut
 */
function acceleratorsMatch(accel1, accel2) {
    // Normalize both accelerators to use canonical key names
    const norm1 = normalizeAccelerator(accel1);
    const norm2 = normalizeAccelerator(accel2);

    log(`acceleratorsMatch: comparing '${accel1}' (→'${norm1}') with '${accel2}' (→'${norm2}')`);

    const parsed1 = parseAccelerator(norm1);
    const parsed2 = parseAccelerator(norm2);

    if (!parsed1) {
        log(`  Failed to parse accel1: ${norm1}`);
        return false;
    }
    if (!parsed2) {
        log(`  Failed to parse accel2: ${norm2}`);
        return false;
    }

    const match = parsed1.keyval === parsed2.keyval && parsed1.mods === parsed2.mods;
    log(`  parsed1: keyval=${parsed1.keyval}, mods=${parsed1.mods}`);
    log(`  parsed2: keyval=${parsed2.keyval}, mods=${parsed2.mods}`);
    log(`  match: ${match}`);

    return match;
}

/**
 * Check for keybinding conflicts with GNOME system shortcuts
 * Uses shared GNOME_BINDINGS from utils/keybindingConfig.js
 * @param {string} accelerator - The accelerator to check
 * @param {string} currentKey - The settings key being edited (to exclude self)
 * @returns {Object|null} Conflict info or null
 */
function checkConflicts(accelerator, _currentKey) {
    if (!accelerator) return null;

    // Use shared GNOME_BINDINGS from keybindingConfig.js
    for (const gnome of GNOME_BINDINGS) {
        try {
            const schema = new Gio.Settings({schema: gnome.schema});
            const bindings = schema.get_strv(gnome.key);

            for (const binding of bindings) {
                // Use parsed comparison instead of string comparison
                if (binding && acceleratorsMatch(accelerator, binding)) {
                    log(`Conflict found: ${accelerator} matches ${binding} (${gnome.name})`);
                    return {
                        schema: gnome.schema,
                        key: gnome.key,
                        name: gnome.name,
                        binding: binding,
                    };
                }
            }
        } catch {
            // Schema not available, skip
        }
    }

    return null;
}

/**
 * ShortcutCaptureRow - A preference row for configuring keyboard shortcuts
 * VS Code-style: Modifier checkboxes + key capture button
 * This avoids issues with system shortcuts intercepting key combinations.
 */
const ShortcutCaptureRow = GObject.registerClass({
    GTypeName: 'ZonedShortcutCaptureRow',
}, class ShortcutCaptureRow extends Adw.PreferencesRow {
    /**
     * @param {Object} params
     * @param {string} params.title - Row title
     * @param {string} params.subtitle - Row description
     * @param {Gio.Settings} params.settings - GSettings object
     * @param {string} params.settingsKey - The settings key for this keybinding
     * @param {string} params.defaultAccelerator - Default accelerator value
     */
    _init(params) {
        const {title, subtitle, settings, settingsKey, defaultAccelerator, ...rest} = params;

        super._init(rest);

        this._settings = settings;
        this._settingsKey = settingsKey;
        this._defaultAccelerator = defaultAccelerator;
        this._isCapturing = false;
        this._currentKeyval = 0; // Currently selected key (unshifted)

        log(`ShortcutCaptureRow._init for key: ${settingsKey}`);

        // Main content box (vertical)
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 8,
            margin_bottom: 8,
            margin_start: 12,
            margin_end: 12,
        });

        // Header row: Title + reset button + warning
        const headerBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
        });

        // Title label
        const titleLabel = new Gtk.Label({
            label: title,
            xalign: 0,
            hexpand: true,
        });
        titleLabel.add_css_class('title');
        headerBox.append(titleLabel);

        // Conflict warning button (hidden by default) - clickable to fix
        this._warningButton = new Gtk.Button({
            icon_name: 'dialog-warning-symbolic',
            visible: false,
            tooltip_text: 'Click to resolve conflict',
            valign: Gtk.Align.CENTER,
        });
        this._warningButton.add_css_class('flat');
        this._warningButton.add_css_class('warning');
        // Wave 4: bound method
        const boundWarningClick = handleWarningButtonClicked.bind(null, this);
        this._warningButton.connect('clicked', boundWarningClick);
        this._boundWarningClick = boundWarningClick;
        headerBox.append(this._warningButton);

        // Store conflict info for dialog
        this._currentConflict = null;

        // Reset button (undo icon)
        this._resetButton = new Gtk.Button({
            icon_name: 'edit-undo-symbolic',
            tooltip_text: 'Reset to default',
        });
        this._resetButton.add_css_class('flat');
        // Wave 4: bound method
        const boundResetClick = handleResetButtonClicked.bind(null, this);
        this._resetButton.connect('clicked', boundResetClick);
        this._boundResetClick = boundResetClick;
        headerBox.append(this._resetButton);

        mainBox.append(headerBox);

        // Controls row: Modifier checkboxes + Record Key button
        const controlsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
        });

        // Modifier checkboxes (keyboard order: Shift, Ctrl, Super, Alt)
        this._shiftCheck = new Gtk.CheckButton({label: 'Shift'});
        this._ctrlCheck = new Gtk.CheckButton({label: 'Ctrl'});
        this._superCheck = new Gtk.CheckButton({label: 'Super'});
        this._altCheck = new Gtk.CheckButton({label: 'Alt'});

        // Connect checkbox changes to update accelerator (Wave 4: bound methods)
        const boundModifierToggled = handleModifierToggled.bind(null, this);
        this._shiftCheck.connect('toggled', boundModifierToggled);
        this._ctrlCheck.connect('toggled', boundModifierToggled);
        this._superCheck.connect('toggled', boundModifierToggled);
        this._altCheck.connect('toggled', boundModifierToggled);
        this._boundModifierToggled = boundModifierToggled;

        controlsBox.append(this._shiftCheck);
        controlsBox.append(this._ctrlCheck);
        controlsBox.append(this._superCheck);
        controlsBox.append(this._altCheck);

        // Spacer
        const spacer = new Gtk.Box({hexpand: true});
        controlsBox.append(spacer);

        // Record Key button
        this._recordButton = new Gtk.Button({
            label: 'Record Key',
            tooltip_text: 'Click to record a key',
        });
        // Wave 4: bound method
        const boundRecordClick = handleRecordButtonClicked.bind(null, this);
        this._recordButton.connect('clicked', boundRecordClick);
        this._boundRecordClick = boundRecordClick;
        controlsBox.append(this._recordButton);

        mainBox.append(controlsBox);

        // Current shortcut display row
        const displayBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
        });

        const currentLabel = new Gtk.Label({
            label: 'Current:',
            xalign: 0,
        });
        currentLabel.add_css_class('dim-label');
        displayBox.append(currentLabel);

        this._shortcutLabel = new Gtk.Label({
            xalign: 0,
            hexpand: true,
        });
        this._shortcutLabel.add_css_class('shortcut-text');
        displayBox.append(this._shortcutLabel);

        mainBox.append(displayBox);

        // Conflict warning row (shown when there's a conflict)
        this._conflictBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            visible: false,
        });

        const conflictIcon = new Gtk.Image({
            icon_name: 'dialog-warning-symbolic',
        });
        conflictIcon.add_css_class('warning');
        this._conflictBox.append(conflictIcon);

        this._conflictLabel = new Gtk.Label({
            xalign: 0,
            hexpand: true,
            wrap: true,
        });
        this._conflictLabel.add_css_class('warning');
        this._conflictBox.append(this._conflictLabel);

        mainBox.append(this._conflictBox);

        // Subtitle/description label
        const subtitleLabel = new Gtk.Label({
            label: subtitle,
            xalign: 0,
            hexpand: true,
            wrap: true,
            wrap_mode: 2, // WORD_CHAR
        });
        subtitleLabel.add_css_class('dim-label');
        subtitleLabel.add_css_class('caption');
        mainBox.append(subtitleLabel);

        this.set_child(mainBox);

        // Event controller for key capture - attach to the record button
        this._keyController = new Gtk.EventControllerKey();
        // Wave 4: bound method
        const boundKeyPress = handleKeyControllerKeyPressed.bind(null, this);
        this._keyController.connect('key-pressed', boundKeyPress);
        this._boundKeyPress = boundKeyPress;
        this._recordButton.add_controller(this._keyController);

        log(`Key controller attached to record button for ${settingsKey}`);

        // Focus controller to handle blur during capture
        this._focusController = new Gtk.EventControllerFocus();
        // Wave 4: bound method
        const boundFocusLeave = handleFocusControllerLeave.bind(null, this);
        this._focusController.connect('leave', boundFocusLeave);
        this._boundFocusLeave = boundFocusLeave;
        this._recordButton.add_controller(this._focusController);

        // Initial update from settings
        this._loadFromSettings();

        // Listen for settings changes (Wave 4: bound methods)
        const boundSettingsChanged = handleSettingsChanged.bind(null, this);
        this._settingsChangedId = this._settings.connect(`changed::${this._settingsKey}`, boundSettingsChanged);
        this._boundSettingsChanged = boundSettingsChanged;

        // Listen for conflict count changes (reverse sync from panel menu "Fix All")
        const boundConflictCountChanged = handleConflictCountChanged.bind(null, this);
        this._conflictCountChangedId = this._settings.connect('changed::keybinding-conflict-count', boundConflictCountChanged);
        this._boundConflictCountChanged = boundConflictCountChanged;

        log(`ShortcutCaptureRow initialized for ${settingsKey}`);
    }

    /**
     * Get current accelerator from settings
     */
    _getCurrentAccelerator() {
        const values = this._settings.get_strv(this._settingsKey);
        const current = values.length > 0 ? values[0] : '';
        log(`_getCurrentAccelerator(${this._settingsKey}): ${current || '(empty)'}`);
        return current;
    }

    /**
     * Save accelerator to settings
     */
    _setAccelerator(accelerator) {
        log(`_setAccelerator(${this._settingsKey}): ${accelerator || '(empty)'}`);
        if (accelerator) {
            this._settings.set_strv(this._settingsKey, [accelerator]);
        } else {
            this._settings.set_strv(this._settingsKey, []);
        }
    }

    /**
     * Load current accelerator from settings and update checkboxes/key
     */
    _loadFromSettings() {
        const accelerator = this._getCurrentAccelerator();
        log(`_loadFromSettings(${this._settingsKey}): ${accelerator || '(empty)'}`);

        if (!accelerator) {
            // Clear everything
            this._superCheck.set_active(false);
            this._ctrlCheck.set_active(false);
            this._altCheck.set_active(false);
            this._shiftCheck.set_active(false);
            this._currentKeyval = 0;
            this._updateDisplay();
            return;
        }

        // Parse the accelerator
        let keyval, mods;
        try {
            const result = Gtk.accelerator_parse(accelerator);
            if (Array.isArray(result)) {
                if (result.length === 3) {
                    const [success, kv, m] = result;
                    if (!success) {
                        log(`Failed to parse accelerator: ${accelerator}`);
                        return;
                    }
                    keyval = kv;
                    mods = m;
                } else if (result.length === 2) {
                    [keyval, mods] = result;
                } else {
                    return;
                }
            } else {
                return;
            }
        } catch (e) {
            log(`Error parsing accelerator '${accelerator}': ${e.message}`);
            return;
        }

        // Set checkbox states based on modifiers (suppress change handler)
        this._loadingFromSettings = true;
        this._superCheck.set_active((mods & Gdk.ModifierType.SUPER_MASK) !== 0);
        this._ctrlCheck.set_active((mods & Gdk.ModifierType.CONTROL_MASK) !== 0);
        this._altCheck.set_active((mods & Gdk.ModifierType.ALT_MASK) !== 0);
        this._shiftCheck.set_active((mods & Gdk.ModifierType.SHIFT_MASK) !== 0);
        this._loadingFromSettings = false;

        // Store the key
        this._currentKeyval = keyval;

        this._updateDisplay();
    }

    /**
     * Handle modifier checkbox change - rebuild and save accelerator
     */
    _onModifierChanged() {
        // Don't rebuild during initial load
        if (this._loadingFromSettings) return;

        log(`_onModifierChanged for ${this._settingsKey}`);
        this._buildAndSaveAccelerator();
    }

    /**
     * Build accelerator from checkbox states and current key, then save
     */
    _buildAndSaveAccelerator() {
        // If no key is set, can't build accelerator
        if (!this._currentKeyval) {
            log('No key set, cannot build accelerator');
            this._setAccelerator('');
            this._updateDisplay();
            return;
        }

        // Build modifier mask from checkboxes
        let mods = 0;
        if (this._superCheck.get_active()) mods |= Gdk.ModifierType.SUPER_MASK;
        if (this._ctrlCheck.get_active()) mods |= Gdk.ModifierType.CONTROL_MASK;
        if (this._altCheck.get_active()) mods |= Gdk.ModifierType.ALT_MASK;
        if (this._shiftCheck.get_active()) mods |= Gdk.ModifierType.SHIFT_MASK;

        // Build accelerator string
        const accelerator = Gtk.accelerator_name(this._currentKeyval, mods);
        log(`Built accelerator from checkboxes: ${accelerator}`);

        this._setAccelerator(accelerator);
        this._updateDisplay();

        // Notify extension to re-check conflicts (async to ensure GSettings write completes)
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            this._signalConflictChange();
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * Update the display labels and conflict indicators
     */
    _updateDisplay() {
        const current = this._getCurrentAccelerator();
        const label = acceleratorToLabel(current);

        log(`_updateDisplay(${this._settingsKey}): capturing=${this._isCapturing}, label=${label}`);

        if (this._isCapturing) {
            this._recordButton.set_label('Press key...');
            this._recordButton.add_css_class('suggested-action');
            this._shortcutLabel.set_label('Recording...');
            this._shortcutLabel.add_css_class('capturing');
        } else {
            // Show current key on button if set
            if (this._currentKeyval) {
                const keyName = Gdk.keyval_name(this._currentKeyval);
                const prettyKeyName = this._prettifyKeyName(keyName);
                this._recordButton.set_label(prettyKeyName);
            } else {
                this._recordButton.set_label('Record Key');
            }
            this._recordButton.remove_css_class('suggested-action');
            this._shortcutLabel.set_label(label);
            this._shortcutLabel.remove_css_class('capturing');
        }

        // Show/hide reset button based on whether it's the default
        const isDefault = current === this._defaultAccelerator;
        this._resetButton.visible = !isDefault;
        log(`Reset button visible: ${!isDefault}`);

        // Check for conflicts and show inline warning
        const conflict = checkConflicts(current, this._settingsKey);
        if (conflict) {
            this._currentConflict = conflict;
            this._warningButton.visible = true;
            this._warningButton.tooltip_text = `Conflicts with: ${conflict.name}\nClick to fix`;
            this._conflictBox.visible = true;
            this._conflictLabel.set_label(`Conflicts with: ${conflict.name} - click ⚠ to fix`);
            log(`Conflict detected: ${conflict.name}`);
        } else {
            this._currentConflict = null;
            this._warningButton.visible = false;
            this._conflictBox.visible = false;
        }
    }

    /**
     * Prettify key name for display
     */
    _prettifyKeyName(keyName) {
        return KEY_DISPLAY_MAP[keyName] || keyName;
    }

    /**
     * Start capturing keyboard input (key only, not modifiers)
     */
    _startCapture() {
        if (this._isCapturing) {
            log(`Already capturing for ${this._settingsKey}`);
            return;
        }

        log(`>>> Starting capture for ${this._settingsKey}`);
        this._isCapturing = true;
        this._updateDisplay();

        // Grab focus to receive key events
        const grabbed = this._recordButton.grab_focus();
        log(`Focus grabbed: ${grabbed}`);
    }

    /**
     * Stop capturing keyboard input
     */
    _stopCapture() {
        log(`<<< Stopping capture for ${this._settingsKey}`);
        this._isCapturing = false;
        this._updateDisplay();
    }

    /**
     * Handle key press during capture - only captures non-modifier keys
     * Uses keycode to get the base (unshifted) key
     */
    _onKeyPressed(keyval, keycode, state) {
        log(`_onKeyPressed: keyval=${keyval} (${Gdk.keyval_name(keyval)}), keycode=${keycode}, state=${state}`);

        // Handle special keys
        if (keyval === Gdk.KEY_Escape) {
            log('Escape pressed - canceling');
            this._stopCapture();
            return true; // Gdk.EVENT_STOP
        }

        if (keyval === Gdk.KEY_BackSpace) {
            log('Backspace pressed - clearing key');
            this._currentKeyval = 0;
            this._buildAndSaveAccelerator();
            this._stopCapture();
            return true;
        }

        // Ignore modifier-only key presses
        if (this._isModifierKey(keyval)) {
            log('Modifier key pressed - ignoring');
            return true;
        }

        // Get the base (unshifted) keyval using keycode
        // This handles grave vs asciitilde, 1 vs !, etc.
        let baseKeyval = keyval;
        try {
            const display = Gdk.Display.get_default();
            // translate_key returns [success, keyval, effective_group, level, consumed_modifiers]
            const result = display.translate_key(keycode, 0, 0);
            if (result && result[0]) {
                baseKeyval = result[1];
                log(`Translated keycode ${keycode} to base keyval: ${baseKeyval} (${Gdk.keyval_name(baseKeyval)})`);
            }
        } catch (e) {
            log(`Could not translate keycode, using original keyval: ${e.message}`);
        }

        // Store the base key
        this._currentKeyval = baseKeyval;
        log(`Captured key: ${Gdk.keyval_name(baseKeyval)}`);

        // Build and save the accelerator with current checkbox states
        this._buildAndSaveAccelerator();
        this._stopCapture();
        return true;
    }

    /**
     * Check if keyval is a modifier key
     */
    _isModifierKey(keyval) {
        const modifierKeys = [
            Gdk.KEY_Shift_L, Gdk.KEY_Shift_R,
            Gdk.KEY_Control_L, Gdk.KEY_Control_R,
            Gdk.KEY_Alt_L, Gdk.KEY_Alt_R,
            Gdk.KEY_Super_L, Gdk.KEY_Super_R,
            Gdk.KEY_Meta_L, Gdk.KEY_Meta_R,
            Gdk.KEY_Hyper_L, Gdk.KEY_Hyper_R,
            Gdk.KEY_ISO_Level3_Shift, // AltGr
        ];
        return modifierKeys.includes(keyval);
    }

    /**
     * Reset to default value
     */
    _resetToDefault() {
        log(`Resetting ${this._settingsKey} to default: ${this._defaultAccelerator}`);
        this._setAccelerator(this._defaultAccelerator);

        // Notify extension to re-check conflicts (async to ensure GSettings write completes)
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            this._signalConflictChange();
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * Show conflict resolution dialog
     */
    _showConflictDialog() {
        if (!this._currentConflict) {
            log('No conflict to show');
            return;
        }

        const conflict = this._currentConflict;
        log(`Showing conflict dialog for: ${conflict.name}`);

        // Get toplevel window for dialog parent
        const root = this.get_root();

        // Create alert dialog
        const dialog = new Adw.AlertDialog({
            heading: 'Keyboard Shortcut Conflict',
            body: `This shortcut conflicts with:\n\n<b>${conflict.name}</b>\n\n` +
                'Disabling the GNOME shortcut will allow Zoned to use this key combination.',
            body_use_markup: true,
        });

        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('fix', 'Disable GNOME Shortcut');
        dialog.set_response_appearance('fix', Adw.ResponseAppearance.SUGGESTED);
        dialog.set_default_response('fix');

        // Wave 4: bound method
        const boundDialogResponse = handleDialogResponse.bind(null, this, conflict);
        dialog.connect('response', boundDialogResponse);

        dialog.present(root);
    }

    /**
     * Fix a single conflict by disabling the GNOME shortcut
     * @param {Object} conflict - Conflict info object
     */
    _fixConflict(conflict) {
        log(`Fixing conflict: disabling ${conflict.schema}:${conflict.key}`);

        try {
            const schema = new Gio.Settings({schema: conflict.schema});
            schema.set_strv(conflict.key, []);

            log(`Successfully disabled ${conflict.name}`);

            // Update display to reflect resolved conflict
            this._updateDisplay();

            // Signal to extension that conflicts changed (trigger panel update)
            // Use small delay to ensure GSettings write is complete
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                this._signalConflictChange();
                return GLib.SOURCE_REMOVE;
            });
        } catch (e) {
            log(`Error fixing conflict: ${e.message}`);
        }
    }

    /**
     * Signal to extension that conflict state has changed
     * Updates keybinding-conflict-count to trigger panel refresh
     */
    _signalConflictChange() {
        // Count current conflicts across all bindings
        let conflictCount = 0;

        for (const binding of KEYBINDINGS) {
            const values = this._settings.get_strv(binding.key);
            if (values.length > 0 && checkConflicts(values[0], binding.key)) {
                conflictCount++;
            }
        }

        // Also check enhanced bindings if enabled
        if (this._settings.get_boolean('enhanced-window-management-enabled')) {
            for (const binding of ENHANCED_KEYBINDINGS) {
                const values = this._settings.get_strv(binding.key);
                if (values.length > 0 && checkConflicts(values[0], binding.key)) {
                    conflictCount++;
                }
            }
        }

        log(`Signaling conflict count change: ${conflictCount}`);
        this._settings.set_int('keybinding-conflict-count', conflictCount);
    }

    /**
     * Clean up
     */
    destroy() {
        log(`Destroying ShortcutCaptureRow for ${this._settingsKey}`);
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        if (this._conflictCountChangedId) {
            this._settings.disconnect(this._conflictCountChangedId);
            this._conflictCountChangedId = null;
        }
        // Release bound function references (Wave 4)
        this._boundWarningClick = null;
        this._boundResetClick = null;
        this._boundModifierToggled = null;
        this._boundRecordClick = null;
        this._boundKeyPress = null;
        this._boundFocusLeave = null;
        this._boundSettingsChanged = null;
        this._boundConflictCountChanged = null;
        super.destroy();
    }
});

export default class ZonedPreferences extends ExtensionPreferences {
    /**
     * Create Quick Layout Switch row with modifier checkboxes and static "1-9" key
     * @param {Gio.Settings} settings - GSettings object
     * @returns {Adw.PreferencesRow} The quick layout row widget
     */
    _createQuickLayoutRow(settings) {
        const row = new Adw.PreferencesRow();

        // Main content box (vertical)
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 8,
            margin_bottom: 8,
            margin_start: 12,
            margin_end: 12,
        });

        // Header row: Title + reset button
        const headerBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
        });

        const titleLabel = new Gtk.Label({
            label: 'Quick Layout Switch',
            xalign: 0,
            hexpand: true,
        });
        titleLabel.add_css_class('title');
        headerBox.append(titleLabel);

        // Reset button
        const resetButton = new Gtk.Button({
            icon_name: 'edit-undo-symbolic',
            tooltip_text: 'Reset to default (Ctrl + Super + Alt)',
            visible: false,
        });
        resetButton.add_css_class('flat');
        headerBox.append(resetButton);

        mainBox.append(headerBox);

        // Controls row: Modifier checkboxes + static "1-9" button
        const controlsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
        });

        // Modifier checkboxes (keyboard order: Shift, Ctrl, Super, Alt)
        const shiftCheck = new Gtk.CheckButton({label: 'Shift'});
        const ctrlCheck = new Gtk.CheckButton({label: 'Ctrl'});
        const superCheck = new Gtk.CheckButton({label: 'Super'});
        const altCheck = new Gtk.CheckButton({label: 'Alt'});

        controlsBox.append(shiftCheck);
        controlsBox.append(ctrlCheck);
        controlsBox.append(superCheck);
        controlsBox.append(altCheck);

        // Spacer
        const spacer = new Gtk.Box({hexpand: true});
        controlsBox.append(spacer);

        // Static "1-9" button (looks like a button but is not interactive)
        const keyLabel = new Gtk.Label({
            label: '1-9',
        });
        const keyFrame = new Gtk.Frame({
            child: keyLabel,
        });
        // Style to look like a button
        keyLabel.set_margin_start(12);
        keyLabel.set_margin_end(12);
        keyLabel.set_margin_top(4);
        keyLabel.set_margin_bottom(4);
        controlsBox.append(keyFrame);

        mainBox.append(controlsBox);

        // Current shortcut display row
        const displayBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
        });

        const currentLabel = new Gtk.Label({
            label: 'Current:',
            xalign: 0,
        });
        currentLabel.add_css_class('dim-label');
        displayBox.append(currentLabel);

        const shortcutLabel = new Gtk.Label({
            xalign: 0,
            hexpand: true,
        });
        shortcutLabel.add_css_class('shortcut-text');
        displayBox.append(shortcutLabel);

        mainBox.append(displayBox);

        // Subtitle/description label
        const subtitleLabel = new Gtk.Label({
            label: 'Assign shortcuts to layouts in the Layout Switcher',
            xalign: 0,
            hexpand: true,
            wrap: true,
            wrap_mode: 2,
        });
        subtitleLabel.add_css_class('dim-label');
        subtitleLabel.add_css_class('caption');
        mainBox.append(subtitleLabel);

        row.set_child(mainBox);

        // Default modifiers: Ctrl + Super + Alt
        const DEFAULT_MODIFIERS = '<Control><Super><Alt>';

        // Helper to build modifier string from checkboxes
        const buildModifierPrefix = () => {
            const parts = [];
            if (shiftCheck.get_active()) parts.push('<Shift>');
            if (ctrlCheck.get_active()) parts.push('<Control>');
            if (superCheck.get_active()) parts.push('<Super>');
            if (altCheck.get_active()) parts.push('<Alt>');
            return parts.join('');
        };

        // Helper to build display label
        const buildDisplayLabel = () => {
            const parts = [];
            if (shiftCheck.get_active()) parts.push('Shift');
            if (ctrlCheck.get_active()) parts.push('Ctrl');
            if (superCheck.get_active()) parts.push('Super');
            if (altCheck.get_active()) parts.push('Alt');
            if (parts.length === 0) {
                return '1-9 (no modifiers)';
            }
            parts.push('1-9');
            return parts.join(' + ');
        };

        // Update display and show/hide reset button
        const updateDisplay = () => {
            shortcutLabel.set_label(buildDisplayLabel());
            const currentPrefix = buildModifierPrefix();
            resetButton.visible = currentPrefix !== DEFAULT_MODIFIERS;
        };

        // Save all quick-layout-N shortcuts with current modifiers
        const saveQuickLayoutShortcuts = () => {
            const prefix = buildModifierPrefix();
            for (let i = 1; i <= 9; i++) {
                const accelerator = prefix ? `${prefix}${i}` : `${i}`;
                settings.set_strv(`quick-layout-${i}`, [accelerator]);
            }
            updateDisplay();
        };

        // Load current modifiers from quick-layout-1
        const loadFromSettings = () => {
            const values = settings.get_strv('quick-layout-1');
            const accel = values.length > 0 ? values[0] : DEFAULT_MODIFIERS + '1';

            // Parse to get modifiers
            let mods = 0;
            try {
                const result = Gtk.accelerator_parse(accel);
                if (Array.isArray(result)) {
                    if (result.length === 3 && result[0]) {
                        mods = result[2];
                    } else if (result.length === 2) {
                        mods = result[1];
                    }
                }
            } catch (e) {
                log(`Error parsing quick layout accelerator: ${e.message}`);
            }

            // Set checkbox states (suppress change handlers)
            row._loadingFromSettings = true;
            shiftCheck.set_active((mods & Gdk.ModifierType.SHIFT_MASK) !== 0);
            ctrlCheck.set_active((mods & Gdk.ModifierType.CONTROL_MASK) !== 0);
            superCheck.set_active((mods & Gdk.ModifierType.SUPER_MASK) !== 0);
            altCheck.set_active((mods & Gdk.ModifierType.ALT_MASK) !== 0);
            row._loadingFromSettings = false;

            updateDisplay();
        };

        // Connect checkbox changes
        const onModifierChanged = () => {
            if (row._loadingFromSettings) return;
            saveQuickLayoutShortcuts();
        };

        shiftCheck.connect('toggled', onModifierChanged);
        ctrlCheck.connect('toggled', onModifierChanged);
        superCheck.connect('toggled', onModifierChanged);
        altCheck.connect('toggled', onModifierChanged);

        // Reset button handler (Wave 4: bound method)
        const boundResetClick = handleQuickLayoutResetClicked.bind(
            null, row, shiftCheck, ctrlCheck, superCheck, altCheck, saveQuickLayoutShortcuts,
        );
        resetButton.connect('clicked', boundResetClick);

        // Initial load
        loadFromSettings();

        // Listen for external changes to quick-layout-1 (Wave 4: bound method)
        const boundSettingsChanged = handleQuickLayoutSettingsChanged.bind(null, loadFromSettings);
        settings.connect('changed::quick-layout-1', boundSettingsChanged);

        return row;
    }

    /**
     * Reset all settings to their default values
     * @param {Gio.Settings} settings - GSettings object
     */
    _resetAllSettings(settings) {
        // List of all schema keys to reset
        const keysToReset = [
            // Keybindings
            'show-layout-picker',
            'cycle-zone-left',
            'cycle-zone-right',
            'minimize-window',
            'maximize-window',
            // Quick layout shortcuts
            'quick-layout-1',
            'quick-layout-2',
            'quick-layout-3',
            'quick-layout-4',
            'quick-layout-5',
            'quick-layout-6',
            'quick-layout-7',
            'quick-layout-8',
            'quick-layout-9',
            'quick-layout-shortcuts-enabled',
            // Enhanced window management
            'enhanced-window-management-enabled',
            // Appearance
            'show-panel-indicator',
            'ui-theme',
            'option-force-tier',
            'layout-picker-size',
            // Layout management
            'use-per-workspace-layouts',
            'layout-order',
            'current-layout-id',
            'current-zone-index',
            'last-selected-layout',
            // State (clear spatial state)
            'spatial-state-map',
            'workspace-layout-map',
            // Notifications
            'notifications-enabled',
            'notification-duration',
            'center-notification-size',
            'center-notification-opacity',
            'notify-window-snapping',
            'notify-layout-switching',
            'notify-window-management',
            'notify-workspace-changes',
            'notify-startup',
            'notify-conflicts',
            // Debug
            'debug-logging',
            'memory-debug',
            'debug-layout-rects',
            'debug-layout-overlay',
            'developer-mode-revealed',
            // Conflict count
            'keybinding-conflict-count',
        ];

        for (const key of keysToReset) {
            try {
                settings.reset(key);
                log(`Reset setting: ${key}`);
            } catch (e) {
                log(`Could not reset ${key}: ${e.message}`);
            }
        }

        log('All settings have been reset to defaults');
    }

    /**
     * Apply theme override to Libadwaita StyleManager
     * This ensures the preferences window honors the ui-theme setting
     * @param {string} themePref - Theme preference ('system', 'light', 'dark')
     */
    _applyTheme(themePref) {
        const styleManager = Adw.StyleManager.get_default();

        switch (themePref) {
            case 'light':
                styleManager.set_color_scheme(Adw.ColorScheme.FORCE_LIGHT);
                log('Theme applied: FORCE_LIGHT');
                break;
            case 'dark':
                styleManager.set_color_scheme(Adw.ColorScheme.FORCE_DARK);
                log('Theme applied: FORCE_DARK');
                break;
            case 'system':
            default:
                styleManager.set_color_scheme(Adw.ColorScheme.DEFAULT);
                log('Theme applied: DEFAULT (system)');
                break;
        }
    }

    /**
     * Fill preferences window
     * @param {Adw.PreferencesWindow} window - The preferences window
     */
    fillPreferencesWindow(window) {
        log('=== fillPreferencesWindow called ===');

        // Get settings first
        const settings = this.getSettings();
        log('Settings object obtained');

        // Apply current theme setting to the preferences window
        const currentThemePref = settings.get_string('ui-theme');
        this._applyTheme(currentThemePref);

        // Add CSS provider for custom styling
        const cssProvider = new Gtk.CssProvider();
        cssProvider.load_from_data(`
            .shortcut-text {
                font-family: monospace;
                font-size: 13px;
                color: @accent_color;
            }
            .shortcut-text.capturing {
                color: @accent_color;
                font-weight: bold;
            }
        `, -1);
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            cssProvider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION,
        );
        log('CSS provider added');

        // Create a preferences page
        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'dialog-information-symbolic',
        });
        window.add(page);

        // Create appearance group
        const appearanceGroup = new Adw.PreferencesGroup({
            title: 'Appearance',
            description: 'UI theme and color preferences',
        });
        page.add(appearanceGroup);

        // UI Theme preference (Light/Dark/System)
        const themeRow = new Adw.ComboRow({
            title: 'UI Theme',
            subtitle: 'Color scheme for extension dialogs and UI',
        });

        const themeModel = new Gtk.StringList();
        themeModel.splice(0, 0, ['System', 'Light', 'Dark']);
        themeRow.set_model(themeModel);

        // Map display names to setting values
        const themeMapping = ['system', 'light', 'dark'];
        const currentTheme = settings.get_string('ui-theme');
        themeRow.set_selected(themeMapping.indexOf(currentTheme));

        // Wave 4: bound method
        const boundThemeSelected = handleThemeRowSelected.bind(null, this, themeMapping, themeRow, settings);
        themeRow.connect('notify::selected', boundThemeSelected);

        appearanceGroup.add(themeRow);

        // Show Panel Indicator toggle
        const showIndicatorRow = new Adw.SwitchRow({
            title: 'Show Panel Indicator',
            subtitle: 'Show Zoned icon in the top bar. When hidden, use keyboard shortcuts or this settings page.',
        });
        settings.bind('show-panel-indicator', showIndicatorRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        appearanceGroup.add(showIndicatorRow);

        // Layout Picker Size (Tier) preference
        const tierRow = new Adw.ComboRow({
            title: 'Layout Picker Size',
            subtitle: 'Card and dialog size in the layout picker. Auto selects based on screen resolution.',
        });

        const tierModel = new Gtk.StringList();
        tierModel.splice(0, 0, ['Auto', 'Tiny', 'Small', 'Medium', 'Large', 'Extra Large']);
        tierRow.set_model(tierModel);

        // Get current tier setting (0=auto, 1=tiny, 2=small, 3=medium, 4=large, 5=xlarge)
        const currentTier = settings.get_int('option-force-tier');
        tierRow.set_selected(currentTier);

        // Wave 4: bound method
        const boundTierSelected = handleTierRowSelected.bind(null, tierRow, settings);
        tierRow.connect('notify::selected', boundTierSelected);

        appearanceGroup.add(tierRow);

        // Create notifications group
        const notifyGroup = new Adw.PreferencesGroup({
            title: 'Notifications',
            description: 'Control when and how notifications are displayed',
        });
        page.add(notifyGroup);

        // Master toggle for notifications
        const notifyEnabledRow = new Adw.SwitchRow({
            title: 'Enable Notifications',
            subtitle: 'Show visual feedback for actions like snapping, layout switching, etc.',
        });
        settings.bind('notifications-enabled', notifyEnabledRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        notifyGroup.add(notifyEnabledRow);

        // Duration setting
        const durationRow = new Adw.ComboRow({
            title: 'Notification Duration',
            subtitle: 'How long notifications stay visible',
        });
        const durationModel = new Gtk.StringList();
        durationModel.splice(0, 0, ['Quick (0.5s)', 'Normal (1s)', 'Slow (2s)', 'Long (3s)']);
        durationRow.set_model(durationModel);

        // Map durations in milliseconds
        const durationMapping = [500, 1000, 2000, 3000];
        const currentDuration = settings.get_int('notification-duration');
        // Find closest match
        let selectedDurationIdx = durationMapping.findIndex(d => d >= currentDuration);
        if (selectedDurationIdx === -1) selectedDurationIdx = 3;
        durationRow.set_selected(selectedDurationIdx);

        // Wave 4: bound method
        const boundDurationSelected = handleDurationRowSelected.bind(null, durationMapping, durationRow, settings);
        durationRow.connect('notify::selected', boundDurationSelected);
        notifyGroup.add(durationRow);

        // Center notification size setting
        const sizeRow = new Adw.ComboRow({
            title: 'Center Notification Size',
            subtitle: 'Size of the large center-screen notification',
        });
        const sizeModel = new Gtk.StringList();
        sizeModel.splice(0, 0, ['Small', 'Medium', 'Large']);
        sizeRow.set_model(sizeModel);

        const sizeMapping = ['small', 'medium', 'large'];
        const currentSize = settings.get_string('center-notification-size');
        sizeRow.set_selected(sizeMapping.indexOf(currentSize));

        // Wave 4: bound method
        const boundSizeSelected = handleSizeRowSelected.bind(null, sizeMapping, sizeRow, settings);
        sizeRow.connect('notify::selected', boundSizeSelected);
        notifyGroup.add(sizeRow);

        // Center notification opacity setting
        const opacityRow = new Adw.ActionRow({
            title: 'Center Notification Opacity',
            subtitle: 'Background opacity of center notification (50-100%)',
        });

        const opacityScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({
                lower: 50,
                upper: 100,
                step_increment: 5,
                page_increment: 10,
                value: settings.get_int('center-notification-opacity'),
            }),
            draw_value: true,
            value_pos: Gtk.PositionType.RIGHT,
            hexpand: true,
            width_request: 200,
        });
        opacityScale.add_mark(50, Gtk.PositionType.BOTTOM, null);
        opacityScale.add_mark(75, Gtk.PositionType.BOTTOM, null);
        opacityScale.add_mark(100, Gtk.PositionType.BOTTOM, null);

        // Wave 4: bound method
        const boundOpacityChanged = handleOpacityScaleChanged.bind(null, opacityScale, settings);
        opacityScale.connect('value-changed', boundOpacityChanged);
        opacityRow.add_suffix(opacityScale);
        notifyGroup.add(opacityRow);

        // Preview button row
        const previewRow = new Adw.ActionRow({
            title: 'Preview Center Notification',
            subtitle: 'Show a sample notification with current size and opacity settings',
        });

        const previewButton = new Gtk.Button({
            label: 'Preview',
            valign: Gtk.Align.CENTER,
        });
        previewButton.add_css_class('suggested-action');
        // Wave 4: bound method
        const boundPreviewClicked = handlePreviewButtonClicked.bind(null, settings);
        previewButton.connect('clicked', boundPreviewClicked);
        previewRow.add_suffix(previewButton);
        notifyGroup.add(previewRow);

        // Category settings expander
        const categoryExpander = new Adw.ExpanderRow({
            title: 'Notification Categories',
            subtitle: 'Choose notification style per action type',
        });
        notifyGroup.add(categoryExpander);

        // Helper to create category rows
        const createCategoryRow = (settingsKey, title, subtitle) => {
            const row = new Adw.ComboRow({
                title: title,
                subtitle: subtitle,
            });
            const model = new Gtk.StringList();
            model.splice(0, 0, ['Center', 'System', 'Disabled']);
            row.set_model(model);

            const styleMapping = ['center', 'system', 'disabled'];
            const currentStyle = settings.get_string(settingsKey);
            row.set_selected(styleMapping.indexOf(currentStyle));

            // Wave 4: bound method
            const boundCategorySelected = handleCategoryRowSelected.bind(
                null, settingsKey, styleMapping, row, settings,
            );
            row.connect('notify::selected', boundCategorySelected);

            return row;
        };

        // Add category rows
        categoryExpander.add_row(createCategoryRow(
            'notify-window-snapping',
            'Window Snapping',
            'Zone cycling with Super+Left/Right',
        ));

        categoryExpander.add_row(createCategoryRow(
            'notify-layout-switching',
            'Layout/Profile Changes',
            'Switching layouts via picker, menu, or shortcuts',
        ));

        categoryExpander.add_row(createCategoryRow(
            'notify-window-management',
            'Window Management',
            'Minimize, maximize, and restore actions',
        ));

        categoryExpander.add_row(createCategoryRow(
            'notify-workspace-changes',
            'Workspace Changes',
            'Per-space layout display when switching workspaces',
        ));

        categoryExpander.add_row(createCategoryRow(
            'notify-startup',
            'Startup Messages',
            'Extension enabled notification on startup',
        ));

        categoryExpander.add_row(createCategoryRow(
            'notify-conflicts',
            'Conflict Warnings',
            'Keybinding conflict detection alerts',
        ));

        // Create layout management group
        const group = new Adw.PreferencesGroup({
            title: 'Layout Management',
            description: 'Create and manage custom window layouts',
        });
        page.add(group);

        // Add "Per-space layouts" switch
        // Note: Setting is 'use-per-workspace-layouts' but UI inverts it for UX clarity
        // "Apply globally" ON = per-workspace OFF, "Apply globally" OFF = per-workspace ON
        const applyGloballyRow = new Adw.SwitchRow({
            title: 'Apply one layout to all spaces',
            subtitle: 'When enabled, layouts apply to all monitors and workspaces. ' +
                'When disabled, each workspace can have its own layout.',
        });

        // Use INVERT_BOOLEAN flag so the UI switch is inverted
        // Switch ON (apply globally) = use-per-workspace-layouts FALSE
        // Switch OFF (per-space) = use-per-workspace-layouts TRUE
        settings.bind(
            'use-per-workspace-layouts',
            applyGloballyRow,
            'active',
            Gio.SettingsBindFlags.INVERT_BOOLEAN,
        );
        group.add(applyGloballyRow);

        // Add keyboard shortcuts group
        const kbGroup = new Adw.PreferencesGroup({
            title: 'Keyboard Shortcuts',
            description: 'Use checkboxes to set modifiers, then click "Record Key" to capture the key.',
        });
        page.add(kbGroup);

        // Add shortcut rows for each keybinding
        log(`Creating ${KEYBINDINGS.length} shortcut rows`);
        for (const binding of KEYBINDINGS) {
            log(`Creating row for: ${binding.key}`);
            const row = new ShortcutCaptureRow({
                title: binding.title,
                subtitle: binding.subtitle,
                settings: settings,
                settingsKey: binding.key,
                defaultAccelerator: binding.default,
            });
            kbGroup.add(row);
        }
        log('All shortcut rows created');

        // Quick Layout Shortcuts section (collapsible)
        const quickLayoutGroup = new Adw.PreferencesGroup({
            title: 'Quick Layout Shortcuts',
            description: 'Use global shortcuts to switch layouts from anywhere.',
        });
        page.add(quickLayoutGroup);

        // Use ExpanderRow for collapsible content tied to the enable switch
        const quickLayoutExpander = new Adw.ExpanderRow({
            title: 'Enable Quick Layout Shortcuts',
            subtitle: 'Switch to layouts that have shortcuts assigned.',
            show_enable_switch: true,
        });

        // Bind the enable switch to the setting
        settings.bind(
            'quick-layout-shortcuts-enabled',
            quickLayoutExpander,
            'enable-expansion',
            Gio.SettingsBindFlags.DEFAULT,
        );

        // Set initial expanded state based on setting
        quickLayoutExpander.set_expanded(settings.get_boolean('quick-layout-shortcuts-enabled'));

        quickLayoutGroup.add(quickLayoutExpander);

        // Add Quick Layout Switch row (modifiers only, key is fixed to 1-9)
        const quickLayoutRow = this._createQuickLayoutRow(settings);
        quickLayoutExpander.add_row(quickLayoutRow);
        log('Quick layout row created');

        // Enhanced Windows Management section (collapsible)
        const enhancedGroup = new Adw.PreferencesGroup({
            title: 'Enhanced Windows Management',
            description: 'Optional Windows-like minimize/maximize behavior. May conflict with default GNOME shortcuts.',
        });
        page.add(enhancedGroup);

        // Use ExpanderRow for collapsible content tied to the enable switch
        const enhancedExpander = new Adw.ExpanderRow({
            title: 'Enable Enhanced Windows Management',
            subtitle: 'Super+Down minimizes (press again to restore). Super+Up restores or toggles maximize.',
            show_enable_switch: true,
        });

        // Bind the enable switch to the setting
        settings.bind(
            'enhanced-window-management-enabled',
            enhancedExpander,
            'enable-expansion',
            Gio.SettingsBindFlags.DEFAULT,
        );

        // Set initial expanded state based on setting
        enhancedExpander.set_expanded(settings.get_boolean('enhanced-window-management-enabled'));

        enhancedGroup.add(enhancedExpander);

        // Add shortcut rows inside the expander
        log(`Creating ${ENHANCED_KEYBINDINGS.length} enhanced shortcut rows`);
        for (const binding of ENHANCED_KEYBINDINGS) {
            log(`Creating enhanced row for: ${binding.key}`);
            const row = new ShortcutCaptureRow({
                title: binding.title,
                subtitle: binding.subtitle,
                settings: settings,
                settingsKey: binding.key,
                defaultAccelerator: binding.default,
            });
            enhancedExpander.add_row(row);
        }
        log('Enhanced shortcut rows created');

        // Add about group
        const aboutGroup = new Adw.PreferencesGroup({
            title: 'About',
            description: 'Advanced window zone management for GNOME Shell',
        });
        page.add(aboutGroup);

        // Get version info dynamically
        const versionInfo = getExtensionVersion(this.path, this.metadata);

        const aboutRow = new Adw.ActionRow({
            title: 'Zoned',
            subtitle: `Version ${versionInfo.display}`,
        });
        aboutGroup.add(aboutRow);

        // GitHub link row with icon
        const githubRow = new Adw.ActionRow({
            title: 'GitHub',
            subtitle: 'View source code and report issues',
        });
        const githubButton = new Gtk.Button({
            valign: Gtk.Align.CENTER,
        });
        // Use custom github-symbolic icon from extension icons folder
        const githubIcon = new Gtk.Image({
            icon_name: 'web-browser-symbolic',  // Fallback, custom icon loaded below
        });
        try {
            const iconPath = GLib.build_filenamev([this.path, 'icons', 'github-symbolic.svg']);
            const iconFile = Gio.File.new_for_path(iconPath);
            if (iconFile.query_exists(null)) {
                githubIcon.set_from_gicon(Gio.FileIcon.new(iconFile));
            }
        } catch (e) {
            log(`Could not load github icon: ${e.message}`);
        }
        githubButton.set_child(githubIcon);
        githubButton.add_css_class('flat');
        // Wave 4: bound method
        const boundGithubClicked = handleGithubButtonClicked.bind(null);
        githubButton.connect('clicked', boundGithubClicked);
        githubRow.add_suffix(githubButton);
        aboutGroup.add(githubRow);

        // Buy Me a Coffee link row with icon
        const coffeeRow = new Adw.ActionRow({
            title: 'Buy Me a Coffee',
            subtitle: 'Support the development of Zoned',
        });
        const coffeeButton = new Gtk.Button({
            valign: Gtk.Align.CENTER,
        });
        // Use custom bmc-symbolic icon from extension icons folder
        const coffeeIcon = new Gtk.Image({
            icon_name: 'starred-symbolic',  // Fallback
        });
        try {
            const iconPath = GLib.build_filenamev([this.path, 'icons', 'bmc-symbolic.svg']);
            const iconFile = Gio.File.new_for_path(iconPath);
            if (iconFile.query_exists(null)) {
                coffeeIcon.set_from_gicon(Gio.FileIcon.new(iconFile));
            }
        } catch (e) {
            log(`Could not load bmc icon: ${e.message}`);
        }
        coffeeButton.set_child(coffeeIcon);
        coffeeButton.add_css_class('flat');
        // Wave 4: bound method
        const boundCoffeeClicked = handleCoffeeButtonClicked.bind(null);
        coffeeButton.connect('clicked', boundCoffeeClicked);
        coffeeRow.add_suffix(coffeeButton);
        aboutGroup.add(coffeeRow);

        // ========================================
        // Reset All Section
        // ========================================
        const resetGroup = new Adw.PreferencesGroup({
            title: 'Reset',
        });
        page.add(resetGroup);

        const resetRow = new Adw.ActionRow({
            title: 'Reset All Settings',
            subtitle: 'Restore all options to their default values',
        });
        const resetButton = new Gtk.Button({
            label: 'Reset All',
            valign: Gtk.Align.CENTER,
        });
        resetButton.add_css_class('destructive-action');
        // Wave 4: bound method
        resetButton.connect('clicked', () => {
            // Show confirmation dialog
            const dialog = new Adw.AlertDialog({
                heading: 'Reset All Settings?',
                body: 'All custom settings will be reset to their default values. This cannot be undone.',
            });

            dialog.add_response('cancel', 'Cancel');
            dialog.add_response('reset', 'Continue');
            dialog.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
            dialog.set_default_response('cancel');

            // Wave 4: bound method
            const boundDialogResponse = handleResetDialogResponse.bind(null, this, settings, window);
            dialog.connect('response', boundDialogResponse);

            dialog.present(window);
        });
        resetRow.add_suffix(resetButton);
        resetGroup.add(resetRow);

        // ========================================
        // Hidden Developer Section (below Reset)
        // ========================================
        // Only visible when developer-mode-revealed is true (set via Ctrl+Shift+D)
        const developerGroup = new Adw.PreferencesGroup({
            title: '🛠️ Developer Settings',
            description: 'Debug tools for development. Press Ctrl+Shift+D to hide.',
            visible: settings.get_boolean('developer-mode-revealed'),
        });
        page.add(developerGroup);

        // Debug Logging toggle
        const debugLoggingRow = new Adw.SwitchRow({
            title: 'Debug Logging',
            subtitle: 'Enable verbose console output (view with journalctl -f /usr/bin/gnome-shell)',
        });
        settings.bind('debug-logging', debugLoggingRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        developerGroup.add(debugLoggingRow);

        // Memory Debug Logging toggle
        const memoryDebugRow = new Adw.SwitchRow({
            title: 'Memory Debug Logging',
            subtitle: 'Extremely verbose memory lifecycle logging (for leak debugging only)',
        });
        settings.bind('memory-debug', memoryDebugRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        developerGroup.add(memoryDebugRow);

        // Debug Layout Rectangles toggle
        const debugRectsRow = new Adw.SwitchRow({
            title: 'Debug Layout Rectangles',
            subtitle: 'Show colored borders around layout elements in the layout picker',
        });
        settings.bind('debug-layout-rects', debugRectsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        developerGroup.add(debugRectsRow);

        // Debug Measurement Overlay toggle
        const debugOverlayRow = new Adw.SwitchRow({
            title: 'Debug Measurement Overlay',
            subtitle: 'Show dimension and tier info overlay in layout picker',
        });
        settings.bind('debug-layout-overlay', debugOverlayRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        developerGroup.add(debugOverlayRow);

        // Reset All Debug Settings button
        const resetDebugBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            halign: Gtk.Align.CENTER,
            margin_top: 12,
            margin_bottom: 8,
        });

        const resetDebugButton = new Gtk.Button({
            label: 'Reset Debug Settings & Hide Section',
        });
        resetDebugButton.add_css_class('destructive-action');
        // Wave 4: bound method
        const boundResetDebugClicked = handleResetDebugButtonClicked.bind(null, settings, developerGroup);
        resetDebugButton.connect('clicked', boundResetDebugClicked);
        resetDebugBox.append(resetDebugButton);

        const resetDebugRow = new Adw.PreferencesRow();
        resetDebugRow.set_child(resetDebugBox);
        developerGroup.add(resetDebugRow);

        // ========================================
        // Ctrl+Shift+D Handler to Toggle Developer Section
        // ========================================
        const devKeyController = new Gtk.EventControllerKey();
        // Wave 4: bound method
        const boundDevKeyPressed = handleDevKeyPressed.bind(null, settings, developerGroup);
        devKeyController.connect('key-pressed', boundDevKeyPressed);
        window.add_controller(devKeyController);

        // Helper function to scroll to a section
        const scrollToSection = (target) => {
            log(`Scrolling to section: ${target}`);
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
                if (target === 'keyboard-shortcuts') {
                    // Scroll to keyboard shortcuts group
                    kbGroup.grab_focus();
                    log('Scrolled to keyboard shortcuts section');
                } else if (target === 'enhanced-shortcuts') {
                    // Scroll to enhanced shortcuts and expand it
                    enhancedExpander.set_expanded(true);
                    enhancedExpander.grab_focus();
                    log('Scrolled to enhanced shortcuts section');
                }
                return GLib.SOURCE_REMOVE;
            });
        };

        // Check if we should scroll to a specific section (set by panel menu)
        const scrollTarget = settings.get_string('prefs-scroll-target');
        if (scrollTarget) {
            log(`Scroll target requested: ${scrollTarget}`);
            // Clear the scroll target so it doesn't persist
            settings.set_string('prefs-scroll-target', '');
            scrollToSection(scrollTarget);
        }

        // Watch for scroll target changes (handles case when prefs is already open)
        // Wave 4: bound method
        const boundScrollTargetChanged = handleScrollTargetChanged.bind(null, scrollToSection, settings);
        const scrollTargetSignal = settings.connect('changed::prefs-scroll-target', boundScrollTargetChanged);

        // Watch for close request from extension (when "Fix All" is used from panel menu)
        // Wave 4: bound method
        const boundCloseRequestChanged = handleCloseRequestChanged.bind(null, settings, window);
        const closeRequestSignal = settings.connect('changed::prefs-close-requested', boundCloseRequestChanged);

        // Clean up signal handlers when window closes
        // Wave 4: bound method
        const boundWindowCloseRequest = handleWindowCloseRequest.bind(
            null, settings, closeRequestSignal, scrollTargetSignal,
        );
        window.connect('close-request', boundWindowCloseRequest);

        log('=== fillPreferencesWindow complete ===');
    }
}
