# Spec 04: Grid Editor Mode (Active Editing)

## Overview
Full-screen grid editing interface showing live zone manipulation during layout creation. Displays zone numbers, interactive dividers, merge functionality, and instructional overlay for user guidance.

---

## Window Structure

### Full-Screen Overlay
```
┌────────────────────────────────────────────────────────────┐
│                     [FULL SCREEN]                          │
│ ┌──────────┐ ───── ┐                                       │
│ │    1     │       │                                       │
│ │          │ ═══   │  ← Zones displayed at actual size    │
│ ├──────────┤       │     on target monitor                │
│ │    2     │       │                                       │
│ └──────────┘───────┘                                       │
│                                                            │
│           [Instructional Dialog]                           │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Properties:**
- **Display mode**: Full-screen on target monitor
- **Background**: Desktop backdrop dimmed to 30% opacity (blur + darken)
- **Real windows**: Visible through zones at 30% opacity
- **Zone overlay**: 70% opacity (adjustable in settings)
- **Escape behavior**: Press Esc or click outside zones to cancel

---

## Zone Display

### Zone Appearance
```
┌──────────────┐
│      1       │  ← Zone number (large, centered)
│              │
│              │
└──────────────┘
```

**Visual Properties:**
- **Fill color**: #0078D4 (Microsoft blue) at 50% opacity
- **Border**: 3px solid #1C71D8 (darker blue)
- **Border radius**: 4px (subtle rounding)
- **Zone numbers**:
  - Font: 72pt Segoe UI Bold
  - Color: #000000 (black, high contrast)
  - Position: Centered in zone
  - Opacity: 100% (always fully visible)
  - Shadow: 2px drop shadow for readability on light backgrounds

**Example from Image:**
- **Zone 1**: Top-left (larger zone)
- **Zone 2**: Bottom-left (smaller zone)
- **Zone 3**: Right side (large zone)

### Active Zone States

**Default State:**
- Fill: 50% opacity blue
- Border: 3px solid blue
- Number: Black, fully visible

**Hover State:**
- Fill: 60% opacity blue (brighter)
- Border: 4px solid blue (thicker)
- Cursor: pointer
- Tooltip: "Click to split zone" (appears after 500ms)

**Selected State (Multi-select):**
- Fill: 70% opacity yellow (#FFD700)
- Border: 4px dashed yellow
- Number: Changes color to #8B4513 (brown) for contrast
- Corner indicators: Small checkmarks in top-right

---

## Interactive Dividers

### Divider Appearance
```
    Zone 1
──────────  ← Horizontal divider (active)
    Zone 2
```

**Visual Properties:**
- **Width**: 8px (actual clickable area 20px for easier targeting)
- **Color**: 
  - Default: #8A8A8A (medium gray)
  - Hover: #0078D4 (blue)
  - Active (dragging): #FFD700 (yellow)
- **Style**: Solid line with circular handle in center
- **Handle**: 12px diameter circle, same color as divider
- **Cursor**: `ns-resize` (horizontal) or `ew-resize` (vertical)

**Example from Image:**
- **Visible divider**: Between Zone 1 and Zone 2 (horizontal)
- **Handle position**: Center of divider, indicated by `≡` (hamburger icon)
- **Secondary indicator**: `║` symbol shows draggable vertical divider

### Divider Interactions

**Click:**
- No immediate action (requires drag)
- Focus state: Highlight in blue

**Drag:**
1. **Mouse down** on handle
2. **Divider follows cursor** (constrained to axis)
3. **Adjacent zones resize** in real-time
4. **Snap to grid**: Every 10px (hold Shift to disable)
5. **Min zone size**: 150px (enforced, divider can't move beyond)
6. **Release**: Finalizes new layout

**Keyboard Control (Divider Focused):**
- **Arrow keys**: Move 10px in direction
- **Ctrl+Arrow**: Move 1px (fine adjustment)
- **Shift+Arrow**: Move 50px (large jumps)
- **Delete**: Remove divider (merges adjacent zones)

**Double-click Divider:**
- **Action**: Opens split ratio dialog
  ```
  ┌────────────────────────┐
  │ Split Ratio            │
  ├────────────────────────┤
  │ Zone 1: [50]%          │
  │ Zone 2: [50]%          │
  │         [Apply]        │
  └────────────────────────┘
  ```
- **Use case**: Precise percentage-based splits (e.g., 33.33% / 66.67%)

---

## Zone Splitting

### Split Orientation Indicator
```
┌──────────────┐
│       │      │  ← Vertical split preview
│   1   │  1   │     (appears on hover)
│       │      │
└──────────────┘

