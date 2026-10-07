/**
 * src/modules/headTracking/types.ts
 *
 * Core interfaces, error classes, and configuration types for the
 * Maze Daily Head Tracking Accessibility Module.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface NormalizedLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface KinematicOptions {
  /** Radius of deadzone around center in normalized [0, 1] space. Default: 0.05 (5%) */
  deadzoneRadius: number;
  /** Maximum head deviation from center that scales to 1.0 output vector. Default: 0.15 */
  maxDeviation: number;
  /** Response curve exponent (1.0 = linear, 1.2 = soft center). Default: 1.0 */
  curveExponent: number;
  /** Exponential Moving Average smoothing factor (0..1). Default: 0.35 */
  smoothingAlpha: number;
}

export const DEFAULT_KINEMATIC_OPTIONS: KinematicOptions = {
  deadzoneRadius: 0.05,
  maxDeviation: 0.15,
  curveExponent: 1.0,
  smoothingAlpha: 0.35,
};

export type CameraErrorCode =
  | 'NOT_ALLOWED'
  | 'NOT_FOUND'
  | 'NOT_READABLE'
  | 'OVERCONSTRAINED'
  | 'SECURITY_ERROR'
  | 'UNSUPPORTED'
  | 'DISCONNECTED'
  | 'UNKNOWN';

export class CameraError extends Error {
  readonly code: CameraErrorCode;
  readonly originalError?: unknown;

  constructor(code: CameraErrorCode, message: string, originalError?: unknown) {
    super(message);
    this.name = 'CameraError';
    this.code = code;
    this.originalError = originalError;
  }
}

export interface CalibrationResult {
  centerX: number;
  centerY: number;
  sampleCount?: number;
  variance?: number;
}

export interface HeadTrackingConfig {
  videoElement: HTMLVideoElement;
  onVector: (vector: Point2D) => void;
  onError: (error: Error) => void;
  onCalibrationProgress?: (progress: number, remainingMs: number) => void;
}

export interface HeadTrackingController {
  start: (config: HeadTrackingConfig) => Promise<void>;
  stop: () => void;
  calibrate: (durationMs?: number) => Promise<CalibrationResult>;
  isCalibrated: () => boolean;
  isActive: () => boolean;
  close: () => void;
  getCenter: () => CalibrationResult | null;
}
