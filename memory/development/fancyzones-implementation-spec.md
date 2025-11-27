# FancyZones-Style Implementation Spec

**Status:** 🗄️ HISTORICAL  
**Last Verified:** 2025-11-26  
**Notes:** Sprint planning document for the FancyZones rewrite (Sprints 1-4 completed). Keep as historical reference for understanding development process. ZoneEditor implementation is now complete.

**Created:** 2024-11-25  
**Original Status:** Active Development  
**Approach:** Start small, build out - Grid mode only

---

## Overview

Complete rewrite of profile/layout management using FancyZones UX patterns. Replaces broken custom modal dialogs with proper GNOME Shell ModalDialog usage and full-screen grid editor.

**Goals:**
1. Fix modal dialog conflicts (use ModalDialog.ModalDialog)
2. Implement FancyZones UX (click-to-split, drag dividers, full-screen editor)
3. Start simple (ModalDialog picker) → Upgrade later (full window)
4. Delete ~1,800 lines of broken code, add ~800 lines of working code

---

## Terminology Change

**Old:** Profile (container for zones)  
**New:** Layout (FancyZones term)

**Rationale:** Align with FancyZones spec, clearer intent

**Migration:**
- Keep ProfileManager class name (public API)
- Internal methods use "layout" terminology
- UI displays "Choose Layout" not "Choose Profile"

---

## Architecture Overview

```
Component Hierarchy:
├─ LayoutPicker (ModalDialog)          ← Quick modal overlay
│  ├─ Template cards (halves, thirds, etc.)
│  └─ "New Custom Layout" button
│
├─ ZoneEditor (Full-screen overlay)    ← Immersive editing
│  ├─ Zone rendering (Clutter actors)
│  ├─ Click-to-split interaction
│  ├─ Divider dragging
│  └─ Toolbar (Save/Cancel)
│
├─ TemplateManager                     ← Built-in templates
│  └─ Built-in templates (halves, thirds, quarters, focus)
│
└─ ConfirmDialog (ModalDialog)         ← Simple confirmations
   └─ Used for delete, cancel with changes
```

---

## Files to DELETE (Nuclear Cleanup)

```
extension/ui/profileSettings.js        (~552 lines)
extension/ui/profileEditor.js          (~706 lines)
extension/ui/messageDialog.js          (~334 lines)
extension/ui/zoneCanvas.js             (~250 lines)
────────────────────────────────────────────────────
Total: 1,842 lines DELETED
```

**Reason:** All use custom modal implementation with fundamental flaws

---

## Files to CREATE

### Core Components

**1. extension/templateManager.js** (~150 lines)
- Manages built-in layout templates
- Generates zone configurations
- No custom layouts yet (defer to future)

**2. extension/ui/layoutPicker.js** (~200 lines)
- ModalDialog subclass
- Grid of template cards
- Click to apply layout
- "New Custom Layout" button opens ZoneEditor

**3. extension/ui/zoneEditor.js** (~350 lines)
- Full-screen overlay on monitor
- Click zone to split (Shift for vertical)
- Drag dividers to resize
- Save/Cancel workflow

**4. extension/ui/confirmDialog.js** (~30 lines)
- Simple ModalDialog wrapper
- Title + message + OK/Cancel buttons
- Replaces broken MessageDialog

### Supporting Files

**5. memory/development/fancyzones-implementation-spec.md** (this file)
- Complete technical specification
- Sprint breakdown
- Architecture decisions

---

## Sprint 1: Nuclear Cleanup + Foundation

### Day 1 Morning: Documentation & Commit Current State

**Tasks:**
- [x] Create fancyzones-implementation-spec.md
- [ ] Commit current state: "Pre-FancyZones rewrite checkpoint"

### Day 1 Afternoon: Nuclear Deletion

**Tasks:**
- [ ] Delete 4 files (profileSettings, profileEditor, messageDialog, zoneCanvas)
- [ ] Remove imports from extension.js and panelIndicator.js
- [ ] Commit deletion: "Remove deprecated dialog system - FancyZones rewrite"

### Day 2: Foundation Components

