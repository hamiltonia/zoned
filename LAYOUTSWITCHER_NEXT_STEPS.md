# LayoutSwitcher: Polish, Features & E2E Testing Discussion

**Date:** 2025-11-28  
**Context:** Phase A complete, column cutoff fixed, ready for polish & features  
**Status:** Planning Phase B & C

---

## Current Status: Phase A Complete ✅

### Recent Fixes (Just Completed)
1. ✅ **Column Cutoff Fix** - All 5 columns now fully visible
   - Set `EXTRA_BUFFER = 110px` (user measured via pixel counting)
   - Set `BORDER_WIDTH_TOTAL = 10px` (5 cards × 2px extra per card)
   - Consistent 2px borders on all cards (normal uses transparent)
   - CSS outline for focus (doesn't affect layout)
   
2. ✅ **Keyboard Navigation Layout Shifting Fix**
   - Previously: borders changed from 1px → 2px → 3px causing layout shift
   - Solution: All cards use 2px border (transparent for normal state)
   - Focus indicator uses CSS outline (drawn outside, no layout impact)

3. ✅ **Full Keyboard Navigation**
   - Arrow keys, Enter, ESC, number keys 1-9
   - Visual focus indicator (white outline)
   - Wrap-around navigation

4. ✅ **Hover States & Polish**
   - All interactive elements have hover feedback
   - Duplicate code removed (~100 lines)

### Next Action Required: Testing
**Before proceeding to Phase B/C, we need to verify the latest fix works:**

```bash
# Deploy and test
make install
make reload

# Open LayoutSwitcher
Super+grave

# Verify:
# 1. All 5 columns fully visible (no cutoff on left/right)
# 2. Keyboard selection doesn't cause layout shifting
# 3. Focus indicator (white outline) visible
# 4. Active layout has blue border
```

---

## Phase B: Polish Opportunities

### Priority 1: Visual Refinements

#### 1.1 Active Layout Indication Enhancement
**Current:** Blue 2px border on active layout  
**Issue:** Can be subtle, especially if user has many layouts  
**Options:**
- Add checkmark icon overlay (✓ in top-left corner)
- Add "ACTIVE" label below name
- Add subtle glow effect
- Combination: blue border + checkmark

**Recommendation:** Add checkmark icon - clear, doesn't require reading text

```javascript
// In _createTemplateCard() and _createCustomLayoutCard()
if (isActive) {
    // Add checkmark overlay
    const activeIndicator = new St.Label({
        text: '✓',
        style: 'color: #3584e4; font-size: 24pt; font-weight: bold; ' +
               'background-color: rgba(255,255,255,0.9); ' +
               'border-radius: 50%; ' +
               'width: 32px; height: 32px; ' +
               'text-align: center;',
        x_align: Clutter.ActorAlign.START,
        y_align: Clutter.ActorAlign.START
    });
    container.add_child(activeIndicator);
}
```

#### 1.2 Monitor Info Enhancement
**Current:** Static text "Monitor: Primary"  
**Opportunity:** Show actual monitor number and make it clickable (future multi-monitor support)

```javascript
const monitorIndex = Main.layoutManager.currentMonitor.index;
const monitorCount = Main.layoutManager.monitors.length;

const monitorLabel = new St.Label({
    text: `Monitor ${monitorIndex + 1} of ${monitorCount}`,
    style: 'font-size: 14pt; color: #ffffff; font-weight: bold;'
});
```

#### 1.3 Empty State Polish
**Current:** Adequate but basic  
**Opportunity:** Add quick action button

```javascript
const emptyState = new St.BoxLayout({
    vertical: true,
    style: 'spacing: 16px; padding: 48px; ...'
});

// Add icon, text (existing)
// Add quick action button
const quickCreateButton = new St.Button({
    label: '✚ Create Your First Layout',
    style_class: 'suggested-action',
    style: 'padding: 12px 24px; ...'
});
quickCreateButton.connect('clicked', () => {
    this._onCreateNewLayoutClicked();
});
emptyState.add_child(quickCreateButton);
```

#### 1.4 Card Preview Quality
**Current:** Cairo-rendered zone previews (good)  
**Opportunity:** Add subtle animation on hover

```javascript
card.connect('enter-event', () => {
    // Existing hover state change
    
    // Add subtle scale effect
    preview.ease({
        scale_x: 1.05,
        scale_y: 1.05,
        duration: 150,
        mode: Clutter.AnimationMode.EASE_OUT
    });
});

card.connect('leave-event', () => {
    preview.ease({
        scale_x: 1.0,
        scale_y: 1.0,
        duration: 150,
        mode: Clutter.AnimationMode.EASE_OUT
    });
});
```

### Priority 2: UX Improvements

#### 2.1 Workspace Mode Clarity
**Current:** Workspace selector appears, but mode not explained  
**Issue:** Users might not understand what workspace mode means

**Solution:** Add info icon with tooltip

```javascript
// Next to workspace selector
const infoIcon = new St.Icon({
    icon_name: 'dialog-information-symbolic',
    icon_size: 16,
    style: 'color: #aaaaaa; margin-left: 8px;'
});
infoIcon.set_reactive(true);
infoIcon.connect('enter-event', () => {
    // Show tooltip: "Each workspace can have a different layout"
});
```

#### 2.2 Scroll Position Preservation
**Current:** `_refreshDialog()` uses close/reopen, loses scroll position  
**Issue:** Jarring if user scrolls down, makes edit, returns to top

**Solution:** Selective update instead of full recreate

```javascript
_refreshDialog() {
    // Instead of hide() + show()
    
    // Save scroll position
    const scrollView = this._scrollView;
    const vAdjust = scrollView.vscroll.adjustment;
    const scrollPos = vAdjust.value;
    
    // Update only necessary parts
    this._updateTemplateCards();
    this._updateCustomLayoutCards();
    this._updateWorkspaceButtons();
    
    // Restore scroll position
    vAdjust.value = scrollPos;
}

_updateTemplateCards() {
    // Refresh template section only
    const currentLayout = this._getCurrentLayout();
    this._allCards.filter(c => c.isTemplate).forEach(cardObj => {
        const isActive = this._isLayoutActive(cardObj.layout, currentLayout);
        this._updateCardAppearance(cardObj.card, isActive);
    });
}

_updateCustomLayoutCards() {
    // Refresh custom layout section only
    // Or rebuild grid if layout added/deleted
}
```

#### 2.3 Keyboard Navigation Enhancements
**Current:** Works well, but could be more intuitive

**Additions:**
- `Tab` key: Move forward through cards
- `Shift+Tab`: Move backward through cards
- `Home`: Jump to first card
- `End`: Jump to last card
- `Page Up/Down`: Navigate by full row (5 cards)

```javascript
case Clutter.KEY_Tab:
    if (modifiers & Clutter.ModifierType.SHIFT_MASK) {
        this._navigateCards(-1);
    } else {
        this._navigateCards(1);
    }
    return Clutter.EVENT_STOP;

case Clutter.KEY_Home:
    this._selectedCardIndex = 0;
    this._updateCardFocus();
    return Clutter.EVENT_STOP;

case Clutter.KEY_End:
    this._selectedCardIndex = this._allCards.length - 1;
    this._updateCardFocus();
    return Clutter.EVENT_STOP;

case Clutter.KEY_Page_Up:
    this._navigateCards(-5);  // Full row
    return Clutter.EVENT_STOP;

case Clutter.KEY_Page_Down:
    this._navigateCards(5);
    return Clutter.EVENT_STOP;
```

### Priority 3: Performance & Stability

#### 3.1 Lazy Preview Rendering
**Current:** All previews rendered immediately  
**Optimization:** Render visible previews first, others on-demand

```javascript
_createZonePreview(zones, width, height, lazy = false) {
    const canvas = new St.DrawingArea({
        width: width,
        height: height,
        style: 'border: 1px solid #444; background-color: #1a1a1a;'
    });

    if (lazy) {
        // Defer rendering until visible
        canvas._zones = zones;
        canvas._rendered = false;
    } else {
        this._renderZonePreview(canvas, zones);
    }
    
    return canvas;
}

_renderZonePreview(canvas, zones) {
    // Existing rendering logic
    canvas.connect('repaint', () => {
        // ... render zones ...
    });
}
```

#### 3.2 Memory Leak Prevention
**Current:** Dialog destroyed on close  
**Enhancement:** Explicit cleanup of event handlers

```javascript
destroy() {
    // Disconnect all signals
    this._allCards.forEach(cardObj => {
        if (cardObj.card._clickHandlerId) {
            cardObj.card.disconnect(cardObj.card._clickHandlerId);
        }
        if (cardObj.card._hoverHandlerId) {
            cardObj.card.disconnect(cardObj.card._hoverHandlerId);
        }
    });
    
    this.hide();
}
```

---

## Phase C: Feature Additions

### Feature 1: Template Duplication (High Priority)
**Status:** Partially implemented (edit button shows on hover)  
**Current Flow:** Click "Dup" button → creates copy → opens LayoutSettingsDialog  
**Enhancement Needed:** None, just verify it works end-to-end

**Test:**
1. Hover over "Halves" template
2. Click "Dup" button
3. Verify LayoutSettingsDialog opens with "Halves - Copy"
4. Edit name, click "Edit Layout..."
5. Modify zones in ZoneEditor
6. Save and verify custom layout created

### Feature 2: Custom Layout Deletion (High Priority)
**Status:** Button exists in LayoutSettingsDialog  
**Current Flow:** Edit layout → Delete button → confirmation → delete  
**Enhancement:** Add quick delete from switcher (right-click or button on hover)

**Option A: Right-click context menu**
```javascript
card.connect('button-press-event', (actor, event) => {
    const button = event.get_button();
    
    if (button === 3) {  // Right-click
        this._showContextMenu(cardObj, event);
        return Clutter.EVENT_STOP;
    }
    
    return Clutter.EVENT_PROPAGATE;
});

_showContextMenu(cardObj, event) {
    const menu = new PopupMenu.PopupMenu(event.get_coords());
    
    menu.addAction('Edit', () => {
        this._onEditLayoutClicked(cardObj.layout);
    });
    
    menu.addAction('Duplicate', () => {
        this._onDuplicateLayoutClicked(cardObj.layout);
    });
    
    menu.addAction('Delete', () => {
        this._onDeleteLayoutClicked(cardObj.layout);
    });
    
    menu.open();
}
```

**Option B: Delete button on hover (simpler)**
Already implemented in template cards (Dup/Del buttons), extend to custom layouts.

### Feature 3: Search/Filter (Medium Priority)
**Use Case:** User has 20+ custom layouts, wants to find specific one

```javascript
_createSearchBox() {
    const searchEntry = new St.Entry({
        hint_text: 'Search layouts...',
        style: 'margin: 8px 0; width: 300px;',
        can_focus: true
    });
    
    searchEntry.connect('text-changed', () => {
        const query = searchEntry.text.toLowerCase();
        this._filterLayouts(query);
    });
    
    return searchEntry;
}

_filterLayouts(query) {
    this._allCards.forEach(cardObj => {
        const layoutName = cardObj.layout.name.toLowerCase();
        const matches = layoutName.includes(query);
        
        cardObj.card.visible = matches;
    });
}
```

### Feature 4: Layout Reordering (Low Priority)
**Use Case:** User wants to organize layouts in specific order

**Implementation:** Drag-and-drop in LayoutSwitcher (complex) or dedicated manager

**Recommendation:** Defer to Phase 5 (LayoutManager dialog) - better UX for this

### Feature 5: Layout Import/Export (Low Priority)
**Use Case:** Share layouts between machines or with community

**Implementation:**
```javascript
_createImportExportButtons() {
    const importBtn = new St.Button({
        label: 'Import...',
        style_class: 'button'
    });
    importBtn.connect('clicked', () => {
        this._onImportClicked();
    });
    
    const exportBtn = new St.Button({
        label: 'Export All...',
        style_class: 'button'
    });
    exportBtn.connect('clicked', () => {
        this._onExportClicked();
    });
}

_onImportClicked() {
    // Open file chooser
    // Read JSON
    // Merge with existing layouts
    // Refresh dialog
}

_onExportClicked() {
    // Open file save dialog
    // Write layouts.json to chosen location
}
```

**Recommendation:** Defer to Phase 5 (LayoutManager dialog)

---

## E2E Testing Strategy

### Test Environment Setup

#### Option 1: Manual Testing in VM (Current)
**Pros:**
- Real GNOME Shell environment
- Can test visual aspects
- Can test performance/responsiveness

**Cons:**
- Time-consuming
- Not automated
- Can miss regressions

**Process:**
1. Make changes locally
2. `make install` to VM
3. `make reload` extension
4. Run through manual test checklist
5. Document results

#### Option 2: Automated Testing (Future)
**Challenges:**
- GNOME Shell testing is difficult
- No official test framework for extensions
- UI testing requires special setup

**Possible Approaches:**
- **Dogtail** (GNOME accessibility testing framework)
- **puppeteer-like** tools for GNOME
- **Unit tests** for non-UI logic (LayoutManager, TemplateManager)

### Comprehensive Test Plan

#### Level 1: Unit Tests (Non-UI Logic)
**Target Files:**
- `layoutManager.js` - layout CRUD operations
- `templateManager.js` - template loading
- `utils/layoutConverter.js` - zone/edge conversion

**Framework:** Jest or a simple GJS test runner

```javascript
// Example unit test
function testLayoutManager() {
    const lm = new LayoutManager(mockSettings);
    
    // Test saveLayout
    const layout = {id: 'test', name: 'Test', zones: [...]};
    lm.saveLayout(layout);
    
    // Verify
    const retrieved = lm.getLayout('test');
    assert(retrieved.name === 'Test');
}
```

#### Level 2: Integration Tests (Component Interaction)
**Target Workflows:**
- LayoutSwitcher → LayoutSettingsDialog → ZoneEditor → Save
- Template duplication flow
- Delete layout flow

**Approach:** Mock dialogs, test state transitions

#### Level 3: E2E Tests (Full User Workflows)
**Use existing:** `tests/LAYOUTSWITCHER_MANUAL_TESTS.md`

**Automation Strategy:**
1. Create test scripts that simulate user actions
2. Use GNOME accessibility tools to verify UI state
3. Screenshot comparison for visual regression testing

**Critical Workflows to Automate:**
- Test 4: Apply Template Layout
- Test 5: Create New Layout from Scratch
- Test 6: Edit Existing Custom Layout
- Test 8: Cancel Workflows

#### Level 4: Performance Tests
**Metrics to Track:**
- Dialog open time (should be < 200ms)
- Preview render time per card
- Memory usage over 100 open/close cycles
- Scroll performance with 50+ layouts

**Tools:**
- GNOME Shell's built-in profiler
- `time` command for open/close cycles
- `top`/`htop` for memory monitoring

### Testing Checklist Priorities

#### Must Test Before Release (Critical Path)
From `tests/LAYOUTSWITCHER_MANUAL_TESTS.md`:
- ✅ Test 1: Open/Close
- ✅ Test 2: Keyboard Navigation
- ✅ Test 4: Apply Template Layout
- ✅ Test 5: Create New Layout from Scratch
- ✅ Test 6: Edit Existing Custom Layout
- ✅ Test 7: Delete Custom Layout
- ✅ Test 8: Cancel Workflows

#### Should Test (Important)
- ✅ Test 3: Mouse Hover Effects
- ✅ Test 9: Per-Workspace Layouts
- ✅ Test 13: Layout with No Name
- ✅ Test 15: UI Responsiveness
- ✅ Test 17: Panel Indicator Integration

#### Nice to Test (Edge Cases)
- Test 11: Empty Custom Layouts
- Test 12: Many Custom Layouts
- Test 14: Monitor Resolution Change
- Test 16: Memory Leaks
- Test 18: Multiple Rapid Opens

### Continuous Testing Plan

**After Each Change:**
1. Run smoke test (5 minutes)
   - Open/close
   - Apply one layout
   - Check console for errors

**Before Each Commit:**
1. Run critical path tests (15 minutes)
2. Document any issues found
3. Update CHANGELOG

**Before Each Release:**
1. Run full test suite (60 minutes)
2. Test on both X11 and Wayland
3. Test with workspace mode on/off
4. Document test results
5. Create release notes

---

## Recommended Next Steps

### Option A: Verify Fix → Polish → Features
1. **This Week:** Test latest cutoff fix in VM
2. **Next:** Implement Priority 1 polish items (active indicator, monitor info)
3. **Then:** Add Priority 2 UX improvements (scroll preservation, Tab navigation)
4. **Finally:** Implement high-priority features (delete from switcher, search)

### Option B: Verify Fix → Features → Polish
1. **This Week:** Test latest cutoff fix in VM
2. **Next:** Implement high-priority features (template duplication verification, delete from switcher)
3. **Then:** Add polish items as discovered during feature testing
4. **Finally:** Full E2E test suite run

### Option C: Test-Driven Approach
1. **This Week:** Test latest cutoff fix in VM
2. **Next:** Run full manual test suite, document ALL issues
3. **Then:** Prioritize fixes based on severity
4. **Finally:** Implement fixes one by one with re-testing

---

## Recommendation: Option A (Polish First)

**Rationale:**
- Current functionality is solid (Phase A complete)
- Polish improves existing UX before adding complexity
- Easier to test polish items incrementally
- Features can introduce new bugs - better to have solid foundation

**Timeline Estimate:**
- **Week 1:** Verify cutoff fix + Priority 1 polish (8-12 hours)
- **Week 2:** Priority 2 UX improvements (8-12 hours)
- **Week 3:** High-priority features (12-16 hours)
- **Week 4:** Full E2E testing + bug fixes (8-12 hours)

**Total:** 36-52 hours to production-ready v1.0

---

## Questions for Discussion

1. **Priority:** Polish first or features first?
2. **Testing:** Continue manual testing or invest in automation?
3. **Scope:** Focus on LayoutSwitcher alone or include LayoutManager dialog?
4. **Timeline:** Aim for v1.0 release date?
5. **Features:** Which features are must-have vs nice-to-have?

---

**Ready to proceed with your preferred option!** Let me know which direction you'd like to take.
