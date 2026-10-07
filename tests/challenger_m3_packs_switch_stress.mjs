/**
 * tests/challenger_m3_packs_switch_stress.mjs
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER TEST SUITE (MILESTONE 3):
 * Live Audio Pack Switching, 0.5s Crossfade Timing, Rapid Switching Invariants,
 * AudioContext State Bypass, and Fault Tolerance.
 */

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { register } from 'node:module';

try {
  register(new URL('./ts_resolver.mjs', import.meta.url).href);
} catch {}

// ============================================================================
// 1. Web Audio & Browser Mock Environment for Node.js
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
  return {
    ok: true,
    status: 200,
    headers: new Map([['content-type', 'audio/mp4'], ['content-length', '500000']]),
    arrayBuffer: async () => new ArrayBuffer(2048),
    clone: function() { return this; },
  };
};

// ============================================================================
// 2. Real Implementation Imports
// ============================================================================

const { StemPlayer } = await import('../src/modules/audioNav/stems.ts');
const { AudioNavManager, audioNavController } = await import('../src/modules/audioNav/index.ts');

let totalChallengerTests = 0;
let passedChallengerTests = 0;
let failedChallengerTests = 0;
const challengerDefects = [];

function challengeAssert(condition, name, details = '') {
  totalChallengerTests++;
  if (condition) {
    passedChallengerTests++;
    console.log(`  [PASS] ${name}`);
  } else {
    failedChallengerTests++;
    console.error(`  [FAIL] ${name} ${details ? `(${details})` : ''}`);
    challengerDefects.push({ name, details });
  }
}

function challengeAssertClose(actual, expected, tol = 0.001, name = '') {
  challengeAssert(
    Math.abs(actual - expected) <= tol,
    name,
    `expected: ${expected}, got: ${actual}`
  );
}

console.log('================================================================');
console.log('  CHALLENGER 1 (M3): EMPIRICAL ADVERSARIAL STRESS TEST SUITE    ');
console.log('  Target: switchPack, 0.5s Crossfade Timing, Rapid Switching,   ');
console.log('          Suspended Context Bypass, and Fault Tolerance.         ');
console.log('================================================================\n');

// ----------------------------------------------------------------------------
// SUITE 1: 0.5s Crossfade Curve Mathematical & Scheduling Verification
// ----------------------------------------------------------------------------
console.log('--- SUITE 1: 0.5s Crossfade Curve Mathematical & Scheduling Verification ---');
{
  const testTimes = [0.0, 10.5, 42.123, 1000.0];

  for (const t of testTimes) {
    const ctx = new MockAudioContext();
    ctx.currentTime = t;
    const dest = ctx.createGain();
    const player = new StemPlayer();
    await player.init(ctx, dest);
    await player.switchPack('classic');
    player.start();

    const stemsBus = player.getStemsBus();
    const eventCountBefore = stemsBus.gain.events.length;

    await player.switchPack('synth');

    const newEvents = stemsBus.gain.events.slice(eventCountBefore);

    // 1. cancelScheduledValues(now)
    const cancelEv = newEvents.find((e) => e.type === 'cancelScheduledValues');
    challengeAssert(
      Boolean(cancelEv && cancelEv.time === t),
      `1.1 cancelScheduledValues scheduled at exact currentTime (${t}s)`
    );

    // 2. setValueAtTime(currentGain, now)
    const setEv = newEvents.find((e) => e.type === 'setValueAtTime');
    challengeAssert(
      Boolean(setEv && setEv.time === t && setEv.value === 1.0),
      `1.2 setValueAtTime anchors current gain (1.0) at currentTime (${t}s)`
    );

    // 3. linearRampToValueAtTime(0.0001, now + 0.5)
    const rampEv = newEvents.find((e) => e.type === 'linearRampToValueAtTime');
    challengeAssert(
      Boolean(rampEv),
      `1.3 linearRampToValueAtTime event exists for currentTime = ${t}s`
    );
    challengeAssert(
      rampEv?.value === 0.0001,
      `1.4 Ramp target value is EXACTLY 0.0001 (was ${rampEv?.value})`
    );
    challengeAssertClose(
      rampEv?.time ?? 0,
      t + 0.5,
      0.0001,
      `1.5 Ramp target time is EXACTLY currentTime + 0.5s (${t + 0.5}s)`
    );

    // 4. Stems bus gain restored to 1.0 after crossfade completes
    const restoreEv = newEvents[newEvents.length - 1];
    challengeAssert(
      Boolean(restoreEv && restoreEv.type === 'setValueAtTime' && restoreEv.value === 1.0),
      `1.6 stemsBus.gain is restored to 1.0 at conclusion of crossfade`
    );
  }
}

