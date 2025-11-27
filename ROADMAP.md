# Zoned Development Roadmap

**Last Updated:** 2025-11-26  
**Current Status:** Pre-release (active development)  
**Current Branch:** `initial_dev`

---

## Overview

This document serves as the authoritative roadmap for the Zoned GNOME Shell Extension. It tracks completed work, current development focus, and future plans.

**Key Focus Areas:**
1. **Settings-first layout management** - Unified UI for creating/editing layouts
2. **Comprehensive layout library** - Import/export, reorder, manage all layouts
3. **Keybinding customization** - User-configurable shortcuts with conflict detection
4. **Clean architecture** - Profile vs Layout separation for maintainability

---

## Architecture: Profile vs Layout

### **Critical Terminology Decision**

This architecture decision is fundamental to understanding the codebase:

**Internal (Code):**
- **Profile** = Complete data object containing:
  - `id`, `name` (metadata)
  - `zones` array (the layout geometry/edge data)
  - Future: `padding`, `shortcuts`, per-profile settings
- **ProfileManager** class manages profiles (loading, saving, state)
- File: `extension/profileManager.js`
- Persisted to: `~/.config/zoned/profiles.json`
- GSettings keys use "profile" naming (backward compatibility)

**User-Facing (UI):**
- Users see "**Layout**" everywhere
- UI strings: "Choose a layout", "Switch layout", "Edit layout"
- **LayoutEditor** component (edits the geometry/zones portion of a profile)
- **LayoutPicker** component (shows profiles, but calls them "layouts")

### **Why This Architecture?**

1. **Separation of Concerns:**
   - Layout = Pure geometry data (zones/edges)
   - Profile = Complete package (metadata + layout + settings)

2. **User Simplicity:**
   - Users don't need to understand "profiles"
   - "Layout" is intuitive and matches industry terminology

3. **Code Precision:**
   - Code is explicit about managing complete profile objects
   - Clear what each component handles

4. **Future-Proof:**
   - Easy to add per-profile settings (padding, shortcuts, colors)
   - Layout data remains pure geometry

### **Component Mapping:**

| Component | What it manages | User sees |
|-----------|----------------|-----------|
| ProfileManager | Profiles (complete objects) | N/A (internal) |
| LayoutEditor | zones array (geometry) | "Layout Editor" |
| LayoutPicker | Profiles (displays as cards) | "Choose a layout" |
| LayoutSettingsDialog | Profile metadata (name, etc.) | "Layout Settings" |

**References:**
- `extension/profileManager.js` - Detailed implementation notes
- `extension/ui/layoutEditor.js` - Component documentation
- `memory/STATUS.md` - Architecture decisions

---

## Current Status

### ✅ Completed & Stable

These components are fully implemented and battle-tested:

- **WindowManager** (`windowManager.js`)
  - Window positioning and zone assignment
  - Multi-monitor support
  - Move window to zone functionality
  
- **KeybindingManager** (`keybindingManager.js`)
  - Core keyboard shortcuts (Super+arrows, etc.)
  - Keybinding registration/cleanup
  
- **ZoneOverlay** (`ui/zoneOverlay.js`)
  - Visual zone preview overlays
  - Center-screen notifications with branded watermark icon
  
- **NotificationManager** (`ui/notificationManager.js`)
  - Top-bar notifications with branded icons
  - Dual notification system (center vs top-bar)
  
- **TemplateManager** (`templateManager.js`)
  - Built-in layout templates (halves, thirds, quarters, focus)
  - Template-to-layout conversion
  
- **LayoutConverter** (`utils/layoutConverter.js`)
  - Zone ↔ Edge layout conversion
  - Bidirectional transformation utilities

- **ConfirmDialog** (`ui/confirmDialog.js`)
  - Simple ModalDialog wrapper for confirmations

- **ConflictDetector** (`ui/conflictDetector.js`)
  - Detects keybinding conflicts with GNOME Shell defaults
  - Auto-fix capability with backup/restore
  - Integration with panel indicator for conflict warnings

- **PanelIndicator** (`ui/panelIndicator.js`)
  - Top bar integration showing current profile
  - Menu with profile selection
  - Conflict status indicator
  - About dialog

