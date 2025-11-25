# Profile Editor - Technical Specification

**Created:** 2025-11-24  
**Status:** Planning Complete - Ready for Implementation

## Overview

The Profile Editor is a comprehensive visual editing system for creating and modifying window layout profiles. Users can split zones, adjust sizes, and customize layouts interactively with both visual and keyboard-based controls.

## Design Principles

1. **100% Canvas Coverage** - Impossible to create gaps or empty areas
2. **Zone-Based Splitting** - Zones created by splitting existing zones with dividers
3. **Flat Coordinate Model** - Simple rectangular zones with x/y/w/h (no hierarchy)
4. **Keyboard-Friendly** - Numeric input fields for precise control
5. **Visual Feedback** - Live preview on actual monitor during editing
6. **No Undo/Redo** - Save/Cancel workflow provides sufficient control

## File Structure

```
Extension (read-only templates):
  extension/config/default-profiles.json

User (working copy):
  ~/.config/zoned/profiles.json
  ~/.config/zoned/profiles.json.backup
```

### Profile File Format

```json
{
  "profiles": [
    {
      "id": "halves",
      "name": "Halves",
      "zones": [
        { "name": "Left", "x": 0.0, "y": 0.0, "w": 0.5, "h": 1.0 },
        { "name": "Right", "x": 0.5, "y": 0.0, "w": 0.5, "h": 1.0 }
      ]
    },
    {
      "id": "my-custom-layout-1732489123",
      "name": "My Custom Layout",
      "zones": [...]
    }
  ],
  "profile_order": ["halves", "thirds", "my-custom-layout-1732489123", "quarters"]
}
```

## User Flow

### First-Time Setup

```javascript
// On first run (no user profiles.json exists)
1. Extension detects missing user profiles
2. Copies default-profiles.json → ~/.config/zoned/profiles.json
3. User now has full working copy to edit
```

### Access Points

**Primary: Profile Settings Dialog**
- PanelIndicator menu → "Profile Settings..."
- Shows all profiles in draggable list
- Edit, Duplicate, Delete buttons per profile
- New Profile, Reset All buttons

**Secondary: Quick Edit from ProfilePicker**
- Gear icon on each profile card
- Opens ProfileEditor directly for that profile

### Typical Workflows

**Create New Profile:**
```
1. Open "Profile Settings..."
2. Click [+ New Profile]
3. Editor opens with halves template
4. Split/adjust zones as desired
5. Click [Save]
```

**Edit Existing Profile:**
```
1. Option A: Profile Settings → select profile → [Edit]
2. Option B: ProfilePicker → click gear icon on card
3. Editor opens with profile loaded
4. Modify zones
5. Click [Save] or [Cancel]
```

**Duplicate Profile:**
```
1. Profile Settings → select profile → [Duplicate]
2. Dialog prompts for new name
3. Copy created with ID: "{original-id}-copy"
4. Can edit immediately or later
```

**Reset All to Defaults:**
```
1. Profile Settings → [Reset All to Defaults]
2. Confirmation dialog: "This will replace all profiles with defaults. Continue?"
3. If yes: Backup current profiles.json, re-copy from extension defaults
```

## Component Architecture

### 1. ProfileSettings Dialog

**File:** `extension/ui/profileSettings.js`

```javascript
class ProfileSettings {
    constructor(profileManager, settings, extensionPath)
    
    show()                              // Display settings dialog
    hide()                              // Close dialog
    
    // UI Creation
    _createDialog()                     // Main dialog structure
    _createProfileList()                // Scrollable list of profiles
    _createProfileItem(profile, index)  // Individual list item with drag handle
    
    // Actions
    _onNewProfile()                     // Create new profile from halves template
    _onEditProfile(profileId)           // Open ProfileEditor for profile
    _onDuplicateProfile(profileId)      // Create copy with new name
    _onDeleteProfile(profileId)         // Remove custom profile
    _onResetAll()                       // Restore all defaults (with confirmation)
    
    // Ordering
    _onDragStart(profileId)             // Begin drag operation
    _onDragOver(targetProfileId)        // Update drop target indicator
    _onDrop(sourceId, targetId)         // Reorder profiles
    _saveOrder()                        // Persist new order
    
    // Helpers
    _generateUniqueId()                 // Create ID: "profile-{timestamp}"
    _createBackup()                     // Backup user profiles before destructive ops
}
```

