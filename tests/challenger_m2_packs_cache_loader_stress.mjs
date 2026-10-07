/**
 * tests/challenger_m2_packs_cache_loader_stress.mjs
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER SUITE (MILESTONE 2):
 * Audio Pack Caching, Validation Integrity, Concurrent Deduplication & Atomic Commit.
 *
 * Targeted Challenges:
 * 1. Partial Cache Corruption:
 *    - 3 of 4 stems present in cache -> isAudioPackCachedAndValid MUST return false.
 *    - 1 stem has 0 bytes (empty buffer or Content-Length: 0) -> isAudioPackCachedAndValid MUST return false.
 *    - Missing final.mp3 in classic pack -> isAudioPackCachedAndValid MUST return false.
 *    - Nonexistent or invalid pack IDs -> returns false.
 * 2. Concurrent Downloads & In-Flight Deduplication:
 *    - 10 parallel calls to loadAudioPackWithProgress('organic') simultaneously.
 *    - Exactly 1 network fetch cycle triggered (4 stem fetches, NOT 40).
 *    - All 10 callers resolve to true.
 *    - All 10 callers receive strictly monotonic progress updates reaching 100%.
 *    - Late-joining staggered callers receive synchronized progress and resolve true.
 *    - Multi-pack parallel downloads (5 for organic, 5 for synth) trigger exactly 4 fetches each.
 * 3. Abort / Network Failure Mid-Stream (Zero Dirty Cache Guarantee):
 *    - Network drop during stem-3 fetch rejects loadAudioPackWithProgress.
 *    - Cache is NOT left in a state that passes validation (isAudioPackCachedAndValid returns false).
 *    - AbortSignal triggered during stem-3 rejects with AbortError and leaves clean cache.
 *    - Corrupted 0-byte response from network rejects and does not corrupt cache.
 *    - Recovery: subsequent clean retry succeeds completely.
 * 4. Memory Safety & Detachment Defense:
 *    - Buffer detachment immunity: mutating returned ArrayBuffer does not mutate cached copy.
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

// ============================================================================
// Environment Mock Setup
// ============================================================================

class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.get(key) ?? null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
  key(index) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  get length() {
    return this.store.size;
  }
}

class MockCache {
  constructor(name) {
    this.name = name;
    this.entries = new Map();
  }
  async match(request) {
    const key = typeof request === 'string' ? request : request.url;
    const item = this.entries.get(key);
    if (!item) return null;
    return new Response(item.buffer.slice(0), {
      status: item.status,
      headers: item.headers,
    });
  }
  async put(request, response) {
    const key = typeof request === 'string' ? request : request.url;
    const buffer = await response.arrayBuffer();
    const headers = {};
    if (response.headers && typeof response.headers.forEach === 'function') {
      response.headers.forEach((v, k) => {
        headers[k] = v;
      });
    } else {
      headers['content-type'] = 'application/octet-stream';
      headers['content-length'] = String(buffer.byteLength);
    }
    this.entries.set(key, {
      buffer: buffer.slice(0),
      status: response.status || 200,
      headers,
    });
  }
  async delete(request) {
    const key = typeof request === 'string' ? request : request.url;
    return this.entries.delete(key);
  }
  async keys() {
    return Array.from(this.entries.keys()).map((k) => new Request(k));
  }
}

class MockCacheStorage {
  constructor() {
    this.caches = new Map();
  }
  async open(name) {
    if (!this.caches.has(name)) {
      this.caches.set(name, new MockCache(name));
    }
    return this.caches.get(name);
  }
  async has(name) {
    return this.caches.has(name);
  }
  async delete(name) {
    return this.caches.delete(name);
  }
  async keys() {
    return Array.from(this.caches.keys());
  }
  clear() {
    this.caches.clear();
  }
}

const mockLocalStorage = new MockLocalStorage();
const mockCaches = new MockCacheStorage();

globalThis.window = {
  localStorage: mockLocalStorage,
  caches: mockCaches,
  location: { href: 'http://localhost/' },
};
globalThis.localStorage = mockLocalStorage;
globalThis.caches = mockCaches;

// -----------------------------------------------------------------------------
// Configurable Mock Network Fetch Engine
// -----------------------------------------------------------------------------
let fetchNetworkHook = null;
const globalFetchCounts = new Map();

globalThis.fetch = async function interceptedFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url;
  const count = (globalFetchCounts.get(url) || 0) + 1;
  globalFetchCounts.set(url, count);

  if (fetchNetworkHook) {
    const hooked = await fetchNetworkHook(url, init, count);
    if (hooked !== undefined) {
      return hooked;
    }
  }

  // Default simulated response: 1000 bytes with 2 chunks
  const chunkSize = 500;
  const chunk1 = new Uint8Array(chunkSize).fill(0xaa);
  const chunk2 = new Uint8Array(chunkSize).fill(0xbb);

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(chunk1);
      controller.enqueue(chunk2);
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mp4',
      'Content-Length': '1000',
    },
  });
};

// ============================================================================
// Import Tested Modules
// ============================================================================

const audioPacks = await import(
  pathToFileURL(path.resolve(projectRoot, 'src/config/audioPacks.ts')).href
);
const moduleLoader = await import(
  pathToFileURL(path.resolve(projectRoot, 'src/services/moduleLoader.ts')).href
);

const {
  AUDIO_PACKS,
  AUDIO_PACK_IDS,
  getAudioPack,
  isValidAudioPackId,
  getAudioPackAllFilePaths,
  getAudioPackCacheName,
} = audioPacks;

const {
  isAudioPackCachedAndValid,
  loadAudioPackWithProgress,
  getCachedAudioPackAssetBuffer,
  touchAudioPackUsage,
  getAudioPackLastUsed,
  removeAudioPackUsage,
  purgeAudioPackCache,
  extractPackIdFromCacheName,
  checkAndPurgeExpiredCaches,
  MemoryCacheAdapter,
} = moduleLoader;

// ============================================================================
// Test Reporter
// ============================================================================

console.log('================================================================');
console.log('  CHALLENGER 2 (M2): EMPIRICAL ADVERSARIAL STRESS TEST SUITE   ');
console.log('  Target: isAudioPackCachedAndValid & loadAudioPackWithProgress ');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function test(name, fn) {
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

function resetEnvironment() {
  mockLocalStorage.clear();
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  globalFetchCounts.clear();
  fetchNetworkHook = null;
}

// ============================================================================
// SUITE 1: Partial Cache Corruption & Validation Invariant
// ============================================================================
console.log('--- SUITE 1: Partial Cache Corruption & Validation Integrity ---');

await test('1.1 Non-existent cache bucket returns false', async () => {
  resetEnvironment();
  const valid = await isAudioPackCachedAndValid('organic');
  assert.strictEqual(valid, false, 'Non-existent cache bucket must return false');
});

await test('1.2 Empty cache bucket (bucket exists, 0 entries) returns false', async () => {
  resetEnvironment();
  const cacheName = getAudioPackCacheName('organic');
  await mockCaches.open(cacheName); // Bucket exists but has no entries
  const valid = await isAudioPackCachedAndValid('organic');
  assert.strictEqual(valid, false, 'Empty cache bucket must return false');
});

await test('1.3 Partial cache: 1 of 4 stems present returns false', async () => {
  resetEnvironment();
  const cacheName = getAudioPackCacheName('organic');
  const cache = await mockCaches.open(cacheName);
  await cache.put(
    'audio/packs/organic/stem-1.m4a',
    new Response(new Uint8Array([1, 2, 3]).buffer, {
      headers: { 'Content-Type': 'audio/mp4', 'Content-Length': '3' },
    })
  );
  const valid = await isAudioPackCachedAndValid('organic');
  assert.strictEqual(valid, false, '1 of 4 stems must return false');
});

await test('1.4 Partial cache: 2 of 4 stems present returns false', async () => {
  resetEnvironment();
  const cacheName = getAudioPackCacheName('organic');
  const cache = await mockCaches.open(cacheName);
  for (const f of ['audio/packs/organic/stem-1.m4a', 'audio/packs/organic/stem-2.m4a']) {
    await cache.put(
      f,
      new Response(new Uint8Array([1, 2, 3]).buffer, {
        headers: { 'Content-Type': 'audio/mp4', 'Content-Length': '3' },
      })
    );
  }
  const valid = await isAudioPackCachedAndValid('organic');
  assert.strictEqual(valid, false, '2 of 4 stems must return false');
});

await test('1.5 Partial cache: 3 of 4 stems present (missing stem-4) returns false', async () => {
  resetEnvironment();
  const cacheName = getAudioPackCacheName('organic');
  const cache = await mockCaches.open(cacheName);
  // Put stems 1, 2, 3 (omit stem-4)
  for (const f of [
    'audio/packs/organic/stem-1.m4a',
    'audio/packs/organic/stem-2.m4a',
    'audio/packs/organic/stem-3.m4a',
  ]) {
    await cache.put(
      f,
      new Response(new Uint8Array([1, 2, 3]).buffer, {
        headers: { 'Content-Type': 'audio/mp4', 'Content-Length': '3' },
      })
    );
  }
  const valid = await isAudioPackCachedAndValid('organic');
  assert.strictEqual(valid, false, '3 of 4 stems (missing stem-4) must return false');
});

await test('1.6 Partial cache: 3 of 4 stems present (missing stem-1) returns false', async () => {
  resetEnvironment();
  const cacheName = getAudioPackCacheName('organic');
  const cache = await mockCaches.open(cacheName);
  // Put stems 2, 3, 4 (omit stem-1)
  for (const f of [
    'audio/packs/organic/stem-2.m4a',
    'audio/packs/organic/stem-3.m4a',
    'audio/packs/organic/stem-4.m4a',
  ]) {
    await cache.put(
      f,
      new Response(new Uint8Array([1, 2, 3]).buffer, {
        headers: { 'Content-Type': 'audio/mp4', 'Content-Length': '3' },
      })
    );
  }
  const valid = await isAudioPackCachedAndValid('organic');
  assert.strictEqual(valid, false, '3 of 4 stems (missing stem-1) must return false');
});

await test('1.7 Partial cache: 3 of 4 stems present (missing stem-3) returns false', async () => {
  resetEnvironment();
  const cacheName = getAudioPackCacheName('organic');
  const cache = await mockCaches.open(cacheName);
  // Put stems 1, 2, 4 (omit stem-3)
  for (const f of [
    'audio/packs/organic/stem-1.m4a',
    'audio/packs/organic/stem-2.m4a',
    'audio/packs/organic/stem-4.m4a',
  ]) {
    await cache.put(
      f,
      new Response(new Uint8Array([1, 2, 3]).buffer, {
        headers: { 'Content-Type': 'audio/mp4', 'Content-Length': '3' },
      })
    );
  }
  const valid = await isAudioPackCachedAndValid('organic');
  assert.strictEqual(valid, false, '3 of 4 stems (missing stem-3) must return false');
});

await test('1.8 Partial cache: classic pack with stems 1-4 but missing final.mp3 returns false', async () => {
  resetEnvironment();
  const cacheName = getAudioPackCacheName('classic');
  const cache = await mockCaches.open(cacheName);
  for (const f of [
    'audio/stems/stem-1.m4a',
    'audio/stems/stem-2.m4a',
    'audio/stems/stem-3.m4a',
    'audio/stems/stem-4.m4a',
  ]) {
    await cache.put(
      f,
      new Response(new Uint8Array([1, 2, 3]).buffer, {
        headers: { 'Content-Type': 'audio/mp4', 'Content-Length': '3' },
      })
    );
  }
  const valid = await isAudioPackCachedAndValid('classic');
  assert.strictEqual(valid, false, 'Classic pack missing final.mp3 must return false');
});

await test('1.9 Zero-byte stem: 1 stem has 0 bytes (empty buffer) returns false', async () => {
  resetEnvironment();
  const cacheName = getAudioPackCacheName('organic');
  const cache = await mockCaches.open(cacheName);
  // stem-1, stem-2, stem-4 are valid; stem-3 has 0 bytes!
  const files = getAudioPackAllFilePaths('organic');
  for (const f of files) {
    const isCorrupt = f.includes('stem-3');
    const bytes = isCorrupt ? new Uint8Array([]) : new Uint8Array([1, 2, 3]);
    await cache.put(
      f,
      new Response(bytes.buffer, {
        headers: { 'Content-Type': 'audio/mp4', 'Content-Length': String(bytes.byteLength) },
      })
    );
  }
  const valid = await isAudioPackCachedAndValid('organic');
  assert.strictEqual(valid, false, '1 stem having 0 bytes must return false');
});

await test('1.10 Zero-byte stem: 1 stem has Content-Length: 0 header returns false', async () => {
  resetEnvironment();
  const cacheName = getAudioPackCacheName('organic');
  const cache = await mockCaches.open(cacheName);
  const files = getAudioPackAllFilePaths('organic');
  for (const f of files) {
    const isCorrupt = f.includes('stem-4');
    await cache.put(
      f,
      new Response(new Uint8Array(isCorrupt ? 0 : 5).buffer, {
        headers: { 'Content-Type': 'audio/mp4', 'Content-Length': isCorrupt ? '0' : '5' },
      })
    );
  }
  const valid = await isAudioPackCachedAndValid('organic');
  assert.strictEqual(valid, false, 'Stem with Content-Length: 0 must return false');
});

await test('1.11 Zero-byte stem in final.mp3 of classic pack returns false', async () => {
  resetEnvironment();
  const cacheName = getAudioPackCacheName('classic');
  const cache = await mockCaches.open(cacheName);
  const files = getAudioPackAllFilePaths('classic');
  for (const f of files) {
    const isFinal = f.includes('final.mp3');
    const bytes = isFinal ? new Uint8Array([]) : new Uint8Array([1, 2, 3]);
    await cache.put(
      f,
      new Response(bytes.buffer, {
        headers: { 'Content-Type': 'audio/mp4', 'Content-Length': String(bytes.byteLength) },
      })
    );
  }
  const valid = await isAudioPackCachedAndValid('classic');
  assert.strictEqual(valid, false, 'Zero-byte final.mp3 in classic pack must return false');
});

await test('1.12 Complete and intact pack returns true', async () => {
  resetEnvironment();
  const cacheName = getAudioPackCacheName('organic');
  const cache = await mockCaches.open(cacheName);
  const files = getAudioPackAllFilePaths('organic');
  for (const f of files) {
    await cache.put(
      f,
      new Response(new Uint8Array([10, 20, 30]).buffer, {
        headers: { 'Content-Type': 'audio/mp4', 'Content-Length': '3' },
      })
    );
  }
  const valid = await isAudioPackCachedAndValid('organic');
  assert.strictEqual(valid, true, 'Fully intact pack must return true');
});

await test('1.13 Boundary pack IDs return false', async () => {
  resetEnvironment();
  assert.strictEqual(await isAudioPackCachedAndValid(''), false);
  assert.strictEqual(await isAudioPackCachedAndValid('unknown_pack'), false);
  assert.strictEqual(await isAudioPackCachedAndValid('__proto__'), false);
  assert.strictEqual(await isAudioPackCachedAndValid(null), false);
  assert.strictEqual(await isAudioPackCachedAndValid(undefined), false);
  assert.strictEqual(await isAudioPackCachedAndValid(12345), false);
});

await test('1.14 MemoryCacheAdapter fallback validates partial corruption identically', async () => {
  resetEnvironment();
  // Clear mockCaches completely to force or test MemoryCacheAdapter
  MemoryCacheAdapter.clear();
  const cacheName = getAudioPackCacheName('synth');
  // Put 3 of 4 stems directly into MemoryCacheAdapter
  await MemoryCacheAdapter.put(cacheName, 'audio/packs/synth/stem-1.m4a', new Uint8Array([1]).buffer);
  await MemoryCacheAdapter.put(cacheName, 'audio/packs/synth/stem-2.m4a', new Uint8Array([2]).buffer);
  await MemoryCacheAdapter.put(cacheName, 'audio/packs/synth/stem-3.m4a', new Uint8Array([3]).buffer);

  // Still missing stem-4
  const valid3 = await isAudioPackCachedAndValid('synth');
  assert.strictEqual(valid3, false, 'MemoryCacheAdapter with 3 stems must return false');

  // Add stem-4 with 0 bytes
  await MemoryCacheAdapter.put(cacheName, 'audio/packs/synth/stem-4.m4a', new Uint8Array([]).buffer);
  const valid0 = await isAudioPackCachedAndValid('synth');
  assert.strictEqual(valid0, false, 'MemoryCacheAdapter with 0-byte stem must return false');

  // Replace stem-4 with valid bytes
  await MemoryCacheAdapter.put(cacheName, 'audio/packs/synth/stem-4.m4a', new Uint8Array([4]).buffer);
  const validAll = await isAudioPackCachedAndValid('synth');
  assert.strictEqual(validAll, true, 'MemoryCacheAdapter with 4 valid stems must return true');
});

// ============================================================================
// SUITE 2: Concurrent Downloads & Request Deduplication
// ============================================================================
console.log('\n--- SUITE 2: Concurrent Downloads & Request Deduplication ---');

await test('2.1 10 simultaneous calls to loadAudioPackWithProgress only trigger 1 fetch cycle & all resolve true', async () => {
  resetEnvironment();

  const organicFiles = getAudioPackAllFilePaths('organic');
  const fetchCountsPerFile = new Map();
  organicFiles.forEach((f) => fetchCountsPerFile.set(f, 0));

  // Hook network fetch to simulate chunked latency and track exact file requests
  fetchNetworkHook = async (url) => {
    for (const f of organicFiles) {
      if (url.includes(f)) {
        fetchCountsPerFile.set(f, (fetchCountsPerFile.get(f) || 0) + 1);
        break;
      }
    }

    // Simulate 3 asynchronous chunks with a tiny delay
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(new Uint8Array(200).fill(1));
        await new Promise((r) => setTimeout(r, 5));
        controller.enqueue(new Uint8Array(300).fill(2));
        await new Promise((r) => setTimeout(r, 5));
        controller.enqueue(new Uint8Array(500).fill(3));
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mp4',
        'Content-Length': '1000',
      },
    });
  };

  // Launch 10 parallel callers simultaneously
  const NUM_CALLERS = 10;
  const progressLogs = Array.from({ length: NUM_CALLERS }, () => []);
  const promises = [];

  for (let i = 0; i < NUM_CALLERS; i++) {
    const callerIndex = i;
    const p = loadAudioPackWithProgress('organic', (pct, loaded, total) => {
      progressLogs[callerIndex].push({ pct, loaded, total });
    });
    promises.push(p);
  }

  const results = await Promise.all(promises);

  // Assertion 1: All 10 callers resolved to true
  assert.strictEqual(results.length, NUM_CALLERS);
  results.forEach((res, idx) => {
    assert.strictEqual(res, true, `Caller #${idx} must resolve to true`);
  });

  // Assertion 2: Exactly 1 network fetch cycle triggered (1 fetch per stem, total 4)
  for (const [file, count] of fetchCountsPerFile.entries()) {
    assert.strictEqual(
      count,
      1,
      `File ${file} should have been fetched exactly 1 time across all 10 callers, but was fetched ${count} times`
    );
  }

  // Assertion 3: Every caller received progress updates with strictly monotonic pct reaching 100%
  for (let i = 0; i < NUM_CALLERS; i++) {
    const log = progressLogs[i];
    assert.ok(log.length > 0, `Caller #${i} must have received at least 1 progress update`);

    // Verify monotonicity
    for (let j = 1; j < log.length; j++) {
      assert.ok(
        log[j].pct >= log[j - 1].pct,
        `Caller #${i} received non-monotonic progress: ${log[j - 1].pct} -> ${log[j].pct}`
      );
    }

    // Verify terminal 100%
    const last = log[log.length - 1];
    assert.strictEqual(last.pct, 100, `Caller #${i} must reach 100% progress at completion`);
  }

  // Assertion 4: Pack is now cached and valid
  const cachedValid = await isAudioPackCachedAndValid('organic');
  assert.strictEqual(cachedValid, true, 'Pack must be valid and cached after completion');

  // Assertion 5: Usage timestamp was recorded
  const lastUsed = getAudioPackLastUsed('organic');
  assert.ok(typeof lastUsed === 'number' && lastUsed > 0, 'Usage timestamp must be set');
});

await test('2.2 Staggered joining callers attach to active in-flight download & receive catchup', async () => {
  resetEnvironment();

  const organicFiles = getAudioPackAllFilePaths('organic');
  let currentStemIndex = 0;

  fetchNetworkHook = async (url) => {
    currentStemIndex++;
    await new Promise((r) => setTimeout(r, 15)); // 15ms per stem
    return new Response(new Uint8Array(1000).fill(currentStemIndex).buffer, {
      status: 200,
      headers: { 'Content-Type': 'audio/mp4', 'Content-Length': '1000' },
    });
  };

  const caller1Updates = [];
  const caller2Updates = [];
  const caller3Updates = [];

  // Caller 1 starts immediately
  const p1 = loadAudioPackWithProgress('organic', (pct) => caller1Updates.push(pct));

  // Caller 2 joins after 10ms (while stem 1/2 in flight)
  await new Promise((r) => setTimeout(r, 10));
  const p2 = loadAudioPackWithProgress('organic', (pct) => caller2Updates.push(pct));

  // Caller 3 joins after 25ms (while stem 2/3 in flight)
  await new Promise((r) => setTimeout(r, 15));
  const p3 = loadAudioPackWithProgress('organic', (pct) => caller3Updates.push(pct));

  const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

  assert.strictEqual(r1, true);
  assert.strictEqual(r2, true);
  assert.strictEqual(r3, true);

  // Late callers should have received catch-up progress and reached 100%
  assert.ok(caller2Updates.length > 0);
  assert.strictEqual(caller2Updates[caller2Updates.length - 1], 100);
  assert.ok(caller3Updates.length > 0);
  assert.strictEqual(caller3Updates[caller3Updates.length - 1], 100);
});

await test('2.3 Post-completion cache hit short-circuits with 0 new network fetches', async () => {
  // Directly follows 2.2 where 'organic' is already cached
  globalFetchCounts.clear();

  let receivedProgress = null;
  const result = await loadAudioPackWithProgress('organic', (pct) => {
    receivedProgress = pct;
  });

  assert.strictEqual(result, true);
  assert.strictEqual(receivedProgress, 100, 'Cache hit should fire 100% progress');
  assert.strictEqual(globalFetchCounts.size, 0, 'Cache hit must make zero network requests');
});

await test('2.4 Multi-pack parallel downloads (5 organic, 5 synth) isolate in-flight requests', async () => {
  resetEnvironment();

  const organicFetches = [];
  const synthFetches = [];

  fetchNetworkHook = async (url) => {
    if (url.includes('organic')) {
      organicFetches.push(url);
    } else if (url.includes('synth')) {
      synthFetches.push(url);
    }
    await new Promise((r) => setTimeout(r, 5));
    return new Response(new Uint8Array(500).buffer, {
      status: 200,
      headers: { 'Content-Type': 'audio/mp4', 'Content-Length': '500' },
    });
  };

  const callers = [];
  for (let i = 0; i < 5; i++) {
    callers.push(loadAudioPackWithProgress('organic'));
    callers.push(loadAudioPackWithProgress('synth'));
  }

  const results = await Promise.all(callers);
  assert.strictEqual(results.every((r) => r === true), true);

  // Exactly 4 fetches for organic, exactly 4 fetches for synth
  assert.strictEqual(organicFetches.length, 4, 'Organic should have exactly 4 stem fetches');
  assert.strictEqual(synthFetches.length, 4, 'Synth should have exactly 4 stem fetches');

  assert.strictEqual(await isAudioPackCachedAndValid('organic'), true);
  assert.strictEqual(await isAudioPackCachedAndValid('synth'), true);
});

// ============================================================================
// SUITE 3: Abort & Mid-Stream Network Failure (Zero Dirty Cache Guarantee)
// ============================================================================
console.log('\n--- SUITE 3: Abort & Mid-Stream Network Failure (Atomic Commit) ---');

await test('3.1 Simulating a network drop during stem-3 fetch does NOT leave a cache bucket passing validation', async () => {
  resetEnvironment();

  // Stem 1 and Stem 2 succeed; Stem 3 throws a simulated network connection failure
  let fetchCount = 0;
  fetchNetworkHook = async (url) => {
    fetchCount++;
    if (url.includes('stem-3')) {
      throw new Error('ETIMEDOUT: Connection reset by peer mid-stream');
    }
    return new Response(new Uint8Array(500).buffer, {
      status: 200,
      headers: { 'Content-Type': 'audio/mp4', 'Content-Length': '500' },
    });
  };

  let caughtError = null;
  try {
    await loadAudioPackWithProgress('organic');
  } catch (err) {
    caughtError = err;
  }

  assert.ok(caughtError !== null, 'Network drop must cause loadAudioPackWithProgress to reject');
  assert.ok(
    caughtError.message.includes('ETIMEDOUT'),
    `Expected ETIMEDOUT error, received: ${caughtError.message}`
  );

  // CRITICAL VERIFICATION: Does the cache pass validation?
  const isValid = await isAudioPackCachedAndValid('organic');
  assert.strictEqual(
    isValid,
    false,
    'Mid-stream network drop MUST NOT leave a cache bucket that passes validation!'
  );

  // Check that no partial stems were committed to the cache bucket
  const cacheName = getAudioPackCacheName('organic');
  const cache = await mockCaches.open(cacheName);
  const keys = await cache.keys();
  assert.strictEqual(
    keys.length,
    0,
    `Cache bucket should have 0 committed entries after aborted download, but had ${keys.length}`
  );
});

await test('3.2 Clean retry after network drop succeeds completely from scratch', async () => {
  // Continuing after 3.1: Network recovers
  fetchNetworkHook = async () => {
    return new Response(new Uint8Array(800).buffer, {
      status: 200,
      headers: { 'Content-Type': 'audio/mp4', 'Content-Length': '800' },
    });
  };

  const success = await loadAudioPackWithProgress('organic');
  assert.strictEqual(success, true, 'Retry after network recovery must resolve true');

  const isValidNow = await isAudioPackCachedAndValid('organic');
  assert.strictEqual(isValidNow, true, 'Pack must now be valid and intact');
});

await test('3.3 AbortController signal mid-stream aborts cleanly with AbortError & leaves no partial cache', async () => {
  resetEnvironment();

  const controller = new AbortController();
  let stemCount = 0;

  fetchNetworkHook = async (url, init) => {
    stemCount++;
    if (stemCount === 2) {
      // Trigger abort while fetching stem 2
      controller.abort();
    }
    // Respect signal
    if (init?.signal?.aborted) {
      throw new DOMException('Download aborted', 'AbortError');
    }
    await new Promise((r) => setTimeout(r, 10));
    return new Response(new Uint8Array(500).buffer, {
      status: 200,
      headers: { 'Content-Type': 'audio/mp4', 'Content-Length': '500' },
    });
  };

  let caughtAbort = null;
  try {
    await loadAudioPackWithProgress('synth', undefined, controller.signal);
  } catch (err) {
    caughtAbort = err;
  }

  assert.ok(caughtAbort !== null, 'AbortController must reject loadAudioPackWithProgress');
  assert.strictEqual(caughtAbort.name, 'AbortError');

  // Verify cache is NOT valid
  const isValid = await isAudioPackCachedAndValid('synth');
  assert.strictEqual(isValid, false, 'Aborted download must not leave valid cache');

  // Verify 0 entries committed
  const cacheName = getAudioPackCacheName('synth');
  const cache = await mockCaches.open(cacheName);
  const keys = await cache.keys();
  assert.strictEqual(keys.length, 0, 'No entries should be committed on client abort');
});

await test('3.4 Empty 0-byte response from server rejects and does not commit corrupt cache', async () => {
  resetEnvironment();

  fetchNetworkHook = async (url) => {
    if (url.includes('stem-2')) {
      // Empty response body
      return new Response(new Uint8Array(0).buffer, {
        status: 200,
        headers: { 'Content-Type': 'audio/mp4', 'Content-Length': '0' },
      });
    }
    return new Response(new Uint8Array(500).buffer, {
      status: 200,
      headers: { 'Content-Type': 'audio/mp4', 'Content-Length': '500' },
    });
  };

  let caught = null;
  try {
    await loadAudioPackWithProgress('clockwork');
  } catch (err) {
    caught = err;
  }

  assert.ok(caught !== null, 'Empty audio asset from server must reject');
  assert.strictEqual(await isAudioPackCachedAndValid('clockwork'), false);
});

await test('3.5 HTTP 500 error from server rejects and leaves clean cache', async () => {
  resetEnvironment();

  fetchNetworkHook = async (url) => {
    if (url.includes('stem-3')) {
      return new Response('Internal Server Error', {
        status: 500,
        statusText: 'Internal Server Error',
      });
    }
    return new Response(new Uint8Array(500).buffer, {
      status: 200,
      headers: { 'Content-Type': 'audio/mp4', 'Content-Length': '500' },
    });
  };

  let caught = null;
  try {
    await loadAudioPackWithProgress('classic');
  } catch (err) {
    caught = err;
  }

  assert.ok(caught !== null, 'HTTP 500 must reject');
  assert.strictEqual(await isAudioPackCachedAndValid('classic'), false);
});

// ============================================================================
// SUITE 4: Asset Retrieval & Buffer Detachment Defense
// ============================================================================
console.log('\n--- SUITE 4: Asset Retrieval & Buffer Detachment Defense ---');

await test('4.1 getCachedAudioPackAssetBuffer returns byte copy immune to caller mutation/detachment', async () => {
  resetEnvironment();

  // Populate cache with pristine audio asset
  const cacheName = getAudioPackCacheName('organic');
  const cache = await mockCaches.open(cacheName);
  const originalBytes = new Uint8Array([42, 43, 44, 45, 46]);
  await cache.put(
    'audio/packs/organic/stem-1.m4a',
    new Response(originalBytes.buffer, {
      headers: { 'Content-Type': 'audio/mp4', 'Content-Length': '5' },
    })
  );

  // Retrieve buffer 1
  const buf1 = await getCachedAudioPackAssetBuffer('organic', 'audio/packs/organic/stem-1.m4a');
  assert.strictEqual(buf1.byteLength, 5);
  assert.deepStrictEqual([...new Uint8Array(buf1)], [42, 43, 44, 45, 46]);

  // Mutate buffer 1 as if decodeAudioData detached or mutated it
  new Uint8Array(buf1).fill(0);

  // Retrieve buffer 2: must still be pristine!
  const buf2 = await getCachedAudioPackAssetBuffer('organic', 'audio/packs/organic/stem-1.m4a');
  assert.deepStrictEqual(
    [...new Uint8Array(buf2)],
    [42, 43, 44, 45, 46],
    'Underlying cached asset must remain pristine even if caller mutated returned buffer'
  );
});

await test('4.2 getCachedAudioPackAssetBuffer resolves bare filename or relative path', async () => {
  resetEnvironment();

  const cacheName = getAudioPackCacheName('organic');
  const cache = await mockCaches.open(cacheName);
  await cache.put(
    'audio/packs/organic/stem-2.m4a',
    new Response(new Uint8Array([11, 22, 33]).buffer, {
      headers: { 'Content-Type': 'audio/mp4', 'Content-Length': '3' },
    })
  );

  // Query with bare filename "stem-2.m4a"
  const buf = await getCachedAudioPackAssetBuffer('organic', 'stem-2.m4a');
  assert.deepStrictEqual([...new Uint8Array(buf)], [11, 22, 33]);
});

await test('4.3 getCachedAudioPackAssetBuffer throws on invalid pack ID', async () => {
  resetEnvironment();
  await assert.rejects(
    async () => {
      await getCachedAudioPackAssetBuffer('bad_id', 'stem-1.m4a');
    },
    /Invalid audio pack ID/
  );
});

// ============================================================================
// FINAL SUMMARY
// ============================================================================

console.log('\n================================================================');
console.log(`  EMPIRICAL CHALLENGER RUN SUMMARY`);
console.log(`  Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('================================================================');

if (failedTests > 0) {
  console.error(`\nFAILED TESTS (${failedTests}):`);
  for (const f of failures) {
    console.error(`- ${f.name}: ${f.error}`);
  }
  process.exit(1);
} else {
  console.log('\nAll Empirical Challenger Stress Tests PASSED with 100% SUCCESS!');
  process.exit(0);
}
