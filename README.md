# Crown & Clan

A frontend-only isometric village strategy game inspired by the building, training, and raiding loop of Clash of Clans. Phaser 4, TypeScript, Vite, and a responsive DOM interface. Artwork combines original generated assets with source-attributed native reconstructions documented in [the asset guide](docs/ASSETS.md).

## Run

Requires Node 22.12+ (developed with Node 26).

```sh
npm ci
npm run dev
```

Open http://localhost:5173. New villages start at Town Hall 2 with Barbarians and Archers. Upgrade the Barracks to unlock more troops, and build the Spell Factory after reaching Town Hall 5. Existing villages retain their buildings and prepared armies.

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

- Unlock ten troop types through Barracks levels 1–10, then prepare them individually or five at a time, **free and instantly**. Lightning, Healing and Rage unlock at Spell Factory levels 1, 2 and 3. Remove individual troops/spells or clear the army to change strategy. Whole batches must fit camp capacity. "Last army" replenishes the previous campaign composition without duplicating ready units.
- The catalog follows facility unlock order. Troop and spell housing controls jump directly to each section; locked portraits remain inspectable. Home trays show prepared units, and battle trays keep only carried units, including their depleted cards.
- **Quick armies** stores three named troop-and-spell compositions. Save your current army, then use a preset in one tap. Both housing limits and ready facilities are checked before changing anything.
- **Balloons fly.** They drift straight over walls and buildings, ignore pathing entirely, and prefer defenses. Only air-capable defenses can shoot them — and when one is shot down it detonates, damaging whatever it was over.
- **Goblins** sprint for resource buildings, including the Town Hall, and deal double damage to them. Loot is released as resource buildings take damage, so a quick resource raid can pay without a star.
- **Wall Breakers** seek walls blocking the path to buildings, ignoring isolated wall pieces. They sacrifice themselves to open a breach, dealing 40× damage to walls and a smaller blast if defeated early. Both new troops can be trained, researched, and replenished with Last army.
- Tap a troop’s role badge in the Army drawer to see its full stats, favorite target, and a tactical tip.
- **Air Defenses** hit hard but are blind to the ground. Cannons and mortars are ground-only. Archer towers hit both.
- **Defense progression** uses explicit health, prices, timers and damage tables for Cannon, Archer Tower, Mortar, Air Defense and Wizard Tower. Wizard Tower splash reaches one tile on the selected ground or air layer. See the [Air Defense and Wizard Tower audit](docs/AIR-WIZARD-PROGRESSION.md).
- **Skeleton Traps** have two TH8 levels and saved ground/air modes. Their defenders pursue attackers, jump their own walls, draw retaliation and survive replay export/seeking. See the [defending-unit audit](docs/SKELETON-TRAP.md).
- **Bomb Towers** unlock at Town Hall 8, with two levels, dodgeable thrown bombs and a larger ground blast one second after destruction. A separate roof Bomber animates each throw. See the [Bomb Tower audit](docs/BOMB-TOWER.md).
- Build a **Spell Factory** to prepare Rage, Healing, and Lightning for free. Rage and Healing take two housing spaces; Lightning takes one. The current factory provides two spaces per level.

### Heroes

- Build a **Hero Hall at Town Hall 4** to unlock the Barbarian King. Open **Army → Heroes** for stats and upgrades.
- The King uses no army housing and returns at full health for each attack. Select his card or press **H**, then tap outside the deployment boundary.
- From Town Hall 4, use his card or **H** again to activate **Barbarian Puppet and Rage Vial**: fixed health recovery, ten seconds of rage, and eight boosted Barbarians in two waves. Both items activate once per attack, automatically on lethal damage if unused.
- Dark Elixir Drills and Storage unlock at Town Hall 7. Collect dark elixir to upgrade the King using one builder. Army → Progression shows building unlocks and level caps.
- Equipment selection/upgrades, other heroes, and defending heroes remain unfinished. See the [hero overview](docs/HERO-PROGRESSION.md) and [combat/equipment audit](docs/KING-COMBAT.md).

### Raids