- **ProfilePicker** (`ui/profilePicker.js`)
  - Grid layout with monitor aspect ratio-matched cards
  - Cairo-rendered zone previews
  - Full-screen zone preview overlay with accent color theming
  - Keyboard shortcuts (1-9, arrows, Page Up/Down)
  - Compact, polished design

- **LayoutEditor** (`ui/layoutEditor.js`)
  - Full-screen edge-based layout editor
  - Visual zone editing with drag-and-drop
  - **Status:** Core implementation complete (Sprint 4)
  - **Note:** Will be refactored in Phase 3 (remove persistence logic)

### 🚧 Implemented but Evolving

- **ProfileManager** (`profileManager.js`)
  - Current: Manages profiles and zone cycling
  - Working and stable
  - Architecture now finalized (Profile vs Layout model)
  - Future: May need enhancements for LayoutSettingsDialog integration

---

## Active Development (Next Steps)

### Phase 1: Terminology Cleanup ✅ COMPLETE (2025-11-26)

**Goal:** Align user-facing terminology with "Layout" while keeping internal "Profile" for code

**Completed:**
- ✅ Renamed GridEditor → LayoutEditor (class, file, UI strings)
- ✅ Added architecture documentation to ProfileManager and LayoutEditor
- ✅ Documented Profile vs Layout model in STATUS.md
- ✅ Created comprehensive architecture spec (merged into this roadmap)
- ✅ Committed changes with detailed architecture explanation

**Deliverable:** Clean separation between internal (Profile) and user-facing (Layout) terminology

---

### Phase 2: LayoutSettingsDialog 📋 NEXT

**Goal:** Create gateway dialog for all layout operations

**New file:** `extension/ui/layoutSettingsDialog.js`

**Features to implement:**
- Two modes: Create (layout=null) vs Edit (layout=existing)
- Name input with validation (required for save)
- Layout status display (zone count)
- "Edit Layout..." button → LayoutEditor integration
- Save button with validation (disabled until name + zones)
- Proper callback flow (return to LayoutPicker)

**Component API Specification:**

```javascript
/**
 * LayoutSettingsDialog - Gateway for all layout operations
 * 
 * Modes:
 * - Create: layout=null (new layout)
 * - Edit: layout=existing (modify existing)
 * 
 * States:
 * - State A (Create): Name empty, no zones, Save disabled
 * - State B (Edit): Name filled, zones exist, Save enabled
 * - State C (After LayoutEditor): Zone count updated
 */
export class LayoutSettingsDialog extends ModalDialog.ModalDialog {
    /**
     * @param {Object|null} layout - Existing layout to edit, or null for new
     * @param {ProfileManager} profileManager - Profile manager instance
     * @param {Function} onSave - Callback after save
     * @param {Function} onCancel - Callback on cancel
     */
    constructor(layout, profileManager, onSave, onCancel) {
        super({ styleClass: 'layout-settings-dialog' });
        
        this._isNewLayout = (layout === null);
        this._layout = layout ? {...layout} : { zones: [] };
        this._profileManager = profileManager;
        this._onSaveCallback = onSave;
        this._onCancelCallback = onCancel;
        
        this._buildUI();
    }
    
    _buildUI() {
        // Title
        const title = this._isNewLayout ? 'New Layout' : `Edit Layout: ${this._layout.name}`;
        
        // Name input (required)
        this._nameEntry = new St.Entry({
            text: this._layout.name || '',
            hint_text: 'Layout name (required)',
            can_focus: true
        });
        this._nameEntry.connect('text-changed', () => this._updateSaveButton());
        
        // Layout status display
        this._layoutStatus = new St.Label({
            text: this._getLayoutStatus()
        });
        
        // "Edit Layout..." button
        this._editLayoutButton = new St.Button({
            label: 'Edit Layout...',
            style_class: 'button'
        });
        this._editLayoutButton.connect('clicked', () => this._openLayoutEditor());
        
        // Save/Cancel buttons
        this._saveButton = this.setButtons([
            { label: 'Cancel', action: () => this._onCancel() },
            { label: 'Save', action: () => this._onSave() }
        ]);
        
        this._updateSaveButton();
    }
    
    _getLayoutStatus() {
        const zoneCount = this._layout.zones?.length || 0;
        return zoneCount === 0 ? 'No zones defined' : `${zoneCount} zone${zoneCount !== 1 ? 's' : ''} defined`;
    }
    
    _validateForSave() {
        // Must have name
        if (!this._nameEntry.text.trim()) {
            return false;
        }
        
        // Must have zones
        if (!this._layout.zones || this._layout.zones.length === 0) {
            return false;
        }
        
        return true;
    }
    
    _updateSaveButton() {
        const canSave = this._validateForSave();
        this._saveButton.reactive = canSave;
        this._saveButton.set_opacity(canSave ? 255 : 128);
    }
    
    _openLayoutEditor() {
        // Close settings dialog
        this.close();
        
        // Open LayoutEditor with current layout
        const editor = new LayoutEditor(
            this._layout.zones.length > 0 ? this._layout : null,
            (editedLayout) => {
                // LayoutEditor saved - update our layout
                this._layout.zones = editedLayout.zones;
                
                // Reopen settings dialog
                this.open();
                this._layoutStatus.text = this._getLayoutStatus();
                this._updateSaveButton();
            },
            () => {
                // LayoutEditor canceled - reopen settings
                this.open();
            }
        );
        editor.show();
    }
    
    _onSave() {
        if (!this._validateForSave()) {
            return;
        }
        
        // Build final layout object
        const finalLayout = {
            id: this._layout.id || this._generateId(),
            name: this._nameEntry.text.trim(),
            zones: this._layout.zones,
            metadata: {
                createdDate: this._layout.metadata?.createdDate || Date.now(),
                modifiedDate: Date.now()
            }
        };
        
        // Save to disk via ProfileManager
        this._profileManager.saveProfile(finalLayout);
        
        // Close and callback
        this.close();
        if (this._onSaveCallback) {
            this._onSaveCallback(finalLayout);
        }
    }
    
    _onCancel() {
        this.close();
        if (this._onCancelCallback) {
            this._onCancelCallback();
        }
    }
    
    _generateId() {
        return `layout-${Date.now()}`;
    }
}
```

