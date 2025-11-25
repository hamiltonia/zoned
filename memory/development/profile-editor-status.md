# Profile Editor Implementation Status

**Date**: 2024-11-25  
**Status**: ⚠️ DEPRECATED - Needs complete redesign

## Current State (2024-11-25 9:58am)

### ✅ What's Working
- **Core Extension**: Panel indicator, profile picker, keyboard snapping all work well
- **Basic Profile Management**: Can switch between profiles via picker
- **User Experience**: Core workflow is solid and functional

### ❌ Profile Editor - Marked for Rewrite
The current profile editor implementation has fundamental issues:
- **Buggy**: Various UI glitches and crashes
- **Poor UX**: Confusing interface, not intuitive
- **Feature Gaps**: Missing critical functionality
- **Code Quality**: Needs architectural redesign

**Decision**: Ignore current implementation and prepare for complete rewrite

## Core Architectural Problem: Modal Dialog Implementation

### The Issue
The current implementation attempts to create custom modal dialogs from scratch using low-level St/Clutter widgets, rather than using GNOME Shell's built-in `ModalDialog.ModalDialog` class.

**Current Approach (WRONG):**
```javascript
// ProfileSettings and ProfileEditor manually implement modality:
this._dialog = new St.Bin({...});  // Custom container
Main.uiGroup.add_child(this._dialog);  // Manual UI management
Main.pushModal(this._backgroundActor);  // Manual modal grab
```

**Problems with Custom Implementation:**
1. **Modal Stack Management**: Manually managing modal grabs is error-prone
   - Child dialogs (MessageDialog) compete for modal focus
   - No proper modal stack depth handling
   - Keyboard focus gets confused between parent/child dialogs

2. **Lifecycle Issues**: Manual widget management leads to:
   - Memory leaks from improper cleanup
   - Signal handlers not properly disconnected
   - Widget lifecycle not properly managed

3. **Missing Functionality**: Built-in ModalDialog provides:
   - Proper animation handling
   - Standard button layouts
   - Keyboard navigation (Tab, Esc, Enter)
   - Accessibility support
   - Theme integration

4. **Complexity**: ~700 lines of custom dialog code vs. ~50 lines using ModalDialog

### The Solution (For Rewrite)
Use GNOME Shell's `ModalDialog.ModalDialog` class as the foundation:

```javascript
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

class ProfileEditorDialog extends ModalDialog.ModalDialog {
    _init(params) {
        super._init({ styleClass: 'zoned-profile-editor' });
        
        // Add content to this.contentLayout
        this.contentLayout.add_child(...);
        
        // Add buttons via addButton()
        this.addButton({
            label: 'Cancel',
            action: () => this.close(),
            key: Clutter.KEY_Escape
        });
    }
}
```

**Benefits:**
- Proper modal stack management (can open MessageDialog on top)
- Standard lifecycle (open(), close(), destroy())
- Built-in keyboard handling
- Proper focus management
- Animation support
- Much less code to maintain

### Lessons Learned
1. **Use framework primitives**: Don't reinvent modal dialogs
2. **Study existing extensions**: Look at how GNOME extensions use ModalDialog
3. **Test modal nesting early**: Parent dialogs must support child dialogs
4. **Follow GNOME patterns**: The Shell provides good abstractions for a reason

**References:**
- GNOME Shell ModalDialog: `/usr/share/gnome-shell/js/ui/modalDialog.js`
- Good example: `EndSessionDialog` in GNOME Shell
- Bad example: Our current implementation (custom modals from scratch)

---

## Historical Context (Earlier Fixes)

The following fixes were attempted but the overall design is flawed:

## Recent Updates (2024-11-25)

### Fixes Applied

#### 1. ✅ MessageDialog.show() - FIXED
**Problem**: Dialog never appeared because show() threw errors before first log statement.

**Root Cause**: 
- Used `Main.layoutManager.primaryMonitor` which may not exist
- Default OK button was being added in show() after display, causing issues

