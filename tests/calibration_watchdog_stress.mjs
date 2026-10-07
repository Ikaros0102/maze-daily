/**
 * tests/calibration_watchdog_stress.mjs
 *
 * Empirical Stress-Testing Harness for Maze Daily Head Tracking Module:
 * Milestone 2 Calibration Watchdog & Concurrency Guards Verification
 *
 * Requirements Tested:
 * 1. Zero Face Landmarks Watchdog:
 *    - Rejection with 'CALIBRATION_TIMEOUT' when room is dark or face occluded
 *    - No indefinite hanging (watchdog fires after durationMs + CALIBRATION_WATCHDOG_GRACE_MS)
 *    - Proper behavior under zero frames, empty landmarks, out-of-bounds landmarks,
 *      and insufficient samples (< MIN_CALIBRATION_SAMPLES = 10)
 * 2. Valid Landmark Resolution:
 *    - Resolves cleanly with { centerX, centerY, sampleCount, variance }
 *    - Median center computation provides immunity to sudden twitches/spikes
 *    - Smooth post-calibration kinematics and deadzone filtering
 * 3. Concurrency Guards & Lifecycle Churn:
 *    - Rapid interleaving of start() -> stop() -> start() -> calibrate() -> stop()
 *    - Zero leaked timers (strict timer auditing)
 *    - Zero leaked tracks (strict MediaStreamTrack auditing)
 *    - Zero leaked animation frame loops
 */

import {
  HeadTrackingManager,
  MIN_CALIBRATION_SAMPLES,
  CALIBRATION_WATCHDOG_GRACE_MS,
  computeMedian,
  computeCalibrationCenter,
  processHeadVector,
} from '../src/modules/headTracking/index.ts';

import {
  attachAndPlayVideo,
  stopCamera,
} from '../src/modules/headTracking/camera.ts';

// -------------------------------------------------------------
// Test Runner Infrastructure
// -------------------------------------------------------------
const results = [];
let currentSuite = '';

function suite(name) {
  currentSuite = name;
  console.log(`\n==================================================`);
  console.log(`SUITE: ${name}`);
  console.log(`==================================================`);
}

function assert(description, condition, expected, actual) {
  const passed = Boolean(condition);
  results.push({ suite: currentSuite, description, passed, expected, actual });
  if (passed) {
    console.log(`  ✓ PASS: ${description}`);
  } else {
    console.error(`  ✗ FAIL: ${description}`);
    console.error(`     Expected:`, expected);
    console.error(`     Actual:  `, actual);
  }
}

// -------------------------------------------------------------
// Timer & Resource Interception / Auditing
// -------------------------------------------------------------
const activeTimers = new Map();
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

function installTimerAuditing() {
  globalThis.setTimeout = function (callback, delay, ...args) {
    const stack = new Error().stack || '';
    let id;
    const wrappedCb = () => {
      activeTimers.delete(id);
      callback(...args);
    };
    id = originalSetTimeout(wrappedCb, delay);
    activeTimers.set(id, { delay, stack, created: Date.now() });
    return id;
  };

  globalThis.clearTimeout = function (id) {
    activeTimers.delete(id);
    return originalClearTimeout(id);
  };
}

function getActiveTimerCount() {
  return activeTimers.size;
}

function getActiveTimersSummary() {
  const list = [];
  for (const [id, info] of activeTimers.entries()) {
    list.push({ id, delay: info.delay });
  }
  return list;
}

function clearAllTrackedTimers() {
  for (const id of activeTimers.keys()) {
    originalClearTimeout(id);
  }
  activeTimers.clear();
}

// -------------------------------------------------------------
// Mock Objects & Tracking
// -------------------------------------------------------------
const allocatedTracks = [];

class MockMediaStreamTrack {
  constructor(kind = 'video') {
    this.kind = kind;
    this.readyState = 'live';
    this.stopCallCount = 0;
    this.listeners = new Map();
    allocatedTracks.push(this);
  }

  stop() {
    this.stopCallCount++;
    this.readyState = 'ended';
  }

