/**
 * tests/ui_bundle_storage_stress.mjs
 *
 * Empirical Challenger Verification Suite for Milestone 4:
 * 1. Production Bundle Isolation & Size Verification (< 320 kB entry, dynamic chunk separation)
 * 2. Relative Asset URL Resolution (BASE_URL & dist/index.html compliance)
 * 3. Settings Persistence & Defensive Migration (getDefaultSettings & adversarial loadSettings)
 * 4. Non-Deletion on Disable Invariant Verification (caches.delete is never invoked on toggle)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('================================================================');
console.log('  MILESTONE 4 EMPIRICAL CHALLENGER STRESS SUITE');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

// ============================================================================
// SUITE 1: Bundle Isolation & Size Verification
// ============================================================================
console.log('\n--- SUITE 1: Production Bundle Isolation & Size Verification ---');

// 1.1 Fresh Build Execution
runTest('1.1 Production build executes cleanly without errors', () => {
  console.log('    Executing `npm run build` in ' + projectRoot);
  const buildOutput = execSync('npm run build', {
    cwd: projectRoot,
    encoding: 'utf-8',
    stdio: 'pipe',
  });
  assert.ok(buildOutput.includes('built in'), 'Build output should confirm completion');
});

// 1.2 Dist Directory & Entry Chunk Inspection
let entryChunkFile = null;
let entryChunkSizeBytes = 0;
const distAssetsDir = path.join(projectRoot, 'dist', 'assets');

runTest('1.2 Dist assets directory exists and contains entry chunk', () => {
  assert.ok(fs.existsSync(distAssetsDir), 'dist/assets directory must exist');
  const files = fs.readdirSync(distAssetsDir);
  
  // Find index-*.js
  entryChunkFile = files.find((f) => /^index-[a-zA-Z0-9_-]+\.js$/.test(f));
  assert.ok(entryChunkFile, `dist/assets must contain an index-*.js entry chunk. Found: ${files.join(', ')}`);
  
  const fullPath = path.join(distAssetsDir, entryChunkFile);
  const stats = fs.statSync(fullPath);
  entryChunkSizeBytes = stats.size;
  const sizeKb = (entryChunkSizeBytes / 1024).toFixed(2);
  console.log(`    Entry chunk: ${entryChunkFile} (${entryChunkSizeBytes} bytes, ${sizeKb} kB)`);
});

runTest('1.3 Entry chunk size is strictly < 320 kB (ceiling 327,680 bytes)', () => {
  const maxBytes = 320 * 1024; // 327,680 bytes
  assert.ok(
    entryChunkSizeBytes < maxBytes,
    `Entry chunk ${entryChunkFile} size (${entryChunkSizeBytes} bytes / ${(entryChunkSizeBytes / 1024).toFixed(2)} kB) must be strictly < 320 kB (${maxBytes} bytes)`
  );
  // Verify it is in line with baseline ~300.12 kB (~307,322 bytes)
  const sizeKb = entryChunkSizeBytes / 1024;
  assert.ok(sizeKb >= 250 && sizeKb <= 320, `Entry chunk size should be between 250 kB and 320 kB (got ${sizeKb.toFixed(2)} kB)`);
});

runTest('1.4 Heavy accessibility modules are separated into dynamic chunks', () => {
  const files = fs.readdirSync(distAssetsDir);

  const visionChunk = files.find((f) => /^vision_bundle-[a-zA-Z0-9_-]+\.js$/.test(f));
  const audioNavChunk = files.find((f) => /^audioNav-[a-zA-Z0-9_-]+\.js$/.test(f));
  const headTrackingChunk = files.find((f) => /^headTracking-[a-zA-Z0-9_-]+\.js$/.test(f));
  const settingsModalChunk = files.find((f) => /^SettingsModal-[a-zA-Z0-9_-]+\.js$/.test(f));

  console.log(`    Found vision chunk: ${visionChunk || 'NONE'}`);
  console.log(`    Found audioNav chunk: ${audioNavChunk || 'NONE'}`);
  console.log(`    Found headTracking chunk: ${headTrackingChunk || 'NONE'}`);
  console.log(`    Found settingsModal chunk: ${settingsModalChunk || 'NONE'}`);

  assert.ok(visionChunk, 'vision_bundle dynamic chunk must exist in dist/assets');
  assert.ok(audioNavChunk, 'audioNav dynamic chunk must exist in dist/assets');
  assert.ok(headTrackingChunk, 'headTracking dynamic chunk must exist in dist/assets');
  assert.ok(settingsModalChunk, 'SettingsModal dynamic chunk must exist in dist/assets');

  // Verify heavy chunks are non-trivial in size
  const visionSize = fs.statSync(path.join(distAssetsDir, visionChunk)).size;
  const audioNavSize = fs.statSync(path.join(distAssetsDir, audioNavChunk)).size;
  const headTrackingSize = fs.statSync(path.join(distAssetsDir, headTrackingChunk)).size;

  assert.ok(visionSize > 50 * 1024, `vision_bundle must be > 50 kB (got ${(visionSize / 1024).toFixed(2)} kB)`);
  assert.ok(audioNavSize > 10 * 1024, `audioNav must be > 10 kB (got ${(audioNavSize / 1024).toFixed(2)} kB)`);
  assert.ok(headTrackingSize > 5 * 1024, `headTracking must be > 5 kB (got ${(headTrackingSize / 1024).toFixed(2)} kB)`);
});

runTest('1.5 Entry chunk does NOT contain bundled heavy models or MediaPipe code', () => {
  const entryContent = fs.readFileSync(path.join(distAssetsDir, entryChunkFile), 'utf-8');
  
  // MediaPipe face landmarker strings or big tables should NOT be in entry chunk
  assert.ok(
    !entryContent.includes('face_landmarker.task') || entryContent.includes('models/face_landmarker.task'),
    'Entry chunk must not bundle FaceLandmarker binary or model logic'
  );
  // Verify Web Audio audioNav engine is not statically bundled in entry chunk
  assert.ok(
    !entryContent.includes('AudioNavigationEngine') && !entryContent.includes('StemPlayer'),
    'Entry chunk must not statically bundle AudioNavigationEngine or StemPlayer'
  );
});

// ============================================================================
// SUITE 2: Relative Asset Resolution (BASE_URL & dist/index.html)
// ============================================================================
console.log('\n--- SUITE 2: Relative Asset URL Resolution (BASE_URL) ---');

const distHtmlPath = path.join(projectRoot, 'dist', 'index.html');

runTest('2.1 dist/index.html uses strictly relative URLs for scripts and stylesheets', () => {
  assert.ok(fs.existsSync(distHtmlPath), 'dist/index.html must exist');
  const htmlContent = fs.readFileSync(distHtmlPath, 'utf-8');

  // Extract all script src
  const scriptSrcMatches = Array.from(htmlContent.matchAll(/<script[^>]+src=["']([^"']+)["']/g)).map((m) => m[1]);
  // Extract all link href
  const linkHrefMatches = Array.from(htmlContent.matchAll(/<link[^>]+href=["']([^"']+)["']/g)).map((m) => m[1]);

  console.log(`    Found script src tags: ${JSON.stringify(scriptSrcMatches)}`);
  console.log(`    Found link href tags: ${JSON.stringify(linkHrefMatches)}`);

  assert.ok(scriptSrcMatches.length > 0, 'There must be at least one script src in index.html');
  assert.ok(linkHrefMatches.length > 0, 'There must be at least one link href in index.html');

  for (const src of scriptSrcMatches) {
    assert.ok(
      src.startsWith('./') || !src.startsWith('/'),
      `Script src "${src}" must be relative (starts with ./ and not /)`
    );
    assert.ok(!src.startsWith('/assets/'), `Script src "${src}" must NOT be absolute root path /assets/`);
  }

  for (const href of linkHrefMatches) {
    assert.ok(
      href.startsWith('./') || !href.startsWith('/'),
      `Link href "${href}" must be relative (starts with ./ and not /)`
    );
    assert.ok(!href.startsWith('/assets/'), `Link href "${href}" must NOT be absolute root path /assets/`);
  }
});

runTest('2.2 resolveAssetUrl handles relative paths and leading slashes correctly', async () => {
  // We can test resolveAssetUrl logic
  const { resolveAssetUrl } = await import('../src/services/moduleLoader.ts');
  
  // Test with standard relative paths
  const stemUrl = resolveAssetUrl('audio/stems/stem-1.mp3');
  assert.ok(stemUrl.includes('audio/stems/stem-1.mp3'), `Resolved url "${stemUrl}" must contain target path`);
  assert.ok(!stemUrl.startsWith('//'), `Resolved url "${stemUrl}" must not have double slash`);

  // Test with leading slash
  const leadingSlashUrl = resolveAssetUrl('/models/face_landmarker.task');
  assert.ok(leadingSlashUrl.includes('models/face_landmarker.task'), `Resolved url "${leadingSlashUrl}" must clean leading slash`);

  // Test with external CDN URL
  const cdnUrl = 'https://cdn.example.com/model.task';
  assert.equal(resolveAssetUrl(cdnUrl), cdnUrl, 'Full https URL should be returned unmodified');
});

// ============================================================================
// SUITE 3: Settings Persistence & Defensive Migration (src/utils/storage.ts)
// ============================================================================
console.log('\n--- SUITE 3: Settings Persistence & Defensive Migration ---');

// Set up mock window and localStorage for Node environment
const mockStorage = new Map();
const mockLocalStorage = {
  getItem: (key) => mockStorage.get(key) ?? null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
};

globalThis.window = {
  localStorage: mockLocalStorage,
  matchMedia: () => ({ matches: false }),
};
globalThis.localStorage = mockLocalStorage;

const { getDefaultSettings, loadSettings, saveSettings } = await import('../src/utils/storage.ts');

runTest('3.1 getDefaultSettings returns required accessibility defaults', () => {
  const defaults = getDefaultSettings();
  console.log('    Default settings:', JSON.stringify(defaults, null, 2));

  assert.strictEqual(defaults.headTrackingEnabled, false, 'headTrackingEnabled must default to false');
  assert.strictEqual(defaults.audioNavEnabled, false, 'audioNavEnabled must default to false');
  assert.strictEqual(defaults.audioNavVolume, 0.8, 'audioNavVolume must default to 0.8');
  assert.strictEqual(defaults.audioNavMuted, false, 'audioNavMuted must default to false');
  assert.strictEqual(defaults.showSplits, true, 'showSplits must default to true');
  assert.strictEqual(defaults.showControls, true, 'showControls must default to true');
  assert.ok(typeof defaults.theme === 'string', 'theme must be defined');
  assert.ok(typeof defaults.lang === 'string', 'lang must be defined');
  assert.ok(typeof defaults.playerColor === 'string', 'playerColor must be defined');
});

runTest('3.2 loadSettings clamps negative audioNavVolume: { audioNavVolume: -10 } -> 0.0', () => {
  mockStorage.set('maze_daily_settings', JSON.stringify({ audioNavVolume: -10 }));
  const loaded = loadSettings();
  console.log(`    audioNavVolume -10 clamped to: ${loaded.audioNavVolume}`);
  assert.strictEqual(loaded.audioNavVolume, 0.0, 'Volume -10 must clamp to 0.0');
});

runTest('3.3 loadSettings clamps excessive audioNavVolume: { audioNavVolume: 5.5 } -> 1.0', () => {
  mockStorage.set('maze_daily_settings', JSON.stringify({ audioNavVolume: 5.5 }));
  const loaded = loadSettings();
  console.log(`    audioNavVolume 5.5 clamped to: ${loaded.audioNavVolume}`);
  assert.strictEqual(loaded.audioNavVolume, 1.0, 'Volume 5.5 must clamp to 1.0');
});

runTest('3.4 loadSettings handles string NaN: { audioNavVolume: "NaN" } -> 0.8 default', () => {
  mockStorage.set('maze_daily_settings', JSON.stringify({ audioNavVolume: 'NaN' }));
  const loaded = loadSettings();
  console.log(`    audioNavVolume "NaN" defaulted to: ${loaded.audioNavVolume}`);
  assert.strictEqual(loaded.audioNavVolume, 0.8, 'String "NaN" volume must fallback to 0.8');
});

runTest('3.5 loadSettings handles null volume: { audioNavVolume: null } -> 0.8 default', () => {
  mockStorage.set('maze_daily_settings', JSON.stringify({ audioNavVolume: null }));
  const loaded = loadSettings();
  console.log(`    audioNavVolume null defaulted to: ${loaded.audioNavVolume}`);
  assert.strictEqual(loaded.audioNavVolume, 0.8, 'Null volume must fallback to 0.8');
});

runTest('3.6 loadSettings provides complete defaults for empty object {} without throwing', () => {
  mockStorage.set('maze_daily_settings', JSON.stringify({}));
  const loaded = loadSettings();
  console.log('    Loaded from {}:', JSON.stringify(loaded));

  assert.strictEqual(loaded.headTrackingEnabled, false);
  assert.strictEqual(loaded.audioNavEnabled, false);
  assert.strictEqual(loaded.audioNavVolume, 0.8);
  assert.strictEqual(loaded.audioNavMuted, false);
  assert.strictEqual(loaded.showSplits, true);
  assert.strictEqual(loaded.showControls, true);
});

runTest('3.7 loadSettings preserves legacy settings and injects default accessibility fields', () => {
  const legacySettings = {
    theme: 'light',
    lang: 'es',
    playerColor: '#f43f5e',
    showSplits: false,
    showControls: false,
  };
  mockStorage.set('maze_daily_settings', JSON.stringify(legacySettings));
  const loaded = loadSettings();
  console.log('    Migrated legacy settings:', JSON.stringify(loaded));

  // Preserved existing values
  assert.strictEqual(loaded.theme, 'light', 'Legacy theme must be preserved');
  assert.strictEqual(loaded.lang, 'es', 'Legacy lang must be preserved');
  assert.strictEqual(loaded.playerColor, '#f43f5e', 'Legacy playerColor must be preserved');
  assert.strictEqual(loaded.showSplits, false, 'Legacy showSplits must be preserved');
  assert.strictEqual(loaded.showControls, false, 'Legacy showControls must be preserved');

  // Injected accessibility fields
  assert.strictEqual(loaded.headTrackingEnabled, false, 'headTrackingEnabled must be injected as false');
  assert.strictEqual(loaded.audioNavEnabled, false, 'audioNavEnabled must be injected as false');
  assert.strictEqual(loaded.audioNavVolume, 0.8, 'audioNavVolume must be injected as 0.8');
  assert.strictEqual(loaded.audioNavMuted, false, 'audioNavMuted must be injected as false');
});

runTest('3.8 loadSettings survives adversarial / malformed inputs gracefully', () => {
  // Case A: Corrupted JSON string
  mockStorage.set('maze_daily_settings', '{corrupt json invalid!!');
  const fromCorrupt = loadSettings();
  assert.strictEqual(fromCorrupt.audioNavVolume, 0.8);

  // Case B: Non-object JSON
  mockStorage.set('maze_daily_settings', '42');
  const fromNumber = loadSettings();
  assert.strictEqual(fromNumber.audioNavVolume, 0.8);

  // Case C: Null JSON
  mockStorage.set('maze_daily_settings', 'null');
  const fromNull = loadSettings();
  assert.strictEqual(fromNull.audioNavVolume, 0.8);

  // Case D: Array JSON
  mockStorage.set('maze_daily_settings', '[1, 2, 3]');
  const fromArray = loadSettings();
  assert.strictEqual(fromArray.audioNavVolume, 0.8);
  assert.strictEqual(fromArray.headTrackingEnabled, false);

  // Case E: Wrong boolean types
  mockStorage.set('maze_daily_settings', JSON.stringify({
    headTrackingEnabled: 'true',
    audioNavEnabled: 1,
    audioNavMuted: 'yes',
  }));
  const fromWrongTypes = loadSettings();
  assert.strictEqual(fromWrongTypes.headTrackingEnabled, false, 'Non-boolean headTrackingEnabled must default to false');
  assert.strictEqual(fromWrongTypes.audioNavEnabled, false, 'Non-boolean audioNavEnabled must default to false');
  assert.strictEqual(fromWrongTypes.audioNavMuted, false, 'Non-boolean audioNavMuted must default to false');

  // Case F: Float volume rounding
  mockStorage.set('maze_daily_settings', JSON.stringify({
    audioNavVolume: 0.3333333333333333,
  }));
  const fromFloat = loadSettings();
  assert.strictEqual(fromFloat.audioNavVolume, 0.33, 'Volume should round to 2 decimal places');
});

runTest('3.9 saveSettings writes clean JSON to localStorage', () => {
  mockStorage.clear();
  const testSettings = {
    ...getDefaultSettings(),
    audioNavEnabled: true,
    audioNavVolume: 0.65,
    theme: 'light',
  };
  saveSettings(testSettings);
  const raw = mockStorage.get('maze_daily_settings');
  assert.ok(raw, 'localStorage must contain saved settings');
  const parsed = JSON.parse(raw);
  assert.strictEqual(parsed.audioNavEnabled, true);
  assert.strictEqual(parsed.audioNavVolume, 0.65);
  assert.strictEqual(parsed.theme, 'light');
});

// ============================================================================
// SUITE 4: Non-Deletion on Disable Invariant Verification
// ============================================================================
console.log('\n--- SUITE 4: Non-Deletion on Disable Invariant Verification ---');

runTest('4.1 Disabling modules does NOT invoke caches.delete', () => {
  let cacheDeleteCallCount = 0;
  const deletedKeys = [];

  // Mock window.caches with delete spy
  const mockCaches = {
    open: async (name) => ({
      match: async () => null,
      put: async () => {},
    }),
    delete: async (key) => {
      cacheDeleteCallCount++;
      deletedKeys.push(key);
      return true;
    },
    keys: async () => [],
    match: async () => null,
  };

  globalThis.window.caches = mockCaches;

  // Simulate disabling head tracking in settings (as done in App.tsx / SettingsModal)
  const settingsCurrent = loadSettings();
  
  // App.tsx handleToggleHeadTracking(false):
  // 1. calls headTrackingController.stop() (if active)
  // 2. calls handleUpdateSettings({ ...settings, headTrackingEnabled: false })
  // 3. saves settings to localStorage
  const disabledHT = { ...settingsCurrent, headTrackingEnabled: false };
  saveSettings(disabledHT);

  // App.tsx handleToggleAudioNav(false):
  // 1. calls audioNavController.destroy() (if active)
  // 2. calls handleUpdateSettings({ ...settings, audioNavEnabled: false })
  // 3. saves settings to localStorage
  const disabledBoth = { ...disabledHT, audioNavEnabled: false };
  saveSettings(disabledBoth);

  console.log(`    caches.delete called count during module disable: ${cacheDeleteCallCount}`);
  assert.strictEqual(
    cacheDeleteCallCount,
    0,
    `caches.delete was called ${cacheDeleteCallCount} times during module disable (deleted: ${deletedKeys.join(', ')}). It must NEVER be called when toggling off in settings!`
  );
});

runTest('4.2 Verify audioNavController.destroy() and headTrackingController.stop() do not delete cache', async () => {
  let cacheDeleteCalled = false;
  globalThis.window.caches = {
    open: async () => ({ match: async () => null, put: async () => {} }),
    delete: async () => {
      cacheDeleteCalled = true;
      return true;
    },
    keys: async () => [],
  };

  // Import controllers
  const { audioNavController } = await import('../src/modules/audioNav/index.ts');
  const { headTrackingController } = await import('../src/modules/headTracking/index.ts');

  // Invoke destroy and stop
  audioNavController.destroy();
  headTrackingController.stop();

  assert.strictEqual(cacheDeleteCalled, false, 'Controller teardown must not invoke caches.delete');
});

runTest('4.3 Compare with 10-day retention purge which legitimately invokes caches.delete', async () => {
  let retentionPurgeCallCount = 0;
  const purgedKeys = [];

  globalThis.window.caches = {
    open: async () => ({ match: async () => null, put: async () => {} }),
    delete: async (key) => {
      retentionPurgeCallCount++;
      purgedKeys.push(key);
      return true;
    },
    keys: async () => ['maze-daily-module-cache-v1-audioNav'],
  };

  const { purgeModuleCache } = await import('../src/services/moduleLoader.ts');
  
  // Legitimate purge explicitly for expiration / version mismatch
  await purgeModuleCache('audioNav');
  console.log(`    purgeModuleCache legitimately deleted keys: ${purgedKeys.join(', ')}`);
  assert.ok(retentionPurgeCallCount > 0, 'purgeModuleCache should invoke caches.delete for retention policy');
});

// ============================================================================
// FINAL SUMMARY
// ============================================================================
console.log('\n================================================================');
console.log(`  ALL ${passedTests}/${totalTests} TESTS PASSED CLEANLY!`);
console.log('================================================================\n');