// ----------------------------------------------------------------------------
// SUITE 2: Rapid Sequential Switching Under 100ms & Monotonic Token Invariant
// ----------------------------------------------------------------------------
console.log('\n--- SUITE 2: Rapid Sequential Switching Under 100ms & Token Invariant ---');
{
  // Test 2.1: Synchronous rapid calls: switchPack('organic'), ('synth'), ('clockwork')
  {
    const ctx = new MockAudioContext();
    const dest = ctx.createGain();
    const player = new StemPlayer();
    await player.init(ctx, dest);
    await player.switchPack('classic');
    player.start();

    // Call 3 switches synchronously
    const p1 = player.switchPack('organic');
    const p2 = player.switchPack('synth');
    const p3 = player.switchPack('clockwork');

    const results = await Promise.all([p1, p2, p3]);

    challengeAssert(
      results[0] === false,
      '2.1.1 First stale switchPack(organic) returns false'
    );
    challengeAssert(
      results[1] === false,
      '2.1.2 Second stale switchPack(synth) returns false'
    );
    challengeAssert(
      results[2] === true,
      '2.1.3 Final switchPack(clockwork) resolves true'
    );
    challengeAssert(
      player.getCurrentPackId() === 'clockwork',
      '2.1.4 Final resolved pack is "clockwork"'
    );
    challengeAssert(
      ctx.activeSources.length === 4,
      '2.1.5 Exactly 4 active stem sources looping (no leaked duplicate sources)'
    );
    challengeAssert(
      player.getState() === 'playing',
      '2.1.6 Player continues playing smoothly'
    );
  }

  // Test 2.2: Staggered sequential calls within 100ms
  // Calling switchPack('organic'), then 40ms later switchPack('synth'), then 40ms later switchPack('clockwork')
  {
    const ctx = new MockAudioContext();
    const dest = ctx.createGain();
    const player = new StemPlayer();
    await player.init(ctx, dest);
    await player.switchPack('classic');
    player.start();

    const p1 = player.switchPack('organic');
    await new Promise((r) => setTimeout(r, 40));

    const p2 = player.switchPack('synth');
    await new Promise((r) => setTimeout(r, 40));

    const p3 = player.switchPack('clockwork');

    // Wait for the final switch to complete (takes ~500ms crossfade)
    const res3 = await p3;

    challengeAssert(res3 === true, '2.2.1 Final staggered switch resolves true');
    challengeAssert(
      player.getCurrentPackId() === 'clockwork',
      '2.2.2 Current pack ID resolved to "clockwork"'
    );
    challengeAssert(
      ctx.activeSources.length === 4,
      '2.2.3 Audio graph has exactly 4 active sources (no overlapping audio)'
    );

    // Adversarial Check: Did in-flight cancelled promises p1 and p2 settle or hang forever?
    let p1Settled = false;
    let p2Settled = false;
    p1.then(() => { p1Settled = true; }).catch(() => { p1Settled = true; });
    p2.then(() => { p2Settled = true; }).catch(() => { p2Settled = true; });

    // Allow event loop up to 600ms to process resolution
    await new Promise((r) => setTimeout(r, 600));

    // An async function call must ALWAYS settle (resolve to boolean or reject), NEVER hang forever.
    challengeAssert(
      p1Settled === true,
      '2.2.4 In-flight cancelled switchPack(organic) MUST settle (not hang indefinitely)',
      p1Settled ? 'settled' : 'HANGING_PROMISE: clearTimeout canceled callback without resolve()'
    );
    challengeAssert(
      p2Settled === true,
      '2.2.5 In-flight cancelled switchPack(synth) MUST settle (not hang indefinitely)',
      p2Settled ? 'settled' : 'HANGING_PROMISE: clearTimeout canceled callback without resolve()'
    );
  }

  // Test 2.3: Rapid switching back to already active pack (short-circuit invariant)
  {
    const ctx = new MockAudioContext();
    const dest = ctx.createGain();
    const player = new StemPlayer();
    await player.init(ctx, dest);
    await player.switchPack('organic');

    const t0 = Date.now();
    let progressCalls = 0;
    const sameRes = await player.switchPack('organic', () => {
      progressCalls++;
    });
    const elapsed = Date.now() - t0;

    challengeAssert(sameRes === true, '2.3.1 Same-pack switchPack returns true immediately');
    challengeAssert(elapsed < 100, `2.3.2 Same-pack switch short-circuits with no delay (${elapsed}ms)`);
    challengeAssert(progressCalls > 0, '2.3.3 Same-pack switch still emits progress (100%)');
  }

  // Test 2.4: Fuzzing 10 rapid switches in a tight loop
  {
    const ctx = new MockAudioContext();
    const dest = ctx.createGain();
    const player = new StemPlayer();
    await player.init(ctx, dest);
    await player.switchPack('classic');
    player.start();

    const sequence = [
      'organic', 'synth', 'clockwork', 'classic', 'organic',
      'synth', 'classic', 'clockwork', 'organic', 'synth'
    ];
    const promises = sequence.map((id) => player.switchPack(id));

    const outcomes = await Promise.all(promises);

    challengeAssert(
      outcomes[outcomes.length - 1] === true,
      '2.4.1 Last operation in 10-cycle rapid burst resolves true'
    );
    challengeAssert(
      player.getCurrentPackId() === 'synth',
      '2.4.2 Final pack ID matches last requested pack ("synth")'
    );
    challengeAssert(
      ctx.activeSources.length === 4,
      '2.4.3 Exactly 4 active sources playing after 10-cycle burst'
    );
  }
}