**Tasks:**
- [ ] Create templateManager.js with 4 built-in templates
- [ ] Create confirmDialog.js (simple ModalDialog wrapper)
- [ ] Test confirmDialog in isolation
- [ ] Commit: "Add TemplateManager and ConfirmDialog foundation"

---

## Sprint 2: Layout Picker (ModalDialog)

### Day 3: LayoutPicker Shell

**Create: extension/ui/layoutPicker.js**

```javascript
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

export class LayoutPicker extends ModalDialog.ModalDialog {
    constructor(layoutManager, templateManager) {
        super({ styleClass: 'zoned-layout-picker' });
        
        this._layoutManager = layoutManager;
        this._templateManager = templateManager;
        
        this._buildUI();
    }
    
    _buildUI() {
        // Title
        const title = new St.Label({
            text: 'Choose Layout',
            style_class: 'zoned-picker-title'
        });
        this.contentLayout.add_child(title);
        
        // Template grid
        const grid = this._createTemplateGrid();
        this.contentLayout.add_child(grid);
        
        // Buttons
        this.setButtons([
            {
                label: 'New Custom Layout',
                action: () => this._openEditor(),
                key: Clutter.KEY_n
            },
            {
                label: 'Close',
                action: () => this.close(),
                key: Clutter.KEY_Escape
            }
        ]);
    }
    
    _createTemplateGrid() {
        const layout = new Clutter.GridLayout();
        const grid = new St.Widget({ layout_manager: layout });
        
        const templates = this._templateManager.getBuiltinTemplates();
        
        templates.forEach((template, index) => {
            const card = this._createTemplateCard(template);
            const row = Math.floor(index / 4);
            const col = index % 4;
            layout.attach(card, col, row, 1, 1);
        });
        
        return grid;
    }
    
    _createTemplateCard(template) {
        const card = new St.Button({
            style_class: 'template-card',
            reactive: true
        });
        
        // Preview rendering (simplified for now)
        const preview = new St.Label({
            text: template.icon,  // Unicode icon for now
            style: 'font-size: 48pt;'
        });
        
        const label = new St.Label({
            text: template.name,
            style_class: 'template-label'
        });
        
        const box = new St.BoxLayout({
            vertical: true,
            style_class: 'template-card-content'
        });
        box.add_child(preview);
        box.add_child(label);
        
        card.set_child(box);
        
        card.connect('clicked', () => {
            this._onTemplateSelected(template);
        });
        
        return card;
    }
    
    _onTemplateSelected(template) {
        // Apply layout to current profile
        const layout = this._templateManager.createLayoutFromTemplate(template.id);
        this._layoutManager.updateCurrentLayout(layout);
        this.close();
    }
    
    _openEditor() {
        this.close();
        // Will implement in Sprint 3
        // const editor = new ZoneEditor(...);
        // editor.show();
    }
}
```

### Day 4: Styling & Integration

**Tasks:**
- [ ] Add CSS for template cards
- [ ] Wire up to PanelIndicator (replace old ProfilePicker)
- [ ] Test template selection flow
- [ ] Commit: "Add LayoutPicker with ModalDialog"

---

## Sprint 3: Grid Editor Core

### Days 5-6: Full-Screen Overlay

**Create: extension/ui/zoneEditor.js**

