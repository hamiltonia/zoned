/**
 * LayoutPreviewBackground - Full-screen layout zone preview
 *
 * Renders a non-interactive preview of zone rectangles behind modal dialogs.
 * Used by LayoutSwitcher and LayoutSettingsDialog to show a live preview
 * of the selected/hovered layout.
 *
 * Features:
 * - Multi-monitor support: shows preview on all monitors
 * - Per-space layouts: each monitor shows its own layout in per-workspace mode
 * - Full-screen zone rectangles with accent-colored borders
 * - Zone numbers displayed in each zone
 * - No edge grab handles (read-only preview)
 * - Click anywhere to dismiss (passed through to callback)
 * - Fast fade transitions between layouts
 *
 * Similar to ZoneEditor visuals but completely non-interactive.
 */

import St from '@girs/st-14';
import Clutter from '@girs/clutter-14';
import Gio from '@girs/gio-2.0';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {createLogger} from '../utils/debug';
import {ThemeManager} from '../utils/theme';
import {SignalTracker} from '../utils/signalTracker';
import type {Layout, Zone} from '../types/layout';
import type {LayoutManager} from '../layoutManager';
import type {SpatialStateManager} from '../spatialStateManager';

const logger = createLogger('LayoutPreviewBackground');

// Fast fade duration in milliseconds (for polished transitions)
const FADE_DURATION_MS = 100;

interface Monitor {
    x: number;
    y: number;
    width: number;
    height: number;
    index: number;
}

interface MonitorData {
    overlay: St.Widget;
    zoneActors: St.Widget[];
    currentLayout: Layout | null;
    monitorIndex: number;
    monitor: Monitor;
}

/**
 * Handle button-press-event on overlay to dismiss preview
 * Module-level handler (Wave 3: avoid arrow function closure)
 * @param onBackgroundClick - Callback to invoke
 * @returns Clutter.EVENT_STOP
 */
function handleOverlayButtonPress(onBackgroundClick: (() => void) | null): boolean {
    if (onBackgroundClick) {
        onBackgroundClick();
    }
    return Clutter.EVENT_STOP;
}

export class LayoutPreviewBackground {
    private _settings: Gio.Settings;
    private _themeManager: ThemeManager | null;
    private _onBackgroundClick: (() => void) | null;
    private _signalTracker: SignalTracker | null;
    private _monitorOverlays: MonitorData[];
    private _selectedMonitorIndex: number;
    private _visible: boolean;
    private _isDestroying: boolean;
    private _layoutManager: LayoutManager | null;
    private _spatialStateManager: SpatialStateManager | null;

    /**
     * Create a new layout preview background
     * @param settings - Extension settings instance
     * @param onBackgroundClick - Callback when background is clicked (to dismiss dialog)
     */
    constructor(settings: Gio.Settings, onBackgroundClick: (() => void) | null) {
        (global as any).zonedDebug?.trackInstance('LayoutPreviewBackground');
        this._settings = settings;
        this._themeManager = new ThemeManager(settings);
        this._onBackgroundClick = onBackgroundClick;

        // Initialize signal tracker for proper cleanup
        this._signalTracker = new SignalTracker('LayoutPreviewBackground');

        // Multi-monitor support: overlay and zones per monitor
        this._monitorOverlays = [];  // Array of {overlay, zoneActors, currentLayout, monitorIndex}
        this._selectedMonitorIndex = 0;
        this._visible = false;

        // Guard flag to prevent re-entrance during destroy
        this._isDestroying = false;

        // Optional references for per-space support
        this._layoutManager = null;
        this._spatialStateManager = null;

        logger.debug('LayoutPreviewBackground created');
    }

    /**
     * Set layout manager reference for per-space layout lookups
     * @param layoutManager
     */
    setLayoutManager(layoutManager: LayoutManager): void {
        this._layoutManager = layoutManager;
        this._spatialStateManager = (layoutManager as any)?.getSpatialStateManager?.() || null;
    }