┌──────────────┐
│      1       │
├──────────────┤  ← Horizontal split preview
│      1       │     (Shift+hover)
└──────────────┘
```

**Split Trigger:**
- **Click zone**: Splits horizontally (default)
- **Shift+Click zone**: Splits vertically
- **Preview**: Shows split line on hover (dashed, 2px, #8A8A8A)

**Split Behavior:**
1. **User clicks Zone 1**
2. **Zone divides** into two equal parts (Zone 1a and Zone 1b)
3. **Numbers update**: 1 becomes 1 and 4 (new index appended)
4. **Divider appears**: Interactive handle at split line
5. **Animation**: 200ms ease-out (zones slide into place)

**Split Constraints:**
- **Max depth**: 6 levels of subdivision (prevent unusably small zones)
- **Min resulting size**: 150x100px per zone
- **Warning**: If split would create <150px zone, show tooltip "Zone too small to split"

---

## Zone Merging

### Merge Action Button
```
┌──────────────────┐
│ [▭] Merge zones  │  ← Floating action button
└──────────────────┘
```

**Location**: Bottom-center of screen (shown in image)

**Merge Workflow:**
1. **Hold Ctrl + Click Zone 1**
2. **Zone highlights** in yellow (selected state)
3. **Click Zone 2**
4. **Both zones** now highlighted in yellow
5. **Merge button appears** (or right-click → Merge)
6. **Click Merge**
7. **Zones combine** into single larger zone
8. **Numbers reindex**: Remaining zones renumbered sequentially

**Visual Feedback:**
- **Selected zones**: Yellow (#FFD700) overlay
- **Valid merge**: Zones must be adjacent (share edge)
- **Invalid merge**: If non-adjacent selected, show error tooltip
- **Merge preview**: Dashed outline around merged area

**Keyboard Shortcut:**
- **Ctrl+M**: Merge selected zones
- **Delete**: Merge by removing divider between zones

---

## Instructional Overlay Dialog

### Dialog Appearance (from Image)
```
┌────────────────────────────────────┐
│ Hold down Shift key to change      │
│ orientation of splitter.           │
│ To merge zones, select the zones   │
│ and click "merge".                 │
│                                    │
│    [Save & apply]    [Cancel]      │
└────────────────────────────────────┘
```

**Properties:**
- **Type**: Non-modal floating dialog (doesn't block interaction)
- **Size**: 400x180px
- **Position**: Top-center of screen (y-offset 100px)
- **Background**: Semi-transparent white (#FFFFFF at 95% opacity)
- **Shadow**: 0 8px 24px rgba(0,0,0,0.4)
- **Border radius**: 8px

### Dialog Content

**Instructional Text:**
- **Line 1**: "Hold down Shift key to change orientation of splitter."
- **Line 2**: "To merge zones, select the zones and click 'merge'."
- **Font**: 15pt Segoe UI Regular
- **Color**: #000000
- **Alignment**: Center
- **Line height**: 1.6

**Action Buttons:**
- **Save & apply**: Primary button (blue #0078D4)
- **Cancel**: Secondary button (gray border)
- **Size**: 120x40px each
- **Gap**: 16px between buttons

### Button Actions

**Save & apply:**
1. **Validates layout** (min zone sizes, no invalid configs)
2. **Saves to config file**
3. **Applies immediately** to monitor
4. **Closes editor**
5. **Shows toast**: "Layout applied to Monitor 1"

**Cancel:**
1. **Discards changes**
2. **Restores previous layout** (if existed)
3. **Closes editor**
4. **No toast** (silent cancel)

**Confirmation on Cancel:**
If zones modified, show dialog:
```
┌────────────────────────────────────┐
│ Discard changes?                   │
│                                    │
│ You have unsaved layout changes.   │
│                                    │
│    [Keep Editing]  [Discard]       │
└────────────────────────────────────┘
```

---

## Toolbar (Minimized in Full-screen)

### Floating Toolbar
```
┌────────────────────────────────────────────┐
│ [↶] [↷] [⊞] [⊟] [◫]  Zones: 3  [⚙] [×]    │
└────────────────────────────────────────────┘
```

**Location**: Top-left corner (semi-transparent overlay)

**Tools:**
- **↶ Undo**: Revert last action (Ctrl+Z)
- **↷ Redo**: Reapply undone action (Ctrl+Y)
- **⊞ Split**: Add split to selected zone (S key)
- **⊟ Merge**: Merge selected zones (M key)
- **◫ Reset**: Restore to starting template
- **Zone counter**: "Zones: 3" (live count)
- **⚙ Settings**: Quick access to margins, colors
- **× Close**: Exit editor (with save prompt if dirty)

**Toolbar Behavior:**
- **Auto-hide**: Fades out after 3 seconds of inactivity
- **Show**: Mouse moves to top-left corner or hover
- **Opacity**: 80% background (#FFFFFF)
- **Animation**: 200ms fade in/out

---

## Keyboard Shortcuts (Editor Mode)

| Shortcut | Action |
|----------|--------|
| **Click zone** | Split horizontally |
| **Shift+Click zone** | Split vertically |
| **Ctrl+Click zone** | Select/deselect for merge |
| **S** | Split focused zone horizontally |
| **Shift+S** | Split focused zone vertically |
| **M** / **Ctrl+M** | Merge selected zones |
| **Delete** | Remove focused divider (merge) |
| **Arrow keys** | Move focused divider 10px |
| **Ctrl+Arrow** | Move focused divider 1px |
| **Tab** | Cycle through zones/dividers |
| **Ctrl+Z** | Undo |
| **Ctrl+Y** | Redo |
| **Ctrl+S** | Save & apply |
| **Escape** | Cancel (with confirmation) |
| **F1** | Show help overlay |

---

## Visual Design Specs

### Colors (Light Mode)
- **Zone fill**: #0078D4 at 50% opacity
- **Zone border**: #1C71D8 (darker blue)
- **Zone number**: #000000
- **Selected zone fill**: #FFD700 at 70% opacity (yellow)
- **Divider default**: #8A8A8A
- **Divider hover**: #0078D4
- **Divider active**: #FFD700
- **Background dim**: Desktop at 30% opacity + blur(10px)

### Colors (Dark Mode)
- **Zone fill**: #4A9EFF at 50% opacity (lighter blue)
- **Zone border**: #76B1FF
- **Zone number**: #FFFFFF
- **Selected zone fill**: #FFD700 at 60% opacity
- **Divider default**: #8A8A8A
- **Divider hover**: #4A9EFF
- **Background dim**: Desktop at 20% opacity + blur(10px)

### Typography
- **Zone numbers**: 72pt Segoe UI Bold, centered
- **Instruction text**: 15pt Segoe UI Regular
- **Button text**: 15pt Segoe UI Semibold
- **Toolbar text**: 14pt Segoe UI Regular

### Spacing & Dimensions
- **Zone min size**: 150x100px
- **Divider width**: 8px visual, 20px clickable
- **Handle diameter**: 12px
- **Border thickness**: 3px (default), 4px (hover/selected)
- **Border radius**: 4px

### Animations
- **Zone split**: 200ms ease-out
  - Start: Single zone at 100% size
  - End: Two zones sliding into position
- **Zone merge**: 250ms ease-in
  - Start: Two zones at current size
  - End: Single merged zone expanding
- **Divider drag**: 60 FPS smooth tracking
- **Hover effects**: 100ms transition
- **Toolbar fade**: 200ms opacity change

---

## Edge Cases & Validation

### Minimum Zone Size Enforcement
**Problem**: User drags divider too far, creating <150px zone

**Solution**:
1. **Divider stops** at min threshold
2. **Visual feedback**: Divider turns red
3. **Haptic feedback**: If supported, brief vibration
4. **Tooltip**: "Cannot resize smaller than 150px"

### Maximum Subdivision Depth
**Problem**: User splits zones 7+ times, creating unusably small areas

**Solution**:
1. **Disable split** for zones at depth 6
2. **Visual indicator**: Zone grays out on hover
3. **Tooltip**: "Maximum split depth reached"
4. **Alternative**: Suggest deleting zones to simplify layout

### Orphaned Zones After Merge
**Problem**: After merge, non-sequential zone indices (1, 2, 5, 7)

**Solution**:
1. **Auto-reindex** after merge operation
2. **Animate numbers** changing (fade out old, fade in new)
3. **Preserve spatial order**: Top-to-bottom, left-to-right

### Accidental Clicks
**Problem**: User clicks zone intending to drag divider, triggers split

**Solution**:
1. **Delay split**: 100ms click-hold before split preview
2. **Cancel on drag**: If mouse moves >5px, interpret as divider drag attempt
3. **Undo shortcut**: Ctrl+Z immediately after accidental split

---

## Data Model (During Edit Session)

### Zone Structure
```javascript
const editSession = {
  zones: [
    {
      id: "zone-0",
      rect: { x: 0, y: 0, w: 0.5, h: 0.5 },
      index: 0,
      depth: 1,
      parent: null,
      children: ["zone-1", "zone-2"]
    },
    {
      id: "zone-1",
      rect: { x: 0, y: 0, w: 0.5, h: 0.25 },
      index: 1,
      depth: 2,
      parent: "zone-0",
      children: []
    }
  ],
  dividers: [
    {
      id: "divider-0",
      orientation: "horizontal",
      position: 0.5,  // Normalized (0-1)
      zones: ["zone-1", "zone-2"]
    }
  ],
  history: [
    { action: "split", zone: "zone-0", timestamp: Date.now() }
  ],
  historyIndex: 0
};
```

### Undo/Redo Stack
- **Max history**: 50 actions
- **Actions tracked**:
  - Split zone
  - Merge zones
  - Move divider
  - Delete zone
- **State snapshot**: Full zone configuration per action
- **Performance**: Use structural sharing (only store diffs)

---

## Performance Optimization

### Rendering Strategy
1. **Canvas-based** rendering (HTML5 Canvas or WebGL)
2. **Dirty regions**: Only redraw changed zones
3. **Offscreen buffer**: Pre-render static elements
4. **Debounce**: Drag updates throttled to 60 FPS
5. **Layer composition**: 
   - Background (desktop screenshot, static)
   - Zones (redraw on change)
   - Dividers (redraw on drag)
   - Numbers (static except on reindex)

### Memory Management
- **Zone limit**: Max 100 zones per layout (practical limit ~20-30)
- **History pruning**: Auto-delete history >50 actions
- **Canvas pooling**: Reuse canvas contexts, don't recreate

---

## Accessibility

### Screen Reader Support
- **Editor open**: "Grid editor opened. 3 zones. Use Tab to navigate zones and dividers."
- **Zone focus**: "Zone 1, double the width, half the height. Press S to split."
- **Divider focus**: "Horizontal divider between zones 1 and 2. Use arrow keys to adjust."
- **Split action**: "Zone 1 split into zones 1 and 4."
- **Merge action**: "Zones 1 and 2 merged into zone 1. 2 zones remaining."

### Keyboard-only Workflow
1. **Tab** to first zone
2. **S** to split
3. **Tab** to divider
4. **Arrow keys** to adjust size
5. **Tab** to next zone
6. **Ctrl+Click** to select for merge (use Ctrl+M instead)
7. **Ctrl+S** to save

### High Contrast Mode
- **Zones**: Solid colors, no transparency
- **Dividers**: 4px width, high contrast color
- **Numbers**: White text, black 100% background circle
- **Focus rings**: 4px yellow border

---

## GNOME Adaptation

### Wayland Full-screen Overlay
```javascript
// Use Clutter for zone overlay
const zoneOverlay = new Clutter.Actor({
  layout_manager: new Clutter.BinLayout(),
  reactive: true,
  x: monitor.x,
  y: monitor.y,
  width: monitor.width,
  height: monitor.height
});

