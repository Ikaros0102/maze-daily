import type {
  CellWalls,
  CurvedMazePattern,
  EffectType,
  GridCoord,
  MazeCell,
  WeaveBridgeOrientation,
} from '../types/game';
import type { PRNG } from '../utils/prng';

interface Neighbor {
  coord: GridCoord;
  wallCurrent: keyof CellWalls;
  wallNeighbor: keyof CellWalls;
  dx: number;
  dy: number;
}

export const CURVED_MAZE_PATTERNS: readonly CurvedMazePattern[] = [
  'spiral',
  'double_spiral',
  'zigzag_angled',
  'concentric_tree',
  'organic_wave',
] as const;

export interface MazeGenerationOptions {
  effectType?: EffectType;
  curvedPattern?: CurvedMazePattern;
}

function pickWeightedNeighbor(
  neighbors: Neighbor[],
  current: GridCoord,
  prevDir: { dx: number; dy: number },
  cols: number,
  rows: number,
  rng: PRNG,
  options?: MazeGenerationOptions
): Neighbor {
  if (neighbors.length === 1) return neighbors[0];

  const effectType = options?.effectType;
  const pattern = options?.curvedPattern;

  if (effectType === 'weave_labyrinth') {
    // Favor continuing straight so long horizontal and vertical tubes weave cleanly
    const weights = neighbors.map((n) =>
      n.dx === prevDir.dx && n.dy === prevDir.dy ? 3.2 : 1.0
    );
    return sampleByWeight(neighbors, weights, rng);
  }

  if (effectType === 'curved_labyrinth' && pattern) {
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;

    const weights = neighbors.map((n) => {
      const { dx, dy } = n;

      switch (pattern) {
        case 'spiral': {
          const rx = current.col - cx;
          const ry = current.row - cy;
          const dist = Math.hypot(rx, ry) || 1;
          // Tangent + slight outward spiral drift
          const tx = -ry / dist + 0.14 * (rx / dist);
          const ty = rx / dist + 0.14 * (ry / dist);
          const align = Math.abs(dx * tx + dy * ty);
          return 0.06 + Math.pow(align, 3) * 28;
        }
        case 'double_spiral': {
          const c1x = cols * 0.28;
          const c1y = rows * 0.36;
          const c2x = cols * 0.72;
          const c2y = rows * 0.64;
          const d1 = Math.hypot(current.col - c1x, current.row - c1y) || 1;
          const d2 = Math.hypot(current.col - c2x, current.row - c2y) || 1;
          const useFirst = d1 <= d2;
          const rx = current.col - (useFirst ? c1x : c2x);
          const ry = current.row - (useFirst ? c1y : c2y);
          const dist = useFirst ? d1 : d2;
          const swirl = useFirst ? 1 : -1;
          const tx = swirl * (-ry / dist) + 0.12 * (rx / dist);
          const ty = swirl * (rx / dist) + 0.12 * (ry / dist);
          const align = Math.abs(dx * tx + dy * ty);
          return 0.06 + Math.pow(align, 3) * 28;
        }
        case 'zigzag_angled': {
          // Force alternating horizontal & vertical steps to form 45°-60° diagonal staircases
          let w = 1.0;
          if (prevDir.dx !== 0 && dy !== 0) {
            w = 26.0;
          } else if (prevDir.dy !== 0 && dx !== 0) {
            w = 26.0;
          } else if (prevDir.dx !== 0 || prevDir.dy !== 0) {
            w = 0.25;
          }
          const band = Math.sin(current.col * 0.32 + current.row * 0.18) >= 0 ? 1 : -1;
          if ((dx + dy * band) !== 0) {
            w *= 1.6;
          }
          return w;
        }
        case 'concentric_tree': {
          const rx = current.col - cx;
          const ry = current.row - cy;
          const dist = Math.hypot(rx, ry) || 1;
          // Pure tangential concentric rings with occasional radial step
          const tx = -ry / dist;
          const ty = rx / dist;
          const align = Math.abs(dx * tx + dy * ty);
          return 0.04 + Math.pow(align, 4) * 36;
        }
        case 'organic_wave': {
          const angle =
            Math.sin(current.col * 0.3 + current.row * 0.16) * 1.15 +
            Math.cos(current.row * 0.28 - current.col * 0.14) * 0.85;
          const wx = Math.cos(angle);
          const wy = Math.sin(angle);
          const align = Math.abs(dx * wx + dy * wy);
          return 0.08 + Math.pow(align, 3) * 24;
        }
      }
    });

    return sampleByWeight(neighbors, weights, rng);
  }

  return rng.pick(neighbors);
}

function sampleByWeight<T>(items: T[], weights: number[], rng: PRNG): T {
  let total = 0;
  for (let i = 0; i < weights.length; i++) {
    total += weights[i];
  }
  if (total <= 0) return rng.pick(items);

  let roll = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      return items[i];
    }
  }
  return items[items.length - 1];
}

/**
 * Injects 25 to 35 multi-level bridge crossover points across the grid for weave_labyrinth.
 * Each bridge opens both horizontal (left-right) and vertical (top-bottom) passages
 * and marks which axis passes OVER the other.
 */
