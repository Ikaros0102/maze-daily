/**
 * src/modules/audioNav/beacon.ts
 *
 * Acoustic Pathfinding Beacon Synthesizer.
 * Precomputes or consumes the reverse BFS navigation field from the exit,
 * tracks player position, dynamically computes stereo panning (Δx) and
 * vertical pitch modulation (Δy), and plays periodic gentle acoustic pings.
 */

import { computeExitNavigationField, type NavigationField } from '../../core/pathfinder.ts';
import type { DailyEffectState, GridCoord, MazeCell, MazeData, Point } from '../../types/game';
import type { BeaconSynthesizerController, Point2D } from './types.ts';

export interface BeaconConfig {
  pulseIntervalMs?: number; // Default: 750ms (in 600-1000ms range)
  baseFrequencyHz?: number; // Default: 620Hz
  pingDurationMs?: number; // Default: 100ms
  peakGain?: number; // Default: 0.20
}

export const BEACON_DEFAULTS: Required<BeaconConfig> = {
  pulseIntervalMs: 750,
  baseFrequencyHz: 620,
  pingDurationMs: 100,
  peakGain: 0.2,
};

export class BeaconSynthesizer implements BeaconSynthesizerController {
  private ctx: AudioContext | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private pannerNode: StereoPannerNode | null = null;
  private beaconBusGain: GainNode | null = null;

  private navField: NavigationField | null = null;
  private cachedMazeData: MazeData | null = null;
  private cachedGrid: MazeCell[][] | null = null;
  private cachedExit: GridCoord | null = null;
  private cachedExitNavField: NavigationField | null = null;
  private cachedKeyPos: GridCoord | null = null;
  private cachedGatePos: GridCoord | null = null;
  private cachedKeyNavField: NavigationField | null = null;
  private currentTargetType: 'key' | 'exit' = 'exit';
  private activeTarget: GridCoord | null = null;

  private timerId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private isMuted = false;
  private isAtExit = false;

  private currentFreq = BEACON_DEFAULTS.baseFrequencyHz;
  private currentTargetPan = 0.0;
  private lastScheduledPan: number | null = null;
  private lastScheduledFilterFreq: number | null = null;
  private volumeMultiplier = 1.0;

  // Proximity Attenuation State (Hot-Cold Mechanics)
  private lastGridCol: number | null = null;
  private lastGridRow: number | null = null;
  private prevDistance: number | null = null;
  private minDistanceReached: number | null = null;
  private divergenceSteps = 0;
  private proximityAttenuation = 1.0;

  // Directional Melodic Gestures
  private verticalGesture: 'up' | 'down' | 'none' = 'none';

  private readonly config: Required<BeaconConfig>;

  constructor(config?: BeaconConfig) {
    this.config = {
      ...BEACON_DEFAULTS,
      ...config,
    };
  }

  /**
   * Initializes the synthesizer with AudioContext and attaches to target audio bus.
   * Monophonic signal routing: osc -> env -> filterNode (lowpass) -> pannerNode -> busGain -> destination.
   */
  public init(ctx: AudioContext, destination: AudioNode): void {
    this.ctx = ctx;
    this.lastScheduledPan = null;
    this.lastScheduledFilterFreq = null;

    // 1. Mono Lowpass Filter (bypassed at 20000Hz for forward/sides, active at 600Hz for backward)
    if (typeof ctx.createBiquadFilter === 'function') {
      this.filterNode = ctx.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.setValueAtTime(20000, ctx.currentTime);
      this.filterNode.Q.setValueAtTime(1.0, ctx.currentTime);
      try {
        this.filterNode.channelCount = 1;
        this.filterNode.channelCountMode = 'explicit';
      } catch {
        // Fallback for mocks
      }
    }

    // 2. Stereo Panner
    if (typeof ctx.createStereoPanner === 'function') {
      this.pannerNode = ctx.createStereoPanner();
    } else {
      // Fallback pass-through for legacy browsers
      this.pannerNode = ctx.createGain() as unknown as StereoPannerNode;
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
      (this.pannerNode as unknown as { pan: unknown }).pan = fallbackParam;
    }
    try {
      this.pannerNode.pan.setValueAtTime(0, ctx.currentTime);
    } catch {
      // Fallback
    }

    this.beaconBusGain = ctx.createGain();
    this.beaconBusGain.gain.setValueAtTime(this.proximityAttenuation, ctx.currentTime);

    // Build persistent sub-graph: filter -> panner -> busGain -> destination
    if (this.filterNode) {
      this.filterNode.connect(this.pannerNode);
    }
    this.pannerNode.connect(this.beaconBusGain);
    this.beaconBusGain.connect(destination);
  }

