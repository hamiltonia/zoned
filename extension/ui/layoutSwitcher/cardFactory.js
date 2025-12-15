/**
 * CardFactory - Creates layout card UI elements
 *
 * Card Design:
 * - Full grey background (rgba(68, 68, 68, 1))
 * - Compact header: layout name (left) + icon-only edit button (right)
 * - Zone preview: 85% width, 75% height, centered below header
 * - Click card to apply, click edit icon to edit/duplicate
 * - Hover effects: card border accent, icon brightens to white
 *
 * Responsible for:
 * - Template cards (built-in layouts with duplicate button)
 * - Custom layout cards (user layouts with edit button)
 * - Card headers with name and edit button
 * - Zone preview rendering (Cairo canvas)
 *
 * Part of the LayoutSwitcher module split for maintainability.
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {createLogger} from '../../utils/debug.js';

const logger = createLogger('CardFactory');

/**
 * Create a template card with full-card grey background
 * Header at top (name + edit button), small preview below
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {Object} template - Template definition
 * @param {Object} currentLayout - Currently active layout
 * @returns {St.Button} The created card widget
 */
export function createTemplateCard(ctx, template, currentLayout) {
    const colors = ctx._themeManager.getColors();
    const isActive = ctx._isLayoutActive(template, currentLayout);
    const accentHex = colors.accentHex;
    const accentRGBA = colors.accentRGBA(0.3);
    const cardRadius = ctx._cardRadius;

    // Theme-aware card background (dark grey for dark theme, light grey for light theme)
    const cardBg = colors.cardBg;

    const card = new St.Button({
        style_class: 'template-card',
        style: 'padding: 0; ' +
               `border-radius: ${cardRadius}px; ` +
               `width: ${ctx._cardWidth}px; ` +
               `height: ${ctx._cardHeight}px; ` +
               'overflow: hidden; ' +
               `${isActive ?
                   `background-color: ${accentRGBA}; border: 2px solid ${accentHex};` :
                   `background-color: ${cardBg}; border: 2px solid transparent;`}`,
        reactive: true,
        track_hover: true,
        clip_to_allocation: true,
    });

    // Use BoxLayout for vertical stacking (header + preview area)
    const container = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        y_expand: true,
        clip_to_allocation: true,
        style: `border-radius: ${cardRadius}px; padding: 6px 8px 8px 8px;`,
    });

    // Header row with name and edit button
    const header = createCardHeader(ctx, template.name, true, template);
    container.add_child(header);

    // Calculate preview size proportionally (accounts for scaling and tiers)
    // Use 85% of card width for the preview
    const previewWidth = Math.floor(ctx._cardWidth * 0.85);
    // Use 75% of card height for the preview (more space with reduced header padding)
    const previewHeight = Math.floor(ctx._cardHeight * 0.75);

    // Zone preview - explicit size, centered in remaining space
    const previewContainer = new St.Bin({
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
        y_expand: true,
        clip_to_allocation: true,
    });

    const preview = createZonePreview(ctx, template.zones);
    // Set explicit size on the DrawingArea
    preview.set_size(previewWidth, previewHeight);

    previewContainer.set_child(preview);
    container.add_child(previewContainer);

    card.set_child(container);

    // Click card to apply layout
    card.connect('clicked', () => {
        ctx._onTemplateClicked(template);
        return Clutter.EVENT_STOP;
    });

    card._isActive = isActive;

    // Hover effects for card border only
    card.connect('enter-event', () => {
        if (!isActive) {
            const c = ctx._themeManager.getColors();
            card.style = `padding: 0; border-radius: ${cardRadius}px; ` +
                        `width: ${ctx._cardWidth}px; height: ${ctx._cardHeight}px; ` +
                        'overflow: hidden; ' +
                        `background-color: ${c.accentRGBA(0.35)}; border: 2px solid ${c.accentHex}; ` +
                        'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);';
        }
        // Update preview background to show this template's layout
        if (ctx._onCardHover) {
            ctx._onCardHover(template);
        }
    });

    card.connect('leave-event', () => {
        if (!isActive) {
            card.style = `padding: 0; border-radius: ${cardRadius}px; ` +
                        `width: ${ctx._cardWidth}px; height: ${ctx._cardHeight}px; ` +
                        'overflow: hidden; ' +
                        `background-color: ${cardBg}; border: 2px solid transparent;`;
        }
        // Revert preview background
        if (ctx._onCardHoverEnd) {
            ctx._onCardHoverEnd();
        }
    });

    return card;
}

/**
 * Create a custom layout card with theme-aware background
 * Header at top (name + edit button), small preview below
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {Object} layout - Layout definition
 * @param {Object} currentLayout - Currently active layout
 * @returns {St.Button} The created card widget
 */
