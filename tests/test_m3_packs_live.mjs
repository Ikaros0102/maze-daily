/**
 * tests/test_m3_packs_live.mjs
 *
 * Empirical Verification of Milestone 3:
 * Live StemPlayer Crossfade, Buffer Swap, Mono Downmixing, Topological Sync & Facade Exports.
 * Tests the REAL src/modules/audioNav/stems.ts and src/modules/audioNav/index.ts implementations.
 */

import { register } from 'node:module';
try {
  register(new URL('./ts_resolver.mjs', import.meta.url).href);
} catch {}

// 1. Web Audio & Browser Mock Environment for Node.js
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
  decodeAudioData(buffer, success, failure) {
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
globalThis.fetch = async (url) => {
  return {
    ok: true,
    status: 200,
    headers: new Map([['content-type', 'audio/mp4'], ['content-length', '500000']]),
    arrayBuffer: async () => new ArrayBuffer(2048),
    clone: function() { return this; },
  };
};

// 2. Import Real Source Code Modules
const { StemPlayer, calculateQuartileGains } = await import('../src/modules/audioNav/stems.ts');
const { AudioNavManager, audioNavController } = await import('../src/modules/audioNav/index.ts');
const { AUDIO_PACKS } = await import('../src/config/audioPacks.ts');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(cond, msg) {
  totalTests++;
  if (cond) {
    passedTests++;
    console.log(`  [PASS] ${msg}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${msg}`);
  }
}

function assertCloseTo(act, exp, tol = 0.001, msg = '') {
  assert(Math.abs(act - exp) <= tol, `${msg} (exp: ${exp}, act: ${act})`);
}

console.log('==================================================================');
console.log('  MILESTONE 3 REAL IMPLEMENTATION EMPIRICAL TEST SUITE');
console.log('==================================================================\n');

// --------------------------------------------------------------------------
// Suite 1: Interface Contracts & Facade Delegation
// --------------------------------------------------------------------------
console.log('--- Suite 1: Interface Contracts & Facade Delegation ---');
{
  assert(typeof audioNavController.switchPack === 'function', 'audioNavController exposes switchPack');
  assert(typeof audioNavController.getCurrentPackId === 'function', 'audioNavController exposes getCurrentPackId');
  assert(audioNavController.getCurrentPackId() === 'classic', 'Default pack ID is "classic"');

  const manager = new AudioNavManager();
  assert(typeof manager.switchPack === 'function', 'AudioNavManager exposes switchPack');
  assert(typeof manager.getCurrentPackId === 'function', 'AudioNavManager exposes getCurrentPackId');
  assert(manager.getCurrentPackId() === 'classic', 'Manager default pack ID is "classic"');
}

// --------------------------------------------------------------------------
// Suite 2: StemPlayer switchPack Validation & Error Handling
// --------------------------------------------------------------------------
console.log('\n--- Suite 2: StemPlayer switchPack Validation & Error Handling ---');
{
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);

  // Invalid IDs
  const invalidIds = ['', 'invalid_pack_123', null, undefined, 42, {}, []];
  for (const inv of invalidIds) {
    let threw = false;
    let res = null;
    try {
      res = await player.switchPack(inv);
    } catch {
      threw = true;
    }
    assert(!threw, `switchPack(${JSON.stringify(inv)}) does not throw`);
    assert(res === false, `switchPack(${JSON.stringify(inv)}) returns false`);
    assert(player.getCurrentPackId() === 'classic', 'Pack ID remains classic after invalid switch');
  }
}

// --------------------------------------------------------------------------
// Suite 3: 0.5s Linear Crossfade When Audio is Playing
// --------------------------------------------------------------------------
console.log('\n--- Suite 3: 0.5s Linear Crossfade When Audio is Playing ---');
{
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);

  // Start player
  player.start();
  assert(player.getState() === 'playing', 'Player is playing before switchPack');

  const stemsBus = player.getStemsBus();
  assert(stemsBus !== null, 'stemsBus is initialized');

  const initialEvents = stemsBus.gain.events.length;
  const switchPromise = player.switchPack('synth');
  const result = await switchPromise;
  assert(result === true, 'switchPack to synth resolved true');
  assert(player.getCurrentPackId() === 'synth', 'getCurrentPackId updated to synth');

  // Verify linear ramp was scheduled over 0.5s during switch
  const newEvents = stemsBus.gain.events.slice(initialEvents);
  const linearRamp = newEvents.find((e) => e.type === 'linearRampToValueAtTime');

  assert(Boolean(linearRamp), 'linearRampToValueAtTime scheduled on stemsBus.gain');
  assert(linearRamp?.value === 0.0001, 'Ramp targets exact value 0.0001');
  assertCloseTo(linearRamp?.time ?? 0, ctx.currentTime + 0.5, 0.001, 'Ramp duration is exactly 0.5s (500ms)');

  // Bus gain restored to 1.0
  const finalSetVal = stemsBus.gain.events[stemsBus.gain.events.length - 1];
  assert(finalSetVal?.type === 'setValueAtTime' && finalSetVal?.value === 1.0, 'stemsBus.gain restored to 1.0');

  // Timestamp updated in localStorage
  const lastUsed = mockLocalStorage.getItem('audio_pack_last_used_synth');
  assert(Boolean(lastUsed), 'audio_pack_last_used_synth updated in localStorage');
}

