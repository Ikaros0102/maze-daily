import React from 'react';
import { GAME_CONFIG } from '../config/gameConfig';
import { TRANSLATIONS } from '../utils/i18n';
import type { LanguageMode } from '../types/game';

interface FooterProps {
  lang: LanguageMode;
  isDarkTheme: boolean;
}

export const Footer: React.FC<FooterProps> = ({ lang, isDarkTheme }) => {
  const t = TRANSLATIONS[lang];

  return (
    <footer
      style={{
        padding: '12px 20px',
        fontSize: '12px',
        color: 'var(--muted)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        background: 'transparent',
        borderTop: '1px solid var(--glass-border)',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            display: 'inline-block',
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: isDarkTheme ? 'var(--accent-green)' : '#0d9488',
            boxShadow: isDarkTheme ? '0 0 8px var(--accent-green)' : 'none',
          }}
        />
        <span>{t.privacyNote}</span>
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <span>Engine: {GAME_CONFIG.version}</span>
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          style={{
            color: 'var(--text)',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          GitHub ↗
        </a>
      </div>
    </footer>
  );
};
