/**
 * tests/challenger_m3_packs_adversarial_stress.mjs
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER SUITE (MILESTONE 3):
 * 1. Topological Progress Sync:
 *    - Pack switches at progress = 0.0, 0.25, 0.50, 0.75, 0.99, 1.0.
 *    - Verification that after switch, the 4 stem gain levels match calculateQuartileGains(progress) exactly.
 *    - Equal-power and linear crossfade curves.
 *    - Dynamic mid-crossfade progress modulation.
 * 2. Fanfare Behavior across all 4 packs:
 *    - classic: plays AudioBuffer from final.mp3, finalBuffer !== null, SineFallback is NOT called.
 *    - organic: finalBuffer === null, delegates to SineFallbackSynthesizer.playFanfare().
 *    - synth: finalBuffer === null, delegates to SineFallbackSynthesizer.playFanfare().
 *    - clockwork: finalBuffer === null, delegates to SineFallbackSynthesizer.playFanfare().
 *    - Re-arming & cycling back to classic.
 *    - Corrupt finalTrack fallback to SineFallback.
 * 3. Progress Callbacks:
 *    - onProgress invoked with strictly integer percentages during uncached downloads.
 *    - Monotonic, bounded [0, 100], terminal 100%.
 *    - Cached hit and idempotent switch reporting.
 * 4. Concurrency & Edge Cases:
 *    - Rapid token cancellation hammering.
 *    - Invalid pack IDs.
 *    - Network error resilience.
 */

import assert from 'node:assert/strict';
import { register } from 'node:module';

try {
  register(new URL('./ts_resolver.mjs', import.meta.url).href);
} catch {
  // Already registered
}

// ============================================================================
// Web Audio & Browser Mock Environment
// ============================================================================

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
    this.startTime = null;
    this.stopTime = null;
    this.onended = null;
    this.context.allCreatedOscillators.push(this);
  }
  start(time = 0) {
    this.started = true;
    this.startTime = time;
    this.context.activeOscillators.push(this);
  }
  stop(time = 0) {
    this.stopped = true;
    this.stopTime = time;
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
    this.context.allCreatedSources.push(this);
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
    this.currentTime = 100.0;
    this.state = 'running';
    this.destination = new MockGainNode(this, 1.0);
    this.activeSources = [];
    this.activeOscillators = [];
    this.allCreatedOscillators = [];
    this.allCreatedSources = [];
    this.decodedBuffersCount = 0;
  }
  createGain() { return new MockGainNode(this); }
  createOscillator() { return new MockOscillatorNode(this); }
  createStereoPanner() { return new MockStereoPannerNode(this); }
  createBiquadFilter() { return new MockBiquadFilterNode(this); }
  createBufferSource() { return new MockAudioBufferSourceNode(this); }
  decodeAudioData(buffer, success, failure) {
    this.decodedBuffersCount++;
    const mockAudioBuffer = {
      duration: 12.0,
      length: 529200,
      numberOfChannels: 2,
      sampleRate: 44100,
      __id: `buffer_${this.decodedBuffersCount}`,
    };
    if (success) success(mockAudioBuffer);
    return Promise.resolve(mockAudioBuffer);
  }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
}

