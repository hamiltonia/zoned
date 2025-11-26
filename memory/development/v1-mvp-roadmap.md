# Zoned v1 MVP Roadmap

**Status:** 📋 ACTIVE DEVELOPMENT  
**Created:** 2025-11-26  
**Target:** v1.0 Release

---

## Overview

Complete specification for Zoned v1 MVP. This roadmap focuses on three key areas:
1. **Settings-first layout management** - Unified UI for creating/editing layouts
2. **Comprehensive layout library** - Import/export, reorder, manage all layouts
3. **Keybinding customization** - User-configurable shortcuts with conflict detection

**Core Principle:** Separation between quick access (LayoutPicker) and power features (settings-based management)

---

## Architecture: Profile vs Layout

### **Critical Terminology Decision**

**Internal (Code):**
- **Profile** = Complete data object containing:
  - `id`, `name` (metadata)
  - `zones` array (the layout geometry/edge data)
  - Future: `padding`, `shortcuts`, per-profile settings
- **ProfileManager** class manages profiles (loading, saving, state)
- File: `extension/profileManager.js`

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

**GSettings Keys:** Keep existing names for backward compatibility (`current-profile-id`, `profile-order`)

---

## Architecture Decisions

### Decision 1: Three Separate Dialogs

**Rationale:** Keep quick-access lightweight, power features comprehensive

#### 1. LayoutPicker (Lightweight)
- **Access:** `Super+grave` keyboard shortcut
- **Purpose:** Quick layout switching only
- **Features:**
  - Grid of layout cards (templates + custom)
  - Click card → switch layout immediately
  - Gear icon (hover) → open LayoutSettingsDialog
  - "New Custom Layout" button → open LayoutSettingsDialog
- **What it DOESN'T have:**
  - No management features
  - No bulk operations
  - No settings tab
  - **Fast and focused!**

#### 2. LayoutSettingsDialog (Gateway)
- **Access:** 
  - From LayoutPicker: Gear icon or "New Custom Layout"
  - From LayoutManager: Edit button
- **Purpose:** Primary interface for all layout operations
- **Features:**
  - Name input (required for save)
  - Layout status display (zone count)
  - "Edit Layout..." button → LayoutEditor
  - Future settings: padding, shortcuts
- **Key Principle:** Settings first, editing second
  - User names layout before/after editing
  - Allows metadata-only changes (rename without re-editing)
  - Enforces complete layout objects (name + zones)

#### 3. LayoutManager (Power User)
- **Access:** Panel menu → "Manage Layouts..."
- **Purpose:** Comprehensive layout lifecycle management
- **Features:**
  - List view of all layouts with metadata
  - Per-layout actions: Edit, Duplicate, Delete, Reorder
  - Global actions: Import, Export, Reset to Defaults
  - Settings section: Keybindings, preferences
- **Organization:** Tabbed interface
  - Tab 1: Layout Library
  - Tab 2: Keybindings
  - Tab 3: Settings (future)

---

## User Workflows

### Workflow 1: Create New Layout
1. User presses `Super+grave` → **LayoutPicker** appears
2. User clicks "New Custom Layout"
3. **LayoutSettingsDialog** opens (empty/new mode)
   - Title: "New Layout"
   - Name field: EMPTY, REQUIRED
   - Layout status: "No zones defined"
   - "Edit Layout..." button: Enabled
   - [Save] button: **Disabled** (no zones yet)
4. User types name: "My Workspace"
5. User clicks "Edit Layout..."
6. **LayoutEditor** opens (full-screen)
7. User designs layout (split zones, drag dividers)
8. User clicks Save in LayoutEditor
9. **Returns to LayoutSettingsDialog**
   - Layout status: "4 zones defined"
   - [Save] button: **Enabled** (has name + zones)
10. User clicks Save
11. Layout persisted to disk
12. Returns to **LayoutPicker**
13. New layout appears in grid!

### Workflow 2: Quick Rename (Metadata Only)
1. User presses `Super+grave` → **LayoutPicker**
2. User hovers over "Halves" card → gear ⚙️ appears
3. User clicks gear
4. **LayoutSettingsDialog** opens (edit mode)
   - Title: "Edit Layout: Halves"
   - Name: "Halves" (pre-filled)
   - Layout status: "2 zones defined"
   - [Save] enabled
