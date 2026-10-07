/**
 * tests/audio_nav_stress.mjs
 *
 * Empirical Adversarial Stress Test Suite for Milestone 3 (Audio Navigation Module).
 * Authored by teamwork_preview_challenger_m3_2 (Critic & Specialist).
 *
 * Verifies:
 * 1. Wall Collision Cooldown (60Hz slide at 100ms, 279ms drop, >=280ms trigger, mobile vibration).
 * 2. Audio Fallback Activation (404 fetch & decode failure -> 4 harmonic layers sine synthesis, fanfare).
 * 3. Volume & Hotkey Stress (strict [0.0, 1.0] clamping, localStorage persistence, editable element isolation).
 * 4. Teardown & Leak Freedom (node release, listener detachment, timer disposal, idempotency, re-init).
 */

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

try {
  register(new URL('./ts_resolver.mjs', import.meta.url).href);
} catch (err) {
  // Ignore if already registered
}

// ============================================================================
// 1. Mock Web Audio & DOM Infrastructure
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
    this.disconnectCount = 0;
    this.channelCount = 2;
    this.channelCountMode = 'max';
  }

  connect(dest) {
    this.destinations.add(dest);
    return dest;
  }

  disconnect() {
    this.disconnectCount++;
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
  }

  start(time = 0) {
    this.started = true;
    this.startTime = time;
    this.context.activeOscillators.push(this);
  }

  stop(time = 0) {
    this.stopped = true;
    this.stopTime = time;
    if (this.onended) {
      // simulate asynchronous ended callback
      queueMicrotask(() => {
        if (this.onended) this.onended();
      });
    }
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
    this.context.activeBufferSources.push(this);
  }

  stop(time = 0) {
    this.stopped = true;
    if (this.onended) {
      queueMicrotask(() => {
        if (this.onended) this.onended();
      });
    }
  }
}

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.destination = new MockGainNode(this, 1.0);
    this.oscillatorsCreated = [];
    this.gainNodesCreated = [];
    this.bufferSourcesCreated = [];
    this.biquadFiltersCreated = [];
    this.activeOscillators = [];
    this.activeBufferSources = [];
    this.closeCalled = false;
    this.shouldFailDecode = false;
  }

  createGain() {
    const node = new MockGainNode(this);
    this.gainNodesCreated.push(node);
    return node;
  }

  createOscillator() {
    const node = new MockOscillatorNode(this);
    this.oscillatorsCreated.push(node);
    return node;
  }

  createStereoPanner() {
    return new MockStereoPannerNode(this);
  }

  createBiquadFilter() {
    const node = new MockBiquadFilterNode(this);
    this.biquadFiltersCreated.push(node);
    return node;
  }

  createBufferSource() {
    const node = new MockAudioBufferSourceNode(this);
    this.bufferSourcesCreated.push(node);
    return node;
  }

  decodeAudioData(buffer, success, failure) {
    if (this.shouldFailDecode) {
      const err = new Error('Mock decode error: Invalid audio format');
      if (failure) failure(err);
      return Promise.reject(err);
    }
    const mockAudioBuffer = {
      duration: 12.0,
      length: 529200,
      numberOfChannels: 2,
      sampleRate: 44100,
    };
    if (success) success(mockAudioBuffer);
    return Promise.resolve(mockAudioBuffer);
  }

  async resume() {
    this.state = 'running';
  }

  async close() {
    this.state = 'closed';
    this.closeCalled = true;
  }
}

// Mock LocalStorage
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(k) {
    return this.store.has(k) ? this.store.get(k) : null;
  }
  setItem(k, v) {
    this.store.set(k, String(v));
  }
  removeItem(k) {
    this.store.delete(k);
  }
  clear() {
    this.store.clear();
  }
}

// Mock Window & DOM
class MockWindow {
  constructor() {
    this.listeners = new Map();
    this.localStorage = new MockLocalStorage();
    this.AudioContext = MockAudioContext;
  }

  addEventListener(event, fn, opts) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push({ fn, opts });
  }

  removeEventListener(event, fn) {
    if (!this.listeners.has(event)) return;
    const filtered = this.listeners.get(event).filter((l) => l.fn !== fn);
    this.listeners.set(event, filtered);
  }

  getListenerCount(event) {
    return this.listeners.get(event)?.length ?? 0;
  }

  dispatchEvent(event) {
    const list = this.listeners.get(event.type) || [];
    for (const { fn } of [...list]) {
      fn(event);
    }
  }
}

class MockElement {
  constructor(tagName = 'DIV', isContentEditable = false) {
    this.tagName = tagName.toUpperCase();
    this.isContentEditable = isContentEditable;
  }
}

class MockKeyboardEvent {
  constructor(init) {
    this.type = 'keydown';
    this.key = init.key ?? '';
    this.code = init.code ?? '';
    this.target = init.target ?? new MockElement('DIV');
    this.defaultPrevented = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }
}

// ============================================================================
// Global Environment Setup
// ============================================================================

const mockWindow = new MockWindow();
globalThis.window = mockWindow;
globalThis.localStorage = mockWindow.localStorage;
globalThis.AudioContext = MockAudioContext;

// Mock Navigator with vibrate tracking
const vibrateHistory = [];
const mockNavigator = {
  vibrate(pattern) {
    vibrateHistory.push(pattern);
    return true;
  },
};
Object.defineProperty(globalThis, 'navigator', {
  value: mockNavigator,
  configurable: true,
  writable: true,
});

// Mock Performance for fine-grained synthetic clock
let simulatedPerfNow = 1000.0;
globalThis.performance = {
  now() {
    return simulatedPerfNow;
  },
};

