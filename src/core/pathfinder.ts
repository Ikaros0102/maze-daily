import { GAME_CONFIG } from '../config/gameConfig';
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
