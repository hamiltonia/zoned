/**
 * Zone type definitions
 */

import type {Layout} from './layout.js';

export interface Zone {
    x: number;
    y: number;
    w: number;
    h: number;
}

export type ZoneOverlay = any; //  Placeholder - will be typed when UI is migrated

export {Layout};
