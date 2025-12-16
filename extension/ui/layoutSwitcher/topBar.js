/**
 * TopBar - Creates the top selector bar UI
 *
 * Responsible for:
 * - Top bar container with horizontal layout
 * - Monitor pill dropdown selector
 * - Workspace thumbnail buttons (16:9 with zone preview)
 * - "Apply one layout to all spaces" checkbox (synced with prefs)
 * - Monitor dropdown menu and selection handling
 * - Disabled state for workspace thumbnails when applying globally
 *
 * Part of the LayoutSwitcher module split for maintainability.
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {createLogger} from '../../utils/debug.js';
import {createZonePreview} from './cardFactory.js';

const logger = createLogger('TopBar');

/**
 * Create "Spaces" section with compact pill-style workspace selector + monitor picker
 * Redesigned for professional appearance with minimal footprint
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @returns {St.BoxLayout} The top bar widget
 */
export function createTopBar(ctx) {
    const colors = ctx._themeManager.getColors();

    // Read global apply setting (inverted from use-per-workspace-layouts)
    // applyGlobally=true means per-workspace=false (global mode)
    // applyGlobally=false means per-workspace=true (per-space mode)
    ctx._applyGlobally = !ctx._settings.get_boolean('use-per-workspace-layouts');

    // Compact horizontal bar design (not a card)
    ctx._spacesSection = new St.BoxLayout({
        vertical: false,
        style: `
            padding: 12px 16px;
            spacing: 20px;
        `,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });

    // Left side: Monitor dropdown + "Apply to:" label + workspace pills
    const leftGroup = new St.BoxLayout({
        vertical: false,
        style: 'spacing: 16px;',
        y_align: Clutter.ActorAlign.CENTER,
    });

    // Monitor dropdown (compact pill style)
    const monitorPill = createMonitorPill(ctx);
    leftGroup.add_child(monitorPill);

    // Separator
    const separator = new St.Widget({
        style: `width: 1px; height: 24px; background-color: ${colors.divider};`,
        y_align: Clutter.ActorAlign.CENTER,
    });
    leftGroup.add_child(separator);

    // Workspace label + pills
    const workspaceGroup = new St.BoxLayout({
        vertical: false,
        style: 'spacing: 12px;',
        y_align: Clutter.ActorAlign.CENTER,
    });

    const applyLabel = new St.Label({
        text: 'Workspace:',
        style: `font-size: 13px; font-weight: 500; color: ${colors.textMuted};`,
        y_align: Clutter.ActorAlign.CENTER,
    });
    workspaceGroup.add_child(applyLabel);

    // Calculate dimensions for workspace thumbnails
    const tier = ctx._currentTier;
    const thumbW = tier.workspaceThumb.w;
    const thumbH = tier.workspaceThumb.h;
    const thumbGap = tier.workspaceThumbGap || 8;
    const dialogWidth = ctx._calculatedSpacing?.dialogWidth || 1000;
    const reservedWidth = 600;  // Space for monitor pill, label, checkbox, margins
    const maxScrollWidth = Math.max(dialogWidth - reservedWidth, thumbW * 4);

    // Calculate if content will overflow (need scrollbar)
    const nWorkspaces = global.workspace_manager.get_n_workspaces();
    const totalContentWidth = nWorkspaces * thumbW + (nWorkspaces - 1) * thumbGap;
    const willOverflow = totalContentWidth > maxScrollWidth;

    // Create horizontal ScrollView for workspace thumbnails
    // IMPORTANT: Disable ScrollView's built-in mouse scrolling - we handle it ourselves
    // This follows the GNOME Shell pattern from workspaceIndicator.js
    const workspaceScrollView = new St.ScrollView({
        style: `max-width: ${maxScrollWidth}px;`,
        // Only show scrollbar when content overflows
        hscrollbar_policy: willOverflow ? St.PolicyType.AUTOMATIC : St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.NEVER,
        enable_mouse_scrolling: false,  // CRITICAL: Disable - we handle manually
        overlay_scrollbars: false,  // External scrollbar visible below content
        y_align: Clutter.ActorAlign.CENTER,
    });

    // Set height - only add scrollbar space if content will overflow
    const scrollbarHeight = willOverflow ? 10 : 0;
    workspaceScrollView.style += ` height: ${thumbH + scrollbarHeight + 8}px;`;

    // Store reference for updates
    ctx._workspaceScrollView = workspaceScrollView;

    // Create workspace pills (buttons)
    const workspacePills = createWorkspacePills(ctx);
    workspaceScrollView.add_child(workspacePills);

    // Wrap ScrollView in a reactive Clutter.Actor - GNOME Shell pattern
    // This catches scroll events that would otherwise be consumed by the buttons
    // Events bubble up from buttons to this wrapper since ScrollView has mouse scrolling disabled
    const scrollWrapper = new Clutter.Actor({
        layout_manager: new Clutter.BinLayout(),
        reactive: true,  // CRITICAL: Must be reactive to receive scroll events
        y_align: Clutter.ActorAlign.CENTER,
    });
    scrollWrapper.add_child(workspaceScrollView);

    // Handle scroll events on the wrapper - this catches all scroll events in the area
    scrollWrapper.connect('scroll-event', (actor, event) => {
        const direction = event.get_scroll_direction();
        // Use hadjustment directly - hscroll.adjustment doesn't work as expected
        const adjustment = workspaceScrollView.hadjustment;

        if (!adjustment) {
            logger.warn('[SCROLL] No adjustment available!');
            return Clutter.EVENT_PROPAGATE;
        }

        const scrollAmount = thumbW + thumbGap;  // Scroll by one thumbnail

        // Handle smooth scrolling (touchpad, high-res wheel)
        if (direction === Clutter.ScrollDirection.SMOOTH) {
            const [_deltaX, deltaY] = event.get_scroll_delta();
            // Convert vertical scroll to horizontal
            const newValue = Math.max(
                adjustment.lower,
                Math.min(adjustment.value + deltaY * scrollAmount * 0.5, adjustment.upper - adjustment.page_size),
            );
            adjustment.value = newValue;
            return Clutter.EVENT_STOP;
        }

        // Handle discrete scroll directions
        if (direction === Clutter.ScrollDirection.DOWN ||
            direction === Clutter.ScrollDirection.RIGHT) {
            const newValue = Math.min(adjustment.value + scrollAmount, adjustment.upper - adjustment.page_size);
            adjustment.value = newValue;
            return Clutter.EVENT_STOP;
        } else if (direction === Clutter.ScrollDirection.UP ||
                   direction === Clutter.ScrollDirection.LEFT) {
            const newValue = Math.max(adjustment.value - scrollAmount, adjustment.lower);
            adjustment.value = newValue;
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    });

    workspaceGroup.add_child(scrollWrapper);

    leftGroup.add_child(workspaceGroup);
    ctx._spacesSection.add_child(leftGroup);

    // Spacer
    const spacer = new St.Widget({x_expand: true});
    ctx._spacesSection.add_child(spacer);

    // Right side: "Apply to all" checkbox
    const checkboxGroup = createGlobalCheckbox(ctx);
    ctx._spacesSection.add_child(checkboxGroup);

    return ctx._spacesSection;
}

/**
 * Get display label for a monitor (short form for pill button)
 * @param {number} monitorIndex - Monitor index
 * @param {number} primaryIndex - Primary monitor index
 * @returns {string} Short display label
 */
function getMonitorShortLabel(monitorIndex, primaryIndex) {
    if (monitorIndex === primaryIndex) {
        return 'Primary';
    }
    return `Monitor ${monitorIndex + 1}`;
}

/**
 * Get detailed label for a monitor (for dropdown menu)
 * @param {Object} monitor - Monitor object
 * @param {number} index - Monitor index
 * @param {number} primaryIndex - Primary monitor index
 * @returns {Object} {name, details} for display
 */
function getMonitorDetails(monitor, index, primaryIndex) {
    const connector = monitor?.connector || `Display ${index + 1}`;
    const width = monitor?.width || 0;
    const height = monitor?.height || 0;

    let name;
    if (index === primaryIndex) {
        name = 'Primary';
    } else {
        name = `Monitor ${index + 1}`;
    }

    const details = `${connector} · ${width}×${height}`;

    return {name, details, connector};
}

/**
 * Create compact monitor pill dropdown
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @returns {St.BoxLayout} The monitor pill container
 */
export function createMonitorPill(ctx) {
    const colors = ctx._themeManager.getColors();
    const monitors = Main.layoutManager.monitors;
    const primaryIndex = Main.layoutManager.primaryIndex;

    // Preserve existing selection if valid, otherwise default to primary
    // This prevents losing selection when dialog refreshes
    if (ctx._selectedMonitorIndex === undefined ||
        ctx._selectedMonitorIndex === null ||
        ctx._selectedMonitorIndex >= monitors.length) {
        ctx._selectedMonitorIndex = primaryIndex;
    }

    // Outer container holds label + dropdown wrapper (horizontal)
    const container = new St.BoxLayout({
        vertical: false,
        style: 'spacing: 8px;',
        y_align: Clutter.ActorAlign.CENTER,
    });

    const label = new St.Label({
        text: 'Monitor:',
        style: `font-size: 13px; font-weight: 500; color: ${colors.textMuted};`,
        y_align: Clutter.ActorAlign.CENTER,
    });
    container.add_child(label);

    // Dropdown wrapper - holds button and menu (vertical stacking)
    // This is what toggleMonitorDropdown() uses to add/remove the menu
    const dropdownWrapper = new St.BoxLayout({
        vertical: true,
        y_align: Clutter.ActorAlign.START,
    });
    ctx._monitorDropdownContainer = dropdownWrapper;

    // Monitor pill button
    ctx._monitorPillBtn = new St.Button({
        style: 'padding: 6px 14px; ' +
               'border-radius: 16px; ' +
               `background-color: ${colors.inputBg}; ` +
               `border: 1px solid ${colors.borderLight};`,
        reactive: true,
        track_hover: true,
    });

    const btnContent = new St.BoxLayout({
        vertical: false,
        style: 'spacing: 6px;',
        y_align: Clutter.ActorAlign.CENTER,
    });

    // Monitor icon
    const icon = new St.Icon({
        icon_name: 'video-display-symbolic',
        style_class: 'system-status-icon',
        icon_size: 14,
    });
    btnContent.add_child(icon);

    // Use current selected monitor for the label (not always primary)
    const pillLabelText = monitors.length > 1
        ? getMonitorShortLabel(ctx._selectedMonitorIndex, primaryIndex)
        : 'Display';

    ctx._monitorPillLabel = new St.Label({
        text: pillLabelText,
        style: `font-size: 12px; color: ${colors.textSecondary};`,
        y_align: Clutter.ActorAlign.CENTER,
    });
    btnContent.add_child(ctx._monitorPillLabel);

    // Dropdown arrow
    const arrow = new St.Label({
        text: '▾',
        style: `font-size: 10px; color: ${colors.textMuted};`,
        y_align: Clutter.ActorAlign.CENTER,
    });
    btnContent.add_child(arrow);

    ctx._monitorPillBtn.set_child(btnContent);

    // Hover effect
    ctx._monitorPillBtn.connect('enter-event', () => {
        const c = ctx._themeManager.getColors();
        ctx._monitorPillBtn.style = 'padding: 6px 14px; ' +
               'border-radius: 16px; ' +
               `background-color: ${c.inputBg}; ` +
               `border: 1px solid ${c.accentHex};`;
    });

    ctx._monitorPillBtn.connect('leave-event', () => {
        const c = ctx._themeManager.getColors();
        ctx._monitorPillBtn.style = 'padding: 6px 14px; ' +
               'border-radius: 16px; ' +
               `background-color: ${c.inputBg}; ` +
               `border: 1px solid ${c.borderLight};`;
    });

    ctx._monitorPillBtn.connect('clicked', () => {
        toggleMonitorDropdown(ctx);
    });

    // Add button to dropdown wrapper
    dropdownWrapper.add_child(ctx._monitorPillBtn);

    // Add dropdown wrapper to main container
    container.add_child(dropdownWrapper);
    ctx._monitorPillContainer = container;

    return container;
}

/**
 * Create workspace thumbnails with 16:9 zone previews
 * Shows the currently applied layout for each workspace
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @returns {St.BoxLayout} The workspace thumbnails container
 */
export function createWorkspaceThumbnails(ctx) {
    const tier = ctx._currentTier;
    const thumbW = tier.workspaceThumb.w;
    const thumbH = tier.workspaceThumb.h;
    const thumbGap = tier.workspaceThumbGap || 8;
    const thumbRadius = Math.max(2, tier.cardRadius);

    // Determine if thumbnails should be disabled (when applying globally)
    const isDisabled = ctx._applyGlobally;

    const container = new St.BoxLayout({
        vertical: false,
        style: `spacing: ${thumbGap}px;`,
        y_align: Clutter.ActorAlign.CENTER,
    });

    const nWorkspaces = global.workspace_manager.get_n_workspaces();
    ctx._workspaceButtons = [];

    // Check if per-workspace mode is enabled
    const perSpaceEnabled = ctx._settings.get_boolean('use-per-workspace-layouts');

    for (let i = 0; i < nWorkspaces; i++) {
        const isActive = i === ctx._currentWorkspace;

        // Get layout for this specific workspace (per-space mode or global)
        let workspaceLayout;
        if (perSpaceEnabled) {
            // Get layout for this workspace on selected monitor
            const spatialManager = ctx._layoutManager.getSpatialStateManager();
            if (spatialManager) {
                const spaceKey = spatialManager.makeKey(ctx._selectedMonitorIndex, i);
                workspaceLayout = ctx._layoutManager.getLayoutForSpace(spaceKey);
            } else {
                workspaceLayout = ctx._getCurrentLayout();
            }
        } else {
            // Global mode: same layout for all
            workspaceLayout = ctx._getCurrentLayout();
        }

        // Workspace thumbnail button
        const thumb = new St.Button({
            style_class: 'workspace-thumbnail',
            style: getWorkspaceThumbnailStyle(ctx, isActive, isDisabled, thumbW, thumbH, thumbRadius),
            reactive: !isDisabled,
            track_hover: !isDisabled,
            can_focus: !isDisabled,
        });

        // Container for layering (preview + badge)
        const thumbContainer = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            width: thumbW,
            height: thumbH,
            clip_to_allocation: true,
            style: `border-radius: ${thumbRadius}px;`,
        });

        // Zone preview layer
        // Use CENTER alignment (matching cardFactory) to maintain 16:9 aspect ratio
        // FILL alignment caused thumbnails to expand to monitor aspect ratio on relayout
        const previewContainer = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            clip_to_allocation: true,
            style: `border-radius: ${thumbRadius}px;`,
        });

        // Get zones for this workspace (per-space aware)
        const zones = workspaceLayout?.zones || [];

        const preview = createZonePreview(ctx, zones);
        preview.set_size(thumbW, thumbH);
        previewContainer.set_child(preview);
        thumbContainer.add_child(previewContainer);

        // Workspace number badge (overlaid in corner)
        const badge = new St.Label({
            text: `${i + 1}`,
            style: 'font-size: 9px; ' +
                   'font-weight: 700; ' +
                   'color: white; ' +
                   'background-color: rgba(0, 0, 0, 0.6); ' +
                   'border-radius: 3px; ' +
                   'padding: 1px 4px; ' +
                   'margin: 2px;',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START,
        });
        thumbContainer.add_child(badge);

        // Disabled overlay (when applying globally)
        if (isDisabled) {
            const disabledOverlay = new St.Bin({
                style: `background-color: rgba(0, 0, 0, 0.4); border-radius: ${thumbRadius}px;`,
                x_expand: true,
                y_expand: true,
            });
            thumbContainer.add_child(disabledOverlay);
        }

        thumb.set_child(thumbContainer);

        // Store for later reference
        thumb._workspaceIndex = i;
        thumb._isDisabled = isDisabled;

        if (!isDisabled) {
            // Hover effects (only when not disabled)
            thumb.connect('enter-event', () => {
                if (i !== ctx._currentWorkspace) {
                    thumb.style = getWorkspaceThumbnailStyle(ctx, false, false, thumbW, thumbH, thumbRadius, true);
                }
            });

            thumb.connect('leave-event', () => {
                if (i !== ctx._currentWorkspace) {
                    thumb.style = getWorkspaceThumbnailStyle(ctx, false, false, thumbW, thumbH, thumbRadius, false);
                }
            });

            thumb.connect('clicked', () => {
                onWorkspaceThumbnailClicked(ctx, i);
            });
        }

        ctx._workspaceButtons.push(thumb);
        container.add_child(thumb);
    }

    // Store container reference for updating disabled state
    ctx._workspaceThumbnailsContainer = container;

    return container;
}

