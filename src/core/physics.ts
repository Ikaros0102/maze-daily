import { GAME_CONFIG } from '../config/gameConfig';
import type { DailyEffectState, MazeCell, Point } from '../types/game';

export type CollisionSide = 'left' | 'right' | 'vertical';

export interface PhysicsState {
  pos: Point;
  vel: Point;
  collided?: boolean;
  collisionSide?: CollisionSide | null;
  isPushingWall?: boolean;
}

interface AxisResolution {
  coord: number;
  collided: boolean;
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
  const resX = resolveAxisCollision(x, nextX, y, vx, radius, 'x', grid, effect, cols, rows);
  x = resX.coord;

  // 2. Движение по Y с учетом вектора скорости vy
  const nextY = y + vy * dt;
  const resY = resolveAxisCollision(y, nextY, x, vy, radius, 'y', grid, effect, cols, rows);
  y = resY.coord;

  const collided = resX.collided || resY.collided;
  let collisionSide: CollisionSide | null = null;
  if (resX.collided) {
    collisionSide = vx < 0 ? 'left' : 'right';
  } else if (resY.collided) {
    collisionSide = 'vertical';
  }

  const isPushingWall = Boolean(
    (resX.collided && ((vx < 0 && input.x < -0.1) || (vx > 0 && input.x > 0.1))) ||
    (resY.collided && ((vy < 0 && input.y < -0.1) || (vy > 0 && input.y > 0.1)))
  );

  return { pos: { x, y }, vel: { x: vx, y: vy }, collided, collisionSide, isPushingWall };
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
): AxisResolution {
  let collided = false;
  const isX = axis === 'x';
  const maxLimit = (isX ? cols : rows) - radius;
  let clamped = Math.max(radius, Math.min(maxLimit, targetCoord));

  // Boundary collision check
  if (targetCoord !== clamped && Math.abs(velocity) > 0.01) {
    collided = true;
  }

  const currCell = Math.floor(currCoord);
  const otherCell = Math.floor(otherCoord);

  if (currCell < 0 || currCell >= (isX ? cols : rows) || otherCell < 0) {
    return { coord: clamped, collided };
  }

  const c = isX ? currCell : otherCell;
  const r = isX ? otherCell : currCell;

  if (r < 0 || r >= rows || c < 0 || c >= cols) return { coord: clamped, collided };
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
      collided = true;
    }
    // Ограничиваем ТОЛЬКО если движемся В СТОРОНУ правой стены (velocity > 0)
    if ((cell.walls.right || isGate) && velocity > 0 && clamped + radius > c + 1) {
      clamped = Math.min(clamped, c + 1 - radius);
      collided = true;
    }
  } else {
    // Ограничиваем ТОЛЬКО если движемся В СТОРОНУ верхней стены (velocity < 0)
    if ((cell.walls.top || isGate) && velocity < 0 && clamped - radius < r) {
      clamped = Math.max(clamped, r + radius);
      collided = true;
    }
    // Ограничиваем ТОЛЬКО если движемся В СТОРОНУ нижней стены (velocity > 0)
    if ((cell.walls.bottom || isGate) && velocity > 0 && clamped + radius > r + 1) {
      clamped = Math.min(clamped, r + 1 - radius);
      collided = true;
    }
  }

  return { coord: clamped, collided };
}