  addEventListener(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  removeEventListener(event, callback) {
    const arr = this.listeners.get(event);
    if (arr) {
      const idx = arr.indexOf(callback);
      if (idx !== -1) arr.splice(idx, 1);
    }
  }

  simulateEnded() {
    this.readyState = 'ended';
    const arr = this.listeners.get('ended');
    if (arr) {
      for (const cb of [...arr]) cb();
    }
  }
}

class MockMediaStream {
  constructor(tracks = [new MockMediaStreamTrack('video')]) {
    this.tracks = tracks;
  }

  getTracks() {
    return [...this.tracks];
  }

  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video');
  }

  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
}

class MockHTMLVideoElement {
  constructor(options = {}) {
    this.srcObject = null;
    this.videoWidth = options.videoWidth ?? 640;
    this.videoHeight = options.videoHeight ?? 480;
    this.readyState = options.readyState ?? 4; // HAVE_ENOUGH_DATA
    this.currentTime = 0;
    this.muted = false;
    this.autoplay = false;
    this.attributes = new Map();
    this.playCallCount = 0;
    this.pauseCallCount = 0;
    this.listeners = new Map();
  }

  setAttribute(k, v) {
    this.attributes.set(k, v);
  }

  async play() {
    this.playCallCount++;
  }

  pause() {
    this.pauseCallCount++;
  }

  addEventListener(event, cb) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(cb);
  }

  removeEventListener(event, cb) {
    const arr = this.listeners.get(event);
    if (arr) {
      const idx = arr.indexOf(cb);
      if (idx !== -1) arr.splice(idx, 1);
    }
  }

  triggerEvent(event, evtObj = {}) {
    const arr = this.listeners.get(event);
    if (arr) {
      for (const cb of [...arr]) cb(evtObj);
    }
  }
}

function createConfigurableLandmarker(detectionFn) {
  let closed = false;
  return {
    detectForVideo: (video, ts) => detectionFn(video, ts),
    close: () => {
      closed = true;
    },
    isClosed: () => closed,
  };
}

// -------------------------------------------------------------
// Global Environment Setup
// -------------------------------------------------------------
let rAFCounter = 1;
const scheduledFrames = new Map();
const cancelledFrames = new Set();

function setupEnvironment() {
  installTimerAuditing();

  Object.defineProperty(globalThis, 'window', {
    value: { isSecureContext: true, location: { hostname: 'localhost' } },
    writable: true,
    configurable: true,
  });

  Object.defineProperty(globalThis, 'HTMLMediaElement', {
    value: {
      HAVE_NOTHING: 0,
      HAVE_METADATA: 1,
      HAVE_CURRENT_DATA: 2,
      HAVE_FUTURE_DATA: 3,
      HAVE_ENOUGH_DATA: 4,
    },
    writable: true,
    configurable: true,
  });

  Object.defineProperty(globalThis, 'navigator', {
    value: {
      mediaDevices: {
        getUserMedia: async () => new MockMediaStream(),
      },
    },
    writable: true,
    configurable: true,
  });

  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    value: (callback) => {
      const id = rAFCounter++;
      scheduledFrames.set(id, callback);
      return id;
    },
    writable: true,
    configurable: true,
  });

  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    value: (id) => {
      cancelledFrames.add(id);
      scheduledFrames.delete(id);
    },
    writable: true,
    configurable: true,
  });
}

function resetEnvironment() {
  scheduledFrames.clear();
  cancelledFrames.clear();
  allocatedTracks.length = 0;
  clearAllTrackedTimers();
  globalThis.navigator.mediaDevices.getUserMedia = async () => new MockMediaStream();
  rAFCounter = 1;
}

// Helper: step one animation frame tick
function stepFrame(video, advanceTime = 0.033) {
  video.currentTime += advanceTime;
  const callbacks = [...scheduledFrames.entries()];
  for (const [id, cb] of callbacks) {
    scheduledFrames.delete(id);
    cb();
  }
}

const sleep = (ms) => new Promise((resolve) => originalSetTimeout(resolve, ms));

