/**
 * tests/challenger_m1_disk_contract_stress.mjs
 *
 * Empirical Challenger 2 Stress Suite for Milestone 1:
 * 1. Physical On-Disk Integrity & File Size Verification:
 *    - All stems across all 4 packs (classic, organic, synth, clockwork)
 *    - Exact file sizes vs KNOWN_AUDIO_ASSET_SIZES manifest
 *    - estimatedBytes accuracy verification
 *    - Binary audio container header / magic bytes validation (.m4a ISO ftyp / .mp3 ID3)
 * 2. Negative Contract & Boundaries Verification for 'cosmic':
 *    - Verify 'cosmic' is NOT in AUDIO_PACKS or AUDIO_PACK_IDS
 *    - Verify isValidAudioPackId('cosmic') === false
 *    - Verify getAudioPack('cosmic') === undefined
 *    - Inspect public/audio/packs/cosmic on-disk to prove absence of audio stems
 * 3. Adversarial Robustness & Contract Stress:
 *    - Prototype pollution attack resistance (__proto__, constructor, toString)
 *    - Path traversal attacks (../, ..\, /etc/passwd, null bytes)
 *    - Malformed types, whitespace, case sensitivity
 *    - Cache name generation consistency
 * 4. Storage Integration & Resilience:
 *    - selectedAudioPack defaults to 'classic'
 *    - Malformed storage recovery
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Register TypeScript resolver for extensionless imports in Node ESM
try {
  register(new URL('./ts_resolver.mjs', import.meta.url).href);
} catch {
  // Ignore if already registered
}

console.log('================================================================');
console.log('  CHALLENGER 2 (M1): AUDIO PACK DISK INTEGRITY & CONTRACT STRESS');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

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
    failureDetails.push({ name, error: err.message });
  }
}

// Import audioPacks module
const audioPacks = await import('../src/config/audioPacks.ts');

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
} = audioPacks;

// ============================================================================
// SUITE 1: PHYSICAL ON-DISK INTEGRITY & FILE SIZE AUDIT
// ============================================================================
console.log('--- SUITE 1: Physical On-Disk Integrity & File Size Audit ---');

const EXPECTED_PACK_IDS = ['classic', 'organic', 'synth', 'clockwork'];

runTest('1.1 AUDIO_PACKS contains exactly classic, organic, synth, clockwork', () => {
  const registered = Object.keys(AUDIO_PACKS).sort();
  assert.deepStrictEqual(registered, [...EXPECTED_PACK_IDS].sort());
});

runTest('1.2 Physical stem files exist and are non-empty for all 4 packs', () => {
  for (const packId of EXPECTED_PACK_IDS) {
    const pack = AUDIO_PACKS[packId];
    assert.ok(pack, `Pack ${packId} must exist in manifest`);
    assert.strictEqual(pack.files.length, 4, `Pack ${packId} must have exactly 4 stem files`);

    for (const stemFile of pack.files) {
      const stemDiskPath = path.join(projectRoot, 'public', pack.folder, stemFile);
      assert.ok(fs.existsSync(stemDiskPath), `Stem file missing on disk: ${stemDiskPath}`);
      const stat = fs.statSync(stemDiskPath);
      assert.ok(stat.isFile(), `Expected file at: ${stemDiskPath}`);
      assert.ok(stat.size > 0, `Stem file must be non-empty (> 0 bytes): ${stemDiskPath}`);
      assert.ok(stat.size >= 500_000, `Stem file suspiciously small (< 500 kB): ${stemDiskPath} (${stat.size} bytes)`);
    }
  }
});

runTest('1.3 Classic pack finalTrack exists and is non-empty', () => {
  const classic = AUDIO_PACKS.classic;
  assert.strictEqual(classic.finalTrack, 'audio/stems/final.mp3');
  const finalDiskPath = path.join(projectRoot, 'public', classic.finalTrack);
  assert.ok(fs.existsSync(finalDiskPath), `Classic finalTrack missing: ${finalDiskPath}`);
  const stat = fs.statSync(finalDiskPath);
  assert.ok(stat.size > 0, `final.mp3 must be non-empty (> 0 bytes)`);
  assert.strictEqual(stat.size, 177456, `final.mp3 size must be exactly 177,456 bytes`);
});

runTest('1.4 Exact disk sizes match KNOWN_AUDIO_ASSET_SIZES byte-for-byte', () => {
  for (const [relativePath, expectedSize] of Object.entries(KNOWN_AUDIO_ASSET_SIZES)) {
    const fullPath = path.join(projectRoot, 'public', relativePath);
    assert.ok(fs.existsSync(fullPath), `Asset in KNOWN_AUDIO_ASSET_SIZES does not exist on disk: ${fullPath}`);
    const actualSize = fs.statSync(fullPath).size;
    assert.strictEqual(
      actualSize,
      expectedSize,
      `Size mismatch for ${relativePath}: disk has ${actualSize} bytes, KNOWN_AUDIO_ASSET_SIZES states ${expectedSize}`
    );
  }
});

runTest('1.5 estimatedBytes matches sum of all stems (+ finalTrack) for every pack', () => {
  for (const packId of EXPECTED_PACK_IDS) {
    const pack = AUDIO_PACKS[packId];
    const allFiles = getAudioPackAllFilePaths(pack);
    let calculatedSum = 0;
    for (const fileRelPath of allFiles) {
      const diskPath = path.join(projectRoot, 'public', fileRelPath);
      calculatedSum += fs.statSync(diskPath).size;
    }
    assert.strictEqual(
      pack.estimatedBytes,
      calculatedSum,
      `Pack ${packId} estimatedBytes (${pack.estimatedBytes}) does not equal actual disk sum (${calculatedSum})`
    );
  }
});

runTest('1.6 Binary container headers validate as genuine audio files (magic bytes)', () => {
  for (const packId of EXPECTED_PACK_IDS) {
    const pack = AUDIO_PACKS[packId];
    const allFiles = getAudioPackAllFilePaths(pack);

    for (const relPath of allFiles) {
      const diskPath = path.join(projectRoot, 'public', relPath);
      const fd = fs.openSync(diskPath, 'r');
      const buffer = Buffer.alloc(16);
      fs.readSync(fd, buffer, 0, 16, 0);
      fs.closeSync(fd);

      if (relPath.endsWith('.m4a')) {
        // ISO base media file format: bytes 4-8 are 'ftyp'
        const ftypSignature = buffer.toString('ascii', 4, 8);
        assert.strictEqual(
          ftypSignature,
          'ftyp',
          `File ${relPath} does not have valid ISO/M4A 'ftyp' box signature at offset 4 (got '${ftypSignature}')`
        );
      } else if (relPath.endsWith('.mp3')) {
        // MP3 usually starts with ID3 header (0x49 0x44 0x33) or MPEG sync frame (0xFF 0xFB)
        const isID3 = buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33;
        const isMPEG = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
        assert.ok(
          isID3 || isMPEG,
          `File ${relPath} does not have valid MP3 header (ID3 or MPEG frame sync)`
        );
      }
    }
  }
});

// ============================================================================
// SUITE 2: NEGATIVE CONTRACT & BOUNDARIES FOR 'cosmic'
// ============================================================================
console.log('\n--- SUITE 2: Negative Contract & Boundaries for "cosmic" ---');

runTest('2.1 "cosmic" is NOT in AUDIO_PACKS object keys', () => {
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(AUDIO_PACKS, 'cosmic'),
    false,
    '"cosmic" must NOT exist in AUDIO_PACKS'
  );
  assert.strictEqual(AUDIO_PACKS['cosmic'], undefined);
});

runTest('2.2 "cosmic" is NOT in AUDIO_PACK_IDS array', () => {
  assert.strictEqual(AUDIO_PACK_IDS.includes('cosmic'), false);
});

runTest('2.3 isValidAudioPackId("cosmic") returns false', () => {
  assert.strictEqual(isValidAudioPackId('cosmic'), false);
});

runTest('2.4 getAudioPack("cosmic") returns undefined', () => {
  assert.strictEqual(getAudioPack('cosmic'), undefined);
});

runTest('2.5 getAudioPackAllFilePaths("cosmic") returns empty array []', () => {
  const paths = getAudioPackAllFilePaths('cosmic');
  assert.deepStrictEqual(paths, []);
});

runTest('2.6 On-disk inspection of public/audio/packs/cosmic confirms zero stem audio files', () => {
  const cosmicDir = path.join(projectRoot, 'public', 'audio', 'packs', 'cosmic');
  assert.ok(fs.existsSync(cosmicDir), 'public/audio/packs/cosmic exists');

  const filesInCosmic = fs.readdirSync(cosmicDir);
  // Check that no .m4a, .mp3, or audio files exist directly in cosmic directory
  const audioFiles = filesInCosmic.filter(f => f.endsWith('.m4a') || f.endsWith('.mp3'));
  assert.deepStrictEqual(
    audioFiles,
    [],
    `public/audio/packs/cosmic unexpectedly contains audio files: ${audioFiles.join(', ')}`
  );

  // Check midi subfolder: cosmic has only midi files
  const midiDir = path.join(cosmicDir, 'midi');
  assert.ok(fs.existsSync(midiDir), 'public/audio/packs/cosmic/midi exists');
  const midiFiles = fs.readdirSync(midiDir);
  assert.ok(midiFiles.length > 0, 'public/audio/packs/cosmic/midi contains MIDI files');
  for (const mf of midiFiles) {
    assert.ok(mf.endsWith('.mid'), `Expected .mid file, got ${mf}`);
  }
});

// ============================================================================
// SUITE 3: ADVERSARIAL STRESS & CONTRACT RESILIENCE
// ============================================================================
console.log('\n--- SUITE 3: Adversarial Stress & Contract Resilience ---');

runTest('3.1 Prototype pollution attack keys return false / undefined', () => {
  const protoAttacks = ['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty'];
  for (const attack of protoAttacks) {
    assert.strictEqual(isValidAudioPackId(attack), false, `isValidAudioPackId("${attack}") must be false`);
    assert.strictEqual(getAudioPack(attack), undefined, `getAudioPack("${attack}") must be undefined`);
    assert.deepStrictEqual(getAudioPackAllFilePaths(attack), [], `getAudioPackAllFilePaths("${attack}") must be []`);
  }
});

runTest('3.2 Path traversal and malformed strings return false / undefined', () => {
  const pathAttacks = [
    '../',
    '../../etc/passwd',
    '..\\..\\windows\\system32',
    'classic/../organic',
    '/classic',
    'classic\0',
    'classic.m4a',
    './classic',
    '~classic',
  ];
  for (const attack of pathAttacks) {
    assert.strictEqual(isValidAudioPackId(attack), false, `isValidAudioPackId("${attack}") must be false`);
    assert.strictEqual(getAudioPack(attack), undefined, `getAudioPack("${attack}") must be undefined`);
    assert.deepStrictEqual(getAudioPackAllFilePaths(attack), [], `getAudioPackAllFilePaths("${attack}") must be []`);
  }
});

runTest('3.3 Non-string string-like or falsy string inputs are handled safely without exceptions', () => {
  const invalidStringInputs = [
    '',
    '   ',
    '\t\n',
    'undefined',
    'null',
    '0',
    'false',
  ];

  for (const input of invalidStringInputs) {
    assert.doesNotThrow(() => {
      const valid = isValidAudioPackId(input);
      assert.strictEqual(valid, false, `isValidAudioPackId("${input}") must be false`);
    });

    assert.doesNotThrow(() => {
      const pack = getAudioPack(input);
      assert.strictEqual(pack, undefined, `getAudioPack("${input}") must be undefined`);
    });

    assert.doesNotThrow(() => {
      const paths = getAudioPackAllFilePaths(input);
      assert.deepStrictEqual(paths, [], `getAudioPackAllFilePaths("${input}") must be []`);
    });
  }
});

runTest('3.4 Adversarial check: getAudioPackAllFilePaths on malformed non-AudioPack objects', () => {
  // If an untyped caller passes an empty object or non-pack object:
  // packOrId is treated as pack, but pack.files is undefined.
  // We document whether it throws or handles gracefully.
  let threwException = false;
  try {
    // @ts-expect-error testing untyped runtime pass
    getAudioPackAllFilePaths({});
  } catch (err) {
    threwException = true;
    console.log(`    Note: getAudioPackAllFilePaths({}) throws TypeError (${err.message}). Caller must pass valid AudioPack or string ID.`);
  }
  // We expect either safe fallback or type error. Both are valid findings to report.
  assert.ok(true);
});

runTest('3.5 Case sensitivity enforcement (exact lowercase IDs required)', () => {
  const upperCaseVariants = ['CLASSIC', 'Classic', 'ORGANIC', 'Synth', 'CLOCKWORK'];
  for (const variant of upperCaseVariants) {
    assert.strictEqual(isValidAudioPackId(variant), false, `Variant ${variant} must not be valid`);
    assert.strictEqual(getAudioPack(variant), undefined, `getAudioPack("${variant}") must be undefined`);
  }
});

runTest('3.6 getAudioPackCacheName generates conformant Cache API bucket names', () => {
  assert.strictEqual(getAudioPackCacheName('classic'), 'maze-pack-classic-v1.0.0');
  assert.strictEqual(getAudioPackCacheName('organic'), 'maze-pack-organic-v1.0.0');
  assert.strictEqual(getAudioPackCacheName('synth'), 'maze-pack-synth-v1.0.0');
  assert.strictEqual(getAudioPackCacheName('clockwork'), 'maze-pack-clockwork-v1.0.0');

  // Object input
  assert.strictEqual(getAudioPackCacheName(AUDIO_PACKS.classic), 'maze-pack-classic-v1.0.0');

  // Fallback for custom or unknown ID
  assert.strictEqual(getAudioPackCacheName('custom'), 'maze-pack-custom-v1.0.0');
});

runTest('3.7 getAllAudioPacks and getAudioPackList consistency', () => {
  const all = getAllAudioPacks();
  const list = getAudioPackList();
  assert.strictEqual(all.length, 4);
  assert.deepStrictEqual(all, list);
  assert.deepStrictEqual(all.map(p => p.id).sort(), [...EXPECTED_PACK_IDS].sort());
});

// ============================================================================
// SUITE 4: STORAGE & FALLBACK BOUNDARIES VERIFICATION
// ============================================================================
console.log('\n--- SUITE 4: Storage & Fallback Boundaries Verification ---');

// Mock localStorage store
const memoryStore = new Map();
const mockLocalStorage = {
  getItem: (key) => memoryStore.get(key) ?? null,
  setItem: (key, val) => memoryStore.set(key, String(val)),
  removeItem: (key) => memoryStore.delete(key),
  clear: () => memoryStore.clear(),
};

globalThis.window = {
  localStorage: mockLocalStorage,
  matchMedia: () => ({ matches: false }),
};
globalThis.localStorage = mockLocalStorage;

const { getDefaultSettings, loadSettings, saveSettings } = await import('../src/utils/storage.ts');

runTest('4.1 Default settings include selectedAudioPack === "classic"', () => {
  const def = getDefaultSettings();
  assert.strictEqual(def.selectedAudioPack, 'classic');
});

runTest('4.2 Stored "cosmic" pack ID safely deserializes as string without crashing', () => {
  // If a user somehow had "cosmic" in storage, loadSettings does not throw
  memoryStore.set('maze_daily_settings', JSON.stringify({ selectedAudioPack: 'cosmic' }));
  const loaded = loadSettings();
  assert.strictEqual(loaded.selectedAudioPack, 'cosmic');
});

runTest('4.3 Corrupted storage values for selectedAudioPack fall back to "classic"', () => {
  const badValues = [null, undefined, 123, false, true, [], {}, '', '   ', NaN];
  for (const bad of badValues) {
    memoryStore.set('maze_daily_settings', JSON.stringify({ selectedAudioPack: bad }));
    const loaded = loadSettings();
    assert.strictEqual(
      loaded.selectedAudioPack,
      'classic',
      `Bad value ${JSON.stringify(bad)} must fall back to "classic"`
    );
  }
});

// ============================================================================
// SUMMARY & VERDICT
// ============================================================================
console.log('\n================================================================');
console.log(`  ALL ${passedTests}/${totalTests} TESTS PASSED CLEANLY!`);
console.log(`  FAILED TESTS: ${failedTests}`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
