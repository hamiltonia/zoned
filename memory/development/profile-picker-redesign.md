# Layout Picker Redesign - Implementation Context

**Status:** ✅ COMPLETE (Phases 1, 2, 4)  
**Priority:** CRITICAL (Phase 1.1)  
**Created:** 2025-11-23  
**Completed:** 2025-11-23

## Implementation Status

- [x] Phase 1: Grid layout with Cairo previews (COMPLETE)
- [x] Phase 2: Keyboard navigation (COMPLETE)
- [ ] Phase 3: Full-screen hover preview (DEFERRED)
- [x] Phase 4: Configurable dialog size (COMPLETE)

---

## Completion Summary (2025-11-23)

### Phase 1: Grid Layout with Cairo Previews ✓
**Implemented:**
- 3-column grid layout with visual zone previews
- Cairo-rendered zone visualizations (replaced ASCII art)
- System accent color theming from GNOME interface settings
- Aspect ratio-aware card dimensions
- Large overlaid numbers (1-9) on zone previews (64px, 30% opacity)
- Responsive to screen size and orientation
- Grid properly centered horizontally in dialog
- ScrollView for overflow when >9 layouts

**Technical Details:**
- Card sizing constrains by BOTH width and height to ensure 3x3 grid fits cleanly
- **Fixed 24px spacing** between cards (changed from 15% dynamic on 2025-11-23)
  - Dynamic percentage spacing caused issues on ultrawide displays (5120x1440)
  - 15% of card width = ~114px gaps, consuming 228px for 3 rows
  - Fixed 24px spacing works consistently across all aspect ratios
  - Provides more space for actual cards while maintaining clean layout
- 70px reserve space below preview for name+indicator (prevents clipping)
- Layout name: 16px bold
- Title: 28px bold
- Instructions: 24px (no bold, readable)
- Dialog size default increased from 60% to 80% (2025-11-23)

### Phase 2: Keyboard Navigation ✓
**Implemented:**
- Arrow key navigation (2D grid movement with wraparound)
- Number keys 1-9 for instant quick select
- Enter to confirm, Escape to cancel
- Visual selection highlighting (bright blue with 3px border)
- Current layout highlighting (medium blue with 2px border)
- Mouse click support maintained
- Hover effects on cards

### Phase 4: Configurable Dialog Size ✓
**Implemented:**
- GSettings key: `layout-picker-size` (type: double, range: 0.3-0.9, default: 0.6)
- GSettings schema properly defined in `org.gnome.shell.extensions.zoned.gschema.xml`
- Landscape mode: height = X% of screen, width maintains aspect ratio
- Portrait mode: width = X% of screen, height matches width (square-ish)
- Dynamic card sizing algorithm ensures 9 layouts fit cleanly at any dialog size
- Future-proof: reserved space for header section (currently 0px)

### Architecture Improvements ✓
**Major Refactoring:**
1. **Centralized Layout Change Notifications**
   - Created `LayoutManager.setLayoutWithNotification(layoutId, notificationManager)`
   - Single source of truth for layout switching with notifications
   - Both LayoutSwitcher and PanelIndicator use shared helper
   - Removed complex callback parameter passing through layers

2. **Fixed NotificationManager**
   - Replaced broken MessageTray API with simple overlay notifications
   - Uses St.Label with OSD styling (matches GNOME volume/brightness overlays)
   - Fade-in/fade-out animations (150ms)
   - Clean timeout-based auto-dismissal (750ms default)
   - Same notification system for ALL actions (window snapping, layout changes)

3. **Simplified Component Communication**
   - Removed onLayoutChanged callback from LayoutSwitcher constructor
   - No parameter passing from LayoutSwitcher → PanelIndicator
   - LayoutManager handles both state change AND notification
   - PanelIndicator just calls updateMenu() (no parameters)
   - DRY principle properly applied

### Phase 3: Full-Screen Hover Preview (DEFERRED)
**Rationale:** Core functionality complete. Hover preview is nice-to-have polish that can be added later if needed. Current visual previews in cards are sufficient for layout selection.

---

## Overview

Complete redesign of the LayoutSwitcher component to address usability issues and implement a FancyZones-style grid view with visual zone previews.

## Current Issues (RESOLVED)

The existing `extension/ui/layoutPicker.js` had several problems:

