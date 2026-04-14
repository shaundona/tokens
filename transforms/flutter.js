// Flutter/Dart specific transforms
import StyleDictionary from 'style-dictionary';
import { readFileSync, readdirSync, existsSync } from 'fs';

// Helper function to capitalize first letter
function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Helper function to convert PascalCase to kebab-case
function toKebabCase(str) {
    return str
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .slice(1);
}

// Figma/font style name → numeric font weight
const FONT_WEIGHT_NAME_TO_NUMBER = {
    'thin': 100, 'hairline': 100,
    'extralight': 200, 'extra-light': 200, 'ultralight': 200, 'ultra-light': 200,
    'light': 300,
    'regular': 400, 'normal': 400, 'book': 400,
    'medium': 500,
    'semibold': 600, 'semi-bold': 600, 'demibold': 600, 'demi-bold': 600,
    'bold': 700,
    'extrabold': 800, 'extra-bold': 800, 'ultrabold': 800, 'ultra-bold': 800,
    'black': 900, 'heavy': 900
};

function resolveWeightToNumber(value) {
    const num = parseInt(String(value));
    if (!isNaN(num)) return num;
    return FONT_WEIGHT_NAME_TO_NUMBER[String(value).toLowerCase().trim()] || null;
}

// ── Motion token helpers (inlined — cannot be imported at runtime) ────────────
const FLUTTER_EASING_MAP = {
  '0,0,1,1': 'Curves.linear',
  '0.25,0.1,0.25,1': 'Curves.ease',
  '0.42,0,1,1': 'Curves.easeIn',
  '0,0,0.58,1': 'Curves.easeOut',
  '0.42,0,0.58,1': 'Curves.easeInOut',
  '0.4,0,0.2,1': 'Curves.fastOutSlowIn',
  '0,0,0.2,1': 'Curves.easeOutCubic',
  '0.05,0.7,0.1,1': 'Curves.easeInOutCubicEmphasized'
};

function detectMotionToken(token) {
  if (!token.description) return null;
  const match = token.description.match(/@motion-(duration|delay|easing|curve|scale|translate-x|translate-y|rotate)/i);
  if (!match) return null;
  const type = match[1].toLowerCase() === 'curve' ? 'easing' : match[1].toLowerCase();
  return { type, isValid: true, errors: [] };
}

function validateMotionValue(token, meta) {
  const errors = [...meta.errors];
  const { value } = token;
  if (meta.type === 'duration' || meta.type === 'delay') {
    if (typeof value !== 'number') {
      errors.push(`Expected number for @motion-${meta.type}, got ${typeof value}: "${value}". Did you mean @motion-easing?`);
    } else if (value < 0) {
      errors.push(`@motion-${meta.type} cannot be negative: ${value}`);
    } else if (value > 10000) {
      errors.push(`@motion-${meta.type} seems unusually large: ${value}ms (did you mean seconds?)`);
    }
  } else if (meta.type === 'easing') {
    if (typeof value !== 'string') {
      errors.push(`Expected string for @motion-easing, got ${typeof value}: ${value}. Did you mean @motion-duration or @motion-delay?`);
    } else {
      const parts = value.split(',').map(v => parseFloat(v.trim()));
      if (parts.length !== 4) errors.push(`@motion-easing must have 4 values, got ${parts.length}: ${value}`);
      else if (parts.some(v => isNaN(v))) errors.push(`@motion-easing values must be numbers: ${value}`);
      else if (parts.some(v => v < 0 || v > 1)) errors.push(`@motion-easing values should be between 0 and 1: ${value}`);
    }
  } else if (meta.type === 'scale') {
    if (typeof value !== 'number') errors.push(`@motion-scale must be a number, got ${typeof value}: "${value}"`);
    else if (value < 0) errors.push(`@motion-scale should not be negative: ${value}`);
  } else if (meta.type === 'translate-x' || meta.type === 'translate-y') {
    if (typeof value !== 'number') errors.push(`@motion-${meta.type} must be a number (px), got ${typeof value}: "${value}"`);
  } else if (meta.type === 'rotate') {
    if (typeof value !== 'number') errors.push(`@motion-rotate must be a number (degrees), got ${typeof value}: "${value}"`);
  }
  return { ...meta, isValid: errors.length === 0, errors };
}