**UI Layout:**

```
┌─────────────────────────────────────────────────────────┐
│ Profile Settings                               [?] [X]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ☰ 1. Halves                    [Edit] [Duplicate]  │ │
│ │    2 zones · Left/Right split                      │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ ☰ 2. Thirds                    [Edit] [Duplicate]  │ │
│ │    3 zones · Equal columns                         │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ ☰ 3. My Coding Layout          [Edit] [Duplicate] 🗑│ │
│ │    Custom · 3 zones                                │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ ☰ 4. Quarters                  [Edit] [Duplicate]  │ │
│ │    4 zones · Grid layout                           │ │
│ │ ...                                                │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ⓘ First 9 profiles can be selected with number keys    │
│                                                         │
│ [Reset All to Defaults]     [+ New Profile]  [Close]    │
└─────────────────────────────────────────────────────────┘
```

### 2. ProfileEditor Dialog

**File:** `extension/ui/profileEditor.js`

```javascript
class ProfileEditor {
    constructor(profile, profileManager, settings, extensionPath)
    
    show()                              // Display editor dialog
    hide()                              // Close and cleanup
    
    // UI Creation
    _createDialog()                     // Main dialog with canvas + sidebar
    _createCanvas()                     // Visual zone preview (ZoneCanvas)
    _createSidebar()                    // Zone list + properties panel
    _createBackgroundOverlay()          // Full-screen zone preview on monitor
    
    // Zone Selection
    _onZoneSelected(zoneIndex)          // Update sidebar when zone clicked
    _updateZoneList()                   // Refresh zone list UI
    _updateProperties()                 // Update property fields for selected zone
    
    // Zone Operations
    _onSplitHorizontal()                // Split selected zone left/right
    _onSplitVertical()                  // Split selected zone top/bottom
    _onDeleteZone()                     // Remove zone, auto-merge with adjacent
    
    // Property Editing
    _onNameChanged(newName)             // Update zone name
    _onPropertyChanged(prop, value)     // Update x/y/w/h (with validation)
    
    // Validation
    _validateProfile()                  // Check all validation rules
    _showValidationErrors(errors)       // Display error messages
    
    // Save/Cancel
    _onSave()                           // Validate and save to user config
    _onCancel()                         // Discard changes, close editor
    
    // Background Overlay
    _updateBackgroundOverlay()          // Sync overlay with current profile state
    _destroyBackgroundOverlay()         // Clean up overlay
}
```

**UI Layout:**

```
┌─────────────────────────────────────────────────────────┐
│ Editing: Halves                                [?] [X]  │
├───────────────────────────┬─────────────────────────────┤
│                           │ Zones (2)                   │
│                           │ ┌─────────────────────────┐ │
│    Visual Canvas          │ │ ● Left Half             │ │
│                           │ │   50.0% × 100%          │ │
│ [Live zone rendering]     │ │   (960px × 1080px)      │ │
│ [Click zone to select]    │ ├─────────────────────────┤ │
│ [Drag dividers to adjust] │ │   Right Half            │ │
│                           │ │   50.0% × 100%          │ │
│                           │ │   (960px × 1080px)      │ │
│                           │ └─────────────────────────┘ │
│                           │                             │
│                           │ Selected: Left Half         │
│                           │ Name: [Left Half        ]   │
│                           │                             │
│                           │ Position & Size:            │
│                           │ X: [0.00] (0px)             │
│                           │ Y: [0.00] (0px)             │
│                           │ W: [0.50] (960px)           │
│                           │ H: [1.00] (1080px)          │
│                           │                             │
│                           │ Actions:                    │
│                           │ [Split Horizontal]          │
│                           │ [Split Vertical]            │
│                           │ [Delete Zone]               │
├───────────────────────────┴─────────────────────────────┤
│ Validation: ✓ No overlaps, ✓ No gaps, ✓ All valid      │
│                             [Cancel]     [Save Changes] │
└─────────────────────────────────────────────────────────┘
```

