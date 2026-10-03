import React from 'react';
import { GAME_CONFIG } from '../../config/gameConfig';
import { LANGUAGE_OPTIONS, TRANSLATIONS } from '../../utils/i18n';
import { ModalWrapper } from './ModalWrapper';
import type { GameSettings, LanguageMode } from '../../types/game';

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
          <div style={btnGroupStyle} role="group" aria-label={t.theme}>
            <button
              onClick={() => onUpdateSettings({ ...settings, theme: 'dark' })}
              style={getToggleBtnStyle(settings.theme === 'dark')}
              aria-pressed={settings.theme === 'dark'}
            >
              {t.darkTheme}
            </button>
            <button
              onClick={() => onUpdateSettings({ ...settings, theme: 'light' })}
              style={getToggleBtnStyle(settings.theme === 'light')}
              aria-pressed={settings.theme === 'light'}
            >
              {t.lightTheme}
            </button>
          </div>
        </div>

        {/* Language */}
        <div style={rowStyle}>
          <label htmlFor="settings-language" style={{ fontSize: 14, fontWeight: 500 }}>
            {t.language}
          </label>
          <select
            id="settings-language"
            value={settings.lang}
            onChange={(e) => onUpdateSettings({ ...settings, lang: e.target.value as LanguageMode })}
            aria-label={t.language}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              background: isDarkTheme ? '#0d1420' : '#ffffff',
              color: 'var(--text)',
              border: '1px solid var(--glass-border)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label} ({opt.code.toUpperCase()})
              </option>
            ))}
          </select>
        </div>

        {/* Show Splits Toggle */}
        <div style={rowStyle}>
          <label htmlFor="settings-show-splits" style={{ fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            {t.showSplits}
          </label>
          <input
            id="settings-show-splits"
            type="checkbox"
            checked={settings.showSplits}
            aria-checked={settings.showSplits}
            onChange={(e) => onUpdateSettings({ ...settings, showSplits: e.target.checked })}
            style={{ width: 20, height: 20, cursor: 'pointer', accentColor: '#00f0b5' }}
          />
        </div>

        {/* Show Controls Widget Toggle */}
        <div style={rowStyle}>
          <label htmlFor="settings-show-controls" style={{ fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            {t.showControls}
          </label>
          <input
            id="settings-show-controls"
            type="checkbox"
            checked={settings.showControls}
            aria-checked={settings.showControls}
            onChange={(e) => onUpdateSettings({ ...settings, showControls: e.target.checked })}
            style={{ width: 20, height: 20, cursor: 'pointer', accentColor: '#00f0b5' }}
          />
        </div>

        {/* Firefly Color */}
        <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'flex-start', gap: 10, borderBottom: 'none' }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{t.fireflyColor}</span>
          <div style={{ display: 'flex', gap: 10 }} role="group" aria-label={t.fireflyColor}>
            {GAME_CONFIG.player.colorPalette.map((col) => (
              <button
                key={col}
                onClick={() => onUpdateSettings({ ...settings, playerColor: col })}
                aria-label={`Select firefly color ${col}`}
                aria-pressed={settings.playerColor === col}
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
