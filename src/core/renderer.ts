import { GAME_CONFIG } from '../config/gameConfig';
import { renderFogOverlay } from './fogRenderer';
import {
  drawEffectObjects,
  drawFirefly,
  drawGoal,
  drawHighlight,
} from './objectRenderer';
import type {
  DailyEffectState,
  GridCoord,
  MazeCell,
  Point,
  SplitCheckpoint,
} from '../types/game';

export interface RenderOptions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  grid: MazeCell[][];
  playerPos: Point;
  playerColor: string;
  start: GridCoord;
  exit: GridCoord;
  checkpoints: SplitCheckpoint[];
  effect: DailyEffectState;
  isDarkTheme: boolean;
  timeMs: number;
}

export function renderMazeScene(opts: RenderOptions): void {
  const { ctx, width, height, grid, isDarkTheme, effect } = opts;
  const cols = grid[0].length;
  const rows = grid.length;
  const cellSize = width / cols;
  const wallWidth = Math.max(2, cellSize * GAME_CONFIG.maze.wallThicknessRatio);

  ctx.clearRect(0, 0, width, height);

  // 1. Deep obsidian / clean porcelain floor
  ctx.fillStyle = isDarkTheme ? '#080c14' : '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // 2. Start & Exit zones (both true exit and unrevealed decoys rendered on the exact same layer before walls)
  drawHighlight(ctx, opts.start, cellSize, opts.timeMs);
  drawGoal(ctx, opts.exit, cellSize, opts.timeMs);
  if (effect.type === 'fake_exits' && effect.fakeExits) {
    for (const f of effect.fakeExits) {
      if (!f.revealed) {
        drawGoal(ctx, f, cellSize, opts.timeMs);
      }
    }
  }

  // 3. Walls (crisp lines, no shadow blur inside maze)
  ctx.strokeStyle = isDarkTheme ? '#1c2638' : '#334155';
  ctx.lineWidth = wallWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowBlur = 0;

  ctx.beginPath();
  const isWobbly = effect.type === 'wobbly_walls';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { top, right, bottom, left } = grid[r][c].walls;
      const x = c * cellSize;
      const y = r * cellSize;

      if (top) {
        ctx.moveTo(x, y);
        if (isWobbly) {
          const my = y + Math.sin(c * 1.7 + r * 2.3) * (cellSize * 0.16);
          ctx.quadraticCurveTo(x + cellSize * 0.5, my, x + cellSize, y);
        } else {
          ctx.lineTo(x + cellSize, y);
        }
      }
      if (right) {
        ctx.moveTo(x + cellSize, y);
        if (isWobbly) {
          const mx = x + cellSize + Math.cos(c * 2.1 + r * 1.5) * (cellSize * 0.16);
          ctx.quadraticCurveTo(mx, y + cellSize * 0.5, x + cellSize, y + cellSize);
        } else {
          ctx.lineTo(x + cellSize, y + cellSize);
        }
      }
      if (bottom) {
        ctx.moveTo(x, y + cellSize);
        if (isWobbly) {
          const my = y + cellSize + Math.sin(c * 1.9 + r * 2.1) * (cellSize * 0.16);
          ctx.quadraticCurveTo(x + cellSize * 0.5, my, x + cellSize, y + cellSize);
        } else {
          ctx.lineTo(x + cellSize, y + cellSize);
        }
      }
      if (left) {
        ctx.moveTo(x, y);
        if (isWobbly) {
          const mx = x + Math.cos(c * 1.8 + r * 1.7) * (cellSize * 0.16);
          ctx.quadraticCurveTo(mx, y + cellSize * 0.5, x, y + cellSize);
        } else {
          ctx.lineTo(x, y + cellSize);
        }
      }
    }
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 4. Interactive effect objects & Firefly
  drawEffectObjects(ctx, opts.effect, cellSize, opts.timeMs);
  drawFirefly(ctx, opts.playerPos, cellSize, opts.playerColor, opts.timeMs);

  // 5. Fog of War overlay
  if (opts.effect.type === 'fog_of_war' && opts.effect.fogRevealed) {
    renderFogOverlay(ctx, grid, opts.effect, opts.playerPos, cellSize, isDarkTheme);
  }
}