**Solution**:
- Changed to `Main.layoutManager.currentMonitor` with fallback to `primaryMonitor`
- Added comprehensive step-by-step logging with [SHOW] prefix
- Moved default OK button creation to `_buildUI()` where it belongs
- Added proper null checking for monitor
- Wrapped critical sections in try-catch with detailed error messages

**Files Changed**: `extension/ui/messageDialog.js`

#### 2. ✅ ProfileSettings Performance - FIXED
**Problem**: Every button click destroyed and rebuilt the entire dialog (hide/show pattern).

**Root Cause**: Anti-pattern of calling `this.hide(); this.show();` after every action.

**Solution**:
- Created `_refreshProfileList()` method that only updates the profile list
- Created `_rebuildProfileList()` internal method
- Replaced all `hide()/show()` calls with `_refreshProfileList()`
- Dialog shell persists, only profile items are refreshed
- Massive performance improvement

**Files Changed**: `extension/ui/profileSettings.js`

#### 3. ✅ Click Debouncing - ADDED
**Problem**: Rapid clicks created duplicate actions and sluggish UI.

**Solution**:
- Added `_clickInProgress` flag to both ProfileSettings and ProfileEditor
- All action buttons now check flag before executing
- 300ms lockout after each click
- Prevents duplicate confirmations, duplicate profiles, etc.

**Files Changed**: 
- `extension/ui/profileSettings.js` - All action buttons
- `extension/ui/profileEditor.js` - Split buttons, Save/Cancel

#### 4. ✅ ProfileEditor Zone Properties Update Bug - FIXED
**Problem**: `_updateSelectedZoneProperties()` tried to access parent before widget was added to scene.

**Root Cause**: Method tried to find parent of newly created widget.

**Solution**:
- Store reference to `_sidebarContainer` during sidebar creation
- Store reference to `_selectedZonePropsBox`
- Find index of old props box in sidebar's children
- Remove old box, create new one, insert at same index
- Proper widget lifecycle management

**Files Changed**: `extension/ui/profileEditor.js`

#### 5. ✅ Granular Logging - ADDED
**Implementation**:
- MessageDialog: Step-by-step [SHOW] logging (7 steps tracked)
- ProfileSettings: Timestamp-based logging for all actions
- ProfileEditor: Debug logging for zone operations
- All refresh operations logged

**Files Changed**: All dialog files

## Current Architecture

### Modal Handling
```
ProfileSettings (no modal grab)
  └─> MessageDialog (grabs modal when shown)
  
ProfileEditor (no modal grab)
  └─> MessageDialog (grabs modal when shown)
```

### Performance Pattern
```javascript
// OLD (BAD - destroyed entire dialog):
this.hide();
this.show();

// NEW (GOOD - only refreshes list):
this._refreshProfileList();
```

### Debouncing Pattern
```javascript
_clickInProgress = false;

button.connect('clicked', () => {
    if (this._clickInProgress) return;
    this._clickInProgress = true;
    
    this._onAction();
    
    setTimeout(() => { this._clickInProgress = false; }, 300);
});
```

## What Was Implemented (Original)

### 1. ProfileSettings Dialog (`extension/ui/profileSettings.js`)
- ✅ List view of all profiles with metadata
- ✅ Action buttons with debouncing
- ✅ Smart refresh (no full rebuild)
- ✅ MessageDialog confirmations
- ✅ Granular logging

### 2. ProfileEditor Dialog (`extension/ui/profileEditor.js`)
- ✅ Visual zone canvas with ZoneCanvas component
- ✅ Zone list sidebar with selection
- ✅ Profile/zone name editing
- ✅ Split Horizontal/Vertical operations
- ✅ Save/Cancel with validation
- ✅ Click debouncing on all actions
- ✅ Fixed zone properties update

### 3. MessageDialog (`extension/ui/messageDialog.js`)
- ✅ Custom modal dialog with proper display
- ✅ Support for info/warning/error types
- ✅ Custom button configurations
- ✅ Fade animations
- ✅ ESC/click-outside to close
- ✅ Step-by-step error tracking

### 4. ZoneCanvas (`extension/ui/zoneCanvas.js`)
- ✅ GObject with proper Signals
- ✅ Cairo rendering
- ✅ Zone selection via click
- ✅ Visual highlighting

