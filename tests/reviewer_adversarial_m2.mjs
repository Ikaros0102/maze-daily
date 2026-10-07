/**
 * tests/reviewer_adversarial_m2.mjs
 *
 * Independent Adversarial Verification Suite for Milestone 2 Head Tracking.
 * Authored by reviewer_critic (teamwork_preview_reviewer_m2_eval_2).
 */

import {
  HeadTrackingManager,
  CameraError,
  parseCameraError,
  assertCameraSupport,
  requestCameraStream,
  stopCamera,
  attachAndPlayVideo,
  monitorStreamTracks,
  extractNoseCoordinates,
  computeCalibrationCenter,
  computeMedian,
  processHeadVector,
  LandmarkSmoother,
  MIN_CALIBRATION_SAMPLES,
  CALIBRATION_WATCHDOG_GRACE_MS,
} from '../src/modules/headTracking/index.ts';

const adversarialResults = [];

function check(testName, passed, detail = '') {
  adversarialResults.push({ testName, passed, detail });
  if (passed) {
    console.log(`[PASS] ${testName}`);
  } else {
    console.error(`[FAIL] ${testName}: ${detail}`);
  }
}

// Mock structures
class MockTrack {
  constructor(id = 'track') {
    this.id = id;
    this.readyState = 'live';
    this.stopCalls = 0;
    this.listeners = {};
  }
  stop() {
    this.stopCalls++;
    this.readyState = 'ended';
  }
  addEventListener(event, fn) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(fn);
  }
  removeEventListener(event, fn) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((f) => f !== fn);
    }
  }
  triggerEnded() {
    this.readyState = 'ended';
    (this.listeners['ended'] || []).forEach((fn) => fn());
  }
}

class MockStream {
  constructor(tracks = []) {
    this.tracks = tracks;
  }
  getTracks() {
    return [...this.tracks];
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.id.startsWith('video') || t.kind !== 'audio');
  }
}

class MockVideo {
  constructor() {
    this.srcObject = null;
    this.readyState = 4;
    this.videoWidth = 640;
    this.videoHeight = 480;
    this.currentTime = 0;
    this.paused = false;
  }
  setAttribute() {}
  async play() {
    this.paused = false;
  }
  pause() {
    this.paused = true;
  }
}

function mockLandmarker() {
  let closed = false;
  return {
    detectForVideo: () => ({
      faceLandmarks: [[{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }]],
    }),
    close: () => {
      closed = true;
    },
    isClosed: () => closed,
  };
}

// Browser Globals
globalThis.window = {
  isSecureContext: true,
  location: { hostname: 'localhost' },
};
globalThis.HTMLMediaElement = {
  HAVE_CURRENT_DATA: 2,
};
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

