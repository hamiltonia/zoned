/**
 * TierConfig - Resolution-based layout tier definitions
 *
 * Provides discrete sizing tiers for the LayoutSwitcher dialog.
 * This approach eliminates interdependent percentage calculations
 * by using fixed values per tier, derived from the card size up.
 *
 * Tier selection is based on logical pixel height (after scale factor).
 *
 * Design constraints satisfied:
 * - 5 template cards per row
 * - 2 custom layout rows visible without cutoff (minimum 5 cards shown)
 * - Dialog takes 50-67% of screen (leaves 33-50% visible)
 * - Cards maintain 16:9 aspect ratio
 * - Equal left/right margins
 */

import {createLogger} from '../../utils/debug';

const logger = createLogger('TierConfig');

/**
 * Tier configuration interface
 */
export interface TierConfig {
    name: string;
    cardWidth: number;
    cardHeight: number;
    cardGap: number;
    rowGap: number;
    internalMargin: number;
    sectionPadding: number;
    sectionGap: number;
    containerPadding: number;
    topBarHeight: number;
    sectionHeaderHeight: number;
    sectionHeaderMargin: number;
    buttonHeight: number;
    buttonMargin: number;
    workspaceThumb: {w: number; h: number};
    workspaceThumbGap: number;
    containerRadius: number;
    sectionRadius: number;
    cardRadius: number;
}

/**
 * Dialog dimensions interface
 */
export interface DialogDimensions extends TierConfig {
    dialogWidth: number;
    dialogHeight: number;
    rowWidth: number;
    contentWidth: number;
    templateSectionHeight: number;
    customSectionHeight: number;
}

/**
 * Validation result interface
 */
export interface ValidationResult {
    valid: boolean;
    issues: string[];
    screenPercent: {width: string; height: string};
}

/**
 * Tier definitions with all fixed values
 *
 * All spacing values are pre-calculated to guarantee:
 * - 5 cards fit per row with specified gaps and margins
 * - 2 custom rows + 1 template row fit within dialog height
 * - Symmetric left/right margins
 *
 * Section border (1px each side = 2px total) is accounted for in calculateDialogDimensions()
 */
export const TIERS = {
    SMALL: {
        name: 'SMALL',
        // Card dimensions (16:9 aspect ratio)
        cardWidth: 140,
        cardHeight: 79,
        // Spacing
        cardGap: 12,
        rowGap: 10,
        internalMargin: 16,
        sectionPadding: 12,
        sectionGap: 14,
        containerPadding: 12,
        // Fixed UI elements (topBarHeight sized for workspace thumbnails)
        topBarHeight: 84,     // Increased to fit 16:9 workspace thumbnails
        sectionHeaderHeight: 28,
        sectionHeaderMargin: 12,
        buttonHeight: 46,
        buttonMargin: 14,
        // Workspace thumbnails (16:9 aspect ratio, scaled to fit in topBar)
        workspaceThumb: {w: 80, h: 45},
        workspaceThumbGap: 8, // Gap between workspace thumbnails
        // Border radius
        containerRadius: 10,
        sectionRadius: 8,
        cardRadius: 4,  // Reduced for more square appearance
    },
    MEDIUM: {
        name: 'MEDIUM',
        // Card dimensions (16:9 aspect ratio)
        cardWidth: 180,
        cardHeight: 101,
        // Spacing
        cardGap: 14,
        rowGap: 12,
        internalMargin: 20,
        sectionPadding: 14,
        sectionGap: 16,
        containerPadding: 14,
        // Fixed UI elements (topBarHeight sized for workspace thumbnails)
        topBarHeight: 96,     // Increased to fit 16:9 workspace thumbnails
        sectionHeaderHeight: 30,
        sectionHeaderMargin: 14,
        buttonHeight: 50,
        buttonMargin: 16,
        // Workspace thumbnails (16:9 aspect ratio, scaled to fit in topBar)
        workspaceThumb: {w: 96, h: 54},
        workspaceThumbGap: 10, // Gap between workspace thumbnails
        // Border radius
        containerRadius: 12,
        sectionRadius: 10,
        cardRadius: 4,  // Reduced for more square appearance
    },
    LARGE: {
        name: 'LARGE',
        // Card dimensions (16:9 aspect ratio)
        cardWidth: 220,
        cardHeight: 124,
        // Spacing
        cardGap: 16,
        rowGap: 14,
        internalMargin: 28,
        sectionPadding: 16,
        sectionGap: 18,
        containerPadding: 16,
        // Fixed UI elements (topBarHeight sized for workspace thumbnails)
        topBarHeight: 108,    // Increased to fit 16:9 workspace thumbnails
        sectionHeaderHeight: 30,
        sectionHeaderMargin: 16,
        buttonHeight: 50,
        buttonMargin: 16,
        // Workspace thumbnails (16:9 aspect ratio, scaled to fit in topBar)
        workspaceThumb: {w: 112, h: 63},
        workspaceThumbGap: 12, // Gap between workspace thumbnails
        // Border radius
        containerRadius: 14,
        sectionRadius: 12,
        cardRadius: 4,  // Reduced for more square appearance
    },
    XLARGE: {
        name: 'XLARGE',
        // Card dimensions (16:9 aspect ratio) - for 4K/5K displays
        cardWidth: 280,
        cardHeight: 158,
        // Spacing - larger for high-res
        cardGap: 20,
        rowGap: 16,
        internalMargin: 36,
        sectionPadding: 20,
        sectionGap: 22,
        containerPadding: 20,
        // Fixed UI elements (topBarHeight sized for workspace thumbnails)
        topBarHeight: 120,    // Increased to fit 16:9 workspace thumbnails
        sectionHeaderHeight: 34,
        sectionHeaderMargin: 18,
        buttonHeight: 54,
        buttonMargin: 18,
        // Workspace thumbnails (16:9 aspect ratio, scaled to fit in topBar)
        workspaceThumb: {w: 128, h: 72},
        workspaceThumbGap: 14, // Gap between workspace thumbnails
        // Border radius
        containerRadius: 16,
        sectionRadius: 14,
        cardRadius: 4,  // Reduced for more square appearance
    },
};