### 3. ZoneCanvas Component

**File:** `extension/ui/zoneCanvas.js`

```javascript
class ZoneCanvas {
    constructor(width, height)
    
    setZones(zones)                     // Update displayed zones
    setSelectedZone(index)              // Highlight specific zone
    render()                            // Redraw using Cairo
    
    // Interaction Handlers
    _onCanvasClicked(x, y)              // Determine which zone was clicked
    _onDividerDragStart(x, y)           // Check if divider clicked
    _onDividerDrag(delta)               // Adjust zones as divider moves
    _onDividerDragEnd()                 // Finalize divider position
    
    // Rendering
    _drawZones(cr)                      // Draw all zones with fills + borders
    _drawDividers(cr)                   // Draw draggable divider lines
    _drawSelectedHighlight(cr)          // Highlight selected zone
    
    // Divider Detection
    _findDividers()                     // Calculate divider positions from zones
    _findZonesOnSide(divider, side)     // Get zones affected by divider drag
    
    // Helpers
    _getZoneAtPoint(x, y)               // Hit testing
    _getDividerAtPoint(x, y)            // Check if point is on divider
}
```

### 4. ProfileManager Extensions

**File:** `extension/profileManager.js` (extend existing class)

```javascript
class ProfileManager {
    // ... existing methods ...
    
    // First-run Setup
    _userProfilesExist()                // Check if user profiles.json exists
    _copyDefaultsToUser()               // Copy extension defaults to user config
    _loadDefaultsFromExtension()        // Read default-profiles.json
    
    // Save Operations
    saveProfile(profile)                // Write profile to user config
    deleteProfile(profileId)            // Remove from user config
    duplicateProfile(profileId, newName) // Create copy
    _saveUserProfiles(profiles)         // Write profiles.json
    
    // Ordering
    getProfileOrder()                   // Get profile_order array
    setProfileOrder(orderedIds)         // Save new order
    getAllProfilesOrdered()             // Get profiles sorted by order
    
    // Reset
    resetToDefaults()                   // Re-copy extension defaults
    _backupUserProfiles()               // Create .backup file
    
    // Validation
    validateProfileStructure(profile)   // Deep validation (extended)
    _checkOverlaps(zones)               // Detect overlapping zones
    _checkCoverage(zones)               // Verify 100% coverage
}
```

## Zone Data Model (Flat Structure)

### Profile Structure

```javascript
const profile = {
    id: "my-layout",              // Unique identifier
    name: "My Layout",            // Display name
    zones: [                      // Array of rectangular zones
        {
            name: "Left",         // Zone label
            x: 0.0,              // Left edge (0.0-1.0)
            y: 0.0,              // Top edge (0.0-1.0)
            w: 0.5,              // Width (0.0-1.0)
            h: 1.0               // Height (0.0-1.0)
        },
        // ... more zones
    ]
};
```

### Zone Operations

**Split Horizontal (Left/Right):**

```javascript
splitHorizontal(zoneIndex, splitRatio = 0.5) {
    const zone = this._zones[zoneIndex];
    
    const leftZone = {
        name: `${zone.name}-Left`,
        x: zone.x,
        y: zone.y,
        w: zone.w * splitRatio,
        h: zone.h
    };
    
    const rightZone = {
        name: `${zone.name}-Right`,
        x: zone.x + zone.w * splitRatio,
        y: zone.y,
        w: zone.w * (1 - splitRatio),
        h: zone.h
    };
    
    // Replace original with two new zones
    this._zones.splice(zoneIndex, 1, leftZone, rightZone);
    
    return [zoneIndex, zoneIndex + 1]; // Indices of new zones
}
```

**Split Vertical (Top/Bottom):**

