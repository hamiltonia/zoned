# Spec 03: Grid Template Configuration Dialog

## Overview
Quick configuration modal for adjusting grid-based template parameters without entering full editor mode. Provides sliders for zone count, spacing, and highlight distance, plus orientation presets.

---

## Dialog Structure

### Modal Overlay
```
┌────────────────────────────────────────────────────────────┐
│ [Templates displayed behind with 70% opacity]              │
│                                                            │
│               ┌──────────────────────┐                     │
│               │  Edit 'Grid'         │                     │
│               │                      │                     │
│               │  [Configuration UI]  │                     │
│               │                      │                     │
│               │  [Save] [Cancel]     │                     │
│               └──────────────────────┘                     │
└────────────────────────────────────────────────────────────┘
```

**Properties:**
- **Type**: Modal dialog (blocks template picker interaction)
- **Size**: 480x520px (fixed, not resizable)
- **Position**: Centered on layout picker window
- **Background**: #FFFFFF (light) / #2B2B2B (dark)
- **Shadow**: 0 8px 32px rgba(0,0,0,0.3)
- **Border radius**: 8px

---

## Dialog Header

```
┌────────────────────────────────┐
│ Edit 'Grid'               [📋] │
└────────────────────────────────┘
```

**Components:**
- **Title text**: "Edit '[Template Name]'"
  - Font: 18pt Segoe UI Semibold
  - Color: #000000 (light) / #FFFFFF (dark)
- **Copy icon** (📋): Right-aligned, 20x20px
  - Tooltip: "Duplicate layout"
  - Action: Creates new custom layout with current settings
- **Padding**: 20px all sides

---

## Preview Section

### Live Layout Preview
```
┌────────────────────────────────┐
│  ┌──────┬──────┐               │
│  │      │      │               │  ← Real-time preview
│  ├──────┼──────┤               │    Updates as sliders move
│  │      │      │               │
│  └──────┴──────┘               │
└────────────────────────────────┘
```

**Preview Canvas:**
- **Size**: 400x240px
- **Background**: #F3F3F3 (light) / #1E1E1E (dark)
- **Zone rendering**:
  - Fill: #D1D1D1 with 40% opacity
  - Stroke: #A1A1A1, 2px width
  - Margin: Reflects "Space around zones" value
- **Update rate**: Real-time (no debounce, smooth slider tracking)

---

## Configuration Controls

### 1. Number of Zones Slider

```
┌────────────────────────────────┐
│ [🎛] Number of zones            │
│      ●━━━━━━━━━━━━━━  4 zones  │
└────────────────────────────────┘
```

**Slider Properties:**
- **Range**: 1-9 zones
- **Default**: 4 (2x2 grid)
- **Step**: 1 (discrete values)
- **Width**: 320px
- **Thumb**: 20x20px circle, #0078D4
- **Track**: 4px height, #E1E1E1 (unfilled), #0078D4 (filled)

**Zone Count Logic:**
- **Display**: Show resulting grid dimensions
  - 1 zone: "1 zone"
  - 2 zones: "2 zones" (1x2 or 2x1 based on orientation)
  - 3 zones: "3 zones" (1x3 or 3x1)
  - 4 zones: "4 zones (2×2)"
  - 6 zones: "6 zones (2×3 or 3×2)"
  - 9 zones: "9 zones (3×3)"

**Grid Generation Algorithm:**
```javascript
function generateGrid(zoneCount) {
  const factors = findFactors(zoneCount);
  // Prefer closest to square
  const [rows, cols] = factors.reduce((best, current) => {
    const [r, c] = current;
    const ratio = Math.max(r/c, c/r);
    const bestRatio = Math.max(best[0]/best[1], best[1]/best[0]);
    return ratio < bestRatio ? current : best;
  });
  return { rows, cols };
}
```

**Example Mappings:**
- 1 → 1×1
- 2 → 1×2
- 3 → 1×3
- 4 → 2×2
- 5 → 1×5 (suboptimal, show warning)
- 6 → 2×3
- 7 → 1×7 (suboptimal, show warning)
- 8 → 2×4
- 9 → 3×3

### 2. Space Around Zones Slider

```
┌────────────────────────────────┐
│ [📏] Space around zones         │
│      ●━━━━━━━━━━━━━━  3 px [⚙] │
└────────────────────────────────┘
```

