/**
 * ConflictDetector - Detects keybinding conflicts with GNOME Shell
 *
 * Checks if Zoned's keybindings conflict with system/GNOME bindings
 * and provides methods to resolve conflicts.
 *
 * Uses shared configuration from utils/keybindingConfig.js to ensure
 * consistency with prefs.js conflict detection.
 */

import Gio from '@girs/gio-2.0';
import {createLogger} from '../utils/debug';
import {
    GNOME_BINDINGS,
    ZONED_BINDINGS,
    acceleratorsMatch,
    GnomeBinding,
} from '../utils/keybindingConfig';

const logger = createLogger('ConflictDetector');

interface Conflict {
    zonedAction: string;
    zonedName: string;
    zonedBinding: string;
    gnomeSchema: string;
    gnomeKey: string;
    gnomeDescription: string;
    gnomeBinding: string[];
}

interface FixResult {
    success: boolean;
    error?: string;
    fixed?: {
        action: string;
        binding: string[];
    };
    backup?: Record<string, string[]>;
}

interface AutoFixResults {
    fixed: Array<{
        action: string;
        binding: string[];
    }>;
    failed: Array<{
        action: string;
        error: string;
    }>;
    backup: Record<string, string[]>;
}

export class ConflictDetector {
    private _settings: Gio.Settings;
    private _conflicts: Conflict[];

    constructor(settings: Gio.Settings) {
        this._settings = settings;
        this._conflicts = [];
    }

    /**
     * Detect all keybinding conflicts with GNOME/system
     * @returns Array of conflict objects
     */
    detectConflicts(): Conflict[] {
        this._conflicts = [];

        try {
            // Check if enhanced window management is enabled
            const enhancedEnabled = this._settings.get_boolean('enhanced-window-management-enabled');

            // Check each Zoned keybinding against all GNOME bindings
            for (const zonedBinding of ZONED_BINDINGS) {
                // Skip enhanced bindings if feature is disabled
                if (zonedBinding.enhanced && !enhancedEnabled) {
                    continue;
                }

                // Get our current binding value
                const ourBindingValue = this._settings.get_strv(zonedBinding.key);
                if (!ourBindingValue || ourBindingValue.length === 0) {
                    continue;
                }

                const ourAccel = ourBindingValue[0];

                // Check against all GNOME bindings
                for (const gnome of GNOME_BINDINGS) {
                    const conflict = this._checkConflict(
                        zonedBinding.key,
                        zonedBinding.name,
                        ourAccel,
                        gnome,
                    );

                    if (conflict) {
                        this._conflicts.push(conflict);
                    }
                }
            }

            logger.info(`Detected ${this._conflicts.length} keybinding conflicts`);
        } catch (error) {
            logger.error(`Error detecting conflicts: ${error}`);
        }

        return this._conflicts;
    }

    /**
     * Check if a Zoned binding conflicts with a GNOME binding
     * @private
     * @param zonedKey - Zoned settings key
     * @param zonedName - Human-readable name
     * @param ourAccel - Our accelerator string
     * @param gnome - GNOME binding definition from GNOME_BINDINGS
     * @returns Conflict object or null
     */
    private _checkConflict(zonedKey: string, zonedName: string, ourAccel: string, gnome: GnomeBinding): Conflict | null {
        try {
            const schema = new Gio.Settings({schema: gnome.schema});
            const gnomeBindings = schema.get_strv(gnome.key);

            // Check if any GNOME binding matches ours
            for (const gnomeAccel of gnomeBindings) {
                if (gnomeAccel && acceleratorsMatch(ourAccel, gnomeAccel)) {
                    logger.debug(`Conflict: ${zonedKey} (${ourAccel}) conflicts with ${gnome.name} (${gnomeAccel})`);

                    return {
                        zonedAction: zonedKey,
                        zonedName: zonedName,
                        zonedBinding: ourAccel,
                        gnomeSchema: gnome.schema,
                        gnomeKey: gnome.key,
                        gnomeDescription: gnome.name,
                        gnomeBinding: gnomeBindings,
                    };
                }
            }
        } catch {
            // Schema not available (e.g., Tiling Assistant not installed), skip silently
        }

        return null;
    }

    /**
     * Get array of detected conflicts
     * @returns Array of conflict objects
     */
    getConflicts(): Conflict[] {
        return this._conflicts;
    }