// ============================================================================
// Test Runner Harness
// ============================================================================

const results = {
  passed: 0,
  failed: 0,
  tests: [],
};

function assert(condition, testName, detail = '') {
  if (condition) {
    results.passed++;
    results.tests.push({ testName, passed: true });
    console.log(`  [PASS] ${testName}`);
  } else {
    results.failed++;
    results.tests.push({ testName, passed: false, detail });
    console.error(`  [FAIL] ${testName}: ${detail}`);
  }
}

function expectEqual(actual, expected, testName) {
  const isMatch = actual === expected;
  assert(
    isMatch,
    testName,
    `Expected '${expected}' (type ${typeof expected}), got '${actual}' (type ${typeof actual})`
  );
}

function expectCloseTo(actual, expected, tolerance = 0.001, testName) {
  const diff = Math.abs(actual - expected);
  assert(
    diff <= tolerance,
    testName,
    `Expected ${expected} ± ${tolerance}, got ${actual} (diff: ${diff})`
  );
}

// ============================================================================
// Import Audio Nav Modules
// ============================================================================

console.log('==================================================================');
console.log('M3 Audio Navigation Module - Empirical Adversarial Stress Suite');
console.log('==================================================================\n');

const {
  CollisionSynthesizer,
  COLLISION_COOLDOWN_MS,
  COLLISION_DEFAULTS,
} = await import('../src/modules/audioNav/collisionSynth.ts');

const {
  StemPlayer,
  SineFallbackSynthesizer,
  calculateQuartileGains,
  STEM_FILE_PATHS,
} = await import('../src/modules/audioNav/stems.ts');

const { VolumeController } = await import('../src/modules/audioNav/volumeController.ts');
const { AudioNavigationEngine } = await import('../src/modules/audioNav/engine.ts');
const { AudioNavManager } = await import('../src/modules/audioNav/index.ts');
const { AUDIO_NAV_STORAGE_KEYS } = await import('../src/modules/audioNav/types.ts');

// ============================================================================
// Suite 1: Wall Collision Cooldown & Synthesis Stress
// ============================================================================
console.log('--- Suite 1: Wall Collision Cooldown & Synthesis Stress ---');

{
  // 1.1 Rapidly firing trigger() 60 times within 100ms (60Hz wall sliding)
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const synth = new CollisionSynthesizer();
  synth.init(ctx, dest);

  vibrateHistory.length = 0;
  simulatedPerfNow = 2000.0; // t0

  const triggerOutputs = [];
  // Call 60 times spaced across 100ms (simulating 60Hz physics ticks)
  for (let i = 0; i < 60; i++) {
    simulatedPerfNow = 2000.0 + (i * 100) / 60; // 0ms to 98.3ms
    triggerOutputs.push(synth.trigger());
  }

  const successCount = triggerOutputs.filter(Boolean).length;
  const suppressedCount = triggerOutputs.filter((x) => !x).length;

  expectEqual(
    successCount,
    1,
    'Rapid 60 triggers in 100ms: sound synthesis triggers at most ONCE'
  );
  expectEqual(
    suppressedCount,
    59,
    'Rapid 60 triggers in 100ms: exactly 59 triggers suppressed by cooldown'
  );
  expectEqual(
    ctx.oscillatorsCreated.length,
    2,
    'Rapid 60 triggers in 100ms: exactly 2 oscillators created for dual-layer impact (sub thud + click)'
  );
  expectEqual(
    vibrateHistory.length,
    1,
    'Rapid 60 triggers in 100ms: exactly 1 haptic vibration dispatched'
  );

  // Verify synthesized oscillator properties
  const osc = ctx.oscillatorsCreated[0];
  expectEqual(osc.type, 'sine', 'Collision synth oscillator type is sine');
  expectEqual(
    osc.frequency.events[0]?.value,
    150,
    'Collision synth frequency sweeps starts at 150Hz'
  );
  expectEqual(
    osc.frequency.events[1]?.value,
    40,
    'Collision synth frequency sweeps ends at 40Hz'
  );

  // 1.2 Boundary Test: 279ms (dropped) vs 280ms (succeeds)
  simulatedPerfNow = 2000.0; // Reset anchor
  const synthBoundary = new CollisionSynthesizer();
  synthBoundary.init(ctx, dest);

  const t0Result = synthBoundary.trigger();
  expectEqual(t0Result, true, 'Boundary test: initial trigger at t=0ms succeeds');

  // Second trigger at 279ms (strictly less than COLLISION_COOLDOWN_MS = 280ms)
  simulatedPerfNow = 2000.0 + 279.0;
  const t279Result = synthBoundary.trigger();
  expectEqual(
    t279Result,
    false,
    'Boundary test: second trigger at 279ms is dropped (<280ms)'
  );

  // Third trigger at 280ms (strictly >= COLLISION_COOLDOWN_MS)
  simulatedPerfNow = 2000.0 + 280.0;
  const t280Result = synthBoundary.trigger();
  expectEqual(
    t280Result,
    true,
    'Boundary test: trigger at exactly >=280ms succeeds cleanly'
  );

  // Fourth trigger at 281ms (1ms after t280 -> dropped)
  simulatedPerfNow = 2000.0 + 281.0;
  const t281Result = synthBoundary.trigger();
  expectEqual(t281Result, false, 'Boundary test: trigger at 281ms (1ms delta) dropped');

  // Fifth trigger after 560ms (280ms after second successful trigger)
  simulatedPerfNow = 2000.0 + 560.0;
  const t560Result = synthBoundary.trigger();
  expectEqual(t560Result, true, 'Boundary test: trigger after >=280ms succeeds cleanly again');

  // 1.3 Muted State behavior
  const mutedSynth = new CollisionSynthesizer();
  mutedSynth.init(ctx, dest);
  mutedSynth.setMuted(true);
  const oscCountBefore = ctx.oscillatorsCreated.length;
  simulatedPerfNow = 5000.0;
  const mutedResult = mutedSynth.trigger();
  expectEqual(mutedResult, true, 'Muted collision trigger returns true (cooldown advances)');
  expectEqual(
    ctx.oscillatorsCreated.length,
    oscCountBefore,
    'Muted collision trigger synthesizes NO audio oscillator'
  );

  // 1.4 Volume multiplier scaling
  const volSynth = new CollisionSynthesizer();
  volSynth.init(ctx, dest);
  volSynth.setVolume(0.5);
  simulatedPerfNow = 6000.0;
  volSynth.trigger();
  const subThudGain = ctx.gainNodesCreated[ctx.gainNodesCreated.length - 2];
  expectCloseTo(
    subThudGain.gain.events[0]?.value,
    0.1,
    0.001,
    'Collision synth peak gain scales with volumeMultiplier (0.2 * 0.5 = 0.1)'
  );

  synth.destroy();
  synthBoundary.destroy();
  mutedSynth.destroy();
  volSynth.destroy();
}

