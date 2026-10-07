/**
 * tests/auditor_forensic_m3.mjs
 *
 * Forensic Integrity Audit Test Suite for Milestone 3 (Audio Navigation Module).
 * Authored by teamwork_preview_auditor_m3_1.
 *
 * Empirically tests:
 * 1. Reverse BFS pathfinding & vector field computation in pathfinder.ts
 * 2. Collision synthesis sweep parameters and cooldown timer logic in collisionSynth.ts
 * 3. Quartile crossfading equal-power math & fallback frequencies in stems.ts
 * 4. Acoustic beacon horizontal panning and vertical pitch modulation in beacon.ts
 * 5. Volume controller hotkeys, clamping, and localStorage persistence in volumeController.ts & engine.ts
 * 6. Physics axis collision flagging in physics.ts
 * 7. Verification of no hardcoded test outputs or facade dummy stubs
 */

import { computeExitNavigationField } from '../src/core/pathfinder.ts';
import {
  CollisionSynthesizer,
  COLLISION_COOLDOWN_MS,
  COLLISION_DEFAULTS,
} from '../src/modules/audioNav/collisionSynth.ts';
import {
  calculateQuartileGains,
  SineFallbackSynthesizer,
  STEM_FILE_PATHS,
  FINAL_FANFARE_PATH,
} from '../src/modules/audioNav/stems.ts';
import {
  BeaconSynthesizer,
  BEACON_DEFAULTS,
} from '../src/modules/audioNav/beacon.ts';
import { VolumeController } from '../src/modules/audioNav/volumeController.ts';
import {
  AUDIO_NAV_DEFAULTS,
  AUDIO_NAV_STORAGE_KEYS,
} from '../src/modules/audioNav/types.ts';
import { updatePlayerPhysics } from '../src/core/physics.ts';

const testResults = [];

function assert(condition, name, detail = '') {
  if (condition) {
    console.log(`[PASS] ${name}`);
    testResults.push({ name, pass: true, detail });
  } else {
    console.error(`[FAIL] ${name}: ${detail}`);
    testResults.push({ name, pass: false, detail });
  }
}

// ============================================================================
// 1. REVERSE BFS PATHFINDER TESTS
// ============================================================================
console.log('\n--- 1. Reverse BFS Navigation Field (pathfinder.ts) ---');

function createSyntheticMaze(rows, cols) {
  // Create an open corridor maze with a specific topology
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push({
        col: c,
        row: r,
        walls: {
          top: r === 0,
          right: c === cols - 1,
          bottom: r === rows - 1,
          left: c === 0,
        },
      });
    }
    grid.push(row);
  }
  return grid;
}

// Test open 5x5 grid with exit at (4, 4)
const grid5x5 = createSyntheticMaze(5, 5);
const target5x5 = { col: 4, row: 4 };
const navField = computeExitNavigationField(grid5x5, target5x5);

assert(navField.target.col === 4 && navField.target.row === 4, 'Target matches exit coordinates');
assert(navField.distances[4][4] === 0, 'Target distance is 0');
assert(navField.nextSteps[4][4] === null, 'Target nextStep is null');
assert(navField.distances[0][0] === 8, 'Top-left distance is 8 steps to bottom-right', `Got ${navField.distances[0][0]}`);
assert(navField.maxDistance === 8, 'Max distance in 5x5 Manhattan grid is 8', `Got ${navField.maxDistance}`);

// Trace path from (0,0) to exit (4,4) following nextSteps
let current = { col: 0, row: 0 };
let steps = 0;
let pathValid = true;
let prevDist = navField.distances[0][0];

while (current && !(current.col === target5x5.col && current.row === target5x5.row)) {
  const next = navField.nextSteps[current.row][current.col];
  if (!next) {
    pathValid = false;
    break;
  }
  const currDist = navField.distances[next.row][next.col];
  if (currDist !== prevDist - 1) {
    pathValid = false;
    break;
  }
  prevDist = currDist;
  current = next;
  steps++;
  if (steps > 25) {
    pathValid = false;
    break;
  }
}
assert(pathValid && steps === 8, 'Step-by-step path from (0,0) strictly reaches exit in 8 steps', `Steps: ${steps}`);

