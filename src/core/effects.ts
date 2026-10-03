import { GAME_CONFIG, getEnabledEffects } from '../config/gameConfig';
import { getPassableNeighbors } from './pathfinder';
import type {
  DailyEffectState,
  GridCoord,
  MazeCell,
  PortalPair,
} from '../types/game';
import type { PRNG } from '../utils/prng';

function coordKey(c: GridCoord): string {
  return `${c.col},${c.row}`;
}

function findReachableDeadEnds(
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

function placeSafePortals(
  shortestPath: GridCoord[],
  spawnRng: PRNG
): PortalPair {
  const L = shortestPath.length;
  const cp25 = Math.round(0.25 * (L - 1));
  const cp50 = Math.round(0.5 * (L - 1));
  const cp75 = Math.round(0.75 * (L - 1));

  // Segments strictly within checkpoint bounds to avoid skipping splits
  const segments = [
    shortestPath.slice(2, Math.max(3, cp25 - 1)),
    shortestPath.slice(cp25 + 1, Math.max(cp25 + 2, cp50 - 1)),
    shortestPath.slice(cp50 + 1, Math.max(cp50 + 2, cp75 - 1)),
    shortestPath.slice(cp75 + 1, Math.max(cp75 + 2, L - 2)),
  ].filter((seg) => seg.length >= 4);

  const chosenSegment =
    segments.length > 0 ? spawnRng.pick(segments) : shortestPath.slice(1, 5);

  const idxA = spawnRng.nextInt(0, Math.floor(chosenSegment.length / 2) - 1);
  const idxB = spawnRng.nextInt(
    Math.ceil(chosenSegment.length / 2),
    chosenSegment.length - 1
  );

  return { a: chosenSegment[idxA], b: chosenSegment[idxB] };
}

export function generateDailyEffect(
  effectRng: PRNG,
  spawnRng: PRNG,
  grid: MazeCell[][],
  start: GridCoord,
  exit: GridCoord,
  shortestPath: GridCoord[]
): DailyEffectState {
  const enabledEffects = getEnabledEffects();
  const chosenMeta = effectRng.pick(enabledEffects);
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
    revealFogRadius(revealed, start.col, start.row, 3, cols, rows);
    state.fogRevealed = revealed;
  } else if (chosenMeta.type === 'portals') {
    state.portals = placeSafePortals(shortestPath, spawnRng);
  } else if (chosenMeta.type === 'key_and_gate') {
    const gatePos = shortestPath[Math.max(1, shortestPath.length - 2)] || exit;
    const reachableDeadEnds = findReachableDeadEnds(grid, start, gatePos);
    const pathKeys = new Set(shortestPath.map(coordKey));
    const sideDeadEnds = reachableDeadEnds.filter((d) => !pathKeys.has(coordKey(d)));

    const keyPos = spawnRng.pick(
      sideDeadEnds.length > 0
        ? sideDeadEnds
        : reachableDeadEnds.length > 0
        ? reachableDeadEnds
        : [start]
    );

    state.keyPos = keyPos;
    state.gatePos = gatePos;
    state.hasKey = false;
    state.isGateOpen = false;
  } else if (chosenMeta.type === 'fake_exits') {
    const deadEnds = findReachableDeadEnds(grid, start);
    const valid = deadEnds.filter(
      (d) => coordKey(d) !== coordKey(start) && coordKey(d) !== coordKey(exit)
    );
    const chosen = spawnRng.shuffle([...valid]).slice(0, 3);
    state.fakeExits = chosen.map((c) => ({ col: c.col, row: c.row, revealed: false }));
  } else if (chosenMeta.type === 'inversion') {
    state.isInverted = true;
  }

  return state;
}

export function revealFogRadius(
  revealed: boolean[][],
  centerCol: number,
  centerRow: number,
  radius: number = GAME_CONFIG.fog.sightRadiusCells,
  cols: number = GAME_CONFIG.maze.cols,
  rows: number = GAME_CONFIG.maze.rows
): void {
  const rCeil = Math.ceil(radius);
  const minC = Math.max(0, Math.floor(centerCol - rCeil));
  const maxC = Math.min(cols - 1, Math.ceil(centerCol + rCeil));
  const minR = Math.max(0, Math.floor(centerRow - rCeil));
  const maxR = Math.min(rows - 1, Math.ceil(centerRow + rCeil));

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const dist = Math.hypot(c + 0.5 - centerCol, r + 0.5 - centerRow);
      if (dist <= radius) {
        revealed[r][c] = true;
      }
    }
  }
}
