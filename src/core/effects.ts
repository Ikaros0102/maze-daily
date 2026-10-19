import { GAME_CONFIG, type EffectMeta } from '../config/gameConfig';
import { getPassableNeighbors } from './pathfinder';
import type {
  DailyEffectState,
  GridCoord,
  MazeCell,
  PortalPair,
} from '../types/game';
import type { PRNG } from '../utils/prng';

export const PORTAL_COLORS = [
  '#38bdf8', // Pair 1: Cyan
  '#a855f7', // Pair 2: Purple
  '#f59e0b', // Pair 3: Amber
  '#f43f5e', // Pair 4: Rose
] as const;

function coordKey(c: GridCoord): string {
  return `${c.col},${c.row}`;
}

export function findReachableDeadEnds(
  grid: MazeCell[][],
  start: GridCoord,
  blocked?: GridCoord
): GridCoord[] {
  const reachableDeadEnds: GridCoord[] = [];
  const blockedKey = blocked ? coordKey(blocked) : null;
  const visited = new Set<string>([coordKey(start)]);
  const queue: GridCoord[] = [start];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const cell = grid[current.row][current.col];
    const { top, right, bottom, left } = cell.walls;
    const wallCount =
      (top ? 1 : 0) + (right ? 1 : 0) + (bottom ? 1 : 0) + (left ? 1 : 0);

    if (wallCount === 3 && coordKey(current) !== coordKey(start)) {
      reachableDeadEnds.push(current);
    }

    const neighbors = getPassableNeighbors(cell, grid);
    for (const n of neighbors) {
      const key = coordKey(n);
      if (key !== blockedKey && !visited.has(key)) {
        visited.add(key);
        queue.push(n);
      }
    }
  }

  return reachableDeadEnds;
}

/**
 * Computes BFS distance from a start coordinate to all reachable cells in the grid.
 */
function computeDistancesFrom(
  grid: MazeCell[][],
  start: GridCoord,
  blocked?: GridCoord
): number[][] {
  const rows = grid.length;
  const cols = grid[0].length;
  const dists: number[][] = Array.from({ length: rows }, () => Array(cols).fill(-1));
  const blockedKey = blocked ? coordKey(blocked) : null;

  dists[start.row][start.col] = 0;
  const queue: GridCoord[] = [start];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const d = dists[curr.row][curr.col];
    const cell = grid[curr.row][curr.col];
    const neighbors = getPassableNeighbors(cell, grid);

    for (const n of neighbors) {
      if (coordKey(n) === blockedKey) continue;
      if (dists[n.row][n.col] === -1) {
        dists[n.row][n.col] = d + 1;
        queue.push(n);
      }
    }
  }

  return dists;
}

/**
 * Finds the junction tile on shortestPath where a given side cell branches off,
 * and the depth (in steps) from that junction to the cell.
 */
function findBranchJunction(
  grid: MazeCell[][],
  cell: GridCoord,
  pathIndexMap: Map<string, number>,
  blocked?: GridCoord
): { junctionIdx: number; depth: number } | null {
  const blockedKey = blocked ? coordKey(blocked) : null;
  const visited = new Set<string>([coordKey(cell)]);
  const queue: { coord: GridCoord; depth: number }[] = [{ coord: cell, depth: 0 }];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const key = coordKey(curr.coord);

    if (pathIndexMap.has(key)) {
      return { junctionIdx: pathIndexMap.get(key)!, depth: curr.depth };
    }

    const mazeCell = grid[curr.coord.row][curr.coord.col];
    const neighbors = getPassableNeighbors(mazeCell, grid);
    for (const n of neighbors) {
      const nKey = coordKey(n);
      if (nKey !== blockedKey && !visited.has(nKey)) {
        visited.add(nKey);
        queue.push({ coord: n, depth: curr.depth + 1 });
      }
    }
  }

  return null;
}

/**
 * Places 4 pairs of portals (8 portals total) strictly in side dead-ends outside shortestPath.
 * Each pair connects dead-ends bounded within the same split progression segment (or setback),
 * guaranteeing that portals can never skip unreached split checkpoints.
 */
