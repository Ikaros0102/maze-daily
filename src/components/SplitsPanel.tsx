import React from 'react';
import { formatDelta, formatTime, TRANSLATIONS } from '../utils/i18n';
import type { LanguageMode, SplitCheckpoint } from '../types/game';

interface SplitsPanelProps {
  checkpoints: SplitCheckpoint[];
  elapsedMs: number;
  lang: LanguageMode;
  isDarkTheme: boolean;
  isMobileOverlay?: boolean;
}

const SPLIT_ICONS = ['🟢', '🔵', '🟣', '🏁'];

export const SplitsPanel: React.FC<SplitsPanelProps> = ({
  checkpoints,
  elapsedMs,
  lang,
  isDarkTheme,
  isMobileOverlay = false,
}) => {
  const t = TRANSLATIONS[lang];
  const activeIdx = checkpoints.findIndex((cp) => cp.reachedTimeMs === null);

  const getSplitLabel = (ratio: number) => {
    if (ratio === 0.25) return t.split25;
    if (ratio === 0.5) return t.split50;
    if (ratio === 0.75) return t.split75;
    return t.splitFinish;
  };

  return (
    <div
      className="glass-panel"
      style={{
        padding: isMobileOverlay ? '8px 12px' : '14px 16px',
        minWidth: isMobileOverlay ? 150 : 220,
        position: isMobileOverlay ? 'absolute' : 'relative',
        top: isMobileOverlay ? 10 : undefined,
        right: isMobileOverlay ? 10 : undefined,
        zIndex: 10,
        pointerEvents: isMobileOverlay ? 'none' : 'auto',
      }}
    >
      <div style={{ position: 'relative', zIndex: 2 }}>
        {!isMobileOverlay && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.8,
              color: 'var(--muted)',
            }}
          >
            <span>{t.splitsTitle}</span>
            <span style={{ fontSize: 10, opacity: 0.6 }}>⏱️</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobileOverlay ? 4 : 7 }}>
          {checkpoints.map((cp, idx) => {
            const isDone = cp.reachedTimeMs !== null;
            const isActive = idx === activeIdx && elapsedMs > 0;
            const displayTime = isDone ? cp.reachedTimeMs : isActive ? elapsedMs : null;
            const delta = isDone
              ? formatDelta(cp.reachedTimeMs, cp.pbTimeMs)
              : isActive
              ? formatDelta(elapsedMs, cp.pbTimeMs)
              : null;

            return (
              <div
                key={cp.id}
                className={isActive ? 'active-split-glow' : undefined}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: isMobileOverlay ? 11 : 12.5,
                  fontWeight: isActive ? 700 : 500,
                  color: isDone
                    ? 'var(--text)'
                    : isActive
                    ? (isDarkTheme ? 'var(--accent-green)' : '#0d9488')
                    : 'var(--muted)',
                  transition: 'color 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10 }}>{SPLIT_ICONS[idx] || '•'}</span>
                  <span>{getSplitLabel(cp.ratio)}</span>
                </div>

                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span>{displayTime !== null ? formatTime(displayTime) : t.notReached}</span>
                  {delta && (
                    <span
                      style={{
                        fontSize: isMobileOverlay ? 10 : 11,
                        fontWeight: 800,
                        color: delta.isFaster ? (isDarkTheme ? 'var(--accent-green)' : '#0d9488') : '#f43f5e',
                      }}
                    >
                      {delta.text}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
