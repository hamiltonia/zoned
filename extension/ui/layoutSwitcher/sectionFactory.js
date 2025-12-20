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
import Gio from 'gi://Gio';
import St from 'gi://St';
import {createLogger} from '../../utils/debug.js';
import {createTemplateCard, createCustomLayoutCard} from './cardFactory.js';

const logger = createLogger('SectionFactory');

/**
 * Create templates section with visual depth
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @returns {{section: St.BoxLayout, signalIds: Array}} The section widget and signal IDs for cleanup
 */
export function createTemplatesSection(ctx) {
    const colors = ctx._themeManager.getColors();
    const signalIds = [];  // Track all signal connections for cleanup

    // Outer section card with depth - using configurable spacing
    const section = new St.BoxLayout({
        vertical: true,
        style: `
            background-color: ${colors.sectionBg};
            border: 1px solid ${colors.sectionBorder};
            border-radius: ${ctx._SECTION_BORDER_RADIUS}px;
            padding: ${ctx._SECTION_PADDING}px;
            box-shadow: ${colors.sectionShadow};
        `,
    });

    // Section header - larger font for better hierarchy
    const header = new St.Label({
        text: 'Templates',
        style: `
            font-size: ${ctx._SECTION_TITLE_SIZE};
            font-weight: 600;
            color: ${colors.textMuted};
            margin-bottom: 20px;
        `,
    });
    section.add_child(header);

    const templates = ctx._templateManager.getBuiltinTemplates();

    // Template cards in horizontal row - uses natural width (5 templates = 5 cards always)
    // Matches Custom Layouts rows which also use natural width
    const templatesRow = new St.BoxLayout({
        vertical: false,
        x_expand: false,
        x_align: Clutter.ActorAlign.CENTER,  // Center the row
        style: `spacing: ${ctx._CARD_GAP}px; padding-top: ${ctx._GRID_ROW_PADDING_TOP}px; padding-bottom: ${ctx._GRID_ROW_PADDING_BOTTOM}px;`,
    });

    templates.forEach((template) => {
        const card = createTemplateCard(ctx, template);
        ctx._addDebugRect(card, 'card', `Template: ${template.name}`);
        templatesRow.add_child(card);
        ctx._allCards.push({card, layout: template, isTemplate: true});
    });

    // Add debug rect to templates row
    ctx._addDebugRect(templatesRow, 'row', 'Templates Row');
    section.add_child(templatesRow);

    // Templates section has no signal handlers, so return empty array
    return {section, signalIds};
}

/**
 * Create custom layouts section with visual depth and internal scrolling
 * This section expands to fill available space and scrolls internally
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @returns {{section: St.BoxLayout, signalIds: Array}} The section widget and signal IDs for cleanup
 */
