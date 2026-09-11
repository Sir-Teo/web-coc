# Verification record

## Trap progression and vertical spring feedback — September 11, 2026

All 330 unit tests pass, including exact trap price boundaries, instant placement with occupied builders, paid upgrade reloads, accepted legacy levels, blast-radius edges, spring targeting and half hero damage, healing during stun, and campaign viability. Eighteen browser scenarios pass in each of Chromium and WebKit, covering the four phone placement/upgrade flows, hidden traps, replay playback, effect timing and vertical spring presentation. The production build passes both engines without reported errors; Chromium also reloads, opens Army and plays a replay offline with 98 cached files.

The spring arc follows battle time, pauses without drifting, and becomes stationary with reduced motion. Visual review exposed two simultaneous activation labels and sounds; instantaneous springs now emit only their spring feedback, with a browser regression assertion. Phone Info screenshots were checked for damage, growing Giant Bomb radius, spring capacity and upgrade prices/timers. Combat version 9 keeps older summaries while refusing incompatible playback.

The initial new browser fixture used an ambiguous upgrade selector; scoping it to the Info panel resolved the fixture failure. Source reconciliation rejected stale trap references and also exposed a need to re-audit the earlier defense price/time tables. Remaining timing and art limits are explicit in [TRAP-PROGRESSION.md](TRAP-PROGRESSION.md). Evidence: `output/playtest/trap-verification.json`, `trap-production-report.json`, `*-audit-*.png` and `spring-toss-*.png`.

## Air Defense and Wizard Tower — September 11, 2026

All 307 unit tests pass after replacing prototype health, damage, prices and timers with explicit level tables. Twenty-five browser scenarios pass in each of Chromium and WebKit, covering all five defense Info panels, paid upgrade reloads, shop gates, traps, village editing, replay playback, seeking and file sharing. The production build passes both engines with no reported errors; Chromium also reloads, opens the Army drawer and plays a replay offline with 98 cached files.

New combat checks exercise every accepted Air Defense/Wizard Tower damage level, range edges, firing cadence at 20/30/60 fps, inactive upgrades, air-only single-target rockets, rocket impact after launcher destruction, and Wizard Tower's exact one-tile splash boundary on both layers. An existing hero replay fixture needed extra defensive crossfire to reach automatic Iron Fist under the corrected tower health/damage. The replay is still compared exactly against its recording. Combat version 8 preserves older result summaries while refusing incompatible playback.

Phone screenshots were visually reviewed for fractional damage, prices, timers and the singular “1 tile” label. See [AIR-WIZARD-PROGRESSION.md](AIR-WIZARD-PROGRESSION.md) for source values and remaining limits. Evidence is recorded in `output/playtest/air-wizard-verification.json` and `air-wizard-production-report.json`.

## Mortar artwork — September 11, 2026

Six original level sprites replace the two atlas tiers across the village, Info, paid upgrades and moving previews. All 282 unit tests pass. Eighteen targeted scenarios pass in each of Chromium and WebKit, including all six muzzle anchors, airborne shells after launcher destruction, reduced motion, replay seeking and shared defense presentation. Production checks pass in both engines; Chromium reloads, opens the Army drawer and plays a replay offline with 98 cached files. All six new Mortar textures are explicitly required by the production check. The deterministic asset check also passes.

Visual review covers transparent edges against grass, a six-level gallery, the phone Info panel and shell flight. The first new Info test incorrectly tried to reopen a still-open sheet after an upgrade; it now checks the live update. Source alpha near 253 was normalized to full opacity, and generated checkerboard backgrounds were rejected. See [MORTAR-ART.md](MORTAR-ART.md) for provenance and remaining fidelity limits. Detailed evidence is in `output/playtest/mortar-art-verification.json`.

## Earlier milestones

Verified locally on September 10, 2026. The hero/progression pass has **99 passing simulation/save tests**, a successful production build, and **71 precached files**. All **43 browser scenarios** pass across the full run and targeted rerun: the first run passed 40/42, revealing one obsolete Town Hall expectation and a real phone Army-menu clipping bug. After fixing both and adding a dark-elixir collection case, all 22 affected hero/army/expansion/specialist scenarios passed. Other scenarios retained their passing full-run result.

