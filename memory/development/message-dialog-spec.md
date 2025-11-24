# MessageDialog Component Specification

**Created:** 2025-11-24  
**Status:** Planning  
**Component:** `extension/ui/messageDialog.js`

## Overview

Custom modal dialog to replace all `Main.notify()` and `Main.notifyError()` system notifications with a consistent, branded Zoned UI. This provides better visual integration with the extension's existing components (ProfilePicker, ZoneOverlay, NotificationManager).

## Current System Alert Usage

### Locations to Replace (7 instances)

**extension/extension.js (2 instances):**
1. Line ~140: Keybinding conflict warning on startup
2. Line ~154: Extension enable error notification

**extension/ui/panelIndicator.js (5 instances):**
1. Line ~152: "Conflicts Fixed" success message
2. Line ~164: "Auto-fix Failed" error message  
3. Line ~178: "No conflicts detected" info message
4. Line ~191: Conflict details display (multi-line)
5. Line ~204: About dialog (multi-line)

## Design Requirements

### Visual Design

**Layout:**
```
┌─────────────────────────────────────────┐
│  Semi-transparent modal background      │
│  (rgba(0, 0, 0, 0.4))                  │
│                                         │
│    ┌───────────────────────────────┐   │
│    │  [Icon] Dialog Title          │   │
│    ├───────────────────────────────┤   │
│    │                               │   │
│    │  Message content area         │   │
│    │  (multi-line support)         │   │
│    │                               │   │
│    ├───────────────────────────────┤   │
│    │              [OK Button]      │   │
│    └───────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

**Dimensions:**
- Maximum width: 500px
- Maximum height: 400px (with scrolling if needed)
- Minimum width: 300px
- Auto-height based on content
- Centered on screen
- 12px border-radius (matching GNOME Shell dialogs)

**Styling:**
- Background: System dialog background color
- Border: 1px solid with slight shadow
- Title: Bold, system font, 16px
- Message: Regular weight, system font, 14px, line-height 1.4
- Padding: 20px throughout
- Button: GNOME Shell button style (St.Button)

### Message Types

Support three message types with corresponding icons:

1. **Info** (default)
   - Icon: `dialog-information-symbolic`
   - Use for: About dialog, general information

2. **Warning**
   - Icon: `dialog-warning-symbolic`
   - Use for: Conflict warnings, non-critical issues

3. **Error**
   - Icon: `dialog-error-symbolic`
   - Use for: Extension errors, failures

### Behavior

**Display:**
- Modal (blocks interaction with other UI)
- Fade-in animation (200ms)
- Grab keyboard focus
- Trap focus within dialog

**Dismissal Methods:**
1. Click "OK" button
2. Press Esc key
3. Click outside dialog (on modal background)

**Cleanup:**
- Fade-out animation (150ms)
- Remove all event listeners
- Destroy UI elements properly

## API Design

### Constructor

```javascript
class MessageDialog {
    /**
     * Create a new MessageDialog
     * @param {Object} options - Dialog options
     * @param {string} options.title - Dialog title
     * @param {string} options.message - Message content (can include \n)
     * @param {string} [options.type='info'] - Message type: 'info', 'warning', 'error'
     */
    constructor(options) { }
}
```

### Methods

```javascript
/**
 * Show the dialog
 */
show() { }

/**
 * Hide the dialog
 */
hide() { }

/**
 * Destroy the dialog and clean up resources
 */
destroy() { }
```

### Usage Examples

```javascript
// Simple info dialog
const dialog = new MessageDialog({
    title: 'About Zoned',
    message: 'Zoned - Advanced Window Zone Management\n\n' +
             'Version: 1.0\n' +
             'GitHub: https://github.com/hamiltonia/zoned',
    type: 'info'
});
dialog.show();

// Warning dialog with auto-cleanup
const warning = new MessageDialog({
    title: 'Keybinding Conflicts',
    message: '3 conflicts detected:\n\n' +
             '1. Super+Left conflicts with...\n' +
             '2. Super+Right conflicts with...',
    type: 'warning'
});
warning.show();