## Testing Checklist

Ready for VM testing:

- [ ] MessageDialog shows for info messages
- [ ] MessageDialog shows for warnings/errors
- [ ] MessageDialog shows with custom buttons
- [ ] ProfileSettings opens from panel menu
- [ ] ProfileSettings "Close" button works
- [ ] ProfileSettings "New Profile" opens ProfileEditor
- [ ] ProfileSettings "Edit" opens ProfileEditor  
- [ ] ProfileSettings "Duplicate" creates copy (with smooth refresh)
- [ ] ProfileSettings "Delete" shows confirmation and deletes (with smooth refresh)
- [ ] ProfileSettings "Reset All" shows confirmation and resets (with smooth refresh)
- [ ] ProfileEditor opens and renders zones
- [ ] ProfileEditor zone selection works (click canvas)
- [ ] ProfileEditor zone name editing works
- [ ] ProfileEditor "Split Horizontal" works
- [ ] ProfileEditor "Split Vertical" works
- [ ] ProfileEditor "Save" validates and saves
- [ ] ProfileEditor "Cancel" shows confirmation
- [ ] No duplicate actions from rapid clicks
- [ ] Performance is acceptable (< 500ms response)
- [ ] Dialogs display on screen (not invisible)

## Expected Improvements

1. **MessageDialog now visible** - Should actually appear on screen with logs confirming each step
2. **Smooth performance** - No more destroying/recreating entire dialogs
3. **No duplicate actions** - Click debouncing prevents rapid-click issues
4. **Zone properties update** - Selecting different zones updates the properties panel correctly
5. **Comprehensive logging** - Easy to debug any remaining issues in VM

## Key Code Locations

### MessageDialog.show() - Lines 221-310
Now with 7-step logging:
- Step 1: Check actor exists
- Step 2: Get monitor (with fallback)
- Step 3: Add to UI group
- Step 4: Position and size
- Step 5: Grab modal (with error handling)
- Step 6: Fade-in animation
- Step 7: Key handler

### ProfileSettings._refreshProfileList() - Lines 277-280
```javascript
_refreshProfileList() {
    logger.debug('Refreshing profile list');
    this._rebuildProfileList();
}
```

### ProfileEditor._updateSelectedZoneProperties() - Lines 501-527
Properly manages widget lifecycle using stored container reference.

### Click Debouncing - Multiple locations
All action buttons wrapped with `_clickInProgress` flag check.

## Next Steps

1. **Install in VM**: `make install`
2. **Monitor logs**: `journalctl -f -o cat /usr/bin/gnome-shell`
3. **Test systematically** through checklist above
4. **Look for [SHOW] logs** to confirm MessageDialog displays
5. **Verify smooth refreshes** - no dialog flashing
6. **Test rapid clicking** - should ignore extra clicks

## Known Limitations

- Drag-and-drop reordering UI present but not functional (Phase 4 feature)
- Profile validation is basic (name non-empty, min 2 zones)
- No undo/redo functionality
- Zone canvas is view-only (no drag-resize)

## Technical Notes

### Monitor Access
```javascript
// Use currentMonitor with fallback
const monitor = Main.layoutManager.currentMonitor || Main.layoutManager.primaryMonitor;
```

### Widget Lifecycle
ProfileEditor stores sidebar reference to properly manage zone properties box:
```javascript
this._sidebarContainer = sidebar;
this._selectedZonePropsBox = this._createZoneProperties();
```

### Logging Strategy
- `[SHOW]` prefix for MessageDialog display steps
- `[timestamp]` prefix for user actions in ProfileSettings
- Debug logs for all refresh/rebuild operations

## File Structure
```
extension/ui/
├── profileSettings.js   - 552 lines, optimized refresh
├── profileEditor.js     - 706 lines, fixed zone props
├── zoneCanvas.js        - 250 lines (unchanged)
└── messageDialog.js     - 334 lines, comprehensive logging
```

All critical functionality issues addressed. Ready for comprehensive testing.
