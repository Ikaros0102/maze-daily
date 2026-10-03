import React from 'react';
import { GAME_CONFIG } from '../../config/gameConfig';
import { TRANSLATIONS } from '../../utils/i18n';
import { ModalWrapper } from './ModalWrapper';
import type { GameSettings } from '../../types/game';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: GameSettings;
  onUpdateSettings: (next: GameSettings) => void;
  isDarkTheme: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  isDarkTheme,
}) => {
  const t = TRANSLATIONS[settings.lang];

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 0',
    borderBottom: '1px solid var(--glass-border)',
  };

  const btnGroupStyle: React.CSSProperties = {
    display: 'flex',
    gap: 4,
    background: isDarkTheme ? 'rgba(0, 0, 0, 0.25)' : 'rgba(0, 0, 0, 0.05)',
    padding: 3,
    borderRadius: 8,
    border: '1px solid var(--glass-border)',
  };

  const getToggleBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    background: active ? (isDarkTheme ? 'rgba(255, 255, 255, 0.12)' : '#ffffff') : 'transparent',
    color: active ? 'var(--text)' : 'var(--muted)',
    boxShadow: active ? '0 1px 3px var(--shadow)' : 'none',
  });

  return (
    <ModalWrapper title={t.settings} isOpen={isOpen} onClose={onClose} isDarkTheme={isDarkTheme}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Theme */}
        <div style={rowStyle}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{t.theme}</span>
          <div style={btnGroupStyle}>
            <button
              onClick={() => onUpdateSettings({ ...settings, theme: 'dark' })}
              style={getToggleBtnStyle(settings.theme === 'dark')}
            >
              {t.darkTheme}
            </button>
            <button
              onClick={() => onUpdateSettings({ ...settings, theme: 'light' })}
              style={getToggleBtnStyle(settings.theme === 'light')}
            >
              {t.lightTheme}
            </button>
          </div>
        </div>

        {/* Language */}
        <div style={rowStyle}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{t.language}</span>
          <div style={btnGroupStyle}>
            <button
              onClick={() => onUpdateSettings({ ...settings, lang: 'en' })}
              style={getToggleBtnStyle(settings.lang === 'en')}
            >
              EN
            </button>
            <button
              onClick={() => onUpdateSettings({ ...settings, lang: 'ru' })}
              style={getToggleBtnStyle(settings.lang === 'ru')}
            >
              RU
            </button>
          </div>
        </div>

        {/* Show Splits Toggle */}
        <div style={rowStyle}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{t.showSplits}</span>
          <input
            type="checkbox"
            checked={settings.showSplits}
            onChange={(e) => onUpdateSettings({ ...settings, showSplits: e.target.checked })}
            style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#00f0b5' }}
          />
        </div>

        {/* Firefly Color */}
        <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'flex-start', gap: 10, borderBottom: 'none' }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{t.fireflyColor}</span>
          <div style={{ display: 'flex', gap: 10 }}>
            {GAME_CONFIG.player.colorPalette.map((col) => (
              <button
                key={col}
                onClick={() => onUpdateSettings({ ...settings, playerColor: col })}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: col,
                  border: settings.playerColor === col ? '3px solid #ffffff' : '1px solid rgba(0,0,0,0.2)',
                  boxShadow: settings.playerColor === col ? `0 0 10px ${col}` : 'none',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
};