// Error dialog
const error = new MessageDialog({
    title: 'Extension Error',
    message: 'Failed to load profiles: File not found',
    type: 'error'
});
error.show();
```

## Implementation Details

### Component Structure

```javascript
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { createLogger } from '../utils/debug.js';

const logger = createLogger('MessageDialog');

export class MessageDialog {
    constructor(options) {
        this._title = options.title || 'Zoned';
        this._message = options.message || '';
        this._type = options.type || 'info';
        
        this._dialog = null;
        this._backgroundActor = null;
        this._grabHelper = null;
        
        this._buildUI();
    }
    
    _buildUI() {
        // Modal background
        this._backgroundActor = new St.BoxLayout({
            style_class: 'modal-dialog-background',
            style: 'background-color: rgba(0, 0, 0, 0.4);',
            reactive: true,
            x_expand: true,
            y_expand: true
        });
        
        // Dialog container
        this._dialog = new St.BoxLayout({
            style_class: 'zoned-message-dialog',
            style: 'background-color: #2e3436; ' +
                   'border: 1px solid #1c1f1f; ' +
                   'border-radius: 12px; ' +
                   'padding: 20px; ' +
                   'min-width: 300px; ' +
                   'max-width: 500px;',
            vertical: true,
            reactive: true
        });
        
        // Title bar with icon
        const titleBox = new St.BoxLayout({
            style: 'spacing: 10px; margin-bottom: 15px;'
        });
        
        const icon = new St.Icon({
            icon_name: this._getIconName(),
            icon_size: 24,
            style: `color: ${this._getIconColor()};`
        });
        titleBox.add_child(icon);
        
        const titleLabel = new St.Label({
            text: this._title,
            style: 'font-weight: bold; font-size: 16px;'
        });
        titleBox.add_child(titleLabel);
        this._dialog.add_child(titleBox);
        
        // Separator
        const separator = new St.Widget({
            style: 'height: 1px; background-color: #555; margin-bottom: 15px;'
        });
        this._dialog.add_child(separator);
        
        // Message content (scrollable)
        const scrollView = new St.ScrollView({
            style: 'max-height: 300px;'
        });
        
        const messageLabel = new St.Label({
            text: this._message,
            style: 'font-size: 14px; line-height: 1.4;'
        });
        scrollView.add_child(messageLabel);
        this._dialog.add_child(scrollView);
        
        // Button container
        const buttonBox = new St.BoxLayout({
            style: 'margin-top: 20px;',
            x_align: Clutter.ActorAlign.END
        });
        
        const okButton = new St.Button({
            label: 'OK',
            style_class: 'button',
            style: 'padding: 8px 24px; border-radius: 6px;'
        });
        okButton.connect('clicked', () => this.hide());
        buttonBox.add_child(okButton);
        
        this._dialog.add_child(buttonBox);
        
        // Add dialog to background
        this._backgroundActor.add_child(this._dialog);
        
        // Click outside to close
        this._backgroundActor.connect('button-press-event', (actor, event) => {
            const [x, y] = event.get_coords();
            const dialogAllocation = this._dialog.get_allocation_box();
            
            if (!this._dialog.contains(event.get_source())) {
                this.hide();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }
    
    _getIconName() {
        switch (this._type) {
            case 'warning': return 'dialog-warning-symbolic';
            case 'error': return 'dialog-error-symbolic';
            default: return 'dialog-information-symbolic';
        }
    }
    
    _getIconColor() {
        switch (this._type) {
            case 'warning': return '#f57900'; // Orange
            case 'error': return '#cc0000'; // Red
            default: return '#3584e4'; // Blue
        }
    }
    
    show() {
        // Add to main chrome
        Main.layoutManager.addChrome(this._backgroundActor, {
            affectsStruts: false,
            affectsInputRegion: true
        });
        
        // Center dialog
        const monitor = Main.layoutManager.primaryMonitor;
        this._backgroundActor.set_position(0, 0);
        this._backgroundActor.set_size(monitor.width, monitor.height);
        
        // Fade in
        this._backgroundActor.opacity = 0;
        this._backgroundActor.ease({
            opacity: 255,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
        
        // Set up keyboard handling
        this._grabHelper = Main.pushModal(this._backgroundActor);
        
        // Handle Esc key
        this._keyPressId = this._backgroundActor.connect('key-press-event', 
            (actor, event) => {
                if (event.get_key_symbol() === Clutter.KEY_Escape) {
                    this.hide();
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            }
        );
        
        logger.debug(`Showing ${this._type} dialog: ${this._title}`);
    }
    
    hide() {
        if (!this._backgroundActor) return;
        
        // Fade out
        this._backgroundActor.ease({
            opacity: 0,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.destroy();
            }
        });
        
        logger.debug(`Hiding dialog: ${this._title}`);
    }
    
    destroy() {
        // Disconnect signals
        if (this._keyPressId) {
            this._backgroundActor.disconnect(this._keyPressId);
            this._keyPressId = null;
        }
        
        // Pop modal
        if (this._grabHelper) {
            Main.popModal(this._backgroundActor);
            this._grabHelper = null;
        }
        
        // Remove from chrome
        if (this._backgroundActor) {
            Main.layoutManager.removeChrome(this._backgroundActor);
            this._backgroundActor.destroy();
            this._backgroundActor = null;
        }
        
        this._dialog = null;
        
        logger.debug('Dialog destroyed');
    }
}
```

## Migration Plan

### Step 1: Create MessageDialog Component
- Create `extension/ui/messageDialog.js`
- Implement all methods and styling
- Test standalone functionality

### Step 2: Update PanelIndicator
Replace all 5 instances:

```javascript
// OLD: Main.notify('Zoned - Conflicts Fixed', message);
// NEW:
const dialog = new MessageDialog({
    title: 'Conflicts Fixed',
    message: message,
    type: 'info'
});
dialog.show();

// OLD: Main.notifyError('Zoned - Error', message);
// NEW:
const dialog = new MessageDialog({
    title: 'Error',
    message: message,
    type: 'error'
});
dialog.show();

// OLD: Main.notify('Zoned - Keybinding Conflicts', message);
// NEW:
const dialog = new MessageDialog({
    title: 'Keybinding Conflicts',
    message: message,
    type: 'warning'
});
dialog.show();

// About dialog - similar pattern
```

### Step 3: Update Extension.js
Replace 2 instances at startup:

```javascript
// OLD: Main.notify('Zoned', '⚠️ ... conflicts detected...');
// NEW:
const dialog = new MessageDialog({
    title: 'Keybinding Conflicts Detected',
    message: `${conflictCount} keybinding conflict${conflictCount !== 1 ? 's' : ''} detected.\n\n` +
             `Click the Zoned icon in the top bar for details and auto-fix options.`,
    type: 'warning'
});
dialog.show();

// OLD: Main.notifyError('Zoned Error', `Failed to enable: ${error.message}`);
// NEW:
const dialog = new MessageDialog({
    title: 'Extension Error',
    message: `Failed to enable Zoned extension:\n\n${error.message}`,
    type: 'error'
});
dialog.show();
```

### Step 4: Pass MessageDialog to Components
Update Extension.js to pass MessageDialog instance:

```javascript
this._messageDialog = null; // Will be created on-demand

// Then in enable():
// When needed, create and show:
const dialog = new MessageDialog({...});
dialog.show();
```

### Step 5: Testing
- Test all dialog types (info, warning, error)
- Test all dismissal methods (OK, Esc, click outside)
- Test multi-line messages
- Test long messages (scrolling)
- Test on different screen sizes
- Verify no memory leaks (proper cleanup)

## Success Criteria

- ✅ All 7 `Main.notify()`/`Main.notifyError()` calls replaced
- ✅ Consistent visual design across all dialogs
- ✅ Proper modal behavior (blocks background interaction)
- ✅ All dismissal methods work correctly
- ✅ Animations smooth and polished
- ✅ No errors in GNOME Shell logs
- ✅ Proper resource cleanup (no leaks)

## Future Enhancements

- Multiple buttons (Yes/No, OK/Cancel)
- Custom button callbacks
- Input fields for user data entry
- Customizable button labels
- Auto-dismiss timer option
- Queuing system for multiple dialogs

## References

- ProfilePicker component for modal dialog patterns
- NotificationManager for short-lived notifications
- GNOME Shell ModalDialog documentation
- St.Button and St.BoxLayout styling patterns