export function createCustomLayoutsSection(ctx) {
    const colors = ctx._themeManager.getColors();
    const signalIds = [];  // Track all signal connections for cleanup

    // Outer section card with depth - expands to fill remaining space
    // Uses symmetric padding for consistent alignment with Templates
    const section = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        y_expand: true,
        reactive: true,  // Must be reactive to receive events
        style: `
            background-color: ${colors.sectionBg};
            border: 1px solid ${colors.sectionBorder};
            border-radius: ${ctx._SECTION_BORDER_RADIUS}px;
            padding: ${ctx._SECTION_PADDING}px;
            box-shadow: ${colors.sectionShadow};
        `,
    });

    // Store reference to section for scroll handling
    let sectionScrollView = null;

    // Handle scroll events on the entire section (not just scrollView)
    // This catches scrolls over header and empty areas too
    // PHASE 3 FIX: Track signal ID for cleanup
    const sectionScrollId = section.connect('scroll-event', (actor, event) => {
        if (!sectionScrollView) return Clutter.EVENT_PROPAGATE;

        const direction = event.get_scroll_direction();

        // Get adjustment
        let adjustment = sectionScrollView.vadjustment;
        if (!adjustment && typeof sectionScrollView.get_vscroll_bar === 'function') {
            const vbar = sectionScrollView.get_vscroll_bar();
            if (vbar) adjustment = vbar.get_adjustment();
        }

        if (!adjustment) return Clutter.EVENT_STOP;

        const scrollAmount = ctx._cardHeight + ctx._ROW_GAP;
        const maxScroll = adjustment.upper - adjustment.page_size;

        if (direction === Clutter.ScrollDirection.UP) {
            adjustment.value = Math.max(0, adjustment.value - scrollAmount);
        } else if (direction === Clutter.ScrollDirection.DOWN) {
            adjustment.value = Math.min(maxScroll, adjustment.value + scrollAmount);
        } else if (direction === Clutter.ScrollDirection.SMOOTH) {
            const [_dx, dy] = event.get_scroll_delta();
            if (dy !== 0) {
                const smoothAmount = dy * scrollAmount * 0.3;
                adjustment.value = Math.max(0, Math.min(maxScroll, adjustment.value + smoothAmount));
            }
        }

        return Clutter.EVENT_STOP;
    });
    signalIds.push({object: section, id: sectionScrollId});

    // Section header (fixed, does not scroll) - uses configurable font size
    const header = new St.Label({
        text: 'Custom Layouts',
        style: `
            font-size: ${ctx._SECTION_TITLE_SIZE};
            font-weight: 600;
            color: ${colors.textMuted};
            margin-bottom: 16px;
        `,
    });
    section.add_child(header);

    // Custom layout cards
    const customLayouts = ctx._getCustomLayouts();

    // Reset scrollView reference
    ctx._customLayoutsScrollView = null;

    if (customLayouts.length === 0) {
        // Wrapper to center the empty state both horizontally and vertically
        const emptyStateWrapper = new St.Widget({
            x_expand: true,
            y_expand: true,
            layout_manager: new Clutter.BinLayout(),
        });

        // Empty state with horizontal layout - icon on left, text on right
        const emptyState = new St.BoxLayout({
            vertical: false,  // Horizontal layout
            style: 'spacing: 28px; padding: 24px 36px; ' +
                   `background-color: ${colors.inputBg}; ` +
                   'border-radius: 12px; ' +
                   `border: 2px dashed ${colors.divider};`,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: false,
            y_expand: false,
        });

        // Zoned branded icon on the left (monochromatic, adapts to theme)
        try {
            const extensionPath = ctx._layoutManager.getExtensionPath();
            const iconPath = `${extensionPath}/icons/zoned-symbolic.svg`;
            const iconFile = Gio.File.new_for_path(iconPath);

            if (iconFile.query_exists(null)) {
                const icon = new St.Icon({
                    gicon: Gio.icon_new_for_string(iconPath),
                    icon_size: 72,
                    style: `color: ${colors.textMuted}; opacity: 0.5;`,
                    y_align: Clutter.ActorAlign.CENTER,
                });
                emptyState.add_child(icon);
            }
        } catch (e) {
            logger.debug(`Could not load zoned icon for empty state: ${e}`);
        }

        // Text content on the right
        const textContent = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 6px;',
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Title - uses section title size for consistency
        const title = new St.Label({
            text: 'Get Started with Custom Layouts',
            style: `font-size: ${ctx._SECTION_TITLE_SIZE}; font-weight: 600; color: ${colors.textPrimary};`,
        });
        textContent.add_child(title);

        // Benefits list
        const benefitsBox = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 4px; margin-top: 6px;',
        });

        const benefits = [
            '• Save time with layouts tailored to your workflow',
            '• Duplicate templates to quickly customize',
            '• Assign keyboard shortcuts (1-9) for instant switching',
        ];

        benefits.forEach(benefit => {
            const label = new St.Label({
                text: benefit,
                style: `font-size: ${ctx._CARD_LABEL_SIZE}; color: ${colors.textSecondary};`,
            });
            benefitsBox.add_child(label);
        });

        textContent.add_child(benefitsBox);

        // Instructions hint - slightly smaller than card labels
        const hintFontSize = Math.max(9, Math.floor(ctx._cardHeight * 0.07));
        const hint = new St.Label({
            text: 'Click "Create new layout" below, or open any template\nand select "Duplicate" to get started.',
            style: `font-size: ${hintFontSize}px; color: ${colors.textMuted}; margin-top: 8px;`,
        });
        textContent.add_child(hint);

        emptyState.add_child(textContent);
        emptyStateWrapper.add_child(emptyState);
        section.add_child(emptyStateWrapper);
    } else {
        // Internal scrollable area for custom layouts (only this scrolls)
        const scrollView = new St.ScrollView({
            overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            x_expand: true,
            y_expand: true,
        });

        // Store references for scroll handling
        ctx._customLayoutsScrollView = scrollView;
        sectionScrollView = scrollView;  // Set local ref for section scroll handler

        // Handle scroll events manually using captured-event
        // This ensures mouse wheel works even when hovering over St.Button cards
        // PHASE 3 FIX: Track signal ID for cleanup
        const scrollViewCapturedId = scrollView.connect('captured-event', (actor, event) => {
            if (event.type() === Clutter.EventType.SCROLL) {
                const direction = event.get_scroll_direction();

                // Get adjustment (try multiple methods for compatibility)
                let adjustment = scrollView.vadjustment;
                if (!adjustment && typeof scrollView.get_vscroll_bar === 'function') {
                    const vbar = scrollView.get_vscroll_bar();
                    if (vbar) adjustment = vbar.get_adjustment();
                }

                if (!adjustment) return Clutter.EVENT_PROPAGATE;

                const scrollAmount = ctx._cardHeight + ctx._ROW_GAP;
                const maxScroll = adjustment.upper - adjustment.page_size;

                if (direction === Clutter.ScrollDirection.UP) {
                    adjustment.value = Math.max(0, adjustment.value - scrollAmount);
                    return Clutter.EVENT_STOP;
                } else if (direction === Clutter.ScrollDirection.DOWN) {
                    adjustment.value = Math.min(maxScroll, adjustment.value + scrollAmount);
                    return Clutter.EVENT_STOP;
                } else if (direction === Clutter.ScrollDirection.SMOOTH) {
                    const [_dx, dy] = event.get_scroll_delta();
                    if (dy !== 0) {
                        const smoothAmount = dy * scrollAmount * 0.5;
                        adjustment.value = Math.max(0, Math.min(maxScroll, adjustment.value + smoothAmount));
                        return Clutter.EVENT_STOP;
                    }
                }
            }
            return Clutter.EVENT_PROPAGATE;
        });
        signalIds.push({object: scrollView, id: scrollViewCapturedId});

        // Grid of custom layouts
        const grid = createCustomLayoutGrid(ctx, customLayouts);

        scrollView.add_child(grid);
        section.add_child(scrollView);
    }

    return {section, signalIds};
}

