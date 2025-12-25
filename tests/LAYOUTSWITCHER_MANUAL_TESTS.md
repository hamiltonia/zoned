# LayoutSwitcher Manual Test Checklist

**Component:** LayoutSwitcher UI  
**Last Updated:** 2025-11-28  
**Test Environment:** VM (Fedora 42/43 - X11/Wayland)

---

## Overview

This document contains comprehensive manual test flows for the LayoutSwitcher component. Run these tests before any release or major refactoring.

**Test Status Tracking:**
- [ ] = Not tested
- [x] = Passed
- [!] = Failed (note issue)
- [~] = Partial (note what works)

---

## Pre-Test Setup

### Environment Requirements
- [ ] GNOME Shell 45+ installed
- [ ] Zoned extension loaded and enabled
- [ ] At least 2 workspaces configured
- [ ] Terminal open for viewing logs (`make logs`)

### Initial State
```bash
# Reset to clean state
rm -f ~/.config/zoned/layouts.json
make reload

# Verify extension is active
gnome-extensions list | grep zoned
```

---

## Phase A Tests: Critical Functionality

### Test 1: Open/Close LayoutSwitcher
**Purpose:** Verify basic UI display and keyboard shortcuts

**Steps:**
1. [ ] Press `Super+grave` (backtick)
   - Expected: LayoutSwitcher appears centered
   - Expected: Background dimmed, semi-transparent overlay
2. [ ] Verify UI elements visible:
   - [ ] Monitor info (top left)
   - [ ] Templates section with 4 built-in templates
   - [ ] Custom Layouts section header
   - [ ] "Create new layout" button at bottom
3. [ ] Press `ESC`
   - Expected: LayoutSwitcher closes
4. [ ] Click outside dialog area
   - Expected: LayoutSwitcher closes

**Notes:**
- Check console for errors
- Verify proper positioning on multi-monitor setups

---

### Test 2: Keyboard Navigation
**Purpose:** Test arrow key navigation and number key selection

**Steps:**
1. [ ] Open LayoutSwitcher
2. [ ] Press `Right Arrow`
   - Expected: First template card gets white border (focused)
3. [ ] Press `Right Arrow` 3 times
   - Expected: Focus moves right across templates
4. [ ] Press `Down Arrow`
   - Expected: Focus moves down 4 positions (to custom layout row if exists)
5. [ ] Press `Left Arrow`
   - Expected: Focus moves left
6. [ ] Press `Up Arrow`
   - Expected: Focus moves back to template row
7. [ ] Press `1` (number key)
   - Expected: First layout applies immediately
   - Expected: LayoutSwitcher closes
   - Expected: Notification shows "Applied: [template name]"
8. [ ] Reopen, press `2`
   - Expected: Second layout applies
9. [ ] Reopen, navigate with arrows to 3rd card, press `Enter`
   - Expected: That layout applies

**Notes:**
- Focus indicator should be white 3px border
- Active layout should have blue border
- Wrap-around behavior at edges

---

### Test 3: Mouse Hover Effects
**Purpose:** Verify visual feedback on hover

**Steps:**
1. [ ] Open LayoutSwitcher
2. [ ] Hover over template card:
   - Expected: Background lightens (rgba(74, 144, 217, 0.25))
   - Expected: Border changes to #6aa0d9
3. [ ] Move mouse away:
   - Expected: Card returns to normal state
4. [ ] Hover over "Create new layout" button:
   - Expected: Background changes to #4a90d9 (lighter blue)
5. [ ] Move mouse away:
   - Expected: Button returns to #3584e4

**Notes:**
- All interactive elements should have hover feedback

---

### Test 4: Apply Template Layout
**Purpose:** Test template selection and application

**Steps:**
1. [ ] Open LayoutSwitcher
2. [ ] Click "Halves" template card
   - Expected: Template applies immediately
   - Expected: LayoutSwitcher closes
   - Expected: Notification: "Applied: Halves"
3. [ ] Open any windows, snap to zones
   - Expected: Windows position in 2 vertical zones (50/50 split)
4. [ ] Reopen LayoutSwitcher
   - Expected: "Halves" has blue border (active)
5. [ ] Click "Thirds" template
   - Expected: Layout switches to 3 column layout
