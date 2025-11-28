import StyleDictionary from 'style-dictionary';

import { registerFlutterTransforms } from './transforms/flutter.js';
import { registerIOSTransforms } from './transforms/ios.js';
import { registerAndroidTransforms } from './transforms/android.js';

// Register platform transforms
registerFlutterTransforms(StyleDictionary);
registerIOSTransforms(StyleDictionary);
registerAndroidTransforms(StyleDictionary);

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

StyleDictionary.registerTransform({
  name: 'size/web-rem',
  type: 'value',
  transitive: true,
  matcher: (token) => {
    // Exclude non-dimension token types by path
    const excludePatterns = [
      'colour', 'color', 'fontWeight', 'font-weight',
      'fontFamily', 'font-family', 'opacity', 'lineHeight', 'line-height'
    ];
    
    const pathString = token.path.join('-').toLowerCase();
    const hasExcludedPattern = excludePatterns.some(pattern => 
      pathString.includes(pattern)
    );
    
    if (hasExcludedPattern) return false;
    
    // Only match values that end with 'px' or are numeric
    const value = String(token.value || '');
    if (!value.endsWith('px') && isNaN(parseFloat(value))) return false;
    
    // Check if it's a dimension-type token
    return ['dimension', 'sizing', 'spacing', 'borderRadius', 'borderWidth'].includes(token.type);
  },
  transform: (token) => {
    const val = parseFloat(token.value);
    
    // Safety check
    if (isNaN(val)) {
      console.warn(`⚠️  size/web-rem: Cannot convert "${token.name}" value "${token.value}"`);
      return token.value;
    }
    
    const baseFontSize = 16;
    return `${val / baseFontSize}rem`;
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
  name: 'boolean/css-value',
  type: 'value',
  matcher: (token) => typeof token.original.value === 'boolean',
  transform: (token) => {
    return token.original.value ? 'block' : 'none';
  }
});

export default new StyleDictionary({
  source: ['tokens/**/*.json'],
  platforms: {
    'web-primitives': {
      transformGroup: 'css',
      transforms: ['attribute/cti', 'name/figma', 'size/web-rem', 'color/css'],
      buildPath: 'build/web/',
      files: [{
        destination: 'primitives.css',
        format: 'css/variables',
        filter: (token) => token.path[0] === 'primitives',
        options: { selector: ':root', outputReferences: false }
      }]
    },
    'web-light': {
      transformGroup: 'css',
      transforms: ['attribute/cti', 'name/figma', 'size/web-rem', 'color/css'],
      buildPath: 'build/web/',
      files: [{
        destination: 'theme-light.css',
        format: 'css/variables',
        filter: (token) => (token.path[0] === 'semantics' && token.path[1] === 'light-theme') || token.path[0] === 'components',
        options: { selector: ':root, [data-theme="light"]', outputReferences: true }
      }]
    },
    'web-dark': {
      transformGroup: 'css',
      transforms: ['attribute/cti', 'name/figma', 'size/web-rem', 'color/css'],
      buildPath: 'build/web/',
      files: [{
        destination: 'theme-dark.css',
        format: 'css/variables',
        filter: (token) => token.path[0] === 'semantics' && token.path[1] === 'dark-theme',
        options: { selector: '[data-theme="dark"]', outputReferences: true }
      }]
    },
    'flutter': {
      transformGroup: 'flutter',
      buildPath: 'build/flutter/',
      files: [
        {
          destination: 'apptokens.dart',
          format: 'flutter/class.dart',
          className: 'AppTokens',
          options: { showFileHeader: true, outputReferences: false }
        }
      ]
    },
    'ios': {
      transformGroup: 'ios-swift',
      buildPath: 'build/ios/',
      files: [{
        destination: 'DesignTokens.swift',
        format: 'ios-swift/enum.swift',
        className: 'DesignTokens',
        options: { outputReferences: false }
      }]
    },
    'android': {
      transformGroup: 'android-kotlin',
      buildPath: 'build/android/',
      files: [{
        destination: 'Tokens.kt',
        format: 'android/kotlin',
        packageName: 'com.app.tokens',
        options: { outputReferences: false }
      }]
    },
  }
});
