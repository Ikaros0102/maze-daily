import React from 'react';
import { Gamepad2 } from 'lucide-react';
import type { LanguageMode } from '../types/game';

interface ControlsWidgetProps {
  isMobile: boolean;
  isDarkTheme: boolean;
  lang: LanguageMode;
}

export const ControlsWidget: React.FC<ControlsWidgetProps> = ({
  isMobile,
  isDarkTheme,
  lang,
}) => {
  const keyClass = isDarkTheme ? 'keycap-dark' : 'keycap-light';

  return (
    <div
      className="glass-panel"
      style={{
        padding: '12px 14px',
        minWidth: 210,
      }}
    >
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            color: 'var(--muted)',
          }}
        >
          <span>{lang === 'ru' ? 'Управление' : 'Controls'}</span>
          <span style={{ fontSize: 10, opacity: 0.6 }}>:::</span>
        </div>

        {!isMobile ? (
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', paddingTop: 2 }}>
            {/* Keyboard Keys WASD */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div className={`keycap ${keyClass}`}>W</div>
              <div style={{ display: 'flex', gap: 3 }}>
                <div className={`keycap ${keyClass}`}>A</div>
                <div className={`keycap ${keyClass}`}>S</div>
                <div className={`keycap ${keyClass}`}>D</div>
              </div>
              <span style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
                {lang === 'ru' ? 'Клавиатура' : 'Keyboard'}
              </span>
            </div>


            
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', padding: '4px 0' }}>
            <Gamepad2 size={16} color={isDarkTheme ? 'var(--accent-green)' : '#059669'} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>
              {lang === 'ru' ? 'Тач / Виртуальный джойстик' : 'Touch / Virtual Joystick'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
