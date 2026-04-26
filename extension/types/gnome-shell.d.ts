/**
 * Ambient module declarations for GNOME Shell resource imports
 *
 * These declarations allow TypeScript to understand GNOME Shell's
 * resource:// imports which are resolved at runtime by GJS.
 */

declare module 'resource:///org/gnome/shell/extensions/extension.js' {
    import Gio from '@girs/gio-2.0';

    export interface ExtensionMetadata {
        uuid: string;
        name: string;
        description: string;
        version: number | string;
        'shell-version': string[];
        url?: string;
        [key: string]: unknown;
    }

    export class Extension {
        constructor(metadata: ExtensionMetadata);

        readonly metadata: ExtensionMetadata;
        readonly uuid: string;
        readonly dir: Gio.File;
        readonly path: string;

        getSettings(schema?: string): Gio.Settings;

        enable(): void;
        disable(): void;
    }
}

declare module 'resource:///org/gnome/shell/ui/main.js' {
    import Clutter from '@girs/clutter-14';
    import Meta from '@girs/meta-14';
    import St from '@girs/st-14';

    interface MonitorInfo {
        index: number;
        x: number;
        y: number;
        width: number;
        height: number;
        connector?: string;
    }

    export const panel: {
        addToStatusArea: (role: string, indicator: unknown, position?: number, box?: string) => void;
        height: number;
        [key: string]: unknown;
    };

    export const layoutManager: {
        primaryIndex: number;
        monitors: MonitorInfo[];
        currentMonitor: MonitorInfo;
        getWorkAreaForMonitor: (monitorIndex: number) => Meta.Rectangle;
        uiGroup: Clutter.Actor;
        [key: string]: unknown;
    };

    export const uiGroup: Clutter.Actor & {
        get_n_children: () => number;
    };

    export const wm: {
        addKeybinding: (
            name: string, settings: unknown, flags: number,
            modes: number, handler: (...args: unknown[]) => void,
        ) => void;
        removeKeybinding: (name: string) => void;
        [key: string]: unknown;
    };

    export function pushModal(actor: St.Widget | Clutter.Actor, params?: {actionMode?: number}): unknown;
    export function popModal(grab: unknown): void;
}

declare module 'resource:///org/gnome/shell/ui/modalDialog.js' {
    import St from '@girs/st-14';
    import Clutter from '@girs/clutter-14';

    export interface ModalDialogParams {
        styleClass?: string;
        destroyOnClose?: boolean;
        [key: string]: unknown;
    }

    export interface ButtonInfo {
        label: string;
        action: () => void;
        key?: number;
        default?: boolean;
        [key: string]: unknown;
    }

    export class ModalDialog extends St.Widget {
        constructor(params?: ModalDialogParams);
        contentLayout: St.BoxLayout;
        dialogLayout: St.BoxLayout;
        open(timestamp?: number): boolean;
        close(timestamp?: number): void;
        setButtons(buttons: ButtonInfo[]): void;
        addButton(buttonInfo: ButtonInfo): St.Button;
        clearButtons(): void;
        setInitialKeyFocus(actor: Clutter.Actor): void;
    }
}

declare module 'resource:///org/gnome/shell/ui/panelMenu.js' {
    import St from '@girs/st-14';
    import Clutter from '@girs/clutter-14';

    export class Button extends St.Widget {
        constructor(menuAlignment: number, nameText?: string, dontCreateMenu?: boolean);
        menu: {
            addMenuItem: (item: unknown, position?: number) => void;
            removeAll: () => void;
            open: (animate?: boolean) => void;
            close: (animate?: boolean) => void;
            toggle: () => void;
            [key: string]: unknown;
        };
        add_child(child: Clutter.Actor): void;
        remove_child(child: Clutter.Actor): void;
        destroy(): void;
    }

    export class SystemIndicator extends St.BoxLayout {
        constructor();
        quickSettingsItems: unknown[];
    }
}

declare module 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js' {
    import Gio from '@girs/gio-2.0';
    import Adw from '@girs/adw-1';

    export interface ExtensionMetadata {
        uuid: string;
        name: string;
        description: string;
        version: number | string;
        'shell-version': string[];
        url?: string;
        [key: string]: unknown;
    }

    export class ExtensionPreferences {
        readonly metadata: ExtensionMetadata;
        readonly uuid: string;
        readonly dir: Gio.File;
        readonly path: string;

        getSettings(schema?: string): Gio.Settings;
        fillPreferencesWindow(window: Adw.PreferencesWindow): void;
    }
}

// Ambient declaration for gi://Gdk (GTK4 Gdk)
declare module 'gi://Gdk' {
    export * from '@girs/gdk-4.0';
    export {default} from '@girs/gdk-4.0';
}

declare module 'resource:///org/gnome/shell/ui/popupMenu.js' {
    import St from '@girs/st-14';
    import Clutter from '@girs/clutter-14';

    export interface PopupMenuItemParams {
        reactive?: boolean;
        activate?: boolean;
        hover?: boolean;
        style_class?: string;
        can_focus?: boolean;
        [key: string]: unknown;
    }

    export class PopupBaseMenuItem extends St.BoxLayout {
        constructor(params?: PopupMenuItemParams);
        activate(event?: Clutter.Event): void;
        add_child(child: Clutter.Actor): void;
        setOrnament(ornament: number): void;
    }

    export class PopupMenuItem extends PopupBaseMenuItem {
        constructor(text: string, params?: PopupMenuItemParams);
        label: St.Label;
    }

    export class PopupSeparatorMenuItem extends PopupBaseMenuItem {
        constructor(text?: string);
    }

    export class PopupSubMenuMenuItem extends PopupBaseMenuItem {
        constructor(text: string, wantIcon?: boolean);
        menu: PopupSubMenu;
    }

    export class PopupSubMenu extends St.ScrollView {
        constructor(sourceActor: Clutter.Actor, sourceArrow: St.Icon);
        addMenuItem(menuItem: PopupBaseMenuItem, position?: number): void;
    }

    export class PopupMenuSection extends St.BoxLayout {
        constructor();
        addMenuItem(menuItem: PopupBaseMenuItem, position?: number): void;
        removeAll(): void;
    }

    export class PopupMenu {
        constructor(sourceActor: Clutter.Actor, arrowAlignment: number, arrowSide: St.Side);
        addMenuItem(menuItem: PopupBaseMenuItem, position?: number): void;
        removeAll(): void;
        open(animate?: boolean): void;
        close(animate?: boolean): void;
        toggle(): void;
        connect(signal: string, callback: (...args: unknown[]) => void): number;
        disconnect(id: number): void;
        [key: string]: unknown;
    }

    export const Ornament: {
        NONE: number;
        DOT: number;
        CHECK: number;
        HIDDEN: number;
    };
}
