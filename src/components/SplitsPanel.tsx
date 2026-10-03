import React from 'react';
import { formatDelta, formatTime, TRANSLATIONS } from '../utils/i18n';
import type { LanguageMode, SplitCheckpoint } from '../types/game';

interface SplitsPanelProps {
  checkpoints: SplitCheckpoint[];
  elapsedMs: number;
  lang: LanguageMode;
  isDarkTheme: boolean;
  isMobile?: boolean;
}

const SPLIT_ICONS = ['🟢', '🔵', '🟣', '🏁'];

export const SplitsPanel: React.FC<SplitsPanelProps> = ({
  checkpoints,
  elapsedMs,
  lang,
  isDarkTheme,
  isMobile = false,
}) => {
  const t = TRANSLATIONS[lang];
  const activeIdx = checkpoints.findIndex((cp) => cp.reachedTimeMs === null);

  const getSplitLabel = (ratio: number) => {
    if (ratio === 0.25) return t.split25;
    if (ratio === 0.5) return t.split50;
    if (ratio === 0.75) return t.split75;
    return t.splitFinish;
  };

  const getShortSplitLabel = (ratio: number) => {
    if (ratio === 0.25) return '25%';
    if (ratio === 0.5) return '50%';
    if (ratio === 0.75) return '75%';
    return t.splitFinish;
  };

  if (isMobile) {
    return (
      <section
        role="region"
        aria-label={t.splitsTitle}
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: 'min(85vh, 85vw, 1000px)',
          padding: '6px 10px',
          boxSizing: 'border-box',
          marginBottom: 6,
        }}
      >
        <div
          role="list"
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 6,
            alignItems: 'center',
          }}
        >
          {checkpoints.map((cp, idx) => {
            const isDone = cp.reachedTimeMs !== null;
            const isActive = idx === activeIdx && elapsedMs > 0;
            const displayTime = isDone ? cp.reachedTimeMs : isActive ? elapsedMs : null;
            const delta = isDone
              ? formatDelta(cp.reachedTimeMs, cp.pbTimeMs)
              : isActive
              ? formatDelta(elapsedMs, cp.pbTimeMs)
              : null;
            const label = getShortSplitLabel(cp.ratio);
            const fullLabel = getSplitLabel(cp.ratio);
            const timeAria = displayTime !== null ? formatTime(displayTime) : t.notReached;

            return (
              <div
                key={cp.id}
                role="listitem"
                aria-label={`${fullLabel}: ${timeAria}${delta ? ', ' + delta.text : ''}`}
                className={isActive ? 'active-split-glow' : undefined}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '3px 4px',
                  borderRadius: 6,
                  background: isActive
                    ? (isDarkTheme ? 'rgba(67, 223, 181, 0.1)' : 'rgba(13, 148, 136, 0.08)')
                    : 'transparent',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: isActive ? 700 : 500,
                  color: isDone
                    ? 'var(--text)'
                    : isActive
                    ? (isDarkTheme ? 'var(--accent-green)' : '#0d9488')
                    : 'var(--muted)',
                  textAlign: 'center',
                  minWidth: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, whiteSpace: 'nowrap' }}>
                  <span aria-hidden="true" style={{ fontSize: 9 }}>{SPLIT_ICONS[idx] || '•'}</span>
                  <span style={{ fontWeight: 600 }}>{label}</span>
                </div>
                <div style={{ fontSize: 10.5, letterSpacing: -0.2, marginTop: 1, whiteSpace: 'nowrap' }}>
                  {timeAria}
                </div>
                {delta ? (
                  <div
                    style={{
                      fontSize: 9.5,
                      fontWeight: 800,
                      color: delta.isFaster ? (isDarkTheme ? 'var(--accent-green)' : '#0d9488') : '#f43f5e',
                    }}
                  >
                    {delta.text}
                  </div>
                ) : (
                  <div style={{ height: 12 }} />
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section
      role="region"
      aria-label={t.splitsTitle}
      className="glass-panel"
      style={{
        padding: '14px 16px',
        minWidth: 220,
        position: 'relative',
        zIndex: 10,
      }}
    >
      <div style={{ position: 'relative', zIndex: 2 }}>
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
          <span aria-hidden="true" style={{ fontSize: 10, opacity: 0.6 }}>⏱️</span>
        </div>

        <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {checkpoints.map((cp, idx) => {
            const isDone = cp.reachedTimeMs !== null;
            const isActive = idx === activeIdx && elapsedMs > 0;
            const displayTime = isDone ? cp.reachedTimeMs : isActive ? elapsedMs : null;
            const delta = isDone
              ? formatDelta(cp.reachedTimeMs, cp.pbTimeMs)
              : isActive
              ? formatDelta(elapsedMs, cp.pbTimeMs)
              : null;
            const fullLabel = getSplitLabel(cp.ratio);
            const timeAria = displayTime !== null ? formatTime(displayTime) : t.notReached;

            return (
              <div
                key={cp.id}
                role="listitem"
                aria-label={`${fullLabel}: ${timeAria}${delta ? ', ' + delta.text : ''}`}
                className={isActive ? 'active-split-glow' : undefined}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12.5,
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
                  <span aria-hidden="true" style={{ fontSize: 10 }}>{SPLIT_ICONS[idx] || '•'}</span>
                  <span>{fullLabel}</span>
                </div>

                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span>{timeAria}</span>
                  {delta && (
                    <span
                      style={{
                        fontSize: 11,
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
    </section>
  );
};
