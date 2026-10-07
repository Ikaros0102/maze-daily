/**
 * src/services/moduleLoader.ts
 *
 * Cache API service, version manifest, dynamic streaming progress fetching,
 * 10-day retention policy in localStorage, and resilient in-memory fallback.
 */

import {
  AUDIO_PACKS,
  getAudioPack,
  getAudioPackCacheName,
  getAudioPackAllFilePaths,
  isValidAudioPackId,
  KNOWN_AUDIO_ASSET_SIZES,
} from '../config/audioPacks';
import type { AudioPack, AudioPackId } from '../config/audioPacks';

export {
  AUDIO_PACKS,
  getAudioPack,
  getAudioPackCacheName,
  getAudioPackAllFilePaths,
  isValidAudioPackId,
  KNOWN_AUDIO_ASSET_SIZES,
};
export type { AudioPack, AudioPackId };

// ============================================================================
// Types & Manifest Definitions
// ============================================================================

export type ModuleName = 'headTracking' | 'audioNav';

export interface ModuleProgressCallback {
  (progress: number, loadedBytes?: number, totalBytes?: number): void;
}

export interface ModuleManifest {
  version: string;
  files: string[];
  estimatedBytes: number;
}

export const MODULE_VERSIONS = {
  headTracking: '1.0.0',
  audioNav: '1.0.0',
} as const;

export const MODULE_MANIFESTS: Record<ModuleName, ModuleManifest> = {
  headTracking: {
    version: MODULE_VERSIONS.headTracking,
    files: ['models/face_landmarker.task'],
    estimatedBytes: 2840000,
  },
  audioNav: {
    version: MODULE_VERSIONS.audioNav,
    files: [
      'audio/stems/stem-1.m4a',
      'audio/stems/stem-2.m4a',
      'audio/stems/stem-3.m4a',
      'audio/stems/stem-4.m4a',
      'audio/stems/final.mp3',
    ],
    estimatedBytes: 2985648,
  },
};

export const CDN_FALLBACK_URLS: Partial<Record<string, string>> = {
  'models/face_landmarker.task':
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
};

export const KNOWN_ASSET_SIZES: Record<string, number> = {
  'audio/stems/stem-1.m4a': 689376,
  'audio/stems/stem-2.m4a': 702336,
  'audio/stems/stem-3.m4a': 710688,
  'audio/stems/stem-4.m4a': 705792,
  'audio/stems/final.mp3': 177456,
  'models/face_landmarker.task': 2840000,
};

export const CACHE_PREFIX = 'maze-daily-module-cache-v1';
export const MODULE_RETENTION_STORAGE_KEY = 'maze_daily_module_retention_v1';
export const RETENTION_PERIOD_MS = 10 * 24 * 60 * 60 * 1000; // 10 days = 864,000,000 ms

export interface ModuleRetentionRecord {
  version: string;
  lastUsed: number;
}

export type ModuleRetentionStore = Partial<Record<ModuleName, ModuleRetentionRecord>>;

// ============================================================================
// URL Resolution
// ============================================================================

/**
 * Resolves relative asset paths to deployment-safe URLs.
 * Properly accounts for GitHub Pages repo subdirectories and Vite base configuration.
 */
export function resolveAssetUrl(relativePath: string): string {
  if (/^(?:https?:)?\/\/|^blob:|^data:/i.test(relativePath)) {
    return relativePath;
  }

  const cleanPath = relativePath.replace(/^(?:\.\/|\/)+/, '');
  let base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || './';
  if (!base.endsWith('/')) {
    base += '/';
  }

  if (typeof document !== 'undefined' && document.baseURI) {
    try {
      return new URL(`${base}${cleanPath}`, document.baseURI).href;
    } catch {
      // Fallback if URL construction fails
    }
  }

  return `${base}${cleanPath}`;
}

export function getModuleCacheName(moduleName: ModuleName): string {
  return `${CACHE_PREFIX}-${moduleName}`;
}

// ============================================================================
// Safe In-Memory Fallback Adapter (MemoryCacheAdapter)
// ============================================================================

export interface MemoryCacheItem {
  buffer: ArrayBuffer;
  status: number;
  headers: Record<string, string>;
  timestamp: number;
}

export class MemoryCacheAdapter {
  private static store = new Map<string, Map<string, MemoryCacheItem>>();

  static has(cacheName: string): boolean {
    return this.store.has(cacheName);
  }

  private static getBucket(cacheName: string): Map<string, MemoryCacheItem> {
    let bucket = this.store.get(cacheName);
    if (!bucket) {
      bucket = new Map<string, MemoryCacheItem>();
      this.store.set(cacheName, bucket);
    }
    return bucket;
  }

  static async match(cacheName: string, requestUrl: string): Promise<Response | null> {
    const bucket = this.store.get(cacheName);
    if (!bucket) return null;
    const item = bucket.get(requestUrl);
    if (!item) return null;
    return new Response(item.buffer.slice(0), {
      status: item.status,
      headers: item.headers,
    });
  }

  static async put(
    cacheName: string,
    requestUrl: string,
    buffer: ArrayBuffer,
    contentType = 'application/octet-stream',
    status = 200
  ): Promise<void> {
    const bucket = this.getBucket(cacheName);
    bucket.set(requestUrl, {
      buffer: buffer.slice(0),
      status,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.byteLength),
      },
      timestamp: Date.now(),
    });
  }

  static async delete(cacheName: string): Promise<boolean> {
    return this.store.delete(cacheName);
  }

  static async keys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  static clear(): void {
    this.store.clear();
  }
}