class MockLocalStorage {
  constructor() { this.store = new Map(); }
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

class MockCache {
  constructor(name) {
    this.name = name;
    this.map = new Map();
  }
  async put(req, resp) {
    const url = typeof req === 'string' ? req : req.url;
    this.map.set(url, resp);
  }
  async match(req) {
    const url = typeof req === 'string' ? req : req.url;
    return this.map.get(url) || null;
  }
}

class MockCacheStorage {
  constructor() { this.caches = new Map(); }
  async open(name) {
    let c = this.caches.get(name);
    if (!c) { c = new MockCache(name); this.caches.set(name, c); }
    return c;
  }
  async has(name) { return this.caches.has(name); }
  async delete(name) { return this.caches.delete(name); }
  async keys() { return Array.from(this.caches.keys()); }
}

const mockLocalStorage = new MockLocalStorage();
const mockCaches = new MockCacheStorage();

globalThis.window = {
  localStorage: mockLocalStorage,
  AudioContext: MockAudioContext,
  caches: mockCaches,
  location: { href: 'http://localhost:5173/' },
};
globalThis.localStorage = mockLocalStorage;
globalThis.caches = mockCaches;
globalThis.document = {
  baseURI: 'http://localhost:5173/',
  documentElement: { lang: 'en' },
};

// Configurable fetch mock to support chunked streaming responses
let fetchFailPattern = null;

globalThis.fetch = async (url) => {
  const urlStr = String(url);
  if (fetchFailPattern && fetchFailPattern.test(urlStr)) {
    throw new Error(`Network failure simulated for ${urlStr}`);
  }

  const assetSize = 400000;
  return {
    ok: true,
    status: 200,
    headers: new Map([
      ['content-type', 'audio/mp4'],
      ['content-length', String(assetSize)],
    ]),
    arrayBuffer: async () => new ArrayBuffer(2048),
    body: {
      getReader: () => {
        const totalChunks = 5;
        const chunkSize = Math.floor(assetSize / totalChunks);
        let delivered = 0;
        return {
          read: async () => {
            if (delivered >= totalChunks) {
              return { done: true, value: undefined };
            }
            delivered++;
            return {
              done: false,
              value: new Uint8Array(chunkSize),
            };
          },
        };
      },
    },
    clone: function() { return this; },
  };
};

// ============================================================================
// Real Module Imports
// ============================================================================
const { StemPlayer, calculateQuartileGains, SineFallbackSynthesizer } =
  await import('../src/modules/audioNav/stems.ts');
const { AudioNavManager, audioNavController } =
  await import('../src/modules/audioNav/index.ts');
const { AUDIO_PACKS, AUDIO_PACK_IDS } =
  await import('../src/config/audioPacks.ts');

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;

function check(cond, msg) {
  totalAssertions++;
  if (cond) {
    passedAssertions++;
    console.log(`  [PASS] ${msg}`);
  } else {
    failedAssertions++;
    console.error(`  [FAIL] ${msg}`);
  }
}

function checkCloseTo(act, exp, tol = 1e-4, msg = '') {
  const diff = Math.abs(act - exp);
  check(diff <= tol, `${msg} (expected: ${exp.toFixed(5)}, actual: ${act.toFixed(5)}, diff: ${diff.toFixed(6)})`);
}

console.log('======================================================================');
console.log('  EMPIRICAL CHALLENGER STRESS SUITE: TOPOLOGICAL SYNC & FANFARE');
console.log('======================================================================\n');

// ============================================================================
// SECTION 1: Adversarial Topological Progress Sync
// ============================================================================
console.log('--- SECTION 1: Topological Progress Sync Across All 4 Audio Packs ---');

const testProgressPoints = [0.0, 0.25, 0.50, 0.75, 0.99, 1.0];
const packTransitions = [
  { from: 'classic', to: 'organic' },
  { from: 'organic', to: 'synth' },
  { from: 'synth', to: 'clockwork' },
  { from: 'clockwork', to: 'classic' },
  { from: 'classic', to: 'clockwork' },
  { from: 'clockwork', to: 'synth' },
  { from: 'synth', to: 'organic' },
  { from: 'organic', to: 'classic' },
];

for (const { from, to } of packTransitions) {
  for (const prog of testProgressPoints) {
    const ctx = new MockAudioContext();
    const dest = ctx.createGain();
    const player = new StemPlayer();
    await player.init(ctx, dest);

    // Initial pack setup
    await player.switchPack(from);
    player.updateProgress(prog);
    player.start();

    check(player.getState() === 'playing', `Player started playing on "${from}" at progress ${prog}`);

    // Perform live switch to target pack
    const switchRes = await player.switchPack(to);
    check(switchRes === true, `switchPack("${to}") from "${from}" at progress ${prog} resolved true`);
    check(player.getCurrentPackId() === to, `currentPackId is now "${to}"`);
    check(player.getState() === 'playing', `Player resumed playback automatically on "${to}"`);

    // Verify 4 stem gain nodes
    const nodes = player.stemGainNodes;
    check(Boolean(nodes) && nodes.length === 4, `4 stem gain nodes exist after switch to "${to}"`);

    // Calculate expected gains
    const expGains = calculateQuartileGains(prog, 'equal-power');

    // Verify stem gain values match calculateQuartileGains(progress) exactly
    checkCloseTo(nodes[0].gain.value, expGains.stem1, 1e-4, `[${from}->${to} @ ${prog}] Stem 1 gain`);
    checkCloseTo(nodes[1].gain.value, expGains.stem2, 1e-4, `[${from}->${to} @ ${prog}] Stem 2 gain`);
    checkCloseTo(nodes[2].gain.value, expGains.stem3, 1e-4, `[${from}->${to} @ ${prog}] Stem 3 gain`);
    checkCloseTo(nodes[3].gain.value, expGains.stem4, 1e-4, `[${from}->${to} @ ${prog}] Stem 4 gain`);

    // Verify mono downmixing contract
    nodes.forEach((g, idx) => {
      check(g.channelCount === 1, `[${from}->${to} @ ${prog}] Stem ${idx + 1} channelCount === 1`);
      check(g.channelCountMode === 'explicit', `[${from}->${to} @ ${prog}] Stem ${idx + 1} channelCountMode === explicit`);
    });

    // Verify 4 active looped sources
    check(ctx.activeSources.length === 4, `[${from}->${to} @ ${prog}] Exactly 4 active AudioBufferSourceNodes`);
    ctx.activeSources.forEach((src, idx) => {
      check(src.loop === true, `[${from}->${to} @ ${prog}] Source ${idx + 1} loop === true`);
      check(src.loopStart === 0, `[${from}->${to} @ ${prog}] Source ${idx + 1} loopStart === 0`);
    });

    player.destroy();
  }
}

// ----------------------------------------------------------------------------
// Section 1.B: Linear Crossfade Curve Conformance
// ----------------------------------------------------------------------------
console.log('\n--- Section 1.B: Linear Crossfade Curve Conformance ---');
{
  for (const prog of [0.125, 0.375, 0.625, 0.875]) {
    const ctx = new MockAudioContext();
    const dest = ctx.createGain();
    const player = new StemPlayer({ crossfadeCurve: 'linear' });
    await player.init(ctx, dest);

    await player.switchPack('classic');
    player.updateProgress(prog);
    player.start();

    await player.switchPack('synth');

    const expLinear = calculateQuartileGains(prog, 'linear');
    const nodes = player.stemGainNodes;

    checkCloseTo(nodes[0].gain.value, expLinear.stem1, 1e-4, `[Linear @ ${prog}] Stem 1 gain`);
    checkCloseTo(nodes[1].gain.value, expLinear.stem2, 1e-4, `[Linear @ ${prog}] Stem 2 gain`);
    checkCloseTo(nodes[2].gain.value, expLinear.stem3, 1e-4, `[Linear @ ${prog}] Stem 3 gain`);
    checkCloseTo(nodes[3].gain.value, expLinear.stem4, 1e-4, `[Linear @ ${prog}] Stem 4 gain`);

    player.destroy();
  }
}

// ----------------------------------------------------------------------------
// Section 1.C: Dynamic Mid-Crossfade Progress Modulation
// ----------------------------------------------------------------------------
console.log('\n--- Section 1.C: Dynamic Mid-Crossfade Progress Modulation ---');
{
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);