6. [ ] Test other templates:
   - [ ] Quarters (4 quadrants)
   - [ ] Focus (1 large + 3 small)

**Notes:**
- Templates are read-only
- Each click should apply instantly

---

## Phase B Tests: Create & Edit Flows

### Test 5: Create New Layout from Scratch
**Purpose:** Full workflow from creation to use

**Steps:**
1. [ ] Open LayoutSwitcher
2. [ ] Click "Create new layout" button
   - Expected: LayoutSettingsDialog opens
   - Expected: Title: "New Layout"
   - Expected: Name field empty with hint text
   - Expected: Zone count: "No zones defined"
   - Expected: Save button DISABLED
3. [ ] Type name: "Test Layout"
   - Expected: Name appears in field
   - Expected: Save still DISABLED (no zones yet)
4. [ ] Click "Edit Layout..." button
   - Expected: LayoutSettingsDialog closes
   - Expected: ZoneEditor opens fullscreen
   - Expected: Default 2-zone split visible
5. [ ] In ZoneEditor:
   - [ ] Click left zone to split horizontally
     - Expected: Zone splits into top/bottom
   - [ ] Shift+Click right zone to split vertically
     - Expected: Zone splits into left/right
   - [ ] Drag an edge to resize
     - Expected: Edge moves smoothly, regions update
   - [ ] Hover edge + Ctrl+Click to delete
     - Expected: Edge deletes, regions merge
6. [ ] Press `Enter` in ZoneEditor
   - Expected: Returns to LayoutSettingsDialog
   - Expected: Zone count updated (e.g., "3 zones defined")
   - Expected: Save button now ENABLED
7. [ ] Click "Save"
   - Expected: LayoutSettingsDialog closes
   - Expected: Returns to LayoutSwitcher
   - Expected: New layout appears in Custom Layouts section
   - Expected: New layout is active (blue border)
8. [ ] Close and reopen LayoutSwitcher
   - Expected: Layout still appears
   - Expected: Still active

**Notes:**
- Critical flow - test thoroughly
- Check console for errors at each step

---

### Test 6: Edit Existing Custom Layout
**Purpose:** Test metadata and geometry editing

**Steps:**
1. [ ] Create a custom layout (use Test 5)
2. [ ] Open LayoutSwitcher
3. [ ] Hover over custom layout card
   - Expected: Edit button (✏) appears in top-right corner
4. [ ] Click edit button (not the card itself!)
   - Expected: LayoutSettingsDialog opens
   - Expected: Title: "Edit Layout: [name]"
   - Expected: Name field pre-filled
   - Expected: Zone count shows existing zones
5. [ ] Change name to "Test Layout Renamed"
6. [ ] Click "Save" (without editing zones)
   - Expected: Returns to LayoutSwitcher
   - Expected: Card shows new name
7. [ ] Click edit again
8. [ ] Click "Edit Layout..."
   - Expected: ZoneEditor opens with existing zones
9. [ ] Make changes in ZoneEditor, save
   - Expected: Returns to LayoutSettingsDialog
   - Expected: Zone count updates
10. [ ] Save LayoutSettingsDialog
    - Expected: Changes persist

**Notes:**
- Ensure edit button doesn't trigger layout switch
- Name changes should be immediate

---

### Test 7: Delete Custom Layout
**Purpose:** Test deletion with confirmation

**Steps:**
1. [ ] Create a custom layout
2. [ ] Open LayoutSwitcher, click edit
3. [ ] In LayoutSettingsDialog, click "Delete" button
   - Expected: Confirmation dialog appears
   - Expected: Message: "Are you sure you want to delete..."
4. [ ] Click "Cancel"
   - Expected: Confirmation closes
   - Expected: Returns to LayoutSettingsDialog
   - Expected: Layout still exists
5. [ ] Click "Delete" again
6. [ ] Click "Delete" in confirmation
   - Expected: Layout deleted
   - Expected: Returns to LayoutSwitcher
   - Expected: Layout removed from grid
7. [ ] If deleted layout was active:
   - Expected: Falls back to template or another layout
8. [ ] Close and reopen
   - Expected: Layout stays deleted

**Notes:**
- Last layout cannot be deleted (verify this edge case)
- Deletion is permanent - no undo

---

### Test 8: Cancel Workflows
**Purpose:** Test ESC at every dialog level

