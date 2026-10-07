/**
 * src/modules/audioNav/types.ts
 *
 * TypeScript definitions and contracts for the Audio Navigation Module.
 */

import type { DailyEffectState, MazeData, SplitCheckpoint } from '../../types/game';
import type { NavigationField } from '../../core/pathfinder';

export interface Point2D {
  x: number;
  y: number;
}

export interface AudioNavStorageKeys {
  volume: string;
  muted: string;
}

export const AUDIO_NAV_STORAGE_KEYS: AudioNavStorageKeys = {
  volume: 'maze_daily_audio_nav_volume',
  muted: 'maze_daily_audio_nav_muted',
};

export type CollisionSide = 'left' | 'right' | 'vertical';

export const AUDIO_NAV_DEFAULTS = {
  volume: 0.8,
  muted: false,
  volumeStep: 0.05,
  feedbackFreqHz: 523.25, // Note C5
  feedbackDurationMs: 100,
  musicBaseGain: 0.5,
  sfxBaseGain: 0.95,
} as const;

export interface AudioGraphNodes {
  ctx: AudioContext;
  masterGain: GainNode;
  musicBus: GainNode;
  musicFilter?: BiquadFilterNode | null;
  musicPanner?: StereoPannerNode | null;
  sfxBus: GainNode;
  beaconBus: GainNode;
  beaconPanner: StereoPannerNode;
  feedbackBus: GainNode;
}

export interface AudioNavState {
  isInitialized: boolean;
  isRunning: boolean;
  volume: number;
  isMuted: boolean;
  isFallbackActive?: boolean;
}

export interface AudioNavController {
  init: () => Promise<void>;
  resume: () => Promise<void>;
  updatePlayerPosition: (
    playerPos: Point2D,
    mazeData: MazeData,
    effect?: DailyEffectState,
    checkpoints?: SplitCheckpoint[]
  ) => void;
  triggerWallCollision: (side?: CollisionSide, isPushingWall?: boolean) => void;
  setWallPushing?: (isPushing: boolean) => void;
  duckMusic?: (duckGain?: number, attackMs?: number, recoveryMs?: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  getVolume: () => number;
  isMuted: () => boolean;
  getState: () => AudioNavState;
  isActive: () => boolean;
  playFinalFanfare?: () => void;
  playKeyPickupChime?: () => void;
  destroy: () => void;
  getMusicPanner?: () => StereoPannerNode | null;
  getMusicFilter?: () => BiquadFilterNode | null;
  getStemPlayer?: () => StemPlayerController;
  getProximityAttenuation?: () => number;
  setProximityAttenuation?: (factor: number, immediate?: boolean) => void;
  switchPack: (packId: string, onProgress?: (pct: number) => void) => Promise<boolean>;
  getCurrentPackId: () => string;
}

export interface StemPlayerController {
  init: (ctx: AudioContext, destination: GainNode) => Promise<void>;
  start: () => void;
  updateProgress: (ratio: number) => void;
  updateDirection?: (dx: number, dy: number) => void;
  getCurrentPan?: () => number;
  getCurrentFilterFreq?: () => number;
  getCurrentProgress?: () => number;
  getPannerNode?: () => StereoPannerNode | null;
  getFilterNode?: () => BiquadFilterNode | null;
  getStemsBus?: () => GainNode | null;
  playFinalFanfare: () => void;
  stop: () => void;
  destroy: () => void;
  isUsingFallback: () => boolean;
  getProximityAttenuation?: () => number;
  setProximityAttenuation?: (factor: number, immediate?: boolean) => void;
  switchPack: (packId: string, onProgress?: (pct: number) => void) => Promise<boolean>;
  getCurrentPackId: () => string;
}

export interface BeaconSynthesizerController {
  init: (ctx: AudioContext, destination: AudioNode) => void;
  setMazeData: (mazeData: MazeData, effect?: DailyEffectState) => void;
  updatePosition: (
    playerPos: Point2D,
    mazeData?: MazeData,
    effect?: DailyEffectState
  ) => void;
  start: () => void;
  stop: () => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  destroy: () => void;
  getProximityAttenuation?: () => number;
  getCurrentFrequency?: () => number;
  getCurrentPan?: () => number;
  getVerticalGesture?: () => 'up' | 'down' | 'none';
  playKeyPickupChime?: () => void;
  getTargetType?: () => 'key' | 'exit';
  getExitNavigationField?: () => NavigationField | null;
}

export interface CollisionSynthesizerController {
  init: (ctx: AudioContext, destination: GainNode) => void;
  trigger: (side?: CollisionSide, isPushingWall?: boolean) => boolean;
  setWallPushing?: (isPushing: boolean) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  destroy: () => void;
}

export interface VolumeControllerOptions {
  onVolumeChange?: (newVolume: number) => void;
  onMuteChange?: (isMuted: boolean) => void;
  onGesture?: () => void;
}
