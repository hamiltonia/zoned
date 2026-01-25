/**
 * Type augmentations for GNOME Shell APIs not covered by @girs packages
 *
 * These declarations add typing for GNOME Shell specific APIs that are
 * available at runtime but not included in the GJS type definitions.
 */

import '@girs/gjs';
import '@girs/shell-14';
import type St from '@girs/st-14';

declare global {
    const imports: GjsGiImports;

    interface GjsGiImports {
        gi: {
            GLib: typeof import('@girs/glib-2.0').default;
            Gio: typeof import('@girs/gio-2.0').default;
            St: typeof import('@girs/st-14').default;
            Clutter: typeof import('@girs/clutter-14').default;
            Meta: typeof import('@girs/meta-14').default;
            Shell: typeof import('@girs/shell-14').default & {
                /**
                 * Action modes for modal dialogs
                 */
                ActionMode: {
                    NONE: number;
                    NORMAL: number;
                    OVERVIEW: number;
                    LOCK_SCREEN: number;
                    UNLOCK_SCREEN: number;
                    LOGIN_SCREEN: number;
                    SYSTEM_MODAL: number;
                    LOOKING_GLASS: number;
                    POPUP: number;
                    ALL: number;
                };
            };
        };
    }
}

/**
 * Augment the Main module from GNOME Shell
 */
declare module 'resource:///org/gnome/shell/ui/main.js' {
    import type St from '@girs/st-14';
    
    /**
     * Push a modal grab
     */
    export function pushModal(actor: St.Widget, params?: {actionMode?: number}): St.Widget | null;

    /**
     * Pop a modal grab
     */
    export function popModal(grab: St.Widget): void;
}

export {};
