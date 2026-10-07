/**
 * src/modules/audioNav/collisionSynth.ts
 *
 * Wall Collision Synthesizer with Strict Cooldown, Mobile Haptic Vibration,
 * Dual-Layer Sound Synthesis (150Hz->40Hz Sub Thud + 1200Hz Transient Attack Click),
 * and Stereo Panning Positioning (Left -0.7, Right +0.7, Vertical 0.0).
 *
 * Enforces >= 280ms between collision sounds to prevent buzzing or clicking
 * artifacts when sliding along walls.
 */

import type { CollisionSide, CollisionSynthesizerController } from './types.ts';

export const COLLISION_COOLDOWN_MS = 280;

export interface CollisionSynthConfig {
  cooldownMs?: number; // Default: 280ms
  sweepStartHz?: number; // Default: 150Hz
  sweepEndHz?: number; // Default: 40Hz
  durationMs?: number; // Default: 50ms
  clickFreqHz?: number; // Default: 1200Hz
  clickDurationMs?: number; // Default: 20ms
  peakGain?: number; // Default: 0.20
  vibrateMs?: number; // Default: 40ms
  onCollision?: () => void; // Optional callback (e.g. for sidechain music ducking)
}

export const COLLISION_DEFAULTS: Required<CollisionSynthConfig> = {
  cooldownMs: COLLISION_COOLDOWN_MS,
  sweepStartHz: 150,
  sweepEndHz: 40,
  durationMs: 50,
  clickFreqHz: 1200,
  clickDurationMs: 20,
  peakGain: 0.2,
  vibrateMs: 40,
  onCollision: () => {},
};

export class CollisionSynthesizer implements CollisionSynthesizerController {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private pannerNode: StereoPannerNode | null = null;
  private lastCollisionTime = -Infinity;
  private isMuted = false;
  private volumeMultiplier = 1.0;
  private isWallPushing = false;

  private readonly config: Required<CollisionSynthConfig>;

  constructor(config?: CollisionSynthConfig) {
    this.config = {
      ...COLLISION_DEFAULTS,
      ...config,
    };
  }

  /**
   * Initializes synthesizer with AudioContext and SFX bus gain node.
   */
  public init(ctx: AudioContext, destination: GainNode, onCollision?: () => void): void {
    this.ctx = ctx;
    this.sfxBus = destination;
    if (onCollision) {
      (this.config as { onCollision: () => void }).onCollision = onCollision;
    }

    // Set up dedicated collision StereoPannerNode connected to SFX bus
    if (typeof ctx.createStereoPanner === 'function') {
      this.pannerNode = ctx.createStereoPanner();
    } else {
      this.pannerNode = ctx.createGain() as unknown as StereoPannerNode;
      (this.pannerNode as unknown as { pan: { value: number } }).pan = { value: 0 };
    }
    this.pannerNode.connect(this.sfxBus);
  }

  /**
   * Sets continuous wall pushing state.
   */
  public setWallPushing(isPushing: boolean): void {
    this.isWallPushing = isPushing;
  }

  /**
   * Triggers dual-layer wall collision synthesis, stereo positioning, and mobile vibration
   * if cooldown has elapsed.
   *
   * @param side - 'left' (-0.7 pan), 'right' (+0.7 pan), or 'vertical' (0.0 pan)
   * @param isPushingWall - whether user is currently holding movement into the wall
   * @returns true if collision effect was triggered; false if suppressed by cooldown
   */
  public trigger(side: CollisionSide = 'vertical', isPushingWall?: boolean): boolean {
    if (isPushingWall !== undefined) {
      this.isWallPushing = isPushingWall;
    }

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastCollisionTime < this.config.cooldownMs) {
      return false; // Suppressed by strict cooldown
    }
    this.lastCollisionTime = now;

    // Trigger sidechain ducking callback (dips music bus to 0.3 or 0.05 if pushing)
    try {
      this.config.onCollision?.();
    } catch {
      // Ignore callback errors
    }

    // 1. Mobile haptic vibration (Android / Mobile Chrome)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.([this.config.vibrateMs]);
      } catch {
        // Suppress permission / background tab errors
      }
    }

    // 2. Synthesize dual-layer wall impact
    if (!this.ctx || this.ctx.state !== 'running' || this.isMuted || !this.sfxBus || !this.pannerNode) {
      return true;
    }

    try {
      const ctx = this.ctx;
      const t = ctx.currentTime;

      // Stereo positioning: Left = -0.7, Right = +0.7, Vertical = 0.0
      let panValue = 0.0;
      if (side === 'left') {
        panValue = -0.7;
      } else if (side === 'right') {
        panValue = 0.7;
      }
      try {
        this.pannerNode.pan.setValueAtTime(panValue, t);
      } catch {
        // Fallback
      }

      const peak = this.config.peakGain * this.volumeMultiplier;
      const highContrast = this.isWallPushing;

      // --- LAYER 1: Sub Thud Body (50ms) ---
      // Higher start and deeper sweep when highContrast is active (180Hz -> 35Hz vs 150Hz -> 40Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();

      const sweepStart = highContrast ? 180 : this.config.sweepStartHz;
      const sweepEnd = highContrast ? 35 : this.config.sweepEndHz;

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(sweepStart, t);
      osc1.frequency.exponentialRampToValueAtTime(
        sweepEnd,
        t + this.config.durationMs / 1000
      );

      gain1.gain.setValueAtTime(peak, t);
      gain1.gain.linearRampToValueAtTime(0.0001, t + this.config.durationMs / 1000);
      gain1.gain.setValueAtTime(0, t + this.config.durationMs / 1000);

      osc1.connect(gain1);
      gain1.connect(this.pannerNode);

      osc1.start(t);
      osc1.stop(t + this.config.durationMs / 1000);

      osc1.onended = () => {
        try {
          osc1.disconnect();
          gain1.disconnect();
        } catch {
          // Cleanup
        }
      };

      // --- LAYER 2: Transient Attack Click (20ms) ---
      // Elevated to 1600Hz and boosted punch (+45%) when pressing into the wall
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();

      const clickFreq = highContrast ? 1600 : this.config.clickFreqHz;
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(clickFreq, t);

      const clickPeak = highContrast ? Math.min(0.48, peak * 2.2) : Math.min(0.35, peak * 1.5);
      gain2.gain.setValueAtTime(clickPeak, t);
      gain2.gain.exponentialRampToValueAtTime(
        0.0001,
        t + this.config.clickDurationMs / 1000
      );
      gain2.gain.setValueAtTime(0, t + this.config.clickDurationMs / 1000);

      osc2.connect(gain2);
      gain2.connect(this.pannerNode);

      osc2.start(t);
      osc2.stop(t + this.config.clickDurationMs / 1000);

      osc2.onended = () => {
        try {
          osc2.disconnect();
          gain2.disconnect();
        } catch {
          // Cleanup
        }
      };
    } catch (err) {
      console.debug('[CollisionSynthesizer] Audio playback error:', err);
    }

    return true;
  }

  public setVolume(volume: number): void {
    this.volumeMultiplier = Math.max(0, Math.min(1, volume));
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  public destroy(): void {
    if (this.pannerNode) {
      try {
        this.pannerNode.disconnect();
      } catch {
        // Ignore
      }
      this.pannerNode = null;
    }
    this.ctx = null;
    this.sfxBus = null;
  }
}