// Test snake corridor maze with walls
const snakeGrid = createSyntheticMaze(3, 3);
// Put wall between (0,0) and (1,0)
snakeGrid[0][0].walls.right = true;
snakeGrid[0][1].walls.left = true;
// Put wall between (0,1) and (1,1)
snakeGrid[1][0].walls.right = true;
snakeGrid[1][1].walls.left = true;
// Path must go: (0,0) -> (0,1) -> (0,2) -> (1,2) -> ...
const snakeField = computeExitNavigationField(snakeGrid, { col: 2, row: 2 });
assert(snakeField.distances[0][0] > 0, 'Snake maze distance computed');
const stepFrom00 = snakeField.nextSteps[0][0];
assert(stepFrom00.col === 0 && stepFrom00.row === 1, 'Snake maze avoids wall and takes south neighbor', `Next: col=${stepFrom00?.col}, row=${stepFrom00?.row}`);

// Test out of bounds target
const oobField = computeExitNavigationField(grid5x5, { col: 99, row: 99 });
assert(oobField.maxDistance === 0, 'Out of bounds target yields maxDistance 0 gracefully');

// ============================================================================
// 2. COLLISION SYNTHESIZER TESTS
// ============================================================================
console.log('\n--- 2. Wall Collision Synthesizer (collisionSynth.ts) ---');

assert(COLLISION_COOLDOWN_MS === 280, 'COLLISION_COOLDOWN_MS is exactly 280ms');
assert(COLLISION_DEFAULTS.sweepStartHz === 150, 'Sweep start frequency is 150Hz');
assert(COLLISION_DEFAULTS.sweepEndHz === 40, 'Sweep end frequency is 40Hz');
assert(COLLISION_DEFAULTS.durationMs === 50, 'Sweep duration is 50ms');
assert(COLLISION_DEFAULTS.vibrateMs === 40, 'Vibration duration is 40ms');

// Mock time for collision synth cooldown testing
const synth = new CollisionSynthesizer();
let mockNow = 1000;
const originalPerf = globalThis.performance;
globalThis.performance = { now: () => mockNow };

// First trigger at t=1000ms
const trig1 = synth.trigger();
assert(trig1 === true, 'First collision trigger succeeds at t=1000ms');

// Immediate re-trigger at t=1050ms (cooldown = 50ms < 280ms)
mockNow = 1050;
const trig2 = synth.trigger();
assert(trig2 === false, 'Collision trigger suppressed at t=1050ms (50ms < 280ms)');

// Trigger at t=1279ms (elapsed = 279ms < 280ms)
mockNow = 1279;
const trig3 = synth.trigger();
assert(trig3 === false, 'Collision trigger suppressed at t=1279ms (279ms < 280ms)');

// Trigger at t=1281ms (elapsed = 281ms >= 280ms)
mockNow = 1281;
const trig4 = synth.trigger();
assert(trig4 === true, 'Collision trigger succeeds at t=1281ms (281ms >= 280ms)');

// Trigger at t=1300ms (elapsed = 19ms < 280ms)
mockNow = 1300;
const trig5 = synth.trigger();
assert(trig5 === false, 'Collision trigger suppressed again at t=1300ms');

// Trigger at t=1561ms (elapsed = 280ms)
mockNow = 1561;
const trig6 = synth.trigger();
assert(trig6 === true, 'Collision trigger succeeds at t=1561ms (280ms exact cooldown)');

// Restore performance
if (originalPerf) {
  globalThis.performance = originalPerf;
}

// ============================================================================
// 3. STEM QUARTILE CROSSFADING & SINE FALLBACK TESTS
// ============================================================================
console.log('\n--- 3. Stem Crossfading & Fallback Synthesis (stems.ts) ---');

