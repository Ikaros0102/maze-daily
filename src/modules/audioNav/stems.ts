/**
 * src/modules/audioNav/stems.ts
 *
 * 4-Section Stem Synchronization, Cache API Loading with Fetch Fallback,
 * Split Quartile Crossfading, and Graceful Harmonic Sine Fallback Synthesizer.
 */

import {
  getCachedAssetBuffer,
  resolveAssetUrl,
  isAudioPackCachedAndValid,
  loadAudioPackWithProgress,
  getCachedAudioPackAssetBuffer,
  touchAudioPackUsage,
} from '../../services/moduleLoader.ts';
import {
  DEFAULT_AUDIO_PACK_ID,
  getAudioPack,
  isValidAudioPackId,
} from '../../config/audioPacks.ts';
import type { StemPlayerController } from './types.ts';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface StemGains {
  stem1: number;
  stem2: number;
  stem3: number;
  stem4: number;
}

export type CrossfadeCurve = 'equal-power' | 'linear';

export interface StemPlayerConfig {
  audioCtx?: AudioContext;
  destination?: GainNode;
  crossfadeCurve?: CrossfadeCurve;
  smoothingTimeConstant?: number;
  forceFallback?: boolean;
}

export type StemLoadingState = 'unloaded' | 'loading' | 'ready' | 'playing' | 'paused' | 'stopped';

export const STEM_FILE_PATHS = [
  'audio/stems/stem-1.m4a',
  'audio/stems/stem-2.m4a',
  'audio/stems/stem-3.m4a',
  'audio/stems/stem-4.m4a',
] as const;

export const FINAL_FANFARE_PATH = 'audio/stems/final.mp3';

// ============================================================================
// Mathematical Crossfade Calculation
// ============================================================================

/**
 * Calculates gain levels for all 4 stems across split quartiles.
 *
 * Quartiles:
 * - 0% - 25%: Stem 1 audible (gain 1.0), Stems 2, 3, 4 gain 0.0
 * - 25% - 50%: Stem 1 fades down, Stem 2 fades in
 * - 50% - 75%: Stem 2 fades down, Stem 3 fades in
 * - 75% - 100%: Stem 3 fades down, Stem 4 fades in
 */
export function calculateQuartileGains(
  progress: number,
  mode: CrossfadeCurve = 'equal-power'
): StemGains {
  const p = Math.max(0, Math.min(1, progress));
  let stem1 = 0;
  let stem2 = 0;
  let stem3 = 0;
  let stem4 = 0;

  if (p <= 0.25) {
    stem1 = 1.0;
  } else if (p <= 0.5) {
    const t = (p - 0.25) / 0.25;
    if (t >= 1) {
      stem1 = 0.0;
      stem2 = 1.0;
    } else if (mode === 'equal-power') {
      stem1 = Math.cos((t * Math.PI) / 2);
      stem2 = Math.sin((t * Math.PI) / 2);
    } else {
      stem1 = 1.0 - t;
      stem2 = t;
    }
  } else if (p <= 0.75) {
    const t = (p - 0.5) / 0.25;
    if (t >= 1) {
      stem2 = 0.0;
      stem3 = 1.0;
    } else if (mode === 'equal-power') {
      stem2 = Math.cos((t * Math.PI) / 2);
      stem3 = Math.sin((t * Math.PI) / 2);
    } else {
      stem2 = 1.0 - t;
      stem3 = t;
    }
  } else {
    const t = (p - 0.75) / 0.25;
    if (t >= 1) {
      stem3 = 0.0;
      stem4 = 1.0;
    } else if (mode === 'equal-power') {
      stem3 = Math.cos((t * Math.PI) / 2);
      stem4 = Math.sin((t * Math.PI) / 2);
    } else {
      stem3 = 1.0 - t;
      stem4 = t;
    }
  }

  return { stem1, stem2, stem3, stem4 };
}

// ============================================================================
// Graceful Harmonic Sine Fallback Synthesizer
// ============================================================================

export class SineFallbackSynthesizer {
  private ctx: AudioContext;
  private destination: GainNode;
  private masterGain: GainNode;
  private layerGains: [GainNode, GainNode, GainNode, GainNode] | null = null;
  private oscillators: OscillatorNode[] = [];
  private fanfareOscillators: OscillatorNode[] = [];
  private fanfareGains: GainNode[] = [];
  private stopTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;

  private static readonly LAYER_FREQUENCIES: [number, number][] = [
    [130.81, 196.0], // Layer 1: C3 + G3 (Root Fifth Drone)
    [164.81, 261.63], // Layer 2: E3 + C4 (Major Triad & Octave)
    [293.66, 392.0], // Layer 3: D4 + G4 (Pentatonic Overtones)
    [329.63, 523.25], // Layer 4: E4 + C5 (Exit Sparkle)
  ];

