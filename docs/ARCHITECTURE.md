# Architecture

Crown & Clan is a static web application. Vite bundles TypeScript and Phaser;
browser storage holds the player's village. There is no server-side authority,
account system or cross-device synchronization.

## Application flow

`src/main.ts` acquires ownership of the village, loads the save, then creates the
model, Phaser scene, DOM HUD and audio manager. It also coordinates persistence,
visibility changes and offline support.

| Area              | Entry points                                                | Responsibility                                                     |
| ----------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| Simulation        | `src/game/model.ts`, `data.ts`                              | Village state, economy, commands and deterministic combat          |
| Rules and content | `src/game/*-stats.ts`, `*-progression.ts`, `native-data.ts` | Costs, unlocks, combat values and source table adapters            |
| Presentation      | `src/game/scene.ts`, `*-scene.ts`, `*-poses.ts`             | Phaser objects, input, projection, animation and effects           |
| Interface         | `src/ui/hud.ts`, `army-roster.ts`, CSS                      | DOM panels, controls and model actions                             |
| Persistence       | `src/game/save.ts`, `session.ts`                            | Validation, migrations, IndexedDB/backup storage and tab ownership |
| Replays           | `src/game/replay.ts`, `replay-file.ts`                      | Recorded inputs, playback, seeking and portable files              |
| Development       | `src/dev/`                                                  | Optional testing panel, loaded on demand                           |
| Offline           | `src/offline.ts`, `scripts/build-sw.mjs`                    | Service worker registration, versioned cache and update handling   |

Short filenames in a row are siblings of its first file.

## Simulation and rendering

Combat advances at a fixed 20 Hz. Presentation can interpolate positions and animate
between steps, but must not change simulation results. Replay seeking reconstructs
state from recorded inputs, so a mechanic's timing and random choices must be
reproducible. See [replays](REPLAYS.md) and [effect timing](EFFECT-TIMING.md).

Keep gameplay values separate from art graphs. A model import should not load
Phaser, a scene class or multi-megabyte render data. `*-graph.ts` and `*-poses.ts`
modules own render data; stats and rule modules expose the values simulation needs.
See [test performance](TEST-PERFORMANCE.md) for the reason behind this boundary.

The large model, scene and HUD modules still coordinate many features. Extract a
cohesive subsystem when changing it, with its existing tests intact; avoid moving
large blocks solely to reduce a file's line count.

## Content and assets

`reference/` contains pinned source tables, compact runtime JSON and provenance.
Some files are imported directly into the bundle. `art/source/` holds authoring
inputs; `public/assets/` holds shipping textures, sound and dynamically fetched
packs. Asset names are often constructed at runtime. See [assets](ASSETS.md).

Vite splits the engine, shared libraries, UI, startup tables and scene graphs.
Dynamic imports keep developer tools and late campaign presentation out of the
initial import graph. Check `vite.config.ts` before changing module boundaries.

## Storage and offline behavior

A Web Lock coordinates tabs so only one owns the village. Save loading validates
and migrates stored data; changes must preserve recoverability. Use a separate
browser profile for destructive testing.

The production build generates `sw.js` and a content-hashed manifest. The service
worker precaches the application shell, warms assets observed during boot and caches
other assets as they are fetched. Offline availability therefore depends on what
has already been loaded; it does not mean every campaign asset is downloaded at install.
