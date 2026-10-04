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
 * Epoch reference date for game day counter (2024-01-01)
 */
export const GAME_EPOCH = new Date(2024, 0, 1).getTime();

/**
 * Returns 0-based day index since GAME_EPOCH for a Date or YYYY-MM-DD string.
 */
export function getDayIndex(dateStrOrDate: string | Date = new Date()): number {
  let date: Date;
  if (typeof dateStrOrDate === 'string') {
    const [year, month, day] = dateStrOrDate.split('-').map(Number);
    date = new Date(year, month - 1, day);
  } else {
    date = dateStrOrDate;
  }
  const current = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();
  const diffDays = Math.floor((current - GAME_EPOCH) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Computes 1-based day number for display: DailyMaze #XX
 */
export function getDailyNumber(dateStrOrDate: string | Date = new Date()): number {
  return getDayIndex(dateStrOrDate) + 1;
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
