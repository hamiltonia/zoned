/**
 * Global type definitions for Zoned extension
 *
 * Defines types for GJS runtime globals and extension-specific globals
 */

// GJS global object with Zoned extension debug utilities and GNOME Shell APIs
declare global {
    const global: {
        display: {
            get_current_time_roundtrip: () => number;
            get_focus_window: () => unknown;
            [key: string]: unknown;
        };
        workspace_manager: {
            connect: (signal: string, callback: (...args: unknown[]) => void) => number;
            disconnect: (id: number) => void;
            get_n_workspaces: () => number;
            get_active_workspace: () => unknown;
            [key: string]: unknown;
        };
        get_current_time: () => number;
        stage: {
            get_width: () => number;
            get_height: () => number;
            connect: (signal: string, callback: (...args: unknown[]) => void) => number;
            disconnect: (id: number) => void;
            [key: string]: unknown;
        };
        zonedDebug: {
            instances: Map<string, number>;
            signals: Map<string, Array<{
                id: number;
                signal: string;
                source: string;
                stack: string;
            }>>;
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
