# Crown & Clan

A frontend-only isometric village strategy game inspired by the building, training, and raiding loop of Clash of Clans. Original generated artwork, Phaser 4, TypeScript, Vite, and a responsive DOM interface.

## Run

Requires Node 22.12+ (developed with Node 26).

```sh
npm ci
npm run dev
```

Open http://localhost:5173. The village begins with an established settlement, a trained army, and two brewed spells, so every core interaction is immediately available.

```sh
npm run build
npm run preview -- --port 4173
```

For preview, use http://127.0.0.1:4173. `dist/` is a self-contained static deployment. Serve it over HTTPS for offline support and safe session ownership (localhost is also supported). No backend, API keys, CDN dependencies, paid services, or runtime AI calls are required.

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

- Buildings run to level 4–12 depending on the type, and **nothing may exceed the Town Hall by more than one level**, so a Town Hall upgrade is what unlocks the next tier of everything else. The Town Hall also gates how many of each building you may own.
- Build and upgrade timers run from seconds to hours, and gem prices to finish follow the same shape Clash of Clans uses: a minute is trivial, an hour is cheap, a long upgrade is a real decision.
- Upgrade the laboratory, then open Research. Laboratory level N unlocks troop level N, up to **level 5**, each a permanent health and damage increase. Research completes while away and can be finished with gems.
- **Your legacy** collects the league banner, six lifetime statistics, and eight achievements that pay gems.

### Army

- Train five troops individually or five at a time. Camp capacity includes queued units, and extra completed barracks shorten training times. "Last army" replenishes a spent composition without duplicating ready or queued troops.
- **Balloons fly.** They drift straight over walls and buildings, ignore pathing entirely, and prefer defenses. Only air-capable defenses can shoot them — and when one is shot down it detonates, damaging whatever it was over.
- **Air Defenses** hit hard but are blind to the ground. Cannons and mortars are ground-only. Archer towers hit both.
- Build a **Spell Factory** to brew Rage, Healing, and Lightning. Its level is how many spells you can carry.

### Raids

- Attack opens the 12-stage campaign. Every raid starts with a **30-second scouting phase**; the battle clock only starts when you deploy or when scouting runs out.
- A continuous **red boundary** is drawn on the grass around every tile you may not deploy on.
- Tap to deploy one troop, **hold and drag to spread a line of troops**, or double-tap to commit five at once. Keys 1–5 select troops, 6–8 select spells. A quick drag still pans the camera.
- Select a spell and tap anywhere — including inside the base. Rage boosts damage and speed, Healing restores troops standing in it, Lightning damages every building in a small radius instantly.
- The destruction bar is marked at the 50%, Town Hall, and 100% star thresholds. Loot bars show what you have taken against what is there.
- Surrender asks for confirmation and keeps the result and the loot already taken.
- Deployed troops and cast spells are consumed; undeployed ones remain in your village. Closing the browser during a raid forfeits them.

### Saving

- Only one tab can play a village at a time. A second tab waits until the first closes, then loads the latest save.
- Progress saves in IndexedDB with a localStorage backup. Settings includes export/import; importing replaces the current village. Version 1 villages are migrated on load.
- Resource accumulation while away is capped at 8 hours and by collector storage.

## What is implemented

- 14 building types plus walls, across level ceilings of 4 to 12, gated by Town Hall level and count.
- Building placement by drag or tap, relocation, a full edit mode with undo/redo and three saved layouts, builder reservations, construction, upgrades, collection, resource storage, and camp capacity.
- Five troops including a flying unit that detonates when shot down, three spells, a two-layer targeting model (ground / air / both), four-frame animation, five research levels, batch training, spell brewing, and army replenishment.
- A* navigation with wall breaking for ground troops, straight-line flight for air troops, deterministic crowd separation, splash damage, defense fire, destruction, and campaign progress.
- 12 independently authored campaign layouts with escalating defenses and air defenses from stage 5, tactical previews, and suggested army sizes.
- Bottom-sheet shop and army drawers, an anchored building card, a building info sheet with before/after stats, a scouting phase, a star-marked destruction bar, loot bars, drag-deploy, and a surrender confirmation.
- A first-run coaching sequence, a player profile with lifetime statistics, eight achievements, wall runs, and feedback that follows the action: collected resources fly to their counter, a falling Town Hall shakes the screen, and the victory tally counts up.
- Responsive HUD, campaign, help, persistent quest rewards, settings, reduced motion, generated sound effects, and optional ambient tones.
- Automatic saves, version-1 migration, exclusive tab ownership, validated import/export, self-hosted fonts, optimized WebP assets, and production offline caching.

