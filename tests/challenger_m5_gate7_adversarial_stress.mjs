/**
 * tests/challenger_m5_gate7_adversarial_stress.mjs
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER SUITE (MILESTONE 5 QUALITY GATE 7):
 * Rigorous Stress Testing of Audio Pack Cache Lifecycle and Web Audio Invariants.
 *
 * Focus Areas:
 * 1. Cache Invariant Stress:
 *    - Active Sound Set Protection (30d old, missing, NaN, corrupted, fuzzed strings, parameter omission)
 *    - 10-Day TTL Eviction Precision (864,000,000 ms threshold exact boundary, drift handling, clean deletion)
 *    - Cross-Bucket Cache Isolation (synth vs organic bucket separation, zero contamination)
 * 2. Audio Engine Invariant Stress:
 *    - 0.5s Linear Crossfade Curve (gain ramp formula, target 0.0001, target time now + 0.5, bypass logic)
 *    - Rapid Pack Switching Concurrency (cancellation of in-flight fades, promise resolution, leak freedom)
 *    - Network Error Handling (fetch rejections, 500s, partial failures, audio unmuted restoration)
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
console.log('  CHALLENGER 2: MILESTONE 5 GATE 7 ADVERSARIAL STRESS SUITE     ');
console.log('  Cache Invariants & Audio Engine Resilience Under Hostile Input');
console.log('================================================================\n');

// =============================================================================
// Web Audio & Browser Mock Environment
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
      duration: 10.0,
      length: 441000,
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

const mockLocalStorage = {
  getItem: (key) => storageBackingMap.get(key) ?? null,
  setItem: (key, value) => { storageBackingMap.set(key, String(value)); },
  removeItem: (key) => { storageBackingMap.delete(key); },
  clear: () => { storageBackingMap.clear(); },
  key: (index) => Array.from(storageBackingMap.keys())[index] ?? null,
  get length() { return storageBackingMap.size; },
};

const mockCaches = new MockCacheStorage();

let fetchFailureMode = null; // null | 'reject' | 'status500' | 'partial'
let fetchCallCount = 0;

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
  fetchCallCount++;
  if (fetchFailureMode === 'reject') {
    throw new TypeError('Failed to fetch: Network offline simulation');
  }
  if (fetchFailureMode === 'status500') {
    return {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Map(),
      arrayBuffer: async () => { throw new Error('500 Server Error body unavailable'); },
    };
  }
  if (fetchFailureMode === 'partial') {
    // Fail only on stem-3 or second call
    if (String(url).includes('stem-3') || fetchCallCount === 3) {
      throw new Error('Partial stream disconnect');
    }
  }

  const sampleBuf = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]).buffer;
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
// Import Modules
// =============================================================================

const audioPacksConfig = await import(pathToFileURL(path.resolve(projectRoot, 'src/config/audioPacks.ts')).href);
const {
  AUDIO_PACKS,
  getAudioPack,
  isValidAudioPackId,
  getAudioPackAllFilePaths,
  getAudioPackCacheName,
  extractPackIdFromCacheName,
  DEFAULT_AUDIO_PACK_ID,
} = audioPacksConfig;

const moduleLoader = await import(pathToFileURL(path.resolve(projectRoot, 'src/services/moduleLoader.ts')).href);
const {
  touchAudioPackUsage,
  getAudioPackLastUsed,
  removeAudioPackUsage,
  isAudioPackCachedAndValid,
  getCachedAudioPackAssetBuffer,
  loadAudioPackWithProgress,
  checkAndPurgeExpiredCaches,
  MemoryCacheAdapter,
  RETENTION_PERIOD_MS,
} = moduleLoader;

const stemsModule = await import(pathToFileURL(path.resolve(projectRoot, 'src/modules/audioNav/stems.ts')).href);
const { StemPlayer } = stemsModule;

// Test Execution Harness
let testCount = 0;
let passCount = 0;
let failCount = 0;
const testFailures = [];

async function challenge(name, fn) {
  testCount++;
  try {
    await fn();
    passCount++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failCount++;
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    testFailures.push({ name, error: err.message, stack: err.stack });
  }
}

// Seed helper
async function seedFullPack(packId) {
  const pack = getAudioPack(packId);
  assert.ok(pack, `pack ${packId} exists`);
  const cacheName = getAudioPackCacheName(pack);
  const cache = await mockCaches.open(cacheName);
  const files = getAudioPackAllFilePaths(pack);

  for (const f of files) {
    const buf = new Uint8Array(512).buffer;
    const resp = new MockResponse(buf, {
      status: 200,
      headers: [['content-type', 'audio/mp4'], ['content-length', '512']],
    });
    await cache.put(f, resp.clone());
    await cache.put(`http://localhost:5173/${f}`, resp.clone());
    await MemoryCacheAdapter.put(cacheName, f, buf.slice(0));
    await MemoryCacheAdapter.put(cacheName, `http://localhost:5173/${f}`, buf.slice(0));
  }
}

// =============================================================================
// CHALLENGE SECTION 1: Cache Invariant Stress
// =============================================================================
console.log('--- SECTION 1: Cache Invariant Stress ---');

await challenge('1.1 Active Sound Set Protection: 30-day and 100-day stale timestamp NEVER evicted', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Active: organic (100 days old)
  await seedFullPack('organic');
  mockLocalStorage.setItem('audio_pack_last_used_organic', String(now - 100 * dayMs));

  // Inactive: synth (30 days old)
  await seedFullPack('synth');
  mockLocalStorage.setItem('audio_pack_last_used_synth', String(now - 30 * dayMs));

  // Inactive: clockwork (12 days old)
  await seedFullPack('clockwork');
  mockLocalStorage.setItem('audio_pack_last_used_clockwork', String(now - 12 * dayMs));

  const result = await checkAndPurgeExpiredCaches('organic');

  // Hard Invariant: organic MUST NOT be purged
  assert.ok(!result.purgedPacks.includes('organic'), 'Active organic must not be in purgedPacks');
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('organic')), true, 'Active cache preserved');
  assert.strictEqual(MemoryCacheAdapter.has(getAudioPackCacheName('organic')), true, 'Active MemoryCache preserved');
  assert.strictEqual(mockLocalStorage.getItem('audio_pack_last_used_organic'), String(now - 100 * dayMs), 'Active timestamp preserved');

  // Both expired inactive packs must be purged
  assert.ok(result.purgedPacks.includes('synth'), 'Inactive synth purged');
  assert.ok(result.purgedPacks.includes('clockwork'), 'Inactive clockwork purged');
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('synth')), false);
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('clockwork')), false);
});

await challenge('1.2 Active Sound Set Protection: Missing, untracked, null timestamp NEVER evicted', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();

  // Active: synth (NO entry in localStorage)
  await seedFullPack('synth');
  mockLocalStorage.removeItem('audio_pack_last_used_synth');

  // Inactive: organic (NO entry in localStorage -> orphaned inactive)
  await seedFullPack('organic');
  mockLocalStorage.removeItem('audio_pack_last_used_organic');

  const result = await checkAndPurgeExpiredCaches('synth');

  assert.ok(!result.purgedPacks.includes('synth'), 'Active synth must be preserved without timestamp');
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('synth')), true, 'Synth cache bucket intact');
  assert.ok(result.purgedPacks.includes('organic'), 'Orphaned inactive organic must be purged');
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('organic')), false, 'Organic cache bucket deleted');
});

await challenge('1.3 Active Sound Set Protection: Adversarial corrupted timestamps (NaN, negative, fuzzed JSON, symbols)', async () => {
  const hostilePayloads = [
    'NaN',
    '-99999999999',
    'Infinity',
    '-Infinity',
    'undefined',
    'null',
    '""',
    '{}',
    '{"corrupted":true}',
    '[1, 2, 3]',
    '0',
    'true',
    'false',
    'SQL_INJECTION;DROP TABLE',
    '<script>alert("xss")</script>',
    '\x00\x01\x02\xFF',
    '   12345   ',
  ];

  for (const hostile of hostilePayloads) {
    mockCaches.clear();
    MemoryCacheAdapter.clear();
    mockLocalStorage.clear();

    // Active: clockwork with hostile timestamp
    await seedFullPack('clockwork');
    mockLocalStorage.setItem('audio_pack_last_used_clockwork', hostile);

    // Inactive: synth (expired)
    await seedFullPack('synth');
    mockLocalStorage.setItem('audio_pack_last_used_synth', String(Date.now() - 15 * 86400000));

    let res;
    try {
      res = await checkAndPurgeExpiredCaches('clockwork');
    } catch (err) {
      assert.fail(`checkAndPurgeExpiredCaches threw on hostile active timestamp "${hostile}": ${err.message}`);
    }

    assert.ok(!res.purgedPacks.includes('clockwork'), `Active clockwork must survive hostile payload "${hostile}"`);
    assert.strictEqual(await mockCaches.has(getAudioPackCacheName('clockwork')), true, `Clockwork cache preserved for "${hostile}"`);
    assert.ok(res.purgedPacks.includes('synth'), `Inactive synth must be purged`);
  }
});

await challenge('1.4 Active Sound Set Protection: Resolution fallback (explicit param, settings JSON, default classic)', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();

  // Test 1: Inferred from maze_daily_settings_v1
  mockLocalStorage.setItem('maze_daily_settings_v1', JSON.stringify({
    selectedAudioPack: 'organic',
    theme: 'dark',
  }));
  await seedFullPack('organic');
  await seedFullPack('classic');
  mockLocalStorage.setItem('audio_pack_last_used_organic', String(Date.now() - 40 * 86400000));
  mockLocalStorage.setItem('audio_pack_last_used_classic', String(Date.now() - 40 * 86400000));

  const res1 = await checkAndPurgeExpiredCaches(); // no param
  assert.ok(!res1.purgedPacks.includes('organic'), 'Inferred active pack organic must be preserved');
  assert.ok(res1.purgedPacks.includes('classic'), 'Expired classic must be purged when organic is active');
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('organic')), true);
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('classic')), false);

  // Test 2: Inferred fallback to default 'classic' when settings missing or invalid JSON
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();
  mockLocalStorage.setItem('maze_daily_settings_v1', '{invalid_json_syntax');

  await seedFullPack('classic');
  await seedFullPack('synth');
  mockLocalStorage.setItem('audio_pack_last_used_classic', String(Date.now() - 50 * 86400000));
  mockLocalStorage.setItem('audio_pack_last_used_synth', String(Date.now() - 50 * 86400000));

  const res2 = await checkAndPurgeExpiredCaches(); // no param
  assert.ok(!res2.purgedPacks.includes('classic'), 'Default fallback classic must be preserved on corrupt settings');
  assert.ok(res2.purgedPacks.includes('synth'), 'Inactive synth must be purged');
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('classic')), true);
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('synth')), false);
});

await challenge('1.5 10-Day TTL Precision: Exact 864,000,000 ms boundary test', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();

  const now = Date.now();
  const TTL = 864000000; // exact 10 days in ms
  assert.strictEqual(RETENTION_PERIOD_MS, TTL, 'RETENTION_PERIOD_MS must be 864,000,000 ms');

  // Pack A (clockwork): 864,000,000 - 1,000 ms (fresh: 9 days, 23 hours, 59 min, 59 sec old)
  await seedFullPack('clockwork');
  mockLocalStorage.setItem('audio_pack_last_used_clockwork', String(now - (TTL - 1000)));

  // Pack B (synth): 864,000,000 + 1,000 ms (expired: 10 days, 0 hours, 0 min, 1 sec old)
  await seedFullPack('synth');
  mockLocalStorage.setItem('audio_pack_last_used_synth', String(now - (TTL + 1000)));

  // Pack C (classic): Active
  await seedFullPack('classic');
  mockLocalStorage.setItem('audio_pack_last_used_classic', String(now));

  const res = await checkAndPurgeExpiredCaches('classic');

  // Clockwork is under TTL by 1 second -> PRESERVED
  assert.ok(!res.purgedPacks.includes('clockwork'), 'clockwork (under TTL by 1s) MUST NOT be purged');
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('clockwork')), true, 'clockwork cache bucket preserved');
  assert.strictEqual(mockLocalStorage.getItem('audio_pack_last_used_clockwork'), String(now - (TTL - 1000)), 'clockwork timestamp preserved');

  // Synth is over TTL by 1 second -> PURGED
  assert.ok(res.purgedPacks.includes('synth'), 'synth (over TTL by 1s) MUST be purged');
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('synth')), false, 'synth cache bucket deleted');
  assert.strictEqual(mockLocalStorage.getItem('audio_pack_last_used_synth'), null, 'synth timestamp deleted');
});

await challenge('1.6 10-Day TTL Precision: Clock drift future timestamp tolerance', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();

  const now = Date.now();

  // Inactive pack with timestamp 2 hours in the future
  await seedFullPack('organic');
  mockLocalStorage.setItem('audio_pack_last_used_organic', String(now + 2 * 3600 * 1000));

  // Inactive pack with timestamp 3 days in the future (> 24h drift)
  await seedFullPack('synth');
  mockLocalStorage.setItem('audio_pack_last_used_synth', String(now + 3 * 86400000));

  await seedFullPack('classic');

  const res = await checkAndPurgeExpiredCaches('classic');

  // Neither future pack should be evicted
  assert.ok(!res.purgedPacks.includes('organic'), 'Near future pack preserved');
  assert.ok(!res.purgedPacks.includes('synth'), 'Drifted future pack normalized and preserved');
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('organic')), true);
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('synth')), true);

  // Synth timestamp should be normalized to now
  const normalizedSynthTs = Number(mockLocalStorage.getItem('audio_pack_last_used_synth'));
  assert.ok(Math.abs(normalizedSynthTs - now) < 5000, 'Future drift normalized close to current time');
});

await challenge('1.7 Cross-Bucket Isolation: synth assets do NOT satisfy or contaminate organic bucket', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();

  // Seed synth completely
  await seedFullPack('synth');

  // Ensure organic cache is completely empty and unseeded
  assert.strictEqual(await mockCaches.has(getAudioPackCacheName('organic')), false);

  // Validate: organic must return false
  const organicValid = await isAudioPackCachedAndValid('organic');
  assert.strictEqual(organicValid, false, 'Organic must be invalid when only synth is seeded');

  // Attempt retrieving organic asset without network
  fetchFailureMode = 'reject';
  try {
    await assert.rejects(
      async () => {
        await getCachedAudioPackAssetBuffer('organic', 'audio/packs/organic/stem-1.m4a');
      },
      /Failed to fetch/,
      'Organic asset request must not find synth asset and must fail when network is offline'
    );
  } finally {
    fetchFailureMode = null;
  }

  // Cross-bucket name verification
  const synthBucket = getAudioPackCacheName('synth');
  const organicBucket = getAudioPackCacheName('organic');
  assert.notStrictEqual(synthBucket, organicBucket, 'Bucket names must be distinct');
  assert.strictEqual(synthBucket, 'maze-pack-synth-v1.0.0');
  assert.strictEqual(organicBucket, 'maze-pack-organic-v1.0.0');

  // Verify that synth bucket contains only synth paths
  const sCache = await mockCaches.open(synthBucket);
  const organicLeakInSynth = await sCache.match('audio/packs/organic/stem-1.m4a');
  assert.strictEqual(organicLeakInSynth, null, 'Synth bucket must not contain organic paths');
});

// =============================================================================
// CHALLENGE SECTION 2: Audio Engine Invariant Stress
// =============================================================================
console.log('\n--- SECTION 2: Audio Engine Invariant Stress ---');

await challenge('2.1 0.5s Linear Crossfade Curve: Formula, target gain 0.0001, and target time verification', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();

  await seedFullPack('classic');
  await seedFullPack('synth');

  const ctx = new MockAudioContext();
  ctx.currentTime = 100.0;
  const dest = ctx.createGain();

  const player = new StemPlayer();
  await player.init(ctx, dest);
  await player.switchPack('classic');
  player.start();

  assert.strictEqual(player.getState(), 'playing');
  const bus = player.getStemsBus();
  assert.ok(bus, 'stemsBus exists');

  const eventsCountBefore = bus.gain.events.length;

  // Trigger live switch to synth
  await player.switchPack('synth');

  const events = bus.gain.events.slice(eventsCountBefore);

  // Invariant 1: cancelScheduledValues(now)
  const cancelEv = events.find((e) => e.type === 'cancelScheduledValues');
  assert.ok(cancelEv, 'Must cancel scheduled values');
  assert.strictEqual(cancelEv.time, 100.0);

  // Invariant 2: setValueAtTime(currentGain, now)
  const setEv = events.find((e) => e.type === 'setValueAtTime');
  assert.ok(setEv, 'Must anchor current gain at now');
  assert.strictEqual(setEv.time, 100.0);

  // Invariant 3: linearRampToValueAtTime(0.0001, now + 0.5)
  const rampEv = events.find((e) => e.type === 'linearRampToValueAtTime');
  assert.ok(rampEv, 'Must schedule linear ramp to 0.0001 over 0.5s');
  assert.strictEqual(rampEv.value, 0.0001, 'Target value must be strictly 0.0001');
  assert.ok(Math.abs(rampEv.time - (100.0 + 0.5)) < 0.001, 'Target time must be exactly now + 0.5s');

  // Invariant 4: Gain restored to 1.0 after crossfade completion
  const restoreEv = events[events.length - 1];
  assert.strictEqual(restoreEv.type, 'setValueAtTime');
  assert.strictEqual(restoreEv.value, 1.0, 'Gain restored to 1.0');
});

await challenge('2.2 0.5s Crossfade Curve: Stopped/suspended state bypasses 500ms delay', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();

  await seedFullPack('classic');
  await seedFullPack('organic');

  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);
  await player.switchPack('classic');

  // Player state is 'ready' (not 'playing')
  assert.strictEqual(player.getState(), 'ready');

  const t0 = Date.now();
  const res = await player.switchPack('organic');
  const elapsed = Date.now() - t0;

  assert.strictEqual(res, true);
  assert.strictEqual(player.getCurrentPackId(), 'organic');
  assert.ok(elapsed < 200, `Non-playing state must bypass 500ms delay (actual: ${elapsed}ms)`);
});

await challenge('2.3 Rapid Pack Switching Concurrency: Race cancellation, promise resolution, zero leaks', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();

  await seedFullPack('classic');
  await seedFullPack('organic');
  await seedFullPack('synth');
  await seedFullPack('clockwork');

  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);
  await player.switchPack('classic');
  player.start();

  assert.strictEqual(player.getState(), 'playing');
  assert.strictEqual(ctx.activeSources.length, 4, '4 initial active sources');

  // Trigger rapid alternating switches concurrently across non-current packs
  const switches = [
    player.switchPack('organic'),
    player.switchPack('synth'),
    player.switchPack('clockwork'),
    player.switchPack('organic'),
    player.switchPack('synth'),
    player.switchPack('clockwork'),
    player.switchPack('organic'), // Final desired pack
  ];

  const results = await Promise.all(switches);

  // Only the last switch should succeed (true); all earlier must be cancelled (false)
  for (let i = 0; i < results.length - 1; i++) {
    assert.strictEqual(results[i], false, `Stale switch index ${i} must resolve false`);
  }
  assert.strictEqual(results[results.length - 1], true, 'Final switch must resolve true');
  assert.strictEqual(player.getCurrentPackId(), 'organic', 'Current pack must be organic');
  assert.strictEqual(player.getState(), 'playing', 'Player remains playing');

  // Node leak invariant: exactly 4 sources active in AudioContext, no zombie nodes
  assert.strictEqual(ctx.activeSources.length, 4, 'Active sources count must remain strictly 4 (no leaks)');

  // Verify stem gain nodes are intact and exactly 4
  assert.strictEqual(player.stemGainNodes?.length, 4, 'Stem gain nodes length must be 4');
});

await challenge('2.4 Rapid Switching Edge Case: In-flight switch behavior when switching back to currentPackId', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();

  await seedFullPack('classic');
  await seedFullPack('synth');

  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);
  await player.switchPack('classic');
  player.start();

  assert.strictEqual(player.getCurrentPackId(), 'classic');

  // Call switchPack('synth') which starts an in-flight switch
  const p1 = player.switchPack('synth');

  // Immediately call switchPack('classic') while synth is in-flight
  const p2 = player.switchPack('classic');

  const [res1, res2] = await Promise.all([p1, p2]);

  console.log(`       [Observation] In-flight switch back to currentPackId: res1(synth)=${res1}, res2(classic)=${res2}, finalPack=${player.getCurrentPackId()}`);
});

await challenge('2.5 Network Error Handling: Fetch rejection during uncached pack download', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();

  await seedFullPack('classic');
  // organic is UNCACHED

  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);
  await player.switchPack('classic');
  player.start();

  assert.strictEqual(player.getState(), 'playing');
  assert.strictEqual(player.getCurrentPackId(), 'classic');

  // Simulate network rejection
  fetchFailureMode = 'reject';
  fetchCallCount = 0;

  let switchResult;
  let threw = false;
  try {
    switchResult = await player.switchPack('organic');
  } catch (err) {
    threw = true;
  } finally {
    fetchFailureMode = null;
  }

  // Invariant 1: Must NOT throw unhandled rejection
  assert.strictEqual(threw, false, 'switchPack must not throw on network failure');

  // Invariant 2: Must return false
  assert.strictEqual(switchResult, false, 'switchPack must return false on failed download');

  // Invariant 3: Player audio must NOT be left muted/broken
  assert.strictEqual(player.getState(), 'playing', 'Player remains in playing state');
  const bus = player.getStemsBus();
  assert.ok(bus, 'stemsBus is valid');
  assert.strictEqual(bus.gain.value, 1.0, 'stemsBus.gain must be restored to 1.0');
});

await challenge('2.6 Network Error Handling: HTTP 500 server error during asset fetch', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();

  await seedFullPack('classic');

  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);
  await player.switchPack('classic');
  player.start();

  // Simulate HTTP 500 server error
  fetchFailureMode = 'status500';

  let switchResult;
  let threw = false;
  try {
    switchResult = await player.switchPack('synth');
  } catch {
    threw = true;
  } finally {
    fetchFailureMode = null;
  }

  assert.strictEqual(threw, false, 'switchPack must not throw on HTTP 500');
  assert.strictEqual(switchResult, false, 'switchPack returns false on HTTP 500');
  assert.strictEqual(player.getState(), 'playing');
  assert.strictEqual(player.getStemsBus()?.gain.value, 1.0, 'Gain is restored');
});

await challenge('2.7 Network Error Handling: Partial download failure recovers safely', async () => {
  mockCaches.clear();
  MemoryCacheAdapter.clear();
  mockLocalStorage.clear();

  await seedFullPack('classic');

  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);
  await player.switchPack('classic');
  player.start();

  // Simulate stream failure midway through download
  fetchFailureMode = 'partial';
  fetchCallCount = 0;

  let switchResult;
  let threw = false;
  try {
    switchResult = await player.switchPack('clockwork');
  } catch {
    threw = true;
  } finally {
    fetchFailureMode = null;
  }

  assert.strictEqual(threw, false, 'switchPack must catch partial stream failure gracefully');
  assert.strictEqual(switchResult, false, 'switchPack returns false on partial stream failure');
  assert.strictEqual(player.getState(), 'playing');
  assert.strictEqual(player.getStemsBus()?.gain.value, 1.0);
});

// =============================================================================
// SUMMARY REPORT
// =============================================================================
console.log('\n================================================================');
console.log(`  TOTAL CHALLENGE TESTS: ${testCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
console.log('================================================================\n');

if (failCount > 0) {
  console.error('FAILURES DETECTED IN CHALLENGER 2 SUITE:');
  for (const f of testFailures) {
    console.error(`- [FAIL] ${f.name}: ${f.error}`);
  }
  process.exit(1);
} else {
  console.log('>>> EMPIRICAL CHALLENGER 2 VERDICT: APPROVE <<<');
  console.log('All cache lifecycle invariants (active sound set protection, 10d TTL precision,');
  console.log('cross-bucket isolation) and audio engine invariants (0.5s linear crossfade curve,');
  console.log('rapid switching concurrency, network fault tolerance) empirically verified with 100% success.\n');
  process.exit(0);
}