Production checks in Chromium and WebKit pass for boot, shop, research, tab handoff, imported hero saves, gem-finished hero upgrades, pointer deployment and H-key ability use. Chromium also reloads and plays the upgraded hero offline with cached artwork. Reports: `output/playtest/production-report.json` and `hero-production-report.json`. Run `node scripts/production-check.mjs` and `node scripts/hero-production-check.mjs` after a build with the development and preview servers running.

## Defect audit — economy, persistence, editing and escaping (September 11, 2026)

Regression coverage now includes the following economy, persistence, editing and imported-content safeguards. The current verification results are recorded in `output/playtest/replay-audit-verification.json`; older pass counts below describe earlier milestones.

- **Free resources from every new producer.** `makeBuilding` seeded 1,800 stored resources for mines and collectors — intended only for the opening village, but `place` uses the same helper. A Gold Mine cost 1,800 elixir and paid back 1,800 gold; a Collector did the reverse. New buildings now start empty and `initialSave` seeds its own.
- **Collecting from buildings that were not finished.** `collect` tested only `stored >= 1`, so the Collect button drained a mine that was still under construction or mid-upgrade — the renderer already suppressed the bubble for those, so the model and the view disagreed. Collection now skips anything with a timer running.
- **A raid abandoned by closing the tab spent the army for nothing.** Troops leave the camps on deploy and the battle is not part of the save, so a refresh or an app switch lost them with no loot, trophies or stars. `suspendBattle` now settles an attack that has committed troops exactly as surrendering does, and leaves a scouted-but-untouched attack free.
- **Markup in an imported village reached the DOM.** `validateSave` accepts any layout name, and the layout panel interpolated it into `innerHTML` unescaped, unlike the army preset names beside it. The name is now escaped; a browser scenario imports a scripted name and asserts no element is built from it.
- **Restoring a layout could stack two buildings on the same tiles.** Stored arrangements say nothing about buildings raised since, and neither the restore nor save validation checked, so the corruption survived a reload. Restores, undo and redo are now applied only as a whole, and refused with an explanation otherwise.
- **Wall builder rules were inconsistent.** Gold/elixir upgrades and new placement require a free builder, complete instantly, and never reserve that builder afterward.
- **Empty collections all reported the same reason.** Full storages, a Dark Elixir Drill with no storage to empty into, and an unfinished building each said "your collectors are working". Each now names what is actually blocking it.
- **Loot bars promised more than the raid could bank.** `finishBattle` clamped the award to storage headroom while the bars showed the full amount, so a 100% raid into full storages read 8,500 gold during the battle and 0 on the result. Headroom is captured at the start of a campaign attack and the bars, the result and the award now agree. Replays keep showing what the recorded attack earned.

Not changed: dark elixir still needs a Dark Elixir Storage before any can be kept, which is deliberate and separately tested. Only the silent failure around it was fixed.

## Hero and progression pass

- Added 12 model cases covering Hero Hall completion, TH4/TH7/TH8 gates, dark-elixir charges, builder reservations, one-time offline completion, gem finishes, legacy and malformed saves, dark drill downtime and overflow, hero-only combat, duplicate/blocked deployment, ability healing/rage/summons, automatic activation, spring damage/no ejection, defeat/reuse, history, independent building ceilings, and construction/upgrade affordability at every supported tier.
- Added five browser cases covering new art and shop gates, the progression panel, upgrade persistence, real pointer deployment and keyboard ability activation, fresh repeat attacks, portrait/landscape controls, dark collection and reload.
- Fixed the expanded Army action list clipping its first buttons behind the phone drawer header. Actions use a two-column grid and remain scrollable in short viewports. Rechecked existing army/preset and specialist flows.
- Hero-card health updates preserve the actual button node until its interaction state changes. Disabled/spent/dead states update without replacing the card on every economy tick.
- Production hero checks exercise actual import, upgrade, finish, practice, deployment and ability controls; production needs no development model exposure. Chromium repeats this flow offline. Both engines report no browser or asset errors.
- Screenshots under `output/playtest/`: `heroes-desktop.png`, `heroes-mobile.png`, `heroes-landscape.png`, `hero-battle-desktop.png`, `progression-desktop.png`, `progression-mobile.png`, `dark-elixir-village.png`, and `production-hero-*.png`.
- The first screenshots caught a modal mid-animation; final visual captures disable CSS animation. Reviewed source sprites, desktop hero panel/battle, and phone hero/progression panels.
- Reference rules, local balance choices, migration behavior and remaining features are documented in [HERO-PROGRESSION.md](HERO-PROGRESSION.md). Source artwork and exact generation prompts are in [HERO-ASSETS.md](HERO-ASSETS.md).

