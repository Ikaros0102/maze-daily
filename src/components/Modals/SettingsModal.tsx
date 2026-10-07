import React from 'react';
import { Crosshair, Volume2, VolumeX } from 'lucide-react';
import { GAME_CONFIG } from '../../config/gameConfig';
import { LANGUAGE_OPTIONS, TRANSLATIONS, type TranslationContent } from '../../utils/i18n';
import { ModalWrapper } from './ModalWrapper';
import { DEFAULT_AUDIO_PACK_ID, getAudioPackList, type AudioPack } from '../../config/audioPacks';
import type { GameSettings, LanguageMode } from '../../types/game';

function getLocalizedPackName(t: TranslationContent, pack?: AudioPack | null): string {
  if (!pack) return '';
  const val = t[pack.nameKey as keyof TranslationContent];
  return typeof val === 'string' ? val : pack.id;
}

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: GameSettings;
  onUpdateSettings: (next: GameSettings) => void;
  isDarkTheme: boolean;
  isDesktop?: boolean;
  onToggleHeadTracking?: (enabled: boolean) => void;
  onRecalibrateHeadTracking?: () => void;
  onToggleAudioNav?: (enabled: boolean) => void;
  onSelectAudioPack?: (packId: string) => Promise<boolean>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  isDarkTheme,
  isDesktop = true,
  onToggleHeadTracking,
  onRecalibrateHeadTracking,
  onToggleAudioNav,
  onSelectAudioPack,
}) => {
  const t = TRANSLATIONS[settings.lang];
  const [isSwitchingPack, setIsSwitchingPack] = React.useState(false);

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

  const handleHeadTrackingToggle = (checked: boolean) => {
    if (onToggleHeadTracking) {
      onToggleHeadTracking(checked);
    } else {
      onUpdateSettings({ ...settings, headTrackingEnabled: checked });
    }
  };

  const handleAudioNavToggle = (checked: boolean) => {
    if (onToggleAudioNav) {
      onToggleAudioNav(checked);
    } else {
      onUpdateSettings({ ...settings, audioNavEnabled: checked });
    }
  };

  const handleAudioPackChange = async (packId: string) => {
    if (packId === (settings.selectedAudioPack || DEFAULT_AUDIO_PACK_ID)) {
      return;
    }

    if (onSelectAudioPack) {
      setIsSwitchingPack(true);
      try {
        await onSelectAudioPack(packId);
      } finally {
        setIsSwitchingPack(false);
      }
    } else {
      onUpdateSettings({ ...settings, selectedAudioPack: packId });
    }
  };

  return (
    <ModalWrapper title={t.settings} isOpen={isOpen} onClose={onClose} isDarkTheme={isDarkTheme}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Theme Selection */}
        <div style={rowStyle}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{t.theme}</span>
          <div style={btnGroupStyle} role="group" aria-label={t.theme}>
            <button
              type="button"
              onClick={() => onUpdateSettings({ ...settings, theme: 'dark' })}
              style={getToggleBtnStyle(settings.theme === 'dark')}
              aria-pressed={settings.theme === 'dark'}
            >
              {t.darkTheme}
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ ...settings, theme: 'light' })}
              style={getToggleBtnStyle(settings.theme === 'light')}
              aria-pressed={settings.theme === 'light'}
            >
              {t.lightTheme}
            </button>
          </div>
        </div>

        {/* Language Selection */}
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

        {/* Display Toggles */}
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

        {/* Accessibility Section */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            color: 'var(--muted)',
            marginTop: 12,
            marginBottom: 2,
          }}
        >
          {t.accessibility}
        </div>

        {/* Head Tracking Toggle */}
        <div style={rowStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: '78%' }}>
            <label htmlFor="settings-head-tracking" style={{ fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
              {t.headTracking}
            </label>
            <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.3 }}>
              {t.headTrackingDesc}
            </span>
          </div>
          <input
            id="settings-head-tracking"
            type="checkbox"
            checked={Boolean(settings.headTrackingEnabled)}
            aria-checked={Boolean(settings.headTrackingEnabled)}
            onChange={(e) => handleHeadTrackingToggle(e.target.checked)}
            style={{ width: 20, height: 20, cursor: 'pointer', accentColor: '#00f0b5', flexShrink: 0 }}
          />
        </div>

        {/* Recalibrate Button (shown when Head Tracking is enabled) */}
        {settings.headTrackingEnabled && (
          <div style={{ ...rowStyle, justifyContent: 'space-between', paddingTop: 4, paddingBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {t.calibrationTitle}
            </span>
            <button
              type="button"
              onClick={() => onRecalibrateHeadTracking?.()}
              className="glass-btn"
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Crosshair size={14} aria-hidden="true" />
              {t.headTrackingRecalibrate}
            </button>
          </div>
        )}

        {/* Audio Navigation Toggle */}
        <div style={rowStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: '78%' }}>
            <label htmlFor="settings-audio-nav" style={{ fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
              {t.audioNav}
            </label>
            <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.3 }}>
              {t.audioNavDesc}
            </span>
          </div>
          <input
            id="settings-audio-nav"
            type="checkbox"
            checked={Boolean(settings.audioNavEnabled)}
            aria-checked={Boolean(settings.audioNavEnabled)}
            onChange={(e) => handleAudioNavToggle(e.target.checked)}
            style={{ width: 20, height: 20, cursor: 'pointer', accentColor: '#00f0b5', flexShrink: 0 }}
          />
        </div>

        {/* Audio Navigation Section */}
        {settings.audioNavEnabled && (
          <>
            {/* Sound Pack Selector */}
            <div style={rowStyle}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: '78%' }}>
                <label htmlFor="settings-audio-pack" style={{ fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                  {t.soundPack}
                </label>
                <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.3 }}>
                  {t.soundPackDesc}
                </span>
              </div>
              <select
                id="settings-audio-pack"
                value={settings.selectedAudioPack || DEFAULT_AUDIO_PACK_ID}
                onChange={(e) => handleAudioPackChange(e.target.value)}
                disabled={isSwitchingPack}
                aria-label={t.soundPack}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  background: isDarkTheme ? '#0d1420' : '#ffffff',
                  color: 'var(--text)',
                  border: '1px solid var(--glass-border)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: isSwitchingPack ? 'not-allowed' : 'pointer',
                  outline: 'none',
                  opacity: isSwitchingPack ? 0.6 : 1,
                }}
              >
                {getAudioPackList().map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {getLocalizedPackName(t, pack)}
                  </option>
                ))}
              </select>
            </div>

            {/* Audio Navigation Volume Slider & Mute Toggle */}
            <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: '10px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="settings-audio-nav-volume" style={{ fontSize: 13, fontWeight: 500 }}>
                  {t.audioNavVolume}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                    {settings.audioNavMuted ? t.muted : `${Math.round((settings.audioNavVolume ?? 0.8) * 100)}%`}
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ ...settings, audioNavMuted: !settings.audioNavMuted })}
                    className="glass-btn"
                    aria-label={settings.audioNavMuted ? t.unmute : t.mute}
                    aria-pressed={settings.audioNavMuted}
                    style={{
                      padding: '4px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: settings.audioNavMuted ? '#ff5c5c' : 'var(--text)',
                    }}
                  >
                    {settings.audioNavMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  </button>
                </div>
              </div>

              <input
                id="settings-audio-nav-volume"
                type="range"
                min={0}
                max={1}
                step="any"
                value={settings.audioNavVolume ?? 0.8}
                disabled={settings.audioNavMuted}
                aria-label={t.audioNavVolume}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((settings.audioNavVolume ?? 0.8) * 100)}
                onChange={(e) => onUpdateSettings({ ...settings, audioNavVolume: parseFloat(e.target.value) })}
                style={{
                  width: '100%',
                  cursor: settings.audioNavMuted ? 'not-allowed' : 'pointer',
                  accentColor: '#00f0b5',
                  opacity: settings.audioNavMuted ? 0.4 : 1,
                }}
              />

              {isDesktop && (
                <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.3 }}>
                  {t.audioNavHotkeys}
                </span>
              )}
            </div>
          </>
        )}

        {/* Firefly Color Picker */}
        <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'flex-start', gap: 10, borderBottom: 'none' }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{t.fireflyColor}</span>
          <div style={{ display: 'flex', gap: 10 }} role="group" aria-label={t.fireflyColor}>
            {GAME_CONFIG.player.colorPalette.map((col) => (
              <button
                key={col}
                type="button"
                onClick={() => onUpdateSettings({ ...settings, playerColor: col })}
                aria-label={`${t.fireflyColor}: ${col}`}
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