  await player.switchPack('classic');
  player.updateProgress(0.10);
  player.start();

  // Trigger switch (which has 500ms crossfade)
  const switchPromise = player.switchPack('organic');

  // Change progress mid-flight while crossfading
  await new Promise((r) => setTimeout(r, 100));
  player.updateProgress(0.85); // Teleported near exit mid-transition!

  await switchPromise;

  const expectedGains = calculateQuartileGains(0.85, 'equal-power');
  const nodes = player.stemGainNodes;

  checkCloseTo(nodes[0].gain.value, expectedGains.stem1, 1e-4, 'Stem 1 matches mid-crossfade updated progress (0.85)');
  checkCloseTo(nodes[1].gain.value, expectedGains.stem2, 1e-4, 'Stem 2 matches mid-crossfade updated progress (0.85)');
  checkCloseTo(nodes[2].gain.value, expectedGains.stem3, 1e-4, 'Stem 3 matches mid-crossfade updated progress (0.85)');
  checkCloseTo(nodes[3].gain.value, expectedGains.stem4, 1e-4, 'Stem 4 matches mid-crossfade updated progress (0.85)');

  player.destroy();
}

// ============================================================================
// SECTION 2: Adversarial Fanfare Behavior Across All 4 Packs
// ============================================================================
console.log('\n--- SECTION 2: Fanfare Behavior Across All 4 Audio Packs ---');