// ============================================================================
// Unified Storage Abstraction Layer
// ============================================================================

export function getCachesObject(): CacheStorage | undefined {
  if (typeof window !== 'undefined' && 'caches' in window && typeof window.caches?.open === 'function') {
    return window.caches;
  }
  if (typeof globalThis !== 'undefined' && 'caches' in globalThis) {
    const candidate = (globalThis as unknown as { caches?: CacheStorage }).caches;
    if (candidate && typeof candidate.open === 'function') {
      return candidate;
    }
  }
  return undefined;
}

export function getLocalStorage(): Storage | undefined {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
    const candidate = (globalThis as unknown as { localStorage?: Storage }).localStorage;
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
}

let cacheApiSupported: boolean | null = null;

export async function isCacheApiSupported(): Promise<boolean> {
  const cachesObj = getCachesObject();
  if (!cachesObj) {
    return false;
  }

  if (cacheApiSupported === true) {
    return true;
  }

  try {
    const probeKey = '__maze_probe_v1__';
    await cachesObj.open(probeKey);
    await cachesObj.delete(probeKey);
    cacheApiSupported = true;
    return true;
  } catch (err) {
    console.warn('[ModuleLoader] Cache API unavailable or restricted; using MemoryCacheAdapter fallback.', err);
    return false;
  }
}

async function matchFromStorage(cacheName: string, url: string): Promise<Response | null> {
  if (await isCacheApiSupported()) {
    const cachesObj = getCachesObject();
    if (cachesObj) {
      try {
        const cache = await cachesObj.open(cacheName);
        const match = await cache.match(url);
        if (match) {
          return match.clone();
        }
      } catch (err) {
        console.warn(`[ModuleLoader] Cache match failed for ${url}:`, err);
      }
    }
  }
  return MemoryCacheAdapter.match(cacheName, url);
}

async function putToStorage(
  cacheName: string,
  url: string,
  buffer: ArrayBuffer,
  contentType = 'application/octet-stream'
): Promise<void> {
  if (await isCacheApiSupported()) {
    const cachesObj = getCachesObject();
    if (cachesObj) {
      try {
        const cache = await cachesObj.open(cacheName);
        const response = new Response(buffer.slice(0), {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(buffer.byteLength),
          },
        });
        await cache.put(url, response);
        return;
      } catch (err) {
        console.warn(`[ModuleLoader] Cache put failed for ${url}; storing in MemoryCacheAdapter:`, err);
      }
    }
  }
  await MemoryCacheAdapter.put(cacheName, url, buffer, contentType);
}

async function deleteFromStorage(cacheName: string): Promise<boolean> {
  let deleted = false;
  if (await isCacheApiSupported()) {
    const cachesObj = getCachesObject();
    if (cachesObj) {
      try {
        deleted = await cachesObj.delete(cacheName);
      } catch (err) {
        console.warn(`[ModuleLoader] Cache delete failed for ${cacheName}:`, err);
      }
    }
  }
  const memDeleted = await MemoryCacheAdapter.delete(cacheName);
  return deleted || memDeleted;
}

// ============================================================================
// Asset Retrieval Helpers
// ============================================================================

/**
 * Retrieves a cached asset Response for a given module and relative/absolute path.
 * Returns null if not cached.
 */
export async function getCachedAssetResponse(
  moduleName: ModuleName,
  relativePath: string
): Promise<Response | null> {
  const cacheName = getModuleCacheName(moduleName);
  const resolvedUrl = resolveAssetUrl(relativePath);

  // 1. Try resolved URL
  let match = await matchFromStorage(cacheName, resolvedUrl);
  if (match) return match;

  // 2. Try raw relative path if different
  if (relativePath !== resolvedUrl) {
    match = await matchFromStorage(cacheName, relativePath);
    if (match) return match;
  }

  // 3. Try CDN fallback URL if one is registered for this path
  const cdnFallback = CDN_FALLBACK_URLS[relativePath];
  if (cdnFallback) {
    match = await matchFromStorage(cacheName, cdnFallback);
    if (match) return match;
  }

  return null;
}

/**
 * Retrieves a cached asset ArrayBuffer for a given module and relative/absolute path.
 * Returns null if not cached.
 */
export async function getCachedAssetBuffer(
  moduleName: ModuleName,
  relativePath: string
): Promise<ArrayBuffer | null> {
  const response = await getCachedAssetResponse(moduleName, relativePath);
  if (!response) return null;
  return response.arrayBuffer();
}

// ============================================================================
// Retention Store & 10-Day Policy Mechanics
// ============================================================================

export function getRetentionStore(): ModuleRetentionStore {
  const storage = getLocalStorage();
  if (!storage) {
    return {};
  }
  try {
    const raw = storage.getItem(MODULE_RETENTION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};

    const store: ModuleRetentionStore = {};
    const modules: ModuleName[] = ['headTracking', 'audioNav'];
    for (const mod of modules) {
      const entry = parsed[mod];
      if (
        entry &&
        typeof entry.version === 'string' &&
        typeof entry.lastUsed === 'number' &&
        !Number.isNaN(entry.lastUsed)
      ) {
        store[mod] = {
          version: entry.version,
          lastUsed: entry.lastUsed,
        };
      }
    }
    return store;
  } catch {
    return {};
  }
}

