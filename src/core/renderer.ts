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
  GlitchTransform,
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

function applyGlitchTransform(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  transform?: GlitchTransform
): void {
  if (!transform || transform === 'none') return;

  const cx = width / 2;
  const cy = height / 2;

  ctx.translate(cx, cy);
  switch (transform) {
    case 'rotate_cw':
      ctx.rotate(Math.PI / 2);
      break;
    case 'rotate_ccw':
      ctx.rotate(-Math.PI / 2);
      break;
    case 'flip_h':
      ctx.scale(-1, 1);
      break;
    case 'flip_v':
      ctx.scale(1, -1);
      break;
  }
  ctx.translate(-cx, -cy);
}

function drawGlitchWarningOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeMs: number
): void {
  const pulse = Math.sin(timeMs / 60) * 0.4 + 0.6;
  ctx.save();
  ctx.strokeStyle = `rgba(244, 63, 94, ${0.85 * pulse})`;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, width - 4, height - 4);

  // Subtle chromatic scanline fringe
  ctx.strokeStyle = `rgba(56, 189, 248, ${0.5 * pulse})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, width - 8, height - 8);
  ctx.restore();
}

function drawGlitchStaticOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  ctx.save();
  // Draw TV static scanline bars and digital glitch noise
  const barCount = 14;
  const barHeight = height / barCount;
  for (let i = 0; i < barCount; i++) {
    const isGlitchBar = Math.random() > 0.4;
    if (isGlitchBar) {
      const alpha = Math.random() * 0.4 + 0.35;
      const r = Math.random() > 0.5 ? 244 : 56;
      const g = Math.random() > 0.5 ? 63 : 189;
      const b = 248;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      const shiftX = (Math.random() - 0.5) * 24;
      ctx.fillRect(shiftX, i * barHeight, width + 48, barHeight * 0.85);
    }
  }

  // High-frequency TV noise grain
  const grainCount = 300;
  for (let g = 0; g < grainCount; g++) {
    const gx = Math.random() * width;
    const gy = Math.random() * height;
    const gSize = Math.random() * 3 + 1;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)';
    ctx.fillRect(gx, gy, gSize, gSize);
  }
  ctx.restore();
}

/**
 * Renders the pipeline / woven track labyrinth with rounded corners and overpass bridges.
 */
function renderWeaveLabyrinthWalls(
  ctx: CanvasRenderingContext2D,
  grid: MazeCell[][],
  cellSize: number,
  wallWidth: number,
  isDarkTheme: boolean
): void {
  const rows = grid.length;
  const cols = grid[0].length;

  // 1. Base tubular walls with smooth rounded joins and caps
  ctx.strokeStyle = isDarkTheme ? '#1e293b' : '#475569';
  ctx.lineWidth = wallWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { top, right, bottom, left } = grid[r][c].walls;
      const x = c * cellSize;
      const y = r * cellSize;

      if (top) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + cellSize, y);
      }
      if (right) {
        ctx.moveTo(x + cellSize, y);
        ctx.lineTo(x + cellSize, y + cellSize);
      }
      if (bottom) {
        ctx.moveTo(x, y + cellSize);
        ctx.lineTo(x + cellSize, y + cellSize);
      }
      if (left) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + cellSize);
      }
    }
  }
  ctx.stroke();

  // 2. Optical illusion multi-level overpass bridges at intersections
  // Cells with crossings render an elevated vertical bridge with soft drop shadows
  const trackWidth = Math.max(3, cellSize * 0.4);
  const bridgeColor = isDarkTheme ? '#0f172a' : '#f8fafc';
  const bridgeEdgeColor = isDarkTheme ? '#38bdf8' : '#0284c7';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const hasHorizontal = !cell.walls.left && !cell.walls.right;
      const hasVertical = !cell.walls.top && !cell.walls.bottom;

      // When horizontal and vertical paths cross, render vertical bridge overpass
      if (hasHorizontal && hasVertical) {
        const cx = (c + 0.5) * cellSize;
        const topY = r * cellSize;
        const bottomY = (r + 1) * cellSize;

        ctx.save();
        // Drop shadow onto horizontal underpass
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;

        // Bridge deck
        ctx.fillStyle = bridgeColor;
        ctx.fillRect(cx - trackWidth / 2, topY, trackWidth, cellSize);

        // Bridge railings / edges
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = bridgeEdgeColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - trackWidth / 2, topY);
        ctx.lineTo(cx - trackWidth / 2, bottomY);
        ctx.moveTo(cx + trackWidth / 2, topY);
        ctx.lineTo(cx + trackWidth / 2, bottomY);
        ctx.stroke();

        ctx.restore();
      }
    }
  }
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

  // Apply glitch transformation to entire maze scene if active
  ctx.save();
  if (effect.glitchTransform && effect.glitchTransform !== 'none') {
    applyGlitchTransform(ctx, width, height, effect.glitchTransform);
  }

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

  // 3. Walls
  if (effect.type === 'weave_labyrinth') {
    renderWeaveLabyrinthWalls(ctx, grid, cellSize, wallWidth, isDarkTheme);
  } else {
    ctx.strokeStyle = isDarkTheme ? '#1c2638' : '#334155';
    ctx.lineWidth = wallWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 0;

    ctx.beginPath();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const { top, right, bottom, left } = grid[r][c].walls;
        const x = c * cellSize;
        const y = r * cellSize;

        if (top) {
          ctx.moveTo(x, y);
          ctx.lineTo(x + cellSize, y);
        }
        if (right) {
          ctx.moveTo(x + cellSize, y);
          ctx.lineTo(x + cellSize, y + cellSize);
        }
        if (bottom) {
          ctx.moveTo(x, y + cellSize);
          ctx.lineTo(x + cellSize, y + cellSize);
        }
        if (left) {
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + cellSize);
        }
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // 4. Interactive effect objects & Firefly
  drawEffectObjects(ctx, opts.effect, cellSize, opts.timeMs);
  drawFirefly(ctx, opts.playerPos, cellSize, opts.playerColor, opts.timeMs);

  // 5. Fog of War overlay
  if (opts.effect.type === 'fog_of_war' && opts.effect.fogRevealed) {
    renderFogOverlay(ctx, grid, opts.effect, opts.playerPos, cellSize, isDarkTheme);
  }

  ctx.restore();

  // 6. Glitch Warning & Static Overlays (rendered screen-aligned)
  if (opts.effect.type === 'glitch') {
    if (opts.effect.glitchWarning) {
      drawGlitchWarningOverlay(ctx, width, height, opts.timeMs);
    }
    if (opts.effect.glitchStatic) {
      drawGlitchStaticOverlay(ctx, width, height);
    }
  }
}