    /**
     * Show the preview background on all monitors
     * @param layout - Initial layout for selected monitor (optional)
     * @param selectedMonitorIndex - Which monitor is being configured (default: current)
     */
    show(layout: Layout | null = null, selectedMonitorIndex: number | null = null): void {
        if (this._visible) {
            return;
        }

        const colors = this._themeManager!.getColors();
        const monitors = (Main.layoutManager as any).monitors as Monitor[];

        // Determine selected monitor
        if (selectedMonitorIndex !== null) {
            this._selectedMonitorIndex = selectedMonitorIndex;
        } else {
            this._selectedMonitorIndex = (Main.layoutManager as any).currentMonitor.index;
        }

        // Create overlay for each monitor
        for (let i = 0; i < monitors.length; i++) {
            const monitor = monitors[i];

            // Create full-screen overlay for this monitor
            const overlay = new St.Widget({
                reactive: true,
                x: monitor.x,
                y: monitor.y,
                width: monitor.width,
                height: monitor.height,
                style: `background-color: ${colors.modalOverlay};`,
            });

            // Click on any overlay to dismiss (Wave 3: bound method)
            const boundButtonPress = handleOverlayButtonPress.bind(null, this._onBackgroundClick);
            this._signalTracker!.connect(overlay, 'button-press-event', boundButtonPress);

            // Add to uiGroup
            (Main.uiGroup as any).add_child(overlay);

            this._monitorOverlays.push({
                overlay: overlay,
                zoneActors: [],
                currentLayout: null,
                monitorIndex: i,
                monitor: monitor,
            });
        }

        this._visible = true;

        // Set initial layout for selected monitor
        if (layout) {
            this.setLayout(layout);
        }

        // In per-space mode, show layouts for other monitors too
        this._updateOtherMonitorLayouts();

        logger.debug(`LayoutPreviewBackground shown on ${monitors.length} monitors`);
    }

    /**
     * Hide and destroy the preview background on all monitors
     */
    hide(): void {
        if (!this._visible) {
            return;
        }

        // CRITICAL: Disconnect signals FIRST to prevent callbacks during cleanup
        if (this._signalTracker) {
            this._signalTracker.disconnectAll();
        }

        // Clean up all monitor overlays
        for (const monitorData of this._monitorOverlays) {
            this._clearZonesForMonitor(monitorData);

            if (monitorData.overlay.get_parent()) {
                (Main.uiGroup as any).remove_child(monitorData.overlay);
            }
            monitorData.overlay.destroy();
        }

        this._monitorOverlays = [];
        this._visible = false;

        logger.debug('LayoutPreviewBackground hidden');
    }

    /**
     * Set visibility of overlays without destroying them
     * Used when temporarily hiding for zone editor, then restoring
     * @param visible - Whether overlays should be visible
     */
    setVisibility(visible: boolean): void {
        if (!this._visible || this._monitorOverlays.length === 0) {
            logger.warn('setVisibility called but no overlays exist');
            return;
        }

        for (const monitorData of this._monitorOverlays) {
            if (monitorData.overlay) {
                if (visible) {
                    monitorData.overlay.show();
                } else {
                    monitorData.overlay.hide();
                }
            }
        }
    }

    /**
     * Update layouts on non-selected monitors (for per-space mode)
     * @private
     */
    private _updateOtherMonitorLayouts(): void {
        const perSpaceEnabled = this._settings.get_boolean('use-per-workspace-layouts');

        if (!perSpaceEnabled || !this._layoutManager || !this._spatialStateManager) {
            return;
        }

        for (const monitorData of this._monitorOverlays) {
            if (monitorData.monitorIndex === this._selectedMonitorIndex) {
                continue;  // Selected monitor is handled by setLayout()
            }

            // Get the layout for this monitor's space
            const spaceKey = this._spatialStateManager.makeKey(monitorData.monitorIndex);
            const layout = (this._layoutManager as any).getLayoutForSpace(spaceKey);

            if (layout) {
                this._setLayoutForMonitorImmediate(monitorData, layout);
            }
        }
    }

