import { GAME_CONFIG } from '../config/gameConfig';
import { renderFogOverlay } from './fogRenderer';
import {
  drawEffectObjects,
  drawFirefly,
  drawGoal,
  drawHighlight,
} from './objectRenderer';
import type {
  CurvedMazePattern,
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
 * Traces the non-bridge (and underpass) tubular paths for weave_labyrinth.
 * Uses smooth quadratic curves for 90-degree bends and center-terminated segments
 * with round caps for semicircular dead-end loops.
 */
function traceWeaveBasePaths(
  ctx: CanvasRenderingContext2D,
  grid: MazeCell[][],
  cellSize: number
): void {
  const rows = grid.length;
  const cols = grid[0].length;

  ctx.beginPath();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const x = c * cellSize;
      const y = r * cellSize;
      const cx = x + cellSize * 0.5;
      const cy = y + cellSize * 0.5;

      const T = { x: cx, y };
      const R = { x: x + cellSize, y: cy };
      const B = { x: cx, y: y + cellSize };
      const L = { x, y: cy };

      // For bridge cells, only trace the underpass in the base layer
      if (cell.bridge === 'horizontal_over') {
        ctx.moveTo(T.x, T.y);
        ctx.lineTo(B.x, B.y);
        continue;
      }
      if (cell.bridge === 'vertical_over') {
        ctx.moveTo(L.x, L.y);
        ctx.lineTo(R.x, R.y);
        continue;
      }

      const openEdges: { pt: Point; dir: 'top' | 'right' | 'bottom' | 'left' }[] = [];
      if (!cell.walls.top) openEdges.push({ pt: T, dir: 'top' });
      if (!cell.walls.right) openEdges.push({ pt: R, dir: 'right' });
      if (!cell.walls.bottom) openEdges.push({ pt: B, dir: 'bottom' });
      if (!cell.walls.left) openEdges.push({ pt: L, dir: 'left' });

      if (openEdges.length === 1) {
        // Dead-end: line to cell center with round cap creates a semicircular U-loop
        ctx.moveTo(openEdges[0].pt.x, openEdges[0].pt.y);
        ctx.lineTo(cx, cy);
      } else if (openEdges.length === 2) {
        const [e1, e2] = openEdges;
        const isOpposite =
          (e1.dir === 'top' && e2.dir === 'bottom') ||
          (e1.dir === 'left' && e2.dir === 'right');
        if (isOpposite) {
          ctx.moveTo(e1.pt.x, e1.pt.y);
          ctx.lineTo(e2.pt.x, e2.pt.y);
        } else {
          // Smooth quarter-circle pipe bend
          ctx.moveTo(e1.pt.x, e1.pt.y);
          ctx.quadraticCurveTo(cx, cy, e2.pt.x, e2.pt.y);
        }
      } else if (openEdges.length >= 3) {
        // Multi-way junction: connect all open pairs smoothly through center
        for (let i = 0; i < openEdges.length; i++) {
          for (let j = i + 1; j < openEdges.length; j++) {
            const e1 = openEdges[i];
            const e2 = openEdges[j];
            const isOpposite =
              (e1.dir === 'top' && e2.dir === 'bottom') ||
              (e1.dir === 'left' && e2.dir === 'right');
            ctx.moveTo(e1.pt.x, e1.pt.y);
            if (isOpposite) {
              ctx.lineTo(e2.pt.x, e2.pt.y);
            } else {
              ctx.quadraticCurveTo(cx, cy, e2.pt.x, e2.pt.y);
            }
          }
        }
      }
    }
  }
}

/**
 * Renders the 2-layer tubular pipe network + 25–35 elevated overpass bridges for weave_labyrinth.
 */
