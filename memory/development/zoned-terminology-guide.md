# Zoned Terminology Guide

Based on Microsoft PowerToys FancyZones documentation

## Core Concepts

| Term | Definition | Usage Context |
|------|------------|---------------|
| **Zone** | Individual window target area within a layout | "Snap window to zone 3", "Zone highlighting" |
| **Layout** | Complete arrangement of zones on a monitor | "Apply Focus layout", "Switch layouts", "Edit layout" |
| **Template** | Pre-built layout pattern (e.g., 3-column, priority grid) | "Choose template", "Template library" |
| **Custom Layout** | User-created layout (grid-based or freeform) | "Create custom layout", "Edit custom layout" |
| **Layout** | Not used in FancyZones | Consider: per-monitor configs, but FZ uses monitor-specific settings instead |

## UI Components

| Component | FancyZones Term | Notes |
|-----------|----------------|-------|
| Main editor window | "Layout editor" | Opened via shortcut or settings |
| Layout selection screen | "Choose your layout" | First screen shown in editor |
| Zone editing canvas | "Grid model" / "Canvas model" | Two distinct editing modes |
| Settings panel | "FancyZones settings" | Within PowerToys settings |

## Actions & Verbs

| Action | FancyZones Usage | Alternative |
|--------|-----------------|-------------|
| Opening editor | "Open layout editor" | "Launch editor" |
| Applying layout | "Apply layout", "Selected layout is applied" | "Activate layout" |
| Creating zones | "Create new layout" | "New layout" |
| Modifying zones | "Edit layout", "Split zone", "Merge zones" | "Customize layout" |
| Snapping windows | "Snap to zone", "Drop into zone" | "Assign to zone" |
| Switching layouts | "Quick layout switch" (with hotkey) | "Switch to layout" |

## Data Hierarchy

**FancyZones structure:**

```
Monitor
├── Default layout (horizontal orientation)
├── Default layout (vertical orientation)  
└── Available layouts
    ├── Templates (built-in)
    └── Custom layouts
        ├── Grid-based
        └── Canvas-based
```

**No "layout" concept** - settings are monitor-specific, not grouped into named layouts.

## Naming Patterns

| UI Element | Pattern | Examples |
|------------|---------|----------|
| Menu items | Verb + object | "Open layout editor", "Create new layout" |
| Settings | Descriptive noun phrase | "Show space around zones", "Zone appearance" |
| Shortcuts | Super + modifiers | "Super+Shift+`" (editor), "Super+Ctrl+Alt+[num]" (quick switch) |
| Zone reference | "Zone [number]" | "Zone 1", "Zone 3" |

## Key Terminology Decisions

### Zones vs. Layouts

- **Zone** = singular area (never plural in singular context)
- **Layout** = the complete collection of zones
- Say: "This layout has 4 zones" not "This layout has 4 layouts"

### Storage & Persistence

- FZ uses: "custom-layouts.json" (file-based)
- Terminology: "saved layouts", "custom layouts"
- Avoid: "layouts", "presets" (unless you mean templates)

### Editor Modes

- **Grid model** = relative/proportional editing (splits/merges)
- **Canvas model** = absolute/pixel-based editing (overlapping allowed)

## Recommended Additions for Zoned

Consider these terms FancyZones avoids but might be useful:

| Term | Purpose | Rationale |
|------|---------|-----------|
| **Workspace** | Optional grouping of layouts | If you need layout-like functionality |
| **Preset** | Distinguish templates from customs | Clearer than "template" for users |
| **Layout library** | Collection view | Better than just "layouts" |

## Anti-patterns (Don't Use)

- ❌ "Zone layout" (redundant - layout already contains zones)
- ❌ "Save layout" (FZ auto-saves, no layouts)
- ❌ "Window zones" (zones are for windows, but just say "zones")
- ❌ "Snap layout/preset" (mixing metaphors)

## FancyZones Feature Reference

### Primary Features

- **Snap to single zone**: Drag window with Shift (configurable)
- **Snap to multiple zones**: Hover edges or use Ctrl while dragging
- **Zone switching**: Win+PgUp/PgDn to cycle windows in same zone
- **Quick layout switch**: Win+Ctrl+Alt+[number] for numbered layouts

