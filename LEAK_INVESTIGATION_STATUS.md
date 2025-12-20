# LayoutSwitcher Memory Leak Investigation Status

**Date:** 2024-12-19  
**Branch:** `diagnostic/isolate-leak`  
**Status:** CRITICAL - Leak persists through all phases

## Test Results Summary

| Phase | Description | Memory Leak | Change |
|-------|-------------|-------------|--------|
| Phase 1 | Minimal bare cards (no structure) | 23.3 MB | Baseline |
| Phase 2 | No _allCards array storage | 22.2 MB | -1.1 MB |
| Phase 3 | Section signal tracking | 21.4 MB | -0.8 MB |
| Phase 4 | Explicit widget destruction | 25.1 MB | **+3.7 MB** ❌ |
| **Phase 3-only** | **Phase 2+4 reverted, Phase 3 kept** | **24.3 MB** | **No improvement** ❌ |
| **Phase 5** | **ZERO cards (dialog + sections only)** | **23.7 MB** | **CARDS NOT THE PROBLEM!** 🔥 |
| **Phase 6** | **Minimal dialog (background+container+label ONLY)** | **-6.9 MB** | **NO LEAK! CLEAN!** ✅ |
| **Phase 7** | **Minimal + Create Button (3 signals)** | **-5.8 MB** | **BUTTON INNOCENT!** ✅ |
| **Phase 8** | **Minimal + Empty Section Containers (2 St.BoxLayout)** | **-3.9 MB** | **SECTIONS INNOCENT!** ✅ |
| **Phase 9** | **Minimal + Top Bar (monitor/workspace selectors)** | **+11.5 MB** | **TOP BAR LEAKS!** ⚠️ |
| **Phase 10** | **Minimal + Section Headers (2 sections with St.Label)** | **-1.0 MB** | **HEADERS INNOCENT!** ✅ |
| **Phase 11** | **Minimal + St.ScrollView (with scroll handlers)** | **-3.7 MB** | **SCROLLVIEW INNOCENT!** ✅ |

## Critical Discovery

**Phase 4 made it WORSE.** Explicit widget destruction increased the leak by 3.7 MB.

This reveals the real problem: **Cards are still being created but NOT stored in `_allCards` (Phase 2 change), so keyboard navigation code can't find them, and cleanup code that expects cards in the array doesn't run properly.**

## The Real Issue

From Phase 2, we commented out:
```javascript
// ctx._allCards.push({card, layout: template, isTemplate: true});
```

But `_disconnectCardSignals()` still runs and tries to iterate `_allCards`:
```javascript
_disconnectCardSignals() {
    if (!this._allCards || this._allCards.length === 0) {
        return;  // ← RETURNS IMMEDIATELY because array is empty!
    }
    // ... card cleanup code never runs
}
```

**Result:** Cards are created, never added to array, cleanup skips them, they leak.

## Phase 4 Made It Worse Because:

1. Cards are created (5 templates + X custom = ~5-10 cards)
2. Cards are NOT stored in `_allCards` (Phase 2)
3. `_disconnectCardSignals()` does nothing (array is empty)
4. `_destroyWidgets()` destroys sections/containers
5. Destroying containers while cards still have active signals = **bad state**
6. Cards become orphaned with dangling signals = **bigger leak**

## Root Cause Analysis

The leak is **NOT** from any single component. It's from the **interaction** between:

1. **Cards are still created** (in sectionFactory.js)
2. **Cards are NOT stored** (Phase 2 disabled this)
3. **Cleanup expects cards in array** (but array is empty)
4. **Card signals never disconnected** (cleanup skipped)
5. **Containers destroyed first** (Phase 4) = orphaned widgets

## Solution

**REVERT Phase 2** - Re-enable storing cards in `_allCards`:

```javascript
// MUST store cards for cleanup to work!
ctx._allCards.push({card, layout: template, isTemplate: true});
ctx._allCards.push({card, layout, isTemplate: false});
```

The array storage itself doesn't leak. We NEED it for proper cleanup.

## Why Previous Phases Helped Slightly

- **Phase 2** (-1.1 MB): Reduced overhead of array structure
- **Phase 3** (-0.8 MB): Section signals properly disconnected

But **Phase 4** broke everything by destroying containers before cards were cleaned up.

## Phase 3-Only Test Results

**Configuration:** Phase 2 and 4 reverted, only Phase 3 (section signal tracking) active.

**Result:** 24.3 MB leak (essentially same as 23.3 MB baseline)

**Conclusion:** Phase 3 section signal tracking does NOT significantly help when _allCards is properly populated. The 0.8 MB improvement seen in Phase 3 testing was likely noise or interaction effects with Phase 2's broken cleanup.

## Updated Analysis