// ============================================================================
// Suite 2: Audio Fallback Activation & Sine Harmony Stress
// ============================================================================
console.log('\n--- Suite 2: Audio Fallback Activation & Sine Harmony Stress ---');

{
  // 2.1 Network Fetch Failure (HTTP 404) triggers SineFallbackSynthesizer
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();

  // Mock global fetch to return 404
  globalThis.fetch = async (url) => {
    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  };

  const player404 = new StemPlayer();
  await player404.init(ctx, dest);

  let caughtError = null;
  try {
    await player404.load();
  } catch (err) {
    caughtError = err;
  }

  expectEqual(
    caughtError,
    null,
    'StemPlayer.load() on HTTP 404 completes without throwing uncaught exceptions'
  );
  expectEqual(
    player404.isUsingFallback(),
    true,
    'StemPlayer activates fallback when stems return HTTP 404'
  );
  expectEqual(player404.getState(), 'ready', 'StemPlayer state is "ready" after fallback activation');

  // Start playback in fallback mode
  ctx.oscillatorsCreated.length = 0;
  player404.start();

  expectEqual(player404.getState(), 'playing', 'StemPlayer state is "playing"');
  expectEqual(
    ctx.oscillatorsCreated.length,
    8,
    'SineFallbackSynthesizer creates exactly 8 oscillators (4 harmonic layers x 2)'
  );

  // Verify all 4 harmonic layer frequencies
  const activeFreqs = ctx.oscillatorsCreated.map((o) => o.frequency.events[0]?.value);
  const expectedFreqs = [130.81, 196.0, 164.81, 261.63, 293.66, 392.0, 329.63, 523.25];
  let allFreqsMatch = true;
  for (let i = 0; i < expectedFreqs.length; i++) {
    if (Math.abs(activeFreqs[i] - expectedFreqs[i]) > 0.05) {
      allFreqsMatch = false;
      break;
    }
  }
  assert(
    allFreqsMatch,
    'SineFallbackSynthesizer frequencies accurately match all 4 harmonic layers',
    `Got [${activeFreqs.join(', ')}] vs Expected [${expectedFreqs.join(', ')}]`
  );

  // 2.2 Buffer Decoding Failure triggers Fallback
  const ctxDecodeFail = new MockAudioContext();
  ctxDecodeFail.shouldFailDecode = true; // decodeAudioData rejects
  const dest2 = ctxDecodeFail.createGain();

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => new ArrayBuffer(1024),
  });

  const playerDecodeFail = new StemPlayer();
  await playerDecodeFail.init(ctxDecodeFail, dest2);

  let decodeCaughtErr = null;
  try {
    await playerDecodeFail.load();
  } catch (err) {
    decodeCaughtErr = err;
  }

  expectEqual(
    decodeCaughtErr,
    null,
    'StemPlayer.load() on buffer decode failure completes without throwing'
  );
  expectEqual(
    playerDecodeFail.isUsingFallback(),
    true,
    'StemPlayer activates fallback when buffer decoding fails'
  );

  // 2.3 Quartile Crossfade Mathematical Bounds
  const q0 = calculateQuartileGains(0.0);
  expectEqual(q0.stem1, 1.0, 'Quartile 0%: Stem 1 is at 1.0');
  expectEqual(q0.stem2, 0.0, 'Quartile 0%: Stem 2 is at 0.0');

  const q25 = calculateQuartileGains(0.25);
  expectEqual(q25.stem1, 1.0, 'Quartile 25%: Stem 1 remains 1.0');

  const qMidQ2 = calculateQuartileGains(0.375, 'equal-power');
  expectCloseTo(qMidQ2.stem1, Math.SQRT1_2, 0.001, 'Mid-Q2: Stem 1 at equal-power ~0.7071');
  expectCloseTo(qMidQ2.stem2, Math.SQRT1_2, 0.001, 'Mid-Q2: Stem 2 at equal-power ~0.7071');
  expectCloseTo(
    qMidQ2.stem1 ** 2 + qMidQ2.stem2 ** 2,
    1.0,
    0.001,
    'Mid-Q2: Equal power sum stem1^2 + stem2^2 == 1.0'
  );

  const q50 = calculateQuartileGains(0.5);
  expectEqual(q50.stem2, 1.0, 'Quartile 50%: Stem 2 is at 1.0');

  const q75 = calculateQuartileGains(0.75);
  expectEqual(q75.stem3, 1.0, 'Quartile 75%: Stem 3 is at 1.0');

  const q100 = calculateQuartileGains(1.0);
  expectEqual(q100.stem4, 1.0, 'Quartile 100%: Stem 4 is at 1.0');

  // Verify updateProgress adjusts fallback harmonic layers
  let progressUpdateThrew = false;
  try {
    player404.updateProgress(0.4);
    player404.updateProgress(0.8);
    player404.updateProgress(1.0);
  } catch (err) {
    progressUpdateThrew = true;
  }
  expectEqual(
    progressUpdateThrew,
    false,
    'updateProgress() in fallback mode operates smoothly without errors'
  );

  // 2.4 Victory Fanfare in Fallback Mode
  const oscCountBeforeFanfare = ctx.oscillatorsCreated.length;
  player404.playFinalFanfare();
  expectEqual(player404.getState(), 'stopped', 'StemPlayer state is stopped after fanfare');
  const fanfareOscs = ctx.oscillatorsCreated.slice(oscCountBeforeFanfare);
  expectEqual(
    fanfareOscs.length,
    5,
    'playFinalFanfare() creates 5-note pentatonic synthesized fanfare'
  );
  const fanfareFreqs = fanfareOscs.map((o) => o.frequency.events[0]?.value);
  const expectedFanfare = [261.63, 329.63, 392.0, 523.25, 783.99]; // C4, E4, G4, C5, G5
  let fanfareMatches = true;
  for (let i = 0; i < expectedFanfare.length; i++) {
    if (Math.abs(fanfareFreqs[i] - expectedFanfare[i]) > 0.05) fanfareMatches = false;
  }
  assert(
    fanfareMatches,
    'Fanfare frequencies match C-major arpeggio notes',
    `Got [${fanfareFreqs.join(', ')}]`
  );

  player404.destroy();
  playerDecodeFail.destroy();
}

