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
        [key: string]: any;
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
    export const panel: any;
    export const layoutManager: any;
    export const uiGroup: any;
    export const wm: any;
}

declare module 'resource:///org/gnome/shell/ui/modalDialog.js' {
    import St from '@girs/st-14';
    import Clutter from '@girs/clutter-14';

    export class ModalDialog extends St.Widget {
        constructor(params?: any);
        contentLayout: St.BoxLayout;
        dialogLayout: St.BoxLayout;
        open(timestamp?: number): boolean;
        close(timestamp?: number): void;
        setButtons(buttons: any[]): void;
        addButton(buttonInfo: any): St.Button;
        clearButtons(): void;
        setInitialKeyFocus(actor: Clutter.Actor): void;
    }
}

declare module 'resource:///org/gnome/shell/ui/panelMenu.js' {
    import St from '@girs/st-14';
    import Clutter from '@girs/clutter-14';

    export class Button extends St.Widget {
        constructor(menuAlignment: number, nameText?: string, dontCreateMenu?: boolean);
        menu: any;
        add_child(child: Clutter.Actor): void;
        remove_child(child: Clutter.Actor): void;
        destroy(): void;
    }

    export class SystemIndicator extends St.BoxLayout {
        constructor();
        quickSettingsItems: any[];
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
        [key: string]: any;
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
    export { default } from '@girs/gdk-4.0';
}

declare module 'resource:///org/gnome/shell/ui/popupMenu.js' {
    import St from '@girs/st-14';
    import Clutter from '@girs/clutter-14';

    export class PopupBaseMenuItem extends St.BoxLayout {
        constructor(params?: any);
        activate(event?: Clutter.Event): void;
        add_child(child: Clutter.Actor): void;
        setOrnament(ornament: number): void;
    }

    export class PopupMenuItem extends PopupBaseMenuItem {
        constructor(text: string, params?: any);
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

    export const Ornament: {
        NONE: number;
        DOT: number;
        CHECK: number;
        HIDDEN: number;
    };
}