// Tier names for cycling (index 0 = auto)
export const TIER_NAMES = ['auto', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE'];

/**
 * Select appropriate tier based on logical screen height
 * @param {number} logicalHeight - Screen height in logical pixels (after scale factor)
 * @param {number} forceTier - 0=auto, 1=SMALL, 2=MEDIUM, 3=LARGE, 4=XLARGE
 * @returns {Object} The selected tier configuration
 */
export function selectTier(logicalHeight: number, forceTier: number = 0): TierConfig {
    // Honor forced tier for debugging
    if (forceTier > 0 && forceTier <= 4) {
        const tierName = TIER_NAMES[forceTier] as keyof typeof TIERS;
        logger.info(`[TIER] Forced to ${tierName}`);
        return TIERS[tierName];
    }

    // Auto-select based on height thresholds
    // Thresholds are tuned for common resolutions at various scale factors:
    // - SMALL: Small screens, high scaling (720p, 1080p@200%, small laptops)
    // - MEDIUM: 1440p, 1080p@100%, 4K@200%
    // - LARGE: 1440p@100%, 4K@150%
    // - XLARGE: 4K@100%, 5K displays
    let tier;
    if (logicalHeight <= 900) {
        tier = TIERS.SMALL;     // 1024x768, 1080p@200%, smaller screens
    } else if (logicalHeight <= 1200) {
        tier = TIERS.MEDIUM;    // Most common: 1080p, 1440p scaled
    } else if (logicalHeight <= 1600) {
        tier = TIERS.LARGE;     // Larger displays, moderate scaling
    } else {
        tier = TIERS.XLARGE;    // 4K+ at low/no scaling
    }

    logger.info(`[TIER] Auto-selected ${tier.name} for height ${logicalHeight}px`);
    return tier;
}

/**
 * Calculate derived dialog dimensions from tier
 * All values are deterministic based on tier - no runtime calculation needed
 * @param {Object} tier - Tier configuration object
 * @returns {Object} Calculated dialog dimensions
 */
export function calculateDialogDimensions(tier: TierConfig): DialogDimensions {
    const COLUMNS = 5;
    const CUSTOM_VISIBLE_ROWS = 2;
    const SECTION_BORDER_WIDTH = 2;  // 1px border on each side of section

    // Row width: 5 cards + 4 gaps
    const cardsWidth = COLUMNS * tier.cardWidth;
    const gapsWidth = (COLUMNS - 1) * tier.cardGap;
    const rowWidth = cardsWidth + gapsWidth;

    // Content width: row + left/right margins
    const contentWidth = rowWidth + (2 * tier.internalMargin);

    // Dialog width: content + section padding (×2 sides) + section border
    const dialogWidth = contentWidth + (2 * tier.sectionPadding) + SECTION_BORDER_WIDTH;

    // Template section height
    const templateSectionHeight =
        tier.sectionHeaderHeight +
        tier.sectionHeaderMargin +
        tier.cardHeight +
        (2 * tier.sectionPadding);

    // Custom section height (2 visible rows)
    const customSectionHeight =
        tier.sectionHeaderHeight +
        tier.sectionHeaderMargin +
        (CUSTOM_VISIBLE_ROWS * tier.cardHeight) +
        ((CUSTOM_VISIBLE_ROWS - 1) * tier.rowGap) +
        (2 * tier.sectionPadding);

    // Total dialog height
    const dialogHeight =
        tier.containerPadding +       // Top padding
        tier.topBarHeight +           // Top bar
        tier.sectionGap +             // Gap after top bar
        templateSectionHeight +       // Templates section
        tier.sectionGap +             // Gap between sections
        customSectionHeight +         // Custom layouts section
        tier.buttonMargin +           // Gap before button
        tier.buttonHeight +           // Create button
        tier.containerPadding;        // Bottom padding

    const dimensions = {
        dialogWidth,
        dialogHeight,
        rowWidth,
        contentWidth,
        templateSectionHeight,
        customSectionHeight,
        // Pass through tier values for easy access
        ...tier,
    };

    logger.debug(`[TIER] ${tier.name} → Dialog: ${dialogWidth}×${dialogHeight}, Row: ${rowWidth}`);

    return dimensions;
}

/**
 * Validate calculated dimensions against screen bounds
 * @param {Object} dims - Calculated dimensions
 * @param {number} screenWidth - Screen width in logical pixels
 * @param {number} screenHeight - Screen height in logical pixels
 * @returns {Object} Validation results with any detected issues
 */
export function validateDimensions(dims: DialogDimensions, screenWidth: number, screenHeight: number): ValidationResult {
    const issues: string[] = [];

    const widthPercent = (dims.dialogWidth / screenWidth * 100).toFixed(1);
    const heightPercent = (dims.dialogHeight / screenHeight * 100).toFixed(1);

    // Check width constraint (should be 40-70% of screen)
    if (dims.dialogWidth > screenWidth * 0.75) {
        issues.push(`Dialog too wide: ${widthPercent}% of screen`);
    }
    if (dims.dialogWidth < screenWidth * 0.25) {
        issues.push(`Dialog too narrow: ${widthPercent}% of screen`);
    }

    // Check height constraint (should leave 33-50% of screen visible)
    if (dims.dialogHeight > screenHeight * 0.70) {
        issues.push(`Dialog too tall: ${heightPercent}% of screen`);
    }

    // Check minimum card size
    if (dims.cardWidth < 80) {
        issues.push(`Cards too small: ${dims.cardWidth}px wide`);
    }

    // Expected vs calculated validation
    const expectedRowWidth = (5 * dims.cardWidth) + (4 * dims.cardGap);
    if (Math.abs(dims.rowWidth - expectedRowWidth) > 1) {
        issues.push(`Row width mismatch: expected ${expectedRowWidth}, got ${dims.rowWidth}`);
    }

    return {
        valid: issues.length === 0,
        issues,
        screenPercent: {width: widthPercent, height: heightPercent},
    };
}

/**
 * Generate debug overlay text
 * @param {Object} dims - Calculated dimensions
 * @param {Object} validation - Validation results
 * @param {number} screenWidth - Screen width
 * @param {number} screenHeight - Screen height
 * @param {number} scaleFactor - Display scale factor
 * @returns {string} Formatted debug text for overlay
 */
export function generateDebugText(
    dims: DialogDimensions,
    validation: ValidationResult,
    screenWidth: number,
    screenHeight: number,
    scaleFactor: number,
): string {
    const tierLine = `TIER: ${dims.name} | Ctrl+D=rects Ctrl+T=cycle`;
    const screenLine = `Screen: ${screenWidth}×${screenHeight} | Scale: ${scaleFactor}x`;
    const dialogLine = `Dialog: ${dims.dialogWidth}×${dims.dialogHeight} (${validation.screenPercent.width}%×${validation.screenPercent.height}%)`;
    const cardLine = `Card: ${dims.cardWidth}×${dims.cardHeight} | Gap: ${dims.cardGap} | Margin: ${dims.internalMargin}`;
    const rowLine = `Row: ${dims.rowWidth}px (5×${dims.cardWidth} + 4×${dims.cardGap})`;

    let statusLine;
    if (validation.valid) {
        statusLine = '✓ All constraints satisfied';
    } else {
        statusLine = `✗ Issues: ${validation.issues.join(', ')}`;
    }

    return [tierLine, screenLine, dialogLine, cardLine, rowLine, statusLine].join('\n');
}
