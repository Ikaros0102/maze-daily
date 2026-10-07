/**
 * src/modules/audioNav/volumeController.ts
 *
 * Hotkey listener and volume adjustment coordinator for the Audio Navigation Module.
 * Captures `+`, `-`, `[`, `]`, `M` keys in 10% steps, triggers autoplay resumption,
 * and coordinates audible feedback.
 */

import { AUDIO_NAV_DEFAULTS, type VolumeControllerOptions } from './types.ts';
import type { AudioNavigationEngine } from './engine.ts';

const VOLUME_STEP = AUDIO_NAV_DEFAULTS.volumeStep;

export class VolumeController {
  private engine: AudioNavigationEngine;
  private options: VolumeControllerOptions;
  private isListening = false;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(engine: AudioNavigationEngine, options: VolumeControllerOptions = {}) {
    this.engine = engine;
    this.options = options;
  }

  /**
   * Starts listening to window keydown events.
   */
  public attach(): void {
    if (this.isListening || typeof window === 'undefined') return;

    this.keydownHandler = (e: KeyboardEvent) => this.handleKeyDown(e);
    window.addEventListener('keydown', this.keydownHandler, { passive: false });
    this.isListening = true;
  }

  /**
   * Stops listening to window keydown events.
   */
  public detach(): void {
    if (!this.isListening || typeof window === 'undefined') return;

    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
    this.isListening = false;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Ignore hotkeys when typing into input / editable fields
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return;
    }

    const key = e.key;
    const code = e.code;

    const isVolumeUp =
      key === '+' ||
      key === '=' ||
      code === 'BracketRight' ||
      code === 'NumpadAdd';

    const isVolumeDown =
      key === '-' ||
      key === '_' ||
      code === 'BracketLeft' ||
      code === 'NumpadSubtract';

    const isMuteToggle =
      key === 'm' ||
      key === 'M' ||
      code === 'KeyM';

    if (isVolumeUp) {
      e.preventDefault();
      this.options.onGesture?.();
      if (this.engine.isMuted()) {
        this.engine.setMuted(false, false);
        this.options.onMuteChange?.(false);
      }
      this.stepVolume(VOLUME_STEP);
    } else if (isVolumeDown) {
      e.preventDefault();
      this.options.onGesture?.();
      this.stepVolume(-VOLUME_STEP);
    } else if (isMuteToggle) {
      e.preventDefault();
      this.options.onGesture?.();
      this.toggleMute();
    }
  }

  public stepVolume(delta: number): void {
    const current = this.engine.getVolume();
    const next = Math.max(0, Math.min(1, Math.round((current + delta) * 100) / 100));
    this.engine.setVolume(next, true);
    this.options.onVolumeChange?.(next);
  }

  public toggleMute(): void {
    const nextMuted = !this.engine.isMuted();
    this.engine.setMuted(nextMuted, true);
    this.options.onMuteChange?.(nextMuted);
  }
}
