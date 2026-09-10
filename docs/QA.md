# Verification record

Verified locally on September 10, 2026.

## Specialist raiding pass

- Added 13 simulation/save tests in `tests/raiding.test.ts`: Goblin preference and double damage, fallback targeting, path-aware wall breaching, a single explosion per Wall Breaker, weaker researched death bombs, no-wall fallback, training/research/replenishment, mortar blind spot and air immunity, delayed splash and dodging, shells surviving the firing mortar, defense target retention, partial resource looting, full-clear loot, and version-2 save migration.
- Added five browser tests in `tests/browser/raiding.spec.ts`: troop portraits and details, training plus reload, troop/spell hotkeys and actual deployment, mobile tray bounds and selected-card visibility, older-backup import, and enemy mortar inspection during scouting.
- Updated old fixed army fixtures to contain zero of the new troop types, retaining the existing 144-battle campaign balance audit.
- The new sprites use their original generated alpha, with a procedural bob and attack impulse instead of a directional walk atlas.

## Automated coverage

- **59 simulation and save tests pass.** Placement collisions and bounds, construction completion, builder reservations, upgrades, offline resource caps, production resuming after upgrades, storage saturation, sequential troop training, camp capacity, malformed-save rejection, A\* navigation, deployment boundaries, a complete opening battle, one-time quest rewards, crowd separation, corrupted backup recovery, and IndexedDB unavailability. Research is gated by laboratory level, charges once, completes offline once, and increases deployed troop health and damage. Batch training is atomic and army replenishment accounts for queued troops.

  New in this pass:
  - **Scouting phase** — the battle clock holds for thirty seconds, starts on the first deploy, and starts on its own when scouting expires. `deployBlocked` is asserted to be the same predicate the red boundary is drawn from, so the line the player sees and the rule the model enforces cannot drift apart.
  - **Air layer, in both directions** — a ground-only cannon leaves a balloon untouched over 6 seconds of simulation; an air defense leaves a swordsman untouched over the same window; an air defense does tear into a balloon. A wall line stops a ground troop and takes damage from it, while a balloon crosses the same line and leaves every segment at full health.
  - **Spells** — brewing respects spell factory capacity and refuses (without charging) beyond it; Lightning damages every building inside its radius exactly once and nothing outside it; Rage measurably increases damage dealt over a fixed window against an identical control run; Healing restores a wounded troop standing inside it without exceeding its maximum; auras expire and stop applying.
  - **Town Hall gating** — a building can be upgraded to one level above the Town Hall and no further, and building count limits open up as the Town Hall grows.
  - **Timer and gem curves** — upgrade seconds increase monotonically per level, a late Town Hall upgrade exceeds an hour, and the gem curve hits its documented anchors (1 gem at a minute, 20 at an hour, 260 at a day).
  - **Edit mode** — dragging relocates, occupied ground is refused without mutating the building, undo and redo restore exact positions, three layout slots store and restore, and the state stays valid throughout.
  - **Save migration** — a version-1 village fails validation, migrates cleanly, keeps its gold and its existing troop levels, gains `balloon: 0` and an empty spell book, and loads into a working model. A building level above that building's maximum is rejected.
  - **Second pass** — the wall tool re-arms after each segment and puts itself down when the next one is unaffordable; a felled balloon damages the buildings inside its radius exactly once and nothing outside it; a drag across four tiles is a single undo step; research climbs to level 5 behind a matching laboratory and stops there, with the laboratory ceiling asserted equal to the troop ceiling; the tutorial's `built` counter ignores walls, its `trained` counter follows batch size, and a battle's carried spell book keeps a slot recorded after the spell is spent.

