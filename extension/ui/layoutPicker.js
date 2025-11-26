/**
 * LayoutPicker - Modal dialog for selecting layout templates
 * 
 * Displays built-in templates as clickable cards in a grid.
 * Uses GNOME's ModalDialog for proper modal handling.
 * 
 * Part of FancyZones-style implementation (Sprint 2)
 */

import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import { createLogger } from '../utils/debug.js';
import { GridEditor } from './gridEditor.js';

const logger = createLogger('LayoutPicker');

/**
 * LayoutPicker - Choose from built-in layout templates
 * 
 * Usage:
 *   const picker = new LayoutPicker(profileManager, templateManager);
 *   picker.open();
 */
export const LayoutPicker = GObject.registerClass(
class ZonedLayoutPicker extends ModalDialog.ModalDialog {
    /**
     * Create a new layout picker dialog
     * @param {ProfileManager} profileManager - Profile manager instance
     * @param {TemplateManager} templateManager - Template manager instance
     */
    constructor(profileManager, templateManager) {
        super({ 
            styleClass: 'zoned-layout-picker',
            destroyOnClose: false  // Keep instance alive for reuse
        });

        this._profileManager = profileManager;
        this._templateManager = templateManager;

        this._buildUI();

        logger.debug('LayoutPicker created');
    }

    /**
     * Build the dialog UI
     * @private
     */
    _buildUI() {
        // Add title
        const title = new St.Label({
            text: 'Choose Layout',
            style_class: 'zoned-picker-title',
            style: 'font-weight: bold; font-size: 16pt; margin-bottom: 20px;'
        });
        this.contentLayout.add_child(title);

        // Add description
        const description = new St.Label({
            text: 'Select a layout template to organize your windows',
            style: 'color: #999; margin-bottom: 20px;'
        });
        description.clutter_text.line_wrap = true;
        this.contentLayout.add_child(description);

        // Create template grid
        const grid = this._createTemplateGrid();
        this.contentLayout.add_child(grid);

        // Add buttons
        this.setButtons([
            {
                label: 'New Custom Layout',
                action: () => this._openEditor(),
                key: Clutter.KEY_n
            },
            {
                label: 'Close',
                action: () => this.close(),
                key: Clutter.KEY_Escape,
                default: true
            }
        ]);

        logger.debug('LayoutPicker UI built');
    }

    /**
     * Create the template grid
     * @returns {St.Widget} Grid widget containing template cards
     * @private
     */
    _createTemplateGrid() {
        const layout = new Clutter.GridLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            column_spacing: 12,
            row_spacing: 12
        });
        
        const grid = new St.Widget({ 
            layout_manager: layout,
            style: 'margin-bottom: 20px;'
        });

        const templates = this._templateManager.getBuiltinTemplates();
        logger.debug(`Rendering ${templates.length} template cards`);

        templates.forEach((template, index) => {
            const card = this._createTemplateCard(template);
            const row = Math.floor(index / 2);  // 2 columns
            const col = index % 2;
            layout.attach(card, col, row, 1, 1);
        });

        return grid;
    }

    /**
     * Create a template card button
     * @param {Object} template - Template object
     * @returns {St.Button} Template card button
     * @private
     */
    _createTemplateCard(template) {
        const card = new St.Button({
            style_class: 'template-card',
            style: `
                width: 200px;
                height: 150px;
                background-color: #2e2e2e;
                border: 2px solid #444;
                border-radius: 8px;
                padding: 16px;
            `,
            reactive: true,
            track_hover: true
        });

        // Create vertical layout
        const box = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 12px;'
        });

        // Icon (large Unicode character)
        const icon = new St.Label({
            text: template.icon,
            style: 'font-size: 48pt; text-align: center;',
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });
        box.add_child(icon);

        // Template name
        const nameLabel = new St.Label({
            text: template.name,
            style: 'font-weight: bold; font-size: 12pt; text-align: center;',
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });
        box.add_child(nameLabel);

        // Description
        const descLabel = new St.Label({
            text: template.description || '',
            style: 'font-size: 9pt; color: #999; text-align: center;',
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });
        descLabel.clutter_text.line_wrap = true;
        box.add_child(descLabel);

        card.set_child(box);

        // Click handler
        card.connect('clicked', () => {
            this._onTemplateSelected(template);
        });

        // Hover effect
        card.connect('notify::hover', (button) => {
            if (button.hover) {
                button.style = `
                    width: 200px;
                    height: 150px;
                    background-color: #3a3a3a;
                    border: 2px solid #1c71d8;
                    border-radius: 8px;
                    padding: 16px;
                `;
            } else {
                button.style = `
                    width: 200px;
                    height: 150px;
                    background-color: #2e2e2e;
                    border: 2px solid #444;
                    border-radius: 8px;
                    padding: 16px;
                `;
            }
        });

        logger.debug(`Created template card: ${template.name}`);
        return card;
    }

    /**
     * Handle template selection
     * @param {Object} template - Selected template
     * @private
     */
    _onTemplateSelected(template) {
        logger.info(`Template selected: ${template.name} (${template.id})`);

        try {
            // Create layout from template
            const layout = this._templateManager.createLayoutFromTemplate(template.id);
            
            // Apply to current profile
            this._profileManager.updateCurrentLayout(layout);
            
            logger.info(`Layout applied: ${layout.name}`);
            
            // Close the picker
            this.close();
        } catch (error) {
            logger.error(`Failed to apply template: ${error.message}`);
            // TODO: Show error notification
        }
    }

    /**
     * Open the grid editor for custom layouts
     * @private
     */
    _openEditor() {
        logger.info('Opening grid editor');
        
        // Close the picker first
        this.close();
        
        // Always start with a simple 2-region split (halves)
        // This ensures we start with a valid edge-based layout
        const layout = {
            id: `custom-${Date.now()}`,
            name: 'Custom Layout',
            zones: [
                { name: 'Left Half', x: 0, y: 0, w: 0.5, h: 1 },
                { name: 'Right Half', x: 0.5, y: 0, w: 0.5, h: 1 }
            ]
        };
        
        logger.debug('Starting grid editor with simple 2-region split');
        
        // Open GridEditor with cancel callback to reopen this picker
        const editor = new GridEditor(
            layout,
            this._profileManager,
            (editedLayout) => {
                logger.info('Layout saved from GridEditor');
                this._profileManager.updateCurrentLayout(editedLayout);
            },
            () => {
                // Cancel callback: reopen the layout picker
                logger.debug('GridEditor canceled - reopening layout picker');
                this.open();
            }
        );
        editor.show();
    }

    /**
     * Clean up resources
     */
    destroy() {
        logger.debug('LayoutPicker destroyed');
        super.destroy();
    }
});
