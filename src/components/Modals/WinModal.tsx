import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { AVAILABLE_EFFECTS } from '../../config/gameConfig';
import { formatDelta, formatTime, TRANSLATIONS } from '../../utils/i18n';
import { copyToClipboard, generateShareText } from '../../utils/share';
import { ModalWrapper } from './ModalWrapper';
import type { LanguageMode, RunRecord, SplitCheckpoint } from '../../types/game';

interface WinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestart: () => void;
  record: RunRecord | null;
  checkpoints: SplitCheckpoint[];
  isNewPB: boolean;
  dayNumber: number;
  lang: LanguageMode;
  isDarkTheme: boolean;
}

export const WinModal: React.FC<WinModalProps> = ({
  isOpen,
  onClose,
  onRestart,
  record,
  checkpoints,
  isNewPB,
  dayNumber,
  lang,
  isDarkTheme,
}) => {
  const t = TRANSLATIONS[lang];
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }, [isOpen]);

  if (!record) return null;

  const handleShare = async () => {
    const effectMeta = AVAILABLE_EFFECTS.find((e) => e.type === record.effect);
    const text = generateShareText({
      dayNumber,
      record,
      effectName: t.effects[record.effect]?.name || record.effect,
      effectIcon: effectMeta?.icon || '⚡',
      lang,
    });
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <ModalWrapper title={t.winTitle} isOpen={isOpen} onClose={onClose} isDarkTheme={isDarkTheme}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center' }}>
        {isNewPB && (
          <div style={{ fontSize: 13, fontWeight: 800, color: '#f59e0b', letterSpacing: 1 }}>
            🎉 {t.newPB}
          </div>
        )}

        <div style={{ fontSize: 36, fontWeight: 800, fontFamily: 'var(--font-mono)', color: isDarkTheme ? 'var(--accent-green)' : '#0d9488' }}>
          {formatTime(record.durationMs)}
        </div>

        {/* Splits review */}
        <div
          style={{
            background: isDarkTheme ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
            border: '1px solid var(--glass-border)',
            borderRadius: 10,
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {checkpoints.map((cp) => {
            const delta = formatDelta(cp.reachedTimeMs, cp.pbTimeMs);
            const label = cp.ratio === 1.0 ? t.splitFinish : `${Math.round(cp.ratio * 100)}%`;
            return (
              <div
                key={cp.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  color: 'var(--text)',
                }}
              >
                <span>{label}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span>{formatTime(cp.reachedTimeMs)}</span>
                  {delta && (
                    <span style={{ fontWeight: 700, color: delta.isFaster ? (isDarkTheme ? 'var(--accent-green)' : '#0d9488') : '#f43f5e' }}>
                      {delta.text}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            onClick={handleShare}
            style={{
              flex: 1,
              padding: '10px 0',
              background: 'var(--accent-green)',
              color: '#070b12',
              border: 'none',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {copied ? t.copied : `📤 ${t.share}`}
          </button>
          <button
            onClick={() => {
              onClose();
              onRestart();
            }}
            className="glass-btn"
            style={{
              flex: 1,
              padding: '10px 0',
              color: 'var(--text)',
              border: '1px solid var(--glass-border)',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            🔄 {t.restart}
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
};