function renderWeaveLabyrinth(
  ctx: CanvasRenderingContext2D,
  grid: MazeCell[][],
  width: number,
  height: number,
  cellSize: number,
  isDarkTheme: boolean
): void {
  const rows = grid.length;
  const cols = grid[0].length;

  const voidColor = isDarkTheme ? '#030509' : '#cbd5e1';
  const outerRimColor = isDarkTheme ? '#5676a8' : '#1e293b';
  const outerWallColor = isDarkTheme ? '#3b5278' : '#334155';
  const bridgeWallColor = isDarkTheme ? '#4d6b99' : '#1e293b';
  const bridgeRailColor = isDarkTheme ? '#7ba2db' : '#0f172a';
  const floorColor = isDarkTheme ? '#080c14' : '#ffffff';

  // 0. Inter-pipe backdrop so tubular walls and semicircular dead-end loops stand out clearly
  ctx.fillStyle = voidColor;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 1. Layer A (Outer Pipe Wall Casing: 0.82 * cellSize)
  traceWeaveBasePaths(ctx, grid, cellSize);
  ctx.strokeStyle = outerRimColor;
  ctx.lineWidth = cellSize * 0.85;
  ctx.stroke();

  ctx.strokeStyle = outerWallColor;
  ctx.lineWidth = cellSize * 0.82;
  ctx.stroke();

  // 2. Layer B (Inner Pipe Floor: 0.54 * cellSize)
  ctx.strokeStyle = floorColor;
  ctx.lineWidth = cellSize * 0.54;
  ctx.stroke();

  // 3. Layer C (Overpasses / Bridges for all 25-35 bridge cells)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (!cell.bridge) continue;

      const x = c * cellSize;
      const y = r * cellSize;
      const cx = x + cellSize * 0.5;
      const cy = y + cellSize * 0.5;
      const isHoriz = cell.bridge === 'horizontal_over';

      const x1 = isHoriz ? x : cx;
      const y1 = isHoriz ? cy : y;
      const x2 = isHoriz ? x + cellSize : cx;
      const y2 = isHoriz ? cy : y + cellSize;

      // Overlap extension for inner floor so it fuses seamlessly with neighbor cells
      const ext = Math.max(2, cellSize * 0.12);
      const fx1 = isHoriz ? x1 - ext : x1;
      const fy1 = isHoriz ? y1 : y1 - ext;
      const fx2 = isHoriz ? x2 + ext : x2;
      const fy2 = isHoriz ? y2 : y2 + ext;

      // Layer C-A: Overpass Outer Pipe Wall with 3D drop shadow onto underpass
      ctx.save();
      ctx.lineCap = 'butt';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;

      ctx.strokeStyle = bridgeRailColor;
      ctx.lineWidth = cellSize * 0.88;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = bridgeWallColor;
      ctx.lineWidth = cellSize * 0.82;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();

      // Layer C-B: Overpass Inner Pipe Floor (0.54 * cellSize)
      ctx.save();
      ctx.lineCap = 'butt';
      ctx.strokeStyle = floorColor;
      ctx.lineWidth = cellSize * 0.54;
      ctx.beginPath();
      ctx.moveTo(fx1, fy1);
      ctx.lineTo(fx2, fy2);
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.restore();
}

/**
 * Continuous non-orthogonal diffeomorphic coordinate transformation for curved_labyrinth patterns.
 * Guarantees C1 continuity and uniform corridor spacing (no pinching/overlapping) while bending
 * orthogonal grid axes into sweeping spirals, waves, concentric rings, or angled zig-zags.
 */
