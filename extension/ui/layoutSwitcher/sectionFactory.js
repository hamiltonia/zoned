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

    const templates = ctx._templateManager.getBuiltinTemplates();
    const currentLayout = ctx._getCurrentLayout();
    
    // Template cards in horizontal row - uses natural width (5 templates = 5 cards always)
    // Matches Custom Layouts rows which also use natural width
    const templatesRow = new St.BoxLayout({
        vertical: false,
        x_expand: false,
        x_align: Clutter.ActorAlign.CENTER,  // Center the row
        style: `spacing: ${ctx._CARD_GAP}px; padding-top: ${ctx._GRID_ROW_PADDING_TOP}px; padding-bottom: ${ctx._GRID_ROW_PADDING_BOTTOM}px;`
    });

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
    // Uses symmetric padding for consistent alignment with Templates
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
 * Create grid of custom layout cards using fixed-width rows
 * All rows have explicit width set to ensure uniform alignment when centered
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {Array} layouts - Array of custom layout definitions
 * @param {Object} currentLayout - Currently active layout
 * @returns {St.BoxLayout} The grid container widget
 */
export function createCustomLayoutGrid(ctx, layouts, currentLayout) {
    const COLUMNS = ctx._customColumns;  // Always 5 columns
    
    // Calculate fixed row width: 5 cards + 4 gaps
    const fixedRowWidth = (COLUMNS * ctx._cardWidth) + ((COLUMNS - 1) * ctx._CARD_GAP);
    
    logger.info(`[GRID] Creating grid with COLUMNS=${COLUMNS}, layouts=${layouts.length}, fixedRowWidth=${fixedRowWidth}`);
    
    // Container holds all rows, centered
    const container = new St.BoxLayout({
        vertical: true,
        x_expand: false,
        x_align: Clutter.ActorAlign.CENTER,
        style: `spacing: ${ctx._ROW_GAP}px;`
    });
    
    ctx._addDebugRect(container, 'row', 'Custom Grid Container');

    let currentRow = null;
    const templateCount = ctx._templateManager.getBuiltinTemplates().length;
    const totalRows = Math.ceil(layouts.length / COLUMNS);
    
    let rowNumber = 0;
    layouts.forEach((layout, index) => {
        const col = index % COLUMNS;
        const isLastCard = index === layouts.length - 1;

        if (col === 0) {
            // Create row - uses natural width (spacers ensure all rows have same width)
            currentRow = new St.BoxLayout({
                vertical: false,
                x_expand: false,
                style: `spacing: ${ctx._CARD_GAP}px; padding-top: ${ctx._GRID_ROW_PADDING_TOP}px; padding-bottom: ${ctx._GRID_ROW_PADDING_BOTTOM}px;`
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
        
        // After the last card, add spacers to fill the row
        if (isLastCard) {
            const cardsInRow = col + 1;
            const spacersNeeded = COLUMNS - cardsInRow;
            
            if (spacersNeeded > 0) {
                logger.info(`[SPACER] Row ${rowNumber - 1}: Adding ${spacersNeeded} spacers (${cardsInRow} cards)`);
                for (let i = 0; i < spacersNeeded; i++) {
                    const spacer = new St.Widget({
                        width: ctx._cardWidth,
                        height: ctx._cardHeight,
                        // Make visible in debug mode for troubleshooting
                        opacity: ctx._debugMode ? 128 : 0,
                        style: ctx._debugMode 
                            ? `background-color: rgba(255, 0, 255, 0.5); border: 2px dashed magenta;`
                            : '',
                        reactive: false
                    });
                    currentRow.add_child(spacer);
                    ctx._addDebugRect(spacer, 'spacer', `Spacer ${i + 1} of ${spacersNeeded}`);
                }
            }
        }
    });

    return container;
}

/**
 * Create "Create new layout" button
 * Scales proportionally with tier size
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @returns {St.Button} The create button widget
 */
export function createNewLayoutButton(ctx) {
    const colors = ctx._themeManager.getColors();
    const accentHex = colors.accentHex;
    const accentHexHover = colors.accentHexHover;
    
    // Use tier-based sizing
    const buttonHeight = ctx._calculatedSpacing.createButtonHeight;
    const buttonMargin = ctx._calculatedSpacing.createButtonMargin;
    const cardRadius = ctx._cardRadius;
    
    // Scale padding proportionally with button height
    // Base: 16px vertical at 50px height = 0.32 ratio
    // Base: 32px horizontal at 50px height = 0.64 ratio
    const verticalPadding = Math.floor(buttonHeight * 0.32);
    const horizontalPadding = Math.floor(buttonHeight * 0.64);
    
    // Scale font size proportionally
    // Base: 13pt at 50px height = 0.26 ratio
    const fontSize = Math.max(10, Math.floor(buttonHeight * 0.26));

    const button = new St.Button({
        style_class: 'create-new-button',
        style: `padding: ${verticalPadding}px ${horizontalPadding}px; ` +
               `background-color: ${accentHex}; ` +
               `border-radius: ${cardRadius}px; ` +
               `margin-top: ${buttonMargin}px;`,
        x_align: Clutter.ActorAlign.CENTER,
        reactive: true,
        track_hover: true
    });

    const label = new St.Label({
        text: '✚ Create new layout',
        style: `color: white; font-size: ${fontSize}pt; font-weight: bold;`
    });
    button.set_child(label);

    button.connect('clicked', () => {
        ctx._onCreateNewLayoutClicked();
    });

    // Hover effects - use same tier-based values
    button.connect('enter-event', () => {
        button.style = `padding: ${verticalPadding}px ${horizontalPadding}px; ` +
                      `background-color: ${accentHexHover}; ` +
                      `border-radius: ${cardRadius}px; ` +
                      `margin-top: ${buttonMargin}px;`;
    });

    button.connect('leave-event', () => {
        button.style = `padding: ${verticalPadding}px ${horizontalPadding}px; ` +
                      `background-color: ${accentHex}; ` +
                      `border-radius: ${cardRadius}px; ` +
                      `margin-top: ${buttonMargin}px;`;
    });

    return button;
}
