import StyleDictionary from 'style-dictionary';

// Register Flutter transforms and format (if available)
try {
  const { registerFlutterTransforms } = await import('./transforms/flutter.js');
  registerFlutterTransforms(StyleDictionary, { removePrefixes: true });
} catch (err) {
  console.warn('⚠️  Flutter transforms missing. Skipping Flutter transforms.');
}

// Register Web/CSS transforms and format (if available)
try {
  const { registerWebTransforms } = await import('./transforms/web.js');
  registerWebTransforms(StyleDictionary, { removePrefixes: true, unitConversion: 'rem', baseFontSize: 16, colorFormat: 'hex', fontWeightFormat: 'numeric', lineHeightUnit: 'unitless', booleanFormat: 'boolean', booleanTrueValue: 'yes', booleanFalseValue: 'no' });
} catch (err) {
  console.warn('⚠️  Web transforms missing. Skipping Web transforms.');
}

export default new StyleDictionary({
  source: [
    'tokens/external-02-semantics.json',
    'tokens/01-primitives.json',
    'tokens/02-semantics.json',
    'tokens/03-components.json'
  ],
  platforms: {
    // Platforms are dynamically generated at build time by:
    // - generateFlutterPlatforms() from transforms/flutter.js
    // - generateWebPlatforms() from transforms/web.js
    // These are injected in build-tokens.js before building
  }
});
