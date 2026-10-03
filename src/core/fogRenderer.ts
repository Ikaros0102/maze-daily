import { GAME_CONFIG } from '../config/gameConfig';
import type { DailyEffectState, MazeCell, Point } from '../types/game';

export function renderFogOverlay(
  ctx: CanvasRenderingContext2D,
  grid: MazeCell[][],
  effect: DailyEffectState,
  playerPos: Point,
  size: number,
  isDarkTheme: boolean
): void {
  const rows = grid.length;
  const cols = grid[0].length;
  const shroudColor = isDarkTheme ? '#0b0c10' : '#e2e8f0';

  ctx.fillStyle = shroudColor;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!effect.fogRevealed?.[r]?.[c]) {
        ctx.fillRect(c * size, r * size, size, size);
      }
    }
  }

  // Radial view hole around firefly
  const px = playerPos.x * size;
  const py = playerPos.y * size;
  const viewR = size * GAME_CONFIG.fog.sightRadiusCells;

  const grad = ctx.createRadialGradient(px, py, viewR * 0.6, px, py, viewR);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(1, shroudColor);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(px, py, viewR, 0, Math.PI * 2);
  ctx.fill();
}