// ============================================================================
// Suite 3: Volume & Hotkey Stress
// ============================================================================
console.log('\n--- Suite 3: Volume & Hotkey Stress ---');

{
  mockWindow.localStorage.clear();
  const engine = new AudioNavigationEngine();
  await engine.init();

  let gestureCallbackTriggered = false;
  let volumeChangeEvents = [];
  let muteChangeEvents = [];

  const volController = new VolumeController(engine, {
    onGesture: () => {
      gestureCallbackTriggered = true;
    },
    onVolumeChange: (v) => {
      volumeChangeEvents.push(v);
    },
    onMuteChange: (m) => {
      muteChangeEvents.push(m);
    },
  });
  volController.attach();

  // 3.1 Strict Clamping [0.0, 1.0] under extreme upward and downward steps
  engine.setVolume(0.8, false);

  // Step UP 20 times (+0.1)
  for (let i = 0; i < 20; i++) {
    volController.stepVolume(0.1);
  }
  expectEqual(
    engine.getVolume(),
    1.0,
    'Repeated 20 volume up steps clamp strictly to 1.0 (never exceed 1.0)'
  );

  // Step DOWN 30 times (-0.1)
  for (let i = 0; i < 30; i++) {
    volController.stepVolume(-0.1);
  }
  expectEqual(
    engine.getVolume(),
    0.0,
    'Repeated 30 volume down steps clamp strictly to 0.0 (never drop below 0.0)'
  );

  // Direct boundary clamping
  engine.setVolume(1.8, false);
  expectEqual(engine.getVolume(), 1.0, 'Direct setVolume(1.8) clamps to 1.0');

  engine.setVolume(-0.4, false);
  expectEqual(engine.getVolume(), 0.0, 'Direct setVolume(-0.4) clamps to 0.0');

  // Floating point precision check: step 0.1 from 0.0 up to 0.7
  engine.setVolume(0.0, false);
  for (let i = 1; i <= 7; i++) {
    volController.stepVolume(0.1);
  }
  expectEqual(
    engine.getVolume(),
    0.7,
    'Volume stepping avoids floating point drift (exact 0.7, not 0.7000000000000001)'
  );

  // 3.2 Mute toggles & localStorage persistence
  expectEqual(engine.isMuted(), false, 'Initial muted state is false');

  volController.toggleMute();
  expectEqual(engine.isMuted(), true, 'toggleMute() toggles state to true');
  expectEqual(
    mockWindow.localStorage.getItem(AUDIO_NAV_STORAGE_KEYS.muted),
    'true',
    'Muted state persists to localStorage as "true"'
  );

  volController.toggleMute();
  expectEqual(engine.isMuted(), false, 'toggleMute() toggles state back to false');
  expectEqual(
    mockWindow.localStorage.getItem(AUDIO_NAV_STORAGE_KEYS.muted),
    'false',
    'Muted state persists to localStorage as "false"'
  );

  // Verify volume persistence
  volController.stepVolume(0.1); // 0.7 -> 0.8
  expectEqual(
    mockWindow.localStorage.getItem(AUDIO_NAV_STORAGE_KEYS.volume),
    '0.80',
    'Volume persists to localStorage formatted to 2 decimals'
  );

  // 3.3 Editable elements isolation from hotkeys
  const editableTargets = [
    new MockElement('INPUT'),
    new MockElement('TEXTAREA'),
    new MockElement('SELECT'),
    new MockElement('DIV', true), // isContentEditable = true
  ];

  const testHotkeys = [
    { key: '+', code: 'Equal' },
    { key: '-', code: 'Minus' },
    { key: '[', code: 'BracketLeft' },
    { key: ']', code: 'BracketRight' },
    { key: 'm', code: 'KeyM' },
    { key: 'M', code: 'KeyM' },
  ];

  for (const target of editableTargets) {
    for (const hk of testHotkeys) {
      const volBefore = engine.getVolume();
      const mutedBefore = engine.isMuted();

      const event = new MockKeyboardEvent({
        key: hk.key,
        code: hk.code,
        target,
      });

      mockWindow.dispatchEvent(event);

      expectEqual(
        engine.getVolume(),
        volBefore,
        `Editable element <${target.tagName} editable=${target.isContentEditable}> ignores key '${hk.key}'`
      );
      expectEqual(
        engine.isMuted(),
        mutedBefore,
        `Editable element <${target.tagName} editable=${target.isContentEditable}> ignores mute on '${hk.key}'`
      );
      expectEqual(
        event.defaultPrevented,
        false,
        `Editable element <${target.tagName}> event.preventDefault() is NOT invoked`
      );
    }
  }

  // 3.4 Non-editable elements process hotkeys cleanly
  const nonEditableTarget = new MockElement('DIV', false);
  engine.setVolume(0.5, false);

  // Test BracketRight (volume up) - 5% step
  const brEvent = new MockKeyboardEvent({
    key: ']',
    code: 'BracketRight',
    target: nonEditableTarget,
  });
  mockWindow.dispatchEvent(brEvent);
  expectEqual(engine.getVolume(), 0.55, 'Key "]" steps volume up by 0.05');
  expectEqual(brEvent.defaultPrevented, true, 'Key "]" calls preventDefault()');

  // Test BracketLeft (volume down) - 5% step
  const blEvent = new MockKeyboardEvent({
    key: '[',
    code: 'BracketLeft',
    target: nonEditableTarget,
  });
  mockWindow.dispatchEvent(blEvent);
  expectEqual(engine.getVolume(), 0.5, 'Key "[" steps volume down by 0.05');
  expectEqual(blEvent.defaultPrevented, true, 'Key "[" calls preventDefault()');

  // Test KeyM (mute toggle)
  const mEvent = new MockKeyboardEvent({
    key: 'm',
    code: 'KeyM',
    target: nonEditableTarget,
  });
  mockWindow.dispatchEvent(mEvent);
  expectEqual(engine.isMuted(), true, 'Key "m" toggles mute to true');
  expectEqual(mEvent.defaultPrevented, true, 'Key "m" calls preventDefault()');

  // Detach listener
  volController.detach();
  const detachedEvent = new MockKeyboardEvent({
    key: ']',
    code: 'BracketRight',
    target: nonEditableTarget,
  });
  mockWindow.dispatchEvent(detachedEvent);
  expectEqual(
    detachedEvent.defaultPrevented,
    false,
    'After detach(), hotkey events are ignored by VolumeController'
  );

  engine.destroy();
}