/**
 * Create grid of custom layout cards using fixed-width rows
 * All rows have explicit width set to ensure uniform alignment when centered
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {Array} layouts - Array of custom layout definitions
 * @returns {St.BoxLayout} The grid container widget
 */
export function createCustomLayoutGrid(ctx, layouts) {
    const COLUMNS = ctx._customColumns;  // Always 5 columns

    // Calculate fixed row width: 5 cards + 4 gaps
    const fixedRowWidth = (COLUMNS * ctx._cardWidth) + ((COLUMNS - 1) * ctx._CARD_GAP);

    logger.debug(`[GRID] Creating grid with COLUMNS=${COLUMNS}, layouts=${layouts.length}, fixedRowWidth=${fixedRowWidth}`);

    // Container holds all rows, centered
    const container = new St.BoxLayout({
        vertical: true,
        x_expand: false,
        x_align: Clutter.ActorAlign.CENTER,
        style: `spacing: ${ctx._ROW_GAP}px;`,
    });

    ctx._addDebugRect(container, 'row', 'Custom Grid Container');

    let currentRow = null;
    let rowNumber = 0;
    layouts.forEach((layout, index) => {
        const col = index % COLUMNS;
        const isLastCard = index === layouts.length - 1;

        if (col === 0) {
            // Create row - uses natural width (spacers ensure all rows have same width)
            currentRow = new St.BoxLayout({
                vertical: false,
                x_expand: false,
                style: `spacing: ${ctx._CARD_GAP}px; padding-top: ${ctx._GRID_ROW_PADDING_TOP}px; padding-bottom: ${ctx._GRID_ROW_PADDING_BOTTOM}px;`,
            });
            ctx._addDebugRect(currentRow, 'row', `Custom Row ${rowNumber}`);
            rowNumber++;
            container.add_child(currentRow);
        }

        const card = createCustomLayoutCard(ctx, layout);
        ctx._addDebugRect(card, 'card', `Custom: ${layout.name}`);
        currentRow.add_child(card);
        ctx._allCards.push({card, layout, isTemplate: false});

        // After the last card, add spacers to fill the row
        if (isLastCard) {
            const cardsInRow = col + 1;
            const spacersNeeded = COLUMNS - cardsInRow;

            if (spacersNeeded > 0) {
                logger.debug(`[SPACER] Row ${rowNumber - 1}: Adding ${spacersNeeded} spacers (${cardsInRow} cards)`);
                for (let i = 0; i < spacersNeeded; i++) {
                    const spacer = new St.Widget({
                        width: ctx._cardWidth,
                        height: ctx._cardHeight,
                        // Make visible in debug mode for troubleshooting
                        opacity: ctx._debugMode ? 128 : 0,
                        style: ctx._debugMode
                            ? 'background-color: rgba(255, 0, 255, 0.5); border: 2px dashed magenta;'
                            : '',
                        reactive: false,
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
 * @returns {{button: St.Button, signalIds: Array}} The button widget and signal IDs for cleanup
 */
export function createNewLayoutButton(ctx) {
    const colors = ctx._themeManager.getColors();
    const accentHex = colors.accentHex;
    const accentHexHover = colors.accentHexHover;
    const signalIds = [];  // Track all signal connections for cleanup

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
        track_hover: true,
    });

    const label = new St.Label({
        text: '✚ Create new layout',
        style: `color: white; font-size: ${fontSize}pt; font-weight: bold;`,
    });
    button.set_child(label);

    // PHASE 3 FIX: Track signal IDs for cleanup
    const clickedId = button.connect('clicked', () => {
        ctx._onCreateNewLayoutClicked();
    });
    signalIds.push({object: button, id: clickedId});

    // Hover effects - use same tier-based values
    const enterId = button.connect('enter-event', () => {
        button.style = `padding: ${verticalPadding}px ${horizontalPadding}px; ` +
                      `background-color: ${accentHexHover}; ` +
                      `border-radius: ${cardRadius}px; ` +
                      `margin-top: ${buttonMargin}px;`;
    });
    signalIds.push({object: button, id: enterId});

    const leaveId = button.connect('leave-event', () => {
        button.style = `padding: ${verticalPadding}px ${horizontalPadding}px; ` +
                      `background-color: ${accentHex}; ` +
                      `border-radius: ${cardRadius}px; ` +
                      `margin-top: ${buttonMargin}px;`;
    });
    signalIds.push({object: button, id: leaveId});

    return {button, signalIds};
}
