import { GAME_CONFIG } from '../config/gameConfig';

/**
 * Returns local device date as YYYY-MM-DD
 */
export function getLocalDailyDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Epoch reference date for game day counter (e.g., 2024-01-01)
 */
const GAME_EPOCH = new Date(2024, 0, 1).getTime();

/**
 * Computes day index for display: DailyMaze #XX
 */
export function getDailyNumber(date: Date = new Date()): number {
  const current = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();
  const diffDays = Math.floor((current - GAME_EPOCH) / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays + 1);
}

/**
 * Returns versioned full base seed
 */
export function getBaseSeed(dateStr: string = getLocalDailyDate()): string {
  return `${GAME_CONFIG.version}|${dateStr}`;
}

/**
 * Separate deterministic seed streams
 */
export function getSeedStreams(baseSeed: string) {
  return {
    mazeSeed: `${baseSeed}_maze`,
    effectSeed: `${baseSeed}_effect`,
    spawnSeed: `${baseSeed}_spawn`,
  };
}
