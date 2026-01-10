/**
 * Global type definitions for Zoned extension
 *
 * Defines types for GJS runtime globals and extension-specific globals
 */

// GJS global object with Zoned extension debug utilities
declare global {
    const global: {
        zonedDebug?: {
            trackInstance: (name: string, track?: boolean) => void;
            trackSignal: (component: string, id: number, signal: string, objectType: string) => void;
            untrackSignal: (component: string, id: number) => void;
        };
    };
}

// Required for TypeScript to treat this as a module
export {};
