import React, { useMemo, useState } from 'react';
import { AVAILABLE_EFFECTS } from '../../config/gameConfig';
import { getDailyNumber } from '../../utils/date';
import { formatTime, TRANSLATIONS } from '../../utils/i18n';
import { getPastMaze } from '../../utils/pastMaze';
import { copyToClipboard, generateShareText } from '../../utils/share';
import { getLast30DaysStats, loadDailyStats } from '../../utils/storage';
import { ModalWrapper } from './ModalWrapper';
import { ReplayMap } from './ReplayMap';
import type { DailyStats, GridCoord, LanguageMode, MazeCell, RunRecord } from '../../types/game';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: DailyStats;
  dayNumber: number;
  grid: MazeCell[][];
  start: GridCoord;
  exit: GridCoord;
  playerColor: string;
  lang: LanguageMode;
  isDarkTheme: boolean;
}

export const StatsModal: React.FC<StatsModalProps> = ({
  isOpen,
  onClose,
  stats,
  dayNumber,
  grid,
  start,
  exit,
  playerColor,
  lang,
  isDarkTheme,
}) => {
  const t = TRANSLATIONS[lang];
  const [selectedDate, setSelectedDate] = useState<string>(stats.date);
  const [selectedRunIdx, setSelectedRunIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  const pastDays = useMemo(() => (isOpen ? getLast30DaysStats() : []), [isOpen]);
  const activeStats = useMemo(() => (selectedDate === stats.date ? stats : loadDailyStats(selectedDate)), [selectedDate, stats]);
  const activeMaze = useMemo(() => (selectedDate === stats.date ? { grid, start, exit } : getPastMaze(selectedDate)), [selectedDate, stats.date, grid, start, exit]);
  const selectedRun: RunRecord | undefined = activeStats.history[selectedRunIdx];

  const handleShare = async () => {
    if (!selectedRun) return;
    const effectMeta = AVAILABLE_EFFECTS.find((e) => e.type === selectedRun.effect);
    const runDayNum = selectedDate === stats.date ? dayNumber : getDailyNumber(new Date(selectedDate));
    const text = generateShareText({ dayNumber: runDayNum, record: selectedRun, effectName: t.effects[selectedRun.effect]?.name || selectedRun.effect, effectIcon: effectMeta?.icon || '⚡', lang });
    if (await copyToClipboard(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const statCard: React.CSSProperties = {
    background: isDarkTheme ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
    border: '1px solid var(--glass-border)',
    borderRadius: 10,
    padding: '8px 12px',
    textAlign: 'center',
    flex: 1,
  };

  return (
    <ModalWrapper title={t.stats} isOpen={isOpen} onClose={onClose} isDarkTheme={isDarkTheme}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {pastDays.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <label htmlFor="stats-day-select" style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
              {t.selectDay}
            </label>
            <select
              id="stats-day-select"
              value={selectedDate}
              onChange={(e) => { setSelectedDate(e.target.value); setSelectedRunIdx(0); }}
              aria-label={t.selectDay}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                background: isDarkTheme ? '#0d1420' : '#ffffff',
                color: 'var(--text)',
                border: '1px solid var(--glass-border)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {pastDays.map((d) => (
                <option key={d.date} value={d.date}>
                  {d.date} {d.date === stats.date ? `(${t.today})` : ''} - {d.totalRuns} {t.runsCount}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={statCard}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.bestTime}</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)', color: isDarkTheme ? 'var(--accent-green)' : '#00ffea' }}>
              {formatTime(activeStats.bestTimeMs)}
            </div>
          </div>
          <div style={statCard}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.totalRuns}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
              {activeStats.totalRuns}
            </div>
          </div>
        </div>

        {activeStats.history.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--muted)' }}>
              {t.historyTitle}
            </div>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
              {activeStats.history.map((run, idx) => (
                <button
                  key={run.id}
                  onClick={() => setSelectedRunIdx(idx)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: selectedRunIdx === idx ? '2px solid var(--accent-cyan)' : '1px solid var(--glass-border)',
                    background: selectedRunIdx === idx ? (isDarkTheme ? 'rgba(77,141,255,0.15)' : 'rgba(0,0,0,0.06)') : 'transparent',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  #{activeStats.history.length - idx} ({formatTime(run.durationMs)})
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedRun && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textAlign: 'center' }}>
              {t.replayTitle}
            </div>
            <ReplayMap
              grid={activeMaze.grid}
              start={activeMaze.start}
              exit={activeMaze.exit}
              path={selectedRun.path}
              playerColor={playerColor}
              isDarkTheme={isDarkTheme}
            />
            <button
              onClick={handleShare}
              style={{
                width: '100%',
                padding: '10px 0',
                background: 'var(--accent-green)',
                color: '#070b12',
                border: 'none',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                marginTop: 6,
              }}
            >
              {copied ? t.copied : `📤 ${t.share}`}
            </button>
          </div>
        )}
      </div>
    </ModalWrapper>
  );
};
