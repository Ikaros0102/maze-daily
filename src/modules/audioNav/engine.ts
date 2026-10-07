/**
 * src/modules/audioNav/engine.ts
 *
 * Core Web Audio Graph and Engine implementation for the Audio Navigation Module.
 * Manages AudioContext lifecycle, master gain routing, sub-buses, autoplay policy
 * gesture resumption, and audible volume confirmation synthesis.
 */

import {
  AUDIO_NAV_DEFAULTS,
  AUDIO_NAV_STORAGE_KEYS,
  type AudioGraphNodes,
  type AudioNavState,
} from './types.ts';

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
    null
  );
}

export class AudioNavigationEngine {
  private ctx: AudioContext | null = null;
  private nodes: AudioGraphNodes | null = null;
  private volume: number = AUDIO_NAV_DEFAULTS.volume;
  private muted: boolean = AUDIO_NAV_DEFAULTS.muted;
  private initialized = false;
  private cleanupGestureListeners: (() => void) | null = null;

  constructor() {
    this.loadPersistedSettings();
  }

  /**
   * Loads volume and mute preferences from localStorage.
   */
  private loadPersistedSettings(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const storedVol = localStorage.getItem(AUDIO_NAV_STORAGE_KEYS.volume);
      if (storedVol !== null) {
        const parsed = parseFloat(storedVol);
        if (Number.isFinite(parsed)) {
          this.volume = Math.max(0, Math.min(1, Math.round(parsed * 100) / 100));
        }
      }
      const storedMuted = localStorage.getItem(AUDIO_NAV_STORAGE_KEYS.muted);
      if (storedMuted !== null) {
        this.muted = storedMuted === 'true';
      }
    } catch {
      // Storage access blocked or restricted
    }
  }

  /**
   * Persists volume and mute preferences to localStorage.
   */
  private persistSettings(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.setItem(AUDIO_NAV_STORAGE_KEYS.volume, this.volume.toFixed(2));
      localStorage.setItem(AUDIO_NAV_STORAGE_KEYS.muted, String(this.muted));
    } catch {
      // Ignore storage write errors
    }
  }

  /**
   * Initializes the Web Audio graph and registers autoplay gesture listeners.
   */
  public async init(): Promise<void> {
    if (this.initialized) return;

    const AudioContextClass = getAudioContextConstructor();
    if (!AudioContextClass) {
      console.warn('[AudioNav] Web Audio API is not supported in this environment.');
      return;
    }

    try {
      this.ctx = new AudioContextClass();
    } catch (err) {
      console.warn('[AudioNav] Failed to create AudioContext:', err);
      return;
    }

    // Build Audio Graph
    const ctx = this.ctx;
    const masterGain = ctx.createGain();
    const effectiveGain = this.muted ? 0.0 : this.volume;
    masterGain.gain.setValueAtTime(effectiveGain, ctx.currentTime);
    masterGain.connect(ctx.destination);

    // Sub-Buses (Music at 0.50, SFX at 0.95)
    const musicBus = ctx.createGain();
    musicBus.gain.setValueAtTime(AUDIO_NAV_DEFAULTS.musicBaseGain, ctx.currentTime);
    musicBus.connect(masterGain);

    const sfxBus = ctx.createGain();
    sfxBus.gain.setValueAtTime(AUDIO_NAV_DEFAULTS.sfxBaseGain, ctx.currentTime);
    sfxBus.connect(masterGain);

    const beaconBus = ctx.createGain();
    beaconBus.gain.setValueAtTime(0.85, ctx.currentTime);
    beaconBus.connect(masterGain);

    // Stereo Panner (with graceful fallback if unsupported)
    let beaconPanner: StereoPannerNode;
    if (typeof ctx.createStereoPanner === 'function') {
      beaconPanner = ctx.createStereoPanner();
    } else {
      // Fallback pass-through wrapper
      beaconPanner = ctx.createGain() as unknown as StereoPannerNode;
      const fallbackParam = {
        value: 0,
        defaultValue: 0,
        minValue: -1,
        maxValue: 1,
        setValueAtTime(val: number) { this.value = val; return this; },
        linearRampToValueAtTime(val: number) { this.value = val; return this; },
        exponentialRampToValueAtTime(val: number) { this.value = val; return this; },
        setTargetAtTime(val: number) { this.value = val; return this; },
        setValueCurveAtTime() { return this; },
        cancelScheduledValues() { return this; },
        cancelAndHoldAtTime() { return this; },
      };
      (beaconPanner as unknown as { pan: unknown }).pan = fallbackParam;
    }
    beaconPanner.connect(beaconBus);

    const feedbackBus = ctx.createGain();
    feedbackBus.gain.setValueAtTime(1.0, ctx.currentTime);
    feedbackBus.connect(masterGain);

    this.nodes = {
      ctx,
      masterGain,
      musicBus,
      sfxBus,
      beaconBus,
      beaconPanner,
      feedbackBus,
    };

    // Attach automatic gesture resume hooks
    this.setupGestureAutoResume();

    this.initialized = true;

    // Attempt immediate resume if user interaction already occurred
    await this.resume();
  }

  /**
   * Attaches one-time window listeners to resume AudioContext upon first user interaction.
   */
  private setupGestureAutoResume(): void {
    if (typeof window === 'undefined') return;

    const handleGesture = async () => {
      await this.resume();
      if (this.ctx && this.ctx.state === 'running') {
        cleanup();
      }
    };

    const cleanup = () => {
      window.removeEventListener('pointerdown', handleGesture);
      window.removeEventListener('keydown', handleGesture);
      window.removeEventListener('touchstart', handleGesture);
      this.cleanupGestureListeners = null;
    };

    window.addEventListener('pointerdown', handleGesture, { passive: true });
    window.addEventListener('keydown', handleGesture, { passive: true });
    window.addEventListener('touchstart', handleGesture, { passive: true });

    this.cleanupGestureListeners = cleanup;
  }

  /**
   * Resumes the AudioContext safely. Never throws uncaught errors if blocked.
   */
  public async resume(): Promise<void> {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (err) {
        console.debug('[AudioNav] AudioContext resumption waiting for user gesture:', err);
      }
    }
  }

  /**
   * Updates master gain smoothly to target volume and mute state.
   */
  private updateMasterGain(smooth = true): void {
    if (!this.nodes) return;
    const { masterGain, ctx } = this.nodes;
    const target = this.muted ? 0.0 : this.volume;
    const now = ctx.currentTime;

    if (smooth) {
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.setTargetAtTime(target, now, 0.02);
    } else {
      masterGain.gain.setValueAtTime(target, now);
    }
  }

  /**
   * Sets the master volume (0.0 to 1.0) and emits an audible confirmation tone.
   */
  public setVolume(newVolume: number, emitTone = true): void {
    const clamped = Math.max(0, Math.min(1, Math.round(newVolume * 100) / 100));
    this.volume = clamped;
    this.persistSettings();
    this.updateMasterGain(true);

    if (emitTone && !this.muted) {
      this.playFeedbackTone(this.volume);
    }
  }

  /**
   * Sets mute state. Unmuting emits an audible confirmation tone at the current volume.
   */
  public setMuted(isMuted: boolean, emitTone = true): void {
    const wasMuted = this.muted;
    this.muted = isMuted;
    this.persistSettings();
    this.updateMasterGain(true);

    if (emitTone && wasMuted && !isMuted) {
      this.playFeedbackTone(this.volume);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public getState(): AudioNavState {
    return {
      isInitialized: this.initialized,
      isRunning: this.ctx !== null && this.ctx.state === 'running',
      volume: this.volume,
      isMuted: this.muted,
    };
  }

  public getNodes(): AudioGraphNodes | null {
    return this.nodes;
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  private isWallPushing = false;
  private proximityAttenuation = 1.0;

  /**
   * Sets proximity attenuation factor (0.30 to 1.0) based on BFS distance to exit.
   * Smoothly modulates musicBus gain without interrupting or resetting active stem loops.
   */
  public setProximityAttenuation(factor: number, immediate = false): void {
    const clamped = Math.max(0.3, Math.min(1.0, factor));
    if (Math.abs(this.proximityAttenuation - clamped) < 1e-4) return;
    this.proximityAttenuation = clamped;

    if (!this.nodes || !this.ctx || this.ctx.state !== 'running' || this.muted) return;
    const { musicBus, ctx } = this.nodes;
    const now = ctx.currentTime;
    const currentBase = this.isWallPushing ? 0.05 : AUDIO_NAV_DEFAULTS.musicBaseGain;
    const targetGain = currentBase * clamped;

    try {
      musicBus.gain.cancelScheduledValues(now);
      if (immediate) {
        musicBus.gain.setValueAtTime(targetGain, now);
      } else {
        const currentVal =
          typeof musicBus.gain.value === 'number' ? musicBus.gain.value : targetGain;
        musicBus.gain.setValueAtTime(currentVal, now);
        musicBus.gain.linearRampToValueAtTime(targetGain, now + 0.08);
      }
    } catch {
      musicBus.gain.setValueAtTime(targetGain, now);
    }
  }

  public getProximityAttenuation(): number {
    return this.proximityAttenuation;
  }

  /**
   * Wall-pushing audio dynamics:
   * When player pushes continuously into a wall, exit melody gradually fades down to 5% (0.05) over 600ms.
   * When wall pushing stops, music smoothly ramps back up to base music volume (0.50) over 350ms.
   */
  public setWallPushing(isPushing: boolean): void {
    if (!this.nodes || !this.ctx || this.ctx.state !== 'running' || this.muted) return;
    if (this.isWallPushing === isPushing) return;
    this.isWallPushing = isPushing;

    const { musicBus, ctx } = this.nodes;
    const now = ctx.currentTime;
    const baseGain = (isPushing ? 0.05 : AUDIO_NAV_DEFAULTS.musicBaseGain) * this.proximityAttenuation;

    try {
      musicBus.gain.cancelScheduledValues(now);
      musicBus.gain.setValueAtTime(musicBus.gain.value, now);
      if (isPushing) {
        // Gradually drop exit melody volume down to 5% (0.05) over 600ms
        musicBus.gain.linearRampToValueAtTime(baseGain, now + 0.6);
      } else {
        // Smoothly restore music bus back to base volume (0.50) over 350ms
        musicBus.gain.linearRampToValueAtTime(baseGain, now + 0.35);
      }
    } catch {
      musicBus.gain.setValueAtTime(baseGain, now);
    }
  }

  /**
   * Sidechain Ducking: temporarily dips music bus gain upon wall collision,
   * then smoothly returns to base music volume (0.50, or 0.05 if wall pushing) over 180ms.
   */
  public duckMusic(duckGain = 0.3, attackMs = 20, recoveryMs = 180): void {
    if (!this.nodes || !this.ctx || this.ctx.state !== 'running' || this.muted) return;
    const { musicBus, ctx } = this.nodes;
    const now = ctx.currentTime;
    const targetRecovery =
      (this.isWallPushing ? 0.05 : AUDIO_NAV_DEFAULTS.musicBaseGain) * this.proximityAttenuation;

    try {
      musicBus.gain.cancelScheduledValues(now);
      musicBus.gain.setValueAtTime(musicBus.gain.value, now);
      // Quick dip over attackMs (20ms)
      const dipLevel = Math.min(Math.max(0.01, duckGain), targetRecovery);
      musicBus.gain.exponentialRampToValueAtTime(
        dipLevel,
        now + attackMs / 1000
      );
      // Smooth recovery over recoveryMs (180ms)
      musicBus.gain.exponentialRampToValueAtTime(
        Math.max(0.01, targetRecovery),
        now + (attackMs + recoveryMs) / 1000
      );
    } catch {
      musicBus.gain.setValueAtTime(targetRecovery, now);
    }
  }

  /**
   * Synthesizes a short 100ms 523.25Hz (C5) confirmation beep at the newly set volume level.
   */
  public playFeedbackTone(volumeLevel: number = this.volume): void {
    if (!this.ctx || this.ctx.state !== 'running' || !this.nodes) return;
    if (this.muted || volumeLevel <= 0.001) return;

    try {
      const { ctx, feedbackBus } = this.nodes;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(AUDIO_NAV_DEFAULTS.feedbackFreqHz, now);

      const peakLevel = Math.min(0.25, volumeLevel * 0.25);
      gain.gain.setValueAtTime(0.0001, now);
      // 10ms smooth attack
      gain.gain.exponentialRampToValueAtTime(peakLevel, now + 0.01);
      // 90ms smooth decay
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + AUDIO_NAV_DEFAULTS.feedbackDurationMs / 1000
      );

      osc.connect(gain);
      gain.connect(feedbackBus);

      osc.start(now);
      osc.stop(now + AUDIO_NAV_DEFAULTS.feedbackDurationMs / 1000);

      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          // Ignore disconnection cleanup error
        }
      };
    } catch (err) {
      console.debug('[AudioNav] Feedback tone synthesis skipped:', err);
    }
  }

  /**
   * Disposes the Web Audio graph and cleans up listeners.
   */
  public destroy(): void {
    if (this.cleanupGestureListeners) {
      this.cleanupGestureListeners();
      this.cleanupGestureListeners = null;
    }

    if (this.nodes) {
      try {
        this.nodes.masterGain.disconnect();
        this.nodes.musicBus.disconnect();
        this.nodes.musicFilter?.disconnect();
        this.nodes.musicPanner?.disconnect();
        this.nodes.sfxBus.disconnect();
        this.nodes.beaconBus.disconnect();
        this.nodes.beaconPanner.disconnect();
        this.nodes.feedbackBus.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      this.nodes = null;
    }

    if (this.ctx && this.ctx.state !== 'closed') {
      try {
        void this.ctx.close();
      } catch {
        // Ignore close error
      }
      this.ctx = null;
    }

    this.initialized = false;
  }
}
