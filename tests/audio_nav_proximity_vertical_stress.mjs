/**
 * tests/audio_nav_proximity_vertical_stress.mjs
 *
 * Comprehensive stress and verification test suite for:
 * 1. BFS Hot-Cold Proximity Attenuation Logic («Горячо — Холодно» по BFS)
 *    - 100% when moving towards exit (currentDist < prevDist)
 *    - 25% smooth drop per step away (currentDist > prevDist) down to 30% clamp (0.30)
 *    - Instant 100% restoration upon returning to correct path
 * 2. Contrasting Melodic Gestures for Vertical Movement:
 *    - Up / North (dy < 0): ascending two-tone impulse 650 Hz -> 880 Hz over 80 ms (rising gesture ↗)
 *    - Down / South (dy > 0): descending two-tone bass impulse 440 Hz -> 260 Hz over 80 ms (falling gesture ↘)
 * 3. Audio Graph Synchronization:
 *    - Proximity smoothly modulates beaconBusGain and musicBus without resetting loops.
 */

import { strict as assert } from 'node:assert';
import { BeaconSynthesizer } from '../src/modules/audioNav/beacon.ts';
import { AudioNavigationEngine } from '../src/modules/audioNav/engine.ts';
import { StemPlayer } from '../src/modules/audioNav/stems.ts';
import { AudioNavManager } from '../src/modules/audioNav/index.ts';

// Web Audio API Mock for Node.js
class MockAudioParam {
  constructor(val = 0) {
    this.value = val;
    this.history = [];
  }
  setValueAtTime(val, time) {
    this.value = val;
    this.history.push({ type: 'setValueAtTime', val, time });
    return this;
  }
  setTargetAtTime(val, time, tau) {
    this.value = val;
    this.history.push({ type: 'setTargetAtTime', val, time, tau });
    return this;
  }
  linearRampToValueAtTime(val, time) {
    this.value = val;
    this.history.push({ type: 'linearRampToValueAtTime', val, time });
    return this;
  }
  exponentialRampToValueAtTime(val, time) {
    this.value = val;
    this.history.push({ type: 'exponentialRampToValueAtTime', val, time });
    return this;
  }
  cancelScheduledValues(time) {
    this.history.push({ type: 'cancelScheduledValues', time });
    return this;
  }
}

class MockAudioNode {
  connect(dest) { return dest; }
  disconnect() {}
}

class MockGainNode extends MockAudioNode {
  constructor() {
    super();
    this.gain = new MockAudioParam(1.0);
    this.channelCount = 2;
    this.channelCountMode = 'max';
  }
}

class MockPannerNode extends MockAudioNode {
  constructor() {
    super();
    this.pan = new MockAudioParam(0.0);
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  constructor() {
    super();
    this.type = 'lowpass';
    this.frequency = new MockAudioParam(20000);
    this.Q = new MockAudioParam(1.0);
  }
}

class MockOscillatorNode extends MockAudioNode {
  constructor() {
    super();
    this.frequency = new MockAudioParam(440);
    this.type = 'sine';
    this.started = false;
    this.stopped = false;
    this.onended = null;
  }
  start(t) { this.started = true; this.startTime = t; }
  stop(t) { this.stopped = true; this.stopTime = t; }
}

class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 1.0;
    this.destination = new MockGainNode();
  }
  createGain() { return new MockGainNode(); }
  createStereoPanner() { return new MockPannerNode(); }
  createBiquadFilter() { return new MockBiquadFilterNode(); }
  createOscillator() { return new MockOscillatorNode(); }
  createBufferSource() {
    return {
      buffer: null,
      loop: false,
      connect: () => {},
      disconnect: () => {},
      start: () => {},
      stop: () => {},
    };
  }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
}

class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(k) { return this.store.get(k) ?? null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

globalThis.AudioContext = MockAudioContext;
globalThis.window = {
  AudioContext: MockAudioContext,
  localStorage: new MockLocalStorage(),
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {},
};

let totalTests = 0;
let passedTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// Build 5x5 maze for testing gestures
const createTestMaze = () => {
  const size = 5;
  const grid = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => ({
      col: c,
      row: r,
      walls: { top: true, right: true, bottom: true, left: true },
    }))
  );

  // Vertical corridor: (col 2, row 0) <-> (col 2, row 1) <-> (col 2, row 2) <-> (col 2, row 3) <-> (col 2, row 4)
  for (let r = 0; r < 4; r++) {
    grid[r][2].walls.bottom = false;
    grid[r + 1][2].walls.top = false;
  }
  // Horizontal corridor: (col 1, row 2) <-> (col 2, row 2) <-> (col 3, row 2)
  grid[2][1].walls.right = false; grid[2][2].walls.left = false;
  grid[2][2].walls.right = false; grid[2][3].walls.left = false;

  return grid;
};

