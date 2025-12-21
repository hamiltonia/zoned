/**
 * ThemeManager - Centralized UI theming system
 *
 * Manages color schemes for all extension UI components.
 * Supports:
 * - System theme detection (GNOME light/dark preference)
 * - User override (force light, dark, or follow system)
 * - Dynamic theme switching without reload
 * - GNOME accent color integration
 *
 * Usage:
 *   const themeManager = new ThemeManager(settings);
 *   const colors = themeManager.getColors();
 *   container.style = `background-color: ${colors.containerBg};`;
 */

import Gio from 'gi://Gio';
import {createLogger} from './debug.js';

const logger = createLogger('ThemeManager');

export class ThemeManager {
    /**
     * Create a new ThemeManager
     * @param {Gio.Settings} settings - Extension settings instance
     */
    constructor(settings) {
        global.zonedDebug?.trackInstance('ThemeManager', 1);
        this._settings = settings;

        // Listen to GNOME system interface settings
        this._interfaceSettings = new Gio.Settings({
            schema: 'org.gnome.desktop.interface',
        });

        // Signal tracking for cleanup
        this._signalIds = [];

        logger.debug('ThemeManager initialized');
    }

    /**
     * Determine if dark mode should be used
     * Respects user preference (light/dark/system)
     * @returns {boolean} True if dark mode should be used
     */
    isDarkMode() {
        try {
            const userPref = this._settings.get_string('ui-theme');

            switch (userPref) {
                case 'light':
                    return false;

                case 'dark':
                    return true;

                case 'system':
                default: {
                    // Check GNOME system preference
                    const scheme = this._interfaceSettings.get_string('color-scheme');
                    return scheme === 'prefer-dark';
                }
            }
        } catch (e) {
            logger.warn('Error detecting theme:', e);
            return true;  // Default to dark
        }
    }

    /**
     * Get background colors for current theme
     * @param {boolean} isDark - Whether dark mode is active
     * @returns {Object} Background color properties
     * @private
     */
    _getBackgroundColors(isDark) {
        return {
            modalOverlay: 'rgba(0, 0, 0, 0.7)',  // Always dark - modal overlays dim the background
            containerBg: isDark ? 'rgba(40, 40, 40, 0.98)' : 'rgba(250, 250, 250, 0.98)',
            cardBg: isDark ? 'rgba(68, 68, 68, 1)' : 'rgba(200, 200, 200, 1)',
            cardBgActive: isDark ? 'rgba(40, 40, 40, 0.8)' : 'rgba(245, 245, 245, 0.9)',
            cardBgTemplate: isDark ? 'rgba(40, 40, 40, 0.8)' : 'rgba(248, 248, 248, 0.9)',
            toolbarBg: isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(240, 240, 240, 0.95)',
            helpBoxBg: isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(245, 245, 245, 0.95)',
            canvasBg: isDark ? '#1a1a1a' : '#f5f5f5',
        };
    }

    /**
     * Get visual depth colors (sections, inputs, dividers)
     * @param {boolean} isDark - Whether dark mode is active
     * @returns {Object} Visual depth color properties
     * @private
     */
    _getDepthColors(isDark) {
        return {
            sectionBg: isDark ? 'rgba(55, 55, 55, 0.6)' : 'rgba(255, 255, 255, 1.0)',
            sectionBorder: isDark ? 'rgba(80, 80, 80, 0.5)' : 'rgba(0, 0, 0, 0.08)',
            sectionShadow: isDark
                ? '0 1px 3px rgba(0, 0, 0, 0.3)'
                : '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
            inputBg: isDark ? 'rgba(30, 30, 30, 0.8)' : 'rgba(245, 245, 245, 0.9)',
            inputBorder: isDark ? 'rgba(70, 70, 70, 0.8)' : 'rgba(0, 0, 0, 0.12)',
            inputShadowInset: isDark
                ? 'inset 0 1px 2px rgba(0, 0, 0, 0.3)'
                : 'inset 0 1px 2px rgba(0, 0, 0, 0.06)',
            divider: isDark ? 'rgba(80, 80, 80, 0.5)' : 'rgba(0, 0, 0, 0.08)',
        };
    }

