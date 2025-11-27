# Zoned Custom Icon Specification

**Created:** 2025-11-24  
**Purpose:** Custom SVG icon for panel indicator  
**Current Status:** Seeking custom design

## Requirements

### GNOME Symbolic Icon Guidelines

**Technical Specs:**
- **Format:** SVG (Scalable Vector Graphics)
- **Canvas size:** 16x16px (nominal, but use viewBox for scaling)
- **Stroke width:** 2px (standard for symbolic icons)
- **Color:** Single color (currentColor or #bebebe for preview)
  - Icon will inherit theme color automatically
- **Style:** Simple, clean, geometric
- **Padding:** 1-2px around edges for breathing room

### File Naming Convention

GNOME expects symbolic icons to end with `-symbolic.svg`:
- Filename: `zoned-symbolic.svg`
- Location: `extension/icons/zoned-symbolic.svg`

### Design Concepts

**Option 1: Three Vertical Columns (|||)**
- Simple, direct representation of zone concept
- Three equal-width rectangles side-by-side
- Clean, minimal

**Option 2: Window with Zones**
- Rectangle outline (window)
- Vertical divisions inside (zones)
- More literal representation

**Option 3: Stacked Rectangles**
- Suggests different layouts/layouts
- Abstract but recognizable

**Option 4: Grid with Emphasis**
- 3x1 grid with middle column highlighted
- Suggests active zone concept

## SVG Template Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="16" height="16"
     viewBox="0 0 16 16">
  <g fill="none" stroke="currentColor" stroke-width="2">
    <!-- Icon shapes here -->
  </g>
</svg>
```

**Key Points:**
- `viewBox="0 0 16 16"` for proper scaling
- `stroke="currentColor"` to inherit theme color
- `stroke-width="2"` for standard GNOME weight
- `fill="none"` for outlined style (typical for symbolic icons)

## Implementation Options

### Option A: Three Columns Design

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <g fill="currentColor">
    <rect x="2" y="3" width="3" height="10" rx="0.5"/>
    <rect x="6.5" y="3" width="3" height="10" rx="0.5"/>
    <rect x="11" y="3" width="3" height="10" rx="0.5"/>
  </g>
</svg>
```

### Option B: Window with Zones

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <g fill="none" stroke="currentColor" stroke-width="1.5">
    <rect x="2" y="2" width="12" height="12" rx="1"/>
    <line x1="6.5" y1="2" x2="6.5" y2="14"/>
    <line x1="9.5" y1="2" x2="9.5" y2="14"/>
  </g>
</svg>
```

### Option C: Layered Layout

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <line x1="3" y1="5" x2="13" y2="5"/>
    <line x1="3" y1="8" x2="13" y2="8"/>
    <line x1="3" y1="11" x2="13" y2="11"/>
  </g>
</svg>
```

## Usage in Extension

Once SVG is created, update `panelIndicator.js`:

```javascript
import Gio from 'gi://Gio';

// In _init() method, replace icon creation:
const iconPath = `${import.meta.url.replace('file://', '').replace('/ui/panelIndicator.js', '')}/icons/zoned-symbolic.svg`;
this._icon = new St.Icon({
    gicon: Gio.icon_new_for_string(iconPath),
    style_class: 'system-status-icon',
    icon_size: 16
});
```

Or use GResource for better packaging:
```javascript
const iconTheme = Gtk.IconTheme.get_default();
iconTheme.add_resource_path('/org/gnome/shell/extensions/zoned/icons');

this._icon = new St.Icon({
    icon_name: 'zoned-symbolic',
    style_class: 'system-status-icon',
    icon_size: 16
});
```

## Testing

1. **Preview SVG**: Open in browser or Inkscape
2. **Check at actual size**: View at 16x16px, 32x32px, 48x48px
3. **Test in dark theme**: Ensure visibility
4. **Test in light theme**: Ensure visibility
5. **Compare with system icons**: Should feel cohesive

## Design Principles

**Do:**
- ✅ Keep it simple and geometric
- ✅ Use consistent stroke widths
- ✅ Ensure recognizability at small sizes
- ✅ Test in both light and dark themes
- ✅ Use rounded corners (0.5-1px radius) for modern look

**Don't:**
- ❌ Add gradients or multiple colors
- ❌ Use fine details that won't show at 16px
- ❌ Make it too complex or busy
- ❌ Use hard 90° corners (slightly round for GNOME style)

## Recommendations

**Recommended: Three Columns (Option A)**

Why:
- Most direct representation of "zones"
- Simple and instantly recognizable
- Scales well to different sizes
- Distinct from other system icons
- Matches extension's column-based nature

**Visual Concept:**
```
┌─┐ ┌─┐ ┌─┐
│ │ │ │ │ │
│ │ │ │ │ │
│ │ │ │ │ │
└─┘ └─┘ └─┘
```

This clearly suggests "vertical divisions" or "zones" without being overly complex.