```javascript
splitVertical(zoneIndex, splitRatio = 0.5) {
    const zone = this._zones[zoneIndex];
    
    const topZone = {
        name: `${zone.name}-Top`,
        x: zone.x,
        y: zone.y,
        w: zone.w,
        h: zone.h * splitRatio
    };
    
    const bottomZone = {
        name: `${zone.name}-Bottom`,
        x: zone.x,
        y: zone.y + zone.h * splitRatio,
        w: zone.w,
        h: zone.h * (1 - splitRatio)
    };
    
    this._zones.splice(zoneIndex, 1, topZone, bottomZone);
    
    return [zoneIndex, zoneIndex + 1];
}
```

**Delete Zone (Auto-merge):**

```javascript
deleteZone(zoneIndex) {
    if (this._zones.length <= 2) {
        // Can't delete if only 2 zones (minimum for useful profile)
        return false;
    }
    
    const zone = this._zones[zoneIndex];
    
    // Find adjacent zone (priority: left, right, top, bottom)
    const adjacent = this._findAdjacentZone(zone);
    
    if (!adjacent) {
        return false; // Should never happen with proper validation
    }
    
    // Expand adjacent zone to absorb deleted zone's space
    this._expandZoneToAbsorb(adjacent.index, zone);
    
    // Remove deleted zone
    this._zones.splice(zoneIndex, 1);
    
    return true;
}

_findAdjacentZone(zone) {
    // Check left (shares right edge)
    let adjacent = this._zones.findIndex(z => 
        Math.abs((z.x + z.w) - zone.x) < 0.001 &&  // Right edge matches left edge
        z.y === zone.y && z.h === zone.h            // Same vertical position
    );
    if (adjacent >= 0) return { index: adjacent, direction: 'left' };
    
    // Check right (shares left edge)
    adjacent = this._zones.findIndex(z => 
        Math.abs(z.x - (zone.x + zone.w)) < 0.001 &&
        z.y === zone.y && z.h === zone.h
    );
    if (adjacent >= 0) return { index: adjacent, direction: 'right' };
    
    // Check top (shares bottom edge)
    adjacent = this._zones.findIndex(z => 
        Math.abs((z.y + z.h) - zone.y) < 0.001 &&
        z.x === zone.x && z.w === zone.w
    );
    if (adjacent >= 0) return { index: adjacent, direction: 'top' };
    
    // Check bottom (shares top edge)
    adjacent = this._zones.findIndex(z => 
        Math.abs(z.y - (zone.y + zone.h)) < 0.001 &&
        z.x === zone.x && z.w === zone.w
    );
    if (adjacent >= 0) return { index: adjacent, direction: 'bottom' };
    
    return null;
}

_expandZoneToAbsorb(adjacentIndex, deletedZone) {
    const adjacent = this._zones[adjacentIndex];
    const direction = this._findAdjacentZone(deletedZone).direction;
    
    if (direction === 'left') {
        // Adjacent is to the left, expands right
        adjacent.w += deletedZone.w;
    } else if (direction === 'right') {
        // Adjacent is to the right, expands left
        adjacent.x = deletedZone.x;
        adjacent.w += deletedZone.w;
    } else if (direction === 'top') {
        // Adjacent is above, expands down
        adjacent.h += deletedZone.h;
    } else if (direction === 'bottom') {
        // Adjacent is below, expands up
        adjacent.y = deletedZone.y;
        adjacent.h += deletedZone.h;
    }
}
```

**Divider Dragging:**

```javascript
// Divider structure (calculated from zones)
const divider = {
    isVertical: true,     // or false for horizontal
    position: 0.5,        // x for vertical, y for horizontal
    span: {               // Range the divider covers
        start: 0.0,       // y-start for vertical, x-start for horizontal
        end: 1.0          // y-end for vertical, x-end for horizontal
    },
    affectedZones: {      // Zones on each side
        before: [0, 2],   // Indices of zones to the left (or above)
        after: [1, 3]     // Indices of zones to the right (or below)
    }
};

onDividerDrag(divider, delta) {
    const newPosition = divider.position + delta;
    
    // Clamp to valid range (ensure zones don't disappear)
    const MIN_ZONE_SIZE = 0.1; // 10% minimum
    // ... calculate valid range ...
    
    // Update zones on "before" side
    divider.affectedZones.before.forEach(idx => {
        const zone = this._zones[idx];
        if (divider.isVertical) {
            zone.w = newPosition - zone.x;
        } else {
            zone.h = newPosition - zone.y;
        }
    });
    
    // Update zones on "after" side
    divider.affectedZones.after.forEach(idx => {
        const zone = this._zones[idx];
        if (divider.isVertical) {
            const oldRight = zone.x + zone.w;
            zone.x = newPosition;
            zone.w = oldRight - newPosition;
        } else {
            const oldBottom = zone.y + zone.h;
            zone.y = newPosition;
            zone.h = oldBottom - newPosition;
        }
    });
    
    divider.position = newPosition;
}
```