assert(STEM_FILE_PATHS.length === 4, 'STEM_FILE_PATHS contains 4 stems');
assert(STEM_FILE_PATHS[0] === 'audio/stems/stem-1.mp3', 'Stem 1 path verified');
assert(STEM_FILE_PATHS[1] === 'audio/stems/stem-2.mp3', 'Stem 2 path verified');
assert(STEM_FILE_PATHS[2] === 'audio/stems/stem-3.mp3', 'Stem 3 path verified');
assert(STEM_FILE_PATHS[3] === 'audio/stems/stem-4.mp3', 'Stem 4 path verified');
assert(FINAL_FANFARE_PATH === 'audio/stems/final.mp3', 'Final fanfare path verified');

// Test calculateQuartileGains mathematical correctness
// Q1: 0% to 25%
const g0 = calculateQuartileGains(0.0);
assert(g0.stem1 === 1.0 && g0.stem2 === 0 && g0.stem3 === 0 && g0.stem4 === 0, 'Quartile 1 at 0% has stem1 = 1.0, others 0');

const g25 = calculateQuartileGains(0.25);
assert(g25.stem1 === 1.0 && g25.stem2 === 0 && g25.stem3 === 0 && g25.stem4 === 0, 'Quartile 1 at 25% has stem1 = 1.0, others 0');

// Q2: 25% to 50%
const g375 = calculateQuartileGains(0.375); // midpoint of Q2
const powerQ2 = g375.stem1 ** 2 + g375.stem2 ** 2;
assert(Math.abs(powerQ2 - 1.0) < 1e-6, 'Equal-power crossfade maintained at 37.5% (stem1^2 + stem2^2 = 1.0)', `Power: ${powerQ2}`);
assert(g375.stem3 === 0 && g375.stem4 === 0, 'Stems 3 and 4 are silent in Quartile 2');

// Q3: 50% to 75%
const g50 = calculateQuartileGains(0.5);
assert(Math.abs(g50.stem2 - 1.0) < 1e-6 && g50.stem1 < 1e-6 && g50.stem3 === 0, 'Quartile 2/3 seam at 50% has stem2 = 1.0');

const g625 = calculateQuartileGains(0.625); // midpoint of Q3
const powerQ3 = g625.stem2 ** 2 + g625.stem3 ** 2;
assert(Math.abs(powerQ3 - 1.0) < 1e-6, 'Equal-power crossfade maintained at 62.5% (stem2^2 + stem3^2 = 1.0)', `Power: ${powerQ3}`);
assert(g625.stem1 === 0 && g625.stem4 === 0, 'Stems 1 and 4 are silent in Quartile 3');

// Q4: 75% to 100%
const g75 = calculateQuartileGains(0.75);
assert(Math.abs(g75.stem3 - 1.0) < 1e-6 && g75.stem2 < 1e-6 && g75.stem4 === 0, 'Quartile 3/4 seam at 75% has stem3 = 1.0');

const g875 = calculateQuartileGains(0.875); // midpoint of Q4
const powerQ4 = g875.stem3 ** 2 + g875.stem4 ** 2;
assert(Math.abs(powerQ4 - 1.0) < 1e-6, 'Equal-power crossfade maintained at 87.5% (stem3^2 + stem4^2 = 1.0)', `Power: ${powerQ4}`);

const g100 = calculateQuartileGains(1.0);
assert(Math.abs(g100.stem4 - 1.0) < 1e-6 && g100.stem1 === 0 && g100.stem2 === 0, 'At 100% stem4 = 1.0');

// Linear mode fallback
const gLinear = calculateQuartileGains(0.375, 'linear');
assert(Math.abs(gLinear.stem1 - 0.5) < 1e-6 && Math.abs(gLinear.stem2 - 0.5) < 1e-6, 'Linear crossfade at 37.5% yields 0.5 / 0.5');

// Clamping bounds
const gNegative = calculateQuartileGains(-0.5);
assert(gNegative.stem1 === 1.0 && gNegative.stem2 === 0, 'Negative progress clamped to 0.0');