export function saveRetentionStore(store: ModuleRetentionStore): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(MODULE_RETENTION_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Fail silently in private browsing or quota limits
  }
}

/**
 * Updates the lastUsed timestamp for a module to Date.now() in localStorage.
 */
export function touchModuleUsage(moduleName: ModuleName): void {
  const store = getRetentionStore();
  store[moduleName] = {
    version: MODULE_VERSIONS[moduleName],
    lastUsed: Date.now(),
  };
  saveRetentionStore(store);
}

/**
 * Purges all cached assets and retention metadata for a specific module.
 */
export async function purgeModuleCache(moduleName: ModuleName): Promise<void> {
  const cacheName = getModuleCacheName(moduleName);
  await deleteFromStorage(cacheName);

  // Also clean up any legacy versioned names if they exist in Cache API
  if (await isCacheApiSupported()) {
    const cachesObj = getCachesObject();
    if (cachesObj) {
      try {
        const keys = await cachesObj.keys();
        for (const key of keys) {
          if (
            key.startsWith(`${CACHE_PREFIX}-${moduleName}`) ||
            key.startsWith(`maze-daily-cache-${moduleName}`)
          ) {
            await cachesObj.delete(key);
          }
        }
      } catch {
        // Ignore
      }
    }
  }

  // Remove from retention store
  const store = getRetentionStore();
  if (store[moduleName]) {
    delete store[moduleName];
    saveRetentionStore(store);
  }
}

/**
 * Scans for expired modules (> 10 days) and expired audio packs (> 10 days),
 * purging them from Cache API and localStorage.
 * HARD INVARIANT: The currently selected audio pack is NEVER purged under any circumstances.
 */
export async function checkAndPurgeExpiredCaches(
  currentSelectedPackId?: string
): Promise<{ purgedModules: string[]; purgedPacks: string[] }> {
  const purgedModules: string[] = [];
  const purgedPacks: string[] = [];

  try {
    const store = getRetentionStore();
    const now = Date.now();
    let modified = false;

    // 1. Module Retention & Eviction (headTracking, audioNav)
    const modules: ModuleName[] = ['headTracking', 'audioNav'];
    for (const mod of modules) {
      const record = store[mod];
      if (record) {
        // Clock drift tolerance: if lastUsed is > 24h into the future, normalize
        if (record.lastUsed > now + 86_400_000) {
          record.lastUsed = now;
          modified = true;
          continue;
        }

        const elapsed = now - record.lastUsed;
        const isExpired = elapsed > RETENTION_PERIOD_MS || Number.isNaN(elapsed);
        const isVersionMismatch = record.version !== MODULE_VERSIONS[mod];

        if (isExpired || isVersionMismatch) {
          await purgeModuleCache(mod);
          delete store[mod];
          modified = true;
          purgedModules.push(mod);
        }
      }
    }

    if (modified) {
      saveRetentionStore(store);
    }

    // Collect all cache keys across Cache API and MemoryCacheAdapter
    const allCacheKeys = new Set<string>();
    if (await isCacheApiSupported()) {
      const cachesObj = getCachesObject();
      if (cachesObj) {
        try {
          const keys = await cachesObj.keys();
          for (const k of keys) allCacheKeys.add(k);
        } catch (err) {
          console.warn('[ModuleLoader] caches.keys() failed:', err);
        }
      }
    }
    const memKeys = await MemoryCacheAdapter.keys();
    for (const k of memKeys) allCacheKeys.add(k);

    // Scan for orphaned module caches not in retention store
    for (const key of allCacheKeys) {
      if (
        key.startsWith(CACHE_PREFIX) ||
        key.startsWith('maze-daily-cache-') ||
        key.startsWith('maze-module-')
      ) {
        const isHeadActive =
          key === getModuleCacheName('headTracking') && Boolean(store.headTracking);
        const isAudioActive =
          key === getModuleCacheName('audioNav') && Boolean(store.audioNav);

        if (!isHeadActive && !isAudioActive) {
          await deleteFromStorage(key);
          if (!purgedModules.includes(key)) {
            purgedModules.push(key);
          }
        }
      }
    }

    // 2. Audio Pack Eviction
    let activePackId = currentSelectedPackId;
    const storage = getLocalStorage();
    if (!activePackId && storage) {
      try {
        const raw = storage.getItem('maze_daily_settings_v1');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed?.selectedAudioPack === 'string') {
            activePackId = parsed.selectedAudioPack;
          }
        }
      } catch {
        // Fallback
      }
    }
    if (!activePackId) {
      activePackId = 'classic';
    }

    // Scan Cache API / MemoryCacheAdapter buckets matching maze-pack-*
    for (const key of allCacheKeys) {
      if (!key.startsWith('maze-pack-')) {
        continue;
      }

      const packId = extractPackIdFromCacheName(key);
      if (!packId) continue;

      // HARD INVARIANT: The currently selected pack MUST NEVER BE PURGED!
      if (packId === activePackId) {
        continue;
      }

      const storageKey = `audio_pack_last_used_${packId}`;
      let isExpired = false;

      if (storage) {
        const rawTs = storage.getItem(storageKey);
        if (rawTs === null) {
          // Untracked/orphaned pack cache
          isExpired = true;
        } else {
          const ts = Number(rawTs);
          if (Number.isNaN(ts)) {
            isExpired = true;
          } else if (ts > now + 86_400_000) {
            // Future clock drift: normalize to now
            try {
              storage.setItem(storageKey, now.toString());
            } catch {
              // Ignore
            }
            isExpired = false;
          } else {
            const elapsed = now - ts;
            if (elapsed > RETENTION_PERIOD_MS) {
              isExpired = true;
            }
          }
        }
      } else {
        isExpired = true;
      }

      if (isExpired) {
        await deleteFromStorage(key);
        if (storage) {
          try {
            storage.removeItem(storageKey);
          } catch {
            // Ignore
          }
        }
        if (!purgedPacks.includes(packId)) {
          purgedPacks.push(packId);
        }
      }
    }

    // Clean up any stale localStorage records for unused packs > 10 days
    if (storage) {
      try {
        for (let i = 0; i < storage.length; i++) {
          const lKey = storage.key(i);
          if (lKey && lKey.startsWith('audio_pack_last_used_')) {
            const packId = lKey.slice('audio_pack_last_used_'.length);
            if (packId === activePackId) {
              continue;
            }
            const rawTs = storage.getItem(lKey);
            const ts = Number(rawTs);
            if (Number.isNaN(ts) || (rawTs !== null && now - ts > RETENTION_PERIOD_MS)) {
              storage.removeItem(lKey);
              if (!purgedPacks.includes(packId)) {
                purgedPacks.push(packId);
              }
            }
          }
        }
      } catch {
        // Ignore
      }
    }
  } catch (err) {
    console.warn('[ModuleLoader] checkAndPurgeExpiredCaches error:', err);
  }

  return { purgedModules, purgedPacks };
}

