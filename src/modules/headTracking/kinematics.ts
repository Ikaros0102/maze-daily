/**
 * src/modules/headTracking/kinematics.ts
 *
 * Kinematic calculations, nose tip extraction, median-based calibration,
 * continuous radial deadzone filtering, camera mirroring inversion, and EMA smoothing.
 */

import {
  type Point2D,
  type NormalizedLandmark,
  type KinematicOptions,
  type CalibrationResult,
  DEFAULT_KINEMATIC_OPTIONS,
} from './types.ts';

/**
 * Extracts nose coordinates from MediaPipe normalized landmarks.
 * Uses Landmark #1 (pronasale, apex of nose) as primary, with Landmark #4
 * (subnasale, columella junction) as anatomical fallback.
 */
export function extractNoseCoordinates(
  landmarks: NormalizedLandmark[] | undefined | null,
  primaryIndex = 1,
  fallbackIndex = 4
): Point2D | null {
  if (!landmarks || landmarks.length === 0) {
    return null;
  }

  const point = landmarks[primaryIndex] ?? landmarks[fallbackIndex];
  if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
    return null;
  }

  // Basic sanity check: normalized coordinates must be within [0, 1] range
  if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
    return null;
  }

  return {
    x: point.x,
    y: point.y,
  };
}

/**
 * Calculates component-wise median of an array of numbers.
 */
export function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Computes a robust calibration center point from a collection of sampled coordinates.
 * Uses component-wise median for 50% breakdown point resistance against posture shifts or twitches.
 */
export function computeCalibrationCenter(
  samples: Point2D[]
): CalibrationResult {
  if (samples.length === 0) {
    // Default to optical center if no samples
    return {
      centerX: 0.5,
      centerY: 0.5,
      sampleCount: 0,
      variance: 0,
    };
  }

  const xs = samples.map((s) => s.x);
  const ys = samples.map((s) => s.y);

  const centerX = computeMedian(xs);
  const centerY = computeMedian(ys);

  // Compute root-mean-square variance from median center
  let sumSq = 0;
  for (const s of samples) {
    const dx = s.x - centerX;
    const dy = s.y - centerY;
    sumSq += dx * dx + dy * dy;
  }
  const variance = Math.sqrt(sumSq / samples.length);

  return {
    centerX,
    centerY,
    sampleCount: samples.length,
    variance,
  };
}

/**
 * Transforms raw nose coordinates into a normalized direction vector [-1.0 .. +1.0]:
 * 1. Horizontal mirroring: deltaX = centerX - noseX (tilting right moves firefly right).
 * 2. Vertical mapping: deltaY = noseY - centerY (nodding down moves firefly down).
 * 3. 5% Continuous radial deadzone: if Euclidean distance r < 0.05, output is { x: 0, y: 0 }.
 * 4. For r >= 0.05, smoothly scales vector from 0.0 up to 1.0 at maxDeviation.
 */
export function processHeadVector(
  noseX: number,
  noseY: number,
  centerX: number,
  centerY: number,
  options: KinematicOptions = DEFAULT_KINEMATIC_OPTIONS
): Point2D {
  // 1. Horizontal selfie mirror inversion; vertical screen coordinates
  const deltaX = centerX - noseX;
  const deltaY = noseY - centerY;

  // 2. Euclidean radial distance from neutral center
  const r = Math.hypot(deltaX, deltaY);

  // 3. Radial deadzone cutoff
  if (r < options.deadzoneRadius || r === 0) {
    return { x: 0, y: 0 };
  }

  // 4. Continuous scaled radial deadzone (prevents step discontinuity at boundary)
  const range = options.maxDeviation - options.deadzoneRadius;
  if (range <= 0) {
    return { x: 0, y: 0 };
  }

  const normalizedMagnitude = Math.min(1.0, Math.max(0.0, (r - options.deadzoneRadius) / range));

  // 5. Response curve shaping
  const shapedMagnitude = options.curveExponent === 1.0
    ? normalizedMagnitude
    : Math.pow(normalizedMagnitude, options.curveExponent);

  // 6. Unit vector projection
  const unitX = deltaX / r;
  const unitY = deltaY / r;

  return {
    x: unitX * shapedMagnitude,
    y: unitY * shapedMagnitude,
  };
}

/**
 * Exponential Moving Average (EMA) low-pass filter for suppressing landmark high-frequency jitter.
 */
export class LandmarkSmoother {
  private current: Point2D | null = null;
  private readonly alpha: number;

  constructor(alpha = 0.35) {
    this.alpha = Math.max(0.01, Math.min(1.0, alpha));
  }

  filter(point: Point2D): Point2D {
    if (!this.current) {
      this.current = { x: point.x, y: point.y };
      return this.current;
    }

    this.current.x = this.alpha * point.x + (1 - this.alpha) * this.current.x;
    this.current.y = this.alpha * point.y + (1 - this.alpha) * this.current.y;

    return { x: this.current.x, y: this.current.y };
  }

  reset(): void {
    this.current = null;
  }
}
