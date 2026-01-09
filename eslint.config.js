/**
 * ESLint Configuration for Zoned GNOME Shell Extension
 * 
 * Uses ESLint 9.x flat config format with GNOME/GJS-specific rules.
 * Reference: https://gjs.guide/extensions/review-guidelines/review-guidelines.html
 */

import js from '@eslint/js';
import globals from 'globals';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
    // Base recommended rules
    js.configs.recommended,

    // Main configuration for extension files
    {
        files: ['extension/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                // GJS/GNOME Shell globals
                ...globals.es2021,
                
                // GNOME Shell specific globals
                global: 'readonly',
                imports: 'readonly',
                log: 'readonly',
                logError: 'readonly',
                print: 'readonly',
                printerr: 'readonly',
                
                // GLib main loop
                ARGV: 'readonly',
                
                // Console API (available in GJS)
                console: 'readonly',
                
                // Timer functions (GJS provides these)
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                
                // TextEncoder/TextDecoder (available in GJS)
                TextEncoder: 'readonly',
                TextDecoder: 'readonly',
            },
        },
        rules: {
            // ==========================================
            // GNOME Extension Review Requirements
            // ==========================================
            
            // Disallow eval and Function constructor (security blocker)
            'no-eval': 'error',
            'no-new-func': 'error',
            'no-implied-eval': 'error',
            
            // Disallow debugger statements
            'no-debugger': 'error',
            
            // Require consistent use of strict mode
            'strict': ['error', 'never'],  // ESM modules are implicitly strict
            
            // ==========================================
            // Code Quality
            // ==========================================
            
            // Disallow direct console usage (use Logger class from utils/debug.js)
            // This ensures consistent logging that respects debug-logging setting
            'no-console': ['warn', {allow: ['error', 'warn']}],
            
            // Complexity check (as per mvp-release-checklist)
            'complexity': ['error', 10],
            
            // Prevent common mistakes
            'no-unused-vars': ['warn', { 
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],
            'no-undef': 'error',
            'no-unreachable': 'error',
            'no-constant-condition': 'warn',
            
            // Encourage good practices
            'eqeqeq': ['warn', 'smart'],
            'no-var': 'warn',
            'prefer-const': 'warn',
            
            // ==========================================
            // Style (warnings, not errors)
            // ==========================================
            
            // Consistent spacing
            'indent': ['warn', 4, { SwitchCase: 1 }],
            'no-trailing-spaces': 'warn',
            'eol-last': ['warn', 'always'],
            
            // Consistent quotes (single preferred in JS)
            'quotes': ['warn', 'single', { avoidEscape: true }],
            
            // Semicolons optional but be consistent
            'semi': ['warn', 'always'],
            
            // Line length (reasonable limit)
            'max-len': ['warn', { 
                code: 120,
                ignoreUrls: true,
                ignoreStrings: true,
                ignoreTemplateLiterals: true,
                ignoreRegExpLiterals: true,
            }],
            
            // Brace style
            'brace-style': ['warn', '1tbs', { allowSingleLine: true }],
            
            // Spacing in objects
            'object-curly-spacing': ['warn', 'never'],
            'array-bracket-spacing': ['warn', 'never'],
            
            // Consistent comma style
            'comma-dangle': ['warn', 'always-multiline'],
            'comma-spacing': ['warn', { before: false, after: true }],
        },
    },

    // Special rules for debug utility (allows console usage)
    {
        files: ['extension/utils/debug.js'],
        rules: {
            'no-console': 'off',
        },
    },

    // Special rules for prefs.js (runs in separate GTK process, uses local log helper)
    {
        files: ['extension/prefs.js'],
        rules: {
            'no-console': 'off',
        },
    },

    // TypeScript configuration
    {
        files: ['extension/**/*.ts'],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: 2022,
                sourceType: 'module',
                project: './tsconfig.json',
            },
            globals: {
                // GJS/GNOME Shell globals
                ...globals.es2021,
                
                // GNOME Shell specific globals
                global: 'readonly',
                imports: 'readonly',
                log: 'readonly',
                logError: 'readonly',
                print: 'readonly',
                printerr: 'readonly',
                
                // GLib main loop
                ARGV: 'readonly',
                
                // Console API (available in GJS)
                console: 'readonly',
                
                // Timer functions (GJS provides these)
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                
                // TextEncoder/TextDecoder (available in GJS)
                TextEncoder: 'readonly',
                TextDecoder: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tseslint,
        },
        rules: {
            // ==========================================
            // TypeScript-specific rules
            // ==========================================
            
            // Disable base rules that are handled by TypeScript
            'no-undef': 'off',  // TypeScript handles this
            'no-unused-vars': 'off',  // Use TypeScript version instead
            
            // TypeScript equivalents
            '@typescript-eslint/no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-non-null-assertion': 'warn',
            
            // Security (same as JS)
            'no-eval': 'error',
            'no-new-func': 'error',
            'no-implied-eval': 'error',
            'no-debugger': 'error',
            
            // Code quality
            'complexity': ['error', 10],
            'no-console': ['warn', {allow: ['error', 'warn']}],
            'eqeqeq': ['warn', 'smart'],
            
            // Style
            'indent': ['warn', 4, { SwitchCase: 1 }],
            'no-trailing-spaces': 'warn',
            'eol-last': ['warn', 'always'],
            'quotes': ['warn', 'single', { avoidEscape: true }],
            'semi': ['warn', 'always'],
            'max-len': ['warn', { 
                code: 120,
                ignoreUrls: true,
                ignoreStrings: true,
                ignoreTemplateLiterals: true,
                ignoreRegExpLiterals: true,
            }],
            'brace-style': ['warn', '1tbs', { allowSingleLine: true }],
            'object-curly-spacing': ['warn', 'never'],
            'array-bracket-spacing': ['warn', 'never'],
            'comma-dangle': ['warn', 'always-multiline'],
            'comma-spacing': ['warn', { before: false, after: true }],
        },
    },

    // Ignore patterns
    {
        ignores: [
            'node_modules/',
            'build/',
            'dist/',
            '*.zip',
            '**/*.gschema.compiled',
        ],
    },
];