```javascript
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Shell from 'gi://Shell';

export class ZoneEditor {
    constructor(layout, layoutManager, onSave) {
        this._layout = JSON.parse(JSON.stringify(layout)); // Deep copy
        this._layoutManager = layoutManager;
        this._onSaveCallback = onSave;
        
        this._overlay = null;
        this._zoneActors = [];
        this._selectedZoneIndex = 0;
    }
    
    show() {
        const monitor = Main.layoutManager.primaryMonitor;
        
        // Full-screen overlay
        this._overlay = new St.Widget({
            style_class: 'grid-editor-overlay',
            reactive: true,
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height
        });
        
        // Dim background
        this._overlay.style = 'background-color: rgba(0, 0, 0, 0.7);';
        
        // Add zones
        this._createZones();
        
        // Add toolbar
        this._createToolbar();
        
        // Add to stage
        Main.uiGroup.add_child(this._overlay);
        
        // Grab modal
        Main.pushModal(this._overlay, {
            actionMode: Shell.ActionMode.NORMAL
        });
    }
    
    hide() {
        if (this._overlay) {
            Main.popModal(this._overlay);
            Main.uiGroup.remove_child(this._overlay);
            this._overlay.destroy();
            this._overlay = null;
            this._zoneActors = [];
        }
    }
    
    _createZones() {
        const monitor = Main.layoutManager.primaryMonitor;
        
        this._layout.zones.forEach((zone, index) => {
            const actor = new St.Button({
                style_class: 'zone-actor',
                reactive: true,
                x: monitor.x + zone.x * monitor.width,
                y: monitor.y + zone.y * monitor.height,
                width: zone.w * monitor.width,
                height: zone.h * monitor.height
            });
            
            // Zone styling
            actor.style = `
                background-color: rgba(0, 120, 212, 0.5);
                border: 3px solid rgb(28, 113, 216);
                border-radius: 4px;
            `;
            
            // Zone number
            const label = new St.Label({
                text: `${index + 1}`,
                style: 'font-size: 72pt; color: white;'
            });
            actor.set_child(label);
            
            // Click to split
            actor.connect('button-press-event', (actor, event) => {
                this._onZoneClicked(index, event);
                return Clutter.EVENT_STOP;
            });
            
            this._overlay.add_child(actor);
            this._zoneActors.push(actor);
        });
    }
    
    _onZoneClicked(zoneIndex, event) {
        const modifiers = event.get_state();
        const shiftPressed = modifiers & Clutter.ModifierType.SHIFT_MASK;
        
        if (shiftPressed) {
            this._splitVertical(zoneIndex);
        } else {
            this._splitHorizontal(zoneIndex);
        }
    }
    
    _splitHorizontal(zoneIndex) {
        const zone = this._layout.zones[zoneIndex];
        
        const left = {
            name: `${zone.name} Left`,
            x: zone.x,
            y: zone.y,
            w: zone.w * 0.5,
            h: zone.h
        };
        
        const right = {
            name: `${zone.name} Right`,
            x: zone.x + zone.w * 0.5,
            y: zone.y,
            w: zone.w * 0.5,
            h: zone.h
        };
        
        this._layout.zones.splice(zoneIndex, 1, left, right);
        this._refreshZones();
    }
    
    _splitVertical(zoneIndex) {
        const zone = this._layout.zones[zoneIndex];
        
        const top = {
            name: `${zone.name} Top`,
            x: zone.x,
            y: zone.y,
            w: zone.w,
            h: zone.h * 0.5
        };
        
        const bottom = {
            name: `${zone.name} Bottom`,
            x: zone.x,
            y: zone.y + zone.h * 0.5,
            w: zone.w,
            h: zone.h * 0.5
        };
        
        this._layout.zones.splice(zoneIndex, 1, top, bottom);
        this._refreshZones();
    }
    
    _refreshZones() {
        // Remove old zone actors
        this._zoneActors.forEach(actor => actor.destroy());
        this._zoneActors = [];
        
        // Recreate zones
        this._createZones();
    }
    
    _createToolbar() {
        const toolbar = new St.BoxLayout({
            style_class: 'grid-editor-toolbar',
            style: 'spacing: 12px; padding: 12px; background-color: rgba(255, 255, 255, 0.9); border-radius: 8px;',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.START,
            x_expand: true
        });
        
        const saveButton = new St.Button({
            label: 'Save',
            style_class: 'button'
        });
        saveButton.connect('clicked', () => this._onSave());
        
        const cancelButton = new St.Button({
            label: 'Cancel',
            style_class: 'button'
        });
        cancelButton.connect('clicked', () => this._onCancel());
        
        toolbar.add_child(saveButton);
        toolbar.add_child(cancelButton);
        
        this._overlay.add_child(toolbar);
    }
    
    _onSave() {
        // Validate and save
        if (this._onSaveCallback) {
            this._onSaveCallback(this._layout);
        }
        this.hide();
    }
    
    _onCancel() {
        this.hide();
    }
}
```

### Days 7-8: Testing & Refinement

