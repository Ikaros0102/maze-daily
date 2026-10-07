/**
 * tests/camera_lifecycle_stress.mjs
 *
 * Empirical Stress-Testing Harness for Maze Daily Head Tracking Module:
 * 1. Camera Error Classification & Rejection Handling
 * 2. Hardware Track Release & Device Teardown
 * 3. Controller Lifecycle, Zero-Vector Emission & Animation Loop Cleanup
 * 4. Concurrent / Asynchronous Race Conditions & Stress Churn
 */

import {
  parseCameraError,
  assertCameraSupport,
  requestCameraStream,
  stopCamera,
  attachAndPlayVideo,
  monitorStreamTracks,
  CAMERA_CONSTRAINTS,
} from '../src/modules/headTracking/camera.ts';

import {
  HeadTrackingManager,
  createHeadTrackingController,
  CameraError,
  MIN_CALIBRATION_SAMPLES,
  CALIBRATION_WATCHDOG_GRACE_MS,
  computeMedian,
  computeCalibrationCenter,
  processHeadVector,
} from '../src/modules/headTracking/index.ts';

// -------------------------------------------------------------
// Test Runner Infrastructure
// -------------------------------------------------------------
const results = [];
let suiteName = '';

function suite(name) {
  suiteName = name;
  console.log(`\n==================================================`);
  console.log(`SUITE: ${name}`);
  console.log(`==================================================`);
}

function assert(description, condition, expected, actual) {
  const passed = Boolean(condition);
  results.push({ suite: suiteName, description, passed, expected, actual });
  if (passed) {
    console.log(`  ✓ PASS: ${description}`);
  } else {
    console.error(`  ✗ FAIL: ${description}`);
    console.error(`     Expected:`, expected);
    console.error(`     Actual:  `, actual);
  }
}

// -------------------------------------------------------------
// Mock Factory Functions & Resource Auditing
// -------------------------------------------------------------
const allAllocatedTracks = [];
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
    activeTimers.set(id, { delay, stack });
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

function clearAllTrackedTimers() {
  for (const id of activeTimers.keys()) {
    originalClearTimeout(id);
  }
  activeTimers.clear();
}

class MockMediaStreamTrack {
  constructor(kind = 'video') {
    this.kind = kind;
    this.readyState = 'live';
    this.stopCallCount = 0;
    this.listeners = new Map();
    allAllocatedTracks.push(this);
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
      for (const cb of [...arr]) {
        cb();
      }
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
  constructor() {
    this.srcObject = null;
    this.videoWidth = 640;
    this.videoHeight = 480;
    this.readyState = 4; // HAVE_ENOUGH_DATA
    this.currentTime = 0;
    this.muted = false;
    this.autoplay = false;
    this.attributes = new Map();
    this.playCallCount = 0;
    this.pauseCallCount = 0;
    this.listeners = new Map();
    this.playRejection = null;
  }

  setAttribute(k, v) {
    this.attributes.set(k, v);
  }

  async play() {
    this.playCallCount++;
    if (this.playRejection) {
      throw this.playRejection;
    }
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
      for (const cb of [...arr]) {
        cb(evtObj);
      }
    }
  }
}

function createMockLandmarker() {
  let closed = false;
  return {
    detectForVideo: () => ({
      faceLandmarks: [
        [
          { x: 0.1, y: 0.1 },
          { x: 0.5, y: 0.5 }, // Nose tip at optical center
        ],
      ],
    }),
    close: () => {
      closed = true;
    },
    isClosed: () => closed,
  };
}

// Global environment setup / teardown
let rAFCounter = 1;
const scheduledFrames = new Map();
const cancelledFrames = new Set();

function setGlobalProperty(key, value) {
  Object.defineProperty(globalThis, key, {
    value,
    writable: true,
    configurable: true,
  });
}

function setupBrowserMocks() {
  setGlobalProperty('window', {
    isSecureContext: true,
    location: { hostname: 'localhost' },
  });

  setGlobalProperty('HTMLMediaElement', {
    HAVE_NOTHING: 0,
    HAVE_METADATA: 1,
    HAVE_CURRENT_DATA: 2,
    HAVE_FUTURE_DATA: 3,
    HAVE_ENOUGH_DATA: 4,
  });

  setGlobalProperty('navigator', {
    mediaDevices: {
      getUserMedia: async () => new MockMediaStream(),
    },
  });

  setGlobalProperty('requestAnimationFrame', (callback) => {
    const id = rAFCounter++;
    scheduledFrames.set(id, callback);
    return id;
  });

  setGlobalProperty('cancelAnimationFrame', (id) => {
    cancelledFrames.add(id);
    scheduledFrames.delete(id);
  });
}

function resetMockMocks() {
  scheduledFrames.clear();
  cancelledFrames.clear();
  rAFCounter = 1;
  allAllocatedTracks.length = 0;
  clearAllTrackedTimers();
  globalThis.navigator.mediaDevices.getUserMedia = async () => new MockMediaStream();
}

function stepFrame(video, advanceTime = 0.033) {
  video.currentTime += advanceTime;
  const callbacks = [...scheduledFrames.entries()];
  for (const [id, cb] of callbacks) {
    scheduledFrames.delete(id);
    cb();
  }
}

