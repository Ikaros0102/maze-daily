/**
 * src/modules/headTracking/faceLandmarker.ts
 *
 * Dynamic lazy import and initialization of @mediapipe/tasks-vision FaceLandmarker.
 * Consumes cached model ArrayBuffer from moduleLoader, resolves Wasm fileset with
 * CDN fallback, and configures VIDEO running mode with GPU/CPU delegate resilience.
 */

import type {
  FaceLandmarker as FaceLandmarkerType,
  FaceLandmarkerOptions,
  FaceLandmarkerResult,
  FilesetResolver as FilesetResolverType,
} from '@mediapipe/tasks-vision';

import {
  getCachedAssetBuffer,
  resolveAssetUrl,
} from '../../services/moduleLoader.ts';

export const MEDIAPIPE_WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';

export const MEDIAPIPE_MODEL_CDN =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export const MODEL_RELATIVE_PATH = 'models/face_landmarker.task';

export type { FaceLandmarkerType, FaceLandmarkerResult };

/**
 * Resolves the Wasm fileset for MediaPipe vision tasks.
 * Performs a lightweight HEAD probe on the local deployment path;
 * if unavailable, immediately falls back to the jsDelivr CDN.
 */
export async function resolveVisionFileset(
  FilesetResolver: typeof FilesetResolverType
) {
  const localWasmPath = resolveAssetUrl('wasm');

  try {
    const probeUrl = `${localWasmPath}/vision_wasm_internal.js`;
    const probe = await fetch(probeUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(1000),
    });

    if (probe.ok && (probe.headers.get('content-type')?.includes('javascript') ?? true)) {
      return await FilesetResolver.forVisionTasks(localWasmPath);
    }
  } catch {
    // Local path probe timed out or failed; proceed to CDN fallback
  }

  return await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_CDN);
}

/**
 * Initializes and creates a FaceLandmarker instance in VIDEO mode.
 * Dynamically imports '@mediapipe/tasks-vision' to preserve ultralight bundle size.
 */
export async function createFaceLandmarker(): Promise<FaceLandmarkerType> {
  // 1. Dynamic lazy import of MediaPipe Tasks Vision
  const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');

  // 2. Resolve Wasm fileset
  const fileset = await resolveVisionFileset(FilesetResolver);

  // 3. Obtain cached model buffer from moduleLoader (Cache API / MemoryAdapter)
  let modelBuffer: ArrayBuffer | null = null;
  try {
    modelBuffer = await getCachedAssetBuffer('headTracking', MODEL_RELATIVE_PATH);
  } catch (err) {
    console.warn('[HeadTracking] Could not read cached model buffer:', err);
  }

  // 4. Build base options with buffer or CDN fallback
  const baseOptions: FaceLandmarkerOptions['baseOptions'] = {
    delegate: 'GPU',
  };

  if (modelBuffer && modelBuffer.byteLength > 0) {
    baseOptions.modelAssetBuffer = new Uint8Array(modelBuffer);
  } else {
    baseOptions.modelAssetPath = MEDIAPIPE_MODEL_CDN;
  }

  const commonOptions: FaceLandmarkerOptions = {
    baseOptions,
    runningMode: 'VIDEO',
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  };

  // 5. Instantiate with GPU delegate, fallback to CPU on WebGL context failure
  try {
    return await FaceLandmarker.createFromOptions(fileset, commonOptions);
  } catch (gpuError) {
    console.warn('[HeadTracking] GPU delegate creation failed; falling back to CPU:', gpuError);
    return await FaceLandmarker.createFromOptions(fileset, {
      ...commonOptions,
      baseOptions: {
        ...baseOptions,
        delegate: 'CPU',
      },
    });
  }
}

/**
 * Safely releases FaceLandmarker WebAssembly and WebGL resources.
 */
export function closeFaceLandmarker(landmarker: FaceLandmarkerType | null): void {
  if (!landmarker) return;
  try {
    landmarker.close();
  } catch (err) {
    console.warn('[HeadTracking] Error releasing FaceLandmarker resources:', err);
  }
}