// ============================================================================
// Audio Pack Caching, Validation & Asset Retrieval (Milestone 2)
// ============================================================================

/**
 * Extracts the pack ID from a cache bucket name formatted as maze-pack-${id}-v${version}.
 */
export function extractPackIdFromCacheName(cacheName: string): string | null {
  if (!cacheName.startsWith('maze-pack-')) return null;
  const remainder = cacheName.slice('maze-pack-'.length);
  const vIndex = remainder.lastIndexOf('-v');
  if (vIndex > 0) {
    return remainder.slice(0, vIndex);
  }
  return remainder;
}

/**
 * Records the lastUsed timestamp for an audio pack in localStorage.
 */
export function touchAudioPackUsage(packId: string): void {
  const storage = getLocalStorage();
  if (!storage) return;
  if (typeof packId !== 'string' || !isValidAudioPackId(packId)) return;
  try {
    storage.setItem(`audio_pack_last_used_${packId}`, Date.now().toString());
  } catch (err) {
    console.warn(`[ModuleLoader] touchAudioPackUsage error:`, err);
  }
}

/**
 * Retrieves the lastUsed timestamp for an audio pack from localStorage.
 */
export function getAudioPackLastUsed(packId: string): number | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(`audio_pack_last_used_${packId}`);
    if (!raw) return null;
    const ts = parseInt(raw, 10);
    return Number.isNaN(ts) ? null : ts;
  } catch {
    return null;
  }
}

/**
 * Removes the lastUsed timestamp for an audio pack from localStorage.
 */
export function removeAudioPackUsage(packId: string): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(`audio_pack_last_used_${packId}`);
  } catch {
    // Ignore
  }
}

/**
 * Purges all cached assets and localStorage usage metadata for an audio pack.
 */
export async function purgeAudioPackCache(packId: string): Promise<boolean> {
  const cacheName = getAudioPackCacheName(packId);
  const deleted = await deleteFromStorage(cacheName);
  removeAudioPackUsage(packId);

  if (await isCacheApiSupported()) {
    const cachesObj = getCachesObject();
    if (cachesObj) {
      try {
        const keys = await cachesObj.keys();
        for (const key of keys) {
          if (key.startsWith(`maze-pack-${packId}-`)) {
            await cachesObj.delete(key);
          }
        }
      } catch {
        // Ignore
      }
    }
  }

  return deleted;
}

/**
 * Retrieves a cached Response for a specific audio pack and file path.
 */
export async function getCachedAudioPackResponse(
  packId: string,
  filePath: string
): Promise<Response | null> {
  if (typeof packId !== 'string' || !isValidAudioPackId(packId)) return null;
  const pack = getAudioPack(packId);
  if (!pack) return null;

  const cacheName = getAudioPackCacheName(pack);
  const resolvedUrl = resolveAssetUrl(filePath);

  // 1. Try resolved URL
  let match = await matchFromStorage(cacheName, resolvedUrl);
  if (match) return match;

  // 2. Try raw filePath if different
  if (filePath !== resolvedUrl) {
    match = await matchFromStorage(cacheName, filePath);
    if (match) return match;
  }

  // 3. Resolve bare filenames (e.g. "stem-1.m4a" -> "audio/packs/organic/stem-1.m4a")
  if (!filePath.includes('/') && pack.files.includes(filePath)) {
    const fullRel = `${pack.folder}/${filePath}`;
    match = await matchFromStorage(cacheName, resolveAssetUrl(fullRel));
    if (match) return match;
    match = await matchFromStorage(cacheName, fullRel);
    if (match) return match;
  }

  return null;
}

/**
 * Checks if all required assets for an audio pack exist and are non-empty in its isolated cache.
 */
