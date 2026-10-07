/**
 * tests/audio_pack_cache_stress.mjs
 *
 * COMPREHENSIVE ACCEPTANCE STRESS & VERIFICATION TEST SUITE (MILESTONE 5):
 * Dynamic Audio Packs Architecture: Cache API Bucket Isolation, Pack Cache
 * Validation, 10-Day TTL Eviction with Active Pack Invariant, and Seamless 0.5s
 * Live Crossfading & Stem Resynchronization.
 *
 * Suites:
 * - Suite 1: Cache API bucket isolation (format: maze-pack-${packId}-v${version})
 * - Suite 2: Pack Cache Validation (isAudioPackCachedAndValid & getCachedAudioPackAssetBuffer)
 * - Suite 3: 10-day TTL eviction & timestamp management (audio_pack_last_used_${packId})
 *            Hard Invariant: currently selected pack is NEVER evicted.
 * - Suite 4: Seamless 0.5s live crossfade & stem resynchronization (buffer swap,
 *            mono gain recreation, quartile sync, fanfare fallback, error resilience).
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Register Node ESM resolver hook for TypeScript imports
try {
  register(new URL('./ts_resolver.mjs', import.meta.url).href);
} catch {
  // Already registered
}

console.log('================================================================');
console.log('  MILESTONE 5: DYNAMIC AUDIO PACKS ACCEPTANCE VERIFICATION      ');
console.log('  Comprehensive Cache Isolation, TTL Eviction & Crossfade Suite ');
console.log('================================================================\n');

// =============================================================================
// Web Audio, Cache API & Browser Mock Environment for Node.js
// =============================================================================

class MockAudioParam {
  constructor(initialValue = 0) {
    this.value = initialValue;
    this.events = [];
  }
  setValueAtTime(val, time) {
    this.value = val;
    this.events.push({ type: 'setValueAtTime', value: val, time });
    return this;
  }
  linearRampToValueAtTime(val, time) {
    this.value = val;
    this.events.push({ type: 'linearRampToValueAtTime', value: val, time });
    return this;
  }
  exponentialRampToValueAtTime(val, time) {
    this.value = val;
    this.events.push({ type: 'exponentialRampToValueAtTime', value: val, time });
    return this;
  }
  setTargetAtTime(target, time, tau) {
    this.value = target;
    this.events.push({ type: 'setTargetAtTime', target, time, tau });
    return this;
  }
  cancelScheduledValues(time) {
    this.events.push({ type: 'cancelScheduledValues', time });
    return this;
  }
}

class MockAudioNode {
  constructor(ctx) {
    this.context = ctx;
    this.destinations = new Set();
    this.channelCount = 2;
    this.channelCountMode = 'max';
  }
  connect(dest) {
    this.destinations.add(dest);
    return dest;
  }
  disconnect() {
    this.destinations.clear();
  }
}

class MockGainNode extends MockAudioNode {
  constructor(ctx, initialGain = 1.0) {
    super(ctx);
    this.gain = new MockAudioParam(initialGain);
  }
}

class MockOscillatorNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.type = 'sine';
    this.frequency = new MockAudioParam(440);
    this.started = false;
    this.stopped = false;
    this.onended = null;
  }
  start() { this.started = true; }
  stop() {
    this.stopped = true;
    if (this.onended) queueMicrotask(() => this.onended?.());
  }
}

class MockStereoPannerNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.pan = new MockAudioParam(0);
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.type = 'lowpass';
    this.frequency = new MockAudioParam(20000);
    this.Q = new MockAudioParam(1.0);
  }
}

class MockAudioBufferSourceNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.buffer = null;
    this.loop = false;
    this.loopStart = 0;
    this.loopEnd = 0;
    this.started = false;
    this.stopped = false;
    this.startTime = null;
    this.onended = null;
  }
  start(time = 0) {
    this.started = true;
    this.startTime = time;
    this.context.activeSources.push(this);
  }
  stop() {
    this.stopped = true;
    const idx = this.context.activeSources.indexOf(this);
    if (idx !== -1) this.context.activeSources.splice(idx, 1);
    if (this.onended) queueMicrotask(() => this.onended?.());
  }
}

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.destination = new MockGainNode(this, 1.0);
    this.activeSources = [];
  }
  createGain() { return new MockGainNode(this); }
  createOscillator() { return new MockOscillatorNode(this); }
  createStereoPanner() { return new MockStereoPannerNode(this); }
  createBiquadFilter() { return new MockBiquadFilterNode(this); }
  createBufferSource() { return new MockAudioBufferSourceNode(this); }
  decodeAudioData(buffer, success) {
    const mockAudioBuffer = {
      duration: 12.0,
      length: 529200,
      numberOfChannels: 2,
      sampleRate: 44100,
    };
    if (success) success(mockAudioBuffer);
    return Promise.resolve(mockAudioBuffer);
  }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
}

class MockResponse {
  constructor(bodyBuffer = new Uint8Array([1, 2, 3, 4]).buffer, options = {}) {
    this._buffer = bodyBuffer;
    this.status = options.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
    this.headers = new Map(
      options.headers ? (Array.isArray(options.headers) ? options.headers : Object.entries(options.headers)) : [
        ['content-type', 'audio/mp4'],
        ['content-length', String(bodyBuffer.byteLength)],
      ]
    );
  }
  clone() {
    return new MockResponse(this._buffer.slice(0), {
      status: this.status,
      headers: Array.from(this.headers.entries()),
    });
  }
  async arrayBuffer() {
    return this._buffer.slice(0);
  }
}

class MockCache {
  constructor(name) {
    this.name = name;
    this.map = new Map();
  }
  async put(req, resp) {
    const url = typeof req === 'string' ? req : req.url;
    if (resp instanceof MockResponse || (resp && typeof resp.clone === 'function')) {
      this.map.set(url, resp.clone());
    } else if (resp instanceof ArrayBuffer) {
      this.map.set(url, new MockResponse(resp));
    } else {
      this.map.set(url, resp);
    }
  }
  async match(req) {
    const url = typeof req === 'string' ? req : req.url;
    const item = this.map.get(url);
    if (!item) return null;
    return typeof item.clone === 'function' ? item.clone() : item;
  }
  async delete(req) {
    const url = typeof req === 'string' ? req : req.url;
    return this.map.delete(url);
  }
  async keys() {
    return Array.from(this.map.keys()).map((k) => ({ url: k }));
  }
}

class MockCacheStorage {
  constructor() {
    this.caches = new Map();
  }
  async open(name) {
    let c = this.caches.get(name);
    if (!c) {
      c = new MockCache(name);
      this.caches.set(name, c);
    }
    return c;
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

const mockCaches = new MockCacheStorage();
let shouldFetchFail = false;

globalThis.window = {
  localStorage: mockLocalStorage,
  AudioContext: MockAudioContext,
  caches: mockCaches,
  location: { href: 'http://localhost:5173/' },
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.localStorage = mockLocalStorage;
globalThis.caches = mockCaches;
globalThis.document = {
  baseURI: 'http://localhost:5173/',
  documentElement: { lang: 'en' },
};
globalThis.fetch = async (url) => {
  if (shouldFetchFail) {
    return {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Map(),
      arrayBuffer: async () => { throw new Error('Network failure'); },
    };
  }
  const sampleBuf = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
  return {
    ok: true,
    status: 200,
    headers: new Map([
      ['content-type', 'audio/mp4'],
      ['content-length', String(sampleBuf.byteLength)],
    ]),
    arrayBuffer: async () => sampleBuf.slice(0),
    clone: function () { return this; },
  };
};

// =============================================================================
// Import Real Codebase Modules
// =============================================================================

const audioPacksConfigPath = pathToFileURL(path.resolve(projectRoot, 'src/config/audioPacks.ts')).href;
const audioPacksConfig = await import(audioPacksConfigPath);

const {
  DEFAULT_AUDIO_PACK_ID,
  getAllAudioPacks,
  getAudioPackList,
} = audioPacksConfig;

const moduleLoaderPath = pathToFileURL(path.resolve(projectRoot, 'src/services/moduleLoader.ts')).href;
const moduleLoader = await import(moduleLoaderPath);

const {
  AUDIO_PACKS,
  getAudioPack,
  isValidAudioPackId,
  getAudioPackAllFilePaths,
  getAudioPackCacheName,
  extractPackIdFromCacheName,
  touchAudioPackUsage,
  getAudioPackLastUsed,
  removeAudioPackUsage,
  purgeAudioPackCache,
  isAudioPackCachedAndValid,
  getCachedAudioPackAssetBuffer,
  loadAudioPackWithProgress,
  checkAndPurgeExpiredCaches,
  MemoryCacheAdapter,
  RETENTION_PERIOD_MS,
  CACHE_PREFIX,
  MODULE_VERSIONS,
} = moduleLoader;

const stemsPath = pathToFileURL(path.resolve(projectRoot, 'src/modules/audioNav/stems.ts')).href;
const {
  StemPlayer,
  calculateQuartileGains,
  SineFallbackSynthesizer,
} = await import(stemsPath);

const audioNavIndexPath = pathToFileURL(path.resolve(projectRoot, 'src/modules/audioNav/index.ts')).href;
const {
  AudioNavManager,
  audioNavController,
} = await import(audioNavIndexPath);

// =============================================================================
// Test Runner Harness
// =============================================================================

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

function assertClose(actual, expected, tol = 0.001, message = '') {
  const diff = Math.abs(actual - expected);
  assert.ok(diff <= tol, `${message} (expected: ${expected}, got: ${actual}, diff: ${diff})`);
}

// Helper to populate Cache API and MemoryCacheAdapter for an audio pack
async function seedPackAssets(packId, options = {}) {
  const pack = getAudioPack(packId);
  assert.ok(pack, `pack ${packId} must exist`);
  const cacheName = getAudioPackCacheName(pack);
  const cache = await mockCaches.open(cacheName);
  const files = getAudioPackAllFilePaths(pack);

  const filesToSeed = options.omitFile
    ? files.filter((f) => f !== options.omitFile)
    : files;

  for (const f of filesToSeed) {
    const isZeroLength = options.zeroLengthFile === f;
    const byteLength = isZeroLength ? 0 : (options.fileSizes?.[f] ?? 1024);
    const buf = new Uint8Array(byteLength).buffer;
    const resolvedUrl = `http://localhost:5173/${f}`;

    const headers = options.zeroContentLengthFile === f
      ? [['content-type', 'audio/mp4'], ['content-length', '0']]
      : [['content-type', 'audio/mp4'], ['content-length', String(byteLength)]];

    const resp = new MockResponse(buf, { status: 200, headers });

    // Store in MockCache under both relative path and resolved URL
    await cache.put(f, resp.clone());
    await cache.put(resolvedUrl, resp.clone());

    // Also populate MemoryCacheAdapter for unified parity
    await MemoryCacheAdapter.put(cacheName, f, buf.slice(0));
    await MemoryCacheAdapter.put(cacheName, resolvedUrl, buf.slice(0));
  }
}

// =============================================================================
// SUITE 1: Cache API Bucket Isolation
// =============================================================================
console.log('--- SUITE 1: Cache API Bucket Isolation ---');

await test('1.1 Bucket name format matches maze-pack-${packId}-v${version} for all 4 packs', async () => {
  const expectedFormats = {
    classic: 'maze-pack-classic-v1.0.0',
    organic: 'maze-pack-organic-v1.0.0',
    synth: 'maze-pack-synth-v1.0.0',
    clockwork: 'maze-pack-clockwork-v1.0.0',
  };

  for (const [id, expected] of Object.entries(expectedFormats)) {
    const pack = getAudioPack(id);
    assert.ok(pack, `Pack ${id} must exist in catalog`);
    assert.strictEqual(pack.version, '1.0.0', `Pack ${id} version must be 1.0.0`);
    assert.strictEqual(getAudioPackCacheName(pack), expected, `getAudioPackCacheName(pack) matches for ${id}`);
    assert.strictEqual(getAudioPackCacheName(id), expected, `getAudioPackCacheName(id) matches for ${id}`);
  }
});

await test('1.2 extractPackIdFromCacheName correctly parses pack ID from bucket name', async () => {
  assert.strictEqual(extractPackIdFromCacheName('maze-pack-classic-v1.0.0'), 'classic');
  assert.strictEqual(extractPackIdFromCacheName('maze-pack-organic-v1.0.0'), 'organic');
  assert.strictEqual(extractPackIdFromCacheName('maze-pack-synth-v1.0.0'), 'synth');
  assert.strictEqual(extractPackIdFromCacheName('maze-pack-clockwork-v1.0.0'), 'clockwork');

  // Negative / foreign bucket names
  assert.strictEqual(extractPackIdFromCacheName('maze-daily-module-cache-v1-audioNav'), null);
  assert.strictEqual(extractPackIdFromCacheName('maze-daily-module-cache-v1-headTracking'), null);
  assert.strictEqual(extractPackIdFromCacheName('custom-app-cache'), null);
  assert.strictEqual(extractPackIdFromCacheName(''), null);
});

await test('1.3 Manifest definitions, default ID, and complete file paths verification', async () => {
  assert.strictEqual(DEFAULT_AUDIO_PACK_ID, 'classic');

  const allPacks = getAllAudioPacks();
  assert.strictEqual(allPacks.length, 4, 'Must register exactly 4 sound packs');

  for (const packId of ['classic', 'organic', 'synth', 'clockwork']) {
    assert.strictEqual(isValidAudioPackId(packId), true, `${packId} must be recognized as valid`);
    const pack = AUDIO_PACKS[packId];
    assert.ok(pack, `AUDIO_PACKS[${packId}] must be defined`);
    assert.strictEqual(pack.files.length, 4, `${packId} must contain 4 stems`);

    const allPaths = getAudioPackAllFilePaths(pack);
    if (packId === 'classic') {
      assert.strictEqual(allPaths.length, 5, 'Classic must contain 4 stems + finalTrack (5 files)');
      assert.ok(allPaths.includes('audio/stems/final.mp3'), 'Classic must include audio/stems/final.mp3');
    } else {
      assert.strictEqual(allPaths.length, 4, `${packId} must contain exactly 4 files`);
      assert.strictEqual(pack.finalTrack, undefined, `${packId} must have undefined finalTrack`);
    }
  }

  assert.strictEqual(isValidAudioPackId('unknown_pack'), false);
  assert.strictEqual(isValidAudioPackId(''), false);
  assert.strictEqual(isValidAudioPackId('CLASSIC'), false);
});

await test('1.4 Physical bucket isolation: assets in one pack cache bucket do not leak to others', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();

  // Seed classic only
  await seedPackAssets('classic');

  const classicCache = await mockCaches.open(getAudioPackCacheName('classic'));
  const organicCache = await mockCaches.open(getAudioPackCacheName('organic'));
  const synthCache = await mockCaches.open(getAudioPackCacheName('synth'));
  const clockworkCache = await mockCaches.open(getAudioPackCacheName('clockwork'));

  const classicStem1 = await classicCache.match('audio/stems/stem-1.m4a');
  assert.ok(classicStem1 !== null, 'Classic bucket must have stem-1.m4a');

  // Verify other buckets are completely isolated and empty
  const organicMatch = await organicCache.match('audio/stems/stem-1.m4a');
  const synthMatch = await synthCache.match('audio/stems/stem-1.m4a');
  const clockworkMatch = await clockworkCache.match('audio/stems/stem-1.m4a');

  assert.strictEqual(organicMatch, null, 'Organic bucket must not contain classic stem');
  assert.strictEqual(synthMatch, null, 'Synth bucket must not contain classic stem');
  assert.strictEqual(clockworkMatch, null, 'Clockwork bucket must not contain classic stem');
});

// =============================================================================
// SUITE 2: Pack Cache Validation & Asset Retrieval
// =============================================================================
console.log('\n--- SUITE 2: Pack Cache Validation & Asset Retrieval ---');

await test('2.1 isAudioPackCachedAndValid returns false for empty or unseeded packs', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();

  for (const packId of ['classic', 'organic', 'synth', 'clockwork']) {
    const valid = await isAudioPackCachedAndValid(packId);
    assert.strictEqual(valid, false, `Unseeded pack ${packId} must return false`);
  }
});

await test('2.2 isAudioPackCachedAndValid returns false when any stem is missing', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();

  // Seed organic but omit stem-3.m4a
  await seedPackAssets('organic', { omitFile: 'audio/packs/organic/stem-3.m4a' });

  const valid = await isAudioPackCachedAndValid('organic');
  assert.strictEqual(valid, false, 'Partially cached pack (missing stem 3) must return false');
});

await test('2.3 isAudioPackCachedAndValid returns false when classic is missing final.mp3', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();

  // Seed classic but omit final.mp3
  await seedPackAssets('classic', { omitFile: 'audio/stems/final.mp3' });

  const valid = await isAudioPackCachedAndValid('classic');
  assert.strictEqual(valid, false, 'Classic missing final.mp3 must return false');
});

await test('2.4 isAudioPackCachedAndValid returns false when asset has 0 byteLength or 0 content-length', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();

  // Seed synth with 0-byte stem-2
  await seedPackAssets('synth', { zeroLengthFile: 'audio/packs/synth/stem-2.m4a' });
  const validZeroBuf = await isAudioPackCachedAndValid('synth');
  assert.strictEqual(validZeroBuf, false, 'Pack with 0-byte length buffer must return false');

  mockCaches.clear();
  MemoryCacheAdapter.clear();

  // Seed clockwork with content-length header = 0
  await seedPackAssets('clockwork', { zeroContentLengthFile: 'audio/packs/clockwork/stem-1.m4a' });
  const validZeroHeader = await isAudioPackCachedAndValid('clockwork');
  assert.strictEqual(validZeroHeader, false, 'Pack with content-length 0 must return false');
});

await test('2.5 isAudioPackCachedAndValid returns true when all assets are fully populated', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();

  for (const packId of ['classic', 'organic', 'synth', 'clockwork']) {
    await seedPackAssets(packId);
    const valid = await isAudioPackCachedAndValid(packId);
    assert.strictEqual(valid, true, `Fully seeded pack ${packId} must validate true`);
  }

  // Invalid IDs return false
  assert.strictEqual(await isAudioPackCachedAndValid('unknown_pack'), false);
  assert.strictEqual(await isAudioPackCachedAndValid(''), false);
  assert.strictEqual(await isAudioPackCachedAndValid(null), false);
});

await test('2.6 getCachedAudioPackAssetBuffer retrieves buffer from cache and touches usage', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();

  await seedPackAssets('synth');
  assert.strictEqual(mockLocalStorage.getItem('audio_pack_last_used_synth'), null);

  const buf = await getCachedAudioPackAssetBuffer('synth', 'audio/packs/synth/stem-1.m4a');
  assert.ok(buf instanceof ArrayBuffer, 'Must return ArrayBuffer');
  assert.ok(buf.byteLength > 0, 'Buffer byteLength must be > 0');

  // Verify usage was touched
  const ts = mockLocalStorage.getItem('audio_pack_last_used_synth');
  assert.ok(ts !== null, 'Reading cached asset must record last_used in localStorage');
  assert.ok(Date.now() - Number(ts) < 2000, 'Timestamp must be current');

  // Short filename resolution test
  const shortBuf = await getCachedAudioPackAssetBuffer('synth', 'stem-2.m4a');
  assert.ok(shortBuf instanceof ArrayBuffer, 'Bare filename must resolve correctly');
  assert.ok(shortBuf.byteLength > 0, 'Bare filename buffer must be non-empty');
});

await test('2.7 getCachedAudioPackAssetBuffer falls back to fetch on cache miss and caches result', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();

  // Pack is not cached, fetch should supply buffer
  const buf = await getCachedAudioPackAssetBuffer('clockwork', 'audio/packs/clockwork/stem-1.m4a');
  assert.ok(buf instanceof ArrayBuffer);
  assert.ok(buf.byteLength > 0);

  // Subsequent cache check should find it
  const cachedMatch = await mockCaches.open(getAudioPackCacheName('clockwork'));
  const match = await cachedMatch.match('audio/packs/clockwork/stem-1.m4a');
  assert.ok(match !== null, 'Fetched buffer must be committed into pack cache bucket');
});

await test('2.8 getCachedAudioPackAssetBuffer error cases: invalid pack ID and network failure', async () => {
  await assert.rejects(
    async () => { await getCachedAudioPackAssetBuffer('invalid_id', 'stem-1.m4a'); },
    /Invalid audio pack ID/,
    'Must reject invalid pack ID'
  );

  shouldFetchFail = true;
  try {
    await assert.rejects(
      async () => { await getCachedAudioPackAssetBuffer('organic', 'audio/packs/organic/nonexistent.m4a'); },
      /Failed to fetch audio asset/,
      'Must reject on network failure'
    );
  } finally {
    shouldFetchFail = false;
  }
});

// =============================================================================
// SUITE 3: 10-Day TTL Eviction & Timestamp Management
// =============================================================================
console.log('\n--- SUITE 3: 10-Day TTL Eviction & Timestamp Management ---');

await test('3.1 Timestamp management helpers (touch, get, remove)', async () => {
  mockLocalStorage.clear();

  assert.strictEqual(getAudioPackLastUsed('organic'), null);

  const t0 = Date.now();
  touchAudioPackUsage('organic');
  const stored = getAudioPackLastUsed('organic');
  assert.ok(stored !== null);
  assert.ok(stored >= t0 && stored <= Date.now());

  removeAudioPackUsage('organic');
  assert.strictEqual(getAudioPackLastUsed('organic'), null);
});

await test('3.2 Inactive packs older than 10 days are purged; fresh packs (<10d) preserved', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();

  const now = Date.now();
  const elevenDaysAgo = now - (11 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = now - (3 * 24 * 60 * 60 * 1000);

  // Active: classic (now)
  await seedPackAssets('classic');
  mockLocalStorage.setItem('audio_pack_last_used_classic', String(now));

  // Expired inactive: organic (11 days ago)
  await seedPackAssets('organic');
  mockLocalStorage.setItem('audio_pack_last_used_organic', String(elevenDaysAgo));

  // Fresh inactive: synth (3 days ago)
  await seedPackAssets('synth');
  mockLocalStorage.setItem('audio_pack_last_used_synth', String(threeDaysAgo));

  const result = await checkAndPurgeExpiredCaches('classic');

  assert.ok(result.purgedPacks.includes('organic'), 'Expired organic must be in purgedPacks');
  assert.ok(!result.purgedPacks.includes('synth'), 'Fresh synth must NOT be in purgedPacks');
  assert.ok(!result.purgedPacks.includes('classic'), 'Active classic must NOT be in purgedPacks');

  // Verify physical storage
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('organic')), false, 'Organic cache bucket deleted');
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('synth')), true, 'Synth cache bucket preserved');
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('classic')), true, 'Classic cache bucket preserved');

  // Verify localStorage metadata
  assert.strictEqual(mockLocalStorage.getItem('audio_pack_last_used_organic'), null, 'Organic timestamp cleaned up');
  assert.strictEqual(mockLocalStorage.getItem('audio_pack_last_used_synth'), String(threeDaysAgo), 'Synth timestamp preserved');
});

await test('3.3 HARD INVARIANT: Currently selected sound pack is NEVER evicted (even 30 days old)', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();

  const now = Date.now();
  const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
  const twelveDaysAgo = now - (12 * 24 * 60 * 60 * 1000);

  // Selected pack: clockwork (30 days old)
  await seedPackAssets('clockwork');
  mockLocalStorage.setItem('audio_pack_last_used_clockwork', String(thirtyDaysAgo));

  // Inactive pack: synth (12 days old)
  await seedPackAssets('synth');
  mockLocalStorage.setItem('audio_pack_last_used_synth', String(twelveDaysAgo));

  const result = await checkAndPurgeExpiredCaches('clockwork');

  assert.ok(!result.purgedPacks.includes('clockwork'), 'Active pack clockwork MUST NOT be in purgedPacks');
  assert.ok(result.purgedPacks.includes('synth'), 'Inactive synth MUST be in purgedPacks');

  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('clockwork')), true, 'Active clockwork cache PRESERVED');
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('synth')), false, 'Inactive synth cache PURGED');
  assert.strictEqual(mockLocalStorage.getItem('audio_pack_last_used_clockwork'), String(thirtyDaysAgo), 'Active clockwork metadata PRESERVED');
});

await test('3.4 HARD INVARIANT: Active pack with NO timestamp (untracked) is PRESERVED', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();

  // Active pack organic: cached but NO timestamp in localStorage
  await seedPackAssets('organic');
  mockLocalStorage.removeItem('audio_pack_last_used_organic');

  // Inactive pack synth: cached but NO timestamp in localStorage (orphaned inactive)
  await seedPackAssets('synth');
  mockLocalStorage.removeItem('audio_pack_last_used_synth');

  const result = await checkAndPurgeExpiredCaches('organic');

  assert.ok(!result.purgedPacks.includes('organic'), 'Untracked active pack organic MUST NOT be purged');
  assert.ok(result.purgedPacks.includes('synth'), 'Untracked inactive pack synth MUST be purged');

  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('organic')), true, 'Untracked active organic PRESERVED in cache');
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('synth')), false, 'Untracked inactive synth PURGED from cache');
});

await test('3.5 HARD INVARIANT: Active pack inferred from storage or default classic when param omitted', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();

  // 1. Inferred from settings in localStorage
  mockLocalStorage.setItem('maze_daily_settings_v1', JSON.stringify({ selectedAudioPack: 'synth' }));
  await seedPackAssets('synth');
  await seedPackAssets('organic');

  const res1 = await checkAndPurgeExpiredCaches(); // Omit argument
  assert.ok(!res1.purgedPacks.includes('synth'), 'Inferred active pack synth must be preserved');
  assert.ok(res1.purgedPacks.includes('organic'), 'Inactive organic must be purged');
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('synth')), true);
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('organic')), false);

  mockCaches.clear();
  mockLocalStorage.clear();

  // 2. Default classic fallback when no settings exist
  await seedPackAssets('classic');
  await seedPackAssets('clockwork');

  const res2 = await checkAndPurgeExpiredCaches(); // Omit argument
  assert.ok(!res2.purgedPacks.includes('classic'), 'Default classic pack must be preserved');
  assert.ok(res2.purgedPacks.includes('clockwork'), 'Inactive clockwork must be purged');
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('classic')), true);
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('clockwork')), false);
});

await test('3.6 Corrupted timestamps on inactive packs are safely purged; active pack protected', async () => {
  const badValues = ['NaN', 'not-a-number', '-5000', '', 'null', 'undefined', '{}', '[1,2]', 'true'];

  for (const badVal of badValues) {
    mockCaches.clear();
    MemoryCacheAdapter.clear();
    mockLocalStorage.clear();

    await seedPackAssets('organic');
    mockLocalStorage.setItem('audio_pack_last_used_organic', String(Date.now()));

    await seedPackAssets('synth');
    mockLocalStorage.setItem('audio_pack_last_used_synth', badVal);

    let res;
    try {
      res = await checkAndPurgeExpiredCaches('organic');
    } catch (err) {
      assert.fail(`checkAndPurgeExpiredCaches threw on bad value "${badVal}": ${err.message}`);
    }

    assert.ok(!res.purgedPacks.includes('organic'), `Active organic must be preserved with badVal: ${badVal}`);
    assert.ok(res.purgedPacks.includes('synth'), `Corrupted synth must be purged with badVal: ${badVal}`);
    assert.strictEqual(await mockCaches.has(getAudioPackCacheName('synth')), false);
    assert.strictEqual(mockLocalStorage.getItem('audio_pack_last_used_synth'), null);
  }

  // Active pack with corrupted value is STILL protected
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();

  await seedPackAssets('organic');
  mockLocalStorage.setItem('audio_pack_last_used_organic', 'corrupted-nan-value');

  await seedPackAssets('synth');
  mockLocalStorage.setItem('audio_pack_last_used_synth', String(Date.now() - 15 * 86400000));

  const activeCorruptedRes = await checkAndPurgeExpiredCaches('organic');
  assert.ok(!activeCorruptedRes.purgedPacks.includes('organic'), 'Active organic with corrupted ts must NEVER be purged');
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('organic')), true);
  assert.ok(activeCorruptedRes.purgedPacks.includes('synth'), 'Expired synth must be purged');
});

await test('3.7 Clock drift normalization, concurrency stress, and module cache isolation', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();

  const now = Date.now();

  // 1. Clock drift tolerance
  await seedPackAssets('organic');
  mockLocalStorage.setItem('audio_pack_last_used_organic', String(now));
  await seedPackAssets('synth');
  mockLocalStorage.setItem('audio_pack_last_used_synth', String(now + 3 * 86400000)); // 3 days in future

  const driftRes = await checkAndPurgeExpiredCaches('organic');
  assert.ok(!driftRes.purgedPacks.includes('synth'), 'Future drift synth must not be purged');
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('synth')), true);

  // 2. Module cache isolation
  const headModCache = `${CACHE_PREFIX}-headTracking`;
  const audioModCache = `${CACHE_PREFIX}-audioNav`;
  await (await mockCaches.open(headModCache)).put('models/face_landmarker.task', new MockResponse());
  await (await mockCaches.open(audioModCache)).put('audio/stems/stem-1.m4a', new MockResponse());
  mockLocalStorage.setItem('maze_daily_module_retention_v1', JSON.stringify({
    headTracking: { version: MODULE_VERSIONS.headTracking, lastUsed: now },
    audioNav: { version: MODULE_VERSIONS.audioNav, lastUsed: now },
  }));

  // Expired inactive pack
  await seedPackAssets('clockwork');
  mockLocalStorage.setItem('audio_pack_last_used_clockwork', String(now - 15 * 86400000));

  const modRes = await checkAndPurgeExpiredCaches('organic');
  assert.strictEqual(modRes.purgedModules.length, 0, 'Module caches must not be purged by audio pack eviction');
  assert.ok(modRes.purgedPacks.includes('clockwork'), 'Expired clockwork must be purged');
  assert.strictEqual(await mockCaches.has(headModCache), true, 'headTracking cache preserved');
  assert.strictEqual(await mockCaches.has(audioModCache), true, 'audioNav cache preserved');

  // 3. Concurrency stress: 30 concurrent calls
  const promises = Array.from({ length: 30 }, () => checkAndPurgeExpiredCaches('organic'));
  const results = await Promise.all(promises);
  for (const r of results) {
    assert.ok(!r.purgedPacks.includes('organic'), 'Active organic must not appear in any concurrent purge result');
  }
});

// =============================================================================
// SUITE 4: Seamless 0.5s Live Crossfade & Stem Resynchronization
// =============================================================================
console.log('\n--- SUITE 4: Seamless 0.5s Live Crossfade & Stem Resynchronization ---');

await test('4.1 0.5s linear fadeout scheduled on stemsBus.gain (linearRampToValueAtTime(0.0001, now + 0.5))', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();

  // Seed classic and synth
  await seedPackAssets('classic');
  await seedPackAssets('synth');

  const ctx = new MockAudioContext();
  ctx.currentTime = 12.345;
  const dest = ctx.createGain();

  const player = new StemPlayer();
  await player.init(ctx, dest);
  await player.switchPack('classic');
  player.start();

  assert.strictEqual(player.getState(), 'playing');
  const stemsBus = player.getStemsBus();
  assert.ok(stemsBus !== null);

  const eventsBefore = stemsBus.gain.events.length;
  await player.switchPack('synth');

  const newEvents = stemsBus.gain.events.slice(eventsBefore);

  // 1. cancelScheduledValues(now)
  const cancelEv = newEvents.find((e) => e.type === 'cancelScheduledValues');
  assert.ok(cancelEv, 'cancelScheduledValues must be scheduled');
  assert.strictEqual(cancelEv.time, 12.345);

  // 2. setValueAtTime(currentGain, now)
  const setEv = newEvents.find((e) => e.type === 'setValueAtTime');
  assert.ok(setEv, 'setValueAtTime must be scheduled');
  assert.strictEqual(setEv.time, 12.345);

  // 3. linearRampToValueAtTime(0.0001, now + 0.5)
  const rampEv = newEvents.find((e) => e.type === 'linearRampToValueAtTime');
  assert.ok(rampEv, 'linearRampToValueAtTime must be scheduled');
  assert.strictEqual(rampEv.value, 0.0001, 'Target gain must be exactly 0.0001');
  assertClose(rampEv.time, 12.345 + 0.5, 0.0001, 'Target time must be exactly now + 0.5s');

  // 4. stemsBus.gain restored to 1.0 after crossfade completes
  const lastEvent = newEvents[newEvents.length - 1];
  assert.strictEqual(lastEvent.type, 'setValueAtTime');
  assert.strictEqual(lastEvent.value, 1.0, 'Gain must be restored to 1.0');

  assert.strictEqual(player.getCurrentPackId(), 'synth');
  assert.strictEqual(player.getState(), 'playing');
});

await test('4.2 Audio buffer swap and monophonic downmixing recreation (channelCount = 1, explicit)', async () => {
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);

  const packs = ['classic', 'organic', 'synth', 'clockwork'];

  for (const p of packs) {
    await seedPackAssets(p);
    await player.switchPack(p);

    // Stems bus mono downmixing
    const stemsBus = player.getStemsBus();
    assert.strictEqual(stemsBus.channelCount, 1, `stemsBus channelCount must be 1 for ${p}`);
    assert.strictEqual(stemsBus.channelCountMode, 'explicit', `stemsBus channelCountMode must be explicit for ${p}`);

    // Stem gain nodes mono downmixing
    const stemGains = player.stemGainNodes;
    assert.ok(stemGains && stemGains.length === 4, `Must have 4 stem gain nodes for ${p}`);
    stemGains.forEach((g, idx) => {
      assert.strictEqual(g.channelCount, 1, `stemGainNode[${idx}] channelCount must be 1 for ${p}`);
      assert.strictEqual(g.channelCountMode, 'explicit', `stemGainNode[${idx}] channelCountMode must be explicit for ${p}`);
    });
  }
});

await test('4.3 Topological progress resynchronization across quartiles (0.0, 0.25, 0.5, 0.75, 1.0)', async () => {
  // 1. Math verification: calculateQuartileGains equal-power property
  const quartiles = [0.0, 0.25, 0.5, 0.75, 1.0];
  const expectedGains = {
    0.0: { stem1: 1.0, stem2: 0.0, stem3: 0.0, stem4: 0.0 },
    0.25: { stem1: 1.0, stem2: 0.0, stem3: 0.0, stem4: 0.0 },
    0.5: { stem1: 0.0, stem2: 1.0, stem3: 0.0, stem4: 0.0 },
    0.75: { stem1: 0.0, stem2: 0.0, stem3: 1.0, stem4: 0.0 },
    1.0: { stem1: 0.0, stem2: 0.0, stem3: 0.0, stem4: 1.0 },
  };

  for (const q of quartiles) {
    const gains = calculateQuartileGains(q, 'equal-power');
    const exp = expectedGains[q];
    assertClose(gains.stem1, exp.stem1, 0.001, `quartile ${q} stem1`);
    assertClose(gains.stem2, exp.stem2, 0.001, `quartile ${q} stem2`);
    assertClose(gains.stem3, exp.stem3, 0.001, `quartile ${q} stem3`);
    assertClose(gains.stem4, exp.stem4, 0.001, `quartile ${q} stem4`);
  }

  // Equal-power sum of squares check across intermediate points
  for (let p = 0; p <= 1.0; p += 0.05) {
    const g = calculateQuartileGains(p, 'equal-power');
    const power = (g.stem1 ** 2) + (g.stem2 ** 2) + (g.stem3 ** 2) + (g.stem4 ** 2);
    assertClose(power, 1.0, 0.01, `Equal power preservation at progress ${p}`);
  }

  // 2. Live StemPlayer dynamic progress resynchronization
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);
  await player.switchPack('organic');
  player.start();

  // Move player along progress milestones
  for (const progress of [0.0, 0.25, 0.5, 0.75, 1.0]) {
    player.updateProgress(progress);
    const expected = expectedGains[progress];
    // Check that target values were scheduled
    const lastEvents = player.stemGainNodes.map((g) => {
      const targetEvs = g.gain.events.filter((e) => e.type === 'setTargetAtTime');
      return targetEvs[targetEvs.length - 1];
    });

    assertClose(lastEvents[0]?.target ?? 0, expected.stem1, 0.001, `stem1 target at ${progress}`);
    assertClose(lastEvents[1]?.target ?? 0, expected.stem2, 0.001, `stem2 target at ${progress}`);
    assertClose(lastEvents[2]?.target ?? 0, expected.stem3, 0.001, `stem3 target at ${progress}`);
    assertClose(lastEvents[3]?.target ?? 0, expected.stem4, 0.001, `stem4 target at ${progress}`);
  }
});

await test('4.4 Fanfare handling: classic plays final.mp3; packs without finalTrack delegate to SineFallbackSynthesizer', async () => {
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);

  // 1. Classic has finalTrack -> loads finalBuffer
  await seedPackAssets('classic');
  await player.switchPack('classic');
  assert.ok(player.finalBuffer !== null, 'Classic must populate finalBuffer');

  // Trigger victory fanfare on classic
  player.playFinalFanfare();
  assert.strictEqual(player.getState(), 'stopped');
  assert.ok(player.fanfareSource !== null, 'Classic creates buffer source for final.mp3');

  // 2. Organic has NO finalTrack -> finalBuffer is null
  await seedPackAssets('organic');
  await player.switchPack('organic');
  assert.strictEqual(player.finalBuffer, null, 'Organic finalBuffer must be null');

  // Trigger victory fanfare on organic -> fallback synthesized cleanly without throw
  let fanfareThrew = false;
  try {
    player.playFinalFanfare();
  } catch {
    fanfareThrew = true;
  }
  assert.strictEqual(fanfareThrew, false, 'Organic playFinalFanfare must execute without exception');
  assert.strictEqual(player.getState(), 'stopped');

  // 3. Switch back to classic restores finalBuffer
  await player.switchPack('classic');
  assert.ok(player.finalBuffer !== null, 'Returning to classic restores finalBuffer');
});

await test('4.5 Safe Symbol & bad ID handling, rapid concurrency cancellation, and network drop try-catch', async () => {
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);
  await seedPackAssets('classic');
  await seedPackAssets('organic');
  await seedPackAssets('synth');
  await seedPackAssets('clockwork');
  await player.switchPack('classic');
  player.start();

  // 1. Bad IDs & Symbol handling
  const badInputs = [
    Symbol('badPack'),
    null,
    undefined,
    12345,
    true,
    {},
    [],
    () => {},
    '',
    '   ',
    'unknown_pack',
    'CLASSIC',
    'synth\0bad',
    '<script>alert(1)</script>',
  ];

  for (const bad of badInputs) {
    let threw = false;
    let res = null;
    try {
      res = await player.switchPack(bad);
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, false, `switchPack must not throw on bad input: ${String(bad)}`);
    assert.strictEqual(res, false, `switchPack must return false on bad input: ${String(bad)}`);
    assert.strictEqual(player.getCurrentPackId(), 'classic', 'currentPackId must remain classic');
    assert.strictEqual(player.getState(), 'playing', 'player must remain playing');
    assert.strictEqual(ctx.activeSources.length, 4, 'audio sources undisturbed');
  }

  // 2. Rapid concurrency cancellation: alternating switches in rapid flight
  const p1 = player.switchPack('organic');
  const p2 = player.switchPack('synth');
  const p3 = player.switchPack('clockwork');

  const [res1, res2, res3] = await Promise.all([p1, p2, p3]);
  assert.strictEqual(res1, false, 'Stale organic switch must resolve false');
  assert.strictEqual(res2, false, 'Stale synth switch must resolve false');
  assert.strictEqual(res3, true, 'Final clockwork switch must resolve true');
  assert.strictEqual(player.getCurrentPackId(), 'clockwork', 'Final resolved pack must be clockwork');
  assert.strictEqual(ctx.activeSources.length, 4, 'Exactly 4 sources active');

  // 3. Suspended AudioContext bypasses 500ms crossfade delay
  await ctx.suspend();
  const t0 = Date.now();
  const suspRes = await player.switchPack('organic');
  const elapsed = Date.now() - t0;
  assert.strictEqual(suspRes, true);
  assert.strictEqual(player.getCurrentPackId(), 'organic');
  assert.ok(elapsed < 200, `Suspended context must bypass 500ms delay (${elapsed}ms)`);
  await ctx.resume();

  // 4. Same pack switch short-circuits immediately
  const sameRes = await player.switchPack('organic');
  assert.strictEqual(sameRes, true, 'Same pack switch must short-circuit to true');

  // 5. Network drop try-catch error recovery
  shouldFetchFail = true;
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  let networkRes;
  let networkThrew = false;
  try {
    networkRes = await player.switchPack('synth');
  } catch {
    networkThrew = true;
  } finally {
    shouldFetchFail = false;
  }
  assert.strictEqual(networkThrew, false, 'Network failure must be caught gracefully without throwing');
  assert.strictEqual(networkRes, false, 'Network failure must return false');

  // 6. AudioNavManager & audioNavController facade integration
  const manager = new AudioNavManager();
  await manager.init();
  assert.strictEqual(typeof audioNavController.switchPack, 'function');
  assert.strictEqual(typeof audioNavController.getCurrentPackId, 'function');

  let progressReported = false;
  await seedPackAssets('clockwork');
  const mgrRes = await manager.switchPack('clockwork', (pct) => {
    progressReported = true;
  });
  assert.strictEqual(mgrRes, true, 'manager.switchPack must resolve true');
  assert.strictEqual(manager.getCurrentPackId(), 'clockwork');
  assert.strictEqual(progressReported, true, 'onProgress must be called');
  manager.destroy();
  assert.strictEqual(manager.getCurrentPackId(), 'classic', 'manager resets to classic on destroy');
});

// =============================================================================
// SUMMARY REPORT
// =============================================================================
console.log('\n================================================================');
console.log(`  TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
console.log('================================================================\n');

if (failedTests > 0) {
  console.error('FAILURES DETECTED:');
  for (const f of failures) {
    console.error(`- [FAIL] ${f.name}: ${f.error}`);
  }
  process.exit(1);
} else {
  console.log('>>> ACCEPTANCE VERIFICATION VERDICT: 100% APPROVE <<<');
  console.log('All dynamic audio pack cache isolation, validation, TTL eviction invariants,');
  console.log('and seamless 0.5s live crossfade stems synchronization tests passed cleanly.\n');
  process.exit(0);
}