// ----------------------------------------------------------------------------
// SUITE 3: Switching while AudioContext is Suspended (Instant Bypass)
// ----------------------------------------------------------------------------
console.log('\n--- SUITE 3: Switching while AudioContext is Suspended ---');
{
  // Test 3.1: Suspended context skips 500ms crossfade
  {
    const ctx = new MockAudioContext();
    await ctx.suspend();
    challengeAssert(ctx.state === 'suspended', '3.1.1 AudioContext state is suspended');

    const dest = ctx.createGain();
    const player = new StemPlayer();
    await player.init(ctx, dest);
    player.start();

    const stemsBus = player.getStemsBus();
    const eventCountBefore = stemsBus.gain.events.length;

    const t0 = Date.now();
    const res = await player.switchPack('clockwork');
    const elapsed = Date.now() - t0;

    challengeAssert(res === true, '3.1.2 switchPack returns true in suspended state');
    challengeAssert(
      elapsed < 150,
      `3.1.3 Suspended context executes instant swap without 500ms delay (${elapsed}ms)`
    );
    challengeAssert(
      player.getCurrentPackId() === 'clockwork',
      '3.1.4 Pack ID successfully updated to "clockwork"'
    );

    const newEvents = stemsBus.gain.events.slice(eventCountBefore);
    const hasRamp = newEvents.some((e) => e.type === 'linearRampToValueAtTime');
    challengeAssert(!hasRamp, '3.1.5 No crossfade ramp was scheduled on suspended context');
  }

  // Test 3.2: Non-playing states bypass 500ms
  {
    const ctx = new MockAudioContext();
    const dest = ctx.createGain();
    const player = new StemPlayer();
    await player.init(ctx, dest);

    const t0 = Date.now();
    const res = await player.switchPack('organic');
    const elapsed = Date.now() - t0;

    challengeAssert(res === true, '3.2.1 switchPack on idle player returns true');
    challengeAssert(elapsed < 150, `3.2.2 Idle player instant swap (< 150ms) (${elapsed}ms)`);
    challengeAssert(player.getCurrentPackId() === 'organic', '3.2.3 Pack ID updated to organic');
  }
}

