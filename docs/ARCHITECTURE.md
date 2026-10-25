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

Native group followers share a position/housing snapshot captured by the first follower
each tick. Its buffers, maps and empty cell lists are reused per battle, with capacity
growing for new waves. Refresh clears cell contents, unit indices, weights and anchor
references before rebuilding in unit order; new arrivals still wait until the next snapshot.
The group witness in `tests/fixtures/native-group-snapshot.ts` checks exact movement across
snapshot capture, arrivals, deaths and moved cells in Node and both browser engines.

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

The boot preload only carries what the home village draws. The rarely seen Cannon
pages load in one batch once the village appears. Each defense family the village
does not own (`ART_FAMILIES` in `scene.ts`, the X-Bow and Santa among them) loads the first time
the home village, a battle or a placement draws it; a battle that needs one holds
its clock and input until it lands, as it does for late campaign art. The dev
server loads every family right after boot instead (the browser specs rely on it);
`?lazyart` gives a dev page the production behavior. Families the home village
does not draw, and the late campaign art, are released again after the player has
been home for a while. A family can also be needed by something other than a
building (`needed`): the Clan Castle garrison defenders load when a battle or replay with
a garrison opens, and the procedural King sheets only for recordings made before the hero
roster. Native village packs are fetched outside the
Phaser loader: the home village's packs download alongside the preload, and the
loading screen waits for them briefly; a battle's packs download when it starts.
Images are decoded off the main thread before upload (`image-decode.ts`), and a
texture that has not arrived yet draws nothing rather than Phaser's black
placeholder.

Art batches remove their temporary scene-shutdown listeners when they settle, so
releasing and reloading a family does not accumulate callbacks across attacks.
The Cannon and Tesla batches leave fallback sprites already being fetched by
`LazyTextures` to that request, avoiding duplicate texture registration.

Imported replay rosters also determine whether later garrison art is needed. A supported troop such as Dragon 5 loads the late character bundle even when its village contains only ordinary buildings. The original No Flight Zone Dragon 7 and Balloon 8 retain their smaller character batch. The existing battle wait, retry and home-time release rules own these pages; backward seeks reuse them. `tests/browser/garrison-late-replay-art.spec.ts` checks actual uploaded textures and native bodies on desktop and phone.

Boot files also record their owning art family. Successful boot families join the same
release-and-reload cycle, so importing a different village can free the original village's
unused pages; undoing the import loads them again. If a boot file fails, its family joins
the deferred retry policy and retains ownership of the images that did load. Temporary file
references are cleared when the scene starts or shuts down. Skeleton Traps keep their
mode-specific static portrait until their animation atlas arrives and apply frame changes
only to the real atlas. `tests/browser/boot-family-recovery.spec.ts` covers both Skeleton
Trap modes and a home X-Bow, including reconnects and successful boot-image ownership.
`tests/browser/boot-family-release.spec.ts` covers replacement and undo of a village whose
X-Bow art loaded successfully at boot.

Failed native troop graphs and hero/pet atlases wait five seconds before retrying,
per asset key, as troop texture pages already do. Rendering keeps requesting missing
art after the cooldown, so a temporary outage recovers within the same battle without
repeating failed metadata requests every frame. Successful loads clear their cooldown.

Classic troops retain a loaded walk sheet while their native graph or level texture pages
load. The native presentation hides that sprite once its body draws. Troops without a walk
sheet use the transparent stand-in and ground marker. Walk-sheet and hero-portrait fallbacks
follow the unit's battle-clock Invisibility opacity, so the cue carries through the native-art
handoff. [The troop loading regression](../tests/browser/troop-art-loading.spec.ts) holds both
graphs and served texture pages on desktop and phone, then checks playback and expiry.

When a walk sheet or hero portrait replaces the two-pixel stand-in, sprites restore their
display dimensions immediately. Keeping the stand-in's scale enlarged the 128-pixel sheet
64 times, persistently in camps and for the first battle frame; hero portraits also enlarged
on their first frame. Battle sizes include Shrink's current half-scale.
[The sprite handoff regression](../tests/browser/sprite-art-handoff.spec.ts) holds actual sheet,
portrait and native atlas requests and checks the first camp and battle frame on desktop and phone.

Existing camp and battle sprites keep requesting a missing walk sheet or hero portrait through
`LazyTextures.has`. Its pending-request map and five-second failure cooldown bound the requests;
checking only the texture cache stranded existing sprites after a failed initial download.
[The sprite retry regression](../tests/browser/sprite-art-retry.spec.ts) returns one 503 for the
actual asset, holds the native replacement, and checks recovery without recreating the sprite,
including correct sizes and Shrink on desktop and phone.

Releasing native character art also invalidates its pending requests. Metadata or image
decodes that finish after a mode change cannot upload an unused texture again, and an old
completion cannot clear a newer request's pending marker. Hero atlases track textures
uploaded before their last image is ready, so release or failure also frees a partial
atlas from GPU memory.