    /**
     * Update the displayed layout on the selected monitor with a fast fade transition
     * @param layout - Layout to display (with zones array)
     */
    setLayout(layout: Layout): void {
        if (!this._visible || this._monitorOverlays.length === 0) {
            logger.warn('Cannot setLayout - preview not visible');
            return;
        }

        const monitorData = this._monitorOverlays.find(m => m.monitorIndex === this._selectedMonitorIndex);
        if (!monitorData) {
            logger.warn(`Cannot setLayout - no overlay for monitor ${this._selectedMonitorIndex}`);
            return;
        }

        // Skip if same layout
        if (monitorData.currentLayout && layout && monitorData.currentLayout.id === layout.id) {
            return;
        }

        monitorData.currentLayout = layout;

        // Fade out existing zones
        if (monitorData.zoneActors.length > 0) {
            this._fadeOutZonesForMonitor(monitorData, () => {
                this._clearZonesForMonitor(monitorData);
                if (layout && layout.zones) {
                    this._createZonesForMonitor(monitorData, layout.zones);
                    this._fadeInZonesForMonitor(monitorData);
                }
            });
        } else {
            // No existing zones, just create new ones
            this._clearZonesForMonitor(monitorData);
            if (layout && layout.zones) {
                this._createZonesForMonitor(monitorData, layout.zones);
                this._fadeInZonesForMonitor(monitorData);
            }
        }
    }

    /**
     * Set layout immediately without fade (for initial display or performance)
     * @param layout - Layout to display
     */
    setLayoutImmediate(layout: Layout): void {
        if (!this._visible || this._monitorOverlays.length === 0) {
            return;
        }

        const monitorData = this._monitorOverlays.find(m => m.monitorIndex === this._selectedMonitorIndex);
        if (!monitorData) return;

        this._setLayoutForMonitorImmediate(monitorData, layout);
    }

    /**
     * Set layout immediately for a specific monitor
     * @param monitorData - Monitor data object from _monitorOverlays
     * @param layout - Layout to display
     * @private
     */
    private _setLayoutForMonitorImmediate(monitorData: MonitorData, layout: Layout): void {
        monitorData.currentLayout = layout;
        this._clearZonesForMonitor(monitorData);

        if (layout && layout.zones) {
            this._createZonesForMonitor(monitorData, layout.zones);
            // Set full opacity immediately
            monitorData.zoneActors.forEach(actor => {
                actor.opacity = 255;
            });
        }
    }

    /**
     * Set the selected monitor index and optionally update its layout
     * @param monitorIndex - Monitor index to select
     * @param layout - Optional layout to display on that monitor
     */
    setSelectedMonitor(monitorIndex: number, layout: Layout | null = null): void {
        this._selectedMonitorIndex = monitorIndex;
        if (layout) {
            this.setLayout(layout);
        }
    }