// ----------------------------------------------------------------------------
// SUITE 4: Switching with Invalid Pack IDs & Error Handling
// ----------------------------------------------------------------------------
console.log('\n--- SUITE 4: Switching with Invalid Pack IDs & Error Handling ---');
{
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);
  await player.switchPack('classic');
  player.start();
  player.updateProgress(0.5);

  const invalidInputs = [
    { label: 'empty string ""', val: '' },
    { label: 'spaces "   "', val: '   ' },
    { label: 'unknown "unknown_pack"', val: 'unknown_pack' },
    { label: 'literal "null"', val: 'null' },
    { label: 'literal "undefined"', val: 'undefined' },
    { label: 'uppercase "CLASSIC"', val: 'CLASSIC' },
    { label: 'null byte "synth\\0"', val: 'synth\0attack' },
    { label: 'traversal "../audio/stems"', val: '../audio/stems' },
    { label: 'script tag "<script>"', val: '<script>alert(1)</script>' },
    { label: 'null', val: null },
    { label: 'undefined', val: undefined },
    { label: 'number 12345', val: 12345 },
    { label: 'boolean true', val: true },
    { label: 'object {}', val: {} },
    { label: 'array []', val: [] },
    { label: 'function', val: () => 'organic' },
    { label: 'Symbol', val: Symbol('pack') },
  ];

  for (const item of invalidInputs) {
    let threw = false;
    let thrownError = null;
    let res = null;
    try {
      res = await player.switchPack(item.val);
    } catch (err) {
      threw = true;
      thrownError = err;
    }

    challengeAssert(
      !threw,
      `4.1 switchPack(${item.label}) does not throw uncaught error`,
      threw ? String(thrownError) : ''
    );
    challengeAssert(res === false, `4.2 switchPack(${item.label}) returns false cleanly`);
    challengeAssert(
      player.getCurrentPackId() === 'classic',
      `4.3 currentPackId remains undisturbed ("classic") for ${item.label}`
    );
    challengeAssert(
      player.getState() === 'playing',
      `4.4 Player state remains "playing" for ${item.label}`
    );
    challengeAssert(
      ctx.activeSources.length === 4,
      `4.5 Active audio sources undisturbed (4 stems) for ${item.label}`
    );
  }
}

// ----------------------------------------------------------------------------
// SUITE 5: Monophonic Downmixing & Channel Count Invariants
// ----------------------------------------------------------------------------
console.log('\n--- SUITE 5: Monophonic Downmixing & Channel Count Invariants ---');
{
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);

  const packsToTest = ['classic', 'organic', 'synth', 'clockwork', 'classic'];

  for (let i = 0; i < packsToTest.length; i++) {
    const packId = packsToTest[i];
    await player.switchPack(packId);

    const gainNodes = player.stemGainNodes;
    challengeAssert(
      Boolean(gainNodes && gainNodes.length === 4),
      `5.1 [${packId}] Has exactly 4 stemGainNodes`
    );

    gainNodes.forEach((g, idx) => {
      challengeAssert(
        g.channelCount === 1,
        `5.2 [${packId}] stemGainNode[${idx}] enforces channelCount = 1`
      );
      challengeAssert(
        g.channelCountMode === 'explicit',
        `5.3 [${packId}] stemGainNode[${idx}] enforces channelCountMode = 'explicit'`
      );
    });
  }
}