## Defense and trap pass

- Added 13 simulation/save cases in `tests/defenses.test.ts` for trap placement and count/unlock gates, collisions, construction and upgrades, save round trips and level rejection, concealment, path/deployment exclusion, troop targeting, Bomb/Giant Bomb fuses and escape, air-only tracking splash, single-target springs, ejected death-bomb suppression, oversized knockback, collision-safe pushback, anti-stacking, bomb damage during spring knockback, inactive upgrading traps, fresh practice arming, spell immunity, full-clear scoring, and Wizard Tower targeting/splash.
- Added five browser cases in `tests/browser/defenses.spec.ts`: missing-asset detection and correct shop unlocks; pointer placement, trap info, upgrade and reload; concealed practice traps, pointer activation and repeat reset; phone portrait/landscape controls; campaign miniature concealment and visible Wizard Towers.
- Fixed small ground-trap selection beneath neighboring rooftops, selected shop-category visibility after redraw, and the initial position of a troop ejected before its first rendered frame.
- Original generated RGBA sources are preserved outside the production build. The five shipped WebPs are built with `scripts/defense-assets.mjs`; prompts and source paths are in [DEFENSE-ASSETS.md](DEFENSE-ASSETS.md). Rebuilding all five sprites produced identical SHA-256 hashes (`output/playtest/defense-asset-hashes.json`).
- The 144-battle campaign audit passes after adding traps to stages 2–12 and Wizard Towers to stages 6, 8, 10 and 12. Every stage has a three-star veteran approach, stage 1 remains approachable, and starter armies cannot fully clear the final fortress. The final defense multiplier changed from 1.7339 to 1.55 to offset the new defenses.
- Visually reviewed desktop and phone trap shop, trap information in portrait/landscape, activation in practice, and a campaign Wizard Tower. Screenshots: `traps-shop-desktop.png`, `traps-shop-mobile.png`, `trap-info-desktop.png`, `trap-info-mobile.png`, `trap-info-landscape.png`, `trap-trigger-practice.png`, and `wizard-tower-campaign.png` under `output/playtest/`.
- Live-game costs/timers, exact catalog progression, additional defense and trap types, physical-device performance, and asynchronous defensive attacks remain outside this pass. The enlarged tank fixture tests a future oversized troop branch; the current roster itself has no troop above the spring capacity.

## Army preparation and practice pass

- Added 15 simulation/save tests for free instant preparation, weighted spell housing, editing and underflow, active-battle guards, one-time legacy queue migration, preset capacity and persistence, bounded names, atomic replenishment, practice isolation, campaign results, and the twenty-entry battle log.
- Added five browser tests for real add/remove controls, spell capacity, preset names and reload, practice deployment/casting/surrender, repeat attacks, log persistence, and portrait/landscape results.
- Fixed a redraw race that could replace an in-progress preset name. Unsaved input survives rerenders and is cleared when importing another village.
- Reset scene objects when the battle instance changes, including an immediate result-to-repeat transition. If replenishment fails because a facility is upgrading, repeat attack returns to the Army drawer instead of starting with an incomplete composition. Practice also preserves imported resources above current storage caps.
- Screenshots: `quick-armies-desktop.png`, `quick-armies-mobile.png`, `practice-desktop.png`, `practice-mobile.png`, `practice-result-desktop.png`, `practice-result-mobile.png`, `practice-result-landscape.png`, `campaign-result-landscape.png`, `battle-log-desktop.png`, and `battle-log-mobile.png`, under `output/playtest/`.
- Remaining system-level differences and next priorities are explicit in [EXPERIENCE-PARITY.md](EXPERIENCE-PARITY.md). Passing these tests does not imply complete CoC parity.

