import React from 'react';
import { BarChart2, HelpCircle, RotateCcw, Settings } from 'lucide-react';
import { AVAILABLE_EFFECTS } from '../config/gameConfig';
import { formatTime, TRANSLATIONS } from '../utils/i18n';
import type { DailyEffectState, LanguageMode } from '../types/game';

interface HeaderProps {
  dayNumber: number;
  elapsedMs: number;
  effect: DailyEffectState;
  lang: LanguageMode;
  isDarkTheme: boolean;
  onRestart: () => void;
  onOpenHelp: () => void;
  onOpenStats: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  dayNumber,
  elapsedMs,
  effect,
  lang,
  isDarkTheme,
  onRestart,
  onOpenHelp,
  onOpenStats,
  onOpenSettings,
}) => {
  const t = TRANSLATIONS[lang];
  const effectMeta = AVAILABLE_EFFECTS.find((e) => e.type === effect.type);
  const effectName = t.effects[effect.type]?.name || effect.type;

  const btnStyle: React.CSSProperties = {
    color: 'var(--text)',
    padding: '7px 11px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <header
      role="banner"
      className="glass-panel"
      style={{
        width: '100%',
        boxSizing: 'border-box',
        position: 'sticky',
        top: 10,
        zIndex: 20,
      }}
    >
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          gap: 12,
          flexWrap: 'wrap',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: -0.4, color: 'var(--text)' }}>
            {t.appTitle}
          </h1>
          <span
            className="glass-pill"
            aria-label={`${t.dayLabel} ${dayNumber}`}
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 10px',
              color: isDarkTheme ? 'var(--accent-green)' : '#0d9488',
            }}
          >
            #{dayNumber}
          </span>
          {effect.enabled && effectMeta && (
            <span
              className="glass-pill"
              role="status"
              aria-label={`${t.todayModifier}: ${effectName}. ${t.effects[effect.type]?.desc || ''}`}
              style={{
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 10px',
                color: isDarkTheme ? '#c084fc' : '#9333ea',
                borderColor: isDarkTheme ? 'rgba(168, 85, 247, 0.35)' : 'rgba(168, 85, 247, 0.25)',
              }}
              title={t.effects[effect.type]?.desc}
            >
              <span aria-hidden="true">{effectMeta.icon}</span>
              <span style={{ fontWeight: 600 }}>{effectName}</span>
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            role="timer"
            aria-live="off"
            aria-label={`${t.timer}: ${formatTime(elapsedMs)}`}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 20,
              fontWeight: 800,
              color: isDarkTheme ? '#43dfb5' : '#0d9488',
              textShadow: isDarkTheme ? '0 0 20px rgba(67, 223, 181, 0.2)' : 'none',
              minWidth: 95,
              textAlign: 'center',
              letterSpacing: 0.5,
            }}
          >
            {formatTime(elapsedMs)}
          </div>

          <button
            onClick={onRestart}
            className="glass-btn"
            style={btnStyle}
            title={t.restart}
            aria-label={t.restart}
          >
            <RotateCcw size={15} aria-hidden="true" />
          </button>
          <button
            onClick={onOpenHelp}
            className="glass-btn"
            style={btnStyle}
            title={t.help}
            aria-label={t.help}
          >
            <HelpCircle size={15} aria-hidden="true" />
          </button>
          <button
            onClick={onOpenStats}
            className="glass-btn"
            style={btnStyle}
            title={t.stats}
            aria-label={t.stats}
          >
            <BarChart2 size={15} aria-hidden="true" />
          </button>
          <button
            onClick={onOpenSettings}
            className="glass-btn"
            style={btnStyle}
            title={t.settings}
            aria-label={t.settings}
          >
            <Settings size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
};