    /**
     * Check if any conflicts exist
     * @returns True if conflicts detected
     */
    hasConflicts(): boolean {
        return this._conflicts.length > 0;
    }

    /**
     * Fix a single conflict by disabling the conflicting GNOME binding
     * @param zonedAction - The Zoned action key (e.g., 'cycle-zone-left')
     * @returns Result of fix attempt
     */
    fixSingleConflict(zonedAction: string): FixResult {
        const conflict = this._conflicts.find(c => c.zonedAction === zonedAction);

        if (!conflict) {
            logger.warn(`No conflict found for action: ${zonedAction}`);
            return {success: false, error: 'No conflict found'};
        }

        try {
            const schema = new Gio.Settings({schema: conflict.gnomeSchema});

            // Backup current value
            const currentValue = schema.get_strv(conflict.gnomeKey);
            const backup = {[`${conflict.gnomeSchema}:${conflict.gnomeKey}`]: currentValue};

            // Disable the conflicting GNOME binding
            schema.set_strv(conflict.gnomeKey, []);

            logger.info(`Fixed single conflict: Disabled ${conflict.gnomeDescription}`);

            // Re-detect conflicts to update internal state
            this.detectConflicts();

            return {
                success: true,
                fixed: {
                    action: conflict.gnomeDescription,
                    binding: conflict.gnomeBinding,
                },
                backup,
            };
        } catch (error) {
            logger.error(`Failed to fix conflict for ${zonedAction}: ${error}`);
            return {success: false, error: String(error)};
        }
    }

    /**
     * Automatically fix conflicts by disabling conflicting GNOME bindings
     * @returns Results of fix attempt
     */
    autoFixConflicts(): AutoFixResults {
        const results: AutoFixResults = {
            fixed: [],
            failed: [],
            backup: {},
        };

        try {
            this._conflicts.forEach(conflict => {
                try {
                    const schema = new Gio.Settings({schema: conflict.gnomeSchema});

                    // Backup current value
                    const currentValue = schema.get_strv(conflict.gnomeKey);
                    results.backup[`${conflict.gnomeSchema}:${conflict.gnomeKey}`] = currentValue;

                    // Disable the conflicting GNOME binding
                    schema.set_strv(conflict.gnomeKey, []);

                    results.fixed.push({
                        action: conflict.gnomeDescription,
                        binding: conflict.gnomeBinding,
                    });

                    logger.info(`Fixed conflict: Disabled ${conflict.gnomeDescription}`);
                } catch (error) {
                    results.failed.push({
                        action: conflict.gnomeDescription,
                        error: String(error),
                    });
                    logger.error(`Failed to fix ${conflict.gnomeDescription}: ${error}`);
                }
            });

            // Sync all settings to ensure changes are visible to other processes (prefs.js)
            if (results.fixed.length > 0) {
                Gio.Settings.sync();
                logger.debug('Synced GSettings after fixing conflicts');
            }
        } catch (error) {
            logger.error(`Error in autoFixConflicts: ${error}`);
        }

        return results;
    }

    /**
     * Restore GNOME bindings from backup
     * @param backup - Backup object from autoFixConflicts
     */
    restoreFromBackup(backup: Record<string, string[]>): void {
        try {
            Object.entries(backup).forEach(([key, value]) => {
                const [schemaId, settingKey] = key.split(':');
                try {
                    const schema = new Gio.Settings({schema: schemaId});
                    schema.set_strv(settingKey, value);
                    logger.info(`Restored: ${key}`);
                } catch (error) {
                    logger.error(`Failed to restore ${key}: ${error}`);
                }
            });
        } catch (error) {
            logger.error(`Error restoring from backup: ${error}`);
        }
    }

    /**
     * Get a human-readable summary of conflicts
     * @returns Formatted summary
     */
    getConflictSummary(): string {
        if (this._conflicts.length === 0) {
            return 'No keybinding conflicts detected.';
        }

        let summary = `${this._conflicts.length} keybinding conflict${this._conflicts.length !== 1 ? 's' : ''} detected:\n\n`;

        this._conflicts.forEach((conflict, index) => {
            summary += `${index + 1}. ${conflict.zonedBinding}\n`;
            summary += `   Zoned: ${conflict.zonedAction}\n`;
            summary += `   ${conflict.gnomeDescription}\n\n`;
        });

        return summary.trim();
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        this._conflicts = [];
    }
}