  /**
   * Updates or sets the current maze data, computing reverse BFS field if changed.
   */
  public setMazeData(mazeData: MazeData, effect?: DailyEffectState): void {
    this.cachedMazeData = mazeData;

    // 1. Check or recompute exit navigation field
    if (
      this.cachedGrid !== mazeData.cells ||
      this.cachedExit?.col !== mazeData.exit.col ||
      this.cachedExit?.row !== mazeData.exit.row ||
      !this.cachedExitNavField
    ) {
      this.cachedGrid = mazeData.cells;
      this.cachedExit = mazeData.exit;
      this.cachedExitNavField = computeExitNavigationField(mazeData.cells, mazeData.exit);
    }

    // 2. Check or recompute key navigation field if effect is key_and_gate
    if (effect?.type === 'key_and_gate' && effect.keyPos) {
      const gatePos = effect.gatePos ?? null;
      if (
        this.cachedKeyPos?.col !== effect.keyPos.col ||
        this.cachedKeyPos?.row !== effect.keyPos.row ||
        this.cachedGatePos?.col !== gatePos?.col ||
        this.cachedGatePos?.row !== gatePos?.row ||
        !this.cachedKeyNavField
      ) {
        this.cachedKeyPos = effect.keyPos;
        this.cachedGatePos = gatePos;
        // Block gatePos so BFS route to key never walks through locked gate
        this.cachedKeyNavField = computeExitNavigationField(
          mazeData.cells,
          effect.keyPos,
          gatePos
        );
      }
    }

    // 3. Determine active target
    const shouldTargetKey = Boolean(
      effect?.type === 'key_and_gate' && !effect.hasKey && effect.keyPos
    );
    const nextTargetType: 'key' | 'exit' = shouldTargetKey ? 'key' : 'exit';

    // Target transition (e.g. from key to exit, or new maze)
    if (nextTargetType !== this.currentTargetType || !this.navField) {
      this.currentTargetType = nextTargetType;
      // Reset proximity attenuation tracking for new target
      this.lastGridCol = null;
      this.lastGridRow = null;
      this.prevDistance = null;
      this.minDistanceReached = null;
      this.divergenceSteps = 0;
      this.setProximityAttenuation(1.0, true);
    }

    if (shouldTargetKey && this.cachedKeyNavField && effect?.keyPos) {
      this.navField = this.cachedKeyNavField;
      this.activeTarget = effect.keyPos;
    } else {
      this.navField = this.cachedExitNavField;
      this.activeTarget = mazeData.exit;
    }
  }

  /**
   * Returns the current NavigationField if computed.
   */
  public getNavigationField(): NavigationField | null {
    return this.navField;
  }

  /**
   * Returns the exit NavigationField (always targeting the maze exit) for overall progress crossfading.
   */
  public getExitNavigationField(): NavigationField | null {
    return this.cachedExitNavField;
  }