/**
 * Get workspace thumbnail style based on state
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {boolean} isActive - Whether this workspace is selected
 * @param {boolean} isDisabled - Whether thumbnails are disabled (applying globally)
 * @param {number} width - Thumbnail width
 * @param {number} height - Thumbnail height
 * @param {number} radius - Border radius
 * @param {boolean} isHovered - Whether the thumbnail is being hovered
 * @returns {string} CSS style string
 */
function getWorkspaceThumbnailStyle(ctx, isActive, isDisabled, width, height, radius, isHovered = false) {
    const colors = ctx._themeManager.getColors();

    let baseStyle = `width: ${width}px; height: ${height}px; ` +
                    `border-radius: ${radius}px; ` +
                    'padding: 0; overflow: hidden; ';

    if (isDisabled) {
        // Disabled state: muted appearance, no border highlight
        baseStyle += `background-color: ${colors.cardBg}; ` +
                     `border: 2px solid ${colors.borderLight}; ` +
                     'opacity: 0.5;';
    } else if (isActive) {
        // Active state: accent border and subtle background
        baseStyle += `background-color: ${colors.accentRGBA(0.15)}; ` +
                     `border: 2px solid ${colors.accentHex}; ` +
                     `box-shadow: 0 0 0 1px ${colors.accentRGBA(0.3)};`;
    } else if (isHovered) {
        // Hover state: accent border, slightly highlighted
        baseStyle += `background-color: ${colors.accentRGBA(0.1)}; ` +
                     `border: 2px solid ${colors.accentHex};`;
    } else {
        // Default state: subtle border
        baseStyle += `background-color: ${colors.cardBg}; ` +
                     `border: 2px solid ${colors.borderLight};`;
    }

    return baseStyle;
}

