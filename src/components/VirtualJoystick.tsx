import React, { useEffect, useRef, useState } from 'react';
import type { Point } from '../types/game';

interface VirtualJoystickProps {
  onMove: (vector: Point) => void;
  isDarkTheme: boolean;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({ onMove, isDarkTheme }) => {
  const [active, setActive] = useState(false);
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const touchIdRef = useRef<number | null>(null);
  const onMoveRef = useRef(onMove);

  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  const radius = 46;

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    touchIdRef.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setActive(true);
    updateVector(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (touchIdRef.current !== e.pointerId) return;
    updateVector(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (touchIdRef.current !== e.pointerId) return;
    touchIdRef.current = null;
    setActive(false);
    if (knobRef.current) {
      knobRef.current.style.transform = 'translate(0px, 0px)';
    }
    onMoveRef.current({ x: 0, y: 0 });
  };

  const updateVector = (clientX: number, clientY: number) => {
    if (!baseRef.current) return;
    const rect = baseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);

    const clampedDist = Math.min(dist, radius);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clampedDist;
    const ky = Math.sin(angle) * clampedDist;

    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${kx}px, ${ky}px)`;
    }
    onMoveRef.current({ x: kx / radius, y: ky / radius });
  };

  return (
    <div
      ref={baseRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role="group"
      aria-label="Virtual joystick for player navigation"
      style={{
        position: 'relative',
        width: radius * 2 + 20,
        height: radius * 2 + 20,
        borderRadius: '50%',
        background: isDarkTheme ? 'rgba(30, 41, 59, 0.45)' : 'rgba(241, 245, 249, 0.65)',
        border: `2px solid ${isDarkTheme ? 'rgba(71, 85, 105, 0.4)' : 'rgba(203, 213, 225, 0.6)'}`,
        backdropFilter: 'blur(6px)',
        touchAction: 'none',
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto',
      }}
    >
      <div
        ref={knobRef}
        style={{
          width: 38,
          height: 38,
          borderRadius: '50%',
          background: active
            ? 'var(--accent-green)'
            : isDarkTheme
            ? 'rgba(148, 163, 184, 0.6)'
            : 'rgba(100, 116, 139, 0.6)',
          transform: 'translate(0px, 0px)',
          transition: active ? 'none' : 'transform 0.12s ease-out',
          boxShadow: active ? '0 0 12px var(--accent-green)' : 'none',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
