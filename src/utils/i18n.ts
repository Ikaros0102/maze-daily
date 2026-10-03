import type { LanguageMode } from '../types/game';

export const TRANSLATIONS: Record<LanguageMode, {
  appTitle: string;
  dayLabel: string;
  timer: string;
  pb: string;
  restart: string;
  splitsTitle: string;
  split25: string;
  split50: string;
  split75: string;
  splitFinish: string;
  notReached: string;
  settings: string;
  stats: string;
  help: string;
  share: string;
  copied: string;
  theme: string;
  darkTheme: string;
  lightTheme: string;
  language: string;
  fireflyColor: string;
  showSplits: string;
  todayModifier: string;
  desktopControls: string;
  mobileControls: string;
  winTitle: string;
  newPB: string;
  totalRuns: string;
  bestTime: string;
  historyTitle: string;
  replayTitle: string;
  privacyNote: string;
  effects: Record<string, { name: string; desc: string }>;
}> = {
  en: {
    appTitle: 'Maze Daily',
    dayLabel: 'Day',
    timer: 'Time',
    pb: 'PB',
    restart: 'Restart',
    splitsTitle: 'Time Splits',
    split25: '25% Way',
    split50: '50% Way',
    split75: '75% Way',
    splitFinish: 'Finish',
    notReached: '--:--.--',
    settings: 'Settings',
    stats: 'Statistics',
    help: 'How to Play',
    share: 'Share',
    copied: 'Copied to clipboard!',
    theme: 'Theme',
    darkTheme: 'Dark',
    lightTheme: 'Light',
    language: 'Language',
    fireflyColor: 'Firefly Color',
    showSplits: 'Show Time Splits',
    todayModifier: 'Today Modifier',
    desktopControls: 'Use WASD or Arrow keys to move smoothly.',
    mobileControls: 'Use the on-screen joystick or swipe to navigate.',
    winTitle: 'Maze Solved!',
    newPB: 'NEW PERSONAL BEST!',
    totalRuns: 'Total Attempts Today',
    bestTime: 'Best Time',
    historyTitle: 'Today Runs',
    replayTitle: 'Run Path Replay',
    privacyNote: 'Client-side only. No tracking cookies. Stored in your browser.',
    effects: {
      none: { name: 'Classic', desc: 'Pure speedrun without modifiers.' },
      fog_of_war: { name: 'Fog of War', desc: 'Sight is limited to a radius around the firefly.' },
      ice: { name: 'Ice', desc: 'Slippery floor with sliding momentum.' },
      fake_exits: { name: 'Fake Exits', desc: '3 of the 4 exits are decoys! Find the true one.' },
      wobbly_walls: { name: 'Wobbly Walls', desc: 'Organic cave-like walls with curved lines.' },
      portals: { name: 'Portals', desc: 'Wormholes connecting two corridors.' },
      key_and_gate: { name: 'Key & Gate', desc: 'Exit is blocked until the golden key is retrieved.' },
      inversion: { name: 'Inversion', desc: 'Controls are reversed!' },
      switches_and_barriers: { name: 'Switches', desc: 'Toggle barrier gates.' },
    },
  },
  ru: {
    appTitle: 'Maze Daily',
    dayLabel: 'День',
    timer: 'Время',
    pb: 'Рекорд',
    restart: 'Рестарт',
    splitsTitle: 'Тайм-сплиты',
    split25: '25% пути',
    split50: '50% пути',
    split75: '75% пути',
    splitFinish: 'Финиш',
    notReached: '--:--.--',
    settings: 'Настройки',
    stats: 'Статистика',
    help: 'Как играть',
    share: 'Поделиться',
    copied: 'Скопировано в буфер!',
    theme: 'Тема',
    darkTheme: 'Тёмная',
    lightTheme: 'Светлая',
    language: 'Язык',
    fireflyColor: 'Цвет светлячка',
    showSplits: 'Показывать сплиты',
    todayModifier: 'Модификатор дня',
    desktopControls: 'Используйте клавиши WASD или Стрелки для плавного движения.',
    mobileControls: 'Используйте виртуальный джойстик внизу экрана для перемещения.',
    winTitle: 'Лабиринт пройден!',
    newPB: 'НОВЫЙ ЛИЧНЫЙ РЕКОРД!',
    totalRuns: 'Всего попыток сегодня',
    bestTime: 'Лучшее время',
    historyTitle: 'Заезды за сегодня',
    replayTitle: 'Маршрут забега',
    privacyNote: 'Только в браузере. Без отслеживающих кук. Данные хранятся локально.',
    effects: {
      none: { name: 'Классика', desc: 'Чистый спидран без модификаторов.' },
      fog_of_war: { name: 'Туман войны', desc: 'Обзор ограничен радиусом вокруг светлячка.' },
      ice: { name: 'Лёд', desc: 'Скользкий пол и инерция при движении.' },
      fake_exits: { name: 'Ложные выходы', desc: '3 из 4 выходов — обманки! Найдите настоящий.' },
      wobbly_walls: { name: 'Кривые стены', desc: 'Органические пещерные стены с плавными изгибами.' },
      portals: { name: 'Порталы', desc: 'Червоточины для мгновенного перемещения.' },
      key_and_gate: { name: 'Ключ и Ворота', desc: 'Выход заблокирован, пока не найден золотой ключ.' },
      inversion: { name: 'Инверсия', desc: 'Направления управления перевернуты!' },
      switches_and_barriers: { name: 'Переключатели', desc: 'Переключают барьеры.' },
    },
  },
} as const;

export function formatTime(ms: number | null): string {
  if (ms === null) return '--:--.--';
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

export function formatDelta(current: number | null, pb: number | null): { text: string; isFaster: boolean } | null {
  if (current === null || pb === null) return null;
  const diff = current - pb;
  const isFaster = diff <= 0;
  const sign = isFaster ? '-' : '+';
  const absSec = (Math.abs(diff) / 1000).toFixed(2);
  return { text: `${sign}${absSec}s`, isFaster };
}
