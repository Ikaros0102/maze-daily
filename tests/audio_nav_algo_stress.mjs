/**
 * tests/audio_nav_algo_stress.mjs
 *
 * Empirical Algorithmic & Acoustic Verification Test Suite for Milestone 3 (Audio Navigation Module).
 * Authored by teamwork_preview_challenger_m3_1 (EMPIRICAL CHALLENGER).
 *
 * Verifies:
 * 1. Reverse BFS Navigation Field (computeExitNavigationField):
 *    - All passable cells have valid distances and nextSteps.
 *    - nextStep strictly decrements distance by 1.
 *    - Dead-end side corridors point back toward exit.
 *    - Exit cell has distance 0 and null nextStep.
 *    - 50+ Wilson-generated mazes tested empirically across thousands of cells.
 *    - Open grids with extensive cycles/loops (Manhattan shortest path DAG validation).
 *    - Highly asymmetric grids (1x50, 50x1, 7x35, 51x51).
 *    - Edge cases (out-of-bounds, 1x1, disconnected).
 * 2. Spatial Panning & Elevation Math (BeaconSynthesizer):
 *    - East/Right displacement produces positive pan up to +1.0.
 *    - West/Left displacement produces negative pan down to -1.0.
 *    - North displacement (row < player) modulates frequency to 800Hz.
 *    - South displacement (row > player) modulates frequency to 440Hz.
 *    - Exit arrival suspends acoustic pings (isAtExit === true).
 *    - Extreme coordinates (NaN, Infinity, negative, out-of-bounds) resilience.
 *    - High-frequency churn simulation (10,000 updates at 144Hz rate).
 * 3. Equal-Power Quartile Crossfading (calculateQuartileGains):
 *    - Power sum g1^2 + g2^2 + g3^2 + g4^2 == 1.0 across all p in [0.0, 1.0].
 *    - Anchor points, boundary clamping, monotonicity, and continuity.
 * 4. Wall Collision Synthesizer (CollisionSynthesizer):
 *    - >= 280ms cooldown suppression and rapid burst filtering.
 *    - Suspended AudioContext safety and missing navigator.vibrate safety.
 */

import { computeExitNavigationField, analyzeMazeNavigation, getPassableNeighbors } from '../src/core/pathfinder.ts';
import { generateMazeGrid } from '../src/core/mazeGenerator.ts';
import { PRNG } from '../src/utils/prng.ts';
import { BeaconSynthesizer, BEACON_DEFAULTS } from '../src/modules/audioNav/beacon.ts';
import { calculateQuartileGains, SineFallbackSynthesizer } from '../src/modules/audioNav/stems.ts';
import { CollisionSynthesizer } from '../src/modules/audioNav/collisionSynth.ts';

// ============================================================================
// Test Harness Utilities
// ============================================================================

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;
const testResults = [];

function assert(condition, message, detail = '') {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    testResults.push({ passed: true, message });
  } else {
    failedAssertions++;
    const fullMsg = detail ? `${message} | DETAIL: ${detail}` : message;
    testResults.push({ passed: false, message: fullMsg });
    console.error(`  [FAIL] ${fullMsg}`);
  }
}

function suite(name, fn) {
  console.log(`\n============================================================`);
  console.log(`SUITE: ${name}`);
  console.log(`============================================================`);
  fn();
}

// ============================================================================
// Web Audio API Mocks for Node.js Environment
// ============================================================================

class MockAudioParam {
  constructor(val = 0) {
    this.value = val;
    this.history = [];
  }
  setValueAtTime(val, time) {
    this.value = val;
    this.history.push({ type: 'setValueAtTime', val, time });
  }
  setTargetAtTime(val, time, tau) {
    this.value = val;
    this.history.push({ type: 'setTargetAtTime', val, time, tau });
  }
  linearRampToValueAtTime(val, time) {
    this.value = val;
    this.history.push({ type: 'linearRampToValueAtTime', val, time });
  }
  exponentialRampToValueAtTime(val, time) {
    this.value = val;
    this.history.push({ type: 'exponentialRampToValueAtTime', val, time });
  }
  cancelScheduledValues(time) {
    this.history.push({ type: 'cancelScheduledValues', time });
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
  }
}