5. User changes name to "Left-Right Split"
6. User clicks Save (doesn't touch layout)
7. Layout renamed, returns to **LayoutPicker**

### Workflow 3: Edit Existing Layout
1. User presses `Super+grave` → **LayoutPicker**
2. User clicks gear ⚙️ on existing layout
3. **LayoutSettingsDialog** opens (pre-filled)
4. User clicks "Edit Layout..."
5. **LayoutEditor** opens with existing zones
6. User modifies layout (add splits, adjust dividers)
7. User clicks Save in LayoutEditor
8. **Returns to LayoutSettingsDialog**
   - Zone count updated
   - User can optionally rename
9. User clicks Save
10. Changes persisted, returns to **LayoutPicker**

### Workflow 4: Manage Layouts (Power User)
1. User clicks panel icon → "Manage Layouts..."
2. **LayoutManager** dialog opens
3. User sees list of all layouts with metadata
4. User performs bulk operations:
   - Reorder by dragging
   - Duplicate "Halves" → "Halves Copy"
   - Delete unused layouts
   - Export all layouts to JSON
   - Import layouts from file
   - Reset to defaults (with confirmation)
5. User closes dialog

---

## Component API Specifications

### LayoutSettingsDialog

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
     * @param {LayoutManager} layoutManager - Layout manager instance
     * @param {Function} onSave - Callback after save
     * @param {Function} onCancel - Callback on cancel
     */
    constructor(layout, layoutManager, onSave, onCancel) {
        super({ styleClass: 'layout-settings-dialog' });
        
        this._isNewLayout = (layout === null);
        this._layout = layout ? {...layout} : { zones: [] };
        this._layoutManager = layoutManager;
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
        
        // Save to disk
        this._layoutManager.saveLayout(finalLayout);
        
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

### LayoutEditor API Changes

**Before:**
```javascript
constructor(layout, layoutManager, onSave)
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

### LayoutPicker Changes

**Add gear icon overlay:**
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
        this._layoutManager,
        () => this.open(),  // Reopen on save
        () => this.open()   // Reopen on cancel
    );
    settingsDialog.open();
}
```

### LayoutManager Dialog Spec

```javascript
/**
 * LayoutManager - Comprehensive layout management
 * 
 * Tabbed interface:
 * - Layouts: List view with edit/duplicate/delete/reorder
 * - Keybindings: Customize shortcuts
 * - Settings: General preferences (future)
 */
export class LayoutManager extends ModalDialog.ModalDialog {
    constructor(layoutManager, conflictDetector, settingsManager) {
        super({ styleClass: 'layout-manager-dialog' });
        
        this._layoutManager = layoutManager;
        this._conflictDetector = conflictDetector;
        this._settingsManager = settingsManager;
        
        this._buildTabBar();
        this._buildContentArea();
        this._showLayoutsTab(); // Default
    }
    
    // Tab 1: Layouts
    _showLayoutsTab() {
        // List view of all layouts
        // Each row: [Icon] Name | Zones | Actions [Edit] [Duplicate] [Delete]
        // Drag-and-drop reordering
        // Bottom toolbar: [Import] [Export] [Reset to Defaults]
    }
    
    // Tab 2: Keybindings
    _showKeybindingsTab() {
        // List of all keybindings
        // Click to edit, live conflict detection
        // [Reset to Defaults] button
    }
    
    // Tab 3: Settings (future)
    _showSettingsTab() {
        // General preferences
        // About section
    }
}
```

---

## Implementation Phases

### Phase 1: Terminology Cleanup ⚠️ DO FIRST
**Goal:** Align user-facing terminology with "Layout" while keeping internal "Profile" for code

**Files to change:**
- ✅ `extension/profileManager.js` - KEEP AS IS (internal architecture)
  - Class name stays: `ProfileManager`
  - Add detailed JSDoc comments explaining Profile vs Layout model
  - Update user-facing error messages to use "layout"
- `extension/ui/layoutEditor.js` → `extension/ui/layoutEditor.js`
  - Rename class: `LayoutEditor` → `LayoutEditor`
  - Update UI strings to use "Layout Editor"
  - Update imports across codebase
- UI strings in all dialog/picker files:
  - "Profile" → "Layout" (user-facing only)
  - "Choose Profile" → "Choose Layout"
  - "Current Profile" → "Current Layout"
- GSettings schema descriptions (user-facing only):
  - Update `<summary>` and `<description>` to mention "layout"
  - Keep key names unchanged (backward compatibility)

**Code documentation:**
- Add architecture comment block to `profileManager.js` explaining the model
- Add similar comments to `layoutEditor.js`
- Update `STATUS.md` with terminology decision

**Testing:**
- Extension loads without errors
- Layouts switch correctly
- State persists across restarts
- No broken imports
- User sees "layout" in all UI elements

**Deliverable:** Clean separation between internal (Profile) and user-facing (Layout) terminology

---

### Phase 2: LayoutSettingsDialog
**Goal:** Create gateway dialog for all layout operations

**New file:** `extension/ui/layoutSettingsDialog.js`

**Features:**
- Two modes: Create (layout=null) vs Edit (layout=existing)
- Name input with validation
- Layout status display
- "Edit Layout..." button → LayoutEditor integration
- Save button with validation (disabled until name + zones)
- Proper callback flow

**LayoutManager backend additions:**
- `saveLayout(layout)` - Persist layout to disk (already exists as saveProfile)
- Ensure metadata fields supported

**Testing:**
- Create new layout flow
- Edit existing layout flow
- Name validation works
- Proper return to LayoutPicker

**Deliverable:** Working settings dialog with full validation

---

### Phase 3: LayoutEditor Refactor
**Goal:** Make LayoutEditor a pure designer (doesn't persist)

**Changes to `extension/ui/layoutEditor.js`:**
- Remove `layoutManager` parameter
- Change constructor: `(layout, onComplete, onCancel)`
- `_onSave()` calls `onComplete(this._layout)` instead of saving
- `_onCancel()` calls `onCancel()`
- No direct disk writes

**Update all call sites:**
- LayoutSettingsDialog (new)
- LayoutPicker (update "New Custom Layout")
- LayoutManager (when editing)

**Testing:**
- LayoutEditor still works
- Data returned correctly
- No direct saves to disk

**Deliverable:** Clean separation of concerns

---

### Phase 4: LayoutPicker Enhancements
**Goal:** Add gear icon for editing

**Changes to `extension/ui/layoutPicker.js`:**
- Add gear button overlay to each card
- Show/hide on hover with animation
- Gear click → LayoutSettingsDialog
- Event propagation handling (gear doesn't trigger card click)
- Update "New Custom Layout" → LayoutSettingsDialog (not LayoutEditor)

**Testing:**
- Gear appears on hover
- Gear opens settings correctly
- Card click still switches layout
- New layout flow works

**Deliverable:** Enhanced picker with edit access

---

### Phase 5: LayoutManager Dialog
**Goal:** Comprehensive management interface

**New file:** `extension/ui/layoutManager.js`

**Tab 1: Layout Library**
- List view (scrollable)
- Per-layout actions:
  - Edit → LayoutSettingsDialog
  - Duplicate → Create copy with " (Copy)" suffix
  - Delete → ConfirmDialog → delete
  - Reorder → Drag-and-drop or arrow buttons
- Global actions:
  - Import → File chooser → merge layouts
  - Export → File chooser → write JSON
  - Reset to Defaults → ConfirmDialog → reset

**Tab 2: Keybindings** (Phase 6)
**Tab 3: Settings** (Phase 6)

**Panel menu integration:**
- Add "Manage Layouts..." menu item
- Opens LayoutManager dialog

**Testing:**
- All actions work
- Import/export valid JSON
- Reset to defaults works
- Reordering persists

**Deliverable:** Full management UI

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

**Testing:**
- Keybindings save correctly
- Conflicts detected
- Reset works
- Settings persist

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

**Deliverable:** Production-ready v1.0

---

## Data Structure Changes

### Layout Object (Enhanced)

**Before:**
```json
{
  "id": "halves",
  "name": "Halves",
  "zones": [...]
}
```

**After:**
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

**Migration:** LayoutManager adds default metadata on load if missing

---

## GSettings Schema Changes

**New keys needed:**
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

**Existing keys to update (descriptions only):**
- `current-profile-id` → description mentions "layout"
- `profile-order` → description mentions "layout"

---

## File Structure (After v1)

```
extension/
├── extension.js                       (modified - use LayoutManager)
├── layoutManager.js                   (RENAMED from profileManager.js)
├── templateManager.js                 (unchanged)
├── ui/
│   ├── layoutPicker.js               (modified - add gear icon)
│   ├── layoutSettingsDialog.js       (NEW - gateway dialog)
│   ├── layoutManager.js              (NEW - comprehensive management)
│   ├── layoutEditor.js                 (modified - API changes)
│   ├── keybindingEditor.js           (NEW - part of LayoutManager)
│   ├── confirmDialog.js              (unchanged)
│   ├── panelIndicator.js             (modified - add menu item)
│   ├── notificationManager.js        (unchanged)
│   └── zoneOverlay.js                (unchanged)
└── utils/
    └── debug.js                       (unchanged)
```

---

## Success Criteria (v1.0 Release)

✅ **Complete Feature Set:**
- [x] Create custom layouts with names
- [x] Edit existing layouts (structure + metadata)
- [x] Delete layouts with confirmation
- [x] Duplicate layouts
- [x] Reorder layouts
- [x] Import/export layouts
- [x] Reset to defaults
- [x] Customize all keybindings
- [x] Conflict detection and warnings

✅ **User Experience:**
- Fast quick-access picker (keyboard shortcut)
- Comprehensive management for power users
- Settings-first approach (enforce naming)
- Clean separation of concerns

✅ **Code Quality:**
- Consistent "Layout" terminology
- Proper component separation
- No direct disk writes from UI components
- Full validation and error handling

✅ **Testing:**
- All workflows tested end-to-end
- Extension stable across restart/disable/enable
- No errors in GNOME Shell logs
- State persistence works correctly

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

---

**Version:** 1.0  
**Last Updated:** 2025-11-26  
**Status:** Ready for implementation

**Next Action:** Begin Phase 1 (Terminology Migration)