/**
 * Handle workspace thumbnail click - select workspace for configuration
 * Single-click: Select workspace in UI (for assigning layouts)
 * Double-click: Actually switch to that GNOME workspace
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {number} workspaceIndex - Index of clicked workspace
 */
export function onWorkspaceThumbnailClicked(ctx, workspaceIndex) {
    // Don't respond if disabled (global mode)
    if (ctx._applyGlobally) {
        return;
    }

    // If clicking the already-selected workspace, switch to that actual GNOME workspace
    if (ctx._currentWorkspace === workspaceIndex) {
        const workspace = global.workspace_manager.get_workspace_by_index(workspaceIndex);
        if (workspace) {
            workspace.activate(global.get_current_time());
        }
        return;
    }

    const tier = ctx._currentTier;
    const thumbW = tier.workspaceThumb.w;
    const thumbH = tier.workspaceThumb.h;
    const thumbRadius = Math.max(2, tier.cardRadius);

    // Update all thumbnail styles
    ctx._workspaceButtons.forEach((thumb, index) => {
        const isActive = index === workspaceIndex;
        thumb.style = getWorkspaceThumbnailStyle(ctx, isActive, false, thumbW, thumbH, thumbRadius);
    });

    ctx._currentWorkspace = workspaceIndex;

    // Update the preview background to show layouts for the newly selected workspace
    if (ctx._previewBackground) {
        const layout = ctx._getLayoutForWorkspace(workspaceIndex);
        ctx._previewBackground.setLayout(layout);
    }

    // Update which layout cards show as "active" for this workspace
    // Don't do full refresh - just update active states
    if (ctx._allCards && ctx._allCards.length > 0) {
        ctx._updateCardFocus();
    }
}

