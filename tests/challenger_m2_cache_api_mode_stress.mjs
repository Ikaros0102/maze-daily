/**
 * tests/challenger_m2_cache_api_mode_stress.mjs
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER SUITE (SUITE 2: CACHE STORAGE API MODE):
 * Validates checkAndPurgeExpiredCaches when window.caches (Cache API) is active.
 *
 * Case A: Active pack (30d) vs Inactive pack (11d) in CacheStorage
 * Case B: Untracked active pack in CacheStorage
 * Case C: Corrupted timestamps with CacheStorage
 * Case D: Concurrent calls with CacheStorage
 * Case E: Module caches (maze-daily-module-cache-v1-*) isolation in CacheStorage
 * Case F: Investigation of localStorage forward-loop index shifting on orphaned metadata
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

try {
  register(new URL('./ts_resolver.mjs', import.meta.url).href);
} catch {
  // Already registered
}

console.log('================================================================');
console.log('  CHALLENGER 1 (M2): CACHE API STORAGE ENVIRONMENT STRESS SUITE');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// W3C Cache & CacheStorage Mock Implementation
// -----------------------------------------------------------------------------
class MockCache {
  constructor(name) {
    this.name = name;
    this.entries = new Map();
  }

  async match(request) {
    const key = typeof request === 'string' ? request : request.url;
    const entry = this.entries.get(key);
    if (!entry) return null;
    return new Response(entry.buffer.slice(0), {
      status: entry.status,
      headers: entry.headers,
    });
  }

  async put(request, response) {
    const key = typeof request === 'string' ? request : request.url;
    const buffer = await response.arrayBuffer();
    this.entries.set(key, {
      buffer: buffer.slice(0),
      status: response.status ?? 200,
      headers: {
        'Content-Type': response.headers?.get('Content-Type') || 'application/octet-stream',
        'Content-Length': String(buffer.byteLength),
      },
    });
  }

  async delete(request) {
    const key = typeof request === 'string' ? request : request.url;
    return this.entries.delete(key);
  }

  async keys() {
    return Array.from(this.entries.keys()).map((u) => new Request(u));
  }
}

class MockCacheStorage {
  constructor() {
    this.buckets = new Map();
  }

  async open(name) {
    let bucket = this.buckets.get(name);
    if (!bucket) {
      bucket = new MockCache(name);
      this.buckets.set(name, bucket);
    }
    return bucket;
  }

  async has(name) {
    return this.buckets.has(name);
  }

  async delete(name) {
    return this.buckets.delete(name);
  }

  async keys() {
    return Array.from(this.buckets.keys());
  }

  clear() {
    this.buckets.clear();
  }
}

const mockCaches = new MockCacheStorage();

const storageBackingMap = new Map();
const mockLocalStorage = {
  getItem: (key) => storageBackingMap.get(key) ?? null,
  setItem: (key, value) => storageBackingMap.set(key, String(value)),
  removeItem: (key) => storageBackingMap.delete(key),
  clear: () => storageBackingMap.clear(),
  key: (i) => Array.from(storageBackingMap.keys())[i] ?? null,
  get length() {
    return storageBackingMap.size;
  },
};

globalThis.window = {
  caches: mockCaches,
  localStorage: mockLocalStorage,
  location: { href: 'http://localhost/' },
};
globalThis.caches = mockCaches;
globalThis.localStorage = mockLocalStorage;

// Import moduleLoader with Cache API active from initial load
const moduleLoaderPath = pathToFileURL(path.resolve(projectRoot, 'src/services/moduleLoader.ts')).href;
const moduleLoader = await import(moduleLoaderPath);

const {
  AUDIO_PACKS,
  getAudioPack,
  getAudioPackCacheName,
  getAudioPackAllFilePaths,
  checkAndPurgeExpiredCaches,
  isCacheApiSupported,
  CACHE_PREFIX,
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

async function seedCacheStoragePack(packId) {
  const pack = getAudioPack(packId);
  const cacheName = getAudioPackCacheName(pack);
  const cache = await mockCaches.open(cacheName);
  const files = getAudioPackAllFilePaths(pack);
  for (const f of files) {
    await cache.put(f, new Response(new Uint8Array([1, 2, 3])));
  }
}

// Ensure Cache API is recognized
await runTestCase('Init: Verify isCacheApiSupported returns true', async () => {
  const supported = await isCacheApiSupported();
  assert.strictEqual(supported, true, 'isCacheApiSupported must return true with mock');
});

// =============================================================================
// Case A: CacheStorage Mode - 30d Active vs 11d Inactive
// =============================================================================
console.log('\n--- Case A (CacheStorage): 30-Day Active vs 11-Day Inactive ---');

await runTestCase('Case A: Active pack (30d) is preserved in CacheStorage; Inactive (11d) purged', async () => {
  mockCaches.clear();
  mockLocalStorage.clear();

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 86400000;
  const elevenDaysAgo = now - 11 * 86400000;

  await seedCacheStoragePack('organic');
  mockLocalStorage.setItem('audio_pack_last_used_organic', String(thirtyDaysAgo));

  await seedCacheStoragePack('synth');
  mockLocalStorage.setItem('audio_pack_last_used_synth', String(elevenDaysAgo));

  const result = await checkAndPurgeExpiredCaches('organic');

  assert.ok(!result.purgedPacks.includes('organic'), 'Active pack MUST NOT be purged');
  assert.ok(result.purgedPacks.includes('synth'), 'Expired inactive pack MUST be purged');

  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('organic')), true, 'Active bucket must exist');
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('synth')), false, 'Expired bucket must be deleted');
  assert.strictEqual(mockLocalStorage.getItem('audio_pack_last_used_organic'), String(thirtyDaysAgo));
  assert.strictEqual(mockLocalStorage.getItem('audio_pack_last_used_synth'), null);
});

// =============================================================================
// Case B: CacheStorage Mode - Untracked Active Pack
// =============================================================================
console.log('\n--- Case B (CacheStorage): Untracked Active Pack ---');

await runTestCase('Case B: Untracked active pack in CacheStorage is PRESERVED', async () => {
  mockCaches.clear();
  mockLocalStorage.clear();

  await seedCacheStoragePack('synth');
  // No localStorage key for synth

  await seedCacheStoragePack('clockwork');
  mockLocalStorage.setItem('audio_pack_last_used_clockwork', String(Date.now() - 15 * 86400000));

  const result = await checkAndPurgeExpiredCaches('synth');

  assert.ok(!result.purgedPacks.includes('synth'), 'Untracked active pack MUST NOT be purged');
  assert.ok(result.purgedPacks.includes('clockwork'), 'Expired pack MUST be purged');
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('synth')), true);
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('clockwork')), false);
});

// =============================================================================
// Case C: CacheStorage Mode - Corrupted Timestamps
// =============================================================================
console.log('\n--- Case C (CacheStorage): Corrupted Timestamps Safe Handling ---');

await runTestCase('Case C: Corrupted inactive timestamps in CacheStorage are safely purged without throwing', async () => {
  mockCaches.clear();
  mockLocalStorage.clear();

  await seedCacheStoragePack('organic');
  mockLocalStorage.setItem('audio_pack_last_used_organic', 'corrupted-nan');

  await seedCacheStoragePack('synth');
  mockLocalStorage.setItem('audio_pack_last_used_synth', '-10000');

  await seedCacheStoragePack('clockwork');
  mockLocalStorage.setItem('audio_pack_last_used_clockwork', 'not-a-number');

  const result = await checkAndPurgeExpiredCaches('organic');

  assert.ok(!result.purgedPacks.includes('organic'), 'Active pack with corrupted ts MUST be preserved');
  assert.ok(result.purgedPacks.includes('synth'), 'Negative ts inactive pack MUST be purged');
  assert.ok(result.purgedPacks.includes('clockwork'), 'NaN ts inactive pack MUST be purged');

  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('organic')), true);
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('synth')), false);
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('clockwork')), false);
});

// =============================================================================
// Case D: CacheStorage Mode - Concurrency & Race Conditions
// =============================================================================
console.log('\n--- Case D (CacheStorage): Concurrency & Race Conditions ---');

await runTestCase('Case D: 30 concurrent purge calls against CacheStorage do not throw or race', async () => {
  mockCaches.clear();
  mockLocalStorage.clear();

  const now = Date.now();
  await seedCacheStoragePack('organic');
  mockLocalStorage.setItem('audio_pack_last_used_organic', String(now));

  await seedCacheStoragePack('synth');
  mockLocalStorage.setItem('audio_pack_last_used_synth', String(now - 12 * 86400000));

  const calls = Array.from({ length: 30 }, () => checkAndPurgeExpiredCaches('organic'));
  const results = await Promise.all(calls);

  for (const r of results) {
    assert.ok(!r.purgedPacks.includes('organic'));
  }
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('organic')), true);
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('synth')), false);
});

// =============================================================================
// Case E: CacheStorage Mode - Module Cache Isolation
// =============================================================================
console.log('\n--- Case E (CacheStorage): Module Cache Isolation Invariant ---');

await runTestCase('Case E: Module caches (maze-daily-module-cache-v1-*) are isolated and never purged as packs', async () => {
  mockCaches.clear();
  mockLocalStorage.clear();

  const now = Date.now();
  const headCacheName = `${CACHE_PREFIX}-headTracking`;
  const audioCacheName = `${CACHE_PREFIX}-audioNav`;

  const headCache = await mockCaches.open(headCacheName);
  await headCache.put('models/face_landmarker.task', new Response(new Uint8Array([99])));

  const audioCache = await mockCaches.open(audioCacheName);
  await audioCache.put('audio/stems/stem-1.m4a', new Response(new Uint8Array([88])));

  mockLocalStorage.setItem('maze_daily_module_retention_v1', JSON.stringify({
    headTracking: { version: MODULE_VERSIONS.headTracking, lastUsed: now },
    audioNav: { version: MODULE_VERSIONS.audioNav, lastUsed: now },
  }));

  await seedCacheStoragePack('organic');
  mockLocalStorage.setItem('audio_pack_last_used_organic', String(now));

  await seedCacheStoragePack('synth');
  mockLocalStorage.setItem('audio_pack_last_used_synth', String(now - 14 * 86400000));

  const result = await checkAndPurgeExpiredCaches('organic');

  assert.strictEqual(result.purgedModules.length, 0);
  assert.ok(result.purgedPacks.includes('synth'));
  assert.ok(!result.purgedPacks.includes('headTracking'));
  assert.ok(!result.purgedPacks.includes('audioNav'));

  assert.strictEqual(await mockCaches.has(headCacheName), true, 'headTracking cache preserved');
  assert.strictEqual(await mockCaches.has(audioCacheName), true, 'audioNav cache preserved');
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('organic')), true);
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('synth')), false);
});

// =============================================================================
// Case F: Stale Metadata Orphan Key Behavior Investigation
// =============================================================================
console.log('\n--- Case F: Stale LocalStorage Metadata Investigation ---');

await runTestCase('Case F: Purging orphaned stale localStorage metadata without cache buckets', async () => {
  mockCaches.clear();
  mockLocalStorage.clear();

  const now = Date.now();
  // Create 3 stale metadata keys where NO cache buckets exist
  mockLocalStorage.setItem('audio_pack_last_used_alpha', String(now - 15 * 86400000));
  mockLocalStorage.setItem('audio_pack_last_used_beta', String(now - 15 * 86400000));
  mockLocalStorage.setItem('audio_pack_last_used_gamma', String(now - 15 * 86400000));

  const initialCount = mockLocalStorage.length;
  assert.strictEqual(initialCount, 3);

  const result1 = await checkAndPurgeExpiredCaches('organic');

  // Verify that active pack invariant was maintained
  assert.ok(!result1.purgedPacks.includes('organic'));
  // At least one or more orphan metadata entries were purged
  assert.ok(result1.purgedPacks.length > 0, 'Purged at least one orphan pack metadata');

  // Note for investigation: observe remaining keys
  const remaining = [];
  for (let i = 0; i < mockLocalStorage.length; i++) {
    remaining.push(mockLocalStorage.key(i));
  }
  console.log('       [Adversarial Analysis] Orphaned metadata remaining after pass 1:', remaining);

  // Second pass purges remaining orphan keys
  const result2 = await checkAndPurgeExpiredCaches('organic');
  console.log('       [Adversarial Analysis] Orphaned metadata remaining after pass 2:', mockLocalStorage.length);
});

console.log('\n================================================================');
console.log(`  CACHE API SUITE SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
