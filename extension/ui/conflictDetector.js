/**
 * ConflictDetector - Detects keybinding conflicts with GNOME Shell
 * 
 * Checks if ZoneFancy's keybindings conflict with default GNOME bindings
 * and provides methods to resolve conflicts.
 */

import Gio from 'gi://Gio';

export class ConflictDetector {
    constructor(settings) {
        this._settings = settings;
        this._conflicts = [];
    }

    /**
     * Detect all keybinding conflicts with GNOME
     * @returns {Array} Array of conflict objects
     */
    detectConflicts() {
        this._conflicts = [];

        try {
            // Get GNOME Settings schemas
            const mutterSettings = new Gio.Settings({
                schema: 'org.gnome.mutter.keybindings'
            });
            const wmSettings = new Gio.Settings({
                schema: 'org.gnome.desktop.wm.keybindings'
            });

            // Check each ZoneFancy keybinding
            this._checkBinding('cycle-zone-left', '<Super>Left', [
                {
                    schema: mutterSettings,
                    key: 'toggle-tiled-left',
                    description: 'GNOME: Tile window left'
                }
            ]);

            this._checkBinding('cycle-zone-right', '<Super>Right', [
                {
                    schema: mutterSettings,
                    key: 'toggle-tiled-right',
                    description: 'GNOME: Tile window right'
                }
            ]);

            this._checkBinding('show-profile-picker', '<Super>grave', [
                {
                    schema: wmSettings,
                    key: 'switch-group',
                    description: 'GNOME: Switch windows of application'
                }
            ]);

            this._checkBinding('maximize-window', '<Super>Up', [
                {
                    schema: wmSettings,
                    key: 'maximize',
                    description: 'GNOME: Maximize window'
                }
            ]);

            this._checkBinding('minimize-window', '<Super>Down', [
                {
                    schema: wmSettings,
                    key: 'minimize',
                    description: 'GNOME: Minimize window'
                }
            ]);

            console.log(`[ZoneFancy] Detected ${this._conflicts.length} keybinding conflicts`);
        } catch (error) {
            console.error(`[ZoneFancy] Error detecting conflicts: ${error}`);
        }

        return this._conflicts;
    }

    /**
     * Get all alias variations of a keybinding
     * @private
     * @param {string} binding - The keybinding to get aliases for
     * @returns {Array} Array of alias bindings including the original
     */
    _getKeyAliases(binding) {
        const aliases = [binding];
        
        // Handle grave/Above_Tab aliasing (backtick key)
        if (binding.includes('grave')) {
            aliases.push(binding.replace('grave', 'Above_Tab'));
        } else if (binding.includes('Above_Tab')) {
            aliases.push(binding.replace('Above_Tab', 'grave'));
        }
        
        return aliases;
    }

    /**
     * Check if two bindings conflict (considering aliases)
     * @private
     * @param {string} binding1 - First binding
     * @param {string} binding2 - Second binding
     * @returns {boolean} True if bindings conflict
     */
    _bindingsConflict(binding1, binding2) {
        // Direct match
        if (binding1 === binding2) {
            return true;
        }
        
        // Check aliases
        const aliases1 = this._getKeyAliases(binding1);
        const aliases2 = this._getKeyAliases(binding2);
        
        return aliases1.some(alias1 => aliases2.includes(alias1));
    }

    /**
     * Check a specific binding for conflicts
     * @private
     */
    _checkBinding(ourAction, ourBinding, gnomeBindings) {
        const ourBindingValue = this._settings.get_strv(ourAction);
        
        if (!ourBindingValue || ourBindingValue.length === 0) {
            return;
        }

        gnomeBindings.forEach(({schema, key, description}) => {
            try {
                const gnomeBindingValue = schema.get_strv(key);
                
                // Check if any of our bindings conflict with GNOME bindings
                // Now considering key aliases (e.g., grave vs Above_Tab)
                const hasConflict = ourBindingValue.some(ourKey => 
                    gnomeBindingValue.some(gnomeKey => 
                        this._bindingsConflict(ourKey, gnomeKey)
                    )
                );

                if (hasConflict) {
                    this._conflicts.push({
                        zonefancyAction: ourAction,
                        zonefancyBinding: ourBindingValue[0],
                        gnomeSchema: schema.schema_id,
                        gnomeKey: key,
                        gnomeDescription: description,
                        gnomeBinding: gnomeBindingValue
                    });

                    console.log(`[ZoneFancy] Conflict: ${ourAction} (${ourBindingValue[0]}) conflicts with ${description}`);
                }
            } catch (error) {
                console.warn(`[ZoneFancy] Could not check binding ${key}: ${error}`);
            }
        });
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
     * Automatically fix conflicts by disabling conflicting GNOME bindings
     * @returns {Object} Results of fix attempt
     */
    autoFixConflicts() {
        const results = {
            fixed: [],
            failed: [],
            backup: {}
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
                        binding: conflict.gnomeBinding
                    });

                    console.log(`[ZoneFancy] Fixed conflict: Disabled ${conflict.gnomeDescription}`);
                } catch (error) {
                    results.failed.push({
                        action: conflict.gnomeDescription,
                        error: error.message
                    });
                    console.error(`[ZoneFancy] Failed to fix ${conflict.gnomeDescription}: ${error}`);
                }
            });
        } catch (error) {
            console.error(`[ZoneFancy] Error in autoFixConflicts: ${error}`);
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
                    console.log(`[ZoneFancy] Restored: ${key}`);
                } catch (error) {
                    console.error(`[ZoneFancy] Failed to restore ${key}: ${error}`);
                }
            });
        } catch (error) {
            console.error(`[ZoneFancy] Error restoring from backup: ${error}`);
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
            summary += `${index + 1}. ${conflict.zonefancyBinding}\n`;
            summary += `   ZoneFancy: ${conflict.zonefancyAction}\n`;
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
