/**
 * CardFactory - Creates layout card UI elements
 *
 * Card Design:
 * - Full grey background (rgba(68, 68, 68, 1))
 * - Layout name label at top
 * - Zone preview: 85% width, 75% height, centered below header
 * - Floating circular edit button in upper-right corner of card
 * - Keybinding badge in lower-right corner showing shortcut number (1-9)
 * - Click card to apply, click edit button to edit/duplicate
 * - Hover effects: card border accent, edit button brightens
 *
 * Responsible for:
 * - Template cards (built-in layouts with duplicate button)
 * - Custom layout cards (user layouts with edit button)
 * - Card headers with layout name
 * - Floating circular edit buttons
 * - Keybinding badges (per-layout quick-access shortcuts from layout.shortcut)
 * - Zone preview rendering (Cairo canvas)
 *
 * Part of the LayoutSwitcher module split for maintainability.
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {createLogger} from '../../utils/debug.js';

const logger = createLogger('CardFactory');

/**
 * Create a keybinding badge showing the quick-access shortcut number
 * Subtle, static appearance in lower-right corner (below edit button)
 * Only shown for layouts that have a shortcut assigned (1-9)
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {string|number|null} shortcut - Layout's shortcut value ('1'-'9', 1-9, or null/undefined)
 * @returns {St.Widget|null} The keybinding badge widget, or null if no shortcut
 */
export function createKeybindingBadge(ctx, shortcut) {
    // Only show badge if a shortcut is assigned
    // Shortcut can be string ('1'-'9') or number (1-9), or null/undefined/'None'
    if (!shortcut || shortcut === 'None') {
        return null;
    }

    // Convert to number for validation
    const position = typeof shortcut === 'string' ? parseInt(shortcut, 10) : shortcut;

    // Validate it's a valid shortcut key (1-9)
    if (isNaN(position) || position < 1 || position > 9) {
        return null;
    }

    // Scale button size: ~75% of edit button size, minimum 18px, maximum 28px
    const badgeSize = Math.max(18, Math.min(28, Math.floor(ctx._cardWidth * 0.12)));

    // Static, subtle appearance (more transparent than edit button)
    const style = `
        width: ${badgeSize}px;
        height: ${badgeSize}px;
        border-radius: ${badgeSize / 2}px;
        background-color: rgba(0, 0, 0, 0.35);
        border: 1px solid rgba(255, 255, 255, 0.15);
    `;

    // Scale font size proportionally
    const fontSize = Math.max(9, Math.floor(badgeSize * 0.55));

    const badge = new St.Bin({
        style: style,
        reactive: false,  // Non-interactive, informational only
    });

    const label = new St.Label({
        text: String(position),
        style: `color: rgba(255, 255, 255, 0.6); font-size: ${fontSize}px; font-weight: 500;`,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
        y_expand: true,
    });
    badge.set_child(label);

    // Store size for positioning
    badge._badgeSize = badgeSize;

    return badge;
}

/**
 * Create a floating circular edit button for overlay positioning
 * Subtle appearance that brightens on hover
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {boolean} isTemplate - True for templates (triggers duplicate), false for custom (triggers edit)
 * @param {Object} layout - Layout object for click handlers
 * @returns {St.Button} The circular edit button
 */
export function createFloatingEditButton(ctx, isTemplate, layout) {
    const colors = ctx._themeManager.getColors();

    // Scale button size: ~15% of card width, minimum 24px, maximum 36px
    const buttonSize = Math.max(24, Math.min(36, Math.floor(ctx._cardWidth * 0.15)));
    const iconSize = Math.floor(buttonSize * 0.55);

    // Idle state: subtle, semi-transparent
    const idleStyle = `
        width: ${buttonSize}px;
        height: ${buttonSize}px;
        border-radius: ${buttonSize / 2}px;
        background-color: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    `;

    // Hover state: accent background, more prominent
    const hoverStyle = `
        width: ${buttonSize}px;
        height: ${buttonSize}px;
        border-radius: ${buttonSize / 2}px;
        background-color: ${colors.accentHex};
        border: 1px solid ${colors.accentHex};
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    `;

    const button = new St.Button({
        style_class: 'floating-edit-button',
        style: idleStyle,
        reactive: true,
        track_hover: true,
    });

    const icon = new St.Icon({
        icon_name: 'document-edit-symbolic',
        icon_size: iconSize,
        style: 'color: rgba(255, 255, 255, 0.7);',
    });
    button.set_child(icon);

    // Track signal IDs for cleanup
    button._signalIds = [];

    // Hover effects
    const enterId = button.connect('enter-event', () => {
        button.style = hoverStyle;
        icon.style = 'color: white;';
        return Clutter.EVENT_PROPAGATE;
    });
    button._signalIds.push({object: button, id: enterId});

    const leaveId = button.connect('leave-event', () => {
        button.style = idleStyle;
        icon.style = 'color: rgba(255, 255, 255, 0.7);';
        return Clutter.EVENT_PROPAGATE;
    });
    button._signalIds.push({object: button, id: leaveId});

    // Click handler - use button-press-event to stop propagation to parent card
    const pressId = button.connect('button-press-event', () => {
        if (isTemplate) {
            ctx._onEditTemplateClicked(layout);
        } else {
            ctx._onEditLayoutClicked(layout);
        }
        return Clutter.EVENT_STOP;
    });
    button._signalIds.push({object: button, id: pressId});

    // Store size for positioning
    button._buttonSize = buttonSize;

    return button;
}

