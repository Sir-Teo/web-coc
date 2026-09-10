# Verification record

Verified locally on September 10, 2026.

## Automated coverage

- **21 simulation and save tests pass.** Placement collisions and bounds, construction completion, builder reservations, upgrades, offline resource caps, production resuming after upgrades, storage saturation, sequential troop training, camp capacity, malformed-save rejection, A* navigation, deployment boundaries, a complete opening battle, one-time quest rewards, crowd separation, corrupted backup recovery, and IndexedDB unavailability. Research is gated by laboratory level, charges once, completes offline once, and increases deployed troop health and damage; old saves remain valid. Batch training is atomic and army replenishment accounts for queued troops.
- **16 browser tests pass in Chromium.** Boot, collection, pointer selection, upgrading and gem completion, save persistence through reload, shop filtering, placement and cancellation, training completion, actual troop deployment and simulated battle results, campaign unlocking, settings, modal keyboard focus, camera zoom/pan/reset, portrait layout, landscape layout, touch selection, stable dialogs during passive resource ticks, export, valid import, and invalid import rejection. New coverage includes research at desktop/phone sizes, research persistence, exclusive tab handoff with the newest save, forced WebGL context loss/restoration, and twenty consecutive raids with object cleanup and a final save reload.
- **Production smoke checks pass in Chromium and WebKit.** The optimized build boots, renders the game, and opens the shop and laboratory without JavaScript errors. A second tab waits and resumes after the owner closes in both engines.
- **Offline reload passes in Chromium.** The service worker pre-caches the complete production asset manifest; a disconnected reload renders the village and opens the troop menu. Cache matching tolerates Vary headers on these same-origin static files. Cached assets include local fonts.
- Rebuilding all 37 shipping images from the stored source files produces identical checksums. The upgraded Town Hall was visually verified using its distinct level-3 texture.
- TypeScript checking and the Vite production build pass. Production dependency audit reports zero known vulnerabilities.

## Campaign and endurance evidence

`output/playtest/campaign-balance.json` records 144 complete fixed-step battles: 12 stages × 3 army compositions × 4 starting approaches. All twelve authored layouts are distinct and every occupied tile is checked for overlaps and bounds.

| Army      | Composition (swordsmen / archers / giants / wizards) | Research | Spaces |
| --------- | ---------------------------------------------------- | -------- | -----: |
| Starter   | 14 / 12 / 3 / 3                                      | Level 1  |     53 |
| Developed | 18 / 18 / 8 / 6                                      | Level 2  |    100 |
| Veteran   | 20 / 20 / 16 / 10                                    | Level 3  |    160 |

The starter army clears stages 1–7 in these scenarios, achieves partial victories in stages 8–10, and loses stages 11–12. The developed army clears most late stages but achieves two stars at the final fortress. The veteran army clears every stage from all four tested approaches. These scenarios deploy all troops at the start; they do not establish balance for every player strategy.

The twenty-raid browser check runs full simulated battles, enters results, returns home, and samples scene object counts after effects expire. The four samples were exactly 124 scene objects each, with zero remaining unit sprites; the saved raid count remained 20 after reloading. The recorded object counts are in `output/playtest/raid-endurance.json`. Accelerated battles are a transition/cleanup check, not a multi-hour memory certification.

The session mechanism uses an exclusive origin-scoped browser lock; see [Web Locks API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API). Only the owner loads and mutates a village. The waiting page acquires ownership after the first tab closes. This requires HTTPS or a trustworthy local origin.

## Performance evidence

Headless Chromium on the local macOS workstation, 1440×960 viewport, device scale factor 1, four-second sampling windows:

| State                                  | Mean frame rate | 95th percentile frame duration |
| -------------------------------------- | --------------: | -----------------------------: |
| Village, decorative troops active      |          59 FPS |                        16.8 ms |
| Opening battle, starting army deployed |          56 FPS |                        33.3 ms |

These are local observations, not a device-independent guarantee. Re-run `node scripts/performance-check.mjs` against the development server for a new report. The project intentionally does not claim a physical-mobile frame-rate certification from these results.

The complete static build is approximately 3.6 MB on disk. Its 37 optimized game images occupy approximately 2 MB. Original PNGs stay outside the shipped build. The Phaser engine is separately cacheable, approximately 357 KB gzipped; application JavaScript is approximately 28 KB gzipped.

## Visual review

Screenshots in `output/playtest/` cover the home village, shop, army training, campaign, active battle, victory, mobile portrait, touch-selected buildings, landscape phone, Chromium/WebKit production shop, offline army menu, laboratory on desktop/phone, tactical campaign previews, and the village after graphics restoration. Reviewed for alpha artifacts, consistent scale and anchors, HUD obstruction, responsive dialog bounds, selection readability, wall connections, and troop animation.

Resolved during the build:

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
- Applied reduced-motion settings on import and allowed selecting the same backup file again.

## Remaining limits before public production release

This is a playable local release candidate with a complete loop. The following have not been certified:

1. Sustained performance, thermal behavior, touch ergonomics, and memory usage on physical iOS and Android hardware.
2. Multi-hour device sleep/resume endurance and graphics-driver failures beyond a simulated WebGL loss. Tab contention, a forced context loss/restore, and twenty raid transitions have passed locally.
3. Full accessibility review of gameplay beyond keyboard-operable DOM menus and reduced-motion support.
4. Broader campaign balance across arbitrary army compositions, staggered deployment and player skill. The current deterministic matrix covers all 12 stages with three compositions and four approaches.
5. Full animation and content parity with Clash of Clans. The current scope has 12 structures plus walls, four troops, three building levels, four-frame walk cycles, and simplified attack/death motion. Levels 1 and 2 share base artwork; level 3 has distinct artwork.

No public hosting deployment has been made. `dist/` is ready to serve as a static site over HTTPS. Multiplayer, secure economies, clans, account sync, and purchases require additional backend scope.