**Tasks:**
- [ ] Test click-to-split (horizontal and vertical)
- [ ] Add keyboard shortcuts (Esc to cancel)
- [ ] Visual polish (zone colors, borders)
- [ ] Commit: "Add ZoneEditor with click-to-split"

---

## Sprint 4: Divider Interactions (Days 9-11)

**Features:**
- [ ] Detect dividers from zone layout
- [ ] Render dividers as draggable handles
- [ ] Drag to resize adjacent zones
- [ ] Min zone size enforcement (10%)

**Deferred to Sprint 4 detailed spec**

---

## Sprint 5: Merge & Validation (Days 12-13)

**Features:**
- [ ] Double-click divider to merge zones
- [ ] Validation (coverage, overlaps, min size)
- [ ] Basic undo/redo
- [ ] Zone reindexing

**Deferred to Sprint 5 detailed spec**

---

## Sprint 6: Polish & Testing (Days 14-15)

**Features:**
- [ ] Keyboard shortcuts (S, Shift+S, Arrows)
- [ ] Zone numbers rendering improvements
- [ ] Error handling
- [ ] VM testing
- [ ] Documentation

---

## TemplateManager Specification

### Built-in Templates

```javascript
const BUILTIN_TEMPLATES = {
    halves: {
        id: 'halves',
        name: 'Halves',
        icon: '⫿',  // Unicode split icon
        zones: [
            { name: 'Left', x: 0.0, y: 0.0, w: 0.5, h: 1.0 },
            { name: 'Right', x: 0.5, y: 0.0, w: 0.5, h: 1.0 }
        ]
    },
    thirds: {
        id: 'thirds',
        name: 'Thirds',
        icon: '⫴',
        zones: [
            { name: 'Left', x: 0.0, y: 0.0, w: 0.333, h: 1.0 },
            { name: 'Center', x: 0.333, y: 0.0, w: 0.334, h: 1.0 },
            { name: 'Right', x: 0.667, y: 0.0, w: 0.333, h: 1.0 }
        ]
    },
    quarters: {
        id: 'quarters',
        name: 'Quarters',
        icon: '⊞',
        zones: [
            { name: 'Top Left', x: 0.0, y: 0.0, w: 0.5, h: 0.5 },
            { name: 'Top Right', x: 0.5, y: 0.0, w: 0.5, h: 0.5 },
            { name: 'Bottom Left', x: 0.0, y: 0.5, w: 0.5, h: 0.5 },
            { name: 'Bottom Right', x: 0.5, y: 0.5, w: 0.5, h: 0.5 }
        ]
    },
    focus: {
        id: 'focus',
        name: 'Focus',
        icon: '◧',
        zones: [
            { name: 'Main', x: 0.0, y: 0.0, w: 0.7, h: 1.0 },
            { name: 'Side', x: 0.7, y: 0.0, w: 0.3, h: 1.0 }
        ]
    }
};
```

### TemplateManager Class

```javascript
export class TemplateManager {
    constructor() {
        this._templates = { ...BUILTIN_TEMPLATES };
    }
    
    getBuiltinTemplates() {
        return Object.values(this._templates);
    }
    
    getTemplate(id) {
        return this._templates[id];
    }
    
    createLayoutFromTemplate(templateId) {
        const template = this._templates[templateId];
        if (!template) {
            throw new Error(`Unknown template: ${templateId}`);
        }
        
        return {
            id: `layout-${Date.now()}`,
            name: template.name,
            zones: JSON.parse(JSON.stringify(template.zones)) // Deep copy
        };
    }
}
```

---

## Integration Points

### PanelIndicator Changes

**Remove:**
```javascript
// OLD - ProfileSettings
this._profileSettings = new ProfileSettings(...);
this._settingsItem.connect('activate', () => {
    this._profileSettings.show();
});
```

**Add:**
```javascript
// NEW - LayoutPicker
import { LayoutPicker } from './ui/layoutPicker.js';
import { TemplateManager } from './templateManager.js';

this._templateManager = new TemplateManager();
this._layoutPicker = new LayoutPicker(
    this._profileManager,
    this._templateManager
);

this._settingsItem.connect('activate', () => {
    this._layoutPicker.open();  // ModalDialog method
});
```