/**
 * Create a template card with full-card grey background
 * Name label at top, zone preview with floating edit button overlay
 * Keybinding badge in lower-right corner if layout has a shortcut assigned
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {Object} template - Template definition (may have .shortcut property)
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

    // Use St.Widget with FixedLayout so we can position floating button over entire card
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

    // Card wrapper with FixedLayout for floating button overlay at card level
    const cardWrapper = new St.Widget({
        layout_manager: new Clutter.FixedLayout(),
        width: ctx._cardWidth,
        height: ctx._cardHeight,
    });

    // Content container for vertical stacking (header + preview area)
    const container = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        y_expand: true,
        clip_to_allocation: true,
        style: `border-radius: ${cardRadius}px; padding: 6px 8px 8px 8px;`,
        width: ctx._cardWidth,
        height: ctx._cardHeight,
    });

    // Header with name only
    const header = createCardHeader(ctx, template.name);
    container.add_child(header);

    // Calculate preview size proportionally (accounts for scaling and tiers)
    const previewWidth = Math.floor(ctx._cardWidth * 0.85);
    const previewHeight = Math.floor(ctx._cardHeight * 0.75);

    // Preview container centered
    const previewContainer = new St.Bin({
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
        y_expand: true,
    });

    // TESTING: Disable Cairo zone preview to isolate card signal fix
    // Zone preview canvas
    // const preview = createZonePreview(ctx, template.zones);
    // preview.set_size(previewWidth, previewHeight);
    // previewContainer.set_child(preview);

    container.add_child(previewContainer);
    cardWrapper.add_child(container);

    // Floating edit button - positioned in upper right of the CARD (not preview)
    const editButton = createFloatingEditButton(ctx, true, template);
    const buttonSize = editButton._buttonSize;
    const buttonOffsetY = 1;  // Offset from top edge
    const buttonOffsetX = 3;  // Offset from right edge (to match visual top offset)
    editButton.set_position(ctx._cardWidth - buttonSize - buttonOffsetX, buttonOffsetY);
    cardWrapper.add_child(editButton);

    // Keybinding badge - positioned in lower right of the CARD (below edit button)
    // Uses the template's shortcut property (set via layout settings dialog)
    const keybindingBadge = createKeybindingBadge(ctx, template.shortcut);
    if (keybindingBadge) {
        const badgeSize = keybindingBadge._badgeSize;
        const badgeOffsetX = 3;  // Offset from right edge
        const badgeOffsetY = 3;  // Offset from bottom edge
        const badgeX = ctx._cardWidth - badgeSize - badgeOffsetX;
        const badgeY = ctx._cardHeight - badgeSize - badgeOffsetY;
        keybindingBadge.set_position(badgeX, badgeY);
        cardWrapper.add_child(keybindingBadge);
    }

    card.set_child(cardWrapper);

    // CRITICAL FIX: Store layout reference on card to avoid closure leaks
    // Arrow functions create closures that hold references even after signal disconnect
    card._layoutRef = template;
    card._isTemplate = true;

    // Track signal IDs for cleanup - store as {object, id} pairs
    card._signalIds = [];

    // Click card to apply layout - use bound method, no closure!
    const clickedId = card.connect('clicked', ctx._boundHandleCardClick);
    card._signalIds.push({object: card, id: clickedId});

    card._isActive = isActive;

    // Hover effects for card border only - use bound methods
    const enterId = card.connect('enter-event', ctx._boundHandleCardEnter);
    card._signalIds.push({object: card, id: enterId});

    const leaveId = card.connect('leave-event', ctx._boundHandleCardLeave);
    card._signalIds.push({object: card, id: leaveId});

    return card;
}

/**
 * Create a custom layout card with theme-aware background
 * Name label at top, zone preview with floating edit button overlay
 * Keybinding badge in lower-right corner if layout has a shortcut assigned
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {Object} layout - Layout definition (may have .shortcut property)
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

    // Card wrapper with FixedLayout for floating button overlay at card level
    const cardWrapper = new St.Widget({
        layout_manager: new Clutter.FixedLayout(),
        width: ctx._cardWidth,
        height: ctx._cardHeight,
    });

    // Content container for vertical stacking (header + preview area)
    const container = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        y_expand: true,
        clip_to_allocation: true,
        style: `border-radius: ${cardRadius}px; padding: 6px 8px 8px 8px;`,
        width: ctx._cardWidth,
        height: ctx._cardHeight,
    });

    // Header with name only
    const header = createCardHeader(ctx, layout.name);
    container.add_child(header);

    // Calculate preview size proportionally (accounts for scaling and tiers)
    const previewWidth = Math.floor(ctx._cardWidth * 0.85);
    const previewHeight = Math.floor(ctx._cardHeight * 0.75);

    // Preview container centered
    const previewContainer = new St.Bin({
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
        y_expand: true,
    });

    // TESTING: Disable Cairo zone preview to isolate card signal fix
    // Zone preview canvas
    // const preview = createZonePreview(ctx, layout.zones);
    // preview.set_size(previewWidth, previewHeight);
    // previewContainer.set_child(preview);

    container.add_child(previewContainer);
    cardWrapper.add_child(container);

    // Floating edit button - positioned in upper right of the CARD (not preview)
    const editButton = createFloatingEditButton(ctx, false, layout);
    const buttonSize = editButton._buttonSize;
    const buttonOffsetY = 1;  // Offset from top edge
    const buttonOffsetX = 3;  // Offset from right edge (to match visual top offset)
    editButton.set_position(ctx._cardWidth - buttonSize - buttonOffsetX, buttonOffsetY);
    cardWrapper.add_child(editButton);

    // Keybinding badge - positioned in lower right of the CARD (below edit button)
    // Uses the layout's shortcut property (set via layout settings dialog)
    const keybindingBadge = createKeybindingBadge(ctx, layout.shortcut);
    if (keybindingBadge) {
        const badgeSize = keybindingBadge._badgeSize;
        const badgeOffsetX = 3;  // Offset from right edge
        const badgeOffsetY = 3;  // Offset from bottom edge
        const badgeX = ctx._cardWidth - badgeSize - badgeOffsetX;
        const badgeY = ctx._cardHeight - badgeSize - badgeOffsetY;
        keybindingBadge.set_position(badgeX, badgeY);
        cardWrapper.add_child(keybindingBadge);
    }

    card.set_child(cardWrapper);

    // CRITICAL FIX: Store layout reference on card to avoid closure leaks
    card._layoutRef = layout;
    card._isTemplate = false;

    // Track signal IDs for cleanup - store as {object, id} pairs
    card._signalIds = [];

    // Click to apply layout - use bound method, no closure!
    const clickedId = card.connect('clicked', ctx._boundHandleCardClick);
    card._signalIds.push({object: card, id: clickedId});

    // Propagate scroll events to parent ScrollView - use bound method
    const scrollId = card.connect('scroll-event', ctx._boundHandleCardScroll);
    card._signalIds.push({object: card, id: scrollId});

    card._isActive = isActive;

    // Hover effects for card border only - use bound methods
    const enterId = card.connect('enter-event', ctx._boundHandleCardEnter);
    card._signalIds.push({object: card, id: enterId});

    const leaveId = card.connect('leave-event', ctx._boundHandleCardLeave);
    card._signalIds.push({object: card, id: leaveId});

    return card;
}

/**
 * Create card header with layout name only
 * Edit button is now a floating circular button over the preview
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance (unused, kept for API consistency)
 * @param {string} name - Layout name to display
 * @returns {St.BoxLayout} The header widget
 */
export function createCardHeader(ctx, name) {
    const header = new St.BoxLayout({
        vertical: false,
        x_expand: true,
        y_align: Clutter.ActorAlign.START,
    });

    // Name label (left-aligned, takes full width now)
    const nameLabel = new St.Label({
        text: name,
        style: 'color: white; font-size: 11px; font-weight: 500;',
        x_align: Clutter.ActorAlign.START,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
    });
    header.add_child(nameLabel);

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
