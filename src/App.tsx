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
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
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

      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
          padding: 14,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            height: '100%',
            maxHeight: '85vh',
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
          {settings.showSplits && isMobile && (
            <SplitsPanel checkpoints={checkpoints} elapsedMs={elapsedMs} lang={settings.lang} isDarkTheme={isDark} isMobileOverlay />
          )}
        </div>

        {!isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {settings.showSplits && (
              <SplitsPanel checkpoints={checkpoints} elapsedMs={elapsedMs} lang={settings.lang} isDarkTheme={isDark} />
            )}
            <ControlsWidget isMobile={false} isDarkTheme={isDark} lang={settings.lang} />
          </div>
        ) : (
          <div style={{ width: '100%', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <VirtualJoystick onMove={setJoystickVector} isDarkTheme={isDark} />
            <ControlsWidget isMobile={true} isDarkTheme={isDark} lang={settings.lang} />
          </div>
        )}
      </main>

      <Footer lang={settings.lang} isDarkTheme={isDark} />

      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} effect={effect} lang={settings.lang} isDarkTheme={isDark} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={settings} onUpdateSettings={handleUpdateSettings} isDarkTheme={isDark} />
      <StatsModal isOpen={isStatsOpen} onClose={() => setIsStatsOpen(false)} stats={dailyStats} dayNumber={dayNumber} grid={mazeData.cells} start={mazeData.start} exit={mazeData.exit} playerColor={settings.playerColor} lang={settings.lang} isDarkTheme={isDark} />
      <WinModal isOpen={isWinOpen} onClose={() => setIsWinOpen(false)} onRestart={restart} record={lastWinRecord} checkpoints={checkpoints} isNewPB={isNewPB} dayNumber={dayNumber} lang={settings.lang} isDarkTheme={isDark} />
    </div>
  );
}

export default App;
