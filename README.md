# Crown & Clan

A frontend-only isometric village strategy game inspired by the building, training, and raiding loop of Clash of Clans. Original generated artwork, Phaser 4, TypeScript, Vite, and a responsive DOM interface.

## Run

Requires Node 22.12+ (developed with Node 26).

```sh
npm ci
npm run dev
```

Open http://localhost:5173. New villages start at Town Hall 2 with Swordsmen and Archers. Upgrade the Barracks to unlock more troops, and build the Spell Factory after reaching Town Hall 5. Existing villages retain their buildings and prepared armies.

```sh
npm run build
npm run preview -- --port 4173
```

For preview, use http://127.0.0.1:4173. `dist/` is a self-contained static deployment. Serve it over HTTPS for offline support and safe session ownership (localhost is also supported). No backend, API keys, CDN dependencies, paid services, or runtime AI calls are required.

## Deploy

The game is hosted on Firebase Hosting as the `coc-teozeng` site in the `personal-website-3bc37`
project, served at https://coc-teozeng.web.app and https://coc.teozeng.dev.

Pushing to `main` builds, runs simulation tests, Chromium gameplay checks, WebKit visual checks,
and production/offline smoke checks before publishing through
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). A pull request runs the same build
and test steps but does not publish. Manual workflow runs also publish only from `main`.
Pull-request checks cannot cancel an active main-branch release. The workflow
needs one repository secret, `FIREBASE_TOKEN`, generated with `firebase login:ci`.

To publish by hand:

```sh
npm run deploy
```

Both paths pin the deploy to the `coc-teozeng` site, so neither can overwrite the other sites in the
same project. The local script runs the CLI through `npx` because the machine-global
`firebase-tools` is installed under an older Node and fails on current runtimes.

Assets under `assets/` are content-hashed and cached for a year; `index.html` and `sw.js` are sent
with `no-cache` so a new release is picked up on the next visit.

## Play

### Village

- Drag or use WASD / arrow keys to pan. Scroll, pinch, or use the camera buttons to zoom.
- **Shop** and **Army** open as bottom drawers. The village stays visible and clickable underneath them.
- **Drag a building out of the shop drawer** and drop it on clear ground, or tap its price to pick it up and then tap the map. A green footprint means the tile is free. Escape cancels.
- Select a building for Info, Move, Upgrade, and Collect. The card is anchored to the building it describes.
- **Info** shows the full stat sheet and a before → after comparison of what the next level buys, with its price, its build time, and how many builders are free.
- **Edit mode** (pencil, left rail) lets you drag anything already built. It has undo, redo, Ctrl/⌘+Z, and three saved layouts you can restore at any time. A whole drag is one undo step.
- Walls stay in hand: place one and the tool re-arms so you can lay a run in a single pass. Escape puts it down.
- Click resource bubbles or Collect to gather gold and elixir. What you collect flies into the counter it lands in, and a store at capacity says so instead of silently swallowing collections.
- A first-run **coach** walks you through collect → build → train → raid, ringing the control each step is about. It reads its progress from counters in the save, so a village part-way through the game opens with nothing left to teach. Skip dismisses it for good.

### Progression

- Each building has explicit Town Hall level limits. The Progression screen shows those limits alongside troop and spell unlocks; building information previews what the next facility upgrade unlocks. The Town Hall also gates building counts.
- Build and upgrade timers run from seconds to hours, and gem prices to finish follow the same shape Clash of Clans uses: a minute is trivial, an hour is cheap, a long upgrade is a real decision.
- Upgrade the laboratory, then open Research. Laboratory level N unlocks troop level N, up to **level 5**, each a permanent health and damage increase. Research completes while away and can be finished with gems.
- **Your legacy** collects the league banner, six lifetime statistics, and eight achievements that pay gems.

### Army