export async function isAudioPackCachedAndValid(packId: string): Promise<boolean> {
  if (typeof packId !== 'string' || !isValidAudioPackId(packId)) {
    return false;
  }
  const pack = getAudioPack(packId);
  if (!pack) return false;

  const cacheName = getAudioPackCacheName(pack);

  // Fast existence check when Cache API or MemoryAdapter is accessible
  const hasCacheApi = await isCacheApiSupported();
  const cachesObj = getCachesObject();
  if (hasCacheApi && cachesObj && typeof cachesObj.has === 'function') {
    try {
      const exists = await cachesObj.has(cacheName);
      if (!exists && !MemoryCacheAdapter.has(cacheName)) {
        return false;
      }
    } catch {
      // Fall through to file verification if caches.has throws in mock
    }
  } else if (!hasCacheApi) {
    if (!MemoryCacheAdapter.has(cacheName)) {
      return false;
    }
  }

  const files = getAudioPackAllFilePaths(pack);
  if (files.length === 0) return false;

  for (const file of files) {
    const resp = await getCachedAudioPackResponse(packId, file);
    if (!resp) return false;

    // Verify non-empty
    const cl = resp.headers.get('content-length');
    if (cl !== null) {
      const len = parseInt(cl, 10);
      if (Number.isNaN(len) || len <= 0) return false;
    }
    const buf = await resp.clone().arrayBuffer();
    if (!buf || buf.byteLength === 0) return false;
  }

  return true;
}

/**
 * Retrieves an ArrayBuffer for an audio pack asset.
 * Fetches directly from the pack's isolated cache bucket, falling back to network fetch on cache miss.
 */
export async function getCachedAudioPackAssetBuffer(
  packId: string,
  filePath: string
): Promise<ArrayBuffer> {
  if (typeof packId !== 'string' || !isValidAudioPackId(packId)) {
    throw new Error(`[ModuleLoader] Invalid audio pack ID: "${packId}"`);
  }
  const pack = getAudioPack(packId);
  if (!pack) {
    throw new Error(`[ModuleLoader] Unknown audio pack: "${packId}"`);
  }
  const cacheName = getAudioPackCacheName(pack);

  // 1. Try cache match
  const cachedResp = await getCachedAudioPackResponse(packId, filePath);
  if (cachedResp) {
    const buf = await cachedResp.arrayBuffer();
    if (buf && buf.byteLength > 0) {
      touchAudioPackUsage(packId);
      return buf.slice(0);
    }
  }

  // 2. Resolve relative path for fetch fallback
  let targetRel = filePath;
  if (!filePath.includes('/') && pack.files.includes(filePath)) {
    targetRel = `${pack.folder}/${filePath}`;
  }
  const fetchUrl = resolveAssetUrl(targetRel);

  const res = await fetch(fetchUrl);
  if (!res.ok) {
    throw new Error(
      `[ModuleLoader] Failed to fetch audio asset "${filePath}" (${fetchUrl}): HTTP ${res.status}`
    );
  }
  const buffer = await res.arrayBuffer();
  if (!buffer || buffer.byteLength === 0) {
    throw new Error(`[ModuleLoader] Empty audio asset returned for "${filePath}"`);
  }

  // 3. Populate cache bucket for subsequent requests
  try {
    const contentType = res.headers.get('content-type') || 'audio/mp4';
    await putToStorage(cacheName, fetchUrl, buffer, contentType);
    if (targetRel !== fetchUrl) {
      await putToStorage(cacheName, targetRel, buffer, contentType);
    }
    if (filePath !== targetRel) {
      await putToStorage(cacheName, filePath, buffer, contentType);
    }
  } catch (err) {
    console.warn(`[ModuleLoader] Failed to store fetched asset in cache "${cacheName}":`, err);
  }

  touchAudioPackUsage(packId);
  return buffer.slice(0);
}

// ============================================================================
// Audio Pack Streaming Loader & In-Flight Tracking
// ============================================================================

interface InFlightAudioPackEntry {
  promise: Promise<boolean>;
  subscribers: Set<ModuleProgressCallback>;
  lastProgress?: {
    pct: number;
    loadedBytes: number;
    totalBytes: number;
  };
}

const inFlightAudioPackLoads = new Map<string, InFlightAudioPackEntry>();

/**
 * Downloads missing audio pack assets with monotonic byte-level progress reporting.
 * Commits atomically into dedicated Cache API bucket maze-pack-${packId}-v${version}.
 * Deduplicates concurrent downloads for the same pack.
 */