// Setup Spy on SineFallbackSynthesizer.prototype.playFanfare
let sineFallbackPlayFanfareCalls = 0;
const origPlayFanfare = SineFallbackSynthesizer.prototype.playFanfare;
SineFallbackSynthesizer.prototype.playFanfare = function(...args) {
  sineFallbackPlayFanfareCalls++;
  return origPlayFanfare.apply(this, args);
};

// 2.A: Classic Pack Fanfare (Plays AudioBuffer final.mp3)
console.log('\n--- 2.A: Classic Pack Fanfare ---');
{
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);

  sineFallbackPlayFanfareCalls = 0;
  await player.switchPack('classic');

  check(player.finalBuffer !== null, 'Classic pack: finalBuffer is NOT null');
  check(typeof player.finalBuffer === 'object', 'Classic pack: finalBuffer is decoded AudioBuffer');

  player.playFinalFanfare();

  check(sineFallbackPlayFanfareCalls === 0, 'Classic fanfare: SineFallbackSynthesizer.playFanfare was NOT called');
  check(player.getState() === 'stopped', 'Classic fanfare: Player transitioned to stopped');
  check(player.fanfareSource !== null, 'Classic fanfare: fanfareSource was instantiated');
  check(player.fanfareSource.buffer === player.finalBuffer, 'Classic fanfare: fanfareSource plays finalBuffer');
  check(player.fanfareSource.started === true, 'Classic fanfare: fanfareSource.start() was called');
  check(player.fanfareSource.loop === false, 'Classic fanfare: fanfareSource.loop === false');

  player.destroy();
}

// 2.B: Organic Pack Fanfare (finalBuffer null -> SineFallback)
console.log('\n--- 2.B: Organic Pack Fanfare ---');
{
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);

  sineFallbackPlayFanfareCalls = 0;
  await player.switchPack('organic');

  check(player.finalBuffer === null, 'Organic pack: finalBuffer is strictly null');

  const oscCountBefore = ctx.allCreatedOscillators.length;
  player.playFinalFanfare();

  check(sineFallbackPlayFanfareCalls === 1, 'Organic fanfare: Delegates to SineFallbackSynthesizer.playFanfare()');
  check(player.getState() === 'stopped', 'Organic fanfare: Player transitioned to stopped');
  check(player.fanfareSource === null, 'Organic fanfare: No fanfareSource buffer source');
  const newOscs = ctx.allCreatedOscillators.slice(oscCountBefore);
  check(newOscs.length === 5, 'Organic fanfare: 5 pentatonic sine oscillators created');
  check(newOscs.every((o) => o.started), 'Organic fanfare: All 5 pentatonic oscillators started');

  player.destroy();
}

// 2.C: Synth Pack Fanfare (finalBuffer null -> SineFallback)
console.log('\n--- 2.C: Synth Pack Fanfare ---');
{
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);

  sineFallbackPlayFanfareCalls = 0;
  await player.switchPack('synth');

  check(player.finalBuffer === null, 'Synth pack: finalBuffer is strictly null');

  const oscCountBefore = ctx.allCreatedOscillators.length;
  player.playFinalFanfare();

  check(sineFallbackPlayFanfareCalls === 1, 'Synth fanfare: Delegates to SineFallbackSynthesizer.playFanfare()');
  check(player.getState() === 'stopped', 'Synth fanfare: Player transitioned to stopped');
  check(player.fanfareSource === null, 'Synth fanfare: No fanfareSource buffer source');
  const newOscs = ctx.allCreatedOscillators.slice(oscCountBefore);
  check(newOscs.length === 5, 'Synth fanfare: 5 pentatonic sine oscillators created');
  check(newOscs.every((o) => o.started), 'Synth fanfare: All 5 pentatonic oscillators started');

  player.destroy();
}

