# Notification Strategy

Last Updated: 2024-12-15 (User-Configurable Notifications)

**Status:** ✅ Complete with User Settings

## Overview

Zoned uses a dual-notification system with user-configurable preferences:

1. **Center-Screen Notifications** - For user-initiated actions (ZoneOverlay)
2. **Top-Bar Notifications** - For system messages and alerts (NotificationManager)
3. **NotificationService** - Routes notifications based on user settings

## User Settings

Users can control notifications through the **Settings > Notifications** section:

### Master Controls
- **Enable Notifications** - Global toggle to disable all notifications
- **Notification Duration** - How long notifications stay visible (Quick 0.5s / Normal 1s / Slow 2s / Long 3s)

### Per-Category Settings

Each category can be set to: **Center (Large)**, **System (Top Bar)**, or **Disabled**

| Category | Description | Default |
|----------|-------------|---------|
| **Window Snapping** | Zone cycling with Super+Left/Right | Disabled |
| **Layout/Profile Changes** | Switching layouts via any method | Disabled |
| **Window Management** | Minimize/maximize/restore actions | Disabled |
| **Workspace Changes** | Per-space layout display when switching | Disabled |
| **Startup Messages** | "Enabled: [layout]" on extension load | Center |
| **Conflict Warnings** | Keybinding conflict detection alerts | System |

## Architecture

### NotificationService

The `NotificationService` (`extension/utils/notificationService.js`) acts as a router:

```javascript
import {NotificationService, NotifyCategory} from './utils/notificationService.js';

// In extension initialization:
this._notificationService = new NotificationService(
    this,                      // extension object
    this._zoneOverlay,         // for center notifications
    this._notificationManager, // for system notifications
);

// Usage:
this._notificationService.notify(
    NotifyCategory.WINDOW_SNAPPING,
    'Zone 1 of 3',
);

// For zone cycling with layout info:
this._notificationService.notifyZone(
    NotifyCategory.WINDOW_SNAPPING,
    layoutName,
    zoneIndex,
    totalZones,
);
```

### NotifyCategory Constants

```javascript
export const NotifyCategory = {
    WINDOW_SNAPPING: 'window-snapping',
    LAYOUT_SWITCHING: 'layout-switching',
    WINDOW_MANAGEMENT: 'window-management',
    WORKSPACE_CHANGES: 'workspace-changes',
    STARTUP: 'startup',
    CONFLICTS: 'conflicts',
};
```

## Center-Screen Notifications (ZoneOverlay)

**Component**: `ZoneOverlay` (`extension/ui/zoneOverlay.js`)

**Design** (User-configurable for readability):
- **Size options**: Small (256px), Medium (384px), Large (512px)
- **Opacity slider**: 50-100% for background and icon
- Watermark icon background (scaled with size)
- **Dark pill background** behind text (opacity from settings)
- **Font sizes scale with size**: Small 14/12px, Medium 16/14px, Large 18/16px
- **Brighter blue accent** (#88c0ff) for message text
- **Strong text shadows** for contrast
- Positioned at top quarter of screen (centered horizontally)

**Size Configurations**:
| Size | Container | Icon | Title Font | Message Font |
|------|-----------|------|------------|--------------|
| Small | 256px | 256px | 14px | 12px |
| Medium | 384px | 384px | 16px | 14px |
| Large | 512px | 512px | 18px | 16px |

**API**:
```javascript
// Zone cycling with layout name and zone info
zoneOverlay.show(layoutName, zoneIndex, totalZones, duration);

// Generic message
zoneOverlay.showMessage(message, duration);
```

## Top-Bar Notifications (NotificationManager)

**Component**: `NotificationManager` (`extension/ui/notificationManager.js`)

**Design**:
- [Icon] | Message layout
- Colorful Zoned icon on left (36px)
- Positioned below top panel
- Auto-dismisses after configured duration

**API**:
```javascript
notificationManager.show(message, duration);
```

## GSettings Keys

```xml
<!-- Master toggle -->
<key name="notifications-enabled" type="b">
  <default>true</default>
</key>

<!-- Duration in milliseconds (500-5000) -->
<key name="notification-duration" type="i">
  <default>1000</default>
</key>

<!-- Center notification appearance -->
<key name="center-notification-size" type="s">
  <default>"medium"</default>  <!-- "small", "medium", "large" -->
</key>

<key name="center-notification-opacity" type="i">
  <default>85</default>  <!-- 50-100% -->
</key>

<!-- Per-category: "center", "system", or "disabled" -->
<key name="notify-window-snapping" type="s"><default>"disabled"</default></key>
<key name="notify-layout-switching" type="s"><default>"disabled"</default></key>
<key name="notify-window-management" type="s"><default>"disabled"</default></key>
<key name="notify-workspace-changes" type="s"><default>"disabled"</default></key>
<key name="notify-startup" type="s"><default>"center"</default></key>
<key name="notify-conflicts" type="s"><default>"system"</default></key>
```

## Migration Notes

### For Developers
When adding new notifications:
1. Determine the appropriate category from `NotifyCategory`
2. Use `_notificationService.notify()` instead of direct overlay/manager calls
3. For zone-specific display, use `_notificationService.notifyZone()`

### Legacy Code
The `_zoneOverlay` and `_notificationManager` are still available for components that haven't been migrated, but new code should use `_notificationService`.

## File Summary

| File | Purpose |
|------|---------|
| `extension/utils/notificationService.js` | Routes notifications based on settings |
| `extension/ui/zoneOverlay.js` | Center-screen overlay display |
| `extension/ui/notificationManager.js` | Top-bar notification display |
| `extension/schemas/...gschema.xml` | Notification GSettings keys |
| `extension/prefs.js` | Notification settings UI |

## Testing Checklist

- [x] Master toggle disables all notifications
- [x] Duration setting affects all notification types
- [x] Each category can be set to center/system/disabled
- [x] Window snapping notifications respect settings
- [x] Layout switching notifications respect settings
- [x] Window management notifications respect settings
- [x] Workspace change notifications respect settings
- [x] Startup message respects settings
- [x] Conflict warnings respect settings
- [x] Center notification styling is readable (dark pill, larger fonts)
- [x] Settings persist across restarts
