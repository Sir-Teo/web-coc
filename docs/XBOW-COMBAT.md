# Native X-Bow integration

The home-village X-Bow uses the pinned client 18.400.21 values and artwork documented in [the source reconstruction](../reference/xbow/README.md). All 13 levels have their own health, DPS, destination upgrade cost/time and projectile tier. The model imports only `reference/xbow/combat.json`; the large polygon graph belongs to the scene renderer.

## Combat and persistence

- Ground mode targets ground troops within 14 tiles. Ground-and-air mode targets either layer within 11.5 tiles. Distance is measured from the 3×3 footprint's center, including the exact boundary. An eligible target remains locked when a closer troop appears.
- Each battle starts with 1,500 bolts. Every launched shot consumes one. Empty, destroyed, constructing or upgrading X-Bows cannot fire. Stuns suspend reload progress. There is no idle backlog against a newly acquired target.
- Sustained shots retain their 128 ms deadlines across the fixed simulation samples. Per-shot damage is `DPS × 0.128`, retaining the fractional value (level 1 is 7.68, level 3 is 10.24). Actual eligibility and damage resolution are sampled by the local simulation, normally every 50 ms.
- The seven native bolt tiers travel at 23, 24 or 25 tiles/s. A bolt tracks its original target by advancing its position a bounded distance each sample; movement changes its expected arrival time. It keeps flying after its launcher dies and cannot transfer damage to a replacement for a dead target.
- Ammunition, shot clocks, aim and recent sound cues belong to the battle. They are rebuilt when replaying or seeking and never become persistent home ammunition. The targeting mode survives village saves, edit undo/redo, layout restoration and canonical replay export/import. Invalid modes are rejected. Replay version 31 separates these rules from earlier recordings; their saved results remain readable.

The home village still ends at Town Hall 8. The shop therefore shows the source Town Hall 9 requirement and keeps new X-Bow construction locked. The renderer and combat support later levels for imported/replayed battles and future native campaign adaptation. The supported native campaign prefix remains 50 layouts; Dark Elixir rewards and active-mode adaptation are separate work.

## Presentation

The live scene retains original polygon strips, complete affine transforms, multiply/add colors, texture coordinates and additive layers through `NativeMeshView`. Independent `turret` and `ammo` controls select the source's held directional frames. The empty presentation hides the named ammunition instance while retaining the armed base and turret. Upgrade exports provide the construction/upgrade presentation. A transparent preview image keeps selection bounds and becomes the existing stone ruin when destroyed.

Every level uses the same art scale (1.2) and registration anchor `(0, 80)`. The 400×340 DOM preview renders at 240×204 with origin `(0.5, 110/170)`. Level scaling and generic late-level tints are disabled for this artwork. Bolts retain the source animated layers; their source shadows render on the ground below buildings. Reduced motion holds decorative frames and suppresses flights while preserving combat.

Attack, hit and empty-ammo Ogg samples use source volume and pitch ranges. Pitch variation is deterministic across replay seeks. The scene merges these cues with Santa's into one `SampleAudio.sync` call, preserving simultaneous playback, pause, mute, replay speed and cleanup. The other four preserved source samples are not yet used for home placement/loading/mode interactions.

The renderer's pixel comparisons are recorded separately in [Native mesh rendering](NATIVE-MESH-RENDERING.md). They verify source geometry and GPU composition, not the native game's engine behavior. World direction mapping, the 0.85-tile muzzle offset, `StartHeight × 0.8` vertical projection, character hit anchor and shadow scale are visual calibrations. Exact native targeting microtiming, damage quantization, recoil, loading/empty transitions, random hit positions and particle emitters remain unverified. No claim of complete native-engine equivalence follows from these tests.

## Verification

`tests/xbow.test.ts` covers all 13 levels, both range boundaries and troop layers, 20/30/60 Hz cadence, target retention, retargeting, idle time, stuns, 1,500-shot exhaustion, bounded tracking speed, post-destruction flight, dead targets, mode validation, layouts and canonical replay fields. `tests/native-mesh.test.ts` verifies named ammo removal without replacing the armed scene.

`tests/browser/xbow.spec.ts` checks the TH9 shop gate, all 26 preview keys, desktop/phone info and save reload, live aiming, physical bolt meshes, empty-state cleanup, replay rewind, home-state isolation, reduced motion and simultaneous native audio. The existing Santa replay/GPU and generic projectile timing checks remain part of integrated verification. `scripts/production-check.mjs` requires all 36 X-Bow asset requests to succeed in the built app.

Verified locally on 2026-09-12: all **921 model tests across 75 files**, followed by 50 focused model checks after the TH9 label fix. The integrated Chromium and WebKit DPR 2 suites each pass **13 cases**; the final shadow-layer adjustment also passes both X-Bow battle/replay cases again in Chromium. The production build and both-engine release smoke checks pass with no reported errors. Chromium reloads offline with **250 files** in cache `crown-clan-8c92c2bf0708`. The source importer reproduces all 36 assets and reference metadata. Local logs and the runtime digest are recorded in `output/playtest/xbow-integration-verification.json`.