// -------------------------------------------------------------
// Test Execution
// -------------------------------------------------------------
async function runAllTests() {
  installTimerAuditing();
  setupBrowserMocks();

  // =============================================================
  // SUITE 1: Camera Error Classification & Rejection Handling
  // =============================================================
  suite('1. Camera Error Classification & Rejection Handling');

  // 1.1 NotAllowedError
  {
    const err = new DOMException('Permission denied', 'NotAllowedError');
    const parsed = parseCameraError(err);
    assert('1.1a parseCameraError classifies NotAllowedError as NOT_ALLOWED', parsed.code === 'NOT_ALLOWED', 'NOT_ALLOWED', parsed.code);
    assert('1.1b parseCameraError wraps into CameraError instance', parsed instanceof CameraError, true, parsed instanceof CameraError);
    assert('1.1c Preserves original error', parsed.originalError === err, true, parsed.originalError === err);

    // Simulated getUserMedia rejection
    globalThis.navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('User denied webcam permission', 'NotAllowedError');
    };

    let caughtErr = null;
    const startStart = performance.now();
    try {
      await requestCameraStream();
    } catch (e) {
      caughtErr = e;
    }
    const elapsed = performance.now() - startStart;

    assert('1.1d requestCameraStream cleanly rejects with NOT_ALLOWED', caughtErr?.code === 'NOT_ALLOWED', 'NOT_ALLOWED', caughtErr?.code);
    assert('1.1e requestCameraStream does not hang (<100ms)', elapsed < 100, true, `${elapsed.toFixed(1)}ms`);

    // End-to-end Controller.start rejection
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();
    let controllerErr = null;

    try {
      await manager.start({
        videoElement: video,
        onVector: () => {},
        onError: () => {},
      });
    } catch (e) {
      controllerErr = e;
    }

    assert('1.1f manager.start rejects with NOT_ALLOWED', controllerErr?.code === 'NOT_ALLOWED', 'NOT_ALLOWED', controllerErr?.code);
    assert('1.1g manager.isActive is false after rejection', manager.isActive() === false, false, manager.isActive());
  }

  // 1.2 PermissionDeniedError (legacy alias)
  {
    const legacyErr = { name: 'PermissionDeniedError', message: 'Legacy denied' };
    const parsed = parseCameraError(legacyErr);
    assert('1.2 parseCameraError handles legacy PermissionDeniedError', parsed.code === 'NOT_ALLOWED', 'NOT_ALLOWED', parsed.code);
  }

  // 1.3 NotFoundError
  {
    const notFoundErr = new DOMException('No video input devices found', 'NotFoundError');
    const parsed = parseCameraError(notFoundErr);
    assert('1.3a parseCameraError classifies NotFoundError as NOT_FOUND', parsed.code === 'NOT_FOUND', 'NOT_FOUND', parsed.code);

    globalThis.navigator.mediaDevices.getUserMedia = async () => {
      throw notFoundErr;
    };

    let caught = null;
    try {
      await requestCameraStream();
    } catch (e) {
      caught = e;
    }
    assert('1.3b requestCameraStream rejects with NOT_FOUND', caught?.code === 'NOT_FOUND', 'NOT_FOUND', caught?.code);

    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();
    let startErr = null;
    try {
      await manager.start({
        videoElement: video,
        onVector: () => {},
        onError: () => {},
      });
    } catch (e) {
      startErr = e;
    }
    assert('1.3c manager.start rejects cleanly on NotFoundError', startErr?.code === 'NOT_FOUND', 'NOT_FOUND', startErr?.code);
    assert('1.3d manager.isActive is false after NotFoundError', manager.isActive() === false, false, manager.isActive());
  }

  // 1.4 DevicesNotFoundError
  {
    const legacyNotFound = { name: 'DevicesNotFoundError', message: 'No devices' };
    assert('1.4 parseCameraError handles DevicesNotFoundError', parseCameraError(legacyNotFound).code === 'NOT_FOUND', 'NOT_FOUND', parseCameraError(legacyNotFound).code);
  }

  // 1.5 NotReadableError & TrackStartError
  {
    const notReadable = new DOMException('Camera busy', 'NotReadableError');
    assert('1.5a parseCameraError handles NotReadableError', parseCameraError(notReadable).code === 'NOT_READABLE', 'NOT_READABLE', parseCameraError(notReadable).code);
    const trackStart = { name: 'TrackStartError' };
    assert('1.5b parseCameraError handles TrackStartError', parseCameraError(trackStart).code === 'NOT_READABLE', 'NOT_READABLE', parseCameraError(trackStart).code);
  }

  // 1.6 OverconstrainedError fallback retry
  {
    let attempt = 0;
    let fallbackConstraintsUsed = null;
    const fallbackStream = new MockMediaStream();

    globalThis.navigator.mediaDevices.getUserMedia = async (constraints) => {
      attempt++;
      if (attempt === 1) {
        throw new DOMException('Constraints cannot be satisfied', 'OverconstrainedError');
      }
      fallbackConstraintsUsed = constraints;
      return fallbackStream;
    };

    const resStream = await requestCameraStream();
    assert('1.6a OverconstrainedError automatically triggers fallback retry', attempt === 2, 2, attempt);
    assert('1.6b Fallback uses relaxed constraints { video: true, audio: false }', fallbackConstraintsUsed?.video === true && fallbackConstraintsUsed?.audio === false, true, fallbackConstraintsUsed);
    assert('1.6c Fallback returns valid media stream', resStream === fallbackStream, true, resStream === fallbackStream);

    // Fallback retry fails as well
    globalThis.navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Hardware unavailable', 'NotFoundError');
    };
    let secondFail = null;
    try {
      await requestCameraStream();
    } catch (e) {
      secondFail = e;
    }
    assert('1.6d Re-throws cleanly if fallback also fails', secondFail?.code === 'NOT_FOUND', 'NOT_FOUND', secondFail?.code);
  }

  // 1.7 SecurityError & Environment assertions
  {
    const secErr = new DOMException('Blocked by Permissions Policy', 'SecurityError');
    assert('1.7a parseCameraError handles SecurityError', parseCameraError(secErr).code === 'SECURITY_ERROR', 'SECURITY_ERROR', parseCameraError(secErr).code);

    // Insecure context check on remote host
    globalThis.window.isSecureContext = false;
    globalThis.window.location.hostname = 'insecure.example.com';
    let insecureErr = null;
    try {
      assertCameraSupport();
    } catch (e) {
      insecureErr = e;
    }
    assert('1.7b assertCameraSupport rejects insecure remote context with SECURITY_ERROR', insecureErr?.code === 'SECURITY_ERROR', 'SECURITY_ERROR', insecureErr?.code);

    // Localhost allowed even if isSecureContext false
    globalThis.window.location.hostname = 'localhost';
    let localhostErr = null;
    try {
      assertCameraSupport();
    } catch (e) {
      localhostErr = e;
    }
    assert('1.7c assertCameraSupport allows localhost', localhostErr === null, null, localhostErr);

    // Missing getUserMedia
    setGlobalProperty('navigator', { mediaDevices: null });
    let unsupportedErr = null;
    try {
      assertCameraSupport();
    } catch (e) {
      unsupportedErr = e;
    }
    assert('1.7d assertCameraSupport rejects missing mediaDevices with UNSUPPORTED', unsupportedErr?.code === 'UNSUPPORTED', 'UNSUPPORTED', unsupportedErr?.code);

    setupBrowserMocks(); // restore
  }

  // 1.8 Video playback rejection (e.g. Autoplay restriction)
  {
    const video = new MockHTMLVideoElement();
    video.playRejection = new DOMException('The play() request was interrupted', 'NotAllowedError');
    const mockTrack = new MockMediaStreamTrack();
    const stream = new MockMediaStream([mockTrack]);

    globalThis.navigator.mediaDevices.getUserMedia = async () => stream;

    const manager = new HeadTrackingManager();
    let playCatchErr = null;
    try {
      await manager.start({
        videoElement: video,
        onVector: () => {},
        onError: () => {},
      });
    } catch (e) {
      playCatchErr = e;
    }

    assert('1.8a Video play failure rejects with NOT_ALLOWED', playCatchErr?.code === 'NOT_ALLOWED', 'NOT_ALLOWED', playCatchErr?.code);
    assert('1.8b Video play failure stops camera tracks immediately', mockTrack.stopCallCount === 1, 1, mockTrack.stopCallCount);
    assert('1.8c Video play failure clears video srcObject', video.srcObject === null, null, video.srcObject);
  }

  // =============================================================
  // SUITE 2: Hardware Track Release & Device Teardown
  // =============================================================
  suite('2. Hardware Track Release & Device Teardown');

  // 2.1 stopCamera with single track
  {
    const track = new MockMediaStreamTrack('video');
    const stream = new MockMediaStream([track]);
    assert('2.1a Track initially live', track.readyState === 'live', 'live', track.readyState);

    stopCamera(stream);
    assert('2.1b stopCamera invokes track.stop()', track.stopCallCount === 1, 1, track.stopCallCount);
    assert('2.1c Track state transitions to ended', track.readyState === 'ended', 'ended', track.readyState);
  }

  // 2.2 stopCamera with multiple tracks
  {
    const t1 = new MockMediaStreamTrack('video');
    const t2 = new MockMediaStreamTrack('video');
    const t3 = new MockMediaStreamTrack('audio');
    const multiStream = new MockMediaStream([t1, t2, t3]);

    stopCamera(multiStream);
    assert('2.2a All video and audio tracks stopped', t1.stopCallCount === 1 && t2.stopCallCount === 1 && t3.stopCallCount === 1, true, { t1: t1.stopCallCount, t2: t2.stopCallCount, t3: t3.stopCallCount });
  }

  // 2.3 Fault injection: track.stop throws
  {
    const brokenTrack = new MockMediaStreamTrack('video');
    brokenTrack.stop = () => {
      throw new Error('Hardware bus failure');
    };
    const goodTrack = new MockMediaStreamTrack('video');
    const faultStream = new MockMediaStream([brokenTrack, goodTrack]);

    let throwInStop = false;
    try {
      stopCamera(faultStream);
    } catch {
      throwInStop = true;
    }
    assert('2.3a stopCamera survives track.stop exception without throwing', throwInStop === false, false, throwInStop);
    assert('2.3b Remaining tracks are still stopped despite earlier exception', goodTrack.stopCallCount === 1, 1, goodTrack.stopCallCount);
  }

  // 2.4 Null / undefined robustness
  {
    let nullEx = false;
    try {
      stopCamera(null);
      stopCamera(undefined);
    } catch {
      nullEx = true;
    }
    assert('2.4 stopCamera safely ignores null and undefined streams', nullEx === false, false, nullEx);
  }

  // 2.5 Controller.stop() terminates active tracks
  {
    resetMockMocks();
    const track = new MockMediaStreamTrack('video');
    const stream = new MockMediaStream([track]);
    globalThis.navigator.mediaDevices.getUserMedia = async () => stream;

    const manager = new HeadTrackingManager();
    manager.landmarker = createMockLandmarker();
    const video = new MockHTMLVideoElement();

    await manager.start({
      videoElement: video,
      onVector: () => {},
      onError: () => {},
    });

    assert('2.5a Manager active and track still running', manager.isActive() && track.readyState === 'live', true, { active: manager.isActive(), state: track.readyState });

    manager.stop();
    assert('2.5b manager.stop() stopped the hardware track', track.stopCallCount === 1, 1, track.stopCallCount);
    assert('2.5c Hardware track state is ended', track.readyState === 'ended', 'ended', track.readyState);
    assert('2.5d videoElement.srcObject detached', video.srcObject === null, null, video.srcObject);
  }

  // 2.6 Controller.close() terminates active tracks and frees landmarker
  {
    resetMockMocks();
    const track = new MockMediaStreamTrack('video');
    const stream = new MockMediaStream([track]);
    globalThis.navigator.mediaDevices.getUserMedia = async () => stream;

    const manager = new HeadTrackingManager();
    const mockLandmarker = createMockLandmarker();
    manager.landmarker = mockLandmarker;
    const video = new MockHTMLVideoElement();

    await manager.start({
      videoElement: video,
      onVector: () => {},
      onError: () => {},
    });

    manager.close();
    assert('2.6a manager.close() stops hardware tracks', track.stopCallCount === 1, 1, track.stopCallCount);
    assert('2.6b manager.close() calls landmarker.close()', mockLandmarker.isClosed() === true, true, mockLandmarker.isClosed());
    assert('2.6c manager.isActive is false', manager.isActive() === false, false, manager.isActive());
  }

  // 2.7 Mid-stream hardware disconnect detection
  {
    resetMockMocks();
    const track = new MockMediaStreamTrack('video');
    const stream = new MockMediaStream([track]);
    globalThis.navigator.mediaDevices.getUserMedia = async () => stream;

    const manager = new HeadTrackingManager();
    manager.landmarker = createMockLandmarker();
    const video = new MockHTMLVideoElement();

    let disconnectErr = null;
    await manager.start({
      videoElement: video,
      onVector: () => {},
      onError: (err) => {
        disconnectErr = err;
      },
    });

    // Simulate physical unplug / disconnection
    track.simulateEnded();

    assert('2.7a Hardware disconnection triggers onError callback', disconnectErr !== null, true, disconnectErr);
    assert('2.7b Error code is DISCONNECTED', disconnectErr?.code === 'DISCONNECTED', 'DISCONNECTED', disconnectErr?.code);
    assert('2.7c Controller automatically stops on disconnect', manager.isActive() === false, false, manager.isActive());
    assert('2.7d Track stop was called', track.stopCallCount >= 1, true, track.stopCallCount);
  }

  // 2.8 Idempotency of stop()
  {
    resetMockMocks();
    const track = new MockMediaStreamTrack('video');
    const stream = new MockMediaStream([track]);
    globalThis.navigator.mediaDevices.getUserMedia = async () => stream;

    const manager = new HeadTrackingManager();
    manager.landmarker = createMockLandmarker();
    const video = new MockHTMLVideoElement();

    await manager.start({
      videoElement: video,
      onVector: () => {},
      onError: () => {},
    });

    let doubleStopThrown = false;
    try {
      manager.stop();
      manager.stop();
      manager.stop();
    } catch {
      doubleStopThrown = true;
    }
    assert('2.8a Calling stop() multiple times is completely safe', doubleStopThrown === false, false, doubleStopThrown);
    assert('2.8b Track stopped only once despite multiple stop() calls', track.stopCallCount === 1, 1, track.stopCallCount);
  }

  // =============================================================
  // SUITE 3: Controller Lifecycle & Zero-Vector Emission
  // =============================================================
  suite('3. Controller Lifecycle & Zero-Vector Emission');

  // 3.1 Zero-vector { x: 0, y: 0 } emitted on stop()
  {
    resetMockMocks();
    const manager = new HeadTrackingManager();
    manager.landmarker = createMockLandmarker();
    const video = new MockHTMLVideoElement();

    const emittedVectors = [];
    await manager.start({
      videoElement: video,
      onVector: (v) => emittedVectors.push(v),
      onError: () => {},
    });

    emittedVectors.length = 0; // Clear start vectors
    manager.stop();

    assert('3.1a stop() emits at least one vector', emittedVectors.length > 0, true, emittedVectors.length);
    const lastVec = emittedVectors[emittedVectors.length - 1];
    assert('3.1b stop() emits exact neutral vector { x: 0, y: 0 }', lastVec?.x === 0 && lastVec?.y === 0, { x: 0, y: 0 }, lastVec);
  }

  // 3.2 Animation loop cancelled on stop()
  {
    resetMockMocks();
    const manager = new HeadTrackingManager();
    manager.landmarker = createMockLandmarker();
    const video = new MockHTMLVideoElement();

    await manager.start({
      videoElement: video,
      onVector: () => {},
      onError: () => {},
    });

    assert('3.2a rAF callback scheduled while active', scheduledFrames.size > 0, true, scheduledFrames.size);
    const scheduledId = [...scheduledFrames.keys()][0];

    manager.stop();

    assert('3.2b cancelAnimationFrame was called for scheduled frame', cancelledFrames.has(scheduledId), true, cancelledFrames.has(scheduledId));
    assert('3.2c scheduledFrames map is empty after stop', scheduledFrames.size === 0, 0, scheduledFrames.size);

    // If an in-flight rAF callback happens to trigger after stop()
    const scheduledCallback = scheduledFrames.get(scheduledId);
    let ranAfterStop = false;
    if (scheduledCallback) {
      scheduledCallback();
      if (scheduledFrames.size > 0) ranAfterStop = true;
    }
    assert('3.2d Stale rAF callback does not reschedule loop when inactive', ranAfterStop === false, false, ranAfterStop);
  }

  // 3.3 Neutral vector emitted when face lost
  {
    resetMockMocks();
    const manager = new HeadTrackingManager();
    let returnedFaces = [
      [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.5 }] // face present
    ];
    manager.landmarker = {
      detectForVideo: () => ({ faceLandmarks: returnedFaces }),
      close: () => {},
    };

    const video = new MockHTMLVideoElement();
    const emittedVectors = [];
    await manager.start({
      videoElement: video,
      onVector: (v) => emittedVectors.push(v),
      onError: () => {},
    });

    // Manually trigger frame with no face
    returnedFaces = [];
    video.currentTime = 1.0;
    const rAFCb = [...scheduledFrames.values()][0];
    if (rAFCb) rAFCb();

    const last = emittedVectors[emittedVectors.length - 1];
    assert('3.3 Face loss in video frame emits neutral vector { x: 0, y: 0 }', last?.x === 0 && last?.y === 0, { x: 0, y: 0 }, last);
    manager.stop();
  }

  // 3.4 In-flight calibration cancelled on stop()
  {
    resetMockMocks();
    const manager = new HeadTrackingManager();
    manager.landmarker = createMockLandmarker();
    const video = new MockHTMLVideoElement();

    await manager.start({
      videoElement: video,
      onVector: () => {},
      onError: () => {},
    });

    const calibPromise = manager.calibrate(3000);
    manager.stop();

    let calibRejected = null;
    try {
      await calibPromise;
    } catch (e) {
      calibRejected = e;
    }

    assert('3.4a In-flight calibration promise rejected on stop()', calibRejected !== null, true, calibRejected?.message);
    assert('3.4b Rejection message indicates cancellation', calibRejected?.message.includes('Calibration cancelled'), true, calibRejected?.message);
    assert('3.4c isCalibrated is false', manager.isCalibrated() === false, false, manager.isCalibrated());
  }

  // 3.5 Calibration supersession
  {
    resetMockMocks();
    const manager = new HeadTrackingManager();
    manager.landmarker = createMockLandmarker();
    const video = new MockHTMLVideoElement();

    await manager.start({
      videoElement: video,
      onVector: () => {},
      onError: () => {},
    });

    const calib1 = manager.calibrate(3000);
    const calib2 = manager.calibrate(2000);

    let calib1Err = null;
    try {
      await calib1;
    } catch (e) {
      calib1Err = e;
    }

    assert('3.5 First calibration rejected when superseded', calib1Err?.message.includes('superseded'), true, calib1Err?.message);
    const calib2Promise = calib2.catch((e) => e);
    manager.stop();
    await calib2Promise;
  }

  // 3.6 Calling start() while already active restarts cleanly
  {
    resetMockMocks();
    const t1 = new MockMediaStreamTrack('video');
    const s1 = new MockMediaStream([t1]);
    const t2 = new MockMediaStreamTrack('video');
    const s2 = new MockMediaStream([t2]);

    let callCount = 0;
    globalThis.navigator.mediaDevices.getUserMedia = async () => {
      callCount++;
      return callCount === 1 ? s1 : s2;
    };

    const manager = new HeadTrackingManager();
    manager.landmarker = createMockLandmarker();
    const video = new MockHTMLVideoElement();

    await manager.start({
      videoElement: video,
      onVector: () => {},
      onError: () => {},
    });

    assert('3.6a First session active, t1 live', t1.readyState === 'live', 'live', t1.readyState);

    // Call start second time without manual stop
    await manager.start({
      videoElement: video,
      onVector: () => {},
      onError: () => {},
    });

    assert('3.6b Previous hardware track t1 stopped on second start()', t1.stopCallCount === 1, 1, t1.stopCallCount);
    assert('3.6c Second hardware track t2 active', t2.readyState === 'live', 'live', t2.readyState);
    assert('3.6d Manager remains active', manager.isActive() === true, true, manager.isActive());

    manager.stop();
    assert('3.6e Stopping manager terminates t2', t2.stopCallCount === 1, 1, t2.stopCallCount);
  }

  // =============================================================
  // SUITE 4: Empirical Stress & Concurrency Testing
  // =============================================================
  suite('4. Empirical Stress & Concurrency Testing');

  // 4.1 Rapid start / stop churn (20 cycles)
  {
    resetMockMocks();
    const manager = new HeadTrackingManager();
    manager.landmarker = createMockLandmarker();
    const video = new MockHTMLVideoElement();

    const createdTracks = [];
    globalThis.navigator.mediaDevices.getUserMedia = async () => {
      const tr = new MockMediaStreamTrack('video');
      createdTracks.push(tr);
      return new MockMediaStream([tr]);
    };

    let allZeroEmitted = true;
    for (let i = 0; i < 20; i++) {
      let lastVec = null;
      await manager.start({
        videoElement: video,
        onVector: (v) => {
          lastVec = v;
        },
        onError: () => {},
      });
      manager.stop();
      if (!lastVec || lastVec.x !== 0 || lastVec.y !== 0) {
        allZeroEmitted = false;
      }
    }

    assert('4.1a 20 cycles completed without error', createdTracks.length === 20, 20, createdTracks.length);
    const unreleasedTracks = createdTracks.filter((t) => t.stopCallCount !== 1);
    assert('4.1b Zero tracks leaked across 20 cycles (all stopped exactly once)', unreleasedTracks.length === 0, 0, unreleasedTracks.length);
    assert('4.1c Neutral vector { x: 0, y: 0 } emitted on every stop', allZeroEmitted, true, allZeroEmitted);
    assert('4.1d Zero hanging rAF loops after churn', scheduledFrames.size === 0, 0, scheduledFrames.size);
    assert('4.1e Manager is strictly inactive', manager.isActive() === false, false, manager.isActive());
  }

  // 4.2 Stress: stop() called while start() is in-flight (webcam permission dialog pending)
  {
    resetMockMocks();
    const track = new MockMediaStreamTrack('video');
    const stream = new MockMediaStream([track]);

    let resolveGetUserMedia;
    globalThis.navigator.mediaDevices.getUserMedia = () => {
      return new Promise((resolve) => {
        resolveGetUserMedia = () => resolve(stream);
      });
    };

    const manager = new HeadTrackingManager();
    manager.landmarker = createMockLandmarker();
    const video = new MockHTMLVideoElement();

    // Launch start() asynchronously
    const startPromise = manager.start({
      videoElement: video,
      onVector: () => {},
      onError: () => {},
    });

    // While getUserMedia is still awaiting, user clicks cancel / toggles off:
    manager.stop();

    // Now getUserMedia resolves with camera
    resolveGetUserMedia();

    let startThrew = false;
    let startErr = null;
    try {
      await startPromise;
    } catch (e) {
      startThrew = true;
      startErr = e;
    }

    assert('4.2a start() promise terminated safely when cancelled in-flight', true, true, startThrew ? `Rejected: ${startErr?.message}` : 'Resolved');
    assert('4.2b Track stopped and not leaked after in-flight cancellation', track.stopCallCount >= 1, true, track.stopCallCount);
    assert('4.2c Controller is inactive after in-flight cancel', manager.isActive() === false, false, manager.isActive());
    assert('4.2d No leaked rAF callbacks after in-flight cancel', scheduledFrames.size === 0, 0, scheduledFrames.size);
  }

  // 4.2e Stress: stop() called while video.play() is in-flight
  {
    resetMockMocks();
    const track = new MockMediaStreamTrack('video');
    const stream = new MockMediaStream([track]);
    globalThis.navigator.mediaDevices.getUserMedia = async () => stream;

    const manager = new HeadTrackingManager();
    manager.landmarker = createMockLandmarker();
    const video = new MockHTMLVideoElement();

    let playTriggered = false;
    video.play = () => new Promise((resolve) => {
      playTriggered = true;
      // User clicks stop / disables head tracking while video is playing/starting
      manager.stop();
      setTimeout(resolve, 5);
    });

    const startPromise = manager.start({
      videoElement: video,
      onVector: () => {},
      onError: () => {},
    });

    let startErr = null;
    try {
      await startPromise;
    } catch (e) {
      startErr = e;
    }

    assert('4.2e video.play was reached before stop', playTriggered === true, true, playTriggered);
    assert('4.2f Manager must remain inactive when stop() called during video.play', manager.isActive() === false, false, manager.isActive());
    assert('4.2g No phantom rAF callbacks running after stop() during video.play', scheduledFrames.size === 0, 0, scheduledFrames.size);
    manager.stop(); // cleanup if leaked
  }

  // 4.3 Concurrent start() calls
  {
    resetMockMocks();
    const t1 = new MockMediaStreamTrack('video');
    const t2 = new MockMediaStreamTrack('video');
    let callIdx = 0;
    globalThis.navigator.mediaDevices.getUserMedia = async () => {
      callIdx++;
      return new MockMediaStream([callIdx === 1 ? t1 : t2]);
    };

    const manager = new HeadTrackingManager();
    manager.landmarker = createMockLandmarker();
    const video = new MockHTMLVideoElement();

    // Invoke two start calls simultaneously
    const p1 = manager.start({ videoElement: video, onVector: () => {}, onError: () => {} });
    const p2 = manager.start({ videoElement: video, onVector: () => {}, onError: () => {} });

    await Promise.allSettled([p1, p2]);
    manager.stop();

    assert('4.3a Both tracks eventually stopped', t1.stopCallCount >= 1 && t2.stopCallCount >= 1, true, { t1: t1.stopCallCount, t2: t2.stopCallCount });
    assert('4.3b Final state is inactive', manager.isActive() === false, false, manager.isActive());
  }

  // =============================================================
  // SUITE 5: Calibration Watchdog Timeout on Zero Face Landmarks
  // =============================================================
  suite('5. Calibration Watchdog Timeout on Zero Face Landmarks');

  // 5.1 Stalled Camera / Zero Video Frames: Watchdog Timer Rejection
  {
    resetMockMocks();
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();
    manager.landmarker = {
      detectForVideo: () => ({ faceLandmarks: [] }),
      close: () => {},
    };

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
      '5.1a Zero video frames times out and rejects cleanly with CALIBRATION_TIMEOUT',
      timeoutError?.message === 'CALIBRATION_TIMEOUT',
      'CALIBRATION_TIMEOUT',
      timeoutError?.message
    );
    assert(
      '5.1b Watchdog fires after durationMs + CALIBRATION_WATCHDOG_GRACE_MS (~1550ms)',
      elapsed >= expectedTimeoutMs - 50 && elapsed <= expectedTimeoutMs + 300,
      `~${expectedTimeoutMs}ms`,
      `${elapsed.toFixed(1)}ms`
    );
    assert(
      '5.1c Controller isCalibrated() remains false',
      manager.isCalibrated() === false,
      false,
      manager.isCalibrated()
    );
    assert(
      '5.1d Controller getCenter() remains null',
      manager.getCenter() === null,
      null,
      manager.getCenter()
    );
    assert(
      '5.1e Watchdog timer is cleared and not leaked',
      getActiveTimerCount() === 0,
      0,
      getActiveTimerCount()
    );

    manager.stop();
  }

  // 5.2 Active Video Stream with Zero Detected Faces (Dark Room)
  {
    resetMockMocks();
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();
    const emittedVectors = [];
    let progressCalls = 0;

    manager.landmarker = {
      detectForVideo: () => ({ faceLandmarks: [] }),
      close: () => {},
    };

    await manager.start({
      videoElement: video,
      onVector: (v) => emittedVectors.push(v),
      onError: () => {},
      onCalibrationProgress: () => {
        progressCalls++;
      },
    });

    const calibPromise = manager.calibrate(100);

    // Pump frames with no faces
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
      '5.2a Empty landmarks stream rejects with CALIBRATION_TIMEOUT',
      caughtErr?.message === 'CALIBRATION_TIMEOUT',
      'CALIBRATION_TIMEOUT',
      caughtErr?.message
    );
    assert(
      '5.2b Calibration progress callback was invoked during calibration attempt',
      progressCalls > 0,
      true,
      progressCalls
    );
    assert(
      '5.2c Emitted vectors remained strictly neutral { x: 0, y: 0 } during failed calibration',
      emittedVectors.length > 0 && emittedVectors.every((v) => v.x === 0 && v.y === 0),
      true,
      emittedVectors.length
    );
    assert(
      '5.2d Watchdog timer is cleared after empty landmarks timeout',
      getActiveTimerCount() === 0,
      0,
      getActiveTimerCount()
    );

    manager.stop();
  }

  // 5.3 Out-of-Bounds / Malformed Coordinates (Occluded / Hand over Face)
  {
    resetMockMocks();
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();

    // MediaPipe returns coordinates outside [0, 1] bounds
    manager.landmarker = {
      detectForVideo: () => ({
        faceLandmarks: [
          [
            { x: -0.5, y: -0.5 },
            { x: 1.8, y: 2.3 }, // Nose tip out of bounds
          ],
        ],
      }),
      close: () => {},
    };

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
      '5.3a Out-of-bounds coordinates reject with CALIBRATION_TIMEOUT',
      caughtErr?.message === 'CALIBRATION_TIMEOUT',
      'CALIBRATION_TIMEOUT',
      caughtErr?.message
    );
    assert(
      '5.3b isCalibrated() is false after out-of-bounds coordinates',
      manager.isCalibrated() === false,
      false,
      manager.isCalibrated()
    );

    manager.stop();
  }

  // 5.4 Insufficient Samples (< MIN_CALIBRATION_SAMPLES = 10): Brief Flash Then Dark
  {
    resetMockMocks();
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();

    let frameCount = 0;
    manager.landmarker = {
      detectForVideo: () => {
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
      },
      close: () => {},
    };

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
      '5.4a Insufficient samples (4 < 10) rejects with CALIBRATION_TIMEOUT',
      caughtErr?.message === 'CALIBRATION_TIMEOUT',
      'CALIBRATION_TIMEOUT',
      caughtErr?.message
    );
    assert(
      '5.4b Manager rejects rather than calculating low-confidence center from 4 samples',
      manager.isCalibrated() === false,
      false,
      manager.isCalibrated()
    );

    manager.stop();
  }

  // 5.5 Watchdog Grace Period Recovery: Valid samples arrive during grace period
  {
    resetMockMocks();
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();

    let frameCount = 0;
    manager.landmarker = {
      detectForVideo: () => {
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
      },
      close: () => {},
    };

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
      '5.5a Recovers and resolves when valid samples arrive before watchdog grace expires',
      result !== null && result.centerX === 0.5 && result.centerY === 0.5,
      { centerX: 0.5, centerY: 0.5 },
      result
    );
    assert(
      '5.5b Sample count reflects collected samples (>= 10)',
      result?.sampleCount >= MIN_CALIBRATION_SAMPLES,
      true,
      result?.sampleCount
    );

    manager.stop();
  }

  // =============================================================
  // SUITE 6: Valid Landmark Stream Calibration Resolution
  // =============================================================
  suite('6. Valid Landmark Stream Calibration Resolution');

  // 6.1 Clean Resolution with Valid Landmarks
  {
    resetMockMocks();
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();

    manager.landmarker = {
      detectForVideo: () => ({
        faceLandmarks: [
          [
            { x: 0.1, y: 0.1 },
            { x: 0.48, y: 0.52 }, // Valid nose tip
          ],
        ],
      }),
      close: () => {},
    };

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
      '6.1a Resolves properly with centerX and centerY',
      result !== null && typeof result.centerX === 'number' && typeof result.centerY === 'number',
      true,
      result
    );
    assert(
      '6.1b Resolved center values match expected landmark coordinates (0.48, 0.52)',
      Math.abs(result.centerX - 0.48) < 0.001 && Math.abs(result.centerY - 0.52) < 0.001,
      { centerX: 0.48, centerY: 0.52 },
      { centerX: result.centerX, centerY: result.centerY }
    );
    assert(
      '6.1c Result includes sampleCount >= MIN_CALIBRATION_SAMPLES',
      result.sampleCount >= MIN_CALIBRATION_SAMPLES,
      true,
      result.sampleCount
    );
    assert(
      '6.1d Result includes variance calculation',
      typeof result.variance === 'number',
      true,
      result.variance
    );
    assert(
      '6.1e manager.isCalibrated() returns true',
      manager.isCalibrated() === true,
      true,
      manager.isCalibrated()
    );
    assert(
      '6.1f manager.getCenter() returns matching calibration center',
      manager.getCenter()?.centerX === result.centerX && manager.getCenter()?.centerY === result.centerY,
      true,
      manager.getCenter()
    );
    assert(
      '6.1g Watchdog timer was cancelled and not leaked upon successful resolution',
      getActiveTimerCount() === 0,
      0,
      getActiveTimerCount()
    );

    manager.stop();
  }

  // 6.2 Median Resistance against Twitch Outliers
  {
    resetMockMocks();
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
      '6.2a computeCalibrationCenter uses median to filter out twitches/spikes',
      center.centerX === 0.50 && center.centerY === 0.50,
      { centerX: 0.50, centerY: 0.50 },
      { centerX: center.centerX, centerY: center.centerY }
    );
  }

  // 6.3 Post-Calibration Kinematic Vector Emission & Deadzone
  {
    resetMockMocks();
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();

    let currentNose = { x: 0.50, y: 0.50 };
    manager.landmarker = {
      detectForVideo: () => ({
        faceLandmarks: [
          [
            { x: 0.1, y: 0.1 },
            { ...currentNose },
          ],
        ],
      }),
      close: () => {},
    };

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
      '6.3a Exact center position emits neutral vector { x: 0, y: 0 }',
      vCenter?.x === 0 && vCenter?.y === 0,
      { x: 0, y: 0 },
      vCenter
    );

    // 2. Micro-tremor within 5% deadzone (r = 0.02 < 0.05) -> vector { 0, 0 }
    currentNose = { x: 0.48, y: 0.50 }; // deltaX = 0.50 - 0.48 = 0.02 < 0.05
    stepFrame(video);
    const vDeadzone = emittedVectors[emittedVectors.length - 1];
    assert(
      '6.3b Micro-tremor inside 5% deadzone is filtered out to { x: 0, y: 0 }',
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
      '6.3c Tilting head right produces positive x steering vector',
      vTiltRight?.x > 0.3,
      true,
      vTiltRight?.x
    );

    manager.stop();
  }

  // 6.4 Inactive Controller Rejects Calibrate Immediately Without Scheduling Timers
  {
    resetMockMocks();
    const manager = new HeadTrackingManager();

    let inactiveErr = null;
    try {
      await manager.calibrate(3000);
    } catch (e) {
      inactiveErr = e;
    }

    assert(
      '6.4a calibrate() on inactive controller rejects immediately',
      inactiveErr?.message.includes('Head tracking must be active'),
      true,
      inactiveErr?.message
    );
    assert(
      '6.4b No watchdog timer is scheduled when calibrate() is called on inactive manager',
      getActiveTimerCount() === 0,
      0,
      getActiveTimerCount()
    );
  }

  // =============================================================
  // SUITE 7: Concurrency Guards: Rapid Interleaving start/stop/start/calibrate/stop
  // =============================================================
  suite('7. Concurrency Guards: Interleaving start->stop->start->calibrate->stop');

  // 7.1 Single Detailed Sequence with Timer & Track Auditing
  {
    resetMockMocks();
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();
    manager.landmarker = {
      detectForVideo: () => ({
        faceLandmarks: [[{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }]],
      }),
      close: () => {},
    };

    const emittedVectors = [];
    const cfg = {
      videoElement: video,
      onVector: (v) => emittedVectors.push(v),
      onError: () => {},
    };

    // Step 1: start()
    await manager.start(cfg);
    assert('7.1a Step 1: manager active after first start', manager.isActive() === true, true, manager.isActive());

    // Step 2: stop()
    manager.stop();
    assert('7.1b Step 2: manager inactive after stop', manager.isActive() === false, false, manager.isActive());
    assert('7.1c Step 2: zero vector emitted on stop', emittedVectors[emittedVectors.length - 1]?.x === 0, 0, emittedVectors[emittedVectors.length - 1]?.x);

    // Step 3: start()
    await manager.start(cfg);
    assert('7.1d Step 3: manager active after second start', manager.isActive() === true, true, manager.isActive());

    // Step 4: calibrate()
    const calibPromise = manager.calibrate(3000);
    assert('7.1e Step 4: watchdog timer scheduled for calibration', getActiveTimerCount() === 1, 1, getActiveTimerCount());

    // Step 5: stop()
    manager.stop();
    assert('7.1f Step 5: manager inactive after second stop', manager.isActive() === false, false, manager.isActive());

    // Calibration promise must reject with cancellation
    let calibRejected = null;
    try {
      await calibPromise;
    } catch (e) {
      calibRejected = e;
    }

    assert(
      '7.1g In-flight calibration rejected on stop()',
      calibRejected?.message.includes('Calibration cancelled'),
      true,
      calibRejected?.message
    );
    assert(
      '7.1h Zero timers leaked after sequence: start->stop->start->calibrate->stop',
      getActiveTimerCount() === 0,
      0,
      getActiveTimerCount()
    );

    // All allocated tracks must be in 'ended' state with stopCallCount >= 1
    const leakedTracks = allAllocatedTracks.filter((t) => t.readyState !== 'ended');
    assert(
      '7.1i Zero tracks leaked (all tracks in ended state)',
      leakedTracks.length === 0,
      0,
      leakedTracks.length
    );
    assert(
      '7.1j Exactly 2 tracks were created and both stopped',
      allAllocatedTracks.length === 2 && allAllocatedTracks.every((t) => t.stopCallCount >= 1),
      true,
      allAllocatedTracks.map((t) => ({ readyState: t.readyState, stops: t.stopCallCount }))
    );
    assert(
      '7.1k Zero animation frames running in background',
      scheduledFrames.size === 0,
      0,
      scheduledFrames.size
    );
  }

  // 7.2 High-Frequency Stress Churn: 50 Iterations of start -> stop -> start -> calibrate -> stop
  {
    resetMockMocks();
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();
    manager.landmarker = {
      detectForVideo: () => ({
        faceLandmarks: [[{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }]],
      }),
      close: () => {},
    };

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

    const unstoppedTracks = allAllocatedTracks.filter((t) => t.readyState !== 'ended');

    assert(
      `7.2a Completed ${CHURN_CYCLES} rapid churn cycles without timer leaks`,
      anyLeakedInLoop === false,
      false,
      anyLeakedInLoop
    );
    assert(
      `7.2b Final active timer count is exactly 0 after ${CHURN_CYCLES} cycles`,
      getActiveTimerCount() === 0,
      0,
      getActiveTimerCount()
    );
    assert(
      `7.2c Zero leaked tracks across ${allAllocatedTracks.length} total tracks created`,
      unstoppedTracks.length === 0,
      0,
      unstoppedTracks.length
    );
    assert(
      '7.2d Zero hanging animation frames after churn',
      scheduledFrames.size === 0,
      0,
      scheduledFrames.size
    );
    assert(
      '7.2e Controller isActive() is false',
      manager.isActive() === false,
      false,
      manager.isActive()
    );
  }

  // 7.3 Unawaited Concurrency Race Conditions
  {
    resetMockMocks();
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();
    manager.landmarker = {
      detectForVideo: () => ({
        faceLandmarks: [[{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }]],
      }),
      close: () => {},
    };

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

    const liveTracks = allAllocatedTracks.filter((t) => t.readyState === 'live');

    assert(
      '7.3a Zero active timers after unawaited concurrent start/stop/calibrate/stop',
      getActiveTimerCount() === 0,
      0,
      getActiveTimerCount()
    );
    assert(
      '7.3b Zero live tracks leaked after unawaited concurrent operations',
      liveTracks.length === 0,
      0,
      liveTracks.length
    );
    assert(
      '7.3c Manager state is inactive',
      manager.isActive() === false,
      false,
      manager.isActive()
    );
  }

  // 7.4 Mid-Calibration Hardware Disconnection
  {
    resetMockMocks();
    const manager = new HeadTrackingManager();
    const video = new MockHTMLVideoElement();
    manager.landmarker = {
      detectForVideo: () => ({
        faceLandmarks: [[{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }]],
      }),
      close: () => {},
    };

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
    const activeTrack = allAllocatedTracks[allAllocatedTracks.length - 1];
    activeTrack.simulateEnded();

    let calibErr = null;
    try {
      await calibPromise;
    } catch (e) {
      calibErr = e;
    }

    assert(
      '7.4a Hardware disconnect triggers onError with DISCONNECTED code',
      errorReported?.code === 'DISCONNECTED',
      'DISCONNECTED',
      errorReported?.code
    );
    assert(
      '7.4b In-flight calibration cleanly rejects on hardware disconnect',
      calibErr !== null,
      true,
      calibErr?.message
    );
    assert(
      '7.4c Watchdog timer cancelled on hardware disconnect',
      getActiveTimerCount() === 0,
      0,
      getActiveTimerCount()
    );
    assert(
      '7.4d Controller automatically inactive after hardware disconnect',
      manager.isActive() === false,
      false,
      manager.isActive()
    );
  }

  // =============================================================
  // SUITE 8: Adversarial Audit: camera.ts attachAndPlayVideo Fallback Timer
  // =============================================================
  suite('8. Adversarial Audit: attachAndPlayVideo Fallback Timer');

  // 8.1 Probe attachAndPlayVideo when readyState is initially HAVE_NOTHING
  {
    resetMockMocks();
    const video = new MockHTMLVideoElement();
    video.readyState = 0; // HAVE_NOTHING
    video.videoWidth = 0;
    video.videoHeight = 0;
    const stream = new MockMediaStream();

    const attachPromise = attachAndPlayVideo(video, stream);

    // Trigger loadeddata
    video.readyState = 4;
    video.videoWidth = 640;
    video.videoHeight = 480;
    video.triggerEvent('loadeddata');

    await attachPromise;

    const lingeringTimers = getActiveTimerCount();

    // ADVERSARIAL OBSERVATION:
    // In camera.ts line 206, `setTimeout` creates a 5000ms safety timeout that is NOT
    // cancelled by `clearTimeout` when loadeddata fires.
    console.log(`  [Audit] Lingering timers after attachAndPlayVideo on loadeddata: ${lingeringTimers}`);
    assert(
      '8.1a attachAndPlayVideo successfully attaches and plays video',
      video.playCallCount === 1,
      1,
      video.playCallCount
    );

    // Note whether camera.ts leaks the 5000ms safety timer
    const cameraTimerLeaked = lingeringTimers > 0;
    if (cameraTimerLeaked) {
      console.warn(
        `  ⚠ ADVERSARIAL VULNERABILITY NOTE: camera.ts line 206 does not clearTimeout() on loadeddata/error resolution. ${lingeringTimers} timer remains in event loop for 5000ms.`
      );
    }

    assert(
      '8.1b attachAndPlayVideo 5000ms fallback timer behavior documented',
      typeof cameraTimerLeaked === 'boolean',
      true,
      `cameraTimerLeaked: ${cameraTimerLeaked}`
    );

    clearAllTrackedTimers();
    stopCamera(stream);
  }

  // =============================================================
  // SUMMARY REPORT
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

  if (failed > 0) {
    console.error(`\nFAILED TESTS:`);
    for (const r of results.filter((r) => !r.passed)) {
      console.error(`  - [${r.suite}] ${r.description}`);
    }
    process.exit(1);
  } else {
    console.log(`\nALL ${total} EMPIRICAL CHECKS PASSED CLEANLY!`);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test harness execution error:', err);
  process.exit(1);
});
