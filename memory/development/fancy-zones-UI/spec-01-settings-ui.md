# Spec 01: FancyZones Settings UI

## Overview
Main settings panel for FancyZones configuration, showing enable/disable toggle, editor launch, activation shortcuts, and zone behavior options.

---

## Layout Structure

### Header Section
```
┌────────────────────────────────────────────────┐
│ [☰] [Icon] PowerToys Settings     [—][□][×]   │
│ FancyZones                                     │
└────────────────────────────────────────────────┘
```

**Components:**
- Window title bar with standard Windows controls
- Hamburger menu (☰) for navigation
- PowerToys icon and title
- Main heading: "FancyZones"

### Hero Section
```
┌────────────────────────────────────────────────┐
│ [Preview GIF/Image]                            │
│ Create window layouts to help make             │
│ multi-tasking easy.                            │
│ [Learn more about FancyZones]                  │
└────────────────────────────────────────────────┘
```

**Elements:**
- **Preview graphic**: Animated or static representation of FancyZones in action
  - Shows example layout with multiple zones
  - Visual size: ~150x80px
  - Background: Light gray (#F3F3F3)
- **Description text**: Single-line value proposition
- **Learn more link**: Hyperlink (blue #0078D4) to documentation

### Master Toggle
```
┌────────────────────────────────────────────────┐
│ [Icon] Enable FancyZones           On  [●─────]│
└────────────────────────────────────────────────┘
```

**Behavior:**
- **Toggle state**: On (blue #0078D4) / Off (gray #8A8A8A)
- **Effect**: Disables all FancyZones functionality when off
- **Persistence**: State saved immediately on change

---

## Editor Section

### Launch Editor
```
┌────────────────────────────────────────────────┐
│ [📐] Launch layout editor              [↗]     │
│      Set and manage your layouts               │
└────────────────────────────────────────────────┘
```

**Interaction:**
- **Click target**: Entire row (240px height)
- **External link icon**: Indicates opens separate window
- **Hover state**: Light gray background (#F5F5F5)
- **Action**: Opens FancyZones Editor (Image 2)

### Activation Shortcut
```
┌────────────────────────────────────────────────┐
│ [⌨] Activation shortcut                        │
│     Customize the shortcut to activate         │
│     this module                                │
│                        [Win][Shift][`][✎]      │
└────────────────────────────────────────────────┘
```

**Hotkey Picker:**
- **Visual**: Three button-style chips showing current binding
  - Win key (logo icon)
  - Shift key (text)
  - Backtick key (`)
- **Edit icon**: Pencil (✎) to modify
- **Picker behavior**:
  - Click → "Press desired keys" state
  - Record key combo
  - Validate (no conflicts with system shortcuts)
  - Save on blur or Enter

### Display Selection
```
┌────────────────────────────────────────────────┐
│ [🖥] Launch editor on the display              │
│     When using multiple displays               │
│                [Where the mouse pointer is  ▼] │
└────────────────────────────────────────────────┘
```

**Dropdown Options:**
- "Where the mouse pointer is" (default)
- "Primary monitor"
- "Monitor 1", "Monitor 2", etc. (dynamic based on connected displays)

---

## Zone Behavior Section

### Expandable Panel
```
┌────────────────────────────────────────────────┐
│ Zone behavior                              [^] │
│ Manage how zones behave when using FancyZones  │
│                                                 │
│ [✓] Hold Shift key to activate zones while     │
│     dragging a window                          │
│                                                 │
│ [ ] Use a non-primary mouse button to toggle   │
│     zone activation                            │
│                                                 │
│ [ ] Use middle-click mouse button to toggle    │
│     multiple zones spanning                    │
│                                                 │
│ [ ] Show zones on all monitors while dragging  │
│     a window                                   │
│                                                 │
│ [ ] Allow zones to span across monitors        │
│     All monitors must have the same DPI        │
│     scaling and will be treated as one large   │
│     combined rectangle which contains all      │
│     monitors                                   │
│                                                 │
│ When multiple zones overlap                    │
│                [Activate the smallest zone  ▼] │
└────────────────────────────────────────────────┘
```

**Collapsible Section:**
- **Header**: "Zone behavior" with chevron (^ when expanded, v when collapsed)
- **Animation**: 200ms ease-out slide
- **Default state**: Expanded on first view, persists user preference

### Checkbox Options

**1. Hold Shift to Activate**
- **State**: Checked by default
- **Effect**: Requires Shift key during drag to show zones
- **Use case**: Prevents accidental snapping

**2. Non-primary Mouse Button Toggle**
- **State**: Unchecked by default
- **Effect**: Right-click (or configured button) toggles zone visibility
- **Conflict handling**: Mutually exclusive with "Hold Shift" option

**3. Middle-click for Multi-zone**
- **State**: Unchecked by default
- **Effect**: Middle mouse button allows selecting multiple zones
- **Visual feedback**: Selected zones highlight in sequence

**4. Show Zones on All Monitors**
- **State**: Unchecked by default
- **Effect**: Zone overlays appear on every display during drag
- **Performance warning**: May impact systems with 3+ monitors

**5. Zones Span Across Monitors**
- **State**: Unchecked by default
- **Requirements**: Same DPI scaling across all displays
- **Warning text**: Inline helper text explaining DPI constraint
- **Validation**: Disabled (grayed out) if DPI mismatch detected

### Overlap Dropdown
```
When multiple zones overlap
    [Activate the smallest zone by area  ▼]
```

**Options:**
- "Activate the smallest zone by area" (default)
- "Activate the largest zone by area"
- "Activate the zone with the smallest index"
- "Activate the most recently used zone"

---

## Visual Design Specs

### Colors (Light Theme)
- **Background**: #FFFFFF
- **Section dividers**: 1px solid #E1E1E1
- **Hover states**: #F5F5F5
- **Primary blue**: #0078D4
- **Toggle on**: #0078D4
- **Toggle off**: #8A8A8A
- **Text primary**: #000000
- **Text secondary**: #605E5C

### Typography
- **Section headers**: 20pt Segoe UI Semibold
- **Setting labels**: 15pt Segoe UI Regular
- **Helper text**: 13pt Segoe UI Regular, #605E5C
- **Link text**: 15pt Segoe UI Regular, #0078D4 underline on hover

### Spacing
- **Section padding**: 24px vertical, 20px horizontal
- **Setting row height**: 64px minimum
- **Checkbox label spacing**: 12px between box and text
- **Dropdown width**: 280px

### Icons
- **Size**: 20x20px
- **Color**: #000000 (matches text)
- **Style**: Fluent Design System icons
  - 📐 Layout editor: Layout icon
  - ⌨ Shortcut: Keyboard icon
  - 🖥 Display: Monitor icon

---

## Interaction States

### Disabled State
When "Enable FancyZones" toggle is OFF:
- All settings gray out (#8A8A8A)
- Checkboxes disabled (no interaction)
- Dropdowns disabled
- "Launch layout editor" button remains clickable (allows pre-configuration)

### Focus States
- **Keyboard navigation**: Tab order follows visual hierarchy
- **Focus ring**: 2px solid #0078D4 with 2px offset
- **Active element**: Visible indicator at all times

### Error States
**Example: Hotkey Conflict**
```
┌────────────────────────────────────────────────┐
│ [Win][Ctrl][C][✎]                              │
│ ⚠ This shortcut is already in use by Windows   │
└────────────────────────────────────────────────┘
```
- **Warning icon**: Yellow triangle (⚠)
- **Message**: Red text (#D13438)
- **Resolution**: User must choose different binding

---

## Accessibility

### Screen Reader Support
- **Landmarks**: Main settings region aria-label="FancyZones Settings"
- **Toggle**: Announces "Enable FancyZones, toggle button, currently on/off"
- **Checkboxes**: Full label text announced, include helper text
- **Dropdowns**: Announce current selection and available options

### Keyboard Shortcuts
- **Tab**: Navigate between controls
- **Space**: Toggle checkboxes, activate buttons
- **Enter**: Open dropdowns, confirm hotkey picker
- **Escape**: Cancel hotkey picker, close dropdowns
- **Arrow keys**: Navigate dropdown options

### High Contrast Mode
- **Borders**: All interactive elements gain visible borders
- **Focus**: Increase focus ring thickness to 3px
- **Colors**: Respect system high contrast theme

---

## Validation Rules

### Hotkey Picker
1. Must include modifier key (Ctrl, Alt, Shift, Win)
2. Cannot conflict with system shortcuts
3. Cannot be single-character key alone
4. Maximum 4 keys in combination

### DPI Scaling
1. Check all connected monitors
2. If mismatch detected:
   - Display warning icon next to "span across monitors"
   - Show tooltip: "Monitors have different DPI scaling. Feature unavailable."
3. Re-validate on monitor connect/disconnect

---

## Data Persistence

### Settings File
**Location**: `%LOCALAPPDATA%\Microsoft\PowerToys\FancyZones\settings.json`

**Schema:**
```json
{
  "enabled": true,
  "activation_shortcut": {
    "win": true,
    "ctrl": false,
    "alt": false,
    "shift": true,
    "key": 192
  },
  "editor_display": "mouse_pointer",
  "zone_behavior": {
    "hold_shift": true,
    "non_primary_button": false,
    "middle_click_multizone": false,
    "show_all_monitors": false,
    "span_monitors": false,
    "overlap_mode": "smallest_area"
  }
}
```

### Auto-save Behavior
- **Save trigger**: Any setting change
- **Debounce**: 500ms after last change
- **Feedback**: No explicit "saved" message (instant persistence)

---

## Future Enhancements

### Advanced Settings (Hidden Panel)
- Zone animation speed
- Snap distance threshold
- Custom zone colors per layout
- Window restoration timeout

### Telemetry (Optional)
- Track most-used layouts
- Monitor multi-monitor usage patterns
- A/B test new activation methods

---

## GNOME Adaptation Notes

### Design Translation
1. **Replace Fluent with Adwaita**
   - Use Gtk.Switch instead of toggle
   - Replace checkboxes with Gtk.CheckButton
   - Use Gtk.ComboBoxText for dropdowns

2. **Settings Integration**
   - Integrate with GNOME Settings (not standalone app)
   - Follow GNOME HIG spacing (12px standard)
   - Use headerbar instead of title bar

3. **Shortcut Picker**
   - Use Gtk.ShortcutsWindow or custom key capture dialog
   - Display keys as `<Super><Shift>grave` format

4. **File Locations**
   - Settings: `~/.config/fancyzones/settings.json`
   - Layouts: `~/.local/share/fancyzones/layouts.json`

### Code Structure
```
org.gnome.shell.extensions.fancyzones/
├── prefs.js              # Settings UI (this spec)
├── extension.js          # Core functionality
├── schemas/
│   └── org.gnome.shell.extensions.fancyzones.gschema.xml
└── ui/
    ├── settings.ui       # Glade/XML layout
    └── editorWindow.js   # Editor implementation
```
