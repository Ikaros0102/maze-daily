import { GAME_CONFIG } from '../config/gameConfig';
import type { DailyEffectState, MazeCell, Point } from '../types/game';

export interface PhysicsState {
  pos: Point;
  vel: Point;
}

export function updatePlayerPhysics(
  current: PhysicsState,
  input: Point,
  dt: number,
  grid: MazeCell[][],
  effect: DailyEffectState
): PhysicsState {
  const isIce = effect.type === 'ice' && effect.enabled;
  const radius = (GAME_CONFIG.player.sizeRatio * 1) / 2;
  const cols = grid[0].length;
  const rows = grid.length;

  let { x, y } = current.pos;
  let { x: vx, y: vy } = current.vel;

  if (isIce) {
    const accel = GAME_CONFIG.ice.acceleration * 60;
    const friction = Math.pow(GAME_CONFIG.ice.friction, dt * 60);
    vx = (vx + input.x * accel * dt) * friction;
    vy = (vy + input.y * accel * dt) * friction;
  } else {
    const speed = GAME_CONFIG.player.baseSpeedCellsPerSecond;
    vx = input.x * speed;
    vy = input.y * speed;
  }

  // 1. Движение по X с учетом вектора скорости vx
  const nextX = x + vx * dt;
  x = resolveAxisCollision(x, nextX, y, vx, radius, 'x', grid, effect, cols, rows);

  // 2. Движение по Y с учетом вектора скорости vy
  const nextY = y + vy * dt;
  y = resolveAxisCollision(y, nextY, x, vy, radius, 'y', grid, effect, cols, rows);

  return { pos: { x, y }, vel: { x: vx, y: vy } };
}

function resolveAxisCollision(
  currCoord: number,
  targetCoord: number,
  otherCoord: number,
  velocity: number,
  radius: number,
  axis: 'x' | 'y',
  grid: MazeCell[][],
  effect: DailyEffectState,
  cols: number,
  rows: number
): number {
  const isX = axis === 'x';
  const maxLimit = (isX ? cols : rows) - radius;
  let clamped = Math.max(radius, Math.min(maxLimit, targetCoord));

  const currCell = Math.floor(currCoord);
  const otherCell = Math.floor(otherCoord);

  if (currCell < 0 || currCell >= (isX ? cols : rows) || otherCell < 0) {
    return clamped;
  }

  const c = isX ? currCell : otherCell;
  const r = isX ? otherCell : currCell;

  if (r < 0 || r >= rows || c < 0 || c >= cols) return clamped;
  const cell = grid[r][c];

  const isGate =
    effect.type === 'key_and_gate' &&
    !effect.isGateOpen &&
    effect.gatePos &&
    effect.gatePos.col === c &&
    effect.gatePos.row === r;

  if (isX) {
    // Ограничиваем ТОЛЬКО если движемся В СТОРОНУ левой стены (velocity < 0)
    if ((cell.walls.left || isGate) && velocity < 0 && clamped - radius < c) {
      clamped = Math.max(clamped, c + radius);
    }
    // Ограничиваем ТОЛЬКО если движемся В СТОРОНУ правой стены (velocity > 0)
    if ((cell.walls.right || isGate) && velocity > 0 && clamped + radius > c + 1) {
      clamped = Math.min(clamped, c + 1 - radius);
    }
  } else {
    // Ограничиваем ТОЛЬКО если движемся В СТОРОНУ верхней стены (velocity < 0)
    if ((cell.walls.top || isGate) && velocity < 0 && clamped - radius < r) {
      clamped = Math.max(clamped, r + radius);
    }
    // Ограничиваем ТОЛЬКО если движемся В СТОРОНУ нижней стены (velocity > 0)
    if ((cell.walls.bottom || isGate) && velocity > 0 && clamped + radius > r + 1) {
      clamped = Math.min(clamped, r + 1 - radius);
    }
  }

  return clamped;
}