## Architecture

`src/game/data.ts` is the catalog: buildings, troops, spells, level ceilings, Town Hall gates, and the timer, price, and gem curves. `src/game/model.ts` owns serializable state and gameplay rules, including the air layer, spell auras, edit-mode history, and a combat simulation at a fixed 20 Hz. `src/game/campaign.ts` owns enemy blueprints and stage tuning. `src/game/scene.ts` owns Phaser rendering, animation, camera, and input — including the gesture classifier that decides whether a drag pans, deploys troops, or moves a building. `src/ui/hud.ts` owns DOM drawers, dialogs, and the HUD. `src/game/save.ts` validates, migrates, and persists saves. `src/game/session.ts` prevents concurrent writers using the browser Web Locks API. No Phaser objects enter saved data.

In development, `window.__game` exposes the model and scene, and `window.advanceTime(ms)` advances simulation for tests. `window.render_game_to_text()` provides a compact structured snapshot in both builds.

## Verification

```sh
npm test
npx playwright install chromium webkit
npm run test:e2e
npm run build
# With the preview server running:
node scripts/production-check.mjs
```

46 simulation and save tests cover placement collisions, construction, upgrades, builder reservation, caps, training, save validation and version-1 migration, pathfinding, battle completion, deployment, campaign unlocks, research, batch training, the scouting phase, the deployment boundary, air/ground targeting in both directions, walls that stop ground troops and not balloons, spell brewing limits, each spell's effect, aura expiry, Town Hall level and count gating, the timer and gem curves, edit-mode drag/undo/redo (one entry per drag), saved layouts, wall runs, balloon detonation, five-level research, tutorial counters, and a 144-battle matrix across twelve stages, three armies, and four approaches.

23 browser tests exercise real menus and pointer input: first-run coaching and its target ring, wall runs, drawer placement by both tap and drag, drag-deploy, double-tap squads, the scouting phase, spell casting, the surrender confirmation, the info sheet's before/after table, edit-mode dragging with undo and layout saving, Town Hall gating in the shop, reload persistence, mobile and landscape layout, battle results, focus handling, camera controls, research, tab handoff, graphics-context loss/recovery, and twenty consecutive raids. Production smoke checks cover Chromium, WebKit, and offline reload.

Screenshots and reports are written to `output/playtest/` (not shipped). See `docs/QA.md` for verified coverage and remaining release limits.

## Assets

Source artwork and generation records are in `art/source/` and `docs/ASSETS.md`. Optimized assets live in `public/assets/`. Rebuild them with `npm run assets`. The normal build does not regenerate artwork or call an image service.

The air-layer and spell artwork is **derived** from the existing shipped art by `scripts/derived-assets.mjs`: the Air Defense is the mortar recoloured to cold steel, the Spell Factory is the laboratory recoloured to arcane magenta, and the Balloon is the elixir storage sphere isolated from its base, recoloured warm, and hung over a drawn basket. Every step is a deterministic transform with no image service, so re-running produces byte-identical files (`output/assets-before.sha` and `output/assets-after.sha` are the proof).

## Current scope

This is a complete playable local game loop, not a full commercial Clash of Clans content replacement. It has no server-authoritative multiplayer, accounts, clans, matchmaking, purchases, or cloud sync. Local clocks and saves are intentionally user-controlled. Levels 1–4 share base artwork; level 5 and above use a separate set. Units have four-frame animation and simple attack feedback rather than full directional attack/death animation sets. Training times are deliberately kept short even though build, upgrade, and research timers were stretched, so the raid loop stays testable in a single sitting. Physical iOS/Android device performance, multi-hour sleep/resume endurance, broader army-composition balance testing with spells and air troops, and accessibility review remain release gates before a public production launch.
