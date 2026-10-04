import { GAME_CONFIG } from '../config/gameConfig';
import { getDailyEffectMetaForDate } from '../core/effectBag';
import { generateDailyEffect } from '../core/effects';
import { generateMazeGrid } from '../core/mazeGenerator';
import { analyzeMazeNavigation } from '../core/pathfinder';
import { getBaseSeed, getSeedStreams } from './date';
import { createRNG } from './prng';
import type { DailyEffectState, MazeData } from '../types/game';

export interface DailyLevel {
  baseSeed: string;
  mazeData: MazeData;
  initialEffect: DailyEffectState;
}

export function initDailyLevel(localDate: string): DailyLevel {
  const baseSeed = getBaseSeed(localDate);
  const seeds = getSeedStreams(baseSeed);

  const mazeRng = createRNG(seeds.mazeSeed);
  const spawnRng = createRNG(seeds.spawnSeed);

  const grid = generateMazeGrid(GAME_CONFIG.maze.cols, GAME_CONFIG.maze.rows, mazeRng);
  const nav = analyzeMazeNavigation(grid);

  const effectMeta = getDailyEffectMetaForDate(localDate);
  const effect = generateDailyEffect(
    effectMeta,
    spawnRng,
    grid,
    nav.start,
    nav.exit,
    nav.shortestPath
  );

  const mazeData: MazeData = {
    cols: GAME_CONFIG.maze.cols,
    rows: GAME_CONFIG.maze.rows,
    cells: grid,
    start: nav.start,
    exit: nav.exit,
    shortestPath: nav.shortestPath,
    checkpoints: nav.checkpoints,
  };

  return { baseSeed, mazeData, initialEffect: effect };
}
