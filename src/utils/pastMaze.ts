import { GAME_CONFIG } from '../config/gameConfig';
import { generateMazeGrid } from '../core/mazeGenerator';
import { analyzeMazeNavigation } from '../core/pathfinder';
import { getBaseSeed, getSeedStreams } from './date';
import { createRNG } from './prng';
import type { GridCoord, MazeCell } from '../types/game';

export interface PastMazeData {
  grid: MazeCell[][];
  start: GridCoord;
  exit: GridCoord;
}

export function getPastMaze(date: string): PastMazeData {
  const dateSeeds = getSeedStreams(getBaseSeed(date));
  const g = generateMazeGrid(
    GAME_CONFIG.maze.cols,
    GAME_CONFIG.maze.rows,
    createRNG(dateSeeds.mazeSeed)
  );
  const nav = analyzeMazeNavigation(g);
  return { grid: g, start: nav.start, exit: nav.exit };
}
