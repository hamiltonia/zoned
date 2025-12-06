/**
 * LayoutSwitcher - Comprehensive layout management UI
 * 
 * Mimics FancyZones UI with:
 * - Monitor/Workspace selector at top
 * - Templates section (built-in, read-only, click to apply)
 * - Custom layouts section (user-created, editable)
 * - "Create new layout" button at bottom
 * 
 * Primary layout selection and management interface for Zoned.
 * 
 * REFACTORED: UI construction delegated to modular components:
 * - cardFactory.js - Card creation (template, custom, previews)
 * - sectionFactory.js - Section containers and grids
 * - topBar.js - Monitor/workspace selectors
 * - resizeHandler.js - Dialog resize operations
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { createLogger } from '../utils/debug.js';
import { TemplateManager } from '../templateManager.js';
import { LayoutSettingsDialog } from './layoutSettingsDialog.js';
import { ThemeManager } from '../utils/theme.js';

// Import split modules (UI construction delegated to these)
import { createTemplatesSection, createCustomLayoutsSection, createNewLayoutButton } from './layoutSwitcher/sectionFactory.js';
import { createTopBar } from './layoutSwitcher/topBar.js';
import { addResizeHandles, rebuildWithNewSize } from './layoutSwitcher/resizeHandler.js';

const logger = createLogger('LayoutSwitcher');

export class LayoutSwitcher {
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
        this._themeManager = new ThemeManager(settings);
        
        this._dialog = null;
        this._currentWorkspace = 0;
        this._workspaceMode = false;
        this._workspaceButtons = [];
        
        // Keyboard navigation state
        this._allCards = [];
        this._selectedCardIndex = -1;
        
        // Card bottom bar configuration
        this._CARD_BOTTOM_BAR_DEFAULT_OPACITY = 255 * .25;
        this._CARD_BOTTOM_BAR_MIN_HEIGHT = 36;
        this._CARD_BOTTOM_BAR_RATIO = 0.20;
        
        // Debug mode configuration
        this._debugMode = this._settings.get_boolean('debug-layout-rects');
        this._DEBUG_COLORS = {
            container: 'rgba(255, 0, 0, 0.8)',
            section: 'rgba(0, 0, 255, 0.8)',
            row: 'rgba(0, 255, 0, 0.8)',
            card: 'rgba(255, 255, 0, 0.8)',
            spacer: 'rgba(255, 0, 255, 0.8)'
        };
        
        // Minimum dialog dimensions (80% of 1024x768)
        this._MIN_DIALOG_WIDTH = Math.floor(1024 * 0.8);
        this._MIN_DIALOG_HEIGHT = Math.floor(768 * 0.8);
        this._DIALOG_ASPECT_RATIO = 16 / 9;
        
        // Resize state
        this._isResizing = false;
        this._resizeStartX = 0;
        this._resizeStartY = 0;
        this._resizeStartWidth = 0;
        this._resizeStartHeight = 0;
        this._resizeCorner = null;
        this._currentDialogWidth = null;
        this._currentDialogHeight = null;
    }

    /**
     * Add debug border to an element if debug mode is enabled
     * @param {St.Widget} actor - The widget to add debug border to
     * @param {string} type - Type of element
     * @param {string} [label] - Optional label to display
     */
    _addDebugRect(actor, type, label = '') {
        if (!this._debugMode) return;
        
        const color = this._DEBUG_COLORS[type] || 'rgba(128, 128, 128, 0.8)';
        const borderWidth = type === 'card' ? 1 : 2;
        
        const existingStyle = actor.style || '';
        actor.style = existingStyle + ` border: ${borderWidth}px solid ${color} !important;`;
        
        if (label) {
            logger.debug(`[DEBUG RECT] ${type}: ${label}`);
        }
    }

    /**
     * Toggle debug mode and refresh dialog
     */
    _toggleDebugMode() {
        this._debugMode = !this._debugMode;
        this._settings.set_boolean('debug-layout-rects', this._debugMode);
        logger.info(`Debug mode: ${this._debugMode ? 'ON' : 'OFF'}`);
        
        if (this._dialog) {
            this._refreshDialog();
        }
    }

    /**
     * Show the layout editor dialog
     */
    show() {
        if (this._dialog) {
            this.hide();
            return;
        }

        this._allCards = [];
        this._selectedCardIndex = -1;

        this._currentWorkspace = global.workspace_manager.get_active_workspace_index();
        this._workspaceMode = this._settings.get_boolean('use-per-workspace-layouts');

        logger.info(`Layout editor shown (workspace mode: ${this._workspaceMode})`);

        this._createDialog();
        this._connectKeyEvents();

        this._overrideDialogWidth = null;
        this._overrideDialogHeight = null;
    }

    /**
     * Hide the layout editor dialog
     */
    hide() {
        if (!this._dialog) return;

        const dialog = this._dialog;
        this._dialog = null;
        this._workspaceButtons = [];
        this._allCards = [];
        this._selectedCardIndex = -1;

        this._disconnectKeyEvents();

        Main.uiGroup.remove_child(dialog);
        dialog.destroy();

        logger.debug('Layout editor hidden');
    }

    /**
     * Calculate card dimensions dynamically based on available space
     */
    _calculateCardDimensions(monitor) {
        const COLUMNS = 5;
        const TEMPLATE_ROWS = 1;
        const CUSTOM_ROWS = 2;
        const TOTAL_ROWS = TEMPLATE_ROWS + CUSTOM_ROWS;
        
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        const scaleFactor = themeContext.scale_factor;
        
        const logicalWidth = monitor.width / scaleFactor;
        const logicalHeight = monitor.height / scaleFactor;
        
        logger.info(`[SCALE] Monitor: ${logicalWidth}×${logicalHeight} logical, Scale: ${scaleFactor}x`);
        
        const DIALOG_WIDTH_RATIO = 0.85;
        const DIALOG_HEIGHT_RATIO = 0.90;
        
        let dialogWidth = Math.floor(logicalWidth * DIALOG_WIDTH_RATIO);
        let dialogHeight = Math.floor(logicalHeight * DIALOG_HEIGHT_RATIO);
        
        if (this._overrideDialogWidth) {
            dialogWidth = this._overrideDialogWidth;
            dialogHeight = this._overrideDialogHeight;
        }

        const TOP_BAR_HEIGHT = Math.max(50, Math.floor(dialogHeight * 0.06));
        const SECTION_HEADER_HEIGHT = Math.max(30, Math.floor(dialogHeight * 0.04));
        const CREATE_BUTTON_HEIGHT = Math.max(50, Math.floor(dialogHeight * 0.06));
        
        const CONTAINER_PADDING = Math.floor(dialogWidth * 0.015);
        const SECTION_PADDING = Math.floor(dialogWidth * 0.012);
        const SECTION_GAP = Math.floor(dialogHeight * 0.025);
        const ROW_GAP = Math.floor(dialogHeight * 0.015);
        const CARD_GAP = Math.floor(dialogWidth * 0.012);
        const SCROLLBAR_RESERVE = Math.floor(dialogWidth * 0.02);
        
        const fixedHeight = TOP_BAR_HEIGHT + 
                           (2 * SECTION_HEADER_HEIGHT) +
                           SECTION_GAP +
                           CREATE_BUTTON_HEIGHT +
                           (2 * CONTAINER_PADDING);
        
        const availableHeightForCards = dialogHeight - fixedHeight;
        const rowGapTotal = (TOTAL_ROWS - 1) * ROW_GAP;
        const heightPerRow = Math.floor((availableHeightForCards - rowGapTotal) / TOTAL_ROWS);
        
        const horizontalPadding = (2 * CONTAINER_PADDING) + (2 * SECTION_PADDING) + SCROLLBAR_RESERVE;
        const availableWidthForCards = dialogWidth - horizontalPadding;
        const cardGapTotal = (COLUMNS - 1) * CARD_GAP;
        const widthPerCard = Math.floor((availableWidthForCards - cardGapTotal) / COLUMNS);
        
        const cardHeightFromRows = heightPerRow;
        const cardWidthFromHeight = Math.floor(cardHeightFromRows * (16 / 9));
        
        const cardWidth = Math.min(widthPerCard, cardWidthFromHeight);
        const cardHeight = Math.floor(cardWidth * (9 / 16));
        
        logger.info(`[CALC] Available: ${availableWidthForCards}×${availableHeightForCards}`);
        logger.info(`[FINAL] Card: ${cardWidth}×${cardHeight}, Gaps: ${CARD_GAP}h/${ROW_GAP}v`);
        
        this._calculatedSpacing = {
            containerPadding: CONTAINER_PADDING,
            sectionPadding: SECTION_PADDING,
            sectionGap: SECTION_GAP,
            cardGap: CARD_GAP,
            rowGap: ROW_GAP,
            scrollbarReserve: SCROLLBAR_RESERVE,
            topBarHeight: TOP_BAR_HEIGHT,
            sectionHeaderHeight: SECTION_HEADER_HEIGHT,
            createButtonHeight: CREATE_BUTTON_HEIGHT,
            dialogWidth: dialogWidth,
            dialogHeight: dialogHeight
        };
        
        return {
            cardWidth: cardWidth,
            cardHeight: cardHeight,
            previewWidth: cardWidth,
            previewHeight: cardHeight,
            customColumns: COLUMNS
        };
    }

    /**
     * Create the main dialog UI
     */
    _createDialog() {
        const colors = this._themeManager.getColors();
        const monitor = Main.layoutManager.currentMonitor;

        // Calculate adaptive dimensions
        const dims = this._calculateCardDimensions(monitor);
        this._cardWidth = dims.cardWidth;
        this._cardHeight = dims.cardHeight;
        this._previewWidth = dims.previewWidth;
        this._previewHeight = dims.previewHeight;
        this._customColumns = dims.customColumns;
        
        // Apply calculated spacing
        const spacing = this._calculatedSpacing;
        
        this._CONTAINER_PADDING_LEFT = spacing.containerPadding;
        this._CONTAINER_PADDING_RIGHT = spacing.containerPadding;
        this._CONTAINER_PADDING_TOP = spacing.containerPadding;
        this._CONTAINER_PADDING_BOTTOM = spacing.containerPadding;
        
        this._CONTENTBOX_MARGIN_LEFT = 0;
        this._CONTENTBOX_MARGIN_RIGHT = 0;
        this._SCROLLVIEW_PADDING_RIGHT = 0;
        
        this._GRID_ROW_PADDING_LEFT = 0;
        this._GRID_ROW_PADDING_RIGHT = 0;
        this._GRID_ROW_PADDING_TOP = 2;
        this._GRID_ROW_PADDING_BOTTOM = 2;
        
        this._CARD_GAP = spacing.cardGap;
        this._ROW_GAP = spacing.rowGap;
        
        this._SECTION_GAP = spacing.sectionGap;
        this._SECTION_PADDING = spacing.sectionPadding;
        this._SECTION_BORDER_RADIUS = Math.floor(spacing.containerPadding * 0.8);
        
        this._SCROLLBAR_RESERVE = spacing.scrollbarReserve;
        
        this._SECTION_TITLE_SIZE = `${Math.max(12, Math.floor(this._cardHeight * 0.12))}px`;
        this._CARD_LABEL_SIZE = `${Math.max(10, Math.floor(this._cardHeight * 0.09))}px`;
        
        const dialogWidth = spacing.dialogWidth;
        const dialogHeight = spacing.dialogHeight;
        
        this._CONTAINER_BORDER_RADIUS = Math.floor(spacing.containerPadding * 0.8);
        
        logger.info(`Card dimensions: ${this._cardWidth}×${this._cardHeight}, Dialog: ${dialogWidth}×${dialogHeight}`);

        // Background overlay
        this._dialog = new St.Bin({
            style_class: 'modal-dialog',
            reactive: true,
            can_focus: true,
            style: `background-color: ${colors.modalOverlay};`,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });

        this._dialog.connect('button-press-event', (actor, event) => {
            if (event.get_source() === this._dialog) {
                this.hide();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Main container
        const container = new St.BoxLayout({
            vertical: true,
            style: `background-color: ${colors.containerBg}; ` +
                   `border-radius: ${this._CONTAINER_BORDER_RADIUS}px; ` +
                   `padding-left: ${this._CONTAINER_PADDING_LEFT}px; ` +
                   `padding-right: ${this._CONTAINER_PADDING_RIGHT}px; ` +
                   `padding-top: ${this._CONTAINER_PADDING_TOP}px; ` +
                   `padding-bottom: ${this._CONTAINER_PADDING_BOTTOM}px; ` +
                   `width: ${dialogWidth}px; ` +
                   `height: ${dialogHeight}px;`
        });

        container.connect('button-press-event', () => Clutter.EVENT_STOP);

        // Create sections using modules
        const topBar = createTopBar(this);
        this._addDebugRect(topBar, 'section', 'Top Bar');
        container.add_child(topBar);

        const templatesSection = createTemplatesSection(this);
        templatesSection.style += ` margin-top: ${this._SECTION_GAP}px;`;
        this._addDebugRect(templatesSection, 'section', 'Templates Section');
        container.add_child(templatesSection);

        const customSection = createCustomLayoutsSection(this);
        customSection.style += ` margin-top: ${this._SECTION_GAP}px;`;
        this._addDebugRect(customSection, 'section', 'Custom Layouts Section');
        container.add_child(customSection);

        const createButton = createNewLayoutButton(this);
        this._addDebugRect(createButton, 'section', 'Create Button');
        container.add_child(createButton);

        this._addDebugRect(container, 'container', 'Main Dialog Container');

        this._container = container;
        this._currentDialogWidth = dialogWidth;
        this._currentDialogHeight = dialogHeight;

        // Wrapper with resize handles
        const wrapper = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        
        wrapper.add_child(container);
        addResizeHandles(this, wrapper, container);

        this._dialog.set_child(wrapper);

        Main.uiGroup.add_child(this._dialog);
        this._dialog.set_position(monitor.x, monitor.y);
        this._dialog.set_size(monitor.width, monitor.height);

        this._dialog.grab_key_focus();
    }

    /**
     * Rebuild the dialog with new dimensions
     */
    _rebuildWithNewSize(newWidth, newHeight) {
        rebuildWithNewSize(this, newWidth, newHeight);
    }

    /**
     * Get the current layout for the active context
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

        return this._templateManager.createLayoutFromTemplate('halves');
    }

    /**
     * Get all custom (user-created) layouts
     */
    _getCustomLayouts() {
        const allLayouts = this._layoutManager.getAllLayouts();
        return allLayouts.filter(layout => layout.id && layout.id.startsWith('layout-'));
    }

    /**
     * Check if a layout is currently active
     */
    _isLayoutActive(layout, currentLayout) {
        if (!currentLayout || !layout) return false;
        return layout.id === currentLayout.id;
    }

    /**
     * Handle template click - apply immediately
     */
    _onTemplateClicked(template) {
        logger.info(`Template clicked: ${template.name}`);

        const layout = this._templateManager.createLayoutFromTemplate(template.id);
        
        this._applyLayout(layout);
        this._zoneOverlay.showMessage(`Switched to: ${template.name}`);

        this.hide();
    }

    /**
     * Handle custom layout click - apply immediately
     */
    _onLayoutClicked(layout) {
        logger.info(`Layout clicked: ${layout.name}`);

        this._applyLayout(layout);
        this._zoneOverlay.showMessage(`Switched to: ${layout.name}`);

        this.hide();
    }

    /**
     * Handle edit layout click - open settings dialog
     */
    _onEditLayoutClicked(layout) {
        logger.info(`Edit layout clicked: ${layout.name}`);

        this.hide();

        const settingsDialog = new LayoutSettingsDialog(
            layout,
            this._layoutManager,
            this._settings,
            (updatedLayout) => {
                logger.info(`Settings dialog completed for: ${layout.name}`);
                this.show();
            },
            () => {
                logger.info('Settings dialog canceled');
                this.show();
            }
        );
        settingsDialog.open();
    }

    /**
     * Handle edit template click - create duplicate and open editor
     */
    _onEditTemplateClicked(template) {
        logger.info(`Edit template clicked: ${template.name} - creating duplicate`);

        const newLayout = {
            id: `layout-${Date.now()}`,
            name: `${template.name} - Copy`,
            zones: JSON.parse(JSON.stringify(template.zones))
        };

        this._layoutManager.saveLayout(newLayout);

        this.hide();

        logger.info(`Created duplicate layout: ${newLayout.name}`);
        this._zoneOverlay.showMessage(`Created: ${newLayout.name}`);

        const settingsDialog = new LayoutSettingsDialog(
            newLayout,
            this._layoutManager,
            this._settings,
            (updatedLayout) => {
                logger.info(`Duplicate layout saved: ${updatedLayout ? updatedLayout.name : 'deleted'}`);
                this.show();
            },
            () => {
                logger.info('Duplicate layout editing canceled');
                this.show();
            }
        );
        settingsDialog.open();
    }

    /**
     * Handle delete layout click - show confirmation
     */
    _onDeleteClicked(layout) {
        logger.info(`Delete clicked for layout: ${layout.name}`);
        
        // TODO: Implement confirmation dialog and actual deletion
        logger.warn('Delete not yet implemented - this is a prototype');
        this._zoneOverlay.showMessage(`Delete feature coming soon`);
    }

    /**
     * Apply a layout to the current context (workspace or global)
     */
    _applyLayout(layout) {
        if (this._workspaceMode) {
            try {
                const mapString = this._settings.get_string('workspace-layout-map');
                const map = JSON.parse(mapString);
                map[this._currentWorkspace.toString()] = layout.id;
                this._settings.set_string('workspace-layout-map', JSON.stringify(map));
                
                const activeWorkspace = global.workspace_manager.get_active_workspace_index();
                if (activeWorkspace === this._currentWorkspace) {
                    this._layoutManager.setLayout(layout.id);
                }
                
                logger.info(`Applied layout ${layout.id} to workspace ${this._currentWorkspace}`);
            } catch (e) {
                logger.error('Error applying layout to workspace:', e);
            }
        } else {
            this._layoutManager.setLayout(layout.id);
            logger.info(`Applied layout ${layout.id} globally`);
        }
    }

    /**
     * Refresh the dialog content
     */
    _refreshDialog() {
        const wasWorkspace = this._currentWorkspace;
        const wasSelectedIndex = this._selectedCardIndex;
        
        this.hide();
        
        this._currentWorkspace = wasWorkspace;
        this.show();
        
        if (wasSelectedIndex >= 0 && wasSelectedIndex < this._allCards.length) {
            this._selectedCardIndex = wasSelectedIndex;
            this._updateCardFocus();
        }
    }

    /**
     * Connect keyboard event handlers
     */
    _connectKeyEvents() {
        this._keyPressId = global.stage.connect('key-press-event', (actor, event) => {
            const symbol = event.get_key_symbol();
            const modifiers = event.get_state();
            const ctrlPressed = (modifiers & Clutter.ModifierType.CONTROL_MASK) !== 0;

            if (ctrlPressed && (symbol === Clutter.KEY_d || symbol === Clutter.KEY_D)) {
                this._toggleDebugMode();
                return Clutter.EVENT_STOP;
            }

            switch (symbol) {
                case Clutter.KEY_Escape:
                    this.hide();
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Return:
                case Clutter.KEY_KP_Enter:
                    if (this._selectedCardIndex >= 0 && this._selectedCardIndex < this._allCards.length) {
                        this._applyCardAtIndex(this._selectedCardIndex);
                    } else if (this._allCards.length > 0) {
                        this._applyCardAtIndex(0);
                    }
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Left:
                    this._navigateCards(-1);
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Right:
                    this._navigateCards(1);
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Up:
                    this._navigateCards(-4);
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Down:
                    this._navigateCards(4);
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_1:
                case Clutter.KEY_2:
                case Clutter.KEY_3:
                case Clutter.KEY_4:
                case Clutter.KEY_5:
                case Clutter.KEY_6:
                case Clutter.KEY_7:
                case Clutter.KEY_8:
                case Clutter.KEY_9:
                    const number = symbol - Clutter.KEY_0;
                    const index = number - 1;
                    if (index >= 0 && index < this._allCards.length) {
                        this._applyCardAtIndex(index);
                    }
                    return Clutter.EVENT_STOP;
            }

            return Clutter.EVENT_PROPAGATE;
        });
    }

    /**
     * Navigate between cards using keyboard
     */
    _navigateCards(delta) {
        if (this._allCards.length === 0) return;

        if (this._selectedCardIndex < 0) {
            this._selectedCardIndex = 0;
        } else {
            let newIndex = this._selectedCardIndex + delta;
            
            if (newIndex < 0) {
                newIndex = this._allCards.length - 1;
            } else if (newIndex >= this._allCards.length) {
                newIndex = 0;
            }
            
            this._selectedCardIndex = newIndex;
        }

        this._updateCardFocus();
    }

    /**
     * Update visual focus indicator on cards
     */
    _updateCardFocus() {
        const colors = this._themeManager.getColors();
        const accentHex = colors.accentHex;
        const accentRGBAActive = colors.accentRGBA(0.3);
        const accentRGBAFocus = colors.accentRGBA(0.4);

        this._allCards.forEach((cardObj, index) => {
            const isFocused = index === this._selectedCardIndex;
            const currentLayout = this._getCurrentLayout();
            const isActive = this._isLayoutActive(cardObj.layout, currentLayout);

            if (isFocused) {
                cardObj.card.style = `padding: 0; border-radius: 8px; ` +
                                    `width: ${this._cardWidth}px; height: ${this._cardHeight}px; ` +
                                    `background-color: ${accentRGBAFocus}; ` +
                                    `border: 2px solid ${accentHex}; ` +
                                    `box-shadow: 0 0 0 3px ${accentHex}, 0 4px 12px rgba(0, 0, 0, 0.3);`;
            } else if (isActive) {
                cardObj.card.style = `padding: 0; border-radius: 8px; ` +
                                    `width: ${this._cardWidth}px; height: ${this._cardHeight}px; ` +
                                    `background-color: ${accentRGBAActive}; ` +
                                    `border: 2px solid ${accentHex};`;
            } else {
                cardObj.card.style = `padding: 0; border-radius: 8px; ` +
                                    `width: ${this._cardWidth}px; height: ${this._cardHeight}px; ` +
                                    `background-color: ${colors.cardBg}; ` +
                                    `border: 2px solid transparent;`;
            }
        });
    }

    /**
     * Apply layout at given card index
     */
    _applyCardAtIndex(index) {
        if (index < 0 || index >= this._allCards.length) return;

        const cardObj = this._allCards[index];
        
        if (cardObj.isTemplate) {
            this._onTemplateClicked(cardObj.layout);
        } else {
            this._onLayoutClicked(cardObj.layout);
        }
    }

    /**
     * Disconnect keyboard event handlers
     */
    _disconnectKeyEvents() {
        if (this._keyPressId) {
            global.stage.disconnect(this._keyPressId);
            this._keyPressId = null;
        }
    }

    /**
     * Handle create new layout click
     */
    _onCreateNewLayoutClicked() {
        logger.info("Create new layout clicked");

        this.hide();

        const settingsDialog = new LayoutSettingsDialog(
            null,
            this._layoutManager,
            this._settings,
            (newLayout) => {
                if (newLayout) {
                    logger.info(`New layout created: ${newLayout.name}`);
                    this._applyLayout(newLayout);
                }
                this.show();
            },
            () => {
                logger.info("Create new layout canceled");
                this.show();
            }
        );

        settingsDialog.open();
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.hide();
    }
}
