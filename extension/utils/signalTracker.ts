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

interface SignalConnection {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    object: any;
    id: number;
    signal: string;
}

export class SignalTracker {
    private _componentName: string;
    private _connections: SignalConnection[];

    /**
     * @param componentName - Name of the component for debugging
     */
    constructor(componentName: string) {
        this._componentName = componentName;
        this._connections = [];

        logger.memdebug(`SignalTracker created for ${componentName}`);
    }

    /**
     * Connect a signal and track it for cleanup
     *
     * @param object - Object to connect to (must have connect() method)
     * @param signal - Signal name (e.g., 'changed', 'clicked')
     * @param handler - Signal handler (MUST be a bound method, not arrow function)
     * @returns Signal ID (can be used for manual disconnect if needed)
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connect(object: unknown, signal: string, handler: (...args: any[]) => void): number | null {
        if (!object || !signal || !handler) {
            logger.error(`${this._componentName}: Invalid connect() call - object, signal, and handler required`);
            return null;
        }

        // Cast to any to access connect method - TypeScript doesn't know about GObject signals
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const signalId = (object as any).connect(signal, handler);

        this._connections.push({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            object: object as any,
            id: signalId,
            signal: signal,
        });

        // Track in global registry
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const objectName = (object as any)?.constructor?.name || 'Unknown';
        global.zonedDebug?.trackSignal(
            this._componentName,
            signalId,
            signal,
            objectName,
        );

        logger.memdebug(`${this._componentName}: Connected ${signal} (ID: ${signalId})`);

        return signalId;
    }

    /**
     * Disconnect a specific signal by ID
     *
     * @param signalId - The signal ID to disconnect
     * @returns True if disconnected, false if not found
     */
    disconnect(signalId: number): boolean {
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
            logger.error(`${this._componentName}: Failed to disconnect ${signal} (ID: ${id}): ${(e as Error).message}`);
            return false;
        }
    }

    /**
     * Disconnect all tracked signals
     * Call this in your component's destroy() method
     */
    disconnectAll(): void {
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
            const connection = this._connections.pop();
            if (!connection) break; // Should never happen, but makes TypeScript happy
            const {object, id, signal} = connection;

            try {
                object.disconnect(id);

                // Untrack from global registry
                global.zonedDebug?.untrackSignal(this._componentName, id);

                logger.memdebug(`${this._componentName}:   ✓ Disconnected ${signal} (ID: ${id})`);
                disconnected++;
            } catch (e) {
                logger.warn(`${this._componentName}:   ✗ Failed to disconnect ${signal} (ID: ${id}): ${(e as Error).message}`);
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
     * @returns Number of active connections
     */
    get count(): number {
        return this._connections.length;
    }

    /**
     * Check if any signals are connected
     * @returns True if connections exist
     */
    hasConnections(): boolean {
        return this._connections.length > 0;
    }
}

