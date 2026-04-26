/**
 * Unit tests for keybindingConfig
 *
 * Pure logic module — no GJS mocks needed.
 */

import {describe, it, expect} from 'vitest';
import {
    normalizeAccelerator,
    acceleratorsMatch,
    KEY_ALIASES,
    GNOME_BINDINGS,
    ZONED_BINDINGS,
} from '../../../extension/utils/keybindingConfig';

describe('normalizeAccelerator', () => {
    it('normalizes Above_Tab to grave', () => {
        expect(normalizeAccelerator('<Super>Above_Tab')).toBe('<Super>grave');
    });

    it('normalizes quoteleft to grave', () => {
        expect(normalizeAccelerator('<Super>quoteleft')).toBe('<Super>grave');
    });

    it('normalizes numpad keys to regular numbers', () => {
        expect(normalizeAccelerator('<Super>KP_1')).toBe('<Super>1');
        expect(normalizeAccelerator('<Super>KP_0')).toBe('<Super>0');
        expect(normalizeAccelerator('<Super>KP_9')).toBe('<Super>9');
    });

    it('normalizes numpad operators', () => {
        expect(normalizeAccelerator('<Ctrl>KP_Add')).toBe('<Ctrl>plus');
        expect(normalizeAccelerator('<Ctrl>KP_Subtract')).toBe('<Ctrl>minus');
        expect(normalizeAccelerator('<Ctrl>KP_Multiply')).toBe('<Ctrl>asterisk');
        expect(normalizeAccelerator('<Ctrl>KP_Divide')).toBe('<Ctrl>slash');
        expect(normalizeAccelerator('<Ctrl>KP_Decimal')).toBe('<Ctrl>period');
    });

    it('normalizes KP_Enter to Return', () => {
        expect(normalizeAccelerator('<Ctrl>KP_Enter')).toBe('<Ctrl>Return');
    });

    it('normalizes ISO_Left_Tab to Tab', () => {
        expect(normalizeAccelerator('<Shift>ISO_Left_Tab')).toBe('<Shift>Tab');
    });

    it('normalizes page keys', () => {
        expect(normalizeAccelerator('<Ctrl>Prior')).toBe('<Ctrl>Page_Up');
        expect(normalizeAccelerator('<Ctrl>Next')).toBe('<Ctrl>Page_Down');
    });

    it('handles bare key without modifiers', () => {
        expect(normalizeAccelerator('Above_Tab')).toBe('grave');
        expect(normalizeAccelerator('KP_5')).toBe('5');
    });

    it('returns empty/falsy input unchanged', () => {
        expect(normalizeAccelerator('')).toBe('');
    });

    it('leaves non-aliased keys unchanged', () => {
        expect(normalizeAccelerator('<Super>Left')).toBe('<Super>Left');
        expect(normalizeAccelerator('<Super>z')).toBe('<Super>z');
    });
});

describe('acceleratorsMatch', () => {
    it('matches identical accelerators', () => {
        expect(acceleratorsMatch('<Super>Left', '<Super>Left')).toBe(true);
    });

    it('matches with different modifier order', () => {
        expect(acceleratorsMatch('<Super><Ctrl>Left', '<Ctrl><Super>Left')).toBe(true);
    });

    it('matches aliased keys', () => {
        expect(acceleratorsMatch('<Super>Above_Tab', '<Super>grave')).toBe(true);
        expect(acceleratorsMatch('<Super>KP_1', '<Super>1')).toBe(true);
    });

    it('is case-insensitive for key names', () => {
        expect(acceleratorsMatch('<Super>left', '<Super>Left')).toBe(true);
    });

    it('does not match different keys', () => {
        expect(acceleratorsMatch('<Super>Left', '<Super>Right')).toBe(false);
    });

    it('does not match different modifiers', () => {
        expect(acceleratorsMatch('<Super>Left', '<Ctrl>Left')).toBe(false);
    });

    it('does not match different modifier counts', () => {
        expect(acceleratorsMatch('<Super><Ctrl>Left', '<Super>Left')).toBe(false);
    });

    it('returns false for empty inputs', () => {
        expect(acceleratorsMatch('', '<Super>Left')).toBe(false);
        expect(acceleratorsMatch('<Super>Left', '')).toBe(false);
        expect(acceleratorsMatch('', '')).toBe(false);
    });
});

describe('binding constants', () => {
    it('GNOME_BINDINGS has expected structure', () => {
        expect(GNOME_BINDINGS.length).toBeGreaterThan(0);
        for (const binding of GNOME_BINDINGS) {
            expect(binding).toHaveProperty('schema');
            expect(binding).toHaveProperty('key');
            expect(binding).toHaveProperty('name');
            expect(typeof binding.schema).toBe('string');
            expect(typeof binding.key).toBe('string');
            expect(typeof binding.name).toBe('string');
        }
    });

    it('ZONED_BINDINGS has expected structure', () => {
        expect(ZONED_BINDINGS.length).toBeGreaterThan(0);
        for (const binding of ZONED_BINDINGS) {
            expect(binding).toHaveProperty('key');
            expect(binding).toHaveProperty('name');
            expect(binding).toHaveProperty('enhanced');
        }
    });

    it('ZONED_BINDINGS contains core and enhanced bindings', () => {
        const core = ZONED_BINDINGS.filter(b => !b.enhanced);
        const enhanced = ZONED_BINDINGS.filter(b => b.enhanced);
        expect(core.length).toBeGreaterThan(0);
        expect(enhanced.length).toBeGreaterThan(0);
    });

    it('KEY_ALIASES covers all documented aliases', () => {
        expect(KEY_ALIASES['Above_Tab']).toBe('grave');
        expect(KEY_ALIASES['KP_Enter']).toBe('Return');
        expect(KEY_ALIASES['ISO_Left_Tab']).toBe('Tab');
        expect(KEY_ALIASES['Prior']).toBe('Page_Up');
        expect(KEY_ALIASES['Next']).toBe('Page_Down');
    });
});
