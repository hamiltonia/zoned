/**
 * ConfirmDialog - Simple confirmation dialog using GNOME's ModalDialog
 *
 * Replaces the broken custom MessageDialog with proper GNOME Shell integration.
 * Uses ModalDialog.ModalDialog for proper modal stack handling.
 *
 * NOTE: This dialog uses GNOME's ModalDialog which creates its own modal layer.
 * For use within existing modal contexts (like LayoutSwitcher or LayoutSettingsDialog),
 * prefer using inline confirmation overlays to avoid z-order issues with
 * LayoutPreviewBackground and other custom overlays in Main.uiGroup.
 */

import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import {createLogger} from '../utils/debug.js';
import {ThemeManager} from '../utils/theme.js';

const logger = createLogger('ConfirmDialog');

/**
 * Handle enter-event on destructive confirm button for hover styling
 * Module-level handler (Wave 3: avoid arrow function closure)
 * @param {St.Button} button - The confirm button
 * @returns {boolean} Clutter.EVENT_PROPAGATE
 */
function handleConfirmButtonEnter(button) {
    button.style = `
        background-color: #a01720;
        color: white;
        border: none;
    `;
    return Clutter.EVENT_PROPAGATE;
}

/**
 * Handle leave-event on destructive confirm button to restore styling
 * Module-level handler (Wave 3: avoid arrow function closure)
 * @param {St.Button} button - The confirm button
 * @returns {boolean} Clutter.EVENT_PROPAGATE
 */
function handleConfirmButtonLeave(button) {
    button.style = `
        background-color: #c01c28;
        color: white;
        border: none;
    `;
    return Clutter.EVENT_PROPAGATE;
}

/**
 * ConfirmDialog - Simple yes/no confirmation
 *
 * Usage:
 *   const dialog = new ConfirmDialog(
 *       'Delete Layout',
 *       'Are you sure you want to delete this layout?',
 *       () => { // confirmed
 *           layoutManager.delete(id);
 *       }
 *   );
 *   dialog.open();
 */
export const ConfirmDialog = GObject.registerClass(
    class ConfirmDialog extends ModalDialog.ModalDialog {
    /**
     * Create a new confirmation dialog
     * @param {string} title - Dialog title
     * @param {string} message - Message to display
     * @param {Function} onConfirm - Callback when user confirms
     * @param {Object} options - Optional settings
     * @param {string} options.confirmLabel - Label for confirm button (default: 'Confirm')
     * @param {string} options.cancelLabel - Label for cancel button (default: 'Cancel')
     * @param {boolean} options.destructive - Style confirm button as destructive (red)
     * @param {Object} options.settings - GSettings object for theme support
     * @param {Function} options.onCancel - Callback when user cancels (optional)
     */
        constructor(title, message, onConfirm, options = {}) {
            super({styleClass: 'zoned-confirm-dialog'});

            this._title = title;
            this._message = message;
            this._onConfirm = onConfirm;
            this._onCancel = options.onCancel || null;
            this._options = {
                confirmLabel: options.confirmLabel || 'Confirm',
                cancelLabel: options.cancelLabel || 'Cancel',
                destructive: options.destructive || false,
            };

            // Create ThemeManager if settings provided
            this._themeManager = options.settings ? new ThemeManager(options.settings) : null;

            this._buildUI();

            logger.debug(`ConfirmDialog created: "${title}"`);
        }

        /**
     * Apply CSS custom properties to dialog for stylesheet theming
     * Uses dialogLayout which is the actual container element
     * @private
     */
        _applyCSSVariables() {
            if (!this._themeManager) {
                return;
            }

            const colors = this._themeManager.getColors();

            // Use dialogLayout instead of _dialog (which doesn't exist in GNOME's ModalDialog)
            if (this.dialogLayout) {
                const style = this.dialogLayout.get_style();
                this.dialogLayout.set_style(
                    (style || '') +
                `--zoned-container-bg: ${colors.containerBg}; ` +
                `--zoned-card-bg: ${colors.cardBg}; ` +
                `--zoned-text-primary: ${colors.textPrimary}; ` +
                `--zoned-text-secondary: ${colors.textSecondary}; ` +
                `--zoned-text-muted: ${colors.textMuted}; ` +
                `--zoned-accent: ${colors.accentHex}; ` +
                `--zoned-button-bg: ${colors.buttonBg}; ` +
                `--zoned-button-text: ${colors.buttonText}; ` +
                `--zoned-button-bg-hover: ${colors.buttonBgHover}; ` +
                `--zoned-accent-hover: ${colors.accentHexHover}; ` +
                `--zoned-border: ${colors.border};`,
                );

                // Apply theme class
                const themeClass = colors.isDark ? 'zoned-theme-dark' : 'zoned-theme-light';
                this.dialogLayout.add_style_class_name(themeClass);
            }
        }

        /**
     * Override open() to apply CSS variables when dialog is shown
     * @override
     */
        open() {
            const result = super.open();

            // Apply CSS variables to dialogLayout
            this._applyCSSVariables();

            return result;
        }

        /**
     * Build the dialog UI
     * @private
     */
        _buildUI() {
        // Apply CSS custom properties to dialog root for stylesheet
            this._applyCSSVariables();

            // Add title
            const titleLabel = new St.Label({
                text: this._title,
                style: 'font-weight: bold; font-size: 14pt; margin-bottom: 12px;',
            });
            this.contentLayout.add_child(titleLabel);

            // Add message
            const messageLabel = new St.Label({
                text: this._message,
                style: 'line-height: 1.4;',
            });
            messageLabel.clutter_text.line_wrap = true;
            this.contentLayout.add_child(messageLabel);

            // Add buttons using ModalDialog's button system
            this.setButtons([
                {
                    label: this._options.cancelLabel,
                    action: () => {
                        if (this._onCancel) {
                            this._onCancel();
                        }
                        this.close();
                    },
                    key: Clutter.KEY_Escape,
                    default: !this._options.destructive,  // Cancel is default unless destructive
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
                    default: this._options.destructive,  // Confirm is default for destructive actions
                },
            ]);

            // Apply destructive styling to confirm button if requested
            // The confirm button is the second button in the button layout
            if (this._options.destructive && this.buttonLayout) {
                const buttons = this.buttonLayout.get_children();
                if (buttons.length >= 2) {
                    const confirmButton = buttons[1];
                    // Red destructive styling matching layoutSwitcher's delete confirmation
                    confirmButton.style = `
                    background-color: #c01c28;
                    color: white;
                    border: none;
                `;
                    // Also style on hover (Wave 3: bound methods)
                    const boundEnter = handleConfirmButtonEnter.bind(null, confirmButton);
                    const boundLeave = handleConfirmButtonLeave.bind(null, confirmButton);
                    confirmButton.connect('enter-event', boundEnter);
                    confirmButton.connect('leave-event', boundLeave);
                    confirmButton._boundEnter = boundEnter;  // Store for potential cleanup
                    confirmButton._boundLeave = boundLeave;  // Store for potential cleanup
                }
            }
        }

        /**
         * Override destroy to clean up ThemeManager
         */
        destroy() {
            if (this._themeManager) {
                this._themeManager.destroy();
                this._themeManager = null;
            }
            super.destroy();
        }
    });
