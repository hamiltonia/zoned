/**
 * CanvasZoneEditor - Full-screen visual canvas layout editor
 *
 * Creates free-form, overlapping zones (unlike the grid editor which
 * enforces 100% screen coverage). Zones can overlap, leave gaps,
 * and be positioned anywhere on screen.
 *
 * Visual editor with direct zone manipulation:
 * - Click zone: Select
 * - Drag zone: Move
 * - Drag handles: Resize (8 handles per selected zone)
 * - N key: Add new zone
 * - Delete: Remove selected zone
 * - Snap guides: Magnetic edge alignment
 * - Save/Cancel workflow
 */

import St from '@girs/st-14';
import Clutter from '@girs/clutter-14';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Shell from '@girs/shell-14';
import Gio from '@girs/gio-2.0';
import {createLogger} from '../../utils/debug';
import {ThemeManager} from '../../utils/theme';
import {global} from '../../types/gjsGlobal';
import {SignalTracker} from '../../utils/signalTracker';

const logger = createLogger('CanvasZoneEditor');

const MIN_ZONE_SIZE = 0.05;
const SNAP_THRESHOLD = 0.02;
const MOVE_INCREMENT = 0.01;
const HANDLE_SIZE = 16;
const DEFAULT_ZONE_SIZE = 0.4;
const CASCADE_OFFSET = 0.05;

interface ZoneLayout {
    id?: string | null;
    name?: string;
    zones: Array<{name: string; x: number; y: number; w: number; h: number}>;
}

interface ZoneData {
    name: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

interface DragState {
    zoneIndex: number;
    offsetX: number;
    offsetY: number;
}

interface ResizeState {
    zoneIndex: number;
    handle: string;
    startX: number;
    startY: number;
    startZone: ZoneData;
}

type HandleDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/**
 * CanvasZoneEditor - Full-screen visual canvas layout editor
 *
 * Usage:
 *   const editor = new CanvasZoneEditor(
 *       currentLayout,
 *       layoutManager,
 *       settings,
 *       (layout) => layoutManager.updateCurrentLayout(layout),
 *       () => reopenPicker(),
 *   );
 *   editor.show();
 */
export class CanvasZoneEditor {
    private _zones: ZoneData[];
    // @ts-expect-error - Used in constructor, needed for reference
    private _layoutManager: unknown;
    // @ts-expect-error - Used in constructor, needed for reference
    private _settings: Gio.Settings;
    private _onSaveCallback: ((layout: ZoneLayout) => void) | null;
    private _onCancelCallback: (() => void) | null;
    private _themeManager: ThemeManager;
    private _signalTracker: SignalTracker;
    private _overlay: St.Widget | null;
    private _zoneActors: St.Button[];
    private _handleActors: St.Widget[];
    private _snapGuides: St.Widget[];
    private _controlPanel: St.BoxLayout | null;
    private _zoneInfoLabel: St.Label | null;
    private _deleteButton: St.Button | null;
    private _helpTextBox: St.BoxLayout | null;
    private _toolbar: St.BoxLayout | null;
    private _modalId: number | null;
    private _selectedZoneIndex: number;
    private _dragging: DragState | null;
    private _resizing: ResizeState | null;
    private _saveExecuted: boolean;
    private _cancelExecuted: boolean;
    private _layoutId: string | null;
    private _layoutName: string;

    private _boundHandleMotion: ((actor: Clutter.Actor, event: Clutter.Event) => boolean) | null;
    private _boundHandleButtonRelease: ((actor: Clutter.Actor, event: Clutter.Event) => boolean) | null;
    private _boundHandleKeyPress: ((actor: Clutter.Actor, event: Clutter.Event) => boolean) | null;
    private _boundOnSave: (() => void) | null;
    private _boundOnCancel: (() => void) | null;

    constructor(
        zoneLayout: ZoneLayout | null,
        layoutManager: unknown,
        settings: Gio.Settings,
        onSave: (layout: ZoneLayout) => void,
        onCancel: (() => void) | null = null,
    ) {
        const layout = zoneLayout || {
            id: null,
            name: 'New Canvas Layout',
            zones: [],
        };

        this._zones = layout.zones.map(z => ({...z}));
        this._layoutId = layout.id || null;
        this._layoutName = layout.name || 'Canvas Layout';
        this._layoutManager = layoutManager;
        this._settings = settings;
        this._onSaveCallback = onSave;
        this._onCancelCallback = onCancel;

        this._themeManager = new ThemeManager(settings);
        this._signalTracker = new SignalTracker('CanvasZoneEditor');

        this._overlay = null;
        this._zoneActors = [];
        this._handleActors = [];
        this._snapGuides = [];
        this._controlPanel = null;
        this._zoneInfoLabel = null;
        this._deleteButton = null;
        this._helpTextBox = null;
        this._toolbar = null;
        this._modalId = null;
        this._selectedZoneIndex = -1;
        this._dragging = null;
        this._resizing = null;
        this._saveExecuted = false;
        this._cancelExecuted = false;

        this._boundHandleMotion = this._handleMotion.bind(this);
        this._boundHandleButtonRelease = this._handleButtonRelease.bind(this);
        this._boundHandleKeyPress = this._handleKeyPress.bind(this);
        this._boundOnSave = this._onSave.bind(this);
        this._boundOnCancel = this._onCancel.bind(this);

        // Start with one zone if empty
        if (this._zones.length === 0) {
            this._addZoneData();
        }

        logger.debug(`CanvasZoneEditor created with ${this._zones.length} zones`);
    }

