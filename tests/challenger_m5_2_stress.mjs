/**
 * tests/challenger_m5_2_stress.mjs
 *
 * Empirical Challenger 2 Stress Suite for Milestone 5:
 * 1. Production Build Artifacts Inspection:
 *    - Strict entry chunk size budget (< 320 kB ceiling: 327,680 bytes)
 *    - Strict relative URLs in dist/index.html (./assets/..., ./favicon.svg)
 *    - Deep verification of zero static bundling of MediaPipe vision models / MP3 audio in entry chunk
 * 2. Settings Schema Migration & Defensive Storage Stress:
 *    - Corrupted, missing, null, type-mismatched, and extreme values
 *    - Clamping and defaulting gracefully without throwing uncaught exceptions
 *    - Storage exception robustness (DOMException/SecurityError/QuotaExceededError)
 *    - SSR/non-browser environment safety
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('================================================================');
console.log('  CHALLENGER 2 (M5): PRODUCTION BUILD & STORAGE STRESS HARNESS');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
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
    failedTests++;
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

// ============================================================================
// PART 1: PRODUCTION BUILD ARTIFACTS VERIFICATION
// ============================================================================
console.log('\n--- PART 1: Production Build Artifacts Verification ---');

const distDir = path.join(projectRoot, 'dist');
const distAssetsDir = path.join(distDir, 'assets');
const distHtmlFile = path.join(distDir, 'index.html');

runTest('1.1 dist/ directory and assets folder exist', () => {
  assert.ok(fs.existsSync(distDir), 'dist/ directory must exist');
  assert.ok(fs.existsSync(distAssetsDir), 'dist/assets directory must exist');
  assert.ok(fs.existsSync(distHtmlFile), 'dist/index.html must exist');
});

let entryChunkName = null;
let entryChunkPath = null;
let entryChunkBytes = 0;

runTest('1.2 Identify entry chunk dist/assets/index-*.js', () => {
  const files = fs.readdirSync(distAssetsDir);
  entryChunkName = files.find(f => /^index-[a-zA-Z0-9_-]+\.js$/.test(f));
  assert.ok(entryChunkName, `Entry chunk matching index-*.js must exist. Found files: ${files.join(', ')}`);
  entryChunkPath = path.join(distAssetsDir, entryChunkName);
  const stats = fs.statSync(entryChunkPath);
  entryChunkBytes = stats.size;
  console.log(`    Identified entry chunk: ${entryChunkName}`);
  console.log(`    Exact size: ${entryChunkBytes} bytes (${(entryChunkBytes / 1024).toFixed(2)} KiB)`);
});

runTest('1.3 Entry chunk size is strictly < 320 kB (ceiling 327,680 bytes)', () => {
  const CEILING_BYTES = 320 * 1024; // 327,680 bytes
  assert.ok(
    entryChunkBytes < CEILING_BYTES,
    `Entry chunk size (${entryChunkBytes} bytes) exceeds or equals ceiling 320 kB (${CEILING_BYTES} bytes)!`
  );
  const marginBytes = CEILING_BYTES - entryChunkBytes;
  console.log(`    Under ceiling by ${marginBytes} bytes (${(marginBytes / 1024).toFixed(2)} KiB headroom).`);
});

runTest('1.4 dist/index.html uses strictly relative URLs', () => {
  const html = fs.readFileSync(distHtmlFile, 'utf8');

  // Verify favicon
  const faviconMatches = Array.from(html.matchAll(/<link[^>]+rel=["']icon["'][^>]*href=["']([^"']+)["']/gi)).map(m => m[1]);
  assert.ok(faviconMatches.length > 0, 'Favicon link must exist in index.html');
  for (const href of faviconMatches) {
    console.log(`    Favicon href: ${href}`);
    assert.ok(href.startsWith('./') || !href.startsWith('/'), `Favicon href "${href}" must be relative (starts with ./)`);
    assert.ok(!href.startsWith('/favicon'), `Favicon href "${href}" must not be root-relative`);
  }

  // Verify script tags
  const scriptMatches = Array.from(html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)).map(m => m[1]);
  assert.ok(scriptMatches.length > 0, 'Script tags must exist in index.html');
  for (const src of scriptMatches) {
    console.log(`    Script src: ${src}`);
    assert.ok(src.startsWith('./'), `Script src "${src}" must start with ./`);
    assert.ok(!src.startsWith('/assets/'), `Script src "${src}" must not be root-relative`);
  }

  // Verify stylesheet links
  const cssMatches = Array.from(html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)).map(m => m[1]);
  assert.ok(cssMatches.length > 0, 'Stylesheet link must exist in index.html');
  for (const href of cssMatches) {
    console.log(`    CSS href: ${href}`);
    assert.ok(href.startsWith('./'), `CSS href "${href}" must start with ./`);
    assert.ok(!href.startsWith('/assets/'), `CSS href "${href}" must not be root-relative`);
  }

  // Verify preload links
  const preloadMatches = Array.from(html.matchAll(/<link[^>]+rel=["']modulepreload["'][^>]*href=["']([^"']+)["']/gi)).map(m => m[1]);
  for (const href of preloadMatches) {
    console.log(`    Preload href: ${href}`);
    assert.ok(href.startsWith('./'), `Preload href "${href}" must start with ./`);
    assert.ok(!href.startsWith('/assets/'), `Preload href "${href}" must not be root-relative`);
  }
});

runTest('1.5 Entry chunk has ZERO static bundling of MediaPipe vision models', () => {
  const content = fs.readFileSync(entryChunkPath, 'utf8');

  // Forbidden patterns that signify static bundling of MediaPipe in entry chunk
  const forbiddenPatterns = [
    'FaceLandmarker',
    'tasks-vision',
    '@mediapipe',
    'vision_bundle',
    'face_landmarker.task',
    'createFromModelPath',
    'createFromOptions',
  ];

  for (const pattern of forbiddenPatterns) {
    const regex = new RegExp(`\\b${pattern}\\b`, 'i');
    const hasPattern = regex.test(content);
    assert.ok(!hasPattern, `Entry chunk must NOT contain "${pattern}" statically bundled!`);
  }
});

runTest('1.6 Entry chunk has ZERO static bundling of MP3 audio files or audio buffers', () => {
  const content = fs.readFileSync(entryChunkPath, 'utf8');

  // Verify no stem MP3 file names or inlined audio data
  const forbiddenAudio = [
    'stem-1.mp3',
    'stem-2.mp3',
    'stem-3.mp3',
    'stem-4.mp3',
    'final.mp3',
    'data:audio/',
    'audio/mpeg',
    'audio/mp3',
    'ID3',
  ];

  for (const pattern of forbiddenAudio) {
    assert.ok(
      !content.includes(pattern),
      `Entry chunk must NOT contain audio pattern "${pattern}" statically bundled!`
    );
  }
});

runTest('1.7 Heavy accessibility modules and modals are partitioned into separate dynamic chunks', () => {
  const files = fs.readdirSync(distAssetsDir);
  const requiredChunks = [
    { prefix: 'vision_bundle-', label: 'MediaPipe Vision Chunk' },
    { prefix: 'headTracking-', label: 'Head Tracking Module' },
    { prefix: 'audioNav-', label: 'Audio Navigation Module' },
    { prefix: 'moduleLoader-', label: 'Module Loader Service' },
    { prefix: 'SettingsModal-', label: 'Settings Modal' },
    { prefix: 'CalibrationModal-', label: 'Calibration Modal' },
    { prefix: 'CameraErrorModal-', label: 'Camera Error Modal' },
    { prefix: 'DownloadProgressModal-', label: 'Download Progress Modal' },
  ];

  for (const chunk of requiredChunks) {
    const match = files.find(f => f.startsWith(chunk.prefix) && f.endsWith('.js'));
    assert.ok(match, `${chunk.label} chunk (${chunk.prefix}*.js) must exist as separate bundle in dist/assets`);
    const size = fs.statSync(path.join(distAssetsDir, match)).size;
    console.log(`    Chunk: ${match} (${(size / 1024).toFixed(2)} KiB)`);
  }
});

runTest('1.8 Audio stem assets exist in dist/audio/stems/ as standalone files', () => {
  const stemsDir = path.join(distDir, 'audio', 'stems');
  assert.ok(fs.existsSync(stemsDir), 'dist/audio/stems directory must exist');
  const expectedStems = ['stem-1.mp3', 'stem-2.mp3', 'stem-3.mp3', 'stem-4.mp3', 'final.mp3'];
  for (const stem of expectedStems) {
    const stemPath = path.join(stemsDir, stem);
    assert.ok(fs.existsSync(stemPath), `Audio stem file ${stem} must exist on disk`);
    const size = fs.statSync(stemPath).size;
    assert.ok(size > 50000, `Audio stem file ${stem} must be non-empty (got ${size} bytes)`);
  }
});

// ============================================================================
// PART 2: SETTINGS SCHEMA RESILIENCE & DEFENSIVE STORAGE STRESS
// ============================================================================
console.log('\n--- PART 2: Settings Schema Resilience & Storage Stress ---');

// Mock localStorage store
let storageThrowOnGet = null;
let storageThrowOnSet = null;
const memoryStore = new Map();

const mockLocalStorage = {
  getItem: (key) => {
    if (storageThrowOnGet) throw storageThrowOnGet;
    return memoryStore.get(key) ?? null;
  },
  setItem: (key, val) => {
    if (storageThrowOnSet) throw storageThrowOnSet;
    memoryStore.set(key, String(val));
  },
  removeItem: (key) => memoryStore.delete(key),
  clear: () => memoryStore.clear(),
};

globalThis.window = {
  localStorage: mockLocalStorage,
  matchMedia: (query) => ({ matches: query.includes('light') ? false : true }),
};
globalThis.localStorage = mockLocalStorage;

try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { language: 'en-US' },
    configurable: true,
    writable: true,
  });
} catch {
  // Ignore
}

// Dynamic import of storage utilities
const { getDefaultSettings, loadSettings, saveSettings } = await import('../src/utils/storage.ts');

runTest('2.1 Baseline default settings schema conformance', () => {
  memoryStore.clear();
  const def = getDefaultSettings();
  assert.strictEqual(typeof def, 'object');
  assert.strictEqual(def.headTrackingEnabled, false);
  assert.strictEqual(def.audioNavEnabled, false);
  assert.strictEqual(def.audioNavVolume, 0.8);
  assert.strictEqual(def.audioNavMuted, false);
  assert.strictEqual(def.showSplits, true);
  assert.strictEqual(def.showControls, true);
  assert.strictEqual(def.theme, 'dark');
  assert.strictEqual(def.lang, 'en');
});

runTest('2.2 Corrupted raw values in localStorage parse without throwing', () => {
  const corruptedPayloads = [
    '{ invalid json syntax',
    '{{{',
    'undefined',
    'null',
    '42',
    'true',
    'false',
    '"just a string"',
    '""',
    '\0\0\0binary_garbage\x01\x02',
    '[]',
    '[1, 2, 3]',
    '{"theme": "dark", "broken": ',
  ];

  for (const raw of corruptedPayloads) {
    memoryStore.set('maze_daily_settings', raw);
    let loaded = null;
    assert.doesNotThrow(() => {
      loaded = loadSettings();
    }, `loadSettings must not throw on payload: ${raw}`);

    assert.ok(loaded !== null && typeof loaded === 'object');
    // Verify fallback to safe defaults
    assert.strictEqual(typeof loaded.headTrackingEnabled, 'boolean');
    assert.strictEqual(typeof loaded.audioNavEnabled, 'boolean');
    assert.strictEqual(typeof loaded.audioNavVolume, 'number');
    assert.strictEqual(typeof loaded.audioNavMuted, 'boolean');
    assert.strictEqual(loaded.audioNavVolume, 0.8);
  }
});

runTest('2.3 Extreme and adversarial audioNavVolume clamping stress', () => {
  const cases = [
    { input: -100, expected: 0.0, desc: 'negative large' },
    { input: -1, expected: 0.0, desc: 'negative one' },
    { input: -0.0001, expected: 0.0, desc: 'tiny negative' },
    { input: 0.0, expected: 0.0, desc: 'exact zero' },
    { input: 1.0, expected: 1.0, desc: 'exact one' },
    { input: 1.0001, expected: 1.0, desc: 'slightly above 1' },
    { input: 2, expected: 1.0, desc: 'double max' },
    { input: 999999, expected: 1.0, desc: 'huge positive' },
    { input: Number.MAX_VALUE, expected: 1.0, desc: 'MAX_VALUE' },
    { input: Number.MAX_SAFE_INTEGER, expected: 1.0, desc: 'MAX_SAFE_INTEGER' },
    { input: 0.55555, expected: 0.56, desc: 'two decimal rounding' },
    { input: 0.333333333, expected: 0.33, desc: 'one third rounding' },
    // JSON converts Infinity / -Infinity / NaN to null, which safely falls back to default 0.8
    { input: Infinity, expected: 0.8, desc: 'positive infinity (serializes to null)' },
    { input: -Infinity, expected: 0.8, desc: 'negative infinity (serializes to null)' },
    { input: NaN, expected: 0.8, desc: 'numeric NaN (serializes to null)' },
    { input: 'NaN', expected: 0.8, desc: 'string NaN' },
    { input: '0.5', expected: 0.8, desc: 'numeric string' },
    { input: null, expected: 0.8, desc: 'null' },
    { input: undefined, expected: 0.8, desc: 'undefined' },
    { input: {}, expected: 0.8, desc: 'object' },
    { input: [], expected: 0.8, desc: 'array' },
    { input: true, expected: 0.8, desc: 'boolean true' },
    { input: false, expected: 0.8, desc: 'boolean false' },
  ];

  for (const c of cases) {
    memoryStore.set('maze_daily_settings', JSON.stringify({ audioNavVolume: c.input }));
    const loaded = loadSettings();
    assert.strictEqual(
      loaded.audioNavVolume,
      c.expected,
      `Volume test failed for ${c.desc} (input: ${c.input}). Expected ${c.expected}, got ${loaded.audioNavVolume}`
    );
  }
});

runTest('2.4 Boolean flags type resilience (strict boolean check)', () => {
  const flags = ['headTrackingEnabled', 'audioNavEnabled', 'audioNavMuted'];
  const nonBooleans = ['true', 'false', 1, 0, null, undefined, {}, [], '1'];

  for (const flag of flags) {
    for (const val of nonBooleans) {
      memoryStore.set('maze_daily_settings', JSON.stringify({ [flag]: val }));
      const loaded = loadSettings();
      assert.strictEqual(
        loaded[flag],
        false,
        `${flag} with invalid value ${JSON.stringify(val)} must default to false, got: ${loaded[flag]}`
      );
    }

    // Valid boolean true
    memoryStore.set('maze_daily_settings', JSON.stringify({ [flag]: true }));
    const loadedTrue = loadSettings();
    assert.strictEqual(loadedTrue[flag], true, `${flag} with true must evaluate to true`);

    // Valid boolean false
    memoryStore.set('maze_daily_settings', JSON.stringify({ [flag]: false }));
    const loadedFalse = loadSettings();
    assert.strictEqual(loadedFalse[flag], false, `${flag} with false must evaluate to false`);
  }
});

runTest('2.5 Backward compatibility & schema migration from legacy v0 settings', () => {
  // Legacy settings containing only pre-accessibility fields
  const legacyV0 = {
    theme: 'light',
    lang: 'ru',
    playerColor: '#ff0055',
    showSplits: false,
    showControls: false,
  };

  memoryStore.set('maze_daily_settings', JSON.stringify(legacyV0));
  const migrated = loadSettings();

  // Preserved original user selections
  assert.strictEqual(migrated.theme, 'light', 'Legacy theme must be preserved');
  assert.strictEqual(migrated.lang, 'ru', 'Legacy lang must be preserved');
  assert.strictEqual(migrated.playerColor, '#ff0055', 'Legacy playerColor must be preserved');
  assert.strictEqual(migrated.showSplits, false, 'Legacy showSplits must be preserved');
  assert.strictEqual(migrated.showControls, false, 'Legacy showControls must be preserved');

  // Injected new accessibility fields with safe defaults
  assert.strictEqual(migrated.headTrackingEnabled, false, 'headTrackingEnabled must default to false');
  assert.strictEqual(migrated.audioNavEnabled, false, 'audioNavEnabled must default to false');
  assert.strictEqual(migrated.audioNavVolume, 0.8, 'audioNavVolume must default to 0.8');
  assert.strictEqual(migrated.audioNavMuted, false, 'audioNavMuted must default to false');
});

runTest('2.6 localStorage exceptions (DOMException SecurityError / private browsing)', () => {
  // Simulate browser security restriction when accessing localStorage.getItem
  storageThrowOnGet = new Error('SecurityError: The operation is insecure.');
  let loaded = null;
  assert.doesNotThrow(() => {
    loaded = loadSettings();
  }, 'loadSettings must catch SecurityError gracefully');
  assert.strictEqual(loaded.audioNavVolume, 0.8);
  assert.strictEqual(loaded.headTrackingEnabled, false);
  storageThrowOnGet = null;
});

runTest('2.7 localStorage setItem QuotaExceededError handling', () => {
  storageThrowOnSet = new Error('QuotaExceededError: The quota has been exceeded.');
  assert.doesNotThrow(() => {
    saveSettings(getDefaultSettings());
  }, 'saveSettings must catch QuotaExceededError gracefully');
  storageThrowOnSet = null;
});

runTest('2.8 SSR / Non-browser environment safety', () => {
  // Simulate SSR where window is undefined
  const savedWindow = globalThis.window;
  globalThis.window = undefined;

  assert.doesNotThrow(() => {
    const ssrDefaults = getDefaultSettings();
    assert.strictEqual(ssrDefaults.headTrackingEnabled, false);
  }, 'getDefaultSettings must not throw when window is undefined');

  assert.doesNotThrow(() => {
    const ssrLoaded = loadSettings();
    assert.strictEqual(ssrLoaded.audioNavVolume, 0.8);
  }, 'loadSettings must not throw when window is undefined');

  assert.doesNotThrow(() => {
    saveSettings(getDefaultSettings());
  }, 'saveSettings must not throw when window is undefined');

  // Restore window
  globalThis.window = savedWindow;
});

// ============================================================================
// SUMMARY & VERDICT
// ============================================================================
console.log('\n================================================================');
console.log(`  ALL ${passedTests}/${totalTests} EMPIRICAL TESTS PASSED CLEANLY!`);
console.log(`  FAILED TESTS: ${failedTests}`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