// Add zones as Clutter.Rectangle actors
zones.forEach(zone => {
  const zoneActor = new Clutter.Rectangle({
    color: new Clutter.Color({ red: 0, green: 120, blue: 212, alpha: 128 }),
    border_width: 3,
    border_color: new Clutter.Color({ red: 28, green: 113, blue: 216, alpha: 255 }),
    x: zone.rect.x * monitor.width,
    y: zone.rect.y * monitor.height,
    width: zone.rect.w * monitor.width,
    height: zone.rect.h * monitor.height,
    reactive: true
  });
  
  zoneOverlay.add_child(zoneActor);
});

global.stage.add_child(zoneOverlay);
```

### Design Adjustments
1. **Adwaita colors**: Use theme-aware blues/yellows
2. **Gtk4 dialog**: Replace floating instructional dialog with Gtk.Dialog
3. **Toolbar**: Use Gtk.HeaderBar with tool buttons
4. **Numbers**: Render with Pango.Layout for proper font rendering
5. **Animations**: Use Clutter transitions instead of CSS

### Input Handling
```javascript
zoneActor.connect('button-press-event', (actor, event) => {
  const button = event.get_button();
  const modifiers = event.get_state();
  
  if (modifiers & Clutter.ModifierType.SHIFT_MASK) {
    splitVertical(zone);
  } else {
    splitHorizontal(zone);
  }
  
  return Clutter.EVENT_STOP;
});
```
