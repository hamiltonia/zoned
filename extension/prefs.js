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

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// Simple logging for prefs (console.log goes to journalctl)
function log(msg) {
    console.log(`[Zoned Prefs] ${msg}`);
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
 * Convert Gtk accelerator string to human-readable format
 * e.g., '<Super>Left' -> 'Super + ←'
 */
function acceleratorToLabel(accelerator) {
    if (!accelerator || accelerator === '') {
        return 'Disabled';
    }

    // Parse the accelerator
    let keyval, mods;
    try {
        const result = Gtk.accelerator_parse(accelerator);
        // GTK4 returns [success, keyval, mods] or just [keyval, mods] depending on version
        if (Array.isArray(result)) {
            if (result.length === 3) {
                const [success, kv, m] = result;
                if (!success) return accelerator;
                keyval = kv;
                mods = m;
            } else if (result.length === 2) {
                [keyval, mods] = result;
            } else {
                return accelerator;
            }
        } else {
            return accelerator;
        }
    } catch (e) {
        log(`Error parsing accelerator '${accelerator}': ${e.message}`);
        return accelerator;
    }

    if (keyval === 0) {
        return accelerator;
    }

    // Build modifier string (keyboard order: Shift, Ctrl, Super, Alt)
    const parts = [];
    
    if (mods & Gdk.ModifierType.SHIFT_MASK) parts.push('Shift');
    if (mods & Gdk.ModifierType.CONTROL_MASK) parts.push('Ctrl');
    if (mods & Gdk.ModifierType.SUPER_MASK) parts.push('Super');
    if (mods & Gdk.ModifierType.ALT_MASK) parts.push('Alt');

    // Get key name
    let keyName = Gdk.keyval_name(keyval);
    
    // Prettify common key names
    const keyNameMap = {
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
    
    keyName = keyNameMap[keyName] || keyName;
    parts.push(keyName);

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
                return { keyval, mods };
            } else if (result.length === 2) {
                const [keyval, mods] = result;
                if (keyval === 0) return null;
                return { keyval, mods };
            }
        }
    } catch (e) {
        log(`Error parsing accelerator '${accelerator}': ${e.message}`);
    }
    return null;
}

/**
 * Key name aliases - different names that map to the same physical key
 * GNOME GSettings sometimes uses different names than GTK accelerator syntax
 */
const KEY_ALIASES = {
    // The backtick/grave key (left of 1 on US keyboards)
    'Above_Tab': 'grave',      // GNOME uses Above_Tab, GTK uses grave
    'quoteleft': 'grave',      // Another alias for the same key
    
    // Enter key
    'KP_Enter': 'Return',      // Keypad enter
    
    // Tab variants
    'ISO_Left_Tab': 'Tab',     // Shift+Tab generates this
    
    // Page navigation (some systems use Prior/Next)
    'Prior': 'Page_Up',
    'Next': 'Page_Down',
    
    // Numpad operators
    'KP_Add': 'plus',
    'KP_Subtract': 'minus',
    'KP_Multiply': 'asterisk',
    'KP_Divide': 'slash',
    'KP_Decimal': 'period',
    
    // Numpad numbers (map to regular numbers)
    'KP_0': '0',
    'KP_1': '1',
    'KP_2': '2',
    'KP_3': '3',
    'KP_4': '4',
    'KP_5': '5',
    'KP_6': '6',
    'KP_7': '7',
    'KP_8': '8',
    'KP_9': '9',
};

/**
 * Normalize an accelerator string to use GTK-compatible key names
 * @param {string} accel - The accelerator string
 * @returns {string} Normalized accelerator
 */
function normalizeAccelerator(accel) {
    if (!accel) return accel;
    
    let normalized = accel;
    for (const [alias, canonical] of Object.entries(KEY_ALIASES)) {
        // Replace the alias with the canonical name (case-insensitive for the key part)
        const regex = new RegExp(`>${alias}$`, 'i');
        if (regex.test(normalized)) {
            normalized = normalized.replace(regex, `>${canonical}`);
        }
        // Also handle case where there's no > prefix
        if (normalized === alias) {
            normalized = canonical;
        }
    }
    return normalized;
}

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
 * @param {string} accelerator - The accelerator to check
 * @param {string} currentKey - The settings key being edited (to exclude self)
 * @returns {Object|null} Conflict info or null
 */
