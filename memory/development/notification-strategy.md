# Notification Strategy

Last Updated: 2024-11-24 (Final Implementation)

**Status:** ✅ Complete and Production-Ready

## Overview

Zoned uses a dual-notification system to provide clear, context-appropriate feedback:

1. **Center-Screen Notifications** - For user-initiated actions
2. **Top-Bar Notifications** - For system messages and alerts

## Center-Screen Notifications (ZoneOverlay)

**Purpose**: Immediate visual feedback for user actions

**Component**: `ZoneOverlay` (`extension/ui/zoneOverlay.js`)

**Design**:
- Square container with rounded corners (12px border radius)
- Semi-transparent dark background (rgba(40, 40, 40, 0.9))
- Faint PNG watermark of Zoned icon (opacity: 40/255)
- White text for primary message
- Blue accent text for secondary information
- Positioned at top quarter of screen (centered horizontally)
- Auto-dismisses after 1 second (default)

**Use Cases**:
- Window snapping to zones (Super+Left/Right)
- Layout switching (via picker or menu)
- Window minimize (Super+Down)
- Window maximize/restore (Super+Up)

**API**:
```javascript
// Zone cycling with layout name and zone info
zoneOverlay.show(layoutName, zoneIndex, totalZones, duration);

// Generic message
zoneOverlay.showMessage(message, duration);
```

**Example Usage**:
```javascript
// In keybindingManager.js - window minimize
this._zoneOverlay.showMessage('Minimized');

// In layoutManager.js - layout switch
zoneOverlay.showMessage(`Switched to: ${layout.name}`);
```

## Top-Bar Notifications (NotificationManager)

**Purpose**: System messages and alerts that don't interrupt workflow

**Component**: `NotificationManager` (`extension/ui/notificationManager.js`)

**Design**:
- [Icon] | Message layout
- Colorful Zoned icon on left (36px, branded SVG)
- Vertical separator line
- Message text on right (wraps as needed)
- Semi-transparent dark background (rgba(40, 40, 40, 0.95))
- Rounded corners (8px border radius)
- Positioned below top panel (proper allocation timing)
- Auto-dismisses after 2 seconds (default)

**Use Cases**:
- Extension startup confirmation
- Keybinding conflict warnings
- Auto-fix success messages
- Background operations

**API**:
```javascript
// Simple message notification
notificationManager.show(message, duration);
```

**Example Usage**:
```javascript
// In extension.js - startup
this._notificationManager.show(`Enabled: ${currentLayout.name}`, 1500);

// In panelIndicator.js - auto-fix success
this._notificationManager.show(`✓ Fixed ${count} conflict${count !== 1 ? 's' : ''}`, 2000);
```

## Design Principles

### When to Use Center-Screen (ZoneOverlay)
- User explicitly triggered an action (keyboard shortcut, menu selection)
- Immediate visual confirmation is valuable
- Action affects window layout or positioning
- Brief, contextual feedback

### When to Use Top-Bar (NotificationManager)
- System-initiated messages
- Background operations completed
- Warnings or alerts
- Information that should be noticed but not interrupt

### When to Use MessageDialog
- Errors requiring acknowledgment
- Detailed information that user requested
- Actions that cannot be completed
- User needs to make a decision

## Implementation Details

### ZoneOverlay Features
- **Watermark**: PNG icon (`extension/icons/zoned-watermark.svg`) rendered at low opacity
- **Layering**: Uses `St.Bin` with multiple children for watermark + content
- **Positioning**: Calculated dynamically based on `global.screen_width` and `global.screen_height`
- **Flexibility**: Can show zone-specific info or generic messages

### NotificationManager Features
- **Icon Loading**: Uses `Gio.icon_new_for_string()` for SVG icon
- **Text Wrapping**: Supports multi-line messages with `Pango.WrapMode.WORD_CHAR`
- **Fade Animations**: Smooth fade-in/fade-out with Clutter animations
- **Graceful Fallback**: If icon fails to load, shows message without icon

### Font Scaling
Both notification systems respect GNOME's text scaling settings by:
- Avoiding hardcoded `font-size` declarations
- Using system default font sizes
- Allowing text to scale with user preferences

## File Updates Summary

All notification routing updated in:
- ✅ `extension/extension.js` - Pass extension object to both managers
- ✅ `extension/keybindingManager.js` - Route user actions to ZoneOverlay
- ✅ `extension/layoutManager.js` - Use ZoneOverlay for layout switching
- ✅ `extension/ui/layoutPicker.js` - Use ZoneOverlay instead of NotificationManager
- ✅ `extension/ui/panelIndicator.js` - Use both (ZoneOverlay for layout switch, NotificationManager for auto-fix)
- ✅ `extension/ui/zoneOverlay.js` - Enhanced with watermark and generic message support
- ✅ `extension/ui/notificationManager.js` - Redesigned with [Icon] | Message layout

## Testing Checklist

- [x] Super+Left/Right shows center notification with layout and zone info
- [x] Super+Down shows center "Minimized" notification
- [x] Super+Up shows center "Maximized"/"Unmaximized"/"Restored" notification
- [x] Layout picker selection shows center "Switched to: [Layout]" notification
- [x] Panel menu layout selection shows center "Switched to: [Layout]" notification
- [x] Extension startup shows top "Enabled: [Layout]" notification
- [x] Keybinding conflicts show top warning notification
- [x] Auto-fix success shows top success notification
- [x] Full colorful icon appears as background in center notifications (512x512)
- [x] Colorful icon appears in top notifications (36px, left side with separator)
- [x] All notifications respect GNOME text scaling
- [x] All notifications auto-dismiss at correct timing
- [x] No notification overlap or conflicts (proper positioning)
- [x] Top notification properly positioned below panel (no overlap)

## Implementation Notes

**Icon Assets:**
- All icons stored in `extension/icons/`
- SVG format for resolution independence (~7KB total)
- `zoned-watermark.svg` (4.5KB) - Used in both notification types
- `zoned-symbolic.svg` (1.2KB) - Panel indicator (normal state)
- `zoned-warning.svg` (1.2KB) - Panel indicator (conflict state)

**Key Decisions:**
1. **Colorful vs Symbolic**: Chose branded colorful icons over GNOME symbolic icons for better recognition and branding
2. **Icon Size**: 36px for top notifications (larger than symbolic standard of 24px) for better visibility
3. **Center Notification**: 512x512 full icon background provides strong visual presence
4. **Positioning**: Wait for widget allocation before positioning to ensure correct centering

## Future Enhancements

Potential improvements to consider:
- User-configurable notification durations
- Notification position preferences
- Animation style options
- Notification history/log
- Sound effects (optional)
- Configurable icon opacity for center notifications
