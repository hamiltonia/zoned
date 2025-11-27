/**
 * Preferences for Zoned extension
 * 
 * This file provides the preferences UI shown in GNOME Extensions app.
 * For now, it provides a simple way to test LayoutSettingsDialog.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ZonedPreferences extends ExtensionPreferences {
    /**
     * Fill preferences window
     * @param {Adw.PreferencesWindow} window - The preferences window
     */
    fillPreferencesWindow(window) {
        // Create a preferences page
        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'dialog-information-symbolic',
        });
        window.add(page);

        // Create a preferences group
        const group = new Adw.PreferencesGroup({
            title: 'Layout Management',
            description: 'Create and manage custom window layouts',
        });
        page.add(group);

        // Add info row explaining how to access features
        const infoRow = new Adw.ActionRow({
            title: 'Access Layout Tools',
            subtitle: 'Use the panel menu (top bar) to create and manage layouts:\n' +
                     '• "Choose Layout..." - Quick layout picker\n' +
                     '• "New Layout..." - Create custom layouts',
        });
        group.add(infoRow);

        // Add separator
        const separator = new Gtk.Separator({
            orientation: Gtk.Orientation.HORIZONTAL,
            margin_top: 12,
            margin_bottom: 12,
        });
        group.add(separator);

        // Add keyboard shortcuts group
        const kbGroup = new Adw.PreferencesGroup({
            title: 'Keyboard Shortcuts',
            description: 'Default keybindings for Zoned',
        });
        page.add(kbGroup);

        // List of default keybindings
        const keybindings = [
            { key: 'Super + `', description: 'Open layout picker' },
            { key: 'Super + ←', description: 'Move window left' },
            { key: 'Super + →', description: 'Move window right' },
            { key: 'Super + ↑', description: 'Move window up' },
            { key: 'Super + ↓', description: 'Move window down' },
            { key: 'Super + Tab', description: 'Cycle zones forward' },
            { key: 'Super + Shift + Tab', description: 'Cycle zones backward' },
        ];

        keybindings.forEach(kb => {
            const row = new Adw.ActionRow({
                title: kb.key,
                subtitle: kb.description,
            });
            kbGroup.add(row);
        });

        // Add about group
        const aboutGroup = new Adw.PreferencesGroup({
            title: 'About',
            description: 'Advanced window zone management for GNOME Shell',
        });
        page.add(aboutGroup);

        const aboutRow = new Adw.ActionRow({
            title: 'Zoned',
            subtitle: 'Version 1.0 (Pre-release)\nGitHub: github.com/hamiltonia/zoned',
        });
        aboutGroup.add(aboutRow);

        // Note about future features
        const futureGroup = new Adw.PreferencesGroup({
            title: 'Coming Soon',
            description: 'Features in development',
        });
        page.add(futureGroup);

        const futureRow = new Adw.ActionRow({
            title: 'Advanced Layout Manager',
            subtitle: 'Full layout library with import/export, reordering, and custom keybindings',
        });
        futureGroup.add(futureRow);
    }
}
