import React, { useState } from 'react';
import { AVAILABLE_EFFECTS } from '../../config/gameConfig';
import { TRANSLATIONS } from '../../utils/i18n';
import { ModalWrapper } from './ModalWrapper';
import type { DailyEffectState, LanguageMode } from '../../types/game';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  effect: DailyEffectState;
  lang: LanguageMode;
  isDarkTheme: boolean;
}

export const HelpModal: React.FC<HelpModalProps> = ({
  isOpen,
  onClose,
  effect,
  lang,
  isDarkTheme,
}) => {
  const t = TRANSLATIONS[lang];
  const [isTouchDevice] = useState(
    () => typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
  );

  const effectMeta = AVAILABLE_EFFECTS.find((e) => e.type === effect.type);
  const effectDesc = t.effects[effect.type]?.desc || '';

  const sectionStyle: React.CSSProperties = {
    background: isDarkTheme ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
    border: '1px solid var(--glass-border)',
    borderRadius: 10,
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  };

  return (
    <ModalWrapper title={t.help} isOpen={isOpen} onClose={onClose} isDarkTheme={isDarkTheme}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Controls */}
        <div style={sectionStyle}>
          <div style={{ fontWeight: 700, fontSize: 13, color: isDarkTheme ? 'var(--accent-blue)' : '#2563eb' }}>
            🎮 {isTouchDevice ? 'Mobile Controls' : 'Desktop Controls'}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--muted)' }}>
            {isTouchDevice ? t.mobileControls : t.desktopControls}
          </div>
        </div>

        {/* Daily Modifier */}
        {effect.enabled && effectMeta && (
          <div style={sectionStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{effectMeta.icon}</span>
              <span>{t.todayModifier}: {t.effects[effect.type]?.name}</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--muted)' }}>
              {effectDesc}
            </div>
          </div>
        )}

        {/* Speedrun Splits */}
        <div style={sectionStyle}>
          <div style={{ fontWeight: 700, fontSize: 13, color: isDarkTheme ? 'var(--accent-green)' : '#0d9488' }}>
            ⏱️ {t.splitsTitle}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--muted)' }}>
            {lang === 'ru'
              ? 'Проходите контрольные точки (25%, 50%, 75%) строго по очереди и соревнуйтесь со своим лучшим временем!'
              : 'Pass checkpoints (25%, 50%, 75%) strictly in order to compete against your personal best!'}
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
};
