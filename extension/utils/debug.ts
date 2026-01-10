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

import Gio from '@girs/gio-2.0';

/**
 * Log levels
 */
export const LogLevel = {
    ERROR: 0,     // Always logged
    WARN: 1,      // Always logged
    INFO: 2,      // Conditional (requires debug-logging)
    DEBUG: 3,     // Conditional (requires debug-logging)
    MEMDEBUG: 4,  // Conditional (requires memory-debug)
} as const;

// Cached settings reference and debug state
let _settings: Gio.Settings | null = null;
let _debugEnabled = false;
let _memDebugEnabled = false;
let _settingsChangedId: number | null = null;
let _memDebugChangedId: number | null = null;

/**
 * Handler for debug-logging setting changes
 * Separated to avoid arrow function closure leak
 * @private
 */
function _onDebugLoggingChanged(): void {
    if (!_settings) return;
    _debugEnabled = _settings.get_boolean('debug-logging');
    // Use console.error for meta-logging (always visible regardless of debug state)
    console.error(`[Zoned] Debug logging ${_debugEnabled ? 'enabled' : 'disabled'}`);
}

/**
 * Handler for memory-debug setting changes
 * Separated to avoid arrow function closure leak
 * @private
 */
function _onMemoryDebugChanged(): void {
    if (!_settings) return;
    _memDebugEnabled = _settings.get_boolean('memory-debug');
    // Use console.error for meta-logging (always visible regardless of debug state)
    console.error(`[Zoned] Memory debug logging ${_memDebugEnabled ? 'enabled' : 'disabled'}`);
}

/**
 * Initialize debug settings from GSettings
 * Called once when extension loads, but Logger also handles lazy init
 */
export function initDebugSettings(settings: Gio.Settings | null = null): void {
    if (settings) {
        _settings = settings;
    } else if (!_settings) {
        try {
            _settings = new Gio.Settings({
                schema_id: 'org.gnome.shell.extensions.zoned',
            });
        } catch (e) {
            // Schema not available (e.g., during prefs.js loading)
            console.error('[Zoned:Debug] Failed to load settings:', (e as Error).message);
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
export function destroyDebugSettings(): void {
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
 * @returns True if debug logging is enabled
 */
export function isDebugEnabled(): boolean {
    return _debugEnabled;
}

/**
 * Check if memory debug logging is enabled
 * @returns True if memory debug logging is enabled
 */
export function isMemDebugEnabled(): boolean {
    return _memDebugEnabled;
}

/**
 * Logger class with conditional output
 */
export class Logger {
    private _component: string;
    private _prefix: string;

    constructor(component = '') {
        this._component = component;
        this._prefix = component ? `[Zoned:${component}]` : '[Zoned]';
    }

    /**
     * Log error - always shown
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error(message: string, ...args: any[]): void {
        console.error(`${this._prefix} ${message}`, ...args);
    }

    /**
     * Log warning - always shown
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    warn(message: string, ...args: any[]): void {
        console.warn(`${this._prefix} ${message}`, ...args);
    }

    /**
     * Log info - only when debug-logging enabled
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    info(message: string, ...args: any[]): void {
        if (_debugEnabled) {
            // eslint-disable-next-line no-console
            console.log(`${this._prefix} ${message}`, ...args);
        }
    }

    /**
     * Log debug - only when debug-logging enabled
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    debug(message: string, ...args: any[]): void {
        if (_debugEnabled) {
            // eslint-disable-next-line no-console
            console.log(`${this._prefix} [DEBUG] ${message}`, ...args);
        }
    }

    /**
     * Log memory debug - only when memory-debug enabled
     * Extremely verbose memory lifecycle and cleanup logging
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    memdebug(message: string, ...args: any[]): void {
        if (_memDebugEnabled) {
            // eslint-disable-next-line no-console
            console.log(`${this._prefix} [MEMDEBUG] ${message}`, ...args);
        }
    }

    /**
     * Check if debug mode is enabled
     */
    isDebugEnabled(): boolean {
        return _debugEnabled;
    }

    /**
     * Check if memory debug mode is enabled
     */
    isMemDebugEnabled(): boolean {
        return _memDebugEnabled;
    }
}

/**
 * Create a logger for a specific component
 */
export function createLogger(component?: string): Logger {
    return new Logger(component);
}
