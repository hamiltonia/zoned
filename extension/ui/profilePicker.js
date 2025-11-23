/**
 * ProfilePicker - Visual profile selection dialog
 * 
 * Displays a centered dialog showing all available profiles with:
 * - 3-column grid layout with visual zone previews
 * - Cairo-rendered zone visualizations (replaces ASCII art)
 * - System accent color theming
 * - Aspect ratio-aware card dimensions
 * - Keyboard navigation (arrows, 1-9, Enter, Esc)
 * - Mouse selection
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const COLUMNS = 3;
const CARD_PADDING = 10;
const CARD_SPACING = 10;
const CONTAINER_PADDING = 40;
const TITLE_HEIGHT = 50;  // Approximate height of title + spacing
const INSTRUCTIONS_HEIGHT = 30;  // Approximate height of instructions + spacing
const HEADER_SECTION_HEIGHT = 0;  // Reserved for future: explanation text, settings toggles

export class ProfilePicker {
    /**
     * @param {ProfileManager} profileManager - Profile manager instance
     * @param {NotificationManager} notificationManager - Notification manager instance
     * @param {Gio.Settings} settings - GSettings instance
     */
    constructor(profileManager, notificationManager, settings) {
        this._profileManager = profileManager;
        this._notificationManager = notificationManager;
        this._settings = settings;
        this._dialog = null;
        this._selectedIndex = 0;
        this._profileButtons = [];
    }

    /**
     * Show the profile picker dialog (or hide if already showing - toggle behavior)
     */
    show() {
        if (this._dialog) {
            // Already showing - hide it (toggle behavior)
            this.hide();
            return;
        }

        const profiles = this._profileManager.getAllProfiles();
        if (!profiles || profiles.length === 0) {
            console.warn('[ZoneFancy] No profiles available to display');
            return;
        }

        // Find current profile index
        const currentProfile = this._profileManager.getCurrentProfile();
        this._selectedIndex = profiles.findIndex(p => p.id === currentProfile.id);
        if (this._selectedIndex < 0) {
            this._selectedIndex = 0;
        }

        this._createDialog(profiles);
        this._connectKeyEvents();

        console.log('[ZoneFancy] Profile picker shown');
    }

    /**
     * Hide the profile picker dialog
     */
    hide() {
        if (this._dialog) {
            console.log('[ZoneFancy] Hiding profile picker');
            this._disconnectKeyEvents();
            Main.uiGroup.remove_child(this._dialog);
            this._dialog.destroy();
            this._dialog = null;
            this._profileButtons = [];
            console.log('[ZoneFancy] Profile picker hidden');
        }
    }

    /**
     * Calculate card dimensions dynamically to fill available space
     * Constrains by both width AND height to ensure 3x3 grid fits
     * @private
     */
    _getCardDimensions(dialogWidth, dialogHeight) {
        const monitor = Main.layoutManager.currentMonitor;
        const aspectRatio = monitor.width / monitor.height;
        const ROWS = 3;
        
        // Calculate available space for cards
        const availableWidth = dialogWidth - (CONTAINER_PADDING * 2);
        const availableHeight = dialogHeight - (CONTAINER_PADDING * 2) - TITLE_HEIGHT - INSTRUCTIONS_HEIGHT;
        
        // Calculate card spacing as 15% of card width
        // If cardWidth = W, spacing = 0.15W
        // For 3 columns: availableWidth = 3W + 2(0.15W) = 3.3W
        // Therefore: W = availableWidth / 3.3
        
        // Calculate from width constraint
        const cardWidthFromHorizontal = Math.floor(availableWidth / 3.3);  // 3 cards + 0.3 width spacing
        const cardHeightFromWidth = Math.floor(cardWidthFromHorizontal / aspectRatio);
        
        // Calculate from height constraint  
        const cardHeightFromVertical = Math.floor(availableHeight / 3.3);  // 3 rows + 0.3 height spacing
        const cardWidthFromHeight = Math.floor(cardHeightFromVertical * aspectRatio);
        
        // Use whichever is smaller to ensure both dimensions fit
        let cardWidth, cardHeight;
        if (cardHeightFromWidth <= cardHeightFromVertical) {
            cardWidth = cardWidthFromHorizontal;
            cardHeight = cardHeightFromWidth;
        } else {
            cardWidth = cardWidthFromHeight;
            cardHeight = cardHeightFromVertical;
        }
        
        const spacing = Math.floor(cardWidth * 0.15);
        
        console.log(`[ZoneFancy] Available space: ${availableWidth}x${availableHeight}`);
        console.log(`[ZoneFancy] Card size: ${cardWidth}x${cardHeight}, spacing: ${spacing}`);
        
        return { width: cardWidth, height: cardHeight, spacing: spacing };
    }

    /**
     * Get GNOME system accent color
     * @private
     */
    _getAccentColor() {
        try {
            const interfaceSettings = new Gio.Settings({
                schema: 'org.gnome.desktop.interface'
            });
            
            const accentColorName = interfaceSettings.get_string('accent-color');
            
            // Map accent color names to RGB values (0-1 range for Cairo)
            const accentColors = {
                'blue': {red: 0.29, green: 0.56, blue: 0.85},
                'teal': {red: 0.18, green: 0.65, blue: 0.65},
                'green': {red: 0.20, green: 0.65, blue: 0.42},
                'yellow': {red: 0.96, green: 0.76, blue: 0.13},
                'orange': {red: 0.96, green: 0.47, blue: 0.00},
                'red': {red: 0.75, green: 0.22, blue: 0.17},
                'pink': {red: 0.87, green: 0.33, blue: 0.61},
                'purple': {red: 0.61, green: 0.29, blue: 0.85},
                'slate': {red: 0.44, green: 0.50, blue: 0.56}
            };
            
            return accentColors[accentColorName] || accentColors['blue'];
        } catch (e) {
            console.warn('[ZoneFancy] Failed to get accent color, using default blue:', e);
            return {red: 0.29, green: 0.56, blue: 0.85};
        }
    }

    /**
     * Create visual zone preview using Cairo
     * @private
     */
    _createZonePreview(profile, width, height) {
        const canvas = new St.DrawingArea({
            width: width,
            height: height,
            style: 'border: 1px solid #444; background-color: #1a1a1a;'
        });
        
        const accentColor = this._getAccentColor();
        
        canvas.connect('repaint', () => {
            try {
                const cr = canvas.get_context();
                const [w, h] = canvas.get_surface_size();
                
                // Draw each zone
                profile.zones.forEach((zone) => {
                    const x = zone.x * w;
                    const y = zone.y * h;
                    const zoneW = zone.w * w;
                    const zoneH = zone.h * h;
                    
                    // Fill with subtle accent color
                    cr.setSourceRGBA(
                        accentColor.red,
                        accentColor.green,
                        accentColor.blue,
                        0.3  // 30% opacity
                    );
                    cr.rectangle(x, y, zoneW, zoneH);
                    cr.fill();
                    
                    // Border with brighter accent
                    cr.setSourceRGBA(
                        accentColor.red,
                        accentColor.green,
                        accentColor.blue,
                        0.8  // 80% opacity
                    );
                    cr.setLineWidth(1);
                    cr.rectangle(x, y, zoneW, zoneH);
                    cr.stroke();
                });
                
                cr.$dispose();
            } catch (e) {
                console.error(`[ZoneFancy] Error drawing zone preview for ${profile.name}:`, e);
            }
        });
        
        return canvas;
    }

    /**
     * Create the dialog UI with grid layout
     * @private
     */
    _createDialog(profiles) {
        // Background overlay - fully transparent, centered content, click to close
        this._dialog = new St.Bin({
            style_class: 'modal-dialog',
            reactive: true,
            can_focus: true,
            style: 'background-color: rgba(0, 0, 0, 0);',  // Fully transparent
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        
        // Click outside to close
        this._dialog.connect('button-press-event', (actor, event) => {
            // Only close if clicking on the background, not the container
            if (event.get_source() === this._dialog) {
                this.hide();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Calculate size based on monitor orientation and settings
        const monitor = Main.layoutManager.currentMonitor;
        const aspectRatio = monitor.width / monitor.height;
        const isPortrait = monitor.height > monitor.width;
        
        // Read size from settings (default 0.6 = 60%)
        const dialogSizeFraction = this._settings.get_double('profile-picker-size');
        
        let dialogWidth, dialogHeight;
        
        if (isPortrait) {
            // Portrait: width = X% of screen width, height = same as width (square-ish)
            dialogWidth = Math.floor(monitor.width * dialogSizeFraction);
            dialogHeight = dialogWidth;
        } else {
            // Landscape: height = X% of screen height, width mirrors aspect ratio
            dialogHeight = Math.floor(monitor.height * dialogSizeFraction);
            dialogWidth = Math.floor(dialogHeight * aspectRatio);
        }
        
        console.log(`[ZoneFancy] Monitor: ${monitor.width}x${monitor.height} (${aspectRatio.toFixed(2)}:1), Portrait: ${isPortrait}`);
        console.log(`[ZoneFancy] Dialog size (${(dialogSizeFraction * 100).toFixed(0)}%): ${dialogWidth}x${dialogHeight}`);

        // Container for profile grid with explicit sizing
        const containerStyle = 'background-color: rgba(40, 40, 40, 0.95); ' +
                   'border-radius: 16px; ' +
                   'padding: 40px; ' +
                   'spacing: 24px;';
        
        const container = new St.BoxLayout({
            vertical: true,
            style: `${containerStyle} width: ${dialogWidth}px; height: ${dialogHeight}px;`
        });
        
        // Prevent clicks on container from closing dialog
        container.connect('button-press-event', () => {
            return Clutter.EVENT_STOP;  // Stop propagation to parent
        });

        // Title
        const title = new St.Label({
            text: 'Select Profile',
            style: 'font-size: 28px; ' +
                   'font-weight: bold; ' +
                   'color: #ffffff; ' +
                   'text-align: center;'
        });
        container.add_child(title);

        // ScrollView for grid - let it expand to fill container
        const scrollView = new St.ScrollView({
            style: 'flex: 1;',  // Expand to fill available space
            overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            x_expand: true,
            y_expand: true
        });

        const dimensions = this._getCardDimensions(dialogWidth, dialogHeight);
        
        // Grid container - use BoxLayout with wrapping instead of GridLayout
        const gridContainer = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            style: `spacing: ${dimensions.spacing}px;`
        });
        
        console.log(`[ZoneFancy] Card dimensions: ${dimensions.width}x${dimensions.height}`);
        console.log(`[ZoneFancy] Creating cards for ${profiles.length} profiles`);

        // Create rows
        let currentRow = null;
        profiles.forEach((profile, index) => {
            const col = index % COLUMNS;
            
            // Start new row every COLUMNS items
            if (col === 0) {
                currentRow = new St.BoxLayout({
                    vertical: false,
                    style: `spacing: ${dimensions.spacing}px;`
                });
                gridContainer.add_child(currentRow);
            }
            
            const card = this._createProfileCard(profile, index, dimensions.width, dimensions.height);
            currentRow.add_child(card);
            this._profileButtons.push(card);
        });
        
        console.log(`[ZoneFancy] Created ${this._profileButtons.length} profile cards`);

        scrollView.add_child(gridContainer);
        container.add_child(scrollView);

        // Instructions
        const instructions = new St.Label({
            text: '1-9: Quick Select  Arrows: Navigate  Enter: Confirm  Esc: Cancel',
            style: 'font-size: 24px; ' +
                   'color: #aaaaaa; ' +
                   'text-align: center;'
        });
        container.add_child(instructions);

        this._dialog.set_child(container);

        // Add to stage - fill screen for proper centering
        Main.uiGroup.add_child(this._dialog);
        this._dialog.set_position(0, 0);
        this._dialog.set_size(global.screen_width, global.screen_height);
        
        // Grab keyboard focus so key events work
        this._dialog.grab_key_focus();
        
        console.log('[ZoneFancy] Dialog created and added to stage with focus');

        // Update selection highlight
        this._updateSelection();
    }

    /**
     * Create a single profile card
     * @private
     */
    _createProfileCard(profile, index, width, height) {
        const currentProfile = this._profileManager.getCurrentProfile();
        const isCurrentProfile = profile.id === currentProfile.id;
        
        const card = new St.Button({
            style_class: 'profile-card',
            style: `padding: ${CARD_PADDING}px; width: ${width}px; ` +
                   `border-radius: 8px; ` +
                   `background-color: ${isCurrentProfile ? 
                       'rgba(74, 144, 217, 0.3)' : 'rgba(60, 60, 60, 0.5)'};` +
                   `border: ${isCurrentProfile ? '2px solid #4a90d9' : '1px solid #444'};`,
            reactive: true,
            track_hover: true,
            can_focus: true
        });
        
        // Store profile info for later reference
        card._profileId = profile.id;
        card._isCurrentProfile = isCurrentProfile;
        card._profileIndex = index;
        card._cardWidth = width;  // Store width for _updateSelection
        
        const box = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 6px;'
        });
        
        // Zone preview with overlaid number
        const previewWidth = width - (CARD_PADDING * 2);
        const previewHeight = height - 70; // Leave room for name + indicator + spacing below
        
        const previewContainer = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            width: previewWidth,
            height: previewHeight
        });
        
        const preview = this._createZonePreview(profile, previewWidth, previewHeight);
        previewContainer.add_child(preview);
        
        // Large number overlay (if index < 9)
        if (index < 9) {
            const numberOverlay = new St.Label({
                text: `${index + 1}`,
                style: 'font-size: 64px; color: rgba(255, 255, 255, 0.3); font-weight: bold;',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
                y_expand: true
            });
            previewContainer.add_child(numberOverlay);
        }
        
        box.add_child(previewContainer);
        
        // Profile name
        const name = new St.Label({
            text: profile.name,
            style: 'font-size: 16px; text-align: center; font-weight: bold;'
        });
        box.add_child(name);
        
        // Current profile indicator
        if (isCurrentProfile) {
            const indicator = new St.Label({
                text: '●',
                style: 'font-size: 12px; color: #4a90d9; text-align: center;'
            });
            box.add_child(indicator);
        }
        
        card.set_child(box);
        
        // Hover effects
        card.connect('enter-event', () => {
            if (card._profileIndex !== this._selectedIndex) {
                card.style = `padding: ${CARD_PADDING}px; width: ${width}px; ` +
                            `border-radius: 8px; ` +
                            `background-color: rgba(74, 144, 217, 0.25); ` +
                            `border: 1px solid #6aa0d9;`;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        
        card.connect('leave-event', () => {
            // Restore proper style based on selection state
            this._updateSelection();
            return Clutter.EVENT_PROPAGATE;
        });
        
        // Click handler
        card.connect('clicked', () => {
            this._onProfileSelected(profile.id);
        });
        
        return card;
    }

    /**
     * Handle profile selection
     * @private
     */
    _onProfileSelected(profileId) {
        console.log(`[ZoneFancy] Profile selection triggered: ${profileId}`);
        
        // Use shared helper that handles both profile switching and notification
        this._profileManager.setProfileWithNotification(profileId, this._notificationManager);
        
        // Hide dialog
        this.hide();
    }

    /**
     * Update selection highlight
     * @private
     */
    _updateSelection() {
        console.log(`[ZoneFancy] Updating selection to index: ${this._selectedIndex}`);
        const currentProfile = this._profileManager.getCurrentProfile();
        
        this._profileButtons.forEach((button, index) => {
            const isCurrentProfile = button._profileId === currentProfile.id;
            const isSelected = index === this._selectedIndex;
            const width = button._cardWidth || 200;  // Use stored width or fallback
            
            if (isSelected) {
                // Selected card - bright blue with thick border
                button.style = `padding: ${CARD_PADDING}px; width: ${width}px; ` +
                              `border-radius: 8px; ` +
                              `background-color: rgba(74, 144, 217, 0.5); ` +
                              `border: 3px solid #4a90d9;`;
                console.log(`[ZoneFancy] Card ${index} is selected`);
            } else if (isCurrentProfile) {
                // Current profile - medium blue with medium border
                button.style = `padding: ${CARD_PADDING}px; width: ${width}px; ` +
                              `border-radius: 8px; ` +
                              `background-color: rgba(74, 144, 217, 0.3); ` +
                              `border: 2px solid #4a90d9;`;
            } else {
                // Normal card - gray
                button.style = `padding: ${CARD_PADDING}px; width: ${width}px; ` +
                              `border-radius: 8px; ` +
                              `background-color: rgba(60, 60, 60, 0.5); ` +
                              `border: 1px solid #444;`;
            }
        });
    }

    /**
     * Connect keyboard event handlers
     * @private
     */
    _connectKeyEvents() {
        this._keyPressId = global.stage.connect('key-press-event', (actor, event) => {
            const symbol = event.get_key_symbol();
            const profiles = this._profileManager.getAllProfiles();

            // Number keys 1-9 for quick select
            if (symbol >= Clutter.KEY_1 && symbol <= Clutter.KEY_9) {
                const index = symbol - Clutter.KEY_1;
                if (index < profiles.length) {
                    this._onProfileSelected(profiles[index].id);
                    return Clutter.EVENT_STOP;
                }
            }

            // 2D Grid navigation
            const currentRow = Math.floor(this._selectedIndex / COLUMNS);
            const currentCol = this._selectedIndex % COLUMNS;
            const totalRows = Math.ceil(profiles.length / COLUMNS);

            switch (symbol) {
                case Clutter.KEY_Escape:
                    this.hide();
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Return:
                case Clutter.KEY_KP_Enter:
                    if (profiles[this._selectedIndex]) {
                        this._onProfileSelected(profiles[this._selectedIndex].id);
                    }
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Left:
                case Clutter.KEY_KP_Left:
                    // Move left, wrap to previous row's end
                    if (currentCol > 0) {
                        this._selectedIndex--;
                    } else if (currentRow > 0) {
                        this._selectedIndex = (currentRow - 1) * COLUMNS + (COLUMNS - 1);
                        if (this._selectedIndex >= profiles.length) {
                            this._selectedIndex = profiles.length - 1;
                        }
                    }
                    this._updateSelection();
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Right:
                case Clutter.KEY_KP_Right:
                    // Move right, wrap to next row's start
                    if (currentCol < COLUMNS - 1 && this._selectedIndex < profiles.length - 1) {
                        this._selectedIndex++;
                    } else if (currentRow < totalRows - 1) {
                        this._selectedIndex = (currentRow + 1) * COLUMNS;
                        if (this._selectedIndex >= profiles.length) {
                            this._selectedIndex = profiles.length - 1;
                        }
                    }
                    this._updateSelection();
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Up:
                case Clutter.KEY_KP_Up:
                    // Move up one row
                    const upIndex = this._selectedIndex - COLUMNS;
                    if (upIndex >= 0) {
                        this._selectedIndex = upIndex;
                        this._updateSelection();
                    }
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Down:
                case Clutter.KEY_KP_Down:
                    // Move down one row
                    const downIndex = this._selectedIndex + COLUMNS;
                    if (downIndex < profiles.length) {
                        this._selectedIndex = downIndex;
                        this._updateSelection();
                    }
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Page_Up:
                case Clutter.KEY_KP_Page_Up:
                case Clutter.KEY_Page_Down:
                case Clutter.KEY_KP_Page_Down:
                    // Allow ScrollView to handle these
                    return Clutter.EVENT_PROPAGATE;
            }

            return Clutter.EVENT_PROPAGATE;
        });
    }

    /**
     * Disconnect keyboard event handlers
     * @private
     */
    _disconnectKeyEvents() {
        if (this._keyPressId) {
            global.stage.disconnect(this._keyPressId);
            this._keyPressId = null;
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.hide();
    }
}