function checkConflicts(accelerator, currentKey) {
    if (!accelerator) return null;
    
    // Known GNOME keybindings that might conflict
    const gnomeBindings = [
        // Window tiling (mutter)
        { schema: 'org.gnome.mutter.keybindings', key: 'toggle-tiled-left', name: 'Tile window left' },
        { schema: 'org.gnome.mutter.keybindings', key: 'toggle-tiled-right', name: 'Tile window right' },
        // Window management (org.gnome.desktop.wm.keybindings)
        { schema: 'org.gnome.desktop.wm.keybindings', key: 'switch-group', name: 'Switch windows of app' },
        { schema: 'org.gnome.desktop.wm.keybindings', key: 'maximize', name: 'Maximize window' },
        { schema: 'org.gnome.desktop.wm.keybindings', key: 'unmaximize', name: 'Restore window' },  // Super+Down on GNOME
        { schema: 'org.gnome.desktop.wm.keybindings', key: 'minimize', name: 'Minimize window' },
        // Workspace switching (Ubuntu uses Super+Alt+Arrow by default)
        { schema: 'org.gnome.desktop.wm.keybindings', key: 'switch-to-workspace-left', name: 'Switch to workspace left' },
        { schema: 'org.gnome.desktop.wm.keybindings', key: 'switch-to-workspace-right', name: 'Switch to workspace right' },
        { schema: 'org.gnome.desktop.wm.keybindings', key: 'switch-to-workspace-up', name: 'Switch to workspace up' },
        { schema: 'org.gnome.desktop.wm.keybindings', key: 'switch-to-workspace-down', name: 'Switch to workspace down' },
        // Move window to workspace
        { schema: 'org.gnome.desktop.wm.keybindings', key: 'move-to-workspace-left', name: 'Move window to workspace left' },
        { schema: 'org.gnome.desktop.wm.keybindings', key: 'move-to-workspace-right', name: 'Move window to workspace right' },
        // Tiling Assistant extension (Ubuntu 24+ default)
        { schema: 'org.gnome.shell.extensions.tiling-assistant', key: 'tile-left-half', name: 'Tiling Assistant: Tile left' },
        { schema: 'org.gnome.shell.extensions.tiling-assistant', key: 'tile-right-half', name: 'Tiling Assistant: Tile right' },
        { schema: 'org.gnome.shell.extensions.tiling-assistant', key: 'tile-maximize', name: 'Tiling Assistant: Maximize' },
        { schema: 'org.gnome.shell.extensions.tiling-assistant', key: 'tile-bottomhalf', name: 'Tiling Assistant: Tile bottom' },
        { schema: 'org.gnome.shell.extensions.tiling-assistant', key: 'tile-tophalf', name: 'Tiling Assistant: Tile top' },
    ];

    for (const gnome of gnomeBindings) {
        try {
            const schema = new Gio.Settings({ schema: gnome.schema });
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
        } catch (e) {
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
        const { title, subtitle, settings, settingsKey, defaultAccelerator, ...rest } = params;
        
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
        this._warningButton.connect('clicked', () => {
            this._showConflictDialog();
        });
        headerBox.append(this._warningButton);
        
        // Store conflict info for dialog
        this._currentConflict = null;
        
        // Reset button (undo icon)
        this._resetButton = new Gtk.Button({
            icon_name: 'edit-undo-symbolic',
            tooltip_text: 'Reset to default',
        });
        this._resetButton.add_css_class('flat');
        this._resetButton.connect('clicked', () => {
            log(`Reset clicked for ${this._settingsKey}`);
            this._resetToDefault();
        });
        headerBox.append(this._resetButton);
        
        mainBox.append(headerBox);
        
        // Controls row: Modifier checkboxes + Record Key button
        const controlsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
        });
        
        // Modifier checkboxes (keyboard order: Shift, Ctrl, Super, Alt)
        this._shiftCheck = new Gtk.CheckButton({ label: 'Shift' });
        this._ctrlCheck = new Gtk.CheckButton({ label: 'Ctrl' });
        this._superCheck = new Gtk.CheckButton({ label: 'Super' });
        this._altCheck = new Gtk.CheckButton({ label: 'Alt' });
        
        // Connect checkbox changes to update accelerator
        this._shiftCheck.connect('toggled', () => this._onModifierChanged());
        this._ctrlCheck.connect('toggled', () => this._onModifierChanged());
        this._superCheck.connect('toggled', () => this._onModifierChanged());
        this._altCheck.connect('toggled', () => this._onModifierChanged());
        
        controlsBox.append(this._shiftCheck);
        controlsBox.append(this._ctrlCheck);
        controlsBox.append(this._superCheck);
        controlsBox.append(this._altCheck);
        
        // Spacer
        const spacer = new Gtk.Box({ hexpand: true });
        controlsBox.append(spacer);
        
        // Record Key button
        this._recordButton = new Gtk.Button({
            label: 'Record Key',
            tooltip_text: 'Click to record a key',
        });
        this._recordButton.connect('clicked', () => {
            log(`Record clicked for ${this._settingsKey}`);
            this._startCapture();
        });
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
        this._keyController.connect('key-pressed', (ctrl, keyval, keycode, state) => {
            log(`key-pressed event: keyval=${keyval}, keycode=${keycode}, state=${state}, capturing=${this._isCapturing}`);
            if (!this._isCapturing) {
                log('Not capturing, propagating event');
                return false; // Gdk.EVENT_PROPAGATE
            }
            return this._onKeyPressed(keyval, keycode, state);
        });
        this._recordButton.add_controller(this._keyController);
        
        log(`Key controller attached to record button for ${settingsKey}`);
        
        // Focus controller to handle blur during capture
        this._focusController = new Gtk.EventControllerFocus();
        this._focusController.connect('leave', () => {
            log(`Focus LEAVE on record button for ${this._settingsKey}, capturing=${this._isCapturing}`);
            if (this._isCapturing) {
                this._stopCapture();
            }
        });
        this._recordButton.add_controller(this._focusController);
        
        // Initial update from settings
        this._loadFromSettings();
        
        // Listen for settings changes
        this._settingsChangedId = this._settings.connect(`changed::${this._settingsKey}`, () => {
            log(`Settings changed for ${this._settingsKey}`);
            this._loadFromSettings();
        });
        
        // Listen for conflict count changes (reverse sync from panel menu "Fix All")
        this._conflictCountChangedId = this._settings.connect('changed::keybinding-conflict-count', () => {
            log(`Conflict count changed externally for ${this._settingsKey}, refreshing display`);
            this._updateDisplay();
        });
        
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
        const keyNameMap = {
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
        return keyNameMap[keyName] || keyName;
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
            body: `This shortcut conflicts with:\n\n<b>${conflict.name}</b>\n\nDisabling the GNOME shortcut will allow Zoned to use this key combination.`,
            body_use_markup: true,
        });
        
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('fix', 'Disable GNOME Shortcut');
        dialog.set_response_appearance('fix', Adw.ResponseAppearance.SUGGESTED);
        dialog.set_default_response('fix');
        
        dialog.connect('response', (dlg, response) => {
            if (response === 'fix') {
                this._fixConflict(conflict);
            }
        });
        
        dialog.present(root);
    }
    
    /**
     * Fix a single conflict by disabling the GNOME shortcut
     * @param {Object} conflict - Conflict info object
     */
    _fixConflict(conflict) {
        log(`Fixing conflict: disabling ${conflict.schema}:${conflict.key}`);
        
        try {
            const schema = new Gio.Settings({ schema: conflict.schema });
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
        const shiftCheck = new Gtk.CheckButton({ label: 'Shift' });
        const ctrlCheck = new Gtk.CheckButton({ label: 'Ctrl' });
        const superCheck = new Gtk.CheckButton({ label: 'Super' });
        const altCheck = new Gtk.CheckButton({ label: 'Alt' });
        
        controlsBox.append(shiftCheck);
        controlsBox.append(ctrlCheck);
        controlsBox.append(superCheck);
        controlsBox.append(altCheck);
        
        // Spacer
        const spacer = new Gtk.Box({ hexpand: true });
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
            label: 'Switch to layout by position (1-9 for first 9 layouts)',
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
        
        // Reset button handler
        resetButton.connect('clicked', () => {
            row._loadingFromSettings = true;
            shiftCheck.set_active(false);
            ctrlCheck.set_active(true);
            superCheck.set_active(true);
            altCheck.set_active(true);
            row._loadingFromSettings = false;
            saveQuickLayoutShortcuts();
        });
        
        // Initial load
        loadFromSettings();
        
        // Listen for external changes to quick-layout-1
        settings.connect('changed::quick-layout-1', () => {
            loadFromSettings();
        });
        
        return row;
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
                log(`Theme applied: FORCE_LIGHT`);
                break;
            case 'dark':
                styleManager.set_color_scheme(Adw.ColorScheme.FORCE_DARK);
                log(`Theme applied: FORCE_DARK`);
                break;
            case 'system':
            default:
                styleManager.set_color_scheme(Adw.ColorScheme.DEFAULT);
                log(`Theme applied: DEFAULT (system)`);
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
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
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
        
        themeRow.connect('notify::selected', () => {
            const newTheme = themeMapping[themeRow.get_selected()];
            settings.set_string('ui-theme', newTheme);
            // Apply theme immediately to this preferences window
            this._applyTheme(newTheme);
        });
        
        appearanceGroup.add(themeRow);

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
        
        tierRow.connect('notify::selected', () => {
            const newTier = tierRow.get_selected();
            settings.set_int('option-force-tier', newTier);
        });
        
        appearanceGroup.add(tierRow);

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
            subtitle: 'When enabled, layouts apply to all monitors and workspaces. When disabled, each workspace can have its own layout.',
        });
        
        // Use INVERT_BOOLEAN flag so the UI switch is inverted
        // Switch ON (apply globally) = use-per-workspace-layouts FALSE
        // Switch OFF (per-space) = use-per-workspace-layouts TRUE
        settings.bind(
            'use-per-workspace-layouts',
            applyGloballyRow,
            'active',
            Gio.SettingsBindFlags.INVERT_BOOLEAN
        );
        group.add(applyGloballyRow);

        // Add info row explaining how to access features
        const infoRow = new Adw.ActionRow({
            title: 'Access Layout Tools',
            subtitle: 'Use the panel menu (top bar) to create and manage layouts:\n' +
                     '• "Choose Layout..." - Quick layout picker\n' +
                     '• "New Layout..." - Create custom layouts',
        });
        group.add(infoRow);

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
        
        // Add Quick Layout Switch row (modifiers only, key is fixed to 1-9)
        const quickLayoutRow = this._createQuickLayoutRow(settings);
        kbGroup.add(quickLayoutRow);
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
            Gio.SettingsBindFlags.DEFAULT
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

        const aboutRow = new Adw.ActionRow({
            title: 'Zoned',
            subtitle: 'Version 1.0 (Pre-release)',
        });
        
        // Add GitHub link button
        const githubButton = new Gtk.LinkButton({
            label: 'GitHub',
            uri: 'https://github.com/hamiltonia/zoned',
            valign: Gtk.Align.CENTER,
        });
        aboutRow.add_suffix(githubButton);
        aboutGroup.add(aboutRow);
        
        // Check if we should scroll to a specific section (set by panel menu)
        const scrollTarget = settings.get_string('prefs-scroll-target');
        if (scrollTarget) {
            log(`Scroll target requested: ${scrollTarget}`);
            
            // Clear the scroll target so it doesn't persist
            settings.set_string('prefs-scroll-target', '');
            
            // Scroll to the appropriate section after window is shown
            // Use a small delay to ensure the window is fully rendered
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                if (scrollTarget === 'keyboard-shortcuts') {
                    // Scroll to keyboard shortcuts group
                    kbGroup.grab_focus();
                    log('Scrolled to keyboard shortcuts section');
                } else if (scrollTarget === 'enhanced-shortcuts') {
                    // Scroll to enhanced shortcuts and expand it
                    enhancedExpander.set_expanded(true);
                    enhancedExpander.grab_focus();
                    log('Scrolled to enhanced shortcuts section');
                }
                return GLib.SOURCE_REMOVE;
            });
        }
        
        // Watch for close request from extension (when "Fix All" is used from panel menu)
        const closeRequestSignal = settings.connect('changed::prefs-close-requested', () => {
            if (settings.get_boolean('prefs-close-requested')) {
                log('Close requested by extension, closing prefs window');
                // Reset the flag
                settings.set_boolean('prefs-close-requested', false);
                // Close the window
                window.close();
            }
        });
        
        // Clean up signal handler when window closes
        window.connect('close-request', () => {
            settings.disconnect(closeRequestSignal);
            return false; // Allow window to close
        });
        
        log('=== fillPreferencesWindow complete ===');
    }
}
