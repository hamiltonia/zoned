/**
 * TopBar - Creates the top selector bar UI
 * 
 * Responsible for:
 * - Top bar container with horizontal layout
 * - Monitor pill dropdown selector
 * - Workspace pill buttons (1, 2, 3, 4...)
 * - "Apply to all workspaces" global checkbox
 * - Monitor dropdown menu and selection handling
 * 
 * Part of the LayoutSwitcher module split for maintainability.
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { createLogger } from '../../utils/debug.js';

const logger = createLogger('TopBar');

/**
 * Create "Spaces" section with compact pill-style workspace selector + monitor picker
 * Redesigned for professional appearance with minimal footprint
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @returns {St.BoxLayout} The top bar widget
 */
export function createTopBar(ctx) {
    const colors = ctx._themeManager.getColors();
    
    // Read global apply setting
    ctx._applyGlobally = ctx._settings.get_boolean('apply-layout-globally');
    
    // Compact horizontal bar design (not a card)
    ctx._spacesSection = new St.BoxLayout({
        vertical: false,
        style: `
            padding: 12px 16px;
            spacing: 20px;
        `,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER
    });

    // Left side: Monitor dropdown + "Apply to:" label + workspace pills
    const leftGroup = new St.BoxLayout({
        vertical: false,
        style: 'spacing: 16px;',
        y_align: Clutter.ActorAlign.CENTER
    });

    // Monitor dropdown (compact pill style)
    const monitorPill = createMonitorPill(ctx);
    leftGroup.add_child(monitorPill);

    // Separator
    const separator = new St.Widget({
        style: `width: 1px; height: 24px; background-color: ${colors.divider};`,
        y_align: Clutter.ActorAlign.CENTER
    });
    leftGroup.add_child(separator);

    // Workspace label + pills
    const workspaceGroup = new St.BoxLayout({
        vertical: false,
        style: 'spacing: 12px;',
        y_align: Clutter.ActorAlign.CENTER
    });

    const applyLabel = new St.Label({
        text: 'Workspace:',
        style: `font-size: 13px; font-weight: 500; color: ${colors.textMuted};`,
        y_align: Clutter.ActorAlign.CENTER
    });
    workspaceGroup.add_child(applyLabel);

    // Workspace pills (compact buttons)
    const workspacePills = createWorkspacePills(ctx);
    workspaceGroup.add_child(workspacePills);

    leftGroup.add_child(workspaceGroup);
    ctx._spacesSection.add_child(leftGroup);

    // Spacer
    const spacer = new St.Widget({ x_expand: true });
    ctx._spacesSection.add_child(spacer);

    // Right side: "Apply to all" checkbox
    const checkboxGroup = createGlobalCheckbox(ctx);
    ctx._spacesSection.add_child(checkboxGroup);

    return ctx._spacesSection;
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
    
    ctx._selectedMonitorIndex = primaryIndex;
    
    const container = new St.BoxLayout({
        vertical: false,
        style: 'spacing: 8px;',
        y_align: Clutter.ActorAlign.CENTER
    });

    const label = new St.Label({
        text: 'Monitor:',
        style: `font-size: 13px; font-weight: 500; color: ${colors.textMuted};`,
        y_align: Clutter.ActorAlign.CENTER
    });
    container.add_child(label);

    // Monitor pill button
    ctx._monitorPillBtn = new St.Button({
        style: `padding: 6px 14px; ` +
               `border-radius: 16px; ` +
               `background-color: ${colors.inputBg}; ` +
               `border: 1px solid ${colors.borderLight};`,
        reactive: true,
        track_hover: true
    });

    const btnContent = new St.BoxLayout({
        vertical: false,
        style: 'spacing: 6px;',
        y_align: Clutter.ActorAlign.CENTER
    });

    // Monitor icon
    const icon = new St.Icon({
        icon_name: 'video-display-symbolic',
        style_class: 'system-status-icon',
        icon_size: 14
    });
    btnContent.add_child(icon);

    ctx._monitorPillLabel = new St.Label({
        text: monitors.length > 1 ? 'Primary' : 'Display',
        style: `font-size: 12px; color: ${colors.textSecondary};`,
        y_align: Clutter.ActorAlign.CENTER
    });
    btnContent.add_child(ctx._monitorPillLabel);

    // Dropdown arrow
    const arrow = new St.Label({
        text: '▾',
        style: `font-size: 10px; color: ${colors.textMuted};`,
        y_align: Clutter.ActorAlign.CENTER
    });
    btnContent.add_child(arrow);

    ctx._monitorPillBtn.set_child(btnContent);

    // Hover effect
    ctx._monitorPillBtn.connect('enter-event', () => {
        const c = ctx._themeManager.getColors();
        ctx._monitorPillBtn.style = `padding: 6px 14px; ` +
               `border-radius: 16px; ` +
               `background-color: ${c.inputBg}; ` +
               `border: 1px solid ${c.accentHex};`;
    });

    ctx._monitorPillBtn.connect('leave-event', () => {
        const c = ctx._themeManager.getColors();
        ctx._monitorPillBtn.style = `padding: 6px 14px; ` +
               `border-radius: 16px; ` +
               `background-color: ${c.inputBg}; ` +
               `border: 1px solid ${c.borderLight};`;
    });

    ctx._monitorPillBtn.connect('clicked', () => {
        toggleMonitorDropdown(ctx);
    });

    container.add_child(ctx._monitorPillBtn);
    ctx._monitorPillContainer = container;

    return container;
}

