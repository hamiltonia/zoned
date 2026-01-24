/**
 * Global type definitions for Zoned extension
 *
 * Defines types for GJS runtime globals and extension-specific globals
 */

import Gio from '@girs/gio-2.0';

// GJS global object with Zoned extension debug utilities and GNOME Shell APIs
declare global {
    const global: {
        display: any;
        workspace_manager: any;
        get_current_time: () => number;
        stage: any;
        zonedDebug?: {
            instances: Map<string, number>;
            signals: Map<string, any[]>;
            trackInstance: (name: string, track?: boolean) => void;
            trackSignal: (component: string, id: number, signal: string, objectType: string) => void;
            untrackSignal: (component: string, id: number) => void;
            verifySignalsDisconnected: () => string;
            getReport: () => string;
        };
    };
}

declare module 'resource:///org/gnome/shell/extensions/extension.js' {
    export interface ExtensionMetadata {
        uuid: string;
        name: string;
        description: string;
        version: number | string;
        'shell-version': string[];
        url?: string;
        [key: string]: any;
    }

    export class Extension {
        constructor(metadata: ExtensionMetadata);

        readonly metadata: ExtensionMetadata;
        readonly uuid: string;
        readonly dir: any;
        readonly path: string;

        getSettings(schema?: string): Gio.Settings;

        enable(): void;
        disable(): void;
    }
}

// Export layout types for use throughout the extension
export type {Zone, Layout, BuiltinTemplate} from './layout';
