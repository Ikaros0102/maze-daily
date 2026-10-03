import React, { useEffect, useRef } from 'react';
import type { BreadcrumbPoint, GridCoord, MazeCell } from '../../types/game';

interface ReplayMapProps {
  grid: MazeCell[][];
  start: GridCoord;
  exit: GridCoord;
  path: BreadcrumbPoint[];
  playerColor: string;
  isDarkTheme: boolean;
}

export const ReplayMap: React.FC<ReplayMapProps> = ({
  grid,
  start,
  exit,
  path,
  playerColor,
  isDarkTheme,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 260;
    canvas.width = size;
    canvas.height = size;

    const cols = grid[0].length;
    const cellSize = size / cols;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = isDarkTheme ? '#0f172a' : '#f8fafc';
    ctx.fillRect(0, 0, size, size);

    // Draw walls
    ctx.strokeStyle = isDarkTheme ? '#334155' : '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < cols; c++) {
        const { top, right, bottom, left } = grid[r][c].walls;
        const x = c * cellSize;
        const y = r * cellSize;
        if (top) { ctx.moveTo(x, y); ctx.lineTo(x + cellSize, y); }
        if (right) { ctx.moveTo(x + cellSize, y); ctx.lineTo(x + cellSize, y + cellSize); }
        if (bottom) { ctx.moveTo(x, y + cellSize); ctx.lineTo(x + cellSize, y + cellSize); }
        if (left) { ctx.moveTo(x, y); ctx.lineTo(x, y + cellSize); }
      }
    }
    ctx.stroke();

    // Draw player path track
    if (path.length > 1) {
      ctx.strokeStyle = playerColor;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(path[0][0] * cellSize, path[0][1] * cellSize);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i][0] * cellSize, path[i][1] * cellSize);
      }
      ctx.stroke();
    }

    // Start & Exit points
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc((start.col + 0.5) * cellSize, (start.row + 0.5) * cellSize, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc((exit.col + 0.5) * cellSize, (exit.row + 0.5) * cellSize, 4, 0, Math.PI * 2);
    ctx.fill();
  }, [grid, start, exit, path, playerColor, isDarkTheme]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
      <canvas
        ref={canvasRef}
        style={{
          width: 260,
          height: 260,
          borderRadius: 8,
          border: `1px solid ${isDarkTheme ? '#334155' : '#cbd5e1'}`,
        }}
      />
    </div>
  );
};