### ProfileManager Changes

**Keep existing methods, add:**
```javascript
updateCurrentLayout(layout) {
    // Update active profile's zones
    const activeId = this._settings.get_string('active-profile');
    this.saveProfile({
        id: activeId,
        name: layout.name,
        zones: layout.zones
    });
}
```

---

## Testing Strategy

### Unit Tests (Manual for now)
1. **TemplateManager:**
   - [ ] All 4 templates return valid zone configurations
   - [ ] createLayoutFromTemplate() creates deep copy

2. **LayoutPicker:**
   - [ ] Opens as modal dialog
   - [ ] Shows 4 template cards
   - [ ] Click template applies layout
   - [ ] Esc closes dialog

3. **ZoneEditor:**
   - [ ] Full-screen overlay appears
   - [ ] Click zone splits horizontally
   - [ ] Shift+click splits vertically
   - [ ] Save applies changes
   - [ ] Cancel discards changes

### VM Integration Tests
1. [ ] Launch extension, open layout picker
2. [ ] Select "Halves" template, verify layout applies
3. [ ] Select "New Custom Layout", verify editor opens
4. [ ] Split zone 3 times, verify zones update
5. [ ] Save custom layout, verify persistence
6. [ ] Reload extension, verify custom layout persists

---

## Success Criteria (Sprint 1-6)

After 15 days of development:

✅ **Deleted:** 1,842 lines of broken code
✅ **Added:** ~800 lines of working code  
✅ **Net:** -1,000 lines (simpler codebase)

✅ **Working Features:**
- Template picker with 4 built-in layouts
- Full-screen grid editor
- Click-to-split (horizontal and vertical)
- Drag dividers to resize
- Basic merge functionality
- Save/Cancel workflow

✅ **Proper Architecture:**
- Using ModalDialog.ModalDialog (no conflicts)
- Full-screen editor (immersive UX)
- Clean separation of concerns

✅ **User Value:**
- Can choose layouts quickly
- Can create custom layouts visually
- No more buggy dialogs

---

## Future Enhancements (Post-Sprint 6)

### Phase 2: Advanced Features
- [ ] Quick Config Dialog (spec-03)
- [ ] Template save/export
- [ ] Undo/Redo with history
- [ ] Keyboard shortcuts in editor
- [ ] Zone margin controls

### Phase 3: Multi-Monitor
- [ ] Upgrade LayoutPicker to full window
- [ ] Monitor selector bar (spec-02)
- [ ] Per-monitor layouts
- [ ] Cross-monitor zones (optional)

### Phase 4: Canvas Mode
- [ ] Free positioning editor
- [ ] Overlapping zones
- [ ] Drag to create zones
- [ ] Zone stacking order

---

## Technical Decisions Log

### Decision 1: ModalDialog vs Custom Overlay for Picker
**Chosen:** ModalDialog  
**Rationale:** Start simple, proper modal handling, fast to implement  
**Trade-off:** Limited size, no multi-monitor selector initially  
**Future:** Can upgrade to window later (Phase 3)

### Decision 2: Full-Screen Editor vs Dialog
**Chosen:** Full-screen overlay  
**Rationale:** Matches FancyZones UX, immersive editing experience  
**Implementation:** Custom St.Widget, not ModalDialog (wrong pattern)

### Decision 3: Terminology - Profile vs Layout
**Chosen:** Layout  
**Rationale:** Aligns with FancyZones, clearer intent, industry standard  
**Migration:** Keep ProfileManager class, update UI strings

### Decision 4: Template Storage
**Chosen:** Hardcoded built-in templates initially  
**Rationale:** Simpler, no file I/O, defer custom templates to Phase 2  
**Future:** Add custom template save/load in Phase 2

---

## File Structure (After Sprint 6)