    /**
     * Create zone actors for the given zones on a specific monitor
     * @param monitorData - Monitor data object
     * @param zones - Array of zone definitions {x, y, w, h, name}
     * @private
     */
    private _createZonesForMonitor(monitorData: MonitorData, zones: Zone[]): void {
        const monitor = monitorData.monitor;
        const isSelected = (monitorData.monitorIndex === this._selectedMonitorIndex);
        const colors = this._themeManager!.getColors();
        const accentHex = colors.accentHex;

        // Non-selected monitors get dimmed zones
        const fillOpacity = isSelected ? 0.25 : 0.12;
        const borderOpacity = isSelected ? 1.0 : 0.4;
        const accentFill = colors.accentRGBA(fillOpacity);

        zones.forEach((zone, index) => {
            // Calculate pixel coordinates relative to overlay
            const x = zone.x * monitor.width;
            const y = zone.y * monitor.height;
            const width = zone.w * monitor.width;
            const height = zone.h * monitor.height;

            // Gap between zones for visual separation
            const gap = 3;

            // Create zone widget
            const zoneActor = new St.Widget({
                x: x + gap,
                y: y + gap,
                width: width - (gap * 2),
                height: height - (gap * 2),
                style: `
                    background-color: ${accentFill};
                    border: 3px solid ${accentHex};
                    border-radius: 4px;
                    opacity: ${borderOpacity};
                `,
                opacity: 0,  // Start invisible for fade-in
            });

            // Zone number label (smaller for non-selected monitors)
            const fontSize = isSelected ? '72pt' : '36pt';
            const textOpacity = isSelected ? 1.0 : 0.6;

            const label = new St.Label({
                text: `${index + 1}`,
                style: `
                    font-size: ${fontSize};
                    color: rgba(255, 255, 255, ${textOpacity});
                    font-weight: bold;
                    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
                `,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
                y_expand: true,
            });

            // Use a Bin to center the label
            const labelBin = new St.Bin({
                x_expand: true,
                y_expand: true,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                child: label,
            });

            // Add label to zone
            zoneActor.add_child(labelBin);
            labelBin.set_position(0, 0);
            labelBin.set_size(width - (gap * 2), height - (gap * 2));

            monitorData.overlay.add_child(zoneActor);
            monitorData.zoneActors.push(zoneActor);
        });
    }

    /**
     * Clear all zone actors for a specific monitor
     * @param monitorData - Monitor data object
     * @private
     */
    private _clearZonesForMonitor(monitorData: MonitorData): void {
        monitorData.zoneActors.forEach(actor => {
            if (actor.get_parent() === monitorData.overlay) {
                monitorData.overlay.remove_child(actor);
            }
            actor.destroy();
        });
        monitorData.zoneActors = [];
    }

    /**
     * Fade in zone actors for a specific monitor
     * @param monitorData - Monitor data object
     * @private
     */
    private _fadeInZonesForMonitor(monitorData: MonitorData): void {
        monitorData.zoneActors.forEach(actor => {
            (actor as any).ease({
                opacity: 255,
                duration: FADE_DURATION_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        });
    }

    /**
     * Fade out zone actors for a specific monitor then call callback
     * @param monitorData - Monitor data object
     * @param callback - Called when fade completes
     * @private
     */
    private _fadeOutZonesForMonitor(monitorData: MonitorData, callback: () => void): void {
        if (monitorData.zoneActors.length === 0) {
            callback();
            return;
        }

        let completed = 0;
        const total = monitorData.zoneActors.length;

        monitorData.zoneActors.forEach(actor => {
            (actor as any).ease({
                opacity: 0,
                duration: FADE_DURATION_MS / 2,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => {
                    completed++;
                    if (completed === total) {
                        callback();
                    }
                },
            });
        });
    }

    /**
     * Bring all overlays to the front (below modal dialog)
     * Used when dialog order changes
     */
    raise(): void {
        for (const monitorData of this._monitorOverlays) {
            if (monitorData.overlay && monitorData.overlay.get_parent()) {
                const parent = monitorData.overlay.get_parent();
                (parent as any).set_child_below_sibling(monitorData.overlay, null);
            }
        }
    }

    /**
     * Get whether the preview is currently visible
     * @returns
     */
    isVisible(): boolean {
        return this._visible;
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        // Guard against re-entrance during cleanup
        if (this._isDestroying) {
            return;
        }

        this._isDestroying = true;

        try {
            this.hide();

            // Disconnect all signals
            if (this._signalTracker) {
                this._signalTracker.disconnectAll();
                this._signalTracker = null;
            }

            // Clean up ThemeManager
            if (this._themeManager) {
                this._themeManager.destroy();
                this._themeManager = null;
            }

            (global as any).zonedDebug?.trackInstance('LayoutPreviewBackground', false);
        } finally {
            // Always reset the flag, even if an error occurred
            this._isDestroying = false;
        }
    }
}
