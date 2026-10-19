/**
 * Audio Pack Catalog & Manifest for Maze Daily Dynamic Sound Sets.
 * Pure TypeScript with ZERO DOM/browser dependencies.
 */

export type AudioPackId =
  | 'classic'
  | 'organic'
  | 'synth'
  | 'clockwork'
  | 'cosmic'
  | 'crystal-bell'
  | 'hey-and-ooh'
  | 'intimate-groove'
  | 'lofi'
  | 'saxophone-solo';

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
  'cosmic',
  'crystal-bell',
  'hey-and-ooh',
  'intimate-groove',
  'lofi',
  'saxophone-solo',
] as const;

export const AUDIO_PACKS: Record<AudioPackId, AudioPack> = {
  classic: {
    id: 'classic',
    nameKey: 'audioPackClassic',
    version: '1.0.0',
    folder: 'audio/stems',
    files: ['stem-1.m4a', 'stem-2.m4a', 'stem-3.m4a', 'stem-4.m4a'],
    estimatedBytes: 3893006,
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
  cosmic: {
    id: 'cosmic',
    nameKey: 'audioPackCosmic',
    version: '1.0.0',
    folder: 'audio/packs/cosmic',
    files: ['stem-1.m4a', 'stem-2.m4a', 'stem-3.m4a', 'stem-4.m4a'],
    estimatedBytes: 3893568,
  },
  'crystal-bell': {
    id: 'crystal-bell',
    nameKey: 'audioPackCrystalBell',
    version: '1.0.0',
    folder: 'audio/packs/Crystal Bell',
    files: ['stem-1.m4a', 'stem-2.m4a', 'stem-3.m4a', 'stem-4.m4a'],
    estimatedBytes: 5052922,
  },
  'hey-and-ooh': {
    id: 'hey-and-ooh',
    nameKey: 'audioPackHeyAndOoh',
    version: '1.0.0',
    folder: 'audio/packs/Hey and Ooh',
    files: ['stem-1.m4a', 'stem-2.m4a', 'stem-3.m4a', 'stem-4.m4a'],
    estimatedBytes: 5032754,
  },
  'intimate-groove': {
    id: 'intimate-groove',
    nameKey: 'audioPackIntimateGroove',
    version: '1.0.0',
    folder: 'audio/packs/Intimate Groove',
    files: ['stem-1.m4a', 'stem-2.m4a', 'stem-3.m4a', 'stem-4.m4a'],
    estimatedBytes: 4956274,
  },
  lofi: {
    id: 'lofi',
    nameKey: 'audioPackLoFi',
    version: '1.0.0',
    folder: 'audio/packs/LoFi',
    files: ['stem-1.m4a', 'stem-2.m4a', 'stem-3.m4a', 'stem-4.m4a'],
    estimatedBytes: 4971074,
  },
  'saxophone-solo': {
    id: 'saxophone-solo',
    nameKey: 'audioPackSaxophoneSolo',
    version: '1.0.0',
    folder: 'audio/packs/Saxophone Solo',
    files: ['stem-1.m4a', 'stem-2.m4a', 'stem-3.m4a', 'stem-4.m4a'],
    estimatedBytes: 5061302,
  },
};

/**
 * Exact on-disk asset sizes in bytes for streaming progress calculation.
 */
export const KNOWN_AUDIO_ASSET_SIZES: Record<string, number> = {
  // Classic Pack (audio/stems)
  'audio/stems/stem-1.m4a': 973392,
  'audio/stems/stem-2.m4a': 973392,
  'audio/stems/stem-3.m4a': 973392,
  'audio/stems/stem-4.m4a': 972830,

  // Organic Pack
  'audio/packs/organic/stem-1.m4a': 973392,
  'audio/packs/organic/stem-2.m4a': 973392,
  'audio/packs/organic/stem-3.m4a': 973392,
  'audio/packs/organic/stem-4.m4a': 969463,

  // Synth Pack
  'audio/packs/synth/stem-1.m4a': 973392,
  'audio/packs/synth/stem-2.m4a': 973392,
  'audio/packs/synth/stem-3.m4a': 973392,
  'audio/packs/synth/stem-4.m4a': 969463,

  // Clockwork Pack
  'audio/packs/clockwork/stem-1.m4a': 973392,
  'audio/packs/clockwork/stem-2.m4a': 973392,
  'audio/packs/clockwork/stem-3.m4a': 973392,
  'audio/packs/clockwork/stem-4.m4a': 973392,

  // Cosmic Pack
  'audio/packs/cosmic/stem-1.m4a': 973392,
  'audio/packs/cosmic/stem-2.m4a': 973392,
  'audio/packs/cosmic/stem-3.m4a': 973392,
  'audio/packs/cosmic/stem-4.m4a': 973392,

  // Crystal Bell Pack
  'audio/packs/Crystal Bell/stem-1.m4a': 1354209,
  'audio/packs/Crystal Bell/stem-2.m4a': 1265845,
  'audio/packs/Crystal Bell/stem-3.m4a': 1290697,
  'audio/packs/Crystal Bell/stem-4.m4a': 1142171,

  // Hey and Ooh Pack
  'audio/packs/Hey and Ooh/stem-1.m4a': 1327653,
  'audio/packs/Hey and Ooh/stem-2.m4a': 1225637,
  'audio/packs/Hey and Ooh/stem-3.m4a': 1288752,
  'audio/packs/Hey and Ooh/stem-4.m4a': 1190712,

  // Intimate Groove Pack
  'audio/packs/Intimate Groove/stem-1.m4a': 1273880,
  'audio/packs/Intimate Groove/stem-2.m4a': 1243812,
  'audio/packs/Intimate Groove/stem-3.m4a': 1273521,
  'audio/packs/Intimate Groove/stem-4.m4a': 1165061,

  // LoFi Pack
  'audio/packs/LoFi/stem-1.m4a': 1278771,
  'audio/packs/LoFi/stem-2.m4a': 1252921,
  'audio/packs/LoFi/stem-3.m4a': 1255732,
  'audio/packs/LoFi/stem-4.m4a': 1183650,

  // Saxophone Solo Pack
  'audio/packs/Saxophone Solo/stem-1.m4a': 1345681,
  'audio/packs/Saxophone Solo/stem-2.m4a': 1251377,
  'audio/packs/Saxophone Solo/stem-3.m4a': 1271608,
  'audio/packs/Saxophone Solo/stem-4.m4a': 1192636,
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
 * Returns all asset file paths required by a pack.
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