Native character prefetch includes the current battle's carried army, hero and pet
setups, and defending heroes and Guardians alongside the home roster. Practice levels
therefore warm the army they provide while scouting, using that army's levels. A replay
rewind keeps the atlases its reconstructed battle still needs instead of dropping and
fetching heroes the viewer does not own. Home pet prefetch follows the selected hero
lineup, leaving pets assigned to benched heroes cold. `tests/browser/battle-art-prefetch.spec.ts`
checks first-deployment rendering and texture reuse across a Practice replay rewind.

Village building graphs also recover from failed downloads: the pending marker clears
after failure and retries back off from five seconds to five minutes. The fallback stays
visible while the native graph or level pages are unavailable. Going online makes failed
graphs and pages due immediately; success clears the failure state. Art completion and
due retries for visible buildings invalidate the cached world frame, so scouting and
paused replays recover without camera movement or simulation steps. A failure
notice is shown once per outage instead of asking the player to refresh.
`tests/browser/village-art-recovery.spec.ts` verifies fallback visibility, recovery in
place, and reconnect retries for metadata and level pages at home and while scouting.

Changing villages releases native building GPU pages that neither home nor the current
village uses. Shared pages stay uploaded while any retained level needs them, and mode
variants stay warm while their building family is present. Recent decoded images share a
64 MiB warm cache, estimated as width × height × four bytes per image. Requests refresh
recency; pending decodes stay shared, and completed pages leave the cache in request order
when it exceeds the budget. Eviction drops only the cache reference: active Phaser textures
retain their images for rendering, tint generation and graphics-context restoration. Recent
visits reuse decoded images; older evicted pages decode again through the browser/SW cache.
The budget bounds warm image references, not total process or GPU memory. Pending
uploads own request tokens: leaving a village cancels obsolete uploads, and a late decode
cannot recreate released textures or clear a newer visit's request.
`tests/browser/village-art-release.spec.ts` checks release and reuse across village visits.

Cannon and Archer Tower level pages retry through the scene's once-per-second art check,
independently of world rendering. Only levels in the current village or placement retry;
going online makes their failures due immediately. Successful uploads clear the cooldown
and bump the art revision, replacing the fallback even during scouting or a paused replay.
`tests/browser/native-page-recovery.spec.ts` covers Cannon pages and both Archer Tower
body and resident pages with temporary failures and reconnects.

Automatic late-art requests prepare only the building presentation families on the map and
the character bodies a battle can use. Ordinary garrisons skip building presentation code;
explicit full preloads remain available. Late campaign art retries failed files and family
module downloads with bounded backoff, or immediately on reconnect. Its families check their body textures before replacing
fallback sprites, so a failed Eagle Artillery does not hide the loaded Scattershot beside it.
Retries rebuild presentation views against the completed textures and retain ownership of
pages from every attempt; returning home can still release the whole unused bundle. An
in-flight retry cannot race that idle release. `tests/browser/late-art-recovery.spec.ts`
checks fallback visibility, independent families, recovery and GPU-page release after retry.

Dragon 7 and Golden Dragon retain separate animation graphs, presenter prefixes and shadow
sets, while `nativeMeshTexture` resolves their identical atlas page to one Phaser texture key.
The Dragon foundation family stays needed for either character and claims the resident page
from both late-batch ownership lists if the late loader uploaded it first. This keeps late-art
cleanup from deleting the shared page; an unused late-only preload still releases normally.
The importer and atlas tests verify identical page dimensions, UVs and pixels before sharing.
`tests/browser/shared-dragon-atlas.spec.ts` checks a single GPU allocation, separate shadows,
both load orders, home release/reload, retained home buildings, reconnect and context restoration.

The five siege packs for Battle Drill, Flame Flinger, Log Launcher, Troop Launcher and Wall
Wrecker also resolve their identical `characters` page 8 to one GPU texture key. Their body
atlases keep separate keys. Before releasing troop packs, `releaseExcept` gathers the texture
keys referenced by retained packs, preserving shared pages while another kind needs them.
The existing request identities still prevent cancelled decodes from recreating released pages.
`tests/native-siege-atlas.test.ts` pins the shared page's metadata and RGBA bytes;
`tests/browser/shared-siege-atlas.spec.ts` covers allocation, retained-kind transitions,
context restoration, release/reload and cancellation.

Changing the home army also releases obsolete troop packs before prefetching the new kinds.
Previously this cleanup ran only when the mode or battle changed, so repeated recipe edits
could retain every army's GPU pages while the player stayed at home. The home-only path
clears troop views and uses the same release/request-identity rules; late decodes cannot
repopulate dropped packs. Battle updates retain their existing presentation lifecycle.
`tests/browser/home-army-art-release.spec.ts` covers recipe changes, empty armies,
cancelled metadata/textures and preserving an active battle's native view.

