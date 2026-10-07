/**
 * tests/auditor_forensic_m4.mjs
 *
 * Forensic Integrity Audit Test Suite for Milestone 4 (Settings & Accessibility UI).
 * Authored by teamwork_preview_auditor_m4_1.
 *
 * Empirically verifies:
 * 1. Complete authentic 8-language localization across all 24 accessibility keys (192 strings)
 * 2. Absence of placeholder tokens, TODOs, or copy-pasted English in non-EN locales
 * 3. Correct string template formatting with named tokens ({module}, {percent}, {seconds})
 * 4. Defensive storage schema migration, type guards, and mathematical volume clamping [0.0, 1.0]
 * 5. Architectural decoupling: useGameLoop has zero static dependencies on audioNav/headTracking
 * 6. Authentic Modal components: progress bars, ARIA polite live regions, video preview, reticle, error guidance
 * 7. On-demand dynamic lazy loading in App.tsx without entry chunk pollution
 * 8. Strict bundle size verification: entry chunk < 320 kB, relative asset links in dist/index.html
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { TRANSLATIONS, formatString, LANGUAGE_OPTIONS } from '../src/utils/i18n.ts';
import { getDefaultSettings, loadSettings, saveSettings } from '../src/utils/storage.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const testResults = [];

function check(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    testResults.push({ name, pass: true });
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    testResults.push({ name, pass: false, error: err.message });
  }
}

console.log('============================================================');
console.log('  MILESTONE 4 FORENSIC AUDIT EMPIRICAL TEST SUITE');
console.log('============================================================\n');

// ============================================================================
// 1. I18N AUTHENTICITY & 8-LANGUAGE COMPLETENESS (192 STRINGS)
// ============================================================================
console.log('--- 1. Multi-Language Localization Authenticity (i18n.ts) ---');

const REQUIRED_ACCESSIBILITY_KEYS = [
  'accessibility',
  'headTracking',
  'headTrackingDesc',
  'headTrackingRecalibrate',
  'audioNav',
  'audioNavDesc',
  'audioNavVolume',
  'audioNavHotkeys',
  'downloadingTitle',
  'downloadingProgress',
  'downloadComplete',
  'downloadFailed',
  'calibrationTitle',
  'calibrationPrompt',
  'calibrationCountdown',
  'calibrationSuccess',
  'cameraErrorTitle',
  'cameraDenied',
  'cameraNotFound',
  'cameraGenericError',
  'audioNavStatusMuted',
  'audioNavStatusUnmuted',
  'audioNavVolumeChanged',
  'audioFallbackNotice',
];

const SUPPORTED_LANGS = ['en', 'ru', 'es', 'zh', 'ja', 'de', 'tr', 'pt'];

check('1.1 LANGUAGE_OPTIONS contains all 8 supported language codes', () => {
  assert.equal(LANGUAGE_OPTIONS.length, 8);
  const codes = LANGUAGE_OPTIONS.map((o) => o.code);
  for (const lang of SUPPORTED_LANGS) {
    assert.ok(codes.includes(lang), `Language ${lang} must be present in LANGUAGE_OPTIONS`);
  }
});

check('1.2 TRANSLATIONS contains all 8 languages and 24 accessibility keys (192 strings)', () => {
  for (const lang of SUPPORTED_LANGS) {
    assert.ok(TRANSLATIONS[lang], `TRANSLATIONS must have entry for language: ${lang}`);
    for (const key of REQUIRED_ACCESSIBILITY_KEYS) {
      const val = TRANSLATIONS[lang][key];
      assert.ok(typeof val === 'string', `${lang}.${key} must be a string`);
      assert.ok(val.trim().length > 0, `${lang}.${key} must not be empty`);
    }
  }
});

check('1.3 No placeholder strings ("TODO", "dummy", "FIXME", "placeholder") in i18n', () => {
  for (const lang of SUPPORTED_LANGS) {
    for (const key of REQUIRED_ACCESSIBILITY_KEYS) {
      const val = TRANSLATIONS[lang][key];
      assert.ok(!/\b(TODO|dummy|FIXME|placeholder)\b/i.test(val), `Suspicious placeholder found in ${lang}.${key}: "${val}"`);
    }
  }
});

check('1.4 Non-English translations are authentic and distinct from English', () => {
  const nonEnLangs = ['ru', 'es', 'zh', 'ja', 'de', 'tr', 'pt'];
  for (const lang of nonEnLangs) {
    for (const key of REQUIRED_ACCESSIBILITY_KEYS) {
      const enVal = TRANSLATIONS.en[key];
      const langVal = TRANSLATIONS[lang][key];

      // Exception: "Volume {percent}%" in Portuguese is genuinely "Volume {percent}%"
      if (lang === 'pt' && key === 'audioNavVolumeChanged') {
        continue;
      }

      assert.notEqual(
        langVal,
        enVal,
        `Translation for ${lang}.${key} must not be an untranslated copy of English: "${enVal}"`
      );
    }
  }
});

check('1.5 formatString template replacement functions accurately across languages', () => {
  const enRes = formatString(TRANSLATIONS.en.downloadingProgress, { module: 'Audio Nav', percent: 45 });
  assert.equal(enRes, 'Downloading Audio Nav: 45%');

  const ruRes = formatString(TRANSLATIONS.ru.downloadingProgress, { module: 'Аудио', percent: 50 });
  assert.equal(ruRes, 'Загрузка Аудио: 50%');

  const trRes = formatString(TRANSLATIONS.tr.downloadingProgress, { module: 'Baş Takibi', percent: 75 });
  assert.equal(trRes, 'Baş Takibi indiriliyor: %75');

  const zhRes = formatString(TRANSLATIONS.zh.calibrationCountdown, { seconds: 3 });
  assert.equal(zhRes, '将在 3 秒后完成校准...');

  const jaRes = formatString(TRANSLATIONS.ja.calibrationCountdown, { seconds: 2 });
  assert.equal(jaRes, '残り 2 秒で測定...');

  // Unmatched placeholders remain intact
  const fallbackRes = formatString('Hello {name} {extra}', { name: 'World' });
  assert.equal(fallbackRes, 'Hello World {extra}');
});

// ============================================================================
// 2. STORAGE DEFENSIVE MIGRATION & VOLUME CLAMPING (storage.ts)
// ============================================================================
console.log('\n--- 2. Storage Persistence & Defensive Migration (storage.ts) ---');

const mockStorageMap = new Map();
const mockLocalStorage = {
  getItem: (k) => mockStorageMap.get(k) ?? null,
  setItem: (k, v) => mockStorageMap.set(k, String(v)),
  removeItem: (k) => mockStorageMap.delete(k),
  clear: () => mockStorageMap.clear(),
};

globalThis.window = {
  localStorage: mockLocalStorage,
  matchMedia: () => ({ matches: false }),
};
globalThis.localStorage = mockLocalStorage;

check('2.1 getDefaultSettings initializes all accessibility settings cleanly', () => {
  const def = getDefaultSettings();
  assert.strictEqual(def.headTrackingEnabled, false);
  assert.strictEqual(def.audioNavEnabled, false);
  assert.strictEqual(def.audioNavVolume, 0.8);
  assert.strictEqual(def.audioNavMuted, false);
});

check('2.2 loadSettings clamps negative and overflow volumes into [0.0, 1.0]', () => {
  mockStorageMap.set('maze_daily_settings', JSON.stringify({ audioNavVolume: -5 }));
  assert.strictEqual(loadSettings().audioNavVolume, 0.0);

  mockStorageMap.set('maze_daily_settings', JSON.stringify({ audioNavVolume: 10.5 }));
  assert.strictEqual(loadSettings().audioNavVolume, 1.0);

  mockStorageMap.set('maze_daily_settings', JSON.stringify({ audioNavVolume: 0.4567 }));
  assert.strictEqual(loadSettings().audioNavVolume, 0.46);
});

check('2.3 loadSettings rejects non-boolean types for toggle settings', () => {
  mockStorageMap.set(
    'maze_daily_settings',
    JSON.stringify({ headTrackingEnabled: 'true', audioNavEnabled: 1, audioNavMuted: 'yes' })
  );
  const loaded = loadSettings();
  assert.strictEqual(loaded.headTrackingEnabled, false);
  assert.strictEqual(loaded.audioNavEnabled, false);
  assert.strictEqual(loaded.audioNavMuted, false);
});

check('2.4 loadSettings migrates legacy storage entries seamlessly', () => {
  mockStorageMap.set(
    'maze_daily_settings',
    JSON.stringify({ theme: 'light', lang: 'es', playerColor: '#ffffff', showSplits: false })
  );
  const loaded = loadSettings();
  assert.strictEqual(loaded.theme, 'light');
  assert.strictEqual(loaded.lang, 'es');
  assert.strictEqual(loaded.showSplits, false);
  assert.strictEqual(loaded.headTrackingEnabled, false);
  assert.strictEqual(loaded.audioNavEnabled, false);
  assert.strictEqual(loaded.audioNavVolume, 0.8);
  assert.strictEqual(loaded.audioNavMuted, false);
});

// ============================================================================
// 3. ARCHITECTURAL DECOUPLING & ZERO STATIC LEAKS
// ============================================================================
console.log('\n--- 3. Architectural Decoupling & Game Loop Isolation ---');

const gameLoopSrc = fs.readFileSync(path.join(projectRoot, 'src', 'hooks', 'useGameLoop.ts'), 'utf-8');

check('3.1 useGameLoop.ts does NOT import audioNav or headTracking directly', () => {
  assert.ok(!gameLoopSrc.includes("from '../modules/audioNav"), 'useGameLoop must not import audioNav');
  assert.ok(!gameLoopSrc.includes("from '../modules/headTracking"), 'useGameLoop must not import headTracking');
  assert.ok(!gameLoopSrc.includes('audioNavController'), 'useGameLoop must not reference audioNavController');
});

check('3.2 useGameLoop.ts provides clean pub/sub callbacks for physics and audio', () => {
  assert.ok(gameLoopSrc.includes('onWallCollision?: () => void;'), 'Provides onWallCollision prop');
  assert.ok(gameLoopSrc.includes('onPlayerPositionUpdate?: (pos: Point,'), 'Provides onPlayerPositionUpdate prop');
  assert.ok(gameLoopSrc.includes('onVictory?: () => void;'), 'Provides onVictory prop');
  assert.ok(gameLoopSrc.includes('onAudioResume?: () => void;'), 'Provides onAudioResume prop');
});

// ============================================================================
// 4. REACT ACCESSIBILITY MODALS INTEGRITY & ARIA VERIFICATION
// ============================================================================
console.log('\n--- 4. React Modals Forensic Verification ---');

const dlModalSrc = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'Modals', 'DownloadProgressModal.tsx'), 'utf-8');
const calModalSrc = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'Modals', 'CalibrationModal.tsx'), 'utf-8');
const errModalSrc = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'Modals', 'CameraErrorModal.tsx'), 'utf-8');
const setModalSrc = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'Modals', 'SettingsModal.tsx'), 'utf-8');

check('4.1 DownloadProgressModal has authentic progressbar, milestones and aria-live="polite"', () => {
  assert.ok(dlModalSrc.includes('role="progressbar"'), 'Must have role="progressbar"');
  assert.ok(dlModalSrc.includes('aria-valuenow={clampedProgress}'), 'Must have dynamic aria-valuenow');
  assert.ok(dlModalSrc.includes('aria-valuemin={0}'), 'Must have aria-valuemin={0}');
  assert.ok(dlModalSrc.includes('aria-valuemax={100}'), 'Must have aria-valuemax={100}');
  assert.ok(dlModalSrc.includes('aria-live="polite"'), 'Must announce progress politely via aria-live="polite"');
  assert.ok(dlModalSrc.includes('[0, 25, 50, 75, 100]'), 'Must calculate throttled milestone announcements');
});

check('4.2 CalibrationModal has authentic countdown, mirrored preview, reticle, and timeout handling', () => {
  assert.ok(calModalSrc.includes('previewVideoRef'), 'Must have dedicated preview video ref');
  assert.ok(calModalSrc.includes("transform: 'scaleX(-1)'"), 'Must use mirrored selfie transform');
  assert.ok(calModalSrc.includes('CALIBRATION_TIMEOUT'), 'Must handle CALIBRATION_TIMEOUT');
  assert.ok(calModalSrc.includes('handleRetry'), 'Must provide retry action upon failure/timeout');
  assert.ok(calModalSrc.includes('countdown'), 'Must manage countdown state');
});

check('4.3 CameraErrorModal handles NOT_ALLOWED and NOT_FOUND with localized guidance and fallbacks', () => {
  assert.ok(errModalSrc.includes("errorCode === 'NOT_ALLOWED'"), 'Must handle NOT_ALLOWED');
  assert.ok(errModalSrc.includes("errorCode === 'NOT_FOUND'"), 'Must handle NOT_FOUND');
  assert.ok(errModalSrc.includes('desktopControls'), 'Must present keyboard fallback');
  assert.ok(errModalSrc.includes('mobileControls'), 'Must present touch/gamepad fallback');
});

check('4.4 SettingsModal includes independent switches, recalibrate action, and volume slider', () => {
  assert.ok(setModalSrc.includes('handleHeadTrackingToggle'), 'Must handle head tracking switch independently');
  assert.ok(setModalSrc.includes('handleAudioNavToggle'), 'Must handle audio nav switch independently');
  assert.ok(setModalSrc.includes('onRecalibrateHeadTracking'), 'Must provide recalibrate trigger');
  assert.ok(setModalSrc.includes('type="range"'), 'Must render volume slider');
  assert.ok(setModalSrc.includes('settings.audioNavMuted'), 'Must render mute toggle');
});

// ============================================================================
// 5. APP.TSX ORCHESTRATION & DYNAMIC LAZY CHUNKS
// ============================================================================
console.log('\n--- 5. App.tsx Dynamic Orchestration & Lazy Loading ---');

const appSrc = fs.readFileSync(path.join(projectRoot, 'src', 'App.tsx'), 'utf-8');

check('5.1 App.tsx mounts persistent off-screen video element for head tracking', () => {
  assert.ok(appSrc.includes('<video'), 'Must contain <video element');
  assert.ok(appSrc.includes("ref={videoRef}"), 'Must attach videoRef');
  assert.ok(appSrc.includes("style={{ display: 'none' }}"), 'Video must be off-screen / hidden');
  assert.ok(appSrc.includes('aria-hidden="true"'), 'Video must be aria-hidden');
});

check('5.2 App.tsx lazy-loads modals via React.lazy', () => {
  assert.ok(appSrc.includes("React.lazy(() =>\n  import('./components/Modals/SettingsModal')"), 'SettingsModal lazy loaded');
  assert.ok(appSrc.includes("React.lazy(() =>\n  import('./components/Modals/CalibrationModal')"), 'CalibrationModal lazy loaded');
  assert.ok(appSrc.includes("React.lazy(() =>\n  import('./components/Modals/DownloadProgressModal')"), 'DownloadProgressModal lazy loaded');
  assert.ok(appSrc.includes("React.lazy(() =>\n  import('./components/Modals/CameraErrorModal')"), 'CameraErrorModal lazy loaded');
});

check('5.3 App.tsx dynamically imports audioNav and headTracking modules on demand', () => {
  assert.ok(appSrc.includes("import('./modules/audioNav')"), 'audioNav imported dynamically');
  assert.ok(appSrc.includes("import('./modules/headTracking')"), 'headTracking imported dynamically');
  assert.ok(!appSrc.includes("import { audioNavController } from './modules/audioNav'"), 'audioNavController must not be statically imported');
  assert.ok(!appSrc.includes("import { headTrackingController } from './modules/headTracking'"), 'headTrackingController must not be statically imported');
});

// ============================================================================
// 6. BUILD & BUNDLE SIZE VERIFICATION
// ============================================================================
console.log('\n--- 6. Build & Bundle Size Empirical Verification ---');

check('6.1 Production build and dist bundle inspect', () => {
  const distAssetsDir = path.join(projectRoot, 'dist', 'assets');
  assert.ok(fs.existsSync(distAssetsDir), 'dist/assets directory exists');

  const files = fs.readdirSync(distAssetsDir);
  const entryFile = files.find((f) => /^index-[a-zA-Z0-9_-]+\.js$/.test(f));
  assert.ok(entryFile, 'index-*.js entry chunk must exist');

  const entrySizeBytes = fs.statSync(path.join(distAssetsDir, entryFile)).size;
  const entrySizeKb = entrySizeBytes / 1024;
  console.log(`    Entry chunk: ${entryFile} (${entrySizeKb.toFixed(2)} kB)`);

  assert.ok(entrySizeKb < 320, `Entry chunk (${entrySizeKb.toFixed(2)} kB) must be strictly < 320 kB`);
  assert.ok(entrySizeKb >= 250, `Entry chunk (${entrySizeKb.toFixed(2)} kB) must be >= 250 kB`);
});

check('6.2 dist/index.html uses strictly relative URLs for assets', () => {
  const htmlPath = path.join(projectRoot, 'dist', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf-8');

  assert.ok(html.includes('src="./assets/index-'), 'Index script must use relative path ./assets/');
  assert.ok(html.includes('href="./favicon.svg"'), 'Favicon must use relative path ./favicon.svg');
});

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n============================================================');
const passed = testResults.filter((r) => r.pass).length;
const total = testResults.length;
console.log(`FORENSIC AUDIT RESULT: ${passed}/${total} CHECKS PASSED`);
console.log('============================================================\n');

if (passed !== total) {
  process.exit(1);
}