// ============================================================================
// Suite 4: Teardown & Leak Freedom Stress
// ============================================================================
console.log('\n--- Suite 4: Teardown & Leak Freedom Stress ---');

{
  const manager = new AudioNavManager();
  await manager.init();

  expectEqual(manager.isActive(), true, 'AudioNavManager isActive() is true after init');
  expectEqual(
    mockWindow.getListenerCount('keydown'),
    2, // 1 from volumeController, 1 from engine autoplay gesture
    'Initial active window keydown listeners attached'
  );

  // Trigger teardown
  let destroyThrew = false;
  try {
    manager.destroy();
  } catch (err) {
    destroyThrew = true;
    console.error('Destroy threw error:', err);
  }

  expectEqual(destroyThrew, false, 'AudioNavManager.destroy() executes cleanly without throwing');
  expectEqual(manager.isActive(), false, 'AudioNavManager isActive() is false after destroy');

  // Verify window keydown listener detached
  expectEqual(
    mockWindow.getListenerCount('keydown'),
    0,
    'All window keydown listeners detached after destroy()'
  );
  expectEqual(
    mockWindow.getListenerCount('pointerdown'),
    0,
    'Window pointerdown gesture listener detached after destroy()'
  );
  expectEqual(
    mockWindow.getListenerCount('touchstart'),
    0,
    'Window touchstart gesture listener detached after destroy()'
  );

  // Idempotent destroy check (calling destroy multiple times)
  let secondDestroyThrew = false;
  try {
    manager.destroy();
    manager.destroy();
  } catch (err) {
    secondDestroyThrew = true;
  }
  expectEqual(
    secondDestroyThrew,
    false,
    'Multiple sequential destroy() calls are safe and idempotent'
  );

  // Full re-initialization check
  let reinitThrew = false;
  try {
    await manager.init();
  } catch (err) {
    reinitThrew = true;
  }
  expectEqual(reinitThrew, false, 'Re-initialization after destroy() succeeds cleanly');
  expectEqual(manager.isActive(), true, 'Re-initialized manager is active');

  manager.destroy();
}

// ============================================================================
// Suite 5: Acoustic Beacon, Dynamic Frame Rates, & Topological Progress
// ============================================================================
console.log('\n--- Suite 5: Acoustic Beacon, Dynamic Frame Rates, & Topological Progress ---');

