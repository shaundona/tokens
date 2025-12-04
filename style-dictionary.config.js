import StyleDictionary from 'style-dictionary';
import { registerFlutterTransforms } from './transforms/flutter.js';

// Register Flutter transforms and format
registerFlutterTransforms(StyleDictionary);


// Web custom transforms
StyleDictionary.registerTransform({
  name: 'name/figma',
  type: 'name',
  transform: (token) => {
    let path = [...token.path];
    
    // Remove collection name (primitives/semantics/components) from ALL tokens
    if (path.length > 0) {
      const firstSegment = path[0];
      if (firstSegment === 'primitives' || firstSegment === 'semantics' || firstSegment === 'components') {
        path.shift();
      }
    }
    
    // Remove theme layer if present (light-theme/dark-theme)
    if (path.length > 0) {
      const nextSegment = path[0];
      if (nextSegment === 'light-theme' || nextSegment === 'dark-theme') {
        path.shift();
      }
    }
    
    // Convert to kebab-case and return
    return path.join('-').toLowerCase().replace(/_/g, '-');
  }
});


// Custom size/px transform
StyleDictionary.registerTransform({
  name: 'size/px',
  type: 'value',
  filter: (token) => ['dimension', 'sizing', 'spacing', 'borderRadius', 'borderWidth'].includes(token.type),
  transform: (token) => {
    const value = token.value;
    if (typeof value === 'number') return value + 'px';
    if (typeof value === 'string' && !value.endsWith('px')) return value + 'px';
    return value;
  }
});

StyleDictionary.registerTransform({
  name: 'size/web-rem',
  type: 'value',
  transitive: true,
  filter: (token) => {
    // Exclude non-dimension token types by path
    const excludePatterns = [
      'colour', 'color', 'fontweight', 'font-weight',
      'fontfamily', 'font-family', 'opacity', 'lineheight', 'line-height'
    ];
    
    const pathString = token.path.join('-').toLowerCase();
    const hasExcludedPattern = excludePatterns.some(pattern => 
      pathString.includes(pattern)
    );
    
    if (hasExcludedPattern) return false;
    
    // Check if it's a dimension-type token
    return ['dimension', 'sizing', 'spacing', 'borderRadius', 'borderWidth'].includes(token.type);
  },
  transform: (token) => {
    // Get the value - might be number or string with px
    let value = token.value;
    
    // If it's already a string with rem, return it
    if (typeof value === 'string' && value.includes('rem')) {
      return value;
    }
    
    // Convert to number (handle both "4px" strings and raw numbers)
    const numValue = typeof value === 'string' ? parseFloat(value.replace('px', '')) : parseFloat(value);
    
    // Safety check
    if (isNaN(numValue)) {
      console.warn(`⚠️  size/web-rem: Cannot convert "${token.name}" value "${token.value}"`);
      return token.value;
    }
    
    const baseFontSize = 16;
    return `${numValue / baseFontSize}rem`;
  }
});

StyleDictionary.registerTransform({
  name: 'size/ios-pt',
  type: 'value',
  matcher: (token) => {
    return ['dimension', 'sizing', 'spacing', 'borderRadius', 'borderWidth', 'fontSize', 'lineHeight'].includes(token.type);
  },
  transform: (token) => {
    const val = parseFloat(token.original.value);
    if (isNaN(val)) return token.original.value;
    return val; // iOS pt = CSS px at 1x
  }
});

StyleDictionary.registerTransform({
  name: 'size/android-dp',
  type: 'value',
  matcher: (token) => {
    return ['dimension', 'sizing', 'spacing', 'borderRadius', 'borderWidth', 'fontSize', 'lineHeight'].includes(token.type);
  },
  transform: (token) => {
    const val = parseFloat(token.original.value);
    if (isNaN(val)) return token.original.value;
    return val; // Android dp = CSS px
  }
});

