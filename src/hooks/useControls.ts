import { useCallback, useEffect, useRef } from 'react';
import type { GlitchTransform, Point } from '../types/game';

const cleanZero = (n: number) => (n === 0 ? 0 : n);

export function transformInputForGlitch(vec: Point, transform?: GlitchTransform): Point {
  if (!transform || transform === 'none') return vec;
  switch (transform) {
    case 'rotate_cw':
      return { x: cleanZero(vec.y), y: cleanZero(-vec.x) };
    case 'rotate_ccw':
      return { x: cleanZero(-vec.y), y: cleanZero(vec.x) };
    case 'flip_h':
      return { x: cleanZero(-vec.x), y: cleanZero(vec.y) };
    case 'flip_v':
      return { x: cleanZero(vec.x), y: cleanZero(-vec.y) };
  }
}

interface UseControlsOptions {
  isInverted?: boolean;
  enabled?: boolean;
  glitchTransform?: GlitchTransform;
}

const CONTROL_KEYS = new Set([
  'keyw', 'keyz', 'arrowup', 'w', 'z', 'ц',
  'keys', 'arrowdown', 's', 'ы',
  'keya', 'keyq', 'arrowleft', 'a', 'q', 'ф',
  'keyd', 'arrowright', 'd', 'в',
]);

export function useControls({ isInverted = false, enabled = true, glitchTransform = 'none' }: UseControlsOptions) {
  const joystickVectorRef = useRef<Point>({ x: 0, y: 0 });
  const keysPressed = useRef<Set<string>>(new Set());
  const isInvertedRef = useRef(isInverted);
  const enabledRef = useRef(enabled);
  const glitchTransformRef = useRef(glitchTransform);

  useEffect(() => {
    isInvertedRef.current = isInverted;
  }, [isInverted]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    glitchTransformRef.current = glitchTransform;
  }, [glitchTransform]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.code.toLowerCase();
      const key = e.key.toLowerCase();

      if (CONTROL_KEYS.has(code) || CONTROL_KEYS.has(key)) {
        e.preventDefault();
        if (code) keysPressed.current.add(code);
        keysPressed.current.add(key);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const code = e.code.toLowerCase();
      const key = e.key.toLowerCase();
      if (code) keysPressed.current.delete(code);
      keysPressed.current.delete(key);
    };

    const handleBlur = () => {
      keysPressed.current.clear();
      joystickVectorRef.current = { x: 0, y: 0 };
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [enabled]);

  const setJoystickVector = useCallback((vec: Point) => {
    joystickVectorRef.current = vec;
  }, []);

  const getInputVector = useCallback((): Point => {
    if (!enabledRef.current) return { x: 0, y: 0 };

    let x = 0;
    let y = 0;
    const keys = keysPressed.current;

    // Up
    if (
      keys.has('keyw') || keys.has('keyz') || keys.has('arrowup') ||
      keys.has('w') || keys.has('z') || keys.has('ц')
    ) {
      y -= 1;
    }

    // Down
    if (
      keys.has('keys') || keys.has('arrowdown') ||
      keys.has('s') || keys.has('ы')
    ) {
      y += 1;
    }

    // Left
    if (
      keys.has('keya') || keys.has('keyq') || keys.has('arrowleft') ||
      keys.has('a') || keys.has('q') || keys.has('ф')
    ) {
      x -= 1;
    }

    // Right
    if (
      keys.has('keyd') || keys.has('arrowright') ||
      keys.has('d') || keys.has('в')
    ) {
      x += 1;
    }

    // Virtual Joystick приоритет
    const jx = joystickVectorRef.current.x;
    const jy = joystickVectorRef.current.y;
    if (jx !== 0 || jy !== 0) {
      x = jx;
      y = jy;
    }

    // Нормализация вектора
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }

    // Инверсия применяется строго здесь
    if (isInvertedRef.current) {
      x = -x;
      y = -y;
    }

    // Синхронизация вектора управления с поворотом/отражением экрана при глитче
    if (glitchTransformRef.current && glitchTransformRef.current !== 'none') {
      const transformed = transformInputForGlitch({ x, y }, glitchTransformRef.current);
      x = transformed.x;
      y = transformed.y;
    }

    return { x, y };
  }, []);

  return {
    getInputVector,
    setJoystickVector,
  };
}