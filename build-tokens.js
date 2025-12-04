// Multi-platform token build script
import StyleDictionary from 'style-dictionary';
import { registerFlutterTransforms } from './transforms/flutter.js';

console.log('🎨 Building design tokens for 2 platform(s)...\n');

// Register platform transforms
registerFlutterTransforms(StyleDictionary);

// Import and build
const { default: config } = await import('./style-dictionary.config.js');
const sd = new StyleDictionary(config);

try {
  await sd.buildAllPlatforms();
  
  console.log('\n✅ Build complete!\n');
  console.log('Generated files:');
  console.log('  📁 build/web/');
  console.log('     ├── primitives.css');
  console.log('     ├── theme-light.css');
  console.log('     └── theme-dark.css');
  console.log('  📁 build/flutter/');
  console.log('     ├── primitives.dart');
  console.log('     ├── semantics.dart');
  console.log('     └── components.dart');
  
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