## Validation Rules

### Profile Validation

```javascript
validateProfile(profile) {
    const errors = [];
    
    // 1. Structure checks
    if (!profile.id || typeof profile.id !== 'string') {
        errors.push('Profile must have a valid ID');
    }
    if (!profile.name || typeof profile.name !== 'string') {
        errors.push('Profile must have a valid name');
    }
    if (!Array.isArray(profile.zones) || profile.zones.length < 2) {
        errors.push('Profile must have at least 2 zones');
    }
    
    // 2. Zone validation
    profile.zones.forEach((zone, i) => {
        // Check structure
        if (!zone.name || typeof zone.name !== 'string') {
            errors.push(`Zone ${i}: missing name`);
        }
        if (typeof zone.x !== 'number' || typeof zone.y !== 'number' ||
            typeof zone.w !== 'number' || typeof zone.h !== 'number') {
            errors.push(`Zone ${i}: invalid coordinates`);
        }
        
        // Check bounds
        if (zone.x < 0 || zone.x > 1 || zone.y < 0 || zone.y > 1) {
            errors.push(`Zone ${i}: position out of bounds`);
        }
        if (zone.w <= 0 || zone.w > 1 || zone.h <= 0 || zone.h > 1) {
            errors.push(`Zone ${i}: size out of bounds`);
        }
        if (zone.x + zone.w > 1.001 || zone.y + zone.h > 1.001) {
            errors.push(`Zone ${i}: extends beyond canvas`);
        }
    });
    
    // 3. Overlap detection
    const overlaps = this._checkOverlaps(profile.zones);
    if (overlaps.length > 0) {
        overlaps.forEach(([i, j]) => {
            errors.push(`Zones ${i} and ${j} overlap`);
        });
    }
    
    // 4. Coverage check (100%)
    const coverage = this._calculateCoverage(profile.zones);
    if (Math.abs(coverage - 1.0) > 0.01) {
        errors.push(`Coverage is ${(coverage * 100).toFixed(1)}% (should be 100%)`);
    }
    
    return {
        valid: errors.length === 0,
        errors: errors
    };
}

_checkOverlaps(zones) {
    const overlaps = [];
    const EPSILON = 0.001;
    
    for (let i = 0; i < zones.length; i++) {
        for (let j = i + 1; j < zones.length; j++) {
            const a = zones[i];
            const b = zones[j];
            
            // Check if rectangles overlap (not just touch)
            const overlapX = (a.x < b.x + b.w - EPSILON) && (b.x < a.x + a.w - EPSILON);
            const overlapY = (a.y < b.y + b.h - EPSILON) && (b.y < a.y + a.h - EPSILON);
            
            if (overlapX && overlapY) {
                overlaps.push([i, j]);
            }
        }
    }
    
    return overlaps;
}

_calculateCoverage(zones) {
    // Simple approach: sum of all zone areas
    // (Assumes no overlaps - checked separately)
    return zones.reduce((sum, zone) => sum + (zone.w * zone.h), 0);
}
```

### Minimum Zone Size

```javascript
const MIN_ZONE_SIZE = 0.10; // 10% of screen dimension

// Check during operations
if (newWidth < MIN_ZONE_SIZE || newHeight < MIN_ZONE_SIZE) {
    // Reject operation or clamp to minimum
}
```

## Display Format

### Property Fields

Show both percentage and pixels:

```
X: 0.67  (1289px)
Y: 0.00  (0px)
W: 0.33  (634px)
H: 1.00  (1920px)
```

