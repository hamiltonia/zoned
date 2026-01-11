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
        zonedDebug?: {
            trackInstance: (name: string, track?: boolean) => void;
            trackSignal: (component: string, id: number, signal: string, objectType: string) => void;
            untrackSignal: (component: string, id: number) => void;
            getReport: () => string;
        };
    };
}

// Required for TypeScript to treat this as a module
export {};
