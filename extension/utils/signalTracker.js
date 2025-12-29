/**
 * SignalTracker - Utility for tracking and cleaning up signal connections
 *
 * Prevents memory leaks by ensuring all signal connections are properly
 * disconnected when components are destroyed.
 *
 * Usage:
 *   constructor() {
 *     this._signalTracker = new SignalTracker('MyComponent');
 *   }
 *
 *   someMethod() {
 *     this._boundOnChanged = this._onChanged.bind(this);
 *     this._signalTracker.connect(obj, 'changed', this._boundOnChanged);
 *   }
 *
 *   destroy() {
 *     this._signalTracker.disconnectAll();
 *     this._boundOnChanged = null;
 *   }
 */

import {createLogger} from './debug.js';

const logger = createLogger('SignalTracker');

export class SignalTracker {
    /**
     * @param {string} componentName - Name of the component for debugging
     */
    constructor(componentName) {
        this._componentName = componentName;
        this._connections = [];  // Array of {object, id, signal}

        logger.memdebug(`SignalTracker created for ${componentName}`);
    }

    /**
     * Connect a signal and track it for cleanup
     *
     * @param {GObject.Object} object - Object to connect to
     * @param {string} signal - Signal name (e.g., 'changed', 'clicked')
     * @param {Function} handler - Signal handler (MUST be a bound method, not arrow function)
     * @returns {number} Signal ID (can be used for manual disconnect if needed)
     */
    connect(object, signal, handler) {
        if (!object || !signal || !handler) {
            logger.error(`${this._componentName}: Invalid connect() call - object, signal, and handler required`);
            return null;
        }

        const signalId = object.connect(signal, handler);

        this._connections.push({
            object: object,
            id: signalId,
            signal: signal,
        });

        // Track in global registry
        global.zonedDebug?.trackSignal(
            this._componentName,
            signalId,
            signal,
            object.constructor?.name || 'Unknown',
        );

        logger.memdebug(`${this._componentName}: Connected ${signal} (ID: ${signalId})`);

        return signalId;
    }

    /**
     * Disconnect a specific signal by ID
     *
     * @param {number} signalId - The signal ID to disconnect
     * @returns {boolean} True if disconnected, false if not found
     */
    disconnect(signalId) {
        const index = this._connections.findIndex(conn => conn.id === signalId);

        if (index === -1) {
            logger.warn(`${this._componentName}: Signal ID ${signalId} not found`);
            return false;
        }

        const {object, id, signal} = this._connections[index];

        try {
            object.disconnect(id);
            this._connections.splice(index, 1);

            // Untrack from global registry
            global.zonedDebug?.untrackSignal(this._componentName, id);

            logger.memdebug(`${this._componentName}: Disconnected ${signal} (ID: ${id})`);
            return true;
        } catch (e) {
            logger.error(`${this._componentName}: Failed to disconnect ${signal} (ID: ${id}): ${e.message}`);
            return false;
        }
    }

    /**
     * Disconnect all tracked signals
     * Call this in your component's destroy() method
     */
    disconnectAll() {
        const count = this._connections.length;

        if (count === 0) {
            logger.memdebug(`${this._componentName}: No signals to disconnect`);
            return;
        }

        logger.memdebug(`${this._componentName}: Disconnecting ${count} signal(s)...`);

        let disconnected = 0;
        let failed = 0;

        // Disconnect in reverse order (LIFO - last connected, first disconnected)
        while (this._connections.length > 0) {
            const {object, id, signal} = this._connections.pop();

            try {
                object.disconnect(id);

                // Untrack from global registry
                global.zonedDebug?.untrackSignal(this._componentName, id);

                logger.memdebug(`${this._componentName}:   ✓ Disconnected ${signal} (ID: ${id})`);
                disconnected++;
            } catch (e) {
                logger.warn(`${this._componentName}:   ✗ Failed to disconnect ${signal} (ID: ${id}): ${e.message}`);
                failed++;
            }
        }

        if (failed > 0) {
            logger.warn(`${this._componentName}: Disconnected ${disconnected}/${count} signals (${failed} failed)`);
        } else {
            logger.memdebug(`${this._componentName}: All ${disconnected} signals disconnected successfully`);
        }
    }

    /**
     * Get the number of active signal connections
     * @returns {number}
     */
    get count() {
        return this._connections.length;
    }

    /**
     * Check if any signals are connected
     * @returns {boolean}
     */
    hasConnections() {
        return this._connections.length > 0;
    }
}