export async function loadAudioPackWithProgress(
  packId: string,
  onProgress?: ModuleProgressCallback,
  signal?: AbortSignal
): Promise<boolean> {
  // 1. Input Validation
  if (typeof packId !== 'string' || !isValidAudioPackId(packId)) {
    console.warn(`[ModuleLoader] Invalid audio pack ID requested: "${packId}"`);
    return false;
  }

  const pack = getAudioPack(packId);
  if (!pack) {
    return false;
  }

  // 2. Cache Hit Short-Circuit
  const alreadyCached = await isAudioPackCachedAndValid(packId);
  if (alreadyCached) {
    touchAudioPackUsage(packId);
    if (onProgress) {
      try {
        onProgress(100, pack.estimatedBytes, pack.estimatedBytes);
      } catch (err) {
        console.warn('[ModuleLoader] onProgress error on cache hit:', err);
      }
    }
    return true;
  }

  // 3. In-Flight Deduplication Check
  const existing = inFlightAudioPackLoads.get(packId);
  if (existing) {
    if (onProgress) {
      existing.subscribers.add(onProgress);
      if (existing.lastProgress) {
        try {
          onProgress(
            existing.lastProgress.pct,
            existing.lastProgress.loadedBytes,
            existing.lastProgress.totalBytes
          );
        } catch (err) {
          console.warn('[ModuleLoader] onProgress error on subscriber catchup:', err);
        }
      }
    }
    return existing.promise;
  }

  // 4. Initialize In-Flight Tracking Entry
  const subscribers = new Set<ModuleProgressCallback>();
  if (onProgress) {
    subscribers.add(onProgress);
  }

  const inFlightEntry: InFlightAudioPackEntry = {
    promise: Promise.resolve(false),
    subscribers,
  };

  const files = getAudioPackAllFilePaths(pack);
  const totalBytesExpected = pack.estimatedBytes || 1;
  const loadedBytesMap = new Map<string, number>();
  let lastReportedPct = 0;

  const notifyProgress = (forcePct?: number) => {
    let currentLoadedTotal = 0;
    for (const f of files) {
      currentLoadedTotal += loadedBytesMap.get(f) || 0;
    }

    let pct = 0;
    if (forcePct !== undefined) {
      pct = forcePct;
    } else if (totalBytesExpected > 0) {
      pct = Math.min(99, Math.round((currentLoadedTotal / totalBytesExpected) * 100));
    }

    // Strict Monotonicity Guarantee
    pct = Math.max(lastReportedPct, pct);
    lastReportedPct = pct;

    inFlightEntry.lastProgress = {
      pct,
      loadedBytes: currentLoadedTotal,
      totalBytes: totalBytesExpected,
    };

    for (const cb of inFlightEntry.subscribers) {
      try {
        cb(pct, currentLoadedTotal, totalBytesExpected);
      } catch (err) {
        console.warn('[ModuleLoader] Subscriber onProgress callback threw:', err);
      }
    }
  };

  const downloadTask = (async (): Promise<boolean> => {
    // In-Memory Staging: Zero partial writes to Cache API
    const stagedResponses = new Map<string, FetchWithProgressResult>();

    try {
      notifyProgress(0);

      for (const file of files) {
        if (signal?.aborted) {
          throw new DOMException('Download aborted', 'AbortError');
        }

        const resolvedUrl = resolveAssetUrl(file);
        const expectedBytes = KNOWN_AUDIO_ASSET_SIZES[file];

        const res = await fetchWithProgress(
          resolvedUrl,
          (loaded) => {
            loadedBytesMap.set(file, loaded);
            notifyProgress();
          },
          expectedBytes,
          signal
        );

        if (!res.buffer || res.buffer.byteLength === 0) {
          throw new Error(`Empty audio asset received for ${file}`);
        }

        stagedResponses.set(file, res);
        loadedBytesMap.set(file, res.buffer.byteLength);
        notifyProgress();
      }

      if (stagedResponses.size !== files.length) {
        throw new Error(
          `Incomplete audio pack download: staged ${stagedResponses.size}/${files.length} files`
        );
      }

      // ATOMIC COMMIT: Commit all staged responses to dedicated Cache API bucket
      const cacheName = getAudioPackCacheName(pack);
      for (const [file, res] of stagedResponses.entries()) {
        const resolvedUrl = resolveAssetUrl(file);
        await putToStorage(cacheName, resolvedUrl, res.buffer, res.contentType);
        if (file !== resolvedUrl) {
          await putToStorage(cacheName, file, res.buffer, res.contentType);
        }
      }

      // Write Pack Metadata
      const metaUrl = resolveAssetUrl(`__metadata_pack_${packId}.json`);
      const metaPayload = JSON.stringify({
        id: packId,
        version: pack.version,
        timestamp: Date.now(),
        files,
      });
      const metaBuffer = new TextEncoder().encode(metaPayload).buffer;
      await putToStorage(cacheName, metaUrl, metaBuffer, 'application/json');

      // Update Usage Timestamp in localStorage
      touchAudioPackUsage(packId);

      // Terminal 100% Progress Notification
      notifyProgress(100);

      return true;
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        console.debug(`[ModuleLoader] Audio pack ${packId} download aborted cleanly.`);
      } else {
        console.error(`[ModuleLoader] Audio pack ${packId} download failed:`, err);
      }
      throw err;
    }
  })().finally(() => {
    inFlightAudioPackLoads.delete(packId);
  });

  inFlightEntry.promise = downloadTask;
  inFlightAudioPackLoads.set(packId, inFlightEntry);

  return downloadTask;
}

/**
 * Executes an async fetch operation with a configurable timeout.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL | ((signal: AbortSignal) => Promise<unknown>),
  timeoutMsOrInit?: number | RequestInit,
  optionalTimeoutMs = 15000
): Promise<unknown> {
  const isFunctionInput = typeof input === 'function';
  const timeoutMs = typeof timeoutMsOrInit === 'number' ? timeoutMsOrInit : optionalTimeoutMs;
  const init = typeof timeoutMsOrInit === 'object' ? timeoutMsOrInit : {};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const signal: AbortSignal = controller.signal;
  if (init.signal) {
    if (init.signal.aborted) {
      clearTimeout(timer);
      controller.abort();
    } else {
      init.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        controller.abort();
      });
    }
  }

  try {
    if (isFunctionInput) {
      return await input(signal);
    }
    return await fetch(input as RequestInfo | URL, { ...init, signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads a ReadableStreamDefaultReader to completion into an ArrayBuffer with progress.
 */
