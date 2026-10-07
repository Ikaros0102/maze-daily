/**
 * tests/challenger_m1_packs_stress.mjs
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER SUITE FOR MILESTONE 1:
 * - Suite 1: storage.ts fuzzing & stress (corrupted JSON, unexpected types, prototype pollution, Unicode, huge strings, nonexistent packs)
 * - Suite 2: audioPacks.ts API fuzzing (type guards, lookups, path resolvers, cache name formatters, prototype bypass)
 * - Suite 3: Immutability & Encapsulation audit (mutation vectors, object freezing, reference leakage)
 * - Suite 4: Invariant verification (500 random fuzzed iterations to verify loadSettings never throws)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Register Node ESM resolver hook for TypeScript files
try {
  register(new URL('./ts_resolver.mjs', import.meta.url).href);
} catch {
  // Already registered
}

console.log('================================================================');
console.log('  CHALLENGER 1 (M1): EMPIRICAL ADVERSARIAL STRESS & FUZZ SUITE');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const findings = [];

function recordTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    findings.push({ name, error: err.message, stack: err.stack });
  }
}

// -----------------------------------------------------------------------------
// Setup Mock Browser Environment for storage.ts
// -----------------------------------------------------------------------------
const storageBackingStore = new Map();
let shouldThrowOnSetItem = false;

const mockLocalStorage = {
  getItem: (key) => storageBackingStore.get(key) ?? null,
  setItem: (key, val) => {
    if (shouldThrowOnSetItem) {
      const err = new Error('QuotaExceededError: The quota has been exceeded.');
      err.name = 'QuotaExceededError';
      throw err;
    }
    storageBackingStore.set(key, String(val));
  },
  removeItem: (key) => storageBackingStore.delete(key),
  clear: () => storageBackingStore.clear(),
};

globalThis.window = {
  localStorage: mockLocalStorage,
  matchMedia: () => ({ matches: false }),
};
globalThis.localStorage = mockLocalStorage;

// Import storage & audioPacks modules
const { getDefaultSettings, loadSettings, saveSettings } = await import(
  '../src/utils/storage.ts'
);
const audioPacksModule = await import('../src/config/audioPacks.ts');
const {
  AUDIO_PACKS,
  AUDIO_PACK_IDS,
  DEFAULT_AUDIO_PACK_ID,
  KNOWN_AUDIO_ASSET_SIZES,
  isValidAudioPackId,
  getAudioPack,
  getAllAudioPacks,
  getAudioPackList,
  getAudioPackAllFilePaths,
  getAudioPackCacheName,
} = audioPacksModule;

const SETTINGS_KEY = 'maze_daily_settings';

// =============================================================================
// SUITE 1: storage.ts FUZZING & STRESS TESTING
// =============================================================================
console.log('--- SUITE 1: storage.ts Fuzzing & Stress Testing ---');

recordTest('1.1 Corrupted JSON stress: syntax errors, partial tokens, null bytes, HTML', () => {
  const corruptedPayloads = [
    '{',
    '{"selectedAudioPack":',
    '{"selectedAudioPack": "classic"',
    '{"selectedAudioPack": "classic",,,}',
    'undefined',
    'NaN',
    '<!DOCTYPE html><html><body>Error</body></html>',
    '\x00\x01\x02\x03\x04',
    '{"selectedAudioPack": "\x00\x01\x02"}',
    '// Javascript comment\n{"selectedAudioPack": "classic"}',
    '/* block comment */ {"selectedAudioPack": "classic"}',
    '{"selectedAudioPack": \'classic\'}', // single quotes invalid in JSON
    '{"selectedAudioPack": "classic",}', // trailing comma
    '{"a":'.repeat(100) + '1' + '}'.repeat(50), // unbalanced braces
    '',
  ];

  for (const raw of corruptedPayloads) {
    storageBackingStore.clear();
    storageBackingStore.set(SETTINGS_KEY, raw);
    let settings;
    assert.doesNotThrow(() => {
      settings = loadSettings();
    }, `loadSettings() threw on corrupted payload: ${JSON.stringify(raw)}`);

    assert.ok(settings && typeof settings === 'object', 'loadSettings() must return an object');
    assert.strictEqual(
      typeof settings.selectedAudioPack,
      'string',
      `selectedAudioPack must be string on corrupt input ${JSON.stringify(raw)}`
    );
    assert.strictEqual(
      settings.selectedAudioPack,
      'classic',
      `Corrupt JSON must gracefully default to "classic"`
    );
  }
});