function injectWeaveBridges(
  grid: MazeCell[][],
  cols: number,
  rows: number,
  rng: PRNG
): void {
  const targetBridges = rng.nextInt(27, 33); // Strictly within 25..35
  const primaryCandidates: GridCoord[] = [];
  const secondaryCandidates: GridCoord[] = [];

  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const w = grid[r][c].walls;
      const isStraightVertical = !w.top && !w.bottom && w.left && w.right;
      const isStraightHorizontal = !w.left && !w.right && w.top && w.bottom;
      if (isStraightVertical || isStraightHorizontal) {
        primaryCandidates.push({ col: c, row: r });
      } else {
        secondaryCandidates.push({ col: c, row: r });
      }
    }
  }

  const orderedCandidates = [
    ...rng.shuffle(primaryCandidates),
    ...rng.shuffle(secondaryCandidates),
  ];

  const chosenBridges: GridCoord[] = [];

  const isFarEnough = (cand: GridCoord, minManhattan: number): boolean => {
    for (const b of chosenBridges) {
      if (Math.abs(b.col - cand.col) + Math.abs(b.row - cand.row) < minManhattan) {
        return false;
      }
    }
    return true;
  };

  // Pass 1: well-spaced bridges (Manhattan distance >= 3)
  for (const cand of orderedCandidates) {
    if (chosenBridges.length >= targetBridges) break;
    if (isFarEnough(cand, 3)) {
      chosenBridges.push(cand);
    }
  }

  // Pass 2: if needed, relax spacing to Manhattan distance >= 2 (non-adjacent)
  if (chosenBridges.length < 25) {
    for (const cand of orderedCandidates) {
      if (chosenBridges.length >= targetBridges) break;
      if (isFarEnough(cand, 2)) {
        chosenBridges.push(cand);
      }
    }
  }

  for (const pos of chosenBridges) {
    const { col: c, row: r } = pos;
    const cell = grid[r][c];
    const wasVertical = !cell.walls.top && !cell.walls.bottom && cell.walls.left && cell.walls.right;
    const wasHorizontal = !cell.walls.left && !cell.walls.right && cell.walls.top && cell.walls.bottom;

    let orientation: WeaveBridgeOrientation;
    if (wasVertical) {
      orientation = rng.next() < 0.65 ? 'horizontal_over' : 'vertical_over';
    } else if (wasHorizontal) {
      orientation = rng.next() < 0.65 ? 'vertical_over' : 'horizontal_over';
    } else {
      orientation = rng.next() < 0.5 ? 'horizontal_over' : 'vertical_over';
    }

    // Open all 4 directions through the crossover cell and its 4 neighbors
    cell.walls.top = false;
    grid[r - 1][c].walls.bottom = false;

    cell.walls.bottom = false;
    grid[r + 1][c].walls.top = false;

    cell.walls.left = false;
    grid[r][c - 1].walls.right = false;

    cell.walls.right = false;
    grid[r][c + 1].walls.left = false;

    cell.bridge = orientation;
  }
}

export function generateMazeGrid(
  cols: number,
  rows: number,
  rng: PRNG,
  options?: MazeGenerationOptions
): MazeCell[][] {
  const grid: MazeCell[][] = [];
  const visited: boolean[][] = [];

  for (let r = 0; r < rows; r++) {
    const rowCells: MazeCell[] = [];
    const visitedRow: boolean[] = [];
    for (let c = 0; c < cols; c++) {
      rowCells.push({
        col: c,
        row: r,
        walls: { top: true, right: true, bottom: true, left: true },
      });
      visitedRow.push(false);
    }
    grid.push(rowCells);
    visited.push(visitedRow);
  }

  const stack: { coord: GridCoord; prevDir: { dx: number; dy: number } }[] = [];
  const startCol = rng.nextInt(0, cols - 1);
  const startRow = rng.nextInt(0, rows - 1);

  stack.push({ coord: { col: startCol, row: startRow }, prevDir: { dx: 0, dy: 0 } });
  visited[startRow][startCol] = true;

  while (stack.length > 0) {
    const topItem = stack[stack.length - 1];
    const current = topItem.coord;
    const neighbors: Neighbor[] = [];

    // Top
    if (current.row > 0 && !visited[current.row - 1][current.col]) {
      neighbors.push({
        coord: { col: current.col, row: current.row - 1 },
        wallCurrent: 'top',
        wallNeighbor: 'bottom',
        dx: 0,
        dy: -1,
      });
    }
    // Right
    if (current.col < cols - 1 && !visited[current.row][current.col + 1]) {
      neighbors.push({
        coord: { col: current.col + 1, row: current.row },
        wallCurrent: 'right',
        wallNeighbor: 'left',
        dx: 1,
        dy: 0,
      });
    }
    // Bottom
    if (current.row < rows - 1 && !visited[current.row + 1][current.col]) {
      neighbors.push({
        coord: { col: current.col, row: current.row + 1 },
        wallCurrent: 'bottom',
        wallNeighbor: 'top',
        dx: 0,
        dy: 1,
      });
    }
    // Left
    if (current.col > 0 && !visited[current.row][current.col - 1]) {
      neighbors.push({
        coord: { col: current.col - 1, row: current.row },
        wallCurrent: 'left',
        wallNeighbor: 'right',
        dx: -1,
        dy: 0,
      });
    }

    if (neighbors.length > 0) {
      const chosen = pickWeightedNeighbor(
        neighbors,
        current,
        topItem.prevDir,
        cols,
        rows,
        rng,
        options
      );
      grid[current.row][current.col].walls[chosen.wallCurrent] = false;
      grid[chosen.coord.row][chosen.coord.col].walls[chosen.wallNeighbor] = false;
      visited[chosen.coord.row][chosen.coord.col] = true;
      stack.push({ coord: chosen.coord, prevDir: { dx: chosen.dx, dy: chosen.dy } });
    } else {
      stack.pop();
    }
  }

  if (options?.effectType === 'weave_labyrinth') {
    injectWeaveBridges(grid, cols, rows, rng);
  }

  return grid;
}
