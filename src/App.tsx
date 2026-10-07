import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useControls } from './hooks/useControls';
import { useGameLoop } from './hooks/useGameLoop';
import { ControlsWidget } from './components/ControlsWidget';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { MazeCanvas } from './components/MazeCanvas';
import { SplitsPanel } from './components/SplitsPanel';
import { VirtualJoystick } from './components/VirtualJoystick';
import { getDailyNumber, getLocalDailyDate } from './utils/date';

const HelpModal = React.lazy(() =>
  import('./components/Modals/HelpModal').then((m) => ({ default: m.HelpModal }))
);
const StatsModal = React.lazy(() =>
  import('./components/Modals/StatsModal').then((m) => ({ default: m.StatsModal }))
);
const WinModal = React.lazy(() =>
  import('./components/Modals/WinModal').then((m) => ({ default: m.WinModal }))
);
const SettingsModal = React.lazy(() =>
  import('./components/Modals/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const DownloadProgressModal = React.lazy(() =>
  import('./components/Modals/DownloadProgressModal').then((m) => ({ default: m.DownloadProgressModal }))
);
const CalibrationModal = React.lazy(() =>
  import('./components/Modals/CalibrationModal').then((m) => ({ default: m.CalibrationModal }))
);
const CameraErrorModal = React.lazy(() =>
  import('./components/Modals/CameraErrorModal').then((m) => ({ default: m.CameraErrorModal }))
);
import { formatTime, TRANSLATIONS } from './utils/i18n';
import { initDailyLevel } from './utils/levelInit';
import { loadDailyStats, loadSettings, saveRunRecord, saveSettings } from './utils/storage';
import type { BreadcrumbPoint, GameSettings, MazeData, Point, RunRecord } from './types/game';
import type { AudioNavController } from './modules/audioNav/types';
import type { CameraErrorCode, HeadTrackingController } from './modules/headTracking/types';
import './App.css';

export function App() {
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  const localDate = useMemo(() => getLocalDailyDate(), []);
  const dayNumber = useMemo(() => getDailyNumber(), []);
  const [dailyStats, setDailyStats] = useState(() => loadDailyStats(localDate));

  // Modal open states
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWinOpen, setIsWinOpen] = useState(false);
  const [lastWinRecord, setLastWinRecord] = useState<RunRecord | null>(null);
  const [isNewPB, setIsNewPB] = useState(false);

  // Accessibility modal states
  const [isDownloadProgressOpen, setIsDownloadProgressOpen] = useState(false);
  const [downloadModule, setDownloadModule] = useState<'headTracking' | 'audioNav' | string | null>(null);
  const [downloadPackName, setDownloadPackName] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  const [isCameraErrorOpen, setIsCameraErrorOpen] = useState(false);
  const [cameraErrorCode, setCameraErrorCode] = useState<CameraErrorCode | null>(null);
  const [cameraErrorMessage, setCameraErrorMessage] = useState<string | null>(null);

  // Persistent off-screen video element for head tracking
  const videoRef = useRef<HTMLVideoElement>(null);

  // Dynamic module controller refs
  const audioNavControllerRef = useRef<AudioNavController | null>(null);
  const headTrackingControllerRef = useRef<HeadTrackingController | null>(null);

  const [isVerticalLayout, setIsVerticalLayout] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth / window.innerHeight <= 1.05 || window.innerWidth < 850;
  });
  const [isTouchDevice] = useState(() =>
    typeof window !== 'undefined' && ('ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0))
  );

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const aspect = w / h;
      setIsVerticalLayout(aspect <= 1.05 || w < 850);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Background 10-day expired cache purge on idle
  useEffect(() => {
    const handleIdle = () => {
      import('./services/moduleLoader')
        .then(({ checkAndPurgeExpiredCaches }) => {
          checkAndPurgeExpiredCaches(settings.selectedAudioPack).catch(console.error);
        })
        .catch(() => {});
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = window.requestIdleCallback(handleIdle);
      return () => window.cancelIdleCallback(id);
    } else {
      const id = setTimeout(handleIdle, 2500);
      return () => clearTimeout(id);
    }
  }, [settings.selectedAudioPack]);

  const { baseSeed, mazeData, initialEffect } = useMemo(
    () => initDailyLevel(localDate),
    [localDate]
  );

  const { getInputVector, setJoystickVector } = useControls({
    isInverted: Boolean(initialEffect.isInverted),
  });

  const handleUpdateSettings = useCallback((next: GameSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const isDark = settings.theme === 'dark';

  useEffect(() => {
    document.body.classList.toggle('light', !isDark);
  }, [isDark]);

  useEffect(() => {
    document.documentElement.lang = settings.lang;
  }, [settings.lang]);

  // Sync audio navigation volume and mute state
  useEffect(() => {
    if (audioNavControllerRef.current?.isActive()) {
      audioNavControllerRef.current.setVolume(settings.audioNavVolume ?? 0.8);
      audioNavControllerRef.current.setMuted(Boolean(settings.audioNavMuted));
    }
  }, [settings.audioNavVolume, settings.audioNavMuted]);

  // Audio Navigation toggle handler
  const handleToggleAudioNav = useCallback(async (enabled: boolean) => {
    if (!enabled) {
      if (audioNavControllerRef.current?.isActive()) {
        audioNavControllerRef.current.destroy();
      }
      handleUpdateSettings({ ...settings, audioNavEnabled: false });
      return;
    }

    try {
      const { isModuleCachedAndValid, loadModuleWithProgress } = await import('./services/moduleLoader');
      const cached = await isModuleCachedAndValid('audioNav');
      if (!cached) {
        setDownloadModule('audioNav');
        setDownloadProgress(0);
        setDownloadError(null);
        setIsDownloadProgressOpen(true);

        await loadModuleWithProgress('audioNav', (pct) => setDownloadProgress(pct));
        setIsDownloadProgressOpen(false);
      }

      const { audioNavController } = await import('./modules/audioNav');
      audioNavControllerRef.current = audioNavController;
      await audioNavController.init();
      await audioNavController.resume();
      audioNavController.setVolume(settings.audioNavVolume ?? 0.8);
      audioNavController.setMuted(Boolean(settings.audioNavMuted));
      audioNavController.updatePlayerPosition(
        { x: mazeData.start.col + 0.5, y: mazeData.start.row + 0.5 },
        mazeData
      );

      // Sync active sound pack if not default
      if (settings.selectedAudioPack && settings.selectedAudioPack !== 'classic') {
        const { isAudioPackCachedAndValid } = await import('./services/moduleLoader');
        const packCached = await isAudioPackCachedAndValid(settings.selectedAudioPack);
        if (!packCached) {
          setDownloadModule(settings.selectedAudioPack);
          const { getAudioPack } = await import('./config/audioPacks');
          const pack = getAudioPack(settings.selectedAudioPack);
          const rawPackName = pack
            ? TRANSLATIONS[settings.lang][pack.nameKey as keyof typeof TRANSLATIONS[typeof settings.lang]]
            : undefined;
          const packName =
            typeof rawPackName === 'string' && rawPackName.trim() !== ''
              ? rawPackName
              : pack
                ? pack.id
                : settings.selectedAudioPack;
          setDownloadPackName(packName);
          setDownloadProgress(0);
          setDownloadError(null);
          setIsDownloadProgressOpen(true);

          await audioNavController.switchPack(settings.selectedAudioPack, (pct) => setDownloadProgress(pct));
          setIsDownloadProgressOpen(false);
          setDownloadPackName(null);
          setDownloadModule(null);
        } else {
          await audioNavController.switchPack(settings.selectedAudioPack);
        }
      }

      handleUpdateSettings({ ...settings, audioNavEnabled: true });
    } catch (err) {
      console.error('[AudioNav] Failed to enable audio navigation:', err);
      setDownloadError(err instanceof Error ? err.message : String(err));
      handleUpdateSettings({ ...settings, audioNavEnabled: false });
    }
  }, [settings, mazeData, handleUpdateSettings]);

  // Audio Pack selection handler
  const handleSelectAudioPack = useCallback(async (packId: string): Promise<boolean> => {
    if (packId === (settings.selectedAudioPack || 'classic')) {
      return true;
    }

    try {
      const { isAudioPackCachedAndValid } = await import('./services/moduleLoader');
      const isCached = await isAudioPackCachedAndValid(packId);

      const { audioNavController } = await import('./modules/audioNav');
      audioNavControllerRef.current = audioNavController;

      if (isCached) {
        const ok = await audioNavController.switchPack(packId);
        if (ok) {
          handleUpdateSettings({ ...settings, selectedAudioPack: packId });
          return true;
        }
        return false;
      }

      // Uncached: show DownloadProgressModal
      const { getAudioPack } = await import('./config/audioPacks');
      const pack = getAudioPack(packId);
      const rawPackName = pack
        ? TRANSLATIONS[settings.lang][pack.nameKey as keyof typeof TRANSLATIONS[typeof settings.lang]]
        : undefined;
      const packName =
        typeof rawPackName === 'string' && rawPackName.trim() !== ''
          ? rawPackName
          : pack
            ? pack.id
            : packId;

      setDownloadModule(packId);
      setDownloadPackName(packName);
      setDownloadProgress(0);
      setDownloadError(null);
      setIsDownloadProgressOpen(true);

      const ok = await audioNavController.switchPack(packId, (pct) => {
        setDownloadProgress(pct);
      });

      if (ok) {
        setIsDownloadProgressOpen(false);
        setDownloadModule(null);
        setDownloadPackName(null);
        handleUpdateSettings({ ...settings, selectedAudioPack: packId });
        return true;
      } else {
        setDownloadError(TRANSLATIONS[settings.lang].audioPackDownloadFailed);
        return false;
      }
    } catch (err) {
      console.error('[AudioNav] Failed to switch audio pack:', err);
      setDownloadError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, [settings, handleUpdateSettings]);

  // Auto-init audio navigation on mount if enabled in settings
  useEffect(() => {
    if (settings.audioNavEnabled && !audioNavControllerRef.current?.isActive()) {
      void handleToggleAudioNav(true);
    }
  }, [settings.audioNavEnabled, handleToggleAudioNav]);

  // Head Tracking toggle handler
  const handleToggleHeadTracking = useCallback(async (enabled: boolean) => {
    if (!enabled) {
      if (headTrackingControllerRef.current?.isActive()) {
        headTrackingControllerRef.current.stop();
      }
      setJoystickVector({ x: 0, y: 0 });
      handleUpdateSettings({ ...settings, headTrackingEnabled: false });
      return;
    }

    try {
      const { isModuleCachedAndValid, loadModuleWithProgress } = await import('./services/moduleLoader');
      const cached = await isModuleCachedAndValid('headTracking');
      if (!cached) {
        setDownloadModule('headTracking');
        setDownloadProgress(0);
        setDownloadError(null);
        setIsDownloadProgressOpen(true);

        await loadModuleWithProgress('headTracking', (pct) => setDownloadProgress(pct));
        setIsDownloadProgressOpen(false);
      }

      const { headTrackingController } = await import('./modules/headTracking');
      headTrackingControllerRef.current = headTrackingController;
      setIsCalibrationOpen(true);
    } catch (err) {
      console.error('[HeadTracking] Failed to download head tracking assets:', err);
      setDownloadError(err instanceof Error ? err.message : String(err));
      handleUpdateSettings({ ...settings, headTrackingEnabled: false });
    }
  }, [settings, setJoystickVector, handleUpdateSettings]);

  // Head Tracking calibration trigger
  const handleStartCalibration = useCallback(async () => {
    if (!videoRef.current) throw new Error('Video element unavailable');

    const { headTrackingController, parseCameraError } = await import('./modules/headTracking');
    headTrackingControllerRef.current = headTrackingController;

    await headTrackingController.start({
      videoElement: videoRef.current,
      onVector: (vec) => setJoystickVector(vec),
      onError: (err) => {
        setIsCalibrationOpen(false);
        headTrackingController.stop();
        setJoystickVector({ x: 0, y: 0 });
        const parsed = parseCameraError(err);
        setCameraErrorCode(parsed.code);
        setCameraErrorMessage(parsed.message);
        setIsCameraErrorOpen(true);
        handleUpdateSettings({ ...settings, headTrackingEnabled: false });
      },
    });

    return headTrackingController.calibrate(3000);
  }, [setJoystickVector, settings, handleUpdateSettings]);

  const handleCalibrationSuccess = useCallback(() => {
    setIsCalibrationOpen(false);
    handleUpdateSettings({ ...settings, headTrackingEnabled: true });
  }, [settings, handleUpdateSettings]);

  const handleRecalibrateHeadTracking = useCallback(() => {
    setIsCalibrationOpen(true);
  }, []);

  // Win handler
  const handleWin = useCallback((durationMs: number, splits: number[], path: BreadcrumbPoint[]) => {
    const prevBest = dailyStats.bestTimeMs;
    const record: RunRecord = {
      id: String(Date.now()),
      date: localDate,
      seed: baseSeed,
      completedAt: new Date().toISOString(),
      durationMs,
      splits,
      effect: initialEffect.type,
      path,
    };
    const updated = saveRunRecord(record);
    setDailyStats(updated);
    setIsNewPB(prevBest === null || durationMs < prevBest);
    setLastWinRecord(record);
    setIsWinOpen(true);
  }, [dailyStats.bestTimeMs, localDate, baseSeed, initialEffect.type]);

  // Audio game loop callbacks
  const handleAudioPositionUpdate = useCallback(
    (
      pos: Point,
      data: MazeData,
      collided: boolean,
      side?: import('./core/physics').CollisionSide,
      isPushingWall?: boolean,
      effect?: import('./types/game').DailyEffectState,
      checkpoints?: import('./types/game').SplitCheckpoint[]
    ) => {
      if (audioNavControllerRef.current?.isActive()) {
        audioNavControllerRef.current.updatePlayerPosition(pos, data, effect, checkpoints);
        audioNavControllerRef.current.setWallPushing?.(Boolean(isPushingWall));
        if (collided) {
          audioNavControllerRef.current.triggerWallCollision(side, Boolean(isPushingWall));
        }
      }
    },
    []
  );

  const handleAudioVictory = useCallback(() => {
    if (audioNavControllerRef.current?.isActive()) {
      audioNavControllerRef.current.playFinalFanfare?.();
    }
  }, []);

  const handleAudioResume = useCallback(() => {
    if (audioNavControllerRef.current?.isActive()) {
      void audioNavControllerRef.current.resume();
    }
  }, []);

  const { playerPos, effect, checkpoints, elapsedMs, restart } = useGameLoop({
    mazeData,
    initialEffect,
    pbSplits: dailyStats.bestSplits,
    getInputVector,
    onWin: handleWin,
    onPlayerPositionUpdate: handleAudioPositionUpdate,
    onVictory: handleAudioVictory,
    onAudioResume: handleAudioResume,
  });

  const [prevHasKey, setPrevHasKey] = useState(false);
  const [keyJustCollected, setKeyJustCollected] = useState(false);
  const [prevReachedCount, setPrevReachedCount] = useState(0);

  const reachedCount = checkpoints.filter((cp) => cp.reachedTimeMs !== null).length;

  if (effect.type === 'key_and_gate') {
    if (effect.hasKey && !prevHasKey) {
      setPrevHasKey(true);
      setKeyJustCollected(true);
    } else if (!effect.hasKey && prevHasKey) {
      setPrevHasKey(false);
      setKeyJustCollected(false);
    }
  }

  if (reachedCount > prevReachedCount) {
    setPrevReachedCount(reachedCount);
    if (keyJustCollected) {
      setKeyJustCollected(false);
    }
  } else if (reachedCount < prevReachedCount) {
    setPrevReachedCount(reachedCount);
  }

  const latestAnnouncement = useMemo(() => {
    if (lastWinRecord) {
      const t = TRANSLATIONS[settings.lang];
      return `${t.winTitle} ${formatTime(lastWinRecord.durationMs)}`;
    }
    if (keyJustCollected) {
      const t = TRANSLATIONS[settings.lang];
      return t.keyCollected;
    }
    const reached = checkpoints.filter((cp) => cp.reachedTimeMs !== null);
    if (reached.length > 0) {
      const last = reached[reached.length - 1];
      const t = TRANSLATIONS[settings.lang];
      const label = last.ratio === 0.25 ? t.split25 : last.ratio === 0.5 ? t.split50 : last.ratio === 0.75 ? t.split75 : t.splitFinish;
      return `${label}: ${formatTime(last.reachedTimeMs)}`;
    }
    return '';
  }, [lastWinRecord, keyJustCollected, checkpoints, settings.lang]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100dvh',
        background: 'transparent',
        color: 'var(--text)',
      }}
    >
      {/* Persistent off-screen video element for head tracking MediaPipe input */}
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ display: 'none' }}
        aria-hidden="true"
      />

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {latestAnnouncement}
      </div>

      <Header
        dayNumber={dayNumber}
        elapsedMs={elapsedMs}
        effect={effect}
        lang={settings.lang}
        isDarkTheme={isDark}
        onRestart={restart}
        onOpenHelp={() => setIsHelpOpen(true)}
        onOpenStats={() => setIsStatsOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {isVerticalLayout ? (
        <main className="game-main-vertical">
          {settings.showSplits && (
            <SplitsPanel
              checkpoints={checkpoints}
              elapsedMs={elapsedMs}
              lang={settings.lang}
              isDarkTheme={isDark}
              isMobile={true}
            />
          )}

          <div
            style={{
              position: 'relative',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
              height: '100%',
              maxHeight: isTouchDevice ? '68vh' : '75vh',
              maxWidth: 'min(75vh, 92vw, 850px)',
            }}
          >
            <MazeCanvas
              grid={mazeData.cells}
              playerPos={playerPos}
              playerColor={settings.playerColor}
              start={mazeData.start}
              exit={mazeData.exit}
              checkpoints={checkpoints}
              effect={effect}
              isDarkTheme={isDark}
            />
          </div>

          <div
            style={{
              width: '100%',
              maxWidth: 'min(75vh, 92vw, 850px)',
              marginTop: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {isTouchDevice && (
              <VirtualJoystick onMove={setJoystickVector} isDarkTheme={isDark} />
            )}
            {settings.showControls && (
              <ControlsWidget
                isMobile={isTouchDevice}
                isDarkTheme={isDark}
                lang={settings.lang}
              />
            )}
          </div>
        </main>
      ) : (
        <main className="game-main-desktop">
          {/* Centered canvas anchor with exact 1:1 aspect ratio */}
          <div className="desktop-canvas-anchor">
            <MazeCanvas
              grid={mazeData.cells}
              playerPos={playerPos}
              playerColor={settings.playerColor}
              start={mazeData.start}
              exit={mazeData.exit}
              checkpoints={checkpoints}
              effect={effect}
              isDarkTheme={isDark}
            />

            {/* Sidebar pinned to the right of the canvas without affecting center alignment */}
            {(settings.showSplits || settings.showControls) && (
              <aside className="desktop-sidebar-pinned">
                {settings.showSplits && (
                  <SplitsPanel
                    checkpoints={checkpoints}
                    elapsedMs={elapsedMs}
                    lang={settings.lang}
                    isDarkTheme={isDark}
                    isMobile={false}
                  />
                )}
                {settings.showControls && (
                  <ControlsWidget
                    isMobile={false}
                    isDarkTheme={isDark}
                    lang={settings.lang}
                  />
                )}
              </aside>
            )}
          </div>
        </main>
      )}

      <Footer lang={settings.lang} isDarkTheme={isDark} />

      {/* Modals & Accessibility System */}
      <Suspense fallback={null}>
        {isHelpOpen && (
          <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} effect={effect} lang={settings.lang} isDarkTheme={isDark} />
        )}
        {isStatsOpen && (
          <StatsModal isOpen={isStatsOpen} onClose={() => setIsStatsOpen(false)} stats={dailyStats} dayNumber={dayNumber} grid={mazeData.cells} start={mazeData.start} exit={mazeData.exit} playerColor={settings.playerColor} lang={settings.lang} isDarkTheme={isDark} />
        )}
        {isWinOpen && (
          <WinModal isOpen={isWinOpen} onClose={() => setIsWinOpen(false)} onRestart={restart} record={lastWinRecord} checkpoints={checkpoints} isNewPB={isNewPB} dayNumber={dayNumber} lang={settings.lang} isDarkTheme={isDark} />
        )}
        {isSettingsOpen && (
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            isDarkTheme={isDark}
            isDesktop={!isTouchDevice}
            onToggleHeadTracking={handleToggleHeadTracking}
            onRecalibrateHeadTracking={handleRecalibrateHeadTracking}
            onToggleAudioNav={handleToggleAudioNav}
            onSelectAudioPack={handleSelectAudioPack}
          />
        )}
        {isDownloadProgressOpen && (
          <DownloadProgressModal
            isOpen={isDownloadProgressOpen}
            moduleName={downloadModule}
            packName={downloadPackName || undefined}
            progress={downloadProgress}
            onCancel={() => {
              setIsDownloadProgressOpen(false);
              setDownloadModule(null);
              setDownloadPackName(null);
            }}
            isDarkTheme={isDark}
            lang={settings.lang}
            error={downloadError}
          />
        )}

        {isCalibrationOpen && (
          <CalibrationModal
            isOpen={isCalibrationOpen}
            onClose={() => {
              setIsCalibrationOpen(false);
              if (!settings.headTrackingEnabled) {
                headTrackingControllerRef.current?.stop();
                setJoystickVector({ x: 0, y: 0 });
              }
            }}
            onSuccess={handleCalibrationSuccess}
            videoRef={videoRef}
            isDarkTheme={isDark}
            lang={settings.lang}
            onStartCalibration={handleStartCalibration}
          />
        )}

        {isCameraErrorOpen && (
          <CameraErrorModal
            isOpen={isCameraErrorOpen}
            onClose={() => {
              setIsCameraErrorOpen(false);
              setCameraErrorCode(null);
              setCameraErrorMessage(null);
            }}
            errorCode={cameraErrorCode}
            errorMessage={cameraErrorMessage}
            isDarkTheme={isDark}
            lang={settings.lang}
          />
        )}
      </Suspense>
    </div>
  );
}

export default App;