// =============================================================
// TEST SUITES EXECUTION
// =============================================================

async function runAllTests() {
  setupEnvironment();

  // =============================================================
  // SUITE 1: Calibration Watchdog Timeout on Zero Face Landmarks
  // =============================================================
  suite('1. Calibration Watchdog Timeout on Zero Face Landmarks');

  // 1.1 Stalled Camera / Zero Video Frames: Watchdog Timer Rejection
  {
    resetEnvironment();
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();
    manager.landmarker = createConfigurableLandmarker(() => ({ faceLandmarks: [] }));

    await manager.start({
      videoElement: video,
      onVector: () => {},
      onError: () => {},
    });

    const durationMs = 50;
    const expectedTimeoutMs = durationMs + CALIBRATION_WATCHDOG_GRACE_MS; // 1550ms
    const startT = performance.now();

    let timeoutError = null;
    try {
      await manager.calibrate(durationMs);
    } catch (err) {
      timeoutError = err;
    }
    const elapsed = performance.now() - startT;

    assert(
      '1.1a Zero video frames times out and rejects cleanly with CALIBRATION_TIMEOUT',
      timeoutError?.message === 'CALIBRATION_TIMEOUT',
      'CALIBRATION_TIMEOUT',
      timeoutError?.message
    );
    assert(
      '1.1b Watchdog fires after durationMs + CALIBRATION_WATCHDOG_GRACE_MS (~1550ms)',
      elapsed >= expectedTimeoutMs - 50 && elapsed <= expectedTimeoutMs + 300,
      `~${expectedTimeoutMs}ms`,
      `${elapsed.toFixed(1)}ms`
    );
    assert(
      '1.1c Controller isCalibrated() remains false',
      manager.isCalibrated() === false,
      false,
      manager.isCalibrated()
    );
    assert(
      '1.1d Controller getCenter() remains null',
      manager.getCenter() === null,
      null,
      manager.getCenter()
    );
    assert(
      '1.1e Watchdog timer is cleared and not leaked',
      getActiveTimerCount() === 0,
      0,
      getActiveTimerCount()
    );

    manager.stop();
  }

  // 1.2 Active Video Stream with Zero Detected Faces (Dark Room)
  {
    resetEnvironment();
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();
    const emittedVectors = [];
    let progressCalls = 0;

    manager.landmarker = createConfigurableLandmarker(() => ({
      faceLandmarks: [], // No faces in dark room
    }));

    await manager.start({
      videoElement: video,
      onVector: (v) => emittedVectors.push(v),
      onError: () => {},
      onCalibrationProgress: () => {
        progressCalls++;
      },
    });

    const calibPromise = manager.calibrate(100);

    // Pump 10 frames with no faces
    for (let i = 0; i < 10; i++) {
      stepFrame(video);
    }

    let caughtErr = null;
    try {
      await calibPromise;
    } catch (err) {
      caughtErr = err;
    }

    assert(
      '1.2a Empty landmarks stream rejects with CALIBRATION_TIMEOUT',
      caughtErr?.message === 'CALIBRATION_TIMEOUT',
      'CALIBRATION_TIMEOUT',
      caughtErr?.message
    );
    assert(
      '1.2b Calibration progress callback was invoked during calibration attempt',
      progressCalls > 0,
      true,
      progressCalls
    );
    assert(
      '1.2c Emitted vectors remained strictly neutral { x: 0, y: 0 } during failed calibration',
      emittedVectors.length > 0 && emittedVectors.every((v) => v.x === 0 && v.y === 0),
      true,
      emittedVectors.length
    );
    assert(
      '1.2d Watchdog timer is cleared after empty landmarks timeout',
      getActiveTimerCount() === 0,
      0,
      getActiveTimerCount()
    );

    manager.stop();
  }

  // 1.3 Out-of-Bounds / Malformed Coordinates (Occluded / Hand over Face)
  {
    resetEnvironment();
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();

    // MediaPipe returns coordinates outside [0, 1] bounds
    manager.landmarker = createConfigurableLandmarker(() => ({
      faceLandmarks: [
        [
          { x: -0.5, y: -0.5 },
          { x: 1.8, y: 2.3 }, // Nose tip out of bounds
        ],
      ],
    }));

    await manager.start({
      videoElement: video,
      onVector: () => {},
      onError: () => {},
    });

    const calibPromise = manager.calibrate(60);

    for (let i = 0; i < 5; i++) {
      stepFrame(video);
    }

    let caughtErr = null;
    try {
      await calibPromise;
    } catch (err) {
      caughtErr = err;
    }

    assert(
      '1.3a Out-of-bounds coordinates reject with CALIBRATION_TIMEOUT',
      caughtErr?.message === 'CALIBRATION_TIMEOUT',
      'CALIBRATION_TIMEOUT',
      caughtErr?.message
    );
    assert(
      '1.3b isCalibrated() is false after out-of-bounds coordinates',
      manager.isCalibrated() === false,
      false,
      manager.isCalibrated()
    );

    manager.stop();
  }

  // 1.4 Insufficient Samples (< MIN_CALIBRATION_SAMPLES = 10): Brief Flash Then Dark
  {
    resetEnvironment();
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();

    let frameCount = 0;
    manager.landmarker = createConfigurableLandmarker(() => {
      frameCount++;
      // Only return landmarks for first 4 frames (< MIN_CALIBRATION_SAMPLES = 10)
      if (frameCount <= 4) {
        return {
          faceLandmarks: [
            [
              { x: 0.1, y: 0.1 },
              { x: 0.5, y: 0.5 },
            ],
          ],
        };
      }
      return { faceLandmarks: [] };
    });

    await manager.start({
      videoElement: video,
      onVector: () => {},
      onError: () => {},
    });

    const calibPromise = manager.calibrate(80);

    // Pump 15 frames: 4 valid, then 11 empty
    for (let i = 0; i < 15; i++) {
      stepFrame(video);
    }

    let caughtErr = null;
    try {
      await calibPromise;
    } catch (err) {
      caughtErr = err;
    }

    assert(
      '1.4a Insufficient samples (4 < 10) rejects with CALIBRATION_TIMEOUT',
      caughtErr?.message === 'CALIBRATION_TIMEOUT',
      'CALIBRATION_TIMEOUT',
      caughtErr?.message
    );
    assert(
      '1.4b Manager rejects rather than calculating low-confidence center from 4 samples',
      manager.isCalibrated() === false,
      false,
      manager.isCalibrated()
    );

    manager.stop();
  }

  // 1.5 Watchdog Grace Period Recovery: Valid samples arrive during grace period
  {
    resetEnvironment();
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();

    let frameCount = 0;
    manager.landmarker = createConfigurableLandmarker(() => {
      frameCount++;
      // First 5 frames are dark, but next 15 frames have valid face
      if (frameCount > 5) {
        return {
          faceLandmarks: [
            [
              { x: 0.1, y: 0.1 },
              { x: 0.5, y: 0.5 },
            ],
          ],
        };
      }
      return { faceLandmarks: [] };
    });

    await manager.start({
      videoElement: video,
      onVector: () => {},
      onError: () => {},
    });

    const calibPromise = manager.calibrate(100);

    // Pump 25 frames
    const interval = setInterval(() => {
      stepFrame(video);
    }, 10);

    let result = null;
    try {
      result = await calibPromise;
    } finally {
      clearInterval(interval);
    }

    assert(
      '1.5a Recovers and resolves when valid samples arrive before watchdog grace expires',
      result !== null && result.centerX === 0.5 && result.centerY === 0.5,
      { centerX: 0.5, centerY: 0.5 },
      result
    );
    assert(
      '1.5b Sample count reflects collected samples (>= 10)',
      result?.sampleCount >= MIN_CALIBRATION_SAMPLES,
      true,
      result?.sampleCount
    );

    manager.stop();
  }

  // =============================================================
  // SUITE 2: Valid Landmark Stream Calibration Resolution
  // =============================================================
  suite('2. Valid Landmark Stream Calibration Resolution');

  // 2.1 Clean Resolution with Valid Landmarks
  {
    resetEnvironment();
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();

    manager.landmarker = createConfigurableLandmarker(() => ({
      faceLandmarks: [
        [
          { x: 0.1, y: 0.1 },
          { x: 0.48, y: 0.52 }, // Valid nose tip
        ],
      ],
    }));

    await manager.start({
      videoElement: video,
      onVector: () => {},
      onError: () => {},
    });

    const calibPromise = manager.calibrate(80);

    const interval = setInterval(() => {
      stepFrame(video);
    }, 10);

    const result = await calibPromise;
    clearInterval(interval);

    assert(
      '2.1a Resolves properly with centerX and centerY',
      result !== null && typeof result.centerX === 'number' && typeof result.centerY === 'number',
      true,
      result
    );
    assert(
      '2.1b Resolved center values match expected landmark coordinates (0.48, 0.52)',
      Math.abs(result.centerX - 0.48) < 0.001 && Math.abs(result.centerY - 0.52) < 0.001,
      { centerX: 0.48, centerY: 0.52 },
      { centerX: result.centerX, centerY: result.centerY }
    );
    assert(
      '2.1c Result includes sampleCount >= MIN_CALIBRATION_SAMPLES',
      result.sampleCount >= MIN_CALIBRATION_SAMPLES,
      true,
      result.sampleCount
    );
    assert(
      '2.1d Result includes variance calculation',
      typeof result.variance === 'number',
      true,
      result.variance
    );
    assert(
      '2.1e manager.isCalibrated() returns true',
      manager.isCalibrated() === true,
      true,
      manager.isCalibrated()
    );
    assert(
      '2.1f manager.getCenter() returns matching calibration center',
      manager.getCenter()?.centerX === result.centerX && manager.getCenter()?.centerY === result.centerY,
      true,
      manager.getCenter()
    );
    assert(
      '2.1g Watchdog timer was cancelled and not leaked upon successful resolution',
      getActiveTimerCount() === 0,
      0,
      getActiveTimerCount()
    );

    manager.stop();
  }

  // 2.2 Median Resistance against Twitch Outliers
  {
    resetEnvironment();
    // Mathematical median test:
    const normalSamples = [
      { x: 0.50, y: 0.50 },
      { x: 0.51, y: 0.49 },
      { x: 0.49, y: 0.51 },
      { x: 0.50, y: 0.50 },
      { x: 0.50, y: 0.50 },
      { x: 0.52, y: 0.48 },
      { x: 0.48, y: 0.52 },
      { x: 0.50, y: 0.50 },
      { x: 0.50, y: 0.50 },
      { x: 0.50, y: 0.50 },
      // Extreme twitch outlier samples:
      { x: 0.99, y: 0.99 },
      { x: 0.98, y: 0.95 },
    ];

    const center = computeCalibrationCenter(normalSamples);
    assert(
      '2.2a computeCalibrationCenter uses median to filter out twitches/spikes',
      center.centerX === 0.50 && center.centerY === 0.50,
      { centerX: 0.50, centerY: 0.50 },
      { centerX: center.centerX, centerY: center.centerY }
    );
  }

  // 2.3 Post-Calibration Kinematic Vector Emission & Deadzone
  {
    resetEnvironment();
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();

    let currentNose = { x: 0.50, y: 0.50 };
    manager.landmarker = createConfigurableLandmarker(() => ({
      faceLandmarks: [
        [
          { x: 0.1, y: 0.1 },
          { ...currentNose },
        ],
      ],
    }));

    const emittedVectors = [];
    await manager.start({
      videoElement: video,
      onVector: (v) => emittedVectors.push(v),
      onError: () => {},
    });

    // Calibrate at (0.50, 0.50)
    const calibPromise = manager.calibrate(60);
    const interval = setInterval(() => stepFrame(video), 10);
    await calibPromise;
    clearInterval(interval);

    emittedVectors.length = 0; // Clear calibration samples

    // 1. Neutral position at center -> vector { 0, 0 }
    currentNose = { x: 0.50, y: 0.50 };
    stepFrame(video);
    const vCenter = emittedVectors[emittedVectors.length - 1];
    assert(
      '2.3a Exact center position emits neutral vector { x: 0, y: 0 }',
      vCenter?.x === 0 && vCenter?.y === 0,
      { x: 0, y: 0 },
      vCenter
    );

    // 2. Micro-tremor within 5% deadzone (r = 0.03 < 0.05) -> vector { 0, 0 }
    currentNose = { x: 0.48, y: 0.50 }; // deltaX = 0.50 - 0.48 = 0.02 < 0.05
    stepFrame(video);
    const vDeadzone = emittedVectors[emittedVectors.length - 1];
    assert(
      '2.3b Micro-tremor inside 5% deadzone is filtered out to { x: 0, y: 0 }',
      vDeadzone?.x === 0 && vDeadzone?.y === 0,
      { x: 0, y: 0 },
      vDeadzone
    );

    // 3. Significant right tilt beyond deadzone (x = 0.35, deltaX = +0.15) -> positive x
    currentNose = { x: 0.35, y: 0.50 };
    stepFrame(video);
    stepFrame(video); // Step twice for EMA smoother
    const vTiltRight = emittedVectors[emittedVectors.length - 1];
    assert(
      '2.3c Tilting head right produces positive x steering vector',
      vTiltRight?.x > 0.3,
      true,
      vTiltRight?.x
    );

    manager.stop();
  }

  // 2.4 Inactive Controller Rejects Calibrate Immediately Without Scheduling Timers
  {
    resetEnvironment();
    const manager = new HeadTrackingManager();

    let inactiveErr = null;
    try {
      await manager.calibrate(3000);
    } catch (e) {
      inactiveErr = e;
    }

    assert(
      '2.4a calibrate() on inactive controller rejects immediately',
      inactiveErr?.message.includes('Head tracking must be active'),
      true,
      inactiveErr?.message
    );
    assert(
      '2.4b No watchdog timer is scheduled when calibrate() is called on inactive manager',
      getActiveTimerCount() === 0,
      0,
      getActiveTimerCount()
    );
  }

  // =============================================================
  // SUITE 3: Concurrency Guards & Lifecycle Churn
  // =============================================================
  suite('3. Concurrency Guards & Lifecycle Churn');

  // 3.1 Interleaving start() -> stop() -> start() -> calibrate() -> stop()
  {
    resetEnvironment();
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();
    manager.landmarker = createConfigurableLandmarker(() => ({
      faceLandmarks: [[{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }]],
    }));

    const emittedVectors = [];
    const cfg = {
      videoElement: video,
      onVector: (v) => emittedVectors.push(v),
      onError: () => {},
    };

    // Step 1: start()
    await manager.start(cfg);
    assert('3.1a Step 1: manager active after first start', manager.isActive() === true, true, manager.isActive());

    // Step 2: stop()
    manager.stop();
    assert('3.1b Step 2: manager inactive after stop', manager.isActive() === false, false, manager.isActive());
    assert('3.1c Step 2: zero vector emitted on stop', emittedVectors[emittedVectors.length - 1]?.x === 0, 0, emittedVectors[emittedVectors.length - 1]?.x);

    // Step 3: start()
    await manager.start(cfg);
    assert('3.1d Step 3: manager active after second start', manager.isActive() === true, true, manager.isActive());

    // Step 4: calibrate()
    const calibPromise = manager.calibrate(3000);
    assert('3.1e Step 4: watchdog timer scheduled for calibration', getActiveTimerCount() === 1, 1, getActiveTimerCount());

    // Step 5: stop()
    manager.stop();
    assert('3.1f Step 5: manager inactive after second stop', manager.isActive() === false, false, manager.isActive());

    // Calibration promise must reject with cancellation
    let calibRejected = null;
    try {
      await calibPromise;
    } catch (e) {
      calibRejected = e;
    }

    assert(
      '3.1g In-flight calibration rejected on stop()',
      calibRejected?.message.includes('Calibration cancelled'),
      true,
      calibRejected?.message
    );
    assert(
      '3.1h Zero timers leaked after sequence: start->stop->start->calibrate->stop',
      getActiveTimerCount() === 0,
      0,
      getActiveTimerCount()
    );

    // All allocated tracks must be in 'ended' state with stopCallCount >= 1
    const leakedTracks = allocatedTracks.filter((t) => t.readyState !== 'ended');
    assert(
      '3.1i Zero tracks leaked (all tracks in ended state)',
      leakedTracks.length === 0,
      0,
      leakedTracks.length
    );
    assert(
      '3.1j Exactly 2 tracks were created and both stopped',
      allocatedTracks.length === 2 && allocatedTracks.every((t) => t.stopCallCount >= 1),
      true,
      allocatedTracks.map((t) => ({ readyState: t.readyState, stops: t.stopCallCount }))
    );
    assert(
      '3.1k Zero animation frames running in background',
      scheduledFrames.size === 0,
      0,
      scheduledFrames.size
    );
  }

  // 3.2 High-Frequency Stress Churn: 50 Iterations of start -> stop -> start -> calibrate -> stop
  {
    resetEnvironment();
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();
    manager.landmarker = createConfigurableLandmarker(() => ({
      faceLandmarks: [[{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }]],
    }));

    const cfg = {
      videoElement: video,
      onVector: () => {},
      onError: () => {},
    };

    const CHURN_CYCLES = 50;
    let anyLeakedInLoop = false;

    for (let i = 0; i < CHURN_CYCLES; i++) {
      await manager.start(cfg);
      manager.stop();
      await manager.start(cfg);
      const calib = manager.calibrate(2000);
      manager.stop();

      try {
        await calib;
      } catch {
        // Expected cancellation
      }

      if (getActiveTimerCount() !== 0 || scheduledFrames.size !== 0) {
        anyLeakedInLoop = true;
        break;
      }
    }

    const unstoppedTracks = allocatedTracks.filter((t) => t.readyState !== 'ended');

    assert(
      `3.2a Completed ${CHURN_CYCLES} rapid churn cycles without timer leaks`,
      anyLeakedInLoop === false,
      false,
      anyLeakedInLoop
    );
    assert(
      `3.2b Final active timer count is exactly 0 after ${CHURN_CYCLES} cycles`,
      getActiveTimerCount() === 0,
      0,
      getActiveTimerCount()
    );
    assert(
      `3.2c Zero leaked tracks across ${allocatedTracks.length} total tracks created`,
      unstoppedTracks.length === 0,
      0,
      unstoppedTracks.length
    );
    assert(
      '3.2d Zero hanging animation frames after churn',
      scheduledFrames.size === 0,
      0,
      scheduledFrames.size
    );
    assert(
      '3.2e Controller isActive() is false',
      manager.isActive() === false,
      false,
      manager.isActive()
    );
  }

  // 3.3 Unawaited Concurrency Race Conditions
  {
    resetEnvironment();
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();
    manager.landmarker = createConfigurableLandmarker(() => ({
      faceLandmarks: [[{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }]],
    }));

    const cfg = {
      videoElement: video,
      onVector: () => {},
      onError: () => {},
    };

    // Fire calls asynchronously without awaiting
    const pStart1 = manager.start(cfg);
    manager.stop();
    const pStart2 = manager.start(cfg);
    const pCalib = manager.calibrate(1000).catch((e) => e);
    manager.stop();

    await Promise.allSettled([pStart1, pStart2, pCalib]);

    const liveTracks = allocatedTracks.filter((t) => t.readyState === 'live');

    assert(
      '3.3a Zero active timers after unawaited concurrent start/stop/calibrate/stop',
      getActiveTimerCount() === 0,
      0,
      getActiveTimerCount()
    );
    assert(
      '3.3b Zero live tracks leaked after unawaited concurrent operations',
      liveTracks.length === 0,
      0,
      liveTracks.length
    );
    assert(
      '3.3c Manager state is inactive',
      manager.isActive() === false,
      false,
      manager.isActive()
    );
  }

  // 3.4 Mid-Calibration Hardware Disconnection
  {
    resetEnvironment();
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();
    manager.landmarker = createConfigurableLandmarker(() => ({
      faceLandmarks: [[{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }]],
    }));

    let errorReported = null;
    await manager.start({
      videoElement: video,
      onVector: () => {},
      onError: (err) => {
        errorReported = err;
      },
    });

    const calibPromise = manager.calibrate(3000);

    // Simulate physical webcam unplug during calibration
    const activeTrack = allocatedTracks[allocatedTracks.length - 1];
    activeTrack.simulateEnded();

    let calibErr = null;
    try {
      await calibPromise;
    } catch (e) {
      calibErr = e;
    }

    assert(
      '3.4a Hardware disconnect triggers onError with DISCONNECTED code',
      errorReported?.code === 'DISCONNECTED',
      'DISCONNECTED',
      errorReported?.code
    );
    assert(
      '3.4b In-flight calibration cleanly rejects on hardware disconnect',
      calibErr !== null,
      true,
      calibErr?.message
    );
    assert(
      '3.4c Watchdog timer cancelled on hardware disconnect',
      getActiveTimerCount() === 0,
      0,
      getActiveTimerCount()
    );
    assert(
      '3.4d Controller automatically inactive after hardware disconnect',
      manager.isActive() === false,
      false,
      manager.isActive()
    );
  }

  // =============================================================
  // SUITE 4: Adversarial Audit of camera.ts attachAndPlayVideo Fallback Timer
  // =============================================================
  suite('4. Adversarial Audit: attachAndPlayVideo Timer Investigation');

  // 4.1 Probe attachAndPlayVideo when readyState is initially HAVE_NOTHING
  {
    resetEnvironment();
    const video = new MockHTMLVideoElement({ readyState: 0 }); // HAVE_NOTHING
    const stream = new MockMediaStream();

    const attachPromise = attachAndPlayVideo(video, stream);

    // Initial state: attachAndPlayVideo scheduled a 5000ms safety timeout
    const timersBeforeLoad = getActiveTimerCount();

    // Trigger loadeddata immediately (e.g. 5ms after getUserMedia)
    video.readyState = 4;
    video.videoWidth = 640;
    video.videoHeight = 480;
    video.triggerEvent('loadeddata');

    await attachPromise;

    const timersAfterLoad = getActiveTimerCount();

    // ADVERSARIAL OBSERVATION:
    // In camera.ts lines 206-216, `setTimeout` creates a 5000ms timer that is NOT cleared
    // in `cleanup()`. Thus when readyState is initially 0, the 5-second timer remains active!
    assert(
      '4.1a attachAndPlayVideo completes on loadeddata',
      video.playCallCount === 1,
      1,
      video.playCallCount
    );

    if (timersAfterLoad > 0) {
      console.warn(
        `  ⚠ ADVERSARIAL FINDING: attachAndPlayVideo leaked ${timersAfterLoad} active timer(s) (5000ms fallback not cleared on loadeddata).`
      );
    }

    assert(
      '4.1b Check if attachAndPlayVideo clears 5000ms fallback timer on loadeddata',
      timersAfterLoad === 0,
      0,
      timersAfterLoad
    );

    // Clean up tracked timers
    clearAllTrackedTimers();
    stopCamera(stream);
  }

  // =============================================================
  // SUMMARY
  // =============================================================
  console.log(`\n==================================================`);
  console.log(`FINAL STRESS VERIFICATION REPORT`);
  console.log(`==================================================`);
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`TOTAL CHECKS: ${total}`);
  console.log(`PASSED:       ${passed}`);
  console.log(`FAILED:       ${failed}`);

  if (failed === 0) {
    console.log(`\nALL ${total} EMPIRICAL CHECKS PASSED CLEANLY!`);
  } else {
    console.log(`\n${failed} CHECK(S) FAILED. INVESTIGATION REQUIRED.`);
  }

  return { total, passed, failed, results };
}

runAllTests().catch((err) => {
  console.error('Test runner encountered unhandled error:', err);
  process.exit(1);
});