function warpCurvedPoint(
  px: number,
  py: number,
  width: number,
  height: number,
  cellSize: number,
  pattern: CurvedMazePattern
): Point {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const rx = px - cx;
  const ry = py - cy;
  const maxR = Math.min(width, height) * 0.48;
  const dist = Math.hypot(rx, ry);

  // Smooth C2 boundary envelope that vanishes on and outside the inscribed circle (and near edges)
  const nx = Math.max(0, Math.min(1, px / width));
  const ny = Math.max(0, Math.min(1, py / height));
  const boxEnv = Math.sin(Math.PI * nx) * Math.sin(Math.PI * ny);
  const radNorm = Math.min(1, dist / maxR);
  const radialEnv = (1 - radNorm * radNorm) * (1 - radNorm * radNorm);

  if (pattern === 'zigzag_angled') {
    const colIdx = Math.round(px / (cellSize * 0.5));
    const rowIdx = Math.round(py / (cellSize * 0.5));
    const zigX = (rowIdx % 2 === 0 ? 1 : -1) * cellSize * 0.24 * boxEnv;
    const zigY = (colIdx % 2 === 0 ? -1 : 1) * cellSize * 0.24 * boxEnv;
    return { x: px + zigX, y: py + zigY };
  }

  if (pattern === 'organic_wave') {
    const gx = px / cellSize;
    const gy = py / cellSize;
    // Bounded low-frequency wave (max derivative < 0.28 so pipes never pinch)
    const dx = Math.sin(gy * 0.42 + gx * 0.18) * cellSize * 0.52 * boxEnv;
    const dy = Math.cos(gx * 0.42 - gy * 0.18) * cellSize * 0.52 * boxEnv;
    return { x: px + dx, y: py + dy };
  }

  if (pattern === 'double_spiral') {
    const c1x = width * 0.34;
    const c1y = height * 0.38;
    const c2x = width * 0.66;
    const c2y = height * 0.62;
    const r1 = Math.hypot(px - c1x, py - c1y);
    const r2 = Math.hypot(px - c2x, py - c2y);
    const localR = width * 0.34;
    const n1 = Math.min(1, r1 / localR);
    const n2 = Math.min(1, r2 / localR);

    let x = px;
    let y = py;
    if (n1 < 1) {
      const a1 = 0.55 * (1 - n1 * n1) * (1 - n1 * n1);
      const dx1 = x - c1x;
      const dy1 = y - c1y;
      x = c1x + dx1 * Math.cos(a1) - dy1 * Math.sin(a1);
      y = c1y + dx1 * Math.sin(a1) + dy1 * Math.cos(a1);
    }
    if (n2 < 1) {
      const a2 = -0.55 * (1 - n2 * n2) * (1 - n2 * n2);
      const dx2 = x - c2x;
      const dy2 = y - c2y;
      x = c2x + dx2 * Math.cos(a2) - dy2 * Math.sin(a2);
      y = c2y + dx2 * Math.sin(a2) + dy2 * Math.cos(a2);
    }
    return { x, y };
  }

  // Spiral & concentric_tree: area-preserving pure radial swirl + gentle wave
  // Because swirlAngle depends only on radNorm and vanishes at radNorm=1, circles map to circles
  // with determinant 1 (zero radial compression between neighboring pipes!)
  const swirlAngle =
    pattern === 'spiral'
      ? 0.62 * radialEnv
      : 0.45 * radialEnv * Math.cos(radNorm * Math.PI * 1.5);

  const cosA = Math.cos(swirlAngle);
  const sinA = Math.sin(swirlAngle);
  const rotX = rx * cosA - ry * sinA;
  const rotY = rx * sinA + ry * cosA;

  // Add subtle S-wave modulation outside the inner circle so outer corridors also curve smoothly
  const waveX = Math.sin((py / height) * Math.PI * 3) * cellSize * 0.26 * boxEnv;
  const waveY = Math.cos((px / width) * Math.PI * 3) * cellSize * 0.26 * boxEnv;

  return {
    x: cx + rotX + waveX,
    y: cy + rotY + waveY,
  };
}

/**
 * Renders the non-orthogonal Curved Labyrinth (`curved_labyrinth`):
 * - `zigzag_angled`: 45°/60° chamfered diagonal faceted walls with zero 90° corners.
 * - `spiral` / `double_spiral` / `concentric_tree` / `organic_wave`: smooth Bezier spline walls & passages.
 */
