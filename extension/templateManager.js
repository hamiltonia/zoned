/**
 * TemplateManager - Manages built-in layout templates
 *
 * Provides pre-configured layout templates that users can apply.
 * Note: Primary templates are loaded from config/default-layouts.json.
 * This class provides a fallback mechanism for legacy "template-*" IDs.
 */

import {createLogger} from './utils/debug.js';

const logger = createLogger('TemplateManager');

// Instance tracking for leak detection
let _instanceCount = 0;

/**
 * Built-in layout templates
 * All coordinates are normalized (0.0 to 1.0)
 *
 * NOTE: These should match the templates in config/default-layouts.json
 * This is a fallback for legacy template-* ID restoration.
 */
const BUILTIN_TEMPLATES = {
    split: {
        id: 'split',
        name: 'Split',
        icon: '⫿',
        description: '50/50 split - Left and Right',
        zones: [
            {name: 'Left', x: 0.0, y: 0.0, w: 0.5, h: 1.0},
            {name: 'Right', x: 0.5, y: 0.0, w: 0.5, h: 1.0},
        ],
    },
    triple: {
        id: 'triple',
        name: 'Triple',
        icon: '⫴',
        description: '33/33/33 columns',
        zones: [
            {name: 'Left', x: 0.0, y: 0.0, w: 0.333, h: 1.0},
            {name: 'Center', x: 0.333, y: 0.0, w: 0.334, h: 1.0},
            {name: 'Right', x: 0.667, y: 0.0, w: 0.333, h: 1.0},
        ],
    },
    wide: {
        id: 'wide',
        name: 'Wide',
        icon: '◧',
        description: '25/50/25 - Center-focused',
        zones: [
            {name: 'Left', x: 0.0, y: 0.0, w: 0.25, h: 1.0},
            {name: 'Center', x: 0.25, y: 0.0, w: 0.5, h: 1.0},
            {name: 'Right', x: 0.75, y: 0.0, w: 0.25, h: 1.0},
        ],
    },
    quarters: {
        id: 'quarters',
        name: 'Quarters',
        icon: '⊞',
        description: '2×2 grid layout',
        zones: [
            {name: 'Top-Left', x: 0.0, y: 0.0, w: 0.5, h: 0.5},
            {name: 'Top-Right', x: 0.5, y: 0.0, w: 0.5, h: 0.5},
            {name: 'Bottom-Left', x: 0.0, y: 0.5, w: 0.5, h: 0.5},
            {name: 'Bottom-Right', x: 0.5, y: 0.5, w: 0.5, h: 0.5},
        ],
    },
    triple_stack: {
        id: 'triple_stack',
        name: 'Triple Stack',
        icon: '⊡',
        description: 'Three columns with stacked right panel',
        zones: [
            {name: 'Left', x: 0.0, y: 0.0, w: 0.333, h: 1.0},
            {name: 'Center', x: 0.333, y: 0.0, w: 0.334, h: 1.0},
            {name: 'Top-Right', x: 0.667, y: 0.0, w: 0.333, h: 0.5},
            {name: 'Bottom-Right', x: 0.667, y: 0.5, w: 0.333, h: 0.5},
        ],
    },
};

/**
 * TemplateManager class
 * Provides access to built-in layout templates
 */
export class TemplateManager {
    constructor() {
        _instanceCount++;
        this._templates = {...BUILTIN_TEMPLATES};
        logger.info(`TemplateManager initialized with ${Object.keys(this._templates).length} built-in templates`);
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
     * @param {string} templateId - Template ID (e.g., 'split')
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

    /**
     * Clean up resources
     * Clears cached template data to prevent memory leaks
     */
    destroy() {
        this._templates = null;
        _instanceCount--;
    }
}