**Steps:**
1. [ ] Open LayoutSwitcher → press ESC
   - Expected: Closes to desktop
2. [ ] Open → Create new → press ESC in LayoutSettingsDialog
   - Expected: Returns to LayoutSwitcher
   - Expected: No layout created
3. [ ] Open → Create new → Edit Layout → press ESC in ZoneEditor
   - Expected: Returns to LayoutSettingsDialog
   - Expected: No changes saved
4. [ ] Continue: press ESC in LayoutSettingsDialog
   - Expected: Returns to LayoutSwitcher
5. [ ] Continue: press ESC
   - Expected: Closes to desktop

**Notes:**
- ESC should always go "back" one level
- Never leave orphaned dialogs

---

## Phase C Tests: Workspace Mode

### Test 9: Per-Workspace Layouts
**Purpose:** Test workspace-specific layout switching

**Prerequisite:**
```bash
# Enable workspace mode via settings or:
gsettings set org.gnome.shell.extensions.zoned use-per-workspace-layouts true
```

**Steps:**
1. [ ] Switch to workspace 1 (GNOME workspace switcher)
2. [ ] Open LayoutSwitcher
   - Expected: Workspace selector visible at top-right
   - Expected: "Workspace: 1 2 3 4" buttons
   - Expected: Button "1" highlighted
3. [ ] Click "Halves" template
   - Expected: Applied to workspace 1
4. [ ] Switch to workspace 2 (using GNOME)
5. [ ] Open LayoutSwitcher
   - Expected: Button "2" highlighted
   - Expected: Different layout may be active
6. [ ] Click "Thirds" template
   - Expected: Applied to workspace 2 only
7. [ ] Switch back to workspace 1
8. [ ] Open LayoutSwitcher
   - Expected: "Halves" still active on workspace 1
9. [ ] In LayoutSwitcher, click workspace "2" button (without switching GNOME workspace)
   - Expected: Button "2" highlighted
   - Expected: "Thirds" shown as active
