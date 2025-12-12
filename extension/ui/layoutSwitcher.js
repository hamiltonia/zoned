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
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { createLogger } from '../utils/debug.js';
import { TemplateManager } from '../templateManager.js';
import { LayoutSettingsDialog } from './layoutSettingsDialog.js';
import { ThemeManager } from '../utils/theme.js';
import { LayoutPreviewBackground } from './layoutPreviewBackground.js';

// Import split modules (UI construction delegated to these)
import { createTemplatesSection, createCustomLayoutsSection, createNewLayoutButton } from './layoutSwitcher/sectionFactory.js';
import { createTopBar, closeMonitorDropdown } from './layoutSwitcher/topBar.js';
import { addResizeHandles, rebuildWithNewSize } from './layoutSwitcher/resizeHandler.js';
import { selectTier, calculateDialogDimensions, validateDimensions, generateDebugText, TIER_NAMES } from './layoutSwitcher/tierConfig.js';

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
        // Note: Dialog aspect ratio is now content-driven, not fixed
        
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
     * Add debug outline to an element if debug mode is enabled
     * Uses CSS outline instead of border to avoid affecting layout
     * @param {St.Widget} actor - The widget to add debug outline to
     * @param {string} type - Type of element
     * @param {string} [label] - Optional label to display
     */
    _addDebugRect(actor, type, label = '') {
        if (!this._debugMode) return;
        
        const color = this._DEBUG_COLORS[type] || 'rgba(128, 128, 128, 0.8)';
        const outlineWidth = type === 'card' ? 1 : 2;
        
        const existingStyle = actor.style || '';
        // Use outline instead of border - outline doesn't affect layout/box model
        actor.style = existingStyle + ` outline: ${outlineWidth}px solid ${color} !important;`;
        
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
        this._hoveredLayout = null;  // Track currently hovered layout for preview

        this._currentWorkspace = global.workspace_manager.get_active_workspace_index();
        this._workspaceMode = this._settings.get_boolean('use-per-workspace-layouts');
        
        // Only set monitor selection on INITIAL open, not on refresh
        // Check if _selectedMonitorIndex is undefined OR invalid
        const monitors = Main.layoutManager.monitors;
        if (this._selectedMonitorIndex === undefined || 
            this._selectedMonitorIndex === null ||
            this._selectedMonitorIndex >= monitors.length) {
            // Initial open: start on whichever monitor the user invoked the dialog
            this._selectedMonitorIndex = Main.layoutManager.currentMonitor.index;
        }
        // Otherwise keep the existing selection (for when refreshing after monitor change)

        logger.info(`Layout editor shown (workspace mode: ${this._workspaceMode}, monitor: ${this._selectedMonitorIndex})`);

        // Create preview background BEFORE the dialog (so it's behind)
        const currentLayout = this._getCurrentLayout();
        this._previewBackground = new LayoutPreviewBackground(this._settings, () => {
            // Background click callback - dismiss the dialog
            this.hide();
        });
        // Set layout manager reference for per-space layout lookups
        this._previewBackground.setLayoutManager(this._layoutManager);
        // Show preview on the current monitor (where dialog was invoked)
        this._previewBackground.show(currentLayout, this._selectedMonitorIndex);

        this._createDialog();
        this._connectKeyEvents();

        this._overrideDialogWidth = null;
        this._overrideDialogHeight = null;
    }

    /**
     * Hide the layout editor dialog
     */
    hide() {
        if (!this._dialog) {
            return;
        }

        const dialog = this._dialog;
        
        // Disconnect key events BEFORE clearing this._dialog reference
        this._disconnectKeyEvents();
        
        this._dialog = null;
        this._workspaceButtons = [];
        this._allCards = [];
        this._selectedCardIndex = -1;
        this._hoveredLayout = null;
        this._selectedMonitorIndex = undefined;  // Reset so next show() detects current monitor

        // Release modal grab FIRST before any other cleanup
        if (this._modalGrabbed) {
            try {
                Main.popModal(this._modalGrabbed);
            } catch (e) {
                logger.error(`Error releasing modal: ${e.message}`);
            }
            this._modalGrabbed = null;
        }

        // Clean up monitor dropdown menu if open (uses imported function)
        closeMonitorDropdown(this);

        // Clean up debug overlay (added to uiGroup separately)
        if (this._debugOverlay) {
            Main.uiGroup.remove_child(this._debugOverlay);
            this._debugOverlay.destroy();
            this._debugOverlay = null;
        }

        // Clean up preview background
        if (this._previewBackground) {
            this._previewBackground.destroy();
            this._previewBackground = null;
        }

        Main.uiGroup.remove_child(dialog);
        dialog.destroy();
    }

    /**
     * Calculate card dimensions using tier-based sizing
     * 
     * Algorithm: Tier-based approach
     * 1. Select tier based on logical screen height (or forced tier for debugging)
     * 2. Use fixed values from tier configuration
     * 3. Calculate dialog dimensions from tier values
     * 
     * This guarantees:
     * - 5 columns for templates and custom layouts
     * - 2 full custom layout rows visible without cutoff
     * - Equal left/right margins
     * - 16:9 cards (the aesthetic that matters)
     * - Predictable, testable layouts per resolution tier
     */
    _calculateCardDimensions(monitor) {
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        const scaleFactor = themeContext.scale_factor;
        
        const logicalWidth = monitor.width / scaleFactor;
        const logicalHeight = monitor.height / scaleFactor;
        
        // Store for debug overlay
        this._logicalScreenWidth = logicalWidth;
        this._logicalScreenHeight = logicalHeight;
        this._scaleFactor = scaleFactor;
        
        logger.info(`[SCALE] Monitor: ${logicalWidth}×${logicalHeight} logical, Scale: ${scaleFactor}x`);
        
        // Get forced tier from settings (0 = auto)
        const forceTier = this._settings.get_int('option-force-tier');
        
        // Select tier based on logical screen height
        const tier = selectTier(logicalHeight, forceTier);
        this._currentTier = tier;
        
        // Calculate dialog dimensions from tier
        const dims = calculateDialogDimensions(tier);
        
        // Validate against screen bounds
        const validation = validateDimensions(dims, logicalWidth, logicalHeight);
        this._lastValidation = validation;
        
        if (!validation.valid) {
            logger.warn(`[TIER] Validation issues: ${validation.issues.join(', ')}`);
        }
        
        // Store calculated spacing for use by other components
        // Map tier values to the expected _calculatedSpacing format
        this._calculatedSpacing = {
            containerPadding: dims.containerPadding,
            sectionPadding: dims.sectionPadding,
            sectionGap: dims.sectionGap,
            cardGap: dims.cardGap,
            rowGap: dims.rowGap,
            scrollbarReserve: 0,  // Scrollbar overlays content
            topBarHeight: dims.topBarHeight,
            sectionHeaderHeight: dims.sectionHeaderHeight,
            sectionHeaderMargin: dims.sectionHeaderMargin,
            createButtonHeight: dims.buttonHeight,
            createButtonMargin: dims.buttonMargin,
            internalMargin: dims.internalMargin,
            dialogWidth: dims.dialogWidth,
            dialogHeight: dims.dialogHeight,
            // Store full dims for debug overlay
            _dims: dims
        };
        
        logger.info(`[TIER] ${tier.name}: Card ${dims.cardWidth}×${dims.cardHeight}, Dialog ${dims.dialogWidth}×${dims.dialogHeight}`);
        
        return {
            cardWidth: dims.cardWidth,
            cardHeight: dims.cardHeight,
            previewWidth: dims.cardWidth,
            previewHeight: dims.cardHeight,
            customColumns: 5
        };
    }

    /**
     * Cycle to next tier (for debugging)
     * Ctrl+T cycles through: auto → TINY → SMALL → MEDIUM → LARGE → XLARGE → auto
     */
    _cycleTier() {
        const currentForce = this._settings.get_int('option-force-tier');
        const nextForce = (currentForce + 1) % 6;  // 0-5 then wrap to 0
        
        this._settings.set_int('option-force-tier', nextForce);
        
        const tierName = TIER_NAMES[nextForce];
        logger.info(`[TIER] Cycling to: ${tierName}`);
        
        // Refresh dialog with new tier
        this._refreshDialog();
    }

    /**
     * Toggle debug overlay visibility
     */
    _toggleDebugOverlay() {
        const current = this._settings.get_boolean('debug-layout-overlay');
        this._settings.set_boolean('debug-layout-overlay', !current);
        logger.info(`Debug overlay: ${!current ? 'ON' : 'OFF'}`);
        
        if (this._dialog) {
            this._refreshDialog();
        }
    }

    /**
     * Create debug overlay showing tier info and measurements
     * @returns {St.BoxLayout} The debug overlay widget
     */
    _createDebugOverlay() {
        const dims = this._calculatedSpacing._dims;
        const validation = this._lastValidation;
        const forceTier = this._settings.get_int('option-force-tier');
        const tierMode = forceTier === 0 ? 'auto' : 'forced';
        
        // Generate debug text
        const debugText = generateDebugText(
            dims, 
            validation, 
            this._logicalScreenWidth, 
            this._logicalScreenHeight, 
            this._scaleFactor
        );
        
        const overlay = new St.BoxLayout({
            vertical: true,
            style: `
                background-color: rgba(0, 0, 0, 0.85);
                padding: 12px 16px;
                border-radius: 6px;
                margin: 8px;
                border: 1px solid rgba(0, 255, 0, 0.5);
            `,
            x_align: Clutter.ActorAlign.START
        });
        
        // Header
        const header = new St.Label({
            text: `🔧 DEBUG OVERLAY (${tierMode})`,
            style: 'color: #0f0; font-size: 11px; font-weight: bold; font-family: monospace; margin-bottom: 8px;'
        });
        overlay.add_child(header);
        
        // Info lines
        const lines = debugText.split('\n');
        lines.forEach(line => {
            let color = '#0f0';
            if (line.includes('✗')) color = '#f00';
            if (line.includes('TIER:')) color = '#0ff';
            
            const label = new St.Label({
                text: line,
                style: `color: ${color}; font-size: 10px; font-family: monospace; line-height: 1.4;`
            });
            overlay.add_child(label);
        });
        
        // Keyboard shortcuts hint
        const shortcuts = new St.Label({
            text: 'Ctrl+D=rects | Ctrl+T=tier | Ctrl+O=overlay',
            style: 'color: #888; font-size: 9px; font-family: monospace; margin-top: 8px;'
        });
        overlay.add_child(shortcuts);
        
        return overlay;
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
        this._cardRadius = this._currentTier.cardRadius;
        
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

        // Background overlay - transparent since we have the preview background behind
        // Use St.Widget with FixedLayout so dropdown menus can be positioned absolutely
        this._dialog = new St.Widget({
            style_class: 'modal-dialog',
            reactive: true,
            can_focus: true,
            layout_manager: new Clutter.FixedLayout(),
            style: `background-color: transparent;`
        });

        // Click on background (outside container) dismisses the dialog
        // Use coordinate check since event.get_source() isn't reliable with modal
        this._dialog.connect('button-press-event', (actor, event) => {
            const [clickX, clickY] = event.get_coords();
            const containerAlloc = this._container ? this._container.get_transformed_extents() : null;
            
            if (containerAlloc) {
                // Check if click is outside the container bounds
                const isOutsideContainer = clickX < containerAlloc.origin.x ||
                                  clickX > containerAlloc.origin.x + containerAlloc.size.width ||
                                  clickY < containerAlloc.origin.y ||
                                  clickY > containerAlloc.origin.y + containerAlloc.size.height;
                
                // Also check if click is inside the monitor dropdown menu (which floats outside container)
                let isInsideMenu = false;
                if (this._monitorMenu) {
                    const menuAlloc = this._monitorMenu.get_transformed_extents();
                    if (menuAlloc) {
                        isInsideMenu = clickX >= menuAlloc.origin.x &&
                                       clickX <= menuAlloc.origin.x + menuAlloc.size.width &&
                                       clickY >= menuAlloc.origin.y &&
                                       clickY <= menuAlloc.origin.y + menuAlloc.size.height;
                    }
                }
                
                // Only dismiss if outside container AND not clicking on the menu
                if (isOutsideContainer && !isInsideMenu) {
                    this.hide();
                    return Clutter.EVENT_STOP;
                }
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Main container - no left/right padding, sections extend to edges
        // Sections use their own internal padding for card margins
        const container = new St.BoxLayout({
            vertical: true,
            style: `background-color: ${colors.containerBg}; ` +
                   `border-radius: ${this._CONTAINER_BORDER_RADIUS}px; ` +
                   `padding-left: 0px; ` +
                   `padding-right: 0px; ` +
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

        // Add debug overlay if enabled (positioned outside dialog for clean screenshots)
        const showDebugOverlay = this._settings.get_boolean('debug-layout-overlay');
        if (showDebugOverlay && this._calculatedSpacing._dims) {
            this._debugOverlay = this._createDebugOverlay();
            // Position in top-left corner of screen
            this._debugOverlay.set_position(monitor.x + 20, monitor.y + 20);
        }

        this._addDebugRect(container, 'container', 'Main Dialog Container');

        this._container = container;
        this._currentDialogWidth = dialogWidth;
        this._currentDialogHeight = dialogHeight;

        // Wrapper with resize handles - uses BinLayout for layering dropdown menus
        const wrapper = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        
        wrapper.add_child(container);
        addResizeHandles(this, wrapper, container);

        // Store wrapper reference for dropdown menus (they need to be inside modal grab)
        this._dialogWrapper = wrapper;

        this._dialog.add_child(wrapper);

        Main.uiGroup.add_child(this._dialog);
        this._dialog.set_position(monitor.x, monitor.y);
        this._dialog.set_size(monitor.width, monitor.height);
        
        // With FixedLayout, we must position wrapper to center it
        // Calculate center position within dialog (which covers the full monitor)
        const wrapperX = Math.floor((monitor.width - dialogWidth) / 2);
        const wrapperY = Math.floor((monitor.height - dialogHeight) / 2);
        wrapper.set_position(wrapperX, wrapperY);

        // Add debug overlay to uiGroup (outside dialog for clean screenshots)
        if (this._debugOverlay) {
            Main.uiGroup.add_child(this._debugOverlay);
        }

        this._dialog.grab_key_focus();

        // Push modal to grab all input and prevent events from reaching windows behind
        try {
            this._modalGrabbed = Main.pushModal(this._dialog, {
                actionMode: imports.gi.Shell.ActionMode.NORMAL,
            });
            
            if (!this._modalGrabbed) {
                logger.error('Failed to acquire modal grab');
            }
        } catch (e) {
            logger.error(`Error acquiring modal: ${e.message}`);
            this._modalGrabbed = null;
        }

        // Scroll to active custom layout card if it's off-screen
        this._scrollToActiveCard();
    }

    /**
     * Scroll the custom layouts ScrollView to make the active card visible
     * Called after dialog creation to ensure selected layouts in row 3+ are visible
     */
    _scrollToActiveCard() {
        // Only proceed if we have a scrollView and cards
        if (!this._customLayoutsScrollView || this._allCards.length === 0) {
            return;
        }

        const currentLayout = this._getCurrentLayout();
        if (!currentLayout) return;

        // Find the active card index among custom layouts only (skip templates)
        const templateCount = this._templateManager.getBuiltinTemplates().length;
        let activeCustomIndex = -1;

        for (let i = templateCount; i < this._allCards.length; i++) {
            const cardObj = this._allCards[i];
            if (this._isLayoutActive(cardObj.layout, currentLayout)) {
                activeCustomIndex = i - templateCount;
                break;
            }
        }

        if (activeCustomIndex < 0) return;

        // Calculate which row the active card is in (0-indexed)
        const COLUMNS = this._customColumns;
        const activeRow = Math.floor(activeCustomIndex / COLUMNS);

        // Only scroll if the card is in row 2 or later (row 0 and 1 should be visible)
        if (activeRow < 2) return;

        // Row height = card height + row gap + padding
        const rowHeight = this._cardHeight + this._ROW_GAP + this._GRID_ROW_PADDING_TOP + this._GRID_ROW_PADDING_BOTTOM;
        const targetScrollY = Math.max(0, (activeRow - 1) * rowHeight);
        const scrollView = this._customLayoutsScrollView;
        
        // Use timeout to ensure layout is complete
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
            try {
                // Get adjustment (try multiple methods for compatibility)
                let adjustment = scrollView?.vadjustment;
                if (!adjustment && scrollView && typeof scrollView.get_vscroll_bar === 'function') {
                    const vbar = scrollView.get_vscroll_bar();
                    if (vbar) adjustment = vbar.get_adjustment();
                }
                
                if (adjustment) {
                    const maxScroll = adjustment.upper - adjustment.page_size;
                    if (maxScroll > 0) {
                        adjustment.value = Math.min(targetScrollY, maxScroll);
                    }
                }
            } catch (e) {
                logger.error(`Error scrolling to active card: ${e.message}`);
            }
            return GLib.SOURCE_REMOVE;
        });
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
     * Uses SpatialStateManager for per-space layout storage
     */
    _getLayoutForWorkspace(workspaceIndex) {
        try {
            // Use SpatialStateManager for per-space layout storage
            const spatialManager = this._layoutManager.getSpatialStateManager();
            if (spatialManager) {
                // Get the selected monitor index (default to 0 if not set)
                const monitorIndex = this._selectedMonitorIndex ?? 0;
                const spaceKey = spatialManager.makeKey(monitorIndex, workspaceIndex);
                
                // Get layout for this space
                const layout = this._layoutManager.getLayoutForSpace(spaceKey);
                if (layout) return layout;
            }
        } catch (e) {
            logger.warn('Error getting workspace layout:', e);
        }

        // Fallback to global current layout or halves template
        const currentLayout = this._layoutManager.getCurrentLayout();
        return currentLayout || this._templateManager.createLayoutFromTemplate('halves');
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
     * Handles both custom layouts and templates
     */
    _isLayoutActive(layout, currentLayout) {
        if (!currentLayout || !layout) return false;
        
        // Direct match (custom layouts or already-applied templates)
        if (layout.id === currentLayout.id) return true;
        
        // Template match: template.id='focus' matches currentLayout.id='template-focus'
        if (currentLayout.id.startsWith('template-')) {
            const activeTemplateId = currentLayout.id.replace('template-', '');
            return layout.id === activeTemplateId;
        }
        
        return false;
    }

    /**
     * Handle template click - apply immediately
     */
    _onTemplateClicked(template) {
        logger.info(`Template clicked: ${template.name}`);

        const layout = this._templateManager.createLayoutFromTemplate(template.id);
        
        // Register the template-derived layout in memory (not persisted to disk)
        // This allows setLayout() to find it without cluttering custom layouts
        this._layoutManager.registerLayoutTemporary(layout);
        
        this._applyLayout(layout);
        this._zoneOverlay.showMessage(`Switched to: ${template.name}`);

        // Only close dialog if modifying the current workspace/monitor
        // When configuring a different workspace/monitor, keep dialog open for continued configuration
        const activeWorkspace = global.workspace_manager.get_active_workspace_index();
        const currentMonitor = Main.layoutManager.currentMonitor.index;
        const isCurrentWorkspace = this._applyGlobally || (this._currentWorkspace === activeWorkspace);
        const isCurrentMonitor = this._selectedMonitorIndex === currentMonitor;
        
        if (isCurrentWorkspace && isCurrentMonitor) {
            this.hide();
        } else {
            // Refresh to show updated state without closing
            this._refreshDialog();
        }
    }

    /**
     * Handle custom layout click - apply immediately
     */
    _onLayoutClicked(layout) {
        logger.info(`Layout clicked: ${layout.name}`);

        this._applyLayout(layout);
        this._zoneOverlay.showMessage(`Switched to: ${layout.name}`);

        // Only close dialog if modifying the current workspace/monitor
        // When configuring a different workspace/monitor, keep dialog open for continued configuration
        const activeWorkspace = global.workspace_manager.get_active_workspace_index();
        const currentMonitor = Main.layoutManager.currentMonitor.index;
        const isCurrentWorkspace = this._applyGlobally || (this._currentWorkspace === activeWorkspace);
        const isCurrentMonitor = this._selectedMonitorIndex === currentMonitor;
        
        if (isCurrentWorkspace && isCurrentMonitor) {
            this.hide();
        } else {
            // Refresh to show updated state without closing
            this._refreshDialog();
        }
    }

    /**
     * Handle edit layout click - open settings dialog
     * Keeps switcher visible but releases modal to settings dialog
     */
    _onEditLayoutClicked(layout) {
        logger.info(`Edit layout clicked: ${layout.name}`);

        // Release modal but keep UI visible - settings dialog will have its own modal
        this._releaseModalForSettings();

        const settingsDialog = new LayoutSettingsDialog(
            layout,
            this._layoutManager,
            this._settings,
            (updatedLayout) => {
                // Refresh and re-acquire modal
                this._refreshAfterSettings();
            },
            () => {
                // Re-acquire modal
                this._reacquireModalAfterSettings();
            },
            () => {
                // onZoneEditorOpen: hide LayoutSwitcher and preview background
                if (this._container) {
                    this._container.hide();
                }
                if (this._previewBackground) {
                    this._previewBackground.setVisibility(false);
                }
            },
            (editedLayout) => {
                // onZoneEditorClose: store layout for preview restoration
                const hasZones = editedLayout?.zones?.length > 0;
                this._pendingPreviewLayout = hasZones ? editedLayout : this._getCurrentLayout();
            }
        );
        settingsDialog.open();
    }

    /**
     * Handle edit template click - open settings dialog for template viewing
     * Templates show Duplicate button only (no Save/Delete, disabled Name)
     * Keeps switcher visible but releases modal to settings dialog
     */
    _onEditTemplateClicked(template) {
        logger.info(`Edit template clicked: ${template.name}`);

        // Pass template directly - don't create duplicate until user clicks Duplicate
        // LayoutSettingsDialog will detect it's a template via _detectIsTemplate()
        
        // Release modal but keep UI visible - settings dialog will have its own modal
        this._releaseModalForSettings();

        const settingsDialog = new LayoutSettingsDialog(
            template,  // Pass template directly, not a duplicate
            this._layoutManager,
            this._settings,
            (newLayout) => {
                // If a layout was created (via Duplicate), refresh to show it
                if (newLayout) {
                    this._zoneOverlay.showMessage(`Created: ${newLayout.name}`);
                }
                this._refreshAfterSettings();
            },
            () => {
                // Re-acquire modal (no changes were made)
                this._reacquireModalAfterSettings();
            },
            () => {
                // onZoneEditorOpen: hide LayoutSwitcher and preview background
                if (this._container) {
                    this._container.hide();
                }
                if (this._previewBackground) {
                    this._previewBackground.setVisibility(false);
                }
            },
            (editedLayout) => {
                // onZoneEditorClose: store layout for preview restoration
                const hasZones = editedLayout?.zones?.length > 0;
                this._pendingPreviewLayout = hasZones ? editedLayout : this._getCurrentLayout();
            }
        );
        settingsDialog.open();
    }

    /**
     * Handle delete layout click - show inline confirmation
     * Uses simple overlay instead of ModalDialog to avoid modal conflicts
     */
    _onDeleteClicked(layout) {
        logger.info(`Delete clicked for layout: ${layout.name}`);
        
        // Create confirmation overlay
        this._showDeleteConfirmation(layout);
    }

    /**
     * Show inline delete confirmation dialog
     * @param {Object} layout - Layout to delete
     */
    _showDeleteConfirmation(layout) {
        // Remove any existing confirmation
        if (this._confirmOverlay) {
            this._confirmOverlay.destroy();
            this._confirmOverlay = null;
        }

        const colors = this._themeManager.getColors();

        // Semi-transparent backdrop
        const backdrop = new St.Bin({
            style: 'background-color: rgba(0, 0, 0, 0.5);',
            reactive: true,
            x_expand: true,
            y_expand: true
        });

        // Confirmation box
        const confirmBox = new St.BoxLayout({
            vertical: true,
            style: `background-color: ${colors.containerBg}; ` +
                   `border-radius: 12px; ` +
                   `padding: 24px; ` +
                   `min-width: 300px; ` +
                   `border: 1px solid ${colors.border};`,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: false,
            y_expand: false
        });

        // Title
        const title = new St.Label({
            text: 'Delete Layout',
            style: `color: ${colors.textPrimary}; font-size: 16px; font-weight: bold; margin-bottom: 12px;`
        });
        confirmBox.add_child(title);

        // Message
        const message = new St.Label({
            text: `Are you sure you want to delete "${layout.name}"?\n\nThis action cannot be undone.`,
            style: `color: ${colors.textSecondary}; font-size: 13px; margin-bottom: 20px;`
        });
        message.clutter_text.line_wrap = true;
        confirmBox.add_child(message);

        // Buttons
        const buttonBox = new St.BoxLayout({
            style: 'spacing: 12px;',
            x_align: Clutter.ActorAlign.END
        });

        // Cancel button
        const cancelBtn = new St.Button({
            label: 'Cancel',
            style: `background-color: ${colors.buttonBg}; ` +
                   `color: ${colors.buttonText}; ` +
                   `padding: 8px 20px; ` +
                   `border-radius: 6px; ` +
                   `font-weight: 500;`,
            reactive: true,
            track_hover: true
        });
        cancelBtn.connect('clicked', () => {
            this._hideDeleteConfirmation();
        });
        buttonBox.add_child(cancelBtn);

        // Delete button (destructive red)
        const deleteBtn = new St.Button({
            label: 'Delete',
            style: `background-color: #c01c28; ` +
                   `color: white; ` +
                   `padding: 8px 20px; ` +
                   `border-radius: 6px; ` +
                   `font-weight: 500;`,
            reactive: true,
            track_hover: true
        });
        deleteBtn.connect('clicked', () => {
            this._hideDeleteConfirmation();
            
            // Perform delete
            if (this._layoutManager.deleteLayout(layout.id)) {
                logger.info(`Layout deleted: ${layout.name}`);
                this._zoneOverlay.showMessage(`Deleted: ${layout.name}`);
                this._refreshDialog();
            } else {
                logger.error(`Failed to delete layout: ${layout.name}`);
                this._zoneOverlay.showMessage(`Failed to delete layout`);
            }
        });
        buttonBox.add_child(deleteBtn);

        confirmBox.add_child(buttonBox);

        // Wrapper to center the box
        const wrapper = new St.Bin({
            style: 'background-color: rgba(0, 0, 0, 0.5);',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            child: confirmBox,
            reactive: true
        });

        // Set confirmBox alignment within wrapper
        wrapper.set_child(new St.BoxLayout({
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        }));
        wrapper.get_child().add_child(confirmBox);

        // Click on backdrop to cancel
        wrapper.connect('button-press-event', (actor, event) => {
            const [clickX, clickY] = event.get_coords();
            const boxAlloc = confirmBox.get_transformed_extents();
            
            const isOutside = clickX < boxAlloc.origin.x ||
                              clickX > boxAlloc.origin.x + boxAlloc.size.width ||
                              clickY < boxAlloc.origin.y ||
                              clickY > boxAlloc.origin.y + boxAlloc.size.height;
            
            if (isOutside) {
                this._hideDeleteConfirmation();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_STOP;
        });

        // Add overlay on top of the dialog container
        this._confirmOverlay = wrapper;
        this._dialog.add_child(wrapper);
        
        // Position overlay to cover the dialog
        wrapper.set_position(0, 0);
        const [dialogW, dialogH] = this._dialog.get_size();
        wrapper.set_size(dialogW, dialogH);

        // Focus the cancel button
        cancelBtn.grab_key_focus();
    }

    /**
     * Hide the delete confirmation overlay
     */
    _hideDeleteConfirmation() {
        if (this._confirmOverlay) {
            this._confirmOverlay.destroy();
            this._confirmOverlay = null;
        }
        
        // Return focus to dialog
        if (this._dialog) {
            this._dialog.grab_key_focus();
        }
    }

    /**
     * Apply a layout to the current context (workspace or global)
     */
    _applyLayout(layout) {
        if (this._workspaceMode) {
            try {
                // Use SpatialStateManager for per-space layout storage
                const spatialManager = this._layoutManager.getSpatialStateManager();
                if (spatialManager) {
                    // Get the selected monitor index (default to 0 if not set)
                    const monitorIndex = this._selectedMonitorIndex ?? 0;
                    const spaceKey = spatialManager.makeKey(monitorIndex, this._currentWorkspace);
                    
                    // Save to spatial state
                    this._layoutManager.setLayoutForSpace(spaceKey, layout.id);
                    
                    // If this is the active workspace, also update the current layout
                    const activeWorkspace = global.workspace_manager.get_active_workspace_index();
                    if (activeWorkspace === this._currentWorkspace) {
                        this._layoutManager.setLayout(layout.id);
                    }
                    
                    logger.info(`Applied layout ${layout.id} to space ${spaceKey}`);
                } else {
                    // Fallback: just set layout globally
                    this._layoutManager.setLayout(layout.id);
                    logger.warn(`SpatialStateManager not available, applied layout ${layout.id} globally`);
                }
            } catch (e) {
                logger.error('Error applying layout to space:', e);
            }
        } else {
            this._layoutManager.setLayout(layout.id);
            logger.info(`Applied layout ${layout.id} globally`);
        }
    }

    /**
     * Refresh the dialog content
     * Preserves workspace, monitor, and card selection across the refresh
     */
    _refreshDialog() {
        const wasWorkspace = this._currentWorkspace;
        const wasSelectedIndex = this._selectedCardIndex;
        const wasMonitor = this._selectedMonitorIndex;  // Preserve monitor selection
        
        this.hide();
        
        this._currentWorkspace = wasWorkspace;
        this._selectedMonitorIndex = wasMonitor;  // Restore before show()
        this.show();
        
        if (wasSelectedIndex >= 0 && wasSelectedIndex < this._allCards.length) {
            this._selectedCardIndex = wasSelectedIndex;
            this._updateCardFocus();
        }
    }

    /**
     * Connect keyboard event handlers
     * Note: When modal is active, keyboard events go to the modal actor (this._dialog)
     * not to global.stage, so we connect directly to the dialog
     */
    _connectKeyEvents() {
        this._keyPressId = this._dialog.connect('key-press-event', (actor, event) => {
            const symbol = event.get_key_symbol();
            const modifiers = event.get_state();
            const ctrlPressed = (modifiers & Clutter.ModifierType.CONTROL_MASK) !== 0;

            // Ctrl+D: Toggle debug rectangles
            if (ctrlPressed && (symbol === Clutter.KEY_d || symbol === Clutter.KEY_D)) {
                this._toggleDebugMode();
                return Clutter.EVENT_STOP;
            }
            
            // Ctrl+T: Cycle through tiers (for debugging)
            if (ctrlPressed && (symbol === Clutter.KEY_t || symbol === Clutter.KEY_T)) {
                this._cycleTier();
                return Clutter.EVENT_STOP;
            }
            
            // Ctrl+O: Toggle debug overlay
            if (ctrlPressed && (symbol === Clutter.KEY_o || symbol === Clutter.KEY_O)) {
                this._toggleDebugOverlay();
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
        
        // Update preview background to show the selected layout
        if (this._selectedCardIndex >= 0 && this._selectedCardIndex < this._allCards.length) {
            const selectedLayout = this._allCards[this._selectedCardIndex].layout;
            this._updatePreviewBackground(selectedLayout);
        }
    }

    /**
     * Update visual focus indicator on cards
     */
    _updateCardFocus() {
        const colors = this._themeManager.getColors();
        const accentHex = colors.accentHex;
        const accentRGBAActive = colors.accentRGBA(0.3);
        const accentRGBAFocus = colors.accentRGBA(0.4);
        const cardRadius = this._cardRadius;

        this._allCards.forEach((cardObj, index) => {
            const isFocused = index === this._selectedCardIndex;
            const currentLayout = this._getCurrentLayout();
            const isActive = this._isLayoutActive(cardObj.layout, currentLayout);

            if (isFocused) {
                cardObj.card.style = `padding: 0; border-radius: ${cardRadius}px; ` +
                                    `width: ${this._cardWidth}px; height: ${this._cardHeight}px; ` +
                                    `background-color: ${accentRGBAFocus}; ` +
                                    `border: 2px solid ${accentHex}; ` +
                                    `box-shadow: 0 0 0 3px ${accentHex}, 0 4px 12px rgba(0, 0, 0, 0.3);`;
            } else if (isActive) {
                cardObj.card.style = `padding: 0; border-radius: ${cardRadius}px; ` +
                                    `width: ${this._cardWidth}px; height: ${this._cardHeight}px; ` +
                                    `background-color: ${accentRGBAActive}; ` +
                                    `border: 2px solid ${accentHex};`;
            } else {
                cardObj.card.style = `padding: 0; border-radius: ${cardRadius}px; ` +
                                    `width: ${this._cardWidth}px; height: ${this._cardHeight}px; ` +
                                    `background-color: ${colors.cardBg}; ` +
                                    `border: 2px solid transparent;`;
            }
        });
    }

    /**
     * Update the preview background to show a specific layout
     * Called when hovering over cards or navigating with keyboard
     * @param {Object} layout - Layout to preview (with zones array)
     */
    _updatePreviewBackground(layout) {
        if (!this._previewBackground) return;
        
        this._hoveredLayout = layout;
        this._previewBackground.setLayout(layout);
    }

    /**
     * Handle card hover - update the preview background
     * Called from cardFactory when mouse enters a card
     * @param {Object} layout - Layout being hovered
     */
    _onCardHover(layout) {
        this._updatePreviewBackground(layout);
    }

    /**
     * Handle card hover end - revert to current/selected layout
     * Called from cardFactory when mouse leaves a card
     */
    _onCardHoverEnd() {
        // If there's a keyboard-selected card, show that; otherwise show current active layout
        if (this._selectedCardIndex >= 0 && this._selectedCardIndex < this._allCards.length) {
            const selectedLayout = this._allCards[this._selectedCardIndex].layout;
            this._updatePreviewBackground(selectedLayout);
        } else {
            const currentLayout = this._getCurrentLayout();
            this._updatePreviewBackground(currentLayout);
        }
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
        if (this._keyPressId && this._dialog) {
            try {
                this._dialog.disconnect(this._keyPressId);
            } catch (e) {
                // Dialog may already be destroyed
            }
            this._keyPressId = null;
        }
    }

    /**
     * Handle create new layout click
     * Keeps switcher visible but releases modal to settings dialog
     */
    _onCreateNewLayoutClicked() {
        logger.info('Create new layout clicked');

        // Release modal but keep UI visible - settings dialog will have its own modal
        this._releaseModalForSettings();

        const settingsDialog = new LayoutSettingsDialog(
            null,
            this._layoutManager,
            this._settings,
            (newLayout) => {
                if (newLayout) {
                    logger.info(`New layout created: ${newLayout.name}`);
                    this._applyLayout(newLayout);
                }
                // Refresh to show the new layout card
                this._refreshAfterSettings();
            },
            () => {
                // Re-acquire modal (no new content was created)
                this._reacquireModalAfterSettings();
            },
            () => {
                // onZoneEditorOpen: hide LayoutSwitcher and preview background
                if (this._container) {
                    this._container.hide();
                }
                if (this._previewBackground) {
                    this._previewBackground.setVisibility(false);
                }
            },
            (editedLayout) => {
                // onZoneEditorClose: store layout for preview restoration
                const hasZones = editedLayout?.zones?.length > 0;
                this._pendingPreviewLayout = hasZones ? editedLayout : this._getCurrentLayout();
            }
        );
        settingsDialog.open();
    }

    /**
     * Release modal so settings dialog can have it, but keep UI visible
     * Called before opening LayoutSettingsDialog
     * @private
     */
    _releaseModalForSettings() {
        // Disconnect key events temporarily
        this._disconnectKeyEvents();
        
        // Release modal grab
        if (this._modalGrabbed) {
            try {
                Main.popModal(this._modalGrabbed);
            } catch (e) {
                logger.error(`Error releasing modal: ${e.message}`);
            }
            this._modalGrabbed = null;
        }
        
        // NOTE: Keep preview background visible - it provides the backdrop
        // for both LayoutSwitcher and LayoutSettingsDialog
    }

    /**
     * Re-acquire modal after settings dialog closes
     * Called when settings is canceled (no content changes needed)
     * 
     * CRITICAL: Modal must be acquired BEFORE showing the container, otherwise
     * click events (e.g., from zone editor cancel button) can propagate to the
     * container's dismiss handler and immediately close the dialog.
     * @private
     */
    _reacquireModalAfterSettings() {
        if (!this._dialog) {
            logger.warn('No dialog exists - cannot re-acquire modal');
            return;
        }
        
        // Re-acquire modal FIRST before making anything visible
        // This prevents stray click events from dismissing the dialog
        try {
            this._modalGrabbed = Main.pushModal(this._dialog, {
                actionMode: imports.gi.Shell.ActionMode.NORMAL,
            });
            
            if (!this._modalGrabbed) {
                logger.error('Failed to re-acquire modal');
            }
        } catch (e) {
            logger.error(`Error re-acquiring modal: ${e.message}`);
            this._modalGrabbed = null;
        }
        
        // Restore preview background visibility
        if (this._previewBackground) {
            const layoutToShow = this._pendingPreviewLayout || this._getCurrentLayout();
            this._pendingPreviewLayout = null;
            
            if (this._previewBackground.isVisible()) {
                // Overlays exist but may be hidden - restore them
                this._previewBackground.setVisibility(true);
                this._previewBackground.setLayout(layoutToShow);
            } else {
                // Fallback: overlays were destroyed
                this._previewBackground.show(layoutToShow, this._selectedMonitorIndex);
            }
        }
        
        // Show container if it was hidden (zone editor flow)
        if (this._container) {
            this._container.show();
        }
        
        // Ensure dialog is on top of preview overlays
        if (this._dialog) {
            this._dialog.raise_top();
        }
        
        // Reconnect key events and focus
        this._connectKeyEvents();
        if (this._dialog) {
            this._dialog.grab_key_focus();
        }
    }

    /**
     * Refresh dialog content and re-acquire modal after settings saves/edits
     * Called when settings is saved (content may have changed)
     * @private
     */
    _refreshAfterSettings() {
        // Full refresh - hide and show to rebuild with any changes
        const wasWorkspace = this._currentWorkspace;
        this.hide();
        this._currentWorkspace = wasWorkspace;
        this.show();
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.hide();
    }
}