## Specialist raiding pass

- Added 13 simulation/save tests in `tests/raiding.test.ts`: Goblin preference and double damage, fallback targeting, path-aware wall breaching, a single explosion per Wall Breaker, weaker researched death bombs, no-wall fallback, training/research/replenishment, mortar blind spot and air immunity, delayed splash and dodging, shells surviving the firing mortar, defense target retention, partial resource looting, full-clear loot, and version-2 save migration.
- Added five browser tests in `tests/browser/raiding.spec.ts`: troop portraits and details, training plus reload, troop/spell hotkeys and actual deployment, mobile tray bounds and selected-card visibility, older-backup import, and enemy mortar inspection during scouting.
- Updated old fixed army fixtures to contain zero of the new troop types, retaining the existing 144-battle campaign balance audit.
- The new sprites use their original generated alpha, with a procedural bob and attack impulse instead of a directional walk atlas.

## Earlier automated coverage (army and practice baseline)

- **74 simulation and save tests pass.** Placement collisions and bounds, construction completion, builder reservations, upgrades, offline resource caps, production resuming after upgrades, storage saturation, instant troop preparation, camp capacity, malformed-save rejection, A\* navigation, deployment boundaries, a complete opening battle, one-time quest rewards, crowd separation, corrupted backup recovery, and IndexedDB unavailability. Research is gated by laboratory level, charges once, completes offline once, and increases deployed troop health and damage. Batch preparation is atomic, troops and spells cost no elixir, and army replenishment checks both housing limits before changing either composition.

  New in this pass:
  - **Scouting phase** — the battle clock holds for thirty seconds, starts on the first deploy, and starts on its own when scouting expires. `deployBlocked` is asserted to be the same predicate the red boundary is drawn from, so the line the player sees and the rule the model enforces cannot drift apart.
  - **Air layer, in both directions** — a ground-only cannon leaves a balloon untouched over 6 seconds of simulation; an air defense leaves a swordsman untouched over the same window; an air defense does tear into a balloon. A wall line stops a ground troop and takes damage from it, while a balloon crosses the same line and leaves every segment at full health.
  - **Spells** — brewing respects spell factory capacity and refuses (without charging) beyond it; Lightning damages every building inside its radius exactly once and nothing outside it; Rage measurably increases damage dealt over a fixed window against an identical control run; Healing restores a wounded troop standing inside it without exceeding its maximum; auras expire and stop applying.
  - **Town Hall gating** — independent per-building TH1–8 ceilings now control upgrades and first unlocks. Info panels report the next required Town Hall. Building counts remain locally tuned.
  - **Timer and gem curves** — upgrade seconds increase monotonically per level, a late Town Hall upgrade exceeds an hour, and the gem curve hits its documented anchors (1 gem at a minute, 20 at an hour, 260 at a day).
  - **Edit mode** — dragging relocates, occupied ground is refused without mutating the building, undo and redo restore exact positions, three layout slots store and restore, and the state stays valid throughout.
  - **Save migration** — a version-1 village fails validation, migrates cleanly, keeps its gold and its existing troop levels, gains `balloon: 0` and an empty spell book, and loads into a working model. A building level above that building's maximum is rejected.
  - **Second pass** — the wall tool re-arms after each segment and puts itself down when the next one is unaffordable; a felled balloon damages the buildings inside its radius exactly once and nothing outside it; a drag across four tiles is a single undo step; research climbs to level 5 behind a matching laboratory and stops there, with the laboratory ceiling asserted equal to the troop ceiling; the tutorial's `built` counter ignores walls, its `trained` counter follows batch size, and a battle's carried spell book keeps a slot recorded after the spell is spent.