    /**
     * Get card colors (workspace, monitor cards)
     * @param {boolean} isDark - Whether dark mode is active
     * @returns {Object} Card color properties
     * @private
     */
    _getCardColors(isDark) {
        return {
            workspaceCardBg: isDark
                ? 'linear-gradient(135deg, #2d3748 0%, #1a202c 100%)'
                : 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
            workspaceCardBgActive: isDark
                ? 'linear-gradient(135deg, #1e3a5f 0%, #0f2847 100%)'
                : 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
            monitorCardBg: isDark
                ? 'linear-gradient(135deg, #2d3748 0%, #1a202c 100%)'
                : 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
            monitorIconBg: isDark
                ? 'linear-gradient(135deg, #1a202c 0%, #0f1419 100%)'
                : 'linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)',
            monitorIconBorder: isDark ? '#6b7280' : '#9ca3af',
        };
    }

    /**
     * Get text colors
     * @param {boolean} isDark - Whether dark mode is active
     * @returns {Object} Text color properties
     * @private
     */
    _getTextColors(isDark) {
        return {
            textPrimary: isDark ? '#ffffff' : '#1a1a1a',
            textSecondary: isDark ? '#e0e0e0' : '#4a4a4a',
            textMuted: isDark ? '#9ca3af' : '#6b7280',
        };
    }

    /**
     * Get border colors
     * @param {boolean} isDark - Whether dark mode is active
     * @returns {Object} Border color properties
     * @private
     */
    _getBorderColors(isDark) {
        return {
            border: isDark ? '#404040' : '#d0d0d0',
            borderLight: isDark ? '#4a5568' : '#e5e7eb',
            borderTransparent: 'transparent',
        };
    }

    /**
     * Get button and menu colors
     * @param {boolean} isDark - Whether dark mode is active
     * @returns {Object} Button/menu color properties
     * @private
     */
    _getUIColors(isDark) {
        return {
            // Buttons (neutral/cancel buttons)
            buttonBg: isDark ? 'rgba(80, 80, 80, 0.9)' : 'rgba(200, 200, 200, 0.95)',
            buttonBgHover: isDark ? 'rgba(100, 100, 100, 0.9)' : 'rgba(170, 170, 170, 0.95)',
            buttonText: isDark ? 'white' : '#1a1a1a',
            // Menu
            menuBg: isDark ? '#353535' : '#f9fafb',
            menuBorder: isDark ? '#505050' : '#d1d5db',
            menuItemBg: 'transparent',
            menuItemBgHover: isDark ? '#3d3d3d' : '#f3f4f6',
            menuItemBgActive: isDark ? '#2d4a5a' : '#dbeafe',
            // Empty state
            emptyStateBg: isDark ? 'rgba(60, 60, 60, 0.3)' : 'rgba(243, 244, 246, 0.5)',
            emptyStateBorder: isDark ? '#666' : '#d1d5db',
        };
    }

    /**
     * Get accent-derived colors (system accent color and variants)
     * @param {Object} accent - RGB accent color object {red, green, blue}
     * @param {boolean} isDark - Whether dark mode is active
     * @returns {Object} Accent color properties
     * @private
     */
    _getAccentDerivedColors(accent, isDark) {
        const accentHex = this._rgbToHex(accent.red, accent.green, accent.blue);
        return {
            accent: accent,
            accentHex: accentHex,
            accentRGBA: (alpha) => {
                return `rgba(${Math.round(accent.red * 255)}, ${Math.round(accent.green * 255)}, ${Math.round(accent.blue * 255)}, ${alpha})`;
            },
            accentHexHover: this._rgbToHex(
                Math.min(1, accent.red * 1.15),
                Math.min(1, accent.green * 1.15),
                Math.min(1, accent.blue * 1.15),
            ),
            // Zone preview colors
            zoneFill: isDark
                ? this._rgbaWithAlpha(accent, 0.3)
                : this._rgbaWithAlpha(accent, 0.2),
            zoneBorder: accentHex,
            zoneFillGrey: isDark ? 'rgba(128, 128, 128, 0.35)' : 'rgba(100, 100, 100, 0.25)',
        };
    }

    /**
     * Get complete color palette for current theme
     * @returns {Object} Color palette with all UI colors
     */
    getColors() {
        const isDark = this.isDarkMode();
        const accent = this._getAccentColor();

        return {
            isDark,
            ...this._getBackgroundColors(isDark),
            ...this._getDepthColors(isDark),
            ...this._getCardColors(isDark),
            ...this._getTextColors(isDark),
            ...this._getBorderColors(isDark),
            ...this._getUIColors(isDark),
            ...this._getAccentDerivedColors(accent, isDark),
        };
    }

