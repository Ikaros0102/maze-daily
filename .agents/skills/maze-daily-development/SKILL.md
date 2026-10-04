---
name: maze-daily-development
description: Guidelines, architecture patterns, and conventions for developing and extending the Maze Daily speedrunning game. Use when working on gameplay features, rendering, level generators, effects, accessibility, internationalization, or settings storage.
---

# Maze Daily Development Guide

This skill provides architecture guidelines and best practices for developing and maintaining the **Maze Daily** web game.

## Core Architecture Overview

Maze Daily is a deterministic daily maze speedrunning game built with **React 19**, **TypeScript**, and **Vite**.

```
src/
├── components/          # UI components (Header, Footer, SplitsPanel, ControlsWidget, Canvas, Joystick)
│   └── Modals/          # Modal dialogs (HelpModal, SettingsModal, StatsModal, WinModal, ReplayMap)
├── config/              # Game configuration (constants, effects, player palettes, storage keys)
├── core/                # Core algorithms and canvas rendering engine
│   ├── mazeGenerator.ts # Wilson's algorithm maze generator
│   ├── pathfinder.ts    # Shortest path & split checkpoint calculation (BFS/A*)
│   ├── physics.ts       # Sub-pixel movement, sliding collision response, corner easing
│   ├── renderer.ts      # HTML5 Canvas 2D multi-layer renderer
│   ├── effects.ts       # Daily gameplay modifiers
│   └── fogRenderer.ts   # Radial fog-of-war vision mask
├── hooks/               # Custom hooks (useGameLoop, useControls)
├── types/               # TypeScript interfaces and union types (game.ts)
└── utils/               # Helpers (date, storage, i18n, share, prng)
```

---

## 1. Deterministic Daily Seed System
- Every day uses a unique seed generated from the local calendar date (`YYYY-MM-DD`).
- All randomness is produced via mulberry32 PRNG (`src/utils/prng.ts`).
- Any new features that depend on procedural generation (e.g. key placement, portal locations, decoy exits) MUST use the seeded PRNG to ensure all players globally get the identical maze for that day.

---

## 2. Deterministic Shuffle Bag for Effects (`effectBag.ts`)
- Daily effects are randomized using a **Deterministic Shuffle Bag**:
  - Time is partitioned into cycles of length $N$ (where $N$ is the number of enabled effects).
  - Each enabled effect appears **exactly once** in every cycle (guaranteeing no droughts).
  - Seam repeat prevention: When generating cycle $C$, if its first effect matches the last effect of cycle $C-1$, it is swapped with another element in cycle $C$.
  - This guarantees that two consecutive days will **never** have the same effect.
  - The sequence is 100% deterministic and synchronized across all clients worldwide.

---

## 3. Multi-Language Localization (`i18n.ts`)
- Supported languages:
  - English (`en`)
  - Russian (`ru`)
  - Spanish (`es`)
  - Simplified Chinese (`zh`)
  - Japanese (`ja`)
  - German (`de`)
  - Turkish (`tr`)
  - Portuguese (`pt`)
- When adding new user-facing strings:
  1. Add the key and type definition to `TranslationContent` in `src/utils/i18n.ts`.
  2. Provide natural translations across all 8 languages in `TRANSLATIONS`.
  3. Never hardcode UI text inside React components.
  4. Keep `document.documentElement.lang` synced with `settings.lang`.

---

## 4. Persistent User Settings (`storage.ts`)
- Player preferences are stored in `localStorage` under `maze_daily_settings_v1`:
  - `theme`: `'dark' | 'light'`
  - `lang`: `LanguageMode`
  - `playerColor`: Hex color string
  - `showSplits`: `boolean` (toggle display of the split time tracker)
  - `showControls`: `boolean` (toggle display of controls helper block)
- Any new user setting must:
  1. Be added to `GameSettings` in `src/types/game.ts`.
  2. Have a default value in `getDefaultSettings()` in `src/utils/storage.ts`.
  3. Be saved on change using `saveSettings(next)`.

---

## 5. Viewport Layout Systems (Widescreen 16:9 / 21:9 & Portrait 9:16)
- **Desktop Widescreen Mode** (`aspectRatio > 1.05 && width >= 850px`, e.g. 16:9, 16:10, 21:9):
  - Uses CSS Grid with balanced 3-column architecture: `grid-template-columns: 1fr auto 1fr`.
  - Column 1: Empty balancer (`1fr`).
  - Column 2: Game canvas container (`.desktop-center`).
  - Column 3: Sidebar (`1fr`, `.desktop-sidebar-col`), containing `SplitsPanel` and `ControlsWidget` aligned left (20px from canvas).
  - **Dead-Center Guarantee**: Because columns 1 and 3 are both `1fr`, the canvas is always mathematically at the 50% horizontal center. Hiding or showing splits/controls never shifts the game by a single pixel.
- **Vertical / Portrait Mode** (`aspectRatio <= 1.05 || width < 850px`, e.g. 9:16 monitors, phones, tablets):
  - **Splits Panel**: Positioned in standard flow **above** the canvas as a compact horizontal bar (`isMobile={true}`), never overlapping canvas cells.
  - **Canvas**: Centered in the viewport.
  - **Controls / Joystick**: Placed below the canvas. Virtual joystick only renders for touch devices (`isTouchDevice`); non-touch vertical monitors display keyboard guide without joystick.

---

## 6. Accessibility & Screen Reader (Blind Mode Foundation)
- Semantic landmarks: `<header role="banner">`, `<main>`, `<footer role="contentinfo">`, `<section role="region">`.
- Interactive elements: All icon-only buttons must have `aria-label` matching their localized title.
- Dialogs: `ModalWrapper` uses `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`.
- Live announcements:
  - The live region `<div className="sr-only" role="status" aria-live="polite" aria-atomic="true">` announces milestones:
    - Checkpoint crossed: `"25% Way: 00:04.12"`
    - Victory: `"Maze Solved! 00:15.30"`
- Utility `.sr-only` class is available in `index.css` for visually-hidden text.