- **33 browser tests pass in Chromium.** Boot, collection, pointer selection, upgrading and gem completion, save persistence through reload, shop filtering, placement and cancellation, instant army preparation, actual troop deployment and simulated battle results, campaign unlocking, settings, modal keyboard focus, camera zoom/pan/reset, portrait layout, landscape layout, touch selection, stable sheets during passive resource ticks, export, valid import, invalid import rejection, research at desktop/phone sizes, research persistence, exclusive tab handoff with the newest save, forced WebGL context loss/restoration, and twenty consecutive raids with object cleanup and a final save reload.

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

The defense-pass static build is approximately 4.2 MB on disk. Its 53 optimized game images occupy approximately 2.6 MB. Original PNGs stay outside the shipped build. The Phaser engine is separately cacheable, approximately 357 KB gzipped; application JavaScript is approximately 45 KB gzipped.

## Visual review

This pass also checks the Goblin and Wall Breaker details on desktop and phone, the expanded army drawer, battle tray scrolling, mortar range inspection, and the phone timer/loot/scouting layout. The redundant delayed welcome toast was removed so it cannot obscure a dialog or scouting controls.

Screenshots in `output/playtest/` cover the home village, the shop and army drawers, the campaign, the scouting phase, an active battle with a red boundary and a cast spell, victory, edit mode, the saved-layouts panel, the building info sheet, mobile portrait, touch-selected buildings, landscape phone, Chromium/WebKit production shop, offline army drawer, and the laboratory on desktop and phone. Reviewed for alpha artifacts, consistent scale and anchors, HUD obstruction, responsive dialog bounds, selection readability, wall connections, and troop animation.

Resolved in the second pass:

- The deployment-boundary cache was keyed only on surviving building ids, so two stages with the same ids and the same survivor count could show a stale outline; the stage index is now part of the key.
- Edit mode recorded one undo entry per tile crossed, so reversing a single drag took as many presses of undo as tiles; a drag now opens exactly one entry.
- A tap that could not deploy still armed the double-tap window, so the next tap deployed five where the player expected one.
- The laboratory could be upgraded to level 8 while research stopped at troop level 3, leaving four levels that bought nothing. Research runs to troop level 5. The new Town Hall progression pass allows laboratory level 6 at TH8; research beyond troop level 5 remains unfinished.
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

- Army preparation is now free and instant. Build, upgrade, and research prices/timers still use a simplified local economy. Factory capacity grows by two housing spaces per level; exact live-game progression remains unimplemented.
- The campaign matrix does not cover balloon-led, specialist-led, or spell-supported attacks; focused interaction tests cover the new specialists.
- Specialist health/damage and the resource loot shares are tuned for this local campaign, not the current live game economy.
- Air troops have a float cycle but no distinct attack or death animation.
- Most buildings share base artwork at levels 1–4 and final-tier artwork at level 5 and above. Walls have distinct artwork at levels 1–8 and Mortars at levels 1–6; the other buildings still need per-level art.
- Physical iOS/Android performance, multi-hour sleep/resume endurance, and accessibility review remain release gates.

## Replay audit — September 11, 2026

- Recording, seeking, speed controls, portable files and read-only playback are covered by model tests and real browser input in Chromium and WebKit.
- Version 4 records raid-limited storage headroom. Regression cases compare final loot and results, verify that home research uses home levels while watching, and bound tiny-step playback and reconstruction work.
- Imported replay limits preserve older recordings as incompatible summaries. Unsupported new recordings are omitted without invalidating the village save.
- Portrait and landscape playback targets are at least 44 CSS pixels; the 320px layout and 844×390 production view were visually reviewed.
- `npm run test:production` now records a practice attack through the canvas, watches/seeks/restarts/exits the replay in Chromium and WebKit, compares home resources/army, and reopens the saved recording offline in Chromium.
- Reports and screenshots: `output/playtest/replay-audit-verification.json`, `production-replay-*.png`, and `replay-controls-*.png`.
