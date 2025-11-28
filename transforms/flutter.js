// Flutter/Dart specific transforms
import StyleDictionary from 'style-dictionary';

export function registerFlutterTransforms(SD) {
    // Name transform ONLY - convert token names to camelCase for Dart
    SD.registerTransform({
        name: 'name/flutter/camel',
        type: 'name',
        transform: (token) => {
            let path = [...token.path];
            
            // Remove collection name (first part)
            if (path.length > 0) path.shift();
            
            // Remove theme layer if present
            if (path.length > 0 && (path[0] === 'light-theme' || path[0] === 'dark-theme')) {
                path.shift();
            }
            
            // Convert to camelCase
            return path
                .map((part, index) => {
                    const cleaned = part.replace(/[^a-zA-Z0-9]/g, ' ').trim();
                    const words = cleaned.split(/\s+/);
                    
                    return words.map((word, wordIndex) => {
                        if (index === 0 && wordIndex === 0) {
                            return word.toLowerCase();
                        }
                        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                    }).join('');
                })
                .join('');
        }
    });

    // Register Flutter transform group - ONLY name transforms, NO value transforms
    SD.registerTransformGroup({
        name: 'flutter',
        transforms: [
            'attribute/cti',      // Built-in: adds category/type/item metadata
            'name/flutter/camel'  // Custom: converts names to camelCase
        ]
    });

    // Format function handles ALL value transformations
    SD.registerFormat({
        name: 'custom/flutter-dart',
        format: ({ dictionary, options }) => {
            const className = options?.className || 'AppTokens';
            
            let output = `//\n`;
            output += `// ${options?.file?.destination || 'tokens.dart'}\n`;
            output += `//\n\n`;
            output += `// Do not edit directly, this file was auto-generated.\n\n\n\n`;
            output += `import 'dart:ui';\n`;
            output += `import 'package:flutter/material.dart';\n\n`;
            output += `class ${className} {\n`;
            output += `  ${className}._();\n\n`;
            
            // Transform and output all tokens
            dictionary.allTokens.forEach(token => {
                // Detect if this is a reference or direct value
                const isReference = token.original?.value && 
                                   typeof token.original.value === 'string' && 
                                   token.original.value.startsWith('{');
                
                // Use token.value for references (already resolved), token.original.value for direct values
                const value = isReference ? token.value : (token.original?.value || token.value);
                const type = token.type;
                let outputValue;
                
                // Transform based on token type (original values, not pre-transformed)
                if (type === 'color') {
                    // Check if already transformed (from reference resolution)
                    if (typeof value === 'string' && value.startsWith('Color(')) {
                        outputValue = value;
                    } else if (typeof value === 'string' && value.startsWith('rgba(')) {
                        // Parse RGBA format: rgba(r, g, b, a)
                        const match = value.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
                        if (match) {
                            const r = parseInt(match[1]);
                            const g = parseInt(match[2]);
                            const b = parseInt(match[3]);
                            const a = parseFloat(match[4]);
                            
                            // Convert alpha to hex (0-255)
                            const alphaHex = Math.round(a * 255).toString(16).padStart(2, '0');
                            const hex = `${alphaHex}${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                            outputValue = `Color(0x${hex.toUpperCase()})`;
                        } else {
                            outputValue = 'Color(0xFF000000)';
                        }
                    } else {
                        // Parse hex format: #RRGGBB or #RRGGBBAA
                        let hex = value.replace('#', '').toUpperCase();
                        if (hex.length === 6) {
                            outputValue = `Color(0xFF${hex})`;
                        } else if (hex.length === 8) {
                            const rgb = hex.substring(0, 6);
                            const alpha = hex.substring(6, 8);
                            outputValue = `Color(0x${alpha}${rgb})`;
                        } else {
                            outputValue = `Color(0xFF000000)`;
                        }
                    }
                } else if (type === 'dimension' || type === 'sizing' || type === 'spacing') {
                    // Convert "Xpx" to X.00
                    const num = parseFloat(value);
                    outputValue = isNaN(num) ? '0.00' : num.toFixed(2);
                } else if (type === 'fontWeight') {
                    // Convert to FontWeight.wXXX
                    const weight = parseInt(value);
                    outputValue = isNaN(weight) ? 'FontWeight.w400' : `FontWeight.w${weight}`;
                } else if (type === 'fontFamily') {
                    // Quote font family names
                    outputValue = `'${value.replace(/'/g, "\\'")}'  `;
                } else if (typeof value === 'number') {
                    outputValue = value.toFixed(2);
                } else if (typeof value === 'string') {
                    // Check if it's a number with px
                    if (value.endsWith('px')) {
                        const num = parseFloat(value);
                        outputValue = isNaN(num) ? '0.00' : num.toFixed(2);
                    } else {
                        outputValue = `'${value.replace(/'/g, "\\'")}'  `;
                    }
                } else {
                    outputValue = String(value);
                }
                
                output += `  static const ${token.name} = ${outputValue};\n`;
            });
            
            output += `}\n`;
            
            return output;
        }
    });
}
