/**
 * src/modules/headTracking/index.ts
 *
 * Master controller and public API for the Head Tracking Module.
 * Integrates camera acquisition, lazy MediaPipe loading, 3-second calibration,
 * continuous 5% radial deadzone kinematics, and strict lifecycle disposal.
 */

import {
  type Point2D,
  type CalibrationResult,
  type HeadTrackingConfig,
  type HeadTrackingController,
  type KinematicOptions,
  DEFAULT_KINEMATIC_OPTIONS,
  CameraError,
} from './types.ts';
import {
  requestCameraStream,
  stopCamera,
  attachAndPlayVideo,
  monitorStreamTracks,
  parseCameraError,
} from './camera.ts';
import {
  createFaceLandmarker,
  closeFaceLandmarker,
  type FaceLandmarkerType,
} from './faceLandmarker.ts';
import {
  extractNoseCoordinates,
  computeCalibrationCenter,
  processHeadVector,
  LandmarkSmoother,
} from './kinematics.ts';

export * from './types.ts';
export * from './camera.ts';
export * from './faceLandmarker.ts';
export * from './kinematics.ts';

export const MIN_CALIBRATION_SAMPLES = 10;
export const CALIBRATION_WATCHDOG_GRACE_MS = 1500;

export class HeadTrackingManager implements HeadTrackingController {
  private active = false;
  private videoElement: HTMLVideoElement | null = null;
  private mediaStream: MediaStream | null = null;
  private landmarker: FaceLandmarkerType | null = null;
  private animFrameId: number | null = null;

  // Concurrency & Cancellation tracking
  private sessionId = 0;
  private activeRequested = false;
  private stopping = false;

  private onVectorCallback: ((vec: Point2D) => void) | null = null;
  private onErrorCallback: ((err: Error) => void) | null = null;
  private onCalibrationProgressCallback: ((progress: number, remainingMs: number) => void) | null = null;

  private center: CalibrationResult | null = null;
  private readonly smoother: LandmarkSmoother;
  private readonly kinematicOptions: KinematicOptions;

  // Calibration state
  private isCalibrating = false;
  private calibrationSamples: Point2D[] = [];
  private calibrationStartTime = 0;
  private calibrationDurationMs = 3000;
  private calibrationResolve: ((res: CalibrationResult) => void) | null = null;
  private calibrationReject: ((err: Error) => void) | null = null;
  private calibrationTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Frame timing
  private lastVideoTime = -1;
  private lastProcessedTimestamp = 0;
  private unwatchTracks: (() => void) | null = null;

  constructor(options?: Partial<KinematicOptions>) {
    this.kinematicOptions = {
      ...DEFAULT_KINEMATIC_OPTIONS,
      ...options,
    };
    this.smoother = new LandmarkSmoother(this.kinematicOptions.smoothingAlpha);
  }

  isActive(): boolean {
    return this.active;
  }

  isCalibrated(): boolean {
    return this.center !== null;
  }

  getCenter(): CalibrationResult | null {
    return this.center ? { ...this.center } : null;
  }

  private isCancelled(token: number): boolean {
    return token !== this.sessionId || this.stopping || !this.activeRequested;
  }