// 2.D: Clockwork Pack Fanfare (finalBuffer null -> SineFallback)
console.log('\n--- 2.D: Clockwork Pack Fanfare ---');
{
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);

  sineFallbackPlayFanfareCalls = 0;
  await player.switchPack('clockwork');

  check(player.finalBuffer === null, 'Clockwork pack: finalBuffer is strictly null');

  const oscCountBefore = ctx.allCreatedOscillators.length;
  player.playFinalFanfare();

  check(sineFallbackPlayFanfareCalls === 1, 'Clockwork fanfare: Delegates to SineFallbackSynthesizer.playFanfare()');
  check(player.getState() === 'stopped', 'Clockwork fanfare: Player transitioned to stopped');
  check(player.fanfareSource === null, 'Clockwork fanfare: No fanfareSource buffer source');
  const newOscs = ctx.allCreatedOscillators.slice(oscCountBefore);
  check(newOscs.length === 5, 'Clockwork fanfare: 5 pentatonic sine oscillators created');
  check(newOscs.every((o) => o.started), 'Clockwork fanfare: All 5 pentatonic oscillators started');

  player.destroy();
}

// 2.E: Sequential Pack Fanfare Cycling & Buffer State Cleansing
console.log('\n--- 2.E: Sequential Cycling: Classic -> Organic -> Classic -> Synth -> Clockwork ---');
{
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);

  // 1. Classic
  sineFallbackPlayFanfareCalls = 0;
  await player.switchPack('classic');
  check(player.finalBuffer !== null, 'Cycle 1 (classic): finalBuffer loaded');
  player.playFinalFanfare();
  check(sineFallbackPlayFanfareCalls === 0, 'Cycle 1: Buffer played, SineFallback not called');

  // 2. Switch to Organic (must reset finalBuffer to null!)
  sineFallbackPlayFanfareCalls = 0;
  await player.switchPack('organic');
  check(player.finalBuffer === null, 'Cycle 2 (organic): finalBuffer reset to null');
  player.playFinalFanfare();
  check(sineFallbackPlayFanfareCalls === 1, 'Cycle 2: Delegates to SineFallback');

  // 3. Switch back to Classic (must restore finalBuffer!)
  sineFallbackPlayFanfareCalls = 0;
  await player.switchPack('classic');
  check(player.finalBuffer !== null, 'Cycle 3 (classic): finalBuffer restored');
  player.playFinalFanfare();
  check(sineFallbackPlayFanfareCalls === 0, 'Cycle 3: Buffer played again, SineFallback not called');

  // 4. Switch to Synth
  sineFallbackPlayFanfareCalls = 0;
  await player.switchPack('synth');
  check(player.finalBuffer === null, 'Cycle 4 (synth): finalBuffer reset to null');
  player.playFinalFanfare();
  check(sineFallbackPlayFanfareCalls === 1, 'Cycle 4: Delegates to SineFallback');

  // 5. Switch to Clockwork
  sineFallbackPlayFanfareCalls = 0;
  await player.switchPack('clockwork');
  check(player.finalBuffer === null, 'Cycle 5 (clockwork): finalBuffer reset to null');
  player.playFinalFanfare();
  check(sineFallbackPlayFanfareCalls === 1, 'Cycle 5: Delegates to SineFallback');

  player.destroy();
}