- Unlock seven troop types through Barracks levels 1–7, then prepare them individually or five at a time, **free and instantly**. Lightning, Healing and Rage unlock at Spell Factory levels 1, 2 and 3. Remove individual troops/spells or clear the army to change strategy. Whole batches must fit camp capacity. "Last army" replenishes the previous campaign composition without duplicating ready units.
- **Quick armies** stores three named troop-and-spell compositions. Save your current army, then use a preset in one tap. Both housing limits and ready facilities are checked before changing anything.
- **Balloons fly.** They drift straight over walls and buildings, ignore pathing entirely, and prefer defenses. Only air-capable defenses can shoot them — and when one is shot down it detonates, damaging whatever it was over.
- **Goblins** sprint for resource buildings, including the Town Hall, and deal double damage to them. Loot is released as resource buildings take damage, so a quick resource raid can pay without a star.
- **Wall Breakers** seek walls blocking the path to buildings, ignoring isolated wall pieces. They sacrifice themselves to open a breach, dealing 40× damage to walls and a smaller blast if defeated early. Both new troops can be trained, researched, and replenished with Last army.
- Tap a troop’s role badge in the Army drawer to see its full stats, favorite target, and a tactical tip.
- **Air Defenses** hit hard but are blind to the ground. Cannons and mortars are ground-only. Archer towers hit both.
- Build a **Spell Factory** to prepare Rage, Healing, and Lightning for free. Rage and Healing take two housing spaces; Lightning takes one. The current factory provides two spaces per level.

### Heroes

- Build a **Hero Hall at Town Hall 4** to unlock the Barbarian King. Open **Army → Heroes** for stats and upgrades.
- The King uses no army housing and returns at full health for each attack. Select his card or press **H**, then tap outside the deployment boundary.
- At Town Hall 7, use his card or **H** again for **Iron Fist**: healing, rage, and four summoned swordsmen, once per attack. It also activates automatically at low health.
- Dark Elixir Drills and Storage unlock at Town Hall 7. Collect dark elixir to upgrade the King using one builder. Army → Progression shows building unlocks and level caps.
- This is the first hero implementation; equipment, other heroes, and defending heroes remain unfinished. See [docs/HERO-PROGRESSION.md](docs/HERO-PROGRESSION.md).

### Raids

- **Practice** in the Army drawer or campaign screen attacks a copy of your own village with its real layout and defense levels. It spends no troops or spells and awards no loot, trophies, or campaign stars. Change your defenses and try again.
- **Battle log** on the left rail keeps your twenty most recent results and deployed compositions, including practice. Results offer a repeat-attack button; campaign repeats prepare the last army first.
- Attack opens the 12-stage campaign. Every raid starts with a **30-second scouting phase**; the battle clock only starts when you deploy or when scouting runs out.
- Tap an enemy defense to inspect its range without deploying. A mortar’s orange inner ring shows its 4-tile blind spot. Mortar shells travel for 1.15 seconds and land at a fixed point; moving troops can dodge them. Defenses keep their target while it remains alive and in range, so Giants can draw fire for fragile troops.
- A continuous **red boundary** is drawn on the grass around every tile you may not deploy on.
- Tap to deploy one troop, **hold and drag to spread a line of troops**, or double-tap to commit five at once. Keys 1–7 select troops; 8, 9, and 0 select Rage, Healing, and Lightning. The cards display their shortcuts. A quick drag still pans the camera.
- Select a spell and tap anywhere — including inside the base. Rage boosts damage and speed, Healing restores troops standing in it, Lightning damages every building in a small radius instantly.
- The destruction bar is marked at the 50%, Town Hall, and 100% star thresholds. Loot bars show what you have taken against what is there.
- Surrender asks for confirmation and keeps the result and the loot already taken.
- In campaign attacks, deployed troops and cast spells are consumed; undeployed ones remain in your village. Closing the browser during a raid forfeits them.

### Saving