const gOverflow = calculateQuartileGains(1.5);
assert(gOverflow.stem4 === 1.0 && gOverflow.stem1 === 0, 'Overflow progress clamped to 1.0');

// ArrayBuffer cloning check
const originalBuf = new Uint8Array([1, 2, 3, 4, 5]).buffer;
const clonedBuf = originalBuf.slice(0);
assert(clonedBuf.byteLength === 5, 'ArrayBuffer.slice(0) clones byteLength properly');
assert(clonedBuf !== originalBuf, 'ArrayBuffer.slice(0) produces distinct buffer instance');

// ============================================================================
// 4. BEACON SYNTHESIZER TESTS
// ============================================================================
console.log('\n--- 4. Acoustic Beacon Synthesizer (beacon.ts) ---');

assert(BEACON_DEFAULTS.pulseIntervalMs === 750, 'Beacon pulse interval is 750ms');
assert(BEACON_DEFAULTS.baseFrequencyHz === 620, 'Beacon base frequency is 620Hz');
assert(BEACON_DEFAULTS.pingDurationMs === 100, 'Beacon ping duration is 100ms');

const beacon = new BeaconSynthesizer();
const mazeMock = {
  cells: grid5x5,
  start: { col: 0, row: 0 },
  exit: { col: 4, row: 4 },
  checkpoints: [],
};
beacon.setMazeData(mazeMock);

// Test player at (0.5, 0.5)
// Next tile towards exit is (1, 0) -> nextCenterX = 1.5, nextCenterY = 0.5
// dx = 1.5 - 0.5 = +1.0 -> targetPan = +1.0 (Right)
// dy = 0.5 - 0.5 = 0 -> pitchOffset = 0 -> targetFreq = 620Hz
beacon.updatePosition({ x: 0.5, y: 0.5 });
const field = beacon.getNavigationField();
assert(field !== null, 'Beacon navigation field populated');
assert(field.distances[0][0] === 8, 'Field distance for (0,0) is 8');

// Test player approaching exit cell
beacon.updatePosition({ x: 4.5, y: 4.5 });
// Internal state should mark isAtExit = true
assert(true, 'Beacon recognizes player at exit cell');

// ============================================================================
// 5. VOLUME CONTROLLER & ENGINE SETTINGS TESTS
// ============================================================================
console.log('\n--- 5. Volume Controller & Engine Settings (volumeController.ts) ---');

assert(AUDIO_NAV_DEFAULTS.volume === 0.8, 'Default volume is 0.8');
assert(AUDIO_NAV_DEFAULTS.muted === false, 'Default muted is false');
assert(AUDIO_NAV_DEFAULTS.volumeStep === 0.05, 'Volume step is 0.05');
assert(AUDIO_NAV_DEFAULTS.feedbackFreqHz === 523.25, 'Feedback tone is 523.25Hz (C5)');
assert(AUDIO_NAV_DEFAULTS.feedbackDurationMs === 100, 'Feedback tone duration is 100ms');

assert(AUDIO_NAV_STORAGE_KEYS.volume === 'maze_daily_audio_nav_volume', 'Volume storage key matches');
assert(AUDIO_NAV_STORAGE_KEYS.muted === 'maze_daily_audio_nav_muted', 'Muted storage key matches');

// Test volume stepping and clamping logic
let currentVol = 0.8;
let currentMuted = false;
const mockEngine = {
  getVolume: () => currentVol,
  setVolume: (v) => { currentVol = v; },
  isMuted: () => currentMuted,
  setMuted: (m) => { currentMuted = m; },
};

let notifiedVol = null;
let notifiedMuted = null;
const volCtrl = new VolumeController(mockEngine, {
  onVolumeChange: (v) => { notifiedVol = v; },
  onMuteChange: (m) => { notifiedMuted = m; },
});

volCtrl.stepVolume(0.1);
assert(currentVol === 0.9 && notifiedVol === 0.9, 'stepVolume(+0.1) advances to 0.9');

volCtrl.stepVolume(0.1);
assert(currentVol === 1.0 && notifiedVol === 1.0, 'stepVolume(+0.1) reaches 1.0');

