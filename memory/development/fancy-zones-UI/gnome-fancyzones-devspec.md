# GNOME Extension Dev Spec: FancyZones-style Window Manager

## Executive Summary
Implement a GNOME Shell extension providing multi-monitor window tiling with custom layouts, profile management, and keyboard/mouse-driven workflows. Core UX: instant visual feedback, minimal clicks to switch contexts, zero-friction zone editing.

---

## 1. Profile & Layout Management

### 1.1 Data Model
```typescript
interface Profile {
  id: string;              // UUID
  name: string;
  icon?: string;           // Icon name from theme
  hotkey?: string;         // e.g., "<Super><Ctrl>1"
  layouts: Layout[];       // Per-monitor layouts
  settings: ProfileSettings;
}

interface Layout {
  monitorId: string;       // X11 output name or Wayland connector
  type: 'grid' | 'canvas';
  zones: Zone[];
  metadata: {
    orientation: 'horizontal' | 'vertical';
    resolution: string;    // "1920x1080" for validation
  };
}

interface Zone {
  id: string;
  rect: { x: number; y: number; w: number; h: number }; // Normalized 0-1
  index: number;           // For Win+Arrow navigation
}

interface ProfileSettings {
  shiftToActivate: boolean;
  zoneMargin: number;      // px
  snapThreshold: number;   // px for adjacent zone detection
  showZoneNumbers: boolean;
  colors: ZoneColors;
}
```

### 1.2 Profile Picker UX

**Trigger Points:**
1. `Super+Shift+\`` (configurable)
2. Middle-click workspace switcher
3. Drag window to screen edge for 500ms (optional)

**Visual Design:**
```
┌─────────────────────────────────────┐
│  Active: Work Setup         [Edit]  │ ← Current profile, inline edit
├─────────────────────────────────────┤
│  ○ Default          Super+Ctrl+1    │ ← Radio selection, hotkey shown
│  ● Work Setup       Super+Ctrl+2    │
│  ○ Streaming        Super+Ctrl+3    │
│  ○ Development      (unassigned)    │
├─────────────────────────────────────┤
│  [+ New Profile]   [⚙ Settings]     │
└─────────────────────────────────────┘
```

**Behavior:**
- **Modal overlay** centered on primary monitor (fade background to 85% opacity)
- **Keyboard navigation**: Arrow keys, Enter to apply, Esc to cancel
- **Mouse**: Click to select, double-click to apply
- **Fast switch**: Type profile number (1-9) to apply immediately
- **Inline rename**: Click profile name to edit (Enter saves, Esc cancels)
- **Animation**: 150ms fade-in, zone preview on hover (ghosted zones on target monitors)

**Profile Actions (right-click context menu):**
- Rename
- Duplicate
- Assign Hotkey
- Delete (confirm if hotkey assigned or windows currently snapped)

---

## 2. Layout Editor

### 2.1 Editor Launch

**Entry Points:**
1. "Edit" button in profile picker (opens for active profile)
2. `Super+Shift+\`` when profile picker is open
3. Settings → Profiles → [Profile] → Edit Layouts

**Editor State:**
- Full-screen overlay per monitor (multi-monitor: edit all simultaneously)
- Toolbar at top center of primary monitor
- Real windows dimmed to 30% opacity, zone overlay at 70%

### 2.2 Toolbar Design

```
┌───────────────────────────────────────────────────────────────┐
│  Monitor: [Primary ▼]  Type: [Grid|Canvas]  [Templates ▼]    │
│  Margin: [8px]  Snap: [10px]  ☑ Show Numbers                 │
│  [Save] [Cancel] [Reset]                     Active: Work Setup│
└───────────────────────────────────────────────────────────────┘
```

### 2.3 Grid Layout Mode

**Core Interactions:**
- **Click zone**: Split horizontally (Shift+Click: vertical split)
- **Click divider**: Drag to resize
- **Double-click divider**: Delete (merge adjacent zones)
- **Ctrl+Click zone**: Select for multi-zone merge
- **Alt+Drag zone**: Reorder zone indices (for keyboard nav)

