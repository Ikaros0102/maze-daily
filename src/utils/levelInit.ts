import { AVAILABLE_EFFECTS, GAME_CONFIG } from '../config/gameConfig';
import { getDailyEffectMetaForDate } from '../core/effectBag';
import { generateDailyEffect } from '../core/effects';
import { CURVED_MAZE_PATTERNS, generateMazeGrid } from '../core/mazeGenerator';
import { analyzeMazeNavigation } from '../core/pathfinder';
import { getBaseSeed, getSeedStreams } from './date';
import { createRNG } from './prng';
import type { CurvedMazePattern, DailyEffectState, EffectType, MazeData } from '../types/game';

export interface DailyLevel {
  baseSeed: string;
  mazeData: MazeData;
  initialEffect: DailyEffectState;
}

function getDebugQueryOverrides(): {
  debugEffect?: EffectType;
  debugPattern?: CurvedMazePattern;
} {
  if (typeof window === 'undefined' || !window.location?.search) {
    return {};
  }
  const params = new URLSearchParams(window.location.search);
  const rawEffect = params.get('debugEffect');
  const rawPattern = params.get('debugPattern');

  let debugEffect: EffectType | undefined;
  if (rawEffect && AVAILABLE_EFFECTS.some((e) => e.type === rawEffect)) {
    debugEffect = rawEffect as EffectType;
  }

  let debugPattern: CurvedMazePattern | undefined;
  if (
    rawPattern &&
    (CURVED_MAZE_PATTERNS as readonly string[]).includes(rawPattern)
  ) {
    debugPattern = rawPattern as CurvedMazePattern;
  }

  return { debugEffect, debugPattern };
}

export function initDailyLevel(
  localDate: string,
  overrideEffectType?: EffectType
): DailyLevel {
  const baseSeed = getBaseSeed(localDate);
  const seeds = getSeedStreams(baseSeed);

  const mazeRng = createRNG(seeds.mazeSeed);
  const spawnRng = createRNG(seeds.spawnSeed);

  const { debugEffect, debugPattern } = getDebugQueryOverrides();
  const targetEffectType = overrideEffectType ?? debugEffect;

  let effectMeta = getDailyEffectMetaForDate(localDate);
  if (targetEffectType) {
    const matched = AVAILABLE_EFFECTS.find((e) => e.type === targetEffectType);
    if (matched) {
      effectMeta = { ...matched, enabled: true };
    }
  }

  let curvedPattern: CurvedMazePattern | undefined;
  if (effectMeta.type === 'curved_labyrinth') {
    curvedPattern = debugPattern ?? spawnRng.pick(CURVED_MAZE_PATTERNS);
  }

  const grid = generateMazeGrid(
    GAME_CONFIG.maze.cols,
    GAME_CONFIG.maze.rows,
    mazeRng,
    {
      effectType: effectMeta.type,
      curvedPattern,
    }
  );
  const nav = analyzeMazeNavigation(grid);

  const effect = generateDailyEffect(
    effectMeta,
    spawnRng,
    grid,
    nav.start,
    nav.exit,
    nav.shortestPath,
    curvedPattern
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