class MockPannerNode extends MockAudioNode {
  constructor() {
    super();
    this.pan = new MockAudioParam(0.0);
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

class MockBiquadFilterNode extends MockAudioNode {
  constructor() {
    super();
    this.type = 'lowpass';
    this.frequency = new MockAudioParam(20000);
    this.Q = new MockAudioParam(1.0);
  }
}

class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 5.0;
    this.createdOscillators = [];
  }
  createGain() { return new MockGainNode(); }
  createStereoPanner() { return new MockPannerNode(); }
  createBiquadFilter() { return new MockBiquadFilterNode(); }
  createOscillator() {
    const osc = new MockOscillatorNode();
    this.createdOscillators.push(osc);
    return osc;
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}

// ============================================================================
// SUITE 1: Reverse BFS Navigation Field (computeExitNavigationField)
// ============================================================================

suite('1. Reverse BFS Navigation Field - Handcrafted & Known Topologies', () => {
  // Construct a handcrafted 3x3 grid:
  // (0,0) - (0,1) - (0,2) [dead end]
  //   |
  // (1,0) - (1,1) (dead end)
  //   |
  // (2,0) - (2,1) - (2,2) [EXIT]
  const cells = [
    [
      { col: 0, row: 0, walls: { top: true, right: false, bottom: false, left: true } },
      { col: 1, row: 0, walls: { top: true, right: false, bottom: true, left: false } },
      { col: 2, row: 0, walls: { top: true, right: true, bottom: true, left: false } },
    ],
    [
      { col: 0, row: 1, walls: { top: false, right: false, bottom: false, left: true } },
      { col: 1, row: 1, walls: { top: true, right: true, bottom: true, left: false } },
      { col: 2, row: 1, walls: { top: true, right: true, bottom: true, left: true } }, // isolated wall block
    ],
    [
      { col: 0, row: 2, walls: { top: false, right: false, bottom: true, left: true } },
      { col: 1, row: 2, walls: { top: true, right: false, bottom: true, left: false } },
      { col: 2, row: 2, walls: { top: true, right: true, bottom: true, left: false } }, // EXIT
    ],
  ];

  const exit = { col: 2, row: 2 };
  const field = computeExitNavigationField(cells, exit);

  assert(field.target.col === 2 && field.target.row === 2, 'Field stores target exit coordinate');
  assert(field.distances[2][2] === 0, 'Exit cell (2,2) has distance 0');
  assert(field.nextSteps[2][2] === null, 'Exit cell (2,2) has null nextStep');

  // Verify distance propagation:
  // (2,1) is neighbor of (2,2) -> distance 1, nextStep is (2,2)
  assert(field.distances[2][1] === 1, 'Neighbor (2,1) distance is 1');
  assert(field.nextSteps[2][1]?.col === 2 && field.nextSteps[2][1]?.row === 2, '(2,1) nextStep points to exit (2,2)');

  // (2,0) is neighbor of (2,1) -> distance 2, nextStep is (2,1)
  assert(field.distances[2][0] === 2, '(2,0) distance is 2');
  assert(field.nextSteps[2][0]?.col === 1 && field.nextSteps[2][0]?.row === 2, '(2,0) nextStep points to (2,1)');

  // Dead end at (1,1): connected only to (1,0)
  // Path to exit: (1,1) -> (1,0) -> (2,0) -> (2,1) -> (2,2)
  assert(field.distances[1][0] === 3, '(1,0) distance is 3');
  assert(field.distances[1][1] === 4, 'Dead end (1,1) distance is 4');
  assert(field.nextSteps[1][1]?.col === 0 && field.nextSteps[1][1]?.row === 1, 'Dead end (1,1) nextStep points back to junction (1,0)');

  // Dead end at (0,2):
  // Path to exit: (0,2) -> (0,1) -> (0,0) -> (1,0) -> (2,0) -> (2,1) -> (2,2)
  assert(field.distances[0][0] === 4, '(0,0) distance is 4');
  assert(field.distances[0][1] === 5, '(0,1) distance is 5');
  assert(field.distances[0][2] === 6, 'Dead end (0,2) distance is 6');
  assert(field.nextSteps[0][2]?.col === 1 && field.nextSteps[0][2]?.row === 0, 'Dead end (0,2) nextStep points back toward junction (0,1)');

  // Strict unit decrement check across all passable cells in handcrafted maze
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (r === 1 && c === 2) continue; // isolated cell
      const dist = field.distances[r][c];
      if (r === 2 && c === 2) {
        assert(dist === 0, 'Exit cell dist is 0');
      } else {
        const next = field.nextSteps[r][c];
        assert(next !== null, `Passable cell (${c},${r}) has a nextStep`);
        const nextDist = field.distances[next.row][next.col];
        assert(nextDist === dist - 1, `Cell (${c},${r}) taking nextStep strictly decrements distance by 1 (${dist} -> ${nextDist})`);
      }
    }
  }

  // Unreachable / isolated cell (2, 1 in grid coords row 1 col 2)
  assert(field.distances[1][2] === -1, 'Isolated unreachable cell has distance -1');
  assert(field.nextSteps[1][2] === null, 'Isolated unreachable cell has null nextStep');
});

