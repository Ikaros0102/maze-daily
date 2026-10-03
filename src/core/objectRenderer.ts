import { GAME_CONFIG } from '../config/gameConfig';
import type { DailyEffectState, GridCoord, Point } from '../types/game';

export function drawHighlight(
  ctx: CanvasRenderingContext2D,
  pos: GridCoord,
  size: number,
  timeMs: number
): void {
  const cx = (pos.col + 0.5) * size;
  const cy = (pos.row + 0.5) * size;
  const pulse = Math.sin(timeMs / 280) * 0.15 + 0.85;

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.65);
  grad.addColorStop(0, `rgba(0, 240, 181, ${0.4 * pulse})`);
  grad.addColorStop(0.7, `rgba(0, 240, 181, ${0.12 * pulse})`);
  grad.addColorStop(1, 'transparent');

  ctx.fillStyle = grad;
  ctx.fillRect(pos.col * size, pos.row * size, size, size);

  ctx.fillStyle = '#00f0b5';
  ctx.beginPath();
  ctx.arc(cx, cy, 3 * pulse, 0, Math.PI * 2);
  ctx.fill();
}

export function drawGoal(
  ctx: CanvasRenderingContext2D,
  pos: GridCoord,
  size: number,
  timeMs: number
): void {
  const cx = (pos.col + 0.5) * size;
  const cy = (pos.row + 0.5) * size;
  const pulse = Math.sin(timeMs / 240) * 0.2 + 0.8;

  const grad = ctx.createRadialGradient(cx, cy, size * 0.1, cx, cy, size * 0.7);
  grad.addColorStop(0, `rgba(245, 158, 11, ${0.45 * pulse})`);
  grad.addColorStop(0.6, `rgba(245, 158, 11, ${0.18 * pulse})`);
  grad.addColorStop(1, 'transparent');

  ctx.fillStyle = grad;
  ctx.fillRect(pos.col * size, pos.row * size, size, size);

  ctx.strokeStyle = `rgba(245, 158, 11, ${0.65 * pulse})`;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pos.col * size + 2, pos.row * size + 2, size - 4, size - 4);

  ctx.fillStyle = '#f59e0b';
  ctx.font = `${Math.floor(size * 0.65)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🏁', cx, cy);
}

export function drawEffectObjects(
  ctx: CanvasRenderingContext2D,
  effect: DailyEffectState,
  size: number,
  timeMs: number
): void {
  // Portals
  if (effect.type === 'portals' && effect.portals) {
    const pulse = Math.sin(timeMs / 200) * 0.15 + 0.85;
    for (const p of [effect.portals.a, effect.portals.b]) {
      const cx = (p.col + 0.5) * size;
      const cy = (p.row + 0.5) * size;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.35 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(168, 85, 247, 0.4)';
      ctx.fill();
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Key & Gate
  if (effect.type === 'key_and_gate') {
    if (!effect.hasKey && effect.keyPos) {
      const cx = (effect.keyPos.col + 0.5) * size;
      const cy = (effect.keyPos.row + 0.5) * size;
      ctx.font = `${Math.floor(size * 0.6)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🗝️', cx, cy);
    }
    if (!effect.isGateOpen && effect.gatePos) {
      const x = effect.gatePos.col * size;
      const y = effect.gatePos.row * size;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
      ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
    }
  }

  // Fake Exits (Decoys)
  if (effect.type === 'fake_exits' && effect.fakeExits) {
    for (const f of effect.fakeExits) {
      if (!f.revealed) {
        drawGoal(ctx, f, size, timeMs);
      } else {
        const cx = (f.col + 0.5) * size;
        const cy = (f.row + 0.5) * size;
        ctx.fillStyle = 'rgba(244, 63, 94, 0.25)';
        ctx.fillRect(f.col * size, f.row * size, size, size);
        ctx.fillStyle = '#f43f5e';
        ctx.font = `${Math.floor(size * 0.55)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('❌', cx, cy);
      }
    }
  }
}

export function drawFirefly(
  ctx: CanvasRenderingContext2D,
  pos: Point,
  size: number,
  color: string,
  timeMs: number
): void {
  const cx = pos.x * size;
  const cy = pos.y * size;
  const pulse = Math.sin(timeMs / 180) * 0.12 + 0.95;
  const r = (size * GAME_CONFIG.player.sizeRatio) / 2;
  const glowR = r * GAME_CONFIG.player.glowRadiusMultiplier * pulse;

  // Soft diffused outer aura
  const aura = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, glowR * 1.5);
  aura.addColorStop(0, color + '77');
  aura.addColorStop(0.5, color + '22');
  aura.addColorStop(1, 'transparent');
  ctx.beginPath();
  ctx.arc(cx, cy, glowR * 1.5, 0, Math.PI * 2);
  ctx.fillStyle = aura;
  ctx.fill();

  // Focused vibrant inner glow
  const innerGlow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, glowR);
  innerGlow.addColorStop(0, color);
  innerGlow.addColorStop(0.5, color + 'bb');
  innerGlow.addColorStop(1, 'transparent');
  ctx.beginPath();
  ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
  ctx.fillStyle = innerGlow;
  ctx.fill();

  // Intense pure white core
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}