**Slider Properties:**
- **Range**: 0-50 px
- **Default**: 3 px (shown in image)
- **Step**: 1 px
- **Width**: 320px
- **Toggle**: Gear icon (⚙) to enable/disable spacing
  - When disabled: Value grays out, zones touch edges

**Visual Feedback:**
- **Preview updates**: Margin between zones adjusts instantly
- **0 px**: Zones touch each other (no gap)
- **50 px**: Large margins (useful for touch interfaces)

**Toggle Behavior:**
- **On** (default): Spacing applied
- **Off**: Spacing set to 0, slider disabled
- **Icon color**: Blue when on (#0078D4), gray when off (#8A8A8A)

### 3. Highlight Distance Slider

```
┌────────────────────────────────┐
│ [◎] Highlight distance          │
│     ●━━━━━━━━━━━━━━━  20 px    │
└────────────────────────────────┘
```

**Slider Properties:**
- **Range**: 0-100 px
- **Default**: 20 px (shown in image)
- **Step**: 5 px
- **Width**: 320px
- **Purpose**: Distance threshold for multi-zone highlight (adjacent zone snapping)

**Explanation:**
- **Value**: Pixels from zone edge to trigger adjacent zone highlight
- **Use case**: Dragging window near edge highlights both zones for merged snap
- **Low value (5px)**: Precise, requires accurate mouse positioning
- **High value (50px)**: Easier to trigger, more forgiving

**Visual Indicator (not in modal, but on actual screen during drag):**
- When mouse within N pixels of zone edge, both zones highlight
- Highlight color: Yellow border (#FFD700) on both zones

---

## Orientation Presets

### Checkbox Toggles
```
┌────────────────────────────────┐
│ ☆ Default layout for horizontal│
│   monitor orientation          │
│                                │
│ ☆ Default layout for vertical  │
│   monitor orientation          │
└────────────────────────────────┘
```

**Star Icon (☆/★):**
- **Unchecked**: Hollow star ☆
- **Checked**: Filled star ★ (gold #FFD700)
- **Purpose**: Pin this layout as default for portrait/landscape modes

**Behavior:**
1. **User rotates monitor** (90° to portrait)
2. **System detects orientation change**
3. **Auto-applies** layout marked as default for vertical orientation
4. **No manual intervention** required

**Mutual Exclusivity:**
- Only one layout can be default per orientation type
- Checking box auto-unchecks previous default
- Show toast: "Grid set as default for horizontal monitors"

**Use Cases:**
- **Horizontal (landscape)**: Standard desktop, 3-column coding layout
- **Vertical (portrait)**: Reading documents, single-column focus layout

---

## Action Buttons

### Button Bar
```
┌────────────────────────────────┐
│        [Cancel]      [Save]    │
└────────────────────────────────┘
```

**Layout:**
- **Alignment**: Right-aligned
- **Gap**: 12px between buttons
- **Padding**: 20px from dialog edge

### Cancel Button
**Properties:**
- **Size**: 100x36px
- **Style**: Secondary button
- **Background**: Transparent
- **Border**: 1px solid #8A8A8A
- **Text**: "Cancel" (15pt Segoe UI)
- **Hover**: Background #F3F3F3

**Action:**
- Discards all changes
- Closes dialog
- Returns to template picker with previous layout still selected

### Save Button
**Properties:**
- **Size**: 100x36px
- **Style**: Primary button
- **Background**: #0078D4
- **Text**: "Save" (15pt Segoe UI, white)
- **Hover**: Background #106EBE
- **Active**: Background #005A9E

**Action:**
1. **Validates settings** (no conflicts)
2. **Applies layout** to selected monitor immediately
3. **Shows zone preview** on actual screen (2-second fade)
4. **Saves to config** (if template modified, creates custom layout)
5. **Closes dialog**

**Validation Rules:**
- Zone count > 0
- Space around zones < 25% of screen width (prevent unusably small zones)
- If validation fails, show inline error, disable Save button

---

## Keyboard Interactions

| Key | Action |
|-----|--------|
| **Tab** | Cycle through controls (sliders → checkboxes → buttons) |
| **Shift+Tab** | Cycle backwards |
| **Arrow Left/Right** | Adjust focused slider value |
| **Space** | Toggle checkbox |
| **Enter** | Click Save button (if focused, else Save) |
| **Escape** | Click Cancel button |
| **Ctrl+S** | Quick save (bypass button focus) |

**Slider Keyboard Control:**
- **Left/Right**: ±1 step (1px for spacing, 5px for highlight)
- **Page Up/Down**: ±10% of range
- **Home/End**: Min/max value

---

## Visual Design Specs

### Colors (Light Theme)
- **Dialog background**: #FFFFFF
- **Preview background**: #F3F3F3
- **Zone fill**: #D1D1D1 (40% opacity)
- **Zone stroke**: #A1A1A1
- **Slider thumb**: #0078D4
- **Slider track (filled)**: #0078D4
- **Slider track (unfilled)**: #E1E1E1
- **Text primary**: #000000
- **Text secondary**: #605E5C
- **Star filled**: #FFD700
- **Star outline**: #8A8A8A

### Typography
- **Dialog title**: 18pt Segoe UI Semibold
- **Control labels**: 15pt Segoe UI Regular
- **Slider values**: 15pt Segoe UI Regular
- **Button text**: 15pt Segoe UI Semibold
- **Checkbox labels**: 14pt Segoe UI Regular

### Spacing
- **Dialog padding**: 20px all sides
- **Control vertical gap**: 24px
- **Preview margin-bottom**: 20px
- **Button bar margin-top**: 32px

### Animations
- **Dialog open**: Fade + scale (200ms ease-out)
  - Start: scale(0.95), opacity 0
  - End: scale(1), opacity 1
- **Dialog close**: Fade + scale (150ms ease-in)
- **Preview update**: No animation (instant redraw)
- **Slider drag**: Smooth 60 FPS updates
- **Star toggle**: Rotation 180° (300ms ease-out)

---

## State Management

### Local State (Dialog Session)
```javascript
const configState = {
  zoneCount: 4,
  spacing: 3,
  highlightDistance: 20,
  defaultHorizontal: false,
  defaultVertical: false,
  isDirty: false  // Tracks if settings changed
};
```

### Dirty State Detection
- **Initial load**: Copy current template settings
- **On change**: Set `isDirty = true`
- **Save button**: Enabled only if dirty
- **Cancel warning**: If dirty, show confirmation dialog
  ```
  ┌────────────────────────────────┐
  │ Discard changes?               │
  │                                │
  │ You have unsaved changes.      │
  │                                │
  │    [Cancel]  [Discard]         │
  └────────────────────────────────┘
  ```

### Template Modification Behavior
**Scenario 1: Edit Built-in Template**
- User changes "Grid" from 4 to 6 zones
- On Save: Prompt "Save as custom layout or update default?"
- Options:
  - "Update Grid template" (modifies built-in, affects all monitors)
  - "Save as new custom layout" (creates "Custom layout 1")

**Scenario 2: Edit Custom Layout**
- User changes existing custom layout
- On Save: Directly updates, no prompt
- History: Keep undo stack (last 10 changes)

---

## Edge Cases & Validation

### Prime Number Zone Counts
**Problem**: 5, 7, 11 zones result in 1×N grids (long skinny zones)

**Solution**: Show warning icon + tooltip
```
⚠ 5 zones creates a 1×5 grid.
  Consider 4 or 6 zones for better usability.
```

**Visual**: Orange warning triangle next to slider value

### Excessive Spacing
**Problem**: 50px spacing on 1920x1080 screen with 4 zones leaves tiny usable area

**Solution**: Calculate minimum zone size after spacing
```javascript
const minZoneSize = 200; // px
const availableWidth = screenWidth - (spacing * (cols + 1));
const availableHeight = screenHeight - (spacing * (rows + 1));
const zoneWidth = availableWidth / cols;
const zoneHeight = availableHeight / rows;

if (zoneWidth < minZoneSize || zoneHeight < minZoneSize) {
  showWarning("Spacing too large for current zone count");
  disableSaveButton();
}
```

### Monitor Orientation Change During Edit
**Problem**: User opens dialog, rotates monitor, settings now invalid

**Solution**: 
1. Detect orientation change via event listener
2. Show banner: "Monitor orientation changed. Preview may not reflect actual layout."
3. Update preview with new aspect ratio
4. Re-validate settings

---

## Data Persistence

### Modified Template Storage
**Location**: `custom-layouts.json` (merged with user customs)

**Entry:**
```json
{
  "id": "grid-2x3-modified",
  "name": "Grid (Modified)",
  "baseTemplate": "template-grid",
  "zoneCount": 6,
  "spacing": 3,
  "highlightDistance": 20,
  "defaultHorizontal": false,
  "defaultVertical": false,
  "zones": [...],  // Auto-generated from zoneCount
  "created": "2025-01-15T10:30:00Z"
}
```

### Default Layout Registry
**Location**: `%LOCALAPPDATA%\Microsoft\PowerToys\FancyZones\default-layouts.json`

```json
{
  "horizontal": "template-grid",
  "vertical": "template-columns-1"
}
```

**Update on checkbox toggle:**
- Immediately write to file
- Broadcast event to FancyZones service
- Service watches for orientation changes, applies layout

---

## Accessibility

### Screen Reader Support
- **Dialog open**: "Edit Grid layout dialog. Configure zone settings."
- **Slider focus**: "Number of zones, 4, slider, minimum 1, maximum 9"
- **Slider change**: "Number of zones, 5" (debounced, announce every 500ms)
- **Checkbox**: "Default layout for horizontal monitor orientation, checkbox, not checked"
- **Button**: "Save button, primary action"

### High Contrast Mode
- **Sliders**: Increase track height to 6px
- **Preview**: Force zone borders to system HighlightColor
- **Buttons**: Add 2px border in SystemButtonFace color
- **Text**: Force to SystemWindowText color

### Focus Management
- **Dialog open**: Focus on first slider (zone count)
- **Tab order**: Sliders → checkboxes → Cancel → Save
- **Trap focus**: Can't tab out of dialog (modal)
- **Close**: Restore focus to template card that opened dialog

---

## Performance Considerations

### Preview Rendering
- **Throttle**: Update max 60 FPS during slider drag
- **Debounce**: Final value triggers full re-layout calculation (50ms)
- **Canvas**: Use HTML5 Canvas API for smooth rendering
  - Clear and redraw on each update
  - Cache zone rectangles between frames

### Zone Calculation
```javascript
// Optimized grid generation (runs on slider change)
function calculateZones(rows, cols, spacing) {
  const zones = [];
  const cellWidth = (1 - spacing * (cols + 1)) / cols;
  const cellHeight = (1 - spacing * (rows + 1)) / rows;
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      zones.push({
        x: spacing + (cellWidth + spacing) * c,
        y: spacing + (cellHeight + spacing) * r,
        w: cellWidth,
        h: cellHeight,
        index: r * cols + c
      });
    }
  }
  return zones;
}
```

**Complexity**: O(rows × cols), negligible for max 9 zones

---

## GNOME Adaptation

### Gtk4 Dialog Implementation
```xml
<object class="GtkDialog" id="grid_config_dialog">
  <property name="modal">true</property>
  <property name="default-width">480</property>
  <property name="default-height">520</property>
  <child type="titlebar">
    <object class="GtkHeaderBar">
      <property name="show-title-buttons">true</property>
      <child>
        <object class="GtkButton">
          <property name="icon-name">edit-copy-symbolic</property>
          <property name="tooltip-text">Duplicate layout</property>
        </object>
      </child>
    </object>
  </child>
  <child>
    <object class="GtkBox">
      <property name="orientation">vertical</property>
      <property name="spacing">24</property>
      <child>
        <!-- Preview canvas -->
        <object class="GtkDrawingArea" id="preview_canvas">
          <property name="height-request">240</property>
        </object>
      </child>
      <child>
        <!-- Zone count slider -->
        <object class="GtkScale">
          <property name="adjustment">
            <object class="GtkAdjustment">
              <property name="lower">1</property>
              <property name="upper">9</property>
              <property name="value">4</property>
              <property name="step-increment">1</property>
            </object>
          </property>
        </object>
      </child>
      <!-- Additional controls -->
    </object>
  </child>
</object>
```

### Design Adjustments
1. **Adwaita sliders**: Use Gtk.Scale with marks at each integer
2. **Preview**: Gtk.DrawingArea with Cairo rendering
3. **Checkboxes**: Gtk.CheckButton with star icon prefix
4. **Buttons**: Gtk.Button with .suggested-action class for Save
5. **Colors**: Use theme-aware colors from Adwaita palette

### File Locations (GNOME)
- **Default layouts**: `~/.config/fancyzones/defaults.json`
- **Modified templates**: `~/.local/share/fancyzones/layouts/modified/`