/**
 * Create compact pill-style workspace buttons
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @returns {St.BoxLayout} The workspace pills container
 */
export function createWorkspacePills(ctx) {
    const colors = ctx._themeManager.getColors();
    
    const container = new St.BoxLayout({
        vertical: false,
        style: `spacing: 8px; 
                background-color: ${colors.inputBg}; 
                border-radius: 20px; 
                padding: 4px;`,
        y_align: Clutter.ActorAlign.CENTER
    });

    const nWorkspaces = global.workspace_manager.get_n_workspaces();
    ctx._workspaceButtons = [];

    for (let i = 0; i < nWorkspaces; i++) {
        const isActive = i === ctx._currentWorkspace;
        
        const pill = new St.Button({
            style_class: 'workspace-pill',
            style: `padding: 6px 16px; ` +
                   `border-radius: 16px; ` +
                   `background-color: ${isActive ? colors.accentHex : 'transparent'}; ` +
                   `color: ${isActive ? 'white' : colors.textMuted}; ` +
                   `font-size: 12px; ` +
                   `font-weight: ${isActive ? '600' : '500'};`,
            reactive: true,
            track_hover: true
        });

        const label = new St.Label({
            text: `${i + 1}`,
            y_align: Clutter.ActorAlign.CENTER
        });
        pill.set_child(label);

        // Store for later reference
        pill._workspaceIndex = i;
        pill._label = label;

        // Hover effects
        pill.connect('enter-event', () => {
            if (i !== ctx._currentWorkspace) {
                const c = ctx._themeManager.getColors();
                pill.style = `padding: 6px 16px; ` +
                            `border-radius: 16px; ` +
                            `background-color: ${c.accentRGBA(0.3)}; ` +
                            `color: ${c.textPrimary}; ` +
                            `font-size: 12px; ` +
                            `font-weight: 500;`;
            }
        });

        pill.connect('leave-event', () => {
            if (i !== ctx._currentWorkspace) {
                const c = ctx._themeManager.getColors();
                pill.style = `padding: 6px 16px; ` +
                            `border-radius: 16px; ` +
                            `background-color: transparent; ` +
                            `color: ${c.textMuted}; ` +
                            `font-size: 12px; ` +
                            `font-weight: 500;`;
            }
        });

        pill.connect('clicked', () => {
            onWorkspacePillClicked(ctx, i);
        });

        ctx._workspaceButtons.push(pill);
        container.add_child(pill);
    }

    return container;
}

/**
 * Handle workspace pill click
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 * @param {number} workspaceIndex - Index of clicked workspace
 */
