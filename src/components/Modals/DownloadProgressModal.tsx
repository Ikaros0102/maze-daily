import React, { useMemo } from 'react';
import { AlertCircle, DownloadCloud } from 'lucide-react';
import { ModalWrapper } from './ModalWrapper';
import { formatString, TRANSLATIONS } from '../../utils/i18n';
import type { LanguageMode } from '../../types/game';

export interface DownloadProgressModalProps {
  isOpen: boolean;
  moduleName?: 'headTracking' | 'audioNav' | string | null;
  packName?: string;
  progress: number; // 0 to 100
  onCancel: () => void;
  isDarkTheme: boolean;
  lang: LanguageMode;
  error?: string | null;
}

export const DownloadProgressModal: React.FC<DownloadProgressModalProps> = ({
  isOpen,
  moduleName,
  packName,
  progress,
  onCancel,
  isDarkTheme,
  lang,
  error,
}) => {
  const t = TRANSLATIONS[lang];

  const moduleLabel =
    packName ||
    (moduleName === 'headTracking'
      ? t.headTracking
      : t.audioNav);

  // Milestone-throttled announcements (0, 25, 50, 75, 100)
  const currentMilestone = useMemo(() => {
    const milestones = [0, 25, 50, 75, 100];
    const rounded = Math.floor(progress);
    return milestones.reduce((prev, curr) => (rounded >= curr ? curr : prev), 0);
  }, [progress]);

  const isError = error !== undefined && error !== null;
  const errorText = isError ? (error.trim().length > 0 ? error : t.downloadFailed) : null;

  const announcement = useMemo(() => {
    if (isError && errorText) return errorText;
    if (currentMilestone === 100) return t.downloadComplete;
    return formatString(t.downloadingProgress, {
      module: moduleLabel,
      percent: currentMilestone,
    });
  }, [isError, errorText, currentMilestone, moduleLabel, t]);

  const clampedProgress = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <ModalWrapper
      title={packName || (moduleName === 'headTracking' ? t.headTracking : t.audioNav)}
      isOpen={isOpen}
      onClose={onCancel}
      isDarkTheme={isDarkTheme}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>
        {/* Screen Reader Announcements */}
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>

        {/* Module Header & Progress Percentage */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DownloadCloud size={20} color="var(--accent-cyan, #43d9df)" />
            <span style={{ fontSize: 14, fontWeight: 600 }}>{moduleLabel}</span>
          </div>
          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 15, fontWeight: 700, color: 'var(--accent-green, #43dfb5)' }}>
            {clampedProgress}%
          </span>
        </div>

        {/* Progress Bar */}
        <div
          role="progressbar"
          aria-valuenow={clampedProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${moduleLabel}: ${clampedProgress}%`}
          style={{
            width: '100%',
            height: 12,
            borderRadius: 6,
            background: isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
            overflow: 'hidden',
            border: '1px solid var(--glass-border)',
          }}
        >
          <div
            style={{
              width: `${clampedProgress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #43d9df, #43dfb5)',
              borderRadius: 6,
              transition: 'width 0.15s ease-out',
            }}
          />
        </div>

        {/* Storage Note */}
        <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>
          {t.privacyNote}
        </span>

        {/* Error Notice */}
        {isError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(255, 92, 92, 0.12)',
              border: '1px solid rgba(255, 92, 92, 0.3)',
              color: '#ff5c5c',
              fontSize: 12,
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{errorText}</span>
          </div>
        )}

        {/* Action Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            type="button"
            onClick={onCancel}
            className="glass-btn"
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text)',
            }}
          >
            {isError ? t.close : t.cancel}
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
};
