/**
 * Type augmentations for GNOME Shell APIs not covered by @girs packages
 *
 * These declarations add typing for GNOME Shell specific APIs that are
 * available at runtime but not included in the GJS type definitions.
 */

import '@girs/gjs';
import '@girs/shell-14';

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

export {};

// Augment Clutter.Actor with ease() method available at GNOME Shell runtime
declare module '@girs/clutter-14' {
    namespace Clutter {
        interface Actor {
            ease(params: {
                opacity?: number;
                x?: number;
                y?: number;
                width?: number;
                height?: number;
                duration: number;
                mode?: Clutter.AnimationMode;
                onComplete?: () => void;
                onStopped?: () => void;
            }): void;
        }
    }
}