### Zone List

```
● Left Main
  67.0% × 100%
  (1289px × 1920px)

  Right Side
  33.0% × 100%
  (634px × 1920px)
```

Selected zone indicated with ●

## Integration Points

### ProfilePicker Integration

Add gear icon to profile cards:

```javascript
// In ProfilePicker._createProfileCard()

const gearButton = new St.Button({
    style_class: 'profile-gear-button',
    child: new St.Icon({
        icon_name: 'emblem-system-symbolic',
        icon_size: 16
    }),
    reactive: true
});

gearButton.connect('clicked', () => {
    this._onEditProfile(profile.id);
    return Clutter.EVENT_STOP; // Don't select profile
});

// Position gear in top-right corner of card
```

### PanelIndicator Integration

Add menu item:

```javascript
// In PanelIndicator._createMenu()

this._settingsItem = new PopupMenu.PopupMenuItem('Profile Settings...');
this._settingsItem.connect('activate', () => {
    this._profileSettings.show();
});
this.menu.addMenuItem(this._settingsItem);
```

## GSettings Schema Additions

```xml
<!-- Profile ordering -->
<key name="profile-order" type="as">
  <default>[]</default>
  <summary>Custom profile order</summary>
  <description>
    Array of profile IDs in display order. Empty means use natural order.
  </description>
</key>
```

## Implementation Phases

### Phase 1: Foundation
- [ ] Extend ProfileManager with save/delete/reset methods
- [ ] Implement first-run default copying
- [ ] Add profile ordering support
- [ ] Create backup mechanism
- [ ] Update GSettings schema

### Phase 2: Settings Page
- [ ] Create ProfileSettings dialog
- [ ] Profile list UI with drag-and-drop
- [ ] New/Duplicate/Delete/Reset operations
- [ ] Integration with PanelIndicator menu

### Phase 3: Profile Editor Core
- [ ] Create ProfileEditor dialog shell
- [ ] Implement ZoneCanvas with Cairo rendering
- [ ] Zone selection (click to select)
- [ ] Property editing fields with validation
- [ ] Full-screen background overlay

### Phase 4: Zone Manipulation
- [ ] Implement split horizontal/vertical
- [ ] Implement delete with auto-merge
- [ ] Divider detection algorithm
- [ ] Divider dragging with multi-zone resize

### Phase 5: Polish & Testing
- [ ] Add gear icons to ProfilePicker
- [ ] Comprehensive validation with UI feedback
- [ ] Confirmation dialogs for destructive operations
- [ ] Error handling and recovery
- [ ] Testing and bug fixes

## Open Questions / Future Enhancements

1. **Import/Export:** Should we add profile import/export (JSON files)?
2. **Templates:** Pre-built templates beyond "halves" for new profiles?
3. **Snap-to-Grid:** Snap dividers to common percentages (25%, 33%, 50%, etc.)?
4. **Zone Presets:** Quick buttons for common splits (thirds, quarters, etc.)?
5. **Visual Grid:** Overlay grid lines on canvas for alignment?
6. **Keyboard Shortcuts:** Hotkeys for split/delete/save operations in editor?

## Testing Checklist

- [ ] First-run default copying works
- [ ] Profile creation with unique IDs
- [ ] Profile editing saves correctly
- [ ] Profile duplication creates copy
- [ ] Profile deletion removes from config
- [ ] Profile ordering persists across sessions
- [ ] Reset all restores defaults
- [ ] Backup created before destructive ops
- [ ] Split horizontal creates valid zones
- [ ] Split vertical creates valid zones
- [ ] Delete zone auto-merges correctly
- [ ] Divider dragging updates affected zones
- [ ] Validation detects overlaps
- [ ] Validation detects gaps (coverage < 100%)
- [ ] Validation enforces minimum zone size
- [ ] Background overlay updates during editing
- [ ] Gear icons in ProfilePicker open editor
- [ ] Settings menu item opens ProfileSettings
- [ ] Save/Cancel workflow works correctly

---

**Last Updated:** 2025-11-24  
**Next Step:** Begin Phase 1 implementation
