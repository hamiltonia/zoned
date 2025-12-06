/**
 * SectionFactory - Creates layout section containers
 * 
 * Responsible for:
 * - Templates section (fixed row of built-in templates)
 * - Custom layouts section (scrollable grid of user layouts)
 * - Custom layout grid with row/column arrangement
 * - "Create new layout" button
 * 
 * Part of the LayoutSwitcher module split for maintainability.
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import { createLogger } from '../../utils/debug.js';
import { createTemplateCard, createCustomLayoutCard } from './cardFactory.js';

const logger = createLogger('SectionFactory');

/**
 * Create templates section with visual depth
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @returns {St.BoxLayout} The templates section widget
 */
export function createTemplatesSection(ctx) {
    const colors = ctx._themeManager.getColors();
    
    // Outer section card with depth - using configurable spacing
    const section = new St.BoxLayout({
        vertical: true,
        style: `
            background-color: ${colors.sectionBg};
            border: 1px solid ${colors.sectionBorder};
            border-radius: ${ctx._SECTION_BORDER_RADIUS}px;
            padding: ${ctx._SECTION_PADDING}px;
            box-shadow: ${colors.sectionShadow};
        `
    });

    // Section header - larger font for better hierarchy
    const header = new St.Label({
        text: 'Templates',
        style: `
            font-size: ${ctx._SECTION_TITLE_SIZE};
            font-weight: 600;
            color: ${colors.textMuted};
            margin-bottom: 20px;
        `
    });
    section.add_child(header);

    // Template cards in horizontal row (using spacing variables)
    // Use scrollbar reserve for padding-right to match Custom Layouts section width
    const scrollbarClearance = ctx._SCROLLBAR_RESERVE || Math.floor(ctx._cardWidth * 0.15);
    
    const templatesRow = new St.BoxLayout({
        vertical: false,
        style: `spacing: ${ctx._CARD_GAP}px; padding-left: ${ctx._GRID_ROW_PADDING_LEFT}px; padding-right: ${scrollbarClearance}px; padding-top: ${ctx._GRID_ROW_PADDING_TOP}px; padding-bottom: ${ctx._GRID_ROW_PADDING_BOTTOM}px;`
    });

    const templates = ctx._templateManager.getBuiltinTemplates();
    const currentLayout = ctx._getCurrentLayout();

    templates.forEach((template, index) => {
        const card = createTemplateCard(ctx, template, currentLayout, index);
        ctx._addDebugRect(card, 'card', `Template: ${template.name}`);
        templatesRow.add_child(card);
        ctx._allCards.push({ card, layout: template, isTemplate: true });
    });

    // Add debug rect to templates row
    ctx._addDebugRect(templatesRow, 'row', 'Templates Row');
    section.add_child(templatesRow);

    return section;
}

/**
 * Create custom layouts section with visual depth and internal scrolling
 * This section expands to fill available space and scrolls internally
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @returns {St.BoxLayout} The custom layouts section widget
 */
export function createCustomLayoutsSection(ctx) {
    const colors = ctx._themeManager.getColors();
    
    // Outer section card with depth - expands to fill remaining space
    // Uses configurable spacing variables for consistency with Templates section
    const section = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        y_expand: true,
        style: `
            background-color: ${colors.sectionBg};
            border: 1px solid ${colors.sectionBorder};
            border-radius: ${ctx._SECTION_BORDER_RADIUS}px;
            padding: ${ctx._SECTION_PADDING}px;
            box-shadow: ${colors.sectionShadow};
        `
    });

    // Section header (fixed, does not scroll) - uses configurable font size
    const header = new St.Label({
        text: 'Custom Layouts',
        style: `
            font-size: ${ctx._SECTION_TITLE_SIZE};
            font-weight: 600;
            color: ${colors.textMuted};
            margin-bottom: 16px;
        `
    });
    section.add_child(header);

    // Custom layout cards
    const customLayouts = ctx._getCustomLayouts();
    const currentLayout = ctx._getCurrentLayout();

    if (customLayouts.length === 0) {
        // Empty state (styled within the section card)
        const emptyState = new St.BoxLayout({
            vertical: true,
            style: `spacing: 12px; padding: 32px; ` +
                   `background-color: ${colors.inputBg}; ` +
                   `border-radius: 12px; ` +
                   `border: 2px dashed ${colors.divider};`,
            x_align: Clutter.ActorAlign.CENTER
        });

        const icon = new St.Label({
            text: '📐',
            style: 'font-size: 48pt;'
        });
        emptyState.add_child(icon);

        const text = new St.Label({
            text: 'No custom layouts yet',
            style: `font-size: 14pt; color: ${colors.textSecondary};`
        });
        emptyState.add_child(text);

        const hint = new St.Label({
            text: 'Create or duplicate a layout to get started',
            style: `font-size: 11pt; color: ${colors.textMuted};`
        });
        emptyState.add_child(hint);

        section.add_child(emptyState);
    } else {
        // Internal scrollable area for custom layouts (only this scrolls)
        const scrollView = new St.ScrollView({
            overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            x_expand: true,
            y_expand: true
        });

        // Grid of custom layouts
        const grid = createCustomLayoutGrid(ctx, customLayouts, currentLayout);
        scrollView.add_child(grid);
        section.add_child(scrollView);
    }

    return section;
}

