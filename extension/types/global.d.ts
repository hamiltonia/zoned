/**
 * Global type definitions for Zoned extension
 *
 * Defines types for GJS runtime globals and extension-specific globals
 */

import type Meta from '@girs/meta-14';
import type Clutter from '@girs/clutter-14';

// Workspace interface matching Meta.Workspace runtime API
interface MetaWorkspace {
    list_windows(): Meta.Window[];
    activate(timestamp: number): void;
    index(): number;
}

// GJS global object with Zoned extension debug utilities and GNOME Shell APIs
declare global {
    const global: {
        display: Meta.Display;
        workspace_manager: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            connect: (signal: string, callback: (...args: any[]) => void) => number;
            disconnect: (id: number) => void;
            get_n_workspaces: () => number;
            get_active_workspace: () => MetaWorkspace;
            get_active_workspace_index: () => number;
            get_workspace_by_index: (index: number) => MetaWorkspace | null;
            change_workspace_by_index: (index: number, append: boolean) => void;
        };
        get_current_time: () => number;
        stage: Clutter.Stage;
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
