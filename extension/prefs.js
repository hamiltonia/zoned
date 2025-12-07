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

    // Build modifier string
    const parts = [];
    
    if (mods & Gdk.ModifierType.SUPER_MASK) parts.push('Super');
    if (mods & Gdk.ModifierType.CONTROL_MASK) parts.push('Ctrl');
    if (mods & Gdk.ModifierType.ALT_MASK) parts.push('Alt');
    if (mods & Gdk.ModifierType.SHIFT_MASK) parts.push('Shift');

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
 * Check for keybinding conflicts with GNOME system shortcuts
 * @param {string} accelerator - The accelerator to check
 * @param {string} currentKey - The settings key being edited (to exclude self)
 * @returns {Object|null} Conflict info or null
 */
function checkConflicts(accelerator, currentKey) {
    if (!accelerator) return null;
    
    // Known GNOME keybindings that might conflict
    const gnomeBindings = [
        { schema: 'org.gnome.mutter.keybindings', key: 'toggle-tiled-left', binding: '<Super>Left', name: 'Tile window left' },
        { schema: 'org.gnome.mutter.keybindings', key: 'toggle-tiled-right', binding: '<Super>Right', name: 'Tile window right' },
        { schema: 'org.gnome.desktop.wm.keybindings', key: 'switch-group', binding: '<Super>Above_Tab', name: 'Switch windows of app' },
        { schema: 'org.gnome.desktop.wm.keybindings', key: 'maximize', binding: '<Super>Up', name: 'Maximize window' },
        { schema: 'org.gnome.desktop.wm.keybindings', key: 'minimize', binding: '<Super>Down', name: 'Minimize window' },
    ];

    // Normalize accelerator for comparison (handle grave vs Above_Tab)
    const normalizedAccel = accelerator.replace('grave', 'Above_Tab');
    const normalizedAccel2 = accelerator.replace('Above_Tab', 'grave');

    for (const gnome of gnomeBindings) {
        try {
            const schema = new Gio.Settings({ schema: gnome.schema });
            const bindings = schema.get_strv(gnome.key);
            
            for (const binding of bindings) {
                if (binding === accelerator || 
                    binding === normalizedAccel || 
                    binding === normalizedAccel2 ||
                    binding.replace('grave', 'Above_Tab') === normalizedAccel) {
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
 * ShortcutCaptureRow - A preference row for capturing keyboard shortcuts
 * Custom layout: Title + icons on top, shortcut below title, description at bottom.
 * This layout ensures long shortcuts don't compress the description text.
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
        this._lastModifierPressTime = 0; // Track when modifier was last pressed
        
        log(`ShortcutCaptureRow._init for key: ${settingsKey}`);
        
        // Main content box (vertical)
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });
        
        // Header row: Title + icons
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
        
        // Conflict warning icon (hidden by default)
        this._warningIcon = new Gtk.Image({
            icon_name: 'dialog-warning-symbolic',
            visible: false,
            tooltip_text: '',
        });
        this._warningIcon.add_css_class('warning');
        headerBox.append(this._warningIcon);
        
        // Edit button (pencil icon)
        this._editButton = new Gtk.Button({
            icon_name: 'document-edit-symbolic',
            tooltip_text: 'Edit shortcut (Esc to cancel, Backspace to disable)',
        });
        this._editButton.add_css_class('flat');
        this._editButton.connect('clicked', () => {
            log(`Edit clicked for ${this._settingsKey}`);
            this._startCapture();
        });
        headerBox.append(this._editButton);
        
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
        
        // Shortcut label (second line)
        this._shortcutLabel = new Gtk.Label({
            xalign: 0,
            hexpand: true,
        });
        this._shortcutLabel.add_css_class('shortcut-text');
        mainBox.append(this._shortcutLabel);
        
        // Subtitle/description label (third line)
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
        
        // Event controller for key capture - attach to the edit button
        this._keyController = new Gtk.EventControllerKey();
        this._keyController.connect('key-pressed', (ctrl, keyval, keycode, state) => {
            log(`key-pressed event: keyval=${keyval}, keycode=${keycode}, state=${state}, capturing=${this._isCapturing}`);
            if (!this._isCapturing) {
                log('Not capturing, propagating event');
                return false; // Gdk.EVENT_PROPAGATE
            }
            return this._onKeyPressed(keyval, state);
        });
        this._editButton.add_controller(this._keyController);
        
        log(`Key controller attached to edit button for ${settingsKey}`);
        
        // Focus controller to handle blur
        // Note: Super key may trigger GNOME Activities, stealing focus
        // We use a grace period to ignore focus loss right after modifier press
        this._focusController = new Gtk.EventControllerFocus();
        this._focusController.connect('enter', () => {
            log(`Focus ENTER on edit button for ${this._settingsKey}`);
        });
        this._focusController.connect('leave', () => {
            log(`Focus LEAVE on edit button for ${this._settingsKey}, capturing=${this._isCapturing}`);
            if (this._isCapturing) {
                // Check if a modifier was pressed very recently (within 500ms)
                // This helps handle Super key triggering Activities
                const now = Date.now();
                const timeSinceModifier = now - this._lastModifierPressTime;
                if (timeSinceModifier < 500) {
                    log(`Ignoring focus loss - modifier pressed ${timeSinceModifier}ms ago`);
                    // Try to regain focus
                    this._editButton.grab_focus();
                    return;
                }
                this._stopCapture();
            }
        });
        this._editButton.add_controller(this._focusController);
        
        // Initial update
        this._updateDisplay();
        
        // Listen for settings changes
        this._settingsChangedId = this._settings.connect(`changed::${this._settingsKey}`, () => {
            log(`Settings changed for ${this._settingsKey}`);
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
     * Update the display
     */
    _updateDisplay() {
        const current = this._getCurrentAccelerator();
        const label = acceleratorToLabel(current);
        
        log(`_updateDisplay(${this._settingsKey}): capturing=${this._isCapturing}, label=${label}`);
        
        if (this._isCapturing) {
            this._shortcutLabel.set_label('Press keys...');
            this._shortcutLabel.remove_css_class('dim-label');
            this._shortcutLabel.add_css_class('accent');
            this._editButton.add_css_class('suggested-action');
        } else {
            this._shortcutLabel.set_label(label);
            this._shortcutLabel.add_css_class('dim-label');
            this._shortcutLabel.remove_css_class('accent');
            this._editButton.remove_css_class('suggested-action');
        }
        
        // Show/hide reset button based on whether it's the default
        const isDefault = current === this._defaultAccelerator;
        this._resetButton.visible = !isDefault;
        log(`Reset button visible: ${!isDefault}`);
        
        // Check for conflicts
        const conflict = checkConflicts(current, this._settingsKey);
        if (conflict) {
            this._warningIcon.visible = true;
            this._warningIcon.tooltip_text = `Conflicts with: ${conflict.name}\n(${conflict.schema})`;
            log(`Conflict detected: ${conflict.name}`);
        } else {
            this._warningIcon.visible = false;
        }
    }
    
    /**
     * Start capturing keyboard input
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
        const grabbed = this._editButton.grab_focus();
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
     * Build a human-readable string showing current modifiers being held
     * @param {number} mods - Modifier mask
     * @returns {string} e.g., "Super + Ctrl + ..."
     */
    _buildModifierLabel(mods) {
        const parts = [];
        
        if (mods & Gdk.ModifierType.SUPER_MASK) parts.push('Super');
        if (mods & Gdk.ModifierType.CONTROL_MASK) parts.push('Ctrl');
        if (mods & Gdk.ModifierType.ALT_MASK) parts.push('Alt');
        if (mods & Gdk.ModifierType.SHIFT_MASK) parts.push('Shift');
        
        if (parts.length === 0) {
            return 'Press a shortcut...';
        }
        
        parts.push('...');
        return parts.join(' + ');
    }
    
    /**
     * Handle key press during capture
     * Shows live feedback as modifiers are pressed
     */
    _onKeyPressed(keyval, state) {
        log(`_onKeyPressed: keyval=${keyval} (${Gdk.keyval_name(keyval)}), state=${state}`);
        
        // Get modifier mask (ignore lock keys)
        let mods = state & Gtk.accelerator_get_default_mod_mask();
        log(`Modifiers after mask: ${mods}`);
        
        // Handle special keys
        if (keyval === Gdk.KEY_Escape) {
            log('Escape pressed - canceling');
            this._stopCapture();
            return true; // Gdk.EVENT_STOP
        }
        
        if (keyval === Gdk.KEY_BackSpace) {
            log('Backspace pressed - clearing shortcut');
            this._setAccelerator('');
            this._stopCapture();
            return true;
        }
        
        // If only a modifier key is pressed, show live feedback
        // Add the current key's modifier to the state since state only contains
        // modifiers that were held BEFORE this key was pressed
        if (this._isModifierKey(keyval)) {
            // Record time for focus loss grace period (Super may trigger Activities)
            this._lastModifierPressTime = Date.now();
            
            mods = mods | this._keyvalToModifier(keyval);
            const liveLabel = this._buildModifierLabel(mods);
            log(`Modifier key pressed, showing live: ${liveLabel}`);
            this._shortcutLabel.set_label(liveLabel);
            return true;
        }
        
        // Require at least one modifier for most keys
        if (mods === 0 && !this._isAllowedWithoutModifier(keyval)) {
            log(`No modifiers and not an F-key - ignoring`);
            return true;
        }
        
        // Build accelerator string
        const accelerator = Gtk.accelerator_name(keyval, mods);
        log(`Built accelerator: ${accelerator}`);
        
        if (accelerator) {
            this._setAccelerator(accelerator);
        }
        
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
     * Convert a modifier keyval to its corresponding modifier mask
     * @param {number} keyval - The key value
     * @returns {number} The modifier mask (e.g., Gdk.ModifierType.CONTROL_MASK)
     */
    _keyvalToModifier(keyval) {
        switch (keyval) {
            case Gdk.KEY_Shift_L:
            case Gdk.KEY_Shift_R:
                return Gdk.ModifierType.SHIFT_MASK;
            case Gdk.KEY_Control_L:
            case Gdk.KEY_Control_R:
                return Gdk.ModifierType.CONTROL_MASK;
            case Gdk.KEY_Alt_L:
            case Gdk.KEY_Alt_R:
                return Gdk.ModifierType.ALT_MASK;
            case Gdk.KEY_Super_L:
            case Gdk.KEY_Super_R:
            case Gdk.KEY_Meta_L:
            case Gdk.KEY_Meta_R:
            case Gdk.KEY_Hyper_L:
            case Gdk.KEY_Hyper_R:
                return Gdk.ModifierType.SUPER_MASK;
            case Gdk.KEY_ISO_Level3_Shift:
                return Gdk.ModifierType.MOD5_MASK; // AltGr
            default:
                return 0;
        }
    }
    
    /**
     * Check if keyval is allowed without modifiers (F-keys, etc)
     */
    _isAllowedWithoutModifier(keyval) {
        // F1-F12 can be used without modifiers
        return keyval >= Gdk.KEY_F1 && keyval <= Gdk.KEY_F12;
    }
    
    /**
     * Reset to default value
     */
    _resetToDefault() {
        log(`Resetting ${this._settingsKey} to default: ${this._defaultAccelerator}`);
        this._setAccelerator(this._defaultAccelerator);
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
        super.destroy();
    }
});

export default class ZonedPreferences extends ExtensionPreferences {
    /**
     * Fill preferences window
     * @param {Adw.PreferencesWindow} window - The preferences window
     */
    fillPreferencesWindow(window) {
        log('=== fillPreferencesWindow called ===');
        
        // Get settings first
        const settings = this.getSettings();
        log('Settings object obtained');
        
        // Add CSS provider for custom styling
        const cssProvider = new Gtk.CssProvider();
        cssProvider.load_from_data(`
            .shortcut-text {
                font-family: monospace;
                font-size: 13px;
                color: @accent_color;
            }
            .shortcut-text.dim-label {
                color: alpha(@theme_text_color, 0.55);
            }
            .shortcut-text.accent {
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

        // Add "Apply layout globally" switch
        const applyGloballyRow = new Adw.SwitchRow({
            title: 'Apply one layout to all spaces',
            subtitle: 'When enabled, layouts apply to all monitors and workspaces. When disabled, you can choose specific spaces in the layout picker.',
        });
        settings.bind(
            'apply-layout-globally',
            applyGloballyRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
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
            description: 'Click a shortcut to change it. Press Escape to cancel, Backspace to disable.',
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

        // Add about group
        const aboutGroup = new Adw.PreferencesGroup({
            title: 'About',
            description: 'Advanced window zone management for GNOME Shell',
        });
        page.add(aboutGroup);

        const aboutRow = new Adw.ActionRow({
            title: 'Zoned',
            subtitle: 'Version 1.0 (Pre-release)\nGitHub: github.com/hamiltonia/zoned',
        });
        aboutGroup.add(aboutRow);
        
        log('=== fillPreferencesWindow complete ===');
    }
}
