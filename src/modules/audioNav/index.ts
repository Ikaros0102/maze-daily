/**
 * src/modules/audioNav/index.ts
 *
 * Master controller and public facade for the Audio Navigation Module.
 * Integrates Web Audio graph engine, volume hotkeys, stem music player,
 * acoustic exit beacon, and wall collision feedback.
 */

import type { DailyEffectState, MazeData, SplitCheckpoint } from '../../types/game';
import type { AudioNavController, AudioNavState, Point2D } from './types.ts';
import { AudioNavigationEngine } from './engine.ts';
import { VolumeController } from './volumeController.ts';
import { StemPlayer } from './stems.ts';
import { BeaconSynthesizer } from './beacon.ts';
import { CollisionSynthesizer } from './collisionSynth.ts';

export * from './types.ts';
export * from './engine.ts';
export * from './volumeController.ts';
export * from './stems.ts';
export * from './beacon.ts';
export * from './collisionSynth.ts';

export class AudioNavManager implements AudioNavController {
  private engine: AudioNavigationEngine;
  private volumeController: VolumeController;
  private stemPlayer: StemPlayer;
  private beaconSynthesizer: BeaconSynthesizer;
  private collisionSynthesizer: CollisionSynthesizer;
  private active = false;
  private lastHasKey: boolean | null = null;

  constructor() {
    this.engine = new AudioNavigationEngine();
    this.stemPlayer = new StemPlayer();
    this.beaconSynthesizer = new BeaconSynthesizer();
    this.collisionSynthesizer = new CollisionSynthesizer();

    this.volumeController = new VolumeController(this.engine, {
      onVolumeChange: (newVol) => {
        this.beaconSynthesizer.setVolume(newVol);
        this.collisionSynthesizer.setVolume(newVol);
      },
      onMuteChange: (isMuted) => {
        this.beaconSynthesizer.setMuted(isMuted);
        this.collisionSynthesizer.setMuted(isMuted);
      },
      onGesture: () => {
        void this.resume();
      },
    });
  }

  public async init(): Promise<void> {
    if (this.active) return;

    await this.engine.init();
    const nodes = this.engine.getNodes();

    if (nodes) {
      await this.stemPlayer.init(nodes.ctx, nodes.musicBus);
      nodes.musicFilter = this.stemPlayer.getFilterNode();
      nodes.musicPanner = this.stemPlayer.getPannerNode();
      this.beaconSynthesizer.init(nodes.ctx, nodes.beaconBus);
      this.collisionSynthesizer.init(nodes.ctx, nodes.sfxBus, () => {
        this.engine.duckMusic();
      });

      // Sync initial volume and mute state
      const currentVol = this.engine.getVolume();
      const currentMuted = this.engine.isMuted();

      this.beaconSynthesizer.setVolume(currentVol);
      this.beaconSynthesizer.setMuted(currentMuted);
      this.collisionSynthesizer.setVolume(currentVol);
      this.collisionSynthesizer.setMuted(currentMuted);

      // Start stem loader and player
      void this.stemPlayer.load().then(() => {
        if (this.active) {
          this.stemPlayer.start();
        }
      });

      this.beaconSynthesizer.start();
    }

    this.volumeController.attach();
    this.active = true;
  }

  public async resume(): Promise<void> {
    await this.engine.resume();
    if (this.active && this.engine.getState().isRunning) {
      this.stemPlayer.start();
      this.beaconSynthesizer.start();
    }
  }

