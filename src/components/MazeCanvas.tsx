import React, { useEffect, useRef } from 'react';
import { renderMazeScene } from '../core/renderer';
import type {
  DailyEffectState,
  GridCoord,
  MazeCell,
  Point,
  SplitCheckpoint,
} from '../types/game';

interface MazeCanvasProps {
  grid: MazeCell[][];
  playerPos: Point;
  playerColor: string;
  start: GridCoord;
  exit: GridCoord;
  checkpoints: SplitCheckpoint[];
  effect: DailyEffectState;
  isDarkTheme: boolean;
}

export const MazeCanvas: React.FC<MazeCanvasProps> = ({
  grid,
  playerPos,
  playerColor,
  start,
  exit,
  checkpoints,
  effect,
  isDarkTheme,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 600, h: 600 });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let resizeTimeout: number | undefined;

    const observer = new ResizeObserver((entries) => {
      // Debounce observer callback to avoid layout oscillations
      window.clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => {
        const entry = entries[0];
        if (!entry) return;

        const { width, height } = entry.contentRect;
        const side = Math.min(width, height);
        if (side <= 0) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        sizeRef.current = { w: side, h: side };

        canvas.width = Math.floor(side * dpr);
        canvas.height = Math.floor(side * dpr);
        canvas.style.width = `${Math.floor(side)}px`;
        canvas.style.height = `${Math.floor(side)}px`;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.scale(dpr, dpr);
        }
      }, 30);
    });

    observer.observe(container);

    return () => {
      window.clearTimeout(resizeTimeout);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderMazeScene({
      ctx,
      width: sizeRef.current.w,
      height: sizeRef.current.h,
      grid,
      playerPos,
      playerColor,
      start,
      exit,
      checkpoints,
      effect,
      isDarkTheme,
      timeMs: performance.now(),
    });
  }, [grid, playerPos, playerColor, start, exit, checkpoints, effect, isDarkTheme]);

  return (
    <div
      ref={containerRef}
      className="glass-panel"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        maxWidth: 'min(85vh, 85vw, 1000px)',
        maxHeight: 'min(85vh, 85vw, 1000px)',
        aspectRatio: '1 / 1',
        overflow: 'hidden', // Required to prevent ResizeObserver infinite loops
        touchAction: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          touchAction: 'none',
          userSelect: 'none',
          position: 'relative',
          zIndex: 2,
        }}
      />
    </div>
  );
};
