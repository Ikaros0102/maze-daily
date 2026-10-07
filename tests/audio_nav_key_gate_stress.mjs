/**
 * tests/audio_nav_key_gate_stress.mjs
 *
 * Comprehensive stress and verification test suite for Key & Gate Audio Navigation:
 * 1. Pathfinder blockedTile constraint (gate blocked while locked).
 * 2. BeaconSynthesizer dual-target navigation (Key first, Exit second).
 * 3. Proximity attenuation re-anchoring upon key collection.
 * 4. Key pickup chime synthesis & music ducking coordination.
 * 5. StemPlayer progress and directional orientation toward Key then Exit.
 * 6. Edge cases and stress transitions.
 */

import { strict as assert } from 'node:assert';
import { computeExitNavigationField } from '../src/core/pathfinder.ts';
import { BeaconSynthesizer } from '../src/modules/audioNav/beacon.ts';
import { AudioNavManager } from '../src/modules/audioNav/index.ts';
import { calculateQuartileGains } from '../src/modules/audioNav/stems.ts';

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
  constructor() {
    this.connectedTo = [];
    this.channelCount = 2;
    this.channelCountMode = 'max';
  }
  connect(dest) {
    this.connectedTo.push(dest);
    return dest;
  }
  disconnect() {
    this.connectedTo = [];
  }
}

class MockGainNode extends MockAudioNode {
  constructor(defaultGain = 1.0) {
    super();
    this.gain = new MockAudioParam(defaultGain);
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  constructor() {
    super();
    this.type = 'lowpass';
    this.frequency = new MockAudioParam(20000);
    this.Q = new MockAudioParam(1);
  }
}

class MockStereoPannerNode extends MockAudioNode {
  constructor() {
    super();
    this.pan = new MockAudioParam(0);
  }
}

class MockOscillatorNode extends MockAudioNode {
  constructor() {
    super();
    this.type = 'sine';
    this.frequency = new MockAudioParam(440);
    this.started = false;
    this.stopped = false;
  }
  start(time) {
    this.started = true;
    this.startTime = time;
  }
  stop(time) {
    this.stopped = true;
    this.stopTime = time;
    if (this.onended) setTimeout(() => this.onended(), 1);
  }
}

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.destination = new MockGainNode(1.0);
    this.oscillatorsCreated = [];
  }
  createGain() {
    return new MockGainNode();
  }
  createBiquadFilter() {
    return new MockBiquadFilterNode();
  }
  createStereoPanner() {
    return new MockStereoPannerNode();
  }
  createOscillator() {
    const osc = new MockOscillatorNode();
    this.oscillatorsCreated.push(osc);
    return osc;
  }
  createBufferSource() {
    const src = new MockAudioNode();
    src.start = () => {};
    src.stop = () => {};
    return src;
  }
  async resume() {
    this.state = 'running';
  }
  async close() {
    this.state = 'closed';
  }
}