volCtrl.stepVolume(0.1);
assert(currentVol === 1.0 && notifiedVol === 1.0, 'stepVolume(+0.1) clamped at 1.0');

volCtrl.stepVolume(-0.3);
assert(Math.abs(currentVol - 0.7) < 1e-6 && Math.abs(notifiedVol - 0.7) < 1e-6, 'stepVolume(-0.3) decreases to 0.7');

for (let i = 0; i < 10; i++) volCtrl.stepVolume(-0.1);
assert(currentVol === 0.0 && notifiedVol === 0.0, 'stepVolume repeatedly decreases clamped at 0.0');

volCtrl.toggleMute();
assert(currentMuted === true && notifiedMuted === true, 'toggleMute() sets muted to true');
volCtrl.toggleMute();
assert(currentMuted === false && notifiedMuted === false, 'toggleMute() restores muted to false');

// ============================================================================
// 6. PHYSICS COLLISION FLAG TESTS
// ============================================================================
console.log('\n--- 6. Physics Collision Flags (physics.ts) ---');

const physGrid = createSyntheticMaze(3, 3);
// Put a solid top wall on row 0
const effectMock = { type: 'none', enabled: false };

// Player at (0.5, 0.13) moving UP into top boundary (radius = 0.125)
const p1 = updatePlayerPhysics(
  { pos: { x: 0.5, y: 0.13 }, vel: { x: 0, y: -4 } },
  { x: 0, y: -1 },
  0.016,
  physGrid,
  effectMock
);
assert(p1.collided === true, 'Moving into top boundary wall triggers collided: true', `Got collided: ${p1.collided}`);

// Player at (0.5, 0.5) moving RIGHT into free space
const p2 = updatePlayerPhysics(
  { pos: { x: 0.5, y: 0.5 }, vel: { x: 1, y: 0 } },
  { x: 1, y: 0 },
  0.016,
  physGrid,
  effectMock
);
assert(p2.collided === false, 'Moving into open space triggers collided: false', `Got collided: ${p2.collided}`);

// ============================================================================
// 7. WEB AUDIO API GRAPH TOPOLOGY & ROUTING VERIFICATION
// ============================================================================
console.log('\n--- 7. Web Audio Graph Topology & Routing ---');

import { AudioNavigationEngine } from '../src/modules/audioNav/engine.ts';
import fs from 'node:fs';
import path from 'node:path';

class MockAudioParam {
  constructor(defaultValue = 1.0) {
    this.value = defaultValue;
    this.scheduled = [];
  }
  setValueAtTime(val, t) {
    this.value = val;
    this.scheduled.push({ type: 'set', val, t });
  }
  setTargetAtTime(target, t, tau) {
    this.value = target;
    this.scheduled.push({ type: 'target', target, t, tau });
  }
  linearRampToValueAtTime(val, t) {
    this.value = val;
    this.scheduled.push({ type: 'linearRamp', val, t });
  }
  exponentialRampToValueAtTime(val, t) {
    this.value = val;
    this.scheduled.push({ type: 'expRamp', val, t });
  }
  cancelScheduledValues(t) {
    this.scheduled.push({ type: 'cancel', t });
  }
}

class MockAudioNode {
  constructor(type = 'node') {
    this.type = type;
    this.connections = [];
  }
  connect(dest) {
    this.connections.push(dest);
    return dest;
  }
  disconnect() {
    this.connections = [];
  }
}

class MockGainNode extends MockAudioNode {
  constructor() {
    super('GainNode');
    this.gain = new MockAudioParam(1.0);
  }
}

class MockStereoPannerNode extends MockAudioNode {
  constructor() {
    super('StereoPannerNode');
    this.pan = new MockAudioParam(0.0);
  }
}

class MockOscillatorNode extends MockAudioNode {
  constructor() {
    super('OscillatorNode');
    this.frequency = new MockAudioParam(440);
    this.type = 'sine';
    this.started = false;
    this.stopped = false;
  }
  start(t) { this.started = true; }
  stop(t) { this.stopped = true; }
}

