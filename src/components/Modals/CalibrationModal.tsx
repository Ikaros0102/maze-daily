import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, RefreshCw } from 'lucide-react';
import { ModalWrapper } from './ModalWrapper';
import { formatString, TRANSLATIONS } from '../../utils/i18n';
import type { LanguageMode } from '../../types/game';

export interface CalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: { centerX: number; centerY: number }) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isDarkTheme: boolean;
  lang: LanguageMode;
  onStartCalibration: () => Promise<{ centerX: number; centerY: number }>;
}

export const CalibrationModal: React.FC<CalibrationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  videoRef,
  isDarkTheme,
  lang,
  onStartCalibration,
}) => {
  const t = TRANSLATIONS[lang];
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [countdown, setCountdown] = useState(3);
  const [status, setStatus] = useState<'calibrating' | 'success' | 'timeout' | 'error'>('calibrating');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Synchronize stream to preview element with dynamic polling & attachment
  useEffect(() => {
    if (!isOpen) return;

    const checkAndAttach = () => {
      const sourceVideo = videoRef.current;
      const previewVideo = previewVideoRef.current;
      if (!sourceVideo || !previewVideo) return;

      if (sourceVideo.srcObject && previewVideo.srcObject !== sourceVideo.srcObject) {
        previewVideo.srcObject = sourceVideo.srcObject;
        previewVideo.play().catch(() => {});
      }
    };

    checkAndAttach();
    const intervalId = setInterval(checkAndAttach, 150);

    return () => {
      clearInterval(intervalId);
    };
  }, [isOpen, videoRef]);

  // Execute calibration session asynchronously without synchronous effect setState
  useEffect(() => {
    if (!isOpen) return;

    let isCancelled = false;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 1 ? prev - 1 : 1));
    }, 1000);

    onStartCalibration()
      .then((res) => {
        if (isCancelled) return;
        clearInterval(timer);
        setStatus('success');
        setCountdown(0);
        setTimeout(() => {
          if (!isCancelled) onSuccess(res);
        }, 500);
      })
      .catch((err) => {
        if (isCancelled) return;
        clearInterval(timer);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'CALIBRATION_TIMEOUT') {
          setStatus('timeout');
        } else {
          setStatus('error');
          setErrorMessage(msg);
        }
      });

    return () => {
      isCancelled = true;
      clearInterval(timer);
    };
  }, [isOpen, retryKey, onStartCalibration, onSuccess]);

  const handleRetry = () => {
    setStatus('calibrating');
    setCountdown(3);
    setErrorMessage(null);
    setRetryKey((prev) => prev + 1);
  };

  return (
    <ModalWrapper
      title={t.calibrationTitle}
      isOpen={isOpen}
      onClose={onClose}
      isDarkTheme={isDarkTheme}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        {/* Screen Reader Announcement */}
        <div className="sr-only" role="status" aria-live="assertive" aria-atomic="true">
          {status === 'calibrating'
            ? formatString(t.calibrationCountdown, { seconds: countdown })
            : status === 'success'
            ? t.calibrationSuccess
            : status === 'timeout'
            ? t.calibrationTimeout
            : (errorMessage || 'Calibration error occurred.')}
        </div>

        {/* Video Preview with Circular Targeting Reticle */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 320,
            height: 240,
            borderRadius: 12,
            overflow: 'hidden',
            background: '#000000',
            border: '2px solid var(--glass-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <video
            ref={previewVideoRef}
            playsInline
            muted
            autoPlay
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: 'scaleX(-1)', // Mirrored selfie perspective
            }}
          />

          {/* Targeting Crosshair / Reticle Overlay */}
          <div
            style={{
              position: 'absolute',
              width: 130,
              height: 130,
              borderRadius: '50%',
              border: `2px dashed ${status === 'success' ? '#43dfb5' : status === 'timeout' ? '#ff5c5c' : '#43d9df'}`,
              boxShadow: `0 0 20px ${status === 'success' ? 'rgba(67, 223, 181, 0.5)' : 'rgba(67, 217, 223, 0.4)'}`,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
            }}
          >
            {status === 'calibrating' && (
              <span
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 38,
                  fontWeight: 800,
                  color: '#ffffff',
                  textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                }}
              >
                {countdown}
              </span>
            )}
            {status === 'success' && <Check size={48} color="#43dfb5" />}
            {status === 'timeout' && <AlertTriangle size={36} color="#ff5c5c" />}
          </div>
        </div>

        {/* Guidance / Status Text */}
        <p
          style={{
            margin: 0,
            fontSize: 13,
            textAlign: 'center',
            color: status === 'timeout' ? '#ff5c5c' : 'var(--text)',
            lineHeight: 1.4,
          }}
        >
          {status === 'calibrating' && t.calibrationPrompt}
          {status === 'success' && t.calibrationSuccess}
          {status === 'timeout' && t.calibrationTimeout}
          {status === 'error' && (errorMessage || 'Calibration error occurred.')}
        </p>

        {/* Footer Actions */}
        <div style={{ display: 'flex', gap: 10, width: '100%', justifyContent: 'flex-end', marginTop: 4 }}>
          {status === 'timeout' && (
            <button
              type="button"
              onClick={handleRetry}
              className="glass-btn"
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <RefreshCw size={14} />
              {t.calibrationRetry}
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="glass-btn"
            style={{
              padding: '8px 16px',
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