1. ~~**Items too large**~~ ✓ Fixed - Compact 10px padding
2. ~~**ASCII art too verbose**~~ ✓ Fixed - Cairo-rendered zone previews
3. ~~**No real preview**~~ ✓ Fixed - Visual zone positioning with accent colors
4. ~~**Poor scalability**~~ ✓ Fixed - 3-column grid with scroll support
5. ~~**Lacks polish**~~ ✓ Fixed - Elegant grid matching FancyZones experience

## Design Requirements

### Layout & Structure

#### Grid View
- **3 columns** - Fixed width, optimal for layout comparison
- **Scrollable rows** - Use `St.ScrollView` for overflow when >9 layouts
- **Mouse wheel support** - Natural scrolling (works automatically with ScrollView)
- **Compact design** - 10px padding, optimized footprint

#### Card Dimensions
- **Aspect ratio matching** - Cards match current monitor's aspect ratio
  - 16:9 standard monitors → standard cards
  - 21:9 ultrawide → elongated cards
  - 9:16 portrait → tall cards
- **Dynamic sizing** - Calculated to fit 3x3 grid perfectly
- **Constrained by both dimensions** - Ensures no clipping in width OR height

**Technical Implementation:**
```javascript
_getCardDimensions(dialogWidth, dialogHeight) {
    const monitor = Main.layoutManager.currentMonitor;
    const aspectRatio = monitor.width / monitor.height;
    
    // Calculate available space
    const availableWidth = dialogWidth - (CONTAINER_PADDING * 2);
    const availableHeight = dialogHeight - (CONTAINER_PADDING * 2) - TITLE_HEIGHT - INSTRUCTIONS_HEIGHT;
    
    // Calculate from width constraint (3 cards + 15% spacing)
    const cardWidthFromHorizontal = Math.floor(availableWidth / 3.3);
    const cardHeightFromWidth = Math.floor(cardWidthFromHorizontal / aspectRatio);
    
    // Calculate from height constraint (3 rows + 15% spacing)
    const cardHeightFromVertical = Math.floor(availableHeight / 3.3);
    const cardWidthFromHeight = Math.floor(cardHeightFromVertical * aspectRatio);
    
    // Use whichever is smaller to ensure both dimensions fit
    let cardWidth, cardHeight;
    if (cardHeightFromWidth <= cardHeightFromVertical) {
        cardWidth = cardWidthFromHorizontal;
        cardHeight = cardHeightFromWidth;
    } else {
        cardWidth = cardWidthFromHeight;
        cardHeight = cardHeightFromVertical;
    }
    
    const spacing = Math.floor(cardWidth * 0.15);
    return { width: cardWidth, height: cardHeight, spacing: spacing };
}
```

### Visual Zone Preview (Mini)

#### Replace ASCII with St.DrawingArea
- **Cairo rendering** - Clean, precise zone visualization
- **System accent color** - Use GNOME's accent color for theming
- **Zone borders** - Clear rectangular borders showing zone boundaries
- **Large overlaid numbers** - 64px numbers (1-9) at 30% opacity
- **No zone labels** - Clean visual only

**Technical Implementation:**
```javascript
_createZonePreview(layout, width, height) {
    const canvas = new St.DrawingArea({
        width: width,
        height: height,
        style: 'border: 1px solid #444; background-color: #1a1a1a;'
    });
    
    const accentColor = this._getAccentColor();
    
    canvas.connect('repaint', () => {
        const cr = canvas.get_context();
        const [w, h] = canvas.get_surface_size();
        
        layout.zones.forEach((zone) => {
            const x = zone.x * w;
            const y = zone.y * h;
            const zoneW = zone.w * w;
            const zoneH = zone.h * h;
            
            // Fill with subtle accent color
            cr.setSourceRGBA(
                accentColor.red, 
                accentColor.green, 
                accentColor.blue, 
                0.3  // 30% opacity
            );
            cr.rectangle(x, y, zoneW, zoneH);
            cr.fill();
            
            // Border with brighter accent
            cr.setSourceRGBA(
                accentColor.red,
                accentColor.green,
                accentColor.blue,
                0.8  // 80% opacity
            );
            cr.setLineWidth(1);
            cr.rectangle(x, y, zoneW, zoneH);
            cr.stroke();
        });
        
        cr.$dispose();
    });
    
    return canvas;
}
```

