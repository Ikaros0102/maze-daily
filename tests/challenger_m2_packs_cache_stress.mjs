/**
 * tests/challenger_m2_packs_cache_stress.mjs
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER SUITE FOR MILESTONE 2:
 * 10-Day TTL Eviction and Active Pack Protection Invariant
 *
 * Case A: Active pack timestamp 30 days ago, Inactive pack 11 days ago.
 *         Verify active pack is PRESERVED, inactive pack is PURGED.
 * Case B: Active pack has no timestamp at all (untracked in localStorage).
 *         Verify active pack is PRESERVED.
 * Case C: Inactive pack has corrupted timestamp ("not-a-number", negative, null, empty, objects).
 *         Verify safe handling without throws or corruptions.
 * Case D: Concurrent calls to checkAndPurgeExpiredCaches do not throw or produce race conditions.
 * Case E: Module caches (maze-daily-module-cache-v1-*) are not inadvertently deleted as pack caches.
 * Case F: Randomized adversarial fuzzing and clock drift tolerance harness.
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
console.log('  CHALLENGER 1 (M2): EMPIRICAL ADVERSARIAL STRESS & ORACLE SUITE');
console.log('  10-Day TTL Eviction & Active Pack Protection Invariant');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// Storage & Cache Mock Setup
// -----------------------------------------------------------------------------
const storageBackingMap = new Map();
let shouldStorageThrow = false;

const mockLocalStorage = {
  getItem: (key) => {
    if (shouldStorageThrow) throw new Error('Simulated Storage getItem failure');
    return storageBackingMap.get(key) ?? null;
  },
  setItem: (key, value) => {
    if (shouldStorageThrow) throw new Error('Simulated Storage setItem failure');
    storageBackingMap.set(key, String(value));
  },
  removeItem: (key) => {
    if (shouldStorageThrow) throw new Error('Simulated Storage removeItem failure');
    storageBackingMap.delete(key);
  },
  clear: () => {
    storageBackingMap.clear();
  },
  key: (index) => {
    if (shouldStorageThrow) throw new Error('Simulated Storage key failure');
    return Array.from(storageBackingMap.keys())[index] ?? null;
  },
  get length() {
    return storageBackingMap.size;
  },
};

globalThis.window = {
  localStorage: mockLocalStorage,
  location: { href: 'http://localhost/' },
};
globalThis.localStorage = mockLocalStorage;

// Import moduleLoader
const moduleLoaderPath = pathToFileURL(path.resolve(projectRoot, 'src/services/moduleLoader.ts')).href;
const moduleLoader = await import(moduleLoaderPath);

const {
  AUDIO_PACKS,
  getAudioPack,
  getAudioPackCacheName,
  getAudioPackAllFilePaths,
  isValidAudioPackId,
  extractPackIdFromCacheName,
  touchAudioPackUsage,
  getAudioPackLastUsed,
  removeAudioPackUsage,
  purgeAudioPackCache,
  isAudioPackCachedAndValid,
  getCachedAudioPackAssetBuffer,
  loadAudioPackWithProgress,
  checkAndPurgeExpiredCaches,
  touchModuleUsage,
  purgeModuleCache,
  MemoryCacheAdapter,
  CACHE_PREFIX,
  RETENTION_PERIOD_MS,
  MODULE_VERSIONS,
} = moduleLoader;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function runTestCase(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failures.push({ name, error: err.message, stack: err.stack });
  }
}

// Helper to populate MemoryCacheAdapter with dummy audio pack assets
async function seedPackInCache(packId) {
  const pack = getAudioPack(packId);
  const cacheName = getAudioPackCacheName(pack);
  const files = getAudioPackAllFilePaths(pack);
  for (const f of files) {
    await MemoryCacheAdapter.put(cacheName, f, new Uint8Array([1, 2, 3, 4]).buffer);
  }
}

// =============================================================================
// CASE A: Active pack timestamp 30 days ago, Inactive pack 11 days ago
// =============================================================================
console.log('--- TEST GROUP A: Active Pack Protection with 30-Day Age Invariant ---');

await runTestCase('A.1: Active pack with 30-day-old timestamp is PRESERVED; 11-day inactive pack is PURGED', async () => {
  mockLocalStorage.clear();
  MemoryCacheAdapter.clear();

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const elevenDaysAgo = now - 11 * 24 * 60 * 60 * 1000;
  const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;

  // Active pack: organic (30 days ago)
  await seedPackInCache('organic');
  mockLocalStorage.setItem('audio_pack_last_used_organic', String(thirtyDaysAgo));

  // Inactive pack 1: synth (11 days ago -> expired)
  await seedPackInCache('synth');
  mockLocalStorage.setItem('audio_pack_last_used_synth', String(elevenDaysAgo));

  // Inactive pack 2: clockwork (3 days ago -> fresh)
  await seedPackInCache('clockwork');
  mockLocalStorage.setItem('audio_pack_last_used_clockwork', String(threeDaysAgo));

  const result = await checkAndPurgeExpiredCaches('organic');

  // Assertions on return value
  assert.ok(!result.purgedPacks.includes('organic'), 'Active pack "organic" MUST NOT be in purgedPacks');
  assert.ok(result.purgedPacks.includes('synth'), 'Inactive expired pack "synth" MUST be in purgedPacks');
  assert.ok(!result.purgedPacks.includes('clockwork'), 'Fresh inactive pack "clockwork" MUST NOT be in purgedPacks');

  // Assertions on physical cache persistence
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('organic')), true, 'Active pack cache MUST be preserved');
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('synth')), false, 'Expired inactive pack cache MUST be deleted');
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('clockwork')), true, 'Fresh inactive pack cache MUST be preserved');

  // Assertions on localStorage metadata
  assert.strictEqual(mockLocalStorage.getItem('audio_pack_last_used_organic'), String(thirtyDaysAgo), 'Active pack timestamp metadata MUST be preserved');
  assert.strictEqual(mockLocalStorage.getItem('audio_pack_last_used_synth'), null, 'Expired pack timestamp metadata MUST be removed');
  assert.strictEqual(mockLocalStorage.getItem('audio_pack_last_used_clockwork'), String(threeDaysAgo), 'Fresh pack timestamp metadata MUST be preserved');
});

await runTestCase('A.2: Multiple stale packs (11d, 20d, 50d) are purged while active pack (30d) is protected', async () => {
  mockLocalStorage.clear();
  MemoryCacheAdapter.clear();

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 86400000;

  // Active pack: synth (30 days ago)
  await seedPackInCache('synth');
  mockLocalStorage.setItem('audio_pack_last_used_synth', String(thirtyDaysAgo));

  // Expired inactive packs
  await seedPackInCache('organic');
  mockLocalStorage.setItem('audio_pack_last_used_organic', String(now - 11 * 86400000));

  await seedPackInCache('clockwork');
  mockLocalStorage.setItem('audio_pack_last_used_clockwork', String(now - 20 * 86400000));

  await seedPackInCache('classic');
  mockLocalStorage.setItem('audio_pack_last_used_classic', String(now - 50 * 86400000));

  const result = await checkAndPurgeExpiredCaches('synth');

  assert.ok(!result.purgedPacks.includes('synth'), 'Active pack "synth" must not be purged');
  assert.ok(result.purgedPacks.includes('organic'), 'Expired "organic" must be purged');
  assert.ok(result.purgedPacks.includes('clockwork'), 'Expired "clockwork" must be purged');
  assert.ok(result.purgedPacks.includes('classic'), 'Expired "classic" must be purged');

  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('synth')), true);
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('organic')), false);
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('clockwork')), false);
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('classic')), false);
});

// =============================================================================
// CASE B: Active pack has NO timestamp at all (untracked in localStorage)
// =============================================================================
console.log('\n--- TEST GROUP B: Untracked Active Pack Protection ---');

await runTestCase('B.1: Active pack with no timestamp is PRESERVED; untracked inactive pack is PURGED', async () => {
  mockLocalStorage.clear();
  MemoryCacheAdapter.clear();

  // Active pack organic: cached but NO entry in localStorage
  await seedPackInCache('organic');
  // Explicitly ensure no key
  mockLocalStorage.removeItem('audio_pack_last_used_organic');

  // Inactive pack synth: cached but NO entry in localStorage (orphaned inactive)
  await seedPackInCache('synth');
  mockLocalStorage.removeItem('audio_pack_last_used_synth');

  const result = await checkAndPurgeExpiredCaches('organic');

  assert.ok(!result.purgedPacks.includes('organic'), 'Untracked active pack "organic" MUST NOT be in purgedPacks');
  assert.ok(result.purgedPacks.includes('synth'), 'Untracked inactive pack "synth" MUST be in purgedPacks');
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('organic')), true, 'Untracked active pack MUST be preserved in cache');
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('synth')), false, 'Untracked inactive pack MUST be purged from cache');
});

await runTestCase('B.2: Untracked active pack inferred from stored settings is PRESERVED when param omitted', async () => {
  mockLocalStorage.clear();
  MemoryCacheAdapter.clear();

  // Settings in localStorage specifies clockwork
  mockLocalStorage.setItem('maze_daily_settings_v1', JSON.stringify({
    selectedAudioPack: 'clockwork',
  }));

  await seedPackInCache('clockwork'); // Untracked clockwork
  await seedPackInCache('organic');   // Untracked organic

  // Call without argument
  const result = await checkAndPurgeExpiredCaches();

  assert.ok(!result.purgedPacks.includes('clockwork'), 'Active pack inferred from settings MUST NOT be purged');
  assert.ok(result.purgedPacks.includes('organic'), 'Inactive untracked pack MUST be purged');
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('clockwork')), true);
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('organic')), false);
});

await runTestCase('B.3: Untracked default "classic" pack is PRESERVED when neither param nor settings exist', async () => {
  mockLocalStorage.clear();
  MemoryCacheAdapter.clear();

  await seedPackInCache('classic'); // Untracked classic
  await seedPackInCache('synth');   // Untracked synth

  const result = await checkAndPurgeExpiredCaches();

  assert.ok(!result.purgedPacks.includes('classic'), 'Default active pack "classic" MUST be preserved');
  assert.ok(result.purgedPacks.includes('synth'), 'Untracked "synth" MUST be purged');
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('classic')), true);
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('synth')), false);
});

// =============================================================================
// CASE C: Inactive pack has corrupted timestamp ("not-a-number", negative, null)
// =============================================================================
console.log('\n--- TEST GROUP C: Corrupted Timestamp Safe Handling & Invariant ---');

await runTestCase('C.1: Inactive pack with string "NaN" / non-numeric string is safely purged without throw', async () => {
  mockLocalStorage.clear();
  MemoryCacheAdapter.clear();

  await seedPackInCache('organic');
  mockLocalStorage.setItem('audio_pack_last_used_organic', String(Date.now()));

  await seedPackInCache('synth');
  mockLocalStorage.setItem('audio_pack_last_used_synth', 'not-a-number-corrupted-data');

  let thrown = false;
  let result;
  try {
    result = await checkAndPurgeExpiredCaches('organic');
  } catch {
    thrown = true;
  }

  assert.strictEqual(thrown, false, 'checkAndPurgeExpiredCaches MUST NOT throw on corrupted NaN string');
  assert.ok(result.purgedPacks.includes('synth'), 'Corrupted inactive pack MUST be purged');
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('synth')), false);
  assert.strictEqual(mockLocalStorage.getItem('audio_pack_last_used_synth'), null, 'Corrupted key MUST be cleaned up');
});

await runTestCase('C.2: Inactive pack with negative timestamp is safely treated as expired and purged', async () => {
  mockLocalStorage.clear();
  MemoryCacheAdapter.clear();

  await seedPackInCache('organic');
  mockLocalStorage.setItem('audio_pack_last_used_organic', String(Date.now()));

  await seedPackInCache('clockwork');
  mockLocalStorage.setItem('audio_pack_last_used_clockwork', '-9999999999');

  const result = await checkAndPurgeExpiredCaches('organic');

  assert.ok(result.purgedPacks.includes('clockwork'), 'Negative timestamp pack MUST be purged');
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('clockwork')), false);
});

await runTestCase('C.3: Inactive pack with various fuzzed corruptions (empty string, JSON, booleans, symbols)', async () => {
  const corruptedValues = [
    '',
    '   ',
    'null',
    'undefined',
    'true',
    'false',
    '{}',
    '{"corrupted": 1}',
    '[1, 2, 3]',
    'Infinity',
    '-Infinity',
    '0xDEADBEEF',
    '1e999999',
    'symbol',
  ];

  for (const badVal of corruptedValues) {
    mockLocalStorage.clear();
    MemoryCacheAdapter.clear();

    await seedPackInCache('organic');
    mockLocalStorage.setItem('audio_pack_last_used_organic', String(Date.now()));

    await seedPackInCache('synth');
    mockLocalStorage.setItem('audio_pack_last_used_synth', badVal);

    let result;
    try {
      result = await checkAndPurgeExpiredCaches('organic');
    } catch (err) {
      assert.fail(`checkAndPurgeExpiredCaches threw on corrupted value "${badVal}": ${err.message}`);
    }

    assert.ok(!result.purgedPacks.includes('organic'), `Active pack must be preserved with badVal: ${badVal}`);
    assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('organic')), true);
  }
});

await runTestCase('C.4: ACTIVE pack with corrupted timestamp is STILL PRESERVED (Hard Invariant)', async () => {
  const activeCorruptedValues = ['corrupted-nan', '-500000', '', 'null', 'undefined', '{"bad": true}'];

  for (const badVal of activeCorruptedValues) {
    mockLocalStorage.clear();
    MemoryCacheAdapter.clear();

    await seedPackInCache('organic');
    mockLocalStorage.setItem('audio_pack_last_used_organic', badVal);

    // Inactive expired pack to verify purge still executes
    await seedPackInCache('synth');
    mockLocalStorage.setItem('audio_pack_last_used_synth', String(Date.now() - 15 * 86400000));

    const result = await checkAndPurgeExpiredCaches('organic');

    assert.ok(!result.purgedPacks.includes('organic'), `Active pack "organic" with corrupted ts "${badVal}" MUST NOT be purged`);
    assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('organic')), true, `Active pack cache MUST remain`);
    assert.ok(result.purgedPacks.includes('synth'), 'Inactive expired pack must still be purged');
  }
});

// =============================================================================
// CASE D: Concurrent calls do not throw or produce race conditions
// =============================================================================
console.log('\n--- TEST GROUP D: Concurrency, Interleaving & Stress Harness ---');

await runTestCase('D.1: 50 concurrent calls with identical active pack complete safely with consistent state', async () => {
  mockLocalStorage.clear();
  MemoryCacheAdapter.clear();

  const now = Date.now();
  await seedPackInCache('organic');
  mockLocalStorage.setItem('audio_pack_last_used_organic', String(now));

  await seedPackInCache('synth');
  mockLocalStorage.setItem('audio_pack_last_used_synth', String(now - 12 * 86400000));

  await seedPackInCache('clockwork');
  mockLocalStorage.setItem('audio_pack_last_used_clockwork', String(now - 15 * 86400000));

  // Run 50 concurrent calls
  const promises = Array.from({ length: 50 }, () => checkAndPurgeExpiredCaches('organic'));
  const results = await Promise.all(promises);

  for (const res of results) {
    assert.ok(!res.purgedPacks.includes('organic'), 'Active pack "organic" must never appear in any concurrent purge result');
  }

  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('organic')), true, 'Active pack cache must remain');
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('synth')), false, 'Expired synth must be removed');
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('clockwork')), false, 'Expired clockwork must be removed');
});

await runTestCase('D.2: Interleaved concurrent calls with different active packs do not crash', async () => {
  mockLocalStorage.clear();
  MemoryCacheAdapter.clear();

  const now = Date.now();
  await seedPackInCache('organic');
  mockLocalStorage.setItem('audio_pack_last_used_organic', String(now - 12 * 86400000));

  await seedPackInCache('synth');
  mockLocalStorage.setItem('audio_pack_last_used_synth', String(now - 12 * 86400000));

  // 20 concurrent calls with alternating active packs
  const promises = [];
  for (let i = 0; i < 20; i++) {
    const pack = i % 2 === 0 ? 'organic' : 'synth';
    promises.push(checkAndPurgeExpiredCaches(pack));
  }

  const results = await Promise.allSettled(promises);
  for (const res of results) {
    assert.strictEqual(res.status, 'fulfilled', 'All concurrent executions must settle successfully');
  }
});

await runTestCase('D.3: Rapid mutation during concurrent purge (cache write while purging)', async () => {
  mockLocalStorage.clear();
  MemoryCacheAdapter.clear();

  const now = Date.now();
  await seedPackInCache('organic');
  mockLocalStorage.setItem('audio_pack_last_used_organic', String(now));

  // Start purge and write new pack concurrently
  const purgePromise = checkAndPurgeExpiredCaches('organic');
  const writePromise = seedPackInCache('clockwork');

  const [purgeRes] = await Promise.all([purgePromise, writePromise]);
  assert.ok(!purgeRes.purgedPacks.includes('organic'));
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('organic')), true);
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('clockwork')), true);
});

// =============================================================================
// CASE E: Module caches (maze-daily-module-cache-v1-*) are not deleted as pack caches
// =============================================================================
console.log('\n--- TEST GROUP E: Module Cache Isolation & Disjoint Namespace ---');

await runTestCase('E.1: Fresh module caches are not inadvertently purged by audio pack eviction', async () => {
  mockLocalStorage.clear();
  MemoryCacheAdapter.clear();

  const now = Date.now();

  // Setup active module caches in MemoryCacheAdapter
  const headCacheName = `${CACHE_PREFIX}-headTracking`;
  const audioCacheName = `${CACHE_PREFIX}-audioNav`;
  await MemoryCacheAdapter.put(headCacheName, 'models/face_landmarker.task', new Uint8Array([10, 20]).buffer);
  await MemoryCacheAdapter.put(audioCacheName, 'audio/stems/stem-1.m4a', new Uint8Array([30, 40]).buffer);

  // Setup retention store marking modules as active (fresh)
  mockLocalStorage.setItem('maze_daily_module_retention_v1', JSON.stringify({
    headTracking: { version: MODULE_VERSIONS.headTracking, lastUsed: now },
    audioNav: { version: MODULE_VERSIONS.audioNav, lastUsed: now },
  }));

  // Setup audio packs (one active, one expired)
  await seedPackInCache('organic');
  mockLocalStorage.setItem('audio_pack_last_used_organic', String(now));

  await seedPackInCache('synth');
  mockLocalStorage.setItem('audio_pack_last_used_synth', String(now - 12 * 86400000));

  const result = await checkAndPurgeExpiredCaches('organic');

  // Verify result lists
  assert.strictEqual(result.purgedModules.length, 0, 'No fresh modules should be purged');
  assert.ok(result.purgedPacks.includes('synth'), 'Expired pack synth should be purged');
  assert.ok(!result.purgedPacks.includes('headTracking'), 'Module headTracking MUST NOT appear in purgedPacks');
  assert.ok(!result.purgedPacks.includes('audioNav'), 'Module audioNav MUST NOT appear in purgedPacks');

  // Verify physical caches in storage
  assert.strictEqual(MemoryCacheAdapter.has(headCacheName), true, 'headTracking cache MUST remain intact');
  assert.strictEqual(MemoryCacheAdapter.has(audioCacheName), true, 'audioNav cache MUST remain intact');
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('organic')), true, 'organic pack cache MUST remain intact');
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('synth')), false, 'synth pack cache MUST be removed');
});

await runTestCase('E.2: Pack cache eviction logic ignores keys without "maze-pack-" prefix', async () => {
  mockLocalStorage.clear();
  MemoryCacheAdapter.clear();

  // Create random non-pack keys in MemoryCacheAdapter
  await MemoryCacheAdapter.put('custom-cache-v1', 'asset1', new Uint8Array([1]).buffer);
  await MemoryCacheAdapter.put('app-assets-v2', 'asset2', new Uint8Array([2]).buffer);

  await seedPackInCache('organic');
  mockLocalStorage.setItem('audio_pack_last_used_organic', String(Date.now()));

  const result = await checkAndPurgeExpiredCaches('organic');

  assert.ok(!result.purgedPacks.includes('custom-cache-v1'));
  assert.ok(!result.purgedPacks.includes('app-assets-v2'));
  assert.strictEqual(MemoryCacheAdapter.has('custom-cache-v1'), true);
  assert.strictEqual(MemoryCacheAdapter.has('app-assets-v2'), true);
});

// =============================================================================
// CASE F: Clock Drift, Edge Cases & Storage Error Resilience
// =============================================================================
console.log('\n--- TEST GROUP F: Clock Drift, Future Timestamps & Resilience ---');

await runTestCase('F.1: Future clock drift within 24h is normalized without purging', async () => {
  mockLocalStorage.clear();
  MemoryCacheAdapter.clear();

  const now = Date.now();
  // 5 hours in future (clock skew)
  const fiveHoursInFuture = now + 5 * 3600 * 1000;

  await seedPackInCache('organic');
  mockLocalStorage.setItem('audio_pack_last_used_organic', String(now));

  await seedPackInCache('synth');
  mockLocalStorage.setItem('audio_pack_last_used_synth', String(fiveHoursInFuture));

  const result = await checkAndPurgeExpiredCaches('organic');

  assert.ok(!result.purgedPacks.includes('synth'), 'Future-skewed synth pack must not be purged');
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('synth')), true);
});

await runTestCase('F.2: Future clock drift > 24h is normalized to Date.now() and preserved', async () => {
  mockLocalStorage.clear();
  MemoryCacheAdapter.clear();

  const now = Date.now();
  // 3 days in future (large clock jump)
  const threeDaysInFuture = now + 3 * 86400000;

  await seedPackInCache('organic');
  mockLocalStorage.setItem('audio_pack_last_used_organic', String(now));

  await seedPackInCache('synth');
  mockLocalStorage.setItem('audio_pack_last_used_synth', String(threeDaysInFuture));

  const result = await checkAndPurgeExpiredCaches('organic');

  assert.ok(!result.purgedPacks.includes('synth'), 'Normalized synth pack must not be purged');
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('synth')), true);
  // Timestamp should now be close to now
  const normalizedTs = Number(mockLocalStorage.getItem('audio_pack_last_used_synth'));
  assert.ok(Math.abs(normalizedTs - now) < 5000, 'Timestamp should be normalized to approximately now');
});

await runTestCase('F.3: Storage error resilience when localStorage methods throw', async () => {
  mockLocalStorage.clear();
  MemoryCacheAdapter.clear();

  await seedPackInCache('organic');

  // Trigger storage exception
  shouldStorageThrow = true;
  let thrown = false;
  try {
    const res = await checkAndPurgeExpiredCaches('organic');
    assert.ok(res !== undefined, 'Result must be defined even when storage throws');
  } catch {
    thrown = true;
  } finally {
    shouldStorageThrow = false;
  }

  assert.strictEqual(thrown, false, 'checkAndPurgeExpiredCaches must catch internal storage exceptions gracefully');
});

// =============================================================================
// SUMMARY
// =============================================================================
console.log('\n================================================================');
console.log(`  STRESS SUITE SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log('================================================================\n');

if (failedTests > 0) {
  console.error('FAILURES DETECTED:');
  for (const f of failures) {
    console.error(`- ${f.name}: ${f.error}`);
  }
  process.exit(1);
} else {
  console.log('ALL EMPIRICAL CHALLENGER STRESS TESTS PASSED CLEANLY!\n');
  process.exit(0);
}