  /**
   * Updates the player position and computes dynamic pan azimuth, vertical gestures,
   * and BFS Hot-Cold proximity attenuation.
   */
  public updatePosition(
    playerPos: Point | Point2D,
    mazeData?: MazeData,
    effect?: DailyEffectState
  ): void {
    if (mazeData) {
      this.setMazeData(mazeData, effect);
    } else if (effect && this.cachedMazeData) {
      this.setMazeData(this.cachedMazeData, effect);
    }
    if (!this.navField) return;

    const col = Math.floor(playerPos.x);
    const row = Math.floor(playerPos.y);

    // 1. Proximity Attenuation («Горячо — Холодно» по BFS)
    const currentDist = this.navField.distances[row]?.[col] ?? -1;
    if (currentDist >= 0) {
      if (this.lastGridCol === null || this.lastGridRow === null || this.prevDistance === null) {
        // Initial spawn anchor
        this.lastGridCol = col;
        this.lastGridRow = row;
        this.prevDistance = currentDist;
        this.minDistanceReached = currentDist;
        this.divergenceSteps = 0;
        this.setProximityAttenuation(1.0, true);
      } else if (col !== this.lastGridCol || row !== this.lastGridRow) {
        // Stepped into a new tile
        if (currentDist < this.prevDistance) {
          // Approaching target / returning to optimal trajectory: restore volume to 100%
          this.divergenceSteps = 0;
          if (this.minDistanceReached === null || currentDist < this.minDistanceReached) {
            this.minDistanceReached = currentDist;
          }
          this.setProximityAttenuation(1.0, true);
        } else if (currentDist > this.prevDistance) {
          // Diverging away from target / moving into dead-end:
          // Attenuate by 25% per step of divergence, down to minimum 30% (0.30)
          const referenceMin = this.minDistanceReached ?? this.prevDistance;
          const stepsAway = Math.max(1, currentDist - referenceMin);
          this.divergenceSteps = stepsAway;
          const targetFactor = Math.max(0.30, 1.0 - stepsAway * 0.25);
          this.setProximityAttenuation(targetFactor, false);
        }
        this.lastGridCol = col;
        this.lastGridRow = row;
        this.prevDistance = currentDist;
      }
    }

    // 2. Categorical directional stereo positioning & melodic gestures
    let targetPan = 0.0;
    let targetFreq = this.config.baseFrequencyHz;
    let targetFilterFreq = 20000;

    // Check target arrival (key or exit)
    const currentTarget = this.activeTarget ?? this.cachedExit;
    if (currentTarget && col === currentTarget.col && row === currentTarget.row) {
      this.isAtExit = true;
      this.verticalGesture = 'none';
    } else {
      this.isAtExit = false;

      const nextTile = this.navField.nextSteps[row]?.[col];
      if (!nextTile) return;

      const dx = nextTile.col - col;
      const dy = nextTile.row - row;

      if (dx > 0) {
        // Step is strictly to the Right -> Hard Right (100% Right, 0% Left)
        targetPan = 1.0;
        targetFreq = this.config.baseFrequencyHz;
        targetFilterFreq = 20000;
        this.verticalGesture = 'none';
      } else if (dx < 0) {
        // Step is strictly to the Left -> Hard Left (100% Left, 0% Right)
        targetPan = -1.0;
        targetFreq = this.config.baseFrequencyHz;
        targetFilterFreq = 20000;
        this.verticalGesture = 'none';
      } else if (dy < 0) {
        // Step is Up / North (ahead) -> Centered, rising two-tone gesture 650Hz -> 880Hz over 80ms, bright open filter
        targetPan = 0.0;
        targetFreq = 650;
        targetFilterFreq = 20000;
        this.verticalGesture = 'up';
      } else if (dy > 0) {
        // Step is Down / South (behind / dead end) -> Centered, falling two-tone bass gesture 440Hz -> 260Hz over 80ms, muffled 600Hz lowpass filter
        targetPan = 0.0;
        targetFreq = 440;
        targetFilterFreq = 600;
        this.verticalGesture = 'down';
      }
    }

    this.currentFreq = targetFreq;
    this.currentTargetPan = targetPan;

    // Ultra-fast smooth click-free ramp over 60-80ms (0.08s)
    if (this.ctx) {
      const isRunning = this.ctx.state === 'running';
      const now = this.ctx.currentTime;
      const rampDuration = 0.08;

      if (this.lastScheduledPan !== targetPan) {
        if (this.pannerNode) {
          try {
            const p = this.pannerNode.pan;
            if (isRunning) {
              p.cancelScheduledValues(now);
              const currentVal = typeof p.value === 'number' ? p.value : targetPan;
              p.setValueAtTime(currentVal, now);
              p.linearRampToValueAtTime(targetPan, now + rampDuration);
            } else {
              p.setValueAtTime(targetPan, now);
            }
          } catch {
            // Fallback
          }
        }
        this.lastScheduledPan = targetPan;
      }

      if (this.lastScheduledFilterFreq !== targetFilterFreq) {
        if (this.filterNode) {
          try {
            const f = this.filterNode.frequency;
            if (isRunning) {
              f.cancelScheduledValues(now);
              const currentVal = typeof f.value === 'number' ? f.value : targetFilterFreq;
              f.setValueAtTime(currentVal, now);
              f.linearRampToValueAtTime(targetFilterFreq, now + rampDuration);
            } else {
              f.setValueAtTime(targetFilterFreq, now);
            }
          } catch {
            // Fallback
          }
        }
        this.lastScheduledFilterFreq = targetFilterFreq;
      }
    }
  }