Home hero-lineup and pet-assignment changes follow the same policy for baked atlases.
They clear obsolete hero sprites and release packs outside the new required hero/pet set,
including partially uploaded requests, before prefetching replacements. Battle updates keep
their existing views and all required battle actors. `tests/browser/home-hero-art-release.spec.ts`
checks lineup rotation, pet replacement/removal, cancelled metadata and partial King pages,
and preservation of an active hero sprite and its battle pet.

Ghost Trap coffins belong to the shared Skeleton Trap art family, including a cold visit to
Go to Bat, which has Ghost Traps and no ordinary Skeleton Traps. The presenter waits for both
the armed and triggered atlases before hiding its fallback. The family retains any coffin
textures the home village needs after the late bundle is released.
`tests/browser/ghost-trap-art-recovery.spec.ts` checks cold loading, reconnect recovery and reuse.

Browsers cache failed module imports, so late presentation families, character graphs and optional
art JSON modules use a shared retry cache: a failed attempt gets a fresh URL, and successful
modules stay cached across visits. `vite-import-retry.mjs` preserves the original lazy chunk boundaries
and emits the underlying native import after Vite's preload instrumentation. Temporary
failures reach the art loader; a status probe keeps missing release chunks and HTML fallbacks
on the existing reload path. `tests/browser/late-art-build.spec.ts` checks the built URLs and
startup-cache boundary through the shipped UI in Chromium and WebKit.
Development JSON retries keep their cache buster in the browser URL while the server uses
the ordinary JSON source ID for transformation. Editing an art module still reloads the
page so `LazyGraph` and registry caches pick up the new source.
`tests/browser/art-graph-recovery.spec.ts` covers an X-Bow and the Wizard Tower's multiple graphs.
The worker verifies successful retry bytes against its release manifest before caching them
under the ordinary chunk URL, so recovery remains available on a later offline visit.

The native-page build hook runs only for builds. Closing or restarting a development/SSR
server must not repage production output while another process is building it.

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
card for the rest of the session. Quick army name drafts belong to the slot contents they
were entered for: saving a Cookbook recipe or undoing an overwrite shows that army's saved
name, while drafts in other slots survive the refresh.

The production build writes a lossless WebP beside every PNG under `dist/assets` and
points the built code, packs, atlases and styles at it (`scripts/webp-dist.mjs`): about a
quarter fewer bytes, byte-identical WebGL textures. It then audits every built text file for
PNG names still in use; when none remains it removes the PNG copies from `dist` (about 556 MB
of a 993 MB build), and otherwise keeps them all and lists the names it could not resolve.
A root path naming a PNG outside `assets/`, such as the home-screen icons, does not count:
those files are never converted and always ship.
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

If a deployment removes an uncached lazy chunk, automatic recovery checks for an update
and allows up to ten seconds total for discovery and installation, then activates any
waiting release and reloads when it takes control. Reloading under the old worker would
repeat its cached page and the same missing chunk. The production two-release fixture
changes one lazy graph URL and the matching content hashes in memory, then verifies a
single reload with the imported village preserved when the update is undiscovered,
installing or waiting.

Settings reports what offline play covers from the worker's own answer: "Preparing" until it
has stored this page's boot art, "Ready offline" once it has (the village and art already
seen; unvisited campaign villages still need a connection), or a partial state with a Retry
link when some of that art could not be stored.

### Home-screen install

`public/manifest.webmanifest` lets Android browsers install the game. It launches full
screen and falls back to standalone, with splash colors matching the page. `index.html`
gives iOS an Apple touch icon, the home-screen app tags and a translucent status bar. The
HUD's safe-area insets keep controls clear of that bar. `scripts/app-icons.mjs`
(`npm run app-icons`) renders all four icons from `public/favicon.svg`.
`tests/app-manifest.test.ts` checks the manifest, the page tags, the icon sizes, the opaque
Apple icon and the maskable safe zone, and that the committed icons match a fresh render.
The manifest and icons sit at the root, so the service worker precaches them with the shell.

On Android an installed game shares the browser's storage, so the same village opens and the
tab lock still lets only one copy own it. iOS gives a home-screen app storage separate from
Safari's. A village started in Safari therefore does not appear in the installed app; use
the save export and import in Settings to move it.

### Browser full screen

Settings offers a **Full screen** switch when the browser permits full-screen pages.
`src/ui/fullscreen.ts` requests the document root directly from the tap, hides navigation
UI where supported and follows standard or Safari-prefixed change events, including exits
through the browser's own controls. Refused requests leave the switch off and show a toast.
Rapid taps share the pending browser operation; once it settles, another gesture can
toggle again, including after a refusal.
Full-screen state is not saved; installed apps already launched full screen hide the switch.
Safari tabs without page full screen instead show Add to Home Screen instructions and the
save-transfer reminder above. Unsupported browsers outside Safari show neither control.
`tests/fullscreen.test.ts` and `tests/browser/fullscreen.spec.ts` cover the adapter and the
phone Settings flow, browser exits, refusal and the Safari fallback.
