import { useCallback, useEffect, useMemo, useState } from 'react';
import { useControls } from './hooks/useControls';
import { useGameLoop } from './hooks/useGameLoop';
import { ControlsWidget } from './components/ControlsWidget';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { MazeCanvas } from './components/MazeCanvas';
import { SplitsPanel } from './components/SplitsPanel';
import { VirtualJoystick } from './components/VirtualJoystick';
import { HelpModal } from './components/Modals/HelpModal';
import { SettingsModal } from './components/Modals/SettingsModal';
import { StatsModal } from './components/Modals/StatsModal';
import { WinModal } from './components/Modals/WinModal';
import { getDailyNumber, getLocalDailyDate } from './utils/date';
import { formatTime, TRANSLATIONS } from './utils/i18n';
import { initDailyLevel } from './utils/levelInit';
import { loadDailyStats, loadSettings, saveRunRecord, saveSettings } from './utils/storage';
import type { BreadcrumbPoint, GameSettings, RunRecord } from './types/game';
import './App.css';

export function App() {
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  const localDate = useMemo(() => getLocalDailyDate(), []);
  const dayNumber = useMemo(() => getDailyNumber(), []);
  const [dailyStats, setDailyStats] = useState(() => loadDailyStats(localDate));

  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWinOpen, setIsWinOpen] = useState(false);
  const [lastWinRecord, setLastWinRecord] = useState<RunRecord | null>(null);
  const [isNewPB, setIsNewPB] = useState(false);
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

  const { baseSeed, mazeData, initialEffect } = useMemo(
    () => initDailyLevel(localDate),
    [localDate]
  );

  const { getInputVector, setJoystickVector } = useControls({
    isInverted: Boolean(initialEffect.isInverted),
  });

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

  const { playerPos, effect, checkpoints, elapsedMs, restart } = useGameLoop({
    mazeData,
    initialEffect,
    pbSplits: dailyStats.bestSplits,
    getInputVector,
    onWin: handleWin,
  });

  const handleUpdateSettings = (next: GameSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  const isDark = settings.theme === 'dark';

  useEffect(() => {
    document.body.classList.toggle('light', !isDark);
  }, [isDark]);

  useEffect(() => {
    document.documentElement.lang = settings.lang;
  }, [settings.lang]);

  const latestAnnouncement = useMemo(() => {
    if (lastWinRecord) {
      const t = TRANSLATIONS[settings.lang];
      return `${t.winTitle} ${formatTime(lastWinRecord.durationMs)}`;
    }
    const reached = checkpoints.filter((cp) => cp.reachedTimeMs !== null);
    if (reached.length > 0) {
      const last = reached[reached.length - 1];
      const t = TRANSLATIONS[settings.lang];
      const label = last.ratio === 0.25 ? t.split25 : last.ratio === 0.5 ? t.split50 : last.ratio === 0.75 ? t.split75 : t.splitFinish;
      return `${label}: ${formatTime(last.reachedTimeMs)}`;
    }
    return '';
  }, [lastWinRecord, checkpoints, settings.lang]);

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

      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} effect={effect} lang={settings.lang} isDarkTheme={isDark} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={settings} onUpdateSettings={handleUpdateSettings} isDarkTheme={isDark} />
      <StatsModal isOpen={isStatsOpen} onClose={() => setIsStatsOpen(false)} stats={dailyStats} dayNumber={dayNumber} grid={mazeData.cells} start={mazeData.start} exit={mazeData.exit} playerColor={settings.playerColor} lang={settings.lang} isDarkTheme={isDark} />
      <WinModal isOpen={isWinOpen} onClose={() => setIsWinOpen(false)} onRestart={restart} record={lastWinRecord} checkpoints={checkpoints} isNewPB={isNewPB} dayNumber={dayNumber} lang={settings.lang} isDarkTheme={isDark} />
    </div>
  );
}

export default App;