export function onWorkspacePillClicked(ctx, workspaceIndex) {
    const colors = ctx._themeManager.getColors();
    
    // Update previous active pill
    ctx._workspaceButtons.forEach((pill, index) => {
        const isActive = index === workspaceIndex;
        pill.style = `padding: 6px 16px; ` +
                    `border-radius: 16px; ` +
                    `background-color: ${isActive ? colors.accentHex : 'transparent'}; ` +
                    `color: ${isActive ? 'white' : colors.textMuted}; ` +
                    `font-size: 12px; ` +
                    `font-weight: ${isActive ? '600' : '500'};`;
    });

    ctx._currentWorkspace = workspaceIndex;
    logger.debug(`Switched to workspace ${workspaceIndex}`);
    
    // Refresh layout cards to show current workspace's active layout
    ctx._refreshDialog();
}

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
        reactive: true
    });

    // Label
    const label = new St.Label({
        text: 'Apply to all workspaces',
        style: `font-size: 12px; color: ${colors.textMuted};`,
        y_align: Clutter.ActorAlign.CENTER,
        reactive: true
    });

    // Checkbox
    ctx._applyGloballyCheckbox = new St.Button({
        style_class: 'checkbox',
        style: `width: 18px; height: 18px; ` +
               `border: 2px solid ${ctx._applyGlobally ? colors.accentHex : colors.textMuted}; ` +
               `border-radius: 3px; ` +
               `background-color: ${ctx._applyGlobally ? colors.accentHex : 'transparent'};`,
        reactive: true,
        track_hover: true,
        y_align: Clutter.ActorAlign.CENTER
    });

    // Add checkmark when checked
    if (ctx._applyGlobally) {
        const checkmark = new St.Label({
            text: '✓',
            style: `color: ${colors.isDark ? '#1a202c' : 'white'}; font-size: 12px; font-weight: bold;`,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        ctx._applyGloballyCheckbox.set_child(checkmark);
    }

    // Toggle handler
    const toggleCheckbox = () => {
        ctx._applyGlobally = !ctx._applyGlobally;
        ctx._settings.set_boolean('apply-layout-globally', ctx._applyGlobally);
        
        const c = ctx._themeManager.getColors();
        
        ctx._applyGloballyCheckbox.style = `width: 18px; height: 18px; ` +
               `border: 2px solid ${ctx._applyGlobally ? c.accentHex : c.textMuted}; ` +
               `border-radius: 3px; ` +
               `background-color: ${ctx._applyGlobally ? c.accentHex : 'transparent'};`;
        
        if (ctx._applyGlobally) {
            const checkmark = new St.Label({
                text: '✓',
                style: `color: ${c.isDark ? '#1a202c' : 'white'}; font-size: 12px; font-weight: bold;`,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER
            });
            ctx._applyGloballyCheckbox.set_child(checkmark);
        } else {
            ctx._applyGloballyCheckbox.set_child(null);
        }
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
 * @param {LayoutSwitcher} ctx - Parent LayoutSwitcher instance
 */
export function toggleMonitorDropdown(ctx) {
    if (ctx._monitorMenu) {
        // Close existing menu
        ctx._monitorDropdownContainer.remove_child(ctx._monitorMenu);
        ctx._monitorMenu.destroy();
        ctx._monitorMenu = null;
    } else {
        // Create and show menu
        ctx._monitorMenu = createMonitorDropdownMenu(ctx);
        ctx._monitorDropdownContainer.add_child(ctx._monitorMenu);
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
               `border-radius: 6px; ` +
               `margin-top: 4px; ` +
               `padding: 4px;`,
        reactive: true
    });

    const monitors = Main.layoutManager.monitors;
    const primaryIndex = Main.layoutManager.primaryIndex;

    monitors.forEach((monitor, index) => {
        const item = new St.Button({
            style_class: 'monitor-menu-item',
            style: `padding: 10px 12px; ` +
                   `background: ${index === ctx._selectedMonitorIndex ? colors.menuItemBgActive : colors.menuItemBg}; ` +
                   `border-radius: 4px;`,
            reactive: true,
            track_hover: true
        });

        const itemContent = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 10px;'
        });

        // Small monitor icon
        const icon = new St.Widget({
            style: `width: 40px; height: 24px; ` +
                   `background: ${colors.monitorIconBg}; ` +
                   `border: 2px solid ${colors.monitorIconBorder}; ` +
                   `border-radius: 2px;`
        });
        itemContent.add_child(icon);

        // Monitor label
        const label = new St.Label({
            text: index === primaryIndex ? 'Primary Monitor' : `Monitor ${index + 1}`,
            style: `font-size: 12px; color: ${colors.textSecondary};`
        });
        itemContent.add_child(label);

        item.set_child(itemContent);

        // Hover effect
        item.connect('enter-event', () => {
            if (index !== ctx._selectedMonitorIndex) {
                item.style = `padding: 10px 12px; background: ${colors.menuItemBgHover}; border-radius: 4px;`;
            }
        });

        item.connect('leave-event', () => {
            if (index !== ctx._selectedMonitorIndex) {
                item.style = `padding: 10px 12px; background: ${colors.menuItemBg}; border-radius: 4px;`;
            }
        });

        // Click to select monitor
        item.connect('clicked', () => {
            onMonitorSelected(ctx, index);
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
    logger.debug(`Monitor ${monitorIndex} selected`);

    // Update trigger label
    const monitors = Main.layoutManager.monitors;
    const primaryIndex = Main.layoutManager.primaryIndex;
    const triggerContent = ctx._monitorTrigger?.get_child();
    
    if (triggerContent) {
        const label = triggerContent.get_children()[1]; // Second child is the label
        label.text = monitorIndex === primaryIndex ? 'Primary Monitor' : `Monitor ${monitorIndex + 1}`;
    }

    // Also update the pill label if it exists
    if (ctx._monitorPillLabel) {
        ctx._monitorPillLabel.text = monitorIndex === primaryIndex ? 'Primary' : `Monitor ${monitorIndex + 1}`;
    }

    // Close dropdown
    toggleMonitorDropdown(ctx);
}