  /**
   * Starts periodic acoustic beacon pings.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.clearTimer();
    this.timerId = setInterval(() => {
      this.pulseTick();
    }, this.config.pulseIntervalMs);
  }

  /**
   * Synthesizes a single gentle monophonic acoustic ping.
   */
  private pulseTick(): void {
    if (
      !this.isRunning ||
      this.isMuted ||
      this.isAtExit ||
      !this.ctx ||
      this.ctx.state !== 'running' ||
      !this.pannerNode
    ) {
      return;
    }

    try {
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();

      try {
        env.channelCount = 1;
        env.channelCountMode = 'explicit';
      } catch {
        // Fallback for environment
      }

      const isVertical = this.verticalGesture === 'up' || this.verticalGesture === 'down';
      const duration = isVertical ? 0.080 : this.config.pingDurationMs / 1000;

      osc.type = 'sine';
      if (this.verticalGesture === 'up') {
        // Ascending two-tone impulse: 650Hz -> 880Hz over 80ms (rising gesture)
        osc.frequency.setValueAtTime(650, now);
        osc.frequency.linearRampToValueAtTime(880, now + 0.080);
      } else if (this.verticalGesture === 'down') {
        // Descending two-tone bass impulse: 440Hz -> 260Hz over 80ms (falling gesture)
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.linearRampToValueAtTime(260, now + 0.080);
      } else {
        osc.frequency.setValueAtTime(this.currentFreq, now);
      }

      const peak = this.config.peakGain * this.volumeMultiplier * this.proximityAttenuation;
      env.gain.setValueAtTime(0.0001, now);
      // 5ms smooth attack
      env.gain.linearRampToValueAtTime(peak, now + 0.005);
      // Smooth exponential decay over duration
      const decayEnd = now + duration - 0.005;
      env.gain.exponentialRampToValueAtTime(0.0001, decayEnd);
      env.gain.setValueAtTime(0, now + duration);

      osc.connect(env);
      if (this.filterNode) {
        env.connect(this.filterNode);
      } else {
        env.connect(this.pannerNode);
      }

      osc.start(now);
      osc.stop(now + duration);

      osc.onended = () => {
        try {
          osc.disconnect();
          env.disconnect();
        } catch {
          // Cleanup
        }
      };
    } catch (err) {
      console.debug('[BeaconSynthesizer] Pulse tick skipped:', err);
    }
  }

  public stop(): void {
    this.isRunning = false;
    this.clearTimer();
  }

