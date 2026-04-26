import {defineConfig} from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        include: ['tests/unit/**/*.test.ts'],
        globals: true,
        environment: 'node',
    },
    resolve: {
        alias: {
            // Mock GJS/GNOME imports that don't exist in Node
            '@girs/gio-2.0': path.resolve(__dirname, 'tests/mocks/gio.ts'),
            '@girs/glib-2.0': path.resolve(__dirname, 'tests/mocks/glib.ts'),
        },
    },
});