export async function streamToBuffer(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk?: (loadedBytes: number, totalBytes: number) => void,
  expectedTotal = 0,
  signal?: AbortSignal
): Promise<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Download aborted', 'AbortError');
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.byteLength;
        onChunk?.(loaded, expectedTotal);
      }
    }
  } catch (err) {
    try {
      await reader.cancel();
    } catch {
      // Ignore reader cancel errors
    }
    throw err;
  }

  const totalLength = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

// ============================================================================
// Cache Verification & Harmless Disabling Support
// ============================================================================

/**
 * Verifies whether a module is completely cached, valid, and matches current version.
 */
export async function isModuleCachedAndValid(moduleName: ModuleName): Promise<boolean> {
  // Tier 1: Check localStorage retention record
  const store = getRetentionStore();
  const record = store[moduleName];
  if (!record || record.version !== MODULE_VERSIONS[moduleName]) {
    return false;
  }

  // Tier 2: Check cache metadata
  const cacheName = getModuleCacheName(moduleName);
  const metaUrl = resolveAssetUrl(`__metadata_${moduleName}.json`);
  const metaResp = await matchFromStorage(cacheName, metaUrl);
  if (metaResp) {
    try {
      const meta = await metaResp.json();
      if (meta?.version !== MODULE_VERSIONS[moduleName]) {
        return false;
      }
    } catch {
      return false;
    }
  }

  // Tier 3: Verify all files exist in cache
  const manifest = MODULE_MANIFESTS[moduleName];
  for (const file of manifest.files) {
    const match = await getCachedAssetResponse(moduleName, file);
    if (!match) {
      return false;
    }
  }

  return true;
}

/**
 * Alias for isModuleCachedAndValid.
 */
export async function isModuleCached(moduleName: ModuleName): Promise<boolean> {
  return isModuleCachedAndValid(moduleName);
}

/**
 * Checks if cached assets exist for the module.
 * Confirms that disabling in settings has NOT destroyed cached assets.
 */
export async function hasCachedAssets(moduleName: ModuleName): Promise<boolean> {
  return isModuleCachedAndValid(moduleName);
}

// ============================================================================
// Streaming Fetch with Progress Tracking
// ============================================================================

export interface FetchProgressCallback {
  (progress: number, totalBytes?: number, loadedBytes?: number): void;
}

export interface FetchWithProgressResult {
  buffer: ArrayBuffer;
  contentType: string;
}

/**
 * Downloads a resource while streaming byte progress via ReadableStreamDefaultReader.
 * Accumulates chunks into an ArrayBuffer, allowing safe cache.put without stream exhaustion.
 */