  private cleanupAbortedStart(
    stream: MediaStream | null,
    unwatch: (() => void) | null,
    videoElement: HTMLVideoElement | null
  ): void {
    if (unwatch) {
      try {
        unwatch();
      } catch {
        // Ignore unwatch errors
      }
    }
    if (stream) {
      stopCamera(stream);
    }
    if (this.mediaStream === stream) {
      this.mediaStream = null;
    }
    if (videoElement && videoElement.srcObject === stream) {
      try {
        videoElement.pause();
      } catch {
        // Ignore pause errors
      }
      videoElement.srcObject = null;
    }
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private clearCalibrationTimer(): void {
    if (this.calibrationTimeoutId !== null) {
      clearTimeout(this.calibrationTimeoutId);
      this.calibrationTimeoutId = null;
    }
  }

  private handleCalibrationTimeout(): void {
    if (!this.isCalibrating) return;

    this.clearCalibrationTimer();

    // If sufficient samples were collected before timeout, finish gracefully
    if (this.calibrationSamples.length >= MIN_CALIBRATION_SAMPLES) {
      this.finishCalibration();
      return;
    }

    // Otherwise, face obscured or insufficient samples detected
    this.isCalibrating = false;
    const reject = this.calibrationReject;
    this.calibrationResolve = null;
    this.calibrationReject = null;
    this.calibrationSamples = [];

    if (reject) {
      reject(new Error('CALIBRATION_TIMEOUT'));
    }
  }

  /**
   * Starts head tracking: acquires camera, attaches video, initializes FaceLandmarker,
   * and starts the continuous inference loop.
   */
  async start(config: HeadTrackingConfig): Promise<void> {
    // 1. Unconditionally terminate any previous session or in-flight startup
    this.stop();

    // 2. Mint new session token and mark request as active
    const token = ++this.sessionId;
    this.activeRequested = true;

    this.videoElement = config.videoElement;
    this.onVectorCallback = config.onVector;
    this.onErrorCallback = config.onError;
    this.onCalibrationProgressCallback = config.onCalibrationProgress ?? null;

    let stream: MediaStream | null = null;
    let unwatch: (() => void) | null = null;

    try {
      // Step 1: Acquire camera stream
      stream = await requestCameraStream();

      // Guard 1: Verify session validity after camera acquisition
      if (this.isCancelled(token)) {
        stopCamera(stream);
        return;
      }

      this.mediaStream = stream;

      // Step 2: Monitor hardware disconnection mid-game
      unwatch = monitorStreamTracks(stream, (code) => {
        this.handleError(new CameraError(code, 'Webcam device was disconnected during gameplay.'));
      });
      this.unwatchTracks = unwatch;

      // Guard 2: Verify before video attachment
      if (this.isCancelled(token)) {
        this.cleanupAbortedStart(stream, unwatch, config.videoElement);
        return;
      }

      // Step 3: Attach stream to video element and await playback
      await attachAndPlayVideo(config.videoElement, stream);

      // Guard 3: Verify session validity after video playback
      if (this.isCancelled(token)) {
        this.cleanupAbortedStart(stream, unwatch, config.videoElement);
        return;
      }

      // Step 4: Initialize MediaPipe FaceLandmarker lazily if not already created
      if (!this.landmarker) {
        const createdLandmarker = await createFaceLandmarker();

        // Guard 4: Verify session validity after model creation
        if (this.isCancelled(token)) {
          closeFaceLandmarker(createdLandmarker);
          this.cleanupAbortedStart(stream, unwatch, config.videoElement);
          return;
        }

        this.landmarker = createdLandmarker;
      }

      // Final Guard before state commitment
      if (this.isCancelled(token)) {
        this.cleanupAbortedStart(stream, unwatch, config.videoElement);
        return;
      }

      // Step 5: Commit active state and launch frame loop
      this.active = true;
      this.lastVideoTime = -1;
      this.lastProcessedTimestamp = 0;
      this.smoother.reset();
      this.startLoop();
    } catch (err) {
      if (this.isCancelled(token)) {
        this.cleanupAbortedStart(stream, unwatch, config.videoElement);
        return;
      }

      const parsed = parseCameraError(err);
      this.stop();
      throw parsed;
    }
  }

  /**
   * Starts a 3-second calibration sequence over live frames to determine neutral head position.
   */
  calibrate(durationMs = 3000): Promise<CalibrationResult> {
    if (!this.active || !this.videoElement) {
      return Promise.reject(new Error('Head tracking must be active to calibrate.'));
    }

    if (this.isCalibrating) {
      this.clearCalibrationTimer();
      if (this.calibrationReject) {
        // Abort previous pending calibration
        this.calibrationReject(new Error('Previous calibration superseded.'));
      }
    }

    this.isCalibrating = true;
    this.calibrationSamples = [];
    this.calibrationStartTime = performance.now();
    this.calibrationDurationMs = durationMs;

    const timeoutMs = durationMs + CALIBRATION_WATCHDOG_GRACE_MS;
    this.calibrationTimeoutId = setTimeout(() => {
      this.handleCalibrationTimeout();
    }, timeoutMs);

    return new Promise<CalibrationResult>((resolve, reject) => {
      this.calibrationResolve = resolve;
      this.calibrationReject = reject;
    });
  }

  /**
   * Stops active tracking, releases camera tracks, stops rAF loop, and immediately zeroes
   * control vector to prevent player character drift.
   */
  stop(): void {
    this.activeRequested = false;
    this.stopping = true;
    this.sessionId++;
    this.active = false;

    // 1. Cancel requestAnimationFrame
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    // 2. Unwatch tracks
    if (this.unwatchTracks) {
      this.unwatchTracks();
      this.unwatchTracks = null;
    }

    // 3. Stop physical webcam hardware
    if (this.mediaStream) {
      stopCamera(this.mediaStream);
      this.mediaStream = null;
    }

    // 4. Detach video
    if (this.videoElement) {
      try {
        this.videoElement.pause();
      } catch {
        // Ignore pause error
      }
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    // 5. Abort in-flight calibration if any
    this.clearCalibrationTimer();
    if (this.isCalibrating && this.calibrationReject) {
      this.calibrationReject(new Error('Calibration cancelled due to tracking stop.'));
    }
    this.isCalibrating = false;
    this.calibrationResolve = null;
    this.calibrationReject = null;
    this.calibrationSamples = [];

    // 6. Reset landmark filter
    this.smoother.reset();

    // 7. Immediately emit neutral vector so keyboard controls work unimpeded
    if (this.onVectorCallback) {
      this.onVectorCallback({ x: 0, y: 0 });
    }

    this.stopping = false;
  }

  /**
   * Full teardown: stops tracking and frees MediaPipe WebAssembly / WebGL heap.
   */
  close(): void {
    this.stop();

    if (this.landmarker) {
      closeFaceLandmarker(this.landmarker);
      this.landmarker = null;
    }

    this.center = null;
    this.onVectorCallback = null;
    this.onErrorCallback = null;
    this.onCalibrationProgressCallback = null;
  }

  private startLoop(): void {
    if (!this.active) return;

    const onFrame = () => {
      if (!this.active) return;

      const video = this.videoElement;
      if (
        video &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        // Only run inference when video frame changes
        if (video.currentTime !== this.lastVideoTime) {
          this.lastVideoTime = video.currentTime;

          // Strictly monotonic timestamp required by MediaPipe Tasks Vision
          let now = performance.now();
          if (now <= this.lastProcessedTimestamp) {
            now = this.lastProcessedTimestamp + 1;
          }
          this.lastProcessedTimestamp = now;

          this.processFrame(video, now);
        }
      }

      if (this.active) {
        this.animFrameId = requestAnimationFrame(onFrame);
      }
    };

    this.animFrameId = requestAnimationFrame(onFrame);
  }

  private processFrame(video: HTMLVideoElement, timestamp: number): void {
    if (!this.landmarker) return;

    try {
      const result = this.landmarker.detectForVideo(video, timestamp);
      const facePoints = result.faceLandmarks?.[0];
      const nose = extractNoseCoordinates(facePoints);

      if (this.isCalibrating) {
        const elapsed = performance.now() - this.calibrationStartTime;
        const progress = Math.min(1.0, elapsed / this.calibrationDurationMs);
        const remainingMs = Math.max(0, this.calibrationDurationMs - elapsed);

        this.onCalibrationProgressCallback?.(progress, remainingMs);

        if (nose) {
          const smoothedNose = this.smoother.filter(nose);
          this.calibrationSamples.push(smoothedNose);
        } else {
          this.smoother.reset();
        }

        // Neutral vector during calibration so player character does not wander
        this.onVectorCallback?.({ x: 0, y: 0 });

        if (elapsed >= this.calibrationDurationMs) {
          if (this.calibrationSamples.length >= MIN_CALIBRATION_SAMPLES) {
            this.finishCalibration();
          } else if (elapsed >= this.calibrationDurationMs + CALIBRATION_WATCHDOG_GRACE_MS) {
            this.handleCalibrationTimeout();
          }
        }
      } else if (nose) {
        const smoothedNose = this.smoother.filter(nose);
        if (this.center) {
          const vector = processHeadVector(
            smoothedNose.x,
            smoothedNose.y,
            this.center.centerX,
            this.center.centerY,
            this.kinematicOptions
          );
          this.onVectorCallback?.(vector);
        } else {
          this.onVectorCallback?.({ x: 0, y: 0 });
        }
      } else {
        // Face lost in current frame: immediately emit neutral vector
        this.smoother.reset();
        this.onVectorCallback?.({ x: 0, y: 0 });
      }
    } catch (err) {
      console.warn('[HeadTracking] Inference tick failed:', err);
    }
  }

  private finishCalibration(): void {
    this.clearCalibrationTimer();
    this.isCalibrating = false;

    try {
      if (this.calibrationSamples.length < MIN_CALIBRATION_SAMPLES) {
        throw new Error('CALIBRATION_TIMEOUT');
      }

      const result = computeCalibrationCenter(this.calibrationSamples);
      this.center = result;

      if (this.calibrationResolve) {
        this.calibrationResolve(result);
      }
    } catch (err) {
      if (this.calibrationReject) {
        this.calibrationReject(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      this.calibrationResolve = null;
      this.calibrationReject = null;
      this.calibrationSamples = [];
    }
  }

  private handleError(error: Error): void {
    this.stop();
    if (this.onErrorCallback) {
      this.onErrorCallback(error);
    }
  }
}

/**
 * Creates a new instance of HeadTrackingController.
 */
export function createHeadTrackingController(
  options?: Partial<KinematicOptions>
): HeadTrackingController {
  return new HeadTrackingManager(options);
}

/**
 * Default singleton instance of the HeadTrackingController.
 */
export const headTrackingController: HeadTrackingController = new HeadTrackingManager();