StyleDictionary.registerTransform({
  name: 'color/rgba',
  type: 'value',
  transitive: true,
  matcher: (token) => token.$type === 'color' || token.type === 'color',
  transform: (token) => {
    const value = String(token.value || '');
    
    // Early return if value doesn't look like a color
    if (!value.startsWith('#') && !value.startsWith('rgb')) {
      return value; // Return the string value, not token.value
    }
    
    let r, g, b, a = 1;
    
    // Check if value is hex or rgba format
    if (value.startsWith('#')) {
      // Parse hex color
      r = parseInt(value.slice(1, 3), 16);
      g = parseInt(value.slice(3, 5), 16);
      b = parseInt(value.slice(5, 7), 16);
    } else if (value.startsWith('rgba')) {
      // Parse rgba(r, g, b, a) format
      const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (match) {
        r = parseInt(match[1]);
        g = parseInt(match[2]);
        b = parseInt(match[3]);
        a = match[4] ? parseFloat(match[4]) : 1;
      }
    } else if (value.startsWith('rgb')) {
      // Parse rgb(r, g, b) format
      const match = value.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        r = parseInt(match[1]);
        g = parseInt(match[2]);
        b = parseInt(match[3]);
      }
    }
    
    // If we couldn't parse a color, return the original value
    if (r === undefined || g === undefined || b === undefined) {
      return token.value;
    }
    
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
});

StyleDictionary.registerTransform({
  name: 'fontWeight/named',
  type: 'value',
  matcher: (token) => token.type === 'fontWeight',
  transform: (token) => {
    const weights = {
      100: 'thin', 200: 'extra-light', 300: 'light',
      400: 'normal', 500: 'medium', 600: 'semi-bold',
      700: 'bold', 800: 'extra-bold', 900: 'black'
    };
    return weights[token.value] || token.value;
  }
});

StyleDictionary.registerTransform({
  name: 'lineHeight/unitless',
  type: 'value',
  matcher: (token) => token.type === 'lineHeight',
  transform: (token) => {
    const value = parseFloat(token.value);
    if (isNaN(value)) return token.value;
    return value;
  }
});

StyleDictionary.registerTransform({
  name: 'boolean/css-value',
  type: 'value',
  matcher: (token) => typeof token.original.value === 'boolean',
  transform: (token) => {
    return token.original.value ? 'block' : 'none';
  }
});


// Custom CSS formatter that adds units based on settings
StyleDictionary.registerFormat({
  name: 'css/variables-with-units',
  format: ({ dictionary, options = {} }) => {
    const selector = options.selector || ':root';
    const unit = options.unit || 'rem';
    let output = '/**\n * Do not edit directly, this file was auto-generated.\n */\n\n';
    output += `${selector} {\n`;
    dictionary.allTokens.forEach(token => {
      let value = token.value;
      
      // Check if this token references another token
      const originalValue = token.original && token.original.value;
      const isReference = options.outputReferences && 
        typeof originalValue === 'string' && 
        originalValue.startsWith('{') && 
        originalValue.endsWith('}');
      
      if (isReference) {
        // Parse the reference path from {primitives.colour.name} format
        const refPath = originalValue.slice(1, -1).split('.');
        // Remove the first segment (e.g., 'primitives', 'semantics') 
        const refName = refPath.slice(1).join('-');
        value = `var(--${refName})`;
      } else {
        // Add units for dimension tokens (transforms already converted, just add unit)
        const isDimension = ['dimension', 'sizing', 'spacing', 'borderRadius', 'borderWidth'].includes(token.type);
        const excludePatterns = ['colour', 'color', 'fontweight', 'font-weight', 'fontfamily', 'font-family', 'opacity', 'lineheight', 'line-height', 'letterspacing', 'letter-spacing', 'paragraphspacing', 'paragraph-spacing', 'listspacing', 'list-spacing'];
        const pathString = token.path.join('-').toLowerCase();
        const isExcluded = excludePatterns.some(pattern => pathString.includes(pattern));
        
        if (isDimension && !isExcluded && typeof value === 'number') {
          value = `${value}${unit}`;
        }
      }
      
      output += `  --${token.name}: ${value};\n`;
    });
    output += '}\n';
    return output;
  }
});


