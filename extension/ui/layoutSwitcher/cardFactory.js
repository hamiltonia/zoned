/**
 * CardFactory - Creates layout card UI elements
 * 
 * Responsible for:
 * - Template cards (built-in layouts with duplicate button)
 * - Custom layout cards (user layouts with edit/delete)
 * - Card bottom bars with action buttons
 * - Zone preview rendering (Cairo canvas)
 * 
 * Part of the LayoutSwitcher module split for maintainability.
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import { createLogger } from '../../utils/debug.js';

const logger = createLogger('CardFactory');

/**
 * Create a template card with zone preview and hover bar
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {Object} template - Template definition
 * @param {Object} currentLayout - Currently active layout
 * @param {number} cardIndex - Index for keyboard navigation
 * @returns {St.Button} The created card widget
 */
export function createTemplateCard(ctx, template, currentLayout, cardIndex) {
    const colors = ctx._themeManager.getColors();
    const isActive = ctx._isLayoutActive(template, currentLayout);
    const accentHex = colors.accentHex;
    const accentRGBA = colors.accentRGBA(0.3);

    const card = new St.Button({
        style_class: 'template-card',
        style: `padding: 0; ` +
               `border-radius: 8px; ` +
               `width: ${ctx._cardWidth}px; ` +
               `height: ${ctx._cardHeight}px; ` +
               `overflow: hidden; ` +
               `${isActive ? 
                   `background-color: ${accentRGBA}; border: 2px solid ${accentHex};` : 
                   `background-color: ${colors.cardBgTemplate}; border: 2px solid transparent;`}`,
        reactive: true,
        track_hover: true,
        clip_to_allocation: true
    });

    // Container for layering (preview + bottom bar) - MUST have border-radius to clip properly
    const container = new St.Widget({
        layout_manager: new Clutter.BinLayout(),
        x_expand: true,
        y_expand: true,
        clip_to_allocation: true,
        style: 'border-radius: 8px;'  // Match card border-radius for proper clipping
    });

    // Zone preview background (wrapped in constraining container)
    const previewContainer = new St.Bin({
        x_align: Clutter.ActorAlign.FILL,
        y_align: Clutter.ActorAlign.FILL,
        x_expand: true,
        y_expand: true,
        clip_to_allocation: true,
        style: 'border-radius: 8px 8px 0 0;'  // Round top corners only
    });
    
    const preview = createZonePreview(
        ctx,
        template.zones,
        ctx._previewWidth,
        ctx._previewHeight
    );
    
    previewContainer.set_child(preview);
    container.add_child(previewContainer);

    // Bottom bar with name and buttons
    const bottomBar = createCardBottomBar(ctx, template.name, true, template);
    container.add_child(bottomBar);

    card.set_child(container);

    // Click card to apply
    card.connect('clicked', () => {
        ctx._onTemplateClicked(template);
        return Clutter.EVENT_STOP;
    });

    // Store bottom bar reference for hover handling
    card._bottomBar = bottomBar;
    card._nameLabel = bottomBar._nameLabel;
    card._buttonBox = bottomBar._buttonBox;
    card._isActive = isActive;

    // Hover effects for card border + bottom bar transition
    card.connect('enter-event', () => {
        if (!isActive) {
            const c = ctx._themeManager.getColors();
            card.style = `padding: 0; border-radius: 8px; ` +
                        `width: ${ctx._cardWidth}px; height: ${ctx._cardHeight}px; ` +
                        `overflow: hidden; ` +
                        `background-color: ${c.accentRGBA(0.35)}; border: 2px solid ${c.accentHex}; ` +
                        `box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);`;
        }
        // Smooth transition: fade in background, hide name, show buttons
        card._bottomBar._background.ease({
            opacity: 255,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
        card._nameLabel.ease({
            opacity: 0,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
        card._buttonBox.ease({
            opacity: 255,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
    });

    card.connect('leave-event', () => {
        if (!isActive) {
            const c = ctx._themeManager.getColors();
            card.style = `padding: 0; border-radius: 8px; ` +
                        `width: ${ctx._cardWidth}px; height: ${ctx._cardHeight}px; ` +
                        `overflow: hidden; ` +
                        `background-color: ${c.cardBgTemplate}; border: 2px solid transparent;`;
        }
        // Smooth transition: fade out background to default opacity, show name, hide buttons
        card._bottomBar._background.ease({
            opacity: ctx._CARD_BOTTOM_BAR_DEFAULT_OPACITY,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
        card._nameLabel.ease({
            opacity: 255,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
        card._buttonBox.ease({
            opacity: 0,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
    });

    return card;
}

/**
 * Create a custom layout card with zone preview and hover bar
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {Object} layout - Layout definition
 * @param {Object} currentLayout - Currently active layout
 * @param {number} cardIndex - Index for keyboard navigation
 * @returns {St.Button} The created card widget
 */
export function createCustomLayoutCard(ctx, layout, currentLayout, cardIndex) {
    const colors = ctx._themeManager.getColors();
    const isActive = ctx._isLayoutActive(layout, currentLayout);
    const accentHex = colors.accentHex;
    const accentRGBA = colors.accentRGBA(0.3);

    const card = new St.Button({
        style_class: 'custom-layout-card',
        style: `padding: 0; ` +
               `border-radius: 8px; ` +
               `width: ${ctx._cardWidth}px; ` +
               `height: ${ctx._cardHeight}px; ` +
               `overflow: hidden; ` +
               `${isActive ? 
                   `background-color: ${accentRGBA}; border: 2px solid ${accentHex};` : 
                   `background-color: ${colors.cardBg}; border: 2px solid transparent;`}`,
        reactive: true,
        track_hover: true,
        clip_to_allocation: true
    });

    // Container for layering (preview + bottom bar) - MUST have border-radius to match card
    const container = new St.Widget({
        layout_manager: new Clutter.BinLayout(),
        x_expand: true,
        y_expand: true,
        clip_to_allocation: true,
        style: 'border-radius: 8px;'  // Match card border-radius for proper clipping
    });

    // Zone preview background (wrapped in constraining container)
    const previewContainer = new St.Bin({
        x_align: Clutter.ActorAlign.FILL,
        y_align: Clutter.ActorAlign.FILL,
        x_expand: true,
        y_expand: true,
        clip_to_allocation: true,
        style: 'border-radius: 8px 8px 0 0;'  // Round top corners only
    });
    
    const preview = createZonePreview(
        ctx,
        layout.zones,
        ctx._previewWidth,
        ctx._previewHeight
    );
    
    previewContainer.set_child(preview);
    container.add_child(previewContainer);

    // Bottom bar with name and buttons
    const bottomBar = createCardBottomBar(ctx, layout.name, false, layout);
    container.add_child(bottomBar);

    card.set_child(container);

    // Click to apply
    card.connect('clicked', () => {
        ctx._onLayoutClicked(layout);
    });

    // Store bottom bar reference for hover handling
    card._bottomBar = bottomBar;
    card._nameLabel = bottomBar._nameLabel;
    card._buttonBox = bottomBar._buttonBox;
    card._isActive = isActive;

    // Hover effects for card border + bottom bar transition
    card.connect('enter-event', () => {
        if (!isActive) {
            const c = ctx._themeManager.getColors();
            card.style = `padding: 0; border-radius: 8px; ` +
                        `width: ${ctx._cardWidth}px; height: ${ctx._cardHeight}px; ` +
                        `overflow: hidden; ` +
                        `background-color: ${c.accentRGBA(0.35)}; border: 2px solid ${c.accentHex}; ` +
                        `box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);`;
        }
        // Smooth transition: fade in background, hide name, show buttons
        card._bottomBar._background.ease({
            opacity: 255,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
        card._nameLabel.ease({
            opacity: 0,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
        card._buttonBox.ease({
            opacity: 255,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
    });

    card.connect('leave-event', () => {
        if (!isActive) {
            const c = ctx._themeManager.getColors();
            card.style = `padding: 0; border-radius: 8px; ` +
                        `width: ${ctx._cardWidth}px; height: ${ctx._cardHeight}px; ` +
                        `overflow: hidden; ` +
                        `background-color: ${c.cardBg}; border: 2px solid transparent;`;
        }
        // Smooth transition: fade out background to default opacity, show name, hide buttons
        card._bottomBar._background.ease({
            opacity: ctx._CARD_BOTTOM_BAR_DEFAULT_OPACITY,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
        card._nameLabel.ease({
            opacity: 255,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
        card._buttonBox.ease({
            opacity: 0,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
    });

    return card;
}

/**
 * Create card bottom bar with name and action buttons
 * Height scales proportionally with card size for better readability
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {string} name - Layout name to display
 * @param {boolean} isTemplate - True for template cards, false for custom layouts
 * @param {object} layout - Layout object for button handlers
 * @returns {St.Widget} The bottom bar widget
 */
export function createCardBottomBar(ctx, name, isTemplate, layout) {
    const colors = ctx._themeManager.getColors();
    const accentRGB = colors.accentRGBA(0.6);
    
    // Calculate proportional bottom bar height
    const bottomBarHeight = Math.max(
        ctx._CARD_BOTTOM_BAR_MIN_HEIGHT,
        Math.floor(ctx._cardHeight * ctx._CARD_BOTTOM_BAR_RATIO)
    );
    
    const bottomBar = new St.Widget({
        layout_manager: new Clutter.BinLayout(),
        style: `height: ${bottomBarHeight}px;`,
        y_align: Clutter.ActorAlign.END,
        x_expand: true
    });

    // Background in accent color - subtle by default, more opaque on hover
    const background = new St.Bin({
        style: `background-color: ${accentRGB}; ` +
               'border-radius: 0 0 6px 6px;',
        x_expand: true,
        y_expand: true,
        opacity: ctx._CARD_BOTTOM_BAR_DEFAULT_OPACITY
    });
    bottomBar.add_child(background);

    // Name label layer (visible by default, hidden on hover)
    const nameLabel = new St.Label({
        text: name,
        style: 'color: white; font-size: 11px; font-weight: 600; text-align: center;',
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
        opacity: 255
    });
    bottomBar.add_child(nameLabel);

    // Buttons layer (hidden by default, shown on hover)
    const buttonBox = new St.BoxLayout({
        vertical: false,
        x_align: Clutter.ActorAlign.FILL,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
        opacity: 0
    });

    if (isTemplate) {
        // Template: Single full-width "Duplicate" button with icon
        const duplicateBtn = new St.Button({
            style_class: 'card-action-button',
            style: 'color: white; font-size: 11px; font-weight: 600; ' +
                   'padding: 0 16px; background-color: transparent;',
            reactive: true,
            track_hover: true,
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });

        const btnContent = new St.BoxLayout({
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'spacing: 6px;',
            x_expand: false
        });

        const icon = new St.Icon({
            icon_name: 'edit-copy-symbolic',
            style_class: 'system-status-icon',
            icon_size: 14
        });
        btnContent.add_child(icon);

        const label = new St.Label({
            text: 'Duplicate',
            y_align: Clutter.ActorAlign.CENTER
        });
        btnContent.add_child(label);

        duplicateBtn.set_child(btnContent);

        duplicateBtn.connect('clicked', (btn) => {
            ctx._onEditTemplateClicked(layout);
            return Clutter.EVENT_STOP;
        });

        buttonBox.add_child(duplicateBtn);
    } else {
        // Custom layout: Split Edit / Delete buttons with icons
        const editBtn = new St.Button({
            style_class: 'card-action-button',
            style: 'color: white; font-size: 11px; font-weight: 600; ' +
                   'padding: 0 12px; background-color: transparent;',
            reactive: true,
            track_hover: true,
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });

        const editContent = new St.BoxLayout({
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'spacing: 6px;',
            x_expand: false
        });

        const editIcon = new St.Icon({
            icon_name: 'document-edit-symbolic',
            style_class: 'system-status-icon',
            icon_size: 14
        });
        editContent.add_child(editIcon);

        const editLabel = new St.Label({
            text: 'Edit',
            y_align: Clutter.ActorAlign.CENTER
        });
        editContent.add_child(editLabel);

        editBtn.set_child(editContent);

        editBtn.connect('clicked', (btn) => {
            ctx._onEditLayoutClicked(layout);
            return Clutter.EVENT_STOP;
        });

        // Vertical separator
        const separator = new St.Widget({
            style: 'width: 1px; background-color: rgba(255, 255, 255, 0.3);',
            y_expand: true
        });

        const deleteBtn = new St.Button({
            style_class: 'card-action-button',
            style: 'color: white; font-size: 11px; font-weight: 600; ' +
                   'padding: 0 12px; background-color: transparent;',
            reactive: true,
            track_hover: true,
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });

        const deleteContent = new St.BoxLayout({
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'spacing: 6px;',
            x_expand: false
        });

        const deleteIcon = new St.Icon({
            icon_name: 'edit-delete-symbolic',
            style_class: 'system-status-icon',
            icon_size: 14
        });
        deleteContent.add_child(deleteIcon);

        const deleteLabel = new St.Label({
            text: 'Delete',
            y_align: Clutter.ActorAlign.CENTER
        });
        deleteContent.add_child(deleteLabel);

        deleteBtn.set_child(deleteContent);

        deleteBtn.connect('clicked', (btn) => {
            ctx._onDeleteClicked(layout);
            return Clutter.EVENT_STOP;
        });

        buttonBox.add_child(editBtn);
        buttonBox.add_child(separator);
        buttonBox.add_child(deleteBtn);
    }

    bottomBar.add_child(buttonBox);

    // Store references for hover handling
    bottomBar._nameLabel = nameLabel;
    bottomBar._buttonBox = buttonBox;
    bottomBar._background = background;

    return bottomBar;
}

/**
 * Create visual zone preview using Cairo
 * Grey fill for zones, accent color only for grid lines (borders)
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {Array} zones - Array of zone definitions
 * @param {number} width - Preview width
 * @param {number} height - Preview height
 * @returns {St.DrawingArea} The preview canvas widget
 */
export function createZonePreview(ctx, zones, width, height) {
    const colors = ctx._themeManager.getColors();
    
    const canvas = new St.DrawingArea({
        style: `background-color: ${colors.canvasBg};`,
        x_expand: true,
        y_expand: true
    });

    const accentColor = colors.accent;
    const isDark = colors.isDark;

    canvas.connect('repaint', () => {
        try {
            const cr = canvas.get_context();
            const [w, h] = canvas.get_surface_size();

            // Create rounded rectangle clipping path for top corners only
            // (bottom corners are covered by the bottom bar)
            const radius = 8;
            const degrees = Math.PI / 180.0;
            
            cr.newPath();
            // Top-right corner (rounded)
            cr.arc(w - radius, radius, radius, -90 * degrees, 0 * degrees);
            // Right edge
            cr.lineTo(w, h);
            // Bottom edge (no rounding)
            cr.lineTo(0, h);
            // Left edge
            cr.lineTo(0, radius);
            // Top-left corner (rounded)
            cr.arc(radius, radius, radius, 180 * degrees, 270 * degrees);
            cr.closePath();
            
            // Apply clipping - all subsequent drawing will be constrained to this path
            cr.clip();

            zones.forEach((zone) => {
                const x = zone.x * w;
                const y = zone.y * h;
                const zoneW = zone.w * w;
                const zoneH = zone.h * h;

                // Fill with grey (not accent color)
                const greyValue = isDark ? 0.5 : 0.4;  // Grey intensity
                const greyAlpha = isDark ? 0.35 : 0.25;  // Grey alpha
                cr.setSourceRGBA(greyValue, greyValue, greyValue, greyAlpha);
                cr.rectangle(x, y, zoneW, zoneH);
                cr.fill();

                // Border/grid lines use accent color
                cr.setSourceRGBA(
                    accentColor.red,
                    accentColor.green,
                    accentColor.blue,
                    0.8
                );
                cr.setLineWidth(1);
                cr.rectangle(x, y, zoneW, zoneH);
                cr.stroke();
            });

            cr.$dispose();
        } catch (e) {
            logger.error('Error drawing zone preview:', e);
        }
    });

    return canvas;
}
