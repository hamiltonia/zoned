/**
 * ConfirmDialog - Simple confirmation dialog using GNOME's ModalDialog
 * 
 * Replaces the broken custom MessageDialog with proper GNOME Shell integration.
 * Uses ModalDialog.ModalDialog for proper modal stack handling.
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import { createLogger } from '../utils/debug.js';

const logger = createLogger('ConfirmDialog');

/**
 * ConfirmDialog - Simple yes/no confirmation
 * 
 * Usage:
 *   const dialog = new ConfirmDialog(
 *       'Delete Profile',
 *       'Are you sure you want to delete this profile?',
 *       () => { // confirmed
 *           profileManager.delete(id);
 *       }
 *   );
 *   dialog.open();
 */
export class ConfirmDialog extends ModalDialog.ModalDialog {
    /**
     * Create a new confirmation dialog
     * @param {string} title - Dialog title
     * @param {string} message - Message to display
     * @param {Function} onConfirm - Callback when user confirms
     * @param {Object} options - Optional settings
     * @param {string} options.confirmLabel - Label for confirm button (default: 'Confirm')
     * @param {string} options.cancelLabel - Label for cancel button (default: 'Cancel')
     * @param {boolean} options.destructive - Style confirm button as destructive (red)
     */
    constructor(title, message, onConfirm, options = {}) {
        super({ styleClass: 'zoned-confirm-dialog' });

        this._title = title;
        this._message = message;
        this._onConfirm = onConfirm;
        this._options = {
            confirmLabel: options.confirmLabel || 'Confirm',
            cancelLabel: options.cancelLabel || 'Cancel',
            destructive: options.destructive || false
        };

        this._buildUI();

        logger.debug(`ConfirmDialog created: "${title}"`);
    }

    /**
     * Build the dialog UI
     * @private
     */
    _buildUI() {
        // Add title
        const titleLabel = new St.Label({
            text: this._title,
            style: 'font-weight: bold; font-size: 14pt; margin-bottom: 12px;'
        });
        this.contentLayout.add_child(titleLabel);

        // Add message
        const messageLabel = new St.Label({
            text: this._message,
            style: 'line-height: 1.4;'
        });
        messageLabel.clutter_text.line_wrap = true;
        this.contentLayout.add_child(messageLabel);

        // Add buttons using ModalDialog's button system
        this.setButtons([
            {
                label: this._options.cancelLabel,
                action: () => this.close(),
                key: Clutter.KEY_Escape,
                default: !this._options.destructive  // Cancel is default unless destructive
            },
            {
                label: this._options.confirmLabel,
                action: () => {
                    if (this._onConfirm) {
                        this._onConfirm();
                    }
                    this.close();
                },
                key: Clutter.KEY_Return,
                default: this._options.destructive  // Confirm is default for destructive actions
            }
        ]);

        logger.debug('ConfirmDialog UI built');
    }
}
