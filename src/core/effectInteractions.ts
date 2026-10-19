import { GAME_CONFIG } from '../config/gameConfig';
import { revealFogRadius } from './effects';
import type {
  DailyEffectState,
  GlitchTransform,
  MazeCell,
  Point,
} from '../types/game';

export interface InteractionResult {
  updatedEffect: DailyEffectState;
  newPosition?: Point;
  newCooldown?: number;
}

const GLITCH_TRANSFORMS: GlitchTransform[] = [
  'rotate_cw',
  'rotate_ccw',
  'flip_h',
  'flip_v',
];

export function handleInteractiveElements(
  pos: Point,
  now: number,
  effect: DailyEffectState,
  portalCooldown: number,
  grid?: MazeCell[][],
  elapsedSec?: number
): InteractionResult | null {
  if (!effect.enabled) return null;

  // 1. Fog of War (Line-of-Sight BFS through open walls)
  if (effect.type === 'fog_of_war' && effect.fogRevealed) {
    revealFogRadius(
      effect.fogRevealed,
      pos.x,
      pos.y,
      3,
      GAME_CONFIG.maze.cols,
      GAME_CONFIG.maze.rows,
      grid
    );
    return null;
  }

  // 2. Portals (Multi-pair split-guarded portals)
  if (effect.type === 'portals' && effect.portals && now > portalCooldown) {
    for (const pair of effect.portals) {
      const distA = Math.hypot(pos.x - (pair.a.col + 0.5), pos.y - (pair.a.row + 0.5));
      const distB = Math.hypot(pos.x - (pair.b.col + 0.5), pos.y - (pair.b.row + 0.5));

      if (distA < 0.45) {
        return {
          updatedEffect: effect,
          newPosition: { x: pair.b.col + 0.5, y: pair.b.row + 0.5 },
          newCooldown: now + 1200,
        };
      }
      if (distB < 0.45) {
        return {
          updatedEffect: effect,
          newPosition: { x: pair.a.col + 0.5, y: pair.a.row + 0.5 },
          newCooldown: now + 1200,
        };
      }
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

  // 5. Glitch Modifier Runtime State Machine
  if (effect.type === 'glitch' && typeof elapsedSec === 'number') {
    const interval = GAME_CONFIG.glitch.intervalSec;
    const warnDuration = GAME_CONFIG.glitch.warningDurationSec;
    const staticDuration = GAME_CONFIG.glitch.staticDurationMs / 1000;

    const nextSec = effect.glitchNextSec ?? interval;
    const cycle = effect.glitchCycle ?? 0;

    // Warning phase: 1.5s before transformation
    const isWarning = elapsedSec >= nextSec - warnDuration && elapsedSec < nextSec;

    // Static burst phase: [nextSec, nextSec + 0.3s]
    const isStatic = elapsedSec >= nextSec && elapsedSec < nextSec + staticDuration;

    // Check if new cycle should trigger
    if (elapsedSec >= nextSec && (!effect.glitchTransform || effect.glitchTransform === 'none' || (effect.glitchCycle ?? 0) === cycle)) {
      if (isStatic && !effect.glitchStatic) {
        // Just entered static burst phase: select next deterministic transform
        const nextTransform = GLITCH_TRANSFORMS[cycle % GLITCH_TRANSFORMS.length];
        return {
          updatedEffect: {
            ...effect,
            glitchWarning: false,
            glitchStatic: true,
            glitchTransform: nextTransform,
            glitchCycle: cycle + 1,
          },
        };
      }
    }

    // Advance to next cycle schedule once static burst ends
    if (elapsedSec >= nextSec + staticDuration && (effect.glitchStatic || effect.glitchWarning)) {
      return {
        updatedEffect: {
          ...effect,
          glitchWarning: false,
          glitchStatic: false,
          glitchNextSec: nextSec + interval,
        },
      };
    }

    // Toggle warning flag
    if (isWarning !== Boolean(effect.glitchWarning)) {
      return {
        updatedEffect: {
          ...effect,
          glitchWarning: isWarning,
          glitchStatic: false,
        },
      };
    }
  }

  return null;
}