- Army Camps have eight distinct fire-pit and cooking-spit sprites, with troops gathering around the central pit. They use native housing values: 20, 30, 35, 40, 45 and 50 spaces at playable levels 1–6. A new TH2 village starts with one level-two camp. Upgrading camps keep their existing capacity; constructing camps add capacity on completion. Older prepared armies are preserved even if over capacity. See [camp progression](docs/CAMP-PROGRESSION.md).
- **Practice** in the Army drawer or campaign screen attacks a copy of your own village with its real layout and defense levels. It spends no troops or spells and awards no loot, trophies, or campaign stars. Change your defenses and try again.
- **Battle log** on the left rail keeps your twenty most recent results and deployed compositions, including practice. **Watch replay** plays the latest five recorded attacks with a draggable timeline, ±10-second jumps, First deployment, pause/play, restart, and 1×/2×/4× speeds. Export replay downloads a standalone recording; Open shared replay plays a file without replacing your village. Space toggles pause; drag and zoom to inspect the battlefield. Recordings preserve the original layout, research levels, spells, and hero actions, and survive reload/export. Playback awards nothing and spends nothing. Older results and incompatible recordings remain in the log without playback. Results also offer a repeat-attack button; campaign repeats prepare the last army first.
- Attack opens the native 90-village campaign catalog. The first 50 layouts are supported, including Goblin Picnic's native Santa Trap animation and five timed strikes; later missing mechanics are labeled Coming soon. Campaign scouting and combat have **no time limit**, award no trophies and draw from a finite saved treasury. Practice retains 30-second scouting and a three-minute attack clock. See [Santa Trap details and fidelity limits](docs/SANTA-TRAP.md).
- Tap an enemy defense to inspect its range without deploying. A mortar’s orange inner ring shows its 4-tile blind spot. Mortar shells travel for 1.15 seconds and land at a fixed point; moving troops can dodge them. Defenses keep their target while it remains alive and in range, so Giants can draw fire for fragile troops.
- A continuous **red boundary** is drawn on the grass around every tile you may not deploy on.
- Tap to deploy one troop, **hold and drag to spread a line of troops**, or double-tap to commit five at once. Keys 1–7, Q, W and E follow Barracks unlock order; 8, 9, and 0 select Lightning, Healing, and Rage. Unavailable units cannot be selected. The cards display their shortcuts. A quick drag still pans the camera.
- Select a spell and tap anywhere — including inside the base. Rage boosts damage and speed, Healing restores troops standing in it, Lightning damages every building in a small radius instantly.
- The destruction bar is marked at the 50%, Town Hall, and 100% star thresholds. Loot bars show what you have taken against what is there.
- Surrender asks for confirmation and keeps the result and the loot already taken.
- In campaign attacks, deployed troops and cast spells are consumed; undeployed ones remain in your village. Closing the browser during a raid forfeits them.

### Saving

- Only one tab can play a village at a time. A second tab waits until the first closes, then loads the latest save.
- Progress saves in IndexedDB with a localStorage backup. Settings includes export/import; importing replaces the current village. Save formats 1–3 are migrated on load and import, preserving progress while correcting old building footprints. If stored villages cannot be recovered, startup offers downloads instead of replacing them with a new village. Newly added troop types begin at zero in existing saves, preserving their army and resources. Old paid training queues complete once immediately on load. Army presets and battle history are included in backups.
- Resource accumulation while away is capped at 8 hours and by collector storage.

## What is implemented

- 23 building types including walls, traps, Hero Hall, and dark elixir facilities, with explicit Town Hall 1–8 level ceilings.
- Building placement by drag or tap, relocation, a full edit mode with undo/redo and three saved layouts, builder reservations, construction, upgrades, collection, resource storage, and camp capacity.
- Ten troops, including flying support, Dragon breath and Balloon death damage; three spells; ground/air targeting; four-frame animation; troop-specific research ceilings; instant army preparation, spell housing, editable compositions, saved presets, and army replenishment.
- A* navigation with wall breaking for ground troops, straight-line flight for air troops, deterministic crowd separation, splash damage, defense fire, destruction, and campaign progress.
- Bombs, Giant Bombs, Air Bombs, and Spring Traps with explicit level statistics, instant placement, concealment, one use per attack, and fresh arming on repeat. Spring survivors are tossed vertically and stunned on the battle clock. Wizard Towers splash either ground or air clusters. See [trap progression and fidelity limits](docs/TRAP-PROGRESSION.md).
- Hidden Teslas now conceal their location during attacks, reveal at six tiles or 51% destruction, and fire rapid electrical bolts. Six original level sprites, native TH7–8 progression, campaign placements and deterministic replay are included. See [Tesla behavior and fidelity limits](docs/HIDDEN-TESLA.md).
- Air Sweepers rotate through eight directions and push flying attackers with traveling gusts. Seeking Air Mines home toward one air troop for 1,500 damage. Both have original artwork, native TH6–8 progression, layout/replay persistence and authored campaign placements. See [air-control behavior and fidelity limits](docs/AIR-CONTROL.md).
- Practice attacks against your own village, persistent battle results and deployed compositions, deterministic input replays for the latest five attacks, and one-button repeat attacks.
- Native campaign names, loot, layout coordinates, levels, hitpoints and scenery come from a pinned public client bundle. Forty-nine supported layouts preserve all their entities. Legacy twelve-village progress remains separate; native Pumpkin Bombs now open Rat Valley and three other villages; Obsidian Tower now includes its five level-three Skeleton Traps. See [campaign coverage and fidelity limits](docs/CAMPAIGN-RULES.md).
- Bottom-sheet shop and army drawers, an anchored building card, a building info sheet with before/after stats, a scouting phase, a star-marked destruction bar, loot bars, drag-deploy, and a surrender confirmation.
- A first-run coaching sequence, a player profile with lifetime statistics, eight achievements, wall runs, and feedback that follows the action: collected resources fly to their counter, a falling Town Hall shakes the screen, and the victory tally counts up.
- Responsive HUD, campaign, help, persistent quest rewards, settings, reduced motion, generated sound effects, and optional ambient tones.
- Automatic saves, version-1 migration, exclusive tab ownership, validated import/export, self-hosted fonts, optimized WebP assets, and production offline caching.

