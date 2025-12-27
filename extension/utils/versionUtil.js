/**
 * Version Utility
 *
 * Reads extension version information from:
 * 1. .version-override file (gitignored, for local dev builds)
 * 2. metadata.json (source of truth for releases)
 *
 * This enables automatic dev build marking without modifying metadata.json
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

/**
 * Get current extension version
 * Checks for local dev override first, falls back to metadata.json
 *
 * @param {string} extensionPath - Path to extension directory
 * @param {object} metadata - Extension metadata object
 * @returns {object} {name: string, display: string, ego: number, isDev: boolean}
 */
export function getExtensionVersion(extensionPath, metadata) {
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
            // Fall through to metadata if override read fails
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