- **28 browser tests pass in Chromium.** Boot, collection, pointer selection, upgrading and gem completion, save persistence through reload, shop filtering, placement and cancellation, training completion, actual troop deployment and simulated battle results, campaign unlocking, settings, modal keyboard focus, camera zoom/pan/reset, portrait layout, landscape layout, touch selection, stable sheets during passive resource ticks, export, valid import, invalid import rejection, research at desktop/phone sizes, research persistence, exclusive tab handoff with the newest save, forced WebGL context loss/restoration, and twenty consecutive raids with object cleanup and a final save reload.

  New in this pass:
  - The shop **drawer** is asserted not to block the playfield (`scene.uiBlocked === false`), while a real dialog still does.
  - A building is placed **twice** — once by tapping its price and then tapping the map, and once by dragging the tile art out of the drawer and dropping it on the village — with the building count checked after each.
  - **Drag-deploy**: a press-then-drag across the grass deploys more than two troops along the path and starts the battle; a **double-tap** on one spot deploys five.
  - The **scouting banner** is visible before the first deploy and gone after it, and the destruction bar appears once the battle is live.
  - A **spell** is selected and cast, and the resulting aura is confirmed in the model.
  - **Surrender** opens a confirmation, "Keep fighting" dismisses it, and confirming produces the result screen.
  - The **info sheet** renders its stat table with exactly two improved rows for an Air Defense (hitpoints and damage, not range or attack speed) and shows a real cost and build time.
  - **Edit mode** is driven with the mouse: a building is dragged to a new tile, undo restores it, redo re-applies it, and a layout slot stores more than forty positions.
  - **Town Hall gating** is checked in the shop: a locked building's buy button is disabled and its tile carries no drag handle until the Town Hall is raised.
  - **First-run coaching** shows step 1, rings the Collect button, advances to step 2 and moves the ring to the Shop once a collection lands, marks a filled store with `.full`, and stays dismissed across a reload after Skip.
  - **Wall runs**: three walls are laid with three taps without reopening the shop, the placement banner survives each one, and Escape puts the tool down.

- **Production smoke checks pass in Chromium and WebKit.** The optimized build boots, renders the game, and opens the shop drawer and the laboratory without JavaScript errors. A second tab waits and resumes after the owner closes in both engines.
- **Offline reload passes in Chromium.** The service worker pre-caches the complete production asset manifest (62 files); a disconnected reload renders the village and opens the army drawer. Cache matching tolerates Vary headers on these same-origin static files. Cached assets include local fonts.
- The earlier full rebuild verified the original 46 shipping images. The two added specialist sprites were also rebuilt and checked for identical SHA-256 hashes; both retain genuine alpha transparency.
- TypeScript checking and the Vite production build pass.

## Campaign and endurance evidence

`output/playtest/campaign-balance.json` records 144 complete fixed-step battles: 12 stages × 3 army compositions × 4 starting approaches. All twelve authored layouts are distinct and every occupied tile is checked for overlaps and bounds.

| Army      | Composition (swordsmen / archers / giants / wizards) | Research | Spaces |
| --------- | ---------------------------------------------------- | -------- | -----: |
| Starter   | 14 / 12 / 3 / 3                                      | Level 1  |     53 |
| Developed | 18 / 18 / 8 / 6                                      | Level 2  |    100 |
| Veteran   | 20 / 20 / 16 / 10                                    | Level 3  |    160 |

These are deliberately **ground-only, spell-free** armies, so the matrix measures the same thing it did before the air layer and spells were added. The starter army clears the opening stage, the veteran army clears every stage from all four tested approaches, and the starter army cannot three-star the final fortress. They do not establish balance for every player strategy, and in particular they do not measure balloon-led or spell-supported attacks.

Air defenses were added to stages 5–12 (one each for 5–8, two each for 9–12). Because they cannot fire at ground troops, they are pure additional structure for these ground armies — they raise the bar for 100% destruction without adding threat. Defense damage now scales 12% per building level, and the per-stage `defense` multipliers were divided by the level factor for each stage's enemy tier, so enemy output is unchanged and this matrix stays comparable with the previous run.

The twenty-raid browser check runs full simulated battles, enters results, returns home, and samples scene object counts after effects expire; the recorded counts are in `output/playtest/raid-endurance.json`. Accelerated battles are a transition/cleanup check, not a multi-hour memory certification.

The session mechanism uses an exclusive origin-scoped browser lock; see [Web Locks API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API). Only the owner loads and mutates a village. The waiting page acquires ownership after the first tab closes. This requires HTTPS or a trustworthy local origin.

## Performance evidence

Headless Chromium on the local macOS workstation, 1440×960 viewport, device scale factor 1, four-second sampling windows:

| State                                  | Mean frame rate | 95th percentile frame duration |
| -------------------------------------- | --------------: | -----------------------------: |
| Village, decorative troops active      |          59 FPS |                        16.8 ms |
| Opening battle, starting army deployed |          57 FPS |                        16.8 ms |

The specialist-pass sample records 59 FPS in the village and 57 FPS with the full starting army, including Goblins, Wall Breakers and Balloons. Both 95th-percentile frame times were 16.8 ms. These are local observations, not a physical-device performance guarantee. Re-run `node scripts/performance-check.mjs` against the development server for a new report.