recordTest('1.2 Unexpected root types in localStorage JSON', () => {
  const nonObjectRoots = [
    JSON.stringify(12345),
    JSON.stringify(-99.9),
    JSON.stringify(0),
    JSON.stringify(true),
    JSON.stringify(false),
    JSON.stringify('just a string'),
    JSON.stringify(null),
    JSON.stringify([]),
    JSON.stringify([1, 2, 3]),
    JSON.stringify(['classic', 'synth']),
    JSON.stringify([{ selectedAudioPack: 'synth' }]),
  ];

  for (const raw of nonObjectRoots) {
    storageBackingStore.clear();
    storageBackingStore.set(SETTINGS_KEY, raw);
    let settings;
    assert.doesNotThrow(() => {
      settings = loadSettings();
    }, `loadSettings() threw on root payload: ${raw}`);

    assert.ok(settings && typeof settings === 'object');
    assert.strictEqual(typeof settings.selectedAudioPack, 'string');
    assert.strictEqual(settings.selectedAudioPack, 'classic');
  }
});

recordTest('1.3 Adversarial and unexpected types for selectedAudioPack property', () => {
  const adversarialValues = [
    null,
    12345,
    0,
    -1,
    3.14159,
    true,
    false,
    [],
    [1, 2, 3],
    ['synth'],
    {},
    { id: 'synth' },
    { toString: () => 'evil' },
  ];

  for (const val of adversarialValues) {
    storageBackingStore.clear();
    storageBackingStore.set(SETTINGS_KEY, JSON.stringify({ selectedAudioPack: val }));
    const settings = loadSettings();
    assert.strictEqual(
      typeof settings.selectedAudioPack,
      'string',
      `Type ${typeof val} must produce a string`
    );
    assert.strictEqual(
      settings.selectedAudioPack,
      'classic',
      `Adversarial type ${typeof val} must fall back to "classic"`
    );
  }
});

recordTest('1.4 Whitespace and empty strings fallback to "classic"', () => {
  const whitespaceValues = [
    '',
    ' ',
    '   ',
    '\t',
    '\n',
    '\r\n',
    ' \t \n \r ',
  ];

  for (const ws of whitespaceValues) {
    storageBackingStore.clear();
    storageBackingStore.set(SETTINGS_KEY, JSON.stringify({ selectedAudioPack: ws }));
    const settings = loadSettings();
    assert.strictEqual(
      settings.selectedAudioPack,
      'classic',
      `Whitespace value ${JSON.stringify(ws)} must fall back to "classic"`
    );
  }
});

recordTest('1.5 Prototype pollution attempts on loadSettings and saveSettings', () => {
  // Check Object.prototype is clean before test
  assert.strictEqual(Object.prototype.polluted, undefined);
  assert.strictEqual(Object.prototype.isAdmin, undefined);

  const pollutionPayloads = [
    '{"__proto__": {"polluted": true, "selectedAudioPack": "hacked"}}',
    '{"constructor": {"prototype": {"isAdmin": true}}}',
    '{"__proto__": {"selectedAudioPack": 123}}',
  ];

  for (const payload of pollutionPayloads) {
    storageBackingStore.clear();
    storageBackingStore.set(SETTINGS_KEY, payload);
    const settings = loadSettings();
    assert.ok(settings, 'loadSettings must return object');
    assert.strictEqual(typeof settings.selectedAudioPack, 'string');
    // Ensure prototype was NOT polluted
    assert.strictEqual(Object.prototype.polluted, undefined, 'Object.prototype must not be polluted');
    assert.strictEqual(Object.prototype.isAdmin, undefined, 'Object.prototype must not be polluted');
  }

  // Also test saveSettings with polluted object
  const pollutedObj = Object.assign(Object.create({ pollutedProp: 'leak' }), getDefaultSettings());
  saveSettings(pollutedObj);
  const saved = JSON.parse(storageBackingStore.get(SETTINGS_KEY));
  assert.strictEqual(saved.pollutedProp, undefined, 'saveSettings must not serialize prototype properties');
});