**Visual Feedback:**
- Dividers: 4px wide, blue (#3584e4), show resize cursor on hover
- Selected zones: 2px yellow border (#f6d32d)
- Zone numbers: 48pt bold, white with 50% black shadow, top-left corner
- Merge candidates: Animated dashed border when Ctrl held

**Keyboard Shortcuts (editor focused):**
- `Tab`: Cycle through zones/dividers
- `S`: Split focused zone horizontally
- `Shift+S`: Split focused zone vertically
- `Arrow keys`: Move divider (10px) or zone selection
- `Ctrl+Arrow`: Move divider 1px
- `Delete`: Remove focused divider (merge zones)
- `Ctrl+Z/Y`: Undo/redo
- `1-9`: Set focused zone index
- `Esc`: Cancel without saving
- `Enter`: Save and exit

**Grid Constraints:**
- Min zone size: 200x150px (enforced during resize)
- Max recursion depth: 6 levels (prevent unusably small zones)
- Snap to pixel grid (no sub-pixel positioning)

### 2.4 Canvas Layout Mode

**Core Interactions:**
- **Click empty space**: Create new zone (drag to size)
- **Click zone**: Select (Ctrl+Click: multi-select)
- **Drag zone**: Move (Shift+Drag: constrain to axis)
- **Drag zone edge**: Resize
- **Delete key**: Remove selected zones

**Visual Feedback:**
- Zone handles: 8x8px squares at corners and midpoints, #3584e4
- Selection: 2px dashed yellow border
- Overlap indicator: Red tint (50% opacity) on overlapping regions
- Alignment guides: Dotted lines when zone edge within 5px of another zone

**Keyboard Shortcuts (zone selected):**
- `Arrow keys`: Move zone 10px
- `Ctrl+Arrow`: Move zone 1px
- `Shift+Arrow`: Resize 10px (5px per edge)
- `Ctrl+Shift+Arrow`: Resize 2px (1px per edge)
- `Ctrl+D`: Duplicate selected zone
- `Delete`: Remove selected zone

**Canvas Constraints:**
- Min zone size: 150x100px
- Zones may overlap (stacking order: creation time)
- Zone bounds clamped to monitor rect

### 2.5 Templates System

**Built-in Templates:**
- Priority Grid (3 column: 50%-25%-25%)
- Focus (1 large + 3 vertical sidebar)
- Columns (2-6 equal columns)
- Rows (2-4 equal rows)
- PIP (Picture-in-picture: 80% main + 20% corner overlay)
- Ultrawide (3-section: 25%-50%-25%)

**Template Picker UI:**
```
┌─────────────────────────────────────┐
│  Search: [____]                     │
├─────────────────────────────────────┤
│  ┌─┬─┐  Priority Grid      Built-in│
│  └─┴─┘                              │
│  ┌───┐  Focus              Built-in│
│  ├┬┬┬┤                              │
│  ┌─┬─┬─┐ My Custom        Personal │
│  └─┴─┴─┘                            │
└─────────────────────────────────────┘
```

**Custom Templates:**
- "Save as Template" button in editor
- Name + optional description
- Stored in `~/.local/share/gnome-shell/extensions/fancyzones@example.com/templates.json`
- Share via export JSON (import via drag-drop or file picker)

---

## 3. Window Snapping UX

### 3.1 Zone Activation

**Mouse-driven:**
1. Start dragging window
2. Zones appear after 250ms (or immediately if Shift not required)
3. Hover zone: Highlight (300ms fade-in)
4. Adjacent zone edge hover (<10px): Highlight both zones
5. Drop: Snap window to zone(s)

**Keyboard-driven:**
- `Super+Arrow`: Move window to adjacent zone (by index or relative position)
- `Super+Ctrl+Alt+Arrow`: Expand window to adjacent zones (multi-zone snap)
- `Super+PgUp/PgDn`: Cycle windows in same zone

**Multi-zone Selection:**
- Hold `Ctrl` while dragging: Select multiple zones (click to toggle)
- Middle mouse drag: Box select zones
- Visual: All selected zones get yellow border, merged rect preview shown

### 3.2 Zone Overlay Rendering

**Appearance:**
- Active zone: 50% opacity fill (#3584e4 or custom), 3px border (#1c71d8)
- Inactive zones: 30% opacity fill (#5e5c64), 1px border (#77767b)
- Border radius: 8px (match GNOME 43+ aesthetic)
- Zone numbers: 36pt, white, top-right corner (if enabled)
- Multi-zone preview: Animated dashed border around merged rect

**Performance:**
- Render zones as Clutter.Actor with Cogl rectangles
- Redraw only on zone changes, not per-frame during drag
- Cache zone geometry, update on monitor config change
- Disable animations if drag operation lags (>100ms frame time)

### 3.3 Snap Behavior

**Default:**
- Window resizes to fill zone exactly (minus margin)
- Window decorations hidden (CSD apps: keep native decorations)
- Unsnap: Restore original size + position (store pre-snap state)

**Edge Cases:**
- **Window min size > zone**: Don't snap, show warning toast
- **Modal dialogs**: Don't snap (unless "snap popups" enabled)
- **Transient windows**: Snap if parent is snapped (optional setting)
- **Maximized window**: Unmaximize before snapping

---

## 4. Multi-Monitor Support

### 4.1 Monitor Detection

**Setup:**
- Detect monitors via `Meta.MonitorManager.get_monitors()`
- Store layouts by connector name (e.g., "DP-1", "HDMI-A-2")
- Fallback to index if connector unavailable (laptop docking scenarios)

**Layout Assignment:**
- Default: Each monitor gets "Priority Grid" template
- Profile-specific: Per-monitor layouts stored in profile
- Resolution change: Scale zones proportionally (validate min sizes)

### 4.2 Cross-Monitor Workflows

**Zone Spanning (optional setting):**
- Treat all monitors as single canvas
- Zones can span monitor boundaries
- **Constraint**: All monitors must have same DPI scale
- **UX**: Show warning in editor if DPI mismatch detected

**Window Migration:**
- `Super+Shift+Arrow`: Move window to adjacent monitor (preserve zone index if possible)
- Drag window between monitors: Show zones on all monitors (optional: only target monitor)

---

## 5. Settings & Preferences

### 5.1 Global Settings

**Activation:**
- ☑ Hold Shift to activate zones
- ☐ Use non-primary mouse button to toggle
- ☐ Use middle mouse for multi-zone

**Appearance:**
- Zone opacity: [50%] (slider 10-90%)
- Active color: [#3584e4] (color picker)
- Inactive color: [#5e5c64]
- Border color: [#1c71d8]
- ☑ Show zone numbers

**Behavior:**
- Zone margin: [8px] (0-50px)
- Snap threshold: [10px] (5-30px)
- ☑ Restore window size on unsnap
- ☑ Make dragged window transparent (70% opacity)
- ☐ Snap popup windows
- ☐ Snap child windows

**Keyboard:**
- Override Super+Arrow: ☑ Enabled
- Navigation mode: ○ Zone index  ● Relative position
- ☐ Cycle across all monitors

### 5.2 Per-Profile Settings

**Override global settings:**
- ☐ Use custom colors for this profile
- ☐ Use custom margins for this profile

**Window Rules:**
- Exclude applications: (list, one per line)
  - `firefox` (matches any window title containing "firefox")
  - `org.gnome.Nautilus` (exact app ID match)
- Pin applications to zones:
  - `code` → Monitor 1, Zone 0
  - `kitty` → Monitor 2, Zone 1

---

## 6. Persistence & Import/Export

### 6.1 Storage Format

**Location:**
- Profiles: `~/.local/share/gnome-shell/extensions/fancyzones@example.com/profiles.json`
- Settings: `~/.local/share/gnome-shell/extensions/fancyzones@example.com/settings.json`
- Window state: `~/.cache/gnome-shell/extensions/fancyzones@example.com/window-state.json`

**Schema:**
```json
{
  "version": "1.0",
  "profiles": [
    {
      "id": "uuid-here",
      "name": "Work Setup",
      "hotkey": "<Super><Ctrl>1",
      "layouts": [
        {
          "monitorId": "DP-1",
          "type": "grid",
          "zones": [
            {
              "id": "zone-0",
              "rect": {"x": 0, "y": 0, "w": 0.5, "h": 1},
              "index": 0
            }
          ]
        }
      ],
      "settings": {
        "shiftToActivate": false,
        "zoneMargin": 8,
        "snapThreshold": 10
      }
    }
  ],
  "activeProfile": "uuid-here"
}
```

### 6.2 Import/Export UX

**Export:**
- Settings → Profiles → [Profile] → Export
- Saves as `{profile-name}-{date}.fancyzones.json`
- Includes layouts, settings, window rules (excludes window state)

**Import:**
- Settings → Import Profile → File picker
- Preview: Shows profile name, monitor count, zone count
- Options: ☐ Import as new profile  ☑ Merge with existing

**Sync (future enhancement):**
- Via GNOME Online Accounts (Google Drive, Nextcloud)
- Automatic conflict resolution (last-write-wins)

---

## 7. Technical Implementation Notes

### 7.1 GNOME Shell APIs

**Core Dependencies:**
- `Meta.Display` - Window management
- `Meta.MonitorManager` - Display detection
- `Meta.WindowGroup` - Window stacking
- `Clutter.Actor` - Zone overlay rendering
- `St.Widget` - UI components (profile picker, editor toolbar)

**Event Handling:**
- `Meta.Display.grab-op-begin` - Detect drag start
- `Meta.Display.grab-op-end` - Detect drag end
- `Clutter.Stage.captured-event` - Global mouse/keyboard input

### 7.2 Performance Targets

- **Zone rendering**: <16ms per frame (60 FPS)
- **Profile switch**: <100ms (layout apply + zone recalc)
- **Editor load**: <200ms (including monitor detection)
- **Memory footprint**: <10MB resident (5 profiles, 50 zones total)

### 7.3 Compatibility

**GNOME Versions:**
- Target: 43, 44, 45, 46
- Minimum: 42 (EOL by implementation date)
- Use `imports.misc.extensionUtils.getCurrentExtension().metadata['shell-version']`

**Wayland vs X11:**
- Prefer Wayland APIs (Meta.Window geometry)
- X11 fallback: Use `xprop` for window properties
- Known limitations: Can't snap some X11 apps on Wayland (security restriction)

**Multi-DPI:**
- Store zones in normalized coordinates (0-1)
- Convert to pixels at render time using `monitor.geometry_scale`
- Validate min sizes in physical pixels

---

## 8. User Onboarding

### 8.1 First-Run Experience

**Welcome Dialog:**
```
┌─────────────────────────────────────┐
│  Welcome to FancyZones!             │
│                                     │
│  Quick Setup:                       │
│  1. Choose a starting template      │
│     [Priority Grid ▼]               │
│                                     │
│  2. Set activation method:          │
│     ○ Hold Shift while dragging     │
│     ● Always show zones (easier)    │
│                                     │
│  [Skip]              [Get Started]  │
└─────────────────────────────────────┘
```

**Tutorial Overlay:**
- First drag operation: Show tooltip "Drag to zone, release to snap"
- First keyboard snap: Show tooltip "Use Super+Arrow to move between zones"
- Persistent: "Show tips" toggle in settings

### 8.2 Help & Documentation

**In-app:**
- "?" button in editor toolbar → Context-sensitive help panel
- Keyboard shortcuts cheatsheet: `Super+Shift+/`
- Video tutorial link (YouTube, 2-3 min)

**External:**
- GitHub Wiki with screenshots
- GIF demos for common workflows
- FAQ: "How to exclude an app", "Why can't I snap this window?", etc.

---

## 9. Testing Scenarios

### 9.1 Functional Tests

- [ ] Create grid layout, snap 4 windows, switch profile, verify windows restore
- [ ] Delete zone with snapped window, verify window unsnaps gracefully
- [ ] Drag window to adjacent zone edge, verify multi-zone highlight
- [ ] Hotplug monitor, verify layout applies to new monitor
- [ ] Import profile with invalid zone data, verify error handling

### 9.2 Edge Cases

- [ ] Snap window, disconnect monitor, reconnect, verify window position
- [ ] Rapid profile switching (5 switches in 2 seconds), verify no crash
- [ ] 100 zones on single monitor, verify editor responsiveness
- [ ] Fullscreen app (game), verify zones don't show on top
- [ ] Screen recording, verify zone overlays appear in recording (optional setting)

### 9.3 Accessibility

- [ ] Navigate editor with keyboard only
- [ ] Use screen reader (Orca) to verify UI labels
- [ ] High contrast theme support (zone colors auto-adjust)
- [ ] Font scaling (125%, 150%, 200%) doesn't break editor layout

---

## 10. Future Enhancements

### 10.1 Phase 2 Features

- **Dynamic zones**: Auto-adjust on window count change (e.g., 1 window = full screen, 2 windows = split)
- **Zone templates per app**: Electron apps get different layout than terminals
- **Touchscreen support**: Swipe gestures to move windows
- **CLI tool**: `fancyzones apply work-setup`, `fancyzones export`

### 10.2 Integration Ideas

- **gTile compatibility**: Import gTile configs
- **Pop!_OS tiling**: Offer to replace native tiling
- **GNOME Extensions sync**: Via extensions.gnome.org account
- **AI layout suggestions**: Analyze window usage patterns, suggest optimal layouts

---

## Appendix A: Keyboard Shortcut Summary

| Shortcut | Action |
|----------|--------|
| `Super+Shift+\`` | Open profile picker / editor |
| `Super+Ctrl+1-9` | Quick switch to profile |
| `Super+Arrow` | Move window to adjacent zone |
| `Super+Ctrl+Alt+Arrow` | Expand window to multiple zones |
| `Super+PgUp/PgDn` | Cycle windows in same zone |
| `Super+Shift+Arrow` | Move window to adjacent monitor |

**Editor Mode:**

| Shortcut | Action |
|----------|--------|
| `Tab` | Cycle zones/dividers |
| `S` | Split zone horizontally |
| `Shift+S` | Split zone vertically |
| `Delete` | Remove divider (merge zones) |
| `Ctrl+Z/Y` | Undo/Redo |
| `Arrow keys` | Move zone/divider (10px) |
| `Ctrl+Arrow` | Move zone/divider (1px) |
| `Enter` | Save and exit |
| `Esc` | Cancel without saving |

---

## Appendix B: Configuration File Examples

### Simple 2-Zone Layout
```json
{
  "id": "simple-split",
  "name": "Simple Split",
  "layouts": [{
    "monitorId": "primary",
    "type": "grid",
    "zones": [
      {"id": "left", "rect": {"x": 0, "y": 0, "w": 0.5, "h": 1}, "index": 0},
      {"id": "right", "rect": {"x": 0.5, "y": 0, "w": 0.5, "h": 1}, "index": 1}
    ]
  }]
}
```

### Canvas Layout with Overlays
```json
{
  "id": "pip-layout",
  "name": "Picture-in-Picture",
  "layouts": [{
    "monitorId": "DP-1",
    "type": "canvas",
    "zones": [
      {"id": "main", "rect": {"x": 0, "y": 0, "w": 1, "h": 1}, "index": 0},
      {"id": "pip", "rect": {"x": 0.7, "y": 0.7, "w": 0.25, "h": 0.25}, "index": 1}
    ]
  }]
}
```

---

**Version**: 1.0  
**Last Updated**: 2025-11-25  
**Author**: Development Spec for GNOME FancyZones Extension  
**License**: MIT (example - adjust as needed)
