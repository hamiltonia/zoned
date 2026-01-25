/**
 * Global type definitions for Zoned extension
 *
 * Defines types for GJS runtime globals and extension-specific globals
 */

// GJS global object with Zoned extension debug utilities and GNOME Shell APIs
declare global {
    const global: {
        display: any;
        workspace_manager: any;
        get_current_time: () => number;
        stage: any;
        zonedDebug: {
            instances: Map<string, number>;
            signals: Map<string, any[]>;
            trackInstance: (name: string, track?: boolean) => void;
            trackSignal: (component: string, id: number, signal: string, objectType: string) => void;
            untrackSignal: (component: string, id: number) => void;
            verifySignalsDisconnected: () => string;
            getReport: () => string;
        } | null;
    };
}

// Export to make this a module - required for 'declare global' augmentation to work
export {};