  private static readonly LAYER_BASE_GAINS = [0.15, 0.12, 0.1, 0.08];

  constructor(ctx: AudioContext, destination: GainNode) {
    this.ctx = ctx;
    this.destination = destination;
    this.masterGain = ctx.createGain();
    try {
      this.masterGain.channelCount = 1;
      this.masterGain.channelCountMode = 'explicit';
    } catch {
      // Fallback for mock environments
    }
    this.masterGain.gain.setValueAtTime(0.25, ctx.currentTime);
    this.masterGain.connect(destination);
  }

  public start(currentGains: StemGains): void {
    if (this.isRunning) return;

    if (this.stopTimeoutId !== null) {
      clearTimeout(this.stopTimeoutId);
      this.stopTimeoutId = null;
    }
    this.cleanupOscillators();

    if (this.ctx && this.ctx.state !== 'closed') {
      try {
        this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.masterGain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      } catch {
        // Fallback for mock environments
      }
    }

    const now = this.ctx.currentTime + 0.05;

    // Build 4 Layer Gain Nodes
    const g1 = this.ctx.createGain();
    const g2 = this.ctx.createGain();
    const g3 = this.ctx.createGain();
    const g4 = this.ctx.createGain();

    [g1, g2, g3, g4].forEach((g) => {
      try {
        g.channelCount = 1;
        g.channelCountMode = 'explicit';
      } catch {
        // Fallback for mock environments
      }
    });

    g1.gain.setValueAtTime(currentGains.stem1 * SineFallbackSynthesizer.LAYER_BASE_GAINS[0], now);
    g2.gain.setValueAtTime(currentGains.stem2 * SineFallbackSynthesizer.LAYER_BASE_GAINS[1], now);
    g3.gain.setValueAtTime(currentGains.stem3 * SineFallbackSynthesizer.LAYER_BASE_GAINS[2], now);
    g4.gain.setValueAtTime(currentGains.stem4 * SineFallbackSynthesizer.LAYER_BASE_GAINS[3], now);

    g1.connect(this.masterGain);
    g2.connect(this.masterGain);
    g3.connect(this.masterGain);
    g4.connect(this.masterGain);

    this.layerGains = [g1, g2, g3, g4];

    // Build Oscillators (2 per layer = 8 oscillators)
    this.oscillators = [];
    SineFallbackSynthesizer.LAYER_FREQUENCIES.forEach(([f1, f2], idx) => {
      const layerGain = this.layerGains![idx];

      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(f1, now);
      osc1.connect(layerGain);
      osc1.start(now);

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(f2, now);
      osc2.connect(layerGain);
      osc2.start(now);

      this.oscillators.push(osc1, osc2);
    });

    this.isRunning = true;
  }

  public updateGains(gains: StemGains, tau = 0.08): void {
    if (!this.isRunning || !this.layerGains) return;
    const now = this.ctx.currentTime;

    this.layerGains[0].gain.setTargetAtTime(
      gains.stem1 * SineFallbackSynthesizer.LAYER_BASE_GAINS[0],
      now,
      tau
    );
    this.layerGains[1].gain.setTargetAtTime(
      gains.stem2 * SineFallbackSynthesizer.LAYER_BASE_GAINS[1],
      now,
      tau
    );
    this.layerGains[2].gain.setTargetAtTime(
      gains.stem3 * SineFallbackSynthesizer.LAYER_BASE_GAINS[2],
      now,
      tau
    );
    this.layerGains[3].gain.setTargetAtTime(
      gains.stem4 * SineFallbackSynthesizer.LAYER_BASE_GAINS[3],
      now,
      tau
    );
  }