export async function fetchWithProgress(
  url: string,
  onChunk?: (loadedBytes: number, totalBytes: number) => void,
  expectedBytes?: number,
  signal?: AbortSignal
): Promise<FetchWithProgressResult> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status} ${response.statusText}`);
  }

  const cl = response.headers.get('content-length');
  const parsedLength = cl ? parseInt(cl, 10) : 0;
  const totalBytes = parsedLength > 0 ? parsedLength : (expectedBytes || 0);

  if (!response.body) {
    const buf = await response.arrayBuffer();
    onChunk?.(buf.byteLength, totalBytes > 0 ? totalBytes : buf.byteLength);
    return {
      buffer: buf,
      contentType: response.headers.get('content-type') || 'application/octet-stream',
    };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Download aborted', 'AbortError');
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loadedBytes += value.byteLength;
        onChunk?.(loadedBytes, totalBytes);
      }
    }
  } catch (err) {
    try {
      await reader.cancel();
    } catch {
      // Ignore reader cancellation error
    }
    throw err;
  }

  // Combine chunks into a single ArrayBuffer
  const totalLength = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  return {
    buffer: merged.buffer,
    contentType,
  };
}

// ============================================================================
// Multi-Asset Module Downloader with Progress Reporting
// ============================================================================

const inFlightLoads = new Map<ModuleName, Promise<void>>();

/**
 * Downloads missing/outdated assets for a module with monotonic progress tracking (0% -> 100%).
 * Deduplicates concurrent requests and stores assets safely into Cache API.
 */
export async function loadModuleWithCache(
  moduleName: ModuleName,
  onProgress?: ModuleProgressCallback
): Promise<void> {
  const existing = inFlightLoads.get(moduleName);
  if (existing) {
    return existing;
  }

  const task = (async () => {
    // Check if already fully cached and valid
    const alreadyCached = await isModuleCachedAndValid(moduleName);
    const manifest = MODULE_MANIFESTS[moduleName];
    const totalBytesExpected = manifest.estimatedBytes || 1;

    if (alreadyCached) {
      touchModuleUsage(moduleName);
      onProgress?.(100, totalBytesExpected, totalBytesExpected);
      return;
    }

    const cacheName = getModuleCacheName(moduleName);
    const files = manifest.files;
    const loadedBytesMap = new Map<string, number>();
    let lastReportedPercent = 0;

    const reportProgress = (forcePercent?: number) => {
      let currentLoadedTotal = 0;
      for (const f of files) {
        currentLoadedTotal += loadedBytesMap.get(f) || 0;
      }

      let pct = 0;
      if (forcePercent !== undefined) {
        pct = forcePercent;
      } else if (totalBytesExpected > 0) {
        pct = Math.min(99, Math.round((currentLoadedTotal / totalBytesExpected) * 100));
      }

      // Monotonicity guarantee
      pct = Math.max(lastReportedPercent, pct);
      lastReportedPercent = pct;
      onProgress?.(pct, totalBytesExpected, currentLoadedTotal);
    };

    // Initial progress notification
    reportProgress(0);

    for (const file of files) {
      const resolvedUrl = resolveAssetUrl(file);
      const cached = await getCachedAssetResponse(moduleName, file);

      if (cached) {
        loadedBytesMap.set(file, KNOWN_ASSET_SIZES[file] || 500000);
        reportProgress();
        continue;
      }

      // Attempt download: first primary URL, then CDN fallback if primary fails
      let downloadResult: FetchWithProgressResult;
      let usedFallbackUrl: string | null = null;

      const fallbackCdnUrl = CDN_FALLBACK_URLS[file];

      try {
        downloadResult = await fetchWithProgress(
          resolvedUrl,
          (loaded) => {
            loadedBytesMap.set(file, loaded);
            reportProgress();
          },
          KNOWN_ASSET_SIZES[file]
        );
      } catch (primaryErr) {
        if (fallbackCdnUrl) {
          console.warn(
            `[ModuleLoader] Primary asset URL failed for ${file} (${resolvedUrl}). Falling back to CDN: ${fallbackCdnUrl}`,
            primaryErr
          );
          usedFallbackUrl = fallbackCdnUrl;
          downloadResult = await fetchWithProgress(
            fallbackCdnUrl,
            (loaded) => {
              loadedBytesMap.set(file, loaded);
              reportProgress();
            },
            KNOWN_ASSET_SIZES[file]
          );
        } else {
          throw primaryErr;
        }
      }

      // Safe cache storage with reconstructed Response
      await putToStorage(cacheName, resolvedUrl, downloadResult.buffer, downloadResult.contentType);
      if (file !== resolvedUrl) {
        await putToStorage(cacheName, file, downloadResult.buffer, downloadResult.contentType);
      }
      if (usedFallbackUrl) {
        await putToStorage(cacheName, usedFallbackUrl, downloadResult.buffer, downloadResult.contentType);
      }

      loadedBytesMap.set(file, downloadResult.buffer.byteLength);
      reportProgress();
    }

    // Save module metadata in cache
    const metaUrl = resolveAssetUrl(`__metadata_${moduleName}.json`);
    const metaPayload = JSON.stringify({
      version: MODULE_VERSIONS[moduleName],
      timestamp: Date.now(),
    });
    const metaBuffer = new TextEncoder().encode(metaPayload).buffer;
    await putToStorage(cacheName, metaUrl, metaBuffer, 'application/json');

    // Update retention in localStorage
    touchModuleUsage(moduleName);

    // Guaranteed 100% completion
    reportProgress(100);
  })().finally(() => {
    inFlightLoads.delete(moduleName);
  });

  inFlightLoads.set(moduleName, task);
  return task;
}

/**
 * Alias for loadModuleWithCache to fulfill on-demand loading contract.
 */
export const loadModuleWithProgress = loadModuleWithCache;

// ============================================================================
// Progress Throttler & Screen Reader Announcer Utilities
// ============================================================================

export interface ThrottlerOptions {
  throttleMs?: number;
  minDelta?: number;
}

export function createProgressThrottler(
  onProgress: (progress: number, totalBytes?: number, loadedBytes?: number) => void,
  options: ThrottlerOptions = {}
) {
  const throttleMs = options.throttleMs ?? 50;
  const minDelta = options.minDelta ?? 0.5;

  let lastEmittedPercent = -1;
  let lastEmittedTime = 0;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let pendingData: [number, number | undefined, number | undefined] | null = null;

  const flush = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (pendingData) {
      const [p, total, loaded] = pendingData;
      lastEmittedPercent = p;
      lastEmittedTime = Date.now();
      pendingData = null;
      onProgress(p, total, loaded);
    }
  };

  return {
    update(progress: number, totalBytes?: number, loadedBytes?: number) {
      const monotonic = Math.max(lastEmittedPercent, progress);
      pendingData = [monotonic, totalBytes, loadedBytes];

      const now = Date.now();
      const elapsed = now - lastEmittedTime;
      const delta = Math.abs(monotonic - lastEmittedPercent);

      if (elapsed >= throttleMs && delta >= minDelta) {
        flush();
      } else if (timerId === null) {
        timerId = setTimeout(flush, Math.max(0, throttleMs - elapsed));
      }
    },
    complete(totalBytes?: number) {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      pendingData = null;
      lastEmittedPercent = 100;
      lastEmittedTime = Date.now();
      onProgress(100, totalBytes, totalBytes);
    },
    reset() {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      pendingData = null;
      lastEmittedPercent = -1;
      lastEmittedTime = 0;
    },
  };
}

export function createScreenReaderAnnouncer(
  announce: (message: string) => void,
  getMilestoneMessage: (milestone: number) => string
) {
  const milestones = [0, 25, 50, 75, 100];
  let lastMilestone = -1;
  let lastAnnounceTime = 0;
  const MIN_ANNOUNCE_INTERVAL_MS = 800;

  return (progress: number) => {
    const rounded = Math.floor(progress);
    const currentMilestone = milestones.reduce((prev, curr) => (rounded >= curr ? curr : prev), 0);

    const now = Date.now();
    if (
      currentMilestone > lastMilestone &&
      (now - lastAnnounceTime >= MIN_ANNOUNCE_INTERVAL_MS || currentMilestone === 100)
    ) {
      lastMilestone = currentMilestone;
      lastAnnounceTime = now;
      announce(getMilestoneMessage(currentMilestone));
    }
  };
}
