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
    } else if (navLang.startsWith('es')) {
      lang = 'es';
    } else if (navLang.startsWith('zh')) {
      lang = 'zh';
    } else if (navLang.startsWith('ja')) {
      lang = 'ja';
    } else if (navLang.startsWith('de')) {
      lang = 'de';
    } else if (navLang.startsWith('tr')) {
      lang = 'tr';
    } else if (navLang.startsWith('pt')) {
      lang = 'pt';
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
    showControls: true,
    headTrackingEnabled: false,
    audioNavEnabled: false,
    audioNavVolume: 0.8,
    audioNavMuted: false,
    selectedAudioPack: 'classic',
  };
}

export function loadSettings(): GameSettings {
  const defaults = getDefaultSettings();
  if (!isBrowser()) return defaults;

  try {
    const raw = localStorage.getItem(GAME_CONFIG.storageKeys.settings);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return defaults;

    const headTrackingEnabled =
      typeof parsed.headTrackingEnabled === 'boolean'
        ? parsed.headTrackingEnabled
        : defaults.headTrackingEnabled;

    const audioNavEnabled =
      typeof parsed.audioNavEnabled === 'boolean'
        ? parsed.audioNavEnabled
        : defaults.audioNavEnabled;

    const rawVolume =
      typeof parsed.audioNavVolume === 'number' && !Number.isNaN(parsed.audioNavVolume)
        ? parsed.audioNavVolume
        : defaults.audioNavVolume;
    const audioNavVolume = Math.max(0, Math.min(1, Math.round(rawVolume * 100) / 100));

    const audioNavMuted =
      typeof parsed.audioNavMuted === 'boolean'
        ? parsed.audioNavMuted
        : defaults.audioNavMuted;

    const selectedAudioPack =
      typeof parsed.selectedAudioPack === 'string' && parsed.selectedAudioPack.trim().length > 0
        ? parsed.selectedAudioPack.trim()
        : defaults.selectedAudioPack;

    return {
      ...defaults,
      ...parsed,
      headTrackingEnabled,
      audioNavEnabled,
      audioNavVolume,
      audioNavMuted,
      selectedAudioPack,
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: GameSettings): void {
  if (!isBrowser()) return;
  try {
    const toSave: GameSettings = {
      ...settings,
      selectedAudioPack:
        typeof settings.selectedAudioPack === 'string' && settings.selectedAudioPack.trim().length > 0
          ? settings.selectedAudioPack.trim()
          : 'classic',
    };
    localStorage.setItem(
      GAME_CONFIG.storageKeys.settings,
      JSON.stringify(toSave)
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