export function createCustomLayoutCard(ctx, layout, currentLayout) {
    const colors = ctx._themeManager.getColors();
    const isActive = ctx._isLayoutActive(layout, currentLayout);
    const accentHex = colors.accentHex;
    const accentRGBA = colors.accentRGBA(0.3);
    const cardRadius = ctx._cardRadius;

    // Theme-aware card background (dark grey for dark theme, light grey for light theme)
    const cardBg = colors.cardBg;

    const card = new St.Button({
        style_class: 'custom-layout-card',
        style: 'padding: 0; ' +
               `border-radius: ${cardRadius}px; ` +
               `width: ${ctx._cardWidth}px; ` +
               `height: ${ctx._cardHeight}px; ` +
               'overflow: hidden; ' +
               `${isActive ?
                   `background-color: ${accentRGBA}; border: 2px solid ${accentHex};` :
                   `background-color: ${cardBg}; border: 2px solid transparent;`}`,
        reactive: true,
        track_hover: true,
        clip_to_allocation: true,
    });

    // Use BoxLayout for vertical stacking (header + preview area)
    const container = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        y_expand: true,
        clip_to_allocation: true,
        style: `border-radius: ${cardRadius}px; padding: 6px 8px 8px 8px;`,
    });

    // Header row with name and edit button
    const header = createCardHeader(ctx, layout.name, false, layout);
    container.add_child(header);

    // Calculate preview size proportionally (accounts for scaling and tiers)
    // Use 85% of card width for the preview
    const previewWidth = Math.floor(ctx._cardWidth * 0.85);
    // Use 75% of card height for the preview (more space with reduced header padding)
    const previewHeight = Math.floor(ctx._cardHeight * 0.75);

    // Zone preview - explicit size, centered in remaining space
    const previewContainer = new St.Bin({
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
        y_expand: true,
        clip_to_allocation: true,
    });

    const preview = createZonePreview(ctx, layout.zones);
    // Set explicit size on the DrawingArea
    preview.set_size(previewWidth, previewHeight);

    previewContainer.set_child(preview);
    container.add_child(previewContainer);

    card.set_child(container);

    // Click to apply layout
    card.connect('clicked', () => {
        ctx._onLayoutClicked(layout);
    });

    // Propagate scroll events to parent ScrollView
    card.connect('scroll-event', () => {
        return Clutter.EVENT_PROPAGATE;
    });

    card._isActive = isActive;

    // Hover effects for card border only
    card.connect('enter-event', () => {
        if (!isActive) {
            const c = ctx._themeManager.getColors();
            card.style = `padding: 0; border-radius: ${cardRadius}px; ` +
                        `width: ${ctx._cardWidth}px; height: ${ctx._cardHeight}px; ` +
                        'overflow: hidden; ' +
                        `background-color: ${c.accentRGBA(0.35)}; border: 2px solid ${c.accentHex}; ` +
                        'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);';
        }
        // Update preview background to show this layout
        if (ctx._onCardHover) {
            ctx._onCardHover(layout);
        }
    });

    card.connect('leave-event', () => {
        if (!isActive) {
            card.style = `padding: 0; border-radius: ${cardRadius}px; ` +
                        `width: ${ctx._cardWidth}px; height: ${ctx._cardHeight}px; ` +
                        'overflow: hidden; ' +
                        `background-color: ${cardBg}; border: 2px solid transparent;`;
        }
        // Revert preview background
        if (ctx._onCardHoverEnd) {
            ctx._onCardHoverEnd();
        }
    });

    return card;
}

/**
 * Create card header with name (left) and edit button (right)
 * No background - relies on full-card grey background
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {string} name - Layout name to display
 * @param {boolean} isTemplate - True for template cards (duplicate), false for custom layouts (edit)
 * @param {object} layout - Layout object for button handlers
 * @returns {St.BoxLayout} The header widget
 */
export function createCardHeader(ctx, name, isTemplate, layout) {
    const header = new St.BoxLayout({
        vertical: false,
        x_expand: true,
        y_align: Clutter.ActorAlign.START,
    });

    // Name label (left-aligned)
    const nameLabel = new St.Label({
        text: name,
        style: 'color: white; font-size: 11px; font-weight: 500;',
        x_align: Clutter.ActorAlign.START,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
    });
    header.add_child(nameLabel);

    // Icon-only edit button (no background, just the icon)
    const editButton = new St.Button({
        style_class: 'card-edit-button',
        style: 'background-color: transparent; padding: 0; min-width: 16px; min-height: 16px;',
        reactive: true,
        track_hover: true,
        y_align: Clutter.ActorAlign.CENTER,
    });

    const editIcon = new St.Icon({
        icon_name: 'document-edit-symbolic',
        style_class: 'system-status-icon',
        icon_size: 14,
        style: 'color: rgba(255, 255, 255, 0.6);',
    });
    editButton.set_child(editIcon);

    // Hover effect - change icon color to white
    editButton.connect('enter-event', () => {
        editIcon.style = 'color: rgba(255, 255, 255, 1);';
    });

    editButton.connect('leave-event', () => {
        editIcon.style = 'color: rgba(255, 255, 255, 0.6);';
    });

    // Click handler - duplicate for templates, edit for custom layouts
    // Use button-press-event instead of clicked to prevent event propagation to parent card
    editButton.connect('button-press-event', () => {
        if (isTemplate) {
            ctx._onEditTemplateClicked(layout);
        } else {
            ctx._onEditLayoutClicked(layout);
        }
        return Clutter.EVENT_STOP;  // Prevents card from receiving the click
    });

    header.add_child(editButton);

    return header;
}

