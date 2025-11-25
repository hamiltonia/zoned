/**
 * MessageDialog - Custom modal dialog for Zoned
 * 
 * Provides a branded, consistent UI for displaying messages to the user.
 * Replaces generic GNOME Shell notifications (Main.notify/Main.notifyError)
 * with a more polished modal dialog experience.
 * 
 * Supports three message types:
 * - info: General information (blue icon)
 * - warning: Warnings and alerts (orange icon)
 * - error: Errors and failures (red icon)
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { createLogger } from '../utils/debug.js';

const logger = createLogger('MessageDialog');

export class MessageDialog {
    /**
     * Create a new MessageDialog
     * @param {Object} options - Dialog options
     * @param {string} options.title - Dialog title
     * @param {string} options.message - Message content (can include \n for line breaks)
     * @param {string} [options.type='info'] - Message type: 'info', 'warning', 'error'
     */
    constructor(options) {
        this._title = options.title || 'Zoned';
        this._message = options.message || '';
        this._type = options.type || 'info';
        
        this._backgroundActor = null;
        this._dialogBox = null;
        this._keyPressId = null;
        this._buttons = [];
        this._buttonBox = null;
        
        this._buildUI();
    }
    
    /**
     * Build the dialog UI
     * @private
     */
    _buildUI() {
        logger.debug(`Building UI for dialog: "${this._title}"`);
        
        // Modal background (semi-transparent overlay)
        this._backgroundActor = new St.Bin({
            style_class: 'zoned-modal-background',
            style: 'background-color: rgba(0, 0, 0, 0.4);',
            reactive: true,
            track_hover: true,
            can_focus: true,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        
        // Dialog container
        this._dialogBox = new St.BoxLayout({
            style_class: 'zoned-message-dialog',
            style: 'background-color: #2e3436; ' +
                   'border: 1px solid #1c1f1f; ' +
                   'border-radius: 12px; ' +
                   'padding: 20px; ' +
                   'min-width: 300px; ' +
                   'max-width: 500px;',
            vertical: true,
            reactive: true,
            x_expand: false,
            y_expand: false
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
            style: 'font-weight: bold;'
        });
        titleBox.add_child(titleLabel);
        this._dialogBox.add_child(titleBox);
        
        // Separator line
        const separator = new St.Widget({
            style: 'height: 1px; background-color: #555; margin-bottom: 15px;'
        });
        this._dialogBox.add_child(separator);
        
        // Message content area (scrollable for long messages)
        const scrollView = new St.ScrollView({
            style: 'max-height: 300px;',
            x_expand: true,
            y_expand: false,
            overlay_scrollbars: true
        });
        
        const messageLabel = new St.Label({
            text: this._message,
            style: 'line-height: 1.4;'
        });
        messageLabel.clutter_text.line_wrap = true;
        scrollView.add_child(messageLabel);
        this._dialogBox.add_child(scrollView);
        
        // Button container
        this._buttonBox = new St.BoxLayout({
            style: 'margin-top: 20px;',
            x_align: Clutter.ActorAlign.END,
            spacing: 10
        });
        
        // Add default OK button (will be replaced if setButtons is called)
        const okButton = new St.Button({
            label: 'OK',
            style_class: 'button',
            style: 'padding: 8px 24px; border-radius: 6px; font-weight: bold;',
            reactive: true
        });
        okButton.connect('clicked', () => this.hide());
        this._buttonBox.add_child(okButton);
        this._buttons.push(okButton);
        
        this._dialogBox.add_child(this._buttonBox);
        
        // Add dialog to background
        this._backgroundActor.add_child(this._dialogBox);
        
        logger.debug('UI build complete');
        
        // Click outside to close
        this._backgroundActor.connect('button-press-event', (actor, event) => {
            const clickSource = event.get_source();
            if (!this._dialogBox.contains(clickSource) && clickSource !== this._dialogBox) {
                this.hide();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }
    
    /**
     * Set custom buttons for the dialog
     * @param {Array} buttons - Array of button configurations
     *   Each button: { label: string, action: function, default?: boolean }
     */
    setButtons(buttons) {
        if (!this._buttonBox) {
            logger.error('Cannot set buttons: button box not initialized');
            return;
        }
        
        // Clear existing buttons
        this._buttonBox.destroy_all_children();
        this._buttons = [];
        
        // Add custom buttons
        buttons.forEach((btnConfig, index) => {
            const isDefault = btnConfig.default || index === 0;
            
            const button = new St.Button({
                label: btnConfig.label,
                style_class: 'button',
                style: `padding: 8px 24px; border-radius: 6px;${isDefault ? ' font-weight: bold;' : ''}`,
                reactive: true
            });
            
            button.connect('clicked', () => {
                if (btnConfig.action) {
                    btnConfig.action();
                }
            });
            
            this._buttonBox.add_child(button);
            this._buttons.push(button);
        });
        
        logger.debug(`Set ${buttons.length} custom buttons`);
    }
    
    /**
     * Get icon name for the message type
     * @private
     * @returns {string} Icon name
     */
    _getIconName() {
        switch (this._type) {
            case 'warning':
                return 'dialog-warning-symbolic';
            case 'error':
                return 'dialog-error-symbolic';
            default:
                return 'dialog-information-symbolic';
        }
    }
    
    /**
     * Get icon color for the message type
     * @private
     * @returns {string} CSS color value
     */
    _getIconColor() {
        switch (this._type) {
            case 'warning':
                return '#f57900'; // Orange
            case 'error':
                return '#cc0000'; // Red
            default:
                return '#3584e4'; // Blue
        }
    }
    
    /**
     * Show the dialog with fade-in animation
     */
    show() {
        try {
            logger.debug(`[SHOW] Step 1: Starting show() for dialog: "${this._title}"`);
            
            if (!this._backgroundActor) {
                logger.error('[SHOW] Step 1 FAILED: UI not built');
                return;
            }
            logger.debug('[SHOW] Step 1 OK: Background actor exists');
            
            logger.debug('[SHOW] Step 2: Getting monitor...');
            // Use currentMonitor with fallback to primaryMonitor
            const monitor = Main.layoutManager.currentMonitor || Main.layoutManager.primaryMonitor;
            
            if (!monitor) {
                logger.error('[SHOW] Step 2 FAILED: No monitor available');
                return;
            }
            logger.debug(`[SHOW] Step 2 OK: Monitor found (${monitor.width}x${monitor.height})`);
            
            logger.debug('[SHOW] Step 3: Adding to UI group...');
            try {
                Main.uiGroup.add_child(this._backgroundActor);
                logger.debug('[SHOW] Step 3 OK: Added to UI group');
            } catch (e) {
                logger.error(`[SHOW] Step 3 FAILED: Could not add to UI group: ${e.message}`);
                throw e;
            }
            
            logger.debug('[SHOW] Step 4: Setting position and size...');
            this._backgroundActor.set_position(0, 0);
            this._backgroundActor.set_size(monitor.width, monitor.height);
            logger.debug(`[SHOW] Step 4 OK: Positioned at 0,0 with size ${monitor.width}x${monitor.height}`);
            
            logger.debug('[SHOW] Step 5: Attempting to grab modal...');
            try {
                const grabbed = Main.pushModal(this._backgroundActor, {
                    actionMode: Shell.ActionMode.NORMAL
                });
                
                if (!grabbed) {
                    logger.error('[SHOW] Step 5 WARNING: Failed to grab modal - another modal may be active');
                } else {
                    logger.debug('[SHOW] Step 5 OK: Modal grabbed successfully');
                }
            } catch (e) {
                logger.error(`[SHOW] Step 5 ERROR: Exception during modal grab: ${e.message}`);
                // Continue anyway - dialog may still be usable
            }
            
            logger.debug('[SHOW] Step 6: Setting up fade-in animation...');
            this._backgroundActor.opacity = 0;
            this._backgroundActor.ease({
                opacity: 255,
                duration: 200,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD
            });
            logger.debug('[SHOW] Step 6 OK: Animation started');
            
            logger.debug('[SHOW] Step 7: Connecting key-press handler...');
            this._keyPressId = this._backgroundActor.connect('key-press-event', 
                (actor, event) => {
                    const symbol = event.get_key_symbol();
                    if (symbol === Clutter.KEY_Escape) {
                        this.hide();
                        return Clutter.EVENT_STOP;
                    }
                    return Clutter.EVENT_PROPAGATE;
                }
            );
            logger.debug('[SHOW] Step 7 OK: Key handler connected');
            
            logger.info(`[SHOW] SUCCESS: Dialog "${this._title}" shown with ${this._buttons.length} button(s)`);
        } catch (error) {
            logger.error(`[SHOW] FATAL ERROR in show() for "${this._title}": ${error.message}`);
            logger.error(`[SHOW] Stack trace: ${error.stack}`);
            
            // Clean up on error
            if (this._backgroundActor && this._backgroundActor.get_parent()) {
                this._backgroundActor.get_parent().remove_child(this._backgroundActor);
            }
        }
    }
    
    /**
     * Hide the dialog with fade-out animation
     */
    hide() {
        if (!this._backgroundActor) return;
        
        logger.debug(`Hiding dialog: "${this._title}"`);
        
        // Release modal input grab
        Main.popModal(this._backgroundActor);
        
        // Fade out animation, then destroy
        this._backgroundActor.ease({
            opacity: 0,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.destroy();
            }
        });
    }
    
    /**
     * Destroy the dialog and clean up all resources
     */
    destroy() {
        if (!this._backgroundActor) {
            return; // Already destroyed
        }
        
        // Stop any ongoing animations
        this._backgroundActor.remove_all_transitions();
        
        // Disconnect signals
        if (this._keyPressId) {
            this._backgroundActor.disconnect(this._keyPressId);
            this._keyPressId = null;
        }
        
        // Remove from UI group and destroy actors
        if (this._backgroundActor.get_parent()) {
            this._backgroundActor.get_parent().remove_child(this._backgroundActor);
        }
        this._backgroundActor.destroy();
        this._backgroundActor = null;
        this._dialogBox = null;
        
        logger.debug('Dialog destroyed');
    }
}
