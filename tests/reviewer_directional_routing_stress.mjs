/**
 * tests/reviewer_directional_routing_stress.mjs
 *
 * Adversarial Reviewer Stress Suite for Exit Music Directional Routing,
 * Panning, BiquadFilter, and Monophonic Downmixing.
 *
 * Validates:
 * 1. Monophonic Downmix Topology (zero crosstalk / inter-channel bleed)
 * 2. Directional BFS Panning (dx > 0 -> pan = 1.0, dx < 0 -> pan = -1.0, dy < 0 -> pan = 0.0)
 * 3. 600Hz Lowpass Muffling on Backward Step (dy > 0 -> filter = 600Hz, then dy < 0 -> 20000Hz)
 * 4. 144Hz Frame-Rate Churn (zero redundant ramp spamming during straight corridors)
 * 5. Suspended AudioContext Initialization & Auto-Resume Resilience
 * 6. Lifecycle Churn (rapid init -> update -> destroy -> re-init)
 */

import { register } from 'node:module';
import assert from 'node:assert/strict';

try {
  register(new URL('./ts_resolver.mjs', import.meta.url).href);
} catch {
  // Ignore if already registered
}

const { StemPlayer, SineFallbackSynthesizer } = await import('../src/modules/audioNav/stems.ts');
const { BeaconSynthesizer } = await import('../src/modules/audioNav/beacon.ts');
const { AudioNavManager } = await import('../src/modules/audioNav/index.ts');
const { computeExitNavigationField } = await import('../src/core/pathfinder.ts');

// ============================================================================
// Mock AudioContext & Web Audio Environment
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

  setTargetAtTime(val, time, constant) {
    this.value = val;
    this.events.push({ type: 'setTargetAtTime', value: val, time, constant });
    return this;
  }

  cancelScheduledValues(time) {
    this.events.push({ type: 'cancelScheduledValues', time });
    return this;
  }

  cancelAndHoldAtTime(time) {
    this.events.push({ type: 'cancelAndHoldAtTime', time });
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

  connect(target) {
    this.destinations.add(target);
    return target;
  }

  disconnect(target) {
    if (target) {
      this.destinations.delete(target);
    } else {
      this.destinations.clear();
    }
  }
}

class MockGainNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.gain = new MockAudioParam(1.0);
  }
}

class MockStereoPannerNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.pan = new MockAudioParam(0.0);
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.type = 'lowpass';
    this.frequency = new MockAudioParam(350);
    this.Q = new MockAudioParam(1.0);
  }
}

class MockOscillatorNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.frequency = new MockAudioParam(440);
    this.type = 'sine';
  }

  start() {}
  stop() {}
}

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.destination = new MockGainNode(this);
  }

  createGain() {
    return new MockGainNode(this);
  }

  createOscillator() {
    return new MockOscillatorNode(this);
  }

  createStereoPanner() {
    return new MockStereoPannerNode(this);
  }

  createBiquadFilter() {
    return new MockBiquadFilterNode(this);
  }

  resume() {
    this.state = 'running';
    return Promise.resolve();
  }

  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

globalThis.window = {
  AudioContext: MockAudioContext,
  addEventListener: () => {},
  removeEventListener: () => {},
  localStorage: {
    getItem: () => null,
    setItem: () => {},
  },
};

let passedCount = 0;
function test(name, fn) {
  try {
    fn();
    passedCount++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err);
    throw err;
  }
}