## Architecture

`src/game/data.ts` is the catalog: buildings, troops, spells, level ceilings, Town Hall gates, and the timer, price, and gem curves. `src/game/model.ts` owns serializable state and gameplay rules, including the air layer, spell auras, edit-mode history, and a combat simulation at a fixed 20 Hz. `src/game/replay.ts` defines versioned replay snapshots, input records, and bounded import validation. Playback uses an isolated `GameModel`; troop research is frozen at attack entry. `src/game/native-campaign.ts` adapts the native catalog and validates supported mechanics. `src/game/campaign-catalog.ts` preserves native/legacy identities; `src/game/campaign.ts` retains the old authored blueprints for legacy fixtures. `src/game/scene.ts` owns Phaser rendering, animation, camera, and input — including the gesture classifier that decides whether a drag pans, deploys troops, or moves a building. `src/ui/hud.ts` owns DOM drawers, dialogs, and the HUD. `src/game/save.ts` validates, migrates, and persists saves. `src/game/session.ts` prevents concurrent writers using the browser Web Locks API. No Phaser objects enter saved data.

In development, `window.__game` exposes the model and scene, and `window.advanceTime(ms)` advances simulation for tests. `window.render_game_to_text()` provides a compact structured snapshot in both builds.

## Developer tools

Open `https://coc.teozeng.dev/?devtools=1` or `http://localhost:4173/?devtools=1` (or port 5173), then click **DEV** or press **Ctrl/⌘ Shift D**. Edit resources, troops and spells; jump progression; finish timers; test battle outcomes; and restore a checkpoint. Changes save normally. The toolbox is opt-in and available in development/local previews and on `coc.teozeng.dev`. See [docs/DEVELOPER-TOOLS.md](docs/DEVELOPER-TOOLS.md) for controls and the `window.__dev` API.

## Verification

Every push and pull request installs dependencies and runs `npm run build`, which
type-checks, bundles the game, and generates its offline manifest. Successful pushes
to `main` deploy to Firebase. The release workflow has an eight-minute ceiling.
Unit tests, asset checks, and browser smoke tests run separately from deployment.

The full browser suite is separate from deployment. Run **Browser regression
(on demand)** from GitHub Actions, or `gh workflow run browser-regression.yml`.
It runs Chromium and WebKit on four shards each, with separate failure traces and
screenshots. Full browser regressions are not release gates; run them when changing
gameplay or presentation. Local production checks still run both engines by default;
use `PRODUCTION_BROWSER=chromium npm run test:production` to check Chromium alone.

```sh
npm test
npx playwright install chromium webkit
npm run test:e2e
npm run build
# Starts and stops its own production preview on an isolated local port:
npm run test:production
npm run test:heroes:production
npm run test:campaign:production
# With the preview server running:
node scripts/production-check.mjs
```

Simulation and save tests cover placement collisions, construction, upgrades, builder reservation, caps, training, save validation and version-1 migration, pathfinding, battle completion, deployment, campaign unlocks, research, batch training, the scouting phase, the deployment boundary, air/ground targeting in both directions, walls that stop ground troops and not balloons, spell brewing limits, each spell's effect, aura expiry, Town Hall level and count gating, the timer and gem curves, edit-mode drag/undo/redo (one entry per drag), saved layouts, wall runs, balloon detonation, five-level research, tutorial counters, a 288-battle matrix across the twelve legacy stages, six armies and four approaches, and 147 native-layout battles across 49 supported villages and three army types.