10. [ ] Apply different layout in switcher
    - Expected: Applies to workspace 2 (even though we're on workspace 1)
11. [ ] Close switcher, switch to workspace 2 with GNOME
    - Expected: New layout is active

**Notes:**
- Each workspace maintains its own layout
- LayoutSwitcher can preview/edit any workspace
- Actual GNOME workspace switching vs switcher workspace selection

---

### Test 10: Workspace Mode Toggle
**Purpose:** Test switching between global and per-workspace

**Steps:**
1. [ ] Enable workspace mode
2. [ ] Set different layouts on workspaces 1 and 2
3. [ ] Disable workspace mode:
   ```bash
   gsettings set org.gnome.shell.extensions.zoned use-per-workspace-layouts false
   ```
4. [ ] Reload extension: `make reload`
5. [ ] Open LayoutSwitcher
   - Expected: No workspace selector visible
   - Expected: Single global layout active
6. [ ] Apply "Halves" template
7. [ ] Switch between workspaces
   - Expected: Same layout on all workspaces
8. [ ] Re-enable workspace mode
9. [ ] Switch workspaces
   - Expected: Per-workspace layouts restored

**Notes:**
- Settings should persist across extension reload
- Graceful fallback when switching modes

---

## Edge Cases & Error Handling

### Test 11: Empty Custom Layouts
**Purpose:** Test UI with no custom layouts

**Steps:**
1. [ ] Delete all custom layouts (or reset config)
2. [ ] Open LayoutSwitcher
   - Expected: Custom Layouts section shows empty state
   - Expected: Icon 📐 visible
   - Expected: Text: "No custom layouts yet"
   - Expected: Hint: "Create or duplicate a layout to get started"

---

### Test 12: Many Custom Layouts
**Purpose:** Test scrolling with 10+ layouts

**Steps:**
1. [ ] Create 12 custom layouts
2. [ ] Open LayoutSwitcher
   - Expected: Layouts arranged in 4-column grid
   - Expected: Scroll view appears if content overflows
3. [ ] Test scrolling:
   - [ ] Mouse wheel scrolls smoothly
   - [ ] Scrollbar appears/hides on hover
4. [ ] Test keyboard nav with many cards:
   - [ ] Press `9` to select 9th layout
   - [ ] Down arrow navigates through rows

---

### Test 13: Layout with No Name
**Purpose:** Test validation prevents empty names

**Steps:**
1. [ ] Create new layout
2. [ ] Leave name field empty
3. [ ] Click "Edit Layout...", create zones, save ZoneEditor
   - Expected: Returns to LayoutSettingsDialog
   - Expected: Save button DISABLED (no name)
4. [ ] Enter name, click Save
   - Expected: Now saves successfully

---

### Test 14: Monitor Resolution Change
**Purpose:** Test UI adapts to resolution changes

**Steps:**
1. [ ] Note current resolution
2. [ ] Open LayoutSwitcher
   - Expected: Dialog sized to 70% width, 80% height
3. [ ] Close switcher
4. [ ] Change VM window size or display settings
5. [ ] Reopen LayoutSwitcher
   - Expected: Dialog re-scales to new resolution
   - Expected: Monitor info shows updated resolution

---

## Performance Tests

### Test 15: UI Responsiveness
**Purpose:** Verify smooth interactions

**Steps:**
1. [ ] Open LayoutSwitcher
   - Expected: Appears within 200ms
2. [ ] Hover over cards rapidly
   - Expected: Hover effects instant, no lag
3. [ ] Navigate with arrow keys quickly
   - Expected: Focus indicator updates smoothly
4. [ ] Apply layout
   - Expected: Dialog closes immediately
   - Expected: Layout applies within 100ms

---

### Test 16: Memory Leaks
**Purpose:** Test for resource cleanup

**Steps:**
1. [ ] Note baseline memory: `gnome-shell --version && top`
2. [ ] Open/close LayoutSwitcher 20 times rapidly
3. [ ] Check memory usage
   - Expected: No significant increase
4. [ ] Check console for warnings
   - Expected: No "st-widget destroyed multiple times" warnings

---

## Regression Tests

### Test 17: Panel Indicator Integration
**Purpose:** Verify LayoutSwitcher works from panel menu

**Steps:**
1. [ ] Click Zoned panel indicator (top bar)
2. [ ] Click "Layouts" menu item
   - Expected: LayoutSwitcher opens
   - Expected: Same functionality as Super+grave
3. [ ] Test keyboard shortcuts work
   - Expected: Arrow keys, Enter, ESC all work
   - Expected: Number keys work

**Notes:**
- Previously there was a bug where keyboard grabbing from PopupMenu prevented keys from reaching LayoutSwitcher
- This was fixed by closing the menu before showing switcher

---

### Test 18: Multiple Rapid Opens
**Purpose:** Test dialog state cleanup

**Steps:**
1. [ ] Press Super+grave to open
2. [ ] Immediately press Super+grave again
   - Expected: Dialog closes (toggle behavior)
3. [ ] Press Super+grave twice rapidly
   - Expected: Opens then closes smoothly, no crash
4. [ ] Open, start creating layout, press Super+grave
   - Expected: LayoutSettingsDialog closes properly
   - Expected: No dialogs left orphaned

---

## Known Issues Checklist

Document any known issues found during testing:

### Phase A - Critical
- [ ] Duplicate code removed successfully
- [ ] Keyboard navigation works in all scenarios
- [ ] Hover states don't interfere with active states

### Phase B - Polish
- [ ] _refreshDialog() scroll position preserved
- [ ] Edit template creates duplicate → opens editor
- [ ] Active layout indication clear

### Phase C - Features
- [ ] Delete layout accessible and working
- [ ] Duplicate layout feature implemented
- [ ] Edit flows complete

---

## Test Report Template

After completing tests, fill out:

**Test Date:** ____________  
**Tester:** ____________  
**Environment:** Fedora XX, GNOME Shell X.X, Wayland/X11  
**Extension Version:** ____________

**Summary:**
- Total Tests: 18
- Passed: ___
- Failed: ___
- Partial: ___

**Critical Issues Found:**
1. 
2. 
3. 

**Minor Issues Found:**
1. 
2. 
3. 

**Recommendations:**
- 
- 
- 

---

## Continuous Testing Notes

Add notes as you test repeatedly:

### 2025-11-28 - Initial Checklist Creation
- Phase A changes deployed
- Keyboard navigation implemented
- Hover states added
- Duplicate code removed

### [Next Test Date]
- 
- 
-