- Only one tab can play a village at a time. A second tab waits until the first closes, then loads the latest save.
- Progress saves in IndexedDB with a localStorage backup. Settings includes export/import; importing replaces the current village. Version 1 and older version 2 villages are migrated on load and import. Newly added troop types begin at zero in existing saves, preserving their army and resources. Old paid training queues complete once immediately on load. Army presets and battle history are included in backups.
- Resource accumulation while away is capped at 8 hours and by collector storage.

## What is implemented

- 23 building types including walls, traps, Hero Hall, and dark elixir facilities, with explicit Town Hall 1–8 level ceilings.
- Building placement by drag or tap, relocation, a full edit mode with undo/redo and three saved layouts, builder reservations, construction, upgrades, collection, resource storage, and camp capacity.
- Seven troops including a flying unit that detonates when shot down, three spells, a two-layer targeting model (ground / air / both), four-frame animation, five research levels, instant army preparation, spell housing, editable compositions, saved presets, and army replenishment.
- A* navigation with wall breaking for ground troops, straight-line flight for air troops, deterministic crowd separation, splash damage, defense fire, destruction, and campaign progress.
- Bombs, Giant Bombs, Air Bombs, and Spring Traps with concealment, activation effects, one use per attack, and fresh arming on repeat. Wizard Towers splash either ground or air clusters.
- Practice attacks against your own village, persistent battle results and deployed compositions, and one-button repeat attacks.
- 12 independently authored campaign layouts with escalating defenses and air defenses from stage 5, tactical previews, and suggested army sizes.
- Bottom-sheet shop and army drawers, an anchored building card, a building info sheet with before/after stats, a scouting phase, a star-marked destruction bar, loot bars, drag-deploy, and a surrender confirmation.
- A first-run coaching sequence, a player profile with lifetime statistics, eight achievements, wall runs, and feedback that follows the action: collected resources fly to their counter, a falling Town Hall shakes the screen, and the victory tally counts up.
- Responsive HUD, campaign, help, persistent quest rewards, settings, reduced motion, generated sound effects, and optional ambient tones.
- Automatic saves, version-1 migration, exclusive tab ownership, validated import/export, self-hosted fonts, optimized WebP assets, and production offline caching.

## Architecture

`src/game/data.ts` is the catalog: buildings, troops, spells, level ceilings, Town Hall gates, and the timer, price, and gem curves. `src/game/model.ts` owns serializable state and gameplay rules, including the air layer, spell auras, edit-mode history, and a combat simulation at a fixed 20 Hz. `src/game/campaign.ts` owns enemy blueprints and stage tuning. `src/game/scene.ts` owns Phaser rendering, animation, camera, and input — including the gesture classifier that decides whether a drag pans, deploys troops, or moves a building. `src/ui/hud.ts` owns DOM drawers, dialogs, and the HUD. `src/game/save.ts` validates, migrates, and persists saves. `src/game/session.ts` prevents concurrent writers using the browser Web Locks API. No Phaser objects enter saved data.

In development, `window.__game` exposes the model and scene, and `window.advanceTime(ms)` advances simulation for tests. `window.render_game_to_text()` provides a compact structured snapshot in both builds.

## Developer tools

Open `http://localhost:4173/?devtools=1` (or port 5173), then click **DEV** or press **Ctrl/⌘ Shift D**. Edit resources, troops and spells; jump progression; finish timers; test battle outcomes; and restore a checkpoint. Changes save normally. The toolbox is opt-in and limited to development/local previews. See [docs/DEVELOPER-TOOLS.md](docs/DEVELOPER-TOOLS.md) for controls and the `window.__dev` API.

## Verification

```sh
npm test
npx playwright install chromium webkit
npm run test:e2e
npm run build
# Starts and stops its own production preview on an isolated local port:
npm run test:production
# With the preview server running:
node scripts/production-check.mjs
```