Browser tests exercise real menus and pointer input: first-run coaching and its target ring, wall runs, drawer placement by both tap and drag, drag-deploy, double-tap squads, the scouting phase, spell casting, the surrender confirmation, the info sheet's before/after table, edit-mode dragging with undo and layout saving, Town Hall gating in the shop, reload persistence, mobile and landscape layout, battle results, focus handling, camera controls, research, tab handoff, graphics-context loss/recovery, and twenty consecutive raids. Production smoke checks cover Chromium, WebKit, offline reload, hero save import/upgrades, and actual hero deployment/ability controls. Run `npm run test:heroes:production` after building for the hero checks. It creates a validated model fixture and owns an isolated production preview; neither a development server nor a manually started preview is required.

Screenshots and reports are written to `output/playtest/` (not shipped). The specialist tests also cover target preferences, wall breaches, one-time death bombs, mortar blind spots, delayed splash and dodging, target retention, resource loot, specialist research/retraining, ten troop hotkeys, mobile tray scrolling, defense inspection, and older-save import. See `docs/QA.md` for verified coverage and remaining release limits.

## Assets

Hero Hall and dark elixir sprite sources and generation prompts are in [docs/HERO-ASSETS.md](docs/HERO-ASSETS.md). Rebuild them with `node scripts/hero-assets.mjs`. The updated King portrait and 36 directional idle/walk/attack poses are documented in [docs/KING-ART.md](docs/KING-ART.md); rebuild them with `node scripts/king-assets.mjs`.

Original defense sprites, source paths, and built-in generation prompts are recorded in [docs/DEFENSE-ASSETS.md](docs/DEFENSE-ASSETS.md). Rebuild the five WebP sprites with `node scripts/defense-assets.mjs`.

Goblin and Wall Breaker sources, shipped paths, and exact built-in generation prompts are recorded in [docs/RAIDING-ASSETS.md](docs/RAIDING-ASSETS.md). Rebuild their WebP files with `node scripts/raiding-assets.mjs`.

Source artwork and generation records are in `art/source/` and `docs/ASSETS.md`. Optimized assets live in `public/assets/`. Rebuild them with `npm run assets`. The normal build does not regenerate artwork or call an image service.

The Balloon, Air Defense, and Spell Factory use original generated sprites, including distinct upgraded building variants. Sources, exact built-in prompts, transparency checks, and rebuild instructions are in [docs/AIR-MAGIC-ART.md](docs/AIR-MAGIC-ART.md). `scripts/air-magic-assets.mjs` produces the six versioned WebPs and a stable-scale Balloon animation strip. Earlier derived art remains preserved; the three spell vials still use `scripts/derived-assets.mjs`. Asset rebuilds are deterministic and need no image service.

## Current scope

This is a complete playable local game loop, not a full commercial Clash of Clans content replacement. It has no server-authoritative multiplayer, accounts, clans, matchmaking, purchases, or cloud sync. Local clocks and saves are intentionally user-controlled. Most buildings share base artwork at levels 1–4 and a separate tier above; walls have individual artwork for levels 1–8 and Mortars for levels 1–6. All ten troops now have four-frame movement or float strips, including separate Goblin and Wall Breaker walking atlases with planted idle poses. Their original portraits remain in the HUD. Full directional attack/death animation sets remain future work. Army preparation is free and instant, matching the modern direction of the original game. Build, upgrade, and research timers still run; their progression and economy remain simplified. Physical iOS/Android device performance, multi-hour sleep/resume endurance, broader army-composition balance testing with spells and air troops, and accessibility review remain release gates before a public production launch.

Healer, Dragon and P.E.K.K.A now complete the elixir roster through TH8, with native levels 1–3, friendly ground healing, direct Dragon breath and heavy melee. Earlier troops retain levels 1–5. Their new portraits and sprite sheets, source data, save migration, and remaining AI and artwork differences are documented in [docs/LATE-TROOPS.md](docs/LATE-TROOPS.md). Battle shortcuts are 1–7, Q, W and E; spells remain 8, 9 and 0.

The experience inventory and next implementation priorities are tracked in [docs/EXPERIENCE-PARITY.md](docs/EXPERIENCE-PARITY.md). Additional heroes, equipment, the full content roster, online defense/matchmaking, and clan systems are still missing; replays cover local attacks only, with portable file sharing and seeking, but no hosted sharing links, defense history, or playback across incompatible combat versions. See [docs/REPLAYS.md](docs/REPLAYS.md).