```
extension/
├── extension.js                       (modified - remove old imports)
├── profileManager.js                  (modified - add updateCurrentLayout)
├── templateManager.js                 (NEW - 150 lines)
├── ui/
│   ├── layoutPicker.js               (NEW - 200 lines)
│   ├── zoneEditor.js                 (NEW - 350 lines)
│   ├── confirmDialog.js              (NEW - 30 lines)
│   ├── panelIndicator.js             (modified - use LayoutPicker)
│   ├── profilePicker.js              (KEEP for now - backward compat)
│   ├── notificationManager.js        (KEEP - unchanged)
│   └── zoneOverlay.js                (KEEP - unchanged)
└── utils/
    └── debug.js                       (KEEP - unchanged)

memory/development/
├── fancyzones-implementation-spec.md  (this file)
├── profile-editor-status.md           (updated - mark deprecated)
├── fancy-zones-UI/                    (reference specs)
└── gnome-fancyzones-devspec.md        (reference spec)
```

**Files Deleted:**
- ❌ extension/ui/profileSettings.js
- ❌ extension/ui/profileEditor.js
- ❌ extension/ui/messageDialog.js
- ❌ extension/ui/zoneCanvas.js

---

## Sprint 3 Completion Summary (2024-11-25)

**Status:** ✅ COMPLETE

**Completed Tasks:**
- [x] Created extension/ui/zoneEditor.js (full-screen overlay)
- [x] Click-to-split horizontal (default click)
- [x] Click-to-split vertical (Shift+click)
- [x] Keyboard shortcuts (Esc to cancel, Enter to save)
- [x] Visual polish (blue zones, hover effects, help text)
- [x] Save/Cancel workflow
- [x] Layout validation
- [x] Integrated with LayoutPicker

**Implementation Details:**
- ZoneEditor creates full-screen overlay on primary monitor
- Uses Main.pushModal() for proper modal input handling
- Help text displayed at top with keyboard shortcuts
- Zone actors rendered with semi-transparent blue background
- Hover effects for better UX
- Toolbar at bottom with Save/Cancel buttons
- Zone splitting creates two equal-sized zones (50/50)
- Zone numbers dynamically updated after each split

**Testing Required:**
- Manual testing in VM to verify:
  - Click zone splits horizontally ✓
  - Shift+click zone splits vertically ✓
  - Esc cancels without saving ✓
  - Enter/Save saves layout ✓
  - Zone numbers correct after splits ✓

**Next:** Sprint 4 - Divider dragging interactions

---

## Sprint 4 Completion Summary (2024-11-25)

**Status:** ✅ COMPLETE

**Completed Tasks:**
- [x] Implemented divider detection algorithm (shared edges between adjacent zones)
- [x] Created draggable divider actors (10px wide/tall, semi-transparent white)
- [x] Implemented drag-to-resize functionality (adjusts adjacent zones)
- [x] Added minimum zone size enforcement (10% of screen dimension)
- [x] Hover effects for dividers (highlight on hover)
- [x] Proper cleanup of dividers when zones refresh
- [x] Updated help text with divider instructions

**Implementation Details:**
- **Divider Detection**: Algorithm finds shared edges between zones (vertical/horizontal)
- **Tolerance**: 0.001 for floating-point edge matching
- **Visual Design**: 
  - 10px width (vertical) or height (horizontal)
  - Semi-transparent white (30% opacity)
  - Brightens to 70% on hover
  - EW-resize/NS-resize cursors
- **Drag Behavior**:
  - Dragging updates both adjacent zones simultaneously
  - Enforces 10% minimum size constraint
  - Real-time visual feedback during drag
- **Performance**: Dividers recreated after each split/resize for accuracy

**Technical Achievements:**
- Automatic divider detection from zone layout
- Smooth drag interaction with constraint enforcement
- Clean separation between zone actors and divider actors
- Proper event handling (button-press/motion/release)

**Testing Verified:**
- Dividers appear between adjacent zones ✓
- Drag dividers to resize zones ✓
- Minimum size enforced (can't shrink below 10%) ✓
- Dividers update after zone splits ✓
- Hover effects work correctly ✓

**Next:** Sprint 5 - Merge & Validation (optional enhancements)

---

**Version:** 1.2  
**Last Updated:** 2024-11-25  
**Status:** Sprint 4 COMPLETE - Core grid editor fully functional  
**Next Update:** Optional Sprint 5 for advanced features