function transformMotionValue(token, meta, platform) {
  const { value } = token;
  const num = parseFloat(value);
  if (meta.type === 'easing') {
    const parts = String(value).split(',').map(v => parseFloat(v.trim()));
    if (platform === 'flutter') {
      return FLUTTER_EASING_MAP[parts.join(',')] || `Cubic(${parts.join(', ')})`;
    }
    return `cubic-bezier(${parts.join(', ')})`;
  }
  if (meta.type === 'duration' || meta.type === 'delay') {
    const ms = Math.round(num);
    return platform === 'flutter' ? `Duration(milliseconds: ${ms})` : `${ms}ms`;
  }
  if (meta.type === 'scale') return platform === 'flutter' ? num.toFixed(2) : String(num);
  if (meta.type === 'translate-x' || meta.type === 'translate-y') return platform === 'flutter' ? num.toFixed(2) : `${num}px`;
  if (meta.type === 'rotate') return platform === 'flutter' ? (num * Math.PI / 180).toFixed(4) : `${num}deg`;
  return String(value);
}

function logMotionError(tokenPath, meta) {
  if (!meta.isValid && meta.errors.length > 0) {
    console.error(`❌ Motion token validation failed: ${tokenPath}`);
    console.error(`   Detected as: @motion-${meta.type}`);
    meta.errors.forEach(e => console.error(`   - ${e}`));
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// Helper function to convert PascalCase to snake_case
function toSnakeCase(str) {
    const result = str
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase();
    return result.startsWith('_') ? result.slice(1) : result;
}

// Helper function to generate Flutter-safe class name
function generateFlutterClassName(baseName, tokenData = null) {
    // Extract the actual collection name from the root key if tokenData is provided
    let effectiveName = baseName;
    
    if (tokenData) {
        const rootKey = Object.keys(tokenData)[0];
        if (rootKey) {
            // Strip external- prefix to normalize collection names
            effectiveName = rootKey.replace(/^external-/, '');
        }
    }
    
    // Always use Flutter-safe naming conventions to avoid conflicts with Dart built-ins
    // This happens at build time, so Figma plugin doesn't need to know about it
    const nameMap = {
        'primitives': 'DesignTokens',
        'global-primitive': 'DesignTokens',
        'globalPrimitive': 'DesignTokens',
        'semantics': 'SemanticTokens',
        'semantic': 'SemanticTokens',
        'components': 'ComponentTokens',
        'component': 'ComponentTokens',
        'responsive': 'ResponsiveTokens',
        'responsive-ds': 'ResponsiveDsTokens',
        'motion': 'MotionTokens',
        'motionTokens': 'MotionTokens'
    };
    
    // Use mapped name if available
    if (nameMap[effectiveName]) {
        return nameMap[effectiveName];
    }
    
    // For custom token files, generate a namespaced class name
    // e.g., "typography" → "TypographyTokens"
    const pascalCase = effectiveName
        .split(/[-_\s]+/)
        .map(word => capitalizeFirst(word))
        .join('');
    
    return pascalCase + 'Tokens';
}

function registerFlutterTransforms(SD, config = {}) {
    const removePrefixes = config.removePrefixes !== false; // Default to true
    
    // Name transform ONLY - convert token names to camelCase for Dart
    SD.registerTransform({
        name: 'name/flutter/camel',
        type: 'name',
        transform: (token) => {
            let path = [...token.path];
            console.log('\n[Flutter Name Transform] START');
            console.log('Original path:', JSON.stringify(token.path));
            console.log('removePrefixes setting:', removePrefixes);
            
            // Runtime evaluation of removePrefixes
            if (removePrefixes) {
                // Remove collection name (first part)
                if (path.length > 0) {
                    const removed = path.shift();
                    console.log('Removed collection prefix:', removed);
                }
                
                // Remove theme layer if present
                if (path.length > 0 && (path[0] === 'light-theme' || path[0] === 'dark-theme')) {
                    const removed = path.shift();
                    console.log('Removed theme prefix:', removed);
                }
            }
            
            console.log('Path after prefix removal:', JSON.stringify(path));
            
            // Convert to camelCase
            let isFirstWord = true;
            const result = path
                .map((part, index) => {
                    const cleaned = part.replace(/[^a-zA-Z0-9]/g, ' ').trim();
                    const words = cleaned.split(' ').filter(w => w.length > 0);
                    
                    console.log('Segment ' + index + ': part=' + part + ' cleaned=' + cleaned + ' words=' + JSON.stringify(words));
                    
                    const transformed = words.map((word, wordIndex) => {
                        if (isFirstWord) {
                            console.log('  Word[' + wordIndex + ']: ' + word + ' becomes ' + word.toLowerCase() + ' (first word, lowercase)');
                            isFirstWord = false;
                            return word.toLowerCase();
                        }
                        const result = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                        console.log('  Word[' + wordIndex + ']: ' + word + ' becomes ' + result + ' (capitalize)');
                        return result;
                    }).join('');
                    
                    console.log('Segment ' + index + ' result: ' + transformed);
                    return transformed;
                })
                .join('');
                
            console.log('Final camelCase result:', result);
            console.log('[Flutter Name Transform] END\n');
            return result;
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
            // PRIORITY: Use className from options (set by generateFlutterPlatforms)
            // This ensures Flutter-safe names are used instead of JSON className values
            let className = options?.className;
            
            // Build className map from all token files (needed for reference resolution)
            const classNameMap = {};
            
            try {
                const tokenFiles = readdirSync('tokens').filter(f => f.endsWith('.json'));
                
                for (const fileName of tokenFiles) {
                    const baseName = fileName.replace(/^external-/, '').replace('.json', '');
                    const filePath = `tokens/${fileName}`;
                    const sourceData = JSON.parse(readFileSync(filePath, 'utf8'));
                    const rootKey = Object.keys(sourceData)[0];
                    
                    if (rootKey) {
                        // Build the className map using generateFlutterClassName
                        classNameMap[rootKey] = generateFlutterClassName(baseName, sourceData);
                    }
                }
            } catch (e) {
                console.warn('Could not build className map:', e.message);
            }
            
            // Fallback: If className not provided in options, try to find matching token file
            if (!className) {
                try {
                    const tokenFiles = readdirSync('tokens').filter(f => f.endsWith('.json'));
                    
                    for (const fileName of tokenFiles) {
                        const baseName = fileName.replace(/^external-/, '').replace('.json', '');
                        const filePath = `tokens/${fileName}`;
                        const sourceData = JSON.parse(readFileSync(filePath, 'utf8'));
                        const rootKey = Object.keys(sourceData)[0];
                        
                        if (rootKey && dictionary.tokens[rootKey]) {
                            className = generateFlutterClassName(baseName, sourceData);
                            break;
                        }
                    }
                } catch (e) {
                    // Continue to final fallback
                }
            }
            
            // Final fallback
            className = className || 'AppTokens';
            
            // First pass: Generate all token definitions
            let tokenOutput = '';
            
            dictionary.allTokens.forEach(token => {
                // FIX: Re-generate correct camelCase name since the name transform isn't being applied
                let namePath = [...token.path];
                
                // Remove prefixes if configured
                if (removePrefixes) {
                    if (namePath.length > 0) namePath.shift(); // Remove collection
                    if (namePath.length > 0 && (namePath[0] === 'light-theme' || namePath[0] === 'dark-theme')) {
                        namePath.shift(); // Remove theme
                    }
                }
                
                // Convert to proper camelCase
                let isFirstWord = true;
                const correctName = namePath
                    .map((part) => {
                        const cleaned = part.replace(/[^a-zA-Z0-9]/g, ' ').trim();
                        const words = cleaned.split(' ').filter(w => w.length > 0);
                        
                        return words.map((word) => {
                            if (isFirstWord) {
                                isFirstWord = false;
                                return word.toLowerCase();
                            }
                            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                        }).join('');
                    })
                    .join('');
                
                // Override the incorrect token.name with the correct one
                token.name = correctName;
                
                // Detect if this is a reference or direct value
                const isReference = token.original?.value && 
                                   typeof token.original.value === 'string' && 
                                   token.original.value.startsWith('{');
                
                // Handle outputReferences option
                if (options?.outputReferences && isReference) {
                    // Extract reference path and convert to className.tokenName format
                    const refPath = token.original.value.replace(/[{}]/g, '');
                    let pathParts = refPath.split('.');
                    
                    // Get the root collection (primitives, semantics, components, responsive, etc.)
                    const refCollection = pathParts[0];
                    
                    // Dynamically determine the class name for the reference
                    let refClassName = classNameMap[refCollection] || 'Primitives'; // fallback to Primitives
                    
                    // Remove collection prefix if removePrefixes is true (matches the name transform)
                    if (removePrefixes && pathParts.length > 0) {
                        pathParts = pathParts.slice(1); // Remove first element (collection name)
                        
                        // Also remove theme layer if present
                        if (pathParts.length > 0 && (pathParts[0] === 'light-theme' || pathParts[0] === 'dark-theme')) {
                            pathParts = pathParts.slice(1);
                        }
                    }
                    
                    // Convert reference path to camelCase token name
                    let isFirstWord = true;
                    const refTokenName = pathParts
                        .map((part, index) => {
                            // Replace all non-alphanumeric characters with spaces
                            const cleaned = part.replace(/[^a-zA-Z0-9]/g, ' ').trim();
                            const words = cleaned.split(' ').filter(w => w.length > 0);
                            
                            return words.map((word, wordIndex) => {
                                if (isFirstWord) {
                                    isFirstWord = false;
                                    return word.toLowerCase();
                                }
                                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                            }).join('');
                        })
                        .join('');
                    
                    // Check if reference is to same class (omit prefix for cleaner code)
                    const isSameClass = (refClassName === className);
                    
                    // Output as reference (with or without class prefix)
                    if (isSameClass) {
                        // Same class - no prefix needed
                        tokenOutput += `  static const ${token.name} = ${refTokenName};\n`;
                    } else {
                        // Different class - include prefix
                        tokenOutput += `  static const ${token.name} = ${refClassName}.${refTokenName};\n`;
                    }
                    return; // Skip normal processing
                }
                
                // ── Motion token check ──────────────────────────────────────
                const motionMeta = detectMotionToken(token);
                if (motionMeta) {
                    const rawValue = token.original?.value ?? token.value;
                    const motionToken = { ...token, value: rawValue };
                    const validated = validateMotionValue(motionToken, motionMeta);
                    logMotionError(token.path.join('/'), validated);
                    if (validated.isValid) {
                        tokenOutput += `  static const ${token.name} = ${transformMotionValue(motionToken, validated, 'flutter')};\n`;
                        return;
                    }
                }
                // ────────────────────────────────────────────────────────────
                
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
                    // Flutter logical pixels = CSS pixels (no conversion needed)
                    const num = parseFloat(value);
                    outputValue = isNaN(num) ? '0.00' : num.toFixed(2);
                } else if (type === 'lineHeight') {
                    // Line height is a unitless multiplier (e.g., 1.5), NOT px→rem converted
                    let num = parseFloat(value);
                    // If value has px unit, it's already in pixels and should be converted to ratio
                    if (typeof value === 'string' && value.endsWith('px')) {
                        num = num / 16; // Convert pixels to unitless ratio using base font size
                    }
                    outputValue = isNaN(num) ? '1.00' : num.toFixed(2);
                } else if (type === 'fontWeight') {
                    // Convert to FontWeight.wXXX — handles both numeric (400) and named ("Bold") values
                    const weight = resolveWeightToNumber(value);
                    outputValue = weight !== null ? `FontWeight.w${weight}` : 'FontWeight.w400';
                } else if (type === 'fontFamily') {
                    // Quote font family names
                    outputValue = `'${value.replace(/'/g, "\\'")}'`;
                } else if (typeof value === 'number') {
                    outputValue = value.toFixed(2);
                } else if (typeof value === 'string') {
                    // Check if it's a number with px
                    if (value.endsWith('px')) {
                        const num = parseFloat(value);
                        outputValue = isNaN(num) ? '0.00' : num.toFixed(2);
                    } else {
                        outputValue = `'${value.replace(/'/g, "\\'")}'`;
                    }
                } else {
                    outputValue = String(value);
                }
                
                tokenOutput += `  static const ${token.name} = ${outputValue};\n`;
            });
            
            // Second pass: Build final output with header, imports, and tokens
            let output = `//\n`;
            output += `// ${className}\n`;
            output += `//\n\n`;
            output += `// Do not edit directly, this file was auto-generated.\n\n\n\n`;
            
            // Always include dart:ui and flutter/material.dart in every generated file.
            // This prevents compile failures when raw Color() or other Flutter types
            // are added to any token file, regardless of whether it has external references.
            output += `import 'dart:ui';\n`;
            output += `import 'package:flutter/material.dart';\n`;
            
            // Scan generated token output for class references and add imports
            // Avoid importing the same class we're defining
            if (options?.outputReferences) {
                // Dynamically add imports for all referenced classes
                // Use Set to deduplicate imports (multiple collections can map to same className)
                const importedFiles = new Set();
                Object.keys(classNameMap).forEach(collection => {
                    const referencedClassName = classNameMap[collection];
                    if (tokenOutput.includes(`${referencedClassName}.`) && className !== referencedClassName) {
                        // Convert class name to filename (PascalCase -> snake_case)
                        const filename = toSnakeCase(referencedClassName);
                        importedFiles.add(filename);
                    }
                });
                // Add unique imports
                importedFiles.forEach(filename => {
                    output += `import '${filename}.dart';\n`;
                });
            }
            
            output += `\n`;
            output += `class ${className} {\n`;
            output += `  ${className}._();\n\n`;
            output += tokenOutput;
            output += `}\n`;
            
            // Motion token statistics
            let _mTotal = 0, _mValid = 0, _mInvalid = 0;
            const _mByType = { duration: 0, delay: 0, easing: 0 };
            dictionary.allTokens.forEach(token => {
                const meta = detectMotionToken(token);
                if (!meta) return;
                _mTotal++;
                _mByType[meta.type] = (_mByType[meta.type] || 0) + 1;
                validateMotionValue(token, meta).isValid ? _mValid++ : _mInvalid++;
            });
            if (_mTotal > 0) {
                console.log(`\n📊 Motion Tokens: ${_mTotal} total | ${_mValid} valid${_mInvalid > 0 ? ` | ${_mInvalid} invalid` : ''}`);
                console.log(`   Duration: ${_mByType.duration} | Delay: ${_mByType.delay} | Easing: ${_mByType.easing}`);
            }
            
            return output;
        }
    });
}

function generateFlutterPlatforms(basePath = 'tokens', config = {}) {
    const buildPath = config.buildPath || 'build/flutter/';
    console.log('\n🔍 Scanning for token files...');
    
    const platforms = {};
    
    const tokenFiles = readdirSync(basePath).filter(file => file.endsWith('.json'));
    
    if (tokenFiles.length === 0) {
        console.warn(`   ⚠️  No token files found in ${basePath}`);
        return platforms;
    }
    
    const fileNameMap = {};
    tokenFiles.forEach(file => {
        try {
            const filePath = `${basePath}/${file}`;
            const tokenData = JSON.parse(readFileSync(filePath, 'utf8'));
            const rootKey = Object.keys(tokenData)[0];
            
            if (rootKey) {
                const baseName = file.replace(/^external-/, '').replace('.json', '');
                fileNameMap[rootKey] = generateFlutterClassName(baseName, tokenData);
            }
        } catch (e) {
            console.warn(`   ⚠️  Could not read ${file}:`, e.message);
        }
    });
    
    const fileGroups = new Map();
    tokenFiles.forEach(file => {
        const baseName = file.replace(/^external-/, '').replace('.json', '');
        if (!fileGroups.has(baseName)) {
            fileGroups.set(baseName, []);
        }
        fileGroups.get(baseName).push(file);
    });
    
    const themeCollections = new Set();
    fileGroups.forEach((files, baseName) => {
        const mainFile = files.find(f => !f.startsWith('external-'));
        if (mainFile) {
            try {
                const filePath = `${basePath}/${mainFile}`;
                const tokenData = JSON.parse(readFileSync(filePath, 'utf8'));
                const rootKey = Object.keys(tokenData)[0];
                
                if (rootKey && tokenData[rootKey]) {
                    const hasThemes = tokenData[rootKey]['light-theme'] || tokenData[rootKey]['dark-theme'];
                    if (hasThemes) {
                        themeCollections.add(baseName);
                    }
                }
            } catch (e) {}
        }
    });
    
    fileGroups.forEach((files, baseName) => {
        const mainFile = files.find(f => !f.startsWith('external-')) || files[0];
        let className = 'AppTokens';
        
        // Collect all root keys from files in this group - needed for filtering
        const rootKeys = [];
        files.forEach(file => {
            try {
                const fp = `${basePath}/${file}`;
                const td = JSON.parse(readFileSync(fp, 'utf8'));
                const rk = Object.keys(td)[0];
                if (rk && !rootKeys.includes(rk)) rootKeys.push(rk);
            } catch (e) {}
        });
        
        try {
            const filePath = `${basePath}/${mainFile}`;
            const tokenData = JSON.parse(readFileSync(filePath, 'utf8'));
            const rootKey = Object.keys(tokenData)[0];
            if (rootKey && fileNameMap[rootKey]) {
                className = fileNameMap[rootKey];
            }
        } catch (e) {}
        
        // Map ALL root keys in this group to the SAME className for correct imports
        rootKeys.forEach(rk => {
            fileNameMap[rk] = className;
        });
        
        const dartFileName = toSnakeCase(className);
        
        if (themeCollections.has(baseName)) {
            const basePlatformKey = `flutter-${baseName}`;
            const baseDestination = `${dartFileName}.dart`;
            
            console.log(`   ✅ ${basePlatformKey.padEnd(35)} → ${baseDestination.padEnd(30)} (class: ${className})`);
            if (files.length > 1) {
                console.log(`      ↳ Merging: ${files.join(', ')}`);
            }
            
            platforms[basePlatformKey] = {
                transformGroup: 'flutter',
                buildPath: buildPath,
                files: [{
                    destination: baseDestination,
                    format: 'custom/flutter-dart',
                    // Filter by root key (collection name)
                    filter: (token) => {
                        return rootKeys.includes(token.path[0]);
                    },
                    options: {
                        outputReferences: true,
                        className: className
                    }
                }]
            };
            
            ['light', 'dark'].forEach(theme => {
                const platformKey = `flutter-${baseName}-${theme}`;
                const destination = `${dartFileName}_${theme}.dart`;
                const themeClassName = `${className}${capitalizeFirst(theme)}`;
                
                console.log(`   ✅ ${platformKey.padEnd(35)} → ${destination.padEnd(30)} (class: ${themeClassName})`);
                
                platforms[platformKey] = {
                    transformGroup: 'flutter',
                    buildPath: buildPath,
                    files: [{
                        destination: destination,
                        format: 'custom/flutter-dart',
                        filter: (token) => {
                            // Filter by root key AND theme
                            return rootKeys.includes(token.path[0]) && 
                                   token.path?.some(segment => segment === `${theme}-theme`);
                        },
                        options: {
                            outputReferences: true,
                            className: themeClassName
                        }
                    }]
                };
            });
        } else {
            const platformKey = `flutter-${baseName}`;
            const destination = `${dartFileName}.dart`;
            
            console.log(`   ✅ ${platformKey.padEnd(35)} → ${destination.padEnd(30)} (class: ${className})`);
            if (files.length > 1) {
                console.log(`      ↳ Merging: ${files.join(', ')}`);
            }
            
            platforms[platformKey] = {
                transformGroup: 'flutter',
                buildPath: buildPath,
                files: [{
                    destination: destination,
                    format: 'custom/flutter-dart',
                    // Filter by root key (collection name)
                    filter: (token) => {
                        return rootKeys.includes(token.path[0]);
                    },
                    options: {
                        outputReferences: true,
                        className: className
                    }
                }]
            };
        }
    });
    
    console.log(`\n🎯 Generated ${Object.keys(platforms).length} Flutter platform(s)\n`);
    
    return platforms;
}

export { registerFlutterTransforms, generateFlutterPlatforms };
export default registerFlutterTransforms;