export function placeSafePortals(
  grid: MazeCell[][],
  start: GridCoord,
  exit: GridCoord,
  shortestPath: GridCoord[],
  spawnRng: PRNG
): PortalPair[] {
  const L = shortestPath.length;
  const cp25 = Math.round(0.25 * (L - 1));
  const cp50 = Math.round(0.50 * (L - 1));
  const cp75 = Math.round(0.75 * (L - 1));

  const pathIndexMap = new Map<string, number>();
  shortestPath.forEach((pt, i) => pathIndexMap.set(coordKey(pt), i));

  const allDeadEnds = findReachableDeadEnds(grid, start);
  const sideDeadEnds = allDeadEnds.filter(
    (d) =>
      !pathIndexMap.has(coordKey(d)) &&
      coordKey(d) !== coordKey(start) &&
      coordKey(d) !== coordKey(exit)
  );

  // Group side dead-ends into 4 progression segments:
  // Segment 0: [0, cp25)
  // Segment 1: [cp25, cp50)
  // Segment 2: [cp50, cp75)
  // Segment 3: [cp75, L)
  interface DeadEndMeta {
    coord: GridCoord;
    junctionIdx: number;
    depth: number;
  }

  const segmentBuckets: DeadEndMeta[][] = [[], [], [], []];

  for (const d of sideDeadEnds) {
    const branch = findBranchJunction(grid, d, pathIndexMap);
    if (!branch) continue;

    let seg: number;
    if (branch.junctionIdx < cp25) {
      seg = 0;
    } else if (branch.junctionIdx < cp50) {
      seg = 1;
    } else if (branch.junctionIdx < cp75) {
      seg = 2;
    } else {
      seg = 3;
    }

    segmentBuckets[seg].push({ coord: d, junctionIdx: branch.junctionIdx, depth: branch.depth });
  }

  const pairs: PortalPair[] = [];
  const usedCoords = new Set<string>();

  for (let k = 0; k < 4; k++) {
    const bucket = segmentBuckets[k].filter((item) => !usedCoords.has(coordKey(item.coord)));

    let a: GridCoord;
    let b: GridCoord;

    if (bucket.length >= 2) {
      // Sort by junction index: a earlier in segment, b later in segment (shortcut)
      bucket.sort((x, y) => x.junctionIdx - y.junctionIdx);
      const chosenA = bucket[spawnRng.nextInt(0, Math.floor(bucket.length / 2) - 1)];
      const chosenB = bucket[spawnRng.nextInt(Math.ceil(bucket.length / 2), bucket.length - 1)];
      a = chosenA.coord;
      b = chosenB.coord;
    } else if (bucket.length === 1) {
      a = bucket[0].coord;
      // Pair with an earlier segment dead-end (setback) to preserve split boundary invariant
      const earlierCandidates = segmentBuckets
        .slice(0, k + 1)
        .flat()
        .filter((item) => !usedCoords.has(coordKey(item.coord)) && coordKey(item.coord) !== coordKey(a));
      b = earlierCandidates.length > 0 ? spawnRng.pick(earlierCandidates).coord : a;
    } else {
      // Fallback: pick any unused side dead-end
      const fallbackCandidates = sideDeadEnds.filter((item) => !usedCoords.has(coordKey(item)));
      a = fallbackCandidates.length > 0 ? spawnRng.pick(fallbackCandidates) : start;
      usedCoords.add(coordKey(a));
      const remaining = sideDeadEnds.filter((item) => !usedCoords.has(coordKey(item)));
      b = remaining.length > 0 ? spawnRng.pick(remaining) : a;
    }

    usedCoords.add(coordKey(a));
    usedCoords.add(coordKey(b));

    pairs.push({
      id: k + 1,
      color: PORTAL_COLORS[k],
      a,
      b,
    });
  }

  return pairs;
}