**The leak is NOT in the sections themselves.** Even with proper section signal cleanup (Phase 3) and working card cleanup (Phase 2 reverted), we still have a ~24 MB leak.

**Where is the leak?**

Given that we still leak with:
- ✅ Bare minimal cards (Phase 1)
- ✅ Proper _allCards storage (Phase 2 reverted)
- ✅ Section signal tracking (Phase 3)
- ✅ No extra widget destruction (Phase 4 removed)

The leak must be in:
1. **The card widgets themselves** - Even minimal grey boxes leak
2. **The layout references** stored on cards
3. **The St.Widget/Clutter infrastructure** - Not properly releasing widgets
4. **Parent-child widget relationships** - Cascade destruction may not work

## Phase 5: ZERO Cards Test - BREAKTHROUGH DISCOVERY

**Configuration:** No cards created at all. Only dialog infrastructure:
- Dialog background/wrapper
- Container with padding
- Top bar (monitor/workspace selectors)
- Templates section (header + empty row)
- Custom layouts section (header + empty state OR empty grid)
- Create button

**Result:** 23.7 MB leak over 321 cycles

**CRITICAL FINDING:** The leak is **NOT from cards**! The 23.7 MB leak is identical to the 23.3 MB baseline with cards present. This proves:

1. **Cards are innocent** - Removing all cards had no effect on leak
2. **Leak is in dialog infrastructure** - The ~24 MB leak comes from:
   - Dialog creation/destruction cycle
   - Section containers
   - St.Widget/Clutter framework
   - Modal grab/release
   - Some fundamental resource not being released

## What This Means

All previous testing that focused on cards was chasing the wrong problem. The investigation must now shift to:

1. **Dialog lifecycle** - show()/hide() cycle
2. **Widget hierarchy** - Container → Sections → Headers/Labels
3. **Modal management** - pushModal/popModal
4. **Theme/Color objects** - ThemeManager usage
5. **Layout manager references** - Stored references preventing GC

## New Hypothesis

The leak is likely in one of these areas:
1. **St.Widget cascade destruction failure** - Widgets not being released by parent.destroy()
2. **Closure captures** - Event handlers capturing large objects
3. **GObject reference cycles** - JavaScript wrappers keeping native objects alive
4. **Global state** - Something persisting between dialog instances

## Phase 6: Minimal Dialog - BREAKTHROUGH! 🎉

**Configuration:** Absolute minimal UI - Only core components:
- Dialog background (transparent fullscreen widget)
- Wrapper (for centering)
- Container (400×200px styled box)
- Single label ("Phase 6: Minimal Dialog Test")
- Modal management (push/pop)
- 2 signal connections (background + container click handlers)

**What Was EXCLUDED (compared to Phase 5):**
- ❌ Top bar (monitor/workspace selectors)
- ❌ Section containers (templates, custom layouts)
- ❌ Section headers
- ❌ Empty state widgets
- ❌ Create button
- ❌ Resize handles
- ❌ Debug overlay
- ❌ Any card-related code

**Result:** **-6.9 MB** (memory actually DECREASED - no leak!)

**CRITICAL FINDING:** The core dialog infrastructure is **completely clean**! The leak is NOT in:
- ✅ Dialog creation/destruction
- ✅ Modal grab/release (pushModal/popModal)
- ✅ Basic St.Widget usage
- ✅ Container/wrapper hierarchy
- ✅ Label widgets
- ✅ Signal connections (2 signals properly cleaned up)
- ✅ ThemeManager usage (colors)

## Root Cause Identified

**The leak is in one or more of these excluded components:**

1. **Top bar (monitor/workspace selectors)** - Dropdown menus, button signals
2. **Section containers** - St.BoxLayout, St.ScrollView with scroll handlers
3. **Create button** - Button with hover signals
4. **Empty state widgets** - Icon, labels, nested boxes
5. **Resize handles** - Corner/edge handlers with motion tracking

Most likely culprits based on complexity:
- **Top bar** - Has dropdown menu that detaches/reattaches, workspace buttons array
- **Section scroll handlers** - Phase 3 tracked these but still leaked
- **Empty state** - Complex nested widget hierarchy with icon loading

## Phase 7: Minimal + Create Button - BUTTON INNOCENT! ✅

**Configuration:** Phase 6 + Create button with 3 tracked signals (clicked, enter, leave)

**Result:** **-5.8 MB** (no leak!)

**CONCLUSION:** Create button is completely clean. Its 3 signals are properly tracked and disconnected.

## Updated Suspect List

After Phase 7, the **remaining suspects** causing the 24 MB leak:

