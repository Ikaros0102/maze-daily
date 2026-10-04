import { AVAILABLE_EFFECTS, getEnabledEffects, type EffectMeta } from '../config/gameConfig';
import { getDayIndex } from '../utils/date';
import { createRNG } from '../utils/prng';

/**
 * In-memory cache of generated shuffle bags to avoid recomputing past cycles.
 */
const cycleBagCache = new Map<number, EffectMeta[]>();
let highestCachedCycle = -1;

/**
 * Generates a deterministic shuffle bag of all enabled effects for a given cycle.
 *
 * Guarantees:
 * 1. Each enabled effect appears exactly once per cycle (no droughts).
 * 2. No repeats across cycle seams: the first effect of cycle C is guaranteed
 *    to differ from the last effect of cycle C - 1.
 */
export function getEffectBagForCycle(targetCycle: number): EffectMeta[] {
  const normalizedTarget = Math.max(0, targetCycle);

  if (cycleBagCache.has(normalizedTarget)) {
    return cycleBagCache.get(normalizedTarget)!;
  }

  const enabledEffects = getEnabledEffects();
  if (enabledEffects.length === 0) {
    return [];
  }
  if (enabledEffects.length === 1) {
    return [enabledEffects[0]];
  }

  // Sequentially generate and cache bags up to targetCycle to maintain unbroken seam history
  for (let c = highestCachedCycle + 1; c <= normalizedTarget; c++) {
    const prevBag = c > 0 ? cycleBagCache.get(c - 1) : null;
    const prevLastType = prevBag && prevBag.length > 0 ? prevBag[prevBag.length - 1].type : null;

    // Cycle-specific deterministic PRNG stream
    const seed = `effects_shuffle_bag_v1_${c}`;
    const rng = createRNG(seed);

    // Initial Fisher-Yates shuffle of all enabled effects
    const bag = rng.shuffle([...enabledEffects]);

    // Seam repeat prevention:
    // If the first item of this cycle matches the last item of the previous cycle,
    // swap it with another item at index 1..length-1.
    if (prevLastType !== null && bag[0].type === prevLastType) {
      const swapIdx = rng.nextInt(1, bag.length - 1);
      const temp = bag[0];
      bag[0] = bag[swapIdx];
      bag[swapIdx] = temp;
    }

    cycleBagCache.set(c, bag);
    highestCachedCycle = c;
  }

  return cycleBagCache.get(normalizedTarget)!;
}

/**
 * Retrieves the daily effect metadata for a specific 0-based day index.
 */
export function getDailyEffectMetaByDayIndex(dayIndex: number): EffectMeta {
  const enabledEffects = getEnabledEffects();
  if (enabledEffects.length === 0) {
    return AVAILABLE_EFFECTS[0];
  }

  const cycle = Math.floor(dayIndex / enabledEffects.length);
  const slot = dayIndex % enabledEffects.length;
  const bag = getEffectBagForCycle(cycle);

  return bag[slot] || enabledEffects[0];
}

/**
 * Retrieves the daily effect metadata for a date string (YYYY-MM-DD) or Date object.
 */
export function getDailyEffectMetaForDate(dateStrOrDate: string | Date = new Date()): EffectMeta {
  const dayIndex = getDayIndex(dateStrOrDate);
  return getDailyEffectMetaByDayIndex(dayIndex);
}

/**
 * Resets the cycle bag cache (useful for automated testing).
 */
export function clearEffectBagCache(): void {
  cycleBagCache.clear();
  highestCachedCycle = -1;
}
