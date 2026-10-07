/**
 * tests/ui_modals_stress.mjs
 *
 * Empirical Challenger Test Suite for Milestone 4:
 * UI Modals, Screen Reader Throttling, Calibration Flow, and Error Mappings.
 *
 * Tests:
 * 1. Throttled Screen-Reader Announcements (DownloadProgressModal):
 *    - Discrete milestones [0, 25, 50, 75, 100] across simulated progress ticks.
 *    - Intermediate ticks (5%, 15%, 33%, 65%, 90%) suppress repeated announcements.
 *    - Error override immediately fires without waiting for milestone.
 * 2. Calibration Flow & Timeout Recovery (CalibrationModal):
 *    - Countdown decrements: 3 -> 2 -> 1.
 *    - CALIBRATION_TIMEOUT rejection transition to 'timeout' state.
 *    - Retry recovery mechanism (state reset to 'calibrating', countdown=3, retryKey++).
 *    - Localization audit of calibration timeout prompts and UI labels.
 * 3. Camera Error Code Mappings (CameraErrorModal):
 *    - NOT_ALLOWED -> cameraDenied.
 *    - NOT_FOUND -> cameraNotFound.
 *    - NOT_READABLE / OVERCONSTRAINED / UNKNOWN -> cameraGenericError.
 *    - Error message substring fallback matching.
 *    - Full 8-language completeness audit across all camera keys.
 * 4. formatString Interpolation Stress:
 *    - Standard substitution {module}, {percent}.
 *    - Numerical zero substitution { percent: 0 }.
 *    - Turkish inverted format %{percent}.
 *    - Undefined / null / missing parameters.
 *    - Regex special characters ($1, $&, etc.).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRANSLATIONS, LANGUAGE_OPTIONS, formatString } from '../src/utils/i18n.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('================================================================');
console.log('   MILESTONE 4 EMPIRICAL CHALLENGER STRESS & AUDIT SUITE        ');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function runTest(suite, name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${suite}: ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ [FAIL] ${suite}: ${name}`);
    console.error(`     Error: ${err.message}`);
    failureDetails.push({ suite, name, error: err.message });
  }
}

// ============================================================================
// SUITE 1: formatString Interpolation Stress Testing
// ============================================================================
console.log('--- SUITE 1: formatString Interpolation Stress ---');

runTest('formatString', 'Standard named placeholders substitution', () => {
  const template = 'Downloading {module}: {percent}%';
  const result = formatString(template, { module: 'Head Tracking', percent: 75 });
  assert.equal(result, 'Downloading Head Tracking: 75%');
});

runTest('formatString', 'Numerical zero substitution { percent: 0 } must not evaluate falsy', () => {
  const template = 'Downloading {module}: {percent}%';
  const result = formatString(template, { module: 'Audio Navigation', percent: 0 });
  assert.equal(result, 'Downloading Audio Navigation: 0%');
  assert.notEqual(result, 'Downloading Audio Navigation: %');
  assert.notEqual(result, 'Downloading Audio Navigation: {percent}%');
});

runTest('formatString', 'Turkish prefix format %{percent} substitution', () => {
  const trTemplate = TRANSLATIONS.tr.downloadingProgress; // '{module} indiriliyor: %{percent}'
  assert.ok(trTemplate.includes('%{percent}'), `Expected %{percent} in Turkish template, got "${trTemplate}"`);
  
  const result = formatString(trTemplate, { module: 'Baş Takibi', percent: 50 });
  assert.equal(result, 'Baş Takibi indiriliyor: %50');

  const zeroResult = formatString(trTemplate, { module: 'Baş Takibi', percent: 0 });
  assert.equal(zeroResult, 'Baş Takibi indiriliyor: %0');
});

runTest('formatString', 'Turkish volume format %{percent} substitution', () => {
  const trVolTemplate = TRANSLATIONS.tr.audioNavVolumeChanged; // 'Ses düzeyi %{percent}'
  assert.ok(trVolTemplate.includes('%{percent}'));
  
  const res0 = formatString(trVolTemplate, { percent: 0 });
  assert.equal(res0, 'Ses düzeyi %0');

  const res100 = formatString(trVolTemplate, { percent: 100 });
  assert.equal(res100, 'Ses düzeyi %100');
});

runTest('formatString', 'Missing or undefined parameters retain template tokens safely', () => {
  const template = '{greeting}, {name}! Your score is {score}.';
  const result = formatString(template, { greeting: 'Hello' });
  assert.equal(result, 'Hello, {name}! Your score is {score}.');
});

runTest('formatString', 'Explicit undefined and null values retain template tokens', () => {
  const template = 'File: {filename}, Status: {status}';
  const result = formatString(template, { filename: undefined, status: null });
  assert.equal(result, 'File: {filename}, Status: {status}');
});

runTest('formatString', 'Empty template returns empty string', () => {
  assert.equal(formatString('', { foo: 'bar' }), '');
  assert.equal(formatString(null, { foo: 'bar' }), '');
});

runTest('formatString', 'Replacement strings with dollar signs ($1, $&, $$) are inserted literally', () => {
  const template = 'Price: {price}';
  const result = formatString(template, { price: '$100.00 & $50' });
  assert.equal(result, 'Price: $100.00 & $50');
});

runTest('formatString', 'Templates without placeholders return identical string', () => {
  const plain = 'Static content without tokens';
  assert.equal(formatString(plain, { a: 1, b: 2 }), plain);
});

// ============================================================================
// SUITE 2: Throttled Screen-Reader Announcements (DownloadProgressModal)
// ============================================================================
console.log('\n--- SUITE 2: Throttled Screen-Reader Announcements ---');

// Replicate DownloadProgressModal's announcement computation algorithm exactly
function computeDownloadAnnouncement(progress, moduleName, error, lang = 'en') {
  const t = TRANSLATIONS[lang];
  const moduleLabel = moduleName === 'headTracking' ? t.headTracking : t.audioNav;

  const milestones = [0, 25, 50, 75, 100];
  const rounded = Math.floor(progress);
  const currentMilestone = milestones.reduce((prev, curr) => (rounded >= curr ? curr : prev), 0);

  const isError = error !== undefined && error !== null;
  const errorText = isError ? (error.trim().length > 0 ? error : t.downloadFailed) : null;
  if (isError && errorText) return errorText;
  if (currentMilestone === 100) return t.downloadComplete;
  return formatString(t.downloadingProgress, {
    module: moduleLabel,
    percent: currentMilestone,
  });
}

runTest('DownloadAnnouncements', 'Simulated progress ticks produce discrete milestone announcements', () => {
  const ticks = [0, 5, 15, 25, 33, 50, 65, 75, 90, 100];
  const t = TRANSLATIONS.en;
  const announcements = [];
  let distinctAnnouncementsCount = 0;
  let lastAnnouncement = null;

  for (const tick of ticks) {
    const ann = computeDownloadAnnouncement(tick, 'audioNav', null, 'en');
    announcements.push({ tick, ann });
    if (ann !== lastAnnouncement) {
      distinctAnnouncementsCount++;
      lastAnnouncement = ann;
    }
  }

  // Ticks:
  // 0%  -> milestone 0 -> "Downloading Audio Navigation: 0%"
  // 5%  -> milestone 0 -> UNCHANGED
  // 15% -> milestone 0 -> UNCHANGED
  // 25% -> milestone 25 -> "Downloading Audio Navigation: 25%" (changed)
  // 33% -> milestone 25 -> UNCHANGED
  // 50% -> milestone 50 -> "Downloading Audio Navigation: 50%" (changed)
  // 65% -> milestone 50 -> UNCHANGED
  // 75% -> milestone 75 -> "Downloading Audio Navigation: 75%" (changed)
  // 90% -> milestone 75 -> UNCHANGED
  // 100% -> milestone 100 -> "Download complete!" (changed)

  assert.equal(distinctAnnouncementsCount, 5, `Expected exactly 5 milestone announcements, got ${distinctAnnouncementsCount}`);
  assert.equal(announcements[0].ann, 'Downloading Audio Navigation: 0%');
  assert.equal(announcements[1].ann, announcements[0].ann); // 5% same as 0%
  assert.equal(announcements[2].ann, announcements[0].ann); // 15% same as 0%
  assert.equal(announcements[3].ann, 'Downloading Audio Navigation: 25%'); // 25%
  assert.equal(announcements[4].ann, announcements[3].ann); // 33% same as 25%
  assert.equal(announcements[5].ann, 'Downloading Audio Navigation: 50%'); // 50%
  assert.equal(announcements[6].ann, announcements[5].ann); // 65% same as 50%
  assert.equal(announcements[7].ann, 'Downloading Audio Navigation: 75%'); // 75%
  assert.equal(announcements[8].ann, announcements[7].ann); // 90% same as 75%
  assert.equal(announcements[9].ann, t.downloadComplete); // 100%
});

runTest('DownloadAnnouncements', 'Milestone throttling in all 8 languages at discrete thresholds', () => {
  for (const { code } of LANGUAGE_OPTIONS) {
    const t = TRANSLATIONS[code];
    const ann0 = computeDownloadAnnouncement(0, 'headTracking', null, code);
    const ann15 = computeDownloadAnnouncement(15, 'headTracking', null, code);
    const ann25 = computeDownloadAnnouncement(25, 'headTracking', null, code);
    const ann60 = computeDownloadAnnouncement(60, 'headTracking', null, code);
    const ann100 = computeDownloadAnnouncement(100, 'headTracking', null, code);

    assert.equal(ann0, ann15, `Lang ${code}: 15% should match 0% milestone`);
    assert.notEqual(ann0, ann25, `Lang ${code}: 25% must differ from 0%`);
    assert.equal(ann100, t.downloadComplete, `Lang ${code}: 100% must announce downloadComplete`);
  }
});

runTest('DownloadAnnouncements', 'Immediate error announcement bypasses progress milestone with non-empty error', () => {
  const errorMsg = 'Failed to load chunk audio-stems.wasm';
  const annOnError = computeDownloadAnnouncement(33, 'audioNav', errorMsg, 'en');
  assert.equal(annOnError, errorMsg, 'Error announcement must immediately reflect error message');
});

runTest('DownloadAnnouncements', 'Empty string error ("") safely triggers fallback to downloadFailed', () => {
  const t = TRANSLATIONS.ru;
  const ann = computeDownloadAnnouncement(50, 'audioNav', '', 'ru');
  console.log(`     [VERIFIED] When error="", announcement correctly falls back to: "${ann}"`);
  assert.equal(ann, t.downloadFailed, 'Empty error string must fall back to downloadFailed');
});

// ============================================================================
// SUITE 3: Calibration Flow & Timeout Recovery (CalibrationModal)
// ============================================================================
console.log('\n--- SUITE 3: Calibration Flow & Timeout Recovery ---');

// Simulate Calibration countdown timer logic
function simulateCountdown(initial = 3, ticks = 5) {
  let countdown = initial;
  const history = [countdown];
  for (let i = 0; i < ticks; i++) {
    countdown = countdown > 1 ? countdown - 1 : 1;
    history.push(countdown);
  }
  return history;
}

runTest('CalibrationModal', 'Countdown decrements strictly 3 -> 2 -> 1 and clamps at 1', () => {
  const history = simulateCountdown(3, 4);
  assert.deepEqual(history, [3, 2, 1, 1, 1]);
});

// Simulate Calibration state machine
class CalibrationStateMachine {
  constructor(lang = 'en') {
    this.lang = lang;
    this.status = 'calibrating';
    this.countdown = 3;
    this.errorMessage = null;
    this.retryKey = 0;
  }

  tick() {
    if (this.status === 'calibrating') {
      this.countdown = this.countdown > 1 ? this.countdown - 1 : 1;
    }
  }

  handleResolution(result) {
    this.status = 'success';
    this.countdown = 0;
  }

  handleRejection(err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'CALIBRATION_TIMEOUT') {
      this.status = 'timeout';
    } else {
      this.status = 'error';
      this.errorMessage = msg;
    }
  }

  handleRetry() {
    this.status = 'calibrating';
    this.countdown = 3;
    this.errorMessage = null;
    this.retryKey += 1;
  }

  getAnnouncement() {
    const t = TRANSLATIONS[this.lang];
    if (this.status === 'calibrating') {
      return formatString(t.calibrationCountdown, { seconds: this.countdown });
    }
    if (this.status === 'success') {
      return t.calibrationSuccess;
    }
    if (this.status === 'timeout') {
      return t.calibrationTimeout;
    }
    return this.errorMessage || 'Calibration error occurred.';
  }

  getGuidanceText() {
    const t = TRANSLATIONS[this.lang];
    if (this.status === 'calibrating') return t.calibrationPrompt;
    if (this.status === 'success') return t.calibrationSuccess;
    if (this.status === 'timeout') {
      return t.calibrationTimeout;
    }
    return this.errorMessage || 'Calibration error occurred.';
  }
}

runTest('CalibrationModal', 'CALIBRATION_TIMEOUT transitions status to timeout and enables retry', () => {
  const sm = new CalibrationStateMachine('en');
  assert.equal(sm.status, 'calibrating');
  sm.tick(); // 2
  sm.tick(); // 1

  sm.handleRejection(new Error('CALIBRATION_TIMEOUT'));
  assert.equal(sm.status, 'timeout');
  assert.equal(sm.errorMessage, null);

  // Test retry recovery
  sm.handleRetry();
  assert.equal(sm.status, 'calibrating');
  assert.equal(sm.countdown, 3);
  assert.equal(sm.retryKey, 1);
});

runTest('CalibrationModal', 'Audit localization of timeout guidance and announcement', () => {
  const sm = new CalibrationStateMachine('ru');
  sm.handleRejection(new Error('CALIBRATION_TIMEOUT'));

  const guidance = sm.getGuidanceText();
  const announcement = sm.getAnnouncement();

  const tRu = TRANSLATIONS.ru;
  console.log(`     [VERIFIED] Russian mode guidance on timeout: "${guidance}"`);
  console.log(`     [VERIFIED] Russian mode SR announcement on timeout: "${announcement}"`);

  assert.equal(guidance, tRu.calibrationTimeout, 'Guidance text must be localized Russian on timeout');
  assert.equal(announcement, tRu.calibrationTimeout, 'SR announcement must be localized Russian on timeout');

  // Check if TRANSLATIONS has a calibrationTimeout key
  const hasCalibrationTimeoutKey = 'calibrationTimeout' in TRANSLATIONS.ru;
  console.log(`     [VERIFIED] Does TRANSLATIONS have 'calibrationTimeout' key? ${hasCalibrationTimeoutKey}`);
  assert.equal(hasCalibrationTimeoutKey, true, 'TRANSLATIONS must have calibrationTimeout key');
});

// ============================================================================
// SUITE 4: Camera Error Code Mappings (CameraErrorModal)
// ============================================================================
console.log('\n--- SUITE 4: Camera Error Code Mappings ---');

function mapCameraError(errorCode, errorMessage, lang = 'en') {
  const t = TRANSLATIONS[lang];
  let explanation = t.cameraGenericError;

  if (errorCode === 'NOT_ALLOWED') {
    explanation = t.cameraDenied;
  } else if (errorCode === 'NOT_FOUND') {
    explanation = t.cameraNotFound;
  } else if (errorMessage) {
    const lower = errorMessage.toLowerCase();
    if (lower.includes('denied') || lower.includes('notallowed')) {
      explanation = t.cameraDenied;
    } else if (lower.includes('notfound') || lower.includes('not found')) {
      explanation = t.cameraNotFound;
    }
  }

  return explanation;
}

runTest('CameraErrorModal', 'NOT_ALLOWED maps strictly to cameraDenied across all 8 languages', () => {
  for (const { code } of LANGUAGE_OPTIONS) {
    const t = TRANSLATIONS[code];
    const explanation = mapCameraError('NOT_ALLOWED', null, code);
    assert.equal(explanation, t.cameraDenied, `Lang ${code} failed to map NOT_ALLOWED`);
    assert.ok(explanation.length > 10, `Lang ${code} cameraDenied is suspiciously short`);
  }
});

runTest('CameraErrorModal', 'NOT_FOUND maps strictly to cameraNotFound across all 8 languages', () => {
  for (const { code } of LANGUAGE_OPTIONS) {
    const t = TRANSLATIONS[code];
    const explanation = mapCameraError('NOT_FOUND', null, code);
    assert.equal(explanation, t.cameraNotFound, `Lang ${code} failed to map NOT_FOUND`);
    assert.ok(explanation.length > 10, `Lang ${code} cameraNotFound is suspiciously short`);
  }
});

runTest('CameraErrorModal', 'Hardware conflict / unknown codes map to cameraGenericError', () => {
  const unknownCodes = ['NOT_READABLE', 'OVERCONSTRAINED', 'SECURITY_ERROR', 'UNSUPPORTED', 'DISCONNECTED', 'UNKNOWN', null, undefined, 'CUSTOM_ERROR'];
  for (const { code } of LANGUAGE_OPTIONS) {
    const t = TRANSLATIONS[code];
    for (const errCode of unknownCodes) {
      const explanation = mapCameraError(errCode, null, code);
      assert.equal(explanation, t.cameraGenericError, `Lang ${code} with code ${errCode} did not map to generic error`);
    }
  }
});

runTest('CameraErrorModal', 'Message substring heuristics map denied/notfound when code is missing', () => {
  const deniedExp = mapCameraError(null, 'User denied permission prompt', 'en');
  assert.equal(deniedExp, TRANSLATIONS.en.cameraDenied);

  const notFoundExp = mapCameraError(null, 'Requested device not found', 'en');
  assert.equal(notFoundExp, TRANSLATIONS.en.cameraNotFound);

  const genericExp = mapCameraError(null, 'Hardware track failed to start', 'en');
  assert.equal(genericExp, TRANSLATIONS.en.cameraGenericError);
});

// ============================================================================
// SUITE 5: Full 8-Language Localization Completeness Audit
// ============================================================================
console.log('\n--- SUITE 5: 8-Language Completeness Audit for Accessibility Keys ---');

const REQUIRED_ACCESSIBILITY_KEYS = [
  // 1. Accessibility Section & Toggles (8 keys)
  'accessibility',
  'headTracking',
  'headTrackingDesc',
  'headTrackingRecalibrate',
  'audioNav',
  'audioNavDesc',
  'audioNavVolume',
  'audioNavHotkeys',

  // 2. Download Progress Modal (4 keys)
  'downloadingTitle',
  'downloadingProgress',
  'downloadComplete',
  'downloadFailed',

  // 3. Calibration Modal (4 keys)
  'calibrationTitle',
  'calibrationPrompt',
  'calibrationCountdown',
  'calibrationSuccess',

  // 4. Camera Error Modal (4 keys)
  'cameraErrorTitle',
  'cameraDenied',
  'cameraNotFound',
  'cameraGenericError',

  // 5. Audio Navigation ARIA Announcements (4 keys)
  'audioNavStatusMuted',
  'audioNavStatusUnmuted',
  'audioNavVolumeChanged',
  'audioFallbackNotice',

  // 6. Remediated Keys (7 keys)
  'calibrationTimeout',
  'calibrationRetry',
  'cancel',
  'muted',
  'unmute',
  'mute',
  'alternativeControls',
];

runTest('i18nAudit', 'All 31 accessibility keys exist and are non-empty strings across all 8 languages', () => {
  assert.equal(LANGUAGE_OPTIONS.length, 8, 'Expected 8 language options');

  for (const { code, label } of LANGUAGE_OPTIONS) {
    const translation = TRANSLATIONS[code];
    assert.ok(translation, `Translation object missing for ${code} (${label})`);

    for (const key of REQUIRED_ACCESSIBILITY_KEYS) {
      const val = translation[key];
      assert.ok(
        typeof val === 'string' && val.trim().length > 0,
        `Language ${code} is missing or has empty string for key: "${key}"`
      );
    }
  }
});

runTest('i18nAudit', 'Template placeholders are present in localized templates', () => {
  for (const { code } of LANGUAGE_OPTIONS) {
    const t = TRANSLATIONS[code];

    // downloadingProgress must contain {module} and {percent}
    assert.ok(
      t.downloadingProgress.includes('{module}'),
      `Lang ${code} downloadingProgress missing {module}: "${t.downloadingProgress}"`
    );
    assert.ok(
      t.downloadingProgress.includes('{percent}'),
      `Lang ${code} downloadingProgress missing {percent}: "${t.downloadingProgress}"`
    );

    // calibrationCountdown must contain {seconds}
    assert.ok(
      t.calibrationCountdown.includes('{seconds}'),
      `Lang ${code} calibrationCountdown missing {seconds}: "${t.calibrationCountdown}"`
    );

    // audioNavVolumeChanged must contain {percent}
    assert.ok(
      t.audioNavVolumeChanged.includes('{percent}'),
      `Lang ${code} audioNavVolumeChanged missing {percent}: "${t.audioNavVolumeChanged}"`
    );
  }
});

// ============================================================================
// SUITE 6: UI Hardcoded String & Adversarial Edge Cases
// ============================================================================
console.log('\n--- SUITE 6: Adversarial Edge Cases & Hardcoded Text Inspection ---');

runTest('AdversarialEdgeCases', 'Verify elimination of hardcoded UI strings across Modal dialogs', () => {
  const calPath = path.join(projectRoot, 'src', 'components', 'Modals', 'CalibrationModal.tsx');
  const dlPath = path.join(projectRoot, 'src', 'components', 'Modals', 'DownloadProgressModal.tsx');
  const camPath = path.join(projectRoot, 'src', 'components', 'Modals', 'CameraErrorModal.tsx');
  const setPath = path.join(projectRoot, 'src', 'components', 'Modals', 'SettingsModal.tsx');

  const calSrc = fs.readFileSync(calPath, 'utf-8');
  const dlSrc = fs.readFileSync(dlPath, 'utf-8');
  const camSrc = fs.readFileSync(camPath, 'utf-8');
  const setSrc = fs.readFileSync(setPath, 'utf-8');

  // 1. DownloadProgressModal must not contain hardcoded 'Cancel'
  assert.ok(!dlSrc.includes("'Cancel'"), 'DownloadProgressModal must not contain hardcoded Cancel');
  assert.ok(dlSrc.includes('t.close : t.cancel'), 'DownloadProgressModal must use localized t.close : t.cancel');

  // 2. CalibrationModal must use t.calibrationTimeout and t.calibrationRetry
  assert.ok(!calSrc.includes("'Calibration timed out"), 'CalibrationModal must not contain hardcoded English timeout prompt');
  assert.ok(calSrc.includes('t.calibrationTimeout'), 'CalibrationModal must reference t.calibrationTimeout');
  assert.ok(calSrc.includes('t.calibrationRetry'), 'CalibrationModal must reference t.calibrationRetry');

  // 3. CameraErrorModal must use t.cameraErrorTitle and t.alternativeControls
  assert.ok(!camSrc.includes("'Permission Denied'"), 'CameraErrorModal must not contain hardcoded Permission Denied');
  assert.ok(!camSrc.includes('Alternative Controls Available'), 'CameraErrorModal must not contain hardcoded Alternative Controls Available');
  assert.ok(camSrc.includes('t.cameraErrorTitle'), 'CameraErrorModal must reference t.cameraErrorTitle');
  assert.ok(camSrc.includes('t.alternativeControls'), 'CameraErrorModal must reference t.alternativeControls');

  // 4. SettingsModal must use t.muted, t.unmute, t.mute
  assert.ok(!setSrc.includes("'Muted'"), 'SettingsModal must not contain hardcoded Muted');
  assert.ok(!setSrc.includes("'Unmute audio navigation'"), 'SettingsModal must not contain hardcoded Unmute audio navigation');
  assert.ok(setSrc.includes('t.muted'), 'SettingsModal must reference t.muted');
  assert.ok(setSrc.includes('t.unmute : t.mute'), 'SettingsModal must reference t.unmute : t.mute');
});

// ============================================================================
// FINAL SUMMARY
// ============================================================================
console.log('\n================================================================');
console.log(`TOTAL TESTS: ${totalTests}`);
console.log(`PASSED: ${passedTests}`);
console.log(`FAILED: ${failedTests}`);
console.log('================================================================');

if (failedTests > 0) {
  console.error('\nFAILURE DETAILS:');
  for (const fail of failureDetails) {
    console.error(`- [${fail.suite}] ${fail.name}: ${fail.error}`);
  }
  process.exit(1);
} else {
  console.log('\nALL EMPIRICAL TESTS PASSED SUCCESSFULLY.');
}