/**
 * Create grid of custom layout cards
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {Array} layouts - Array of custom layout definitions
 * @param {Object} currentLayout - Currently active layout
 * @returns {St.BoxLayout} The grid container widget
 */
export function createCustomLayoutGrid(ctx, layouts, currentLayout) {
    const COLUMNS = ctx._customColumns;  // Always 5 columns
    
    // Use dynamically calculated scrollbar reserve (from _calculateCardDimensions)
    const scrollbarClearance = ctx._SCROLLBAR_RESERVE || Math.floor(ctx._cardWidth * 0.15);
    
    const container = new St.BoxLayout({
        vertical: true,
        style: `spacing: ${ctx._ROW_GAP}px; padding-right: ${scrollbarClearance}px;`
    });

    let currentRow = null;
    const templateCount = ctx._templateManager.getBuiltinTemplates().length;
    
    let rowNumber = 0;
    layouts.forEach((layout, index) => {
        const col = index % COLUMNS;

        if (col === 0) {
            currentRow = new St.BoxLayout({
                vertical: false,
                style: `spacing: ${ctx._CARD_GAP}px; padding-left: ${ctx._GRID_ROW_PADDING_LEFT}px; padding-right: ${ctx._GRID_ROW_PADDING_RIGHT}px; padding-top: ${ctx._GRID_ROW_PADDING_TOP}px; padding-bottom: ${ctx._GRID_ROW_PADDING_BOTTOM}px;`
            });
            ctx._addDebugRect(currentRow, 'row', `Custom Row ${rowNumber}`);
            rowNumber++;
            container.add_child(currentRow);
        }

        const cardIndex = templateCount + index;
        const card = createCustomLayoutCard(ctx, layout, currentLayout, cardIndex);
        ctx._addDebugRect(card, 'card', `Custom: ${layout.name}`);
        currentRow.add_child(card);
        ctx._allCards.push({ card, layout, isTemplate: false });
    });

    return container;
}

/**
 * Create "Create new layout" button
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @returns {St.Button} The create button widget
 */
export function createNewLayoutButton(ctx) {
    const colors = ctx._themeManager.getColors();
    const accentHex = colors.accentHex;
    const accentHexHover = colors.accentHexHover;

    const button = new St.Button({
        style_class: 'create-new-button',
        style: `padding: 16px 32px; ` +
               `background-color: ${accentHex}; ` +
               `border-radius: 8px; ` +
               `margin-top: 16px;`,
        x_align: Clutter.ActorAlign.CENTER,
        reactive: true,
        track_hover: true
    });

    const label = new St.Label({
        text: '✚ Create new layout',
        style: 'color: white; font-size: 13pt; font-weight: bold;'
    });
    button.set_child(label);

    button.connect('clicked', () => {
        ctx._onCreateNewLayoutClicked();
    });

    // Hover effects
    button.connect('enter-event', () => {
        button.style = `padding: 16px 32px; ` +
                      `background-color: ${accentHexHover}; ` +
                      `border-radius: 8px; ` +
                      `margin-top: 16px;`;
    });

    button.connect('leave-event', () => {
        button.style = `padding: 16px 32px; ` +
                      `background-color: ${accentHex}; ` +
                      `border-radius: 8px; ` +
                      `margin-top: 16px;`;
    });

    return button;
}
