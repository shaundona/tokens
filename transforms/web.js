// Web/CSS specific transforms
import StyleDictionary from 'style-dictionary';
import { readFileSync, readdirSync, existsSync } from 'fs';


// Helper function to convert camelCase/PascalCase to kebab-case
function toKebabCase(str) {
    return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .toLowerCase();
}

// Helper function to capitalize first letter
function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Helper function to generate CSS file name from collection
function generateCSSFileName(baseName, tokenData = null) {
    // Extract the actual collection name from the root key if tokenData is provided
    let effectiveName = baseName;
    
    if (tokenData) {
        const rootKey = Object.keys(tokenData)[0];
        if (rootKey) {
            effectiveName = rootKey.replace(/^external-/, '');
        }
    }
    
    // Convert to kebab-case for CSS files
    return toKebabCase(effectiveName);
}

// Font weight name map for named format output (number → CSS keyword)
const FONT_WEIGHT_NAMES = {
    100: 'thin', 200: 'extralight', 300: 'light',
    400: 'normal', 500: 'medium', 600: 'semibold',
    700: 'bold', 800: 'extrabold', 900: 'black'
};

// Reverse map: Figma/font style name → numeric weight
const FONT_WEIGHT_NAME_TO_NUMBER = {
    'thin': 100, 'hairline': 100,
    'extralight': 200, 'extra-light': 200, 'ultralight': 200, 'ultra-light': 200,
    'light': 300,
    'regular': 400, 'normal': 400, 'book': 400,
    'medium': 500,
    'semibold': 600, 'semi-bold': 600, 'demibold': 600, 'demi-bold': 600,
    'bold': 700,
    'extrabold': 800, 'extra-bold': 800, 'ultrabold': 800, 'ultra-bold': 800,
    'black': 900, 'heavy': 900, 'extrablack': 950, 'ultra-black': 950
};

function resolveWeightToNumber(value) {
    const num = parseInt(String(value));
    if (!isNaN(num)) return num;
    return FONT_WEIGHT_NAME_TO_NUMBER[String(value).toLowerCase().trim()] || null;
}

// ── Motion token helpers (inlined — cannot be imported at runtime) ────────────
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

function transformMotionValue(token, meta) {
  const { value } = token;
  const num = parseFloat(value);
  if (meta.type === 'easing') {
    const parts = String(value).split(',').map(v => parseFloat(v.trim()));
    return `cubic-bezier(${parts.join(', ')})`;
  }
  if (meta.type === 'duration' || meta.type === 'delay') return `${Math.round(num)}ms`;
  if (meta.type === 'scale') return String(num);
  if (meta.type === 'translate-x' || meta.type === 'translate-y') return `${num}px`;
  if (meta.type === 'rotate') return `${num}deg`;
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

// Parse a CSS colour value ({r,g,b} 0-255, a 0-1)
function parseColor(value) {
    if (!value) return null;
    const str = String(value);
    const rgbaMatch = str.match(/rgba?((d+),s*(d+),s*(d+)(?:,s*([d.]+))?)/);
    if (rgbaMatch) {
        return { r: parseInt(rgbaMatch[1]), g: parseInt(rgbaMatch[2]), b: parseInt(rgbaMatch[3]),
                 a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1 };
    }
    const hexMatch = str.match(/^#([0-9a-fA-F]{6,8})$/);
    if (hexMatch) {
        const h = hexMatch[1];
        return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16),
                 a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
    }
    return null;
}

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function convertColor(value, format) {
    if (!format || format === 'hex') return value; // Figma already outputs hex
    const c = parseColor(value);
    if (!c) return value;
    const alpha = parseFloat(c.a.toFixed(3));
    const hasAlpha = c.a < 1;
    if (format === 'rgb') return hasAlpha
        ? 'rgba(' + c.r + ', ' + c.g + ', ' + c.b + ', ' + alpha + ')'
        : 'rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')';
    if (format === 'rgba') return 'rgba(' + c.r + ', ' + c.g + ', ' + c.b + ', ' + alpha + ')';
    if (format === 'hsl' || format === 'hsla') {
        const hsl = rgbToHsl(c.r, c.g, c.b);
        if (format === 'hsla' || hasAlpha) return 'hsla(' + hsl.h + ', ' + hsl.s + '%, ' + hsl.l + '%, ' + alpha + ')';
        return 'hsl(' + hsl.h + ', ' + hsl.s + '%, ' + hsl.l + '%)';
    }
    return value;
}

