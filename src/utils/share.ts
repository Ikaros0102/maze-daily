import { formatTime } from './i18n';
import type { EffectType, LanguageMode, RunRecord } from '../types/game';

interface ShareOptions {
  dayNumber: number;
  record: RunRecord;
  effectName: string;
  effectIcon: string;
  lang: LanguageMode;
}

export function generateShareText({
  dayNumber,
  record,
  effectName,
  effectIcon,
}: ShareOptions): string {
  const timeStr = formatTime(record.durationMs);

  // Generate split badges
  const splitBadges = record.splits.map((s, idx) => {
    if (idx === record.splits.length - 1) return '🏁';
    return s > 0 ? '🟢' : '🟡';
  }).join(' ');

  const effectLine = record.effect !== ('none' as EffectType)
    ? `\nMod: ${effectIcon} ${effectName}`
    : '';

  const siteUrl = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : 'https://maze-daily.app';

  return `DailyMaze #${dayNumber} ⏱️ ${timeStr}\nSplits: ${splitBadges}${effectLine}\n${siteUrl}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }

  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    return true;
  } catch {
    return false;
  }
}