/**
 * Helper: Draw a rounded rectangle path using Cairo arcs
 * @param {Cairo.Context} cr - Cairo context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} w - Width
 * @param {number} h - Height
 * @param {number} r - Corner radius
 */
function roundedRect(cr, x, y, w, h, r) {
    const pi = Math.PI;
    // Clamp radius to half of smallest dimension
    r = Math.min(r, w / 2, h / 2);

    cr.newPath();
    // Top-left corner
    cr.arc(x + r, y + r, r, pi, 1.5 * pi);
    // Top edge
    cr.lineTo(x + w - r, y);
    // Top-right corner
    cr.arc(x + w - r, y + r, r, 1.5 * pi, 2 * pi);
    // Right edge
    cr.lineTo(x + w, y + h - r);
    // Bottom-right corner
    cr.arc(x + w - r, y + h - r, r, 0, 0.5 * pi);
    // Bottom edge
    cr.lineTo(x + r, y + h);
    // Bottom-left corner
    cr.arc(x + r, y + h - r, r, 0.5 * pi, pi);
    // Left edge
    cr.closePath();
}

/**
 * Create visual zone preview using Cairo
 * Bubbly 3D zone tiles with rounded corners, flat fill, top highlight, and shadow
 * Zones are inset to create visible gaps where card background shows through
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {Array} zones - Array of zone definitions
 * @returns {St.DrawingArea} The preview canvas widget
 */
export function createZonePreview(ctx, zones) {
    const colors = ctx._themeManager.getColors();

    // Canvas background is transparent so card accent color shows through on hover/selection
    const canvas = new St.DrawingArea({
        style: 'background-color: transparent;',
        x_expand: true,
        y_expand: true,
    });

    const isDark = colors.isDark;

    canvas.connect('repaint', () => {
        try {
            const cr = canvas.get_context();
            const [w, h] = canvas.get_surface_size();

            // Larger inset for visible transparent gaps between zones
            // Card background color shows through these gaps
            const inset = 8;
            const drawW = w - (inset * 2);  // Available width for zones
            const drawH = h - (inset * 2);  // Available height for zones

            // Bubbly settings
            const cornerRadius = 4;  // Rounded corners for bubbly feel
            const shadowOffset = 2;
            const highlightHeight = 2;

            zones.forEach((zone) => {
                // Calculate zone position within the inset area
                const x = inset + (zone.x * drawW);
                const y = inset + (zone.y * drawH);
                const zoneW = zone.w * drawW;
                const zoneH = zone.h * drawH;

                // Gap between zones for transparent edge effect
                const gap = 2;
                const zx = x + gap;
                const zy = y + gap;
                const zw = zoneW - (gap * 2);
                const zh = zoneH - (gap * 2);

                // 1. Draw shadow (offset down-right, rounded)
                cr.setSourceRGBA(0, 0, 0, isDark ? 0.35 : 0.2);
                roundedRect(cr, zx + shadowOffset, zy + shadowOffset, zw, zh, cornerRadius);
                cr.fill();

                // 2. Flat zone fill (single solid color - no gradient)
                const fillGrey = isDark ? 0.45 : 0.55;
                const fillAlpha = isDark ? 0.9 : 0.85;
                cr.setSourceRGBA(fillGrey, fillGrey, fillGrey, fillAlpha);
                roundedRect(cr, zx, zy, zw, zh, cornerRadius);
                cr.fill();

                // 3. Top edge highlight (bright line at top, follows rounded corners)
                // Draw as a thin rounded rect clipped to top portion
                cr.save();
                roundedRect(cr, zx, zy, zw, zh, cornerRadius);
                cr.clip();
                const highlightAlpha = isDark ? 0.45 : 0.55;
                cr.setSourceRGBA(1, 1, 1, highlightAlpha);
                cr.rectangle(zx, zy, zw, highlightHeight);
                cr.fill();
                cr.restore();

                // 4. Subtle border for definition (rounded)
                const borderGrey = isDark ? 0.3 : 0.35;
                cr.setSourceRGBA(borderGrey, borderGrey, borderGrey, 0.5);
                cr.setLineWidth(1);
                roundedRect(cr, zx, zy, zw, zh, cornerRadius);
                cr.stroke();
            });

            cr.$dispose();
        } catch (e) {
            logger.error('Error drawing zone preview:', e);
        }
    });

    return canvas;
}
