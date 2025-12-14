/**
 * ESLint Configuration for Zoned GNOME Shell Extension
 * 
 * Uses ESLint 9.x flat config format with GNOME/GJS-specific rules.
 * Reference: https://gjs.guide/extensions/review-guidelines/review-guidelines.html
 */

import js from '@eslint/js';
import globals from 'globals';

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
            
            // Complexity check (as per mvp-release-checklist)
            'complexity': ['warn', 10],
            
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
