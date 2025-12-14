/**
 * TemplateManager - Manages built-in layout templates
 *
 * Provides pre-configured layout templates that users can apply:
 * - Halves: 50/50 split
 * - Thirds: 33/33/33 columns
 * - Quarters: 2x2 grid
 * - Focus: 70/30 main+sidebar
 */

import {createLogger} from './utils/debug.js';

const logger = createLogger('TemplateManager');

/**
 * Built-in layout templates
 * All coordinates are normalized (0.0 to 1.0)
 */
const BUILTIN_TEMPLATES = {
    halves: {
        id: 'halves',
        name: 'Halves',
        icon: '⫿',  // Unicode split icon
        description: '50/50 split - Left and Right',
        zones: [
            {name: 'Left', x: 0.0, y: 0.0, w: 0.5, h: 1.0},
            {name: 'Right', x: 0.5, y: 0.0, w: 0.5, h: 1.0},
        ],
    },
    thirds: {
        id: 'thirds',
        name: 'Thirds',
        icon: '⫴',  // Unicode thirds icon
        description: '33/33/33 columns',
        zones: [
            {name: 'Left', x: 0.0, y: 0.0, w: 0.333, h: 1.0},
            {name: 'Center', x: 0.333, y: 0.0, w: 0.334, h: 1.0},
            {name: 'Right', x: 0.667, y: 0.0, w: 0.333, h: 1.0},
        ],
    },
    quarters: {
        id: 'quarters',
        name: 'Quarters',
        icon: '⊞',  // Unicode grid icon
        description: '2×2 grid layout',
        zones: [
            {name: 'Top Left', x: 0.0, y: 0.0, w: 0.5, h: 0.5},
            {name: 'Top Right', x: 0.5, y: 0.0, w: 0.5, h: 0.5},
            {name: 'Bottom Left', x: 0.0, y: 0.5, w: 0.5, h: 0.5},
            {name: 'Bottom Right', x: 0.5, y: 0.5, w: 0.5, h: 0.5},
        ],
    },
    focus: {
        id: 'focus',
        name: 'Focus',
        icon: '◧',  // Unicode focus icon
        description: '70/30 - Main work area + sidebar',
        zones: [
            {name: 'Main', x: 0.0, y: 0.0, w: 0.7, h: 1.0},
            {name: 'Side', x: 0.7, y: 0.0, w: 0.3, h: 1.0},
        ],
    },
    sixths: {
        id: 'sixths',
        name: 'Sixths',
        icon: '⊡',  // Unicode grid icon
        description: '2×3 grid layout',
        zones: [
            {name: 'Top Left', x: 0.0, y: 0.0, w: 0.333, h: 0.5},
            {name: 'Top Center', x: 0.333, y: 0.0, w: 0.334, h: 0.5},
            {name: 'Top Right', x: 0.667, y: 0.0, w: 0.333, h: 0.5},
            {name: 'Bottom Left', x: 0.0, y: 0.5, w: 0.333, h: 0.5},
            {name: 'Bottom Center', x: 0.333, y: 0.5, w: 0.334, h: 0.5},
            {name: 'Bottom Right', x: 0.667, y: 0.5, w: 0.333, h: 0.5},
        ],
    },
};

/**
 * TemplateManager class
 * Provides access to built-in layout templates
 */
export class TemplateManager {
    constructor() {
        this._templates = {...BUILTIN_TEMPLATES};
        logger.info('TemplateManager initialized with 5 built-in templates');
    }

    /**
     * Get all built-in templates
     * @returns {Array} Array of template objects
     */
    getBuiltinTemplates() {
        return Object.values(this._templates);
    }

    /**
     * Get a specific template by ID
     * @param {string} templateId - Template ID (e.g., 'halves')
     * @returns {Object|null} Template object or null if not found
     */
    getTemplate(templateId) {
        const template = this._templates[templateId];
        if (!template) {
            logger.warn(`Template not found: ${templateId}`);
            return null;
        }
        return template;
    }

    /**
     * Create a layout from a template
     * Deep copies the template zones and assigns a unique ID
     *
     * @param {string} templateId - Template ID to create layout from
     * @returns {Object} New layout object with unique ID
     * @throws {Error} If template ID is invalid
     */
    createLayoutFromTemplate(templateId) {
        const template = this._templates[templateId];
        if (!template) {
            throw new Error(`Unknown template: ${templateId}`);
        }

        const layout = {
            id: `template-${templateId}`,  // Stable ID for persistence across reloads
            name: template.name,
            zones: JSON.parse(JSON.stringify(template.zones)), // Deep copy
        };

        logger.debug(`Created layout from template '${templateId}': ${layout.id}`);
        return layout;
    }

    /**
     * Get template count
     * @returns {number} Number of available templates
     */
    getTemplateCount() {
        return Object.keys(this._templates).length;
    }

    /**
     * Check if a template ID exists
     * @param {string} templateId - Template ID to check
     * @returns {boolean} True if template exists
     */
    hasTemplate(templateId) {
        return templateId in this._templates;
    }
}
