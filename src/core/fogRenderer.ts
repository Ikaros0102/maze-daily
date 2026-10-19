import type { DailyEffectState, MazeCell, Point } from '../types/game';

let offscreenCanvas: HTMLCanvasElement | null = null;
let offscreenCtx: CanvasRenderingContext2D | null = null;

function getOffscreenCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} | null {
  if (typeof document === 'undefined') return null;

  if (!offscreenCanvas) {
    offscreenCanvas = document.createElement('canvas');
  }

  const roundedW = Math.ceil(width);
  const roundedH = Math.ceil(height);

  if (offscreenCanvas.width !== roundedW || offscreenCanvas.height !== roundedH) {
    offscreenCanvas.width = roundedW;
    offscreenCanvas.height = roundedH;
    offscreenCtx = offscreenCanvas.getContext('2d');
  } else if (!offscreenCtx) {
    offscreenCtx = offscreenCanvas.getContext('2d');
  }

  if (!offscreenCtx) return null;
  return { canvas: offscreenCanvas, ctx: offscreenCtx };
}

export function renderFogOverlay(
  ctx: CanvasRenderingContext2D,
  grid: MazeCell[][],
  effect: DailyEffectState,
  _playerPos: Point,
  size: number,
  isDarkTheme: boolean
): void {
  const rows = grid.length;
  const cols = grid[0].length;
  const totalW = cols * size;
  const totalH = rows * size;
  const shroudColor = isDarkTheme ? '#0b0c10' : '#e2e8f0';

  const offscreen = getOffscreenCanvas(totalW, totalH);

  if (offscreen) {
    const { canvas: maskCanvas, ctx: maskCtx } = offscreen;

    // 1. Fill entire mask uniformly with 100% solid shroud color (zero wall leaks)
    maskCtx.globalCompositeOperation = 'source-over';
    maskCtx.fillStyle = shroudColor;
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    // 2. Punch out revealed tiles using destination-out with 1px overlap (zero subpixel seams)
    maskCtx.globalCompositeOperation = 'destination-out';
    maskCtx.fillStyle = '#000000';

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (effect.fogRevealed?.[r]?.[c]) {
          maskCtx.fillRect(
            c * size - 0.5,
            r * size - 0.5,
            size + 1.0,
            size + 1.0
          );
        }
      }
    }

    // Reset composite operation
    maskCtx.globalCompositeOperation = 'source-over';

    // 3. Composite solid shroud over scene canvas
    ctx.drawImage(maskCanvas, 0, 0);
  } else {
    // Fallback for non-DOM mock environments
    ctx.fillStyle = shroudColor;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!effect.fogRevealed?.[r]?.[c]) {
          ctx.fillRect(c * size - 0.5, r * size - 0.5, size + 1.0, size + 1.0);
        }
      }
    }
  }
}
