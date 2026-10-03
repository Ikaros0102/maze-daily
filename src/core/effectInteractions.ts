import { revealFogRadius } from './effects';
import type { DailyEffectState, Point } from '../types/game';

export interface InteractionResult {
  updatedEffect: DailyEffectState;
  newPosition?: Point;
  newCooldown?: number;
}

export function handleInteractiveElements(
  pos: Point,
  now: number,
  effect: DailyEffectState,
  portalCooldown: number
): InteractionResult | null {
  if (!effect.enabled) return null;

  // 1. Fog of War
  if (effect.type === 'fog_of_war' && effect.fogRevealed) {
    revealFogRadius(effect.fogRevealed, pos.x, pos.y);
    return null;
  }

  // 2. Portals
  if (effect.type === 'portals' && effect.portals && now > portalCooldown) {
    const { a, b } = effect.portals;
    const distA = Math.hypot(pos.x - (a.col + 0.5), pos.y - (a.row + 0.5));
    const distB = Math.hypot(pos.x - (b.col + 0.5), pos.y - (b.row + 0.5));

    if (distA < 0.45) {
      return {
        updatedEffect: effect,
        newPosition: { x: b.col + 0.5, y: b.row + 0.5 },
        newCooldown: now + 1200,
      };
    }
    if (distB < 0.45) {
      return {
        updatedEffect: effect,
        newPosition: { x: a.col + 0.5, y: a.row + 0.5 },
        newCooldown: now + 1200,
      };
    }
  }

  // 3. Key & Gate
  if (effect.type === 'key_and_gate' && !effect.hasKey && effect.keyPos) {
    const distKey = Math.hypot(
      pos.x - (effect.keyPos.col + 0.5),
      pos.y - (effect.keyPos.row + 0.5)
    );
    if (distKey < 0.45) {
      return {
        updatedEffect: { ...effect, hasKey: true, isGateOpen: true },
      };
    }
  }

  // 4. Fake Exits
  if (effect.type === 'fake_exits' && effect.fakeExits) {
    const col = Math.floor(pos.x);
    const row = Math.floor(pos.y);
    const target = effect.fakeExits.find((f) => !f.revealed && f.col === col && f.row === row);
    if (target) {
      const updatedExits = effect.fakeExits.map((f) =>
        f.col === col && f.row === row ? { ...f, revealed: true } : f
      );
      return {
        updatedEffect: { ...effect, fakeExits: updatedExits },
      };
    }
  }

  return null;
}
