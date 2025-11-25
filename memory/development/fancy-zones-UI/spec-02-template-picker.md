# Spec 02: Layout Template Picker

## Overview
Template selection interface for choosing pre-built layouts or creating custom zones. Displays monitor selection at top, built-in templates, and custom layout gallery.

---

## Window Structure

### Window Chrome
```
┌────────────────────────────────────────────────────────────┐
│ [Icon] FancyZones Editor                    [—][□][×]      │
└────────────────────────────────────────────────────────────┘
```

**Properties:**
- **Window type**: Modal dialog (blocks input to main settings)
- **Size**: 1200x720px (min 800x600px)
- **Position**: Centered on monitor specified in settings
- **Resizable**: Yes (templates reflow in grid)
- **Background**: #FFFFFF (light) or #202020 (dark theme)

---

## Monitor Selection Bar

### Desktop Layout
```
┌────────────────────────────────────────────────────────────┐
│  [────────1────────]  [──────2──────]                      │
│    3000 x 2000          3840 x 2160                        │
│       100%                 200%                            │
└────────────────────────────────────────────────────────────┘
```

**Monitor Cards:**
- **Active monitor**: Blue border (#0078D4), 3px solid
- **Inactive monitors**: Gray border (#E1E1E1), 1px solid
- **Card content**:
  - Monitor number (48pt bold)
  - Resolution (15pt regular)
  - DPI scale percentage (13pt secondary text)
- **Layout**: Horizontal flex, 8px gap
- **Width**: Proportional to actual monitor aspect ratio

**Interaction:**
- **Click**: Select monitor (applies layout to selected display)
- **Hover**: Light background tint (#F5F5F5)
- **Keyboard**: Arrow keys to cycle, Enter to confirm

**Multi-monitor Behavior:**
- Auto-detect connected displays via `Meta.MonitorManager`
- Show all physical monitors + "All Monitors" virtual option (if DPI match)
- Persist last-selected monitor per session

---

## Templates Section

### Section Header
```
Templates
```

**Typography:**
- **Font**: 24pt Segoe UI Semibold
- **Color**: #000000 (light) / #FFFFFF (dark)
- **Margin**: 32px top, 16px bottom

### Template Grid
```
┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
│No layout│  Focus  │ Columns │  Rows   │  Grid   │Priority │
│         │         │         │         │         │  Grid   │
│  [img]  │  [img]  │  [img]  │  [img]  │  [img]  │  [img]  │
│         │    ✎    │    ✎    │    ✎    │         │    ✎    │
└─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘
```

**Grid Layout:**
- **Columns**: 6 (responsive: 4 on narrow, 3 on tablet)
- **Gap**: 16px horizontal and vertical
- **Card dimensions**: 180x140px
- **Alignment**: Left-aligned with overflow scroll

### Template Card

**Structure:**
```
┌──────────────────┐
│ Template Name    │  ← 15pt Semibold
│ ┌──────────────┐ │
│ │              │ │  ← Preview (120x80px)
│ │   Zones      │ │
│ │              │ │
│ └──────────────┘ │
│        ✎         │  ← Edit icon (hover only)
└──────────────────┘
```

**States:**

**Default:**
- Background: #F3F3F3
- Border: 1px solid #E1E1E1
- Preview: Simplified zone layout (gray zones #D1D1D1)

**Selected (Grid template in example):**
- Border: 3px solid #0078D4
- Background: #F3F9FD (light blue tint)
- Checkmark overlay: Top-right corner (16x16px)

**Hover:**
- Background: #E6E6E6
- Edit icon appears (20x20px, #605E5C)
- Cursor: pointer

**Edit Icon Interaction:**
- **Click**: Opens template editor (modal or inline)
- **Position**: Bottom center of card
- **Visibility**: Hidden by default, visible on hover
- **Effect**: Opens quick config dialog (see Image 3)

### Built-in Templates

**1. No layout**
- **Zones**: 0 (disables snapping for this monitor)
- **Use case**: Temporary disable without turning off extension
- **Icon**: Empty rectangle

**2. Focus**
- **Zones**: 1 large (70% width) + 3 vertical stack (30% width)
- **Layout**: Main work area + secondary panels
- **Splits**: 1 vertical, 3 horizontal in right panel
- **Editable**: Yes (can adjust split ratio)

**3. Columns**
- **Zones**: 3 equal vertical columns (default)
- **Variants**: 2, 3, 4, 5, 6 columns (selectable in editor)
- **Editable**: Yes (adjustable column count + widths)

**4. Rows**
- **Zones**: 3 equal horizontal rows (default)
- **Variants**: 2, 3, 4 rows (selectable in editor)
- **Editable**: Yes (adjustable row count + heights)

**5. Grid**
- **Zones**: 2x2 grid (4 zones, shown selected in image)
- **Variants**: 2x2, 2x3, 3x3 (selectable in editor)
- **Editable**: Yes (adjustable grid size)

**6. Priority Grid**
- **Zones**: 50% left + 2 stacked 25% right columns
- **Layout**: Large primary + two secondary zones
- **Use case**: Code editor + terminal + docs

---

## Custom Section

### Section Header
```
Custom
```

**Typography**: Same as Templates section

### Empty State
```
┌────────────────────────────────────────────────┐
│                                                │
│              [Grid Icon 64x64]                 │
│                                                │
│   Create or duplicate a layout to get started  │
│                                                │
└────────────────────────────────────────────────┘
```

**Empty State:**
- **Icon**: Stylized grid outline (4 squares)
- **Text**: 15pt regular, #605E5C
- **Height**: 200px minimum
- **CTA**: Implicitly points to "Create new layout" button

### Custom Layout Gallery
```
┌─────────┬─────────┬─────────┬─────────┐
│Custom 1 │Custom 2 │Custom 3 │Custom 4 │
│  [img]  │  [img]  │  [img]  │  [img]  │
│    ✎    │    ✎    │    ✎    │    ✎    │
└─────────┴─────────┴─────────┴─────────┘
```

**Layout**: Same grid as templates (6 columns, 16px gap)

### Custom Card Enhancements

**Additional Controls:**
- **Edit icon**: Always visible (not just hover)
- **Delete icon**: Top-right corner (trash icon, red on hover)
- **Duplicate icon**: Top-left corner (copy icon)
- **Rename**: Click name to edit inline

**Interaction:**
- **Single click**: Select layout (apply immediately)
- **Double click**: Open in editor for modification
- **Right-click**: Context menu (Rename, Duplicate, Delete, Export)

**Context Menu:**
```
┌────────────────────┐
│ Rename        F2   │
│ Duplicate     ^D   │
│ Edit          ↵    │
│ ─────────────      │
│ Export...          │
│ Delete        Del  │
└────────────────────┘
```

---

## Create New Layout Button

### Button Design
```
┌────────────────────────────────────────────────┐
│                                [+ Create new layout] │
└────────────────────────────────────────────────┘
```

**Properties:**
- **Position**: Fixed bottom-right corner
- **Size**: 180x40px
- **Style**: Primary button (blue #0078D4)
- **Icon**: Plus sign (16x16px, white)
- **Text**: "Create new layout" (15pt Segoe UI, white)
- **Margin**: 24px from edges

**Hover State:**
- **Background**: Darker blue (#106EBE)
- **Shadow**: 0 4px 8px rgba(0,0,0,0.2)
- **Cursor**: pointer

**Click Action:**
Opens layout creation dialog:
```
┌──────────────────────────────────┐
│ Create New Layout                │
├──────────────────────────────────┤
│ Layout name:                     │
│ [Custom layout 1         ]       │
│                                  │
│ Layout type:                     │
│ ○ Grid (recommended)             │
│ ○ Canvas (advanced)              │
│                                  │
│ Starting template:               │
│ [Grid ▼]                         │
│                                  │
│        [Cancel]  [Create]        │
└──────────────────────────────────┘
```

---

## Behavior & Interactions

### Layout Selection Flow
1. **User clicks template/custom card**
2. **Border changes to blue** (visual feedback)
3. **Layout applies immediately** to selected monitor
4. **Zone preview shows** on actual monitor (2-second fade)
5. **Card remains selected** until different layout chosen

### Quick Apply (Double-click)
- **Templates**: Apply and close editor
- **Custom layouts**: Apply and open for editing
- **Feedback**: Brief fade animation (150ms)

### Keyboard Navigation
- **Tab**: Cycle through monitor cards → templates → custom layouts → button
- **Arrow keys**: Navigate within grid
- **Enter**: Apply selected layout and close
- **Space**: Apply selected layout (keep editor open)
- **Delete**: Remove custom layout (with confirmation)
- **Escape**: Close editor without changes

### Monitor Switch Persistence
- **Scenario**: User selects Monitor 1, picks "Grid", switches to Monitor 2
- **Behavior**: Monitor 1 retains Grid, Monitor 2 shows its current/default layout
- **Indicator**: Selected card in Templates shows last-applied layout per monitor
- **Visual**: Small monitor number badge on applied templates

---

## Visual Design Specs

### Colors (Light Theme)
- **Window background**: #FFFFFF
- **Section background**: #FAFAFA
- **Card background**: #F3F3F3
- **Card border**: #E1E1E1
- **Selected border**: #0078D4 (3px)
- **Hover background**: #E6E6E6
- **Zone preview**: #D1D1D1 (fill), #A1A1A1 (stroke)

### Colors (Dark Theme)
- **Window background**: #202020
- **Section background**: #2B2B2B
- **Card background**: #323232
- **Card border**: #404040
- **Selected border**: #0078D4 (3px)
- **Hover background**: #3A3A3A
- **Zone preview**: #505050 (fill), #707070 (stroke)

### Typography
- **Section headers**: 24pt Segoe UI Semibold
- **Card titles**: 15pt Segoe UI Semibold
- **Monitor labels**: 15pt Segoe UI Regular
- **Resolution text**: 13pt Segoe UI Regular
- **Helper text**: 13pt Segoe UI Regular, #605E5C

### Spacing
- **Window padding**: 32px all sides
- **Section spacing**: 48px between Templates and Custom
- **Grid gap**: 16px horizontal and vertical
- **Card padding**: 12px internal

### Animations
- **Card selection**: Border color transition 150ms ease-out
- **Hover state**: Background color 100ms ease-in
- **Zone preview**: Fade in 300ms, hold 2s, fade out 300ms
- **Layout apply**: Ripple effect from card center (200ms)

---

## Data Model

### Template Metadata
```json
{
  "id": "template-grid-2x2",
  "name": "Grid",
  "type": "grid",
  "editable": true,
  "zones": [
    {"x": 0, "y": 0, "w": 0.5, "h": 0.5, "index": 0},
    {"x": 0.5, "y": 0, "w": 0.5, "h": 0.5, "index": 1},
    {"x": 0, "y": 0.5, "w": 0.5, "h": 0.5, "index": 2},
    {"x": 0.5, "y": 0.5, "w": 0.5, "h": 0.5, "index": 3}
  ],
  "preview": "data:image/svg+xml,..." // Base64 SVG
}
```

### Custom Layout Storage
**Location**: `%LOCALAPPDATA%\Microsoft\PowerToys\FancyZones\custom-layouts.json`

```json
{
  "layouts": [
    {
      "id": "uuid-custom-1",
      "name": "Custom layout 1",
      "type": "canvas",
      "created": "2025-01-15T10:30:00Z",
      "modified": "2025-01-16T14:22:00Z",
      "zones": [...],
      "preview": "data:image/svg+xml,..."
    }
  ]
}
```

---

## Edge Cases

### No Monitors Detected
```
┌────────────────────────────────────────────────┐
│  ⚠ No monitors detected                        │
│                                                │
│  Please connect a display to use FancyZones.   │
│                                [Close]          │
└────────────────────────────────────────────────┘
```

### DPI Mismatch Warning
```
┌────────────────────────────────────────────────┐
│  [1] 1920x1080 (100%)  [2] 3840x2160 (200%)    │
│                                                │
│  ⚠ Monitors have different DPI scaling.        │
│  "All Monitors" layout disabled.               │
└────────────────────────────────────────────────┘
```

### Monitor Disconnected (Layout Active)
- **Scenario**: User applies layout to Monitor 2, then disconnects it
- **Behavior**: Layout saved, auto-applies when monitor reconnects
- **Fallback**: If reconnected to different port, prompt user to re-assign

### Maximum Custom Layouts
- **Limit**: 50 custom layouts
- **Reason**: Prevent performance degradation, storage bloat
- **Warning**: When approaching limit (45/50), show banner
- **Enforcement**: "Create new layout" disabled at 50, prompt to delete

---

## Accessibility

### Screen Reader Announcements
- **Monitor selection**: "Monitor 1 selected, 3000 by 2000, 100% scale"
- **Template selection**: "Grid layout selected, 4 zones in 2 by 2 arrangement"
- **Layout applied**: "Grid layout applied to Monitor 1"

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| Tab | Navigate elements |
| Shift+Tab | Navigate backwards |
| Arrow keys | Move within grid |
| Enter | Apply and close |
| Space | Apply (keep open) |
| Escape | Cancel |
| Delete | Remove custom layout |
| F2 | Rename custom layout |
| Ctrl+D | Duplicate layout |

### High Contrast Mode
- **Borders**: Increase to 2px for all cards
- **Selected**: 4px yellow border
- **Focus ring**: 3px dotted outline
- **Text**: Force high contrast colors

---

## Performance Considerations

### Preview Generation
- **SVG rendering**: Generate on-demand, cache in memory
- **Throttle**: Limit redraws to 60 FPS during hover
- **Lazy load**: Only render visible cards (virtual scrolling if >30 layouts)

### Monitor Detection
- **Poll rate**: Check for changes every 2 seconds (via system events, not polling)
- **Debounce**: Wait 500ms after disconnect before updating UI (prevents flicker)

---

## GNOME Adaptation

### Gtk4 Implementation
```xml
<object class="GtkWindow" id="layout_picker">
  <property name="title">FancyZones Editor</property>
  <property name="default-width">1200</property>
  <property name="default-height">720</property>
  <child>
    <object class="GtkBox">
      <property name="orientation">vertical</property>
      <child>
        <!-- Monitor selection bar -->
        <object class="GtkFlowBox" id="monitor_selector">
          <property name="selection-mode">single</property>
        </object>
      </child>
      <child>
        <object class="GtkScrolledWindow">
          <child>
            <object class="GtkBox">
              <property name="orientation">vertical</property>
              <!-- Templates section -->
              <!-- Custom section -->
            </object>
          </child>
        </object>
      </child>
    </object>
  </child>
</object>
```

### Design Adjustments
1. **Adwaita theme**: Replace Fluent Design with GNOME styling
2. **Headerbar**: Use Gtk.HeaderBar instead of title bar
3. **Button**: Replace "+ Create" with Gtk.Button.suggested-action style
4. **Cards**: Use Gtk.Frame with custom CSS class
5. **Icons**: Use system icon theme (e.g., "list-add-symbolic")

### File Locations (GNOME)
- **Templates**: `/usr/share/gnome-shell/extensions/fancyzones@example.com/templates/`
- **Custom layouts**: `~/.local/share/gnome-shell/extensions/fancyzones@example.com/layouts/`
- **Preview cache**: `~/.cache/fancyzones/previews/`