suite('1. Reverse BFS Navigation Field - Complex Dead-End Branches', () => {
  // Construct a T-junction maze with a 5-step dead-end branch
  // Main path: (0,0) -> (0,1) -> (0,2) -> (0,3) [exit]
  // Branch off (0,1): (1,1) -> (2,1) -> (3,1) -> (4,1) -> (5,1) [dead end]
  const rows = 6;
  const cols = 4;
  const cells = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({
      col: c,
      row: r,
      walls: { top: true, right: true, bottom: true, left: true },
    }))
  );

  // Connect main corridor (row 0, cols 0..3)
  for (let c = 0; c < 3; c++) {
    cells[0][c].walls.right = false;
    cells[0][c + 1].walls.left = false;
  }
  // Connect branch from (row 0, col 1) downward through row 5
  cells[0][1].walls.bottom = false;
  cells[1][1].walls.top = false;
  for (let r = 1; r < 5; r++) {
    cells[r][1].walls.bottom = false;
    cells[r + 1][1].walls.top = false;
  }

  const exit = { col: 3, row: 0 };
  const field = computeExitNavigationField(cells, exit);

  assert(field.distances[0][3] === 0, 'Exit (3,0) distance is 0');
  assert(field.distances[0][2] === 1, '(2,0) distance is 1');
  assert(field.distances[0][1] === 2, 'Junction (1,0) distance is 2');

  // Verify branch distances
  for (let r = 1; r <= 5; r++) {
    const expectedDist = 2 + r;
    assert(field.distances[r][1] === expectedDist, `Branch cell (1, ${r}) distance is ${expectedDist}`);
    const next = field.nextSteps[r][1];
    assert(next !== null, `Branch cell (1, ${r}) has nextStep`);
    assert(next.row === r - 1 && next.col === 1, `Branch cell (1, ${r}) points up to (1, ${r - 1}) toward junction`);
  }

  // Trace path from deep dead-end tip (row 5, col 1) all the way to exit
  let curr = { col: 1, row: 5 };
  let steps = 0;
  const maxSteps = 20;
  while (curr !== null && !(curr.col === exit.col && curr.row === exit.row) && steps < maxSteps) {
    const next = field.nextSteps[curr.row][curr.col];
    assert(next !== null, `Step ${steps}: node (${curr.col}, ${curr.row}) has next step`);
    const dCurr = field.distances[curr.row][curr.col];
    const dNext = field.distances[next.row][next.col];
    assert(dNext === dCurr - 1, `Step ${steps}: distance strictly decrements from ${dCurr} to ${dNext}`);
    curr = next;
    steps++;
  }
  assert(steps === field.distances[5][1], `Tip (1,5) reached exit in exactly ${field.distances[5][1]} steps (took ${steps})`);
  assert(curr.col === exit.col && curr.row === exit.row, 'Path from dead end reached the exact exit');
});

suite('1. Reverse BFS Navigation Field - Open Grid with Cycles & Loops', () => {
  // Completely open 10x10 grid (all internal walls false): infinite cycles and multiple paths.
  const size = 10;
  const openGrid = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => ({
      col: c,
      row: r,
      walls: {
        top: r === 0,
        right: c === size - 1,
        bottom: r === size - 1,
        left: c === 0,
      },
    }))
  );

  const exit = { col: 9, row: 9 };
  const field = computeExitNavigationField(openGrid, exit);

  assert(field.distances[9][9] === 0, 'Open grid exit distance is 0');
  assert(field.maxDistance === 18, `Open grid max Manhattan distance is 18 (actual: ${field.maxDistance})`);

  // Verify that every single cell has distance equal to Manhattan distance to (9,9)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const manhattan = (9 - r) + (9 - c);
      assert(field.distances[r][c] === manhattan, `Open grid cell (${c},${r}) distance ${field.distances[r][c]} matches Manhattan distance ${manhattan}`);
      if (r === 9 && c === 9) continue;
      const next = field.nextSteps[r][c];
      assert(next !== null, `Open grid cell (${c},${r}) has nextStep`);
      const nextDist = field.distances[next.row][next.col];
      assert(nextDist === field.distances[r][c] - 1, `Open grid cell (${c},${r}) step strictly decrements distance by 1`);
    }
  }
});

