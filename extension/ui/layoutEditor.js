/**
 * LayoutEditor - Comprehensive layout management UI
 * 
 * Mimics FancyZones UI with:
 * - Monitor/Workspace selector at top
 * - Templates section (built-in, read-only, click to apply)
 * - Custom layouts section (user-created, editable)
 * - "Create new layout" button at bottom
 * 
 * Replaces the simpler LayoutSwitcher with full management capabilities.
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { createLogger } from '../utils/debug.js';
import { TemplateManager } from '../templateManager.js';
import { ZoneEditor } from './zoneEditor.js';

const logger = createLogger('LayoutEditor');

export class LayoutEditor {
    /**
     * @param {LayoutManager} layoutManager - Layout manager instance
     * @param {ZoneOverlay} zoneOverlay - Zone overlay instance for notifications
     * @param {Gio.Settings} settings - GSettings instance
     */
    constructor(layoutManager, zoneOverlay, settings) {
        this._layoutManager = layoutManager;
        this._zoneOverlay = zoneOverlay;
        this._settings = settings;
        this._templateManager = new TemplateManager();
        
        this._dialog = null;
        this._currentWorkspace = 0;
        this._workspaceMode = false;
        this._workspaceButtons = [];
    }

    /**
     * Show the layout editor dialog
     */
    show() {
        if (this._dialog) {
            this.hide();
            return;
        }

        // Get current workspace
        this._currentWorkspace = global.workspace_manager.get_active_workspace_index();
        this._workspaceMode = this._settings.get_boolean('use-per-workspace-layouts');

        logger.info(`Layout editor shown (workspace mode: ${this._workspaceMode})`);

        this._createDialog();
        this._connectKeyEvents();
    }

    /**
     * Hide the layout editor dialog
     */
    hide() {
        if (!this._dialog) return;

        const dialog = this._dialog;
        this._dialog = null;
        this._workspaceButtons = [];

        this._disconnectKeyEvents();

        Main.uiGroup.remove_child(dialog);
        dialog.destroy();

        logger.debug('Layout editor hidden');
    }

    /**
     * Create the main dialog UI
     * @private
     */
    _createDialog() {
        const monitor = Main.layoutManager.currentMonitor;

        // Background overlay - translucent, click to close
        this._dialog = new St.Bin({
            style_class: 'modal-dialog',
            reactive: true,
            can_focus: true,
            style: 'background-color: rgba(0, 0, 0, 0.5);',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });

        // Click outside to close
        this._dialog.connect('button-press-event', (actor, event) => {
            if (event.get_source() === this._dialog) {
                this.hide();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Main container
        const dialogWidth = Math.floor(monitor.width * 0.7);
        const dialogHeight = Math.floor(monitor.height * 0.8);

        const container = new St.BoxLayout({
            vertical: true,
            style: `background-color: rgba(40, 40, 40, 0.98); ` +
                   `border-radius: 16px; ` +
                   `padding: 32px; ` +
                   `width: ${dialogWidth}px; ` +
                   `height: ${dialogHeight}px;`
        });

        // Prevent clicks on container from closing dialog
        container.connect('button-press-event', () => Clutter.EVENT_STOP);

        // Top section: Monitor & Workspace selector
        const topBar = this._createTopBar();
        container.add_child(topBar);

        // Scrollable content area
        const scrollView = new St.ScrollView({
            style: 'flex: 1; margin-top: 24px;',
            overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            x_expand: true,
            y_expand: true
        });

        const contentBox = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 32px;'
        });

        // Templates section
        const templatesSection = this._createTemplatesSection();
        contentBox.add_child(templatesSection);

        // Custom layouts section
        const customSection = this._createCustomLayoutsSection();
        contentBox.add_child(customSection);

        scrollView.add_child(contentBox);
        container.add_child(scrollView);

        // Bottom: Create new layout button
        const createButton = this._createNewLayoutButton();
        container.add_child(createButton);

        this._dialog.set_child(container);

        // Add to stage
        Main.uiGroup.add_child(this._dialog);
        this._dialog.set_position(0, 0);
        this._dialog.set_size(global.screen_width, global.screen_height);

        this._dialog.grab_key_focus();
    }

    /**
     * Create top bar with monitor and workspace selectors
     * @private
     */
    _createTopBar() {
        const topBar = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 24px;'
        });

        // Monitor info (static for now) - use currentMonitor for simplicity
        const monitor = Main.layoutManager.currentMonitor;

        const monitorLabel = new St.Label({
            text: `Monitor: Primary`,
            style: 'font-size: 14pt; color: #ffffff; font-weight: bold;'
        });
        topBar.add_child(monitorLabel);

        const monitorInfo = new St.Label({
            text: `${monitor.width} × ${monitor.height}`,
            style: 'font-size: 11pt; color: #aaaaaa; margin-left: 8px;'
        });
        topBar.add_child(monitorInfo);

        // Spacer
        const spacer = new St.Widget({
            x_expand: true
        });
        topBar.add_child(spacer);

        // Workspace selector (if workspace mode enabled)
        if (this._workspaceMode) {
            const workspaceBox = this._createWorkspaceSelector();
            topBar.add_child(workspaceBox);
        }

        return topBar;
    }

    /**
     * Create workspace selector buttons
     * @private
     */
    _createWorkspaceSelector() {
        const box = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 8px;'
        });

        const label = new St.Label({
            text: 'Workspace:',
            style: 'font-size: 11pt; color: #aaaaaa; margin-right: 8px;'
        });
        box.add_child(label);

        const nWorkspaces = global.workspace_manager.get_n_workspaces();

        for (let i = 0; i < nWorkspaces; i++) {
            const isActive = i === this._currentWorkspace;
            
            const button = new St.Button({
                label: `${i + 1}`,
                style_class: 'workspace-button',
                style: `padding: 8px 16px; ` +
                       `border-radius: 6px; ` +
                       `min-width: 40px; ` +
                       `${isActive ? 
                           'background-color: #3584e4; color: white; font-weight: bold;' : 
                           'background-color: rgba(255,255,255,0.1); color: #cccccc;'}`,
                reactive: true
            });

            const workspaceIndex = i;
            button.connect('clicked', () => {
                this._onWorkspaceSelected(workspaceIndex);
            });

            this._workspaceButtons.push(button);
            box.add_child(button);
        }

        return box;
    }

    /**
     * Handle workspace selection
     * @private
     */
    _onWorkspaceSelected(workspaceIndex) {
        this._currentWorkspace = workspaceIndex;
        logger.debug(`Switched to workspace ${workspaceIndex} in editor`);

        // Update workspace button styles
        this._workspaceButtons.forEach((button, index) => {
            const isActive = index === workspaceIndex;
            button.style = `padding: 8px 16px; ` +
                          `border-radius: 6px; ` +
                          `min-width: 40px; ` +
                          `${isActive ? 
                              'background-color: #3584e4; color: white; font-weight: bold;' : 
                              'background-color: rgba(255,255,255,0.1); color: #cccccc;'}`;
        });

        // Refresh the layout display to show current workspace's layout
        this._refreshDialog();
    }

    /**
     * Create templates section
     * @private
     */
    _createTemplatesSection() {
        const section = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 16px;'
        });

        // Section header
        const header = new St.Label({
            text: 'Templates',
            style: 'font-size: 16pt; color: #ffffff; font-weight: bold;'
        });
        section.add_child(header);

        // Template cards in horizontal row
        const templatesRow = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 16px;'
        });

        const templates = this._templateManager.getBuiltinTemplates();
        const currentLayout = this._getCurrentLayout();

        templates.forEach(template => {
            const card = this._createTemplateCard(template, currentLayout);
            templatesRow.add_child(card);
        });

        section.add_child(templatesRow);

        return section;
    }

    /**
     * Create a template card
     * @private
     */
    _createTemplateCard(template, currentLayout) {
        const isActive = this._isLayoutActive(template, currentLayout);

        const card = new St.Button({
            style_class: 'template-card',
            style: `padding: 16px; ` +
                   `border-radius: 8px; ` +
                   `width: 180px; ` +
                   `${isActive ? 
                       'background-color: rgba(53, 132, 228, 0.3); border: 2px solid #3584e4;' : 
                       'background-color: rgba(60, 60, 60, 0.5); border: 1px solid #444;'}`,
            reactive: true,
            track_hover: true
        });

        const box = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 12px;'
        });

        // Template icon/preview
        const preview = this._createZonePreview(template.zones, 160, 90);
        box.add_child(preview);

        // Template name
        const name = new St.Label({
            text: template.name,
            style: 'text-align: center; font-weight: bold; color: white;'
        });
        box.add_child(name);

        card.set_child(box);

        // Click to apply
        card.connect('clicked', () => {
            this._onTemplateClicked(template);
        });

        // Hover effects
        card.connect('enter-event', () => {
            if (!isActive) {
                card.style = `padding: 16px; border-radius: 8px; width: 180px; ` +
                            `background-color: rgba(74, 144, 217, 0.25); border: 1px solid #6aa0d9;`;
            }
        });

        card.connect('leave-event', () => {
            if (!isActive) {
                card.style = `padding: 16px; border-radius: 8px; width: 180px; ` +
                            `background-color: rgba(60, 60, 60, 0.5); border: 1px solid #444;`;
            }
        });

        return card;
    }

    /**
     * Create custom layouts section
     * @private
     */
    _createCustomLayoutsSection() {
        const section = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 16px;'
        });

        // Section header
        const headerRow = new St.BoxLayout({
            vertical: false
        });

        const header = new St.Label({
            text: 'Custom Layouts',
            style: 'font-size: 16pt; color: #ffffff; font-weight: bold;'
        });
        headerRow.add_child(header);

        section.add_child(headerRow);

        // Custom layout cards
        const customLayouts = this._getCustomLayouts();
        const currentLayout = this._getCurrentLayout();

        if (customLayouts.length === 0) {
            // Empty state
            const emptyState = new St.BoxLayout({
                vertical: true,
                style: 'spacing: 12px; padding: 32px; ' +
                       'background-color: rgba(60, 60, 60, 0.3); ' +
                       'border-radius: 8px; ' +
                       'border: 2px dashed #666;',
                x_align: Clutter.ActorAlign.CENTER
            });

            const icon = new St.Label({
                text: '📐',
                style: 'font-size: 48pt;'
            });
            emptyState.add_child(icon);

            const text = new St.Label({
                text: 'No custom layouts yet',
                style: 'font-size: 14pt; color: #aaaaaa;'
            });
            emptyState.add_child(text);

            const hint = new St.Label({
                text: 'Create or duplicate a layout to get started',
                style: 'font-size: 11pt; color: #888888;'
            });
            emptyState.add_child(hint);

            section.add_child(emptyState);
        } else {
            // Grid of custom layouts
            const grid = this._createCustomLayoutGrid(customLayouts, currentLayout);
            section.add_child(grid);
        }

        return section;
    }

    /**
     * Create grid of custom layout cards
     * @private
     */
    _createCustomLayoutGrid(layouts, currentLayout) {
        const COLUMNS = 4;
        const container = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 16px;'
        });

        let currentRow = null;
        layouts.forEach((layout, index) => {
            const col = index % COLUMNS;

            if (col === 0) {
                currentRow = new St.BoxLayout({
                    vertical: false,
                    style: 'spacing: 16px;'
                });
                container.add_child(currentRow);
            }

            const card = this._createCustomLayoutCard(layout, currentLayout);
            currentRow.add_child(card);
        });

        return container;
    }

    /**
     * Create a custom layout card with edit button
     * @private
     */
    _createCustomLayoutCard(layout, currentLayout) {
        const isActive = this._isLayoutActive(layout, currentLayout);

        const card = new St.Button({
            style_class: 'custom-layout-card',
            style: `padding: 16px; ` +
                   `border-radius: 8px; ` +
                   `width: 180px; ` +
                   `${isActive ? 
                       'background-color: rgba(53, 132, 228, 0.3); border: 2px solid #3584e4;' : 
                       'background-color: rgba(60, 60, 60, 0.5); border: 1px solid #444;'}`,
            reactive: true,
            track_hover: true
        });

        const box = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 12px;'
        });

        // Layout preview with edit button overlay
        const previewContainer = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            width: 160,
            height: 90
        });

        const preview = this._createZonePreview(layout.zones, 160, 90);
        previewContainer.add_child(preview);

        // Edit button overlay (top-right corner)
        const editButton = new St.Button({
            style_class: 'edit-button',
            style: 'padding: 6px; ' +
                   'background-color: rgba(53, 132, 228, 0.9); ' +
                   'border-radius: 50%; ' +
                   'width: 32px; height: 32px; ' +
                   'margin: 4px;',
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.START,
            reactive: true
        });

        const editIcon = new St.Label({
            text: '✏',
            style: 'color: white; font-size: 14pt;'
        });
        editButton.set_child(editIcon);

        editButton.connect('clicked', () => {
            this._onEditLayoutClicked(layout);
            return Clutter.EVENT_STOP;
        });

        previewContainer.add_child(editButton);
        box.add_child(previewContainer);

        // Layout name
        const name = new St.Label({
            text: layout.name,
            style: 'text-align: center; font-weight: bold; color: white;'
        });
        box.add_child(name);

        card.set_child(box);

        // Click to apply (but not if clicking edit button)
        card.connect('clicked', () => {
            this._onLayoutClicked(layout);
        });

        // Hover effects
        card.connect('enter-event', () => {
            if (!isActive) {
                card.style = `padding: 16px; border-radius: 8px; width: 180px; ` +
                            `background-color: rgba(74, 144, 217, 0.25); border: 1px solid #6aa0d9;`;
            }
        });

        card.connect('leave-event', () => {
            if (!isActive) {
                card.style = `padding: 16px; border-radius: 8px; width: 180px; ` +
                            `background-color: rgba(60, 60, 60, 0.5); border: 1px solid #444;`;
            }
        });

        return card;
    }

    /**
     * Create visual zone preview using Cairo
     * @private
     */
    _createZonePreview(zones, width, height) {
        const canvas = new St.DrawingArea({
            width: width,
            height: height,
            style: 'border: 1px solid #444; background-color: #1a1a1a;'
        });

        const accentColor = this._getAccentColor();

        canvas.connect('repaint', () => {
            try {
                const cr = canvas.get_context();
                const [w, h] = canvas.get_surface_size();

                zones.forEach((zone) => {
                    const x = zone.x * w;
                    const y = zone.y * h;
                    const zoneW = zone.w * w;
                    const zoneH = zone.h * h;

                    // Fill
                    cr.setSourceRGBA(
                        accentColor.red,
                        accentColor.green,
                        accentColor.blue,
                        0.3
                    );
                    cr.rectangle(x, y, zoneW, zoneH);
                    cr.fill();

                    // Border
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

    /**
     * Get GNOME system accent color
     * @private
     */
    _getAccentColor() {
        try {
            const interfaceSettings = new Gio.Settings({
                schema: 'org.gnome.desktop.interface'
            });

            const accentColorName = interfaceSettings.get_string('accent-color');

            const accentColors = {
                'blue': {red: 0.29, green: 0.56, blue: 0.85},
                'teal': {red: 0.18, green: 0.65, blue: 0.65},
                'green': {red: 0.20, green: 0.65, blue: 0.42},
                'yellow': {red: 0.96, green: 0.76, blue: 0.13},
                'orange': {red: 0.96, green: 0.47, blue: 0.00},
                'red': {red: 0.75, green: 0.22, blue: 0.17},
                'pink': {red: 0.87, green: 0.33, blue: 0.61},
                'purple': {red: 0.61, green: 0.29, blue: 0.85},
                'slate': {red: 0.44, green: 0.50, blue: 0.56}
            };

            return accentColors[accentColorName] || accentColors['blue'];
        } catch (e) {
            logger.warn('Failed to get accent color:', e);
            return {red: 0.29, green: 0.56, blue: 0.85};
        }
    }

    /**
     * Create "Create new layout" button
     * @private
     */
    _createNewLayoutButton() {
        const button = new St.Button({
            style_class: 'create-new-button',
            style: 'padding: 16px 32px; ' +
                   'background-color: #3584e4; ' +
                   'border-radius: 8px; ' +
                   'margin-top: 16px;',
            x_align: Clutter.ActorAlign.CENTER,
            reactive: true
        });

        const label = new St.Label({
            text: '✚ Create new layout',
            style: 'color: white; font-size: 13pt; font-weight: bold;'
        });
        button.set_child(label);

        button.connect('clicked', () => {
            this._onCreateNewLayoutClicked();
        });

        return button;
    }

    /**
     * Get the current layout for the active context
     * @private
     */
    _getCurrentLayout() {
        if (this._workspaceMode) {
            return this._getLayoutForWorkspace(this._currentWorkspace);
        } else {
            return this._layoutManager.getCurrentLayout();
        }
    }

    /**
     * Get layout for a specific workspace
     * @private
     */
    _getLayoutForWorkspace(workspaceIndex) {
        try {
            const mapString = this._settings.get_string('workspace-layout-map');
            const map = JSON.parse(mapString);
            const layoutId = map[workspaceIndex.toString()];
            
            if (layoutId) {
                const layouts = this._layoutManager.getAllLayouts();
                const layout = layouts.find(l => l.id === layoutId);
                if (layout) return layout;
            }
        } catch (e) {
            logger.warn('Error getting workspace layout:', e);
        }

        // Fallback to halves template
        return this._templateManager.createLayoutFromTemplate('halves');
    }

    /**
     * Get all custom (non-template) layouts
     * @private
     */
    _getCustomLayouts() {
        const allLayouts = this._layoutManager.getAllLayouts();
        const templateIds = this._templateManager.getBuiltinTemplates().map(t => t.id);
        
        // Filter out templates - custom layouts have IDs like "layout-*"
        return allLayouts.filter(layout => !templateIds.includes(layout.id));
    }

    /**
     * Check if a layout is currently active
     * @private
     */
    _isLayoutActive(layout, currentLayout) {
        if (!currentLayout) return false;
        
        // For templates, compare zones (templates might be applied as custom layouts)
        if (layout.zones && currentLayout.zones) {
            return JSON.stringify(layout.zones) === JSON.stringify(currentLayout.zones);
        }
        
        return layout.id === currentLayout.id;
    }

    /**
     * Handle template click - apply immediately
     * @private
     */
    _onTemplateClicked(template) {
        logger.info(`Template clicked: ${template.name}`);

        // Create a layout from template
        const layout = this._templateManager.createLayoutFromTemplate(template.id);

        // Apply the layout
        this._applyLayout(layout);

        // Show notification
        this._zoneOverlay.showMessage(`Applied: ${template.name}`);

        // Close dialog
        this.hide();
    }

    /**
     * Handle custom layout click - apply immediately
     * @private
     */
    _onLayoutClicked(layout) {
        logger.info(`Layout clicked: ${layout.name}`);

        this._applyLayout(layout);
        this._zoneOverlay.showMessage(`Switched to: ${layout.name}`);

        this.hide();
    }

    /**
     * Handle edit layout click - open zone editor
     * @private
     */
    _onEditLayoutClicked(layout) {
        logger.info(`Edit layout clicked: ${layout.name}`);

        const editor = new ZoneEditor(
            layout,
            this._layoutManager,
            (updatedLayout) => {
                // Save the updated layout
                this._layoutManager.saveLayout(updatedLayout);
                logger.info(`Layout updated: ${updatedLayout.name}`);
                
                // Reopen layout editor
                this.show();
            },
            () => {
                // Cancel callback - reopen layout editor
                this.show();
            }
        );

        // Hide layout editor while editing
        this.hide();

        // Show zone editor
        editor.show();
    }

    /**
     * Handle create new layout click
     * @private
     */
    _onCreateNewLayoutClicked() {
        logger.info('Create new layout clicked');

        // Start with halves template as base
        const baseLayout = this._templateManager.createLayoutFromTemplate('halves');
        baseLayout.name = 'New Layout';

        const editor = new ZoneEditor(
            baseLayout,
            this._layoutManager,
            (newLayout) => {
                // Save the new layout
                this._layoutManager.saveLayout(newLayout);
                logger.info(`New layout created: ${newLayout.name}`);
                
                // Apply it immediately
                this._applyLayout(newLayout);
                
                // Reopen layout editor
                this.show();
            },
            () => {
                // Cancel callback - reopen layout editor
                this.show();
            }
        );

        this.hide();
        editor.show();
    }

    /**
     * Apply a layout to the current context (workspace or global)
     * @private
     */
    _applyLayout(layout) {
        if (this._workspaceMode) {
            // Apply to current workspace only
            try {
                const mapString = this._settings.get_string('workspace-layout-map');
                const map = JSON.parse(mapString);
                map[this._currentWorkspace.toString()] = layout.id;
                this._settings.set_string('workspace-layout-map', JSON.stringify(map));
                
                // If we're on the current workspace, apply immediately
                const activeWorkspace = global.workspace_manager.get_active_workspace_index();
                if (activeWorkspace === this._currentWorkspace) {
                    this._layoutManager.setLayout(layout.id);
                }
                
                logger.info(`Applied layout ${layout.id} to workspace ${this._currentWorkspace}`);
            } catch (e) {
                logger.error('Error applying layout to workspace:', e);
            }
        } else {
            // Apply globally
            this._layoutManager.setLayout(layout.id);
            logger.info(`Applied layout ${layout.id} globally`);
        }
    }

    /**
     * Refresh the dialog content
     * @private
     */
    _refreshDialog() {
        // Close and reopen to refresh
        const wasWorkspace = this._currentWorkspace;
        this.hide();
        this._currentWorkspace = wasWorkspace;
        this.show();
    }

    /**
     * Connect keyboard event handlers
     * @private
     */
    _connectKeyEvents() {
        this._keyPressId = global.stage.connect('key-press-event', (actor, event) => {
            const symbol = event.get_key_symbol();

            switch (symbol) {
                case Clutter.KEY_Escape:
                    this.hide();
                    return Clutter.EVENT_STOP;
            }

            return Clutter.EVENT_PROPAGATE;
        });
    }

    /**
     * Disconnect keyboard event handlers
     * @private
     */
    _disconnectKeyEvents() {
        if (this._keyPressId) {
            global.stage.disconnect(this._keyPressId);
            this._keyPressId = null;
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.hide();
    }
}