recordTest('1.6 Unicode, RTL, emoji, and zero-width characters in selectedAudioPack', () => {
  const unicodeCases = [
    { input: '🎵sound-pack🎶', expectString: true },
    { input: 'موسيقى_عربية', expectString: true },
    { input: '日本語パック_1', expectString: true },
    { input: 'pack\u200Bzero\u200Bwidth', expectString: true },
    { input: '  spaced_pack  ', expectResult: 'spaced_pack' },
  ];

  for (const tc of unicodeCases) {
    storageBackingStore.clear();
    storageBackingStore.set(SETTINGS_KEY, JSON.stringify({ selectedAudioPack: tc.input }));
    const settings = loadSettings();
    assert.strictEqual(typeof settings.selectedAudioPack, 'string');
    if (tc.expectResult) {
      assert.strictEqual(settings.selectedAudioPack, tc.expectResult);
    } else {
      assert.strictEqual(settings.selectedAudioPack, tc.input.trim());
    }

    // Now test saveSettings with the same unicode
    saveSettings(settings);
    const reloaded = loadSettings();
    assert.strictEqual(reloaded.selectedAudioPack, settings.selectedAudioPack);
  }
});

recordTest('1.7 Extremely long strings (Massive payload fuzzing: 10KB, 100KB, 1MB)', () => {
  const lengths = [10_000, 100_000, 1_000_000];
  for (const len of lengths) {
    const hugeString = 'a'.repeat(len);
    storageBackingStore.clear();
    storageBackingStore.set(SETTINGS_KEY, JSON.stringify({ selectedAudioPack: hugeString }));
    let settings;
    assert.doesNotThrow(() => {
      settings = loadSettings();
    }, `loadSettings failed on length ${len}`);

    assert.strictEqual(typeof settings.selectedAudioPack, 'string');
    assert.strictEqual(settings.selectedAudioPack.length, len);

    // Test saveSettings with huge string
    assert.doesNotThrow(() => {
      saveSettings(settings);
    }, `saveSettings failed on length ${len}`);
  }
});

recordTest('1.8 Nonexistent pack IDs in storage', () => {
  const nonexistentPacks = [
    'nonexistent_pack_xyz',
    'cosmic', // not in M1 AUDIO_PACKS
    'null',
    'undefined',
    '../../etc/passwd',
    '<script>alert(1)</script>',
  ];

  for (const id of nonexistentPacks) {
    storageBackingStore.clear();
    storageBackingStore.set(SETTINGS_KEY, JSON.stringify({ selectedAudioPack: id }));
    const settings = loadSettings();
    assert.strictEqual(typeof settings.selectedAudioPack, 'string');
    assert.strictEqual(
      settings.selectedAudioPack,
      id,
      `storage.ts preserves valid string ID without tight coupling to audioPacks catalog`
    );
  }
});

recordTest('1.9 saveSettings defensive sanitization & storage exception resilience', () => {
  const base = getDefaultSettings();

  // Test invalid memory states sanitized on save
  const invalidPacks = [null, undefined, 12345, '', '   ', false, {}];
  for (const invalidVal of invalidPacks) {
    storageBackingStore.clear();
    saveSettings({ ...base, selectedAudioPack: invalidVal });
    const raw = storageBackingStore.get(SETTINGS_KEY);
    assert.ok(raw, 'saveSettings must write to storage');
    const parsed = JSON.parse(raw);
    assert.strictEqual(
      parsed.selectedAudioPack,
      'classic',
      `saveSettings must sanitize ${JSON.stringify(invalidVal)} to 'classic'`
    );
  }

  // Test storage quota exhaustion / DOMException does not throw
  shouldThrowOnSetItem = true;
  assert.doesNotThrow(() => {
    saveSettings(base);
  }, 'saveSettings must catch QuotaExceededError silently without crashing');
  shouldThrowOnSetItem = false;
});

// =============================================================================
// SUITE 2: audioPacks.ts CATALOG & API ADVERSARIAL STRESS
// =============================================================================
console.log('\n--- SUITE 2: audioPacks.ts API Adversarial Stress ---');

