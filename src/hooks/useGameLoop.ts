import { useCallback, useEffect, useRef, useState } from 'react';
import { GAME_CONFIG } from '../config/gameConfig';
import { handleInteractiveElements } from '../core/effectInteractions';
import { revealFogRadius } from '../core/effects';
import { updatePlayerPhysics } from '../core/physics';
import type { BreadcrumbPoint, DailyEffectState, MazeData, Point, SplitCheckpoint } from '../types/game';

interface UseGameLoopProps {
  mazeData: MazeData;
  initialEffect: DailyEffectState;
  pbSplits: (number | null)[];
  getInputVector: () => Point;
  onWin: (durationMs: number, splits: number[], path: BreadcrumbPoint[]) => void;
}

export function useGameLoop({
  mazeData,
  initialEffect,
  pbSplits,
  getInputVector,
  onWin,
}: UseGameLoopProps) {
  const [playerPos, setPlayerPos] = useState<Point>({
    x: mazeData.start.col + 0.5,
    y: mazeData.start.row + 0.5,
  });
  const [effect, setEffect] = useState<DailyEffectState>(initialEffect);
  const [checkpoints, setCheckpoints] = useState<SplitCheckpoint[]>(() =>
    mazeData.checkpoints.map((cp, idx) => ({ ...cp, pbTimeMs: pbSplits[idx] ?? null }))
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  // References for uninterrupted game loop execution
  const posRef = useRef<Point>({ x: mazeData.start.col + 0.5, y: mazeData.start.row + 0.5 });
  const velRef = useRef<Point>({ x: 0, y: 0 });
  const effectRef = useRef<DailyEffectState>(initialEffect);
  const isPlayingRef = useRef<boolean>(false);
  const isFinishedRef = useRef<boolean>(false);
  const nextCheckpointIdx = useRef<number>(0);
  const splitsRef = useRef<(number | null)[]>(mazeData.checkpoints.map(() => null));
  const startTimeRef = useRef<number>(0);
  const lastSampleTimeRef = useRef<number>(0);
  const lastTimerUpdateRef = useRef<number>(0);
  const portalCooldownRef = useRef<number>(0);
  const pathTrackRef = useRef<BreadcrumbPoint[]>([]);

  // Stable callbacks in refs to prevent animation loop restarts
  const getInputVectorRef = useRef(getInputVector);
  const onWinRef = useRef(onWin);

  useEffect(() => {
    getInputVectorRef.current = getInputVector;
  }, [getInputVector]);

  useEffect(() => {
    onWinRef.current = onWin;
  }, [onWin]);

  useEffect(() => {
    effectRef.current = effect;
  }, [effect]);

  const restart = useCallback(() => {
    const sx = mazeData.start.col + 0.5;
    const sy = mazeData.start.row + 0.5;
    posRef.current = { x: sx, y: sy };
    velRef.current = { x: 0, y: 0 };
    nextCheckpointIdx.current = 0;
    splitsRef.current = mazeData.checkpoints.map(() => null);
    startTimeRef.current = 0;
    lastSampleTimeRef.current = 0;
    lastTimerUpdateRef.current = 0;
    portalCooldownRef.current = 0;
    pathTrackRef.current = [];

    const freshEffect = JSON.parse(JSON.stringify(initialEffect)) as DailyEffectState;
    if (freshEffect.type === 'fog_of_war' && freshEffect.fogRevealed) {
      revealFogRadius(freshEffect.fogRevealed, sx, sy);
    }
    setEffect(freshEffect);
    setPlayerPos({ x: sx, y: sy });
    setCheckpoints(
      mazeData.checkpoints.map((cp, idx) => ({
        ...cp,
        reachedTimeMs: null,
        pbTimeMs: pbSplits[idx] ?? null,
      }))
    );
    setElapsedMs(0);
    isPlayingRef.current = false;
    isFinishedRef.current = false;
    setIsPlaying(false);
    setIsFinished(false);
  }, [mazeData, initialEffect, pbSplits]);

  // Main animation loop: runs uninterrupted for the current maze
  useEffect(() => {
    let animId: number;
    let lastTime = 0;

    const loop = (now: number) => {
      animId = requestAnimationFrame(loop);
      if (isFinishedRef.current) return;

      if (lastTime === 0) {
        lastTime = now;
      }
      // Ensure dt is never negative and capped at 50ms
      const rawDt = (now - lastTime) / 1000;
      const dt = Math.max(0, Math.min(rawDt, 0.05));
      lastTime = now;

      const input = getInputVectorRef.current();

      // Trigger play start on first movement input
      if (!isPlayingRef.current && (input.x !== 0 || input.y !== 0)) {
        isPlayingRef.current = true;
        setIsPlaying(true);
        startTimeRef.current = now;
        lastSampleTimeRef.current = now;
        lastTimerUpdateRef.current = now;
      }

      if (isPlayingRef.current) {
        const currentElapsed = now - startTimeRef.current;

        // Throttled timer state update (20Hz)
        if (now - lastTimerUpdateRef.current >= 50) {
          setElapsedMs(currentElapsed);
          lastTimerUpdateRef.current = now;
        }

        // Update physics
        const nextPhys = updatePlayerPhysics(
          { pos: posRef.current, vel: velRef.current },
          input,
          dt,
          mazeData.cells,
          effectRef.current
        );
        posRef.current = nextPhys.pos;
        velRef.current = nextPhys.vel;

        // Interactive effect elements (portals, keys, fake exits, fog)
        const interaction = handleInteractiveElements(
          posRef.current,
          now,
          effectRef.current,
          portalCooldownRef.current
        );
        if (interaction) {
          if (interaction.newPosition) posRef.current = interaction.newPosition;
          if (interaction.newCooldown) portalCooldownRef.current = interaction.newCooldown;
          if (interaction.updatedEffect !== effectRef.current) {
            effectRef.current = interaction.updatedEffect;
            setEffect(interaction.updatedEffect);
          }
        }

        // Record breadcrumbs at 10Hz
        if (now - lastSampleTimeRef.current >= 1000 / GAME_CONFIG.samplingRateHz) {
          pathTrackRef.current.push([
            Math.round(posRef.current.x * 100) / 100,
            Math.round(posRef.current.y * 100) / 100,
            Math.round(currentElapsed),
          ]);
          lastSampleTimeRef.current = now;
        }

        const pCol = Math.floor(posRef.current.x);
        const pRow = Math.floor(posRef.current.y);

        // 1. Strict Sequential Checkpoints (Grid-based matching)
        const curIdx = nextCheckpointIdx.current;
        if (curIdx < mazeData.checkpoints.length) {
          const target = mazeData.checkpoints[curIdx];
          if (pCol === target.cell.col && pRow === target.cell.row) {
            splitsRef.current[curIdx] = currentElapsed;
            nextCheckpointIdx.current += 1;
            setCheckpoints((prev) =>
              prev.map((cp, idx) =>
                idx === curIdx ? { ...cp, reachedTimeMs: currentElapsed } : cp
              )
            );
          }
        }

        // 2. Autonomous Fail-safe Finish Trigger
        if (pCol === mazeData.exit.col && pRow === mazeData.exit.row) {
          isFinishedRef.current = true;
          isPlayingRef.current = false;
          setIsFinished(true);
          setIsPlaying(false);
          setElapsedMs(currentElapsed);
          const finalSplits = splitsRef.current.map((c) => c ?? currentElapsed);
          setCheckpoints((prev) =>
            prev.map((cp) => ({
              ...cp,
              reachedTimeMs: cp.reachedTimeMs ?? currentElapsed,
            }))
          );
          onWinRef.current(currentElapsed, finalSplits, pathTrackRef.current);
          return;
        }
      }

      setPlayerPos({ ...posRef.current });
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [mazeData]); // Only depends on mazeData: never torn down during gameplay

  return { playerPos, effect, checkpoints, isPlaying, isFinished, elapsedMs, restart };
}