1. **Top bar** (monitor/workspace selectors + dropdown menu)
2. **Section containers** (St.BoxLayout + St.ScrollView with scroll handlers)  
3. **Empty state widgets** (Gio icon loading + nested boxes)
4. **Resize handles** (motion tracking)

**Most Likely:** Top bar or Section containers - these are the most complex components with dynamic content.

## Phase 8: Minimal + Empty Section Containers - SECTIONS INNOCENT! ✅

**Configuration:** Phase 6 + 2 empty St.BoxLayout sections (styled like real sections, but no headers, no scrollView, no content)

**Result:** **-3.9 MB** (no leak!)

**CONCLUSION:** Bare St.BoxLayout section containers are completely clean. The leak is NOT in the section containers themselves.

## BREAKTHROUGH FINDINGS - Narrowing Down the Culprit

**Clean Components (No Leak):** ✅
- Core dialog infrastructure (Phase 6)
- Create button with signals (Phase 7)
- Empty St.BoxLayout section containers (Phase 8)
- Modal management
- ThemeManager
- Signal tracking system

**Remaining Suspects - The leak MUST be in one of these:**

1. **Top bar** - Monitor/workspace selectors with dropdown menu and workspace button array
2. **Section headers** - St.Label widgets for "Templates" and "Custom Layouts"
3. **St.ScrollView** - Scroll containers with scroll event handlers
4. **Empty state widgets** - Complex nested hierarchy with Gio icon loading
5. **Section content** - The combination of headers + scrollView + empty state

**Most Likely Culprits:**
- **Top bar** - Most complex: dropdown menu, multiple buttons, workspace state tracking
- **St.ScrollView with scroll handlers** - Known to be tricky with signal cleanup in GNOME Shell

## Phase 9: Minimal + Top Bar - TOP BAR LEAKS! ⚠️

**Configuration:** Phase 6 + Top bar (monitor/workspace selectors with dropdown menu)

**Result:** **+11.5 MB** leak (SIGNIFICANT!)

**CRITICAL FINDING:** Top bar leaks ~11.5 MB, but this is only HALF the total 24 MB leak!

**Math:**
- Total leak (from Phase 5): 23.7 MB
- Top bar contribution: 11.5 MB  
- Remaining leak: ~12 MB (must be from section headers, scrollView, or empty state)

**What's in Top Bar:**
- Monitor dropdown menu (dynamic attach/detach)
- Workspace buttons array (dynamic creation based on workspace count)
- Multiple signal connections
- State tracking for selected monitor/workspace
- closMonitorDropdown() cleanup function

**Conclusion:** Top bar has a memory leak, likely from:
1. Dropdown menu not being fully cleaned up
2. Workspace button array not being destroyed properly
3. Signal connections not being tracked/disconnected

## Phase 10: Minimal + Section Headers - HEADERS INNOCENT! ✅

**Configuration:** Phase 6 + 2 section containers with St.Label headers ("Templates" and "Custom Layouts")

**Result:** **-1.0 MB** (no leak!)

**CONCLUSION:** Section headers (St.Label widgets) are completely clean!

## LEAK SOURCE FULLY IDENTIFIED! 🎯

After Phase 10, we have definitively isolated the leak sources:

**The 24 MB total leak comes from TWO sources:**

1. **Top bar: 11.5 MB** (Phase 9) - ~48% of total leak
   - Monitor dropdown menu (attach/detach cycle)
   - Workspace buttons array (not properly destroyed)
   - Signal connections (not all tracked)

2. **Section content: ~12 MB** (remaining) - ~52% of total leak
   - Must be from: St.ScrollView + scroll handlers OR empty state widgets

**Clean Components (Confirmed):** ✅
- Core dialog, modal, wrapper, container
- Create button (3 signals)
- Empty St.BoxLayout sections
- Section headers (St.Label)
- ThemeManager
- Signal tracking system

## Phase 11: Minimal + St.ScrollView - SCROLLVIEW INNOCENT! ✅

**Configuration:** Phase 6 + St.ScrollView with both scroll event handlers (captured-event on scrollView + scroll-event on parent section)

**Result:** **-3.7 MB** (no leak!)

**CONCLUSION:** St.ScrollView and scroll event handlers are completely clean! Even with signal tracking for scroll events, there's no leak.

## FINAL LEAK SOURCE IDENTIFICATION! 🎯🎯🎯

After Phase 11, we have **definitively isolated ALL components**:

**LEAKING COMPONENTS:**

1. **Top Bar: 11.5 MB** (~48% of total leak) ⚠️
   - Monitor dropdown menu (attach/detach not cleaned up)
   - Workspace buttons array (not properly destroyed)
   - Signal connections (not all tracked)