recordTest('2.1 isValidAudioPackId against prototype properties and invalid inputs', () => {
  // Valid IDs
  for (const id of ['classic', 'organic', 'synth', 'clockwork']) {
    assert.strictEqual(isValidAudioPackId(id), true, `${id} must be valid`);
  }

  // Adversarial prototype keys
  const protoKeys = ['toString', 'valueOf', 'constructor', '__proto__', 'hasOwnProperty', 'isPrototypeOf'];
  for (const key of protoKeys) {
    assert.strictEqual(
      isValidAudioPackId(key),
      false,
      `Prototype property "${key}" must NOT be recognized as an audio pack`
    );
  }

  // Arbitrary strings
  assert.strictEqual(isValidAudioPackId(''), false);
  assert.strictEqual(isValidAudioPackId('cosmic'), false);
  assert.strictEqual(isValidAudioPackId('CLASSIC'), false);
  assert.strictEqual(isValidAudioPackId('  classic  '), false);
});

recordTest('2.2 getAudioPack retrieval and prototype injection resilience', () => {
  for (const id of ['classic', 'organic', 'synth', 'clockwork']) {
    const pack = getAudioPack(id);
    assert.ok(pack, `Pack ${id} must exist`);
    assert.strictEqual(pack.id, id);
    assert.strictEqual(pack.version, '1.0.0');
    assert.strictEqual(Array.isArray(pack.files), true);
    assert.strictEqual(pack.files.length, 4);
  }

  // Prototype lookups
  assert.strictEqual(getAudioPack('toString'), undefined);
  assert.strictEqual(getAudioPack('__proto__'), undefined);
  assert.strictEqual(getAudioPack('constructor'), undefined);
  assert.strictEqual(getAudioPack('nonexistent'), undefined);
  assert.strictEqual(getAudioPack(''), undefined);
});

recordTest('2.3 getAudioPackAllFilePaths behavior across valid and invalid inputs', () => {
  // Valid IDs
  const classicPaths = getAudioPackAllFilePaths('classic');
  assert.strictEqual(classicPaths.length, 5, 'Classic has 4 stems + finalTrack = 5');
  assert.ok(classicPaths.includes('audio/stems/final.mp3'));

  const organicPaths = getAudioPackAllFilePaths('organic');
  assert.strictEqual(organicPaths.length, 4, 'Organic has 4 stems = 4');

  // Passing AudioPack object directly
  const synthPack = getAudioPack('synth');
  const synthPaths = getAudioPackAllFilePaths(synthPack);
  assert.strictEqual(synthPaths.length, 4);

  // Invalid inputs must return [] and NOT throw
  assert.deepStrictEqual(getAudioPackAllFilePaths('nonexistent'), []);
  assert.deepStrictEqual(getAudioPackAllFilePaths(''), []);
  assert.deepStrictEqual(getAudioPackAllFilePaths(null), []);
  assert.deepStrictEqual(getAudioPackAllFilePaths(undefined), []);
  assert.deepStrictEqual(getAudioPackAllFilePaths({ files: [] }), []);
});

recordTest('2.4 getAudioPackCacheName formatting and robustness', () => {
  assert.strictEqual(getAudioPackCacheName('classic'), 'maze-pack-classic-v1.0.0');
  assert.strictEqual(getAudioPackCacheName('organic'), 'maze-pack-organic-v1.0.0');
  assert.strictEqual(getAudioPackCacheName('synth'), 'maze-pack-synth-v1.0.0');
  assert.strictEqual(getAudioPackCacheName('clockwork'), 'maze-pack-clockwork-v1.0.0');

  // Object with explicit version
  const customPack = { id: 'test', version: '2.5.0' };
  assert.strictEqual(getAudioPackCacheName(customPack), 'maze-pack-test-v2.5.0');

  // Nonexistent string defaults version to '1.0.0'
  assert.strictEqual(getAudioPackCacheName('unknown_pack'), 'maze-pack-unknown_pack-v1.0.0');
});