async function runReviewerStressSuite() {
  console.log('\n============================================================');
  console.log('REVIEWER ADVERSARIAL STRESS SUITE: EXIT MUSIC ROUTING & PAN');
  console.log('============================================================\n');

  // Test 1: Full Monophonic Downmixing Topology
  test('R1/R2: stemsBus routes through BiquadFilter and StereoPanner with explicit mono downmixing', async () => {
    const ctx = new MockAudioContext();
    const musicBus = ctx.createGain();
    const player = new StemPlayer();
    await player.init(ctx, musicBus);

    const stemsBus = player.getStemsBus();
    const filter = player.getFilterNode();
    const panner = player.getPannerNode();

    assert.ok(stemsBus, 'stemsBus exists');
    assert.ok(filter, 'filter exists');
    assert.ok(panner, 'panner exists');

    assert.equal(stemsBus.channelCount, 1);
    assert.equal(stemsBus.channelCountMode, 'explicit');
    assert.equal(filter.channelCount, 1);
    assert.equal(filter.channelCountMode, 'explicit');

    assert.ok(stemsBus.destinations.has(filter), 'stemsBus -> filter');
    assert.ok(filter.destinations.has(panner), 'filter -> panner');
    assert.ok(panner.destinations.has(musicBus), 'panner -> musicBus');

    player.destroy();
  });

  // Test 2: Directional Calculations & Equal-Power Panning Verification
  test('R1: Hard Right (dx > 0) sets pan = 1.0 (left ear 100% silent)', async () => {
    const ctx = new MockAudioContext();
    const musicBus = ctx.createGain();
    const player = new StemPlayer();
    await player.init(ctx, musicBus);

    ctx.currentTime = 5.0;
    player.updateDirection(1, 0);

    assert.equal(player.getCurrentPan(), 1.0);
    assert.equal(player.getCurrentFilterFreq(), 20000);

    const panner = player.getPannerNode();
    const lastEvent = panner.pan.events[panner.pan.events.length - 1];
    assert.equal(lastEvent.type, 'linearRampToValueAtTime');
    assert.equal(lastEvent.value, 1.0);
    assert.ok(Math.abs(lastEvent.time - 5.07) < 0.001, 'Ramp duration is exactly 70ms');

    // Mathematical zero-bleed check on equal power panning:
    // When pan = 1.0: left = cos((1+1)*pi/4) = cos(pi/2) = 0.0
    const pan = player.getCurrentPan();
    const leftGain = Math.cos(((pan + 1) * Math.PI) / 4);
    const rightGain = Math.sin(((pan + 1) * Math.PI) / 4);
    assert.ok(Math.abs(leftGain) < 1e-10, 'Left ear is mathematically 0% (silent)');
    assert.ok(Math.abs(rightGain - 1.0) < 1e-10, 'Right ear is mathematically 100%');

    player.destroy();
  });

  test('R1: Hard Left (dx < 0) sets pan = -1.0 (right ear 100% silent)', async () => {
    const ctx = new MockAudioContext();
    const musicBus = ctx.createGain();
    const player = new StemPlayer();
    await player.init(ctx, musicBus);

    ctx.currentTime = 10.0;
    player.updateDirection(-1, 0);

    assert.equal(player.getCurrentPan(), -1.0);
    assert.equal(player.getCurrentFilterFreq(), 20000);

    const pan = player.getCurrentPan();
    const leftGain = Math.cos(((pan + 1) * Math.PI) / 4);
    const rightGain = Math.sin(((pan + 1) * Math.PI) / 4);
    assert.ok(Math.abs(rightGain) < 1e-10, 'Right ear is mathematically 0% (silent)');
    assert.ok(Math.abs(leftGain - 1.0) < 1e-10, 'Left ear is mathematically 100%');

    player.destroy();
  });

  test('R1: Forward (dy < 0) sets pan = 0.0 with bright 20000Hz filter', async () => {
    const ctx = new MockAudioContext();
    const musicBus = ctx.createGain();
    const player = new StemPlayer();
    await player.init(ctx, musicBus);

    ctx.currentTime = 15.0;
    player.updateDirection(0, -1);

    assert.equal(player.getCurrentPan(), 0.0);
    assert.equal(player.getCurrentFilterFreq(), 20000);

    const pan = player.getCurrentPan();
    const leftGain = Math.cos(((pan + 1) * Math.PI) / 4);
    const rightGain = Math.sin(((pan + 1) * Math.PI) / 4);
    assert.ok(Math.abs(leftGain - rightGain) < 1e-10, 'Both ears equal volume');

    player.destroy();
  });

  test('R1: Backward / Dead-end (dy > 0) sets pan = 0.0 with 600Hz lowpass filter', async () => {
    const ctx = new MockAudioContext();
    const musicBus = ctx.createGain();
    const player = new StemPlayer();
    await player.init(ctx, musicBus);

    ctx.currentTime = 20.0;
    player.updateDirection(0, 1);

    assert.equal(player.getCurrentPan(), 0.0);
    assert.equal(player.getCurrentFilterFreq(), 600);

    const filter = player.getFilterNode();
    const lastEvent = filter.frequency.events[filter.frequency.events.length - 1];
    assert.equal(lastEvent.type, 'linearRampToValueAtTime');
    assert.equal(lastEvent.value, 600);
    assert.ok(Math.abs(lastEvent.time - 20.07) < 0.001, 'Filter ramp is 70ms');

    // Turn back forward (dy < 0) -> filter re-opens to 20000Hz
    ctx.currentTime = 21.0;
    player.updateDirection(0, -1);
    assert.equal(player.getCurrentFilterFreq(), 20000);
    const reOpenEvent = filter.frequency.events[filter.frequency.events.length - 1];
    assert.equal(reOpenEvent.value, 20000);

    player.destroy();
  });

  // Test 3: 144Hz Churn & Zero Redundant Ramp Events
  test('R3: Continuous straight corridor movement at 144Hz schedules EXACTLY 1 ramp', async () => {
    const ctx = new MockAudioContext();
    const musicBus = ctx.createGain();
    const player = new StemPlayer();
    await player.init(ctx, musicBus);

    const panner = player.getPannerNode();
    ctx.currentTime = 1.0;

    // First frame of straight corridor
    player.updateDirection(1, 0);
    const eventCountAfterFirstFrame = panner.pan.events.length;
    assert.ok(eventCountAfterFirstFrame > 0, 'Ramp scheduled on initial frame');

    // 144Hz simulation: 100 consecutive frames with delta time 6.94ms
    for (let frame = 1; frame <= 100; frame++) {
      ctx.currentTime += 0.00694;
      player.updateDirection(1, 0);
    }

    assert.equal(
      panner.pan.events.length,
      eventCountAfterFirstFrame,
      'No redundant ramp events spammed during continuous motion in same direction'
    );

    // Turn corner to Left (dx < 0)
    ctx.currentTime += 0.00694;
    player.updateDirection(-1, 0);
    assert.equal(
      panner.pan.events.length,
      eventCountAfterFirstFrame + 3, // cancelScheduledValues + setValueAtTime + linearRampToValueAtTime
      'New ramp scheduled cleanly upon turn'
    );

    player.destroy();
  });

  // Test 4: Suspended AudioContext Initialization & Immediate Positioning
  test('R3: Suspended AudioContext sets initial parameters immediately without throwing', async () => {
    const ctx = new MockAudioContext();
    ctx.state = 'suspended'; // Simulated browser autoplay lockdown
    const musicBus = ctx.createGain();
    const player = new StemPlayer();
    await player.init(ctx, musicBus);

    player.updateDirection(1, 0);
    assert.equal(player.getCurrentPan(), 1.0);
    const panner = player.getPannerNode();
    const lastEvent = panner.pan.events[panner.pan.events.length - 1];
    assert.equal(lastEvent.type, 'setValueAtTime');
    assert.equal(lastEvent.value, 1.0);

    player.destroy();
  });

  // Test 5: Complex Maze Topological Field & Dead-End Navigation
  test('R1/R3: End-to-end AudioNavManager navigation through Wilson labyrinth with dead-ends', async () => {
    const manager = new AudioNavManager();
    await manager.init();

    // 4x4 maze with an explicit dead-end at (0, 0) and exit at (3, 3)
    const cells = Array.from({ length: 4 }, (_, r) =>
      Array.from({ length: 4 }, (_, c) => ({
        col: c,
        row: r,
        walls: {
          top: r === 0,
          right: c === 3,
          bottom: r === 3,
          left: c === 0,
        },
      }))
    );

    // Add interior walls creating dead end at (0,0) opening only South to (0,1)
    cells[0][0].walls.right = true;
    cells[0][1].walls.left = true;

    const mazeData = {
      cols: 4,
      rows: 4,
      cells,
      start: { col: 0, row: 0 },
      exit: { col: 3, row: 3 },
      shortestPath: [],
      checkpoints: [],
    };

    // Step at (0, 0): Only way out is South (dy = 1 > 0) -> Backward / Dead-end step!
    manager.updatePlayerPosition({ x: 0.5, y: 0.5 }, mazeData);
    const stemPlayer = manager.getStemPlayer();
    assert.equal(stemPlayer.getCurrentPan(), 0.0, 'Dead-end pan is 0.0');
    assert.equal(stemPlayer.getCurrentFilterFreq(), 600, 'Dead-end step South triggers 600Hz lowpass filter');

    // Step at (0, 1): Suppose path turns East to (1, 1) -> dx = 1 > 0
    manager.updatePlayerPosition({ x: 1.5, y: 1.5 }, mazeData);
    assert.ok(stemPlayer.getCurrentPan() !== undefined);

    manager.destroy();
  });

  // Test 6: Re-initialization & Lifecycle Idempotency
  test('R1: StemPlayer re-initialization cleans up previous nodes without leaking', async () => {
    const ctx = new MockAudioContext();
    const musicBus = ctx.createGain();
    const player = new StemPlayer();

    await player.init(ctx, musicBus);
    const firstPanner = player.getPannerNode();

    // Re-init with new destination
    const newMusicBus = ctx.createGain();
    await player.init(ctx, newMusicBus);
    const secondPanner = player.getPannerNode();

    assert.notEqual(firstPanner, secondPanner, 'New panner created on re-init');
    assert.equal(firstPanner.destinations.size, 0, 'First panner disconnected');

    player.destroy();
    assert.equal(player.getPannerNode(), null);
    assert.equal(player.getFilterNode(), null);
    assert.equal(player.getStemsBus(), null);
  });

  // Test 7: BeaconSynthesizer 144Hz Churn & Zero Redundant Ramp Events
  test('R1/R3: BeaconSynthesizer 144Hz corridor motion deduplicates ramps', async () => {
    const ctx = new MockAudioContext();
    const beaconBus = ctx.createGain();
    const beacon = new BeaconSynthesizer();
    beacon.init(ctx, beaconBus);

    const testGrid = Array.from({ length: 4 }, (_, r) =>
      Array.from({ length: 4 }, (_, c) => ({
        col: c,
        row: r,
        walls: { top: false, right: false, bottom: false, left: false },
      }))
    );
    const testMaze = {
      cells: testGrid,
      start: { col: 0, row: 0 },
      exit: { col: 3, row: 0 },
      shortestPath: [],
      checkpoints: [],
    };

    ctx.currentTime = 1.0;
    // Step 1: Eastward corridor step -> targetPan = 1.0
    beacon.updatePosition({ x: 0.5, y: 0.5 }, testMaze);
    const panner = beacon['pannerNode'];
    assert.ok(panner, 'Beacon panner initialized');
    const eventCountAfterFirstFrame = panner.pan.events.length;
    assert.ok(eventCountAfterFirstFrame > 0, 'Beacon scheduled ramp on initial frame');

    // 144Hz simulation: 100 consecutive frames in the same cell / direction
    for (let frame = 1; frame <= 100; frame++) {
      ctx.currentTime += 0.00694;
      beacon.updatePosition({ x: 0.5 + frame * 0.001, y: 0.5 }, testMaze);
    }

    assert.equal(
      panner.pan.events.length,
      eventCountAfterFirstFrame,
      'Beacon does not spam redundant ramps at 144Hz during continuous motion'
    );

    beacon.destroy();
  });

  // Test 8: BeaconSynthesizer Suspended AudioContext Initialization
  test('R1/R3: BeaconSynthesizer sets initial parameters in suspended AudioContext', async () => {
    const ctx = new MockAudioContext();
    ctx.state = 'suspended';
    const beaconBus = ctx.createGain();
    const beacon = new BeaconSynthesizer();
    beacon.init(ctx, beaconBus);

    const testGrid = Array.from({ length: 3 }, (_, r) =>
      Array.from({ length: 3 }, (_, c) => ({
        col: c,
        row: r,
        walls: { top: false, right: false, bottom: false, left: false },
      }))
    );
    const testMaze = {
      cells: testGrid,
      start: { col: 0, row: 0 },
      exit: { col: 2, row: 0 },
      shortestPath: [],
      checkpoints: [],
    };

    beacon.updatePosition({ x: 0.5, y: 0.5 }, testMaze);
    assert.equal(beacon.getCurrentPan(), 1.0);
    const panner = beacon['pannerNode'];
    const lastEvent = panner.pan.events[panner.pan.events.length - 1];
    assert.equal(lastEvent.type, 'setValueAtTime');
    assert.equal(lastEvent.value, 1.0);

    beacon.destroy();
  });

  // Test 9: Robust Fallback for Environments Without createStereoPanner
  test('Minor Robustness Risk: Legacy browser without createStereoPanner falls back cleanly', async () => {
    const legacyCtx = new MockAudioContext();
    // Simulate legacy browser by removing createStereoPanner
    delete legacyCtx.createStereoPanner;

    const musicBus = legacyCtx.createGain();
    const player = new StemPlayer();
    await player.init(legacyCtx, musicBus);

    const pannerNode = player.getPannerNode();
    assert.ok(pannerNode, 'Fallback panner node created');
    assert.ok(pannerNode.pan, 'Fallback pan AudioParam created');

    // Direction changes should update pan.value cleanly without throwing TypeError
    player.updateDirection(1, 0);
    assert.equal(player.getCurrentPan(), 1.0);
    assert.equal(pannerNode.pan.value, 1.0, 'Fallback pan.value is updated');

    player.updateDirection(-1, 0);
    assert.equal(player.getCurrentPan(), -1.0);
    assert.equal(pannerNode.pan.value, -1.0, 'Fallback pan.value updated to -1.0');

    player.destroy();
  });

  // Test 10: Fanfare Monophonic Downmixing Isolation
  test('R2: SineFallbackSynthesizer.playFanfare notes enforce explicit mono downmix', async () => {
    const ctx = new MockAudioContext();
    const dest = ctx.createGain();
    const synth = new SineFallbackSynthesizer(ctx, dest);

    // Track created gain nodes
    const createdGains = [];
    const origCreateGain = ctx.createGain.bind(ctx);
    ctx.createGain = () => {
      const g = origCreateGain();
      createdGains.push(g);
      return g;
    };

    synth.playFanfare();

    // Fanfare creates 5 note gain nodes
    assert.ok(createdGains.length >= 5, 'Fanfare notes created gain nodes');
    createdGains.forEach((g) => {
      assert.equal(g.channelCount, 1, 'Fanfare note enforces channelCount = 1');
      assert.equal(g.channelCountMode, 'explicit', 'Fanfare note enforces channelCountMode = "explicit"');
    });

    synth.destroy();
    ctx.createGain = origCreateGain;
  });

  // Test 11: Rapid 4-Direction Turnaround Churn
  test('R1: Rapid direction shifts (Right -> Left -> Backward -> Forward) transition cleanly', async () => {
    const ctx = new MockAudioContext();
    const musicBus = ctx.createGain();
    const player = new StemPlayer();
    await player.init(ctx, musicBus);

    ctx.currentTime = 100.0;
    // Frame 1: Right
    player.updateDirection(1, 0);
    assert.equal(player.getCurrentPan(), 1.0);
    assert.equal(player.getCurrentFilterFreq(), 20000);

    // Frame 2: Left (10ms later)
    ctx.currentTime += 0.01;
    player.updateDirection(-1, 0);
    assert.equal(player.getCurrentPan(), -1.0);
    assert.equal(player.getCurrentFilterFreq(), 20000);

    // Frame 3: Backward / Dead-end (10ms later)
    ctx.currentTime += 0.01;
    player.updateDirection(0, 1);
    assert.equal(player.getCurrentPan(), 0.0);
    assert.equal(player.getCurrentFilterFreq(), 600);

    // Frame 4: Forward (10ms later)
    ctx.currentTime += 0.01;
    player.updateDirection(0, -1);
    assert.equal(player.getCurrentPan(), 0.0);
    assert.equal(player.getCurrentFilterFreq(), 20000);

    player.destroy();
  });

  // Test 15: Beacon Exit Arrival Panning & Filter Centering
  test('R1/R3: BeaconSynthesizer centers panning (0.0) and opens filter (20000Hz) upon reaching exit cell', async () => {
    const ctx = new MockAudioContext();
    const beaconBus = ctx.createGain();
    const beacon = new BeaconSynthesizer();
    beacon.init(ctx, beaconBus);

    const testGrid = [[{ col: 0, row: 0, walls: {} }, { col: 1, row: 0, walls: {} }]];
    const maze = { cells: testGrid, start: { col: 0, row: 0 }, exit: { col: 1, row: 0 }, shortestPath: [], checkpoints: [] };

    // Approaching exit from West (dx > 0 -> pan = 1.0)
    ctx.currentTime = 50.0;
    beacon.updatePosition({ x: 0.5, y: 0.5 }, maze);
    assert.equal(beacon.getCurrentPan(), 1.0, 'Pre-exit pan is 1.0 (Right)');
    assert.equal(beacon['isAtExit'], false);

    // Arrive at exit tile (1, 0)
    ctx.currentTime = 51.0;
    beacon.updatePosition({ x: 1.5, y: 0.5 }, maze);
    assert.equal(beacon.getCurrentPan(), 0.0, 'Exit cell pan is centered (0.0)');
    assert.equal(beacon['isAtExit'], true, 'isAtExit flag is set');

    const panner = beacon['pannerNode'];
    const lastEvent = panner.pan.events[panner.pan.events.length - 1];
    assert.equal(lastEvent.type, 'linearRampToValueAtTime');
    assert.equal(lastEvent.value, 0.0, 'Panner ramps to centered 0.0 on exit arrival');

    beacon.destroy();
  });

  // Test 16: SineFallbackSynthesizer Rapid Restart
  test('R1/R2: SineFallbackSynthesizer rapid stop() followed immediately by start() preserves oscillators without timeout extinction', async () => {
    const ctx = new MockAudioContext();
    const dest = ctx.createGain();
    const synth = new SineFallbackSynthesizer(ctx, dest);

    synth.start({ stem1: 1, stem2: 0, stem3: 0, stem4: 0 });
    assert.equal(synth['isRunning'], true);
    assert.equal(synth['oscillators'].length, 8, '8 oscillators active');

    // Rapid stop followed by immediate start (e.g. rapid level restart)
    synth.stop();
    assert.equal(synth['isRunning'], false, 'isRunning is immediately false after stop');
    synth.start({ stem1: 1, stem2: 0, stem3: 0, stem4: 0 });
    assert.equal(synth['isRunning'], true, 'isRunning is true after restart');
    assert.equal(synth['oscillators'].length, 8, '8 new oscillators active');

    // Wait past the 100ms stop timeout window to ensure new oscillators are not killed
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(synth['isRunning'], true, 'Synthesizer still running after 150ms');
    assert.equal(synth['oscillators'].length, 8, 'Oscillators not killed by delayed timeout');

    synth.destroy();
  });

  // Test 17: Fanfare Cleanup on Destroy
  test('R1/R2: SineFallbackSynthesizer destroy() during fanfare cancels all in-flight fanfare oscillators and gains', async () => {
    const ctx = new MockAudioContext();
    const dest = ctx.createGain();
    const synth = new SineFallbackSynthesizer(ctx, dest);

    synth.playFanfare();
    assert.ok(synth['fanfareOscillators'].length > 0, 'Fanfare oscillators tracked');
    assert.ok(synth['fanfareGains'].length > 0, 'Fanfare gains tracked');

    synth.destroy();
    assert.equal(synth['fanfareOscillators'].length, 0, 'Fanfare oscillators cleared on destroy');
    assert.equal(synth['fanfareGains'].length, 0, 'Fanfare gains cleared on destroy');
  });

  // Test 18: StemPlayer playFinalFanfare looping sources cleanup
  test('R1/R3: StemPlayer playFinalFanfare() stops looping sources after fadeout and cleans up in destroy()', async () => {
    const ctx = new MockAudioContext();
    const musicBus = ctx.createGain();
    const player = new StemPlayer();
    await player.init(ctx, musicBus);

    player.playFinalFanfare();
    assert.equal(player.getState(), 'stopped');

    // Wait past 150ms fadeout window
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.equal(player['sources'].length, 0, 'Looping sources stopped and released after fadeout');

    player.destroy();
  });

  console.log(`\n============================================================`);
  console.log(`ALL ${passedCount} REVIEWER ADVERSARIAL STRESS TESTS PASSED CLEANLY!`);
  console.log(`============================================================\n`);
}

runReviewerStressSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