#### System Accent Color
```javascript
_getAccentColor() {
    const interfaceSettings = new Gio.Settings({
        schema: 'org.gnome.desktop.interface'
    });
    
    const accentColorName = interfaceSettings.get_string('accent-color');
    
    const accentColors = {
        'blue': {red: 0.29, green: 0.56, blue: 0.85},
        'teal': {red: 0.18, green: 0.65, blue: 0.65},
        'green': {red: 0.20, green: 0.65, blue: 0.42},
        'yellow': {red: 0.96, green: 0.76, blue: 0.13},
        'orange': {red: 0.96, green: 0.47, blue: 0.00},
        'red': {red: 0.75, green: 0.22, blue: 0.17},
        'pink': {red: 0.87, green: 0.33, blue: 0.61},
        'purple': {red: 0.61, green: 0.29, blue: 0.85},
        'slate': {red: 0.44, green: 0.50, blue: 0.56}
    };
    
    return accentColors[accentColorName] || accentColors['blue'];
}
```

### Keyboard Navigation

#### Enhanced Shortcuts
- **1-9 keys** - Quick select first 9 layouts (instant selection)
- **Arrow keys** - 2D grid navigation
  - Left/Right: Move between columns (wrap around)
  - Up/Down: Move between rows
- **Page Up/Down** - Scroll full page up/down in ScrollView
- **Enter** - Confirm selection
- **Esc** - Cancel and close picker

**Technical Implementation:**
```javascript
_connectKeyEvents() {
    this._keyPressId = global.stage.connect('key-press-event', (actor, event) => {
        const symbol = event.get_key_symbol();
        const layouts = this._layoutManager.getAllLayouts() ;
        
        // Number keys 1-9 for quick select
        if (symbol >= Clutter.KEY_1 && symbol <= Clutter.KEY_9) {
            const index = symbol - Clutter.KEY_1;
            if (index < layouts.length) {
                this._onLayoutSelected(layouts[index].id);
                return Clutter.EVENT_STOP;
            }
        }
        
        // 2D Grid navigation
        const COLUMNS = 3;
        const currentRow = Math.floor(this._selectedIndex / COLUMNS);
        const currentCol = this._selectedIndex % COLUMNS;
        const totalRows = Math.ceil(layouts.length / COLUMNS);
        
        switch (symbol) {
            case Clutter.KEY_Left:
            case Clutter.KEY_KP_Left:
                // Move left, wrap to previous row's end
                if (currentCol > 0) {
                    this._selectedIndex--;
                } else if (currentRow > 0) {
                    this._selectedIndex = (currentRow - 1) * COLUMNS + (COLUMNS - 1);
                    if (this._selectedIndex >= layouts.length) {
                        this._selectedIndex = layouts.length - 1;
                    }
                }
                this._updateSelection();
                return Clutter.EVENT_STOP;
                
            case Clutter.KEY_Right:
            case Clutter.KEY_KP_Right:
                // Move right, wrap to next row's start
                if (currentCol < COLUMNS - 1 && this._selectedIndex < layouts.length - 1) {
                    this._selectedIndex++;
                } else if (currentRow < totalRows - 1) {
                    this._selectedIndex = (currentRow + 1) * COLUMNS;
                    if (this._selectedIndex >= layouts.length) {
                        this._selectedIndex = layouts.length - 1;
                    }
                }
                this._updateSelection();
                return Clutter.EVENT_STOP;
                
            case Clutter.KEY_Up:
            case Clutter.KEY_KP_Up:
                const upIndex = this._selectedIndex - COLUMNS;
                if (upIndex >= 0) {
                    this._selectedIndex = upIndex;
                    this._updateSelection();
                }
                return Clutter.EVENT_STOP;
                
            case Clutter.KEY_Down:
            case Clutter.KEY_KP_Down:
                const downIndex = this._selectedIndex + COLUMNS;
                if (downIndex < layouts.length) {
                    this._selectedIndex = downIndex;
                    this._updateSelection();
                }
                return Clutter.EVENT_STOP;
                
            case Clutter.KEY_Return:
            case Clutter.KEY_KP_Enter:
                if (layouts[this._selectedIndex]) {
                    this._onLayoutSelected(layouts[this._selectedIndex].id);
                }
                return Clutter.EVENT_STOP;
                
            case Clutter.KEY_Escape:
                this.hide();
                return Clutter.EVENT_STOP;
                
            case Clutter.KEY_Page_Up:
            case Clutter.KEY_KP_Page_Up:
            case Clutter.KEY_Page_Down:
            case Clutter.KEY_KP_Page_Down:
                // Allow ScrollView to handle these
                return Clutter.EVENT_PROPAGATE;
        }
        
        return Clutter.EVENT_PROPAGATE;
    });
}
```