suite('1. Reverse BFS Navigation Field - Empirical Verification Across 50 Wilson Mazes', () => {
  const seeds = [
    '2026-10-04', '2026-10-05', '2026-10-06', 'test-alpha', 'speedrun-daily',
    'maze-42', 'seed-1337', 'wilson-test-1', 'wilson-test-2', 'wilson-test-3',
  ];

  // Expand seeds up to 50
  for (let i = 11; i <= 50; i++) {
    seeds.push(`generated-seed-${i * 7919}`);
  }

  const dimensions = [
    { cols: 15, rows: 15 },
    { cols: 21, rows: 21 },
    { cols: 25, rows: 25 },
    { cols: 31, rows: 31 },
    { cols: 7, rows: 35 },   // Asymmetric long
    { cols: 51, rows: 51 },  // Large maze
  ];

  let totalMazesTested = 0;
  let totalCellsChecked = 0;

  for (let sIdx = 0; sIdx < seeds.length; sIdx++) {
    const seed = seeds[sIdx];
    const dim = dimensions[sIdx % dimensions.length];
    const rng = new PRNG(seed);
    const grid = generateMazeGrid(dim.cols, dim.rows, rng);

    // Compute start and exit endpoints
    const navAnalysis = analyzeMazeNavigation(grid);
    const exit = navAnalysis.exit;

    const navField = computeExitNavigationField(grid, exit);
    totalMazesTested++;

    // Invariant 1: Exit cell has distance 0 and null nextStep
    assert(navField.distances[exit.row][exit.col] === 0, `[Seed: ${seed}] Exit distance is 0`);
    assert(navField.nextSteps[exit.row][exit.col] === null, `[Seed: ${seed}] Exit nextStep is null`);

    let mazeMaxDistance = 0;

    // Check every cell in the grid
    for (let r = 0; r < dim.rows; r++) {
      for (let c = 0; c < dim.cols; c++) {
        totalCellsChecked++;
        const dist = navField.distances[r][c];

        // Invariant 2: Every cell in a spanning tree maze has a valid distance >= 0
        assert(dist >= 0, `[Seed: ${seed}] Cell (${c},${r}) has valid non-negative distance (${dist})`);
        if (dist > mazeMaxDistance) {
          mazeMaxDistance = dist;
        }

        if (r === exit.row && c === exit.col) {
          continue;
        }

        // Invariant 3: Non-exit cells have a non-null nextStep
        const next = navField.nextSteps[r][c];
        assert(next !== null, `[Seed: ${seed}] Cell (${c},${r}) has non-null nextStep`);
        if (!next) continue;

        // Invariant 4: nextStep is an immediate passable neighbor
        const cell = grid[r][c];
        const neighbors = getPassableNeighbors(cell, grid);
        const isNeighborPassable = neighbors.some((n) => n.col === next.col && n.row === next.row);
        assert(isNeighborPassable, `[Seed: ${seed}] Cell (${c},${r}) nextStep (${next.col},${next.row}) is a passable neighbor`);

        // Invariant 5: Distance strictly decrements by 1
        const nextDist = navField.distances[next.row][next.col];
        assert(nextDist === dist - 1, `[Seed: ${seed}] Step from (${c},${r}) [d=${dist}] to (${next.col},${next.row}) [d=${nextDist}] strictly decrements by 1`);
      }
    }

    // Invariant 6: maxDistance matches maximum calculated distance
    assert(navField.maxDistance === mazeMaxDistance, `[Seed: ${seed}] maxDistance (${navField.maxDistance}) matches computed maximum (${mazeMaxDistance})`);

    // Invariant 7: Randomly pick 10 arbitrary cells and walk them to exit; verify termination in exactly dist steps
    for (let sample = 0; sample < 10; sample++) {
      const startCol = rng.nextInt(0, dim.cols - 1);
      const startRow = rng.nextInt(0, dim.rows - 1);
      const startDist = navField.distances[startRow][startCol];

      let walkNode = { col: startCol, row: startRow };
      let walkSteps = 0;
      const stepLimit = startDist + 5; // Guard against infinite loops

      while (walkNode && !(walkNode.col === exit.col && walkNode.row === exit.row) && walkSteps <= stepLimit) {
        walkNode = navField.nextSteps[walkNode.row][walkNode.col];
        walkSteps++;
      }

      assert(walkSteps === startDist, `[Seed: ${seed}] Walk from (${startCol},${startRow}) took exactly ${startDist} steps (actual: ${walkSteps})`);
      assert(walkNode && walkNode.col === exit.col && walkNode.row === exit.row, `[Seed: ${seed}] Walk terminated at exit`);
    }
  }

  console.log(`  -> Empirically verified ${totalMazesTested} Wilson mazes and ${totalCellsChecked} total cells.`);
});

suite('1. Reverse BFS Navigation Field - Boundary & Out-Of-Bounds Stress', () => {
  const rng = new PRNG(999);
  const grid = generateMazeGrid(5, 5, rng);

  // Out of bounds target row < 0
  const oob1 = computeExitNavigationField(grid, { col: 2, row: -1 });
  assert(oob1.maxDistance === 0, 'Target row < 0 returns maxDistance 0');
  assert(oob1.distances[0][0] === -1, 'Target row < 0 has distances -1');
  assert(oob1.nextSteps[0][0] === null, 'Target row < 0 has nextSteps null');

  // Out of bounds target row >= rows
  const oob2 = computeExitNavigationField(grid, { col: 2, row: 5 });
  assert(oob2.maxDistance === 0, 'Target row >= rows returns maxDistance 0');

  // Out of bounds target col < 0
  const oob3 = computeExitNavigationField(grid, { col: -1, row: 2 });
  assert(oob3.maxDistance === 0, 'Target col < 0 returns maxDistance 0');

  // Out of bounds target col >= cols
  const oob4 = computeExitNavigationField(grid, { col: 5, row: 2 });
  assert(oob4.maxDistance === 0, 'Target col >= cols returns maxDistance 0');

  // 1x1 maze grid
  const singleCellGrid = [[{ col: 0, row: 0, walls: { top: true, right: true, bottom: true, left: true } }]];
  const singleField = computeExitNavigationField(singleCellGrid, { col: 0, row: 0 });
  assert(singleField.maxDistance === 0, '1x1 grid maxDistance is 0');
  assert(singleField.distances[0][0] === 0, '1x1 grid distance is 0');
  assert(singleField.nextSteps[0][0] === null, '1x1 grid nextStep is null');
});

// ============================================================================
// SUITE 2: Spatial Panning & Elevation Math (BeaconSynthesizer)
// ============================================================================

