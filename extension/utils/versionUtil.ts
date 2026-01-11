/**
 * Version Utility
 *
 * Reads extension version information from:
 * 1. .version-override file (gitignored, for local dev builds)
 * 2. metadata.json (source of truth for releases)
 *
 * This enables automatic dev build marking without modifying metadata.json
 */

import GLib from '@girs/glib-2.0';
import Gio from '@girs/gio-2.0';

/**
 * Extension version information
 */
export interface ExtensionVersion {
    /** Version name (e.g., "0.9.1" or "0.9.1-dev-20260109-133000") */
    name: string;
    /** Display version (e.g., "0.9.1 (Development Build)") */
    display: string;
    /** EGO version number for extensions.gnome.org */
    ego: number;
    /** Whether this is a development build */
    isDev: boolean;
}

/**
 * Extension metadata structure
 */
export interface ExtensionMetadata {
    version: number;
    'version-name'?: string;
    'version-display'?: string;
    [key: string]: unknown;
}

/**
 * Get current extension version
 * Checks for local dev override first, falls back to metadata.json
 *
 * @param extensionPath - Path to extension directory
 * @param metadata - Extension metadata object
 * @returns Version information object
 */
export function getExtensionVersion(
    extensionPath: string,
    metadata: ExtensionMetadata,
): ExtensionVersion {
    // Check for local dev override first (.version-override is gitignored)
    const overridePath = GLib.build_filenamev([extensionPath, '.version-override']);
    const overrideFile = Gio.File.new_for_path(overridePath);

    if (overrideFile.query_exists(null)) {
        try {
            const [success, contents] = overrideFile.load_contents(null);
            if (success) {
                const devVersion = new TextDecoder().decode(contents).trim();
                return {
                    name: devVersion,
                    display: `${devVersion} (Development Build)`,
                    ego: metadata.version,
                    isDev: true,
                };
            }
        } catch {
            // Fall through to metadata if override read fails - ignore
            void 0;
        }
    }

    // Use metadata.json (production releases)
    const versionName = metadata['version-name'] || metadata.version.toString();
    const versionDisplay = metadata['version-display'] || versionName;

    return {
        name: versionName,
        display: versionDisplay,
        ego: metadata.version,
        isDev: false,
    };
}