    // ─── Lifecycle ───────────────────────────────────────────

    show(): void {
        const monitor = Main.layoutManager.currentMonitor;
        const colors = this._themeManager.getColors();

        logger.info(`Showing canvas editor on ${monitor.width}×${monitor.height}`);

        this._overlay = new St.Widget({
            style_class: 'canvas-editor-overlay',
            reactive: true,
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height,
        });
        this._overlay.style = `background-color: ${colors.modalOverlay};`;

        // Build UI layers (Z-order: zones → control panel → toolbar → help text)
        this._createZoneActors();
        this._createControlPanel();
        this._createToolbar();
        this._createHelpText();

        Main.uiGroup.add_child(this._overlay);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this._modalId = (Main as any).pushModal(this._overlay, {
            actionMode: Shell.ActionMode.NORMAL,
        });

        this._setupEventHandlers();
        logger.debug('Canvas editor displayed');
    }

    hide(): void {
        if (this._overlay) {
            logger.debug('Hiding canvas editor');

            if (this._modalId) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (Main as any).popModal(this._modalId);
                this._modalId = null;
            }

            Main.uiGroup.remove_child(this._overlay);
            this._overlay.destroy();
            this._overlay = null;
            this._zoneActors = [];
            this._handleActors = [];
            this._snapGuides = [];
        }
    }

    destroy(): void {
        this.hide();

        if (this._signalTracker) {
            this._signalTracker.disconnectAll();
            (this._signalTracker as unknown) = null;
        }

        this._boundHandleMotion = null;
        this._boundHandleButtonRelease = null;
        this._boundHandleKeyPress = null;
        this._boundOnSave = null;
        this._boundOnCancel = null;

        if (this._themeManager) {
            this._themeManager.destroy();
            (this._themeManager as unknown) = null;
        }

        logger.debug('CanvasZoneEditor destroyed');
    }

    // ─── Event Setup ─────────────────────────────────────────