// 2.F: Classic finalTrack Decode Failure Graceful Fallback
console.log('\n--- 2.F: Classic finalTrack Decode Failure Graceful Fallback ---');
{
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);

  // Clear caches to force fetch and decoding
  mockCaches.caches.clear();

  // Make decodeAudioData succeed for stems but fail for final.mp3
  let decodeCount = 0;
  const originalDecode = ctx.decodeAudioData.bind(ctx);
  ctx.decodeAudioData = function(buf, success, failure) {
    decodeCount++;
    if (decodeCount > 4) {
      // 5th buffer is finalTrack!
      const err = new Error('Corrupt final.mp3');
      if (failure) failure(err);
      const p = Promise.reject(err);
      p.catch(() => {}); // Suppress unhandled promise rejection in mock
      return p;
    }
    return originalDecode(buf, success, failure);
  };

  sineFallbackPlayFanfareCalls = 0;
  const switchRes = await player.switchPack('classic');
  check(switchRes === true, 'switchPack("classic") succeeds even if finalTrack decode fails');
  check(player.finalBuffer === null, 'finalBuffer gracefully falls back to null on decode failure');

  player.playFinalFanfare();
  check(sineFallbackPlayFanfareCalls === 1, 'Delegates to SineFallbackSynthesizer when finalTrack failed');
  check(player.getState() === 'stopped', 'Player stopped cleanly');

  player.destroy();
}

// Restore spy
SineFallbackSynthesizer.prototype.playFanfare = origPlayFanfare;

// ============================================================================
// SECTION 3: Progress Callbacks During Uncached Downloads
// ============================================================================
console.log('\n--- SECTION 3: Progress Callbacks During Uncached Downloads ---');

{
  for (const packId of AUDIO_PACK_IDS) {
    mockCaches.caches.clear();
    mockLocalStorage.clear();

    const ctx = new MockAudioContext();
    const dest = ctx.createGain();
    const player = new StemPlayer();
    await player.init(ctx, dest);

    const receivedProgress = [];
    const ok = await player.switchPack(packId, (pct) => {
      receivedProgress.push(pct);
    });

    check(ok === true, `Uncached download for "${packId}" succeeded`);
    check(receivedProgress.length > 0, `[${packId}] Received progress callbacks (count: ${receivedProgress.length})`);

    // Verify all callbacks are STRICTLY INTEGER PERCENTAGES
    let allIntegers = true;
    let allInRange = true;
    let strictlyMonotonic = true;

    for (let i = 0; i < receivedProgress.length; i++) {
      const val = receivedProgress[i];
      if (typeof val !== 'number' || !Number.isInteger(val)) {
        allIntegers = false;
        console.error(`Non-integer progress received: ${val}`);
      }
      if (val < 0 || val > 100) {
        allInRange = false;
        console.error(`Out of range progress received: ${val}`);
      }
      if (i > 0 && val < receivedProgress[i - 1]) {
        strictlyMonotonic = false;
        console.error(`Non-monotonic progress: ${receivedProgress[i - 1]} -> ${val}`);
      }
    }

    check(allIntegers, `[${packId}] All ${receivedProgress.length} progress reports are strictly integer percentages`);
    check(allInRange, `[${packId}] All progress reports are bounded [0, 100]`);
    check(strictlyMonotonic, `[${packId}] Progress values are monotonic`);
    check(receivedProgress[receivedProgress.length - 1] === 100, `[${packId}] Terminal progress is exactly 100%`);

    // Test Cached Hit Progress (should immediately return 100)
    const cachedProgress = [];
    // Reset player state to force check cache
    player.currentPackId = 'dummy_pack';
    const cachedOk = await player.switchPack(packId, (pct) => cachedProgress.push(pct));
    check(cachedOk === true, `[${packId}] Cached hit switch succeeded`);
    check(cachedProgress.includes(100), `[${packId}] Cached hit reported 100%`);
    check(cachedProgress.every((p) => Number.isInteger(p)), `[${packId}] Cached progress values are all integers`);

    // Test Idempotent Short-Circuit Progress
    const samePackProgress = [];
    const sameOk = await player.switchPack(packId, (pct) => samePackProgress.push(pct));
    check(sameOk === true, `[${packId}] Idempotent switch on active pack succeeded`);
    check(samePackProgress.length === 1 && samePackProgress[0] === 100, `[${packId}] Short-circuit invokes onProgress(100)`);

    player.destroy();
  }
}

