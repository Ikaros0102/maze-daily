# 🌀 Maze Daily

**English Version** | [Русская версия](README.ru.md)

[🎮 Play Online](https://Ikaros0102.github.io/maze-daily/)

---

**Maze Daily** is a fast-paced, minimalist daily maze game with synchronized global procedural generation, high-precision continuous physics, and an advanced modular accessibility architecture tailored for players with disabilities (featuring hands-free head tracking and full-featured spatial audio navigation for blind and visually-impaired players).

---

## ✨ Key Features

- 🗓️ **Daily Maze Challenge:** A fresh, procedurally generated maze becomes available every midnight according to the player's local timezone.
- 🔒 **Deterministic Global Seed:** All players across the world compete on the identical daily maze layout and modifier configuration (powered by the Mulberry32 PRNG and decoupled random stream sequences).
- ⏱️ **Splits & Live Delta:** Real-time checkpoint tracking at 25%, 50%, 75%, and 100% with live delta comparison against your personal best (`+/-` diff).
- 🌪️ **Daily Modifiers:**
  - 🌫️ *Fog of War* — dynamic visibility radius focused around the firefly.
  - 🗝️ *Key & Gate* — find the hidden key in maze dead-ends before the exit portal unlocks.
  - 🌀 *Portals* — paired wormholes providing instantaneous teleportation between distant corridors.
  - 🔄 *Inversion* — inverted movement controls testing muscle memory and spatial orientation.
  - 🏁 *Fake Exits* — identify the true finish line among deceptive exits.
  - 🌊 *Living Walls* — organic, cavernous grottos and asymmetric wall formations.
- 📱 **Multi-Platform Controls:**
  - Desktop: Keyboard (`WASD`, arrow keys, with full multilingual keymap support).
  - Mobile & Touchscreens: Responsive virtual analog joystick with dynamic on-touch re-centering.
- 📊 **Local Stats & Replays:** Comprehensive 30-day run history, pace analysis, and full-resolution playback of your firefly trajectory over the maze map.
- 🌐 **Multilingual Localization (i18n):** Complete interface translation into 8 languages: English, Russian, Spanish, Simplified Chinese, Japanese, German, Turkish, and Portuguese.

---

## ♿ Modular Accessibility Architecture

Built with a commitment to inclusive gaming, Maze Daily features two independently loadable accessibility modules designed for hands-free and eyes-free play:

### 👤 1. Hands-Free Head Tracking Navigation
- **Powered by Computer Vision:** Utilizes Google's `@mediapipe/tasks-vision` (FaceLandmarker) model running directly in the browser.
- **Center Calibration:** Smooth 3-second calibration dialog capturing the user's resting posture.
- **Tremor Suppression:** Built-in 5% deadzone around the neutral point filters out involuntary head tremors and micro-movements.
- **Proportional Vector Input:** Nose-tip displacement directly drives the firefly velocity vector with zero physical touch required.
- **Resilient Fallback:** Graceful handling of missing webcams or denied camera permissions with localized error dialogs that preserve game state.

### 🎧 2. Spatial Audio Navigation & Blind Gaming
A complete, browser-native audio navigation engine utilizing the Web Audio API that enables visually-impaired and blind players to navigate and complete mazes entirely by ear:
- **BFS Spatial Panning:** Exit music and directional beacons dynamically rotate across the stereo field (`-1.0` to `+1.0`) pointing along the next step of the shortest Breadth-First Search path to the objective.
- **Proximity Attenuation ("Hot / Cold" Feedback):**
  - Moving closer along the optimal path keeps navigation audio and background music at full volume (100%).
  - Straying down dead-ends or incorrect corridors smoothly dims audio by 25% per step away from the goal (down to a minimum floor of 30%), signaling wrong turns.
  - Re-entering the correct path immediately restores audio volume to 100%.
- **Directional Acoustic Gestures:**
  - Step **UP** (`dy < 0`): ascending two-tone chime (650 Hz $\to$ 880 Hz, upward gesture ↗).
  - Step **DOWN** (`dy > 0`): descending bass tone (440 Hz $\to$ 260 Hz, downward gesture ↘).
  - Step **BACKWARD / Dead-End**: smooth lowpass filtration at 600 Hz.
- **Wall Collision Synthesis & Haptics:** Soft synthesized low-frequency thud (150 Hz swept to 40 Hz) paired with mobile haptic vibration (`navigator.vibrate`), protected by a strict $\ge$ 280 ms debounce cooldown to eliminate jitter when sliding along walls.
- **Dual-Phase Navigation for "Key & Gate" Modifiers:**
  - While the key remains uncollected, audio beacon and panning guide the player directly to the Key, routing around the impassable closed Gate.
  - Collecting the key triggers an ascending 4-note bell chime (C5 $\to$ E5 $\to$ G5 $\to$ C6), momentarily ducks background music, and seamlessly switches navigation targets to the Exit.
  - Active music stems are strictly bounded by overall maze completion percentage (Stem 1 before 25%, Stems 1 & 2 between 25% and 50%, etc.).
- **Dynamic Audio Packs (Sound Sets):**
  - 4 distinct soundscapes: *Classic*, *Organic*, *Synth*, and *Clockwork*.
  - Live, click-free 0.5-second crossfading when swapping sound sets during gameplay.
  - Independent Cache API storage buckets (`maze-pack-${packId}-v${version}`) with on-demand background downloading.
- **Audio Hotkeys:** `[` / `]` or `+` / `-` (10% step volume adjustments) and `M` (mute toggle) with audible feedback tones.
- **Screen Reader Announcements:** Full WAI-ARIA live region updates (`aria-live="polite"`) announcing milestone checkpoints, key collections, and win states in all 8 supported languages.

### 📦 3. Performance & Cache API (10-Day Retention TTL)
- Heavy assets (MediaPipe vision neural network, audio stems, sound set packs) are deferred and loaded on-demand only when activated in Settings.
- The initial production entry bundle remains ultralight (< 320 kB).
- Downloaded assets are preserved in Cache API buckets. If a module or pack has not been used for more than 10 days, it is automatically purged on application launch to respect device storage (while the player's active pack is strictly protected from eviction).

---

## 🛠️ Technology Stack

- **Framework:** [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Bundler:** [Vite](https://vitejs.dev/)
- **Rendering & Physics:** HTML5 Canvas 2D (subpixel wall sliding physics running at steady 60–120 FPS)
- **Audio Engine:** Web Audio API (procedural synthesis, biquad filtering, stereo panning, multi-stem crossfader)
- **Computer Vision:** `@mediapipe/tasks-vision`
- **Icons:** [Lucide React](https://lucide.dev/)
- **Celebration Effects:** [Canvas Confetti](https://www.kirilv.com/canvas-confetti/)

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) version 20 or higher
- `npm` package manager

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/Ikaros0102/maze-daily.git
   cd maze-daily
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Launch the development server:
   ```bash
   npm run dev
   ```
   Open the displayed URL in your browser (typically `http://localhost:5173/`).

### Building and Quality Verification
- **Production Build:**
  ```bash
  npm run build
  ```
- **Linting:**
  ```bash
  npm run lint
  ```
- **Automated Stress & Algorithmic Test Suites:**
  ```bash
  node --import ./tests/ts_resolver.mjs tests/audio_nav_key_gate_stress.mjs
  node --import ./tests/ts_resolver.mjs tests/audio_pack_cache_stress.mjs
  node tests/audio_nav_algo_stress.mjs
  ```
- **MIDI Stem Generators:**
  ```bash
  npm run generate:midi
  npm run generate:midi:organic
  npm run generate:midi:synth
  npm run generate:midi:clockwork
  ```

---

## 📂 Project Structure

```text
maze-daily/
├── public/                 # Static assets, web manifests, and audio pack stem files
│   └── audio/packs/        # Dynamic audio pack sound sets (classic, organic, synth, clockwork)
├── src/
│   ├── components/         # React UI components and accessible modal dialogs
│   │   ├── Controls/       # Virtual joystick and touch control overlays
│   │   └── Modals/         # Settings, head tracking calibration, stats, module download progress
│   ├── config/             # Game configuration, level parameters, and audio pack manifests
│   ├── core/               # Continuous physics, procedural maze generators, BFS pathfinder
│   ├── hooks/              # High-performance requestAnimationFrame loop, input listeners
│   ├── modules/            # On-demand modular features (Head Tracking, Audio Navigation)
│   │   ├── audioNav/       # Spatial beacon, stem music crossfader, collision synthesizer
│   │   └── headTracking/   # MediaPipe FaceLandmarker vision integration
│   ├── services/           # ModuleLoader service with Cache API isolation and 10-day TTL eviction
│   ├── types/              # TypeScript types (game state, settings, split checkpoints)
│   └── utils/              # Local storage adapters, 8-language i18n localization dictionaries
└── tests/                  # Headless stress tests for audio algorithms and Cache API
```

---

## 📄 License

This project is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** license.

- ✅ **You are free to:** Share, copy, redistribute, adapt, and build upon the material in any medium or format for non-commercial and educational purposes.
- ❗ **Under the following terms:** You must give appropriate credit (`@Ikaros0102`), provide a link to the original repository, and indicate if changes were made.
- ❌ **Commercial restrictions:** You may not use the material, source code, or audio assets for commercial purposes or monetization without prior explicit permission from the author.