### Editor Features

- **Grid editing**: Split, merge, move dividers
- **Canvas editing**: Freeform zone placement with overlap support
- **Layout preview**: Show before applying
- **Space around zones**: Configurable margins
- **Zone numbering**: Optional visual indicators

### Settings Categories

1. **Activation** - How zones appear (Shift key, mouse button)
2. **Zone appearance** - Colors, opacity, borders
3. **Zone behavior** - Multi-monitor, overlapping, snapping rules
4. **Window behavior** - Size restoration, transparency, popup handling
5. **Keyboard shortcuts** - Override Windows snap, custom hotkeys
6. **Exclusions** - Apps that bypass zone snapping

## Glossary

| Term | Definition |
|------|------------|
| **Active zone** | Zone currently highlighted as drop target |
| **Adjacent zones** | Zones sharing a common edge that can merge |
| **Canvas model** | Freeform zone editor allowing overlaps |
| **Custom layout** | User-created zone arrangement |
| **Default layout** | Layout applied when display config changes |
| **Drop target** | Zone where window will snap when released |
| **Editor** | UI for creating/modifying layouts |
| **Grid model** | Proportional zone editor using splits/merges |
| **Gutter** | Divider between zones (Grid model) |
| **Hotkey** | Keyboard shortcut for quick layout switching |
| **Inactive zone** | Non-highlighted zone during window drag |
| **Layout** | Complete arrangement of zones for a monitor |
| **Monitor** | Physical display with independent layout settings |
| **Opacity** | Transparency level of zone overlays |
| **Overlay** | Visual indication of zones during drag |
| **Quick switch** | Instant layout change via hotkey |
| **Snap** | Action of assigning window to zone(s) |
| **Template** | Pre-designed layout pattern |
| **Zone** | Individual window target area |
| **Zone index** | Numeric identifier for zones (1-based) |

## Implementation Notes

### File Storage (FancyZones approach)

- `custom-layouts.json` - User-created layouts
- `default-layouts.json` - Built-in templates
- `zones-settings.json` - Monitor-specific configurations
- Location: `%LocalAppData%\Microsoft\PowerToys\FancyZones\`

### Linux/GNOME Equivalent

Consider using:
- `~/.config/zoned/custom-layouts.json`
- `~/.config/zoned/monitors.json`
- GSettings schema for user preferences

### Naming Convention for Code

```javascript
// Recommended naming in codebase
class ZoneLayout { }          // Not ZoneLayout, not WindowLayout
class Zone { }                // Not ZoneArea, not WindowZone
class LayoutEditor { }        // Not ZoneEditor
class GridLayoutModel { }     // Grid editing mode
class CanvasLayoutModel { }   // Canvas editing mode

// Methods
applyLayout()                 // Not activateLayout
snapToZone()                  // Not assignToZone
openLayoutEditor()            // Not launchEditor
createCustomLayout()          // Not newLayout
```

## UI Text Examples

### Menu Items

```
File
├── New Layout...
├── Open Layout Editor         (Ctrl+Shift+`)
├── Import Layout...
├── Export Layout...
└── Preferences

View
├── Show Zone Numbers
├── Show Zone Borders
└── Preview Layout

Layouts
├── Default Layouts
│   ├── Focus
│   ├── Columns
│   └── Grid
└── Custom Layouts
    ├── My Ultrawide Setup
    └── Development Layout
```

### Button Labels

- "Create New Layout"
- "Edit Layout"
- "Delete Layout"
- "Apply" (not "Save" - auto-applies)
- "Close Editor"
- "Split Zone"
- "Merge Zones"

### Settings Section Headers

- "Zone Appearance"
- "Zone Behavior"
- "Keyboard Shortcuts"
- "Monitor Settings"
- "Excluded Applications"

### Tooltips

- "Drag window to zone while holding Shift"
- "Click to edit this layout"
- "Quick switch: Super+Ctrl+Alt+1"
- "Split this zone horizontally/vertically"
- "Merge selected zones into one"

## Version History

- v1.0 - Initial terminology guide based on FancyZones documentation (November 2024)

## References

- [Microsoft PowerToys FancyZones Documentation](https://learn.microsoft.com/en-us/windows/powertoys/fancyzones)