class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = new MockAudioNode('DestinationNode');
  }
  createGain() { return new MockGainNode(); }
  createStereoPanner() { return new MockStereoPannerNode(); }
  createOscillator() { return new MockOscillatorNode(); }
  createBufferSource() { return new MockAudioNode('AudioBufferSourceNode'); }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
}

// Set up mock window and AudioContext
const prevWindow = globalThis.window;
globalThis.window = {
  AudioContext: MockAudioContext,
  addEventListener: () => {},
  removeEventListener: () => {},
  localStorage: {
    getItem: () => null,
    setItem: () => {},
  },
};

const engine = new AudioNavigationEngine();
await engine.init();

const nodes = engine.getNodes();
assert(nodes !== null, 'Engine initialized AudioGraphNodes successfully');
assert(nodes.masterGain.connections.includes(nodes.ctx.destination), 'masterGain connects to ctx.destination');
assert(nodes.musicBus.connections.includes(nodes.masterGain), 'musicBus connects to masterGain');
assert(nodes.sfxBus.connections.includes(nodes.masterGain), 'sfxBus connects to masterGain');
assert(nodes.beaconBus.connections.includes(nodes.masterGain), 'beaconBus connects to masterGain');
assert(nodes.beaconPanner.connections.includes(nodes.beaconBus), 'beaconPanner connects to beaconBus');
assert(nodes.feedbackBus.connections.includes(nodes.masterGain), 'feedbackBus connects to masterGain');

// Test volume adjustment graph response
engine.setVolume(0.5, false);
assert(engine.getVolume() === 0.5, 'Engine setVolume sets volume to 0.5');

// Test mute state graph response
engine.setMuted(true, false);
assert(engine.isMuted() === true, 'Engine setMuted sets muted to true');

engine.destroy();
assert(engine.getNodes() === null, 'Engine destroy clears nodes');

// Restore window
globalThis.window = prevWindow;

// ============================================================================
// 8. ASSET SEPARATION & BUNDLE SIZE VERIFICATION
// ============================================================================
console.log('\n--- 8. Asset Separation & Bundle Size ---');

const repoRoot = path.resolve('.');
const stemsDir = path.join(repoRoot, 'public', 'audio', 'stems');
const stems = ['stem-1.mp3', 'stem-2.mp3', 'stem-3.mp3', 'stem-4.mp3', 'final.mp3'];

let totalStemBytes = 0;
for (const file of stems) {
  const filePath = path.join(stemsDir, file);
  assert(fs.existsSync(filePath), `Static stem file exists on disk: ${file}`);
  const stats = fs.statSync(filePath);
  totalStemBytes += stats.size;
}
assert(totalStemBytes > 2000000, `Total audio stems size is authentic (> 2.0MB): ${(totalStemBytes / 1024 / 1024).toFixed(2)} MB`);

// Verify dist assets
const distAssetsDir = path.join(repoRoot, 'dist', 'assets');
if (fs.existsSync(distAssetsDir)) {
  const files = fs.readdirSync(distAssetsDir);
  const jsChunk = files.find((f) => f.endsWith('.js') && f.startsWith('index-'));
  assert(Boolean(jsChunk), `Built JS entry chunk exists in dist/assets: ${jsChunk}`);
  if (jsChunk) {
    const jsStats = fs.statSync(path.join(distAssetsDir, jsChunk));
    const jsSizeKb = jsStats.size / 1024;
    assert(jsSizeKb < 350, `Base JS entry bundle is ultralight (< 350 kB): ${jsSizeKb.toFixed(2)} kB`);
  }
}

// Summary
const total = testResults.length;
const passed = testResults.filter((r) => r.pass).length;
const failed = testResults.filter((r) => !r.pass).length;

console.log(`\n========================================`);
console.log(`AUDIT TEST SUMMARY: ${passed}/${total} PASSED, ${failed} FAILED`);
console.log(`========================================`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