recordTest('2.5 Asset inventory integrity: All pack files exist in public/ and KNOWN_AUDIO_ASSET_SIZES', () => {
  const publicDir = path.join(projectRoot, 'public');
  const allPacks = getAllAudioPacks();

  for (const pack of allPacks) {
    const filePaths = getAudioPackAllFilePaths(pack);
    for (const relPath of filePaths) {
      const diskPath = path.join(publicDir, relPath);
      assert.ok(
        fs.existsSync(diskPath),
        `Asset file must exist on disk: ${diskPath} (${relPath})`
      );

      const stats = fs.statSync(diskPath);
      const knownSize = KNOWN_AUDIO_ASSET_SIZES[relPath];
      assert.ok(
        knownSize !== undefined,
        `Asset ${relPath} must be registered in KNOWN_AUDIO_ASSET_SIZES`
      );
      assert.strictEqual(
        knownSize,
        stats.size,
        `KNOWN_AUDIO_ASSET_SIZES[${relPath}] (${knownSize}) must match physical file size (${stats.size})`
      );
    }
  }
});

// =============================================================================
// SUITE 3: IMMUTABILITY & ENCAPSULATION AUDIT (ADVERSARIAL ATTACK VECTORS)
// =============================================================================
console.log('\n--- SUITE 3: Immutability & Encapsulation Attack Vectors ---');

recordTest('3.1 Probe: Can external code mutate AUDIO_PACKS properties?', () => {
  const isRootFrozen = Object.isFrozen(AUDIO_PACKS);
  console.log(`    AUDIO_PACKS Object.isFrozen: ${isRootFrozen}`);

  if (!isRootFrozen) {
    // Record empirical observation: AUDIO_PACKS is not frozen at runtime
    console.log('    [EMPIRICAL OBSERVATION] AUDIO_PACKS is NOT Object.freeze()-d');
    
    // Probe mutating a property
    const origVersion = AUDIO_PACKS.classic.version;
    AUDIO_PACKS.classic.version = 'MUTATED_VERSION';
    const mutated = AUDIO_PACKS.classic.version === 'MUTATED_VERSION';
    // Revert mutation to preserve state
    AUDIO_PACKS.classic.version = origVersion;

    console.log(`    External code can modify properties of AUDIO_PACKS: ${mutated}`);
  }
});

recordTest('3.2 Probe: Can external code add or delete keys in AUDIO_PACKS?', () => {
  const isRootFrozen = Object.isFrozen(AUDIO_PACKS);
  const isRootSealed = Object.isSealed(AUDIO_PACKS);
  console.log(`    AUDIO_PACKS Object.isSealed: ${isRootSealed}`);

  if (!isRootSealed) {
    // Probe adding a key
    AUDIO_PACKS['malicious_pack'] = {
      id: 'malicious',
      nameKey: 'malicious',
      version: '6.6.6',
      folder: 'hacked',
      files: [],
      estimatedBytes: 0,
    };
    const keyAdded = 'malicious_pack' in AUDIO_PACKS;
    delete AUDIO_PACKS['malicious_pack'];
    console.log(`    External code can add keys to AUDIO_PACKS: ${keyAdded}`);
  }
});

recordTest('3.3 Probe: Can external code mutate the nested files array?', () => {
  const filesArray = AUDIO_PACKS.classic.files;
  const isFilesFrozen = Object.isFrozen(filesArray);
  console.log(`    AUDIO_PACKS.classic.files Object.isFrozen: ${isFilesFrozen}`);

  if (!isFilesFrozen) {
    filesArray.push('injected_file.mp3');
    const pushed = filesArray.includes('injected_file.mp3');
    filesArray.pop(); // Revert
    console.log(`    External code can push to files array: ${pushed}`);
  }
});

recordTest('3.4 Probe: Do getAllAudioPacks() and getAudioPackList() leak mutable internal references?', () => {
  const packList = getAllAudioPacks();
  const directPack = AUDIO_PACKS.classic;
  const listPack = packList.find((p) => p.id === 'classic');

  assert.ok(listPack);
  const isSameRef = listPack === directPack;
  console.log(`    getAllAudioPacks() returns exact internal object reference: ${isSameRef}`);
});

recordTest('3.5 Probe: Is AUDIO_PACK_IDS frozen at runtime?', () => {
  const isIdsFrozen = Object.isFrozen(AUDIO_PACK_IDS);
  console.log(`    AUDIO_PACK_IDS Object.isFrozen: ${isIdsFrozen}`);
  if (!isIdsFrozen) {
    console.log('    [EMPIRICAL OBSERVATION] AUDIO_PACK_IDS is typed "as const" in TS but not Object.freeze()-d at runtime');
  }
});