    /**
     * Connect to theme change signals
     * Calls callback when either user preference OR system theme changes
     * @param {Function} callback - Function to call on theme change
     * @returns {Object} Object with signal IDs for cleanup
     */
    connectChanged(callback) {
        // Create bound callback wrapper to avoid closure leaks
        const boundCallback = callback.bind(null);

        // Listen to user's theme preference changes
        const userPrefId = this._settings.connect('changed::ui-theme', () => {
            logger.debug('User theme preference changed');
            boundCallback();
        });

        // Listen to GNOME system theme changes (only matters if user pref is 'system')
        const systemId = this._interfaceSettings.connect('changed::color-scheme', () => {
            const userPref = this._settings.get_string('ui-theme');
            if (userPref === 'system') {
                logger.debug('System color-scheme changed (user is in system mode)');
                boundCallback();
            }
        });

        // Track signal IDs for automatic cleanup in destroy()
        this._signalIds.push({
            source: this._settings,
            id: userPrefId,
        });
        this._signalIds.push({
            source: this._interfaceSettings,
            id: systemId,
        });

        return {userPrefId, systemId};
    }

    /**
     * Disconnect theme change signals
     * @param {Object} ids - Object with userPrefId and systemId
     */
    disconnectChanged(ids) {
        if (ids.userPrefId && this._settings) {
            this._settings.disconnect(ids.userPrefId);
            // Remove from tracked signals
            this._signalIds = this._signalIds.filter(s => s.id !== ids.userPrefId);
        }
        if (ids.systemId && this._interfaceSettings) {
            this._interfaceSettings.disconnect(ids.systemId);
            // Remove from tracked signals
            this._signalIds = this._signalIds.filter(s => s.id !== ids.systemId);
        }
    }

    /**
     * Get GNOME system accent color
     * @returns {Object} RGB color object {red, green, blue} in 0-1 range
     * @private
     */
    _getAccentColor() {
        try {
            const accentColorName = this._interfaceSettings.get_string('accent-color');

            const accentColors = {
                'blue': {red: 0.29, green: 0.56, blue: 0.85},
                'teal': {red: 0.13, green: 0.63, blue: 0.62},
                'green': {red: 0.38, green: 0.68, blue: 0.33},
                'yellow': {red: 0.84, green: 0.65, blue: 0.13},
                'orange': {red: 0.92, green: 0.49, blue: 0.18},
                'red': {red: 0.88, green: 0.29, blue: 0.29},
                'pink': {red: 0.90, green: 0.39, blue: 0.64},
                'purple': {red: 0.60, green: 0.41, blue: 0.82},
                'slate': {red: 0.45, green: 0.52, blue: 0.60},
            };

            return accentColors[accentColorName] || accentColors['blue'];
        } catch (e) {
            logger.warn('Failed to get accent color:', e);
            return {red: 0.29, green: 0.56, blue: 0.85}; // Default to blue
        }
    }

    /**
     * Convert RGB values (0-1 range) to hex color string
     * @param {number} r - Red (0-1)
     * @param {number} g - Green (0-1)
     * @param {number} b - Blue (0-1)
     * @returns {string} Hex color string (#RRGGBB)
     * @private
     */
    _rgbToHex(r, g, b) {
        const toHex = (val) => {
            const hex = Math.round(val * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    /**
     * Convert RGB object to RGBA string with custom alpha
     * @param {Object} rgb - RGB object {red, green, blue} in 0-1 range
     * @param {number} alpha - Alpha value (0-1)
     * @returns {string} RGBA color string
     * @private
     */
    _rgbaWithAlpha(rgb, alpha) {
        return `rgba(${Math.round(rgb.red * 255)}, ${Math.round(rgb.green * 255)}, ${Math.round(rgb.blue * 255)}, ${alpha})`;
    }

    /**
     * Clean up resources
     */
    destroy() {
        // Disconnect any signals that weren't manually disconnected
        if (this._signalIds && this._signalIds.length > 0) {
            logger.debug(`ThemeManager: Cleaning up ${this._signalIds.length} signal(s)`);
            this._signalIds.forEach(({source, id}) => {
                try {
                    if (source && id) {
                        source.disconnect(id);
                    }
                } catch (e) {
                    logger.warn(`Failed to disconnect signal ${id}: ${e}`);
                }
            });
            this._signalIds = [];
        }

        // Clear our reference to interface settings
        // (GSettings objects are managed by GLib, but we should release our reference)
        this._interfaceSettings = null;
        this._settings = null;

        global.zonedDebug?.trackInstance('ThemeManager', -1);
    }
}