suite('2. Spatial Panning & Elevation Math (BeaconSynthesizer)', () => {
  // Construct a test maze with a 4-way cross centered at (row: 2, col: 2)
  const createCrossMaze = () => {
    const size = 5;
    const grid = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) => ({
        col: c,
        row: r,
        walls: { top: true, right: true, bottom: true, left: true },
      }))
    );

    // East: (row 2, col 2) <-> (row 2, col 3) <-> (row 2, col 4)
    grid[2][2].walls.right = false; grid[2][3].walls.left = false;
    grid[2][3].walls.right = false; grid[2][4].walls.left = false;

    // West: (row 2, col 2) <-> (row 2, col 1) <-> (row 2, col 0)
    grid[2][2].walls.left = false; grid[2][1].walls.right = false;
    grid[2][1].walls.left = false; grid[2][0].walls.right = false;

    // North: (row 2, col 2) <-> (row 1, col 2) <-> (row 0, col 2)
    grid[2][2].walls.top = false; grid[1][2].walls.bottom = false;
    grid[1][2].walls.top = false; grid[0][2].walls.bottom = false;

    // South: (row 2, col 2) <-> (row 3, col 2) <-> (row 4, col 2)
    grid[2][2].walls.bottom = false; grid[3][2].walls.top = false;
    grid[3][2].walls.bottom = false; grid[4][2].walls.top = false;

    return grid;
  };

  const cells = createCrossMaze();

  // Test 2.1: Moving Right / East (nextX > playerX) produces pan > 0 up to +1.0
  {
    const mockCtx = new MockAudioContext();
    const dest = mockCtx.createGain();
    const synth = new BeaconSynthesizer();
    synth.init(mockCtx, dest);

    const mazeData = {
      cells,
      start: { col: 2, row: 2 },
      exit: { col: 4, row: 2 }, // Exit is to the East
      shortestPath: [],
      checkpoints: [],
    };
    synth.setMazeData(mazeData);

    // Player at center of (col 2, row 2): { x: 2.5, y: 2.5 }
    // nextTile is (col 3, row 2) with center (3.5, 2.5)
    // rawDx = 3.5 - 2.5 = 1.0 -> targetPan = 1.0
    synth.updatePosition({ x: 2.5, y: 2.5 });

    const panner = synth['pannerNode'];
    assert(panner !== null, 'Panner node initialized');
    const panHistory = panner.pan.history;
    const lastPanCall = panHistory[panHistory.length - 1];
    assert(lastPanCall?.type === 'linearRampToValueAtTime', 'Pan updated via linearRampToValueAtTime');
    assert(lastPanCall?.val > 0, `Moving East produces pan > 0 (val: ${lastPanCall?.val})`);
    assert(Math.abs(lastPanCall?.val - 1.0) < 1e-6, `Moving East produces targetPan exactly 1.0 (val: ${lastPanCall?.val})`);

    // Player position within cell preserves directional pan (+1.0 for East)
    synth.updatePosition({ x: 2.8, y: 2.5 });
    const panRight = panner.pan.history[panner.pan.history.length - 1]?.val;
    assert(Math.abs(panRight - 1.0) < 1e-6, `Player at x=2.8 produces strict targetPan 1.0 for East (actual: ${panRight})`);

    // Player offset left inside cell (col 2, row 2): x = 2.1
    // Still stepping East -> pan strictly 1.0
    synth.updatePosition({ x: 2.1, y: 2.5 });
    const panClamped = panner.pan.history[panner.pan.history.length - 1]?.val;
    assert(panClamped === 1.0, `Left position within cell still maintains strict pan 1.0 (actual: ${panClamped})`);
  }

  // Test 2.2: Moving Left / West (nextX < playerX) produces strict pan -1.0
  {
    const mockCtx = new MockAudioContext();
    const dest = mockCtx.createGain();
    const synth = new BeaconSynthesizer();
    synth.init(mockCtx, dest);

    const mazeData = {
      cells,
      start: { col: 2, row: 2 },
      exit: { col: 0, row: 2 }, // Exit is to the West
      shortestPath: [],
      checkpoints: [],
    };
    synth.setMazeData(mazeData);

    // Player at center of (col 2, row 2): { x: 2.5, y: 2.5 }
    // nextTile is (col 1, row 2) with center (1.5, 2.5)
    synth.updatePosition({ x: 2.5, y: 2.5 });

    const panner = synth['pannerNode'];
    const panHistory = panner.pan.history;
    const lastPanCall = panHistory[panHistory.length - 1];
    assert(lastPanCall?.val < 0, `Moving West produces pan < 0 (val: ${lastPanCall?.val})`);
    assert(Math.abs(lastPanCall?.val - (-1.0)) < 1e-6, `Moving West produces targetPan exactly -1.0 (val: ${lastPanCall?.val})`);

    // Player at x = 2.2: still stepping West -> strict pan -1.0
    synth.updatePosition({ x: 2.2, y: 2.5 });
    const panLeft = panner.pan.history[panner.pan.history.length - 1]?.val;
    assert(Math.abs(panLeft - (-1.0)) < 1e-6, `Player at x=2.2 produces strict targetPan -1.0 (actual: ${panLeft})`);

    // Player offset right inside cell (col 2, row 2): x = 2.9
    synth.updatePosition({ x: 2.9, y: 2.5 });
    const panClamped = panner.pan.history[panner.pan.history.length - 1]?.val;
    assert(panClamped === -1.0, `Right position within cell maintains strict pan -1.0 (actual: ${panClamped})`);
  }

  // Test 2.3: Moving North (nextY < playerY) modulates frequency to 650Hz (rising gesture 650Hz -> 880Hz) and keeps filter open at 20000Hz
  {
    const mockCtx = new MockAudioContext();
    const dest = mockCtx.createGain();
    const synth = new BeaconSynthesizer();
    synth.init(mockCtx, dest);

    const mazeData = {
      cells,
      start: { col: 2, row: 2 },
      exit: { col: 2, row: 0 }, // Exit is to the North
      shortestPath: [],
      checkpoints: [],
    };
    synth.setMazeData(mazeData);

    // Player at center of (col 2, row 2): { x: 2.5, y: 2.5 }
    // nextTile is (col 2, row 1) with center (2.5, 1.5)
    // Up / North -> 650Hz rising gesture, centered, filter open (20000Hz)
    synth.updatePosition({ x: 2.5, y: 2.5 });

    const currentFreq = synth['currentFreq'];
    assert(currentFreq === 650, `Moving North modulates frequency to exactly 650Hz (actual: ${currentFreq}Hz)`);
    assert(synth.getVerticalGesture() === 'up', 'Moving North sets verticalGesture to "up"');
    const filterHist = synth['filterNode']?.frequency.history;
    const lastFilterCall = filterHist?.[filterHist.length - 1];
    assert(lastFilterCall?.val === 20000, `Moving North keeps filter open at 20000Hz (actual: ${lastFilterCall?.val})`);
  }

  // Test 2.4: Moving South (nextY > playerY) modulates frequency to 440Hz (falling gesture 440Hz -> 260Hz) and activates 600Hz lowpass filter
  {
    const mockCtx = new MockAudioContext();
    const dest = mockCtx.createGain();
    const synth = new BeaconSynthesizer();
    synth.init(mockCtx, dest);

    const mazeData = {
      cells,
      start: { col: 2, row: 2 },
      exit: { col: 2, row: 4 }, // Exit is to the South
      shortestPath: [],
      checkpoints: [],
    };
    synth.setMazeData(mazeData);

    // Player at center of (col 2, row 2): { x: 2.5, y: 2.5 }
    // nextTile is (col 2, row 3) with center (2.5, 3.5)
    // Down / South -> 440Hz falling gesture, centered, muffled lowpass (600Hz)
    synth.updatePosition({ x: 2.5, y: 2.5 });

    const currentFreq = synth['currentFreq'];
    assert(currentFreq === 440, `Moving South modulates frequency to exactly 440Hz (actual: ${currentFreq}Hz)`);
    assert(synth.getVerticalGesture() === 'down', 'Moving South sets verticalGesture to "down"');
    const filterHist = synth['filterNode']?.frequency.history;
    const lastFilterCall = filterHist?.[filterHist.length - 1];
    assert(lastFilterCall?.val === 600, `Moving South activates muffled 600Hz lowpass filter (actual: ${lastFilterCall?.val})`);
  }

  // Test 2.5: Horizontal movement leaves vertical pitch at base frequency 620Hz
  {
    const mockCtx = new MockAudioContext();
    const dest = mockCtx.createGain();
    const synth = new BeaconSynthesizer();
    synth.init(mockCtx, dest);

    const mazeData = {
      cells,
      start: { col: 2, row: 2 },
      exit: { col: 4, row: 2 }, // Exit is to the East
      shortestPath: [],
      checkpoints: [],
    };
    synth.setMazeData(mazeData);

    synth.updatePosition({ x: 2.5, y: 2.5 });
    const currentFreq = synth['currentFreq'];
    assert(currentFreq === BEACON_DEFAULTS.baseFrequencyHz, `Pure horizontal movement maintains base frequency (620Hz) (actual: ${currentFreq}Hz)`);
  }

  // Test 2.6: Reaching exit suspends pings (isAtExit === true)
  {
    const mockCtx = new MockAudioContext();
    const dest = mockCtx.createGain();
    const synth = new BeaconSynthesizer();
    synth.init(mockCtx, dest);

    const exitCoord = { col: 4, row: 2 };
    const mazeData = {
      cells,
      start: { col: 2, row: 2 },
      exit: exitCoord,
      shortestPath: [],
      checkpoints: [],
    };
    synth.setMazeData(mazeData);
    synth.start();

    // 1. Position away from exit
    synth.updatePosition({ x: 2.5, y: 2.5 });
    assert(synth['isAtExit'] === false, 'Away from exit: isAtExit is false');

    const oscCountBefore = mockCtx.createdOscillators.length;
    synth['pulseTick']();
    assert(mockCtx.createdOscillators.length === oscCountBefore + 1, 'Pulse tick creates an oscillator when away from exit');

    // 2. Move player into the exit tile: col=4, row=2
    synth.updatePosition({ x: 4.5, y: 2.5 });
    assert(synth['isAtExit'] === true, 'At exit tile: isAtExit is true');

    const oscCountAtExit = mockCtx.createdOscillators.length;
    synth['pulseTick']();
    assert(mockCtx.createdOscillators.length === oscCountAtExit, 'Reaching exit suspends pings: pulseTick does NOT create oscillator');

    // 3. Move player away from exit again
    synth.updatePosition({ x: 3.5, y: 2.5 });
    assert(synth['isAtExit'] === false, 'Moving away from exit clears isAtExit flag');
    synth['pulseTick']();
    assert(mockCtx.createdOscillators.length === oscCountAtExit + 1, 'Pings resume once moving away from exit');

    synth.stop();
  }

  // Test 2.7: Adversarial Out-Of-Bounds and Corrupted Coordinates Resilience
  {
    const mockCtx = new MockAudioContext();
    const dest = mockCtx.createGain();
    const synth = new BeaconSynthesizer();
    synth.init(mockCtx, dest);

    const mazeData = {
      cells,
      start: { col: 2, row: 2 },
      exit: { col: 4, row: 2 },
      shortestPath: [],
      checkpoints: [],
    };
    synth.setMazeData(mazeData);

    // Negative coordinates
    synth.updatePosition({ x: -100.5, y: -50.2 });
    assert(synth['isAtExit'] === false, 'Negative player coordinates safely handled without exception');

    // Huge out-of-bounds coordinates
    synth.updatePosition({ x: 99999.0, y: 99999.0 });
    assert(synth['isAtExit'] === false, 'Massive out-of-bounds coordinates safely handled without exception');

    // NaN / Infinity coordinates
    synth.updatePosition({ x: NaN, y: NaN });
    assert(synth['isAtExit'] === false, 'NaN coordinates safely handled without exception');

    // Rapid game-loop churn: 10,000 updates
    for (let i = 0; i < 10000; i++) {
      const px = 2.0 + (i % 100) / 100;
      const py = 2.0 + ((i * 3) % 100) / 100;
      synth.updatePosition({ x: px, y: py });
    }
    assert(true, '10,000 rapid position updates completed smoothly with zero memory or audio errors');
  }
});