// --------------------------------------------------------------------------
// Suite 4: Non-Playing State Crossfade Bypass (Instant Swap)
// --------------------------------------------------------------------------
console.log('\n--- Suite 4: Non-Playing State Crossfade Bypass (Instant Swap) ---');
{
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);

  assert(player.getState() === 'unloaded' || player.getState() === 'ready', 'Player is not playing');

  const stemsBus = player.getStemsBus();
  const initialEvents = stemsBus.gain.events.length;

  const result = await player.switchPack('organic');
  assert(result === true, 'switchPack on idle player resolves true');

  const newEvents = stemsBus.gain.events.slice(initialEvents);
  const hadLinearRamp = newEvents.some((e) => e.type === 'linearRampToValueAtTime');
  assert(!hadLinearRamp, 'Non-playing state bypasses 0.5s crossfade ramp (zero delay)');
  assert(player.getCurrentPackId() === 'organic', 'Current pack updated to organic');
}

// --------------------------------------------------------------------------
// Suite 5: Topological Progress Synchronization & Mono Downmix
// --------------------------------------------------------------------------
console.log('\n--- Suite 5: Topological Progress Synchronization & Mono Downmix ---');
{
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);

  // Set progress to 65% (Q3: Stem 2 fades down, Stem 3 fades in)
  player.updateProgress(0.65);
  player.start();

  const expectedGains = calculateQuartileGains(0.65, 'equal-power');

  // Switch to clockwork pack
  await player.switchPack('clockwork');

  assert(player.getState() === 'playing', 'Playback resumed automatically after buffer swap');

  // Verify all 4 sources exist and loop synchronously
  assert(ctx.activeSources.length === 4, '4 active AudioBufferSourceNodes looping');
  ctx.activeSources.forEach((src, idx) => {
    assert(src.loop === true, `Source ${idx + 1} has loop = true`);
    assert(src.loopStart === 0, `Source ${idx + 1} has loopStart = 0`);
  });

  // Verify mono downmixing enforcement on stem gain nodes
  const nodes = player.stemGainNodes;
  assert(Boolean(nodes) && nodes.length === 4, 'stemGainNodes has 4 gain nodes');
  nodes.forEach((g, idx) => {
    assert(g.channelCount === 1, `Gain node ${idx + 1} has channelCount = 1`);
    assert(g.channelCountMode === 'explicit', `Gain node ${idx + 1} has channelCountMode = explicit`);
  });

  // Verify quartile gains were applied immediately to stem gain nodes
  assertCloseTo(nodes[0].gain.value, expectedGains.stem1, 0.001, 'Stem 1 gain preserved in sync');
  assertCloseTo(nodes[1].gain.value, expectedGains.stem2, 0.001, 'Stem 2 gain preserved in sync');
  assertCloseTo(nodes[2].gain.value, expectedGains.stem3, 0.001, 'Stem 3 gain preserved in sync');
  assertCloseTo(nodes[3].gain.value, expectedGains.stem4, 0.001, 'Stem 4 gain preserved in sync');
}

// --------------------------------------------------------------------------
// Suite 6: Fanfare Fallback When finalTrack is Omitted
// --------------------------------------------------------------------------
console.log('\n--- Suite 6: Fanfare Fallback When finalTrack is Omitted ---');
{
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);

  // 1. Classic has finalTrack -> loads finalBuffer
  await player.switchPack('classic');
  assert(player.finalBuffer !== null, 'Classic pack loads finalBuffer');
  player.playFinalFanfare();
  assert(player.getState() === 'stopped', 'Classic fanfare transitions player to stopped');

  // 2. Organic has NO finalTrack -> resets finalBuffer to null -> delegates to SineFallback
  await player.switchPack('organic');
  assert(player.finalBuffer === null, 'Organic pack resets finalBuffer to null');

  let fanfareThrew = false;
  try {
    player.playFinalFanfare();
  } catch (err) {
    fanfareThrew = true;
  }
  assert(!fanfareThrew, 'Organic fanfare executes cleanly without throwing');
  assert(player.getState() === 'stopped', 'Organic fanfare transitions player to stopped');
}

// --------------------------------------------------------------------------
// Suite 7: Monotonic Progress Reporting on On-Demand Downloads
// --------------------------------------------------------------------------
console.log('\n--- Suite 7: Monotonic Progress Reporting on On-Demand Downloads ---');
{
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);

  const progressReports = [];
  const ok = await player.switchPack('synth', (pct) => progressReports.push(pct));

  assert(ok === true, 'switchPack to synth succeeded');
  assert(progressReports.length > 0, 'Progress callbacks were invoked');
  assert(progressReports[progressReports.length - 1] === 100, 'Final progress callback reported 100%');

  let isMonotonic = true;
  for (let i = 1; i < progressReports.length; i++) {
    if (progressReports[i] < progressReports[i - 1]) isMonotonic = false;
  }
  assert(isMonotonic, 'Download progress percentages are strictly monotonic');
}

// --------------------------------------------------------------------------
// Suite 8: Teardown & Re-initialization
// --------------------------------------------------------------------------
console.log('\n--- Suite 8: Teardown & Re-initialization ---');
{
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);
  player.start();

  player.destroy();
  assert(player.getState() === 'unloaded', 'State is unloaded after destroy');
  assert(player.getCurrentPackId() === 'classic', 'Pack ID reset to classic after destroy');
}

console.log('\n==================================================================');
console.log(`TOTAL TESTS: ${totalTests}`);
console.log(`PASSED: ${passedTests}`);
console.log(`FAILED: ${failedTests}`);
console.log('==================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('>>> 100% OF REAL M3 STEMPLAYER & AUDIONAV TESTS PASSED! <<<\n');
  await import('./challenger_m3_packs_switch_stress.mjs');
}
