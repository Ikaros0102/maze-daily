import type { EffectType } from '../types/game';

export interface EffectMeta {
  type: EffectType;
  enabled: boolean;
  icon: string;
  nameKey: string;
  descriptionKey: string;
}

export const GAME_CONFIG = {
  version: 'v1',
  maze: {
    cols: 30,
    rows: 30,
    wallThicknessRatio: 0.22,
  },
  player: {
    baseSpeedCellsPerSecond: 4.0,
    sizeRatio: 0.25,
    glowRadiusMultiplier: 2.4,
    defaultColor: '#00f0b5',
    colorPalette: [
      '#00f0b5', // Teal / Cyan (Default)
      '#38bdf8', // Sky Blue
      '#a855f7', // Purple
      '#f43f5e', // Rose / Neon Pink
      '#f59e0b', // Amber / Gold
      '#22c55e', // Emerald Green
    ],
  },
  splits: [0.25, 0.5, 0.75],
  samplingRateHz: 10,
  fog: {
    sightRadiusCells: 2.5,
    ambientAlpha: 0.18,
  },
  ice: {
    friction: 0.985,
    acceleration: 0.08,
  },
  storageKeys: {
    settings: 'maze_daily_settings',
    historyPrefix: 'maze_daily_stats_',
  },
} as const;

export const AVAILABLE_EFFECTS: EffectMeta[] = [
  {
    type: 'none',
    enabled: true,
    icon: '⚡',
    nameKey: 'effects.none.name',
    descriptionKey: 'effects.none.desc',
  },
  {
    type: 'fog_of_war',
    enabled: true,
    icon: '🌫️',
    nameKey: 'effects.fog.name',
    descriptionKey: 'effects.fog.desc',
  },
  {
    type: 'ice',
    enabled: false,
    icon: '❄️',
    nameKey: 'effects.ice.name',
    descriptionKey: 'effects.ice.desc',
  },
  {
    type: 'fake_exits',
    enabled: true,
    icon: '🚪',
    nameKey: 'effects.fake_exits.name',
    descriptionKey: 'effects.fake_exits.desc',
  },
  {
    type: 'wobbly_walls',
    enabled: true,
    icon: '〰️',
    nameKey: 'effects.wobbly_walls.name',
    descriptionKey: 'effects.wobbly_walls.desc',
  },
  {
    type: 'portals',
    enabled: true,
    icon: '🌀',
    nameKey: 'effects.portals.name',
    descriptionKey: 'effects.portals.desc',
  },
  {
    type: 'key_and_gate',
    enabled: true,
    icon: '🗝️',
    nameKey: 'effects.key.name',
    descriptionKey: 'effects.key.desc',
  },
  {
    type: 'inversion',
    enabled: true,
    icon: '🔄',
    nameKey: 'effects.inversion.name',
    descriptionKey: 'effects.inversion.desc',
  },
  {
    type: 'switches_and_barriers',
    enabled: false,
    icon: '🎛️',
    nameKey: 'effects.switches.name',
    descriptionKey: 'effects.switches.desc',
  },
];

export const getEnabledEffects = (): EffectMeta[] =>
  AVAILABLE_EFFECTS.filter((e) => e.enabled);