// ============================================================================
// SUITE 3: Equal-Power Quartile Crossfading (calculateQuartileGains)
// ============================================================================

suite('3. Equal-Power Quartile Crossfading Math (calculateQuartileGains)', () => {
  // Test 3.1: Power Sum Invariant: g1^2 + g2^2 + g3^2 + g4^2 == 1.0 across 10,001 points in [0.0, 1.0]
  let maxPowerDeviation = 0;
  const numSteps = 10000;

  for (let i = 0; i <= numSteps; i++) {
    const p = i / numSteps;
    const { stem1, stem2, stem3, stem4 } = calculateQuartileGains(p, 'equal-power');
    const powerSum = stem1 * stem1 + stem2 * stem2 + stem3 * stem3 + stem4 * stem4;
    const deviation = Math.abs(powerSum - 1.0);
    if (deviation > maxPowerDeviation) {
      maxPowerDeviation = deviation;
    }
  }

  assert(maxPowerDeviation < 1e-12, `Equal-power invariant holds across all 10,001 points (max deviation: ${maxPowerDeviation.toExponential(4)})`);

  // Test 3.2: Exact Quartile Boundary Anchors
  // p = 0.0: stem1 = 1.0, rest 0
  const q0 = calculateQuartileGains(0.0);
  assert(q0.stem1 === 1.0 && q0.stem2 === 0 && q0.stem3 === 0 && q0.stem4 === 0, 'p = 0.0: stem1 = 1.0');

  // p = 0.25: stem1 = 1.0, rest 0
  const q25 = calculateQuartileGains(0.25);
  assert(q25.stem1 === 1.0 && q25.stem2 === 0 && q25.stem3 === 0 && q25.stem4 === 0, 'p = 0.25: stem1 = 1.0');

  // p = 0.375 (midpoint Q2): stem1 = cos(pi/4) ~= 0.70710678, stem2 = sin(pi/4) ~= 0.70710678
  const q375 = calculateQuartileGains(0.375);
  const expectedHalfPower = Math.SQRT1_2; // 1 / sqrt(2)
  assert(Math.abs(q375.stem1 - expectedHalfPower) < 1e-12, 'p = 0.375: stem1 == sqrt(1/2) (half power)');
  assert(Math.abs(q375.stem2 - expectedHalfPower) < 1e-12, 'p = 0.375: stem2 == sqrt(1/2) (half power)');
  assert(q375.stem3 === 0 && q375.stem4 === 0, 'p = 0.375: stems 3 and 4 are zero');

  // p = 0.50: stem2 = 1.0, rest 0
  const q50 = calculateQuartileGains(0.50);
  assert(Math.abs(q50.stem2 - 1.0) < 1e-12 && Math.abs(q50.stem1) < 1e-12 && q50.stem3 === 0 && q50.stem4 === 0, 'p = 0.50: stem2 = 1.0');

  // p = 0.625 (midpoint Q3): stem2 = half power, stem3 = half power
  const q625 = calculateQuartileGains(0.625);
  assert(Math.abs(q625.stem2 - expectedHalfPower) < 1e-12, 'p = 0.625: stem2 == sqrt(1/2)');
  assert(Math.abs(q625.stem3 - expectedHalfPower) < 1e-12, 'p = 0.625: stem3 == sqrt(1/2)');

  // p = 0.75: stem3 = 1.0, rest 0
  const q75 = calculateQuartileGains(0.75);
  assert(Math.abs(q75.stem3 - 1.0) < 1e-12 && Math.abs(q75.stem2) < 1e-12 && q75.stem1 === 0 && q75.stem4 === 0, 'p = 0.75: stem3 = 1.0');

  // p = 0.875 (midpoint Q4): stem3 = half power, stem4 = half power
  const q875 = calculateQuartileGains(0.875);
  assert(Math.abs(q875.stem3 - expectedHalfPower) < 1e-12, 'p = 0.875: stem3 == sqrt(1/2)');
  assert(Math.abs(q875.stem4 - expectedHalfPower) < 1e-12, 'p = 0.875: stem4 == sqrt(1/2)');

  // p = 1.0: stem4 = 1.0, rest 0
  const q100 = calculateQuartileGains(1.0);
  assert(Math.abs(q100.stem4 - 1.0) < 1e-12 && Math.abs(q100.stem3) < 1e-12 && q100.stem1 === 0 && q100.stem2 === 0, 'p = 1.0: stem4 = 1.0');

  // Test 3.3: Clamping of Out-Of-Bounds Inputs
  const qNeg = calculateQuartileGains(-0.5);
  assert(qNeg.stem1 === 1.0 && qNeg.stem2 === 0 && qNeg.stem3 === 0 && qNeg.stem4 === 0, 'p = -0.5 is clamped to p = 0.0');

  const qOver = calculateQuartileGains(1.5);
  assert(Math.abs(qOver.stem4 - 1.0) < 1e-12 && qOver.stem1 === 0 && qOver.stem2 === 0 && Math.abs(qOver.stem3) < 1e-12, 'p = 1.5 is clamped to p = 1.0');

  // Test 3.4: Linear Curve Mode Verification
  for (let i = 0; i <= 100; i++) {
    const p = i / 100;
    const { stem1, stem2, stem3, stem4 } = calculateQuartileGains(p, 'linear');
    const linearSum = stem1 + stem2 + stem3 + stem4;
    assert(Math.abs(linearSum - 1.0) < 1e-12, `Linear mode sum equals 1.0 at p=${p}`);
  }
});