## Complete Layout Card Structure

```javascript
_createLayoutCard(layout, index, width, height) {
    const currentLayout = this._layoutManager.getCurrentLayout();
    const isCurrentLayout = layout.id === currentLayout.id;
    
    const card = new St.Button({
        style_class: 'layout-card',
        style: `padding: ${CARD_PADDING}px; width: ${width}px; ` +
               `border-radius: 8px; ` +
               `background-color: ${isCurrentLayout ? 
                   'rgba(74, 144, 217, 0.3)' : 'rgba(60, 60, 60, 0.5)'};` +
               `border: ${isCurrentLayout ? '2px solid #4a90d9' : '1px solid #444'};`,
        reactive: true,
        track_hover: true,
        can_focus: true
    });
    
    const box = new St.BoxLayout({
        vertical: true,
        style: 'spacing: 6px;'
    });
    
    // Zone preview with overlaid number
    const previewWidth = width - (CARD_PADDING * 2);
    const previewHeight = height - 70; // Leave room for name + indicator + spacing
    
    const previewContainer = new St.Widget({
        layout_manager: new Clutter.BinLayout(),
        width: previewWidth,
        height: previewHeight
    });
    
    const preview = this._createZonePreview(layout, previewWidth, previewHeight);
    previewContainer.add_child(preview);
    
    // Large number overlay (if index < 9)
    if (index < 9) {
        const numberOverlay = new St.Label({
            text: `${index + 1}`,
            style: 'font-size: 64px; color: rgba(255, 255, 255, 0.3); font-weight: bold;',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true
        });
        previewContainer.add_child(numberOverlay);
    }
    
    box.add_child(previewContainer);
    
    // Layout name
    const name = new St.Label({
        text: layout.name,
        style: 'font-size: 16px; text-align: center; font-weight: bold;'
    });
    box.add_child(name);
    
    // Current layout indicator
    if (isCurrentLayout) {
        const indicator = new St.Label({
            text: '●',
            style: 'font-size: 12px; color: #4a90d9; text-align: center;'
        });
        box.add_child(indicator);
    }
    
    card.set_child(box);
    
    // Hover effects
    card.connect('enter-event', () => {
        if (card._layoutIndex !== this._selectedIndex) {
            card.style = `padding: ${CARD_PADDING}px; width: ${width}px; ` +
                        `border-radius: 8px; ` +
                        `background-color: rgba(74, 144, 217, 0.25); ` +
                        `border: 1px solid #6aa0d9;`;
        }
        return Clutter.EVENT_PROPAGATE;
    });
    
    card.connect('leave-event', () => {
        this._updateSelection();
        return Clutter.EVENT_PROPAGATE;
    });
    
    // Click handler
    card.connect('clicked', () => {
        this._onLayoutSelected(layout.id);
    });
    
    return card;
}
```

## Files Modified

- **Primary:** `extension/ui/layoutPicker.js` - Complete rewrite
- **Secondary:**
  - `extension/layoutManager.js` - Added setLayoutWithNotification()
  - `extension/ui/panelIndicator.js` - Simplified to use shared helper
  - `extension/ui/notificationManager.js` - Replaced MessageTray with overlay
  - `extension/extension.js` - Simplified initialization (removed callbacks)
  - `extension/schemas/org.gnome.shell.extensions.zoned.gschema.xml` - Added layout-picker-size setting

## Reference Materials

- **Current Implementation:** `extension/ui/layoutPicker.js`
- **Hammerspoon Reference:** `memory/architecture/hammerspoon-translation.md`
- **Component Design:** `memory/architecture/component-design.md`
- **Cairo Drawing:** [GJS Guide - Cairo](https://gjs.guide/guides/cairo.html)
- **St.DrawingArea:** [St13 DrawingArea docs](https://gjs-docs.gnome.org/st13/st.drawingarea)

## Notes

- **Performance:** St.DrawingArea is efficient for small canvases
- **ScrollView:** Automatically handles mouse wheel events
- **Cleanup:** Layout picker properly destroys all resources on hide()
- **Accent Color:** Falls back to GNOME blue if accent color unavailable
- **Notifications:** Unified system using simple overlays (no MessageTray complexity)

---

**Last Updated:** 2025-11-23  
**Status:** ✅ COMPLETE (Phases 1, 2, 4)