    private _setupEventHandlers(): void {
        if (!this._overlay) return;

        if (this._boundHandleMotion) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this._signalTracker.connect(this._overlay, 'motion-event', this._boundHandleMotion as (...args: any[]) => void);
        }
        if (this._boundHandleButtonRelease) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this._signalTracker.connect(this._overlay, 'button-release-event', this._boundHandleButtonRelease as (...args: any[]) => void);
        }
        if (this._boundHandleKeyPress) {
            this._signalTracker.connect(this._overlay, 'key-press-event', this._boundHandleKeyPress);
        }

        // Click on overlay background to deselect
        this._signalTracker.connect(this._overlay, 'button-press-event', (_actor: Clutter.Actor, event: Clutter.Event) => {
            // Only deselect if clicking the overlay itself (not a child)
            const source = event.get_source();
            if (source === this._overlay) {
                this._selectZone(-1);
            }
            return Clutter.EVENT_PROPAGATE as unknown as boolean;
        });

        logger.debug('Event handlers installed');
    }

    // ─── Zone Data Management ────────────────────────────────

    private _addZoneData(): void {
        const lastZone = this._zones.length > 0 ? this._zones[this._zones.length - 1] : null;
        let x: number, y: number;

        if (!lastZone) {
            x = (1 - DEFAULT_ZONE_SIZE) / 2;
            y = (1 - DEFAULT_ZONE_SIZE) / 2;
        } else {
            x = lastZone.x + CASCADE_OFFSET;
            y = lastZone.y + CASCADE_OFFSET;
            if (x + DEFAULT_ZONE_SIZE > 1 || y + DEFAULT_ZONE_SIZE > 1) {
                x = CASCADE_OFFSET;
                y = CASCADE_OFFSET;
            }
        }

        this._zones.push({
            name: `Zone ${this._zones.length + 1}`,
            x, y,
            w: DEFAULT_ZONE_SIZE,
            h: DEFAULT_ZONE_SIZE,
        });
    }

    // ─── Zone Actor Creation ─────────────────────────────────

    private _createZoneActors(): void {
        if (!this._overlay) return;

        const monitor = Main.layoutManager.currentMonitor;
        const accentColor = this._getAccentColor();
        const accentHex = this._rgbToHex(accentColor.red, accentColor.green, accentColor.blue);

        this._zones.forEach((zone, index) => {
            const actor = new St.Button({
                reactive: true,
                x: zone.x * monitor.width,
                y: zone.y * monitor.height,
                width: zone.w * monitor.width,
                height: zone.h * monitor.height,
            });

            const isSelected = index === this._selectedZoneIndex;
            actor.style = isSelected
                ? `background-color: rgba(${this._accentRgbStr(accentColor)}, 0.4); border: 4px solid ${accentHex}; border-radius: 4px;`
                : `background-color: rgba(68, 68, 68, 0.6); border: 2px solid ${accentHex}; border-radius: 4px;`;

            // Zone number label (top-left, 24pt)
            const label = new St.Label({
                text: `${index + 1}`,
                style: 'font-size: 24pt; color: white; font-weight: bold; margin: 8px;',
            });
            actor.set_child(label);

            // Click to select + start drag
            this._signalTracker.connect(actor, 'button-press-event', (_a: unknown, event: Clutter.Event) => {
                this._selectZone(index);
                this._startDrag(index, event);
                return Clutter.EVENT_STOP as unknown as boolean;
            });

            // Hover effects
            this._signalTracker.connect(actor, 'enter-event', () => {
                if (index !== this._selectedZoneIndex) {
                    actor.style = `background-color: rgba(68, 68, 68, 0.7); border: 2px solid ${accentHex}; border-radius: 4px;`;
                }
                return Clutter.EVENT_PROPAGATE as unknown as boolean;
            });
            this._signalTracker.connect(actor, 'leave-event', () => {
                if (index !== this._selectedZoneIndex) {
                    actor.style = `background-color: rgba(68, 68, 68, 0.6); border: 2px solid ${accentHex}; border-radius: 4px;`;
                }
                return Clutter.EVENT_PROPAGATE as unknown as boolean;
            });

            if (this._overlay) {
                this._overlay.add_child(actor);
            }
            this._zoneActors.push(actor);
        });

        // Create handles for selected zone
        if (this._selectedZoneIndex >= 0) {
            this._createHandles();
        }

        logger.debug(`Created ${this._zoneActors.length} zone actors`);
    }

    // ─── Selection ───────────────────────────────────────────

    private _selectZone(index: number): void {
        this._selectedZoneIndex = index;
        this._refreshDisplay();
        this._updateControlPanel();
    }

    // ─── Resize Handles ──────────────────────────────────────

    private _createHandles(): void {
        if (!this._overlay || this._selectedZoneIndex < 0) return;

        this._destroyHandles();

        const zone = this._zones[this._selectedZoneIndex];
        if (!zone) return;

        const monitor = Main.layoutManager.currentMonitor;
        const accentColor = this._getAccentColor();
        const accentHex = this._rgbToHex(accentColor.red, accentColor.green, accentColor.blue);

        const directions: HandleDirection[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
        const zx = zone.x * monitor.width;
        const zy = zone.y * monitor.height;
        const zw = zone.w * monitor.width;
        const zh = zone.h * monitor.height;
        const hs = HANDLE_SIZE;
        const hh = hs / 2;

        directions.forEach(dir => {
            const pos = this._getHandleGeometry(dir, zx, zy, zw, zh, hs, hh);

            const handle = new St.Widget({
                reactive: true,
                x: pos.x, y: pos.y,
                width: pos.w, height: pos.h,
            });

            handle.style = pos.isCorner
                ? `background-color: ${accentHex}; border: 2px solid white; border-radius: 50%;`
                : `background-color: rgba(${this._accentRgbStr(accentColor)}, 0.8); border: 1px solid white; border-radius: 2px;`;

            this._signalTracker.connect(handle, 'button-press-event', (_a: unknown, event: Clutter.Event) => {
                this._startResize(this._selectedZoneIndex, dir, event);
                return Clutter.EVENT_STOP as unknown as boolean;
            });

            if (this._overlay) {
                this._overlay.add_child(handle);
            }
            this._handleActors.push(handle);
        });
    }

    private _getHandleGeometry(
        dir: HandleDirection, zx: number, zy: number, zw: number, zh: number, hs: number, hh: number,
    ): {x: number; y: number; w: number; h: number; isCorner: boolean} {
        switch (dir) {
            case 'nw': return {x: zx - hh, y: zy - hh, w: hs, h: hs, isCorner: true};
            case 'n':  return {x: zx + zw / 2 - 12, y: zy - hh, w: 24, h: hs, isCorner: false};
            case 'ne': return {x: zx + zw - hh, y: zy - hh, w: hs, h: hs, isCorner: true};
            case 'e':  return {x: zx + zw - hh, y: zy + zh / 2 - 12, w: hs, h: 24, isCorner: false};
            case 'se': return {x: zx + zw - hh, y: zy + zh - hh, w: hs, h: hs, isCorner: true};
            case 's':  return {x: zx + zw / 2 - 12, y: zy + zh - hh, w: 24, h: hs, isCorner: false};
            case 'sw': return {x: zx - hh, y: zy + zh - hh, w: hs, h: hs, isCorner: true};
            case 'w':  return {x: zx - hh, y: zy + zh / 2 - 12, w: hs, h: 24, isCorner: false};
        }
    }

    private _destroyHandles(): void {
        this._handleActors.forEach(h => {
            const parent = h.get_parent();
            if (parent) {
                parent.remove_child(h);
            }
            h.destroy();
        });
        this._handleActors = [];
    }

    // ─── Drag to Move ────────────────────────────────────────

    private _startDrag(zoneIndex: number, event: Clutter.Event): void {
        const monitor = Main.layoutManager.currentMonitor;
        const zone = this._zones[zoneIndex];
        const [px, py] = event.get_coords();

        this._dragging = {
            zoneIndex,
            offsetX: px - (zone.x * monitor.width + monitor.x),
            offsetY: py - (zone.y * monitor.height + monitor.y),
        };
    }

    private _handleMotion(_actor: Clutter.Actor, event: Clutter.Event): boolean {
        if (this._dragging) {
            this._onDragMotion(event);
            return Clutter.EVENT_STOP as unknown as boolean;
        }
        if (this._resizing) {
            this._onResizeMotion(event);
            return Clutter.EVENT_STOP as unknown as boolean;
        }
        return Clutter.EVENT_PROPAGATE as unknown as boolean;
    }

    private _onDragMotion(event: Clutter.Event): void {
        if (!this._dragging) return;

        const monitor = Main.layoutManager.currentMonitor;
        const zone = this._zones[this._dragging.zoneIndex];
        const [px, py] = event.get_coords();

        let newX = (px - this._dragging.offsetX - monitor.x) / monitor.width;
        let newY = (py - this._dragging.offsetY - monitor.y) / monitor.height;

        // Clamp to screen bounds
        newX = Math.max(0, Math.min(1 - zone.w, newX));
        newY = Math.max(0, Math.min(1 - zone.h, newY));

        // Apply snapping
        const snapped = this._applySnap(newX, newY, zone.w, zone.h, this._dragging.zoneIndex);
        zone.x = snapped.x;
        zone.y = snapped.y;

        this._updateZoneActor(this._dragging.zoneIndex);
        this._updateHandlePositions();
    }

    private _handleButtonRelease(_actor: Clutter.Actor, _event: Clutter.Event): boolean {
        if (this._dragging) {
            this._dragging = null;
            this._clearSnapGuides();
            return Clutter.EVENT_STOP as unknown as boolean;
        }
        if (this._resizing) {
            this._resizing = null;
            this._clearSnapGuides();
            return Clutter.EVENT_STOP as unknown as boolean;
        }
        return Clutter.EVENT_PROPAGATE as unknown as boolean;
    }

    // ─── Resize ──────────────────────────────────────────────

    private _startResize(zoneIndex: number, handle: string, event: Clutter.Event): void {
        const zone = this._zones[zoneIndex];
        const [px, py] = event.get_coords();

        this._resizing = {
            zoneIndex,
            handle,
            startX: px,
            startY: py,
            startZone: {...zone},
        };
    }

    private _onResizeMotion(event: Clutter.Event): void {
        if (!this._resizing) return;

        const monitor = Main.layoutManager.currentMonitor;
        const zone = this._zones[this._resizing.zoneIndex];
        const [px, py] = event.get_coords();
        const dx = (px - this._resizing.startX) / monitor.width;
        const dy = (py - this._resizing.startY) / monitor.height;
        const sz = this._resizing.startZone;

        const resized = this._computeResize(sz, this._resizing.handle, dx, dy);

        zone.x = resized.x;
        zone.y = resized.y;
        zone.w = resized.w;
        zone.h = resized.h;

        this._updateZoneActor(this._resizing.zoneIndex);
        this._updateHandlePositions();
    }

    private _computeResize(
        sz: ZoneData, handle: string, dx: number, dy: number,
    ): {x: number; y: number; w: number; h: number} {
        let newX = sz.x, newY = sz.y, newW = sz.w, newH = sz.h;

        // Horizontal adjustment
        if (handle.includes('w')) { newX = sz.x + dx; newW = sz.w - dx; }
        if (handle.includes('e')) { newW = sz.w + dx; }

        // Vertical adjustment
        if (handle.includes('n')) { newY = sz.y + dy; newH = sz.h - dy; }
        if (handle.includes('s')) { newH = sz.h + dy; }

        // Enforce minimum size
        if (newW < MIN_ZONE_SIZE) {
            if (handle.includes('w')) newX = sz.x + sz.w - MIN_ZONE_SIZE;
            newW = MIN_ZONE_SIZE;
        }
        if (newH < MIN_ZONE_SIZE) {
            if (handle.includes('n')) newY = sz.y + sz.h - MIN_ZONE_SIZE;
            newH = MIN_ZONE_SIZE;
        }

        // Clamp to screen bounds
        newX = Math.max(0, newX);
        newY = Math.max(0, newY);
        newW = Math.min(newW, 1 - newX);
        newH = Math.min(newH, 1 - newY);

        return {x: newX, y: newY, w: newW, h: newH};
    }

    private _updateZoneActor(index: number): void {
        const actor = this._zoneActors[index];
        const zone = this._zones[index];
        if (!actor || !zone) return;

        const monitor = Main.layoutManager.currentMonitor;
        actor.set_position(zone.x * monitor.width, zone.y * monitor.height);
        actor.set_size(zone.w * monitor.width, zone.h * monitor.height);
    }

    private _updateHandlePositions(): void {
        // Destroy and recreate handles at new positions
        if (this._selectedZoneIndex >= 0) {
            this._destroyHandles();
            this._createHandles();
        }
    }

    // ─── Magnetic Snapping ───────────────────────────────────

    private _applySnap(x: number, y: number, w: number, h: number, excludeIndex: number): {x: number; y: number} {
        const xPoints: number[] = [0, 1];
        const yPoints: number[] = [0, 1];

        this._zones.forEach((zone, i) => {
            if (i === excludeIndex) return;
            xPoints.push(zone.x, zone.x + zone.w);
            yPoints.push(zone.y, zone.y + zone.h);
        });

        this._clearSnapGuides();

        const snappedX = this._snapAxis(x, w, xPoints, 'x');
        const snappedY = this._snapAxis(y, h, yPoints, 'y');

        return {x: snappedX, y: snappedY};
    }

    private _snapAxis(pos: number, size: number, points: number[], axis: 'x' | 'y'): number {
        // Check leading edge
        for (const p of points) {
            if (Math.abs(pos - p) < SNAP_THRESHOLD) {
                this._showSnapGuide(axis, p);
                return p;
            }
        }
        // Check trailing edge
        for (const p of points) {
            if (Math.abs(pos + size - p) < SNAP_THRESHOLD) {
                this._showSnapGuide(axis, p);
                return p - size;
            }
        }
        return pos;
    }

    private _showSnapGuide(axis: 'x' | 'y', position: number): void {
        if (!this._overlay) return;

        const monitor = Main.layoutManager.currentMonitor;
        const accentColor = this._getAccentColor();
        const accentHex = this._rgbToHex(accentColor.red, accentColor.green, accentColor.blue);

        const guide = new St.Widget({reactive: false});
        guide.style = `background-color: ${accentHex}; opacity: 200;`;

        if (axis === 'x') {
            guide.set_position(position * monitor.width - 1, 0);
            guide.set_size(2, monitor.height);
        } else {
            guide.set_position(0, position * monitor.height - 1);
            guide.set_size(monitor.width, 2);
        }

        this._overlay.add_child(guide);
        this._snapGuides.push(guide);
    }

    private _clearSnapGuides(): void {
        this._snapGuides.forEach(g => {
            const parent = g.get_parent();
            if (parent) {
                parent.remove_child(g);
            }
            g.destroy();
        });
        this._snapGuides = [];
    }

    // ─── Keyboard Handling ───────────────────────────────────

    private _handleKeyPress(_actor: Clutter.Actor, event: Clutter.Event): boolean {
        const key = event.get_key_symbol();

        if (this._handleNavigationKey(key)) return Clutter.EVENT_STOP as unknown as boolean;
        if (this._handleActionKey(key)) return Clutter.EVENT_STOP as unknown as boolean;
        if (this._handleArrowKey(key, event)) return Clutter.EVENT_STOP as unknown as boolean;

        return Clutter.EVENT_PROPAGATE as unknown as boolean;
    }

    private _handleNavigationKey(key: number): boolean {
        switch (key) {
            case Clutter.KEY_Escape:
                if (this._selectedZoneIndex >= 0) this._selectZone(-1);
                else this._onCancel();
                return true;
            case Clutter.KEY_Return:
            case Clutter.KEY_KP_Enter:
                this._onSave();
                return true;
            case Clutter.KEY_Tab:
                this._cycleSelection(1);
                return true;
            case Clutter.KEY_ISO_Left_Tab:
                this._cycleSelection(-1);
                return true;
            default:
                return false;
        }
    }

    private _handleActionKey(key: number): boolean {
        switch (key) {
            case Clutter.KEY_n:
            case Clutter.KEY_N:
                this._addZone();
                return true;
            case Clutter.KEY_Delete:
            case Clutter.KEY_BackSpace:
                this._deleteSelectedZone();
                return true;
            case Clutter.KEY_bracketleft:
                this._adjustZOrder(-1);
                return true;
            case Clutter.KEY_bracketright:
                this._adjustZOrder(1);
                return true;
            default:
                return false;
        }
    }

    private _handleArrowKey(key: number, event: Clutter.Event): boolean {
        switch (key) {
            case Clutter.KEY_Left:  this._moveSelected(-MOVE_INCREMENT, 0, event); return true;
            case Clutter.KEY_Right: this._moveSelected(MOVE_INCREMENT, 0, event); return true;
            case Clutter.KEY_Up:    this._moveSelected(0, -MOVE_INCREMENT, event); return true;
            case Clutter.KEY_Down:  this._moveSelected(0, MOVE_INCREMENT, event); return true;
            default: return false;
        }
    }

    private _moveSelected(dx: number, dy: number, event: Clutter.Event): void {
        if (this._selectedZoneIndex < 0) return;

        const zone = this._zones[this._selectedZoneIndex];
        const modifiers = event.get_state();
        const shiftPressed = modifiers & Clutter.ModifierType.SHIFT_MASK;

        if (shiftPressed) {
            // Resize
            zone.w = Math.max(MIN_ZONE_SIZE, Math.min(1 - zone.x, zone.w + dx));
            zone.h = Math.max(MIN_ZONE_SIZE, Math.min(1 - zone.y, zone.h + dy));
        } else {
            // Move
            zone.x = Math.max(0, Math.min(1 - zone.w, zone.x + dx));
            zone.y = Math.max(0, Math.min(1 - zone.h, zone.y + dy));
        }

        this._refreshDisplay();
    }

    private _cycleSelection(direction: number): void {
        if (this._zones.length === 0) return;

        if (this._selectedZoneIndex < 0) {
            this._selectZone(0);
        } else {
            const next = (this._selectedZoneIndex + direction + this._zones.length) % this._zones.length;
            this._selectZone(next);
        }
    }

    private _adjustZOrder(direction: number): void {
        if (this._selectedZoneIndex < 0) return;

        const newIndex = this._selectedZoneIndex + direction;
        if (newIndex < 0 || newIndex >= this._zones.length) return;

        // Swap zones in array
        const temp = this._zones[this._selectedZoneIndex];
        this._zones[this._selectedZoneIndex] = this._zones[newIndex];
        this._zones[newIndex] = temp;

        this._selectedZoneIndex = newIndex;
        this._refreshDisplay();
    }

    // ─── Zone Operations ─────────────────────────────────────

    private _addZone(): void {
        this._addZoneData();
        this._selectedZoneIndex = this._zones.length - 1;
        this._refreshDisplay();
    }

    private _deleteSelectedZone(): void {
        if (this._selectedZoneIndex < 0 || this._zones.length <= 1) return;

        this._zones.splice(this._selectedZoneIndex, 1);

        // Update zone names
        this._zones.forEach((z, i) => { z.name = `Zone ${i + 1}`; });

        this._selectedZoneIndex = Math.min(this._selectedZoneIndex, this._zones.length - 1);
        this._refreshDisplay();
    }

    // ─── UI Components ───────────────────────────────────────

    private _createControlPanel(): void {
        if (!this._overlay) return;

        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        const scaleFactor = themeContext.scale_factor;
        const colors = this._themeManager.getColors();

        this._controlPanel = new St.BoxLayout({
            vertical: false,
            style: `spacing: 12px; padding: 12px 16px; background-color: ${colors.toolbarBg}; border-radius: 8px;`,
        });

        this._controlPanel.set_position(20 * scaleFactor, 80 * scaleFactor);

        // Add Zone button
        const addBtn = new St.Button({
            label: '+ New Zone',
            style: `padding: 8px 16px; background-color: ${colors.accentHex}; color: white; border-radius: 4px; font-weight: bold;`,
        });
        this._signalTracker.connect(addBtn, 'clicked', () => this._addZone());
        this._signalTracker.connect(addBtn, 'enter-event', () => {
            addBtn.style = `padding: 8px 16px; background-color: ${colors.accentHexHover}; color: white; border-radius: 4px; font-weight: bold;`;
            return Clutter.EVENT_PROPAGATE as unknown as boolean;
        });
        this._signalTracker.connect(addBtn, 'leave-event', () => {
            addBtn.style = `padding: 8px 16px; background-color: ${colors.accentHex}; color: white; border-radius: 4px; font-weight: bold;`;
            return Clutter.EVENT_PROPAGATE as unknown as boolean;
        });
        this._controlPanel.add_child(addBtn);

        // Zone info label
        this._zoneInfoLabel = new St.Label({
            text: 'No selection',
            style: `font-size: 10pt; color: ${colors.textSecondary}; padding: 8px;`,
        });
        this._controlPanel.add_child(this._zoneInfoLabel);

        // Delete button
        this._deleteButton = new St.Button({
            label: '✕ Delete',
            style: 'padding: 8px 16px; background-color: rgba(255, 50, 50, 0.9); color: white; border-radius: 4px;',
        });
        this._signalTracker.connect(this._deleteButton, 'clicked', () => this._deleteSelectedZone());
        this._deleteButton.reactive = this._selectedZoneIndex >= 0;
        this._controlPanel.add_child(this._deleteButton);

        this._overlay.add_child(this._controlPanel);
        this._updateControlPanel();
    }

    private _updateControlPanel(): void {
        if (this._zoneInfoLabel) {
            if (this._selectedZoneIndex >= 0) {
                this._zoneInfoLabel.text = `Zone ${this._selectedZoneIndex + 1} of ${this._zones.length}`;
            } else {
                this._zoneInfoLabel.text = `${this._zones.length} zone${this._zones.length !== 1 ? 's' : ''}`;
            }
        }

        if (this._deleteButton) {
            this._deleteButton.reactive = this._selectedZoneIndex >= 0 && this._zones.length > 1;
            this._deleteButton.opacity = this._deleteButton.reactive ? 255 : 128;
        }
    }

    private _createHelpText(): void {
        if (!this._overlay) return;

        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        const scaleFactor = themeContext.scale_factor;
        const colors = this._themeManager.getColors();

        this._helpTextBox = new St.BoxLayout({
            vertical: true,
            style: `spacing: 8px; padding: 20px; background-color: ${colors.helpBoxBg}; border-radius: 8px;`,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.START,
        });

        const monitor = Main.layoutManager.currentMonitor;
        const helpWidth = 800 * scaleFactor;
        this._helpTextBox.set_position((monitor.width - helpWidth) / 2, 20);
        this._helpTextBox.width = helpWidth;

        const title = new St.Label({
            text: 'Canvas Editor',
            style: `font-size: 14pt; font-weight: bold; color: ${colors.textPrimary}; margin-bottom: 8px;`,
        });
        this._helpTextBox.add_child(title);

        const instructions = [
            'Click zone to select  •  Drag to move  •  Drag handles to resize  •  N: New zone',
            'Delete: Remove zone  •  [ / ]: Adjust order  •  Shift+Arrow: Resize  •  Tab: Cycle',
            'Esc: Deselect / Cancel  •  Enter: Save layout',
        ];

        instructions.forEach(text => {
            const label = new St.Label({
                text,
                style: `font-size: 11pt; color: ${colors.textSecondary};`,
            });
            label.clutter_text.line_wrap = true;
            if (this._helpTextBox) {
                this._helpTextBox.add_child(label);
            }
        });

        this._overlay.add_child(this._helpTextBox);
    }

    private _createToolbar(): void {
        if (!this._overlay) return;

        const monitor = Main.layoutManager.currentMonitor;
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        const scaleFactor = themeContext.scale_factor;
        const colors = this._themeManager.getColors();

        this._toolbar = new St.BoxLayout({
            style: `spacing: 12px; padding: 16px; background-color: ${colors.toolbarBg}; border-radius: 8px;`,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.END,
        });

        const toolbarWidth = 250 * scaleFactor;
        const toolbarHeight = 80 * scaleFactor;
        this._toolbar.set_position(
            (monitor.width - toolbarWidth) / 2,
            monitor.height - toolbarHeight,
        );
        this._toolbar.width = toolbarWidth;

        // Save button
        const saveButton = new St.Button({
            label: 'Save Layout',
            style_class: 'button',
            style: `padding: 8px 24px; background-color: ${colors.accentHex}; color: white; border-radius: 4px; font-weight: bold;`,
        });
        if (this._boundOnSave) {
            this._signalTracker.connect(saveButton, 'clicked', this._boundOnSave);
        }
        this._signalTracker.connect(saveButton, 'enter-event', () => {
            saveButton.style = `padding: 8px 24px; background-color: ${colors.accentHexHover}; color: white; border-radius: 4px; font-weight: bold;`;
            return Clutter.EVENT_PROPAGATE as unknown as boolean;
        });
        this._signalTracker.connect(saveButton, 'leave-event', () => {
            saveButton.style = `padding: 8px 24px; background-color: ${colors.accentHex}; color: white; border-radius: 4px; font-weight: bold;`;
            return Clutter.EVENT_PROPAGATE as unknown as boolean;
        });
        this._toolbar.add_child(saveButton);

        // Cancel button
        const cancelButton = new St.Button({
            label: 'Cancel',
            style_class: 'button',
            style: `padding: 8px 24px; background-color: ${colors.buttonBg}; color: ${colors.buttonText}; border-radius: 4px;`,
        });
        if (this._boundOnCancel) {
            this._signalTracker.connect(cancelButton, 'clicked', this._boundOnCancel);
        }
        this._signalTracker.connect(cancelButton, 'enter-event', () => {
            cancelButton.style = `padding: 8px 24px; background-color: ${colors.buttonBgHover}; color: ${colors.buttonText}; border-radius: 4px;`;
            return Clutter.EVENT_PROPAGATE as unknown as boolean;
        });
        this._signalTracker.connect(cancelButton, 'leave-event', () => {
            cancelButton.style = `padding: 8px 24px; background-color: ${colors.buttonBg}; color: ${colors.buttonText}; border-radius: 4px;`;
            return Clutter.EVENT_PROPAGATE as unknown as boolean;
        });
        this._toolbar.add_child(cancelButton);

        this._overlay.add_child(this._toolbar);
    }

    // ─── Display Refresh ─────────────────────────────────────

    private _refreshDisplay(): void {
        if (!this._overlay) return;

        // Remove old zone actors
        this._zoneActors.forEach(a => {
            const parent = a.get_parent();
            if (parent) parent.remove_child(a);
            a.destroy();
        });
        this._zoneActors = [];
        this._destroyHandles();
        this._clearSnapGuides();

        // Recreate zone actors
        this._createZoneActors();

        // Re-raise UI layers above zones
        if (this._controlPanel?.get_parent() === this._overlay) {
            this._overlay.remove_child(this._controlPanel);
            this._overlay.add_child(this._controlPanel);
        }
        if (this._toolbar?.get_parent() === this._overlay) {
            this._overlay.remove_child(this._toolbar);
            this._overlay.add_child(this._toolbar);
        }
        if (this._helpTextBox?.get_parent() === this._overlay) {
            this._overlay.remove_child(this._helpTextBox);
            this._overlay.add_child(this._helpTextBox);
        }
    }

    // ─── Save / Cancel ───────────────────────────────────────

    private _onSave(): void {
        if (this._saveExecuted) return;
        this._saveExecuted = true;

        logger.info('Saving canvas layout');

        // Validate: at least 1 zone, all within bounds
        const valid = this._zones.every(z =>
            z.w >= MIN_ZONE_SIZE && z.h >= MIN_ZONE_SIZE &&
            z.x >= 0 && z.y >= 0 &&
            z.x + z.w <= 1.001 && z.y + z.h <= 1.001,
        );

        if (!valid || this._zones.length === 0) {
            logger.error('Canvas layout validation failed');
            this._saveExecuted = false;
            return;
        }

        this.hide();

        if (this._onSaveCallback) {
            this._onSaveCallback({
                id: this._layoutId,
                name: this._layoutName,
                zones: this._zones.map(z => ({...z})),
            });
        }
    }

    private _onCancel(): void {
        if (this._cancelExecuted) return;
        this._cancelExecuted = true;

        logger.info('Cancelling canvas editor');
        this.hide();

        if (this._onCancelCallback) {
            this._onCancelCallback();
        }
    }

    // ─── Color Helpers ───────────────────────────────────────

    private _getAccentColor(): {red: number; green: number; blue: number} {
        try {
            const interfaceSettings = new Gio.Settings({schema: 'org.gnome.desktop.interface'});
            const accentColorName = interfaceSettings.get_string('accent-color');

            const accentColors: Record<string, {red: number; green: number; blue: number}> = {
                'blue': {red: 0.29, green: 0.56, blue: 0.85},
                'teal': {red: 0.13, green: 0.63, blue: 0.62},
                'green': {red: 0.38, green: 0.68, blue: 0.33},
                'yellow': {red: 0.84, green: 0.65, blue: 0.13},
                'orange': {red: 0.92, green: 0.49, blue: 0.18},
                'red': {red: 0.88, green: 0.29, blue: 0.29},
                'pink': {red: 0.90, green: 0.39, blue: 0.64},
                'purple': {red: 0.60, green: 0.41, blue: 0.82},
                'slate': {red: 0.45, green: 0.52, blue: 0.60},
            };

            return accentColors[accentColorName] || accentColors['blue'];
        } catch {
            return {red: 0.29, green: 0.56, blue: 0.85};
        }
    }

    private _rgbToHex(r: number, g: number, b: number): string {
        const toHex = (val: number) => {
            const hex = Math.round(val * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    private _accentRgbStr(c: {red: number; green: number; blue: number}): string {
        return `${Math.round(c.red * 255)}, ${Math.round(c.green * 255)}, ${Math.round(c.blue * 255)}`;
    }
}