The complete static build is approximately 4.0 MB on disk. Its 48 optimized game images occupy approximately 2.3 MB. Original PNGs stay outside the shipped build. The Phaser engine is separately cacheable, approximately 357 KB gzipped; application JavaScript is approximately 40 KB gzipped.

## Visual review

This pass also checks the Goblin and Wall Breaker details on desktop and phone, the expanded army drawer, battle tray scrolling, mortar range inspection, and the phone timer/loot/scouting layout. The redundant delayed welcome toast was removed so it cannot obscure a dialog or scouting controls.

Screenshots in `output/playtest/` cover the home village, the shop and army drawers, the campaign, the scouting phase, an active battle with a red boundary and a cast spell, victory, edit mode, the saved-layouts panel, the building info sheet, mobile portrait, touch-selected buildings, landscape phone, Chromium/WebKit production shop, offline army drawer, and the laboratory on desktop and phone. Reviewed for alpha artifacts, consistent scale and anchors, HUD obstruction, responsive dialog bounds, selection readability, wall connections, and troop animation.

Resolved in the second pass:

- The deployment-boundary cache was keyed only on surviving building ids, so two stages with the same ids and the same survivor count could show a stale outline; the stage index is now part of the key.
- Edit mode recorded one undo entry per tile crossed, so reversing a single drag took as many presses of undo as tiles; a drag now opens exactly one entry.
- A tap that could not deploy still armed the double-tap window, so the next tap deployed five where the player expected one.
- The laboratory could be upgraded to level 8 while research stopped at troop level 3, leaving four levels that bought nothing. Research now runs to level 5 and the laboratory ceiling is exactly 5.
- `retrain` returned a bare `undefined` when it had brewed spells but no troops to train, which read as a silent failure.
- Relocating a building outside edit mode pushed an entry onto an undo stack nothing could reach.

Resolved during the first pass:

- The red deployment boundary was first drawn in the overlay layer and crossed over rooftops; it now draws in a ground-marks layer beneath every building.
- Opening the building info sheet cleared the very selection it describes, because every panel ran `model.cancel()`; the info panel now preserves it.
- The shop tile's price button also started a drag, so a single tap ran `beginBuild` twice; the price button is now a tap target and the rest of the tile is the drag handle.
- Battle labels ("Total destruction", the loot caption) were unreadable over bright terrain and now carry a stronger shadow; loot totals moved inline onto their bars.
- The scouting banner overlapped the toast strip and moved below it.
- The edit-mode caption and hint collided with the toolbar; the hint folded into the caption and the caption moved to the top.
- Starting gold initially exceeded the starting storage capacity, which silently made collection a no-op.
- The starting village's air defense was first placed on ground the shop tests build on.

Resolved in the previous pass (retained):

- Rejected an animation sheet with a baked-in checkerboard; normalized a real-alpha replacement.
- Corrected atlas extraction order and cell boundaries.
- Added continuous wall connections and a coherent fortification layout.
- Kept menus mounted during passive resource ticks and kept the import file input outside replaced dialog markup.
- Restored keyboard focus to current DOM controls after modal closure; made the background HUD inert beneath dialogs.
- Prevented a corrupt local backup from hiding a healthy IndexedDB save.
- Fixed cached-module misses caused by Vary headers during disconnected reloads.
- Stopped upgrading collectors from producing during their construction interval.
- Added deterministic troop separation and consistent attack/death feedback.
- Replaced repeated enemy layouts and eliminated overlapping enemy footprints in later stages.
- Added explicit troop research and removed the hidden laboratory damage multiplier so displayed troop damage matches normal attacks.
- Protected saves from concurrent tabs, including reloading the latest state when ownership transfers.

The visual review also covers the first-run coaching banner (`coach-desktop.png`), the player profile and achievement list (`profile-desktop.png`), and the five-level research panel (`research-desktop.png`).

## Known limits

- Training times were kept short while build, upgrade, and research timers were stretched. This is a deliberate playability choice for a single-sitting demo, not a modelled economy.
- The campaign matrix does not cover balloon-led, specialist-led, or spell-supported attacks; focused interaction tests cover the new specialists.
- Specialist health/damage and the resource loot shares are tuned for this local campaign, not the current live game economy.
- Air troops have a float cycle but no distinct attack or death animation.
- Levels 1–4 share base artwork; level 5 and above use the final-tier set. There is no per-level art beyond those two tiers.
- Physical iOS/Android performance, multi-hour sleep/resume endurance, and accessibility review remain release gates.