  private cleanupOscillators(): void {
    this.oscillators.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // Ignore cleanup errors
      }
    });
    this.oscillators = [];

    this.layerGains?.forEach((g) => {
      try {
        g.disconnect();
      } catch {
        // Ignore cleanup errors
      }
    });
    this.layerGains = null;
  }

  public stop(): void {
    if (!this.isRunning && this.stopTimeoutId === null) return;
    const now = this.ctx.currentTime;

    if (this.stopTimeoutId !== null) {
      clearTimeout(this.stopTimeoutId);
      this.stopTimeoutId = null;
    }

    try {
      this.masterGain.gain.setTargetAtTime(0, now, 0.05);
    } catch {
      // Fallback
    }
    this.isRunning = false;

    const oscsToClean = this.oscillators;
    const layersToClean = this.layerGains;
    this.oscillators = [];
    this.layerGains = null;

    this.stopTimeoutId = setTimeout(() => {
      oscsToClean.forEach((osc) => {
        try {
          osc.stop();
          osc.disconnect();
        } catch {
          // Ignore cleanup errors
        }
      });
      layersToClean?.forEach((g) => {
        try {
          g.disconnect();
        } catch {
          // Ignore cleanup errors
        }
      });
      if (this.ctx && this.ctx.state !== 'closed') {
        try {
          this.masterGain.gain.setValueAtTime(0.25, this.ctx.currentTime);
        } catch {
          // Fallback
        }
      }
      this.stopTimeoutId = null;
    }, 100);
  }

  public playFanfare(): void {
    const now = this.ctx.currentTime;
    this.stop();
    this.stopFanfare();

    const notes = [
      { freq: 261.63, delay: 0.0 }, // C4
      { freq: 329.63, delay: 0.12 }, // E4
      { freq: 392.0, delay: 0.24 }, // G4
      { freq: 523.25, delay: 0.36 }, // C5
      { freq: 783.99, delay: 0.5 }, // G5 (final chord)
    ];

    notes.forEach(({ freq, delay }) => {
      const startTime = now + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      try {
        gain.channelCount = 1;
        gain.channelCountMode = 'explicit';
      } catch {
        // Fallback for mock environments
      }

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.2, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.8);

      osc.connect(gain);
      gain.connect(this.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.85);

      this.fanfareOscillators.push(osc);
      this.fanfareGains.push(gain);

      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          // Cleanup
        }
        const oscIdx = this.fanfareOscillators.indexOf(osc);
        if (oscIdx !== -1) this.fanfareOscillators.splice(oscIdx, 1);
        const gainIdx = this.fanfareGains.indexOf(gain);
        if (gainIdx !== -1) this.fanfareGains.splice(gainIdx, 1);
      };
    });
  }

  private stopFanfare(): void {
    this.fanfareOscillators.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // Ignore
      }
    });
    this.fanfareOscillators = [];
    this.fanfareGains.forEach((g) => {
      try {
        g.disconnect();
      } catch {
        // Ignore
      }
    });
    this.fanfareGains = [];
  }

  public destroy(): void {
    if (this.stopTimeoutId !== null) {
      clearTimeout(this.stopTimeoutId);
      this.stopTimeoutId = null;
    }
    this.stop();
    this.cleanupOscillators();
    this.stopFanfare();
    try {
      this.masterGain.disconnect();
    } catch {
      // Cleanup
    }
  }
}

// ============================================================================
// Core StemPlayer Implementation
// ============================================================================

export class StemPlayer implements StemPlayerController {
  private ctx: AudioContext | null = null;
  private destination: GainNode | null = null;
  private crossfadeCurve: CrossfadeCurve;
  private smoothingTimeConstant: number;

  private state: StemLoadingState = 'unloaded';
  private fallbackActive = false;
  private forceFallback = false;

  private stemBuffers: AudioBuffer[] = [];
  private finalBuffer: AudioBuffer | null = null;
  private commonLoopDuration = 0;

  private stemGainNodes: [GainNode, GainNode, GainNode, GainNode] | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private stemsBus: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private pannerNode: StereoPannerNode | null = null;

  private fanfareSource: AudioBufferSourceNode | null = null;
  private fanfareGain: GainNode | null = null;
  private fadeTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private currentTargetPan = 0.0;
  private currentFilterFreq = 20000;
  private lastScheduledPan: number | null = null;
  private lastScheduledFilterFreq: number | null = null;

  private sineFallback: SineFallbackSynthesizer | null = null;
  private currentProgress = 0.0;
  private proximityAttenuation = 1.0;

  private currentPackId: string = DEFAULT_AUDIO_PACK_ID;
  private switchPackToken = 0;
  private crossfadeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private crossfadeResolve: (() => void) | null = null;

  constructor(config?: StemPlayerConfig) {
    this.crossfadeCurve = config?.crossfadeCurve ?? 'equal-power';
    this.smoothingTimeConstant = config?.smoothingTimeConstant ?? 0.08;
    this.forceFallback = Boolean(config?.forceFallback);

    if (config?.audioCtx && config?.destination) {
      void this.init(config.audioCtx, config.destination);
    }
  }

