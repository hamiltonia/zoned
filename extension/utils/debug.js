/**
 * Debug logging utility for Zoned extension
 *
 * Provides conditional logging based on GSettings debug-logging flag.
 * Errors and warnings are always logged. Info/debug logs require debug-logging enabled.
 *
 * Enable debug logging via:
 *   - gsettings set org.gnome.shell.extensions.zoned debug-logging true
 *   - Or Ctrl+Shift+D in preferences to reveal Developer section
 */

import Gio from 'gi://Gio';

/**
 * Log levels
 */
export const LogLevel = {
    ERROR: 0,   // Always logged
    WARN: 1,    // Always logged
    INFO: 2,    // Conditional (requires debug-logging)
    DEBUG: 3,   // Conditional (requires debug-logging)
};

// Cached settings reference and debug state
let _settings = null;
let _debugEnabled = false;
let _settingsChangedId = null;

/**
 * Initialize debug settings from GSettings
 * Called once when extension loads, but Logger also handles lazy init
 */
export function initDebugSettings(settings = null) {
    if (settings) {
        _settings = settings;
    } else if (!_settings) {
        try {
            _settings = new Gio.Settings({
                schema_id: 'org.gnome.shell.extensions.zoned',
            });
        } catch (e) {
            // Schema not available (e.g., during prefs.js loading)
            console.error('[Zoned:Debug] Failed to load settings:', e.message);
            return;
        }
    }

    // Read initial value
    _debugEnabled = _settings.get_boolean('debug-logging');

    // Watch for changes
    if (_settingsChangedId) {
        _settings.disconnect(_settingsChangedId);
    }
    _settingsChangedId = _settings.connect('changed::debug-logging', () => {
        _debugEnabled = _settings.get_boolean('debug-logging');
        console.log(`[Zoned] Debug logging ${_debugEnabled ? 'enabled' : 'disabled'}`);
    });
}

/**
 * Clean up settings connection (call on extension disable)
 */
export function destroyDebugSettings() {
    if (_settings && _settingsChangedId) {
        _settings.disconnect(_settingsChangedId);
        _settingsChangedId = null;
    }
    _settings = null;
    _debugEnabled = false;
}

/**
 * Check if debug logging is enabled
 * @returns {boolean} True if debug logging is enabled
 */
export function isDebugEnabled() {
    return _debugEnabled;
}

/**
 * Logger class with conditional output
 */
export class Logger {
    constructor(component = '') {
        this._component = component;
        this._prefix = component ? `[Zoned:${component}]` : '[Zoned]';
    }

    /**
     * Log error - always shown
     */
    error(message, ...args) {
        console.error(`${this._prefix} ${message}`, ...args);
    }

    /**
     * Log warning - always shown
     */
    warn(message, ...args) {
        console.warn(`${this._prefix} ${message}`, ...args);
    }

    /**
     * Log info - only when debug-logging enabled
     */
    info(message, ...args) {
        if (_debugEnabled) {
            console.log(`${this._prefix} ${message}`, ...args);
        }
    }

    /**
     * Log debug - only when debug-logging enabled
     */
    debug(message, ...args) {
        if (_debugEnabled) {
            console.log(`${this._prefix} [DEBUG] ${message}`, ...args);
        }
    }

    /**
     * Check if debug mode is enabled
     */
    isDebugEnabled() {
        return _debugEnabled;
    }
}

/**
 * Create a logger for a specific component
 */
export function createLogger(component) {
    return new Logger(component);
}
