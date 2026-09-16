# 👑 Crown & Clan

> A snappy, zero-backend isometric village strategy game built from scratch with TypeScript and Phaser 4. Build your village, train armies, brew spells, and raid in your browser.

[![Live Demo](https://img.shields.io/badge/Play_Live-coc.teozeng.dev-gold?style=for-the-badge&logo=google-chrome)](https://coc.teozeng.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Phaser](https://img.shields.io/badge/Phaser-4.2-orange?style=flat-square)](https://phaser.io/)
[![Vite](https://img.shields.io/badge/Vite-8.3-purple?style=flat-square&logo=vite)](https://vitejs.dev/)
[![Offline PWA](https://img.shields.io/badge/PWA-Offline_Ready-green?style=flat-square)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)

**Crown & Clan** brings the classic isometric strategy loop—village construction, resource management, tactical troop training, and raiding—into a lightweight, installable web app.

No backend servers. No microtransactions. No sign-ups or tracking. Just pure browser-native gameplay with a deterministic 20 Hz combat engine and instant offline support.

🎮 **[Play the Live Demo →](https://coc.teozeng.dev)** *(Mirror: [coc-teozeng.web.app](https://coc-teozeng.web.app))*

---

## ✨ Features

### 🏰 Village Building & Base Design
- **Fluid Isometric Grid:** Smooth panning (WASD / drag) and zooming with responsive touch and mouse controls.
- **Intuitive Base Builder:** Drag buildings from the bottom drawer or tap to place. Continuous wall placement automatically re-arms as you lay defenses.
- **Full Edit Mode:** Move existing buildings freely with **Undo / Redo** (`Ctrl/⌘ + Z`) and switch between three saved layout presets.
- **Deep Progression:** Town Hall tiers 1–18 gate 30 buildable types — defenses, resource collectors, traps, walls, the Hero Hall and the Town Hall 9 X-Bow — every count, gate and price taken from the original game's own tables.
- **Offline Economy:** Collectors steadily accumulate resources up to 8 hours while away.
- **Complete Asset Library:** Open `/asset-catalog.html` to browse every official portrait through Town Hall 18, searchable by level and category. Source provenance and rebuild commands are in [the full-client reference](reference/full-client/README.md).

### ⚔️ Tactical Combat & Deterministic Raids
- **10 Distinct Troops:** Barbarians, Archers, Giants, Goblins, Wall Breakers, Balloons, Wizards, Healers, Dragons, and P.E.K.K.A.
- **Spell Factory:** Brew **Lightning**, **Healing**, and **Rage** spells to turn the tide of battle.
- **Barbarian King:** Summon your royal hero with the **Barbarian Puppet & Rage Vial** abilities for burst recovery and raging reinforcements. He upgrades to level 110 behind a Town Hall 18 Hero Hall.
- **Smart AI & Pathing:** Dynamic A* pathfinding for ground units, straight-line flight for air troops, wall-breaching logic, and targeted defense priorities.
- **Responsive Deployment:** Tap single units, hold and drag to deploy lines of troops, or double-tap to commit squads of five.
- **All 90 Campaign Villages:** Raid the complete native Goblin Map, from Payback to M.O.M.M.A's Madhouse, with Eagle Artillery, Scattershots, Monoliths, Spell Towers, Tornado and Freeze Traps, Goblin Halls, armed Builder's Huts and Clan Castle defenders.
- **Safe Practice Mode:** Attack a clone of your own village anytime to test defense layouts with zero troop costs.

### 📼 Interactive Replay Engine
- **Deterministic 20 Hz Simulation:** Attacks are recorded as lightweight input streams.
- **Full Playback Controls:** Scrub timelines, jump ±10s, adjust speed (1×, 2×, 4×), and pause anytime.
- **Shareable Battles:** Export standalone replay files or load shared matches directly without affecting your save.

### ⚡ Client-Side Architecture & Privacy
- **100% Serverless:** Runs entirely in the client with IndexedDB persistence and localStorage backups.
- **Web Locks Tab Ownership:** Gracefully prevents multi-tab race conditions and save corruptions.
- **Instant PWA:** Fully cached service worker enables playing offline on mobile and desktop.

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) 22.12+ (tested through Node 26)

### Local Development

```sh
# Clone & install dependencies
git clone https://github.com/Sir-Teo/web-coc.git
cd web-coc
npm ci

# Start Vite dev server
npm run dev
```

Visit `http://localhost:5173` to start playing.

### Production Build & Preview

```sh
# Typecheck, bundle, and generate service worker
npm run build

# Preview production build locally
npm run preview -- --port 4173
```

Open `http://127.0.0.1:4173` to test the offline-capable production build.

---

## 🎮 Controls & Shortcuts

| Action | Control / Shortcut |
| :--- | :--- |
| **Pan Camera** | Drag, `WASD`, or `Arrow Keys` |
| **Zoom** | Mouse wheel, pinch, or UI zoom buttons |
| **Deploy Troops** | Tap, hold-drag for lines, or double-tap for squads of 5 |
| **Troop Hotkeys** | `1`–`7`, `Q`, `W`, `E` (in Barracks unlock order) |
| **Spell Hotkeys** | `8` (Lightning), `9` (Healing), `0` (Rage) |
| **Barbarian King** | `H` to select or trigger ability |
| **Edit Mode** | Pencil icon on left rail (`Ctrl/⌘ + Z` to Undo) |
| **Developer Tools** | `Ctrl/⌘ + Shift + D` (or launch with `?devtools=1`) |

---

## 🛠️ Architecture & Tech Stack

- **Engine:** [Phaser 4](https://phaser.io/) (Canvas/WebGL rendering, camera, input gestures)
- **Language:** [TypeScript](https://www.typescriptlang.org/) (Strictly typed state models & simulation)
- **Bundler:** [Vite](https://vitejs.dev/) with automated service-worker manifest generation
- **UI & Icons:** Vanilla DOM bottom sheets + [Lucide](https://lucide.dev/) + self-hosted fonts
- **Storage:** IndexedDB with automated schema migrations + Web Locks API

### Key Source Modules

```
src/
├── game/
│   ├── model.ts           # Core game state & 20 Hz deterministic combat simulation
│   ├── scene.ts           # Phaser scene, isometric projection, camera & gesture classifier
│   ├── data.ts            # Stats, costs, upgrade curves, and unit catalogs
│   ├── replay.ts          # Deterministic input capture, validation, and playback
│   ├── native-campaign.ts # Campaign level parser and stage validator
│   ├── save.ts            # IndexedDB persistence & save migration
│   └── session.ts         # Single-tab session lock via Web Locks API
└── ui/
    └── hud.ts             # Bottom drawers, modal dialogs, and DOM overlays
```

---

## 🧪 Testing & Quality

Crown & Clan maintains a comprehensive automated testing suite:

```sh
# Run unit & simulation tests (Vitest)
npm test

# Run Playwright end-to-end browser tests
npm run test:e2e

# Run production smoke check (Chromium & WebKit)
npm run test:production
```

- **Simulation Tests:** Verify A* navigation, air/ground targeting, splash damage, build timers, economy curves, and save schema migrations across hundreds of automated battle scenarios.
- **E2E Browser Tests:** Exercise real pointer interactions, gestures, building drawers, replay seeking, mobile viewports, and offline reload resilience.

---

## 📖 Deep Dives & Documentation

Looking for implementation details, formulas, or art generation prompts? Explore the [`docs/`](docs/) directory:
- [Asset Guide & Art Pipeline](docs/ASSETS.md)
- [Campaign Rules & Fidelity](docs/CAMPAIGN-RULES.md)
- [Replay System Architecture](docs/REPLAYS.md)
- [Developer Tools API](docs/DEVELOPER-TOOLS.md)
- [Hero & Ability Progression](docs/HERO-PROGRESSION.md)
- [Heroes, Equipment & Pets](docs/NATIVE-HEROES.md)
- [Town Hall 11–18 Defenses](docs/NATIVE-DEFENSES.md)
- [Defense & Trap Progression](docs/DEFENSE-PROGRESSION.md)
- [Town Hall Tiers](docs/TOWNHALL-TIERS.md)

---

## 📜 License & Disclaimers

Crown & Clan is an independent fan project built for educational and portfolio purposes. Clash of Clans and its related assets and trademarks are property of Supercell.