// ----------------------------------------------------------------------------
// SUITE 6: Fanfare Fallback & Victory Transition Invariants
// ----------------------------------------------------------------------------
console.log('\n--- SUITE 6: Fanfare Fallback & Victory Transition Invariants ---');
{
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const player = new StemPlayer();
  await player.init(ctx, dest);

  // 1. Classic has finalTrack -> loads finalBuffer
  await player.switchPack('classic');
  challengeAssert(
    player.finalBuffer !== null,
    '6.1 Classic pack populates finalBuffer'
  );

  // 2. Synth has NO finalTrack -> finalBuffer is null
  await player.switchPack('synth');
  challengeAssert(
    player.finalBuffer === null,
    '6.2 Synth pack sets finalBuffer to null'
  );

  // Play fanfare with null buffer -> fallback cleanly to synth without error
  let fanfareThrew = false;
  try {
    player.playFinalFanfare();
  } catch {
    fanfareThrew = true;
  }
  challengeAssert(!fanfareThrew, '6.3 Synth pack playFinalFanfare executes without exception');
  challengeAssert(player.getState() === 'stopped', '6.4 Player transitions to stopped');

  // 3. Switch back to classic -> finalBuffer restored
  await player.switchPack('classic');
  challengeAssert(
    player.finalBuffer !== null,
    '6.5 Returning to classic restores finalBuffer'
  );
}

// ----------------------------------------------------------------------------
// SUITE 7: AudioNavManager Facade & Global Controller Integration
// ----------------------------------------------------------------------------
console.log('\n--- SUITE 7: AudioNavManager Facade & Global Controller Integration ---');
{
  challengeAssert(
    typeof audioNavController.switchPack === 'function',
    '7.1 audioNavController exposes switchPack'
  );
  challengeAssert(
    typeof audioNavController.getCurrentPackId === 'function',
    '7.2 audioNavController exposes getCurrentPackId'
  );

  const manager = new AudioNavManager();
  challengeAssert(
    manager.getCurrentPackId() === 'classic',
    '7.3 manager initial pack ID is "classic"'
  );

  // Uninitialized manager switchPack fails gracefully without throwing
  let uninitThrew = false;
  let uninitRes = null;
  try {
    uninitRes = await manager.switchPack('organic');
  } catch {
    uninitThrew = true;
  }
  challengeAssert(!uninitThrew, '7.4 Uninitialized manager switchPack does not crash');
  challengeAssert(uninitRes === false, '7.5 Uninitialized manager switchPack returns false');

  // Initialized manager
  await manager.init();
  let progressCalled = false;
  const ok = await manager.switchPack('organic', () => {
    progressCalled = true;
  });

  challengeAssert(ok === true, '7.6 Initialized manager.switchPack("organic") resolves true');
  challengeAssert(
    manager.getCurrentPackId() === 'organic',
    '7.7 manager.getCurrentPackId() updates to "organic"'
  );
  challengeAssert(progressCalled, '7.8 manager forwarded onProgress callback');

  manager.destroy();
  challengeAssert(
    manager.getCurrentPackId() === 'classic',
    '7.9 manager reset to "classic" on destroy'
  );
}

// ============================================================================
// FINAL ADVERSARIAL RUN REPORT
// ============================================================================

console.log('\n================================================================');
console.log(`  CHALLENGER STRESS SUITE TOTALS:`);
console.log(`  Total:  ${totalChallengerTests}`);
console.log(`  Passed: ${passedChallengerTests}`);
console.log(`  Failed: ${failedChallengerTests}`);
if (challengerDefects.length > 0) {
  console.log(`\n  DEFECTS FOUND (${challengerDefects.length}):`);
  challengerDefects.forEach((d, i) => {
    console.log(`    ${i + 1}. [${d.name}] ${d.details}`);
  });
}
console.log('================================================================\n');

if (failedChallengerTests > 0) {
  console.error(`>>> EMPIRICAL CHALLENGER VERDICT: REJECT (${failedChallengerTests} FAILURES) <<<`);
  process.exit(1);
} else {
  console.log(`>>> EMPIRICAL CHALLENGER VERDICT: APPROVE (ALL ${passedChallengerTests} ASSERTIONS PASSED CLEANLY) <<<`);
}