// Flutter custom name transform
StyleDictionary.registerTransform({
  name: 'name/flutter-camel',
  type: 'name',
  transform: (token) => {
    let path = [...token.path];
    
    // Remove collection name (primitives/semantics/components)
    if (path.length > 0) {
      const firstSegment = path[0];
      if (firstSegment === 'primitives' || firstSegment === 'semantics' || firstSegment === 'components') {
        path.shift();
      }
    }
    
    // Remove theme layer if present (light-theme/dark-theme)
    if (path.length > 0) {
      const nextSegment = path[0];
      if (nextSegment === 'light-theme' || nextSegment === 'dark-theme') {
        path.shift();
      }
    }
    
    // Convert to camelCase for Flutter
    return path.map((part, index) => {
      const cleaned = part.replace(/[^a-zA-Z0-9]/g, '');
      if (index === 0) return cleaned.toLowerCase();
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
    }).join('');
  }
});

export default new StyleDictionary({
  source: ['tokens/**/*.json'],
  platforms: {
    'web-primitives': {
      transforms: ['attribute/cti', 'name/kebab', 'name/figma', 'size/px', 'size/web-rem', 'color/rgba', 'fontWeight/named', 'lineHeight/unitless'],
      buildPath: 'build/web/',
      files: [{
        destination: 'primitives.css',
        format: 'css/variables-with-units',
        filter: (token) => token.path[0] === 'primitives',
        options: { selector: ':root', outputReferences: false, unit: 'rem' }
      }]
    },
    'web-light': {
      transforms: ['attribute/cti', 'name/figma', 'size/web-rem', 'color/rgba', 'fontWeight/named', 'lineHeight/unitless'],
      buildPath: 'build/web/',
      files: [{
        destination: 'theme-light.css',
        format: 'css/variables-with-units',
        filter: (token) => (token.path[0] === 'semantics' && token.path[1] === 'light-theme') || token.path[0] === 'components',
        options: { selector: ':root, [data-theme="light"]', outputReferences: true, unit: 'rem' }
      }]
    },
    'web-dark': {
      transforms: ['attribute/cti', 'name/figma', 'size/web-rem', 'color/rgba', 'fontWeight/named', 'lineHeight/unitless'],
      buildPath: 'build/web/',
      files: [{
        destination: 'theme-dark.css',
        format: 'css/variables-with-units',
        filter: (token) => token.path[0] === 'semantics' && token.path[1] === 'dark-theme',
        options: { selector: '[data-theme="dark"]', outputReferences: true, unit: 'rem' }
      }]
    },
    'flutter-primitives': {
      transforms: ['attribute/cti', 'name/flutter-camel', 'color/css'],
      buildPath: 'build/flutter/',
      files: [{
        destination: 'primitives.dart',
        format: 'custom/flutter-dart',
        filter: (token) => token.filePath && token.filePath.includes('primitives'),
        options: { showFileHeader: true, outputReferences: true, className: 'Primitives' }
      }]
    },
    'flutter-semantics': {
      transforms: ['attribute/cti', 'name/flutter-camel', 'color/css'],
      buildPath: 'build/flutter/',
      files: [{
        destination: 'semantics.dart',
        format: 'custom/flutter-dart',
        filter: (token) => token.filePath && token.filePath.includes('semantics'),
        options: { showFileHeader: true, outputReferences: true, className: 'Semantics' }
      }]
    },
    'flutter-components': {
      transforms: ['attribute/cti', 'name/flutter-camel', 'color/css'],
      buildPath: 'build/flutter/',
      files: [{
        destination: 'components.dart',
        format: 'custom/flutter-dart',
        filter: (token) => token.filePath && token.filePath.includes('components'),
        options: { showFileHeader: true, outputReferences: true, className: 'Components' }
      }]
    },
  }
});
