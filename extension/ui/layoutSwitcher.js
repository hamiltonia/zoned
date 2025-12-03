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
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { createLogger } from '../utils/debug.js';
import { TemplateManager } from '../templateManager.js';
import { ZoneEditor } from './zoneEditor.js';
import { LayoutSettingsDialog } from './layoutSettingsDialog.js';
import { ThemeManager } from '../utils/theme.js';

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
        this._allCards = [];  // All selectable cards (templates + custom layouts)
        this._selectedCardIndex = -1;  // Currently focused card (-1 = none)
        
        // Card bottom bar configuration
        this._CARD_BOTTOM_BAR_DEFAULT_OPACITY = 255 * .25;  // ~25% of 255 (range: 0-255)
    }


    /**
     * Show the layout editor dialog
     */
    show() {
        if (this._dialog) {
            this.hide();
            return;
        }

        // Reset state for new dialog instance
        this._allCards = [];
        this._selectedCardIndex = -1;

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
        this._allCards = [];
        this._selectedCardIndex = -1;

        this._disconnectKeyEvents();

        Main.uiGroup.remove_child(dialog);
        dialog.destroy();

        logger.debug('Layout editor hidden');
    }

    /**
     * Calculate card dimensions based on monitor height (height-first approach)
     * Always uses 5 columns to ensure consistent layout
     * @private
     */
    _calculateCardDimensions(monitor) {
        const COLUMNS = 5;  // Always 5 columns for both templates and custom layouts
        const MIN_CARD_WIDTH = 160;
        const MAX_CARD_WIDTH = 350;  // Empirically tested: 340px fits at 200% scaling
        
        // Get display scale factor to convert physical pixels to logical pixels
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        const scaleFactor = themeContext.scale_factor;
        
        // Convert monitor dimensions from physical to logical pixels for CSS calculations
        // At 200% scaling: 3840 physical -> 1920 logical (what CSS sees)
        const logicalWidth = monitor.width / scaleFactor;
        const logicalHeight = monitor.height / scaleFactor;
        
        logger.info(`[SCALE] Physical: ${monitor.width}×${monitor.height}, Logical: ${logicalWidth}×${logicalHeight}, Scale: ${scaleFactor}x`);
        
        // Layout constants for height calculation
        const TOP_BAR = 60;
        const SECTION_HEADER = 40;
        const SECTION_GAP = 32;
        const CREATE_BUTTON = 80;
        const DIALOG_PADDING = 64;
        
        // Calculate max dialog height (90% of screen for more vertical space)
        const maxDialogHeight = Math.floor(logicalHeight * 0.90);
        
        // Fixed height budget (everything except card rows)
        const fixedHeight = TOP_BAR + (2 * SECTION_HEADER) + SECTION_GAP + CREATE_BUTTON + DIALOG_PADDING;
        
        // Available height for 3 rows of cards (1 template row + 2 custom layout rows)
        const availableForCards = maxDialogHeight - fixedHeight;
        const rowHeight = availableForCards / 3;
        
        // HEIGHT-FIRST APPROACH: Calculate card height from available vertical space
        // Card is full-bleed 16:9, no internal padding needed
        const cardHeight = Math.floor(rowHeight - 16);  // 16px gap between rows
        
        // Calculate card width FROM height maintaining 16:9 aspect ratio
        const heightDerivedWidth = Math.floor(cardHeight * (16 / 9));
        
        // HORIZONTAL CONSTRAINT: Calculate max width that allows 5 cards to fit
        // Account for all horizontal spacing (must match _calculateDialogWidth logic)
        const CARD_GAP = 24;  // Match this._CARD_GAP from _createDialog
        const CONTAINER_PADDING_HORIZONTAL = 30 + 19;  // LEFT + RIGHT
        const CONTENTBOX_MARGIN_HORIZONTAL = 0 + (-8);  // LEFT + RIGHT
        const SCROLLVIEW_PADDING_RIGHT = 0;
        const GRID_ROW_PADDING_HORIZONTAL = 0 + 0;  // LEFT + RIGHT
        
        const availableWidth = logicalWidth - CONTAINER_PADDING_HORIZONTAL - 
                               CONTENTBOX_MARGIN_HORIZONTAL - SCROLLVIEW_PADDING_RIGHT - 
                               GRID_ROW_PADDING_HORIZONTAL;
        
        const gapTotal = (COLUMNS - 1) * CARD_GAP;
        const maxCardWidthForHorizontalFit = Math.floor((availableWidth - gapTotal) / COLUMNS);
        
        // Use the SMALLER of height-derived or horizontal constraint to ensure cards fit both ways
        const constrainedWidth = Math.min(heightDerivedWidth, maxCardWidthForHorizontalFit);
        
        // Clamp card width to reasonable bounds
        const clampedCardWidth = Math.max(MIN_CARD_WIDTH, Math.min(MAX_CARD_WIDTH, constrainedWidth));
        
        // Recalculate card height if we clamped the width (maintain 16:9)
        const finalCardHeight = Math.floor(clampedCardWidth * (9 / 16));
        
        // Preview fills card edge-to-edge (full-bleed)
        const finalPreviewWidth = clampedCardWidth;
        const finalPreviewHeight = finalCardHeight;
        
        logger.info(`[FINAL] Card dimensions: ${clampedCardWidth}×${finalCardHeight}px`);
        
        return {
            cardWidth: clampedCardWidth,
            cardHeight: finalCardHeight,
            previewWidth: finalPreviewWidth,
            previewHeight: finalPreviewHeight,
            customColumns: COLUMNS
        };
    }

    /**
     * Calculate dialog width based on card dimensions
     * Always uses 5 columns for consistent layout
     * Uses actual spacing variables for accurate calculation at all display scales
     * @private
     */
    _calculateDialogWidth(cardWidth) {
        const COLUMNS = 5;  // Always 5 columns
        
        // Use actual spacing variables (set in _createDialog before this is called)
        const cardGap = this._CARD_GAP;  // Horizontal gap between cards
        const containerPadding = this._CONTAINER_PADDING_LEFT + this._CONTAINER_PADDING_RIGHT;
        const contentBoxMargins = this._CONTENTBOX_MARGIN_LEFT + this._CONTENTBOX_MARGIN_RIGHT;
        const scrollViewPadding = this._SCROLLVIEW_PADDING_RIGHT;
        
        return (COLUMNS * cardWidth) + ((COLUMNS - 1) * cardGap) + containerPadding + contentBoxMargins + scrollViewPadding;
    }

    /**
     * Calculate dialog height based on content
     * @private
     */
    _calculateDialogHeight(monitor, cardHeight) {
        const TOP_BAR = 60;
        const SECTION_HEADER = 40;
        const SECTION_GAP = 32;
        const CREATE_BUTTON = 80;
        const PADDING = 64;
        
        // Templates section (1 row)
        const templatesHeight = SECTION_HEADER + cardHeight;
        
        // Custom layouts section (2 rows visible)
        const customHeight = SECTION_HEADER + (2 * cardHeight) + 16;  // 16px gap between rows
        
        const idealHeight = TOP_BAR + templatesHeight + SECTION_GAP + customHeight + CREATE_BUTTON + PADDING;
        
        // Clamp to 90% of screen height (increased from 85% for more vertical space)
        const maxHeight = Math.floor(monitor.height * 0.90);
        
        return Math.min(idealHeight, maxHeight);
    }

    /**
     * Create the main dialog UI
     * @private
     */
    _createDialog() {
        const colors = this._themeManager.getColors();
        const monitor = Main.layoutManager.currentMonitor;

        // ============================================================================
        // DISPLAY SCALE DETECTION - For logging purposes
        // ============================================================================
        
        // Get display scale factor (1.0 = 100%, 2.0 = 200%, etc.)
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        const scaleFactor = themeContext.scale_factor;
        
        logger.info(`Display scale factor detected: ${scaleFactor}x (${scaleFactor * 100}%)`);
        logger.info(`Monitor dimensions (logical pixels): ${monitor.width}×${monitor.height}`);
        
        // ============================================================================
        // SPACING CONFIGURATION - Values in logical pixels (automatically scaled by GNOME)
        // ============================================================================
        // NOTE: Monitor dimensions are already in logical pixels which account for display
        // scaling. At 200% scale, a 1920x1080 physical display becomes 960x540 logical.
        // Therefore, spacing should also be in logical pixels (no manual scaling needed).
        // ============================================================================
        
        // CONTAINER STYLING (controls dialog appearance)
        this._CONTAINER_BORDER_RADIUS = 16;   // Dialog corner radius (set to 0 for sharp corners & flush scrollbar)
        
        // CONTAINER PADDING (controls dialog outer padding)
        this._CONTAINER_PADDING_LEFT = 30;    // Dialog container left padding
        this._CONTAINER_PADDING_RIGHT = 19;   // Dialog container right padding (set to 0 to position scrollbar at edge)
        this._CONTAINER_PADDING_TOP = 32;     // Dialog container top padding
        this._CONTAINER_PADDING_BOTTOM = 32;  // Dialog container bottom padding
        
        // EXTERNAL SPACING (controls alignment with topBar and dialog edges)
        this._CONTENTBOX_MARGIN_LEFT = 0;     // contentBox left margin (negative pulls left to align with topBar)
        this._CONTENTBOX_MARGIN_RIGHT = -8;   // contentBox right margin (accounts for scrollbar space)
        this._SCROLLVIEW_PADDING_RIGHT = 0;   // scrollView right padding (scrollbar spacing)
        
        // INTERNAL SPACING (controls card grid positioning within blue debug boxes)
        this._GRID_ROW_PADDING_LEFT = 0;      // Blue box internal left padding
        this._GRID_ROW_PADDING_RIGHT = 0;     // Blue box internal right padding
        this._GRID_ROW_PADDING_TOP = 2;       // Blue box internal top padding
        this._GRID_ROW_PADDING_BOTTOM = 2;    // Blue box internal bottom padding
        
        // CARD SPACING
        this._CARD_GAP = 24;                  // Horizontal gap between cards in a row
        this._ROW_GAP = 24;                   // Vertical gap between rows of cards
        
        // ============================================================================

        // Calculate adaptive dimensions
        const dims = this._calculateCardDimensions(monitor);
        this._cardWidth = dims.cardWidth;
        this._cardHeight = dims.cardHeight;
        this._previewWidth = dims.previewWidth;
        this._previewHeight = dims.previewHeight;
        this._customColumns = dims.customColumns;
        
        const dialogWidth = this._calculateDialogWidth(this._cardWidth);
        const dialogHeight = this._calculateDialogHeight(monitor, this._cardHeight);
        
        logger.info(`Card dimensions: ${this._cardWidth}×${this._cardHeight}, ` +
                   `Dialog: ${dialogWidth}×${dialogHeight}`);

        // Background overlay - translucent, click to close
        this._dialog = new St.Bin({
            style_class: 'modal-dialog',
            reactive: true,
            can_focus: true,
            style: `background-color: ${colors.modalOverlay};`,
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

        // Main container (using calculated adaptive dimensions and spacing variables)
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

        // Prevent clicks on container from closing dialog
        container.connect('button-press-event', () => Clutter.EVENT_STOP);

        // Top section: Monitor & Workspace selector
        const topBar = this._createTopBar();
        container.add_child(topBar);

        // Scrollable content area (using _SCROLLVIEW_PADDING_RIGHT variable)
        const scrollView = new St.ScrollView({
            style: `flex: 1; margin-top: 24px; padding-right: ${this._SCROLLVIEW_PADDING_RIGHT}px;`,
            overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            x_expand: true,
            y_expand: true
        });

        // Content container (using _CONTENTBOX_MARGIN_LEFT and _CONTENTBOX_MARGIN_RIGHT variables)
        const contentBox = new St.BoxLayout({
            vertical: true,
            style: `spacing: 32px; margin-left: ${this._CONTENTBOX_MARGIN_LEFT}px; margin-right: ${this._CONTENTBOX_MARGIN_RIGHT}px;`
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

        // Add to stage - size to current monitor, not combined screen
        Main.uiGroup.add_child(this._dialog);
        this._dialog.set_position(monitor.x, monitor.y);
        this._dialog.set_size(monitor.width, monitor.height);

        this._dialog.grab_key_focus();
    }

    /**
     * Create "Spaces" section with collapsible monitor and workspace selectors
     * @private
     */
    _createTopBar() {
        const colors = this._themeManager.getColors();
        
        // Read global apply setting
        this._applyGlobally = this._settings.get_boolean('apply-layout-globally');
        
        const spacesSection = new St.BoxLayout({
            vertical: true,
            style: `spacing: 12px; padding-bottom: 20px; border-bottom: 1px solid ${colors.border};`
        });

        // Header row with title and checkbox
        const header = this._createSpacesHeader();
        spacesSection.add_child(header);

        // Collapsible content (monitor dropdown + workspace cards)
        this._spacesContent = this._createSpacesContent();
        spacesSection.add_child(this._spacesContent);

        // Set initial collapsed state based on checkbox
        this._updateSpacesExpansion();

        return spacesSection;
    }

    /**
     * Create Spaces header with title and "apply to all" checkbox
     * @private
     */
    _createSpacesHeader() {
        const colors = this._themeManager.getColors();
        
        const header = new St.BoxLayout({
            vertical: false,
            style: 'padding: 0 4px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });

        // "Spaces" title
        const title = new St.Label({
            text: 'Spaces',
            style: `font-size: 16pt; color: ${colors.textPrimary}; font-weight: bold;`,
            y_align: Clutter.ActorAlign.CENTER
        });
        header.add_child(title);

        // Spacer
        const spacer = new St.Widget({ x_expand: true });
        header.add_child(spacer);

        // Checkbox container (reversed layout: checkbox on right of label)
        const checkboxContainer = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 8px;',
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true
        });

        // Label
        const checkboxLabel = new St.Label({
            text: 'Apply one layout to all spaces',
            style: `font-size: 13px; color: ${colors.textMuted};`,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true
        });

        // Checkbox with checkmark
        this._applyGloballyCheckbox = new St.Button({
            style_class: 'checkbox',
            style: `width: 18px; height: 18px; ` +
                   `border: 2px solid ${this._applyGlobally ? colors.accentHex : colors.textMuted}; ` +
                   `border-radius: 3px; ` +
                   `background-color: ${this._applyGlobally ? colors.accentHex : 'transparent'};`,
            reactive: true,
            track_hover: true,
            y_align: Clutter.ActorAlign.CENTER
        });

        // Add checkmark icon when checked
        if (this._applyGlobally) {
            const checkmark = new St.Label({
                text: '✓',
                style: `color: ${colors.isDark ? '#1a202c' : 'white'}; font-size: 14px; font-weight: bold;`,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER
            });
            this._applyGloballyCheckbox.set_child(checkmark);
        }

        // Click handlers for both label and checkbox
        const toggleCheckbox = () => {
            this._applyGlobally = !this._applyGlobally;
            this._settings.set_boolean('apply-layout-globally', this._applyGlobally);
            
            const colors = this._themeManager.getColors();
            
            // Update checkbox appearance and checkmark
            this._applyGloballyCheckbox.style = `width: 18px; height: 18px; ` +
                   `border: 2px solid ${this._applyGlobally ? colors.accentHex : colors.textMuted}; ` +
                   `border-radius: 3px; ` +
                   `background-color: ${this._applyGlobally ? colors.accentHex : 'transparent'};`;
            
            // Update checkmark
            if (this._applyGlobally) {
                const checkmark = new St.Label({
                    text: '✓',
                    style: `color: ${colors.isDark ? '#1a202c' : 'white'}; font-size: 14px; font-weight: bold;`,
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER
                });
                this._applyGloballyCheckbox.set_child(checkmark);
            } else {
                this._applyGloballyCheckbox.set_child(null);
            }
            
            // Toggle expansion
            this._updateSpacesExpansion();
        };

        checkboxLabel.connect('button-press-event', () => {
            toggleCheckbox();
            return Clutter.EVENT_STOP;
        });

        this._applyGloballyCheckbox.connect('clicked', () => {
            toggleCheckbox();
            return Clutter.EVENT_STOP;
        });

        // Add label then checkbox (visual order: label | checkbox)
        checkboxContainer.add_child(checkboxLabel);
        checkboxContainer.add_child(this._applyGloballyCheckbox);

        header.add_child(checkboxContainer);

        return header;
    }

    /**
     * Create collapsible spaces content container
     * @private
     */
    _createSpacesContent() {
        const content = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 16px;',
            clip_to_allocation: true
        });

        // Monitor dropdown
        const monitorDropdown = this._createMonitorDropdown();
        content.add_child(monitorDropdown);

        // Workspace cards grid - always show workspaces
        const workspaceGrid = this._createWorkspaceSelector();
        content.add_child(workspaceGrid);

        return content;
    }

    /**
     * Update spaces content expansion based on checkbox state
     * @private
     */
    _updateSpacesExpansion() {
        if (!this._spacesContent) return;

        if (this._applyGlobally) {
            // Collapsed state
            this._spacesContent.set_height(0);
            this._spacesContent.opacity = 0;
        } else {
            // Expanded state - use dynamically calculated card dimensions
            this._spacesContent.set_height(this._cardHeight + 16); // Add padding
            this._spacesContent.opacity = 255;
        }
    }

    /**
     * Create monitor dropdown selector
     * @private
     */
    _createMonitorDropdown() {
        const colors = this._themeManager.getColors();
        
        const dropdown = new St.BoxLayout({
            vertical: true
        });

        // Get all monitors
        const monitors = Main.layoutManager.monitors;
        const primaryIndex = Main.layoutManager.primaryIndex;
        
        // Default to primary monitor
        this._selectedMonitorIndex = primaryIndex;
        const currentMonitor = monitors[this._selectedMonitorIndex];

        // Use dynamically calculated card dimensions (same as layout cards)
        const cardWidth = this._cardWidth;
        const cardHeight = this._cardHeight;

        // Dropdown trigger button (16:9 aspect ratio card - using calculated dimensions)
        this._monitorTrigger = new St.Button({
            style_class: 'monitor-dropdown-trigger',
            style: `width: ${cardWidth}px; height: ${cardHeight}px; ` +
                   `background: ${colors.monitorCardBg}; ` +
                   `border: 2px solid ${colors.borderLight}; ` +
                   `border-radius: 6px; ` +
                   `padding: 8px;`,
            reactive: true,
            track_hover: true
        });

        const triggerContent = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'spacing: 6px;'
        });

        // Monitor icon (simplified rectangle)
        const monitorIcon = new St.Widget({
            style: `width: 56px; height: 32px; ` +
                   `background: ${colors.monitorIconBg}; ` +
                   `border: 2px solid ${colors.monitorIconBorder}; ` +
                   `border-radius: 3px;`
        });
        triggerContent.add_child(monitorIcon);

        // Monitor label
        const monitorLabel = new St.Label({
            text: this._selectedMonitorIndex === primaryIndex ? 'Primary Monitor' : `Monitor ${this._selectedMonitorIndex + 1}`,
            style: `font-size: 12px; color: ${colors.textMuted}; font-weight: 500;`
        });
        triggerContent.add_child(monitorLabel);

        this._monitorTrigger.set_child(triggerContent);

        // Hover effect
        this._monitorTrigger.connect('enter-event', () => {
            const c = this._themeManager.getColors();
            this._monitorTrigger.style = `width: ${cardWidth}px; height: ${cardHeight}px; ` +
                   `background: ${c.monitorCardBg}; ` +
                   `border: 2px solid ${c.accentHex}; ` +
                   `border-radius: 6px; ` +
                   `padding: 8px; ` +
                   `box-shadow: 0 0 12px ${c.accentRGBA(0.3)};`;
        });

        this._monitorTrigger.connect('leave-event', () => {
            const c = this._themeManager.getColors();
            this._monitorTrigger.style = `width: ${cardWidth}px; height: ${cardHeight}px; ` +
                   `background: ${c.monitorCardBg}; ` +
                   `border: 2px solid ${c.borderLight}; ` +
                   `border-radius: 6px; ` +
                   `padding: 8px;`;
        });

        // Click to toggle dropdown menu
        this._monitorTrigger.connect('clicked', () => {
            this._toggleMonitorDropdown();
        });

        dropdown.add_child(this._monitorTrigger);
        
        // Store dropdown container for later menu attachment
        this._monitorDropdownContainer = dropdown;

        return dropdown;
    }

    /**
     * Toggle monitor dropdown menu visibility
     * @private
     */
    _toggleMonitorDropdown() {
        if (this._monitorMenu) {
            // Close existing menu
            this._monitorDropdownContainer.remove_child(this._monitorMenu);
            this._monitorMenu.destroy();
            this._monitorMenu = null;
        } else {
            // Create and show menu
            this._monitorMenu = this._createMonitorDropdownMenu();
            this._monitorDropdownContainer.add_child(this._monitorMenu);
        }
    }

    /**
     * Create monitor dropdown menu
     * @private
     */
    _createMonitorDropdownMenu() {
        const colors = this._themeManager.getColors();
        
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
                       `background: ${index === this._selectedMonitorIndex ? colors.menuItemBgActive : colors.menuItemBg}; ` +
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
                if (index !== this._selectedMonitorIndex) {
                    item.style = `padding: 10px 12px; background: ${colors.menuItemBgHover}; border-radius: 4px;`;
                }
            });

            item.connect('leave-event', () => {
                if (index !== this._selectedMonitorIndex) {
                    item.style = `padding: 10px 12px; background: ${colors.menuItemBg}; border-radius: 4px;`;
                }
            });

            // Click to select monitor
            item.connect('clicked', () => {
                this._onMonitorSelected(index);
            });

            menu.add_child(item);
        });

        return menu;
    }

    /**
     * Handle monitor selection
     * @private
     */
    _onMonitorSelected(monitorIndex) {
        this._selectedMonitorIndex = monitorIndex;
        logger.debug(`Monitor ${monitorIndex} selected`);

        // Update trigger label
        const monitors = Main.layoutManager.monitors;
        const primaryIndex = Main.layoutManager.primaryIndex;
        const triggerContent = this._monitorTrigger.get_child();
        const label = triggerContent.get_children()[1]; // Second child is the label
        
        label.text = monitorIndex === primaryIndex ? 'Primary Monitor' : `Monitor ${monitorIndex + 1}`;

        // Close dropdown
        this._toggleMonitorDropdown();
    }

    /**
     * Create workspace selector with enhanced 16:9 cards
     * @private
     */
    _createWorkspaceSelector() {
        const colors = this._themeManager.getColors();
        
        const grid = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 12px; padding: 4px;',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER
        });

        const nWorkspaces = global.workspace_manager.get_n_workspaces();
        
        // Use dynamically calculated card dimensions (same as layout cards)
        const cardWidth = this._cardWidth;
        const cardHeight = this._cardHeight;

        for (let i = 0; i < nWorkspaces; i++) {
            const isActive = i === this._currentWorkspace;
            
            const card = new St.Button({
                style_class: 'workspace-card',
                style: `width: ${cardWidth}px; ` +
                       `height: ${cardHeight}px; ` +
                       `background: ${isActive ? colors.workspaceCardBgActive : colors.workspaceCardBg}; ` +
                       `border: 2px solid ${isActive ? colors.accentHex : colors.borderLight}; ` +
                       `border-radius: 6px; ` +
                       `position: relative; ` +
                       `${isActive ? `box-shadow: 0 0 16px ${colors.accentRGBA(0.4)};` : ''}`,
                reactive: true,
                track_hover: true
            });

            const cardContent = new St.BoxLayout({
                vertical: true,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER
            });

            // Workspace number badge (top-left corner)
            const badge = new St.Label({
                text: `${i + 1}`,
                style: `position: absolute; ` +
                       `top: 8px; ` +
                       `left: 8px; ` +
                       `font-size: 11px; ` +
                       `opacity: 0.7; ` +
                       `color: ${isActive ? colors.accentHex : colors.textMuted};`
            });
            
            // Workspace label (centered)
            const label = new St.Label({
                text: `Workspace ${i + 1}`,
                style: `font-size: 14px; ` +
                       `font-weight: 500; ` +
                       `color: ${isActive ? colors.accentHex : colors.textMuted};`
            });
            cardContent.add_child(label);

            // Create container to hold both badge and content
            const container = new St.Widget({
                layout_manager: new Clutter.BinLayout(),
                x_expand: true,
                y_expand: true
            });
            container.add_child(cardContent);
            container.add_child(badge);

            card.set_child(container);

            // Hover effects
            const workspaceIndex = i;
            
            card.connect('enter-event', () => {
                if (!isActive) {
                    const c = this._themeManager.getColors();
                    card.style = `width: ${cardWidth}px; ` +
                           `height: ${cardHeight}px; ` +
                           `background: ${c.workspaceCardBg}; ` +
                           `border: 2px solid ${c.accentHex}; ` +
                           `border-radius: 6px; ` +
                           `box-shadow: 0 0 12px ${c.accentRGBA(0.3)};`;
                }
            });

            card.connect('leave-event', () => {
                if (!isActive) {
                    const c = this._themeManager.getColors();
                    card.style = `width: ${cardWidth}px; ` +
                           `height: ${cardHeight}px; ` +
                           `background: ${c.workspaceCardBg}; ` +
                           `border: 2px solid ${c.borderLight}; ` +
                           `border-radius: 6px;`;
                }
            });

            card.connect('clicked', () => {
                this._onWorkspaceSelected(workspaceIndex);
            });

            this._workspaceButtons.push(card);
            grid.add_child(card);
        }

        return grid;
    }

    /**
     * Handle workspace selection
     * @private
     */
    _onWorkspaceSelected(workspaceIndex) {
        this._currentWorkspace = workspaceIndex;
        logger.debug(`Switched to workspace ${workspaceIndex} in editor`);

        // Update workspace card styles with 16:9 design using dynamically calculated dimensions
        this._workspaceButtons.forEach((card, index) => {
            const isActive = index === workspaceIndex;
            
            // Update card style
            card.style = `width: ${this._cardWidth}px; ` +
                   `height: ${this._cardHeight}px; ` +
                   `background: linear-gradient(135deg, ${isActive ? '#1e3a5f' : '#2d3748'} 0%, ${isActive ? '#0f2847' : '#1a202c'} 100%); ` +
                   `border: 2px solid ${isActive ? '#00d4ff' : '#4a5568'}; ` +
                   `border-radius: 6px; ` +
                   `position: relative; ` +
                   `${isActive ? 'box-shadow: 0 0 16px rgba(0, 212, 255, 0.4);' : ''}`;
            
            // Update label and badge colors
            const container = card.get_child();
            const children = container.get_children();
            const cardContent = children[0]; // First child is the content box
            const badge = children[1]; // Second child is the badge
            
            const label = cardContent.get_children()[0]; // Label inside content box
            label.style = `font-size: 14px; ` +
                         `font-weight: 500; ` +
                         `color: ${isActive ? '#00d4ff' : '#9ca3af'};`;
            
            badge.style = `position: absolute; ` +
                         `top: 8px; ` +
                         `left: 8px; ` +
                         `font-size: 11px; ` +
                         `opacity: 0.7; ` +
                         `color: ${isActive ? '#00d4ff' : '#9ca3af'};`;
        });

        // Refresh the layout display to show current workspace's layout
        this._refreshDialog();
    }

    /**
     * Create templates section with visual depth
     * @private
     */
    _createTemplatesSection() {
        const colors = this._themeManager.getColors();
        
        // Outer section card with depth
        const section = new St.BoxLayout({
            vertical: true,
            style: `
                background-color: ${colors.sectionBg};
                border: 1px solid ${colors.sectionBorder};
                border-radius: 16px;
                padding: 20px;
                box-shadow: ${colors.sectionShadow};
            `
        });

        // Section header
        const header = new St.Label({
            text: 'Templates',
            style: `
                font-size: 11pt;
                font-weight: 600;
                color: ${colors.textMuted};
                margin-bottom: 16px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            `
        });
        section.add_child(header);

        // Template cards in horizontal row (using spacing variables)
        const templatesRow = new St.BoxLayout({
            vertical: false,
            style: `spacing: ${this._CARD_GAP}px; padding-left: ${this._GRID_ROW_PADDING_LEFT}px; padding-right: ${this._GRID_ROW_PADDING_RIGHT}px; padding-top: ${this._GRID_ROW_PADDING_TOP}px; padding-bottom: ${this._GRID_ROW_PADDING_BOTTOM}px;`
        });

        const templates = this._templateManager.getBuiltinTemplates();
        const currentLayout = this._getCurrentLayout();

        templates.forEach((template, index) => {
            const card = this._createTemplateCard(template, currentLayout, index);
            templatesRow.add_child(card);
            this._allCards.push({ card, layout: template, isTemplate: true });
        });

        section.add_child(templatesRow);

        return section;
    }

    /**
     * Create a template card with zone preview and hover bar
     * @private
     */
    _createTemplateCard(template, currentLayout, cardIndex) {
        const colors = this._themeManager.getColors();
        const isActive = this._isLayoutActive(template, currentLayout);
        const accentHex = colors.accentHex;
        const accentRGBA = colors.accentRGBA(0.3);

        const card = new St.Button({
            style_class: 'template-card',
            style: `padding: 0; ` +
                   `border-radius: 8px; ` +
                   `width: ${this._cardWidth}px; ` +
                   `height: ${this._cardHeight}px; ` +
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
        
        const preview = this._createZonePreview(
            template.zones,
            this._previewWidth,
            this._previewHeight
        );
        
        previewContainer.set_child(preview);
        container.add_child(previewContainer);

        // Bottom bar with name and buttons
        const bottomBar = this._createCardBottomBar(template.name, true, template);
        container.add_child(bottomBar);

        card.set_child(container);

        // Click card to apply
        card.connect('clicked', () => {
            this._onTemplateClicked(template);
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
                const c = this._themeManager.getColors();
                card.style = `padding: 0; border-radius: 8px; ` +
                            `width: ${this._cardWidth}px; height: ${this._cardHeight}px; ` +
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
                const c = this._themeManager.getColors();
                card.style = `padding: 0; border-radius: 8px; ` +
                            `width: ${this._cardWidth}px; height: ${this._cardHeight}px; ` +
                            `overflow: hidden; ` +
                            `background-color: ${c.cardBgTemplate}; border: 2px solid transparent;`;
            }
            // Smooth transition: fade out background to default opacity, show name, hide buttons
            card._bottomBar._background.ease({
                opacity: this._CARD_BOTTOM_BAR_DEFAULT_OPACITY,
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
     * Create custom layouts section with visual depth
     * @private
     */
    _createCustomLayoutsSection() {
        const colors = this._themeManager.getColors();
        
        // Outer section card with depth
        const section = new St.BoxLayout({
            vertical: true,
            style: `
                background-color: ${colors.sectionBg};
                border: 1px solid ${colors.sectionBorder};
                border-radius: 16px;
                padding: 20px;
                box-shadow: ${colors.sectionShadow};
            `
        });

        // Section header
        const header = new St.Label({
            text: 'Custom Layouts',
            style: `
                font-size: 11pt;
                font-weight: 600;
                color: ${colors.textMuted};
                margin-bottom: 16px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            `
        });
        section.add_child(header);

        // Custom layout cards
        const customLayouts = this._getCustomLayouts();
        const currentLayout = this._getCurrentLayout();

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
        const COLUMNS = this._customColumns;  // Use adaptive columns (5-7)
        const container = new St.BoxLayout({
            vertical: true,
            style: `spacing: ${this._ROW_GAP}px;`
        });

        let currentRow = null;
        const templateCount = this._templateManager.getBuiltinTemplates().length;
        
        layouts.forEach((layout, index) => {
            const col = index % COLUMNS;

            if (col === 0) {
                currentRow = new St.BoxLayout({
                    vertical: false,
                    style: `spacing: ${this._CARD_GAP}px; padding-left: ${this._GRID_ROW_PADDING_LEFT}px; padding-right: ${this._GRID_ROW_PADDING_RIGHT}px; padding-top: ${this._GRID_ROW_PADDING_TOP}px; padding-bottom: ${this._GRID_ROW_PADDING_BOTTOM}px;`
                });
                container.add_child(currentRow);
            }

            const cardIndex = templateCount + index;
            const card = this._createCustomLayoutCard(layout, currentLayout, cardIndex);
            currentRow.add_child(card);
            this._allCards.push({ card, layout, isTemplate: false });
        });

        return container;
    }

    /**
     * Create a custom layout card with zone preview and hover bar
     * @private
     */
    _createCustomLayoutCard(layout, currentLayout, cardIndex) {
        const colors = this._themeManager.getColors();
        const isActive = this._isLayoutActive(layout, currentLayout);
        const accentHex = colors.accentHex;
        const accentRGBA = colors.accentRGBA(0.3);

        const card = new St.Button({
            style_class: 'custom-layout-card',
            style: `padding: 0; ` +
                   `border-radius: 8px; ` +
                   `width: ${this._cardWidth}px; ` +
                   `height: ${this._cardHeight}px; ` +
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
        
        const preview = this._createZonePreview(
            layout.zones,
            this._previewWidth,
            this._previewHeight
        );
        
        previewContainer.set_child(preview);
        container.add_child(previewContainer);

        // Bottom bar with name and buttons
        const bottomBar = this._createCardBottomBar(layout.name, false, layout);
        container.add_child(bottomBar);

        card.set_child(container);

        // Click to apply
        card.connect('clicked', () => {
            this._onLayoutClicked(layout);
        });

        // Store bottom bar reference for hover handling
        card._bottomBar = bottomBar;
        card._nameLabel = bottomBar._nameLabel;
        card._buttonBox = bottomBar._buttonBox;
        card._isActive = isActive;

        // Hover effects for card border + bottom bar transition
        card.connect('enter-event', () => {
            if (!isActive) {
                const c = this._themeManager.getColors();
                card.style = `padding: 0; border-radius: 8px; ` +
                            `width: ${this._cardWidth}px; height: ${this._cardHeight}px; ` +
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
                const c = this._themeManager.getColors();
                card.style = `padding: 0; border-radius: 8px; ` +
                            `width: ${this._cardWidth}px; height: ${this._cardHeight}px; ` +
                            `overflow: hidden; ` +
                            `background-color: ${c.cardBg}; border: 2px solid transparent;`;
            }
            // Smooth transition: fade out background to default opacity, show name, hide buttons
            card._bottomBar._background.ease({
                opacity: this._CARD_BOTTOM_BAR_DEFAULT_OPACITY,
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
     * @param {string} name - Layout name to display
     * @param {boolean} isTemplate - True for template cards, false for custom layouts
     * @param {object} layout - Layout object for button handlers
     * @private
     */
    _createCardBottomBar(name, isTemplate, layout) {
        const colors = this._themeManager.getColors();
        const accentRGB = colors.accentRGBA(0.6);
        
        const bottomBar = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            style: 'height: 32px;',
            y_align: Clutter.ActorAlign.END,
            x_expand: true
        });

        // Background in accent color - subtle by default, more opaque on hover
        const background = new St.Bin({
            style: `background-color: ${accentRGB}; ` +
                   'border-radius: 0 0 6px 6px;',
            x_expand: true,
            y_expand: true,
            opacity: this._CARD_BOTTOM_BAR_DEFAULT_OPACITY
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
                this._onEditTemplateClicked(layout);
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
                this._onEditLayoutClicked(layout);
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
                this._onDeleteClicked(layout);
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
     * @private
     */
    _createZonePreview(zones, width, height) {
        const colors = this._themeManager.getColors();
        
        const canvas = new St.DrawingArea({
            style: `background-color: ${colors.canvasBg};`,
            x_expand: true,
            y_expand: true
        });

        const accentColor = colors.accent;

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
     * Create "Create new layout" button
     * @private
     */
    _createNewLayoutButton() {
        const colors = this._themeManager.getColors();
        const accentHex = colors.accentHex;
        const accentHexHover = colors.accentHexHover;

        const button = new St.Button({
            style_class: 'create-new-button',
            style: `padding: 16px 32px; ` +
                   `background-color: ${accentHex}; ` +
                   `border-radius: 8px; ` +
                   `margin-top: 16px;`,
            x_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            track_hover: true
        });

        const label = new St.Label({
            text: '✚ Create new layout',
            style: 'color: white; font-size: 13pt; font-weight: bold;'
        });
        button.set_child(label);

        button.connect('clicked', () => {
            this._onCreateNewLayoutClicked();
        });

        // Hover effects
        button.connect('enter-event', () => {
            button.style = `padding: 16px 32px; ` +
                          `background-color: ${accentHexHover}; ` +
                          `border-radius: 8px; ` +
                          `margin-top: 16px;`;
        });

        button.connect('leave-event', () => {
            button.style = `padding: 16px 32px; ` +
                          `background-color: ${accentHex}; ` +
                          `border-radius: 8px; ` +
                          `margin-top: 16px;`;
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
     * Get all custom (user-created) layouts
     * @private
     */
    _getCustomLayouts() {
        const allLayouts = this._layoutManager.getAllLayouts();
        // Filter out templates (templates have specific IDs like 'halves', 'thirds', etc.)
        return allLayouts.filter(layout => layout.id && layout.id.startsWith('layout-'));
    }

    /**
     * Check if a layout is currently active
     * @private
     */
    _isLayoutActive(layout, currentLayout) {
        if (!currentLayout || !layout) return false;
        return layout.id === currentLayout.id;
    }

    /**
     * Handle template click - apply immediately
     * @private
     */
    _onTemplateClicked(template) {
        logger.info(`Template clicked: ${template.name}`);

        // Create layout from template
        const layout = this._templateManager.createLayoutFromTemplate(template.id);
        
        this._applyLayout(layout);
        this._zoneOverlay.showMessage(`Switched to: ${template.name}`);

        this.hide();
    }

    /**
     * Handle workspace selection
     * @private
     */
    _onWorkspaceSelected(workspaceIndex) {
        this._currentWorkspace = workspaceIndex;
        logger.debug(`Switched to workspace ${workspaceIndex} in editor`);

        const colors = this._themeManager.getColors();

        // Update workspace card styles with 16:9 design using dynamically calculated dimensions
        this._workspaceButtons.forEach((card, index) => {
            const isActive = index === workspaceIndex;
            
            // Update card style
            card.style = `width: ${this._cardWidth}px; ` +
                   `height: ${this._cardHeight}px; ` +
                   `background: ${isActive ? colors.workspaceCardBgActive : colors.workspaceCardBg}; ` +
                   `border: 2px solid ${isActive ? colors.accentHex : colors.borderLight}; ` +
                   `border-radius: 6px; ` +
                   `position: relative; ` +
                   `${isActive ? `box-shadow: 0 0 16px ${colors.accentRGBA(0.4)};` : ''}`;
            
            // Update label and badge colors
            const container = card.get_child();
            const children = container.get_children();
            const cardContent = children[0]; // First child is the content box
            const badge = children[1]; // Second child is the badge
            
            const label = cardContent.get_children()[0]; // Label inside content box
            label.style = `font-size: 14px; ` +
                         `font-weight: 500; ` +
                         `color: ${isActive ? colors.accentHex : colors.textMuted};`;
            
            badge.style = `position: absolute; ` +
                         `top: 8px; ` +
                         `left: 8px; ` +
                         `font-size: 11px; ` +
                         `opacity: 0.7; ` +
                         `color: ${isActive ? colors.accentHex : colors.textMuted};`;
        });

        // Refresh the layout display to show current workspace's layout
        this._refreshDialog();
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
     * Handle edit layout click - open settings dialog
     * @private
     */
    _onEditLayoutClicked(layout) {
        logger.info(`Edit layout clicked: ${layout.name}`);

        this.hide();

        const settingsDialog = new LayoutSettingsDialog(
            layout,
            this._layoutManager,
            this._settings,
            (updatedLayout) => {
                // Layout was saved or deleted
                logger.info(`Settings dialog completed for: ${layout.name}`);
                this.show(); // Reopen switcher
            },
            () => {
                // Canceled
                logger.info('Settings dialog canceled');
                this.show(); // Reopen switcher
            }
        );
        settingsDialog.open();
    }

    /**
     * Handle edit template click - create duplicate and open editor
     * @private
     */
    _onEditTemplateClicked(template) {
        logger.info(`Edit template clicked: ${template.name} - creating duplicate`);

        // Create a copy of the template
        const newLayout = {
            id: `layout-${Date.now()}`,
            name: `${template.name} - Copy`,
            zones: JSON.parse(JSON.stringify(template.zones))
        };

        // Save the new layout
        this._layoutManager.saveLayout(newLayout);

        // Close switcher and open ZoneEditor with new layout
        this.hide();

        logger.info(`Created duplicate layout: ${newLayout.name}`);
        this._zoneOverlay.showMessage(`Created: ${newLayout.name}`);

        // Open settings dialog for the new layout
        const settingsDialog = new LayoutSettingsDialog(
            newLayout,
            this._layoutManager,
            this._settings,
            (updatedLayout) => {
                logger.info(`Duplicate layout saved: ${updatedLayout ? updatedLayout.name : 'deleted'}`);
                this.show(); // Reopen switcher
            },
            () => {
                logger.info('Duplicate layout editing canceled');
                this.show(); // Reopen switcher
            }
        );
        settingsDialog.open();
    }

    /**
     * Handle delete layout click - show confirmation
     * @private
     */
    _onDeleteClicked(layout) {
        logger.info(`Delete clicked for layout: ${layout.name}`);
        
        // TODO: Implement confirmation dialog and actual deletion
        // For prototype, just log
        logger.warn('Delete not yet implemented - this is a prototype');
        this._zoneOverlay.showMessage(`Delete feature coming soon`);
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
        const wasSelectedIndex = this._selectedCardIndex;
        
        this.hide();
        
        this._currentWorkspace = wasWorkspace;
        this.show();
        
        // Try to restore selection
        if (wasSelectedIndex >= 0 && wasSelectedIndex < this._allCards.length) {
            this._selectedCardIndex = wasSelectedIndex;
            this._updateCardFocus();
        }
    }

    /**
     * Connect keyboard event handlers
     * @private
     */
    _connectKeyEvents() {
        this._keyPressId = global.stage.connect('key-press-event', (actor, event) => {
            const symbol = event.get_key_symbol();
            const modifiers = event.get_state();

            switch (symbol) {
                case Clutter.KEY_Escape:
                    this.hide();
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Return:
                case Clutter.KEY_KP_Enter:
                    // Apply selected card or first card if none selected
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
                    // Navigate up (by 4 for grid layout)
                    this._navigateCards(-4);
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Down:
                    // Navigate down (by 4 for grid layout)
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
                    // Quick select by number (1-9)
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
     * @param {number} delta - Direction to navigate (-1 = left, 1 = right, -4 = up, 4 = down)
     * @private
     */
    _navigateCards(delta) {
        if (this._allCards.length === 0) return;

        // Initialize selection if none
        if (this._selectedCardIndex < 0) {
            this._selectedCardIndex = 0;
        } else {
            // Move selection
            let newIndex = this._selectedCardIndex + delta;
            
            // Wrap around
            if (newIndex < 0) {
                newIndex = this._allCards.length - 1;
            } else if (newIndex >= this._allCards.length) {
                newIndex = 0;
            }
            
            this._selectedCardIndex = newIndex;
        }

        // Update visual focus
        this._updateCardFocus();
    }

    /**
     * Update visual focus indicator on cards
     * @private
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
                // Focused card - use box-shadow for rounded focus indicator
                cardObj.card.style = `padding: 0; border-radius: 8px; ` +
                                    `width: ${this._cardWidth}px; height: ${this._cardHeight}px; ` +
                                    `background-color: ${accentRGBAFocus}; ` +
                                    `border: 2px solid ${accentHex}; ` +
                                    `box-shadow: 0 0 0 3px ${accentHex}, 0 4px 12px rgba(0, 0, 0, 0.3);`;
            } else if (isActive) {
                // Active but not focused
                cardObj.card.style = `padding: 0; border-radius: 8px; ` +
                                    `width: ${this._cardWidth}px; height: ${this._cardHeight}px; ` +
                                    `background-color: ${accentRGBAActive}; ` +
                                    `border: 2px solid ${accentHex};`;
            } else {
                // Normal state
                cardObj.card.style = `padding: 0; border-radius: 8px; ` +
                                    `width: ${this._cardWidth}px; height: ${this._cardHeight}px; ` +
                                    `background-color: ${colors.cardBg}; ` +
                                    `border: 2px solid transparent;`;
            }
        });
    }

    /**
     * Apply layout at given card index
     * @param {number} index - Index in _allCards array
     * @private
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
     * @private
     */
    _disconnectKeyEvents() {
        if (this._keyPressId) {
            global.stage.disconnect(this._keyPressId);
            this._keyPressId = null;
        }
    }

    /**
     * Handle create new layout click
     * @private
     */
    _onCreateNewLayoutClicked() {
        logger.info("Create new layout clicked");

        this.hide();

        const settingsDialog = new LayoutSettingsDialog(
            null, // New layout
            this._layoutManager,
            this._settings,
            (newLayout) => {
                if (newLayout) {
                    // Layout was saved, apply it
                    logger.info(`New layout created: ${newLayout.name}`);
                    this._applyLayout(newLayout);
                }
                this.show(); // Reopen switcher
            },
            () => {
                // Canceled
                logger.info("Create new layout canceled");
                this.show(); // Reopen switcher
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