{
  const { BeaconSynthesizer, BEACON_DEFAULTS } = await import('../src/modules/audioNav/beacon.ts');

  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const beacon = new BeaconSynthesizer();
  beacon.init(ctx, dest);

  // 5.1 Beacon pulse timer and lifecycle
  beacon.start();
  expectEqual(beacon.destroy !== undefined, true, 'BeaconSynthesizer has destroy() method');

  // Destroy beacon cleanly
  beacon.destroy();

  // 5.2 Variable Frame Rate Jitter (144Hz, 60Hz, 30Hz lag spike) for collision cooldown
  const synthJitter = new CollisionSynthesizer();
  synthJitter.init(ctx, dest);

  // t0 = 10000ms
  simulatedPerfNow = 10000.0;
  expectEqual(synthJitter.trigger(), true, '144Hz simulation: Initial collision at t=0 succeeds');

  // Simulate 144Hz (~6.94ms per frame) sliding for 20 frames (~138ms)
  let suppressed144Count = 0;
  for (let f = 1; f <= 20; f++) {
    simulatedPerfNow = 10000.0 + f * (1000 / 144);
    if (!synthJitter.trigger()) suppressed144Count++;
  }
  expectEqual(suppressed144Count, 20, '144Hz simulation: All 20 sliding sub-frames suppressed (<280ms)');

  // Lag spike: frame jumps from 138ms to 279.5ms
  simulatedPerfNow = 10000.0 + 279.5;
  expectEqual(synthJitter.trigger(), false, '144Hz lag spike: Frame at 279.5ms still suppressed (<280ms)');

  // Next frame at 286.4ms (>280ms)
  simulatedPerfNow = 10000.0 + 286.4;
  expectEqual(synthJitter.trigger(), true, '144Hz recovery: Frame at 286.4ms cleanly triggers sound');

  synthJitter.destroy();
}

// ============================================================================
// Suite 6: Wall-Pushing Dynamics & High-Contrast Collision Synthesis
// ============================================================================
console.log('\n--- Suite 6: Wall-Pushing Dynamics & High-Contrast Collision Synthesis ---');

{
  const { AudioNavigationEngine } = await import('../src/modules/audioNav/engine.ts');
  const { CollisionSynthesizer } = await import('../src/modules/audioNav/collisionSynth.ts');
  const { updatePlayerPhysics } = await import('../src/core/physics.ts');

  // 6.1 Engine setWallPushing fades music to 5% (0.05) and restores to 0.50
  mockWindow.localStorage.clear();
  const engine = new AudioNavigationEngine();
  await engine.init();
  const nodes = engine.getNodes();

  if (nodes) {
    const musicGainParam = nodes.musicBus.gain;
    expectEqual(musicGainParam.value, 0.5, 'Initial music bus gain is 0.50');

    // Activate wall pushing
    engine.setWallPushing(true);
    const lastRampDown = musicGainParam.events[musicGainParam.events.length - 1];
    expectEqual(lastRampDown?.type, 'linearRampToValueAtTime', 'Wall pushing ramps music gain via linear ramp');
    expectEqual(Math.abs(lastRampDown?.value - 0.05) < 1e-6, true, 'Wall pushing targets 0.05 (5%) volume');

    // Deactivate wall pushing
    engine.setWallPushing(false);
    const lastRampUp = musicGainParam.events[musicGainParam.events.length - 1];
    expectEqual(lastRampUp?.type, 'linearRampToValueAtTime', 'Releasing wall pushing ramps music gain back via linear ramp');
    expectEqual(Math.abs(lastRampUp?.value - 0.50) < 1e-6, true, 'Releasing wall pushing targets base 0.50 (50%) volume');
  }

  engine.destroy();

  // 6.2 CollisionSynthesizer uses 1600Hz click and 180Hz kick under wall pushing
  const mockCtx = new MockAudioContext();
  const dest = mockCtx.createGain();
  const synth = new CollisionSynthesizer();
  synth.init(mockCtx, dest);

  simulatedPerfNow = 50000.0;
  synth.trigger('left', true); // High-contrast wall pushing

  // Last created oscillators should be layer 1 (kick) and layer 2 (click)
  const oscKick = mockCtx.oscillatorsCreated[mockCtx.oscillatorsCreated.length - 2];
  const oscClick = mockCtx.oscillatorsCreated[mockCtx.oscillatorsCreated.length - 1];

  expectEqual(oscClick?.frequency.value, 1600, 'High-contrast wall pushing elevates transient click to 1600Hz');
  expectEqual(oscKick?.frequency.events[0]?.value, 180, 'High-contrast wall pushing elevates sub thud kick start to 180Hz');

  synth.destroy();

  // 6.3 Physics updatePlayerPhysics detects isPushingWall
  const singleCell = [
    [
      { col: 0, row: 0, walls: { top: true, right: true, bottom: true, left: true } },
    ],
  ];
  // Player at boundary wall edge (radius = 0.125):
  const initialPhys = { pos: { x: 0.125, y: 0.5 }, vel: { x: 0, y: 0 } };
  const effectState = { type: 'fog_of_war' };

  // Pressing hard left into left wall:
  const physLeft = updatePlayerPhysics(initialPhys, { x: -1.0, y: 0 }, 0.016, singleCell, effectState);
  expectEqual(physLeft.collided, true, 'Moving into left wall sets collided: true');
  expectEqual(physLeft.collisionSide, 'left', 'Moving into left wall sets collisionSide: left');
  expectEqual(physLeft.isPushingWall, true, 'Holding left input into left wall sets isPushingWall: true');

  // Releasing input:
  const physNeutral = updatePlayerPhysics(physLeft, { x: 0, y: 0 }, 0.016, singleCell, effectState);
  expectEqual(physNeutral.isPushingWall, false, 'Zero input at wall sets isPushingWall: false');
}

// ============================================================================
// Suite 7: Directional Exit Music Routing, Panning, Lowpass Filtering & Mono Downmix
// ============================================================================
console.log('\n--- Suite 7: Directional Exit Music Routing, Panning, Lowpass Filtering & Mono Downmix ---');

