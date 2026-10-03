import { GAME_CONFIG } from '../config/gameConfig';
import type { DailyStats, GameSettings, RunRecord } from '../types/game';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

export function getDefaultSettings(): GameSettings {
  let lang: GameSettings['lang'] = 'en';
  let theme: GameSettings['theme'] = 'dark';

  if (typeof navigator !== 'undefined') {
    const navLang = navigator.language.toLowerCase();
    if (navLang.startsWith('ru')) {
      lang = 'ru';
    }
  }

  if (typeof window !== 'undefined' && window.matchMedia) {
    if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      theme = 'light';
    }
  }

  return {
    theme,
    lang,
    playerColor: GAME_CONFIG.player.defaultColor,
    showSplits: true,
  };
}

export function loadSettings(): GameSettings {
  const defaults = getDefaultSettings();
  if (!isBrowser()) return defaults;

  try {
    const raw = localStorage.getItem(GAME_CONFIG.storageKeys.settings);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: GameSettings): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(
      GAME_CONFIG.storageKeys.settings,
      JSON.stringify(settings)
    );
  } catch {
    // Ignore storage write errors
  }
}

export function loadDailyStats(date: string): DailyStats {
  const empty: DailyStats = {
    date,
    bestTimeMs: null,
    bestSplits: [null, null, null],
    totalRuns: 0,
    history: [],
  };

  if (!isBrowser()) return empty;

  try {
    const key = `${GAME_CONFIG.storageKeys.historyPrefix}${date}`;
    const raw = localStorage.getItem(key);
    if (!raw) return empty;
    return JSON.parse(raw);
  } catch {
    return empty;
  }
}

export function getLast30DaysStats(referenceDate: Date = new Date()): DailyStats[] {
  const result: DailyStats[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const stats = loadDailyStats(dateStr);
    if (stats.totalRuns > 0 || i === 0) {
      result.push(stats);
    }
  }
  return result;
}

export function saveRunRecord(record: RunRecord): DailyStats {
  const stats = loadDailyStats(record.date);
  stats.totalRuns += 1;
  stats.history.unshift(record);

  if (stats.history.length > 15) {
    stats.history = stats.history.slice(0, 15);
  }

  if (stats.bestTimeMs === null || record.durationMs < stats.bestTimeMs) {
    stats.bestTimeMs = record.durationMs;
    stats.bestSplits = [...record.splits];
  }

  if (isBrowser()) {
    try {
      const key = `${GAME_CONFIG.storageKeys.historyPrefix}${record.date}`;
      localStorage.setItem(key, JSON.stringify(stats));
    } catch {
      stats.history = stats.history.slice(0, 3);
      try {
        const key = `${GAME_CONFIG.storageKeys.historyPrefix}${record.date}`;
        localStorage.setItem(key, JSON.stringify(stats));
      } catch {
        // Ignore
      }
    }
  }

  return stats;
}
