import React, { useEffect, useId } from 'react';
import { X } from 'lucide-react';

interface ModalWrapperProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  isDarkTheme?: boolean;
  children: React.ReactNode;
}

export const ModalWrapper: React.FC<ModalWrapperProps> = ({
  title,
  isOpen,
  onClose,
  children,
}) => {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 440,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--glass-border)',
            }}
          >
            <h2
              id={titleId}
              style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: -0.3, color: 'var(--text)' }}
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              className="glass-btn"
              aria-label="Close dialog"
              style={{
                padding: '5px',
                color: 'var(--muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div style={{ padding: 20, overflowY: 'auto' }}>{children}</div>
        </div>
      </div>
    </div>
  );
};
