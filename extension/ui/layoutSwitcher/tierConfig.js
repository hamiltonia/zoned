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

import {createLogger} from '../../utils/debug.js';

const logger = createLogger('TierConfig');

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
    TINY: {
        name: 'TINY',
        // Card dimensions (16:9 aspect ratio)
        cardWidth: 90,
        cardHeight: 51,
        // Spacing
        cardGap: 8,           // Gap between cards in a row
        rowGap: 8,            // Gap between rows in custom section
        internalMargin: 10,   // Left/right margin inside sections (for card centering)
        sectionPadding: 8,    // Padding inside section containers
        sectionGap: 12,       // Gap between sections (templates, custom)
        containerPadding: 8,  // Top/bottom padding of main dialog container
        // Fixed UI elements (topBarHeight sized for workspace thumbnails)
        topBarHeight: 72,     // Increased to fit 16:9 workspace thumbnails
        sectionHeaderHeight: 24,
        sectionHeaderMargin: 8,
        buttonHeight: 40,
        buttonMargin: 12,
        // Workspace thumbnails (16:9 aspect ratio, scaled to fit in topBar)
        workspaceThumb: {w: 64, h: 36},
        workspaceThumbGap: 6, // Gap between workspace thumbnails
        // Border radius
        containerRadius: 8,
        sectionRadius: 6,
        cardRadius: 4,  // Reduced for more square appearance
    },
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
export const TIER_NAMES = ['auto', 'TINY', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE'];

/**
 * Select appropriate tier based on logical screen height
 * @param {number} logicalHeight - Screen height in logical pixels (after scale factor)
 * @param {number} forceTier - 0=auto, 1=TINY, 2=SMALL, 3=MEDIUM, 4=LARGE, 5=XLARGE
 * @returns {Object} The selected tier configuration
 */
export function selectTier(logicalHeight, forceTier = 0) {
    // Honor forced tier for debugging
    if (forceTier > 0 && forceTier <= 5) {
        const tierName = TIER_NAMES[forceTier];
        logger.info(`[TIER] Forced to ${tierName}`);
        return TIERS[tierName];
    }

    // Auto-select based on height thresholds
    // Thresholds are tuned for common resolutions at various scale factors:
    // - TINY: Very small screens or extreme scaling (e.g., 720p, 1080p@300%)
    // - SMALL: 1080p@200%, smaller laptops
    // - MEDIUM: 1440p, 1080p@100%, 4K@200%
    // - LARGE: 1440p@100%, 4K@150%
    // - XLARGE: 4K@100%, 5K displays
    let tier;
    if (logicalHeight <= 540) {
        tier = TIERS.TINY;      // 1080p@200% = 540, 720p@100% = 720
    } else if (logicalHeight <= 900) {
        tier = TIERS.SMALL;     // 1080p@100% would be 1080, but 1440@200%=720, 4K@200%=940
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
export function calculateDialogDimensions(tier) {
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
export function validateDimensions(dims, screenWidth, screenHeight) {
    const issues = [];

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
export function generateDebugText(dims, validation, screenWidth, screenHeight, scaleFactor) {
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
