# LayoutSwitcher Memory Leak Investigation Status

**Date:** 2024-12-19  
**Branch:** `diagnostic/isolate-leak`  
**Status:** STILL LEAKING - Arrow function fix did NOT resolve the issue

## Investigation Summary

### Tests Performed (Isolation Strategy)

1. **Test #1:** Disabled LayoutPreviewBackground  
   **Result:** ❌ Still leaking - not the preview background

2. **Test #2:** Disabled all cards (empty dialog)  
   **Result:** ✅ Leak stopped - CARDS are the source

3. **Test #3:** Re-enabled cards, disabled Cairo zone previews  
   **Result:** ❌ Still leaking - not the Cairo rendering

### Fixes Attempted

1. **Signal Tracking & Disconnection:**
   - Added `_signalIds` arrays to cards and buttons
   - Implemented `_disconnectCardSignals()` with comprehensive logging
   - Logging confirms ALL signals ARE being disconnected successfully
   - **Result:** ❌ Still leaks

2. **Arrow Function Elimination:**
   - Replaced all arrow functions with bound methods
   - Cards store `_layoutRef` instead of closuring layout objects
   - Handlers read from `card._layoutRef` (no closures)
   - **Result:** ❌ STILL LEAKS!

## Current Diagnostic Branch State

**What's Active:**
- Cards with signal tracking
- Bound method handlers (no arrow functions)
- Signal disconnection with extensive logging
- Layout reference nullification

**What's Disabled (for isolation):**
- LayoutPreviewBackground (full-screen overlay)
- Cairo zone previews (in cards)

## Logs Show

```
[Zoned:Cleanup] ===== CARD SIGNAL CLEANUP START =====
[Zoned:Cleanup] Total cards to process: 5
[Zoned:Cleanup] Card 0: layout="Split"
[Zoned:Cleanup]   Disconnecting 3 card signals... ✓
[Zoned:Cleanup]   Child 1: 3 signals ✓ Disconnected
[Zoned:Cleanup]   Nullifying layout reference...
... (repeated for all cards)
[Zoned:Cleanup] Clearing _allCards array (5 items)
[Zoned:Cleanup] ===== CARD SIGNAL CLEANUP END =====
```

**ALL signals are being disconnected, layouts are being nullified, array is being cleared - BUT IT STILL LEAKS!**

## Remaining Possibilities

### 1. Card Widget Lifecycle Issue
The St.Button cards themselves might not be releasing properly:
- `card.destroy()` is never explicitly called
- We rely on parent dialog destruction to cascade
- GJS might be holding widget references somewhere

### 2. Hidden References in Card Structure
Something in the card's internal structure holds references:
- Card wrapper (`St.Widget` with `FixedLayout`)
- Content container (`St.BoxLayout`)
- Header (`St.BoxLayout`)
- Preview container (`St.Bin`)
- These all get destroyed with dialog, but maybe not releasing?

### 3. `_allCards` Array Structure
```javascript
_allCards.push({
    card: cardButton,
    layout: layoutObject,
    isTemplate: boolean
});
```
Even though we `null` `cardObj.layout` and call `_allCards.length = 0`, maybe the `cardObj` wrapper itself is retained?

### 4. Not Found Yet
- Some other signal connection we haven't tracked
- Global reference somewhere (unlikely - isolated test showed cards are the issue)
- GJS/Clutter internal reference counting issue

## Recommended Next Steps

### Option A: Explicit Card Destruction
Try explicitly destroying each card widget BEFORE clearing array:
```javascript
_disconnectCardSignals() {
    this._allCards.forEach((cardObj) => {
        // ... disconnect signals ...
        
        // EXPLICITLY destroy the card widget
        if (cardObj.card) {
            cardObj.card.destroy();
            cardObj.card = null;
        }
        cardObj.layout = null;
    });
    this._allCards.length = 0;
}
```

### Option B: Don't Store Cards at All
Reth
ink architecture - maybe we don't need `_allCards` array?
- Cards are for keyboard navigation
- Could traverse DOM instead of storing references?
- Trade: more complex navigation for no stored references

### Option C: Different Component
Maybe the leak isn't even in the cards themselves, but in how sectionFactory creates/stores them?
- Check `createTemplatesSection()` / `createCustomLayoutsSection()`
- Are they storing references we're not cleaning up?

### Option D: GC Force
Add explicit GC suggestion after cleanup:
```javascript
_nullifyAllProperties() {
    // ... existing code ...
    
    // Suggest GC (won't force, but might help)
    imports.system.gc();
}
```

## Test Commands

```bash
# Deploy diagnostic branch
make vm-dev

# Run longhaul test
make vm-longhaul
# Choose option 2 (LayoutSwitcher)
# Duration: 2-3 minutes
```

## Files Modified (Not Committed)

### On diagnostic/isolate-leak branch:
- `extension/ui/layoutSwitcher.js`
  - Disabled LayoutPreviewBackground
  - Added comprehensive signal disconnection logging
  - Added bound card handler methods
  - Explicit layout reference nullification
  
- `extension/ui/layoutSwitcher/cardFactory.js`
  - Disabled Cairo zone previews
  - Replaced arrow functions with bound methods
  - Cards store `_layoutRef` property
  - Signal tracking with `_signalIds` arrays

- `extension/utils/debugInterface.js`
  - Removed spam debug logs (Ping, GetGJSMemory, GetResourceReport)

## Conclusion

**The leak is somewhere in the card widget lifecycle that we haven't identified yet.**

Signals are being disconnected. Layout references are being nullified. The array is being cleared. But something is still holding onto memory.

Next investigator should try explicit `card.destroy()` calls or investigate the sectionFactory/grid container structure.
