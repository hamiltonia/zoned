/**
 * GJS Global accessor
 *
 * Provides typed access to GJS runtime's `global` object.
 * Uses type assertion to work around TypeScript's module system limitations.
 */

import type Meta from '@girs/meta-14';
import type Clutter from '@girs/clutter-14';

interface MetaWorkspace {
    list_windows(): Meta.Window[];
    activate(timestamp: number): void;
    index(): number;
}

interface ZonedDebugAPI {
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
}

interface GlobalObject {
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
    zonedDebug: ZonedDebugAPI | null;
}

// Export typed global object - accessed via (globalThis as any).global at runtime
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- GJS global requires runtime cast
export const global: GlobalObject = (globalThis as any).global;