function renderCurvedLabyrinth(
  ctx: CanvasRenderingContext2D,
  grid: MazeCell[][],
  width: number,
  height: number,
  cellSize: number,
  isDarkTheme: boolean,
  pattern: CurvedMazePattern = 'spiral'
): void {
  const rows = grid.length;
  const cols = grid[0].length;

  const voidColor = isDarkTheme ? '#030509' : '#cbd5e1';
  const outerWallColor = isDarkTheme ? '#3b5278' : '#334155';
  const outerRimColor = isDarkTheme ? '#5676a8' : '#1e293b';
  const floorColor = isDarkTheme ? '#080c14' : '#ffffff';

  ctx.fillStyle = voidColor;
  ctx.fillRect(0, 0, width, height);

  ctx.save();

  if (pattern === 'zigzag_angled') {
    // Chamfered 45°/60° faceted rendering (beveled joins, direct diagonal turns)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'bevel';

    ctx.beginPath();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        const x = c * cellSize;
        const y = r * cellSize;
        const cx = x + cellSize * 0.5;
        const cy = y + cellSize * 0.5;

        const T = warpCurvedPoint(cx, y, width, height, cellSize, 'zigzag_angled');
        const R = warpCurvedPoint(x + cellSize, cy, width, height, cellSize, 'zigzag_angled');
        const B = warpCurvedPoint(cx, y + cellSize, width, height, cellSize, 'zigzag_angled');
        const L = warpCurvedPoint(x, cy, width, height, cellSize, 'zigzag_angled');

        const parity = (r + c) % 2 === 0 ? 1 : -1;
        const CBase = warpCurvedPoint(cx, cy, width, height, cellSize, 'zigzag_angled');
        const C = {
          x: CBase.x + parity * cellSize * 0.18,
          y: CBase.y - parity * cellSize * 0.18,
        };

        const openEdges: { pt: Point; dir: 'top' | 'right' | 'bottom' | 'left' }[] = [];
        if (!cell.walls.top) openEdges.push({ pt: T, dir: 'top' });
        if (!cell.walls.right) openEdges.push({ pt: R, dir: 'right' });
        if (!cell.walls.bottom) openEdges.push({ pt: B, dir: 'bottom' });
        if (!cell.walls.left) openEdges.push({ pt: L, dir: 'left' });

        if (openEdges.length === 1) {
          ctx.moveTo(openEdges[0].pt.x, openEdges[0].pt.y);
          ctx.lineTo(C.x, C.y);
        } else if (openEdges.length === 2) {
          const [e1, e2] = openEdges;
          const isOpposite =
            (e1.dir === 'top' && e2.dir === 'bottom') ||
            (e1.dir === 'left' && e2.dir === 'right');
          if (!isOpposite) {
            // Direct 45°/60° diagonal chamfer cutting across the corner!
            ctx.moveTo(e1.pt.x, e1.pt.y);
            ctx.lineTo(e2.pt.x, e2.pt.y);
          } else {
            // Sharp angled zig-zag facet through displaced vertex C
            ctx.moveTo(e1.pt.x, e1.pt.y);
            ctx.lineTo(C.x, C.y);
            ctx.lineTo(e2.pt.x, e2.pt.y);
          }
        } else if (openEdges.length >= 3) {
          // Connect all open branches cleanly at angled hub C (no detached loops)
          for (const e of openEdges) {
            ctx.moveTo(e.pt.x, e.pt.y);
            ctx.lineTo(C.x, C.y);
          }
        }
      }
    }

    ctx.strokeStyle = outerRimColor;
    ctx.lineWidth = cellSize * 0.84;
    ctx.stroke();

    ctx.strokeStyle = outerWallColor;
    ctx.lineWidth = cellSize * 0.78;
    ctx.stroke();

    ctx.strokeStyle = floorColor;
    ctx.lineWidth = cellSize * 0.50;
    ctx.stroke();

    ctx.restore();
    return;
  }

  // Smooth Bezier / Spline rendering for spiral, double_spiral, concentric_tree, organic_wave
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const x = c * cellSize;
      const y = r * cellSize;
      const cx = x + cellSize * 0.5;
      const cy = y + cellSize * 0.5;

      const T = warpCurvedPoint(cx, y, width, height, cellSize, pattern);
      const R = warpCurvedPoint(x + cellSize, cy, width, height, cellSize, pattern);
      const B = warpCurvedPoint(cx, y + cellSize, width, height, cellSize, pattern);
      const L = warpCurvedPoint(x, cy, width, height, cellSize, pattern);
      const CBase = warpCurvedPoint(cx, cy, width, height, cellSize, pattern);

      // Gentle local Bezier control point offset so even straight segments form smooth arcs
      const bowSign = (r + c) % 2 === 0 ? 1 : -1;
      const C = {
        x: CBase.x + bowSign * cellSize * 0.11,
        y: CBase.y - bowSign * cellSize * 0.11,
      };

      const openEdges: { pt: Point; dir: 'top' | 'right' | 'bottom' | 'left' }[] = [];
      if (!cell.walls.top) openEdges.push({ pt: T, dir: 'top' });
      if (!cell.walls.right) openEdges.push({ pt: R, dir: 'right' });
      if (!cell.walls.bottom) openEdges.push({ pt: B, dir: 'bottom' });
      if (!cell.walls.left) openEdges.push({ pt: L, dir: 'left' });

      if (openEdges.length === 1) {
        ctx.moveTo(openEdges[0].pt.x, openEdges[0].pt.y);
        ctx.lineTo(C.x, C.y);
      } else if (openEdges.length === 2) {
        const [e1, e2] = openEdges;
        ctx.moveTo(e1.pt.x, e1.pt.y);
        ctx.quadraticCurveTo(C.x, C.y, e2.pt.x, e2.pt.y);
      } else if (openEdges.length >= 3) {
        for (let i = 0; i < openEdges.length; i++) {
          for (let j = i + 1; j < openEdges.length; j++) {
            const e1 = openEdges[i];
            const e2 = openEdges[j];
            ctx.moveTo(e1.pt.x, e1.pt.y);
            ctx.quadraticCurveTo(C.x, C.y, e2.pt.x, e2.pt.y);
          }
        }
      }
    }
  }

  // Layer 1: Outer Curved Spline Wall Rim & Casing
  ctx.strokeStyle = outerRimColor;
  ctx.lineWidth = cellSize * 0.85;
  ctx.stroke();

  ctx.strokeStyle = outerWallColor;
  ctx.lineWidth = cellSize * 0.80;
  ctx.stroke();

  // Layer 2: Inner Curved Spline Floor
  ctx.strokeStyle = floorColor;
  ctx.lineWidth = cellSize * 0.52;
  ctx.stroke();

  ctx.restore();
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

  const isTubularOrCurved =
    effect.type === 'weave_labyrinth' || effect.type === 'curved_labyrinth';

  // 2. Start & Exit zones (drawn before thin walls in standard mazes)
  if (!isTubularOrCurved) {
    drawHighlight(ctx, opts.start, cellSize, opts.timeMs);
    drawGoal(ctx, opts.exit, cellSize, opts.timeMs);
    if (effect.type === 'fake_exits' && effect.fakeExits) {
      for (const f of effect.fakeExits) {
        if (!f.revealed) {
          drawGoal(ctx, f, cellSize, opts.timeMs);
        }
      }
    }
  }

  // 3. Walls / Tubular Pipes / Curved Splines
  if (effect.type === 'weave_labyrinth') {
    renderWeaveLabyrinth(ctx, grid, width, height, cellSize, isDarkTheme);
  } else if (effect.type === 'curved_labyrinth') {
    renderCurvedLabyrinth(
      ctx,
      grid,
      width,
      height,
      cellSize,
      isDarkTheme,
      effect.curvedPattern
    );
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

  // For tubular/curved labyrinths, draw Start & Exit highlights on top of the carved pipe floor
  let renderStart = opts.start;
  let renderExit = opts.exit;
  let renderPlayerPos = opts.playerPos;

  if (effect.type === 'curved_labyrinth') {
    const pat = effect.curvedPattern ?? 'spiral';
    const wStart = warpCurvedPoint(
      (opts.start.col + 0.5) * cellSize,
      (opts.start.row + 0.5) * cellSize,
      width,
      height,
      cellSize,
      pat
    );
    const wExit = warpCurvedPoint(
      (opts.exit.col + 0.5) * cellSize,
      (opts.exit.row + 0.5) * cellSize,
      width,
      height,
      cellSize,
      pat
    );
    const wPlayer = warpCurvedPoint(
      opts.playerPos.x * cellSize,
      opts.playerPos.y * cellSize,
      width,
      height,
      cellSize,
      pat
    );
    renderStart = { col: wStart.x / cellSize - 0.5, row: wStart.y / cellSize - 0.5 };
    renderExit = { col: wExit.x / cellSize - 0.5, row: wExit.y / cellSize - 0.5 };
    renderPlayerPos = { x: wPlayer.x / cellSize, y: wPlayer.y / cellSize };
  }

  if (isTubularOrCurved) {
    drawHighlight(ctx, renderStart, cellSize, opts.timeMs);
    drawGoal(ctx, renderExit, cellSize, opts.timeMs);
  }

  // 4. Interactive effect objects & Firefly
  drawEffectObjects(ctx, opts.effect, cellSize, opts.timeMs);
  drawFirefly(ctx, renderPlayerPos, cellSize, opts.playerColor, opts.timeMs);

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
