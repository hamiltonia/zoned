/**
 * Keybinding Configuration - Shared definitions for conflict detection
 *
 * This module provides centralized keybinding definitions and utilities
 * used by both the extension (conflictDetector.js) and preferences (prefs.js).
 *
 * When adding a new Zoned keybinding:
 * 1. Add it to ZONED_BINDINGS below
 * 2. Add the GSettings key in gschema.xml
 * 3. Register it in keybindingManager.js
 * 4. Add UI row in prefs.js
 *
 * Conflict detection will automatically work for both panel menu and settings.
 */

/**
 * GNOME/system keybinding definition
 */
export interface GnomeBinding {
    schema: string;
    key: string;
    name: string;
}

/**
 * Zoned keybinding definition
 */
export interface ZonedBinding {
    key: string;
    name: string;
    enhanced: boolean;
}

/**
 * Parsed accelerator components
 */
interface AcceleratorParts {
    modifiers: string[];
    key: string;
}

/**
 * GNOME/system keybindings that might conflict with Zoned
 * These are checked against Zoned's keybindings to detect collisions
 */
export const GNOME_BINDINGS: GnomeBinding[] = [
    // Window tiling (mutter)
    {schema: 'org.gnome.mutter.keybindings', key: 'toggle-tiled-left', name: 'Tile window left'},
    {schema: 'org.gnome.mutter.keybindings', key: 'toggle-tiled-right', name: 'Tile window right'},

    // Window management (wm.keybindings)
    {schema: 'org.gnome.desktop.wm.keybindings', key: 'switch-group', name: 'Switch windows of app'},
    {schema: 'org.gnome.desktop.wm.keybindings', key: 'maximize', name: 'Maximize window'},
    {schema: 'org.gnome.desktop.wm.keybindings', key: 'unmaximize', name: 'Restore window'},
    {schema: 'org.gnome.desktop.wm.keybindings', key: 'minimize', name: 'Minimize window'},

    // Workspace switching
    {schema: 'org.gnome.desktop.wm.keybindings', key: 'switch-to-workspace-left', name: 'Switch to workspace left'},
    {schema: 'org.gnome.desktop.wm.keybindings', key: 'switch-to-workspace-right', name: 'Switch to workspace right'},
    {schema: 'org.gnome.desktop.wm.keybindings', key: 'switch-to-workspace-up', name: 'Switch to workspace up'},
    {schema: 'org.gnome.desktop.wm.keybindings', key: 'switch-to-workspace-down', name: 'Switch to workspace down'},

    // Move window to workspace
    {schema: 'org.gnome.desktop.wm.keybindings', key: 'move-to-workspace-left', name: 'Move window to workspace left'},
    {schema: 'org.gnome.desktop.wm.keybindings', key: 'move-to-workspace-right', name: 'Move window to workspace right'},

    // Tiling Assistant extension (Ubuntu 24+ default)
    {schema: 'org.gnome.shell.extensions.tiling-assistant', key: 'tile-left-half', name: 'Tiling Assistant: Tile left'},
    {schema: 'org.gnome.shell.extensions.tiling-assistant', key: 'tile-right-half', name: 'Tiling Assistant: Tile right'},
    {schema: 'org.gnome.shell.extensions.tiling-assistant', key: 'tile-maximize', name: 'Tiling Assistant: Maximize'},
    {schema: 'org.gnome.shell.extensions.tiling-assistant', key: 'tile-bottomhalf', name: 'Tiling Assistant: Tile bottom'},
    {schema: 'org.gnome.shell.extensions.tiling-assistant', key: 'tile-tophalf', name: 'Tiling Assistant: Tile top'},
];

/**
 * Zoned keybindings that need conflict detection
 * Used to know which of our bindings to check against GNOME_BINDINGS
 */
export const ZONED_BINDINGS: ZonedBinding[] = [
    // Core keybindings (always checked)
    {key: 'show-layout-picker', name: 'Open Layout Picker', enhanced: false},
    {key: 'cycle-zone-left', name: 'Move Window to Previous Zone', enhanced: false},
    {key: 'cycle-zone-right', name: 'Move Window to Next Zone', enhanced: false},

    // Enhanced Window Management (only checked when feature enabled)
    {key: 'minimize-window', name: 'Minimize / Restore', enhanced: true},
    {key: 'maximize-window', name: 'Maximize / Restore', enhanced: true},
];

/**
 * Key name aliases - different names that map to the same physical key
 * GNOME GSettings sometimes uses different names than GTK accelerator syntax
 */
export const KEY_ALIASES: Record<string, string> = {
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
 * Normalize an accelerator string to use canonical key names
 * This ensures consistent comparison regardless of how the key was named
 *
 * @param accel - The accelerator string (e.g., '<Super>Above_Tab')
 * @returns Normalized accelerator (e.g., '<Super>grave')
 */
export function normalizeAccelerator(accel: string): string {
    if (!accel) return accel;

    let normalized = accel;
    for (const [alias, canonical] of Object.entries(KEY_ALIASES)) {
        // Replace the alias with the canonical name at end of string (after >)
        const regex = new RegExp(`>${alias}$`, 'i');
        if (regex.test(normalized)) {
            normalized = normalized.replace(regex, `>${canonical}`);
        }
        // Also handle case where it's just the key without modifiers
        if (normalized === alias) {
            normalized = canonical;
        }
    }
    return normalized;
}

/**
 * Check if two accelerator strings represent the same key combination
 * Uses string normalization to handle aliases and different modifier orderings
 *
 * Note: This is a simplified string-based comparison. For more accurate
 * comparison using keyval/modifiers, use the platform-specific parsing
 * (Gtk.accelerator_parse in prefs.js)
 *
 * @param accel1 - First accelerator
 * @param accel2 - Second accelerator
 * @returns True if they represent the same shortcut
 */
export function acceleratorsMatch(accel1: string, accel2: string): boolean {
    if (!accel1 || !accel2) return false;

    // Normalize both to handle aliases
    const norm1 = normalizeAccelerator(accel1);
    const norm2 = normalizeAccelerator(accel2);

    // Direct comparison after normalization
    if (norm1 === norm2) return true;

    // Handle different modifier orderings by parsing into parts
    // Extract modifiers and key from each
    const parts1 = parseAcceleratorParts(norm1);
    const parts2 = parseAcceleratorParts(norm2);

    if (!parts1 || !parts2) return false;

    // Compare key (case-insensitive)
    if (parts1.key.toLowerCase() !== parts2.key.toLowerCase()) return false;

    // Compare modifiers (as sets)
    const mods1 = new Set(parts1.modifiers.map(m => m.toLowerCase()));
    const mods2 = new Set(parts2.modifiers.map(m => m.toLowerCase()));

    if (mods1.size !== mods2.size) return false;
    for (const mod of mods1) {
        if (!mods2.has(mod)) return false;
    }

    return true;
}

/**
 * Parse accelerator string into modifiers and key parts
 *
 * @param accel - Accelerator string like '<Super><Ctrl>Left'
 * @returns {modifiers: ['Super', 'Ctrl'], key: 'Left'} or null
 */
function parseAcceleratorParts(accel: string): AcceleratorParts | null {
    if (!accel) return null;

    const modifiers: string[] = [];

    // Extract all <Modifier> parts
    const modRegex = /<([^>]+)>/g;
    let match: RegExpExecArray | null;
    while ((match = modRegex.exec(accel)) !== null) {
        modifiers.push(match[1]);
    }

    // The key is whatever remains after all <...> parts
    const key = accel.replace(/<[^>]+>/g, '');

    if (!key) return null;

    return {modifiers, key};
}