recordTest('3.6 Probe: Is KNOWN_AUDIO_ASSET_SIZES frozen at runtime?', () => {
  const isSizesFrozen = Object.isFrozen(KNOWN_AUDIO_ASSET_SIZES);
  console.log(`    KNOWN_AUDIO_ASSET_SIZES Object.isFrozen: ${isSizesFrozen}`);
});

// =============================================================================
// SUITE 4: INVARIANT VERIFICATION & RANDOMIZED FUZZ HARNESS (500 ITERATIONS)
// =============================================================================
console.log('\n--- SUITE 4: Invariant Verification & Randomized Fuzz Harness (500 Iterations) ---');

recordTest('4.1 Invariant: loadSettings() NEVER throws and ALWAYS returns valid GameSettings with string selectedAudioPack', () => {
  const randomChars = 'abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:",.<>?/ \t\n\r\u200B\uFEFF';

  function generateRandomGarbage(len) {
    let s = '';
    for (let i = 0; i < len; i++) {
      s += randomChars[Math.floor(Math.random() * randomChars.length)];
    }
    return s;
  }

  const fuzzTypes = [
    // 0: totally random string
    () => generateRandomGarbage(Math.floor(Math.random() * 200)),
    // 1: malformed JSON object
    () => `{"selectedAudioPack": ${generateRandomGarbage(50)}}`,
    // 2: valid JSON with random types for selectedAudioPack
    () => {
      const vals = [
        null,
        Math.random() * 1000 - 500,
        Math.random() > 0.5,
        [],
        [Math.random()],
        {},
        { a: Math.random() },
        generateRandomGarbage(20),
        '   ',
        '',
      ];
      const val = vals[Math.floor(Math.random() * vals.length)];
      return JSON.stringify({
        selectedAudioPack: val,
        theme: Math.random() > 0.5 ? 'dark' : 'light',
        lang: 'en',
      });
    },
    // 3: corrupted JSON syntax variations
    () => '{"selectedAudioPack": "classic"' + generateRandomGarbage(5),
    // 4: prototype pollution json
    () => `{"__proto__": {"polluted_${Math.random()}": true}}`,
    // 5: valid pack ID
    () => JSON.stringify({ selectedAudioPack: ['classic', 'organic', 'synth', 'clockwork'][Math.floor(Math.random() * 4)] }),
  ];

  for (let i = 0; i < 500; i++) {
    const generator = fuzzTypes[i % fuzzTypes.length];
    const payload = generator();

    storageBackingStore.clear();
    storageBackingStore.set(SETTINGS_KEY, payload);

    let result;
    try {
      result = loadSettings();
    } catch (err) {
      assert.fail(`Fuzz iteration ${i} threw: ${err.message} on payload: ${payload}`);
    }

    assert.ok(result && typeof result === 'object', `Iteration ${i} must return an object`);
    assert.strictEqual(
      typeof result.selectedAudioPack,
      'string',
      `Iteration ${i} selectedAudioPack must be string (payload: ${payload})`
    );
    assert.ok(
      result.selectedAudioPack.length > 0,
      `Iteration ${i} selectedAudioPack must not be empty string`
    );
    assert.strictEqual(
      typeof result.theme,
      'string',
      `Iteration ${i} theme must be string`
    );
    assert.strictEqual(
      typeof result.audioNavEnabled,
      'boolean',
      `Iteration ${i} audioNavEnabled must be boolean`
    );
    assert.strictEqual(
      typeof result.audioNavVolume,
      'number',
      `Iteration ${i} audioNavVolume must be number`
    );
    assert.ok(
      !Number.isNaN(result.audioNavVolume),
      `Iteration ${i} audioNavVolume must not be NaN`
    );
  }
  console.log('    Verified 500/500 randomized fuzz iterations successfully.');
});

// =============================================================================
// SUMMARY & VERDICT
// =============================================================================
console.log('\n================================================================');
console.log(`  CHALLENGE RUN SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log('================================================================\n');

if (failedTests > 0) {
  console.error('FAILURES DETECTED:');
  for (const f of findings) {
    console.error(` - ${f.name}: ${f.error}`);
  }
  process.exit(1);
} else {
  console.log('All empirical assertions passed.');
  process.exit(0);
}
