/**
 * Core type definitions for layouts and zones
 */

/**
 * Zone definition - rectangular area within a layout
 * All dimensions are percentages (0.0 - 1.0)
 */
export interface Zone {
    name?: string;    // Optional zone name for display
    x: number;        // Left position (0.0 = left edge, 1.0 = right edge)
    y: number;        // Top position (0.0 = top edge, 1.0 = bottom edge)
    w: number;        // Width (0.0 = zero width, 1.0 = full width)
    h: number;        // Height (0.0 = zero height, 1.0 = full height)
}

/**
 * Layout type discriminator
 * - 'grid': Zones tile the screen with 100% coverage, no overlaps (default)
 * - 'canvas': Free-form zones that can overlap, leave gaps, or cover partial screen
 */
export type LayoutType = 'grid' | 'canvas';

/**
 * Layout definition - collection of zones for window placement
 */
export interface Layout {
    id: string;
    name: string;
    type?: LayoutType;     // Layout type ('grid' or 'canvas', defaults to 'grid')
    zones: Zone[];
    editable?: boolean;
    isTemplate?: boolean;
    padding?: number;      // Optional padding in pixels
    shortcut?: string | number | null;  // Optional quick layout shortcut (1-9)
    metadata?: {
        createdDate?: number;
        modifiedDate?: number;
        [key: string]: unknown;
    };
}

/**
 * Built-in template definition
 * Templates define reusable zone configurations
 */
export interface BuiltinTemplate {
    id: string;              // Template identifier
    name: string;            // Template display name
    type?: LayoutType;       // Layout type ('grid' or 'canvas', defaults to 'grid')
    icon?: string;           // Optional icon character
    description: string;     // Human-readable description
    zones: Zone[];           // Template zone configuration
}