/**
 * Update workspace thumbnails disabled state
 * Called when "Apply to all workspaces" checkbox is toggled
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 */
export function updateWorkspaceThumbnailsDisabledState(ctx) {
    const isDisabled = ctx._applyGlobally;
    const tier = ctx._currentTier;
    const thumbW = tier.workspaceThumb.w;
    const thumbH = tier.workspaceThumb.h;
    const thumbRadius = Math.max(2, tier.cardRadius);

    ctx._workspaceButtons.forEach((thumb, index) => {
        const isActive = index === ctx._currentWorkspace;
        thumb.style = getWorkspaceThumbnailStyle(ctx, isActive, isDisabled, thumbW, thumbH, thumbRadius);
        thumb.reactive = !isDisabled;
        thumb.track_hover = !isDisabled;
        thumb.can_focus = !isDisabled;
        thumb._isDisabled = isDisabled;

        // Update disabled overlay visibility
        const container = thumb.get_child();
        if (container) {
            const children = container.get_children();
            // Find existing disabled overlay (last child if present)
            const lastChild = children[children.length - 1];
            if (lastChild && lastChild.style?.includes('rgba(0, 0, 0, 0.4)')) {
                // Remove existing overlay
                container.remove_child(lastChild);
                lastChild.destroy();
            }

            // Add new overlay if disabled
            if (isDisabled) {
                const disabledOverlay = new St.Bin({
                    style: `background-color: rgba(0, 0, 0, 0.4); border-radius: ${thumbRadius}px;`,
                    x_expand: true,
                    y_expand: true,
                });
                container.add_child(disabledOverlay);
            }
        }
    });
}

