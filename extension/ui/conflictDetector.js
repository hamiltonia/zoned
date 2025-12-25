/**
 * ConflictDetector - Detects keybinding conflicts with GNOME Shell
 *
 * Checks if Zoned's keybindings conflict with system/GNOME bindings
 * and provides methods to resolve conflicts.
 *
 * Uses shared configuration from utils/keybindingConfig.js to ensure
 * consistency with prefs.js conflict detection.
 */

import Gio from 'gi://Gio';
import {createLogger} from '../utils/debug.js';
import {
    GNOME_BINDINGS,
    ZONED_BINDINGS,
    acceleratorsMatch,
} from '../utils/keybindingConfig.js';

const logger = createLogger('ConflictDetector');

export class ConflictDetector {
    constructor(settings) {
        this._settings = settings;
        this._conflicts = [];
    }

    /**
     * Detect all keybinding conflicts with GNOME/system
     * @returns {Array} Array of conflict objects
     */
    detectConflicts() {
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
     * @param {string} zonedKey - Zoned settings key
     * @param {string} zonedName - Human-readable name
     * @param {string} ourAccel - Our accelerator string
     * @param {Object} gnome - GNOME binding definition from GNOME_BINDINGS
     * @returns {Object|null} Conflict object or null
     */
    _checkConflict(zonedKey, zonedName, ourAccel, gnome) {
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
     * @returns {Array} Array of conflict objects
     */
    getConflicts() {
        return this._conflicts;
    }

    /**
     * Check if any conflicts exist
     * @returns {boolean} True if conflicts detected
     */
    hasConflicts() {
        return this._conflicts.length > 0;
    }

    /**
     * Fix a single conflict by disabling the conflicting GNOME binding
     * @param {string} zonedAction - The Zoned action key (e.g., 'cycle-zone-left')
     * @returns {Object} Result of fix attempt
     */
    fixSingleConflict(zonedAction) {
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
            return {success: false, error: error.message};
        }
    }

    /**
     * Automatically fix conflicts by disabling conflicting GNOME bindings
     * @returns {Object} Results of fix attempt
     */
    autoFixConflicts() {
        const results = {
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
                        error: error.message,
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
     * @param {Object} backup - Backup object from autoFixConflicts
     */
    restoreFromBackup(backup) {
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
     * @returns {string} Formatted summary
     */
    getConflictSummary() {
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
    destroy() {
        this._conflicts = [];
    }
}
