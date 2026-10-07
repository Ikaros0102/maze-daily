import React from 'react';
import { CameraOff, Gamepad2, Keyboard } from 'lucide-react';
import { ModalWrapper } from './ModalWrapper';
import { TRANSLATIONS } from '../../utils/i18n';
import type { LanguageMode } from '../../types/game';
import type { CameraErrorCode } from '../../modules/headTracking/types';

export interface CameraErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorCode: CameraErrorCode | string | null;
  errorMessage?: string | null;
  isDarkTheme: boolean;
  lang: LanguageMode;
}

export const CameraErrorModal: React.FC<CameraErrorModalProps> = ({
  isOpen,
  onClose,
  errorCode,
  errorMessage,
  isDarkTheme,
  lang,
}) => {
  const t = TRANSLATIONS[lang];

  let explanation = t.cameraGenericError;
  if (errorCode === 'NOT_ALLOWED') {
    explanation = t.cameraDenied;
  } else if (errorCode === 'NOT_FOUND') {
    explanation = t.cameraNotFound;
  } else if (errorMessage) {
    if (errorMessage.toLowerCase().includes('denied') || errorMessage.toLowerCase().includes('notallowed')) {
      explanation = t.cameraDenied;
    } else if (errorMessage.toLowerCase().includes('notfound') || errorMessage.toLowerCase().includes('not found')) {
      explanation = t.cameraNotFound;
    }
  }

  return (
    <ModalWrapper
      title={t.cameraErrorTitle}
      isOpen={isOpen}
      onClose={onClose}
      isDarkTheme={isDarkTheme}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>
        {/* Error Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: '14px',
            borderRadius: 10,
            background: 'rgba(255, 92, 92, 0.12)',
            border: '1px solid rgba(255, 92, 92, 0.3)',
            color: 'var(--text)',
          }}
        >
          <CameraOff size={24} color="#ff5c5c" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#ff5c5c' }}>
              {t.cameraErrorTitle}
            </span>
            <span style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--text)' }}>
              {explanation}
            </span>
          </div>
        </div>

        {/* Fallback Suggestions */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '12px 14px',
            borderRadius: 10,
            background: isDarkTheme ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
            border: '1px solid var(--glass-border)',
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--accent-cyan, #43d9df)',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {t.alternativeControls}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
            <Keyboard size={16} color="var(--accent-green, #43dfb5)" />
            <span>{t.desktopControls}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
            <Gamepad2 size={16} color="var(--accent-purple, #b388ff)" />
            <span>{t.mobileControls}</span>
          </div>
        </div>

        {/* Dismiss Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            className="glass-btn"
            style={{
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text)',
            }}
          >
            {t.close}
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
};