  public setVolume(volume: number): void {
    this.volumeMultiplier = Math.max(0, Math.min(1, volume));
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  public getCurrentPan(): number {
    return this.currentTargetPan;
  }

  public getCurrentFrequency(): number {
    return this.currentFreq;
  }

  public getVerticalGesture(): 'up' | 'down' | 'none' {
    return this.verticalGesture;
  }

  public getProximityAttenuation(): number {
    return this.proximityAttenuation;
  }

  public getMinDistanceReached(): number | null {
    return this.minDistanceReached;
  }

  public getPrevDistance(): number | null {
    return this.prevDistance;
  }

  public getDivergenceSteps(): number {
    return this.divergenceSteps;
  }

  /**
   * Sets proximity attenuation factor (0.30 to 1.0) and smoothly modulates beaconBusGain.
   */
  public setProximityAttenuation(factor: number, immediate = false): void {
    const clamped = Math.max(0.30, Math.min(1.0, factor));
    this.proximityAttenuation = clamped;

    if (!this.beaconBusGain || !this.ctx) return;
    const isRunning = this.ctx.state === 'running';
    const now = this.ctx.currentTime;
    const targetGain = clamped; // Base gain is 1.0

    try {
      if (isRunning) {
        this.beaconBusGain.gain.cancelScheduledValues(now);
        if (immediate) {
          this.beaconBusGain.gain.setValueAtTime(targetGain, now);
        } else {
          const currentVal =
            typeof this.beaconBusGain.gain.value === 'number'
              ? this.beaconBusGain.gain.value
              : targetGain;
          this.beaconBusGain.gain.setValueAtTime(currentVal, now);
          this.beaconBusGain.gain.linearRampToValueAtTime(targetGain, now + 0.08);
        }
      } else {
        this.beaconBusGain.gain.setValueAtTime(targetGain, now);
      }
    } catch {
      // Fallback
    }
  }

  /**
   * Direct proximity updater for standalone or test harness evaluations.
   */
  public updateProximity(currentDist: number, prevDist: number): void {
    this.prevDistance = prevDist;
    if (this.minDistanceReached === null) {
      this.minDistanceReached = Math.min(currentDist, prevDist);
    }
    if (currentDist < prevDist) {
      this.divergenceSteps = 0;
      this.minDistanceReached = Math.min(this.minDistanceReached, currentDist);
      this.setProximityAttenuation(1.0, true);
    } else if (currentDist > prevDist) {
      const referenceMin = this.minDistanceReached ?? prevDist;
      const stepsAway = Math.max(1, currentDist - referenceMin);
      this.divergenceSteps = stepsAway;
      const targetFactor = Math.max(0.30, 1.0 - stepsAway * 0.25);
      this.setProximityAttenuation(targetFactor, false);
    }
  }

  /**
   * Synthesizes a bright, uplifting 4-note ascending bell chime (C5 -> E5 -> G5 -> C6)
   * upon collecting the key in Key & Gate mode.
   */
  public playKeyPickupChime(): void {
    if (!this.ctx || this.isMuted) return;
    const ctx = this.ctx;
    if (ctx.state !== 'running') return;

    try {
      const now = ctx.currentTime;
      // C5 (523.25Hz), E5 (659.25Hz), G5 (783.99Hz), C6 (1046.50Hz)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      const noteDelay = 0.055; // 55ms arpeggio
      const noteDuration = 0.18; // 180ms per note

      notes.forEach((freq, idx) => {
        const startTime = now + idx * noteDelay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        try {
          gain.channelCount = 1;
          gain.channelCountMode = 'explicit';
        } catch {
          // Fallback for mocks
        }

        osc.type = 'triangle'; // Pleasant warm bell chime tone
        osc.frequency.setValueAtTime(freq, startTime);

        const peakGain = 0.22 * this.volumeMultiplier;
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + noteDuration);

        osc.connect(gain);
        if (this.beaconBusGain) {
          gain.connect(this.beaconBusGain);
        } else {
          gain.connect(ctx.destination);
        }

        osc.start(startTime);
        osc.stop(startTime + noteDuration + 0.01);

        osc.onended = () => {
          try {
            osc.disconnect();
            gain.disconnect();
          } catch {
            // Ignore
          }
        };
      });
    } catch (err) {
      console.debug('[BeaconSynthesizer] Key pickup chime failed:', err);
    }
  }

  /**
   * Returns current active target type ('key' or 'exit').
   */
  public getTargetType(): 'key' | 'exit' {
    return this.currentTargetType;
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  public destroy(): void {
    this.stop();
    if (this.filterNode) {
      try {
        this.filterNode.disconnect();
      } catch {
        // Ignore
      }
      this.filterNode = null;
    }
    if (this.pannerNode) {
      try {
        this.pannerNode.disconnect();
      } catch {
        // Ignore
      }
      this.pannerNode = null;
    }
    if (this.beaconBusGain) {
      try {
        this.beaconBusGain.disconnect();
      } catch {
        // Ignore
      }
      this.beaconBusGain = null;
    }
    this.ctx = null;
    this.navField = null;
    this.cachedMazeData = null;
    this.cachedGrid = null;
    this.cachedExit = null;
    this.cachedExitNavField = null;
    this.cachedKeyPos = null;
    this.cachedGatePos = null;
    this.cachedKeyNavField = null;
    this.currentTargetType = 'exit';
    this.activeTarget = null;
    this.currentTargetPan = 0.0;
    this.currentFreq = BEACON_DEFAULTS.baseFrequencyHz;
    this.lastScheduledPan = null;
    this.lastScheduledFilterFreq = null;
    this.isAtExit = false;
    this.lastGridCol = null;
    this.lastGridRow = null;
    this.prevDistance = null;
    this.minDistanceReached = null;
    this.divergenceSteps = 0;
    this.proximityAttenuation = 1.0;
    this.verticalGesture = 'none';
  }
}