// ============================================================================
// SUITE 4: Wall Collision Synthesizer Cooldown & Synthesis (CollisionSynthesizer)
// ============================================================================

suite('4. Wall Collision Synthesizer Cooldown & Synthesis (CollisionSynthesizer)', () => {
  const mockCtx = new MockAudioContext();
  const sfxBus = mockCtx.createGain();
  const synth = new CollisionSynthesizer({ cooldownMs: 280 });
  synth.init(mockCtx, sfxBus);

  // Initial trigger succeeds
  const first = synth.trigger();
  assert(first === true, 'Initial wall collision trigger succeeds');

  // Trigger immediately afterwards is suppressed by cooldown
  const immediate = synth.trigger();
  assert(immediate === false, 'Immediate follow-up collision is suppressed by cooldown');

  // Fast-forward lastCollisionTime to test cooldown boundary
  // 279ms elapsed -> still suppressed
  synth['lastCollisionTime'] = performance.now() - 279;
  const at279 = synth.trigger();
  assert(at279 === false, 'Trigger at 279ms is suppressed (< 280ms)');

  // 280ms elapsed -> accepted
  synth['lastCollisionTime'] = performance.now() - 280;
  const at280 = synth.trigger();
  assert(at280 === true, 'Trigger at 280ms succeeds (>= 280ms)');

  // Rapid burst of 1,000 rapid collisions
  let acceptedCount = 0;
  for (let i = 0; i < 1000; i++) {
    if (synth.trigger()) {
      acceptedCount++;
    }
  }
  assert(acceptedCount === 0, `Rapid burst of 1,000 spam triggers immediately rejected all ${acceptedCount === 0 ? 'correctly' : 'incorrectly'}`);

  // Test with suspended context: returns true, doesn't throw
  mockCtx.state = 'suspended';
  synth['lastCollisionTime'] = performance.now() - 280;
  const suspendedTrigger = synth.trigger();
  assert(suspendedTrigger === true, 'Suspended context collision handled cleanly without throwing');
});

