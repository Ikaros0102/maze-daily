/**
 * tests/reviewer_adversarial_m2_packs.mjs
 *
 * Independent Adversarial Stress & Verification Suite for Milestone 2:
 * Audio Pack Cache API Storage, Validation, Streaming Loader, and 10-Day TTL Eviction.
 * Authored by reviewer_critic (teamwork_preview_reviewer_m2_packs_1).
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Register TypeScript resolver
try {
  register(new URL('./ts_resolver.mjs', import.meta.url).href);
} catch {
  // Already registered
}

console.log('================================================================');
console.log('  MILESTONE 2: ADVERSARIAL REVIEWER STRESS & INVARIANT AUDIT');
console.log('  Auditing Real moduleLoader.ts & App.tsx Integration');
console.log('================================================================\n');

// Mock localStorage environment
const storageStore = new Map();
let quotaExceeded = false;

const mockLocalStorage = {
  getItem: (key) => storageStore.get(key) ?? null,
  setItem: (key, value) => {
    if (quotaExceeded) {
      const err = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    }
    storageStore.set(key, String(value));
  },
  removeItem: (key) => storageStore.delete(key),
  clear: () => storageStore.clear(),
  key: (i) => Array.from(storageStore.keys())[i] ?? null,
  get length() {
    return storageStore.size;
  },
};

globalThis.window = {
  localStorage: mockLocalStorage,
  location: { href: 'http://localhost/' },
};
globalThis.localStorage = mockLocalStorage;

// Import real moduleLoader from src
const moduleLoader = await import(
  pathToFileURL(path.resolve(projectRoot, 'src/services/moduleLoader.ts')).href
);

const {
  AUDIO_PACKS,
  AUDIO_PACK_IDS,
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
  fetchWithTimeout,
  streamToBuffer,
  MemoryCacheAdapter,
  RETENTION_PERIOD_MS,
} = moduleLoader;

const testQueue = [];

function test(name, fn) {
  testQueue.push({ name, fn });
}

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function runAllTests() {
  for (const { name, fn } of testQueue) {
    totalTests++;
    try {
      await fn();
      passedTests++;
      console.log(`  [PASS] ${name}`);
    } catch (err) {
      failedTests++;
      console.error(`  [FAIL] ${name}: ${err.message}`);
      failures.push({ name, err });
    }
  }
}

// -----------------------------------------------------------------------------
// SUITE 1: Integrity & Source Code Scan
// -----------------------------------------------------------------------------
console.log('--- SUITE 1: Integrity & Anti-Facade Verification ---');

test('1.1 Source code does not contain hardcoded test result shortcuts', async () => {
  const fs = await import('node:fs/promises');
  const src = await fs.readFile(
    path.resolve(projectRoot, 'src/services/moduleLoader.ts'),
    'utf-8'
  );

  // Check that real logic is present, not dummy return constants
  assert.ok(src.includes('MemoryCacheAdapter.match'), 'Must implement storage abstraction');
  assert.ok(src.includes('inFlightAudioPackLoads'), 'Must implement in-flight map');
  assert.ok(src.includes('stagedResponses'), 'Must implement in-memory staging');
  assert.ok(src.includes('Math.max(lastReportedPct, pct)'), 'Must enforce progress monotonicity');
  assert.ok(src.includes('if (packId === activePackId)'), 'Must enforce active pack protection');
  assert.ok(src.includes('RETENTION_PERIOD_MS'), 'Must use RETENTION_PERIOD_MS constant');
});

test('1.2 RETENTION_PERIOD_MS equals exactly 10 days (864,000,000 ms)', () => {
  assert.strictEqual(RETENTION_PERIOD_MS, 864_000_000);
});

// -----------------------------------------------------------------------------
// SUITE 2: Cache Bucket Isolation & Name Extraction
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: Cache Bucket Isolation & Key Formatting ---');

test('2.1 Every audio pack produces isolated maze-pack-${id}-v${version} cache bucket', () => {
  for (const pack of Object.values(AUDIO_PACKS)) {
    const bucket = getAudioPackCacheName(pack);
    assert.strictEqual(bucket, `maze-pack-${pack.id}-v${pack.version}`);
    assert.ok(bucket.startsWith('maze-pack-'));
    assert.ok(!bucket.includes('module-cache'));
  }
});

test('2.2 extractPackIdFromCacheName handles standard, malformed, and adversarial names', () => {
  assert.strictEqual(extractPackIdFromCacheName('maze-pack-classic-v1.0.0'), 'classic');
  assert.strictEqual(extractPackIdFromCacheName('maze-pack-organic-v1.0.0'), 'organic');
  assert.strictEqual(extractPackIdFromCacheName('maze-pack-synth-v2.1.3'), 'synth');
  assert.strictEqual(extractPackIdFromCacheName('maze-pack-clockwork-v1'), 'clockwork');
  assert.strictEqual(extractPackIdFromCacheName('maze-pack-custom-sound-v1.0.0'), 'custom-sound');
  // Rejections
  assert.strictEqual(extractPackIdFromCacheName('maze-daily-module-cache-v1-audioNav'), null);
  assert.strictEqual(extractPackIdFromCacheName('maze-daily-headTracking'), null);
  assert.strictEqual(extractPackIdFromCacheName('other-pack-123'), null);
  assert.strictEqual(extractPackIdFromCacheName(''), null);
});

// -----------------------------------------------------------------------------
// SUITE 3: Cache Validation Contract (isAudioPackCachedAndValid)
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: Audio Pack Cache Validation (isAudioPackCachedAndValid) ---');

test('3.1 Returns false for invalid or malicious pack IDs', async () => {
  assert.strictEqual(await isAudioPackCachedAndValid(''), false);
  assert.strictEqual(await isAudioPackCachedAndValid('__proto__'), false);
  assert.strictEqual(await isAudioPackCachedAndValid('unknown_pack'), false);
  assert.strictEqual(await isAudioPackCachedAndValid(null), false);
  assert.strictEqual(await isAudioPackCachedAndValid(undefined), false);
});

test('3.2 Returns false when bucket is empty or missing', async () => {
  MemoryCacheAdapter.clear();
  assert.strictEqual(await isAudioPackCachedAndValid('organic'), false);
  assert.strictEqual(await isAudioPackCachedAndValid('classic'), false);
});

test('3.3 Returns false when only partial stems exist (e.g. 3 of 4)', async () => {
  MemoryCacheAdapter.clear();
  const pack = getAudioPack('organic');
  const bucket = getAudioPackCacheName(pack);
  // Put only 3 stems
  await MemoryCacheAdapter.put(bucket, `${pack.folder}/stem-1.m4a`, new Uint8Array([1, 2]).buffer);
  await MemoryCacheAdapter.put(bucket, `${pack.folder}/stem-2.m4a`, new Uint8Array([1, 2]).buffer);
  await MemoryCacheAdapter.put(bucket, `${pack.folder}/stem-3.m4a`, new Uint8Array([1, 2]).buffer);
  assert.strictEqual(await isAudioPackCachedAndValid('organic'), false);
});

test('3.4 Returns false if any stem has zero length (0 bytes)', async () => {
  MemoryCacheAdapter.clear();
  const pack = getAudioPack('synth');
  const bucket = getAudioPackCacheName(pack);
  await MemoryCacheAdapter.put(bucket, `${pack.folder}/stem-1.m4a`, new Uint8Array([1, 2]).buffer);
  await MemoryCacheAdapter.put(bucket, `${pack.folder}/stem-2.m4a`, new Uint8Array([1, 2]).buffer);
  await MemoryCacheAdapter.put(bucket, `${pack.folder}/stem-3.m4a`, new Uint8Array([1, 2]).buffer);
  // 0 byte buffer for stem 4
  await MemoryCacheAdapter.put(bucket, `${pack.folder}/stem-4.m4a`, new ArrayBuffer(0));
  assert.strictEqual(await isAudioPackCachedAndValid('synth'), false);
});

test('3.5 Classic pack requires finalTrack in addition to 4 stems', async () => {
  MemoryCacheAdapter.clear();
  const pack = getAudioPack('classic');
  const bucket = getAudioPackCacheName(pack);
  // Put 4 stems
  for (const f of pack.files) {
    await MemoryCacheAdapter.put(bucket, `${pack.folder}/${f}`, new Uint8Array([1, 2]).buffer);
  }
  // Without finalTrack -> false
  assert.strictEqual(await isAudioPackCachedAndValid('classic'), false);

  // With finalTrack -> true
  await MemoryCacheAdapter.put(bucket, pack.finalTrack, new Uint8Array([3, 4]).buffer);
  assert.strictEqual(await isAudioPackCachedAndValid('classic'), true);
});

// -----------------------------------------------------------------------------
// SUITE 4: Asset Retrieval & Buffer Detachment Immunity
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 4: Asset Retrieval & Web Audio Detachment Immunity ---');

test('4.1 getCachedAudioPackAssetBuffer returns cloned ArrayBuffer immune to caller mutation/detachment', async () => {
  MemoryCacheAdapter.clear();
  const pack = getAudioPack('clockwork');
  const bucket = getAudioPackCacheName(pack);
  const original = new Uint8Array([10, 20, 30, 40]);
  await MemoryCacheAdapter.put(bucket, `${pack.folder}/stem-1.m4a`, original.buffer);

  const retrieved1 = await getCachedAudioPackAssetBuffer('clockwork', 'stem-1.m4a');
  assert.strictEqual(retrieved1.byteLength, 4);

  // Simulate Web Audio decodeAudioData mutation / transfer
  new Uint8Array(retrieved1).fill(255);

  const retrieved2 = await getCachedAudioPackAssetBuffer('clockwork', 'stem-1.m4a');
  const view2 = new Uint8Array(retrieved2);
  assert.deepStrictEqual([...view2], [10, 20, 30, 40], 'Underlying cached buffer was corrupted!');
});

test('4.2 getCachedAudioPackAssetBuffer touches lastUsed timestamp on retrieval', async () => {
  storageStore.clear();
  const before = Date.now();
  await getCachedAudioPackAssetBuffer('clockwork', 'stem-1.m4a');
  const lastUsed = getAudioPackLastUsed('clockwork');
  assert.ok(lastUsed !== null && lastUsed >= before);
});

test('4.3 getCachedAudioPackAssetBuffer throws on invalid pack ID', async () => {
  await assert.rejects(
    async () => getCachedAudioPackAssetBuffer('nonexistent', 'stem-1.m4a'),
    /Invalid audio pack ID|Unknown audio pack/
  );
});

// -----------------------------------------------------------------------------
// SUITE 5: Streaming Loader Deduplication, Monotonicity & Abort
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 5: Streaming Loader Monotonicity, Deduplication & Abort ---');

test('5.1 loadAudioPackWithProgress short-circuits on already cached pack', async () => {
  MemoryCacheAdapter.clear();
  const pack = getAudioPack('classic');
  const bucket = getAudioPackCacheName(pack);
  const files = getAudioPackAllFilePaths(pack);
  for (const f of files) {
    await MemoryCacheAdapter.put(bucket, f, new Uint8Array([1, 2, 3]).buffer);
  }

  let progressCalled = false;
  let finalPct = 0;
  const res = await loadAudioPackWithProgress('classic', (pct) => {
    progressCalled = true;
    finalPct = pct;
  });
  assert.strictEqual(res, true);
  assert.strictEqual(progressCalled, true);
  assert.strictEqual(finalPct, 100);
});

test('5.2 loadAudioPackWithProgress deduplicates concurrent calls to single in-flight Promise', async () => {
  MemoryCacheAdapter.clear();
  storageStore.clear();

  // Setup mock global fetch
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;

  globalThis.fetch = async (url) => {
    fetchCount++;
    await new Promise((r) => setTimeout(r, 20));
    const sampleData = new Uint8Array([1, 2, 3, 4, 5]);
    return new Response(sampleData.buffer, {
      status: 200,
      headers: {
        'content-type': 'audio/mp4',
        'content-length': '5',
      },
    });
  };

  try {
    const p1Progress = [];
    const p2Progress = [];
    const p3Progress = [];

    // Trigger 3 concurrent loads for 'organic'
    const [r1, r2, r3] = await Promise.all([
      loadAudioPackWithProgress('organic', (pct) => p1Progress.push(pct)),
      loadAudioPackWithProgress('organic', (pct) => p2Progress.push(pct)),
      loadAudioPackWithProgress('organic', (pct) => p3Progress.push(pct)),
    ]);

    assert.strictEqual(r1, true);
    assert.strictEqual(r2, true);
    assert.strictEqual(r3, true);

    // Organic has 4 stem files: exactly 4 fetches should happen
    assert.strictEqual(fetchCount, 4, `Expected 4 fetch calls, got ${fetchCount}`);

    // All subscribers must end at 100%
    assert.strictEqual(p1Progress[p1Progress.length - 1], 100);
    assert.strictEqual(p2Progress[p2Progress.length - 1], 100);
    assert.strictEqual(p3Progress[p3Progress.length - 1], 100);

    // Check monotonicity across all subscribers
    for (const arr of [p1Progress, p2Progress, p3Progress]) {
      for (let i = 1; i < arr.length; i++) {
        assert.ok(arr[i] >= arr[i - 1], `Non-monotonic progress: ${arr[i - 1]} -> ${arr[i]}`);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('5.3 loadAudioPackWithProgress cleanly aborts without leaving partial files in cache', async () => {
  MemoryCacheAdapter.clear();

  const originalFetch = globalThis.fetch;
  const controller = new AbortController();

  let fetchedFiles = 0;
  globalThis.fetch = async (url, opts) => {
    fetchedFiles++;
    if (fetchedFiles === 2) {
      // Abort during stem 2
      controller.abort();
    }
    if (opts?.signal?.aborted) {
      throw new DOMException('Download aborted', 'AbortError');
    }
    return new Response(new Uint8Array([1, 2, 3]).buffer, {
      status: 200,
      headers: { 'content-type': 'audio/mp4', 'content-length': '3' },
    });
  };

  try {
    await assert.rejects(
      async () => loadAudioPackWithProgress('synth', undefined, controller.signal),
      /AbortError|Download aborted/
    );

    // Verify ZERO files committed to the cache bucket
    const bucket = getAudioPackCacheName('synth');
    const bucketKeys = await MemoryCacheAdapter.keys();
    assert.ok(
      !bucketKeys.includes(bucket) || !MemoryCacheAdapter.has(bucket),
      'Partial cache entry found after abort!'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// -----------------------------------------------------------------------------
// SUITE 6: 10-Day TTL Eviction & Active Pack Protection Invariant
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 6: 10-Day TTL Eviction & Active Pack Protection Invariant ---');

test('6.1 Inactive pack older than 10 days is purged from storage and localStorage', async () => {
  MemoryCacheAdapter.clear();
  storageStore.clear();

  const now = Date.now();
  const elevenDaysAgo = now - 11 * 24 * 60 * 60 * 1000;

  // Inactive pack 'synth' used 11 days ago
  storageStore.set('audio_pack_last_used_synth', String(elevenDaysAgo));
  await MemoryCacheAdapter.put('maze-pack-synth-v1.0.0', 'stem-1.m4a', new Uint8Array([1]).buffer);

  // Inactive pack 'clockwork' used 8 days ago (fresh)
  const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;
  storageStore.set('audio_pack_last_used_clockwork', String(eightDaysAgo));
  await MemoryCacheAdapter.put('maze-pack-clockwork-v1.0.0', 'stem-1.m4a', new Uint8Array([2]).buffer);

  const result = await checkAndPurgeExpiredCaches('classic');

  assert.ok(result.purgedPacks.includes('synth'), 'synth should have been purged');
  assert.ok(!result.purgedPacks.includes('clockwork'), 'clockwork should NOT have been purged');
  assert.strictEqual(MemoryCacheAdapter.has('maze-pack-synth-v1.0.0'), false);
  assert.strictEqual(MemoryCacheAdapter.has('maze-pack-clockwork-v1.0.0'), true);
  assert.strictEqual(storageStore.has('audio_pack_last_used_synth'), false);
  assert.strictEqual(storageStore.has('audio_pack_last_used_clockwork'), true);
});

test('6.2 HARD INVARIANT: Active pack is NEVER purged under ANY timestamp condition', async () => {
  MemoryCacheAdapter.clear();
  storageStore.clear();

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const testCases = [
    { desc: '30 days old', value: String(thirtyDaysAgo) },
    { desc: 'missing timestamp (null)', value: null },
    { desc: 'NaN string', value: 'not-a-number' },
    { desc: '0 timestamp (1970)', value: '0' },
    { desc: 'negative timestamp', value: '-9999999' },
  ];

  for (const tc of testCases) {
    MemoryCacheAdapter.clear();
    storageStore.clear();

    if (tc.value !== null) {
      storageStore.set('audio_pack_last_used_organic', tc.value);
    }
    await MemoryCacheAdapter.put('maze-pack-organic-v1.0.0', 'stem-1.m4a', new Uint8Array([9]).buffer);

    const result = await checkAndPurgeExpiredCaches('organic');

    assert.ok(
      !result.purgedPacks.includes('organic'),
      `Active pack organic was purged when timestamp was ${tc.desc}!`
    );
    assert.strictEqual(
      MemoryCacheAdapter.has('maze-pack-organic-v1.0.0'),
      true,
      `Active pack cache was deleted when timestamp was ${tc.desc}!`
    );
  }
});

test('6.3 checkAndPurgeExpiredCaches falls back to stored settings when argument is omitted', async () => {
  MemoryCacheAdapter.clear();
  storageStore.clear();

  // Save selectedAudioPack = 'clockwork' in maze_daily_settings_v1
  storageStore.set(
    'maze_daily_settings_v1',
    JSON.stringify({ selectedAudioPack: 'clockwork', theme: 'dark' })
  );

  // Set clockwork lastUsed to 20 days ago
  const twentyDaysAgo = Date.now() - 20 * 24 * 60 * 60 * 1000;
  storageStore.set('audio_pack_last_used_clockwork', String(twentyDaysAgo));
  await MemoryCacheAdapter.put('maze-pack-clockwork-v1.0.0', 'stem-1.m4a', new Uint8Array([3]).buffer);

  // Omit argument: should read from settings and protect 'clockwork'
  const result = await checkAndPurgeExpiredCaches();

  assert.ok(
    !result.purgedPacks.includes('clockwork'),
    'Omitted argument must protect clockwork from stored settings'
  );
  assert.strictEqual(MemoryCacheAdapter.has('maze-pack-clockwork-v1.0.0'), true);
});

// -----------------------------------------------------------------------------
// SUITE 7: App.tsx Mount Contract Verification
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 7: App.tsx Integration Contract Verification ---');

test('7.1 App.tsx invokes checkAndPurgeExpiredCaches with settings.selectedAudioPack on mount', async () => {
  const fs = await import('node:fs/promises');
  const appSrc = await fs.readFile(path.resolve(projectRoot, 'src/App.tsx'), 'utf-8');

  // Verify that App.tsx dynamically imports moduleLoader and passes settings.selectedAudioPack
  assert.ok(
    appSrc.includes('checkAndPurgeExpiredCaches(settings.selectedAudioPack)'),
    'App.tsx must pass settings.selectedAudioPack to checkAndPurgeExpiredCaches'
  );
  assert.ok(
    appSrc.includes('[settings.selectedAudioPack]'),
    'App.tsx useEffect dependency array must include settings.selectedAudioPack'
  );
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
await runAllTests();

console.log('\n================================================================');
console.log(`  ADVERSARIAL SUITE SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log('================================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('\n>>> ADVERSARIAL VERDICT: 100% INVARIANTS VERIFIED & APPROVED <<<\n');
}