async function runAdversarialTests() {
  console.log('=== RUNNING ADVERSARIAL STRESS TESTS FOR M2 ===\n');

  // -------------------------------------------------------------
  // Test 1: Math & Kinematic Boundary & Resilience Checks
  // -------------------------------------------------------------
  console.log('--- 1. Kinematic & Landmark Math Boundaries ---');
  
  // Median calculation
  check('computeMedian empty array returns 0', computeMedian([]) === 0);
  check('computeMedian single element', computeMedian([42]) === 42);
  check('computeMedian odd length', computeMedian([1, 10, 5]) === 5);
  check('computeMedian even length', computeMedian([1, 2, 8, 10]) === 5); // (2+8)/2 = 5
  check('computeMedian outlier resilience', computeMedian([0.5, 0.51, 0.49, 0.99, 0.50]) === 0.50);

  // Calibration center
  const centerEmpty = computeCalibrationCenter([]);
  check('computeCalibrationCenter empty falls back to (0.5, 0.5)', centerEmpty.centerX === 0.5 && centerEmpty.centerY === 0.5);
  const centerNormal = computeCalibrationCenter([
    { x: 0.49, y: 0.51 },
    { x: 0.50, y: 0.50 },
    { x: 0.51, y: 0.49 },
    { x: 0.99, y: 0.99 }, // wild outlier twitch
  ]);
  check('computeCalibrationCenter resists outlier twitch', Math.abs(centerNormal.centerX - 0.505) < 0.01 && centerNormal.sampleCount === 4);

  // Nose extraction
  check('extractNoseCoordinates null/undefined returns null', extractNoseCoordinates(null) === null && extractNoseCoordinates([]) === null);
  check('extractNoseCoordinates out-of-bounds coordinates return null', extractNoseCoordinates([{ x: 0, y: 0 }, { x: 1.5, y: 0.5 }]) === null);
  check('extractNoseCoordinates uses primary landmark #1', (() => {
    const coords = extractNoseCoordinates([
      { x: 0, y: 0 },
      { x: 0.45, y: 0.55 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0.40, y: 0.60 },
    ]);
    return coords?.x === 0.45 && coords?.y === 0.55;
  })());
  check('extractNoseCoordinates falls back to anatomical landmark #4', (() => {
    const list = [{ x: 0, y: 0 }];
    list[4] = { x: 0.42, y: 0.58 };
    const coords = extractNoseCoordinates(list);
    return coords?.x === 0.42 && coords?.y === 0.58;
  })());

  // Deadzone & Kinematics
  const center = { x: 0.5, y: 0.5 };
  check('processHeadVector exact center yields {0,0}', (() => {
    const v = processHeadVector(0.5, 0.5, center.x, center.y);
    return v.x === 0 && v.y === 0;
  })());
  check('processHeadVector within 5% deadzone (r=0.03) yields {0,0}', (() => {
    const v = processHeadVector(0.52, 0.52, center.x, center.y); // r ~ 0.028
    return v.x === 0 && v.y === 0;
  })());
  check('processHeadVector outside deadzone scales smoothly', (() => {
    // nose moved left (noseX = 0.4, deltaX = 0.1), same Y
    const v = processHeadVector(0.4, 0.5, center.x, center.y);
    // r = 0.1, deadzone = 0.05, maxDev = 0.15 -> range = 0.10 -> normMag = (0.1 - 0.05) / 0.1 = 0.5
    // deltaX > 0 -> unitX = 1, unitY = 0 -> output = { x: 0.5, y: 0 }
    return Math.abs(v.x - 0.5) < 0.001 && Math.abs(v.y) < 0.001;
  })());
  check('processHeadVector beyond maxDeviation is clamped to 1.0', (() => {
    const v = processHeadVector(0.2, 0.5, center.x, center.y); // deltaX = 0.3 > 0.15
    return Math.abs(v.x - 1.0) < 0.001 && Math.abs(v.y) < 0.001;
  })());

  // Landmark smoother
  const smoother = new LandmarkSmoother(0.5);
  const p1 = smoother.filter({ x: 0.5, y: 0.5 });
  check('LandmarkSmoother initializes on first point', p1.x === 0.5 && p1.y === 0.5);
  const p2 = smoother.filter({ x: 0.7, y: 0.7 });
  check('LandmarkSmoother applies EMA correctly', Math.abs(p2.x - 0.6) < 0.001);
  smoother.reset();
  const p3 = smoother.filter({ x: 0.8, y: 0.8 });
  check('LandmarkSmoother reset reinitializes', p3.x === 0.8 && p3.y === 0.8);

  // -------------------------------------------------------------
  // Test 2: Concurrent start() churn with randomized async delays
  // -------------------------------------------------------------
  console.log('\n--- 2. High-Concurrency Stress Churn ---');
  {
    const tracksCreated = [];
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        mediaDevices: {
          getUserMedia: async () => {
            const track = new MockTrack(`video-${tracksCreated.length}`);
            tracksCreated.push(track);
            // Random delay 5ms - 20ms
            await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 15) + 5));
            return new MockStream([track]);
          },
        },
      },
      configurable: true,
      writable: true,
    });

    const manager = new HeadTrackingManager();
    manager.landmarker = mockLandmarker();
    const video = new MockVideo();

    // Fire 10 concurrent starts
    const startPromises = [];
    for (let i = 0; i < 10; i++) {
      startPromises.push(
        manager.start({
          videoElement: video,
          onVector: () => {},
          onError: () => {},
        })
      );
    }

    await Promise.allSettled(startPromises);

    // Now manager is running the 10th session. Verify earlier 9 tracks were stopped!
    const stoppedCount = tracksCreated.filter((t) => t.readyState === 'ended').length;
    check('Superseded sessions stopped their tracks', stoppedCount >= 9, `Stopped: ${stoppedCount} / ${tracksCreated.length}`);

    // Call stop()
    manager.stop();
    const finalStoppedCount = tracksCreated.filter((t) => t.readyState === 'ended').length;
    check('All 10 tracks stopped after final stop()', finalStoppedCount === 10, `Stopped: ${finalStoppedCount} / 10`);
    check('Manager isActive is false', manager.isActive() === false);
  }

  // -------------------------------------------------------------
  // Test 3: sessionId Invalidation on In-flight Cancellation
  // -------------------------------------------------------------
  console.log('\n--- 3. sessionId Invalidation on In-Flight Cancellation ---');
  {
    let resolveMedia;
    const slowTrack = new MockTrack('slow-track');
    globalThis.navigator.mediaDevices.getUserMedia = () => {
      return new Promise((resolve) => {
        resolveMedia = () => resolve(new MockStream([slowTrack]));
      });
    };

    const manager = new HeadTrackingManager();
    manager.landmarker = mockLandmarker();
    const video = new MockVideo();

    const startP = manager.start({
      videoElement: video,
      onVector: () => {},
      onError: () => {},
    });

    // Invalidate immediately
    manager.stop();

    // Now resolve the camera promise
    resolveMedia();
    await startP;

    check('Slow track stopped when resolved after stop()', slowTrack.readyState === 'ended' && slowTrack.stopCalls === 1);
    check('Manager remains inactive after slow track resolves', manager.isActive() === false);
  }

  // -------------------------------------------------------------
  // Test 4: Calibration Watchdog & Timer Cleanup
  // -------------------------------------------------------------
  console.log('\n--- 4. Calibration Watchdog & Timer Teardown ---');
  {
    // Setup active manager
    const track = new MockTrack('calib-track');
    globalThis.navigator.mediaDevices.getUserMedia = async () => new MockStream([track]);
    const manager = new HeadTrackingManager();
    manager.landmarker = mockLandmarker();
    const video = new MockVideo();

    await manager.start({
      videoElement: video,
      onVector: () => {},
      onError: () => {},
    });

    // 4.1 Abort calibration via stop()
    let calibRejectedWithStop = false;
    let calibErrorMsg = '';
    const calib1 = manager.calibrate(100).catch((err) => {
      calibRejectedWithStop = true;
      calibErrorMsg = err.message;
    });

    manager.stop();
    await calib1;

    check('calibrate() rejects when manager.stop() is called', calibRejectedWithStop);
    check('calibrate() rejection message states cancelled due to stop', calibErrorMsg.includes('tracking stop'));

    // Re-start manager
    await manager.start({
      videoElement: video,
      onVector: () => {},
      onError: () => {},
    });

    // 4.2 Superseded calibration
    let firstSuperseded = false;
    const c1 = manager.calibrate(200).catch((err) => {
      if (err.message.includes('superseded')) firstSuperseded = true;
    });
    // Immediately start second calibration
    const c2 = manager.calibrate(200);
    await c1;
    check('First calibration rejected as superseded when calibrate() re-invoked', firstSuperseded);

    // Cancel c2 with close()
    let c2Closed = false;
    const c2Catch = c2.catch(() => {
      c2Closed = true;
    });
    manager.close();
    await c2Catch;
    check('Second calibration rejected on manager.close()', c2Closed);
  }

  // -------------------------------------------------------------
  // Test 5: Calibration Watchdog Timeout on Face Loss
  // -------------------------------------------------------------
  console.log('\n--- 5. Calibration Watchdog Timeout with No Face ---');
  {
    const track = new MockTrack('timeout-track');
    globalThis.navigator.mediaDevices.getUserMedia = async () => new MockStream([track]);
    const manager = new HeadTrackingManager();
    // Landmarker returns no face
    manager.landmarker = {
      detectForVideo: () => ({ faceLandmarks: [] }),
      close: () => {},
    };
    const video = new MockVideo();

    await manager.start({
      videoElement: video,
      onVector: () => {},
      onError: () => {},
    });

    let timeoutRejected = false;
    let timeoutErrorMsg = '';
    // Use short duration (20ms); grace is 1500ms, so total is 1520ms
    const calibPromise = manager.calibrate(20).catch((err) => {
      timeoutRejected = true;
      timeoutErrorMsg = err.message;
    });

    // Wait for the watchdog timer to fire
    await new Promise((r) => setTimeout(r, 1600));
    await calibPromise;

    check('Calibration watchdog rejects with CALIBRATION_TIMEOUT when face missing', timeoutRejected && timeoutErrorMsg === 'CALIBRATION_TIMEOUT');
    check('Manager is not calibrating after timeout', manager.isCalibrated() === false);

    manager.stop();
  }

  // -------------------------------------------------------------
  // Test 6: In-Flight Camera Rejection when Cancelled
  // -------------------------------------------------------------
  console.log('\n--- 6. In-Flight Camera Error when Cancelled ---');
  {
    let rejectMedia;
    globalThis.navigator.mediaDevices.getUserMedia = () => {
      return new Promise((_, reject) => {
        rejectMedia = () => reject(new DOMException('Permission denied', 'NotAllowedError'));
      });
    };

    const manager = new HeadTrackingManager();
    manager.landmarker = mockLandmarker();
    const video = new MockVideo();

    let unhandledThrew = false;
    const startP = manager.start({
      videoElement: video,
      onVector: () => {},
      onError: () => {},
    }).catch(() => {
      unhandledThrew = true;
    });

    // User cancels while camera permission is pending
    manager.stop();

    // Browser now rejects permission
    rejectMedia();
    await startP;

    check('start() does NOT rethrow or crash when cancelled before permission error', unhandledThrew === false);
    check('Manager remains clean and inactive', manager.isActive() === false);
  }

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('\n==================================================');
  console.log('REVIEWER ADVERSARIAL TEST SUMMARY');
  console.log('==================================================');
  const total = adversarialResults.length;
  const passed = adversarialResults.filter((r) => r.passed).length;
  const failed = adversarialResults.filter((r) => !r.passed).length;

  console.log(`TOTAL ADVERSARIAL CHECKS: ${total}`);
  console.log(`PASSED:                  ${passed}`);
  console.log(`FAILED:                  ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAdversarialTests().catch((err) => {
  console.error('Adversarial runner failed:', err);
  process.exit(1);
});
