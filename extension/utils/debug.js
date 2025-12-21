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
    ERROR: 0,     // Always logged
    WARN: 1,      // Always logged
    INFO: 2,      // Conditional (requires debug-logging)
    DEBUG: 3,     // Conditional (requires debug-logging)
    MEMDEBUG: 4,  // Conditional (requires memory-debug)
};

// Cached settings reference and debug state
let _settings = null;
let _debugEnabled = false;
let _memDebugEnabled = false;
let _settingsChangedId = null;
let _memDebugChangedId = null;

/**
 * Handler for debug-logging setting changes
 * Separated to avoid arrow function closure leak
 * @private
 */
function _onDebugLoggingChanged() {
    _debugEnabled = _settings.get_boolean('debug-logging');
    console.log(`[Zoned] Debug logging ${_debugEnabled ? 'enabled' : 'disabled'}`);
}

/**
 * Handler for memory-debug setting changes
 * Separated to avoid arrow function closure leak
 * @private
 */
function _onMemoryDebugChanged() {
    _memDebugEnabled = _settings.get_boolean('memory-debug');
    console.log(`[Zoned] Memory debug logging ${_memDebugEnabled ? 'enabled' : 'disabled'}`);
}

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

    // Read initial values
    _debugEnabled = _settings.get_boolean('debug-logging');
    _memDebugEnabled = _settings.get_boolean('memory-debug');

    // Watch for changes - use named functions to avoid closure leaks
    if (_settingsChangedId) {
        _settings.disconnect(_settingsChangedId);
        _settingsChangedId = null;
    }
    _settingsChangedId = _settings.connect('changed::debug-logging', _onDebugLoggingChanged);

    if (_memDebugChangedId) {
        _settings.disconnect(_memDebugChangedId);
        _memDebugChangedId = null;
    }
    _memDebugChangedId = _settings.connect('changed::memory-debug', _onMemoryDebugChanged);
}

/**
 * Clean up settings connection (call on extension disable)
 */
export function destroyDebugSettings() {
    if (_settings && _settingsChangedId) {
        _settings.disconnect(_settingsChangedId);
        _settingsChangedId = null;
    }
    if (_settings && _memDebugChangedId) {
        _settings.disconnect(_memDebugChangedId);
        _memDebugChangedId = null;
    }
    _settings = null;
    _debugEnabled = false;
    _memDebugEnabled = false;
}

/**
 * Check if debug logging is enabled
 * @returns {boolean} True if debug logging is enabled
 */
export function isDebugEnabled() {
    return _debugEnabled;
}

/**
 * Check if memory debug logging is enabled
 * @returns {boolean} True if memory debug logging is enabled
 */
export function isMemDebugEnabled() {
    return _memDebugEnabled;
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
     * Log memory debug - only when memory-debug enabled
     * Extremely verbose memory lifecycle and cleanup logging
     */
    memdebug(message, ...args) {
        if (_memDebugEnabled) {
            console.log(`${this._prefix} [MEMDEBUG] ${message}`, ...args);
        }
    }

    /**
     * Check if debug mode is enabled
     */
    isDebugEnabled() {
        return _debugEnabled;
    }

    /**
     * Check if memory debug mode is enabled
     */
    isMemDebugEnabled() {
        return _memDebugEnabled;
    }
}

/**
 * Create a logger for a specific component
 */
export function createLogger(component) {
    return new Logger(component);
}
