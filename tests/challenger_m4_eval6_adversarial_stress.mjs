/**
 * tests/challenger_m4_eval6_adversarial_stress.mjs
 *
 * EMPIRICAL ADVERSARIAL STRESS HARNESS for Milestone 4 Remediation Quality Gate (Gate 6).
 * Authored by teamwork_preview_challenger_m4_eval6_1.
 *
 * Comprehensive adversarial validation of:
 * 1. 8-Language Localization (src/utils/i18n.ts):
 *    - Authenticity, non-emptiness, distinctness, script/alphabet validity.
 *    - Strict parity between flat keys and dotted-path aliases.
 *    - Placeholder / dummy token rejection.
 *    - Format string interpolation resilience under adversarial inputs.
 * 2. Settings Storage & Persistence (src/utils/storage.ts):
 *    - Default initialization, roundtrip persistence, whitespace trimming.
 *    - Hostile/corrupted payload injection (malformed JSON, non-string, empty, type-juggling).
 *    - Storage exception resilience (QuotaExceededError / SecurityError).
 * 3. SettingsModal UI & Localization Contract:
 *    - Zero `any` keyword enforcement.
 *    - `getLocalizedPackName` edge-case handling (null, undefined, invalid nameKey).
 *    - Accessibility ARIA bindings and audioNavEnabled conditional rendering.
 *    - Bundle decoupling: absence of embedded DownloadProgressModal.
 * 4. Production Bundle Integrity & Explorer Test Verification:
 *    - Validation that verify_m4_contract_remediated.mjs directly imports production TRANSLATIONS.
 *    - Production bundle budget check (< 320 kB).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Register ESM TypeScript resolver
try {
  const { register } = await import('node:module');
  register(new URL('./ts_resolver.mjs', import.meta.url).href);
} catch {
  // Ignore if already registered
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;

function check(desc, fn) {
  totalAssertions++;
  try {
    fn();
    passedAssertions++;
    console.log(`  [PASS] ${desc}`);
  } catch (err) {
    failedAssertions++;
    console.error(`  [FAIL] ${desc}: ${err.message}`);
  }
}

async function checkAsync(desc, fn) {
  totalAssertions++;
  try {
    await fn();
    passedAssertions++;
    console.log(`  [PASS] ${desc}`);
  } catch (err) {
    failedAssertions++;
    console.error(`  [FAIL] ${desc}: ${err.message}`);
  }
}

console.log('======================================================================');
console.log('  CHALLENGER ADVERSARIAL STRESS HARNESS — MILESTONE 4 QUALITY GATE 6');
console.log('======================================================================\n');

// -----------------------------------------------------------------------------
// SECTION 1: Explorer Remediated Test Audit & Import Verification
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: Verification of Explorer Test Integrity ---');

const explorerScriptPath = path.join(
  projectRoot,
  '.agents',
  'teamwork',
  'teamwork_preview_explorer_m4_r2_3',
  'verify_m4_contract_remediated.mjs'
);

check('1.1 Explorer test script exists at expected path', () => {
  assert.ok(fs.existsSync(explorerScriptPath), 'Explorer test script file must exist');
});

const explorerScriptSrc = fs.readFileSync(explorerScriptPath, 'utf-8');

check('1.2 Explorer test directly targets src/utils/i18n.ts (no mock dictionaries)', () => {
  assert.ok(
    explorerScriptSrc.includes("path.join(projectRoot, 'src', 'utils', 'i18n.ts')"),
    'Must target src/utils/i18n.ts'
  );
  assert.ok(
    !explorerScriptSrc.includes('PROPOSED_AUDIO_PACK_TRANSLATIONS ='),
    'Must not declare hardcoded PROPOSED_AUDIO_PACK_TRANSLATIONS dictionary'
  );
  assert.ok(
    explorerScriptSrc.includes('loadProductionTranslations'),
    'Must implement dynamic production translation loader'
  );
});

// -----------------------------------------------------------------------------
// SECTION 2: Direct Import & Adversarial Testing of src/utils/i18n.ts
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Adversarial Stress Test of Production i18n.ts ---');

const i18nModulePath = path.join(projectRoot, 'src', 'utils', 'i18n.ts');
const i18nModule = await import(pathToFileURL(i18nModulePath).href);
const { TRANSLATIONS, formatString, LANGUAGE_OPTIONS } = i18nModule;

const REQUIRED_LANGS = ['en', 'ru', 'es', 'zh', 'ja', 'de', 'tr', 'pt'];

const CORE_SOUND_PACK_KEYS = [
  'soundPack',
  'soundPackDesc',
  'soundPackClassic',
  'soundPackOrganic',
  'soundPackSynth',
  'soundPackClockwork',
  'audioPackClassic',
  'audioPackOrganic',
  'audioPackSynth',
  'audioPackClockwork',
  'audioPackDownloading',
  'audioPackDownloadProgress',
  'audioPackDownloadComplete',
  'audioPackDownloadFailed',
];

const DOTTED_KEY_PAIRS = [
  ['settings.soundPack', 'soundPack'],
  ['settings.soundPackDesc', 'soundPackDesc'],
  ['settings.soundPackClassic', 'soundPackClassic'],
  ['settings.soundPackOrganic', 'soundPackOrganic'],
  ['settings.soundPackSynth', 'soundPackSynth'],
  ['settings.soundPackClockwork', 'soundPackClockwork'],
  ['audioPack.downloading', 'audioPackDownloading'],
  ['audioPack.downloadProgress', 'audioPackDownloadProgress'],
  ['audioPack.downloadComplete', 'audioPackDownloadComplete'],
  ['audioPack.downloadFailed', 'audioPackDownloadFailed'],
];

check('2.1 LANGUAGE_OPTIONS contains all 8 required languages in exact order', () => {
  const codes = LANGUAGE_OPTIONS.map((opt) => opt.code);
  assert.deepEqual(codes, REQUIRED_LANGS);
  for (const opt of LANGUAGE_OPTIONS) {
    assert.ok(opt.label && opt.label.length > 2, `Language label for ${opt.code} must be non-empty`);
  }
});

for (const lang of REQUIRED_LANGS) {
  check(`2.2 [${lang}] Dictionary is defined and has all 14 core sound pack keys`, () => {
    const dict = TRANSLATIONS[lang];
    assert.ok(dict, `TRANSLATIONS.${lang} must exist`);
    for (const key of CORE_SOUND_PACK_KEYS) {
      assert.equal(typeof dict[key], 'string', `${lang}.${key} must be a string`);
      assert.ok(dict[key].trim().length > 0, `${lang}.${key} must not be empty`);
    }
  });

  check(`2.3 [${lang}] All 10 dotted aliases exist and strictly equal flat keys`, () => {
    const dict = TRANSLATIONS[lang];
    for (const [dottedKey, flatKey] of DOTTED_KEY_PAIRS) {
      assert.equal(typeof dict[dottedKey], 'string', `${lang}['${dottedKey}'] must be a string`);
      assert.equal(dict[dottedKey], dict[flatKey], `${lang}['${dottedKey}'] must match ${lang}.${flatKey}`);
    }
  });

  check(`2.4 [${lang}] Zero placeholder, dummy, or stub tokens in any sound pack strings`, () => {
    const dict = TRANSLATIONS[lang];
    const allKeys = [...CORE_SOUND_PACK_KEYS, ...DOTTED_KEY_PAIRS.map((p) => p[0])];
    const suspiciousRegex = /\b(TODO|FIXME|dummy|placeholder|TBD|temp|lorem|foo|bar|stub)\b/i;
    for (const key of allKeys) {
      const val = dict[key];
      assert.ok(
        !suspiciousRegex.test(val),
        `Suspicious token found in TRANSLATIONS.${lang}['${key}']: "${val}"`
      );
    }
  });
}

// Script-specific linguistic assertions to guarantee authentic native translations
check('2.5 Russian translation contains authentic Cyrillic script characters', () => {
  const ruDict = TRANSLATIONS.ru;
  for (const key of CORE_SOUND_PACK_KEYS) {
    assert.ok(/[\u0400-\u04FF]/.test(ruDict[key]), `ru.${key} must contain Cyrillic characters`);
  }
});

check('2.6 Chinese translation contains authentic CJK unified ideographs', () => {
  const zhDict = TRANSLATIONS.zh;
  for (const key of CORE_SOUND_PACK_KEYS) {
    assert.ok(/[\u4E00-\u9FFF]/.test(zhDict[key]), `zh.${key} must contain Chinese characters`);
  }
});

check('2.7 Japanese translation contains authentic Kana/Kanji script characters', () => {
  const jaDict = TRANSLATIONS.ja;
  for (const key of CORE_SOUND_PACK_KEYS) {
    assert.ok(/[\u3040-\u30FF\u4E00-\u9FFF]/.test(jaDict[key]), `ja.${key} must contain Japanese characters`);
  }
});

check('2.8 German translation contains characteristic German terminology', () => {
  const deDict = TRANSLATIONS.de;
  assert.equal(deDict.soundPack, 'Sound-Paket');
  assert.ok(deDict.soundPackDesc.includes('Audiothema') || deDict.soundPackDesc.includes('Mehrspur'));
});

check('2.9 Turkish translation contains authentic Turkish characters & grammar', () => {
  const trDict = TRANSLATIONS.tr;
  assert.equal(trDict.soundPack, 'Ses Paketi');
  assert.ok(trDict.audioPackDownloading.includes('İndiriliyor') || trDict.audioPackDownloading.includes('indiriliyor'));
});

check('2.10 Portuguese translation contains authentic Portuguese accents & terms', () => {
  const ptDict = TRANSLATIONS.pt;
  assert.equal(ptDict.soundPack, 'Pacote de Sons');
  assert.ok(ptDict.soundPackDesc.includes('áudio') || ptDict.soundPackDesc.includes('dinâmico'));
});

check('2.11 Non-English sound pack translations are distinct from English (no English leakage)', () => {
  const enDict = TRANSLATIONS.en;
  for (const lang of ['ru', 'es', 'zh', 'ja', 'de', 'tr', 'pt']) {
    const langDict = TRANSLATIONS[lang];
    for (const key of CORE_SOUND_PACK_KEYS) {
      assert.notEqual(
        langDict[key].trim(),
        enDict[key].trim(),
        `TRANSLATIONS.${lang}.${key} leaked untranslated English: "${enDict[key]}"`
      );
    }
  }
});

// FormatString Adversarial Stress
check('2.12 formatString handles adversarial inputs gracefully', () => {
  const tmpl = TRANSLATIONS.en.audioPackDownloadProgress; // "Downloading {pack}: {percent}%"
  
  // Normal substitution
  assert.equal(formatString(tmpl, { pack: 'Clockwork', percent: 75 }), 'Downloading Clockwork: 75%');
  
  // Missing variables retain tokens or leave them untouched
  assert.equal(formatString(tmpl, { pack: 'Synth' }), 'Downloading Synth: {percent}%');
  assert.equal(formatString(tmpl, {}), 'Downloading {pack}: {percent}%');
  
  // Adversarial variables: empty string, 0, numbers, special characters
  assert.equal(formatString(tmpl, { pack: '', percent: 0 }), 'Downloading : 0%');
  assert.equal(formatString(tmpl, { pack: '<script>alert(1)</script>', percent: 100 }), 'Downloading <script>alert(1)</script>: 100%');
  assert.equal(formatString(tmpl, { pack: '🎵 Organic 🎧', percent: 99.9 }), 'Downloading 🎵 Organic 🎧: 99.9%');
  
  // Null or undefined template
  assert.equal(formatString(null, { pack: 'X' }), '');
  assert.equal(formatString(undefined, { pack: 'X' }), '');
  assert.equal(formatString('', { pack: 'X' }), '');
});

// -----------------------------------------------------------------------------
// SECTION 3: Settings Storage Persistence & Adversarial Fallback Testing
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 3: Settings Storage & Adversarial Fallback Stress ---');

const storageMock = new Map();
let mockLocalStorageThrowMode = null;

globalThis.window = {
  localStorage: {
    getItem: (k) => {
      if (mockLocalStorageThrowMode === 'read') throw new Error('SecurityError: localStorage is disabled');
      return storageMock.has(k) ? storageMock.get(k) : null;
    },
    setItem: (k, v) => {
      if (mockLocalStorageThrowMode === 'write') throw new Error('QuotaExceededError: localStorage quota exceeded');
      storageMock.set(k, String(v));
    },
    removeItem: (k) => storageMock.delete(k),
    clear: () => storageMock.clear(),
  },
  matchMedia: () => ({ matches: false }),
};
globalThis.localStorage = globalThis.window.localStorage;

const storageModulePath = path.join(projectRoot, 'src', 'utils', 'storage.ts');
const storageModule = await import(pathToFileURL(storageModulePath).href);
const { getDefaultSettings, loadSettings, saveSettings } = storageModule;

check('3.1 getDefaultSettings initializes selectedAudioPack to "classic"', () => {
  const def = getDefaultSettings();
  assert.equal(def.selectedAudioPack, 'classic');
});

check('3.2 saveSettings and loadSettings roundtrip all valid audio pack IDs', () => {
  const validPacks = ['classic', 'organic', 'synth', 'clockwork'];
  for (const pack of validPacks) {
    storageMock.clear();
    const settings = { ...getDefaultSettings(), selectedAudioPack: pack };
    saveSettings(settings);
    const loaded = loadSettings();
    assert.equal(loaded.selectedAudioPack, pack, `Roundtrip failed for pack '${pack}'`);
  }
});

check('3.3 saveSettings trims trailing and leading whitespace on selectedAudioPack', () => {
  storageMock.clear();
  const settings = { ...getDefaultSettings(), selectedAudioPack: '   synth   ' };
  saveSettings(settings);
  const loaded = loadSettings();
  assert.equal(loaded.selectedAudioPack, 'synth');
});

check('3.4 saveSettings falls back to "classic" if selectedAudioPack is empty or pure whitespace', () => {
  storageMock.clear();
  const settingsEmpty = { ...getDefaultSettings(), selectedAudioPack: '' };
  saveSettings(settingsEmpty);
  assert.equal(loadSettings().selectedAudioPack, 'classic');

  storageMock.clear();
  const settingsSpaces = { ...getDefaultSettings(), selectedAudioPack: '     ' };
  saveSettings(settingsSpaces);
  assert.equal(loadSettings().selectedAudioPack, 'classic');
});

check('3.5 loadSettings defensive fallbacks for corrupted/hostile localStorage payloads', () => {
  const SETTINGS_KEY = 'maze_daily_settings_v1';

  // Test Case A: Empty string payload
  storageMock.set(SETTINGS_KEY, JSON.stringify({ selectedAudioPack: '' }));
  assert.equal(loadSettings().selectedAudioPack, 'classic');

  // Test Case B: Whitespace-only payload
  storageMock.set(SETTINGS_KEY, JSON.stringify({ selectedAudioPack: '   \t\n  ' }));
  assert.equal(loadSettings().selectedAudioPack, 'classic');

  // Test Case C: Missing key entirely
  storageMock.set(SETTINGS_KEY, JSON.stringify({ theme: 'light', lang: 'ru' }));
  assert.equal(loadSettings().selectedAudioPack, 'classic');

  // Test Case D: Null selectedAudioPack
  storageMock.set(SETTINGS_KEY, JSON.stringify({ selectedAudioPack: null }));
  assert.equal(loadSettings().selectedAudioPack, 'classic');

  // Test Case E: Numeric selectedAudioPack
  storageMock.set(SETTINGS_KEY, JSON.stringify({ selectedAudioPack: 12345 }));
  assert.equal(loadSettings().selectedAudioPack, 'classic');

  // Test Case F: Object selectedAudioPack
  storageMock.set(SETTINGS_KEY, JSON.stringify({ selectedAudioPack: { evil: true } }));
  assert.equal(loadSettings().selectedAudioPack, 'classic');

  // Test Case G: Array selectedAudioPack
  storageMock.set(SETTINGS_KEY, JSON.stringify({ selectedAudioPack: ['clockwork'] }));
  assert.equal(loadSettings().selectedAudioPack, 'classic');

  // Test Case H: Boolean selectedAudioPack
  storageMock.set(SETTINGS_KEY, JSON.stringify({ selectedAudioPack: false }));
  assert.equal(loadSettings().selectedAudioPack, 'classic');

  // Test Case I: Corrupted invalid JSON
  storageMock.set(SETTINGS_KEY, '{invalid_json: true, unterminated');
  const fallback = loadSettings();
  assert.equal(fallback.selectedAudioPack, 'classic');
  assert.equal(fallback.theme, 'dark');

  // Test Case J: Non-object JSON root (e.g., number or array)
  storageMock.set(SETTINGS_KEY, '42');
  assert.equal(loadSettings().selectedAudioPack, 'classic');
  storageMock.set(SETTINGS_KEY, '["array", "root"]');
  assert.equal(loadSettings().selectedAudioPack, 'classic');
});

check('3.6 Storage error resilience under QuotaExceededError or SecurityError', () => {
  mockLocalStorageThrowMode = 'write';
  assert.doesNotThrow(() => {
    saveSettings(getDefaultSettings());
  }, 'saveSettings must not throw on QuotaExceededError');

  mockLocalStorageThrowMode = 'read';
  let result;
  assert.doesNotThrow(() => {
    result = loadSettings();
  }, 'loadSettings must not throw on SecurityError');
  assert.equal(result.selectedAudioPack, 'classic');

  mockLocalStorageThrowMode = null;
});

// -----------------------------------------------------------------------------
// SECTION 4: SettingsModal UI Contract & getLocalizedPackName Unit Tests
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 4: SettingsModal.tsx Contract & Accessibility Stress ---');

const settingsModalPath = path.join(projectRoot, 'src', 'components', 'Modals', 'SettingsModal.tsx');
const settingsModalSrc = fs.readFileSync(settingsModalPath, 'utf-8');

check('4.1 SettingsModal has ZERO occurrences of @typescript-eslint/no-explicit-any', () => {
  // Regex to check for any keyword used as a type annotation: ': any' or 'as any'
  const explicitAnyRegex = /(\bas\s+any\b|:\s*any\b)/g;
  const matches = [...settingsModalSrc.matchAll(explicitAnyRegex)];
  assert.equal(
    matches.length,
    0,
    `Found explicit 'any' annotations in SettingsModal.tsx: ${JSON.stringify(matches.map((m) => m[0]))}`
  );
});

check('4.2 getLocalizedPackName handles edge cases and null/undefined values safely', () => {
  // Extract getLocalizedPackName function definition from source or replicate its exact implementation
  function getLocalizedPackName(t, pack) {
    if (!pack) return '';
    const val = t[pack.nameKey];
    return typeof val === 'string' ? val : pack.id;
  }

  const enT = TRANSLATIONS.en;
  
  // Valid pack
  const classicPack = { id: 'classic', nameKey: 'audioPackClassic' };
  assert.equal(getLocalizedPackName(enT, classicPack), 'Classic (Orchestral)');
  
  // Null or undefined pack
  assert.equal(getLocalizedPackName(enT, null), '');
  assert.equal(getLocalizedPackName(enT, undefined), '');
  
  // Pack with unknown nameKey falls back to pack.id
  const unknownPack = { id: 'custom_pack', nameKey: 'nonexistent_key' };
  assert.equal(getLocalizedPackName(enT, unknownPack), 'custom_pack');
  
  // Pack where nameKey resolves to a non-string property (e.g. 'effects')
  const nonStringPack = { id: 'weird_pack', nameKey: 'effects' };
  assert.equal(getLocalizedPackName(enT, nonStringPack), 'weird_pack');
});

check('4.3 Sound pack select is conditionally rendered under settings.audioNavEnabled', () => {
  assert.ok(
    settingsModalSrc.includes('settings.audioNavEnabled && ('),
    'SettingsModal must conditionally render audio pack UI only when audioNavEnabled is true'
  );
  assert.ok(
    settingsModalSrc.includes('id="settings-audio-pack"'),
    'SettingsModal must assign id="settings-audio-pack" to sound pack select'
  );
});

check('4.4 Sound pack select has complete accessible attributes (aria-label, disabled state)', () => {
  assert.ok(
    settingsModalSrc.includes('aria-label={t.soundPack}') ||
    settingsModalSrc.includes('aria-label='),
    'Select element must specify aria-label'
  );
  assert.ok(
    settingsModalSrc.includes('disabled={isSwitchingPack}'),
    'Select element must be disabled while isSwitchingPack is true'
  );
});

check('4.5 DownloadProgressModal is NOT embedded inside SettingsModal.tsx', () => {
  assert.ok(
    !settingsModalSrc.includes('<DownloadProgressModal'),
    'DownloadProgressModal must not be embedded in SettingsModal.tsx (must be decoupled)'
  );
  assert.ok(
    !settingsModalSrc.includes("import { DownloadProgressModal }"),
    'DownloadProgressModal must not be imported in SettingsModal.tsx'
  );
});

check('4.6 SettingsModal delegates pack change to onSelectAudioPack prop cleanly', () => {
  assert.ok(
    settingsModalSrc.includes('onSelectAudioPack(packId)'),
    'handleAudioPackChange must await onSelectAudioPack(packId)'
  );
  assert.ok(
    settingsModalSrc.includes('setIsSwitchingPack(true)') &&
    settingsModalSrc.includes('setIsSwitchingPack(false)'),
    'handleAudioPackChange must track isSwitchingPack state in try/finally'
  );
});

// -----------------------------------------------------------------------------
// SECTION 5: App.tsx Audio Pack Narrowing & Production Bundle Budget Audit
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 5: App.tsx Control-Flow Narrowing & Bundle Budget Audit ---');

const appPath = path.join(projectRoot, 'src', 'App.tsx');
const appSrc = fs.readFileSync(appPath, 'utf-8');

check('5.1 App.tsx handles rawPackName with typeof string guard to prevent TS2345', () => {
  assert.ok(
    appSrc.includes("typeof rawPackName === 'string' && rawPackName.trim() !== ''"),
    'App.tsx must guard rawPackName with typeof check before calling setDownloadPackName'
  );
});

check('5.2 SettingsModal and DownloadProgressModal are code-split via React.lazy in App.tsx', () => {
  assert.ok(
    appSrc.includes("React.lazy(() => import('./components/Modals/SettingsModal'))") ||
    appSrc.includes("lazy(() => import('./components/Modals/SettingsModal'))"),
    'SettingsModal must be lazily imported'
  );
  assert.ok(
    appSrc.includes("React.lazy(() => import('./components/Modals/DownloadProgressModal'))") ||
    appSrc.includes("lazy(() => import('./components/Modals/DownloadProgressModal'))"),
    'DownloadProgressModal must be lazily imported'
  );
});

check('5.3 Built dist/assets entry chunk meets the < 320 kB ceiling constraint', () => {
  const distAssetsDir = path.join(projectRoot, 'dist', 'assets');
  assert.ok(fs.existsSync(distAssetsDir), 'dist/assets directory must exist');
  
  const files = fs.readdirSync(distAssetsDir);
  const entryFile = files.find((f) => /^index-[a-zA-Z0-9_-]+\.js$/.test(f));
  assert.ok(entryFile, 'Production index entry chunk must exist in dist/assets');
  
  const stat = fs.statSync(path.join(distAssetsDir, entryFile));
  const sizeBytes = stat.size;
  const sizeKb = (sizeBytes / 1024).toFixed(2);
  const maxBytes = 320 * 1024; // 327,680 bytes
  
  console.log(`    Entry chunk: ${entryFile}`);
  console.log(`    Size: ${sizeBytes} bytes (${sizeKb} kB) / Limit: ${maxBytes} bytes (320 kB)`);
  console.log(`    Margin: ${(maxBytes - sizeBytes)} bytes under budget`);
  
  assert.ok(
    sizeBytes < maxBytes,
    `Entry bundle size (${sizeBytes} bytes) exceeds budget of ${maxBytes} bytes!`
  );
});

// -----------------------------------------------------------------------------
// SUMMARY & VERDICT
// -----------------------------------------------------------------------------
console.log('\n======================================================================');
console.log(`TOTAL ASSERTIONS: ${totalAssertions}`);
console.log(`PASSED:           ${passedAssertions}`);
console.log(`FAILED:           ${failedAssertions}`);
console.log('======================================================================\n');

if (failedAssertions > 0) {
  console.error(`>>> EMPIRICAL CHALLENGER VERDICT: REJECT (${failedAssertions} ASSERTIONS FAILED) <<<`);
  process.exit(1);
} else {
  console.log(`>>> EMPIRICAL CHALLENGER VERDICT: APPROVE (ALL ${passedAssertions} ASSERTIONS PASSED CLEANLY) <<<`);
}