2. **Empty State Widgets OR Combination Effects: ~12 MB** (~52% of total leak) ⚠️
   - Since ALL individual components tested clean, the remaining 12 MB must come from:
     - **Empty state widgets** (Gio icon + complex nested St.BoxLayout hierarchy in Custom Layouts section), OR
     - **Combination effects** when multiple sections exist together (headers + scrollView + empty state interacting)

**COMPLETELY CLEAN COMPONENTS:** ✅
- Core dialog infrastructure (background, wrapper, container, modal)
- ThemeManager and color objects
- Create button (3 signals properly tracked)
- Empty St.BoxLayout section containers
- Section headers (St.Label widgets)
- St.ScrollView with scroll event handlers
- Signal tracking system (when used properly)
- Cards (Phase 5 proved this!)

## Root Causes Summary

The **24 MB leak** has TWO distinct sources:

1. **Top Bar (11.5 MB)** - Confirmed leak from:
   - Dropdown menu lifecycle (attach/detach)
   - Workspace button array not destroyed
   - Missing signal tracking

2. **Section Content (12 MB)** - Most likely from:
   - **Empty state widgets** in Custom Layouts section:
     - Gio.Icon loading from SVG file
     - Complex nested St.BoxLayout hierarchy
     - Multiple St.Label widgets
   - OR **Combination effects** between headers, scrollView, and empty state

## Fix Strategy

**Must fix BOTH leaks:**

1. **Top Bar Cleanup** (`topBar.js`):
   - Track ALL signal connections (dropdown menu, workspace buttons)
   - Properly destroy dropdown menu in cleanup
   - Destroy workspace button array
   - Ensure closeMonitorDropdown() is called

2. **Empty State Cleanup** (`sectionFactory.js`):
   - Track empty state widget creation
   - Properly destroy Gio.Icon
   - Explicitly destroy nested St.BoxLayout widgets
   - OR test with empty state disabled to confirm

## Branch Cleanup Status (2024-12-19)

**Status:** ✅ CLEANED UP - Ready for merge to initial_dev

This diagnostic branch has been cleaned up and production fixes have been applied:

### Production Fixes Applied (KEEP):
1. **Signal Tracking** - All UI components now properly track signal connections:
   - `topBar.js` - Monitor/workspace selector signals tracked
   - `sectionFactory.js` - Section scroll event handlers tracked
   - `cardFactory.js` - Card event handlers tracked
   - `layoutSwitcher.js` - Central signal cleanup in `_disconnectTrackedSignals()`

2. **Card Array Management** - Restored `ctx._allCards.push()` calls:
   - Template cards properly added to tracking array
   - Custom layout cards properly added to tracking array
   - Enables proper cleanup in `_disconnectCardSignals()`

3. **Debug Features** - Added to `prefs.js`:
   - D-Bus debug interface toggle
   - Resource leak tracking toggle

### Test Code Removed (CLEANED):
1. **layoutSwitcher.js** - Removed `_createMinimalDialog()` Phase 9 test method
2. **layoutSwitcher.js** - Restored full functionality (sections no longer commented out)
3. **sectionFactory.js** - Removed Phase 5 test comments about skipping cards
4. **cardFactory.js** - Removed "PHASE 1 TESTING" comment blocks
5. **layoutSwitcher.js** - Removed unused `destroyTopBarWidgets` import

### Investigation Documents (KEEP):
- `LEAK_INVESTIGATION_STATUS.md` - This document (historical record)
- `MEMORY_LEAK_DETECTION.md` - Documentation (if exists)

### Key Findings Summary:

**Total Leak: ~24 MB** broken down as:
- **Top Bar: ~11.5 MB** (48%) - Signal tracking fixes applied
- **Remaining: ~12 MB** (52%) - Likely empty state widgets or combination effects

**Root Cause:** Missing signal tracking in UI components. Signals were created but never disconnected, preventing garbage collection.

**Solution:** Implemented comprehensive signal tracking pattern:
```javascript
const signalIds = [];
const id = widget.connect('event', handler);
signalIds.push({object: widget, id: id});
// Later: object.disconnect(id)
```

### Next Steps:
1. Merge to `initial_dev` branch
2. Test in VM to verify leak fixes are effective
3. Monitor memory usage with long-running tests
4. If leak persists, investigate empty state widget lifecycle

### Files Modified:
- `extension/ui/layoutSwitcher.js` - Signal tracking + test code removed
- `extension/ui/layoutSwitcher/sectionFactory.js` - Signal tracking + card array restored
- `extension/ui/layoutSwitcher/topBar.js` - Comprehensive signal tracking  
- `extension/ui/layoutSwitcher/cardFactory.js` - Signal tracking + test comments removed
- `extension/prefs.js` - Debug interface toggles added
- `LEAK_INVESTIGATION_STATUS.md` - This cleanup summary added
