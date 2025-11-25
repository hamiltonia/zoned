# Spec 05: Layout Picker with Custom Layouts (Dark Theme)

## Overview
Template selection interface displaying dark theme implementation with visible custom layouts section. Shows multi-monitor support (3 displays), built-in templates, and user-created custom layouts with edit controls.

---

## Window Structure

### Dark Theme Window Chrome
```
┌────────────────────────────────────────────────────────────┐
│ [Icon] FancyZones Editor                    [—][□][×]      │
└────────────────────────────────────────────────────────────┘
```

**Properties:**
- **Background**: #202020 (very dark gray, not pure black)
- **Window chrome**: Native OS theme (Windows 11 dark mode)
- **Title bar**: #1A1A1A (slightly darker than content)
- **Text color**: #FFFFFF (white)
- **Size**: 1400x800px (larger than Spec 02 to show 3 monitors)

---

## Monitor Selection Bar (3 Monitors)

### Three-Monitor Layout
```
┌────────────────────────────────────────────────────────────┐
│  [─────1─────]  [─────2─────]  [─────3─────]              │
└────────────────────────────────────────────────────────────┘
```

**Monitor Cards:**
- **Monitor 1**: Blue border (selected, #0078D4, 3px)
- **Monitor 2**: Gray border (inactive, #404040, 1px)
- **Monitor 3**: Gray border (inactive, #404040, 1px)
- **Card content**: 
  - Number only (large, 48pt, centered)
  - Resolution hidden (cleaner dark theme design)
- **Background**: #2B2B2B (lighter than window background)

**Visual Differences from Light Theme (Spec 02):**
- **Simpler cards**: No resolution/DPI text (shown on hover only)
- **Higher contrast**: Borders more prominent
- **Spacing**: Slightly tighter (4px gap vs 8px)

**Hover State:**
```
┌──────────────┐
│      2       │
│ 3840 x 2160  │  ← Resolution appears on hover
│     200%     │
└──────────────┘
```

---

## Templates Section

### Section Header (Dark Theme)
```
Templates
```

**Typography:**
- **Font**: 24pt Segoe UI Semibold
- **Color**: #FFFFFF (white, not gray)
- **Margin**: 32px top, 20px bottom
- **Separator line**: 1px solid #404040 below header (optional)

### Template Grid (Dark Theme)
```
┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
│No layout│  Focus  │ Columns │  Rows   │  Grid   │Priority │
│         │         │ (Blue)  │         │         │  Grid   │
│  [img]  │  [img]  │  [img]  │  [img]  │  [img]  │  [img]  │
│         │    ✎    │    ✎    │    ✎    │    ✎    │    ✎    │
└─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘
```

**Grid Properties:**
- **Columns**: 6 (same as light theme)
- **Gap**: 16px
- **Row alignment**: Single row visible, scroll for more

### Template Card (Dark Theme)

**Structure:**
```
┌──────────────────┐
│ Columns          │  ← Title (white)
│ ┌──────────────┐ │
│ │   ▓▓▓ ▓▓▓    │ │  ← Preview (lighter gray zones)
│ │   ▓▓▓ ▓▓▓    │ │
│ │   ▓▓▓ ▓▓▓    │ │
│ └──────────────┘ │
│        ✎         │  ← Edit icon (visible on hover)
└──────────────────┘
```

**Dark Theme Colors:**
- **Card background**: #2B2B2B (matches monitor cards)
- **Card border**: 1px solid #404040 (default)
- **Preview background**: #1E1E1E (darker for contrast)
- **Zone preview fill**: #505050 (medium gray)
- **Zone preview stroke**: #707070 (lighter gray)
- **Title text**: #FFFFFF

**Selected State (Columns in image):**
- **Border**: 3px solid #0078D4 (blue)
- **Background**: #1A3A52 (dark blue tint, 20% opacity)
- **Checkmark**: Top-right corner, white circle with blue check

**Hover State:**
- **Background**: #353535 (lighter gray)
- **Border**: 2px solid #606060
- **Edit icon**: Fade in (opacity 0 → 1, 150ms)
- **Cursor**: pointer

**Edit Icon Behavior:**
- **Always visible**: Unlike light theme (hover-only), dark theme shows edit icon permanently on all templates
- **Size**: 20x20px
- **Color**: #B0B0B0 (medium gray)
- **Hover**: #FFFFFF (white), scale(1.1)
- **Click**: Opens config dialog (Spec 03)

---

## Custom Section (Populated)

### Section Header
```
Custom
```

**Typography**: Same as Templates header

### Custom Layout Grid (2 Layouts Shown)
```
┌──────────────────┬──────────────────┐
│ Custom layout 1  │ Custom layout 2  │
│  ┌────┬──┬──┐    │  ┌────────────┐  │
│  │    │  │  │    │  │            │  │
│  ├────┼──┼──┤    │  ├────────────┤  │
│  │    │  │  │    │  │            │  │
│  └────┴──┴──┘    │  └────────────┘  │
│       ✎          │       ✎          │
└──────────────────┴──────────────────┘
```

**Layout:**
- **Columns**: 6 (same as templates)
- **Gap**: 16px
- **Cards shown**: 2 custom layouts (user-created)

### Custom Layout Card Details

**Custom layout 1:**
- **Zone configuration**: 3-column left (stacked) + 2-column right
  - Left: 3 vertical zones (appears as stacked rectangles)
  - Right: 2 zones (upper and lower)
- **Complexity**: 5 total zones, asymmetric layout
- **Use case**: Code editor + terminals + docs

**Custom layout 2:**
- **Zone configuration**: 2 horizontal rows
  - Top row: Single large zone
  - Bottom row: Single zone (smaller)
- **Complexity**: 2 total zones, simple split
- **Use case**: Main work area + status/reference panel

### Card Enhancements (Dark Theme)

**Visible Controls:**
- **Edit icon**: Always visible (bottom-center, 20x20px)
- **Delete icon**: Top-right corner (trash icon, hidden by default)
  - **Hover**: Fade in, red (#E74856) on hover
  - **Click**: Shows confirmation dialog
- **Duplicate icon**: Top-left corner (two overlapping squares)
  - **Hover**: Fade in, blue (#0078D4)
  - **Click**: Creates copy with " (Copy)" suffix

**Context Menu (Right-click):**
```
┌────────────────────┐
│ Rename        F2   │
│ Duplicate     ^D   │
│ Edit          ↵    │
│ ─────────────      │
│ Set as default     │
│ Export...          │
│ Delete        Del  │
└────────────────────┘
```

**Context Menu Styling (Dark):**
- **Background**: #2B2B2B
- **Border**: 1px solid #404040
- **Text**: #FFFFFF
- **Hover background**: #353535
- **Divider**: 1px solid #404040
- **Shadow**: 0 4px 16px rgba(0,0,0,0.6)

---

## Create New Layout Button (Dark Theme)

### Button Design
```
┌────────────────────────────────────────────────┐
│                                [+ Create new layout] │
└────────────────────────────────────────────────┘
```

**Dark Theme Styling:**
- **Background**: #0078D4 (same blue as light theme)
- **Text**: #FFFFFF (white)
- **Border**: None
- **Shadow**: 0 2px 8px rgba(0,120,212,0.4) (blue glow)
- **Icon**: Plus sign (16x16px, white)
- **Size**: 180x40px
- **Position**: Fixed bottom-right, 24px margin

**Hover State:**
- **Background**: #106EBE (darker blue)
- **Shadow**: 0 4px 12px rgba(0,120,212,0.6) (stronger glow)
- **Transform**: translateY(-2px) (subtle lift)

**Active State:**
- **Background**: #005A9E (darkest blue)
- **Shadow**: 0 1px 4px rgba(0,120,212,0.3)
- **Transform**: translateY(0px)

---

## Visual Design Specs (Dark Theme)

### Color Palette
```
Background hierarchy:
- Window background:      #202020
- Section background:     #2B2B2B
- Card background:        #2B2B2B
- Preview background:     #1E1E1E
- Hover background:       #353535

Borders:
- Default border:         #404040
- Selected border:        #0078D4 (3px)
- Hover border:           #606060

Zone previews:
- Zone fill:              #505050
- Zone stroke:            #707070

Text:
- Primary text:           #FFFFFF
- Secondary text:         #B0B0B0
- Disabled text:          #606060

Accent:
- Primary blue:           #0078D4
- Hover blue:             #106EBE
- Active blue:            #005A9E
- Success green:          #107C10
- Error red:              #E74856
- Warning yellow:         #FFD700
```

### Typography
- **Headers**: 24pt Segoe UI Semibold, #FFFFFF
- **Card titles**: 15pt Segoe UI Semibold, #FFFFFF
- **Body text**: 14pt Segoe UI Regular, #B0B0B0
- **Monitor numbers**: 48pt Segoe UI Light, #FFFFFF

### Contrast Ratios (WCAG AA)
- **White on #202020**: 15.8:1 (passes AAA)
- **#B0B0B0 on #202020**: 6.2:1 (passes AA)
- **#0078D4 on #202020**: 4.7:1 (passes AA for large text)
- **#505050 on #1E1E1E**: 3.1:1 (fails, acceptable for decorative zones)

### Shadows & Depth
- **Card shadow**: 0 2px 8px rgba(0,0,0,0.3)
- **Button shadow**: 0 2px 8px rgba(0,120,212,0.4) (blue glow)
- **Dialog shadow**: 0 8px 32px rgba(0,0,0,0.6)
- **Hover card shadow**: 0 4px 12px rgba(0,0,0,0.4)

### Spacing (Identical to Light Theme)
- **Window padding**: 32px
- **Grid gap**: 16px horizontal and vertical
- **Section spacing**: 48px between Templates and Custom
- **Card padding**: 12px internal
- **Icon spacing**: 8px from edges

---

## Behavior & Interactions

### Theme Switching
**Trigger**: System theme change or manual toggle in settings

**Transition:**
1. **Detect theme change** via OS event
2. **Animate color transitions** (300ms ease-out)
3. **Update all UI elements** simultaneously
4. **Persist preference** to config file

**Smooth Transition (CSS):**
```css
.fancyzones-picker * {
  transition: background-color 300ms ease-out,
              border-color 300ms ease-out,
              color 300ms ease-out;
}
```

### Multi-Monitor Workflow (3 Monitors)

**Scenario**: User has 3 monitors with different layouts
- **Monitor 1**: "Columns" template (shown selected)
- **Monitor 2**: "Grid" template
- **Monitor 3**: "Custom layout 1"

**Switching Monitors:**
1. **Click Monitor 2 card**
2. **Border moves to Monitor 2** (blue highlight)
3. **Templates section updates** to show "Grid" as selected
4. **Custom section remains same** (custom layouts are global)
5. **Preview on actual Monitor 2** shows zones for 2 seconds

**Visual Indicator (Per-Monitor Layouts):**
```
┌──────────────────┐
│ Grid          ①  │  ← Small monitor badge (top-right)
│ ┌────┬────┐      │
│ ├────┼────┤      │
│ └────┴────┘      │
└──────────────────┘
```

**Badge Styling:**
- **Size**: 20x20px circle
- **Background**: #0078D4 (blue)
- **Text**: Monitor number (12pt, white)
- **Position**: Top-right corner, 4px offset
- **Purpose**: Show which monitor uses this layout

---

## Custom Layout Management

### Rename Workflow
1. **Click card title** (or press F2 when focused)
2. **Title becomes editable** text field
3. **User types** new name
4. **Press Enter** to save, Escape to cancel
5. **Validation**: No duplicates, max 50 chars, no special chars

**Inline Edit Styling:**
```
┌──────────────────┐
│ [My Layout___] ✓ │  ← Text input + checkmark
└──────────────────┘
```

- **Input background**: #1E1E1E
- **Input border**: 2px solid #0078D4
- **Checkmark**: Green (#107C10), click to confirm

### Duplicate Workflow
1. **Click duplicate icon** or press Ctrl+D
2. **New card appears** next to original
3. **Name**: "[Original Name] (Copy)"
4. **Configuration**: Exact clone of zones
5. **Animation**: Scale up from 0.8 to 1.0 (200ms)

### Delete Workflow
1. **Click delete icon** or press Delete
2. **Confirmation dialog** appears:
   ```
   ┌────────────────────────────────────┐
   │ Delete layout?                     │
   │                                    │
   │ "Custom layout 1" will be removed. │
   │ This cannot be undone.             │
   │                                    │
   │    [Cancel]  [Delete]              │
   └────────────────────────────────────┘
   ```
3. **If confirmed**: Card fades out (300ms), grid reflows
4. **If active on monitor**: Prompt to choose replacement layout

---

## Keyboard Navigation (Dark Theme)

### Focus Indicators
- **Focus ring**: 2px solid #0078D4 with 3px offset
- **Visibility**: High contrast against dark background
- **Animation**: Fade in 100ms

### Tab Order
1. **Monitor cards** (left to right)
2. **Template cards** (row-by-row, left to right)
3. **Custom layout cards** (same pattern)
4. **Create new layout button**

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| **Tab** | Navigate forward |
| **Shift+Tab** | Navigate backward |
| **Arrow keys** | Navigate within grid (2D) |
| **Enter** | Apply selected layout |
| **Space** | Select card (for multi-select) |
| **F2** | Rename custom layout |
| **Ctrl+D** | Duplicate focused layout |
| **Delete** | Delete focused custom layout |
| **Ctrl+N** | Create new layout |
| **Escape** | Close picker |
| **1-9** | Quick select monitor |

---

## Edge Cases (Dark Theme Specific)

### Low-Contrast Zones
**Problem**: Some user screenshots have dark backgrounds, zones barely visible

**Solution**:
1. **Detect background luminance** (calculate average brightness)
2. **If luminance < 30%**: Use lighter zone fill (#707070)
3. **If luminance > 70%**: Use darker zone fill (#404040)
4. **Adaptive contrast**: Ensure 3:1 ratio minimum

### OLED Burn-in Prevention
**Problem**: Static UI elements on OLED displays (taskbar, monitor cards)

**Solution**:
1. **Pixel shift**: Subtly move UI elements ±2px every 5 minutes
2. **Auto-dimming**: After 2 minutes of inactivity, reduce brightness by 20%
3. **Screensaver**: After 10 minutes, show animated zone preview

### Multiple Theme Profiles
**Problem**: User wants dark theme for night, light theme for day

**Solution**:
1. **Follow system theme** by default (Windows 11 auto-switching)
2. **Manual override**: Setting to force light/dark/auto
3. **Sync with schedule**: Optional time-based switching (e.g., dark after 8 PM)

---

## Accessibility (Dark Theme)

### High Contrast Mode (Dark)
When Windows High Contrast Dark theme enabled:
- **Background**: Pure black (#000000)
- **Text**: Pure white (#FFFFFF)
- **Borders**: System ButtonText color (usually yellow)
- **Selected**: System Highlight color
- **Focus ring**: System HighlightText color, 4px width

### Screen Reader Enhancements
- **Theme announcement**: "Dark theme enabled" on switch
- **Color descriptions**: "Blue border" instead of just "selected"
- **Zone previews**: Describe layout structure (e.g., "3 equal columns")

### Readability
- **Font weight**: Slightly bolder in dark theme (500 vs 400)
  - Reason: White text on dark appears thinner optically
- **Line height**: 1.5 (increased from 1.4 in light theme)
- **Letter spacing**: +0.01em for improved readability

---

## Performance (Dark Theme)

### GPU Acceleration
- **Use hardware acceleration** for shadows and gradients
- **CSS will-change**: Hint browser to optimize
  ```css
  .card {
    will-change: transform, box-shadow;
  }
  ```

### Rendering Optimizations
- **Composite layers**: Separate layer for each card (smoother hover)
- **Throttle hover effects**: Debounce to 60 FPS
- **Lazy load previews**: Only render visible cards (virtual scrolling)

### Dark Theme Specific
- **Reduce shadow blur**: Dark themes need less blur (10px vs 16px)
- **Fewer gradients**: Solid colors perform better, less GPU load
- **OLED black**: Use true black (#000000) on OLED displays for pixel off

---

## GNOME Adaptation (Dark Theme)

### Gtk4 Dark Theme
```xml
<object class="GtkWindow" id="layout_picker">
  <property name="title">FancyZones Editor</property>
  <style>
    <class name="fancyzones-dark"/>
  </style>
  <!-- Content -->
</object>
```

### CSS Styling
```css
.fancyzones-dark {
  background-color: @dark_1;  /* #202020 */
}

.fancyzones-dark .card {
  background-color: @dark_2;  /* #2B2B2B */
  border: 1px solid @dark_4;  /* #404040 */
}

.fancyzones-dark .card:selected {
  border: 3px solid @blue_3;  /* #0078D4 */
  background-color: alpha(@blue_3, 0.1);
}
```

### Theme Switching (GNOME)
```javascript
const settings = new Gio.Settings({
  schema_id: 'org.gnome.desktop.interface'
});

const theme = settings.get_string('color-scheme');
// 'default', 'prefer-dark', 'prefer-light'

settings.connect('changed::color-scheme', () => {
  applyTheme(settings.get_string('color-scheme'));
});
```

### Adwaita Dark Palette
- **@dark_1**: #1e1e1e (window bg)
- **@dark_2**: #303030 (widget bg)
- **@dark_3**: #3d3d3d (border)
- **@dark_4**: #4a4a4a (insensitive border)
- **@accent_color**: #3584e4 (GNOME blue, slightly different from #0078D4)

---

## Data Persistence (Theme Preference)

### Settings Storage
**Location**: `%LOCALAPPDATA%\Microsoft\PowerToys\FancyZones\settings.json`

**Schema Addition:**
```json
{
  "theme": {
    "mode": "auto",  // "auto", "light", "dark"
    "followSystem": true,
    "darkModeSchedule": {
      "enabled": false,
      "startTime": "20:00",
      "endTime": "08:00"
    }
  }
}
```

### Cross-Platform Sync (Future)
- **Cloud storage**: Sync theme preference across devices
- **Per-device override**: Allow laptop to use dark, desktop to use light
- **Location-aware**: Auto-switch based on sunset/sunrise times

---

## Future Enhancements (Dark Theme)

### True Black Mode (OLED)
- **Setting**: "Use true black for OLED displays"
- **Background**: #000000 instead of #202020
- **Benefits**: Better contrast, battery savings on OLED

### Custom Accent Colors
- **User-defined accents**: Replace #0078D4 with custom color
- **Presets**: Material Blue, Solarized, Nord, Dracula
- **Auto-generation**: Pick accent, generate full palette

### Ambient Light Adaptation
- **Sensor integration**: Use ambient light sensor (if available)
- **Dynamic brightness**: Adjust UI brightness based on room lighting
- **Contrast boost**: Increase contrast in bright environments

### Wallpaper-Based Theming
- **Color extraction**: Sample desktop wallpaper colors
- **Generate palette**: Create harmonious theme from wallpaper
- **Live updates**: Change theme when wallpaper changes