87 simulation and save tests cover placement collisions, construction, upgrades, builder reservation, caps, training, save validation and version-1 migration, pathfinding, battle completion, deployment, campaign unlocks, research, batch training, the scouting phase, the deployment boundary, air/ground targeting in both directions, walls that stop ground troops and not balloons, spell brewing limits, each spell's effect, aura expiry, Town Hall level and count gating, the timer and gem curves, edit-mode drag/undo/redo (one entry per drag), saved layouts, wall runs, balloon detonation, five-level research, tutorial counters, and a 144-battle matrix across twelve stages, three armies, and four approaches.

38 browser tests exercise real menus and pointer input: first-run coaching and its target ring, wall runs, drawer placement by both tap and drag, drag-deploy, double-tap squads, the scouting phase, spell casting, the surrender confirmation, the info sheet's before/after table, edit-mode dragging with undo and layout saving, Town Hall gating in the shop, reload persistence, mobile and landscape layout, battle results, focus handling, camera controls, research, tab handoff, graphics-context loss/recovery, and twenty consecutive raids. Production smoke checks cover Chromium, WebKit, offline reload, hero save import/upgrades, and actual hero deployment/ability controls. Run `node scripts/hero-production-check.mjs` with the development and production-preview servers running for the hero checks.

Screenshots and reports are written to `output/playtest/` (not shipped). The specialist tests also cover target preferences, wall breaches, one-time death bombs, mortar blind spots, delayed splash and dodging, target retention, resource loot, specialist research/retraining, seven troop hotkeys, mobile tray scrolling, defense inspection, and older-save import. See `docs/QA.md` for verified coverage and remaining release limits.

## Assets

Hero and dark elixir sprite sources and generation prompts are in [docs/HERO-ASSETS.md](docs/HERO-ASSETS.md). Rebuild them with `node scripts/hero-assets.mjs`.

Original defense sprites, source paths, and built-in generation prompts are recorded in [docs/DEFENSE-ASSETS.md](docs/DEFENSE-ASSETS.md). Rebuild the five WebP sprites with `node scripts/defense-assets.mjs`.

Goblin and Wall Breaker sources, shipped paths, and exact built-in generation prompts are recorded in [docs/RAIDING-ASSETS.md](docs/RAIDING-ASSETS.md). Rebuild their WebP files with `node scripts/raiding-assets.mjs`.

Source artwork and generation records are in `art/source/` and `docs/ASSETS.md`. Optimized assets live in `public/assets/`. Rebuild them with `npm run assets`. The normal build does not regenerate artwork or call an image service.

The Balloon, Air Defense, and Spell Factory use original generated sprites, including distinct upgraded building variants. Sources, exact built-in prompts, transparency checks, and rebuild instructions are in [docs/AIR-MAGIC-ART.md](docs/AIR-MAGIC-ART.md). `scripts/air-magic-assets.mjs` produces the six versioned WebPs and a stable-scale Balloon animation strip. Earlier derived art remains preserved; the three spell vials still use `scripts/derived-assets.mjs`. Asset rebuilds are deterministic and need no image service.

## Current scope

This is a complete playable local game loop, not a full commercial Clash of Clans content replacement. It has no server-authoritative multiplayer, accounts, clans, matchmaking, purchases, or cloud sync. Local clocks and saves are intentionally user-controlled. Levels 1–4 share base artwork; level 5 and above use a separate set. All seven troops now have four-frame movement or float strips, including separate Goblin and Wall Breaker walking atlases with planted idle poses. Their original portraits remain in the HUD. Full directional attack/death animation sets remain future work. Army preparation is free and instant, matching the modern direction of the original game. Build, upgrade, and research timers still run; their progression and economy remain simplified. Physical iOS/Android device performance, multi-hour sleep/resume endurance, broader army-composition balance testing with spells and air troops, and accessibility review remain release gates before a public production launch.

The experience inventory and next implementation priorities are tracked in [docs/EXPERIENCE-PARITY.md](docs/EXPERIENCE-PARITY.md). Additional heroes, equipment, the full content roster, online defense/matchmaking, and clan systems are still missing; the battle log does not yet support replay playback.