  public async init(ctx: AudioContext, destination: GainNode): Promise<void> {
    this.ctx = ctx;
    this.destination = destination;

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
    if (this.stemsBus) {
      try {
        this.stemsBus.disconnect();
      } catch {
        // Ignore
      }
      this.stemsBus = null;
    }

    this.lastScheduledPan = null;
    this.lastScheduledFilterFreq = null;

    // Explicit monophonic downmixing bus to prevent stereo MP3 inter-channel crosstalk
    this.stemsBus = this.ctx.createGain();
    this.stemsBus.gain.setValueAtTime(1.0, this.ctx.currentTime);
    try {
      this.stemsBus.channelCount = 1;
      this.stemsBus.channelCountMode = 'explicit';
    } catch {
      // Fallback for mock environments
    }

    // 1. Mono Lowpass Filter (20000Hz bright/open forward, 600Hz muffled backward/dead-end)
    if (typeof ctx.createBiquadFilter === 'function') {
      this.filterNode = ctx.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.setValueAtTime(20000, ctx.currentTime);
      this.filterNode.Q.setValueAtTime(1.0, ctx.currentTime);
      try {
        this.filterNode.channelCount = 1;
        this.filterNode.channelCountMode = 'explicit';
      } catch {
        // Fallback for mock environments
      }
    }

    // 2. Stereo Panner
    if (typeof ctx.createStereoPanner === 'function') {
      this.pannerNode = ctx.createStereoPanner();
    } else {
      // Fallback pass-through wrapper for legacy environments or test mocks
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

    // Route: stemsBus (mono) -> filterNode (mono) -> pannerNode -> destination (musicBus)
    if (this.filterNode) {
      this.stemsBus.connect(this.filterNode);
      this.filterNode.connect(this.pannerNode);
    } else {
      this.stemsBus.connect(this.pannerNode);
    }
    this.pannerNode.connect(this.destination);
  }

  /**
   * Safe audio buffer fetcher utilizing Cache API with fetch fallback.
   */
  private async loadBuffer(relativePath: string): Promise<AudioBuffer> {
    if (!this.ctx) throw new Error('[StemPlayer] AudioContext not initialized');

    let arrayBuffer: ArrayBuffer | null = null;

    // 1. Try Cache API first
    try {
      arrayBuffer = await getCachedAssetBuffer('audioNav', relativePath);
    } catch (cacheErr) {
      console.debug(`[StemPlayer] Cache check for ${relativePath} skipped:`, cacheErr);
    }

    // 2. Fetch fallback
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      const url = resolveAssetUrl(relativePath);
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch ${relativePath} (${url}): HTTP ${res.status}`);
      }
      arrayBuffer = await res.arrayBuffer();
    }

    // 3. Prevent detached buffer error by cloning buffer
    const copy = arrayBuffer.slice(0);
    const audioCtx = this.ctx;
    return await new Promise<AudioBuffer>((resolve, reject) => {
      audioCtx.decodeAudioData(copy, resolve, reject);
    });
  }

  /**
   * Loads all 5 stem tracks. Gracefully falls back to sine synthesizer if any stem fails.
   */
  public async load(): Promise<void> {
    if (this.state === 'loading') return;
    this.state = 'loading';

    if (this.forceFallback) {
      this.activateFallback();
      return;
    }

    try {
      // Load all 4 stems in parallel
      const buffers = await Promise.all(
        STEM_FILE_PATHS.map((path) => this.loadBuffer(path))
      );

      this.stemBuffers = buffers;
      this.commonLoopDuration = Math.min(...buffers.map((b) => b.duration));

      // Attempt to load final fanfare (non-fatal if missing)
      try {
        this.finalBuffer = await this.loadBuffer(FINAL_FANFARE_PATH);
      } catch (finalErr) {
        console.warn('[StemPlayer] final.mp3 load failed; will use synthetic fanfare:', finalErr);
        this.finalBuffer = null;
      }

      this.initStemGainNodes();
      this.state = 'ready';
      this.fallbackActive = false;
    } catch (stemLoadErr) {
      console.warn(
        '[StemPlayer] Stem tracks unavailable or failed decoding; activating Harmonic Sine Fallback:',
        stemLoadErr
      );
      this.activateFallback();
    }
  }

  private activateFallback(): void {
    this.fallbackActive = true;
    if (this.ctx && this.stemsBus) {
      this.sineFallback = new SineFallbackSynthesizer(this.ctx, this.stemsBus);
    }
    this.state = 'ready';
  }

  private initStemGainNodes(): void {
    if (this.stemGainNodes || !this.ctx || !this.stemsBus) return;

    const g1 = this.ctx.createGain();
    const g2 = this.ctx.createGain();
    const g3 = this.ctx.createGain();
    const g4 = this.ctx.createGain();

    [g1, g2, g3, g4].forEach((g) => {
      try {
        g.channelCount = 1;
        g.channelCountMode = 'explicit';
      } catch {
        // Fallback for mock environments
      }
      g.connect(this.stemsBus!);
    });

    this.stemGainNodes = [g1, g2, g3, g4];
  }

  /**
   * Starts synchronized stem loop playback.
   */
  public start(): void {
    if (this.state === 'playing' || !this.ctx) return;

    const currentGains = calculateQuartileGains(this.currentProgress, this.crossfadeCurve);

    if (this.fallbackActive) {
      if (!this.sineFallback && this.stemsBus) {
        this.sineFallback = new SineFallbackSynthesizer(this.ctx, this.stemsBus);
      }
      this.sineFallback?.start(currentGains);
      this.state = 'playing';
      return;
    }

    if (this.stemBuffers.length < 4 || !this.stemGainNodes) {
      this.activateFallback();
      this.sineFallback?.start(currentGains);
      this.state = 'playing';
      return;
    }

    this.stopSources();

    const now = this.ctx.currentTime;
    const syncStartTime = now + 0.05; // 50ms scheduling lookahead

    // Set initial gains
    this.stemGainNodes[0].gain.setValueAtTime(currentGains.stem1, syncStartTime);
    this.stemGainNodes[1].gain.setValueAtTime(currentGains.stem2, syncStartTime);
    this.stemGainNodes[2].gain.setValueAtTime(currentGains.stem3, syncStartTime);
    this.stemGainNodes[3].gain.setValueAtTime(currentGains.stem4, syncStartTime);

    // Create synchronized sources
    this.sources = this.stemBuffers.map((buffer, idx) => {
      const src = this.ctx!.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.loopStart = 0;
      src.loopEnd = this.commonLoopDuration;
      src.connect(this.stemGainNodes![idx]);
      src.start(syncStartTime);
      return src;
    });

    this.state = 'playing';
  }

  private stopSources(): void {
    this.sources.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Source might already have ended
      }
    });
    this.sources = [];
  }

  /**
   * Updates player progress toward exit (0.0 to 1.0) and adjusts crossfading.
   */
  public updateProgress(progress: number): void {
    this.currentProgress = Math.max(0, Math.min(1, progress));
    const gains = calculateQuartileGains(this.currentProgress, this.crossfadeCurve);

    if (this.fallbackActive && this.sineFallback) {
      this.sineFallback.updateGains(gains, this.smoothingTimeConstant);
      return;
    }

    if (!this.stemGainNodes || this.state !== 'playing' || !this.ctx) return;

    const now = this.ctx.currentTime;
    const tau = this.smoothingTimeConstant;

    this.stemGainNodes[0].gain.setTargetAtTime(gains.stem1, now, tau);
    this.stemGainNodes[1].gain.setTargetAtTime(gains.stem2, now, tau);
    this.stemGainNodes[2].gain.setTargetAtTime(gains.stem3, now, tau);
    this.stemGainNodes[3].gain.setTargetAtTime(gains.stem4, now, tau);
  }

  /**
   * Triggers victory fanfare and fades out background stems.
   */
  public playFinalFanfare(): void {
    if (!this.ctx || !this.stemsBus) return;
    const now = this.ctx.currentTime;

    if (this.fadeTimeoutId !== null) {
      clearTimeout(this.fadeTimeoutId);
      this.fadeTimeoutId = null;
    }

    if (this.fallbackActive && this.sineFallback) {
      this.sineFallback.playFanfare();
      this.state = 'stopped';
      return;
    }

    // Fade out stems smoothly
    if (this.stemGainNodes) {
      this.stemGainNodes.forEach((g) => {
        try {
          g.gain.setTargetAtTime(0, now, 0.05);
        } catch {
          // Fallback
        }
      });
    }

    // Release looping background stem buffer sources after fadeout (150ms)
    this.fadeTimeoutId = setTimeout(() => {
      if (this.state === 'stopped') {
        this.stopSources();
      }
      this.fadeTimeoutId = null;
    }, 150);

    if (this.finalBuffer) {
      if (this.fanfareSource) {
        try {
          this.fanfareSource.stop();
          this.fanfareSource.disconnect();
        } catch {
          // Ignore
        }
        this.fanfareSource = null;
      }
      if (this.fanfareGain) {
        try {
          this.fanfareGain.disconnect();
        } catch {
          // Ignore
        }
        this.fanfareGain = null;
      }

      const fanfareSrc = this.ctx.createBufferSource();
      fanfareSrc.buffer = this.finalBuffer;
      fanfareSrc.loop = false;

      const fanfareGain = this.ctx.createGain();
      fanfareGain.gain.setValueAtTime(1.0, now);
      try {
        fanfareGain.channelCount = 1;
        fanfareGain.channelCountMode = 'explicit';
      } catch {
        // Fallback for mock environments
      }

      fanfareSrc.connect(fanfareGain);
      fanfareGain.connect(this.stemsBus);

      fanfareSrc.start(now);
      this.fanfareSource = fanfareSrc;
      this.fanfareGain = fanfareGain;

      fanfareSrc.onended = () => {
        try {
          fanfareSrc.disconnect();
          fanfareGain.disconnect();
        } catch {
          // Cleanup
        }
        if (this.fanfareSource === fanfareSrc) {
          this.fanfareSource = null;
        }
        if (this.fanfareGain === fanfareGain) {
          this.fanfareGain = null;
        }
      };
    } else {
      this.sineFallback =
        this.sineFallback ?? new SineFallbackSynthesizer(this.ctx, this.stemsBus);
      this.sineFallback.playFanfare();
    }

    this.state = 'stopped';
  }

  /**
   * Updates directional stereo panning and lowpass filtering based on the next step on the shortest BFS path:
   * - dx > 0: Hard Right (pan = 1.0, left channel silent)
   * - dx < 0: Hard Left (pan = -1.0, right channel silent)
   * - dy < 0: Forward (pan = 0.0, clear bright tone without filter, 20000Hz)
   * - dy > 0: Backward / Dead-end (pan = 0.0, muffled tone via 600Hz lowpass filter)
   * Transitions use smooth click-free linear ramps over 60-80ms (70ms).
   */
  public updateDirection(dx: number, dy: number): void {
    let targetPan = 0.0;
    let targetFilterFreq = 20000;

    if (dx > 0) {
      targetPan = 1.0;
      targetFilterFreq = 20000;
    } else if (dx < 0) {
      targetPan = -1.0;
      targetFilterFreq = 20000;
    } else if (dy < 0) {
      targetPan = 0.0;
      targetFilterFreq = 20000;
    } else if (dy > 0) {
      targetPan = 0.0;
      targetFilterFreq = 600;
    }

    this.currentTargetPan = targetPan;
    this.currentFilterFreq = targetFilterFreq;

    if (this.ctx) {
      const isRunning = this.ctx.state === 'running';
      const now = this.ctx.currentTime;
      const rampDuration = 0.07; // 70ms linear ramp (60-80ms requirement)

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

  public getCurrentPan(): number {
    return this.currentTargetPan;
  }

  public getCurrentFilterFreq(): number {
    return this.currentFilterFreq;
  }

  public getCurrentProgress(): number {
    return this.currentProgress;
  }

  public getPannerNode(): StereoPannerNode | null {
    return this.pannerNode;
  }

  public getFilterNode(): BiquadFilterNode | null {
    return this.filterNode;
  }

  public getStemsBus(): GainNode | null {
    return this.stemsBus;
  }

  public pause(): void {
    this.stopSources();
    if (this.fallbackActive && this.sineFallback) {
      this.sineFallback.stop();
    }
    this.state = 'paused';
  }

  public stop(): void {
    if (this.fadeTimeoutId !== null) {
      clearTimeout(this.fadeTimeoutId);
      this.fadeTimeoutId = null;
    }
    this.stopSources();
    if (this.fallbackActive && this.sineFallback) {
      this.sineFallback.stop();
    }
    this.state = 'stopped';
  }

  public isUsingFallback(): boolean {
    return this.fallbackActive;
  }

  public getState(): StemLoadingState {
    return this.state;
  }

  public getProgress(): number {
    return this.currentProgress;
  }

  public getProximityAttenuation(): number {
    return this.proximityAttenuation;
  }

  public setProximityAttenuation(factor: number, immediate = false): void {
    void immediate;
    this.proximityAttenuation = Math.max(0.30, Math.min(1.0, factor));
  }

  public updateProximity(currentDist: number, prevDist: number): void {
    if (currentDist < prevDist) {
      this.setProximityAttenuation(1.0, true);
    } else if (currentDist > prevDist) {
      const target = Math.max(0.30, 1.0 - (currentDist - prevDist) * 0.25);
      this.setProximityAttenuation(target, false);
    }
  }

  public getCurrentPackId(): string {
    return this.currentPackId;
  }

  /**
   * Seamlessly switches to another audio pack, downloading on-demand if uncached,
   * smoothly fading out the old pack over 0.5s if currently playing, swapping buffers,
   * and resuming in sync with topological progress.
   */
  public async switchPack(
    packId: string,
    onProgress?: (pct: number) => void
  ): Promise<boolean> {
    // 1. Input Validation
    if (typeof packId !== 'string' || !isValidAudioPackId(packId)) {
      console.warn('[StemPlayer] switchPack called with invalid pack ID:', packId);
      return false;
    }

    const pack = getAudioPack(packId);
    if (!pack) {
      return false;
    }

    // 2. Short-circuit if already on target pack and fully initialized
    if (
      this.currentPackId === packId &&
      this.stemBuffers.length === 4 &&
      this.state !== 'unloaded' &&
      !this.fallbackActive &&
      (pack.finalTrack ? this.finalBuffer !== null : true)
    ) {
      onProgress?.(100);
      touchAudioPackUsage(packId);
      return true;
    }

    // Monotonic generation token to cancel stale in-flight switches
    const currentToken = ++this.switchPackToken;

    // Clear any pending crossfade timeout
    if (this.crossfadeTimeoutId !== null) {
      clearTimeout(this.crossfadeTimeoutId);
      this.crossfadeTimeoutId = null;
    }
    if (this.crossfadeResolve !== null) {
      const resolve = this.crossfadeResolve;
      this.crossfadeResolve = null;
      resolve();
    }

    // 3. Cache Check & On-Demand Download
    const isCached = await isAudioPackCachedAndValid(packId);
    if (currentToken !== this.switchPackToken) {
      return false;
    }

    if (!isCached) {
      let downloadSuccess: boolean;
      try {
        downloadSuccess = await loadAudioPackWithProgress(packId, (p) => {
          if (currentToken !== this.switchPackToken) return;
          const pct = p <= 1 && p > 0 ? Math.round(p * 100) : Math.round(p);
          onProgress?.(pct);
        });
      } catch (err) {
        console.warn('[StemPlayer] loadAudioPackWithProgress threw an error for pack:', packId, err);
        return false;
      }

      if (currentToken !== this.switchPackToken) {
        return false;
      }

      if (!downloadSuccess) {
        console.warn('[StemPlayer] loadAudioPackWithProgress failed for:', packId);
        return false;
      }
    } else {
      onProgress?.(100);
    }

    // 4. Playing State & 0.5s Crossfade Fadeout
    const wasPlaying = this.state === 'playing';
    const isRunning = this.ctx !== null && this.ctx.state === 'running';
    const shouldCrossfade = wasPlaying && isRunning && this.stemsBus !== null;

    if (shouldCrossfade && this.ctx && this.stemsBus) {
      const now = this.ctx.currentTime;
      try {
        this.stemsBus.gain.cancelScheduledValues(now);
        const currentGain =
          typeof this.stemsBus.gain.value === 'number' ? this.stemsBus.gain.value : 1.0;
        this.stemsBus.gain.setValueAtTime(currentGain, now);
        this.stemsBus.gain.linearRampToValueAtTime(0.0001, now + 0.5);
      } catch {
        // Fallback for mock environments
      }

      // Wait 500ms before stopping old sources
      await new Promise<void>((resolve) => {
        this.crossfadeResolve = resolve;
        this.crossfadeTimeoutId = setTimeout(() => {
          this.crossfadeTimeoutId = null;
          this.crossfadeResolve = null;
          resolve();
        }, 500);
      });

      if (currentToken !== this.switchPackToken) {
        return false;
      }

      this.stopSources();
      if (this.fallbackActive && this.sineFallback) {
        this.sineFallback.stop();
      }
    } else {
      // Non-playing or suspended state: bypass 500ms delay
      this.stopSources();
      if (this.fallbackActive && this.sineFallback) {
        this.sineFallback.stop();
      }
    }

    // 5. Buffer Swap & Decoding
    try {
      if (!this.ctx) {
        throw new Error('[StemPlayer] AudioContext not initialized');
      }

      const decodedBuffers = await Promise.all(
        pack.files.map(async (file) => {
          const fullPath = file.includes('/') ? file : `${pack.folder}/${file}`;
          const rawBuffer = await getCachedAudioPackAssetBuffer(packId, fullPath);
          const copy = rawBuffer.slice(0); // Protect against detached buffers
          return await new Promise<AudioBuffer>((resolve, reject) => {
            if (!this.ctx) {
              reject(new Error('AudioContext missing during stem decoding'));
              return;
            }
            this.ctx.decodeAudioData(copy, resolve, reject);
          });
        })
      );

      if (currentToken !== this.switchPackToken) {
        return false;
      }

      // 6. Fanfare handling
      let decodedFinal: AudioBuffer | null = null;
      if (pack.finalTrack) {
        try {
          const rawFinal = await getCachedAudioPackAssetBuffer(packId, pack.finalTrack);
          const finalCopy = rawFinal.slice(0);
          decodedFinal = await new Promise<AudioBuffer>((resolve, reject) => {
            if (!this.ctx) {
              reject(new Error('AudioContext missing during fanfare decoding'));
              return;
            }
            this.ctx.decodeAudioData(finalCopy, resolve, reject);
          });
        } catch (finalErr) {
          console.warn(
            `[StemPlayer] finalTrack load failed for "${packId}"; synthetic fanfare fallback:`,
            finalErr
          );
          decodedFinal = null;
        }
      } else {
        decodedFinal = null;
      }

      if (currentToken !== this.switchPackToken) {
        return false;
      }

      this.stemBuffers = decodedBuffers;
      this.finalBuffer = decodedFinal;
      this.commonLoopDuration = Math.min(...decodedBuffers.map((b) => b.duration));
      this.fallbackActive = false;

      // 7. Re-initialize mono downmixing gain nodes
      if (this.stemGainNodes) {
        this.stemGainNodes.forEach((g) => {
          try {
            g.disconnect();
          } catch {
            // Ignore disconnect error
          }
        });
        this.stemGainNodes = null;
      }
      this.initStemGainNodes();

      // 8. Restore this.stemsBus.gain to 1.0
      if (this.stemsBus && this.ctx && this.ctx.state !== 'closed') {
        const now = this.ctx.currentTime;
        try {
          this.stemsBus.gain.cancelScheduledValues(now);
          this.stemsBus.gain.setValueAtTime(1.0, now);
        } catch {
          // Fallback for mock environments
        }
      }

      // 9. If was playing, restart new stem loops synchronized at now + 0.05
      this.state = 'ready';
      if (wasPlaying) {
        this.start();
      }

      // 10. Touch usage timestamp & update currentPackId
      touchAudioPackUsage(packId);
      this.currentPackId = packId;
      return true;
    } catch (err) {
      console.warn(`[StemPlayer] switchPack to "${packId}" failed:`, err);
      this.activateFallback();
      if (this.stemsBus && this.ctx) {
        try {
          this.stemsBus.gain.cancelScheduledValues(this.ctx.currentTime);
          this.stemsBus.gain.setValueAtTime(1.0, this.ctx.currentTime);
        } catch {
          // Fallback for mock environments
        }
      }
      if (wasPlaying) {
        this.start();
      }
      return false;
    }
  }

  public destroy(): void {
    if (this.fadeTimeoutId !== null) {
      clearTimeout(this.fadeTimeoutId);
      this.fadeTimeoutId = null;
    }
    if (this.crossfadeTimeoutId !== null) {
      clearTimeout(this.crossfadeTimeoutId);
      this.crossfadeTimeoutId = null;
    }
    if (this.crossfadeResolve !== null) {
      const resolve = this.crossfadeResolve;
      this.crossfadeResolve = null;
      resolve();
    }
    this.switchPackToken++;
    this.currentPackId = DEFAULT_AUDIO_PACK_ID;
    if (this.fanfareSource) {
      try {
        this.fanfareSource.stop();
        this.fanfareSource.disconnect();
      } catch {
        // Ignore
      }
      this.fanfareSource = null;
    }
    if (this.fanfareGain) {
      try {
        this.fanfareGain.disconnect();
      } catch {
        // Ignore
      }
      this.fanfareGain = null;
    }
    this.stop();
    if (this.sineFallback) {
      this.sineFallback.destroy();
      this.sineFallback = null;
    }
    if (this.stemGainNodes) {
      this.stemGainNodes.forEach((g) => {
        try {
          g.disconnect();
        } catch {
          // Cleanup
        }
      });
      this.stemGainNodes = null;
    }
    if (this.filterNode) {
      try {
        this.filterNode.disconnect();
      } catch {
        // Cleanup
      }
      this.filterNode = null;
    }
    if (this.pannerNode) {
      try {
        this.pannerNode.disconnect();
      } catch {
        // Cleanup
      }
      this.pannerNode = null;
    }
    if (this.stemsBus) {
      try {
        this.stemsBus.disconnect();
      } catch {
        // Cleanup
      }
      this.stemsBus = null;
    }
    this.ctx = null;
    this.destination = null;
    this.stemBuffers = [];
    this.finalBuffer = null;
    this.currentTargetPan = 0.0;
    this.currentFilterFreq = 20000;
    this.lastScheduledPan = null;
    this.lastScheduledFilterFreq = null;
    this.proximityAttenuation = 1.0;
    this.state = 'unloaded';
  }
}