// Keep old function name as alias for backwards compatibility
export const createWorkspacePills = createWorkspaceThumbnails;
export const onWorkspacePillClicked = onWorkspaceThumbnailClicked;

/**
 * Create "Apply to all" checkbox group
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @returns {St.BoxLayout} The checkbox container
 */
export function createGlobalCheckbox(ctx) {
    const colors = ctx._themeManager.getColors();

    const container = new St.BoxLayout({
        vertical: false,
        style: 'spacing: 8px;',
        y_align: Clutter.ActorAlign.CENTER,
        reactive: true,
    });

    // Label - matches prefs.js text
    const label = new St.Label({
        text: 'Apply one layout to all spaces',
        style: `font-size: 12px; color: ${colors.textMuted};`,
        y_align: Clutter.ActorAlign.CENTER,
        reactive: true,
    });

    // Checkbox
    ctx._applyGloballyCheckbox = new St.Button({
        style_class: 'checkbox',
        style: 'width: 18px; height: 18px; ' +
               `border: 2px solid ${ctx._applyGlobally ? colors.accentHex : colors.textMuted}; ` +
               'border-radius: 3px; ' +
               `background-color: ${ctx._applyGlobally ? colors.accentHex : 'transparent'};`,
        reactive: true,
        track_hover: true,
        y_align: Clutter.ActorAlign.CENTER,
    });

    // Add checkmark when checked
    if (ctx._applyGlobally) {
        const checkmark = new St.Label({
            text: '✓',
            style: `color: ${colors.isDark ? '#1a202c' : 'white'}; font-size: 12px; font-weight: bold;`,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        ctx._applyGloballyCheckbox.set_child(checkmark);
    }

    // Toggle handler - updates use-per-workspace-layouts (inverted)
    const toggleCheckbox = () => {
        ctx._applyGlobally = !ctx._applyGlobally;
        // Write inverted value: applyGlobally=true means per-workspace=false
        ctx._settings.set_boolean('use-per-workspace-layouts', !ctx._applyGlobally);

        const c = ctx._themeManager.getColors();

        ctx._applyGloballyCheckbox.style = 'width: 18px; height: 18px; ' +
               `border: 2px solid ${ctx._applyGlobally ? c.accentHex : c.textMuted}; ` +
               'border-radius: 3px; ' +
               `background-color: ${ctx._applyGlobally ? c.accentHex : 'transparent'};`;

        if (ctx._applyGlobally) {
            const checkmark = new St.Label({
                text: '✓',
                style: `color: ${c.isDark ? '#1a202c' : 'white'}; font-size: 12px; font-weight: bold;`,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            ctx._applyGloballyCheckbox.set_child(checkmark);
        } else {
            ctx._applyGloballyCheckbox.set_child(null);
        }

        // Update workspace thumbnails disabled state
        updateWorkspaceThumbnailsDisabledState(ctx);
    };

    label.connect('button-press-event', () => {
        toggleCheckbox();
        return Clutter.EVENT_STOP;
    });

    ctx._applyGloballyCheckbox.connect('clicked', () => {
        toggleCheckbox();
        return Clutter.EVENT_STOP;
    });

    container.add_child(label);
    container.add_child(ctx._applyGloballyCheckbox);

    return container;
}

/**
 * Toggle monitor dropdown menu visibility
 * Adds menu to _dialog (the modal actor) so it receives events through the modal
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 */
export function toggleMonitorDropdown(ctx) {
    if (ctx._monitorMenu) {
        // Close existing menu
        closeMonitorDropdown(ctx);
    } else {
        // Create menu
        ctx._monitorMenu = createMonitorDropdownMenu(ctx);

        // Add directly to the _dialog actor (the modal actor)
        // This ensures the menu is within the modal hierarchy and receives events
        if (ctx._dialog) {
            ctx._dialog.add_child(ctx._monitorMenu);

            // Position relative to _dialog (which uses FixedLayout)
            // get_transformed_position returns screen coordinates
            // _dialog is positioned at monitor origin, so subtract that
            const [btnScreenX, btnScreenY] = ctx._monitorPillBtn.get_transformed_position();
            const btnHeight = ctx._monitorPillBtn.get_height();

            // Get monitor position (dialog origin in screen coords)
            const monitor = Main.layoutManager.currentMonitor;
            const menuX = btnScreenX - monitor.x;
            const menuY = btnScreenY - monitor.y + btnHeight + 4;

            ctx._monitorMenu.set_position(menuX, menuY);

            logger.info(`Monitor menu opened at (${menuX}, ${menuY}) relative to dialog (btn screen: ${btnScreenX}, ${btnScreenY})`);
        } else {
            // Fallback
            ctx._monitorDropdownContainer.add_child(ctx._monitorMenu);
            logger.warn('No _dialog available, added menu to dropdown container');
        }
    }
}

/**
 * Close the monitor dropdown menu
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 */
export function closeMonitorDropdown(ctx) {
    if (ctx._monitorMenu) {
        if (ctx._monitorMenu.get_parent()) {
            ctx._monitorMenu.get_parent().remove_child(ctx._monitorMenu);
        }
        ctx._monitorMenu.destroy();
        ctx._monitorMenu = null;
    }
}

/**
 * Create monitor dropdown menu
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @returns {St.BoxLayout} The dropdown menu widget
 */
export function createMonitorDropdownMenu(ctx) {
    const colors = ctx._themeManager.getColors();

    const menu = new St.BoxLayout({
        vertical: true,
        style: `background: ${colors.menuBg}; ` +
               `border: 1px solid ${colors.menuBorder}; ` +
               'border-radius: 6px; ' +
               'margin-top: 4px; ' +
               'padding: 4px;',
        reactive: true,
    });

    const monitors = Main.layoutManager.monitors;
    const primaryIndex = Main.layoutManager.primaryIndex;

    monitors.forEach((monitor, index) => {
        const isSelected = index === ctx._selectedMonitorIndex;
        const details = getMonitorDetails(monitor, index, primaryIndex);

        const item = new St.Button({
            style_class: 'monitor-menu-item',
            style: 'padding: 8px 12px; ' +
                   'margin: 0; ' +
                   `background: ${isSelected ? colors.menuItemBgActive : colors.menuItemBg}; ` +
                   'border-radius: 4px;',
            reactive: true,
            track_hover: true,
            x_expand: true,
        });

        const itemContent = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 12px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Small monitor icon with number overlay
        const iconContainer = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            width: 36,
            height: 22,
        });

        const iconBg = new St.Widget({
            style: `background: ${colors.monitorIconBg}; ` +
                   `border: 2px solid ${isSelected ? colors.accentHex : colors.monitorIconBorder}; ` +
                   'border-radius: 2px;',
            x_expand: true,
            y_expand: true,
        });
        iconContainer.add_child(iconBg);

        // Monitor number badge
        const badge = new St.Label({
            text: `${index + 1}`,
            style: `font-size: 10px; font-weight: bold; color: ${colors.textSecondary};`,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
        });
        iconContainer.add_child(badge);

        itemContent.add_child(iconContainer);

        // Monitor text (name + details in vertical layout)
        const textBox = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 2px;',
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Name (Primary or Monitor N)
        const nameLabel = new St.Label({
            text: details.name,
            style: `font-size: 12px; font-weight: 500; color: ${colors.textPrimary};`,
        });
        textBox.add_child(nameLabel);

        // Details line (connector · resolution)
        const detailsLabel = new St.Label({
            text: details.details,
            style: `font-size: 10px; color: ${colors.textMuted};`,
        });
        textBox.add_child(detailsLabel);

        itemContent.add_child(textBox);

        // Checkmark for selected item
        if (isSelected) {
            const spacer = new St.Widget({x_expand: true});
            itemContent.add_child(spacer);

            const checkmark = new St.Label({
                text: '✓',
                style: `font-size: 14px; font-weight: bold; color: ${colors.accentHex};`,
                y_align: Clutter.ActorAlign.CENTER,
            });
            itemContent.add_child(checkmark);
        }

        item.set_child(itemContent);

        // Hover effect
        item.connect('enter-event', () => {
            if (!isSelected) {
                item.style = `padding: 8px 12px; margin: 0; background: ${colors.menuItemBgHover}; border-radius: 4px;`;
            }
        });

        item.connect('leave-event', () => {
            if (!isSelected) {
                item.style = `padding: 8px 12px; margin: 0; background: ${colors.menuItemBg}; border-radius: 4px;`;
            }
        });

        // Click to select monitor - use button-press-event for better reliability
        item.connect('button-press-event', () => {
            logger.info(`[MONITOR CLICK] Clicked monitor ${index}`);
            onMonitorSelected(ctx, index);
            return Clutter.EVENT_STOP;
        });

        menu.add_child(item);
    });

    return menu;
}

/**
 * Handle monitor selection
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {number} monitorIndex - Index of selected monitor
 */
export function onMonitorSelected(ctx, monitorIndex) {
    ctx._selectedMonitorIndex = monitorIndex;
    const monitors = Main.layoutManager.monitors;
    const primaryIndex = Main.layoutManager.primaryIndex;

    logger.debug(`Monitor ${monitorIndex} selected (${monitors[monitorIndex]?.connector || 'unknown'})`);

    // Update the pill label
    if (ctx._monitorPillLabel) {
        ctx._monitorPillLabel.text = monitorIndex === primaryIndex ? 'Primary' : `Monitor ${monitorIndex + 1}`;
    }

    // Close dropdown
    toggleMonitorDropdown(ctx);

    // Update the preview background to show zones on the selected monitor
    // Get the current layout for the selected monitor/workspace
    if (ctx._previewBackground) {
        const layout = ctx._getLayoutForWorkspace(ctx._currentWorkspace);
        ctx._previewBackground.setSelectedMonitor(monitorIndex, layout);
        logger.debug(`Preview background updated for monitor ${monitorIndex}`);
    }

    // Refresh workspace thumbnails to show layouts for the newly selected monitor
    if (ctx._workspaceThumbnailsContainer) {
        // Full refresh to update workspace layout previews for the new monitor
        ctx._refreshDialog();
    }
}