export function generateDailyEffect(
  chosenMeta: EffectMeta,
  spawnRng: PRNG,
  grid: MazeCell[][],
  start: GridCoord,
  exit: GridCoord,
  shortestPath: GridCoord[]
): DailyEffectState {
  const rows = grid.length;
  const cols = grid[0].length;

  const state: DailyEffectState = {
    type: chosenMeta.type,
    enabled: chosenMeta.type !== 'none',
  };

  if (chosenMeta.type === 'fog_of_war') {
    const revealed: boolean[][] = Array.from({ length: rows }, () =>
      Array(cols).fill(false)
    );
    revealFogRadius(revealed, start.col, start.row, 3, cols, rows, grid);
    state.fogRevealed = revealed;
  } else if (chosenMeta.type === 'portals') {
    state.portals = placeSafePortals(grid, start, exit, shortestPath, spawnRng);
  } else if (chosenMeta.type === 'key_and_gate') {
    const gatePos = shortestPath[Math.max(1, shortestPath.length - 2)] || exit;
    const reachableDeadEnds = findReachableDeadEnds(grid, start, gatePos);
    const pathIndexMap = new Map<string, number>();
    shortestPath.forEach((pt, i) => pathIndexMap.set(coordKey(pt), i));

    const sideDeadEnds = reachableDeadEnds.filter((d) => !pathIndexMap.has(coordKey(d)));

    // Analyze branch points of candidate dead-ends
    const candidates = sideDeadEnds
      .map((d) => {
        const branch = findBranchJunction(grid, d, pathIndexMap, gatePos);
        return branch ? { coord: d, ...branch } : null;
      })
      .filter((c): c is { coord: GridCoord; junctionIdx: number; depth: number } => c !== null);

    const L = shortestPath.length;
    // Prefer branches branching off between 35% and 65% of the shortest path
    const inRangeCandidates = candidates.filter((c) => {
      const ratio = c.junctionIdx / (L - 1);
      return ratio >= 0.35 && ratio <= 0.65;
    });

    // Sub-filter for deep branches (depth >= 10 steps from shortestPath)
    const deepCandidates = inRangeCandidates.filter((c) => c.depth >= 10);

    let chosenKey: GridCoord;
    if (deepCandidates.length > 0) {
      chosenKey = spawnRng.pick(deepCandidates).coord;
    } else if (inRangeCandidates.length > 0) {
      // Pick deepest candidate in range
      inRangeCandidates.sort((x, y) => y.depth - x.depth);
      chosenKey = inRangeCandidates[0].coord;
    } else if (candidates.length > 0) {
      // Fallback: pick deepest candidate overall
      candidates.sort((x, y) => y.depth - x.depth);
      chosenKey = candidates[0].coord;
    } else {
      chosenKey = start;
    }

    state.keyPos = chosenKey;
    state.gatePos = gatePos;
    state.hasKey = false;
    state.isGateOpen = false;
  } else if (chosenMeta.type === 'fake_exits') {
    const deadEnds = findReachableDeadEnds(grid, start);
    const distFromStart = computeDistancesFrom(grid, start);
    const maxPathDist = shortestPath.length;
    const minFakeDist = 0.45 * maxPathDist;

    // Filter dead-ends strictly at distance >= 45% of path length from start
    const valid = deadEnds.filter((d) => {
      if (coordKey(d) === coordKey(start) || coordKey(d) === coordKey(exit)) return false;
      const dist = distFromStart[d.row]?.[d.col] ?? -1;
      return dist >= minFakeDist;
    });

    let chosen: GridCoord[];
    if (valid.length >= 3) {
      chosen = spawnRng.shuffle([...valid]).slice(0, 3);
    } else {
      // Fallback: sort all available dead-ends by distance from start descending
      const allValid = deadEnds.filter(
        (d) => coordKey(d) !== coordKey(start) && coordKey(d) !== coordKey(exit)
      );
      allValid.sort((a, b) => {
        const da = distFromStart[a.row]?.[a.col] ?? 0;
        const db = distFromStart[b.row]?.[b.col] ?? 0;
        return db - da;
      });
      chosen = allValid.slice(0, 3);
    }

    state.fakeExits = chosen.map((c) => ({ col: c.col, row: c.row, revealed: false }));
  } else if (chosenMeta.type === 'inversion') {
    state.isInverted = true;
  } else if (chosenMeta.type === 'glitch') {
    state.glitchTransform = 'none';
    state.glitchWarning = false;
    state.glitchStatic = false;
    state.glitchNextSec = GAME_CONFIG.glitch.intervalSec;
    state.glitchCycle = 0;
  }

  return state;
}

/**
 * Line-of-Sight Fog of War reveal:
 * Uses a strict depth-limited BFS (default depth 3) from the player's current tile,
 * traversing exclusively through open corridors without penetrating solid walls.
 */
export function revealFogRadius(
  revealed: boolean[][],
  centerCol: number,
  centerRow: number,
  depth: number = 3,
  cols: number = GAME_CONFIG.maze.cols,
  rows: number = GAME_CONFIG.maze.rows,
  grid?: MazeCell[][]
): void {
  const c = Math.max(0, Math.min(cols - 1, Math.floor(centerCol)));
  const r = Math.max(0, Math.min(rows - 1, Math.floor(centerRow)));

  revealed[r][c] = true;

  if (!grid) {
    // Fallback: simple radial reveal if grid is omitted
    const rCeil = Math.ceil(depth);
    const minC = Math.max(0, Math.floor(centerCol - rCeil));
    const maxC = Math.min(cols - 1, Math.ceil(centerCol + rCeil));
    const minR = Math.max(0, Math.floor(centerRow - rCeil));
    const maxR = Math.min(rows - 1, Math.ceil(centerRow + rCeil));

    for (let rowIdx = minR; rowIdx <= maxR; rowIdx++) {
      for (let colIdx = minC; colIdx <= maxC; colIdx++) {
        if (Math.hypot(colIdx + 0.5 - centerCol, rowIdx + 0.5 - centerRow) <= depth) {
          revealed[rowIdx][colIdx] = true;
        }
      }
    }
    return;
  }

  // Strict Line-of-Sight BFS through open walls
  const queue: { col: number; row: number; d: number }[] = [{ col: c, row: r, d: 0 }];
  const visited = new Set<string>([coordKey({ col: c, row: r })]);

  while (queue.length > 0) {
    const curr = queue.shift()!;
    revealed[curr.row][curr.col] = true;

    if (curr.d < depth) {
      const cell = grid[curr.row]?.[curr.col];
      if (!cell) continue;

      const neighbors = getPassableNeighbors(cell, grid);
      for (const n of neighbors) {
        const k = coordKey(n);
        if (!visited.has(k)) {
          visited.add(k);
          queue.push({ col: n.col, row: n.row, d: curr.d + 1 });
        }
      }
    }
  }
}