  public updatePlayerPosition(
    playerPos: Point2D,
    mazeData: MazeData,
    effect?: DailyEffectState,
    checkpoints?: SplitCheckpoint[]
  ): void {
    if (!this.active) return;

    // Detect key pickup transition (hasKey false -> true)
    const currentHasKey = effect?.type === 'key_and_gate' ? Boolean(effect.hasKey) : null;
    if (this.lastHasKey === false && currentHasKey === true) {
      this.playKeyPickupChime();
    }
    this.lastHasKey = currentHasKey;

    // 1. Update acoustic pathfinding beacon (evaluates key vs exit targeting)
    this.beaconSynthesizer.updatePosition(playerPos, mazeData, effect);

    // Synchronize BFS proximity attenuation across music bus and stem player
    const proximityFactor = this.beaconSynthesizer.getProximityAttenuation();
    this.engine.setProximityAttenuation(proximityFactor);
    this.stemPlayer.setProximityAttenuation(proximityFactor);

    // 2. Compute topological progress ratio toward exit for stem crossfading.
    // Stems (1-4) ALWAYS represent overall maze progression (% towards the exit).
    const exitNavField =
      this.beaconSynthesizer.getExitNavigationField?.() ??
      this.beaconSynthesizer.getNavigationField();

    if (exitNavField && exitNavField.maxDistance > 0) {
      const col = Math.floor(playerPos.x);
      const row = Math.floor(playerPos.y);

      const dist = exitNavField.distances[row]?.[col] ?? -1;
      if (dist >= 0) {
        let progress = Math.max(0, Math.min(1, 1 - dist / exitNavField.maxDistance));

        // When checkpoints are provided, strictly clamp progress to the active milestone tier:
        // - If 25% checkpoint is NOT reached: progress is clamped to [0.0, 0.25] -> ONLY Stem 1 plays
        // - If 25% reached but 50% NOT reached: progress is clamped to [0.25, 0.50] -> Stem 1 and Stem 2 play
        // - If 50% reached but 75% NOT reached: progress is clamped to [0.50, 0.75] -> Stem 2 and Stem 3 play
        // - If 75% reached: progress is clamped to [0.75, 1.00] -> Stem 3 and Stem 4 play
        if (checkpoints && checkpoints.length > 0) {
          let highestRatio = 0;
          for (let i = 0; i < checkpoints.length; i++) {
            const cp = checkpoints[i];
            if (cp.reachedTimeMs !== null && cp.ratio < 1.0) {
              if (cp.ratio > highestRatio) {
                highestRatio = cp.ratio;
              }
            }
          }

          let nextRatio: number;
          if (highestRatio < 0.25) {
            nextRatio = 0.25;
          } else if (highestRatio < 0.50) {
            nextRatio = 0.50;
          } else if (highestRatio < 0.75) {
            nextRatio = 0.75;
          } else {
            nextRatio = 1.0;
          }

          progress = Math.max(highestRatio, Math.min(nextRatio, progress));
        }

        this.stemPlayer.updateProgress(progress);
      }
    }

    // 3. Update directional panning and lowpass filtering for target music (points to key, then exit)
    const navField = this.beaconSynthesizer.getNavigationField();
    if (navField) {
      const col = Math.floor(playerPos.x);
      const row = Math.floor(playerPos.y);
      const nextTile = navField.nextSteps[row]?.[col];
      if (nextTile) {
        const dx = nextTile.col - col;
        const dy = nextTile.row - row;
        this.stemPlayer.updateDirection(dx, dy);
      } else {
        this.stemPlayer.updateDirection(0, 0);
      }
    }
  }

  public playKeyPickupChime(): void {
    if (!this.active) return;
    this.beaconSynthesizer.playKeyPickupChime?.();
    this.duckMusic(0.25, 10, 260);
  }

  public triggerWallCollision(side?: import('./types').CollisionSide, isPushingWall?: boolean): void {
    if (!this.active || !this.engine.getState().isRunning) return;
    this.collisionSynthesizer.trigger(side, isPushingWall);
  }

  public setWallPushing(isPushing: boolean): void {
    if (!this.active) return;
    this.engine.setWallPushing(isPushing);
    this.collisionSynthesizer.setWallPushing(isPushing);
  }

  public duckMusic(duckGain = 0.3, attackMs = 20, recoveryMs = 180): void {
    this.engine.duckMusic(duckGain, attackMs, recoveryMs);
  }

  public playFinalFanfare(): void {
    if (!this.active) return;
    this.stemPlayer.playFinalFanfare();
  }

  public setVolume(volume: number): void {
    this.engine.setVolume(volume);
    this.beaconSynthesizer.setVolume(volume);
    this.collisionSynthesizer.setVolume(volume);
  }

  public setMuted(muted: boolean): void {
    this.engine.setMuted(muted);
    this.beaconSynthesizer.setMuted(muted);
    this.collisionSynthesizer.setMuted(muted);
  }

  public getVolume(): number {
    return this.engine.getVolume();
  }

  public isMuted(): boolean {
    return this.engine.isMuted();
  }

  public getState(): AudioNavState {
    const baseState = this.engine.getState();
    return {
      ...baseState,
      isFallbackActive: this.stemPlayer.isUsingFallback(),
    };
  }

  public isActive(): boolean {
    return this.active;
  }

  public getMusicPanner(): StereoPannerNode | null {
    return this.stemPlayer.getPannerNode();
  }

  public getMusicFilter(): BiquadFilterNode | null {
    return this.stemPlayer.getFilterNode();
  }

  public getStemPlayer(): StemPlayer {
    return this.stemPlayer;
  }

  public getProximityAttenuation(): number {
    return this.beaconSynthesizer.getProximityAttenuation();
  }

  public setProximityAttenuation(factor: number, immediate = false): void {
    this.beaconSynthesizer.setProximityAttenuation(factor, immediate);
    this.engine.setProximityAttenuation(factor, immediate);
    this.stemPlayer.setProximityAttenuation(factor, immediate);
  }

  public async switchPack(
    packId: string,
    onProgress?: (pct: number) => void
  ): Promise<boolean> {
    return await this.stemPlayer.switchPack(packId, onProgress);
  }

  public getCurrentPackId(): string {
    return this.stemPlayer.getCurrentPackId();
  }

  public destroy(): void {
    this.volumeController.detach();
    this.stemPlayer.destroy();
    this.beaconSynthesizer.destroy();
    this.collisionSynthesizer.destroy();
    this.engine.destroy();
    this.lastHasKey = null;
    this.active = false;
  }
}

/**
 * Factory function for creating new AudioNavController instances.
 */
export function createAudioNavController(): AudioNavController {
  return new AudioNavManager();
}

/**
 * Global default singleton instance.
 */
export const audioNavController: AudioNavController = new AudioNavManager();
