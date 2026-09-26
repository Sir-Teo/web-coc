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
Render graphs that only some villages draw can leave the startup bundle the same way:
a family wraps its JSON in a `LazyGraph` (`src/game/lazy-graph.ts`) and names it as the
family's `prepare` step, which `loadFamilies` awaits before queueing textures (and
`prepareHomeArt` before boot, for families the home village owns). The X-Bow and Dark
Elixir Drill graphs, about 1.7 MB of the old 7.6 MB `scene-graphs` chunk, load this way;
their presentations draw nothing until the graph is in, leaving the fallback sprite. The
production build fails when the precached startup shell outgrows its budget
(`STARTUP_BUDGET` in `scripts/build-sw.mjs`).

The boot preload only carries what the home village draws. The rarely seen Santa,
X-Bow and Cannon pages load in one batch once the village appears. Each defense
family the village does not own (`ART_FAMILIES` in `scene.ts`) loads the first time
the home village, a battle or a placement draws it; a battle that needs one holds
its clock and input until it lands, as it does for late campaign art. The dev
server loads every family right after boot instead (the browser specs rely on it);
`?lazyart` gives a dev page the production behavior. Families the home village
does not draw, and the late campaign art, are released again after the player has
been home for a while. A family can also be needed by something other than a
building (`needed`): the Clan Castle garrison defenders load when a campaign battle with
a garrison opens, and the procedural King sheets only for recordings made before the hero
roster. Native village packs are fetched outside the
Phaser loader: the home village's packs download alongside the preload, and the
loading screen waits for them briefly; a battle's packs download when it starts.
Images are decoded off the main thread before upload (`image-decode.ts`), and a
texture that has not arrived yet draws nothing rather than Phaser's black
placeholder.

## Storage and offline behavior

A Web Lock coordinates tabs so only one owns the village. Save loading validates
and migrates stored data; changes must preserve recoverability. Use a separate
browser profile for destructive testing.

Saves keep recordings apart from the village: both stores get the village without them
(small enough to stringify on every save and on unload), and each recording is written to
IndexedDB once, under its raid record's id and time, in the same transaction as the first
village that lists it; it is deleted with the last one. Loading attaches them again, dropping
any that no longer validate. A village read from the local backup alone has no recordings.

Village backups share one contract (`saveFileText` / `parseSaveFile` in `save.ts`): compact
JSON no larger than `MAX_SAVE_FILE_BYTES` (16 MiB). Five of the longest recordings the replay
validator allows come to about 6.3 MB, so an export fits; anything larger drops recordings,
oldest first, and says so. Settings also offers a backup without recordings. An import is
shown for review (the backup beside the current village) before it replaces anything; the
replaced village is kept under its own key, without recordings, so Settings can undo the import
even after a reload. Saving over a filled layout or Quick army slot can be undone from the same
card for the rest of the session.

The production build writes a lossless WebP beside every PNG under `dist/assets` and
points the built code, packs, atlases and styles at it (`scripts/webp-dist.mjs`): about a
quarter fewer bytes, byte-identical WebGL textures. It then audits every built text file for
PNG names still in use; when none remains it removes the PNG copies from `dist` (about 556 MB
of a 993 MB build), and otherwise keeps them all and lists the names it could not resolve.
The repository, the dev server and the specs keep reading the PNGs. The production build also generates `sw.js`
and a content-hashed manifest. The service
worker precaches the application shell (the page and only the bundles its entry imports
statically, read from Vite's build manifest; lazy chunks such as the late campaign scene and
the developer panel are cached when first used), warms assets observed during boot and caches
other assets as they are fetched. Offline availability therefore depends on what
has already been loaded; it does not mean every campaign asset is downloaded at install.

Each worker serves one release: navigations get the `index.html` its own cache holds, and a
runtime fetch is cached only when its bytes match that release's manifest hash (a host
fallback page or a newer deploy's file is served but never stored). A newer deploy installs
beside it and waits; the page then shows "Update ready · Reload", which activates the new
worker and reloads onto its release. Unhashed asset URLs are therefore never paired with
another release's page.

Settings reports what offline play covers from the worker's own answer: "Preparing" until it
has stored this page's boot art, "Ready offline" once it has (the village and art already
seen; unvisited campaign villages still need a connection), or a partial state with a Retry
link when some of that art could not be stored.