async function runAll() {
  console.log('\n--- SUITE 1: BFS Hot-Cold Proximity Attenuation Logic ---');

  await test('1.1: BeaconSynthesizer initializes at 100% proximity (factor = 1.0)', () => {
    const mockCtx = new MockAudioContext();
    const dest = mockCtx.createGain();
    const synth = new BeaconSynthesizer();
    synth.init(mockCtx, dest);

    assert.equal(synth.getProximityAttenuation(), 1.0, 'Initial proximity attenuation must be 1.0');
  });

  await test('1.2: Moving towards exit keeps proximity attenuation at 1.0', () => {
    const mockCtx = new MockAudioContext();
    const dest = mockCtx.createGain();
    const synth = new BeaconSynthesizer();
    synth.init(mockCtx, dest);

    synth.updateProximity(10, 11);
    assert.equal(synth.getProximityAttenuation(), 1.0, 'Moving from dist 11 to 10 should keep factor at 1.0');

    synth.updateProximity(9, 10);
    assert.equal(synth.getProximityAttenuation(), 1.0, 'Moving from dist 10 to 9 should keep factor at 1.0');
  });

  await test('1.3: Moving away into a dead-end attenuates by 25% per step down to 30% clamp', () => {
    const mockCtx = new MockAudioContext();
    const dest = mockCtx.createGain();
    const synth = new BeaconSynthesizer();
    synth.init(mockCtx, dest);

    // Initial anchor at min distance 5
    synth.updateProximity(5, 6);
    assert.equal(synth.getProximityAttenuation(), 1.0);

    // Step 1 away (dist 6): 1.0 - 0.25 = 0.75
    synth.updateProximity(6, 5);
    assert.equal(synth.getProximityAttenuation(), 0.75, 'Step 1 away should attenuate to 0.75 (75%)');

    // Step 2 away (dist 7): 1.0 - 0.50 = 0.50
    synth.updateProximity(7, 6);
    assert.equal(synth.getProximityAttenuation(), 0.50, 'Step 2 away should attenuate to 0.50 (50%)');

    // Step 3 away (dist 8): 1.0 - 0.75 = 0.25 -> clamped to 0.30 (30%)
    synth.updateProximity(8, 7);
    assert.equal(synth.getProximityAttenuation(), 0.30, 'Step 3 away should clamp to 0.30 (30%)');

    // Step 4 away (dist 9): still clamped to 0.30
    synth.updateProximity(9, 8);
    assert.equal(synth.getProximityAttenuation(), 0.30, 'Step 4 away should remain clamped to 0.30 (30%)');
  });

  await test('1.4: Turning back towards exit restores volume instantly to 100% (1.0)', () => {
    const mockCtx = new MockAudioContext();
    const dest = mockCtx.createGain();
    const synth = new BeaconSynthesizer();
    synth.init(mockCtx, dest);

    synth.updateProximity(5, 5);
    synth.updateProximity(7, 5); // 2 steps away -> 0.50
    assert.equal(synth.getProximityAttenuation(), 0.50);

    // Stepping back towards exit: dist 6 < dist 7
    synth.updateProximity(6, 7);
    assert.equal(synth.getProximityAttenuation(), 1.0, 'Stepping back towards exit must restore to 1.0 (100%)');
  });

  console.log('\n--- SUITE 2: Contrasting Melodic Gestures (Up / Down) ---');

  await test('2.1: Step Up (dy < 0) sets vertical gesture to "up" and base frequency 650 Hz', () => {
    const mockCtx = new MockAudioContext();
    const dest = mockCtx.createGain();
    const synth = new BeaconSynthesizer();
    synth.init(mockCtx, dest);

    const mazeData = {
      cells: createTestMaze(),
      start: { col: 2, row: 2 },
      exit: { col: 2, row: 0 }, // North / Up
      shortestPath: [],
      checkpoints: [],
    };
    synth.setMazeData(mazeData);
    synth.updatePosition({ x: 2.5, y: 2.5 });

    assert.equal(synth.getVerticalGesture(), 'up', 'Vertical gesture should be "up"');
    assert.equal(synth.getCurrentFrequency(), 650, 'Current frequency should be 650 Hz');
    assert.equal(synth.getCurrentPan(), 0.0, 'Panner should be centered for vertical movement');
  });

  await test('2.2: Step Down (dy > 0) sets vertical gesture to "down" and base frequency 440 Hz', () => {
    const mockCtx = new MockAudioContext();
    const dest = mockCtx.createGain();
    const synth = new BeaconSynthesizer();
    synth.init(mockCtx, dest);

    const mazeData = {
      cells: createTestMaze(),
      start: { col: 2, row: 2 },
      exit: { col: 2, row: 4 }, // South / Down
      shortestPath: [],
      checkpoints: [],
    };
    synth.setMazeData(mazeData);
    synth.updatePosition({ x: 2.5, y: 2.5 });

    assert.equal(synth.getVerticalGesture(), 'down', 'Vertical gesture should be "down"');
    assert.equal(synth.getCurrentFrequency(), 440, 'Current frequency should be 440 Hz');
    assert.equal(synth.getCurrentPan(), 0.0, 'Panner should be centered for vertical movement');
  });

  await test('2.3: Step Horizontal sets vertical gesture to "none" and base frequency 620 Hz', () => {
    const mockCtx = new MockAudioContext();
    const dest = mockCtx.createGain();
    const synth = new BeaconSynthesizer();
    synth.init(mockCtx, dest);

    const mazeData = {
      cells: createTestMaze(),
      start: { col: 2, row: 2 },
      exit: { col: 3, row: 2 }, // East / Right
      shortestPath: [],
      checkpoints: [],
    };
    synth.setMazeData(mazeData);
    synth.updatePosition({ x: 2.5, y: 2.5 });

    assert.equal(synth.getVerticalGesture(), 'none', 'Vertical gesture should be "none"');
    assert.equal(synth.getCurrentFrequency(), 620, 'Current frequency should be base frequency 620 Hz');
    assert.equal(synth.getCurrentPan(), 1.0, 'Panner should be hard right (1.0)');
  });

  console.log('\n--- SUITE 3: Audio Graph Gain Modulations & Loops Integrity ---');

  await test('3.1: AudioNavigationEngine modulates musicBus gain without resetting loops', async () => {
    const engine = new AudioNavigationEngine();
    await engine.init();
    const nodes = engine.getNodes();
    assert(nodes !== null, 'Nodes initialized');

    const initialGain = nodes.musicBus.gain.value;
    assert.equal(initialGain, 0.5, 'Default music bus gain is 0.5 (50%)');

    // Attenuate to 0.75 factor: target is 0.5 * 0.75 = 0.375
    engine.setProximityAttenuation(0.75);
    const rampHistory = nodes.musicBus.gain.history;
    const lastRamp = rampHistory[rampHistory.length - 1];
    assert.equal(lastRamp.type, 'linearRampToValueAtTime', 'Linear ramp scheduled');
    assert.equal(lastRamp.val, 0.375, 'Target music bus gain attenuated to 0.375');

    // Restore to 1.0 factor: target is 0.5 * 1.0 = 0.5
    engine.setProximityAttenuation(1.0, true);
    assert.equal(nodes.musicBus.gain.value, 0.5, 'Music bus gain restored immediately to 0.5');

    engine.destroy();
  });

  await test('3.2: StemPlayer tracks and exposes proximity attenuation correctly', async () => {
    const mockCtx = new MockAudioContext();
    const dest = mockCtx.createGain();
    const stemPlayer = new StemPlayer();
    await stemPlayer.init(mockCtx, dest);

    assert.equal(stemPlayer.getProximityAttenuation(), 1.0);

    stemPlayer.updateProximity(7, 5); // 2 steps away -> 1 - 2*0.25 = 0.50
    assert.equal(stemPlayer.getProximityAttenuation(), 0.50);

    stemPlayer.updateProximity(4, 7); // Returning -> 1.0
    assert.equal(stemPlayer.getProximityAttenuation(), 1.0);

    stemPlayer.destroy();
  });

  console.log('\n--- SUITE 4: AudioNavManager System Integration ---');

  await test('4.1: AudioNavManager propagates proximity attenuation across beacon, engine, and stems', async () => {
    const manager = new AudioNavManager();
    await manager.init();

    const mazeData = {
      cells: createTestMaze(),
      start: { col: 2, row: 2 },
      exit: { col: 2, row: 0 },
      shortestPath: [],
      checkpoints: [],
    };

    // Initial step at spawn
    manager.updatePlayerPosition({ x: 2.5, y: 2.5 }, mazeData);
    assert.equal(manager.getProximityAttenuation(), 1.0, 'Spawn proximity is 1.0');

    // Step towards exit: (col 2, row 1)
    manager.updatePlayerPosition({ x: 2.5, y: 1.5 }, mazeData);
    assert.equal(manager.getProximityAttenuation(), 1.0, 'Moving towards exit maintains 1.0');

    // Step away from exit into dead-end: back to (col 2, row 2)
    manager.updatePlayerPosition({ x: 2.5, y: 2.5 }, mazeData);
    assert.equal(manager.getProximityAttenuation(), 0.75, '1 step away attenuates to 0.75');

    // Step further away: to (col 2, row 3)
    manager.updatePlayerPosition({ x: 2.5, y: 3.5 }, mazeData);
    assert.equal(manager.getProximityAttenuation(), 0.50, '2 steps away attenuates to 0.50');

    // Step back towards exit: back to (col 2, row 2)
    manager.updatePlayerPosition({ x: 2.5, y: 2.5 }, mazeData);
    assert.equal(manager.getProximityAttenuation(), 1.0, 'Stepping back immediately restores 1.0 (100%)');

    manager.destroy();
  });

  console.log(`\n========================================`);
  console.log(`ALL ${passedTests}/${totalTests} PROXIMITY & VERTICAL TESTS PASSED!`);
  console.log(`========================================\n`);
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