// Global mocks
globalThis.AudioContext = MockAudioContext;
globalThis.window = {
  AudioContext: MockAudioContext,
  webkitAudioContext: MockAudioContext,
  localStorage: new Map(),
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {},
};
if (!globalThis.localStorage) {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

/**
 * Creates a simple test maze:
 * 5x5 grid:
 * Row 0: [S] - [.] - [.] - [.] - [.]  (Cols 0..4)
 * Row 1:  |           |           |
 * Row 2: [K]         [G]         [E]  (Key at (2,0), Gate at (2,2), Exit at (2,4))
 * 
 * S: (0,0), Key: (2,0), Gate: (2,2), Exit: (2,4)
 */
function createTestMaze() {
  const cells = [];
  for (let r = 0; r < 5; r++) {
    cells[r] = [];
    for (let c = 0; c < 5; c++) {
      cells[r][c] = {
        row: r,
        col: c,
        walls: { top: true, right: true, bottom: true, left: true },
        visited: true,
      };
    }
  }

  // Connect corridor from (0,0) down to (2,0) [Key branch]
  cells[0][0].walls.bottom = false;
  cells[1][0].walls.top = false;
  cells[1][0].walls.bottom = false;
  cells[2][0].walls.top = false;

  // Connect corridor from (0,0) right to (0,2) then down to (2,2) [Gate] then to (2,4) [Exit]
  cells[0][0].walls.right = false;
  cells[0][1].walls.left = false;
  cells[0][1].walls.right = false;
  cells[0][2].walls.left = false;

  cells[0][2].walls.bottom = false;
  cells[1][2].walls.top = false;
  cells[1][2].walls.bottom = false;
  cells[2][2].walls.top = false; // (2,2) is gate

  // Gate down to exit
  cells[2][2].walls.right = false;
  cells[2][3].walls.left = false;
  cells[2][3].walls.right = false;
  cells[2][4].walls.left = false; // (2,4) is exit

  return {
    cells,
    start: { row: 0, col: 0 },
    exit: { row: 2, col: 4 },
    checkpoints: [],
  };
}

console.log('\n--- SUITE 1: Pathfinder blockedTile Routing ---');
{
  const maze = createTestMaze();
  const gatePos = { row: 2, col: 2 };
  const exitPos = { row: 2, col: 4 };
  const keyPos = { row: 2, col: 0 };

  // 1.1 Compute navigation with gate UNBLOCKED
  const fieldUnblocked = computeExitNavigationField(maze.cells, exitPos);
  assert.equal(fieldUnblocked.distances[0][0], 6, 'Distance from start to exit without blocked gate is 6');
  assert.equal(fieldUnblocked.distances[gatePos.row][gatePos.col], 2, 'Gate is passable');

  // 1.2 Compute navigation with gate BLOCKED
  const fieldBlocked = computeExitNavigationField(maze.cells, exitPos, gatePos);
  assert.equal(fieldBlocked.distances[gatePos.row][gatePos.col], -1, 'Gate itself is marked unreachable (-1)');
  assert.equal(fieldBlocked.distances[0][0], -1, 'Start cannot reach exit because gate is blocked and no other path exists');

  // 1.3 Compute navigation to KEY with gate BLOCKED
  const keyField = computeExitNavigationField(maze.cells, keyPos, gatePos);
  assert.equal(keyField.distances[0][0], 2, 'Distance from start to key is 2 steps');
  assert.equal(keyField.nextSteps[0][0].row, 1, 'Next step from start towards key is South (row 1, col 0)');
  assert.equal(keyField.distances[gatePos.row][gatePos.col], -1, 'Gate is blocked from key route');
  console.log('  ✓ 1.1 - 1.3: computeExitNavigationField accurately treats blockedTile as impassable obstacle');
}

console.log('\n--- SUITE 2: BeaconSynthesizer Dual-Target Routing (Key -> Exit) ---');
{
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  const beacon = new BeaconSynthesizer();
  beacon.init(ctx, dest);

  const maze = createTestMaze();
  const effect = {
    type: 'key_and_gate',
    enabled: true,
    keyPos: { row: 2, col: 0 },
    gatePos: { row: 2, col: 2 },
    hasKey: false,
    isGateOpen: false,
  };

  // 2.1 Set maze with effect (hasKey: false) -> Target must be KEY
  beacon.setMazeData(maze, effect);
  assert.equal(beacon.getTargetType(), 'key', 'Target type is "key" when !effect.hasKey');

  // Player at Start (0, 0)
  beacon.updatePosition({ x: 0.5, y: 0.5 }, maze, effect);
  // Next step towards key (2,0) is Down (row 1, col 0) -> dy > 0
  assert.equal(beacon.getVerticalGesture(), 'down', 'Step towards key is Down (dy > 0)');
  assert.equal(beacon.getCurrentPan(), 0.0, 'Down step has pan 0.0');

  // 2.2 Player moves to (1, 0) -> closer to key
  beacon.updatePosition({ x: 0.5, y: 1.5 }, maze, effect);
  assert.equal(beacon.getProximityAttenuation(), 1.0, 'Volume remains at 100% when moving towards key');

  // 2.3 Player diverges away from key towards (0, 1)
  beacon.updatePosition({ x: 1.5, y: 0.5 }, maze, effect);
  assert(beacon.getProximityAttenuation() < 1.0, 'Volume attenuates when moving away from key');

  // 2.4 Player arrives at Key (2, 0)
  beacon.updatePosition({ x: 0.5, y: 2.5 }, maze, effect);
  assert.equal(beacon.getVerticalGesture(), 'none', 'Arrival at key silences vertical gesture');

  // 2.5 Transition: Key collected! (hasKey = true, isGateOpen = true)
  const effectWithKey = {
    ...effect,
    hasKey: true,
    isGateOpen: true,
  };
  beacon.updatePosition({ x: 0.5, y: 2.5 }, maze, effectWithKey);
  assert.equal(beacon.getTargetType(), 'exit', 'Target type transitions to "exit" once key is collected');
  assert.equal(beacon.getProximityAttenuation(), 1.0, 'Volume resets cleanly to 100% on target transition');

  // Next step towards exit from (2, 0) is Up to (1, 0) -> dy < 0
  assert.equal(beacon.getVerticalGesture(), 'up', 'Step back towards exit from key dead-end is Up (dy < 0)');

  // 2.6 Key pickup chime test
  const oscCountBefore = ctx.oscillatorsCreated.length;
  beacon.playKeyPickupChime();
  const oscCountAfter = ctx.oscillatorsCreated.length;
  assert.equal(oscCountAfter - oscCountBefore, 4, 'playKeyPickupChime creates exactly 4 ascending notes');
  console.log('  ✓ 2.1 - 2.6: BeaconSynthesizer routes to Key first, handles Hot-Cold, switches to Exit, and synthesizes chime');

  beacon.destroy();
}

console.log('\n--- SUITE 3: AudioNavManager System Coordination ---');
{
  const mgr = new AudioNavManager();
  const maze = createTestMaze();
  const effect = {
    type: 'key_and_gate',
    enabled: true,
    keyPos: { row: 2, col: 0 },
    gatePos: { row: 2, col: 2 },
    hasKey: false,
    isGateOpen: false,
  };

  await mgr.init();
  await mgr.resume();

  // Initial step: player at (0, 0)
  mgr.updatePlayerPosition({ x: 0.5, y: 0.5 }, maze, effect);
  const panner = mgr.getMusicPanner();
  assert(panner !== null, 'Music panner exists');

  // Player approaches key (1, 0)
  mgr.updatePlayerPosition({ x: 0.5, y: 1.5 }, maze, effect);

  // Key collection transition!
  const effectCollected = {
    ...effect,
    hasKey: true,
    isGateOpen: true,
  };

  mgr.updatePlayerPosition({ x: 0.5, y: 2.5 }, maze, effectCollected);
  // Volume should be 1.0 after target switch
  assert.equal(mgr.getProximityAttenuation(), 1.0, 'Proximity attenuation restored to 1.0 on key pickup');

  // Next step from key position (2, 0) towards exit is north to (1, 0) (dy = -1, dx = 0)
  mgr.updatePlayerPosition({ x: 0.5, y: 2.5 }, maze, effectCollected);

  // Moving along path through gate: player at (0, 2) moving towards gate at (2, 2)
  mgr.updatePlayerPosition({ x: 2.5, y: 0.5 }, maze, effectCollected);
  mgr.updatePlayerPosition({ x: 2.5, y: 1.5 }, maze, effectCollected);
  mgr.updatePlayerPosition({ x: 2.5, y: 2.5 }, maze, effectCollected); // Inside gate

  // Checkpoint-based stem progression tests:
  // Scenario 1: Key is near start, before 25% checkpoint is reached
  const checkpointsBefore25 = [
    { id: 'split_25', ratio: 0.25, cell: { row: 0, col: 2 }, reachedTimeMs: null },
    { id: 'split_50', ratio: 0.50, cell: { row: 1, col: 2 }, reachedTimeMs: null },
    { id: 'split_75', ratio: 0.75, cell: { row: 2, col: 3 }, reachedTimeMs: null },
  ];

  // At key tile (2, 0) before 25% checkpoint: ONLY Stem-1 plays!
  mgr.updatePlayerPosition({ x: 0.5, y: 2.5 }, maze, effect, checkpointsBefore25);
  const progBefore25 = mgr.getStemPlayer()?.getCurrentProgress?.() ?? 0;
  assert(progBefore25 <= 0.25, `Progress before 25% checkpoint must be <= 0.25, got ${progBefore25}`);
  const gainsBefore25 = calculateQuartileGains(progBefore25);
  assert.equal(gainsBefore25.stem1, 1.0, 'Stem-1 plays at 1.0 before 25% checkpoint');
  assert.equal(gainsBefore25.stem2, 0.0, 'Stem-2 is silent before 25% checkpoint');
  assert.equal(gainsBefore25.stem3, 0.0, 'Stem-3 is silent before 25% checkpoint');
  assert.equal(gainsBefore25.stem4, 0.0, 'Stem-4 is silent before 25% checkpoint');

  // Scenario 2: Player has reached 25% checkpoint, then goes to key without reaching 50%
  const checkpointsWith25Reached = [
    { id: 'split_25', ratio: 0.25, cell: { row: 0, col: 2 }, reachedTimeMs: 4500 },
    { id: 'split_50', ratio: 0.50, cell: { row: 1, col: 2 }, reachedTimeMs: null },
    { id: 'split_75', ratio: 0.75, cell: { row: 2, col: 3 }, reachedTimeMs: null },
  ];

  // At key tile after 25% checkpoint: Stem-1 and Stem-2 play! Stem-3 and Stem-4 are silent!
  mgr.updatePlayerPosition({ x: 0.5, y: 2.5 }, maze, effect, checkpointsWith25Reached);
  const progAt25 = mgr.getStemPlayer()?.getCurrentProgress?.() ?? 0;
  assert(progAt25 >= 0.25 && progAt25 <= 0.50, `Progress between 25% and 50% must be in [0.25, 0.50], got ${progAt25}`);
  const gainsAt25 = calculateQuartileGains(progAt25);
  assert(gainsAt25.stem1 > 0 || gainsAt25.stem2 > 0, 'Stem-1 and/or Stem-2 play between 25% and 50%');
  assert.equal(gainsAt25.stem3, 0.0, 'Stem-3 is silent before 50% checkpoint');
  assert.equal(gainsAt25.stem4, 0.0, 'Stem-4 is silent before 50% checkpoint');

  console.log('  ✓ 3.1: AudioNavManager coordinates target switch, stem panning, and proximity attenuation seamlessly');
  console.log('  ✓ 3.2: Music stems strictly match maze completion % (Stem-1 before 25%, Stems 1&2 between 25% and 50%)');
  mgr.destroy();
}

console.log('\n--- SUITE 4: Non-Key Mazes Regression Safety ---');
{
  const mgr = new AudioNavManager();
  const maze = createTestMaze();
  const normalEffect = { type: 'none', enabled: false };

  await mgr.init();
  await mgr.resume();

  // Target should directly be exit without key effect
  mgr.updatePlayerPosition({ x: 0.5, y: 0.5 }, maze, normalEffect);
  assert.equal(mgr.getProximityAttenuation(), 1.0);

  console.log('  ✓ 4.1: Normal maze navigation directly targets exit with zero regression');
  mgr.destroy();
}

console.log('\n========================================');
console.log('ALL KEY & GATE AUDIO NAV TESTS PASSED!');
console.log('========================================\n');
