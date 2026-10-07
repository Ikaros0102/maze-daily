/**
 * src/modules/headTracking/camera.ts
 *
 * Web camera acquisition, stream lifecycle management, track monitoring,
 * and localized error classification for the Head Tracking Module.
 */

import { CameraError, type CameraErrorCode } from './types.ts';

export const CAMERA_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: 'user',
  width: { ideal: 640 },
  height: { ideal: 480 },
  frameRate: { ideal: 30, max: 30 },
};

export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: CAMERA_VIDEO_CONSTRAINTS,
  audio: false,
};

/**
 * Asserts that the current runtime environment supports webcam access.
 * Throws a typed CameraError if unsupported or running in an insecure context.
 */
export function assertCameraSupport(): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    throw new CameraError('UNSUPPORTED', 'Webcam API is unavailable in non-browser environments.');
  }

  // Check secure context (localhost and 127.0.0.1 are permitted for development)
  if (
    !window.isSecureContext &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    throw new CameraError('SECURITY_ERROR', 'Camera access requires a secure context (HTTPS).');
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    throw new CameraError('UNSUPPORTED', 'This browser does not support webcam media access.');
  }
}

/**
 * Normalizes any error thrown during camera access into a typed CameraError.
 */
export function parseCameraError(error: unknown): CameraError {
  if (error instanceof CameraError) {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    const err = error as { name?: string; message?: string };
    const name = err.name || '';

    switch (name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return new CameraError(
          'NOT_ALLOWED',
          'Camera access was denied. Please allow camera permissions in your browser.',
          error
        );
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return new CameraError(
          'NOT_FOUND',
          'No camera device was found on this system.',
          error
        );
      case 'NotReadableError':
      case 'TrackStartError':
        return new CameraError(
          'NOT_READABLE',
          'Camera is in use by another application or hardware device failed.',
          error
        );
      case 'OverconstrainedError':
      case 'ConstraintNotSatisfiedError':
        return new CameraError(
          'OVERCONSTRAINED',
          'Camera constraints could not be satisfied by available devices.',
          error
        );
      case 'SecurityError':
        return new CameraError(
          'SECURITY_ERROR',
          'Camera access was blocked by security or permissions policy.',
          error
        );
      case 'AbortError':
        return new CameraError(
          'UNKNOWN',
          'Camera acquisition request was aborted.',
          error
        );
    }
  }

  const message = (error instanceof Error ? error.message : String(error)) || 'Unknown camera error.';
  return new CameraError('UNKNOWN', message, error);
}

/**
 * Requests a user-facing webcam video stream with ideal 640x480 @ 30fps constraints.
 * Gracefully retries with relaxed constraints if an OverconstrainedError occurs.
 */
export async function requestCameraStream(
  constraints: MediaStreamConstraints = CAMERA_CONSTRAINTS
): Promise<MediaStream> {
  assertCameraSupport();

  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    const parsed = parseCameraError(err);

    // If overconstrained, retry with relaxed fallback constraints
    if (parsed.code === 'OVERCONSTRAINED') {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      } catch (fallbackErr) {
        throw parseCameraError(fallbackErr);
      }
    }

    throw parsed;
  }
}

/**
 * Stops all MediaStreamTracks on the stream, turning off the physical webcam indicator.
 */
export function stopCamera(stream: MediaStream | null): void {
  if (!stream) return;
  try {
    const tracks = stream.getTracks();
    for (const track of tracks) {
      try {
        track.stop();
      } catch {
        // Ignore errors during track stop
      }
    }
  } catch {
    // Ignore errors during stream cleanup
  }
}

/**
 * Attaches a MediaStream to an HTMLVideoElement and awaits frame readiness.
 * Sets required attributes (autoplay, playsInline, muted) for cross-platform compatibility.
 */
export async function attachAndPlayVideo(
  videoElement: HTMLVideoElement,
  stream: MediaStream
): Promise<void> {
  videoElement.srcObject = stream;
  videoElement.setAttribute('playsinline', 'true');
  videoElement.setAttribute('muted', 'true');
  videoElement.muted = true;
  videoElement.autoplay = true;

  // Await valid dimensions and ready state
  await new Promise<void>((resolve, reject) => {
    if (
      videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      videoElement.videoWidth > 0 &&
      videoElement.videoHeight > 0
    ) {
      resolve();
      return;
    }

    let resolved = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      videoElement.removeEventListener('loadeddata', handleLoadedData);
      videoElement.removeEventListener('error', handleError);
    };

    const handleLoadedData = () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve();
      }
    };

    const handleError = (evt: Event) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new CameraError('UNKNOWN', 'Video stream failed to load.', evt));
      }
    };

    videoElement.addEventListener('loadeddata', handleLoadedData);
    videoElement.addEventListener('error', handleError);

    // Timeout safety fallback (5 seconds)
    timerId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
          resolve();
        } else {
          resolve(); // Resolve anyway to allow loop readiness check to handle
        }
      }
    }, 5000);
  });

  try {
    await videoElement.play();
  } catch (playErr) {
    // If play fails (e.g. autoplay restriction), classify as NOT_ALLOWED
    throw new CameraError('NOT_ALLOWED', 'Autoplay of video stream was blocked by browser.', playErr);
  }
}

/**
 * Monitors the video tracks of a stream and notifies the callback if hardware is disconnected mid-stream.
 * Returns an unbind function.
 */
export function monitorStreamTracks(
  stream: MediaStream,
  onDisconnect: (code: CameraErrorCode) => void
): () => void {
  const tracks = stream.getVideoTracks();
  const handlers: { track: MediaStreamTrack; listener: () => void }[] = [];

  for (const track of tracks) {
    const handleEnded = () => {
      onDisconnect('DISCONNECTED');
    };
    track.addEventListener('ended', handleEnded);
    handlers.push({ track, listener: handleEnded });
  }

  return () => {
    for (const { track, listener } of handlers) {
      track.removeEventListener('ended', listener);
    }
  };
}
