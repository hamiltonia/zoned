/**
 * Debug logging utility for Zoned extension
 * 
 * Provides conditional logging based on DEBUG flag.
 * Errors are always logged, info/debug logs can be toggled.
 */

// Set to true to enable debug logging
// Set to false for production (reduces overhead in hot paths)
const DEBUG = true;

/**
 * Log levels
 */
export const LogLevel = {
    ERROR: 0,   // Always logged
    WARN: 1,    // Always logged
    INFO: 2,    // Conditional
    DEBUG: 3    // Conditional
};

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
     * Log info - only in debug mode
     */
    info(message, ...args) {
        if (DEBUG) {
            console.log(`${this._prefix} ${message}`, ...args);
        }
    }

    /**
     * Log debug - only in debug mode
     */
    debug(message, ...args) {
        if (DEBUG) {
            console.log(`${this._prefix} [DEBUG] ${message}`, ...args);
        }
    }

    /**
     * Check if debug mode is enabled
     */
    isDebugEnabled() {
        return DEBUG;
    }
}

/**
 * Create a logger for a specific component
 */
export function createLogger(component) {
    return new Logger(component);
}