**ProfileManager backend additions needed:**
- Ensure `saveProfile(profile)` method exists and persists to disk
- Add metadata field support if not already present

**User Workflows to Support:**

**Workflow 1: Create New Layout**
1. User presses `Super+grave` → LayoutPicker appears
2. User clicks "New Custom Layout"
3. LayoutSettingsDialog opens (empty/new mode)
4. User types name: "My Workspace"
5. User clicks "Edit Layout..."
6. LayoutEditor opens (full-screen)
7. User designs layout (split zones, drag dividers)
8. User clicks Save in LayoutEditor
9. Returns to LayoutSettingsDialog (zone count updated)
10. User clicks Save
11. Layout persisted, returns to LayoutPicker
12. New layout appears in grid!

**Workflow 2: Quick Rename (Metadata Only)**
1. User presses `Super+grave` → LayoutPicker
2. User hovers over "Halves" card → gear ⚙️ appears
3. User clicks gear
4. LayoutSettingsDialog opens (edit mode, pre-filled)
5. User changes name to "Left-Right Split"
6. User clicks Save (doesn't touch layout geometry)
7. Layout renamed, returns to LayoutPicker

**Testing:**
- [ ] Create new layout flow works end-to-end
- [ ] Edit existing layout flow works
- [ ] Name validation prevents empty names
- [ ] Save button properly disabled/enabled
- [ ] Proper return to LayoutPicker on save/cancel
- [ ] Layout persists to disk correctly

**Deliverable:** Working settings dialog with full validation

---

### Phase 3: LayoutEditor Refactor

**Goal:** Make LayoutEditor a pure designer (doesn't persist directly)

**Changes to `extension/ui/layoutEditor.js`:**

**Before:**
```javascript
constructor(layout, profileManager, onSave)
```

**After:**
```javascript
/**
 * LayoutEditor - Visual layout designer
 * 
 * No longer persists directly - returns layout data to caller
 * 
 * @param {Object|null} layout - Existing layout or null for new (starts with halves)
 * @param {Function} onComplete - Callback with edited layout: (layout) => {}
 * @param {Function} onCancel - Callback on cancel: () => {}
 */
constructor(layout, onComplete, onCancel)
```

**Implementation changes:**
- Remove `profileManager` parameter
- `_onSave()` calls `onComplete(this._layout)` instead of saving
- `_onCancel()` calls `onCancel()`
- No direct disk writes

**Update all call sites:**
- ✅ LayoutSettingsDialog (already uses new API in Phase 2 spec)
- Update LayoutPicker "New Custom Layout" flow
- Update future LayoutManager component

**Testing:**
- [ ] LayoutEditor still works visually
- [ ] Data returned correctly via callback
- [ ] No direct saves to disk
- [ ] Proper cleanup on cancel

**Deliverable:** Clean separation of concerns (editing vs persistence)

---

### Phase 4: LayoutPicker Enhancements

**Goal:** Add gear icon for quick access to settings

**Changes to `extension/ui/layoutPicker.js`:**

**Add gear icon overlay to each card:**
```javascript
_createLayoutCard(layout) {
    const card = new St.Button({...});
    
    // Main click: switch layout
    card.connect('clicked', () => {
        this._switchToLayout(layout.id);
    });
    
    // Gear icon overlay
    const gearButton = new St.Button({
        child: new St.Icon({
            icon_name: 'emblem-system-symbolic',
            icon_size: 16
        }),
        style_class: 'layout-card-gear',
        x_align: Clutter.ActorAlign.END,
        y_align: Clutter.ActorAlign.START,
        opacity: 0  // Hidden by default
    });
    card.add_child(gearButton);
    
    // Show/hide on hover
    card.connect('enter-event', () => {
        gearButton.ease({ opacity: 255, duration: 100 });
    });
    card.connect('leave-event', () => {
        gearButton.ease({ opacity: 0, duration: 100 });
    });
    
    // Gear click: prevent propagation, open settings
    gearButton.connect('clicked', () => {
        this._openLayoutSettings(layout);
        return Clutter.EVENT_STOP;
    });
    
    return card;
}

_openLayoutSettings(layout) {
    this.close();
    
    const settingsDialog = new LayoutSettingsDialog(
        layout,
        this._profileManager,
        () => this.open(),  // Reopen on save
        () => this.open()   // Reopen on cancel
    );
    settingsDialog.open();
}
```

**Update "New Custom Layout" flow:**
- Change to open LayoutSettingsDialog instead of LayoutEditor directly
- Follows settings-first approach

**Testing:**
- [ ] Gear icon appears on hover
- [ ] Gear icon animates smoothly
- [ ] Gear click opens settings (not layout switch)
- [ ] Card click still switches layout
- [ ] New layout flow works through settings dialog

**Deliverable:** Enhanced picker with easy metadata editing

---

### Phase 5: LayoutManager Dialog

**Goal:** Comprehensive management interface for power users

**New file:** `extension/ui/layoutManager.js`

**Features:**

**Tab 1: Layout Library**
- List view (scrollable) of all layouts with metadata
- Per-layout actions:
  - Edit → LayoutSettingsDialog
  - Duplicate → Create copy with " (Copy)" suffix
  - Delete → ConfirmDialog → delete
  - Reorder → Drag-and-drop or arrow buttons
- Global actions:
  - Import → File chooser → merge layouts
  - Export → File chooser → write JSON
  - Reset to Defaults → ConfirmDialog → reset

**Tab 2: Keybindings**
- List of all keybindings with current values
- Click to record new keybinding
- Live conflict detection (ConflictDetector integration)
- Warning indicators if conflicts exist
- Save to GSettings
- Reset to defaults button

**Tab 3: Settings** (future)
- About section (version, GitHub link)
- General preferences
- Animation toggles
- Padding defaults

**Component Skeleton:**

```javascript
/**
 * LayoutManager - Comprehensive layout management
 * 
 * Tabbed interface for power users
 */
export class LayoutManager extends ModalDialog.ModalDialog {
    constructor(profileManager, conflictDetector, settingsManager) {
        super({ styleClass: 'layout-manager-dialog' });
        
        this._profileManager = profileManager;
        this._conflictDetector = conflictDetector;
        this._settingsManager = settingsManager;
        
        this._buildTabBar();
        this._buildContentArea();
        this._showLayoutsTab(); // Default
    }
    
    _showLayoutsTab() {
        // List view of all layouts
        // Each row: [Icon] Name | Zones | Actions [Edit] [Duplicate] [Delete]
        // Drag-and-drop reordering
        // Bottom toolbar: [Import] [Export] [Reset to Defaults]
    }
    
    _showKeybindingsTab() {
        // List of all keybindings
        // Click to edit, live conflict detection
        // [Reset to Defaults] button
    }
    
    _showSettingsTab() {
        // General preferences
        // About section
    }
}
```

**Panel menu integration:**
- Add "Manage Layouts..." menu item to PanelIndicator
- Opens LayoutManager dialog

**Testing:**
- [ ] All tabs render correctly
- [ ] Edit opens LayoutSettingsDialog
- [ ] Duplicate creates copy
- [ ] Delete with confirmation works
- [ ] Reordering persists
- [ ] Import/export valid JSON
- [ ] Reset to defaults works
- [ ] Keybinding editor functional
- [ ] Conflict detection integrated

**Deliverable:** Full-featured management UI

---

### Phase 6: Settings & Keybindings

**Goal:** User-configurable shortcuts and preferences

**Keybinding Editor Features:**
- List all current keybindings
- Click to record new keybinding
- Live conflict detection (ConflictDetector integration)
- Warning if conflicts exist
- Save to GSettings
- Reset to defaults button

**General Settings:**
- About section (version, GitHub link)
- Future: animation toggles, padding defaults, etc.

**GSettings Schema Changes:**

New keys needed:
```xml
<!-- Layout Manager Settings -->
<key name="layout-padding-default" type="i">
  <default>8</default>
  <summary>Default layout padding in pixels</summary>
</key>

<!-- Future: Per-layout shortcuts -->
<key name="layout-shortcuts" type="s">
  <default>'{}'</default>
  <summary>Per-layout keyboard shortcuts (JSON)</summary>
</key>
```

**Testing:**
- [ ] Keybindings save correctly
- [ ] Conflicts detected
- [ ] Reset works
- [ ] Settings persist across restart

**Deliverable:** Complete settings UI

---

### Phase 7: Integration & Testing

**Goal:** Polish and end-to-end validation

**Tasks:**
- Update STATUS.md with new components
- Test all workflows end-to-end
- UI polish (spacing, colors, alignment)
- Error handling improvements
- Documentation updates
- Update README with new features

**Testing Checklist:**
- [ ] Create new layout (full workflow)
- [ ] Edit existing layout (settings only)
- [ ] Edit existing layout (structure + settings)
- [ ] Delete layout with confirmation
- [ ] Duplicate layout
- [ ] Reorder layouts
- [ ] Export all layouts
- [ ] Import layouts
- [ ] Reset to defaults
- [ ] Edit keybindings
- [ ] Detect keybinding conflicts
- [ ] All workflows accessible from both LayoutPicker and LayoutManager
- [ ] State persists across GNOME Shell restart
- [ ] Extension survives disable/enable cycle
- [ ] Test on GNOME Shell versions (45, 46, 47)
- [ ] Test on Wayland and X11 sessions
- [ ] Test with different monitor configurations

**Deliverable:** Production-ready v1.0

---

## Additional UI/UX Refinements

These are polish items that can be addressed alongside or after the main phases:

### Alert/Notification System ✅ COMPLETE
- Dual notification system implemented
- Center-screen for user actions (ZoneOverlay)
- Top-bar for system messages (NotificationManager)
- Branded colorful icons throughout
- Documented in `memory/development/notification-strategy.md`

### Panel Indicator ✅ COMPLETE
- Changed to column-style icon (`view-paged-symbolic`)
- Better represents layout philosophy

### Custom MessageDialog ✅ COMPLETE
- Consistent branded UI for all dialogs
- Replaced system notifications
- Multiple dismissal methods

---

## Data Structure Changes

### Layout/Profile Object (Enhanced)

**Before:**
```json
{
  "id": "halves",
  "name": "Halves",
  "zones": [...]
}
```

**After (with metadata):**
```json
{
  "id": "halves",
  "name": "Halves",
  "zones": [...],
  "metadata": {
    "createdDate": 1732660000000,
    "modifiedDate": 1732660000000,
    "isBuiltin": true,
    "padding": 8
  }
}
```

**Migration:** ProfileManager adds default metadata on load if missing

---

## File Structure (After v1)

```
extension/
├── extension.js                       (modified - use ProfileManager)
├── profileManager.js                  (enhanced - metadata support)
├── templateManager.js                 (unchanged)
├── ui/
│   ├── layoutPicker.js               (modified - add gear icon)
│   ├── layoutSettingsDialog.js       (NEW - gateway dialog)
│   ├── layoutManager.js              (NEW - comprehensive management)
│   ├── layoutEditor.js               (modified - API changes)
│   ├── keybindingEditor.js           (NEW - part of LayoutManager)
│   ├── confirmDialog.js              (unchanged)
│   ├── messageDialog.js              (complete)
│   ├── panelIndicator.js             (modified - add menu item)
│   ├── notificationManager.js        (complete)
│   ├── conflictDetector.js           (unchanged)
│   └── zoneOverlay.js                (complete)
└── utils/
    └── debug.js                       (unchanged)
```

---

## Development Workflow

### Testing Commands

```bash
# Install extension
make install

# Compile GSettings schema
make compile-schema

# Enable extension
make enable

# View logs (while developing)
make logs

# Reload GNOME Shell (X11 only)
make reload

# Full development setup
make dev
```

### Code Style Guidelines

- Use 4 spaces for indentation
- Follow existing GNOME Shell extension patterns
- Add JSDoc comments for public methods
- Use ES6+ features (arrow functions, const/let, etc.)
- Keep files under 500 lines
- One class per file

---

## Post-v1 Roadmap

### v1.1: Multi-Workspace Support
- Per-workspace layout state
- Workspace switcher integration
- Workspace layout preview

### v1.2: Multi-Monitor Support
- Per-monitor layout assignments
- Monitor selector in dialogs
- Cross-monitor zones (stretch goal)

### v1.3: Advanced Features
- Per-layout keyboard shortcuts
- Layout padding controls
- Window rules/app preferences
- Layout templates/sharing
- Zone snapping with drag-and-drop

---

## Success Criteria (v1.0 Release)

✅ **Complete Feature Set:**
- [ ] Create custom layouts with names
- [ ] Edit existing layouts (structure + metadata)
- [ ] Delete layouts with confirmation
- [ ] Duplicate layouts
- [ ] Reorder layouts
- [ ] Import/export layouts
- [ ] Reset to defaults
- [ ] Customize all keybindings
- [ ] Conflict detection and warnings

✅ **User Experience:**
- Fast quick-access picker (keyboard shortcut)
- Comprehensive management for power users
- Settings-first approach (enforce naming)
- Clean separation of concerns

✅ **Code Quality:**
- Consistent "Layout" terminology for users
- Proper component separation
- No direct disk writes from UI components
- Full validation and error handling

✅ **Testing:**
- All workflows tested end-to-end
- Extension stable across restart/disable/enable
- No errors in GNOME Shell logs
- State persistence works correctly

---

## Resources

### Essential Documentation
- **This Roadmap:** Primary reference for development plan
- **Architecture Decisions:** `memory/STATUS.md`
- **Profile vs Layout Model:** This document (Architecture section)
- **Component Specs:** Throughout this roadmap
- **API Translation:** `memory/architecture/hammerspoon-translation.md`
- **Keybindings:** `memory/api-reference/keybindings.md`
- **Profiles:** `memory/api-reference/profiles.md`

### GNOME Shell Development
- [GJS Guide](https://gjs.guide/)
- [GNOME Shell Extensions Tutorial](https://gjs.guide/extensions/)
- [Meta Window API](https://gjs-docs.gnome.org/meta13~13/meta.window)
- [St Toolkit](https://gjs-docs.gnome.org/st13/)

### Reference Implementation
- Hammerspoon config: `../shell/dotfiles/hammerspoon/.hammerspoon/init.lua`

---

**Version:** 1.0  
**Last Updated:** 2025-11-26  
**Next Action:** Begin Phase 2 (LayoutSettingsDialog implementation)