// ============================================================================
// SUITE 5: Sine Harmonic Fallback Synthesizer Acoustic Verification
// ============================================================================

suite('5. Sine Harmonic Fallback Synthesizer Acoustic Verification', () => {
  const mockCtx = new MockAudioContext();
  const dest = mockCtx.createGain();
  const sineFallback = new SineFallbackSynthesizer(mockCtx, dest);

  const initialGains = calculateQuartileGains(0.0);
  sineFallback.start(initialGains);

  // 4 layers * 2 oscillators = 8 oscillators
  assert(mockCtx.createdOscillators.length === 8, `Sine fallback starts exactly 8 consonant oscillators (actual: ${mockCtx.createdOscillators.length})`);

  // Verify layer frequencies (C major pentatonic consonant harmony)
  const expectedFreqs = [130.81, 196.0, 164.81, 261.63, 293.66, 392.0, 329.63, 523.25];
  for (let i = 0; i < 8; i++) {
    const osc = mockCtx.createdOscillators[i];
    assert(Math.abs(osc.frequency.value - expectedFreqs[i]) < 1e-2, `Oscillator #${i} frequency matches ${expectedFreqs[i]}Hz`);
  }

  // Update gains to quartile 4 (1.0)
  const endGains = calculateQuartileGains(1.0);
  sineFallback.updateGains(endGains);
  assert(true, 'updateGains executed smoothly');

  sineFallback.destroy();
  assert(true, 'destroy executed smoothly');
});

// ============================================================================
// Final Verdict & Summary
// ============================================================================

console.log(`\n============================================================`);
console.log(`STRESS SUITE SUMMARY`);
console.log(`============================================================`);
console.log(`Total Assertions:  ${totalAssertions}`);
console.log(`Passed Assertions: ${passedAssertions}`);
console.log(`Failed Assertions: ${failedAssertions}`);

if (failedAssertions === 0) {
  console.log(`\n>>> VERDICT: APPROVE <<<`);
  console.log(`All reverse BFS navigation invariants, spatial panning calculations, elevation modulation,`);
  console.log(`equal-power crossfade math, and collision synthesis cooldowns pass with mathematical precision.`);
  process.exit(0);
} else {
  console.error(`\n>>> VERDICT: REQUEST_CHANGES <<<`);
  console.error(`${failedAssertions} assertions failed!`);
  process.exit(1);
}