function registerWebTransforms(SD, config = {}) {
    const removePrefixes = config.removePrefixes !== false; // Default to true
    const unitConversion = config.unitConversion || 'px';
    const baseFontSize = config.baseFontSize || 16;
    const colorFormat = config.colorFormat || 'hex';
    const fontWeightFormat = config.fontWeightFormat || 'numeric';
    const lineHeightUnit = config.lineHeightUnit || 'unitless';
    const booleanFormat = config.booleanFormat || 'boolean';
    const booleanTrueValue = config.booleanTrueValue || 'true';
    const booleanFalseValue = config.booleanFalseValue || 'false';
    
    // Name transform - convert token names to kebab-case for CSS custom properties
    SD.registerTransform({
        name: 'name/css/kebab',
        type: 'name',
        transform: (token) => {
            let path = [...token.path];
            
            // Runtime evaluation of removePrefixes
            if (removePrefixes) {
                // Remove collection name (first part)
                if (path.length > 0) path.shift();
                
                // Remove theme layer if present
                if (path.length > 0 && (path[0] === 'light-theme' || path[0] === 'dark-theme')) {
                    path.shift();
                }
            }
            
            // Convert each segment to kebab-case and join
            return path
                .map(segment => toKebabCase(segment))
                .join('-');
        }
    });

    // Register transform group for web
    SD.registerTransformGroup({
        name: 'web',
        transforms: [
            'name/css/kebab',
            'size/px',
            'color/css'
        ]
    });

    // Format function for CSS custom properties
    SD.registerFormat({
        name: 'custom/css-variables',
        format: ({ dictionary, options, file }) => {
            const fileName = file?.destination || 'tokens.css';
            
            let output = `/**\n`;
            output += ` * ${fileName}\n`;
            output += ` *\n`;
            output += ` * Do not edit directly, this file was auto-generated.\n`;
            output += ` */\n\n`;
            
            // Add :root selector
            output += `:root {\n`;
            
            dictionary.allTokens.forEach(token => {
                // Re-generate correct kebab-case name
                let namePath = [...token.path];
                
                // Remove prefixes if configured
                if (removePrefixes) {
                    if (namePath.length > 0) namePath.shift(); // Remove collection
                    if (namePath.length > 0 && (namePath[0] === 'light-theme' || namePath[0] === 'dark-theme')) {
                        namePath.shift(); // Remove theme
                    }
                }
                
                // Convert to kebab-case
                const correctName = namePath
                    .map(segment => toKebabCase(segment))
                    .join('-');
                
                token.name = correctName;
                
                // Handle references
                const isReference = token.original?.value && 
                                   typeof token.original.value === 'string' && 
                                   token.original.value.startsWith('{');
                
                if (options?.outputReferences && isReference) {
                    // Extract reference path and convert to CSS variable format
                    const refPath = token.original.value.replace(/[{}]/g, '');
                    let pathParts = refPath.split('.');
                    
                    // Get the root collection
                    const refCollection = pathParts[0];
                    
                    // Remove collection prefix if removePrefixes is true
                    if (removePrefixes && pathParts.length > 0) {
                        pathParts = pathParts.slice(1);
                        
                        // Also remove theme layer if present
                        if (pathParts.length > 0 && (pathParts[0] === 'light-theme' || pathParts[0] === 'dark-theme')) {
                            pathParts = pathParts.slice(1);
                        }
                    }
                    
                    // Convert reference path to kebab-case
                    const refVarName = pathParts
                        .map(segment => toKebabCase(segment))
                        .join('-');
                    
                    // Guard: self-referential var() is invalid CSS — fall through to raw value
                    if (refVarName !== token.name) {
                        output += `  --${token.name}: var(--${refVarName});\n`;
                        return;
                    }
                }
                
                // ── Motion token check ──────────────────────────────────────
                const motionMeta = detectMotionToken(token);
                if (motionMeta) {
                    const rawValue = token.original?.value ?? token.value;
                    const motionToken = { ...token, value: rawValue };
                    const validated = validateMotionValue(motionToken, motionMeta);
                    logMotionError(token.path.join('/'), validated);
                    if (validated.isValid) {
                        output += `  --${token.name}: ${transformMotionValue(motionToken, validated)};\n`;
                        return;
                    }
                }
                // ────────────────────────────────────────────────────────────
                
                // Use token.value for references (already resolved), token.original.value for direct values
                const value = isReference ? token.value : (token.original?.value || token.value);
                const type = token.type;
                let outputValue;
                
                // Transform based on token type
                if (type === 'color') {
                    outputValue = convertColor(value, colorFormat);
                } else if (type === 'dimension' || type === 'sizing' || type === 'spacing') {
                    const numVal = typeof value === 'number' ? value : (parseFloat(value) || 0);
                    if (unitConversion === 'rem' || unitConversion === 'em') {
                        outputValue = `${parseFloat((numVal / baseFontSize).toFixed(4))}${unitConversion}`;
                    } else {
                        outputValue = `${numVal}px`;
                    }
                } else if (type === 'lineHeight') {
                    const lhStr = String(value);
                    if (lhStr.toLowerCase() === 'auto') {
                        outputValue = 'normal';
                    } else {
                        const num = parseFloat(lhStr);
                        if (isNaN(num)) {
                            outputValue = value;
                        } else if (lineHeightUnit === 'px') {
                            outputValue = num + 'px';
                        } else if (lineHeightUnit === 'rem') {
                            outputValue = parseFloat((num / baseFontSize).toFixed(4)) + 'rem';
                        } else {
                            outputValue = num; // unitless
                        }
                    }
                } else if (type === 'fontWeight') {
                    const resolvedWeight = resolveWeightToNumber(value);
                    if (fontWeightFormat === 'named') {
                        outputValue = resolvedWeight !== null ? (FONT_WEIGHT_NAMES[resolvedWeight] || resolvedWeight) : value;
                    } else {
                        outputValue = resolvedWeight !== null ? resolvedWeight : value;
                    }
                } else if (type === 'boolean') {
                    const boolVal = value === true || value === 'true' || value === 1 || value === '1';
                    if (booleanFormat === 'number') {
                        outputValue = boolVal ? 1 : 0;
                    } else if (booleanFormat === 'string') {
                        outputValue = boolVal ? booleanTrueValue : booleanFalseValue;
                    } else if (booleanFormat === 'css-value') {
                        outputValue = boolVal ? 'block' : 'none';
                    } else {
                        outputValue = boolVal ? 'true' : 'false';
                    }
                } else if (type === 'fontFamily') {
                    // Quote font family names
                    outputValue = `"${value}"`;
                } else if (typeof value === 'number') {
                    outputValue = value;
                } else {
                    outputValue = value;
                }
                
                output += `  --${token.name}: ${outputValue};\n`;
            });
            
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

function generateWebPlatforms(basePath = 'tokens', config = {}) {
    const buildPath = config.buildPath || 'build/web/';
    console.log('\n🌐 Scanning for token files (Web/CSS)...');
    
    const platforms = {};
    
    const tokenFiles = readdirSync(basePath).filter(file => file.endsWith('.json'));
    
    if (tokenFiles.length === 0) {
        console.warn(`   ⚠️  No token files found in ${basePath}`);
        return platforms;
    }
    
    if (config.outputFormat === 'single') {
        platforms['web-tokens'] = {
            transformGroup: 'web',
            buildPath: buildPath,
            files: [{
                destination: 'tokens.css',
                format: 'custom/css-variables',
                // No filter — all tokens included
                options: {
                    outputReferences: config.outputReferences !== false
                }
            }]
        };
        console.log(`   ✅ web-tokens → tokens.css (single file, all collections)`);
        console.log(`\n🎯 Generated 1 Web platform (single file)\n`);
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
                fileNameMap[rootKey] = generateCSSFileName(baseName, tokenData);
            }
        } catch (e) {
            console.warn(`   ⚠️  Could not read ${file}:`, e.message);
        }
    });
    
    const fileGroups = new Map();
    tokenFiles.forEach(file => {
        // Group by normalized root key so that files with the same root key
        // (e.g. external-primitives.json AND external-primitives-2.json, both
        // having root key "external-primitives") end up in the same group.
        let baseName = file.replace(/^external-/, '').replace('.json', '');
        try {
            const fp = `${basePath}/${file}`;
            const td = JSON.parse(readFileSync(fp, 'utf8'));
            const rk = Object.keys(td)[0];
            if (rk) baseName = rk.replace(/^external-/, '');
        } catch (e) {
            // keep filename-derived baseName as fallback
        }
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
        let cssFileName = toKebabCase(baseName);
        
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
                cssFileName = fileNameMap[rootKey];
            }
        } catch (e) {}
        
        // Re-unify all root keys in this group to the same output filename
        rootKeys.forEach(rk => {
            fileNameMap[rk] = cssFileName;
        });
        
        if (themeCollections.has(baseName)) {
            const basePlatformKey = `web-${baseName}`;
            const baseDestination = `${cssFileName}.css`;
            
            console.log(`   ✅ ${basePlatformKey.padEnd(35)} → ${baseDestination.padEnd(30)}`);
            if (files.length > 1) {
                console.log(`      ↳ Merging: ${files.join(', ')}`);
            }
            
            platforms[basePlatformKey] = {
                transformGroup: 'web',
                buildPath: buildPath,
                files: [{
                    destination: baseDestination,
                    format: 'custom/css-variables',
                    // Filter by root key (collection name)
                    filter: (token) => {
                        return rootKeys.includes(token.path[0]);
                    },
                    options: {
                        outputReferences: config.outputReferences !== false
                    }
                }]
            };
            
            ['light', 'dark'].forEach(theme => {
                const platformKey = `web-${baseName}-${theme}`;
                const destination = `${cssFileName}.${theme}.css`;
                
                console.log(`   ✅ ${platformKey.padEnd(35)} → ${destination.padEnd(30)}`);
                
                platforms[platformKey] = {
                    transformGroup: 'web',
                    buildPath: buildPath,
                    files: [{
                        destination: destination,
                        format: 'custom/css-variables',
                        filter: (token) => {
                            // Filter by root key AND theme
                            return rootKeys.includes(token.path[0]) && 
                                   token.path?.some(segment => segment === `${theme}-theme`);
                        },
                        options: {
                            outputReferences: config.outputReferences !== false
                        }
                    }]
                };
            });
        } else {
            const platformKey = `web-${baseName}`;
            const destination = `${cssFileName}.css`;
            
            console.log(`   ✅ ${platformKey.padEnd(35)} → ${destination.padEnd(30)}`);
            if (files.length > 1) {
                console.log(`      ↳ Merging: ${files.join(', ')}`);
            }
            
            platforms[platformKey] = {
                transformGroup: 'web',
                buildPath: buildPath,
                files: [{
                    destination: destination,
                    format: 'custom/css-variables',
                    // Filter by root key (collection name)
                    filter: (token) => {
                        return rootKeys.includes(token.path[0]);
                    },
                    options: {
                        outputReferences: config.outputReferences !== false
                    }
                }]
            };
        }
    });
    
    console.log(`\n🎯 Generated ${Object.keys(platforms).length} Web platform(s)\n`);
    
    return platforms;
}
export { registerWebTransforms, generateWebPlatforms };
export default registerWebTransforms;