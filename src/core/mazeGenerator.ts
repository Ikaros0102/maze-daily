import type { CellWalls, GridCoord, MazeCell } from '../types/game';
import type { PRNG } from '../utils/prng';

interface Neighbor {
  coord: GridCoord;
  wallCurrent: keyof CellWalls;
  wallNeighbor: keyof CellWalls;
}

export function generateMazeGrid(
  cols: number,
  rows: number,
  rng: PRNG
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

  const stack: GridCoord[] = [];
  const startCol = rng.nextInt(0, cols - 1);
  const startRow = rng.nextInt(0, rows - 1);

  stack.push({ col: startCol, row: startRow });
  visited[startRow][startCol] = true;

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors: Neighbor[] = [];

    // Top
    if (current.row > 0 && !visited[current.row - 1][current.col]) {
      neighbors.push({
        coord: { col: current.col, row: current.row - 1 },
        wallCurrent: 'top',
        wallNeighbor: 'bottom',
      });
    }
    // Right
    if (current.col < cols - 1 && !visited[current.row][current.col + 1]) {
      neighbors.push({
        coord: { col: current.col + 1, row: current.row },
        wallCurrent: 'right',
        wallNeighbor: 'left',
      });
    }
    // Bottom
    if (current.row < rows - 1 && !visited[current.row + 1][current.col]) {
      neighbors.push({
        coord: { col: current.col, row: current.row + 1 },
        wallCurrent: 'bottom',
        wallNeighbor: 'top',
      });
    }
    // Left
    if (current.col > 0 && !visited[current.row][current.col - 1]) {
      neighbors.push({
        coord: { col: current.col - 1, row: current.row },
        wallCurrent: 'left',
        wallNeighbor: 'right',
      });
    }

    if (neighbors.length > 0) {
      const chosen = rng.pick(neighbors);
      grid[current.row][current.col].walls[chosen.wallCurrent] = false;
      grid[chosen.coord.row][chosen.coord.col].walls[chosen.wallNeighbor] = false;
      visited[chosen.coord.row][chosen.coord.col] = true;
      stack.push(chosen.coord);
    } else {
      stack.pop();
    }
  }

  return grid;
}
