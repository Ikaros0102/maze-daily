/**
 * Audio Pack Catalog & Manifest for Maze Daily Dynamic Sound Sets.
 * Pure TypeScript with ZERO DOM/browser dependencies.
 */

export type AudioPackId = 'classic' | 'organic' | 'synth' | 'clockwork';

export interface AudioPack {
  id: AudioPackId;
  nameKey: string;
  version: string;
  folder: string;
  files: string[];
  estimatedBytes: number;
  finalTrack?: string;
}

export const DEFAULT_AUDIO_PACK_ID: AudioPackId = 'classic';

export const AUDIO_PACK_IDS: readonly AudioPackId[] = [
  'classic',
  'organic',
  'synth',
  'clockwork',
] as const;

export const AUDIO_PACKS: Record<AudioPackId, AudioPack> = {
  classic: {
    id: 'classic',
    nameKey: 'audioPackClassic',
    version: '1.0.0',
    folder: 'audio/stems',
    files: ['stem-1.m4a', 'stem-2.m4a', 'stem-3.m4a', 'stem-4.m4a'],
    finalTrack: 'audio/stems/final.mp3',
    estimatedBytes: 4070462,
  },
  organic: {
    id: 'organic',
    nameKey: 'audioPackOrganic',
    version: '1.0.0',
    folder: 'audio/packs/organic',
    files: ['stem-1.m4a', 'stem-2.m4a', 'stem-3.m4a', 'stem-4.m4a'],
    estimatedBytes: 3889639,
  },
  synth: {
    id: 'synth',
    nameKey: 'audioPackSynth',
    version: '1.0.0',
    folder: 'audio/packs/synth',
    files: ['stem-1.m4a', 'stem-2.m4a', 'stem-3.m4a', 'stem-4.m4a'],
    estimatedBytes: 3889639,
  },
  clockwork: {
    id: 'clockwork',
    nameKey: 'audioPackClockwork',
    version: '1.0.0',
    folder: 'audio/packs/clockwork',
    files: ['stem-1.m4a', 'stem-2.m4a', 'stem-3.m4a', 'stem-4.m4a'],
    estimatedBytes: 3893568,
  },
};

/**
 * Exact on-disk asset sizes in bytes for streaming progress calculation.
 */
export const KNOWN_AUDIO_ASSET_SIZES: Record<string, number> = {
  'audio/stems/stem-1.m4a': 973392,
  'audio/stems/stem-2.m4a': 973392,
  'audio/stems/stem-3.m4a': 973392,
  'audio/stems/stem-4.m4a': 972830,
  'audio/stems/final.mp3': 177456,
  'audio/packs/organic/stem-1.m4a': 973392,
  'audio/packs/organic/stem-2.m4a': 973392,
  'audio/packs/organic/stem-3.m4a': 973392,
  'audio/packs/organic/stem-4.m4a': 969463,
  'audio/packs/synth/stem-1.m4a': 973392,
  'audio/packs/synth/stem-2.m4a': 973392,
  'audio/packs/synth/stem-3.m4a': 973392,
  'audio/packs/synth/stem-4.m4a': 969463,
  'audio/packs/clockwork/stem-1.m4a': 973392,
  'audio/packs/clockwork/stem-2.m4a': 973392,
  'audio/packs/clockwork/stem-3.m4a': 973392,
  'audio/packs/clockwork/stem-4.m4a': 973392,
};

/**
 * Type guard checking if an arbitrary ID matches a known audio pack.
 */
export function isValidAudioPackId(id: string): id is AudioPackId {
  return Object.prototype.hasOwnProperty.call(AUDIO_PACKS, id);
}

/**
 * Retrieves the audio pack manifest by ID, or undefined if not found.
 */
export function getAudioPack(id: string): AudioPack | undefined {
  return isValidAudioPackId(id) ? AUDIO_PACKS[id] : undefined;
}

/**
 * Returns an array of all registered AudioPack definitions.
 */
export function getAllAudioPacks(): AudioPack[] {
  return Object.values(AUDIO_PACKS);
}

/**
 * Alias for getAllAudioPacks returning an array of all registered AudioPack definitions.
 */
export function getAudioPackList(): AudioPack[] {
  return Object.values(AUDIO_PACKS);
}

/**
 * Returns all asset file paths required by a pack (stems + finalTrack if present).
 * Returns paths relative to the application base, e.g. 'audio/packs/organic/stem-1.m4a'.
 */
export function getAudioPackAllFilePaths(packOrId: AudioPack | string): string[] {
  const pack = typeof packOrId === 'string' ? getAudioPack(packOrId) : packOrId;
  if (!pack) return [];
  const stemPaths = pack.files.map((file) => `${pack.folder}/${file}`);
  if (pack.finalTrack) {
    stemPaths.push(pack.finalTrack);
  }
  return stemPaths;
}

/**
 * Formats the Cache API bucket name for an audio pack: maze-pack-${id}-v${version}
 */
export function getAudioPackCacheName(packOrId: AudioPack | string): string {
  const pack = typeof packOrId === 'string' ? getAudioPack(packOrId) : packOrId;
  const id = pack ? pack.id : packOrId;
  const version = pack ? pack.version : '1.0.0';
  return `maze-pack-${id}-v${version}`;
}
