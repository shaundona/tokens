// Multi-platform token build script with resilience
import StyleDictionary from 'style-dictionary';
import { copyFileSync, readdirSync, mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

let generateFlutterPlatforms;
let generateWebPlatforms;

// === BACKUP TOKEN FILES ===
const backupDir = 'tokens/.backup';
console.log('📦 Creating backup of token files...\n');
try {
  if (!existsSync('tokens')) {
    console.warn('⚠️  No tokens directory found, skipping backup');
  } else {
    const tokenFiles = readdirSync('tokens').filter(f => f.endsWith('.json'));
    if (tokenFiles.length > 0) {
      mkdirSync(backupDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      tokenFiles.forEach(file => {
        const backupFile = `${file}.${timestamp}.bak`;
        copyFileSync(`tokens/${file}`, `${backupDir}/${backupFile}`);
        console.log(`   ✅ ${file} → .backup/${backupFile}`);
      });
      console.log('');
    }
  }
} catch (e) {
  console.warn('⚠️  Backup failed:', e.message);
  console.warn('   Continuing with build...\n');
}

// === PHASE 1: PREPROCESSING (Before Style Dictionary) ===
// This filters Variable IDs from JSON files before SD tries to resolve them
function preprocessTokenFiles() {
  const preprocessedIssues = [];
  
  if (!existsSync('tokens')) {
    return preprocessedIssues;
  }
  
  const tokenFiles = readdirSync('tokens').filter(f => f.endsWith('.json'));
  
  tokenFiles.forEach(file => {
    const filePath = join('tokens', file);
    const content = JSON.parse(readFileSync(filePath, 'utf8'));
    let modified = false;
    
    // Recursively scan for Variable IDs
    function scanAndFilter(obj, path = []) {
      for (const key in obj) {
        const currentPath = [...path, key];
        const value = obj[key];
        
        if (value && typeof value === 'object') {
          // Check if this is a token with a value
          if (value.value !== undefined) {
            const tokenValue = value.value;
            
            // Check for Variable IDs
            if (typeof tokenValue === 'string' && tokenValue.includes('VariableID:')) {
              preprocessedIssues.push({
                file: file,
                tokenPath: currentPath.join('.'),
                value: tokenValue,
                issue: 'Contains unresolvable Figma Variable ID',
                severity: 'error'
              });
              delete obj[key]; // Remove entire token
              modified = true;
            }
          } else {
            // Recurse into nested objects
            scanAndFilter(value, currentPath);
          }
        }
      }
    }
    
    scanAndFilter(content);
    
    // Rewrite file if we removed tokens
    if (modified) {
      writeFileSync(filePath, JSON.stringify(content, null, 2));
      console.log(`   ✂️  Filtered Variable IDs from ${file}`);
    }
  });
  
  if (preprocessedIssues.length > 0) {
    console.log(`\n⚠️  Preprocessing: Removed ${preprocessedIssues.length} tokens with Variable IDs:\n`);
    preprocessedIssues.forEach(issue => {
      console.log(`   ❌ ${issue.file}: ${issue.tokenPath}`);
      console.log(`      Value: ${issue.value}`);
    });
    console.log('\n');
  }
  
  return preprocessedIssues;
}

// === BUILD WITH ERROR HANDLING ===
try {
  // PHASE 1: Preprocess token files to remove Variable IDs
  console.log('🔍 Preprocessing token files...\n');
  const preprocessedIssues = preprocessTokenFiles();
  
  // PHASE 2: Load and build with Style Dictionary
  console.log('🎨 Building design tokens...\n');

// Import the pre-configured StyleDictionary instance
const { default: sd } = await import('./style-dictionary.config.js');

try {
  ({ generateFlutterPlatforms } = await import('./transforms/flutter.js'));
} catch (err) {
  console.warn('⚠️  Flutter transforms missing. Skipping Flutter platforms.');
}

try {
  ({ generateWebPlatforms } = await import('./transforms/web.js'));
} catch (err) {
  console.warn('⚠️  Web transforms missing. Skipping Web platforms.');
}

// Inject dynamically generated platforms
console.log('🔧 Injecting dynamic platforms...');
if (generateFlutterPlatforms) {
  const flutterPlatforms = generateFlutterPlatforms('tokens', { buildPath: 'build/flutter/' });
  Object.assign(sd.platforms, flutterPlatforms);
}
if (generateWebPlatforms) {
  const webPlatforms = generateWebPlatforms('tokens', { buildPath: 'build/web/', outputFormat: 'single', outputReferences: true });
  Object.assign(sd.platforms, webPlatforms);
}

  const results = { success: [], failed: [] };
  
  // Build each platform with individual error handling
  const platformNames = Object.keys(sd.platforms || {});
  
  for (const platformName of platformNames) {
    console.log(`📦 Building platform: ${platformName}`);
    
    try {
      await sd.buildPlatform(platformName);
      
      // Count actual filtered tokens for this platform
      let filteredCount = sd.allTokens?.length || 0;
      
      try {
        const platformConfig = sd.platforms[platformName];
        
        // If platform has a filter, count only matching tokens
        if (platformConfig?.files?.[0]?.filter && typeof platformConfig.files[0].filter === 'function') {
          const filterFn = platformConfig.files[0].filter;
          filteredCount = sd.allTokens.filter(filterFn).length;
        }
      } catch (countError) {
        // If token counting fails, use total count and continue
        console.warn(`   ⚠️ Could not count filtered tokens, using total: ${countError.message}`);
      }
      
      results.success.push({ 
        platform: platformName,
        tokenCount: filteredCount 
      });
      console.log(`   ✅ Built successfully (${filteredCount} tokens)\n`);
    } catch (error) {
      results.failed.push({ 
        platform: platformName, 
        error: error.message 
      });
      console.error(`   ❌ Failed: ${error.message}`);
      console.error('      Continuing with next platform...\n');
    }
  }
  
  // Build summary
  console.log('='.repeat(60));
  console.log('📊 BUILD SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successfully built: ${results.success.length} platforms`);
  results.success.forEach(({ platform, tokenCount }) => {
    console.log(`   - ${platform}: ${tokenCount} tokens`);
  });
  
  if (results.failed.length > 0) {
    console.log(`\n❌ Failed: ${results.failed.length} platforms`);
    results.failed.forEach(({ platform, error }) => {
      console.log(`   - ${platform}: ${error}`);
    });
  }
  
  if (preprocessedIssues.length > 0) {
    console.log(`\n⚠️  Excluded ${preprocessedIssues.length} tokens with Variable IDs during preprocessing`);
  }
  console.log('='.repeat(60) + '\n');
  
  // Exit with error only if ALL platforms failed
  if (results.success.length === 0) {
    console.error('❌ All platforms failed to build');
    console.error('   Please fix the errors above and try again\n');
    process.exit(1);
  }
  
  console.log('✨ Build completed successfully\n');
  console.log('Generated files:');
  console.log('  📁 build/web/');
  try {
    const cssFiles = readdirSync('build/web/').filter(f => f.endsWith('.css')).sort();
    if (cssFiles.length > 0) {
      cssFiles.forEach((file, index) => {
        const prefix = index === cssFiles.length - 1 ? '└──' : '├──';
        console.log(`     ${prefix} ${file}`);
      });
    } else {
      console.log('     └── (no files generated)');
    }
  } catch (e) {
    console.log('     └── (build directory not found)');
  }
  console.log('  📁 build/flutter/');
  try {
    const dartFiles = readdirSync('build/flutter/').filter(f => f.endsWith('.dart')).sort();
    if (dartFiles.length > 0) {
      dartFiles.forEach((file, index) => {
        const prefix = index === dartFiles.length - 1 ? '└──' : '├──';
        console.log(`     ${prefix} ${file}`);
      });
    } else {
      console.log('     └── (no files generated)');
    }
  } catch (e) {
    console.log('     └── (build directory not found)');
  }
  
} catch (error) {
  console.error('\n❌ Fatal build error:', error);
  console.error('   Stack trace:', error.stack);
  process.exit(1);
}
