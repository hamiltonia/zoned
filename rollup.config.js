/**
 * Rollup Configuration for Zoned GNOME Shell Extension
 * 
 * Transforms TypeScript with @girs/* imports into JavaScript with gi:// imports
 * for GJS runtime compatibility.
 */

import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import cleanup from 'rollup-plugin-cleanup';
import ts from 'typescript';

/**
 * Custom TypeScript transformer that converts @girs/* imports to gi:// imports
 * 
 * Examples:
 *   @girs/glib-2.0 → gi://GLib
 *   @girs/gio-2.0 → gi://Gio
 *   @girs/shell-14 → gi://Shell
 *   @girs/st-14 → gi://St
 *   @girs/clutter-14 → gi://Clutter
 *   @girs/meta-14 → gi://Meta
 */

// Mapping of @girs package names to GJS import names
const GIRS_TO_GI_MAP = {
    'glib': 'GLib',
    'gobject': 'GObject',
    'gio': 'Gio',
    'gtk': 'Gtk',
    'gdk': 'Gdk',
    'gdkpixbuf': 'GdkPixbuf',
    'pango': 'Pango',
    'cairo': 'Cairo',
    'atk': 'Atk',
    'shell': 'Shell',
    'st': 'St',
    'clutter': 'Clutter',
    'meta': 'Meta',
    'cogl': 'Cogl',
    'coglpango': 'CoglPango',
    'graphene': 'Graphene',
    'gvc': 'Gvc',
    'nm': 'NM',
    'polkit': 'Polkit',
};

function createGirsTransformer() {
    return {
        type: 'program',
        factory: (program) => {
            return (context) => {
                return (sourceFile) => {
                    const visitor = (node) => {
                        // Check if this is an import declaration
                        if (ts.isImportDeclaration(node) && 
                            node.moduleSpecifier && 
                            ts.isStringLiteral(node.moduleSpecifier)) {
                            
                            const moduleSpecifier = node.moduleSpecifier.text;
                            
                            // Transform @girs/* imports to gi:// imports
                            if (moduleSpecifier.startsWith('@girs/')) {
                                // Extract the package name and strip @girs/ prefix
                                const packageName = moduleSpecifier.replace('@girs/', '');
                                
                                // Strip version suffixes (-2.0, -14, etc.)
                                const baseName = packageName.replace(/-\d+\.?\d*$/, '');
                                
                                // Look up the correct GI name from our mapping
                                // Fall back to PascalCase conversion if not in map
                                const giName = GIRS_TO_GI_MAP[baseName] || 
                                    baseName
                                        .split('-')
                                        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
                                        .join('');
                                
                                // Create the gi:// import
                                const giImport = `gi://${giName}`;
                                
                                // Return updated import declaration
                                return ts.factory.updateImportDeclaration(
                                    node,
                                    node.modifiers,
                                    node.importClause,
                                    ts.factory.createStringLiteral(giImport),
                                    undefined
                                );
                            }
                        }
                        
                        // Visit child nodes
                        return ts.visitEachChild(node, visitor, context);
                    };
                    
                    return ts.visitNode(sourceFile, visitor);
                };
            };
        }
    };
}

// Shared configuration for all TypeScript builds
const createTSBuildConfig = (inputFile, outputFile) => ({
    input: inputFile,
    output: {
        file: outputFile,
        format: 'es',
        generatedCode: { 
            constBindings: true 
        }
    },
    external: [
        // Mark all GJS imports as external (don't bundle)
        /^gi:\/\/.*/,
        // Mark GNOME Shell resource imports as external
        /^resource:\/\/\/org\/gnome\/.*/
    ],
    plugins: [
        nodeResolve({ 
            preferBuiltins: false 
        }),
        typescript({
            tsconfig: './tsconfig.json',
            compilerOptions: {
                outDir: undefined,  // Let Rollup handle output
                declarationDir: undefined
            },
            transformers: {
                before: [createGirsTransformer()]
            }
        }),
        cleanup({
            comments: 'some',
            extensions: ['js', 'ts']
        })
    ]
});

export default [
    // Utilities
    createTSBuildConfig('extension/utils/versionUtil.ts', 'build/rollup/utils/versionUtil.js'),
    createTSBuildConfig('extension/utils/theme.ts', 'build/rollup/utils/theme.js'),
    createTSBuildConfig('extension/utils/debug.ts', 'build/rollup/utils/debug.js'),
    createTSBuildConfig('extension/utils/signalTracker.ts', 'build/rollup/utils/signalTracker.js'),
    createTSBuildConfig('extension/utils/resourceTracker.ts', 'build/rollup/utils/resourceTracker.js'),
    createTSBuildConfig('extension/utils/notificationService.ts', 'build/rollup/utils/notificationService.js'),
    createTSBuildConfig('extension/utils/keybindingConfig.ts', 'build/rollup/utils/keybindingConfig.js'),
    createTSBuildConfig('extension/utils/layoutConverter.ts', 'build/rollup/utils/layoutConverter.js'),
    createTSBuildConfig('extension/utils/debugInterface.ts', 'build/rollup/utils/debugInterface.js'),
    
    // Core Data/Templates
    createTSBuildConfig('extension/templateManager.ts', 'build/rollup/templateManager.js'),
    
    // State Managers (Group 2)
    createTSBuildConfig('extension/spatialStateManager.ts', 'build/rollup/spatialStateManager.js'),
    createTSBuildConfig('extension/layoutManager.ts', 'build/rollup/layoutManager.js'),
];