{
  const testCtx = new MockAudioContext();
  const musicBus = testCtx.createGain();
  const player = new StemPlayer();
  await player.init(testCtx, musicBus);

  // 7.1 Audio Graph Routing: stemsBus -> filterNode -> pannerNode -> musicBus
  const stemsBus = player.getStemsBus();
  const filterNode = player.getFilterNode();
  const pannerNode = player.getPannerNode();

  assert(stemsBus !== null, 'StemPlayer initializes stemsBus');
  assert(filterNode !== null, 'StemPlayer initializes BiquadFilterNode');
  assert(pannerNode !== null, 'StemPlayer initializes StereoPannerNode');

  assert(
    stemsBus.destinations.has(filterNode),
    'stemsBus connects directly to BiquadFilterNode'
  );
  assert(
    filterNode.destinations.has(pannerNode),
    'BiquadFilterNode connects directly to StereoPannerNode'
  );
  assert(
    pannerNode.destinations.has(musicBus),
    'StereoPannerNode connects directly to musicBus destination'
  );

  // 7.2 Monophonic Conversion Prior to Stereo Panning
  expectEqual(
    stemsBus.channelCount,
    1,
    'stemsBus enforces channelCount = 1 for explicit mono downmixing'
  );
  expectEqual(
    stemsBus.channelCountMode,
    'explicit',
    'stemsBus enforces channelCountMode = "explicit"'
  );

  expectEqual(
    filterNode.channelCount,
    1,
    'BiquadFilterNode before panner enforces channelCount = 1'
  );
  expectEqual(
    filterNode.channelCountMode,
    'explicit',
    'BiquadFilterNode before panner enforces channelCountMode = "explicit"'
  );

  // Fallback synthesizer mono downmixing check
  const fallbackSynth = new SineFallbackSynthesizer(testCtx, stemsBus);
  expectEqual(
    fallbackSynth['masterGain'].channelCount,
    1,
    'SineFallbackSynthesizer masterGain enforces channelCount = 1'
  );
  expectEqual(
    fallbackSynth['masterGain'].channelCountMode,
    'explicit',
    'SineFallbackSynthesizer masterGain enforces channelCountMode = "explicit"'
  );
  fallbackSynth.destroy();

  // 7.3 Directional Panning & Filter Cutoffs across BFS Path Steps
  testCtx.currentTime = 10.0;

  // Next tile Right (dx > 0): pan = 1.0 (Left channel 0% / silent), filter = 20000Hz
  player.updateDirection(1, 0);
  expectEqual(player.getCurrentPan(), 1.0, 'Next tile Right (dx > 0): targetPan is 1.0');
  expectEqual(player.getCurrentFilterFreq(), 20000, 'Next tile Right (dx > 0): filter is bright/open (20000Hz)');
  const panRightEvent = pannerNode.pan.events[pannerNode.pan.events.length - 1];
  expectEqual(panRightEvent?.type, 'linearRampToValueAtTime', 'Pan ramps smoothly via linear ramp');
  expectCloseTo(panRightEvent?.value, 1.0, 0.001, 'Pan ramps to 1.0');
  expectCloseTo(panRightEvent?.time - testCtx.currentTime, 0.07, 0.015, 'Pan ramp duration is 60-80ms (70ms)');

  // Next tile Left (dx < 0): pan = -1.0 (Right channel 0% / silent), filter = 20000Hz
  testCtx.currentTime = 11.0;
  player.updateDirection(-1, 0);
  expectEqual(player.getCurrentPan(), -1.0, 'Next tile Left (dx < 0): targetPan is -1.0');
  expectEqual(player.getCurrentFilterFreq(), 20000, 'Next tile Left (dx < 0): filter is bright/open (20000Hz)');
  const panLeftEvent = pannerNode.pan.events[pannerNode.pan.events.length - 1];
  expectCloseTo(panLeftEvent?.value, -1.0, 0.001, 'Pan ramps to -1.0');

  // Next tile Forward / North (dy < 0): pan = 0.0, filter = 20000Hz (bright open sound)
  testCtx.currentTime = 12.0;
  player.updateDirection(0, -1);
  expectEqual(player.getCurrentPan(), 0.0, 'Next tile Forward (dy < 0): pan is centered (0.0)');
  expectEqual(player.getCurrentFilterFreq(), 20000, 'Next tile Forward (dy < 0): filter is bright open (20000Hz)');
  const filterForwardEvent = filterNode.frequency.events[filterNode.frequency.events.length - 1];
  expectEqual(filterForwardEvent?.type, 'linearRampToValueAtTime', 'Filter ramps smoothly via linear ramp');
  expectEqual(filterForwardEvent?.value, 20000, 'Filter ramps to 20000Hz for open forward sound');

  // Next tile Backward / South / Dead-end (dy > 0): pan = 0.0, filter = 600Hz (muffled lowpass)
  testCtx.currentTime = 13.0;
  player.updateDirection(0, 1);
  expectEqual(player.getCurrentPan(), 0.0, 'Next tile Backward (dy > 0): pan is centered (0.0)');
  expectEqual(player.getCurrentFilterFreq(), 600, 'Next tile Backward (dy > 0): filter is active 600Hz lowpass');
  const filterMuffledEvent = filterNode.frequency.events[filterNode.frequency.events.length - 1];
  expectEqual(filterMuffledEvent?.value, 600, 'Filter frequency targets 600Hz muffled tone');
  expectCloseTo(filterMuffledEvent?.time - testCtx.currentTime, 0.07, 0.015, 'Filter ramp duration is 60-80ms (70ms)');

  // 7.4 AudioNavManager Integration & Dynamic Position Updates
  const manager = new AudioNavManager();
  await manager.init();

  const managerNodes = manager['engine'].getNodes();
  assert(managerNodes.musicFilter !== null, 'AudioNavManager exposes musicFilter on engine nodes');
  assert(managerNodes.musicPanner !== null, 'AudioNavManager exposes musicPanner on engine nodes');
  expectEqual(manager.getMusicPanner(), manager.getStemPlayer().getPannerNode(), 'manager.getMusicPanner() matches stem player panner');
  expectEqual(manager.getMusicFilter(), manager.getStemPlayer().getFilterNode(), 'manager.getMusicFilter() matches stem player filter');

  // Build a test 3x3 maze with exit at (2, 0) [North-East]
  const testGrid = Array.from({ length: 3 }, (_, r) =>
    Array.from({ length: 3 }, (_, c) => ({
      col: c,
      row: r,
      walls: { top: false, right: false, bottom: false, left: false },
    }))
  );
  const testMaze = {
    cells: testGrid,
    start: { col: 0, row: 2 },
    exit: { col: 2, row: 0 },
    shortestPath: [],
    checkpoints: [],
  };

  // Player at (0, 2): next step along shortest path to (2, 0)
  manager.updatePlayerPosition({ x: 0.5, y: 2.5 }, testMaze);
  const stemPanner = manager.getMusicPanner();
  assert(stemPanner !== null, 'Stem panner is active');
  const stemPlayerInstance = manager.getStemPlayer();
  expectEqual(stemPlayerInstance.getCurrentPan(), 1.0, 'Step (0,2) targets pan = 1.0 (Right)');
  expectEqual(stemPlayerInstance.getCurrentFilterFreq(), 20000, 'Step (0,2) targets filter = 20000Hz (bright open)');

  // Player steps east to (1, 2)
  manager.updatePlayerPosition({ x: 1.5, y: 2.5 }, testMaze);
  expectEqual(stemPlayerInstance.getCurrentPan(), 1.0, 'Step (1,2) targets pan = 1.0 (Right)');

  // Player steps east to (2, 2) [Corner turn towards north]
  manager.updatePlayerPosition({ x: 2.5, y: 2.5 }, testMaze);
  expectEqual(stemPlayerInstance.getCurrentPan(), 0.0, 'Step (2,2) targets pan = 0.0 (Forward/North)');
  expectEqual(stemPlayerInstance.getCurrentFilterFreq(), 20000, 'Step (2,2) targets filter = 20000Hz (bright open)');

  // Player steps north to (2, 1)
  manager.updatePlayerPosition({ x: 2.5, y: 1.5 }, testMaze);
  expectEqual(stemPlayerInstance.getCurrentPan(), 0.0, 'Step (2,1) targets pan = 0.0 (Forward/North)');

  // Player reaches exit (2, 0)
  manager.updatePlayerPosition({ x: 2.5, y: 0.5 }, testMaze);
  expectEqual(stemPlayerInstance.getCurrentPan(), 0.0, 'Exit cell targets pan = 0.0 (Centered)');
  expectEqual(stemPlayerInstance.getCurrentFilterFreq(), 20000, 'Exit cell targets filter = 20000Hz (bright open)');

  // 7.5 High-frequency 144Hz movement deduplication stress
  player.updateDirection(1, 0); // establish right direction
  const preEventsCount = pannerNode.pan.events.length;
  for (let frame = 0; frame < 50; frame++) {
    testCtx.currentTime += 0.007; // ~7ms per frame at 144Hz
    player.updateDirection(1, 0); // Moving continuously in the same rightward direction
  }
  const postEventsCount = pannerNode.pan.events.length;
  expectEqual(postEventsCount - preEventsCount, 0, '144Hz continuous straight movement does not spam redundant ramp events');

  // 7.6 Filter recovery transition: Backward (600Hz) -> Forward (20000Hz)
  testCtx.currentTime += 0.1;
  player.updateDirection(0, 1); // Backward (600Hz)
  expectEqual(player.getCurrentFilterFreq(), 600, 'Backward step triggers 600Hz lowpass filter');
  testCtx.currentTime += 0.1;
  player.updateDirection(0, -1); // Forward (20000Hz)
  expectEqual(player.getCurrentFilterFreq(), 20000, 'Forward turn triggers 20000Hz bright tone');
  const filterRecoveryEvent = filterNode.frequency.events[filterNode.frequency.events.length - 1];
  expectEqual(filterRecoveryEvent?.type, 'linearRampToValueAtTime', 'Filter re-opens via linear ramp');
  expectEqual(filterRecoveryEvent?.value, 20000, 'Filter recovery targets 20000Hz');

  // 7.7 Suspended AudioContext initial position tracking
  const suspendedManager = new AudioNavManager();
  await suspendedManager.init();
  const suspendedCtx = suspendedManager['engine'].getContext();
  if (suspendedCtx) {
    suspendedCtx.state = 'suspended';
  }
  suspendedManager.updatePlayerPosition({ x: 0.5, y: 2.5 }, testMaze);
  expectEqual(suspendedManager.getStemPlayer().getCurrentPan(), 1.0, 'Suspended AudioContext computes initial pan on start position');
  suspendedManager.destroy();

  manager.destroy();
  player.destroy();
}
console.log(`TOTAL TESTS: ${results.passed + results.failed}`);
console.log(`PASSED: ${results.passed}`);
console.log(`FAILED: ${results.failed}`);
console.log('==================================================================\n');

if (results.failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