// ============================================================================
// SECTION 4: Concurrency Hammering & Adversarial Robustness
// ============================================================================
console.log('\n--- SECTION 4: Concurrency Hammering & Adversarial Robustness ---');

// 4.A: Rapid Switch Token Invalidation
console.log('\n--- 4.A: Rapid Switch Token Invalidation ---');
{
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);

  player.updateProgress(0.50);
  player.start();

  // Fire 10 rapid switches without awaiting
  const switchPacks = ['organic', 'synth', 'clockwork', 'classic', 'organic', 'synth', 'clockwork', 'classic', 'organic', 'clockwork'];
  const promises = switchPacks.map((id) => player.switchPack(id));

  const results = await Promise.all(promises);

  // The last switch should resolve to true
  const lastResult = results[results.length - 1];
  check(lastResult === true, 'Final rapid switch to "clockwork" resolved to true');
  check(player.getCurrentPackId() === 'clockwork', 'Final active pack is "clockwork"');
  check(player.getState() === 'playing', 'Playback remained active throughout hammering');

  const expGains = calculateQuartileGains(0.50, 'equal-power');
  const nodes = player.stemGainNodes;
  checkCloseTo(nodes[0].gain.value, expGains.stem1, 1e-4, 'Stem 1 gain is preserved in sync after hammering');
  checkCloseTo(nodes[1].gain.value, expGains.stem2, 1e-4, 'Stem 2 gain is preserved in sync after hammering');
  checkCloseTo(nodes[2].gain.value, expGains.stem3, 1e-4, 'Stem 3 gain is preserved in sync after hammering');
  checkCloseTo(nodes[3].gain.value, expGains.stem4, 1e-4, 'Stem 4 gain is preserved in sync after hammering');

  player.destroy();
}

// 4.B: Invalid Pack ID Inputs
console.log('\n--- 4.B: Invalid Pack ID Inputs ---');
{
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);
  await player.switchPack('synth');

  const badInputs = ['', ' ', 'unknown_pack', 'null', null, undefined, 123, {}, [], false];
  for (const bad of badInputs) {
    let threw = false;
    let res = null;
    try {
      res = await player.switchPack(bad);
    } catch {
      threw = true;
    }
    check(!threw, `switchPack(${JSON.stringify(bad)}) does not throw`);
    check(res === false, `switchPack(${JSON.stringify(bad)}) returns false`);
    check(player.getCurrentPackId() === 'synth', `currentPackId stays "synth" after invalid switch`);
  }

  player.destroy();
}

// 4.C: Network Abort & Resilience
console.log('\n--- 4.C: Network Abort & Resilience ---');
{
  mockCaches.caches.clear();
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);

  player.updateProgress(0.25);
  player.start();

  // Simulate network drop during 'organic' download
  fetchFailPattern = /organic/;
  let threw = false;
  let failRes = null;
  try {
    failRes = await player.switchPack('organic');
  } catch (err) {
    threw = true;
    failRes = false;
  }

  // Record empirical finding on whether switchPack resolves false vs throws
  check(!threw, 'switchPack handles network rejection gracefully without throwing uncaught exception (Vulnerability finding: loadAudioPackWithProgress throws at line 1043)');
  check(failRes === false, 'switchPack resolves or recovers to false on network drop');
  check(player.getCurrentPackId() === 'classic', 'Pack ID preserved as "classic" after failed switch');
  check(player.getState() === 'playing', 'Player remains playing without crashing or dropping audio');

  fetchFailPattern = null; // Restore network

  player.destroy();
}

console.log('\n======================================================================');
console.log(`TOTAL ASSERTIONS: ${totalAssertions}`);
console.log(`PASSED: ${passedAssertions}`);
console.log(`FAILED: ${failedAssertions}`);
console.log('======================================================================\n');

if (failedAssertions > 0) {
  process.exit(1);
} else {
  console.log('>>> ALL EMPIRICAL CHALLENGER ASSERTIONS PASSED WITH ZERO FAILURES! <<<');
}
