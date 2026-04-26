/**
 * Unit tests for versionUtil
 *
 * Tests version resolution logic with mocked GLib/Gio file I/O.
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';

// The @girs imports are aliased in vitest.config.ts to our mock modules.
// We override specific behavior per test using vi.mocked().

import {getExtensionVersion} from '../../../extension/utils/versionUtil';
import type {ExtensionMetadata} from '../../../extension/utils/versionUtil';
import Gio from '@girs/gio-2.0';

describe('getExtensionVersion', () => {
    const baseMetadata: ExtensionMetadata = {
        version: 7,
        'version-name': '0.9.1',
    };

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns metadata version when no override file exists', () => {
        // Default mock: query_exists returns false
        const result = getExtensionVersion('/ext', baseMetadata);
        expect(result.name).toBe('0.9.1');
        expect(result.display).toBe('0.9.1');
        expect(result.ego).toBe(7);
        expect(result.isDev).toBe(false);
    });

    it('returns dev version when override file exists', () => {
        const devVersion = '0.9.1-dev-20260109-133000';
        vi.spyOn(Gio.File, 'new_for_path').mockReturnValue({
            query_exists: () => true,
            load_contents: () => [true, new TextEncoder().encode(devVersion)],
        } as ReturnType<typeof Gio.File.new_for_path>);

        const result = getExtensionVersion('/ext', baseMetadata);
        expect(result.name).toBe(devVersion);
        expect(result.display).toBe(`${devVersion} (Development Build)`);
        expect(result.ego).toBe(7);
        expect(result.isDev).toBe(true);
    });

    it('falls back to metadata when override read fails', () => {
        vi.spyOn(Gio.File, 'new_for_path').mockReturnValue({
            query_exists: () => true,
            load_contents: () => {
                throw new Error('read error');
            },
        } as ReturnType<typeof Gio.File.new_for_path>);

        const result = getExtensionVersion('/ext', baseMetadata);
        expect(result.isDev).toBe(false);
        expect(result.name).toBe('0.9.1');
    });

    it('falls back to version number when version-name is missing', () => {
        const metadata: ExtensionMetadata = {version: 7};
        const result = getExtensionVersion('/ext', metadata);
        expect(result.name).toBe('7');
    });

    it('uses version-display when available', () => {
        const metadata: ExtensionMetadata = {
            version: 7,
            'version-name': '0.9.1',
            'version-display': '0.9.1 (Custom)',
        };
        const result = getExtensionVersion('/ext', metadata);
        expect(result.display).toBe('0.9.1 (Custom)');
    });

    it('trims whitespace from override file content', () => {
        vi.spyOn(Gio.File, 'new_for_path').mockReturnValue({
            query_exists: () => true,
            load_contents: () => [true, new TextEncoder().encode('  0.9.1-dev  \n')],
        } as ReturnType<typeof Gio.File.new_for_path>);

        const result = getExtensionVersion('/ext', baseMetadata);
        expect(result.name).toBe('0.9.1-dev');
    });
});
