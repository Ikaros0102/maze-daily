import { GAME_CONFIG } from '../config/gameConfig.ts';
import type { GridCoord, MazeCell, SplitCheckpoint } from '../types/game';

interface BFSResult {
  furthest: GridCoord;
  maxDistance: number;
  parents: Map<string, GridCoord | null>;
}

function coordKey(c: GridCoord): string {
  return `${c.col},${c.row}`;
}

export function getPassableNeighbors(
  cell: MazeCell,
  grid: MazeCell[][]
): GridCoord[] {
  const neighbors: GridCoord[] = [];
  const { col, row, walls } = cell;

  if (!walls.top && row > 0) neighbors.push({ col, row: row - 1 });
  if (!walls.right && col < grid[0].length - 1)
    neighbors.push({ col: col + 1, row });
  if (!walls.bottom && row < grid.length - 1)
    neighbors.push({ col, row: row + 1 });
  if (!walls.left && col > 0) neighbors.push({ col: col - 1, row });

  return neighbors;
}

function runBFS(start: GridCoord, grid: MazeCell[][]): BFSResult {
  const queue: GridCoord[] = [start];
  const visited = new Set<string>([coordKey(start)]);
  const parents = new Map<string, GridCoord | null>([[coordKey(start), null]]);

  let furthest = start;
  let maxDistance = 0;
  const distances = new Map<string, number>([[coordKey(start), 0]]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDist = distances.get(coordKey(current))!;
    if (currentDist > maxDistance) {
      maxDistance = currentDist;
      furthest = current;
    }

    const currentCell = grid[current.row][current.col];
    const neighbors = getPassableNeighbors(currentCell, grid);

    for (const n of neighbors) {
      const key = coordKey(n);
      if (!visited.has(key)) {
        visited.add(key);
        parents.set(key, current);
        distances.set(key, currentDist + 1);
        queue.push(n);
      }
    }
  }

  return { furthest, maxDistance, parents };
}

function reconstructPath(
  target: GridCoord,
  parents: Map<string, GridCoord | null>
): GridCoord[] {
  const path: GridCoord[] = [];
  let curr: GridCoord | null = target;
  while (curr !== null) {
    path.push(curr);
    curr = parents.get(coordKey(curr)) ?? null;
  }
  path.reverse();
  return path;
}

export function analyzeMazeNavigation(grid: MazeCell[][]) {
  // Step 1: Find diameter endpoint A
  const initial: GridCoord = { col: 0, row: 0 };
  const firstPass = runBFS(initial, grid);
  const start = firstPass.furthest;

  // Step 2: Find diameter endpoint B (furthest from A)
  const secondPass = runBFS(start, grid);
  const exit = secondPass.furthest;
  const shortestPath = reconstructPath(exit, secondPass.parents);

  // Step 3: Compute strictly sequential checkpoints
  const checkpoints: SplitCheckpoint[] = [];
  const ratios = [...GAME_CONFIG.splits, 1.0];

  for (let i = 0; i < ratios.length; i++) {
    const ratio = ratios[i];
    const pathIdx = Math.min(
      shortestPath.length - 1,
      Math.round(ratio * (shortestPath.length - 1))
    );
    const targetCell = shortestPath[pathIdx];

    checkpoints.push({
      id: `split_${Math.round(ratio * 100)}`,
      ratio,
      cell: targetCell,
      reachedTimeMs: null,
      pbTimeMs: null,
    });
  }

  return { start, exit, shortestPath, checkpoints };
}

export interface NavigationField {
  target: GridCoord;
  distances: number[][]; // [row][col] -> distance in steps to target, or -1 if unreachable
  nextSteps: (GridCoord | null)[][]; // [row][col] -> next tile towards target along shortest path
  maxDistance: number;
}

/**
 * Computes a reverse BFS distance field from the target (exit) across the maze grid.
 * Provides O(1) instantaneous lookup for the next tile on the shortest path to target.
 *
 * @param grid 2D array of maze cells
 * @param target Destination tile (exit)
 * @returns Precomputed NavigationField
 */
export function computeExitNavigationField(
  grid: MazeCell[][],
  target: GridCoord,
  blockedTile?: GridCoord | null
): NavigationField {
  const rows = grid.length;
  const cols = grid[0].length;

  const distances: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(-1));
  const nextSteps: (GridCoord | null)[][] = Array.from({ length: rows }, () =>
    new Array(cols).fill(null)
  );

  if (target.row < 0 || target.row >= rows || target.col < 0 || target.col >= cols) {
    return { target, distances, nextSteps, maxDistance: 0 };
  }

  // Pointer-based queue avoids array shift overhead
  const queue: GridCoord[] = [target];
  distances[target.row][target.col] = 0;
  nextSteps[target.row][target.col] = null;

  let head = 0;
  let maxDistance = 0;

  while (head < queue.length) {
    const current = queue[head++];
    const currentDist = distances[current.row][current.col];
    if (currentDist > maxDistance) {
      maxDistance = currentDist;
    }

    const currentCell = grid[current.row][current.col];
    const neighbors = getPassableNeighbors(currentCell, grid);

    for (let i = 0; i < neighbors.length; i++) {
      const n = neighbors[i];
      // Skip impassable/locked tiles (e.g. locked gate during Key & Gate effect)
      if (blockedTile && n.row === blockedTile.row && n.col === blockedTile.col) {
        continue;
      }
      if (distances[n.row][n.col] === -1) {
        distances[n.row][n.col] = currentDist + 1;
        // Stepping from neighbor n to current brings the player 1 step closer to target
        nextSteps[n.row][n.col] = current;
        queue.push(n);
      }
    }
  }

  return { target, distances, nextSteps, maxDistance };
}
