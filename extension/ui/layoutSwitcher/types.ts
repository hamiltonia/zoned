/**
 * Type definitions for LayoutSwitcher module split
 *
 * Provides the LayoutSwitcherContext interface that describes the contract
 * between LayoutSwitcher and its external modules (sectionFactory, topBar, etc.)
 */

import type St from '@girs/st-14';
import type {TemplateManager} from '../../templateManager';
import type {ThemeManager} from '../../utils/theme';
import type {LayoutPreviewBackground} from '../layoutPreviewBackground';
import type {Layout} from '../../types/layout';
import type {Zone} from '../../types/zone';

/**
 * Builtin template definition
 */
export interface BuiltinTemplate {
    name: string;
    id: string;
    zones?: Zone[];
    shortcut?: string | number | null;
}

/**
 * Theme colors from ThemeManager
 */
export interface ThemeColors {
    sectionBg: string;
    sectionBorder: string;
    sectionShadow: string;
    textMuted: string;
    textPrimary: string;
    textSecondary: string;
    inputBg: string;
    divider: string;
    accentHex: string;
    accentHexHover: string;
    cardBg: string;
    borderLight: string;
    menuBg: string;
    menuBorder: string;
    menuItemBg: string;
    menuItemBgHover: string;
    menuItemBgActive: string;
    monitorIconBg: string;
    monitorIconBorder: string;
    buttonBg: string;
    buttonText: string;
    isDark: boolean;
    accentRGBA: (opacity: number) => string;
}

/**
 * Calculated spacing values from tier configuration
 */
export interface CalculatedSpacing {
    containerPadding: number;
    sectionPadding: number;
    sectionGap: number;
    cardGap: number;
    rowGap: number;
    scrollbarReserve: number;
    topBarHeight: number;
    sectionHeaderHeight: number;
    sectionHeaderMargin: number;
    createButtonHeight: number;
    createButtonMargin: number;
    internalMargin: number;
    dialogWidth: number;
    dialogHeight: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _dims?: any;
}

/**
 * Tier configuration
 */
export interface TierConfig {
    name: string;
    cardRadius: number;
    workspaceThumb: {
        w: number;
        h: number;
    };
    workspaceThumbGap?: number;
}

/**
 * Card object stored in _allCards array
 */
export interface CardObject {
    card: St.Widget;
    layout: Layout | BuiltinTemplate;
    isTemplate: boolean;
}

/**
 * Interface describing the LayoutSwitcher context needed by external modules.
 * This interface exposes only the properties and methods that external modules
 * (sectionFactory, topBar, resizeHandler, cardFactory) need to access.
 *
 * Properties prefixed with underscore are internal but exposed for module access.
 */
export interface LayoutSwitcherContext {
    // Managers
    _themeManager: ThemeManager;
    _templateManager: TemplateManager;
    _layoutManager: {
        getExtensionPath: () => string;
        getSpatialStateManager: () => {
            makeKey: (monitorIndex: number, workspaceIndex: number) => string;
        } | null;
        getLayoutForSpace: (spaceKey: string) => Layout | null;
        setLayoutForSpace: (spaceKey: string, layoutId: string) => void;
        setLayout: (layoutId: string) => void;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
    };
    _settings: {
        get_boolean: (key: string) => boolean;
        get_int: (key: string) => number;
        set_boolean: (key: string, value: boolean) => void;
        set_int: (key: string, value: number) => void;
    };
    _signalTracker: {
        connect: (obj: unknown, signal: string, callback: (...args: any[]) => unknown) => number | null;
        disconnect: (id: number) => void;
    };

    // UI State
    _debugMode: boolean;
    _currentWorkspace: number;
    _selectedMonitorIndex: number | undefined;
    _applyGlobally: boolean | undefined;
    _selectedCardIndex: number;
    _allCards: CardObject[];
    _workspaceButtons: St.Button[];

    // Dimensions and Spacing
    _cardWidth: number;
    _cardHeight: number;
    _previewWidth: number;
    _previewHeight: number;
    _cardRadius: number;
    _customColumns: number;
    _currentTier: TierConfig;
    _calculatedSpacing: CalculatedSpacing;

    // Spacing constants (exposed for external modules)
    _SECTION_BORDER_RADIUS: number;
    _SECTION_PADDING: number;
    _SECTION_TITLE_SIZE: string;
    _CARD_GAP: number;
    _GRID_ROW_PADDING_TOP: number;
    _GRID_ROW_PADDING_BOTTOM: number;
    _CARD_LABEL_SIZE: string;
    _ROW_GAP: number;

    // Resize state (for resizeHandler)
    _isResizing: boolean;
    _resizeCorner: string | null;
    _resizeStartX: number;
    _resizeStartY: number;
    _resizeStartWidth: number;
    _resizeStartHeight: number;
    _currentDialogWidth: number | null;
    _currentDialogHeight: number | null;
    _MIN_DIALOG_WIDTH: number;
    _MIN_DIALOG_HEIGHT: number;
    _container?: St.BoxLayout;
    _resizeHandles: Record<string, St.Widget>;
    _resizeMotionId?: number | null;
    _resizeButtonReleaseId?: number | null;
    _overrideDialogWidth: number | null;
    _overrideDialogHeight: number | null;

    // UI Elements (for topBar)
    _dialog: St.Widget | null;
    _previewBackground?: LayoutPreviewBackground;
    _customLayoutsScrollView?: St.ScrollView | null;
    _applyGloballyCheckbox?: St.Bin;
    _monitorPillBtn?: St.Button;
    _monitorPillLabel?: St.Label;
    _monitorDropdownContainer?: St.BoxLayout;
    _monitorMenu?: St.BoxLayout;
    _monitorPillContainer?: St.BoxLayout;
    _spacesSection?: St.BoxLayout;
    _workspaceScrollView?: St.ScrollView;
    _workspaceThumbnailsContainer?: St.BoxLayout;

    // Bound method handlers (for signal connections)
    _boundHandleWorkspaceScroll?: (actor: unknown, event: unknown) => number;
    _boundHandleMonitorPillEnter?: (pill: unknown) => number;
    _boundHandleMonitorPillLeave?: (pill: unknown) => number;
    _boundHandleMonitorPillClick?: (pill: unknown) => number;
    _boundHandleGlobalCheckboxLabelClick?: () => number;
    _boundHandleGlobalCheckboxClick?: () => number;
    _boundHandleCardClick: (card: unknown) => boolean;
    _boundHandleCardEnter: (card: unknown) => boolean;
    _boundHandleCardLeave: (card: unknown) => boolean;
    _boundHandleCardScroll: () => boolean;

    // Methods called by external modules
    _getCurrentLayout: () => Layout | null;
    _getCustomLayouts: () => Layout[];
    _getLayoutForWorkspace: (workspaceIndex: number) => Layout | null;
    _isLayoutActive: (layout: Layout | BuiltinTemplate, currentLayout: Layout | null) => boolean;
    _onCreateNewLayoutClicked: () => void;
    _onEditTemplateClicked: (template: BuiltinTemplate) => void;
    _onEditLayoutClicked: (layout: Layout) => void;
    _onDeleteClicked: (layout: Layout) => void;
    _onCardHover?: (layout: Layout | BuiltinTemplate) => void;
    _onCardHoverEnd?: () => void;
    _addDebugRect: (widget: St.Widget, type: string, label: string) => void;
    _updateCardFocus: () => void;
    _refreshDialog: () => void;
    hide: () => void;
    show: () => void;
}
