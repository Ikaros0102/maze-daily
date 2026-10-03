export interface Point {
  x: number;
  y: number;
}

export interface GridCoord {
  col: number;
  row: number;
}

export interface CellWalls {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

export interface MazeCell {
  col: number;
  row: number;
  walls: CellWalls;
}

export interface MazeData {
  cols: number;
  rows: number;
  cells: MazeCell[][];
  start: GridCoord;
  exit: GridCoord;
  shortestPath: GridCoord[];
  checkpoints: SplitCheckpoint[];
}

export interface SplitCheckpoint {
  id: string;
  ratio: number;
  cell: GridCoord;
  reachedTimeMs: number | null;
  pbTimeMs: number | null;
}

export type EffectType =
  | 'none'
  | 'fog_of_war'
  | 'ice'
  | 'portals'
  | 'key_and_gate'
  | 'inversion'
  | 'fake_exits'
  | 'wobbly_walls'
  | 'switches_and_barriers';

export interface PortalPair {
  a: GridCoord;
  b: GridCoord;
}

export interface FakeExit {
  col: number;
  row: number;
  revealed: boolean;
}

export interface DailyEffectState {
  type: EffectType;
  enabled: boolean;
  fogRevealed?: boolean[][];
  portals?: PortalPair;
  keyPos?: GridCoord;
  gatePos?: GridCoord;
  hasKey?: boolean;
  isGateOpen?: boolean;
  isInverted?: boolean;
  fakeExits?: FakeExit[];
}

export type BreadcrumbPoint = [x: number, y: number, timeMs: number];

export interface RunRecord {
  id: string;
  date: string;
  seed: string;
  completedAt: string;
  durationMs: number;
  splits: number[];
  effect: EffectType;
  path: BreadcrumbPoint[];
}

export interface DailyStats {
  date: string;
  bestTimeMs: number | null;
  bestSplits: (number | null)[];
  totalRuns: number;
  history: RunRecord[];
}

export type ThemeMode = 'dark' | 'light';
export type LanguageMode = 'en' | 'ru';

export interface GameSettings {
  theme: ThemeMode;
  lang: LanguageMode;
  playerColor: string;
  showSplits: boolean;
}
